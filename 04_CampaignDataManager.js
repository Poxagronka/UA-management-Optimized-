// 05_CampaignDataManager.gs - Объединенный менеджер данных кампаний
function updateCampaignDataInAllSheets() {
  const REQUIRED_HEADERS = ['Campaign ID/Link', 'Campaign Status', 'Optimization', 'Latest optimization value'];
  
  const spreadsheet = SpreadsheetApp.openById(UTILS.CONFIG.SPREADSHEET_ID);
  const sheets = spreadsheet.getSheets();
  
  // Сначала обрабатываем Bundle Grouped Campaigns
  const bundleSheet = sheets.find(s => s.getName() === "Bundle Grouped Campaigns");
  if (bundleSheet) processSheetCampaignData(bundleSheet, true);
  
  // Затем остальные листы
  sheets.forEach(sheet => {
    if (sheet.getName() !== "Bundle Grouped Campaigns") {
      processSheetCampaignData(sheet);
    }
  });

  function processSheetCampaignData(sheet, isBundleGrouped = false) {
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    // Проверка наличия необходимых заголовков
    const missingHeaders = REQUIRED_HEADERS.filter(header => 
      UTILS.findColumnIndex(headers, header.toLowerCase()) === -1
    );
    if (missingHeaders.length > 0) return;
    
    const columnMap = {
      campaignId: UTILS.findColumnIndex(headers, ['campaign id/link']),
      status: UTILS.findColumnIndex(headers, ['campaign status']),
      optimization: UTILS.findColumnIndex(headers, ['optimization']),
      bid: UTILS.findColumnIndex(headers, ['latest optimization value']),
      overallBudget: UTILS.findColumnIndex(headers, ['overall budget'])
    };
    
    // Сбор campaign IDs
    const campaignIds = [];
    for (let i = 1; i < data.length; i++) {
      const campaignId = UTILS.extractCampaignId(data[i][columnMap.campaignId]);
      if (UTILS.isValidId(campaignId)) {
        campaignIds.push({ id: campaignId, rowIndex: i + 1 });
      }
    }
    
    if (campaignIds.length === 0) return;
    
    // Пакетная обработка
    const batchSize = UTILS.CONFIG.BATCH_SIZE;
    for (let i = 0; i < campaignIds.length; i += batchSize) {
      const batch = campaignIds.slice(i, i + batchSize);
      processBatch(sheet, batch, columnMap);
    }
  }
  
  function processBatch(sheet, campaignBatch, columnMap) {
    const requests = campaignBatch.map(item => ({
      url: `${UTILS.CONFIG.BASE_URL_APPGROWTH}/campaigns2/?ids=${item.id}`,
      method: "get",
      headers: {
        "Authorization": UTILS.CONFIG.API_TOKEN_APPGROWTH,
        "Accept": "application/json"
      },
      campaignInfo: item
    }));
    
    try {
      const responses = UrlFetchApp.fetchAll(requests);
      const updates = [];
      
      responses.forEach((response, index) => {
        if (response.getResponseCode() === 200) {
          const campaignData = JSON.parse(response.getContentText());
          const rowIndex = requests[index].campaignInfo.rowIndex;
          
          if (campaignData.campaigns?.[0]) {
            const campaign = campaignData.campaigns[0];
            
            if (campaign.status !== undefined) {
              updates.push({ row: rowIndex, col: columnMap.status + 1, value: campaign.status });
            }
            if (campaign.type !== undefined) {
              updates.push({ row: rowIndex, col: columnMap.optimization + 1, value: campaign.type });
            }
            if (campaign.bid !== undefined) {
              updates.push({ row: rowIndex, col: columnMap.bid + 1, value: campaign.bid });
            }
            if (columnMap.overallBudget !== -1 && campaign.budget !== undefined) {
              updates.push({ row: rowIndex, col: columnMap.overallBudget + 1, value: campaign.budget });
            }
          }
        }
      });
      
      UTILS.batchUpdate(sheet, updates);
      
    } catch (error) {
      UTILS.log(`Ошибка при обработке батча: ${error.message}`);
    }
  }
}

