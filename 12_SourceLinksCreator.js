// 12_SourceLinksCreator.gs - Создатель ссылок на источники
function createSourceLinksInPlanning() {
  UTILS.log('🔗 SourceLinks: Начинаем createSourceLinksInPlanning');
  
  const SHEET_NAME = "Planning";
  const SOURCE_COLUMN_HEADER = "Source";
  const BATCH_SIZE = 20;
  const CACHE_EXPIRATION = 30 * 60;
  
  try {
    const sourceSheet = UTILS.getSheet(SHEET_NAME, UTILS.CONFIG.SPREADSHEET_ID);
    if (!sourceSheet) {
      UTILS.log(`❌ SourceLinks: Лист "${SHEET_NAME}" не найден в исходной таблице`);
      throw new Error(`Лист "${SHEET_NAME}" не найден в исходной таблице`);
    }
    
    const data = sourceSheet.getDataRange().getValues();
    if (data.length < 2) {
      UTILS.log(`⚠️ SourceLinks: Нет данных в листе "${SHEET_NAME}"`);
      return;
    }
    
    UTILS.log(`📊 SourceLinks: Найдено ${data.length - 1} строк данных в листе "${SHEET_NAME}"`);
    
    const headers = data[0];
    const sourceColIndex = UTILS.findColumnIndex(headers, [SOURCE_COLUMN_HEADER.toLowerCase()]);
    
    if (sourceColIndex === -1) {
      UTILS.log(`❌ SourceLinks: Столбец "${SOURCE_COLUMN_HEADER}" не найден`);
      throw new Error(`Столбец "${SOURCE_COLUMN_HEADER}" не найден`);
    }
    
    UTILS.log(`🔍 SourceLinks: Найдена колонка "${SOURCE_COLUMN_HEADER}" в позиции ${sourceColIndex}`);
    
    const targetSheetsMap = getTargetSheetsMapping();
    const targetSheetsCount = Object.keys(targetSheetsMap).length;
    UTILS.log(`🎯 SourceLinks: Получена карта ${targetSheetsCount} целевых листов`);
    
    if (targetSheetsCount === 0) {
      UTILS.log(`⚠️ SourceLinks: Нет целевых листов для создания ссылок`);
      return;
    }
    
    const linkUpdates = prepareLinkUpdates(data, sourceColIndex, targetSheetsMap);
    UTILS.log(`📝 SourceLinks: Подготовлено ${linkUpdates.length} обновлений ссылок`);
    
    if (linkUpdates.length > 0) {
      applyLinkUpdatesBatch(sourceSheet, linkUpdates);
      UTILS.log(`✅ SourceLinks: Применено ${linkUpdates.length} ссылок`);
    } else {
      UTILS.log(`⚠️ SourceLinks: Нет ссылок для применения`);
    }
    
    UTILS.log('✅ SourceLinks: createSourceLinksInPlanning завершен успешно');
    
  } catch (error) {
    UTILS.log(`❌ SourceLinks: Критическая ошибка - ${error.message}`);
    UTILS.handleError(error, 'createSourceLinksInPlanning');
  }

  function getTargetSheetsMapping() {
    UTILS.log('🗂️ SourceLinks: Получаем карту целевых листов');
    
    const cacheKey = `target_sheets_mapping_${UTILS.CONFIG.TARGET_SPREADSHEET_ID}`;
    const cachedData = UTILS.cache.get(cacheKey);
    
    if (cachedData) {
      try {
        const parsed = JSON.parse(cachedData);
        UTILS.log(`💾 SourceLinks: Использована карта из кеша (${Object.keys(parsed).length} листов)`);
        return parsed;
      } catch (e) {
        UTILS.log(`⚠️ SourceLinks: Ошибка парсинга кеша, получаем заново`);
      }
    }
    
    try {
      const targetSpreadsheet = SpreadsheetApp.openById(UTILS.CONFIG.TARGET_SPREADSHEET_ID);
      const targetSheets = targetSpreadsheet.getSheets();
      const sheetsMap = {};
      
      UTILS.log(`📋 SourceLinks: Найдено ${targetSheets.length} листов в целевой таблице`);
      
      targetSheets.forEach(sheet => {
        const sheetName = sheet.getName();
        const bundleId = extractBundleIdFromSheetName(sheetName);
        
        if (bundleId) {
          const bundleIdLower = bundleId.toLowerCase();
          sheetsMap[bundleIdLower] = {
            name: sheetName,
            gid: sheet.getSheetId(),
            url: `https://docs.google.com/spreadsheets/d/${UTILS.CONFIG.TARGET_SPREADSHEET_ID}/edit#gid=${sheet.getSheetId()}`,
            originalBundleId: bundleId
          };
        }
      });
      
      const validSheetsCount = Object.keys(sheetsMap).length;
      UTILS.log(`🎯 SourceLinks: Извлечено ${validSheetsCount} валидных Bundle ID из ${targetSheets.length} листов`);
      
      UTILS.cache.put(cacheKey, JSON.stringify(sheetsMap), CACHE_EXPIRATION);
      UTILS.log(`💾 SourceLinks: Карта сохранена в кеш на ${CACHE_EXPIRATION / 60} минут`);
      
      return sheetsMap;
      
    } catch (error) {
      UTILS.log(`❌ SourceLinks: Ошибка получения целевых листов: ${error.message}`);
      return {};
    }
  }

  function extractBundleIdFromSheetName(sheetName) {
    if (!sheetName || typeof sheetName !== 'string') return null;
    
    const underscoreIndex = sheetName.lastIndexOf('_');
    if (underscoreIndex === -1 || underscoreIndex === sheetName.length - 1) return null;
    
    const bundleId = sheetName.substring(underscoreIndex + 1).trim();
    return bundleId.length > 0 ? bundleId : null;
  }

  function prepareLinkUpdates(allData, sourceColIndex, targetSheetsMap) {
    UTILS.log(`🔧 SourceLinks: Подготавливаем ссылки для ${allData.length - 1} строк`);
    
    const updates = [];
    let validSourcesCount = 0;
    let emptySourcesCount = 0;
    let matchedLinksCount = 0;
    
    for (let rowIndex = 1; rowIndex < allData.length; rowIndex++) {
      const sourceValue = allData[rowIndex][sourceColIndex];
      if (!sourceValue || String(sourceValue).trim() === '') {
        emptySourcesCount++;
        continue;
      }
      
      validSourcesCount++;
      const originalBundleId = String(sourceValue).trim();
      const bundleIdLower = originalBundleId.toLowerCase();
      
      if (targetSheetsMap[bundleIdLower]) {
        const targetSheet = targetSheetsMap[bundleIdLower];
        
        updates.push({
          row: rowIndex + 1,
          col: sourceColIndex + 1,
          bundleId: originalBundleId,
          displayText: originalBundleId,
          url: targetSheet.url,
          targetSheetName: targetSheet.name
        });
        
        matchedLinksCount++;
      }
    }
    
    UTILS.log(`📊 SourceLinks: Статистика - Валидных источников: ${validSourcesCount}, Пустых: ${emptySourcesCount}, Сопоставлено ссылок: ${matchedLinksCount}`);
    
    return updates;
  }

  function applyLinkUpdatesBatch(sheet, linkUpdates) {
    UTILS.log(`🔗 SourceLinks: Применяем ${linkUpdates.length} ссылок батчами по ${BATCH_SIZE}`);
    
    const totalBatches = Math.ceil(linkUpdates.length / BATCH_SIZE);
    let appliedCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < linkUpdates.length; i += BATCH_SIZE) {
      const batch = linkUpdates.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      
      UTILS.log(`⚡ SourceLinks: Обрабатываем батч ${batchNum}/${totalBatches} (${batch.length} ссылок)`);
      
      batch.forEach(update => {
        try {
          const richTextValue = UTILS.createHyperlink(update.displayText, update.url);
          sheet.getRange(update.row, update.col).setRichTextValue(richTextValue);
          appliedCount++;
        } catch (error) {
          UTILS.log(`❌ SourceLinks: Ошибка создания ссылки для ${update.bundleId}: ${error.message}`);
          errorCount++;
        }
      });
      
      if (i + BATCH_SIZE < linkUpdates.length) {
        Utilities.sleep(100);
      }
    }
    
    UTILS.log(`📊 SourceLinks: Результат применения - Успешно: ${appliedCount}, Ошибок: ${errorCount}`);
  }
}

function clearTargetSheetsCache() {
  UTILS.log('🗑️ SourceLinks: Очищаем кеш целевых листов');
  
  const cacheKey = `target_sheets_mapping_${UTILS.CONFIG.TARGET_SPREADSHEET_ID}`;
  UTILS.cache.remove(cacheKey);
  
  UTILS.log('✅ SourceLinks: Кеш целевых листов очищен');
}

function forceUpdateSourceLinks() {
  UTILS.log('🔄 SourceLinks: Принудительное обновление ссылок (с очисткой кеша)');
  
  clearTargetSheetsCache();
  createSourceLinksInPlanning();
  
  UTILS.log('✅ SourceLinks: Принудительное обновление завершено');
}