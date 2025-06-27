// 22_SourceLinksCreator.gs - Создатель ссылок на источники
function createSourceLinksInPlanning() {
  const SHEET_NAME = "Planning";
  const SOURCE_COLUMN_HEADER = "Source";
  const BATCH_SIZE = 20;
  const CACHE_EXPIRATION = 30 * 60;
  
  try {
    const sourceSheet = UTILS.getSheet(SHEET_NAME, UTILS.CONFIG.SPREADSHEET_ID);
    if (!sourceSheet) {
      throw new Error(`Лист "${SHEET_NAME}" не найден в исходной таблице`);
    }
    
    const data = sourceSheet.getDataRange().getValues();
    if (data.length < 2) return;
    
    const headers = data[0];
    const sourceColIndex = UTILS.findColumnIndex(headers, [SOURCE_COLUMN_HEADER.toLowerCase()]);
    
    if (sourceColIndex === -1) {
      throw new Error(`Столбец "${SOURCE_COLUMN_HEADER}" не найден`);
    }
    
    const targetSheetsMap = getTargetSheetsMapping();
    const linkUpdates = prepareLinkUpdates(data, sourceColIndex, targetSheetsMap);
    
    if (linkUpdates.length > 0) {
      applyLinkUpdatesBatch(sourceSheet, linkUpdates);
    }
    
  } catch (error) {
    UTILS.handleError(error, 'createSourceLinksInPlanning');
  }

  function getTargetSheetsMapping() {
    const cacheKey = `target_sheets_mapping_${UTILS.CONFIG.TARGET_SPREADSHEET_ID}`;
    const cachedData = UTILS.cache.get(cacheKey);
    
    if (cachedData) {
      try {
        return JSON.parse(cachedData);
      } catch (e) {}
    }
    
    try {
      const targetSpreadsheet = SpreadsheetApp.openById(UTILS.CONFIG.TARGET_SPREADSHEET_ID);
      const targetSheets = targetSpreadsheet.getSheets();
      const sheetsMap = {};
      
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
      
      UTILS.cache.put(cacheKey, JSON.stringify(sheetsMap), CACHE_EXPIRATION);
      return sheetsMap;
      
    } catch (error) {
      UTILS.log(`Error getting target sheets: ${error.message}`);
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
    const updates = [];
    
    for (let rowIndex = 1; rowIndex < allData.length; rowIndex++) {
      const sourceValue = allData[rowIndex][sourceColIndex];
      if (!sourceValue || String(sourceValue).trim() === '') continue;
      
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
      }
    }
    
    return updates;
  }

  function applyLinkUpdatesBatch(sheet, linkUpdates) {
    for (let i = 0; i < linkUpdates.length; i += BATCH_SIZE) {
      const batch = linkUpdates.slice(i, i + BATCH_SIZE);
      
      batch.forEach(update => {
        try {
          const richTextValue = UTILS.createHyperlink(update.displayText, update.url);
          sheet.getRange(update.row, update.col).setRichTextValue(richTextValue);
        } catch (error) {
          UTILS.log(`Error creating link for ${update.bundleId}: ${error.message}`);
        }
      });
      
      if (i + BATCH_SIZE < linkUpdates.length) {
        Utilities.sleep(100);
      }
    }
  }
}

function clearTargetSheetsCache() {
  const cacheKey = `target_sheets_mapping_${UTILS.CONFIG.TARGET_SPREADSHEET_ID}`;
  UTILS.cache.remove(cacheKey);
}

function forceUpdateSourceLinks() {
  clearTargetSheetsCache();
  createSourceLinksInPlanning();
}