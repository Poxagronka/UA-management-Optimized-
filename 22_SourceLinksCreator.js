const SOURCE_LINKS_CONFIG = {
  SOURCE_SPREADSHEET_ID: "1U5i1MSEodBPj1dF-qlyQKBABegwVpPR7-t-1rKoMhzQ",
  TARGET_SPREADSHEET_ID: "1xRZSs_5GadQ3HjdPwq9FJ7HrSDEMvf9suVCkw53yQUQ", 
  SHEET_NAME: "Planning",
  SOURCE_COLUMN_HEADER: "Source",
  BATCH_SIZE: 20,
  CACHE_EXPIRATION: 30 * 60,
  LOG_PREFIX: "[SourceLinks]"
};

function createSourceLinksInPlanning() {
  const startTime = new Date();
  
  try {
    const sourceSpreadsheet = SpreadsheetApp.openById(SOURCE_LINKS_CONFIG.SOURCE_SPREADSHEET_ID);
    const planningSheet = sourceSpreadsheet.getSheetByName(SOURCE_LINKS_CONFIG.SHEET_NAME);
    
    if (!planningSheet) {
      throw new Error(`Лист "${SOURCE_LINKS_CONFIG.SHEET_NAME}" не найден в исходной таблице`);
    }
    
    const lastRow = planningSheet.getLastRow();
    const lastCol = planningSheet.getLastColumn();
    
    if (lastRow < 2) return;
    
    const allData = planningSheet.getRange(1, 1, lastRow, lastCol).getValues();
    const headers = allData[0].map(h => String(h).trim());
    
    const sourceColIndex = findColumnIndex(headers);
    if (sourceColIndex === -1) {
      throw new Error(`Столбец "${SOURCE_LINKS_CONFIG.SOURCE_COLUMN_HEADER}" не найден`);
    }
    
    const targetSheetsMap = getTargetSheetsMapping();
    const linkUpdates = prepareLinkUpdates(allData, sourceColIndex, targetSheetsMap);
    
    if (linkUpdates.length > 0) {
      applyLinkUpdatesBatch(planningSheet, linkUpdates);
    }
    
    const executionTime = (new Date() - startTime) / 1000;
    
  } catch (error) {
    throw error;
  }
}

function sourceLinksLog(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`${SOURCE_LINKS_CONFIG.LOG_PREFIX} [${level}] ${timestamp}: ${message}`);
}

function findColumnIndex(headers) {
  const targetHeader = SOURCE_LINKS_CONFIG.SOURCE_COLUMN_HEADER.toLowerCase();
  
  return headers.findIndex(header => {
    return String(header).trim().toLowerCase() === targetHeader;
  });
}

function getTargetSheetsMapping() {
  const cache = CacheService.getScriptCache();
  const cacheKey = `target_sheets_mapping_${SOURCE_LINKS_CONFIG.TARGET_SPREADSHEET_ID}`;
  
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return JSON.parse(cachedData);
  }
  
  try {
    const targetSpreadsheet = SpreadsheetApp.openById(SOURCE_LINKS_CONFIG.TARGET_SPREADSHEET_ID);
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
          url: `https://docs.google.com/spreadsheets/d/${SOURCE_LINKS_CONFIG.TARGET_SPREADSHEET_ID}/edit#gid=${sheet.getSheetId()}`,
          originalBundleId: bundleId
        };
      }
    });
    
    cache.put(cacheKey, JSON.stringify(sheetsMap), SOURCE_LINKS_CONFIG.CACHE_EXPIRATION);
    
    return sheetsMap;
    
  } catch (error) {
    return {};
  }
}

function extractBundleIdFromSheetName(sheetName) {
  if (!sheetName || typeof sheetName !== 'string') {
    return null;
  }
  
  const underscoreIndex = sheetName.lastIndexOf('_');
  
  if (underscoreIndex === -1 || underscoreIndex === sheetName.length - 1) {
    return null;
  }
  
  const bundleId = sheetName.substring(underscoreIndex + 1).trim();
  
  return bundleId.length > 0 ? bundleId : null;
}

function prepareLinkUpdates(allData, sourceColIndex, targetSheetsMap) {
  const updates = [];
  
  for (let rowIndex = 1; rowIndex < allData.length; rowIndex++) {
    const row = allData[rowIndex];
    const sourceValue = row[sourceColIndex];
    
    if (!sourceValue || String(sourceValue).trim() === '') {
      continue;
    }
    
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
  const totalUpdates = linkUpdates.length;
  let processedUpdates = 0;
  
  for (let i = 0; i < linkUpdates.length; i += SOURCE_LINKS_CONFIG.BATCH_SIZE) {
    const batch = linkUpdates.slice(i, i + SOURCE_LINKS_CONFIG.BATCH_SIZE);
    
    batch.forEach(update => {
      try {
        const richTextValue = SpreadsheetApp.newRichTextValue()
          .setText(update.displayText)
          .setLinkUrl(update.url)
          .build();
        
        sheet.getRange(update.row, update.col).setRichTextValue(richTextValue);
        
        processedUpdates++;
        
      } catch (error) {
        // Silent error handling
      }
    });
    
    if (i + SOURCE_LINKS_CONFIG.BATCH_SIZE < linkUpdates.length) {
      Utilities.sleep(100);
    }
  }
}

function clearTargetSheetsCache() {
  const cache = CacheService.getScriptCache();
  const cacheKey = `target_sheets_mapping_${SOURCE_LINKS_CONFIG.TARGET_SPREADSHEET_ID}`;
  
  cache.remove(cacheKey);
}

function testSourceLinksMapping() {
  try {
    const targetSheetsMap = getTargetSheetsMapping();
    
    Object.entries(targetSheetsMap).forEach(([bundleIdLower, sheetInfo]) => {
      sourceLinksLog(`Bundle ID: "${sheetInfo.originalBundleId || bundleIdLower}" (ключ: "${bundleIdLower}") -> Лист: "${sheetInfo.name}" (GID: ${sheetInfo.gid})`);
    });
    
    const sourceSpreadsheet = SpreadsheetApp.openById(SOURCE_LINKS_CONFIG.SOURCE_SPREADSHEET_ID);
    const planningSheet = sourceSpreadsheet.getSheetByName(SOURCE_LINKS_CONFIG.SHEET_NAME);
    
    if (planningSheet) {
      const allData = planningSheet.getDataRange().getValues();
      const headers = allData[0];
      const sourceColIndex = findColumnIndex(headers);
      
      if (sourceColIndex !== -1) {
        const sourceValues = new Set();
        for (let i = 1; i < allData.length; i++) {
          const value = allData[i][sourceColIndex];
          if (value && String(value).trim() !== '') {
            sourceValues.add(String(value).trim());
          }
        }
        
        let matchCount = 0;
        sourceValues.forEach(bundleId => {
          const bundleIdLower = bundleId.toLowerCase();
          if (targetSheetsMap[bundleIdLower]) {
            sourceLinksLog(`✅ "${bundleId}" (поиск: "${bundleIdLower}") -> найден лист "${targetSheetsMap[bundleIdLower].name}"`);
            matchCount++;
          } else {
            sourceLinksLog(`❌ "${bundleId}" (поиск: "${bundleIdLower}") -> лист не найден`, 'WARN');
          }
        });
        
        sourceLinksLog(`Совпадений найдено: ${matchCount} из ${sourceValues.size}`);
      }
    }
    
  } catch (error) {
    sourceLinksLog(`Ошибка теста: ${error.message}`, 'ERROR');
  }
}

function forceUpdateSourceLinks() {
  clearTargetSheetsCache();
  createSourceLinksInPlanning();
}