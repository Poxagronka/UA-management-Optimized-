// 09_IDManager.gs - Менеджер Campaign ID mappings
function updateCampaignIdMappings() {
  const spreadsheetData = getSpreadsheetCampaignData();
  if (!spreadsheetData) return false;
  
  const { sheet, data, campaignIdColIndex, internalIdColIndex } = spreadsheetData;
  if (internalIdColIndex === -1) return false;
  
  const campaignIds = {};
  const cacheKeys = [];
  const currentInternalIds = {};
  
  // Сбор данных из таблицы
  for (let i = 1; i < data.length; i++) {
    const campaignId = UTILS.extractCampaignId(data[i][campaignIdColIndex]);
    if (!campaignId) continue;
    
    campaignIds[campaignId] = i;
    const internalId = data[i][internalIdColIndex];
    if (internalId) currentInternalIds[campaignId] = internalId;
    
    cacheKeys.push(getCampaignCacheKey(campaignId));
  }
  
  // Проверка кеша
  const fullRefreshNeeded = needsFullRefresh();
  let campaignsToUpdate = Object.keys(campaignIds);
  
  if (!fullRefreshNeeded) {
    const cachedMappings = UTILS.cache.getAll(cacheKeys);
    campaignsToUpdate = Object.keys(campaignIds).filter(campaignId => {
      const cacheKey = getCampaignCacheKey(campaignId);
      if (!cachedMappings[cacheKey]) return true;
      
      const cachedInternalId = cachedMappings[cacheKey];
      return !currentInternalIds[campaignId] || 
             currentInternalIds[campaignId].toString() !== cachedInternalId;
    });
  }
  
  if (campaignsToUpdate.length === 0) return true;
  
  // Получение данных через GraphQL
  const mappings = fetchCampaignMappings();
  if (!mappings) return false;
  
  // Применение обновлений
  const updates = [];
  const cacheUpdates = {};
  
  Object.entries(mappings).forEach(([campaignId, internalId]) => {
    if (!campaignIds.hasOwnProperty(campaignId)) return;
    
    const rowIndex = campaignIds[campaignId];
    const currentInternalId = data[rowIndex][internalIdColIndex];
    
    if (currentInternalId !== internalId) {
      updates.push({
        row: rowIndex + 1,
        col: internalIdColIndex + 1,
        value: internalId
      });
    }
    
    const cacheKey = getCampaignCacheKey(campaignId);
    cacheUpdates[cacheKey] = internalId.toString();
  });
  
  if (updates.length > 0) {
    UTILS.batchUpdate(sheet, updates);
  }
  
  if (Object.keys(cacheUpdates).length > 0) {
    UTILS.cache.putAll(cacheUpdates);
    UTILS.cache.put("campaign_mapping_last_update", Date.now().toString());
  }
  
  return true;
}

function getSpreadsheetCampaignData() {
  const sheet = UTILS.getSheet('Bundle Grouped Campaigns', UTILS.CONFIG.SPREADSHEET_ID);
  if (!sheet) return null;
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return null;
  
  const headers = data[0];
  const campaignIdColIndex = UTILS.findColumnIndex(headers, ['campaign id', 'campaign id/link']);
  const internalIdColIndex = UTILS.findColumnIndex(headers, ['internal id']);
  
  if (campaignIdColIndex === -1) return null;
  
  return { sheet, data, campaignIdColIndex, internalIdColIndex };
}

function getCampaignCacheKey(campaignId) {
  return `campaign_mapping_${campaignId}`;
}

function needsFullRefresh() {
  const lastUpdate = UTILS.cache.get("campaign_mapping_last_update");
  if (!lastUpdate) return true;
  
  const lastUpdateDate = new Date(parseInt(lastUpdate));
  const hoursSinceLastUpdate = (Date.now() - lastUpdateDate) / (1000 * 60 * 60);
  return hoursSinceLastUpdate > 24;
}

function fetchCampaignMappings() {
  const dateRange = UTILS.getDateRange(10);
  
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
        {
          dimension: "USER",
          values: ["79950", "127168", "157350", "150140", "11628", "233863", "239157"],
          include: true
        },
        { dimension: "ATTRIBUTION_PARTNER", values: ["Stack"], include: true },
        { dimension: "ATTRIBUTION_NETWORK_HID", values: ["234187180623265792"], include: true }
      ],
      groupBy: [{ dimension: "ATTRIBUTION_CAMPAIGN_HID" }],
      measures: [{ id: "installs", day: null }],
      havingFilters: [],
      anonymizationMode: "OFF",
      topFilter: null,
      revenuePredictionVersion: "",
      isMultiMediation: true
    },
    query: `query RichStats($dateFilters: [DateFilterInput!]!, $filters: [FilterInput!]!, $groupBy: [GroupByInput!]!, $measures: [RichMeasureInput!]!, $havingFilters: [HavingFilterInput!], $anonymizationMode: DataAnonymizationMode, $revenuePredictionVersion: String!, $topFilter: TopFilterInput, $funnelFilter: FunnelAttributes, $isMultiMediation: Boolean) {
      analytics(anonymizationMode: $anonymizationMode) {
        richStats(funnelFilter: $funnelFilter dateFilters: $dateFilters filters: $filters groupBy: $groupBy measures: $measures havingFilters: $havingFilters revenuePredictionVersion: $revenuePredictionVersion topFilter: $topFilter isMultiMediation: $isMultiMediation) {
          stats { id ... on UaCampaign { hid campaignId __typename } __typename }
          __typename
        }
        __typename
      }
    }`
  };
  
  const result = UTILS.fetchWithRetry(UTILS.CONFIG.BASE_URL_APPODEAL, {
    method: "post",
    headers: {
      "Authorization": `Bearer ${UTILS.CONFIG.API_TOKEN_APPODEAL}`,
      "Content-Type": "application/json"
    },
    payload: JSON.stringify(payload)
  });
  
  if (!result.success) return null;
  
  try {
    const jsonResponse = JSON.parse(result.response.getContentText());
    if (jsonResponse.errors) return null;
    
    const mappings = {};
    const statsGroups = jsonResponse.data?.analytics?.richStats?.stats;
    
    if (Array.isArray(statsGroups)) {
      statsGroups.forEach(group => {
        if (Array.isArray(group) && group[0]) {
          const campaignObj = group[0];
          const { id, campaignId } = campaignObj;
          if (id && campaignId) {
            mappings[campaignId] = id;
          }
        }
      });
    }
    
    return mappings;
    
  } catch (error) {
    UTILS.log(`Error parsing campaign mappings: ${error.message}`);
    return null;
  }
}

// Wrapper функция для обратной совместимости
function idlog() {
  updateCampaignIdMappings();
}