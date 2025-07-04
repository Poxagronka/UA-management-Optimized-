const CONFIG = {
  SHEET_ID: '1U5i1MSEodBPj1dF-qlyQKBABegwVpPR7-t-1rKoMhzQ',
  SHEET_NAME: 'Pivot',
  API_URL: 'https://app.appodeal.com/graphql',
  TARGET_EROAS: 160,
  BEARER_TOKEN: 'eyJhbGciOiJIUzUxMiJ9.eyJpc3MiOiJBcHBvZGVhbCIsImF1ZCI6WyJBcHBvZGVhbCJdLCJhZG1pbiI6dHJ1ZSwic3ViIjoyMzU4MzcsInR5cCI6ImFjY2VzcyIsImV4cCI6IjE4OTQ3MzY4MjAifQ.2TSLNElXLvfBxsOAJ4pYk106cSblF9kwkBreA-0Gs5DdRB3WFjo2aZzPKkxUYf8A95lbSpN55t41LJcWzatSCA'
};

function clearAllData() {
  try {
    const spreadsheet = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    const tempSheetName = CONFIG.SHEET_NAME + '_temp_' + Date.now();
    
    const newSheet = spreadsheet.insertSheet(tempSheetName);
    const oldSheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
    if (oldSheet) spreadsheet.deleteSheet(oldSheet);
    newSheet.setName(CONFIG.SHEET_NAME);
  } catch (error) {
    try {
      const spreadsheet = SpreadsheetApp.openById(CONFIG.SHEET_ID);
      const sheets = spreadsheet.getSheets();
      sheets.forEach(sheet => {
        if (sheet.getName().includes('_temp_')) {
          spreadsheet.deleteSheet(sheet);
        }
      });
    } catch (cleanupError) {}
    throw error;
  }
}

function getExistingWeeks() {
  try {
    const sheet = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) return [];
    
    const data = sheet.getDataRange().getValues();
    const existingWeeks = new Set();
    
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === 'WEEK' && data[i][1]) {
        const match = data[i][1].match(/(\d{4}-\d{2}-\d{2})\s*-/);
        if (match) existingWeeks.add(match[1]);
      }
    }
    return Array.from(existingWeeks);
  } catch (error) {
    return [];
  }
}

function getDateRangeForNewWeeks() {
  const today = new Date();
  const currentDayOfWeek = today.getDay();
  const daysToLastSunday = currentDayOfWeek === 0 ? 7 : currentDayOfWeek;
  const endDate = new Date(today);
  endDate.setDate(today.getDate() - daysToLastSunday);
  
  const existingWeeks = getExistingWeeks();
  let startDate;
  
  if (existingWeeks.length === 0) {
    startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - 30);
  } else {
    const latestWeek = new Date(Math.max(...existingWeeks.map(w => new Date(w))));
    startDate = new Date(latestWeek);
    startDate.setDate(latestWeek.getDate() + 7);
    if (startDate > endDate) return null;
  }
  
  return {
    from: startDate.toISOString().split('T')[0],
    to: endDate.toISOString().split('T')[0],
    isIncremental: existingWeeks.length > 0
  };
}

function getFullDateRange() {
  const today = new Date();
  const currentDayOfWeek = today.getDay();
  const daysToLastSunday = currentDayOfWeek === 0 ? 7 : currentDayOfWeek;
  
  const endDate = new Date(today);
  endDate.setDate(today.getDate() - daysToLastSunday);
  
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 30);
  
  return {
    from: startDate.toISOString().split('T')[0],
    to: endDate.toISOString().split('T')[0],
    isIncremental: false
  };
}

