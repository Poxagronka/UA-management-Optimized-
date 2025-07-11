// 11_CPIManager.gs - Оптимизированная формула CPI с полным использованием данных
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
    eroas730: UTILS.findColumnIndex(headers, ['eroas d730']),
    isAutomated: UTILS.findColumnIndex(headers, ['is automated', 'automated'])
  };
  
  const foundColumns = Object.entries(columnMap).filter(([key, idx]) => idx !== -1);
  UTILS.log(`🔍 CPI: Найдены колонки: ${foundColumns.map(([key, idx]) => `${key}:${idx}`).join(', ')}`);
  
  if (columnMap.cpi === -1) {
    UTILS.log('❌ CPI: Не найдена колонка CPI');
    return;
  }

  const validRows = UTILS.getValidRows(sheet);
  UTILS.log(`📊 CPI: Найдено ${validRows.length} валидных строк для обработки`);
  
  const colors = [], weights = [], eroasColors = [], eroasWeights = [];
  const blackColor = '#000000', blueColor = '#4169E1', redColor = '#EF5350', greenColor = '#4CAF50';
  
  // Инициализация массивов для всех строк данных
  for (let i = 0; i < data.length - 1; i++) {
    colors.push([blackColor]);
    weights.push(['normal']);
    if (columnMap.eroas !== -1) {
      eroasColors.push([blackColor]);
      eroasWeights.push(['normal']);
    }
  }
  
  let cpiLimitCount = 0, eroasLowCount = 0, eroasTargetCount = 0, automatedSkipped = 0;
  
  // Обработка валидных строк
  validRows.forEach(row => {
    const arrayIndex = row.index - 1; // Индекс в массиве (без заголовка)
    
    try {
      const cpiVal = UTILS.parseNumber(row.data[columnMap.cpi]) || 0;
      const limitVal = columnMap.limit !== -1 ? UTILS.parseNumber(row.data[columnMap.limit]) : null;
      const isAutomated = columnMap.isAutomated !== -1 ? 
        String(row.data[columnMap.isAutomated]).trim().toUpperCase() === 'TRUE' : false;
      
      if (!isAutomated) {
        // Проверка только превышения лимита
        if (limitVal !== null && !isNaN(limitVal) && cpiVal > limitVal) {
          colors[arrayIndex] = [blueColor];
          weights[arrayIndex] = ['bold'];
          cpiLimitCount++;
        }
      } else {
        automatedSkipped++;
      }
      
      // Проверка eROAS d365
      if (columnMap.eroas !== -1) {
        const eroasVal = UTILS.parseNumber(row.data[columnMap.eroas]);
        if (eroasVal !== null && eroasVal < 80) {
          eroasColors[arrayIndex] = [redColor];
          eroasWeights[arrayIndex] = ['bold'];
          eroasLowCount++;
        }
      }
      
      // Проверка eROAS d730 (цель > 250%)
      if (columnMap.eroas730 !== -1) {
        const eroas730Val = UTILS.parseNumber(row.data[columnMap.eroas730]);
        if (eroas730Val !== null) {
          if (eroas730Val >= 250) {
            // Достигли цели - НЕ выделяем цветом, только считаем
            eroasTargetCount++;
          } else if (eroas730Val < 150) {
            // Критически низкий - красный цвет
            eroasColors[arrayIndex] = [redColor];
            eroasWeights[arrayIndex] = ['bold'];
            eroasLowCount++;
          }
        }
      }
      
    } catch (e) {
      UTILS.log(`⚠️ CPI: Ошибка обработки строки ${row.index + 1}: ${e.message}`);
    }
  });
  
  // Применение форматирования
  const cpiRange = sheet.getRange(2, columnMap.cpi + 1, data.length - 1);
  cpiRange.setFontColors(colors);
  cpiRange.setFontWeights(weights);
  
  UTILS.log(`🎨 CPI: Применено форматирование CPI для ${data.length - 1} строк`);
  
  if (columnMap.eroas !== -1 || columnMap.eroas730 !== -1) {
    const eroasRange = sheet.getRange(2, (columnMap.eroas730 !== -1 ? columnMap.eroas730 : columnMap.eroas) + 1, data.length - 1);
    eroasRange.setFontColors(eroasColors);
    eroasRange.setFontWeights(eroasWeights);
    UTILS.log(`🎨 CPI: Применено форматирование eROAS для ${data.length - 1} строк`);
  }
  
  // Итоговая статистика
  const stats = [];
  if (cpiLimitCount > 0) stats.push(`CPI превышает лимит: ${cpiLimitCount}`);
  if (eroasTargetCount > 0) stats.push(`eROAS d730 >= 250%: ${eroasTargetCount}`);
  if (eroasLowCount > 0) stats.push(`eROAS низкий: ${eroasLowCount}`);
  if (automatedSkipped > 0) stats.push(`Автоматических пропущено: ${automatedSkipped}`);
  
  UTILS.log(`📊 CPI: Статистика - ${stats.join(', ')}`);
  UTILS.log('✅ CPI: checkHighCPI завершен');
}

