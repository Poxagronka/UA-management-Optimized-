// 08_MetricsManager.gs - Объединенный менеджер метрик
function updateEROASData() {
  const dateRange = UTILS.getDateRange(9);
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 2);
  const adjustedRange = {
    from: UTILS.formatDate(new Date(endDate.getTime() - 9 * 24 * 60 * 60 * 1000)),
    to: UTILS.formatDate(endDate)
  };
  
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

  try {
    const response = UrlFetchApp.fetch(UTILS.CONFIG.BASE_URL_APPODEAL, options);
    const jsonResponse = JSON.parse(response.getContentText());
    
    processCampaignStatsToSheet(jsonResponse);
    return jsonResponse;
    
  } catch (error) {
    return UTILS.handleError(error, 'updateEROASData');
  }
}

function processCampaignStatsToSheet(response) {
  const ss = SpreadsheetApp.openById(UTILS.CONFIG.SPREADSHEET_ID);
  
  let statsSheet = ss.getSheetByName('AppodealStatsHidden');
  if (!statsSheet) {
    statsSheet = ss.insertSheet('AppodealStatsHidden');
    statsSheet.hideSheet();
  }
  
  statsSheet.clear();
  
  const headers = [
    'Campaign Name', 'Campaign ID', 'Target CPA', 'Recommended Target CPA',
    'Installs', 'CPI', 'Spend', 'IPM', 'Forecasted ARPU', 'ROAS', 
    'Forecasted Profit', 'Created At', 'Last Updated', 'Last Bid Changed', 'is automated'
  ];
  
  const formatValue = (value, precision = 2) => {
    return value !== null && value !== undefined ? Number(value).toFixed(precision) : 'N/A';
  };
  
  const formatDate = (timestamp) => {
    return timestamp ? new Date(timestamp * 1000).toLocaleString() : 'N/A';
  };
  
  const dataToWrite = [headers];
  
  if (response?.data?.analytics?.richStats?.stats) {
    response.data.analytics.richStats.stats.forEach(campaignData => {
      const campaign = campaignData[0];
      const [cpi, installs, ipm, spend, arpu, roas, profit] = 
        campaignData.slice(1).map(item => formatValue(item.value));

      dataToWrite.push([
        campaign.campaignName || 'N/A',
        campaign.campaignId || 'N/A',
        formatValue(campaign.targetCpa),
        formatValue(campaign.recommendedTargetCpa),
        installs, cpi, spend, ipm, arpu, roas, profit,
        formatDate(campaign.createdAt),
        formatDate(campaign.updatedAt),
        formatDate(campaign.lastBidChangedAt),
        campaign.isAutomated !== undefined ? campaign.isAutomated : 'N/A'
      ]);
    });
  }

  statsSheet.getRange(1, 1, dataToWrite.length, headers.length).setValues(dataToWrite);
}

function updateBundleGroupedCampaigns() {
  const spreadsheet = SpreadsheetApp.openById(UTILS.CONFIG.SPREADSHEET_ID);
  const hiddenStatsSheet = spreadsheet.getSheetByName('AppodealStatsHidden');
  const bundleGroupedSheet = spreadsheet.getSheetByName('Bundle Grouped Campaigns');
  
  if (!hiddenStatsSheet || !bundleGroupedSheet) {
    throw new Error('Required sheets not found');
  }
  
  const hiddenStatsData = hiddenStatsSheet.getDataRange().getValues();
  const bundleGroupedData = bundleGroupedSheet.getDataRange().getValues();
  
  const hiddenHeaders = hiddenStatsData[0];
  const bundleHeaders = bundleGroupedData[0];
  
  const hiddenIdIdx = UTILS.findColumnIndex(hiddenHeaders, 'Campaign ID');
  const bundleIdIdx = UTILS.findColumnIndex(bundleHeaders, 'Campaign ID/Link');
  const bundleLocalIdx = UTILS.findColumnIndex(bundleHeaders, 'Local');
  const hiddenAutoIdx = UTILS.findColumnIndex(hiddenHeaders, 'is automated');
  const bundleAutoIdx = UTILS.findColumnIndex(bundleHeaders, 'Is Automated');
  
  if ([hiddenIdIdx, bundleIdIdx, bundleLocalIdx, hiddenAutoIdx, bundleAutoIdx].some(idx => idx === -1)) {
    throw new Error('Required columns not found');
  }
  
  const columnsToUpdate = [
    { bundleIdx: UTILS.findColumnIndex(bundleHeaders, 'eARPU 365'), hiddenIdx: UTILS.findColumnIndex(hiddenHeaders, 'Forecasted ARPU') },
    { bundleIdx: UTILS.findColumnIndex(bundleHeaders, 'IPM'), hiddenIdx: UTILS.findColumnIndex(hiddenHeaders, 'IPM') },
    { bundleIdx: UTILS.findColumnIndex(bundleHeaders, 'eROAS d365'), hiddenIdx: UTILS.findColumnIndex(hiddenHeaders, 'ROAS') },
    { bundleIdx: UTILS.findColumnIndex(bundleHeaders, 'eProfit d730'), hiddenIdx: UTILS.findColumnIndex(hiddenHeaders, 'Forecasted Profit'), divideBy: 10 },
    { bundleIdx: bundleAutoIdx, hiddenIdx: hiddenAutoIdx }
  ];
  
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
  
  // Применение обновлений
  const updates = [];
  for (let r = 1; r < bundleGroupedData.length; r++) {
    const id = bundleGroupedData[r][bundleIdIdx];
    if (lookup[id]) {
      columnsToUpdate.forEach(col => {
        let val = lookup[id].row[col.hiddenIdx];
        if (col.divideBy) val = val / col.divideBy;
        updates.push({ row: r + 1, col: col.bundleIdx + 1, value: val });
      });
      
      const loc = lookup[id].locale;
      if (loc) {
        updates.push({ row: r + 1, col: bundleLocalIdx + 1, value: loc });
      }
    }
  }
  
  UTILS.batchUpdate(bundleGroupedSheet, updates);
}