function extractSourceApp(campaignName) {
  try {
    const equalIndex = campaignName.indexOf('=');
    if (equalIndex !== -1) {
      let textAfterEqual = campaignName.substring(equalIndex + 1).trim();
      
      const subjMatches = [];
      let subjIndex = textAfterEqual.indexOf('subj');
      while (subjIndex !== -1) {
        subjMatches.push(subjIndex);
        subjIndex = textAfterEqual.indexOf('subj', subjIndex + 1);
      }
      
      if (subjMatches.length >= 2) {
        textAfterEqual = textAfterEqual.substring(0, subjMatches[1]).trim();
      } else if (subjMatches.length === 1 && subjMatches[0] > 10) {
        textAfterEqual = textAfterEqual.substring(0, subjMatches[0]).trim();
      }
      
      textAfterEqual = textAfterEqual.replace(/autobudget$/, '').trim();
      if (textAfterEqual.length > 0) return textAfterEqual;
    }
    
    const lastPipe = campaignName.lastIndexOf('|');
    if (lastPipe !== -1) {
      return campaignName.substring(lastPipe + 1).trim();
    }
    
    return 'Unknown';
  } catch (error) {
    return 'Unknown';
  }
}

function createCampaignPivotReport(forceFullRefresh = false) {
  try {
    let dateRange = forceFullRefresh ? getFullDateRange() : getDateRangeForNewWeeks();
    if (!dateRange) return;
    
    const rawData = fetchCampaignData(dateRange);
    if (!rawData.data?.analytics?.richStats?.stats?.length) return;
    
    const processedData = processApiData(rawData);
    if (Object.keys(processedData).length === 0) return;
    
    createEnhancedPivotTable(processedData);
  } catch (error) {
    throw error;
  }
}

function fetchCampaignData(dateRange) {
  const payload = {
    operationName: "RichStats",
    variables: {
      dateFilters: [{
        dimension: "INSTALL_DATE",
        from: dateRange.from,
        to: dateRange.to,
        include: true
      }],
      filters: [
        { dimension: "USER", values: ["79950", "127168", "157350", "150140", "11628", "233863", "239157"], include: true },
        { dimension: "ATTRIBUTION_PARTNER", values: ["Stack"], include: true },
        { dimension: "ATTRIBUTION_NETWORK_HID", values: ["234187180623265792"], include: true },
        { dimension: "ATTRIBUTION_CAMPAIGN_HID", values: [], include: true, searchByString: "/tricky/i" },
        { dimension: "APP", values: ["441746", "421947", "726937", "751813", "732667", "737810", "728706"], include: true }
      ],
      groupBy: [
        { dimension: "INSTALL_DATE", timeBucket: "WEEK" },
        { dimension: "ATTRIBUTION_CAMPAIGN_HID" },
        { dimension: "APP" }
      ],
      measures: [
        { id: "cpi", day: null },
        { id: "installs", day: null },
        { id: "ipm", day: null },
        { id: "spend", day: null },
        { id: "roas", day: 1 },
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
          stats { id ... on AppInfo { name platform bundleId __typename } ... on UaCampaign { hid campaignId campaignName status type isAutomated __typename } ... on StatsValue { value __typename } ... on ForecastStatsItem { value __typename } __typename }
          __typename
        }
        __typename
      }
    }`
  };

  const options = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CONFIG.BEARER_TOKEN}`,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload)
  };

  const response = UrlFetchApp.fetch(CONFIG.API_URL, options);
  const responseCode = response.getResponseCode();
  
  if (responseCode !== 200) {
    throw new Error(`API request failed with status: ${responseCode}`);
  }

  return JSON.parse(response.getContentText());
}

