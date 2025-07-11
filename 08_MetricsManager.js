// 08_MetricsManager.gs - Объединенный менеджер метрик с расширенными данными
function updateEROASData() {
  UTILS.log('📊 Metrics: Начинаем updateEROASData - последние 10 дней, исключая 2 последних календарных дня');
  
  // Исключаем 2 последних календарных дня
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 2);
  
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 9);
  
  const adjustedRange = {
    from: UTILS.formatDate(startDate),
    to: UTILS.formatDate(endDate)
  };
  
  UTILS.log('📅 Metrics: Период запроса - с ' + adjustedRange.from + ' по ' + adjustedRange.to + ' - 10 дней, исключая последние 2 календарных дня');
  
  const payload = {
    operationName: "RichStats",
    variables: {
      dateFilters: [{
        dimension: "INSTALL_DATE",
        from: adjustedRange.from,
        to: adjustedRange.to,
        include: true
      }],
      filters: [
        {
          dimension: "USER",
          values: ["79950", "127168", "157350", "150140", "11628", "233863", "239157", "235837"],
          include: true
        },
        { dimension: "ATTRIBUTION_PARTNER", values: ["Stack"], include: true },
        { dimension: "ATTRIBUTION_NETWORK_HID", values: ["234187180623265792"], include: true },
        { dimension: "ATTRIBUTION_CAMPAIGN_HID", values: [], include: true, searchByString: "/tricky/i" }
      ],
      groupBy: [{ dimension: "ATTRIBUTION_CAMPAIGN_HID" }],
      measures: [
        { id: "cpi", day: null },
        { id: "installs", day: null },
        { id: "spend", day: null },
        { id: "ipm", day: null },
        { id: "retention_rate", day: 1 },
        { id: "retention_rate", day: 3 },
        { id: "retention_rate", day: 7 },
        { id: "retention_rate", day: 14 },
        { id: "retention_rate", day: 30 },
        { id: "retention_rate", day: 90 },
        { id: "retention_rate", day: 180 },
        { id: "retention_rate", day: 365 },
        { id: "roas", day: 1 },
        { id: "roas", day: 7 },
        { id: "e_arpu_forecast", day: 365 },
        { id: "e_arpu_forecast", day: 730 },
        { id: "cumulative_arpu_forecast", day: 730 },
        { id: "e_roas_forecast", day: 365 },
        { id: "e_roas_forecast", day: 730 },
        { id: "e_profit_forecast", day: 730 },
        { id: "e_revenue_forecast", day: 730 }
      ],
      havingFilters: [],
      anonymizationMode: "OFF",
      topFilter: null,
      revenuePredictionVersion: "",
      isMultiMediation: true
    },
    query: `query RichStats($dateFilters: [DateFilterInput!]!, $filters: [FilterInput!]!, $groupBy: [GroupByInput!]!, $measures: [RichMeasureInput!]!, $havingFilters: [HavingFilterInput!], $anonymizationMode: DataAnonymizationMode, $revenuePredictionVersion: String!, $topFilter: TopFilterInput, $funnelFilter: FunnelAttributes, $isMultiMediation: Boolean) {
      analytics(anonymizationMode: $anonymizationMode) {
        richStats(funnelFilter: $funnelFilter dateFilters: $dateFilters filters: $filters groupBy: $groupBy measures: $measures havingFilters: $havingFilters revenuePredictionVersion: $revenuePredictionVersion topFilter: $topFilter isMultiMediation: $isMultiMediation) {
          stats { 
            id 
            ... on UaCampaign { 
              hid campaignId campaignName targetCpa recommendedTargetCpa createdAt updatedAt lastBidChangedAt isAutomated __typename 
            } 
            ... on StatsValue { 
              value __typename 
            } 
            ... on ForecastStatsItem { 
              value uncertainForecast __typename 
            }
            ... on RetentionStatsValue {
              value cohortSize __typename
            }
            __typename 
          }
          __typename
        }
        __typename
      }
    }`
  };

  const options = {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + UTILS.CONFIG.API_TOKEN_APPODEAL,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload)
  };

  UTILS.log('🌐 Metrics: Отправляем расширенный GraphQL запрос к Appodeal API');

  try {
    const response = UrlFetchApp.fetch(UTILS.CONFIG.BASE_URL_APPODEAL, options);
    const statusCode = response.getResponseCode();
    
    UTILS.log('📡 Metrics: Получен ответ от API - статус: ' + statusCode);
    
    if (statusCode !== 200) {
      UTILS.log('❌ Metrics: Ошибка API - статус ' + statusCode);
      return UTILS.handleError(new Error('API returned ' + statusCode), 'updateEROASData');
    }
    
    const jsonResponse = JSON.parse(response.getContentText());
    
    if (jsonResponse.errors) {
      UTILS.log('❌ Metrics: GraphQL ошибки: ' + JSON.stringify(jsonResponse.errors));
      return UTILS.handleError(new Error('GraphQL errors'), 'updateEROASData');
    }
    
    const statsCount = jsonResponse && jsonResponse.data && jsonResponse.data.analytics && jsonResponse.data.analytics.richStats && jsonResponse.data.analytics.richStats.stats ? jsonResponse.data.analytics.richStats.stats.length : 0;
    UTILS.log('📊 Metrics: Получено статистики для ' + statsCount + ' кампаний');
    
    processCampaignStatsToSheet(jsonResponse);
    
    UTILS.log('✅ Metrics: updateEROASData завершен успешно - 10 дней, исключая 2 последних календарных дня');
    return jsonResponse;
    
  } catch (error) {
    UTILS.log('❌ Metrics: Критическая ошибка - ' + error.message);
    return UTILS.handleError(error, 'updateEROASData');
  }
}

