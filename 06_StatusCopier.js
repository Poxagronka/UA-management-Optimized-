// 06_StatusCopier.gs - Копирование статусов между таблицами
function copyStatusToTarget() {
  UTILS.log('📋 StatusCopier: Начинаем copyStatusToTarget');
  
  const startTime = new Date();
  const MAX_EXECUTION_TIME = 270000;
  const SHEET_NAME = 'Planning';

  try {
    const sourceSheet = UTILS.getSheet(SHEET_NAME, UTILS.CONFIG.SPREADSHEET_ID);
    const targetSheet = UTILS.getSheet(SHEET_NAME, UTILS.CONFIG.TARGET_SPREADSHEET_ID);
    
    if (!sourceSheet || !targetSheet) {
      UTILS.log(`❌ StatusCopier: Лист ${SHEET_NAME} не найден - Source: ${!!sourceSheet}, Target: ${!!targetSheet}`);
      throw new Error(`Лист ${SHEET_NAME} не найден в одной из таблиц`);
    }
    
    UTILS.log(`✅ StatusCopier: Найдены оба листа ${SHEET_NAME}`);
    
    // Получение данных из источника
    const sourceRange = sourceSheet.getDataRange();
    const sourceValues = sourceRange.getValues();
    const sourceBackgrounds = sourceRange.getBackgrounds();
    
    UTILS.log(`📊 StatusCopier: Источник - ${sourceValues.length - 1} строк данных`);
    
    const sourceHeaders = sourceValues[0];
    const sourceCampaignIdColIdx = UTILS.findColumnIndex(sourceHeaders, ['campaign id/link']);
    const sourceStatusColIdx = UTILS.findColumnIndex(sourceHeaders, ['test status', 'status']);
    
    if (sourceCampaignIdColIdx === -1 || sourceStatusColIdx === -1) {
      UTILS.log(`❌ StatusCopier: Необходимые столбцы не найдены в источнике - Campaign ID: ${sourceCampaignIdColIdx}, Status: ${sourceStatusColIdx}`);
      throw new Error(`Необходимые столбцы не найдены. Campaign ID: ${sourceCampaignIdColIdx}, Status: ${sourceStatusColIdx}`);
    }
    
    UTILS.log(`🔍 StatusCopier: Найдены колонки в источнике - Campaign ID: ${sourceCampaignIdColIdx}, Status: ${sourceStatusColIdx}`);
    
    // Получение данных из целевой таблицы
    const targetValues = targetSheet.getDataRange().getValues();
    UTILS.log(`📊 StatusCopier: Цель - ${targetValues.length - 1} строк данных`);
    
    // Создание карты кампаний из целевой таблицы (предполагаем, что Campaign ID в колонке J - индекс 9)
    const campaignMap = {};
    let targetCampaignCount = 0;
    
    for (let i = 1; i < targetValues.length; i++) {
      const campaignId = targetValues[i][9]; // Колонка J
      if (campaignId) {
        campaignMap[String(campaignId)] = i + 1;
        targetCampaignCount++;
      }
      
      if (Date.now() - startTime.getTime() > MAX_EXECUTION_TIME) {
        UTILS.log(`⏰ StatusCopier: Превышено максимальное время выполнения при создании карты`);
        throw new Error("Превышено максимальное время выполнения при создании карты");
      }
    }
    
    UTILS.log(`🗂️ StatusCopier: Создана карта для ${targetCampaignCount} кампаний в целевой таблице`);
    
    // Подготовка обновлений
    const updates = [];
    let updatedCount = 0;
    let matchedCampaigns = 0;
    let skippedByMissingId = 0;
    
    for (let i = 1; i < sourceValues.length; i++) {
      const campaignId = UTILS.extractCampaignId(sourceValues[i][sourceCampaignIdColIdx]);
      if (!campaignId) {
        skippedByMissingId++;
        continue;
      }
      
      const targetRowIndex = campaignMap[String(campaignId)];
      if (!targetRowIndex) continue;
      
      matchedCampaigns++;
      const sourceStatus = sourceValues[i][sourceStatusColIdx];
      const sourceBackground = sourceBackgrounds[i][sourceStatusColIdx];
      
      updates.push({
        row: targetRowIndex,
        col: 9, // Колонка I (статус)
        value: sourceStatus,
        background: sourceBackground,
        campaignId: campaignId
      });
      
      updatedCount++;
      
      if (Date.now() - startTime.getTime() > MAX_EXECUTION_TIME) {
        UTILS.log(`⏰ StatusCopier: Превышено максимальное время выполнения при подготовке обновлений`);
        break;
      }
    }
    
    UTILS.log(`📊 StatusCopier: Статистика сопоставления - Сопоставлено: ${matchedCampaigns}, К обновлению: ${updatedCount}, Пропущено без ID: ${skippedByMissingId}`);
    
    if (updates.length === 0) {
      UTILS.log(`⚠️ StatusCopier: Нет обновлений для применения`);
      return `Нет обновлений для применения`;
    }
    
    // Применение обновлений пакетами
    const batchSize = 20;
    let appliedUpdates = 0;
    
    UTILS.log(`📦 StatusCopier: Применяем ${updates.length} обновлений батчами по ${batchSize}`);
    
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(updates.length / batchSize);
      
      UTILS.log(`⚡ StatusCopier: Обрабатываем батч ${batchNum}/${totalBatches} (${batch.length} обновлений)`);
      
      batch.forEach(update => {
        try {
          const cell = targetSheet.getRange(update.row, update.col);
          cell.setValue(update.value);
          if (update.background) {
            cell.setBackground(update.background);
          }
          appliedUpdates++;
        } catch (error) {
          UTILS.log(`❌ StatusCopier: Ошибка обновления кампании ${update.campaignId}: ${error.message}`);
        }
      });
      
      if (i % (batchSize * 2) === 0) {
        SpreadsheetApp.flush();
        UTILS.log(`💾 StatusCopier: Промежуточное сохранение после ${appliedUpdates} обновлений`);
      }
      
      if (Date.now() - startTime.getTime() > MAX_EXECUTION_TIME) {
        const partialResult = `Частично обновлено ${appliedUpdates} строк (прервано по тайм-ауту)`;
        UTILS.log(`⏰ StatusCopier: ${partialResult}`);
        return partialResult;
      }
    }
    
    SpreadsheetApp.flush();
    
    const executionTime = (Date.now() - startTime.getTime()) / 1000;
    const result = `Успешно обновлено ${appliedUpdates} статусов за ${executionTime.toFixed(1)}с`;
    
    UTILS.log(`✅ StatusCopier: ${result}`);
    return result;
    
  } catch (error) {
    const errorResult = UTILS.handleError(error, 'copyStatusToTarget');
    UTILS.log(`❌ StatusCopier: Критическая ошибка - ${error.message}`);
    return errorResult;
  }
}