function processApiData(rawData) {
  const stats = rawData.data.analytics.richStats.stats;
  const appData = {};

  function getMondayOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  }

  function getSundayOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() + (day === 0 ? 0 : 7 - day);
    return new Date(d.setDate(diff));
  }

  stats.forEach(row => {
    try {
      const [date, campaign, app, cpi, installs, ipm, spend, roas, eArpuForecast, eRoasForecast, eProfitForecast] = row;
      
      const monday = getMondayOfWeek(new Date(date.value));
      const sunday = getSundayOfWeek(new Date(date.value));
      const weekKey = monday.toISOString().split('T')[0];

      const appKey = app.id;
      if (!appData[appKey]) {
        appData[appKey] = {
          appId: app.id,
          appName: app.name,
          platform: app.platform,
          bundleId: app.bundleId,
          weeks: {}
        };
      }

      if (!appData[appKey].weeks[weekKey]) {
        appData[appKey].weeks[weekKey] = {
          weekStart: monday.toISOString().split('T')[0],
          weekEnd: sunday.toISOString().split('T')[0],
          campaigns: []
        };
      }

      const geo = campaign.campaignName.includes('| USA |') ? 'USA' :
                   campaign.campaignName.includes('| MEX |') ? 'MEX' :
                   campaign.campaignName.includes('| AUS |') ? 'AUS' :
                   campaign.campaignName.includes('| DEU |') ? 'DEU' :
                   campaign.campaignName.includes('| JPN |') ? 'JPN' :
                   campaign.campaignName.includes('| KOR |') ? 'KOR' :
                   campaign.campaignName.includes('| BRA |') ? 'BRA' :
                   campaign.campaignName.includes('| CAN |') ? 'CAN' :
                   campaign.campaignName.includes('| GBR |') ? 'GBR' : 'OTHER';

      appData[appKey].weeks[weekKey].campaigns.push({
        date: date.value,
        campaignId: campaign.campaignId,
        campaignName: campaign.campaignName,
        cpi: parseFloat(cpi.value) || 0,
        installs: parseInt(installs.value) || 0,
        ipm: parseFloat(ipm.value) || 0,
        spend: parseFloat(spend.value) || 0,
        roas: parseFloat(roas.value) || 0,
        eArpuForecast: parseFloat(eArpuForecast.value) || 0,
        eRoasForecast: parseFloat(eRoasForecast.value) || 0,
        eProfitForecast: parseFloat(eProfitForecast.value) || 0,
        status: campaign.status,
        type: campaign.type,
        geo: geo,
        sourceApp: extractSourceApp(campaign.campaignName),
        isAutomated: campaign.isAutomated
      });
    } catch (error) {
      // Skip on error
    }
  });

  return appData;
}

