// 10_AutoBidManager.gs - Менеджер автоматических ставок
function toggleCampaignAutoBids() {
  const sheet = UTILS.getSheet('Bundle Grouped Campaigns', UTILS.CONFIG.SPREADSHEET_ID);
  if (!sheet) return;
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  const internalIdColIndex = UTILS.findColumnIndex(headers, ['internal id']);
  const isAutomatedColIndex = UTILS.findColumnIndex(headers, ['is automated']);
  
  if (internalIdColIndex === -1 || isAutomatedColIndex === -1) return;
  
  const rowsToProcess = [];
  
  // Сбор данных для обработки
  for (let i = 1; i < data.length; i++) {
    const internalId = data[i][internalIdColIndex]?.toString().trim();
    if (!internalId) continue;
    
    const isAutomated = data[i][isAutomatedColIndex]?.toString().toUpperCase() === "TRUE";
    const cacheKey = `appodeal_campaign_${internalId}`;
    const cachedValue = UTILS.cache.get(cacheKey);
    
    // Проверка кеша
    if (cachedValue !== null && cachedValue === isAutomated.toString()) {
      continue;
    }
    
    rowsToProcess.push({
      rowIndex: i + 1,
      internalId,
      isAutomated,
      cacheKey
    });
  }
  
  if (rowsToProcess.length === 0) return;
  
  // Обработка пакетами
  const batchSize = 10;
  for (let i = 0; i < rowsToProcess.length; i += batchSize) {
    const batch = rowsToProcess.slice(i, i + batchSize);
    processBatch(batch);
  }
}

function processBatch(batch) {
  const cacheUpdates = {};
  
  batch.forEach(item => {
    const response = sendToggleRequest(item.internalId, item.isAutomated);
    if (!response.error) {
      cacheUpdates[item.cacheKey] = item.isAutomated.toString();
    }
  });
  
  if (Object.keys(cacheUpdates).length > 0) {
    UTILS.cache.putAll(cacheUpdates);
  }
}

function sendToggleRequest(campaignId, enable) {
  const payload = [{
    operationName: "toggleCampaignAutoBid",
    variables: {
      enable: enable,
      ids: [campaignId],
      meta: {
        isAbsoluteChange: true,
        isMassAction: false
      }
    },
    query: `mutation toggleCampaignAutoBid($enable: Boolean!, $ids: [ID!]!, $meta: CPAMetaData!) {
      bidManager {
        ua {
          toggleCampaignAutoBid(enable: $enable, ids: $ids, meta: $meta) {
            id
            isBeingUpdated
            isAutomated
            __typename
          }
          __typename
        }
        __typename
      }
    }`
  }];
  
  const result = UTILS.fetchWithRetry(UTILS.CONFIG.BASE_URL_APPODEAL, {
    method: "post",
    headers: {
      "Authorization": `Bearer ${UTILS.CONFIG.API_TOKEN_APPODEAL}`,
      "Content-Type": "application/json"
    },
    payload: JSON.stringify(payload)
  });
  
  if (result.success) {
    try {
      return JSON.parse(result.response.getContentText());
    } catch (error) {
      return { error: error.toString() };
    }
  } else {
    return { error: result.error || 'Request failed' };
  }
}

function clearAutoBidCache() {
  // Очистка кеша автоматических ставок
  const cacheKey = "appodeal_campaign_all";
  UTILS.cache.remove(cacheKey);
}