function processCampaignStatsToSheet(response) {
  UTILS.log('📝 Metrics: Начинаем обработку статистики кампаний - 10 дней, исключая 2 последних календарных дня');
  
  const ss = SpreadsheetApp.openById(UTILS.CONFIG.SPREADSHEET_ID);
  
  let statsSheet = ss.getSheetByName('AppodealStatsHidden');
  if (!statsSheet) {
    UTILS.log('📄 Metrics: Создаем новый лист AppodealStatsHidden');
    statsSheet = ss.insertSheet('AppodealStatsHidden');
    statsSheet.hideSheet();
  } else {
    UTILS.log('📄 Metrics: Используем существующий лист AppodealStatsHidden');
  }
  
  statsSheet.clear();
  
  const headers = [
    'Campaign Name', 'Campaign ID', 'Target CPA', 'Recommended Target CPA',
    'Installs', 'CPI', 'Spend', 'IPM', 
    'Retention D1', 'Retention D3', 'Retention D7', 'Retention D14', 'Retention D30', 'Retention D90', 'Retention D180', 'Retention D365',
    'ROAS D1', 'ROAS D7',
    'eARPU 365', 'eARPU 730', 'Cumulative ARPU 730',
    'eROAS 365', 'eROAS 730', 'eProfit 730', 'eRevenue 730',
    'Created At', 'Last Updated', 'Last Bid Changed', 'Is Automated'
  ];
  
  const formatValue = function(value, precision) {
    precision = precision || 2;
    if (value === null || value === undefined || value === '') return '';
    if (isNaN(value)) return '';
    return Number(value).toFixed(precision);
  };
  
  const formatDate = function(timestamp) {
    return timestamp ? new Date(timestamp * 1000).toLocaleString() : 'N/A';
  };
  
  const dataToWrite = [headers];
  let processedCampaigns = 0;
  
  if (response && response.data && response.data.analytics && response.data.analytics.richStats && response.data.analytics.richStats.stats) {
    response.data.analytics.richStats.stats.forEach(function(campaignData) {
      const campaign = campaignData[0];
      
      // Правильное извлечение метрик в правильном порядке
      const values = campaignData.slice(1);
      const cpi = formatValue(values[0] ? values[0].value : null);
      const installs = formatValue(values[1] ? values[1].value : null);
      const spend = formatValue(values[2] ? values[2].value : null);
      const ipm = formatValue(values[3] ? values[3].value : null);
      const ret1 = formatValue(values[4] ? values[4].value : null);
      const ret3 = formatValue(values[5] ? values[5].value : null);
      const ret7 = formatValue(values[6] ? values[6].value : null);
      const ret14 = formatValue(values[7] ? values[7].value : null);
      const ret30 = formatValue(values[8] ? values[8].value : null);
      const ret90 = formatValue(values[9] ? values[9].value : null);
      const ret180 = formatValue(values[10] ? values[10].value : null);
      const ret365 = formatValue(values[11] ? values[11].value : null);
      const roas1 = formatValue(values[12] ? values[12].value : null);
      const roas7 = formatValue(values[13] ? values[13].value : null);
      const arpu365 = formatValue(values[14] ? values[14].value : null);
      const arpu730 = formatValue(values[15] ? values[15].value : null);
      const cumulativeArpu730 = formatValue(values[16] ? values[16].value : null);
      const eroas365 = formatValue(values[17] ? values[17].value : null);
      const eroas730 = formatValue(values[18] ? values[18].value : null);
      const profit730 = formatValue(values[19] ? values[19].value : null);
      const revenue730 = formatValue(values[20] ? values[20].value : null);
      
      if (processedCampaigns === 0) {
        UTILS.log('🔍 Metrics: Пример данных первой кампании:');
        UTILS.log('   - Campaign: ' + campaign.campaignName);
        UTILS.log('   - Всего values: ' + values.length);
        UTILS.log('   - CPI (0): ' + (values[0] ? values[0].value : 'null'));
        UTILS.log('   - Installs (1): ' + (values[1] ? values[1].value : 'null'));
        UTILS.log('   - Spend (2): ' + (values[2] ? values[2].value : 'null'));
        UTILS.log('   - IPM (3): ' + (values[3] ? values[3].value : 'null'));
        UTILS.log('   - Retention D1 (4): ' + (values[4] ? values[4].value : 'null'));
        UTILS.log('   - Retention D7 (6): ' + (values[6] ? values[6].value : 'null'));
        UTILS.log('   - eROAS 730 (18): ' + (values[18] ? values[18].value : 'null'));
      }

      dataToWrite.push([
        campaign.campaignName || 'N/A',
        campaign.campaignId || 'N/A',
        formatValue(campaign.targetCpa),
        formatValue(campaign.recommendedTargetCpa),
        installs, cpi, spend, ipm,
        ret1, ret3, ret7, ret14, ret30, ret90, ret180, ret365,
        roas1, roas7,
        arpu365, arpu730, cumulativeArpu730,
        eroas365, eroas730, profit730, revenue730,
        formatDate(campaign.createdAt),
        formatDate(campaign.updatedAt),
        formatDate(campaign.lastBidChangedAt),
        campaign.isAutomated !== undefined ? campaign.isAutomated : 'N/A'
      ]);
      processedCampaigns++;
    });
  }

  UTILS.log('📊 Metrics: Подготовлено данных для ' + processedCampaigns + ' кампаний');

  if (dataToWrite.length > 1) {
    statsSheet.getRange(1, 1, dataToWrite.length, headers.length).setValues(dataToWrite);
    UTILS.log('✅ Metrics: Записано ' + (dataToWrite.length - 1) + ' строк в лист AppodealStatsHidden - 10 дней, исключая 2 последних календарных дня');
  } else {
    UTILS.log('⚠️ Metrics: Нет данных для записи');
  }
}