function calculateWoWMetrics(appData) {
  if (!appData || typeof appData !== 'object') {
    return { sourceAppWoW: {}, weekWoW: {}, appWeekWoW: {} };
  }
  
  try {
    const sourceAppData = {};
    const appWeekData = {};
    
    Object.values(appData).forEach(app => {
      if (!app?.weeks) return;
      
      appWeekData[app.appName] = {};
      
      Object.values(app.weeks).forEach(week => {
        if (!week?.campaigns) return;
        
        const weekSpend = week.campaigns.reduce((sum, c) => sum + (c.spend || 0), 0);
        const weekProfit = week.campaigns.reduce((sum, c) => sum + (c.eProfitForecast || 0), 0);
        
        appWeekData[app.appName][week.weekStart] = {
          weekStart: week.weekStart,
          spend: weekSpend,
          profit: weekProfit
        };
        
        week.campaigns.forEach(campaign => {
          if (campaign.sourceApp) {
            const key = `${campaign.sourceApp}_${week.weekStart}`;
            
            if (!sourceAppData[key]) {
              sourceAppData[key] = {
                sourceApp: campaign.sourceApp,
                weekStart: week.weekStart,
                spend: 0,
                eRoasForecast: 0,
                eProfitForecast: 0,
                campaignCount: 0
              };
            }
            
            sourceAppData[key].spend += campaign.spend || 0;
            sourceAppData[key].eRoasForecast += campaign.eRoasForecast || 0;
            sourceAppData[key].eProfitForecast += campaign.eProfitForecast || 0;
            sourceAppData[key].campaignCount += 1;
          }
        });
      });
    });

    const sourceApps = {};
    Object.values(sourceAppData).forEach(data => {
      if (data.campaignCount > 0) {
        data.eRoasForecast = data.eRoasForecast / data.campaignCount;
      }
      
      if (!sourceApps[data.sourceApp]) {
        sourceApps[data.sourceApp] = [];
      }
      sourceApps[data.sourceApp].push(data);
    });

    const sourceAppWoWMetrics = {};
    Object.keys(sourceApps).forEach(sourceApp => {
      sourceApps[sourceApp].sort((a, b) => new Date(a.weekStart) - new Date(b.weekStart));
      
      sourceApps[sourceApp].forEach((currentWeek, index) => {
        const weekKey = currentWeek.weekStart;
        sourceAppWoWMetrics[`${sourceApp}_${weekKey}`] = {
          spendChange: 0,
          spendChangePercent: 0,
          eRoasChange: 0,
          eRoasChangePercent: 0,
          eProfitChange: 0,
          eProfitChangePercent: 0,
          growthStatus: 'First Week'
        };

        if (index > 0) {
          const previousWeek = sourceApps[sourceApp][index - 1];
          
          const spendChange = currentWeek.spend - previousWeek.spend;
          const spendChangePercent = previousWeek.spend !== 0 ? (spendChange / Math.abs(previousWeek.spend)) * 100 : 0;
          
          const eRoasChange = currentWeek.eRoasForecast - previousWeek.eRoasForecast;
          const eRoasChangePercent = previousWeek.eRoasForecast !== 0 ? (eRoasChange / Math.abs(previousWeek.eRoasForecast)) * 100 : 0;
          
          const eProfitChange = currentWeek.eProfitForecast - previousWeek.eProfitForecast;
          const eProfitChangePercent = previousWeek.eProfitForecast !== 0 ? (eProfitChange / Math.abs(previousWeek.eProfitForecast)) * 100 : 0;

          let growthStatus;
          
          if (previousWeek.eProfitForecast < 0 && currentWeek.eProfitForecast > 0) {
            growthStatus = '🟢 Healthy Growth';
          } else if (previousWeek.eProfitForecast < 0 && currentWeek.eProfitForecast < 0) {
            if (currentWeek.eProfitForecast > previousWeek.eProfitForecast && spendChangePercent > -20) {
              growthStatus = '🟡 Moderate Growth';
            } else if (currentWeek.eProfitForecast < previousWeek.eProfitForecast) {
              growthStatus = '🔴 Inefficient Growth';
            } else {
              growthStatus = '⚪ Stable';
            }
          } else if (previousWeek.eProfitForecast > 0 && currentWeek.eProfitForecast < 0) {
            growthStatus = '🔴 Inefficient Growth';
          } else {
            if (spendChangePercent > 10 && eProfitChangePercent > 5) {
              growthStatus = '🟢 Healthy Growth';
            } else if (spendChangePercent > 10 && eProfitChangePercent < -5) {
              growthStatus = '🔴 Inefficient Growth';
            } else if (spendChangePercent > 0 && eProfitChangePercent > 0) {
              growthStatus = '🟡 Moderate Growth';
            } else if (spendChangePercent < -10) {
              growthStatus = '🔵 Scaling Down';
            } else {
              growthStatus = '⚪ Stable';
            }
          }

          sourceAppWoWMetrics[`${sourceApp}_${weekKey}`] = {
            spendChange,
            spendChangePercent,
            eRoasChange,
            eRoasChangePercent,
            eProfitChange,
            eProfitChangePercent,
            growthStatus
          };
        }
      });
    });
    
    const appWeekWoWMetrics = {};
    
    Object.keys(appWeekData).forEach(appName => {
      const sortedWeeks = Object.values(appWeekData[appName]).sort((a, b) => new Date(a.weekStart) - new Date(b.weekStart));
      
      sortedWeeks.forEach((currentWeek, index) => {
        const weekKey = `${appName}_${currentWeek.weekStart}`;
        appWeekWoWMetrics[weekKey] = {
          spendChange: 0,
          spendChangePercent: 0,
          eProfitChange: 0,
          eProfitChangePercent: 0,
          growthStatus: 'First Week'
        };

        if (index > 0) {
          const previousWeek = sortedWeeks[index - 1];
          
          const spendChange = currentWeek.spend - previousWeek.spend;
          const spendChangePercent = previousWeek.spend !== 0 ? (spendChange / Math.abs(previousWeek.spend)) * 100 : 0;
          
          const eProfitChange = currentWeek.profit - previousWeek.profit;
          const eProfitChangePercent = previousWeek.profit !== 0 ? (eProfitChange / Math.abs(previousWeek.profit)) * 100 : 0;

          let growthStatus;
          
          if (previousWeek.profit < 0 && currentWeek.profit > 0) {
            growthStatus = '🟢 Healthy Growth';
          } else if (previousWeek.profit < 0 && currentWeek.profit < 0) {
            if (currentWeek.profit > previousWeek.profit && spendChangePercent > -20) {
              growthStatus = '🟡 Moderate Growth';
            } else if (currentWeek.profit < previousWeek.profit) {
              growthStatus = '🔴 Inefficient Growth';
            } else {
              growthStatus = '⚪ Stable';
            }
          } else if (previousWeek.profit > 0 && currentWeek.profit < 0) {
            growthStatus = '🔴 Inefficient Growth';
          } else {
            if (spendChangePercent > 10 && eProfitChangePercent > 5) {
              growthStatus = '🟢 Healthy Growth';
            } else if (spendChangePercent > 10 && eProfitChangePercent < -5) {
              growthStatus = '🔴 Inefficient Growth';
            } else if (spendChangePercent > 0 && eProfitChangePercent > 0) {
              growthStatus = '🟡 Moderate Growth';
            } else if (spendChangePercent < -10) {
              growthStatus = '🔵 Scaling Down';
            } else {
              growthStatus = '⚪ Stable';
            }
          }

          appWeekWoWMetrics[weekKey] = {
            spendChange,
            spendChangePercent,
            eProfitChange,
            eProfitChangePercent,
            growthStatus
          };
        }
      });
    });

    return { 
      sourceAppWoW: sourceAppWoWMetrics, 
      weekWoW: {}, 
      appWeekWoW: appWeekWoWMetrics 
    };
    
  } catch (error) {
    return { sourceAppWoW: {}, weekWoW: {}, appWeekWoW: {} };
  }
}