function groupMetrics() {
  updateBundleGroupTotals();
  updateROASValuesOnly();
}

function updateBundleGroupTotals() {
  const sheet = UTILS.getSheet("Bundle Grouped Campaigns", UTILS.CONFIG.SPREADSHEET_ID);
  if (!sheet) return;
  
  const data = sheet.getDataRange().getValues();
  const backgrounds = sheet.getRange(1, 1, sheet.getLastRow(), 1).getBackgrounds();
  const headers = data[0];
  
  const sourceIdx = UTILS.findColumnIndex(headers, 'Source');
  const eProfitIdx = UTILS.findColumnIndex(headers, 'eProfit d730');
  
  if (sourceIdx === -1 || eProfitIdx === -1) return;
  
  // Найти группы (строки с зеленым фоном #cbffdf)
  const groups = [];
  let currentStart = -1;
  
  for (let i = 1; i < backgrounds.length; i++) {
    const bg = backgrounds[i][0].toLowerCase();
    if (bg === '#cbffdf') {
      if (currentStart !== -1) {
        groups.push({ start: currentStart, end: i - 1 });
      }
      currentStart = i;
    }
  }
  if (currentStart !== -1) {
    groups.push({ start: currentStart, end: backgrounds.length - 1 });
  }
  
  // Вычисление сумм для каждой группы
  const updates = [];
  for (const group of groups) {
    let sum = 0;
    let hasValidData = false;
    
    for (let r = group.start + 1; r <= group.end; r++) {
      if (UTILS.isStandardBackground(backgrounds[r][0])) {
        const value = UTILS.parseNumber(data[r][eProfitIdx]);
        if (value !== null) {
          sum += value;
          hasValidData = true;
        }
      }
    }
    
    if (hasValidData) {
      updates.push({ row: group.start + 1, col: eProfitIdx + 1, value: sum.toFixed(2) });
    }
  }
  
  UTILS.batchUpdate(sheet, updates);
}

function updateROASValuesOnly() {
  const sheet = UTILS.getSheet("Bundle Grouped Campaigns", UTILS.CONFIG.SPREADSHEET_ID);
  if (!sheet) return;
  
  const data = sheet.getDataRange().getValues();
  const backgrounds = sheet.getRange(1, 1, sheet.getLastRow(), 1).getBackgrounds();
  const headers = data[0];
  
  const roasIdx = UTILS.findColumnIndex(headers, 'eROAS d365');
  if (roasIdx === -1) return;
  
  // Найти заголовки групп
  const groupHeaders = [];
  for (let i = 1; i < backgrounds.length; i++) {
    if (backgrounds[i][0].toLowerCase() === '#cbffdf') {
      groupHeaders.push(i);
    }
  }
  
  // Вычисление средних значений для групп
  const updates = [];
  for (let x = 0; x < groupHeaders.length; x++) {
    const start = groupHeaders[x];
    const end = x < groupHeaders.length - 1 ? groupHeaders[x + 1] - 1 : backgrounds.length - 1;
    
    let sum = 0, count = 0;
    for (let y = start + 1; y <= end; y++) {
      if (UTILS.isStandardBackground(backgrounds[y][0])) {
        const value = UTILS.parseNumber(data[y][roasIdx]);
        if (value !== null) {
          sum += value;
          count++;
        }
      }
    }
    
    if (count > 0) {
      const avg = (sum / count).toFixed(2);
      updates.push({ row: start + 1, col: roasIdx + 1, value: avg });
    }
  }
  
  UTILS.batchUpdate(sheet, updates);
}

function clearMetricsCache() {
  // Очистка кеша метрик при необходимости
  const cacheKeys = ['bundle_group_totals_', 'bundle_roas_values_'];
  cacheKeys.forEach(key => UTILS.cache.remove(key));
}