function updateBundleGroupedCampaigns() {
  UTILS.log('🔄 Metrics: Начинаем updateBundleGroupedCampaigns - 10 дней, исключая 2 последних календарных дня');
  
  const spreadsheet = SpreadsheetApp.openById(UTILS.CONFIG.SPREADSHEET_ID);
  const hiddenStatsSheet = spreadsheet.getSheetByName('AppodealStatsHidden');
  const bundleGroupedSheet = spreadsheet.getSheetByName('Bundle Grouped Campaigns');
  
  if (!hiddenStatsSheet || !bundleGroupedSheet) {
    UTILS.log('❌ Metrics: Не найдены необходимые листы - Hidden: ' + !!hiddenStatsSheet + ', Bundle: ' + !!bundleGroupedSheet);
    throw new Error('Required sheets not found');
  }
  
  const hiddenStatsData = hiddenStatsSheet.getDataRange().getValues();
  const bundleGroupedData = bundleGroupedSheet.getDataRange().getValues();
  
  UTILS.log('📊 Metrics: Исходные данные - Hidden: ' + (hiddenStatsData.length - 1) + ' строк, Bundle: ' + (bundleGroupedData.length - 1) + ' строк');
  
  const hiddenHeaders = hiddenStatsData[0];
  const bundleHeaders = bundleGroupedData[0];
  
  const hiddenIdIdx = UTILS.findColumnIndex(hiddenHeaders, ['Campaign ID']);
  const bundleIdIdx = UTILS.findColumnIndex(bundleHeaders, ['Campaign ID/Link']);
  const bundleLocalIdx = UTILS.findColumnIndex(bundleHeaders, ['Local']);
  const hiddenAutoIdx = UTILS.findColumnIndex(hiddenHeaders, ['Is Automated']);
  const bundleAutoIdx = UTILS.findColumnIndex(bundleHeaders, ['Is Automated']);
  
  UTILS.log('🔍 Metrics: Найдены колонки - Hidden ID: ' + hiddenIdIdx + ', Bundle ID: ' + bundleIdIdx + ', Local: ' + bundleLocalIdx + ', Auto: ' + hiddenAutoIdx + '/' + bundleAutoIdx);
  
  if ([hiddenIdIdx, bundleIdIdx, bundleLocalIdx, hiddenAutoIdx, bundleAutoIdx].some(function(idx) { return idx === -1; })) {
    UTILS.log('❌ Metrics: Не найдены необходимые колонки');
    throw new Error('Required columns not found');
  }
  
  const columnsToUpdate = [
    { bundleIdx: UTILS.findColumnIndex(bundleHeaders, 'eARPU 365'), hiddenIdx: UTILS.findColumnIndex(hiddenHeaders, 'eARPU 365') },
    { bundleIdx: UTILS.findColumnIndex(bundleHeaders, 'IPM'), hiddenIdx: UTILS.findColumnIndex(hiddenHeaders, 'IPM') },
    { bundleIdx: UTILS.findColumnIndex(bundleHeaders, ['eROAS d365', 'eroas d365']), hiddenIdx: UTILS.findColumnIndex(hiddenHeaders, ['eROAS 365']) },
    { bundleIdx: UTILS.findColumnIndex(bundleHeaders, ['eROAS d730', 'eroas d730']), hiddenIdx: UTILS.findColumnIndex(hiddenHeaders, ['eROAS 730']) },
    { bundleIdx: UTILS.findColumnIndex(bundleHeaders, 'eProfit d730'), hiddenIdx: UTILS.findColumnIndex(hiddenHeaders, 'eProfit 730') },
    { bundleIdx: bundleAutoIdx, hiddenIdx: hiddenAutoIdx }
  ];
  
  const validColumns = columnsToUpdate.filter(function(col) { return col.bundleIdx !== -1 && col.hiddenIdx !== -1; });
  UTILS.log('📋 Metrics: Найдено ' + validColumns.length + ' колонок для обновления');
  
  const lookup = {};
  const nameIdx = UTILS.findColumnIndex(hiddenHeaders, 'Campaign Name');
  
  for (let i = 1; i < hiddenStatsData.length; i++) {
    const id = hiddenStatsData[i][hiddenIdIdx];
    const name = hiddenStatsData[i][nameIdx] || '';
    if (id) {
      lookup[id] = {
        row: hiddenStatsData[i],
        locale: UTILS.extractLocale(name)
      };
    }
  }
  
  UTILS.log('🗂️ Metrics: Создана lookup таблица для ' + Object.keys(lookup).length + ' кампаний');
  
  const validRows = UTILS.getValidRows(bundleGroupedSheet);
  const updates = [];
  let matchedCount = 0;
  
  validRows.forEach(function(row) {
    const id = row.data[bundleIdIdx];
    if (lookup[id]) {
      validColumns.forEach(function(col) {
        let val = lookup[id].row[col.hiddenIdx];
        if (col.divideBy) val = val / col.divideBy;
        updates.push({ row: row.index + 1, col: col.bundleIdx + 1, value: val });
      });
      
      const loc = lookup[id].locale;
      if (loc) {
        updates.push({ row: row.index + 1, col: bundleLocalIdx + 1, value: loc });
      }
      matchedCount++;
    }
  });
  
  UTILS.log('🎯 Metrics: Сопоставлено ' + matchedCount + ' кампаний, подготовлено ' + updates.length + ' обновлений');
  
  if (updates.length > 0) {
    UTILS.batchUpdate(bundleGroupedSheet, updates);
    UTILS.log('✅ Metrics: Применено ' + updates.length + ' обновлений');
  }
  
  UTILS.log('✅ Metrics: updateBundleGroupedCampaigns завершен - 10 дней, исключая 2 последних календарных дня');
}

