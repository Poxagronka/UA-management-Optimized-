// 11_CPIManager.gs - Менеджер CPI
function checkHighCPI() {
  const sheet = UTILS.getSheet('Bundle Grouped Campaigns', UTILS.CONFIG.SPREADSHEET_ID);
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  const columnMap = {
    cpi: UTILS.findColumnIndex(headers, ['today cpi', 'cpi today']),
    limit: UTILS.findColumnIndex(headers, ['limit cpi', 'cpi limit', 'limit сpi']),
    local: UTILS.findColumnIndex(headers, ['local', 'country', 'geo']),
    eroas: UTILS.findColumnIndex(headers, ['eroas d365']),
    isAutomated: UTILS.findColumnIndex(headers, ['is automated', 'automated'])
  };
  
  if (columnMap.cpi === -1 || columnMap.local === -1) return;

  const colors = [], weights = [], eroasColors = [], eroasWeights = [];
  const blackColor = '#000000', redColor = '#EF5350', blueColor = '#4169E1';
  
  // Инициализация массивов
  for (let i = 0; i < data.length - 1; i++) {
    colors.push(blackColor);
    weights.push('normal');
    if (columnMap.eroas !== -1) {
      eroasColors.push(blackColor);
      eroasWeights.push('normal');
    }
  }
  
  // Обработка каждой строки
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const arrayIndex = i - 1;
    
    try {
      const cpiVal = UTILS.parseNumber(row[columnMap.cpi]) || 0;
      const limitVal = columnMap.limit !== -1 ? UTILS.parseNumber(row[columnMap.limit]) : null;
      const country = columnMap.local !== -1 ? String(row[columnMap.local]).trim() : '';
      const isAutomated = columnMap.isAutomated !== -1 ? 
        String(row[columnMap.isAutomated]).trim().toUpperCase() === 'TRUE' : false;
      
      const tier = getCountryTier(country);
      
      if (!isAutomated) {
        if (limitVal !== null && !isNaN(limitVal) && cpiVal > limitVal) {
          colors[arrayIndex] = blueColor;
          weights[arrayIndex] = 'bold';
        } else {
          const threshold = getCPIThresholdByCountryTier(tier);
          if (cpiVal > threshold) {
            colors[arrayIndex] = redColor;
            weights[arrayIndex] = 'bold';
          }
        }
      }
      
      // Проверка eROAS
      if (columnMap.eroas !== -1) {
        const eroasVal = UTILS.parseNumber(row[columnMap.eroas]);
        if (eroasVal !== null && eroasVal < 80) {
          eroasColors[arrayIndex] = redColor;
          eroasWeights[arrayIndex] = 'bold';
        }
      }
      
    } catch (e) {
      // Тихая обработка ошибок
    }
  }
  
  // Применение форматирования
  const cpiRange = sheet.getRange(2, columnMap.cpi + 1, data.length - 1);
  cpiRange.setFontColors(colors.map(c => [c]));
  cpiRange.setFontWeights(weights.map(w => [w]));
  
  if (columnMap.eroas !== -1) {
    const eroasRange = sheet.getRange(2, columnMap.eroas + 1, data.length - 1);
    eroasRange.setFontColors(eroasColors.map(c => [c]));
    eroasRange.setFontWeights(eroasWeights.map(w => [w]));
  }
}

function runMaxCPICalculation() {
  const sheet = UTILS.getSheet('Bundle Grouped Campaigns', UTILS.CONFIG.SPREADSHEET_ID);
  if (!sheet) return;
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  const eARPU365ColumnIndex = UTILS.findColumnIndex(headers, ['earpu 365']);
  const limitCPIColumnIndex = UTILS.findColumnIndex(headers, ['limit сpi', 'limit cpi']);
  
  if (eARPU365ColumnIndex === -1 || limitCPIColumnIndex === -1) {
    throw new Error('Не удалось найти необходимые колонки');
  }
  
  const updates = [];
  
  for (let i = 1; i < data.length; i++) {
    const eARPU365 = UTILS.parseNumber(data[i][eARPU365ColumnIndex]);
    let limitCPI = '';
    
    if (eARPU365 !== null && eARPU365 !== 0) {
      limitCPI = Number((eARPU365 / 1.6).toFixed(2));
    }
    
    updates.push({
      row: i + 1,
      col: limitCPIColumnIndex + 1,
      value: limitCPI
    });
  }
  
  UTILS.batchUpdate(sheet, updates);
}

function getCountryTier(countryCode) {
  if (!countryCode) return 4;
  
  let code = String(countryCode).trim().toUpperCase();
  
  // Маппинг двухбуквенных кодов в трёхбуквенные
  const codeMap = {
    'CA': 'CAN', 'AU': 'AUS', 'KR': 'KOR', 'BR': 'BRA', 
    'MX': 'MEX', 'TH': 'THA', 'TW': 'TWN', 'NZ': 'NZL', 
    'VN': 'VNM', 'HK': 'HKG', 'JP': 'JPN'
  };
  
  if (codeMap[code]) code = codeMap[code];
  
  if (code === 'USA') return 1;
  if (['CAN', 'GBR', 'AUS', 'DEU'].includes(code)) return 2;
  if (['JPN', 'KOR', 'FRA', 'ITA', 'ESP', 'NZL', 'SGP', 'NOR', 'SWE', 'DNK', 'FIN'].includes(code)) return 3;
  
  return 4;
}

function getCPIThresholdByCountryTier(tier) {
  const thresholds = {
    1: 1.9,   // США
    2: 1.0,   // Tier 2 страны
    3: 0.5,   // Tier 3 страны
    4: 0.15   // Остальные страны
  };
  
  return thresholds[tier] || 0.15;
}