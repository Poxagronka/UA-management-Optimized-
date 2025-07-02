// 02_UpdateHyperlinks.gs - Упрощенная версия
function updateHyperlinks() {
  UTILS.log('🔗 Hyperlinks: Начинаем updateHyperlinks');
  
  try {
    const targetSheets = UTILS.getTargetSheets();
    if (targetSheets.length === 0) {
      UTILS.log('❌ Hyperlinks: Не найдены целевые листы');
      return;
    }
    
    UTILS.log(`📊 Hyperlinks: Найдено ${targetSheets.length} целевых листов для обработки`);
    
    let processedSheets = 0;
    let totalUpdates = 0;
    
    targetSheets.forEach(sheet => {
      if (!sheet.isSheetHidden()) {
        const updates = processSheetHyperlinks(sheet);
        totalUpdates += updates;
        processedSheets++;
      } else {
        UTILS.log(`⏭️ Hyperlinks: Пропущен скрытый лист "${sheet.getName()}"`);
      }
    });
    
    UTILS.log(`🎉 Hyperlinks: Завершено - обработано ${processedSheets} листов, всего обновлений: ${totalUpdates}`);
    
  } catch (e) {
    UTILS.log(`❌ Hyperlinks: Критическая ошибка - ${e.message}`);
    UTILS.handleError(e, 'updateHyperlinks');
  }
}

function processSheetHyperlinks(sheet) {
  const sheetName = sheet.getName();
  UTILS.log(`📄 Hyperlinks: Обрабатываем лист "${sheetName}"`);
  
  try {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      UTILS.log(`⚠️ Hyperlinks: Лист "${sheetName}" не содержит данных (строк: ${lastRow})`);
      return 0;
    }
    
    const allData = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
    const headers = allData[0];
    
    UTILS.log(`📊 Hyperlinks: Лист "${sheetName}" - ${lastRow - 1} строк данных, ${headers.length} колонок`);
    
    // Создание карты колонок
    const columnMap = {
      campaignId: UTILS.findColumnIndex(headers, ['campaign id/link']),
      creativesId: UTILS.findColumnIndex(headers, ['creatives id/link']),
      mainCampaignId: UTILS.findColumnIndex(headers, ['main campaign id/link']),
      todayCPI: UTILS.findColumnIndex(headers, ['today cpi']),
      outOfBudget: UTILS.findColumnIndex(headers, ['out of budget']),
      edit: UTILS.findColumnIndex(headers, ['edit'])
    };
    
    // Проверяем найденные колонки
    const foundColumns = Object.entries(columnMap).filter(([key, idx]) => idx !== -1);
    if (foundColumns.length === 0) {
      UTILS.log(`⚠️ Hyperlinks: Лист "${sheetName}" не содержит необходимых столбцов`);
      return 0;
    }
    
    UTILS.log(`🔍 Hyperlinks: Лист "${sheetName}" - найдены колонки: ${foundColumns.map(([key, idx]) => `${key}:${idx}`).join(', ')}`);
    
    // Подготовка всех обновлений
    const updates = prepareHyperlinkUpdates(allData.slice(1), columnMap, sheetName);
    
    if (updates.length === 0) {
      UTILS.log(`⚠️ Hyperlinks: Лист "${sheetName}" - нет обновлений для применения`);
      return 0;
    }
    
    // Применение обновлений
    UTILS.batchUpdate(sheet, updates);
    
    UTILS.log(`✅ Hyperlinks: Лист "${sheetName}" - применено ${updates.length} обновлений`);
    return updates.length;
    
  } catch (e) {
    UTILS.log(`❌ Hyperlinks: Ошибка в листе "${sheetName}": ${e.message}`);
    return 0;
  }
}

function prepareHyperlinkUpdates(dataRows, columnMap, sheetName) {
  UTILS.log(`🔧 Hyperlinks: Подготавливаем обновления для ${dataRows.length} строк в листе "${sheetName}"`);
  
  const updates = [];
  const idRegex = /^\d+$/;
  
  let campaignLinks = 0, creativesLinks = 0, mainCampaignLinks = 0, editLinks = 0;
  let cpiUpdates = 0, budgetUpdates = 0;
  let skippedRows = 0;
  
  dataRows.forEach((row, rowIndex) => {
    if (!row || !Array.isArray(row)) {
      skippedRows++;
      return;
    }
    
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
        campaignLinks++;
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
        creativesLinks++;
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
        mainCampaignLinks++;
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
        editLinks++;
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
      cpiUpdates++;
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
        budgetUpdates++;
      } else {
        const budgetText = budgetValue === false ? "False" : (budgetValue ? String(budgetValue) : "");
        updates.push({
          row: actualRowIndex,
          col: columnMap.outOfBudget + 1,
          value: budgetText
        });
        budgetUpdates++;
      }
    }
  });
  
  // Логируем статистику по типам обновлений
  const updateStats = [];
  if (campaignLinks > 0) updateStats.push(`Campaign ID: ${campaignLinks}`);
  if (creativesLinks > 0) updateStats.push(`Creatives: ${creativesLinks}`);
  if (mainCampaignLinks > 0) updateStats.push(`Main Campaign: ${mainCampaignLinks}`);
  if (editLinks > 0) updateStats.push(`Edit: ${editLinks}`);
  if (cpiUpdates > 0) updateStats.push(`CPI: ${cpiUpdates}`);
  if (budgetUpdates > 0) updateStats.push(`Budget: ${budgetUpdates}`);
  
  if (updateStats.length > 0) {
    UTILS.log(`📊 Hyperlinks: "${sheetName}" - типы обновлений: ${updateStats.join(', ')}`);
  }
  
  if (skippedRows > 0) {
    UTILS.log(`⚠️ Hyperlinks: "${sheetName}" - пропущено ${skippedRows} невалидных строк`);
  }
  
  UTILS.log(`✅ Hyperlinks: "${sheetName}" - подготовлено ${updates.length} обновлений`);
  return updates;
}

function isValidId(value, regex) {
  if (value === null || value === undefined || value === "") return false;
  const strValue = String(value).trim();
  const isValid = regex.test(strValue) && strValue.length > 0;
  return isValid;
}

function createCreativesLinks(value, idRegex) {
  if (!value) return null;
  
  const rawIds = String(value).split(",").map(id => id.trim());
  const validIds = rawIds.filter(id => idRegex.test(id));
  
  if (validIds.length === 0) {
    UTILS.log(`⚠️ Hyperlinks: Не найдены валидные Creatives ID в "${value}"`);
    return null;
  }
  
  if (validIds.length !== rawIds.length) {
    UTILS.log(`⚠️ Hyperlinks: Из ${rawIds.length} Creatives ID валидны только ${validIds.length}: ${validIds.join(', ')}`);
  }
  
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