function groupMetrics() {
  UTILS.log('📊 Metrics: Начинаем groupMetrics - 10 дней, исключая 2 последних календарных дня, сумма eProfit');
  
  updateBundleGroupTotals();
  updateROASValuesOnly();
  updateOverallMetrics();
  
  UTILS.log('✅ Metrics: groupMetrics завершен - 10 дней, исключая 2 последних календарных дня, сумма eProfit');
}

function updateBundleGroupTotals() {
  UTILS.log('🧮 Metrics: Начинаем updateBundleGroupTotals - сумма eProfit d730 для групп');
  
  const sheet = UTILS.getSheet("Bundle Grouped Campaigns", UTILS.CONFIG.SPREADSHEET_ID);
  if (!sheet) {
    UTILS.log('❌ Metrics: Лист Bundle Grouped Campaigns не найден');
    return;
  }
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  const eProfitIdx = UTILS.findColumnIndex(headers, 'eProfit d730');
  
  if (eProfitIdx === -1) {
    UTILS.log('❌ Metrics: Не найдена колонка eProfit d730');
    return;
  }
  
  UTILS.log('🔍 Metrics: Найдена колонка eProfit d730: ' + eProfitIdx);
  
  const validRows = UTILS.getValidRows(sheet, { includeGroupHeaders: true });
  const updates = [];
  let processedGroups = 0;
  
  let currentGroup = [];
  let currentGroupHeader = null;
  
  validRows.forEach(function(row) {
    if (row.isGroupHeader) {
      if (currentGroupHeader && currentGroup.length > 0) {
        // Среднее eProfit за день (делим на 10, так как данные за 10 дней)
        let totalProfit = 0;
        let validCampaigns = 0;
        
        currentGroup.forEach(function(groupRow) {
          const profit = UTILS.parseNumber(groupRow.data[eProfitIdx]);
          if (profit !== null) {
            totalProfit += profit;
            validCampaigns++;
          }
        });
        
        if (validCampaigns > 0) {
          const totalProfitSum = totalProfit.toFixed(2);
          updates.push({ row: currentGroupHeader.index + 1, col: eProfitIdx + 1, value: totalProfitSum });
          processedGroups++;
          UTILS.log('💰 Группа: ' + validCampaigns + ' кампаний, сумма eProfit: ' + totalProfitSum);
        }
      }
      
      currentGroupHeader = row;
      currentGroup = [];
    } else if (currentGroupHeader) {
      currentGroup.push(row);
    }
  });
  
  // Последняя группа
  if (currentGroupHeader && currentGroup.length > 0) {
    let totalProfit = 0;
    let validCampaigns = 0;
    
    currentGroup.forEach(function(groupRow) {
      const profit = UTILS.parseNumber(groupRow.data[eProfitIdx]);
      if (profit !== null) {
        totalProfit += profit;
        validCampaigns++;
      }
    });
    
    if (validCampaigns > 0) {
      const totalProfitSum = totalProfit.toFixed(2);
      updates.push({ row: currentGroupHeader.index + 1, col: eProfitIdx + 1, value: totalProfitSum });
      processedGroups++;
      UTILS.log('💰 Группа: ' + validCampaigns + ' кампаний, сумма eProfit: ' + totalProfitSum);
    }
  }
  
  UTILS.log('🧮 Metrics: Обработано групп: ' + processedGroups + ', подготовлено обновлений: ' + updates.length);
  
  if (updates.length > 0) {
    UTILS.batchUpdate(sheet, updates);
  }
  
  UTILS.log('✅ Metrics: updateBundleGroupTotals завершен - сумма eProfit d730 для групп');
}

