// 09_StatusCopier.gs - Копирование статусов между таблицами
function copyStatusToTarget() {
  const startTime = new Date();
  const MAX_EXECUTION_TIME = 270000;
  const SHEET_NAME = 'Planning';

  try {
    const sourceSheet = UTILS.getSheet(SHEET_NAME, UTILS.CONFIG.SPREADSHEET_ID);
    const targetSheet = UTILS.getSheet(SHEET_NAME, UTILS.CONFIG.TARGET_SPREADSHEET_ID);
    
    if (!sourceSheet || !targetSheet) {
      throw new Error(`Лист ${SHEET_NAME} не найден в одной из таблиц`);
    }
    
    // Получение данных из источника
    const sourceRange = sourceSheet.getDataRange();
    const sourceValues = sourceRange.getValues();
    const sourceBackgrounds = sourceRange.getBackgrounds();
    
    const sourceHeaders = sourceValues[0];
    const sourceCampaignIdColIdx = UTILS.findColumnIndex(sourceHeaders, ['campaign id/link']);
    const sourceStatusColIdx = UTILS.findColumnIndex(sourceHeaders, ['test status', 'status']);
    
    if (sourceCampaignIdColIdx === -1 || sourceStatusColIdx === -1) {
      throw new Error(`Необходимые столбцы не найдены. Campaign ID: ${sourceCampaignIdColIdx}, Status: ${sourceStatusColIdx}`);
    }
    
    // Получение данных из целевой таблицы
    const targetValues = targetSheet.getDataRange().getValues();
    
    // Создание карты кампаний из целевой таблицы (предполагаем, что Campaign ID в колонке J - индекс 9)
    const campaignMap = {};
    for (let i = 1; i < targetValues.length; i++) {
      const campaignId = targetValues[i][9]; // Колонка J
      if (campaignId) {
        campaignMap[String(campaignId)] = i + 1;
      }
      
      if (Date.now() - startTime.getTime() > MAX_EXECUTION_TIME) {
        throw new Error("Превышено максимальное время выполнения при создании карты");
      }
    }
    
    // Подготовка обновлений
    const updates = [];
    let updatedCount = 0;
    
    for (let i = 1; i < sourceValues.length; i++) {
      const campaignId = UTILS.extractCampaignId(sourceValues[i][sourceCampaignIdColIdx]);
      if (!campaignId) continue;
      
      const targetRowIndex = campaignMap[String(campaignId)];
      if (!targetRowIndex) continue;
      
      const sourceStatus = sourceValues[i][sourceStatusColIdx];
      const sourceBackground = sourceBackgrounds[i][sourceStatusColIdx];
      
      updates.push({
        row: targetRowIndex,
        col: 9, // Колонка I (статус)
        value: sourceStatus,
        background: sourceBackground
      });
      
      updatedCount++;
      
      if (Date.now() - startTime.getTime() > MAX_EXECUTION_TIME) {
        break;
      }
    }
    
    // Применение обновлений пакетами
    const batchSize = 20;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      
      batch.forEach(update => {
        const cell = targetSheet.getRange(update.row, update.col);
        cell.setValue(update.value);
        if (update.background) {
          cell.setBackground(update.background);
        }
      });
      
      if (i % batchSize === 0) {
        SpreadsheetApp.flush();
      }
      
      if (Date.now() - startTime.getTime() > MAX_EXECUTION_TIME) {
        return `Частично обновлено ${Math.min(updatedCount, i + batch.length)} строк (прервано по тайм-ауту)`;
      }
    }
    
    SpreadsheetApp.flush();
    return `Успешно обновлено ${updatedCount} статусов`;
    
  } catch (error) {
    return UTILS.handleError(error, 'copyStatusToTarget');
  }
}