function createEnhancedPivotTable(appData) {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
  } else {
    sheet.clear();
  }

  const wowMetrics = calculateWoWMetrics(appData);
  
  const headers = [
    'Level', 'Week Range / Source App', 'ID', 'GEO',
    'Spend', 'Spend WoW %', 'Installs', 'CPI', 'ROAS D-1', 'IPM', 
    'E-ARPU 365d', 'E-ROAS 365d', 'E-Profit 730d', 'eProfit WoW %', 'Growth Status'
  ];

  const tableData = [];
  const formatData = [];
  tableData.push(headers);

  const sortedApps = Object.keys(appData).sort((a, b) => 
    appData[a].appName.localeCompare(appData[b].appName)
  );

  sortedApps.forEach(appKey => {
    const app = appData[appKey];
    
    const appRowIndex = tableData.length;
    tableData.push([
      'APP',
      app.appName,
      '', '', '', '', '', '', '', '', '', '', '', '', ''
    ]);
    
    formatData.push({
      row: appRowIndex + 1,
      type: 'APP'
    });

    const sortedWeeks = Object.keys(app.weeks).sort();

    sortedWeeks.forEach(weekKey => {
      const week = app.weeks[weekKey];
      
      const reliableCampaigns = week.campaigns.filter(c => 
        c.eRoasForecast >= 1 && c.eRoasForecast <= 1000 && c.installs >= 10 && c.spend > 0
      );
      
      const totalWeekSpend = week.campaigns.reduce((sum, c) => sum + c.spend, 0);
      const totalWeekInstalls = week.campaigns.reduce((sum, c) => sum + c.installs, 0);
      const avgWeekCpi = totalWeekInstalls > 0 ? totalWeekSpend / totalWeekInstalls : 0;
      const avgWeekRoas = week.campaigns.length > 0 ? 
                          week.campaigns.reduce((sum, c) => sum + c.roas, 0) / week.campaigns.length : 0;
      const avgWeekIpm = week.campaigns.length > 0 ? 
                         week.campaigns.reduce((sum, c) => sum + c.ipm, 0) / week.campaigns.length : 0;
      const avgWeekEArpu = week.campaigns.length > 0 ? 
                           week.campaigns.reduce((sum, c) => sum + c.eArpuForecast, 0) / week.campaigns.length : 0;
      
      const avgWeekERoas = reliableCampaigns.length > 0 ? 
                           reliableCampaigns.reduce((sum, c) => sum + c.eRoasForecast, 0) / reliableCampaigns.length : 0;
      
      const totalWeekEProfit = week.campaigns.reduce((sum, c) => sum + c.eProfitForecast, 0);

      const weekRowIndex = tableData.length;
      
      const appWeekKey = `${app.appName}_${weekKey}`;
      
      let weekWoWSpend = '';
      let weekWoWeProfit = '';
      let weekGrowthStatus = '';
      
      if (wowMetrics.appWeekWoW[appWeekKey]) {
        const metrics = wowMetrics.appWeekWoW[appWeekKey];
        weekWoWSpend = metrics.spendChangePercent !== 0 ? `${metrics.spendChangePercent.toFixed(0)}%` : '';
        weekWoWeProfit = metrics.eProfitChangePercent !== 0 ? `${metrics.eProfitChangePercent.toFixed(0)}%` : '';
        weekGrowthStatus = metrics.growthStatus;
      }

      tableData.push([
        'WEEK',
        `${week.weekStart} - ${week.weekEnd}`,
        '', '',
        totalWeekSpend.toFixed(2),
        weekWoWSpend,
        totalWeekInstalls,
        avgWeekCpi.toFixed(3),
        avgWeekRoas.toFixed(2),
        avgWeekIpm.toFixed(1),
        avgWeekEArpu.toFixed(3),
        `${avgWeekERoas.toFixed(0)}%`,
        totalWeekEProfit.toFixed(2),
        weekWoWeProfit,
        weekGrowthStatus
      ]);
      
      formatData.push({
        row: weekRowIndex + 1,
        type: 'WEEK'
      });

      const sortedCampaigns = week.campaigns.sort((a, b) => b.spend - a.spend);

      sortedCampaigns.forEach(campaign => {
        const campaignIdWithLink = `=HYPERLINK("https://app.appgrowth.com/campaigns/${campaign.campaignId}", "${campaign.campaignId}")`;
        
        const wowKey = `${campaign.sourceApp}_${weekKey}`;
        let spendWoW = '';
        let eProfitWoW = '';
        let growthStatus = '';
        
        if (wowMetrics.sourceAppWoW[wowKey]) {
          const metrics = wowMetrics.sourceAppWoW[wowKey];
          spendWoW = metrics.spendChangePercent !== 0 ? `${metrics.spendChangePercent.toFixed(0)}%` : '';
          eProfitWoW = metrics.eProfitChangePercent !== 0 ? `${metrics.eProfitChangePercent.toFixed(0)}%` : '';
          growthStatus = metrics.growthStatus;
        }
        
        tableData.push([
          'CAMPAIGN',
          campaign.sourceApp,
          campaignIdWithLink,
          campaign.geo,
          campaign.spend.toFixed(2),
          spendWoW,
          campaign.installs,
          campaign.cpi > 0 ? campaign.cpi.toFixed(3) : '0.000',
          campaign.roas.toFixed(2),
          campaign.ipm.toFixed(1),
          campaign.eArpuForecast.toFixed(3),
          `${campaign.eRoasForecast.toFixed(0)}%`,
          campaign.eProfitForecast.toFixed(2),
          eProfitWoW,
          growthStatus
        ]);
      });
    });
  });

  const range = sheet.getRange(1, 1, tableData.length, headers.length);
  range.setValues(tableData);

  applyEnhancedFormatting(sheet, tableData.length, headers.length, formatData);
  createRowGrouping(sheet, tableData, appData);
  sheet.setFrozenRows(1);
}