function updateROASValuesOnly() {
  UTILS.log('📈 Metrics: Начинаем updateROASValuesOnly');
  
  const sheet = UTILS.getSheet("Bundle Grouped Campaigns", UTILS.CONFIG.SPREADSHEET_ID);
  if (!sheet) {
    UTILS.log('❌ Metrics: Лист Bundle Grouped Campaigns не найден');
    return;
  }
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  const roasIdx = UTILS.findColumnIndex(headers, 'eROAS d365');
  const roas730Idx = UTILS.findColumnIndex(headers, ['eROAS d730', 'eroas d730']);
  
  if (roasIdx === -1) {
    UTILS.log('❌ Metrics: Не найдена колонка eROAS d365');
    return;
  }
  
  UTILS.log('🔍 Metrics: Найдены колонки - eROAS d365: ' + roasIdx + ', eROAS d730: ' + roas730Idx);
  
  const validRows = UTILS.getValidRows(sheet, { includeGroupHeaders: true });
  const updates = [];
  
  let currentGroup = [];
  let currentGroupHeader = null;
  let groupsProcessed = 0;
  
  validRows.forEach(function(row) {
    if (row.isGroupHeader) {
      if (currentGroupHeader && currentGroup.length > 0) {
        let sum365 = 0, count365 = 0;
        currentGroup.forEach(function(groupRow) {
          const value = UTILS.parseNumber(groupRow.data[roasIdx]);
          if (value !== null) {
            sum365 += value;
            count365++;
          }
        });
        
        if (count365 > 0) {
          const avg = (sum365 / count365).toFixed(2);
          updates.push({ row: currentGroupHeader.index + 1, col: roasIdx + 1, value: avg });
        }
        
        if (roas730Idx !== -1) {
          let sum730 = 0, count730 = 0;
          currentGroup.forEach(function(groupRow) {
            const value = UTILS.parseNumber(groupRow.data[roas730Idx]);
            if (value !== null) {
              sum730 += value;
              count730++;
            }
          });
          
          if (count730 > 0) {
            const avg = (sum730 / count730).toFixed(2);
            updates.push({ row: currentGroupHeader.index + 1, col: roas730Idx + 1, value: avg });
          }
        }
        
        groupsProcessed++;
      }
      
      currentGroupHeader = row;
      currentGroup = [];
    } else if (currentGroupHeader) {
      currentGroup.push(row);
    }
  });
  
  if (currentGroupHeader && currentGroup.length > 0) {
    let sum365 = 0, count365 = 0;
    currentGroup.forEach(function(groupRow) {
      const value = UTILS.parseNumber(groupRow.data[roasIdx]);
      if (value !== null) {
        sum365 += value;
        count365++;
      }
    });
    
    if (count365 > 0) {
      const avg = (sum365 / count365).toFixed(2);
      updates.push({ row: currentGroupHeader.index + 1, col: roasIdx + 1, value: avg });
    }
    
    if (roas730Idx !== -1) {
      let sum730 = 0, count730 = 0;
      currentGroup.forEach(function(groupRow) {
        const value = UTILS.parseNumber(groupRow.data[roas730Idx]);
        if (value !== null) {
          sum730 += value;
          count730++;
        }
      });
      
      if (count730 > 0) {
        const avg = (sum730 / count730).toFixed(2);
        updates.push({ row: currentGroupHeader.index + 1, col: roas730Idx + 1, value: avg });
      }
    }
    
    groupsProcessed++;
  }
  
  UTILS.log('📈 Metrics: Обработано групп: ' + groupsProcessed + ', подготовлено ' + updates.length + ' обновлений ROAS');
  
  if (updates.length > 0) {
    UTILS.batchUpdate(sheet, updates);
  }
  
  UTILS.log('✅ Metrics: updateROASValuesOnly завершен');
}