function runMaxCPICalculation() {
  UTILS.log('🧮 CPI: Начинаем оптимизированный runMaxCPICalculation');
  
  const sheet = UTILS.getSheet('Bundle Grouped Campaigns', UTILS.CONFIG.SPREADSHEET_ID);
  if (!sheet) {
    UTILS.log('❌ CPI: Лист Bundle Grouped Campaigns не найден');
    return;
  }
  
  // Сначала обновляем скрытые метрики
  updateEROASData();
  
  const hiddenSheet = UTILS.getSheet('AppodealStatsHidden', UTILS.CONFIG.SPREADSHEET_ID);
  if (!hiddenSheet) {
    UTILS.log('❌ CPI: Лист AppodealStatsHidden не найден, невозможно выполнить расчет');
    return;
  }
  
  const data = sheet.getDataRange().getValues();
  const hiddenData = hiddenSheet.getDataRange().getValues();
  const headers = data[0];
  const hiddenHeaders = hiddenData[0];
  
  UTILS.log(`📊 CPI: Найдено ${data.length - 1} строк для расчета`);
  
  const columnMap = {
    campaignId: UTILS.findColumnIndex(headers, ['campaign id/link']),
    limitCPI: UTILS.findColumnIndex(headers, ['limit сpi', 'limit cpi'])
  };
  
  const hiddenColumnMap = {
    campaignId: UTILS.findColumnIndex(hiddenHeaders, ['Campaign ID']),
    ret1: UTILS.findColumnIndex(hiddenHeaders, ['Retention D1']),
    ret7: UTILS.findColumnIndex(hiddenHeaders, ['Retention D7']),
    ret30: UTILS.findColumnIndex(hiddenHeaders, ['Retention D30']),
    roas1: UTILS.findColumnIndex(hiddenHeaders, ['ROAS D1']),
    roas7: UTILS.findColumnIndex(hiddenHeaders, ['ROAS D7']),
    arpu365: UTILS.findColumnIndex(hiddenHeaders, ['eARPU 365']),
    arpu730: UTILS.findColumnIndex(hiddenHeaders, ['eARPU 730']),
    cumulativeArpu730: UTILS.findColumnIndex(hiddenHeaders, ['Cumulative ARPU 730']),
    eroas365: UTILS.findColumnIndex(hiddenHeaders, ['eROAS 365']),
    eroas730: UTILS.findColumnIndex(hiddenHeaders, ['eROAS 730'])
  };
  
  if (columnMap.limitCPI === -1 || hiddenColumnMap.campaignId === -1) {
    UTILS.log(`❌ CPI: Не найдены необходимые колонки для расчета`);
    return;
  }
  
  UTILS.log(`🔍 CPI: Найдены колонки для оптимизированного расчета`);
  
  // Создание lookup таблицы из скрытых метрик
  const metricsLookup = {};
  for (let i = 1; i < hiddenData.length; i++) {
    const campaignId = hiddenData[i][hiddenColumnMap.campaignId];
    if (campaignId) {
      metricsLookup[campaignId] = {
        ret1: UTILS.parseNumber(hiddenData[i][hiddenColumnMap.ret1]) || 0,
        ret7: UTILS.parseNumber(hiddenData[i][hiddenColumnMap.ret7]) || 0,
        ret30: UTILS.parseNumber(hiddenData[i][hiddenColumnMap.ret30]) || 0,
        roas1: UTILS.parseNumber(hiddenData[i][hiddenColumnMap.roas1]) || 0,
        roas7: UTILS.parseNumber(hiddenData[i][hiddenColumnMap.roas7]) || 0,
        arpu365: UTILS.parseNumber(hiddenData[i][hiddenColumnMap.arpu365]) || 0,
        arpu730: UTILS.parseNumber(hiddenData[i][hiddenColumnMap.arpu730]) || 0,
        cumulativeArpu730: UTILS.parseNumber(hiddenData[i][hiddenColumnMap.cumulativeArpu730]) || 0,
        eroas365: UTILS.parseNumber(hiddenData[i][hiddenColumnMap.eroas365]) || 0,
        eroas730: UTILS.parseNumber(hiddenData[i][hiddenColumnMap.eroas730]) || 0
      };
    }
  }
  
  UTILS.log(`🗂️ CPI: Создана lookup таблица для ${Object.keys(metricsLookup).length} кампаний`);
  
  const validRows = UTILS.getValidRows(sheet);
  const updates = [];
  let calculatedCount = 0, skipCount = 0;
  let minLimitCount = 0, maxLimitCount = 0;
  
  validRows.forEach(row => {
    const campaignId = UTILS.extractCampaignId(row.data[columnMap.campaignId]);
    if (!campaignId) {
      skipCount++;
      return;
    }
    
    const metrics = metricsLookup[campaignId];
    let limitCPI = '';
    
    if (metrics && (metrics.cumulativeArpu730 > 0 || metrics.arpu730 > 0 || metrics.arpu365 > 0)) {
      // Оптимизированный расчет
      limitCPI = calculateOptimizedCPILimit(metrics);
      calculatedCount++;
      
      if (limitCPI === 0.3) minLimitCount++;
      if (limitCPI === 10) maxLimitCount++;
      
      UTILS.log(`🧮 CPI: Кампания ${campaignId} - Расчет: ${limitCPI} (eROAS 730: ${metrics.eroas730}%, Ret D1: ${metrics.ret1}%, ARPU730: ${metrics.arpu730}, Cumulative: ${metrics.cumulativeArpu730})`);
    } else {
      skipCount++;
    }
    
    updates.push({
      row: row.index + 1,
      col: columnMap.limitCPI + 1,
      value: limitCPI
    });
  });
  
  UTILS.log(`🧮 CPI: Статистика расчета - Рассчитано: ${calculatedCount}, Пропущено: ${skipCount}, Мин лимит (0.3): ${minLimitCount}, Макс лимит (10): ${maxLimitCount}`);
  
  if (updates.length > 0) {
    UTILS.batchUpdate(sheet, updates);
    UTILS.log(`✅ CPI: Применено ${updates.length} обновлений`);
  }
  
  UTILS.log('✅ CPI: runMaxCPICalculation завершен');
}

