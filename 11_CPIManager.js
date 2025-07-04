// 11_CPIManager.gs - Менеджер CPI
function checkHighCPI() {
  UTILS.log('🔍 CPI: Начинаем checkHighCPI');
  
  const sheet = UTILS.getSheet('Bundle Grouped Campaigns', UTILS.CONFIG.SPREADSHEET_ID);
  if (!sheet) {
    UTILS.log('❌ CPI: Лист Bundle Grouped Campaigns не найден');
    return;
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  UTILS.log(`📊 CPI: Найдено ${data.length - 1} строк данных`);
  
  const columnMap = {
    cpi: UTILS.findColumnIndex(headers, ['today cpi', 'cpi today']),
    limit: UTILS.findColumnIndex(headers, ['limit cpi', 'cpi limit', 'limit сpi']),
    eroas: UTILS.findColumnIndex(headers, ['eroas d365']),
    isAutomated: UTILS.findColumnIndex(headers, ['is automated', 'automated'])
  };
  
  const foundColumns = Object.entries(columnMap).filter(([key, idx]) => idx !== -1);
  UTILS.log(`🔍 CPI: Найдены колонки: ${foundColumns.map(([key, idx]) => `${key}:${idx}`).join(', ')}`);
  
  if (columnMap.cpi === -1) {
    UTILS.log('❌ CPI: Не найдена колонка CPI');
    return;
  }

  const colors = [], weights = [], eroasColors = [], eroasWeights = [];
  const blackColor = '#000000', blueColor = '#4169E1', redColor = '#EF5350';
  
  // Инициализация массивов
  for (let i = 0; i < data.length - 1; i++) {
    colors.push(blackColor);
    weights.push('normal');
    if (columnMap.eroas !== -1) {
      eroasColors.push(blackColor);
      eroasWeights.push('normal');
    }
  }
  
  let cpiLimitCount = 0, eroasLowCount = 0, automatedSkipped = 0;
  
  // Обработка каждой строки
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const arrayIndex = i - 1;
    
    try {
      const cpiVal = UTILS.parseNumber(row[columnMap.cpi]) || 0;
      const limitVal = columnMap.limit !== -1 ? UTILS.parseNumber(row[columnMap.limit]) : null;
      const isAutomated = columnMap.isAutomated !== -1 ? 
        String(row[columnMap.isAutomated]).trim().toUpperCase() === 'TRUE' : false;
      
      if (!isAutomated) {
        // Проверка только превышения лимита
        if (limitVal !== null && !isNaN(limitVal) && cpiVal > limitVal) {
          colors[arrayIndex] = blueColor;
          weights[arrayIndex] = 'bold';
          cpiLimitCount++;
        }
      } else {
        automatedSkipped++;
      }
      
      // Проверка eROAS
      if (columnMap.eroas !== -1) {
        const eroasVal = UTILS.parseNumber(row[columnMap.eroas]);
        if (eroasVal !== null && eroasVal < 80) {
          eroasColors[arrayIndex] = redColor;
          eroasWeights[arrayIndex] = 'bold';
          eroasLowCount++;
        }
      }
      
    } catch (e) {
      UTILS.log(`⚠️ CPI: Ошибка обработки строки ${i}: ${e.message}`);
    }
  }
  
  // Применение форматирования
  const cpiRange = sheet.getRange(2, columnMap.cpi + 1, data.length - 1);
  cpiRange.setFontColors(colors.map(c => [c]));
  cpiRange.setFontWeights(weights.map(w => [w]));
  
  UTILS.log(`🎨 CPI: Применено форматирование CPI для ${data.length - 1} строк`);
  
  if (columnMap.eroas !== -1) {
    const eroasRange = sheet.getRange(2, columnMap.eroas + 1, data.length - 1);
    eroasRange.setFontColors(eroasColors.map(c => [c]));
    eroasRange.setFontWeights(eroasWeights.map(w => [w]));
    UTILS.log(`🎨 CPI: Применено форматирование eROAS для ${data.length - 1} строк`);
  }
  
  // Итоговая статистика
  const stats = [];
  if (cpiLimitCount > 0) stats.push(`CPI превышает лимит: ${cpiLimitCount}`);
  if (eroasLowCount > 0) stats.push(`eROAS низкий: ${eroasLowCount}`);
  if (automatedSkipped > 0) stats.push(`Автоматических пропущено: ${automatedSkipped}`);
  
  UTILS.log(`📊 CPI: Статистика - ${stats.join(', ')}`);
  UTILS.log('✅ CPI: checkHighCPI завершен');
}

function runMaxCPICalculation() {
  UTILS.log('🧮 CPI: Начинаем runMaxCPICalculation');
  
  const sheet = UTILS.getSheet('Bundle Grouped Campaigns', UTILS.CONFIG.SPREADSHEET_ID);
  if (!sheet) {
    UTILS.log('❌ CPI: Лист Bundle Grouped Campaigns не найден');
    return;
  }
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  UTILS.log(`📊 CPI: Найдено ${data.length - 1} строк данных для расчета`);
  
  const eARPU365ColumnIndex = UTILS.findColumnIndex(headers, ['earpu 365']);
  const limitCPIColumnIndex = UTILS.findColumnIndex(headers, ['limit сpi', 'limit cpi']);
  
  if (eARPU365ColumnIndex === -1 || limitCPIColumnIndex === -1) {
    UTILS.log(`❌ CPI: Не найдены необходимые колонки - eARPU365: ${eARPU365ColumnIndex}, Limit CPI: ${limitCPIColumnIndex}`);
    throw new Error('Не удалось найти необходимые колонки');
  }
  
  UTILS.log(`🔍 CPI: Найдены колонки - eARPU365: ${eARPU365ColumnIndex}, Limit CPI: ${limitCPIColumnIndex}`);
  
  const updates = [];
  let calculatedCount = 0, emptyCount = 0, zeroCount = 0;
  
  for (let i = 1; i < data.length; i++) {
    const eARPU365 = UTILS.parseNumber(data[i][eARPU365ColumnIndex]);
    let limitCPI = '';
    
    if (eARPU365 !== null && eARPU365 !== 0) {
      limitCPI = Number((eARPU365 / 1.6).toFixed(2));
      calculatedCount++;
    } else if (eARPU365 === 0) {
      zeroCount++;
    } else {
      emptyCount++;
    }
    
    updates.push({
      row: i + 1,
      col: limitCPIColumnIndex + 1,
      value: limitCPI
    });
  }
  
  UTILS.log(`🧮 CPI: Статистика расчета - Рассчитано: ${calculatedCount}, Нулевые: ${zeroCount}, Пустые: ${emptyCount}`);
  
  if (updates.length > 0) {
    UTILS.batchUpdate(sheet, updates);
    UTILS.log(`✅ CPI: Применено ${updates.length} обновлений`);
  }
  
  UTILS.log('✅ CPI: runMaxCPICalculation завершен');
}