function applyEnhancedFormatting(sheet, numRows, numCols, formatData) {
  const headerRange = sheet.getRange(1, 1, 1, numCols);
  headerRange.setBackground('#4285f4')
             .setFontColor('white')
             .setFontWeight('bold')
             .setHorizontalAlignment('center')
             .setFontSize(11);

  const columnWidths = [
    {column: 1, width: 80}, {column: 2, width: 200}, {column: 3, width: 50}, {column: 4, width: 50},
    {column: 5, width: 75}, {column: 6, width: 150}, {column: 7, width: 75}, {column: 8, width: 75},
    {column: 9, width: 150}, {column: 10, width: 75}, {column: 11, width: 100}, {column: 12, width: 120},
    {column: 13, width: 125}, {column: 14, width: 125}, {column: 15, width: 150}
  ];
  
  columnWidths.forEach(col => {
    sheet.setColumnWidth(col.column, col.width);
  });

  const appRows = [];
  const weekRows = [];
  
  formatData.forEach(item => {
    if (item.type === 'APP') {
      appRows.push(item.row);
    } else if (item.type === 'WEEK') {
      weekRows.push(item.row);
    }
  });
  
  if (appRows.length > 0) {
    appRows.forEach(row => {
      const appRowRange = sheet.getRange(row, 1, 1, numCols);
      appRowRange.setBackground('#d1e7fe')
                 .setFontColor('black')
                 .setFontWeight('bold')
                 .setFontSize(11);
    });
  }
  
  if (weekRows.length > 0) {
    weekRows.forEach(row => {
      const weekRowRange = sheet.getRange(row, 1, 1, numCols);
      weekRowRange.setBackground('#e8f0fe')
                  .setFontSize(11);
    });
  }

  if (numRows > 1) {
    sheet.getRange(2, 5, numRows - 1, 1).setNumberFormat('$0.00');
    sheet.getRange(2, 8, numRows - 1, 1).setNumberFormat('$0.000');
    sheet.getRange(2, 9, numRows - 1, 1).setNumberFormat('0.00');
    sheet.getRange(2, 10, numRows - 1, 1).setNumberFormat('0.0');
    sheet.getRange(2, 11, numRows - 1, 1).setNumberFormat('$0.000');
    sheet.getRange(2, 13, numRows - 1, 1).setNumberFormat('$0.00');
  }

  applyConditionalFormatting(sheet, numRows);
  sheet.hideColumns(1);
}