function getReportDataForAllSheets() {
  const spreadsheet = SpreadsheetApp.openById(UTILS.CONFIG.SPREADSHEET_ID);
  const sheets = spreadsheet.getSheets();
  
  const dateRange = UTILS.getDateRange(13); // 14 дней назад
  const today = UTILS.formatDate(new Date());
  
  const REPORT_URLS = {
    "14days": `${UTILS.CONFIG.BASE_URL_APPGROWTH}/reports/?from_date=${dateRange.from}&to_date=${dateRange.to}&dimensions=app&dimensions=country&dimensions=campaign_id&dimensions=date`,
    "today": `${UTILS.CONFIG.BASE_URL_APPGROWTH}/reports/?from_date=${today}&to_date=${today}&dimensions=app&dimensions=country&dimensions=campaign_id&dimensions=date`
  };
  
  const options = {
    method: "get",
    headers: {
      "Authorization": UTILS.CONFIG.API_TOKEN_APPGROWTH,
      "Accept": "text/csv"
    },
    muteHttpExceptions: true
  };
  
  // Параллельный запрос отчетов
  const [data14d, todayData] = Object.values(REPORT_URLS).map(url => {
    try {
      const response = UrlFetchApp.fetch(url, options);
      return response.getResponseCode() === 200 ? 
        Utilities.parseCsv(response.getContentText()) : null;
    } catch (e) {
      return null;
    }
  });
  
  const allCampaignData = {
    '14days': aggregateReportData(data14d),
    'today': aggregateReportData(todayData)
  };
  
  const allReportCampaignIds = new Set([
    ...Object.keys(allCampaignData['14days']),
    ...Object.keys(allCampaignData['today'])
  ]);
  
  // Обработка каждого листа
  sheets.forEach(sheet => {
    try {
      processSheetReportData(sheet, allCampaignData, allReportCampaignIds);
    } catch (e) {
      UTILS.log(`Ошибка обработки листа ${sheet.getName()}: ${e.message}`);
    }
  });

  function aggregateReportData(csvData) {
    if (!csvData?.length) return {};
    
    const headers = csvData[0].map(h => String(h).trim().toLowerCase());
    const campaignIdIndex = headers.indexOf("campaign_id");
    if (campaignIdIndex === -1) return {};
    
    const aggregator = {};
    const indices = {
      imps: headers.indexOf("imps"),
      clicks: headers.indexOf("clicks"),
      installs: headers.indexOf("installs"),
      actions: headers.indexOf("actions"),
      spend: headers.indexOf("spend")
    };
    
    for (let i = 1; i < csvData.length; i++) {
      const row = csvData[i];
      if (!row || row.length <= campaignIdIndex) continue;
      
      const campaignId = String(row[campaignIdIndex]).trim();
      if (!aggregator[campaignId]) {
        aggregator[campaignId] = { imps: 0, clicks: 0, installs: 0, actions: 0, spend: 0 };
      }
      
      Object.entries(indices).forEach(([field, index]) => {
        if (index !== -1 && row[index] !== undefined) {
          aggregator[campaignId][field] += Number(row[index]) || 0;
        }
      });
    }
    
    return aggregator;
  }
  
  function processSheetReportData(sheet, allCampaignData, allReportCampaignIds) {
    const allValues = sheet.getDataRange().getValues();
    const backgrounds = sheet.getDataRange().getBackgrounds();
    
    if (allValues.length < 2) return;
    
    const headers = allValues[0];
    const columnMap = {
      campaignId: UTILS.findColumnIndex(headers, ['campaign id/link']),
      todayInstalls: UTILS.findColumnIndex(headers, ['today installs']),
      todaySpend: UTILS.findColumnIndex(headers, ['today spend']),
      todayCpi: UTILS.findColumnIndex(headers, ['today cpi']),
      spend14d: UTILS.findColumnIndex(headers, ['spend in the last 14 days']),
      cpi14d: UTILS.findColumnIndex(headers, ['average cpi in the last 14 days']),
      impressions: UTILS.findColumnIndex(headers, ['impressions'])
    };
    
    if (columnMap.campaignId === -1) return;
    
    const updates = [];
    
    for (let rowIndex = 1; rowIndex < allValues.length; rowIndex++) {
      const row = allValues[rowIndex];
      const cellBackground = backgrounds[rowIndex][columnMap.campaignId];
      
      if (!UTILS.isStandardBackground(cellBackground)) continue;
      
      const campaignId = UTILS.extractCampaignId(row[columnMap.campaignId]);
      if (!campaignId || !allReportCampaignIds.has(campaignId)) continue;
      
      const data14d = allCampaignData['14days'][campaignId];
      const dataToday = allCampaignData['today'][campaignId];
      
      // Подготовка обновлений для 14-дневных данных
      if (data14d) {
        if (columnMap.spend14d !== -1) {
          updates.push({ row: rowIndex + 1, col: columnMap.spend14d + 1, value: data14d.spend.toFixed(2) });
        }
        if (columnMap.cpi14d !== -1) {
          const cpi = data14d.installs > 0 ? (data14d.spend / data14d.installs) : 0;
          updates.push({ row: rowIndex + 1, col: columnMap.cpi14d + 1, value: cpi.toFixed(2) });
        }
        if (columnMap.impressions !== -1) {
          updates.push({ row: rowIndex + 1, col: columnMap.impressions + 1, value: Math.round(data14d.imps) });
        }
      }
      
      // Подготовка обновлений для сегодняшних данных
      if (dataToday) {
        if (columnMap.todayInstalls !== -1) {
          updates.push({ row: rowIndex + 1, col: columnMap.todayInstalls + 1, value: Math.round(dataToday.installs) });
        }
        if (columnMap.todaySpend !== -1) {
          updates.push({ row: rowIndex + 1, col: columnMap.todaySpend + 1, value: dataToday.spend.toFixed(2) });
        }
        if (columnMap.todayCpi !== -1) {
          const cpi = dataToday.installs > 0 ? (dataToday.spend / dataToday.installs) : 0;
          updates.push({ row: rowIndex + 1, col: columnMap.todayCpi + 1, value: cpi.toFixed(2) });
        }
      }
    }
    
    UTILS.batchUpdate(sheet, updates);
  }
}