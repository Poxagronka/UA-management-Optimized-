const TOKEN = "eyJhbGciOiJIUzUxMiJ9.eyJpc3MiOiJBcHBvZGVhbCIsImF1ZCI6WyJBcHBvZGVhbCJdLCJhZG1pbiI6dHJ1ZSwic3ViIjoyMzU4MzcsInR5cCI6ImFjY2VzcyIsImV4cCI6IjE4OTQ3MzY4MjAifQ.2TSLNElXLvfBxsOAJ4pYk106cSblF9kwkBreA-0Gs5DdRB3WFjo2aZzPKkxUYf8A95lbSpN55t41LJcWzatSCA";
const APPODEAL_GRAPHQL_URL = "https://app.appodeal.com/graphql";
const SPREADSHEET_ID = "1U5i1MSEodBPj1dF-qlyQKBABegwVpPR7-t-1rKoMhzQ";
const SHEET_NAME = "Bundle Grouped Campaigns";
const CACHE_KEY_PREFIX = "appodeal_campaign_";
const CACHE_EXPIRATION = 24 * 60 * 60;

const GRAPHQL_QUERY = "mutation toggleCampaignAutoBid($enable: Boolean!, $ids: [ID!]!, $meta: CPAMetaData!) {\n  bidManager {\n    ua {\n      toggleCampaignAutoBid(enable: $enable, ids: $ids, meta: $meta) {\n        id\n        isBeingUpdated\n        isAutomated\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}\n";

const BASE_OPTIONS = {
  method: "post",
  contentType: "application/json",
  headers: {
    "Authorization": `Bearer ${TOKEN}`,
    "Accept": "application/json, text/plain, */*"
  },
  muteHttpExceptions: true
};

function toggleCampaignAutoBids() {
  try {
    const cache = CacheService.getScriptCache();
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    if (!sheet) return;
    
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;
    
    const data = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
    const headers = data[0];
    
    const internalIdColIndex = headers.findIndex(header => header.toString().toLowerCase() === "internal id");
    const isAutomatedColIndex = headers.findIndex(header => header.toString().toLowerCase() === "is automated");
    
    if (internalIdColIndex === -1 || isAutomatedColIndex === -1) return;
    
    const rowsToProcess = [];
    let skippedRows = 0;
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const internalId = row[internalIdColIndex]?.toString().trim();
      
      if (internalId) {
        const isAutomated = row[isAutomatedColIndex]?.toString().toUpperCase() === "TRUE";
        const cacheKey = `${CACHE_KEY_PREFIX}${internalId}`;
        const cachedValue = cache.get(cacheKey);
        
        if (cachedValue !== null && cachedValue === isAutomated.toString()) {
          skippedRows++;
          continue;
        }
        
        rowsToProcess.push({
          rowIndex: i + 1,
          internalId: internalId,
          isAutomated: isAutomated,
          cacheKey: cacheKey
        });
      }
    }
    
    if (rowsToProcess.length === 0) return;
    
    const batchSize = 10;
    const batches = [];
    for (let i = 0; i < rowsToProcess.length; i += batchSize) {
      batches.push(rowsToProcess.slice(i, i + batchSize));
    }
    
    batches.forEach(batch => {
      const cacheUpdates = {};
      
      batch.forEach(item => {
        const response = sendToggleRequest(item.internalId, item.isAutomated);
        if (!response.error) {
          cacheUpdates[item.cacheKey] = item.isAutomated.toString();
        }
      });
      
      if (Object.keys(cacheUpdates).length > 0) {
        cache.putAll(cacheUpdates, CACHE_EXPIRATION);
      }
    });
    
  } catch (error) {
    // Silent error handling
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
    query: GRAPHQL_QUERY
  }];
  
  const options = Object.assign({}, BASE_OPTIONS, {
    payload: JSON.stringify(payload)
  });
  
  try {
    const response = UrlFetchApp.fetch(APPODEAL_GRAPHQL_URL, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode >= 200 && responseCode < 300) {
      return JSON.parse(response.getContentText());
    } else {
      return { error: `HTTP Error: ${responseCode}` };
    }
  } catch (error) {
    return { error: error.toString() };
  }
}

function clearCache() {
  const cache = CacheService.getScriptCache();
  cache.remove(`${CACHE_KEY_PREFIX}all`);
}