function calculateOptimizedCPILimit(metrics) {
  // Адаптивная формула на основе производительности кампании
  
  // 1. Выбираем лучший источник LTV данных
  const ltv = metrics.cumulativeArpu730 > 0 ? metrics.cumulativeArpu730 : 
              (metrics.arpu730 > 0 ? metrics.arpu730 : metrics.arpu365);
  
  if (ltv <= 0) return '';
  
  // 2. Динамический целевой ROAS на основе текущей производительности
  let targetROAS = 250; // Базовая цель
  
  if (metrics.eroas730 >= 500) {
    // Супер производительность - более агрессивная цель
    targetROAS = 200;
  } else if (metrics.eroas730 >= 300) {
    // Отличная производительность
    targetROAS = 220;
  } else if (metrics.eroas730 >= 200) {
    // Хорошая производительность
    targetROAS = 240;
  } else if (metrics.eroas730 >= 150) {
    // Средняя производительность
    targetROAS = 250;
  } else if (metrics.eroas730 > 0) {
    // Низкая производительность - консервативная цель
    targetROAS = 300;
  }
  
  // 3. Базовый расчет
  let baseLimit = ltv / (targetROAS / 100);
  
  // 4. Мультипликаторы качества
  let qualityMultiplier = 1.0;
  
  // Retention качество (важнейший фактор)
  const retentionQuality = calculateRetentionQuality(metrics.ret1, metrics.ret7, metrics.ret30);
  qualityMultiplier *= retentionQuality;
  
  // Быстрая окупаемость (ROAS D1 и D7)
  const earlyROASBonus = calculateEarlyROASBonus(metrics.roas1, metrics.roas7);
  qualityMultiplier *= earlyROASBonus;
  
  // 5. Финальный расчет
  let finalLimit = baseLimit * qualityMultiplier;
  
  // 6. Интеллектуальные границы (адаптивные)
  const minLimit = Math.max(0.3, ltv * 0.1); // Не менее 10% от LTV
  const maxLimit = Math.min(10, ltv * 0.8);  // Не более 80% от LTV
  
  finalLimit = Math.max(minLimit, Math.min(maxLimit, finalLimit));
  
  return Number(finalLimit.toFixed(2));
}

