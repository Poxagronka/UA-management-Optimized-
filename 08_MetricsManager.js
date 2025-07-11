// 08_MetricsManager.gs - Объединенный менеджер метрик
function updateEROASData() {
  UTILS.log('📊 Metrics: Начинаем updateEROASData');
  
  const dateRange = UTILS.getDateRange(9);
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 2);
  const adjustedRange = {
    from: UTILS.formatDate(new Date(endDate.getTime() - 9 * 24 * 60 * 60 * 1000)),
    to: UTILS.formatDate(endDate)
  };
  
  UTILS.log(`📅 Metrics: Период запроса - с ${adjustedRange.from} по ${adjustedRange.to}`);
  
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
        { id: "ipm", day: null },
        { id: "spend", day: null },
        { id: "e_arpu_forecast", day: 365 },
        { id: "e_roas_forecast", day: 365 },
        { id: "e_roas_forecast", day: 730 },
        { id: "e_profit_forecast", day: 730 }
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
          stats { id ... on UaCampaign { hid campaignId campaignName targetCpa recommendedTargetCpa createdAt updatedAt lastBidChangedAt isAutomated __typename } ... on StatsValue { value __typename } ... on ForecastStatsItem { value __typename } __typename }
          __typename
        }
        __typename
      }
    }`
  };

  const options = {
    method: 'post',
    headers: {
      'Authorization': `Bearer ${UTILS.CONFIG.API_TOKEN_APPODEAL}`,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload)
  };

  UTILS.log('🌐 Metrics: Отправляем GraphQL запрос к Appodeal API');

  try {
    const response = UrlFetchApp.fetch(UTILS.CONFIG.BASE_URL_APPODEAL, options);
    const statusCode = response.getResponseCode();
    
    UTILS.log(`📡 Metrics: Получен ответ от API - статус: ${statusCode}`);
    
    if (statusCode !== 200) {
      UTILS.log(`❌ Metrics: Ошибка API - статус ${statusCode}`);
      return UTILS.handleError(new Error(`API returned ${statusCode}`), 'updateEROASData');
    }
    
    const jsonResponse = JSON.parse(response.getContentText());
    
    if (jsonResponse.errors) {
      UTILS.log(`❌ Metrics: GraphQL ошибки: ${JSON.stringify(jsonResponse.errors)}`);
      return UTILS.handleError(new Error('GraphQL errors'), 'updateEROASData');
    }
    
    const statsCount = jsonResponse?.data?.analytics?.richStats?.stats?.length || 0;
    UTILS.log(`📊 Metrics: Получено статистики для ${statsCount} кампаний`);
    
    processCampaignStatsToSheet(jsonResponse);
    
    UTILS.log('✅ Metrics: updateEROASData завершен успешно');
    return jsonResponse;
    
  } catch (error) {
    UTILS.log(`❌ Metrics: Критическая ошибка - ${error.message}`);
    return UTILS.handleError(error, 'updateEROASData');
  }
}

function processCampaignStatsToSheet(response) {
  UTILS.log('📝 Metrics: Начинаем обработку статистики кампаний');
  
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
    'Installs', 'CPI', 'Spend', 'IPM', 'Forecasted ARPU', 'ROAS', 
    'ROAS 730', 'Forecasted Profit', 'Created At', 'Last Updated', 'Last Bid Changed', 'is automated'
  ];
  
  const formatValue = (value, precision = 2) => {
    return value !== null && value !== undefined ? Number(value).toFixed(precision) : 'N/A';
  };
  
  const formatDate = (timestamp) => {
    return timestamp ? new Date(timestamp * 1000).toLocaleString() : 'N/A';
  };
  
  const dataToWrite = [headers];
  let processedCampaigns = 0;
  
  if (response?.data?.analytics?.richStats?.stats) {
    response.data.analytics.richStats.stats.forEach(campaignData => {
      const campaign = campaignData[0];
      const [cpi, installs, ipm, spend, arpu, roas365, roas730, profit] = 
        campaignData.slice(1).map(item => formatValue(item.value));
      
      // Отладка: выводим первую кампанию для проверки
      if (processedCampaigns === 0) {
        UTILS.log(`🔍 Metrics: Пример данных первой кампании:`);
        UTILS.log(`   - Campaign: ${campaign.campaignName}`);
        UTILS.log(`   - ROAS 365: ${roas365}`);
        UTILS.log(`   - ROAS 730: ${roas730}`);
      }

      dataToWrite.push([
        campaign.campaignName || 'N/A',
        campaign.campaignId || 'N/A',
        formatValue(campaign.targetCpa),
        formatValue(campaign.recommendedTargetCpa),
        installs, cpi, spend, ipm, arpu, roas365, roas730, profit,
        formatDate(campaign.createdAt),
        formatDate(campaign.updatedAt),
        formatDate(campaign.lastBidChangedAt),
        campaign.isAutomated !== undefined ? campaign.isAutomated : 'N/A'
      ]);
      processedCampaigns++;
    });
  }

  UTILS.log(`📊 Metrics: Подготовлено данных для ${processedCampaigns} кампаний`);

  if (dataToWrite.length > 1) {
    statsSheet.getRange(1, 1, dataToWrite.length, headers.length).setValues(dataToWrite);
    UTILS.log(`✅ Metrics: Записано ${dataToWrite.length - 1} строк в лист AppodealStatsHidden`);
  } else {
    UTILS.log(`⚠️ Metrics: Нет данных для записи`);
  }
}

function updateBundleGroupedCampaigns() {
  UTILS.log('🔄 Metrics: Начинаем updateBundleGroupedCampaigns');
  
  const spreadsheet = SpreadsheetApp.openById(UTILS.CONFIG.SPREADSHEET_ID);
  const hiddenStatsSheet = spreadsheet.getSheetByName('AppodealStatsHidden');
  const bundleGroupedSheet = spreadsheet.getSheetByName('Bundle Grouped Campaigns');
  
  if (!hiddenStatsSheet || !bundleGroupedSheet) {
    UTILS.log(`❌ Metrics: Не найдены необходимые листы - Hidden: ${!!hiddenStatsSheet}, Bundle: ${!!bundleGroupedSheet}`);
    throw new Error('Required sheets not found');
  }
  
  const hiddenStatsData = hiddenStatsSheet.getDataRange().getValues();
  const bundleGroupedData = bundleGroupedSheet.getDataRange().getValues();
  
  UTILS.log(`📊 Metrics: Исходные данные - Hidden: ${hiddenStatsData.length - 1} строк, Bundle: ${bundleGroupedData.length - 1} строк`);
  
  const hiddenHeaders = hiddenStatsData[0];
  const bundleHeaders = bundleGroupedData[0];
  
  // Отладка: выводим все заголовки Bundle для поиска проблемы
  UTILS.log(`📊 Metrics: Заголовки Bundle: ${bundleHeaders.join(', ')}`);
  UTILS.log(`📊 Metrics: Заголовки Hidden: ${hiddenHeaders.join(', ')}`);
  
  const hiddenIdIdx = UTILS.findColumnIndex(hiddenHeaders, ['Campaign ID']);
  const bundleIdIdx = UTILS.findColumnIndex(bundleHeaders, ['Campaign ID/Link']);
  const bundleLocalIdx = UTILS.findColumnIndex(bundleHeaders, ['Local']);
  const hiddenAutoIdx = UTILS.findColumnIndex(hiddenHeaders, ['is automated']);
  const bundleAutoIdx = UTILS.findColumnIndex(bundleHeaders, ['Is Automated']);
  
  UTILS.log(`🔍 Metrics: Найдены колонки - Hidden ID: ${hiddenIdIdx}, Bundle ID: ${bundleIdIdx}, Local: ${bundleLocalIdx}, Auto: ${hiddenAutoIdx}/${bundleAutoIdx}`);
  
  if ([hiddenIdIdx, bundleIdIdx, bundleLocalIdx, hiddenAutoIdx, bundleAutoIdx].some(idx => idx === -1)) {
    UTILS.log(`❌ Metrics: Не найдены необходимые колонки`);
    throw new Error('Required columns not found');
  }
  
  const columnsToUpdate = [
    { bundleIdx: UTILS.findColumnIndex(bundleHeaders, 'eARPU 365'), hiddenIdx: UTILS.findColumnIndex(hiddenHeaders, 'Forecasted ARPU') },
    { bundleIdx: UTILS.findColumnIndex(bundleHeaders, 'IPM'), hiddenIdx: UTILS.findColumnIndex(hiddenHeaders, 'IPM') },
    { bundleIdx: UTILS.findColumnIndex(bundleHeaders, 'eROAS d365'), hiddenIdx: UTILS.findColumnIndex(hiddenHeaders, 'ROAS') },
    { bundleIdx: UTILS.findColumnIndex(bundleHeaders, ['eROAS d730', 'eroas d730']), hiddenIdx: UTILS.findColumnIndex(hiddenHeaders, ['ROAS 730', 'roas 730']) },
    { bundleIdx: UTILS.findColumnIndex(bundleHeaders, 'eProfit d730'), hiddenIdx: UTILS.findColumnIndex(hiddenHeaders, 'Forecasted Profit'), divideBy: 10 },
    { bundleIdx: bundleAutoIdx, hiddenIdx: hiddenAutoIdx }
  ];
  
  // Дополнительное логирование для отладки
  UTILS.log(`🔍 Metrics: Поиск столбца eROAS d730 - индекс: ${UTILS.findColumnIndex(bundleHeaders, ['eROAS d730', 'eroas d730'])}`);
  UTILS.log(`🔍 Metrics: Поиск столбца ROAS 730 в hidden - индекс: ${UTILS.findColumnIndex(hiddenHeaders, ['ROAS 730', 'roas 730'])}`);
  
  // Логируем все найденные столбцы
  columnsToUpdate.forEach((col, index) => {
    UTILS.log(`📋 Metrics: Колонка ${index}: Bundle idx=${col.bundleIdx}, Hidden idx=${col.hiddenIdx}`);
  });
  
  const validColumns = columnsToUpdate.filter(col => col.bundleIdx !== -1 && col.hiddenIdx !== -1);
  UTILS.log(`📋 Metrics: Найдено ${validColumns.length} колонок для обновления`);
  
  // Создание lookup таблицы
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
  
  UTILS.log(`🗂️ Metrics: Создана lookup таблица для ${Object.keys(lookup).length} кампаний`);
  
  // Применение обновлений только к валидным строкам
  const validRows = UTILS.getValidRows(bundleGroupedSheet);
  const updates = [];
  let matchedCount = 0;
  
  validRows.forEach(row => {
    const id = row.data[bundleIdIdx];
    if (lookup[id]) {
      // Отладка: выводим первое совпадение
      if (matchedCount === 0) {
        UTILS.log(`🔍 Metrics: Пример обновления для кампании ${id}:`);
        validColumns.forEach(col => {
          const val = lookup[id].row[col.hiddenIdx];
          UTILS.log(`   - ${col.bundleIdx !== -1 ? bundleHeaders[col.bundleIdx] : 'не найден'}: ${val}`);
        });
      }
      
      validColumns.forEach(col => {
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
  
  UTILS.log(`🎯 Metrics: Сопоставлено ${matchedCount} кампаний, подготовлено ${updates.length} обновлений`);
  
  if (updates.length > 0) {
    UTILS.batchUpdate(bundleGroupedSheet, updates);
    UTILS.log(`✅ Metrics: Применено ${updates.length} обновлений`);
  }
  
  UTILS.log('✅ Metrics: updateBundleGroupedCampaigns завершен');
}

function groupMetrics() {
  UTILS.log('📊 Metrics: Начинаем groupMetrics');
  
  updateBundleGroupTotals();
  updateROASValuesOnly();
  
  UTILS.log('✅ Metrics: groupMetrics завершен');
}

function updateBundleGroupTotals() {
  UTILS.log('🧮 Metrics: Начинаем updateBundleGroupTotals');
  
  const sheet = UTILS.getSheet("Bundle Grouped Campaigns", UTILS.CONFIG.SPREADSHEET_ID);
  if (!sheet) {
    UTILS.log('❌ Metrics: Лист Bundle Grouped Campaigns не найден');
    return;
  }
  
  const data = sheet.getDataRange().getValues();
  const backgrounds = sheet.getRange(1, 1, sheet.getLastRow(), 1).getBackgrounds();
  const headers = data[0];
  
  const sourceIdx = UTILS.findColumnIndex(headers, 'Source');
  const eProfitIdx = UTILS.findColumnIndex(headers, 'eProfit d730');
  
  if (sourceIdx === -1 || eProfitIdx === -1) {
    UTILS.log(`❌ Metrics: Не найдены необходимые колонки - Source: ${sourceIdx}, eProfit: ${eProfitIdx}`);
    return;
  }
  
  UTILS.log(`🔍 Metrics: Найдены колонки - Source: ${sourceIdx}, eProfit: ${eProfitIdx}`);
  
  // Найти группы (строки с зеленым фоном #cbffdf) и обработать их
  const validRows = UTILS.getValidRows(sheet, { includeGroupHeaders: true });
  const updates = [];
  let processedGroups = 0;
  
  // Группировка строк по заголовкам групп
  let currentGroup = [];
  let currentGroupHeader = null;
  
  validRows.forEach(row => {
    if (row.isGroupHeader) {
      // Обработать предыдущую группу если есть
      if (currentGroupHeader && currentGroup.length > 0) {
        let sum = 0, hasValidData = false;
        
        currentGroup.forEach(groupRow => {
          const value = UTILS.parseNumber(groupRow.data[eProfitIdx]);
          if (value !== null) {
            sum += value;
            hasValidData = true;
          }
        });
        
        if (hasValidData) {
          updates.push({ row: currentGroupHeader.index + 1, col: eProfitIdx + 1, value: sum.toFixed(2) });
          processedGroups++;
        }
      }
      
      // Начать новую группу
      currentGroupHeader = row;
      currentGroup = [];
    } else if (currentGroupHeader) {
      currentGroup.push(row);
    }
  });
  
  // Обработать последнюю группу
  if (currentGroupHeader && currentGroup.length > 0) {
    let sum = 0, hasValidData = false;
    
    currentGroup.forEach(groupRow => {
      const value = UTILS.parseNumber(groupRow.data[eProfitIdx]);
      if (value !== null) {
        sum += value;
        hasValidData = true;
      }
    });
    
    if (hasValidData) {
      updates.push({ row: currentGroupHeader.index + 1, col: eProfitIdx + 1, value: sum.toFixed(2) });
      processedGroups++;
    }
  }
  
  UTILS.log(`🧮 Metrics: Обработано групп: ${processedGroups}, подготовлено обновлений: ${updates.length}`);
  
  if (updates.length > 0) {
    UTILS.batchUpdate(sheet, updates);
  }
  
  UTILS.log('✅ Metrics: updateBundleGroupTotals завершен');
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
  
  UTILS.log(`🔍 Metrics: В updateROASValuesOnly - eROAS d730 индекс: ${roas730Idx}`);
  
  if (roasIdx === -1) {
    UTILS.log(`❌ Metrics: Не найдена колонка eROAS d365`);
    return;
  }
  
  UTILS.log(`🔍 Metrics: Найдены колонки - eROAS d365: ${roasIdx}, eROAS d730: ${roas730Idx}`);
  
  // Получить валидные строки включая заголовки групп
  const validRows = UTILS.getValidRows(sheet, { includeGroupHeaders: true });
  const updates = [];
  
  // Группировка строк по заголовкам групп
  let currentGroup = [];
  let currentGroupHeader = null;
  let groupsProcessed = 0;
  
  validRows.forEach(row => {
    if (row.isGroupHeader) {
      // Обработать предыдущую группу если есть
      if (currentGroupHeader && currentGroup.length > 0) {
        // eROAS d365
        let sum365 = 0, count365 = 0;
        currentGroup.forEach(groupRow => {
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
        
        // eROAS d730
        if (roas730Idx !== -1) {
          let sum730 = 0, count730 = 0;
          currentGroup.forEach(groupRow => {
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
      
      // Начать новую группу
      currentGroupHeader = row;
      currentGroup = [];
    } else if (currentGroupHeader) {
      currentGroup.push(row);
    }
  });
  
  // Обработать последнюю группу
  if (currentGroupHeader && currentGroup.length > 0) {
    // eROAS d365
    let sum365 = 0, count365 = 0;
    currentGroup.forEach(groupRow => {
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
    
    // eROAS d730
    if (roas730Idx !== -1) {
      let sum730 = 0, count730 = 0;
      currentGroup.forEach(groupRow => {
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
  
  UTILS.log(`📈 Metrics: Обработано групп: ${groupsProcessed}, подготовлено ${updates.length} обновлений ROAS`);
  
  if (updates.length > 0) {
    UTILS.batchUpdate(sheet, updates);
  }
  
  UTILS.log('✅ Metrics: updateROASValuesOnly завершен');
}

function clearMetricsCache() {
  UTILS.log('🗑️ Metrics: Очищаем кеш метрик');
  
  // Очистка кеша метрик при необходимости
  const cacheKeys = ['bundle_group_totals_', 'bundle_roas_values_'];
  cacheKeys.forEach(key => UTILS.cache.remove(key));
  
  UTILS.log('✅ Metrics: Кеш метрик очищен');
}