function calculateWeightedROAS(campaignRows, roasIdx, spendIdx) {
  let totalWeightedROAS = 0;
  let totalSpend = 0;
  let validCampaigns = 0;
  
  campaignRows.forEach(function(row) {
    const roas = UTILS.parseNumber(row.data[roasIdx]);
    const spend = UTILS.parseNumber(row.data[spendIdx]);
    
    if (roas !== null && spend !== null && spend > 0) {
      totalWeightedROAS += roas * spend;
      totalSpend += spend;
      validCampaigns++;
    }
  });
  
  if (totalSpend > 0 && validCampaigns > 0) {
    const weightedAvg = (totalWeightedROAS / totalSpend).toFixed(2);
    UTILS.log('📈 Metrics: Взвешенный eROAS d730 - Кампаний: ' + validCampaigns + '/' + campaignRows.length + ', Общий спенд: ' + totalSpend.toFixed(2) + ', Результат: ' + weightedAvg + '%');
    return weightedAvg;
  }
  
  return null;
}

function updateOverallMetrics() {
  UTILS.log('🌍 Metrics: Начинаем updateOverallMetrics для строки Overall');
  
  const sheet = UTILS.getSheet("Bundle Grouped Campaigns", UTILS.CONFIG.SPREADSHEET_ID);
  if (!sheet) {
    UTILS.log('❌ Metrics: Лист Bundle Grouped Campaigns не найден');
    return;
  }
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  const roas730Idx = UTILS.findColumnIndex(headers, ['eROAS d730', 'eroas d730']);
  const eProfit730Idx = UTILS.findColumnIndex(headers, ['eProfit d730', 'eprofit d730']);
  const spendIdx = UTILS.findColumnIndex(headers, ['spend in the last 14 days', 'today spend', 'spend']);
  
  if (roas730Idx === -1 || eProfit730Idx === -1) {
    UTILS.log('❌ Metrics: Не найдены необходимые колонки - eROAS d730: ' + roas730Idx + ', eProfit d730: ' + eProfit730Idx);
    return;
  }
  
  if (spendIdx === -1) {
    UTILS.log('❌ Metrics: Не найдена колонка Spend для взвешивания');
    return;
  }
  
  UTILS.log('🔍 Metrics: Найдены колонки - eROAS d730: ' + roas730Idx + ', eProfit d730: ' + eProfit730Idx + ', Spend: ' + spendIdx);
  
  let overallRowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    const cellValue = String(data[i][0] || '').toLowerCase().trim();
    if (cellValue === 'overall') {
      overallRowIndex = i;
      break;
    }
  }
  
  if (overallRowIndex === -1) {
    UTILS.log('❌ Metrics: Не найдена строка Overall');
    return;
  }
  
  UTILS.log('🎯 Metrics: Найдена строка Overall в позиции ' + (overallRowIndex + 1));
  
  const validRows = UTILS.getValidRows(sheet, { startRow: 1 });
  const campaignRows = validRows.filter(function(row) {
    return row.index !== overallRowIndex && !row.isGroupHeader;
  });
  
  UTILS.log('📊 Metrics: Найдено ' + campaignRows.length + ' валидных кампаний для расчета Overall');
  
  if (campaignRows.length === 0) {
    UTILS.log('⚠️ Metrics: Нет валидных кампаний для расчета Overall');
    return;
  }
  
  const overallWeightedROAS = calculateWeightedROAS(campaignRows, roas730Idx, spendIdx);
  
  let totalProfit = 0;
  let validProfitCampaigns = 0;
  
  campaignRows.forEach(function(row) {
    const profit = UTILS.parseNumber(row.data[eProfit730Idx]);
    if (profit !== null) {
      totalProfit += profit;
      validProfitCampaigns++;
    }
  });
  
  // Сумма eProfit
  UTILS.log('💰 Metrics: Overall сумма eProfit d730 - Кампаний: ' + validProfitCampaigns + '/' + campaignRows.length + ', Общая сумма: ' + totalProfit.toFixed(2));
  
  const updates = [];
  
  if (overallWeightedROAS !== null) {
    updates.push({
      row: overallRowIndex + 1,
      col: roas730Idx + 1,
      value: overallWeightedROAS
    });
    UTILS.log('📈 Metrics: Overall взвешенный eROAS d730: ' + overallWeightedROAS + '%');
  }
  
  if (validProfitCampaigns > 0) {
    updates.push({
      row: overallRowIndex + 1,
      col: eProfit730Idx + 1,
      value: totalProfit.toFixed(2)
    });
    UTILS.log('💰 Metrics: Overall сумма eProfit d730: ' + totalProfit.toFixed(2));
  }
  
  if (updates.length > 0) {
    UTILS.batchUpdate(sheet, updates);
    UTILS.log('✅ Metrics: Применено ' + updates.length + ' обновлений для строки Overall');
  }
  
  UTILS.log('✅ Metrics: updateOverallMetrics завершен');
}

function clearMetricsCache() {
  UTILS.log('🗑️ Metrics: Очищаем кеш метрик - 10 дней, исключая 2 последних календарных дня');
  
  const cacheKeys = ['bundle_group_totals_', 'weighted_roas_values_730_'];
  cacheKeys.forEach(function(key) { UTILS.cache.remove(key); });
  
  UTILS.log('✅ Metrics: Кеш метрик очищен - 10 дней, исключая 2 последних календарных дня');
}