function applyConditionalFormatting(sheet, numRows) {
  const rules = [];

  if (numRows > 1) {
    const spendWoWRange = sheet.getRange(2, 6, numRows - 1, 1);
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains('%')
        .whenNumberGreaterThan(0)
        .setBackground('#d1f2eb')
        .setFontColor('#0c5460')
        .setRanges([spendWoWRange])
        .build()
    );
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains('%')
        .whenNumberLessThan(0)
        .setBackground('#f8d7da')
        .setFontColor('#721c24')
        .setRanges([spendWoWRange])
        .build()
    );

    const eRoasRange = sheet.getRange(2, 12, numRows - 1, 1);
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=AND(NOT(ISBLANK(L2)), VALUE(SUBSTITUTE(L2,"%","")) >= 160)')
        .setBackground('#d1f2eb')
        .setFontColor('#0c5460')
        .setRanges([eRoasRange])
        .build()
    );
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=AND(NOT(ISBLANK(L2)), VALUE(SUBSTITUTE(L2,"%","")) >= 120, VALUE(SUBSTITUTE(L2,"%","")) < 160)')
        .setBackground('#fff3cd')
        .setFontColor('#856404')
        .setRanges([eRoasRange])
        .build()
    );
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=AND(NOT(ISBLANK(L2)), VALUE(SUBSTITUTE(L2,"%","")) < 120)')
        .setBackground('#f8d7da')
        .setFontColor('#721c24')
        .setRanges([eRoasRange])
        .build()
    );

    const eProfitWoWRange = sheet.getRange(2, 14, numRows - 1, 1);
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains('%')
        .whenNumberGreaterThan(0)
        .setBackground('#d1f2eb')
        .setFontColor('#0c5460')
        .setRanges([eProfitWoWRange])
        .build()
    );
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains('%')
        .whenNumberLessThan(0)
        .setBackground('#f8d7da')
        .setFontColor('#721c24')
        .setRanges([eProfitWoWRange])
        .build()
    );

    const growthStatusRange = sheet.getRange(2, 15, numRows - 1, 1);
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains('🟢 Healthy Growth')
        .setBackground('#d1f2eb')
        .setFontColor('#0c5460')
        .setRanges([growthStatusRange])
        .build()
    );
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains('🔴 Inefficient Growth')
        .setBackground('#f5c6cb')
        .setFontColor('#721c24')
        .setRanges([growthStatusRange])
        .build()
    );
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains('🟡 Moderate Growth')
        .setBackground('#fff3cd')
        .setFontColor('#856404')
        .setRanges([growthStatusRange])
        .build()
    );
  }
  
  sheet.setConditionalFormatRules(rules);
}