function calculateRetentionQuality(ret1, ret7, ret30) {
  // Улучшенная оценка качества retention
  let score = 1.0;
  
  // Retention D1 (вес 50%)
  if (ret1 >= 35) score *= 1.3;        // Отличный
  else if (ret1 >= 25) score *= 1.15;  // Хороший  
  else if (ret1 >= 15) score *= 1.0;   // Средний
  else if (ret1 >= 10) score *= 0.9;   // Ниже среднего
  else score *= 0.7;                   // Плохой
  
  // Retention D7 (вес 30%)
  if (ret7 >= 20) score *= 1.2;
  else if (ret7 >= 12) score *= 1.1;
  else if (ret7 >= 8) score *= 1.0;
  else if (ret7 >= 5) score *= 0.95;
  else score *= 0.8;
  
  // Retention D30 (вес 20%) - если есть данные
  if (ret30 > 0) {
    if (ret30 >= 12) score *= 1.1;
    else if (ret30 >= 8) score *= 1.05;
    else if (ret30 >= 5) score *= 1.0;
    else score *= 0.9;
  }
  
  return Math.min(1.5, Math.max(0.5, score)); // Ограничиваем диапазон
}

function calculateEarlyROASBonus(roas1, roas7) {
  // Бонус за быструю окупаемость
  let bonus = 1.0;
  
  // ROAS D1
  if (roas1 >= 20) bonus *= 1.1;
  else if (roas1 >= 10) bonus *= 1.05;
  else if (roas1 >= 5) bonus *= 1.0;
  else bonus *= 0.95;
  
  // ROAS D7
  if (roas7 >= 50) bonus *= 1.15;
  else if (roas7 >= 30) bonus *= 1.1;
  else if (roas7 >= 20) bonus *= 1.05;
  else if (roas7 >= 10) bonus *= 1.0;
  else bonus *= 0.95;
  
  return Math.min(1.3, Math.max(0.8, bonus)); // Ограничиваем диапазон
}