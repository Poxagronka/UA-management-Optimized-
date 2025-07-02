// 10_AutoBidManager.gs - Менеджер автоматических ставок
function toggleCampaignAutoBids() {
  UTILS.log('🔄 AutoBid: Начинаем toggleCampaignAutoBids');
  
  const sheet = UTILS.getSheet('Bundle Grouped Campaigns', UTILS.CONFIG.SPREADSHEET_ID);
  if (!sheet) {
    UTILS.log('❌ AutoBid: Лист Bundle Grouped Campaigns не найден');
    return;
  }
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  UTILS.log(`📊 AutoBid: Найдено ${data.length - 1} строк данных`);
  
  const internalIdColIndex = UTILS.findColumnIndex(headers, ['internal id']);
  const isAutomatedColIndex = UTILS.findColumnIndex(headers, ['is automated']);
  
  if (internalIdColIndex === -1 || isAutomatedColIndex === -1) {
    UTILS.log(`❌ AutoBid: Не найдены колонки - Internal ID: ${internalIdColIndex}, Is Automated: ${isAutomatedColIndex}`);
    return;
  }
  
  UTILS.log(`✅ AutoBid: Найдены колонки - Internal ID: ${internalIdColIndex}, Is Automated: ${isAutomatedColIndex}`);
  
  const rowsToProcess = [];
  let cachedCount = 0;
  let emptyIdCount = 0;
  
  // Сбор данных для обработки
  for (let i = 1; i < data.length; i++) {
    const internalId = data[i][internalIdColIndex]?.toString().trim();
    if (!internalId) {
      emptyIdCount++;
      continue;
    }
    
    const isAutomated = data[i][isAutomatedColIndex]?.toString().toUpperCase() === "TRUE";
    const cacheKey = `appodeal_campaign_${internalId}`;
    const cachedValue = UTILS.cache.get(cacheKey);
    
    // Проверка кеша
    if (cachedValue !== null && cachedValue === isAutomated.toString()) {
      cachedCount++;
      continue;
    }
    
    rowsToProcess.push({
      rowIndex: i + 1,
      internalId,
      isAutomated,
      cacheKey
    });
  }
  
  UTILS.log(`📈 AutoBid: Пустых ID: ${emptyIdCount}, В кеше: ${cachedCount}, К обработке: ${rowsToProcess.length}`);
  
  if (rowsToProcess.length === 0) {
    UTILS.log('✅ AutoBid: Нет строк для обработки - все в кеше');
    return;
  }
  
  // Обработка пакетами
  const batchSize = 10;
  const totalBatches = Math.ceil(rowsToProcess.length / batchSize);
  UTILS.log(`🚀 AutoBid: Начинаем обработку ${totalBatches} батчей по ${batchSize} запросов`);
  
  for (let i = 0; i < rowsToProcess.length; i += batchSize) {
    const batch = rowsToProcess.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    UTILS.log(`⚡ AutoBid: Обрабатываем батч ${batchNum}/${totalBatches} (${batch.length} запросов)`);
    
    processBatch(batch);
    
    UTILS.log(`✅ AutoBid: Батч ${batchNum} завершен`);
    
    if (i + batchSize < rowsToProcess.length) {
      Utilities.sleep(100);
    }
  }
  
  UTILS.log('🎉 AutoBid: toggleCampaignAutoBids завершен');
}

function processBatch(batch) {
  UTILS.log(`🔧 AutoBid: Начинаем processBatch для ${batch.length} элементов`);
  
  const cacheUpdates = {};
  let successCount = 0;
  let errorCount = 0;
  
  batch.forEach((item, index) => {
    UTILS.log(`📤 AutoBid: Отправляем запрос ${index + 1}/${batch.length} для ID ${item.internalId} (enable: ${item.isAutomated})`);
    
    const response = sendToggleRequest(item.internalId, item.isAutomated);
    if (!response.error) {
      cacheUpdates[item.cacheKey] = item.isAutomated.toString();
      successCount++;
      UTILS.log(`✅ AutoBid: Успешно обновлен ID ${item.internalId}`);
    } else {
      errorCount++;
      UTILS.log(`❌ AutoBid: Ошибка для ID ${item.internalId}: ${response.error}`);
    }
  });
  
  if (Object.keys(cacheUpdates).length > 0) {
    UTILS.cache.putAll(cacheUpdates);
    UTILS.log(`💾 AutoBid: Обновлен кеш для ${Object.keys(cacheUpdates).length} кампаний`);
  }
  
  UTILS.log(`📊 AutoBid: Батч результат - Успешно: ${successCount}, Ошибок: ${errorCount}`);
}

function sendToggleRequest(campaignId, enable) {
  UTILS.log(`🌐 AutoBid: Отправляем GraphQL запрос для ID ${campaignId}`);
  
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
    UTILS.log(`✅ AutoBid: Получен успешный ответ для ID ${campaignId}`);
    try {
      const parsed = JSON.parse(result.response.getContentText());
      if (parsed.errors) {
        UTILS.log(`⚠️ AutoBid: GraphQL ошибки для ID ${campaignId}: ${JSON.stringify(parsed.errors)}`);
        return { error: 'GraphQL errors: ' + JSON.stringify(parsed.errors) };
      }
      return parsed;
    } catch (error) {
      UTILS.log(`❌ AutoBid: Ошибка парсинга ответа для ID ${campaignId}: ${error.message}`);
      return { error: error.toString() };
    }
  } else {
    UTILS.log(`❌ AutoBid: Неуспешный запрос для ID ${campaignId}: ${result.error}`);
    return { error: result.error || 'Request failed' };
  }
}

function clearAutoBidCache() {
  const cacheKey = "appodeal_campaign_all";
  UTILS.cache.remove(cacheKey);
  UTILS.log('🗑️ AutoBid: Кеш очищен');
}