function createRowGrouping(sheet, tableData, appData) {
  let currentRow = 2;
  const numCols = 15;

  const sortedApps = Object.keys(appData).sort((a, b) => 
    appData[a].appName.localeCompare(appData[b].appName)
  );

  sortedApps.forEach(appKey => {
    const app = appData[appKey];
    const appRowIndex = currentRow;
    currentRow++;

    const sortedWeeks = Object.keys(app.weeks).sort();
    let weekRowsInApp = [];

    sortedWeeks.forEach(weekKey => {
      const week = app.weeks[weekKey];
      const weekRowIndex = currentRow;
      const campaignRowsCount = week.campaigns.length;

      weekRowsInApp.push({
        weekRow: weekRowIndex,
        campaignStart: weekRowIndex + 1,
        campaignEnd: weekRowIndex + campaignRowsCount,
        campaignCount: campaignRowsCount
      });

      currentRow++;

      if (campaignRowsCount > 0) {
        const startGroupRow = currentRow;
        const endGroupRow = currentRow + campaignRowsCount - 1;

        if (endGroupRow >= startGroupRow) {
          try {
            sheet.getRange(startGroupRow, 1, campaignRowsCount, numCols).shiftRowGroupDepth(1);
            sheet.getRange(startGroupRow, 1, campaignRowsCount, 1).collapseGroups();
          } catch (e) {
            // Ignore grouping errors
          }
        }

        currentRow += campaignRowsCount;
      }
    });

    if (weekRowsInApp.length > 0) {
      const firstWeekRow = weekRowsInApp[0].weekRow;
      const lastCampaignRow = weekRowsInApp[weekRowsInApp.length - 1].campaignEnd;
      const totalRowsToGroup = lastCampaignRow - firstWeekRow + 1;

      if (totalRowsToGroup > 0) {
        try {
          sheet.getRange(firstWeekRow, 1, totalRowsToGroup, numCols).shiftRowGroupDepth(1);
          sheet.getRange(firstWeekRow, 1, totalRowsToGroup, 1).collapseGroups();
        } catch (e) {
          // Ignore grouping errors
        }
      }
    }
  });
}

function createReportWithCustomDates(fromDate, toDate) {
  const customDateRange = {
    from: fromDate,
    to: toDate,
    isIncremental: false
  };
  
  try {
    const rawData = fetchCampaignData(customDateRange);
    const processedData = processApiData(rawData);
    createEnhancedPivotTable(processedData);
  } catch (error) {
    throw error;
  }
}

function forceFullRefresh() {
  try {
    clearAllData();
    createCampaignPivotReport(true);
    
    const spreadsheet = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    const pivotSheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
    
    if (pivotSheet) {
      const sheets = spreadsheet.getSheets();
      let bundleIndex = -1;
      let pivotIndex = -1;
      
      for (let i = 0; i < sheets.length; i++) {
        const sheetName = sheets[i].getName();
        if (sheetName === 'Bundle Grouped Campaigns') {
          bundleIndex = i;
        }
        if (sheetName === CONFIG.SHEET_NAME) {
          pivotIndex = i;
        }
      }
      
      if (bundleIndex !== -1 && pivotIndex !== -1) {
        if (pivotIndex !== bundleIndex + 1) {
          const targetPosition = bundleIndex + 2;
          spreadsheet.setActiveSheet(pivotSheet);
          spreadsheet.moveActiveSheet(targetPosition);
        }
      }
    }
    
  } catch (error) {
    throw error;
  }
}

function repositionPivotSheet() {
  try {
    const spreadsheet = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    const pivotSheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
    const bundleSheet = spreadsheet.getSheetByName('Bundle Grouped Campaigns');
    
    if (pivotSheet && bundleSheet) {
      const sheets = spreadsheet.getSheets();
      const bundlePosition = sheets.indexOf(bundleSheet);
      
      spreadsheet.setActiveSheet(pivotSheet);
      spreadsheet.moveActiveSheet(bundlePosition + 1);
    }
  } catch (error) {
    throw error;
  }
}