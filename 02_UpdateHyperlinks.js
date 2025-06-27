// 02_UpdateHyperlinks.gs - Упрощенная версия
function updateHyperlinks() {
  try {
    const spreadsheet = SpreadsheetApp.openById(UTILS.CONFIG.SPREADSHEET_ID);
    const sheets = spreadsheet.getSheets();
    
    sheets.forEach(sheet => {
      if (!sheet.isSheetHidden()) {
        processSheetHyperlinks(sheet);
      }
    });
  } catch (e) {
    UTILS.handleError(e, 'updateHyperlinks');
  }
}

function processSheetHyperlinks(sheet) {
  try {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    
    const allData = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
    const headers = allData[0];
    
    // Создание карты колонок
    const columnMap = {
      campaignId: UTILS.findColumnIndex(headers, ['campaign id/link']),
      creativesId: UTILS.findColumnIndex(headers, ['creatives id/link']),
      mainCampaignId: UTILS.findColumnIndex(headers, ['main campaign id/link']),
      todayCPI: UTILS.findColumnIndex(headers, ['today cpi']),
      outOfBudget: UTILS.findColumnIndex(headers, ['out of budget']),
      edit: UTILS.findColumnIndex(headers, ['edit'])
    };
    
    if (Object.values(columnMap).every(idx => idx === -1)) {
      UTILS.log(`Лист '${sheet.getName()}' не содержит необходимых столбцов`);
      return;
    }
    
    // Подготовка всех обновлений
    const updates = prepareHyperlinkUpdates(allData.slice(1), columnMap);
    
    // Применение обновлений
    UTILS.batchUpdate(sheet, updates);
    
  } catch (e) {
    UTILS.log(`Ошибка в листе ${sheet.getName()}: ${e.message}`);
  }
}

function prepareHyperlinkUpdates(dataRows, columnMap) {
  const updates = [];
  const idRegex = /^\d+$/;
  
  dataRows.forEach((row, rowIndex) => {
    if (!row || !Array.isArray(row)) return;
    
    const actualRowIndex = rowIndex + 2; // +2 так как начинаем со строки 2
    
    // Campaign ID hyperlink
    if (columnMap.campaignId !== -1 && row[columnMap.campaignId]) {
      const campaignId = row[columnMap.campaignId];
      if (isValidId(campaignId, idRegex)) {
        updates.push({
          row: actualRowIndex,
          col: columnMap.campaignId + 1,
          richText: UTILS.createHyperlink(String(campaignId).trim(), 
            `${UTILS.CONFIG.BASE_URL_APPGROWTH}/campaigns/${campaignId}`)
        });
      }
    }
    
    // Creatives ID hyperlinks (может быть несколько ID через запятую)
    if (columnMap.creativesId !== -1 && row[columnMap.creativesId]) {
      const creativesUpdate = createCreativesLinks(row[columnMap.creativesId], idRegex);
      if (creativesUpdate) {
        updates.push({
          row: actualRowIndex,
          col: columnMap.creativesId + 1,
          richText: creativesUpdate
        });
      }
    }
    
    // Main Campaign ID hyperlink
    if (columnMap.mainCampaignId !== -1 && row[columnMap.mainCampaignId]) {
      const mainCampaignId = row[columnMap.mainCampaignId];
      if (isValidId(mainCampaignId, idRegex)) {
        updates.push({
          row: actualRowIndex,
          col: columnMap.mainCampaignId + 1,
          richText: UTILS.createHyperlink(String(mainCampaignId).trim(),
            `${UTILS.CONFIG.BASE_URL_APPGROWTH}/campaigns/${mainCampaignId}`)
        });
      }
    }
    
    // Edit link
    if (columnMap.edit !== -1 && columnMap.campaignId !== -1 && row[columnMap.campaignId]) {
      const editCampaignId = row[columnMap.campaignId];
      if (isValidId(editCampaignId, idRegex)) {
        updates.push({
          row: actualRowIndex,
          col: columnMap.edit + 1,
          richText: UTILS.createHyperlink("edit",
            `${UTILS.CONFIG.BASE_URL_APPGROWTH}/campaigns/${editCampaignId}/edit`)
        });
      }
    }
    
    // Today CPI formatting (сброс стилей)
    if (columnMap.todayCPI !== -1) {
      const cpiValue = row[columnMap.todayCPI];
      const displayText = typeof cpiValue === 'number' ? String(cpiValue) : (cpiValue ? String(cpiValue) : "");
      updates.push({
        row: actualRowIndex,
        col: columnMap.todayCPI + 1,
        value: displayText
      });
    }
    
    // Out of Budget formatting
    if (columnMap.outOfBudget !== -1) {
      const budgetValue = row[columnMap.outOfBudget];
      
      if (budgetValue === true) {
        const richText = SpreadsheetApp.newRichTextValue()
          .setText("True")
          .setTextStyle(0, 4, SpreadsheetApp.newTextStyle()
            .setForegroundColor("#FF0000")
            .setBold(true)
            .build())
          .build();
        
        updates.push({
          row: actualRowIndex,
          col: columnMap.outOfBudget + 1,
          richText: richText
        });
      } else {
        const budgetText = budgetValue === false ? "False" : (budgetValue ? String(budgetValue) : "");
        updates.push({
          row: actualRowIndex,
          col: columnMap.outOfBudget + 1,
          value: budgetText
        });
      }
    }
  });
  
  return updates;
}

function isValidId(value, regex) {
  if (value === null || value === undefined || value === "") return false;
  const strValue = String(value).trim();
  return regex.test(strValue) && strValue.length > 0;
}

function createCreativesLinks(value, idRegex) {
  if (!value) return null;
  
  const validIds = String(value).split(",")
    .map(id => id.trim())
    .filter(id => idRegex.test(id));
  
  if (validIds.length === 0) return null;
  
  const displayText = validIds.join(", ");
  const builder = SpreadsheetApp.newRichTextValue().setText(displayText);
  
  let currentIndex = 0;
  validIds.forEach((id, index) => {
    const url = `${UTILS.CONFIG.BASE_URL_APPGROWTH}/creatives_preview/${id}`;
    builder.setLinkUrl(currentIndex, currentIndex + id.length, url);
    
    currentIndex += id.length;
    if (index < validIds.length - 1) {
      currentIndex += 2; // для ", "
    }
  });
  
  return builder.build();
}