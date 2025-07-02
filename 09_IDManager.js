// 09_IDManager.gs - Менеджер Campaign ID mappings
function updateCampaignIdMappings() {
  UTILS.log('🆔 IDManager: Начинаем updateCampaignIdMappings');
  
  const spreadsheetData = getSpreadsheetCampaignData();
  if (!spreadsheetData) {
    UTILS.log('❌ IDManager: Не удалось получить данные таблицы');
    return false;
  }
  
  const { sheet, data, campaignIdColIndex, internalIdColIndex } = spreadsheetData;
  if (internalIdColIndex === -1) {
    UTILS.log('❌ IDManager: Колонка Internal ID не найдена');
    return false;
  }
  
  UTILS.log(`📊 IDManager: Найдено ${data.length - 1} строк данных, колонка Internal ID: ${internalIdColIndex}`);
  
  const campaignIds = {};
  const cacheKeys = [];
  const currentInternalIds = {};
  let validCampaignCount = 0;
  
  // Сбор данных из таблицы
  for (let i = 1; i < data.length; i++) {
    const campaignId = UTILS.extractCampaignId(data[i][campaignIdColIndex]);
    if (!campaignId) continue;
    
    campaignIds[campaignId] = i;
    const internalId = data[i][internalIdColIndex];
    if (internalId) currentInternalIds[campaignId] = internalId;
    
    cacheKeys.push(getCampaignCacheKey(campaignId));
    validCampaignCount++;
  }
  
  UTILS.log(`🔍 IDManager: Найдено ${validCampaignCount} валидных Campaign ID`);
  
  // Проверка кеша
  const fullRefreshNeeded = needsFullRefresh();
  let campaignsToUpdate = Object.keys(campaignIds);
  
  UTILS.log(`🗃️ IDManager: Полное обновление ${fullRefreshNeeded ? 'требуется' : 'не требуется'}`);
  
  if (!fullRefreshNeeded) {
    const cachedMappings = UTILS.cache.getAll(cacheKeys);
    campaignsToUpdate = Object.keys(campaignIds).filter(campaignId => {
      const cacheKey = getCampaignCacheKey(campaignId);
      if (!cachedMappings[cacheKey]) return true;
      
      const cachedInternalId = cachedMappings[cacheKey];
      return !currentInternalIds[campaignId] || 
             currentInternalIds[campaignId].toString() !== cachedInternalId;
    });
    
    const cachedCount = Object.keys(campaignIds).length - campaignsToUpdate.length;
    UTILS.log(`💾 IDManager: В кеше найдено ${cachedCount} mappings, к обновлению: ${campaignsToUpdate.length}`);
  }
  
  if (campaignsToUpdate.length === 0) {
    UTILS.log('✅ IDManager: Все mappings актуальны');
    return true;
  }
  
  // Получение данных через GraphQL
  UTILS.log(`🌐 IDManager: Запрашиваем mappings через GraphQL для ${campaignsToUpdate.length} кампаний`);
  const mappings = fetchCampaignMappings();
  if (!mappings) {
    UTILS.log('❌ IDManager: Не удалось получить mappings через GraphQL');
    return false;
  }
  
  UTILS.log(`📦 IDManager: Получено ${Object.keys(mappings).length} mappings из GraphQL`);
  
  // Применение обновлений
  const updates = [];
  const cacheUpdates = {};
  let updatedCount = 0;
  
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
      updatedCount++;
    }
    
    const cacheKey = getCampaignCacheKey(campaignId);
    cacheUpdates[cacheKey] = internalId.toString();
  });
  
  UTILS.log(`📝 IDManager: Подготовлено ${updates.length} обновлений для таблицы`);
  
  if (updates.length > 0) {
    UTILS.batchUpdate(sheet, updates);
    UTILS.log(`✅ IDManager: Применено ${updates.length} обновлений в таблице`);
  }
  
  if (Object.keys(cacheUpdates).length > 0) {
    UTILS.cache.putAll(cacheUpdates);
    UTILS.cache.put("campaign_mapping_last_update", Date.now().toString());
    UTILS.log(`💾 IDManager: Обновлен кеш для ${Object.keys(cacheUpdates).length} mappings`);
  }
  
  UTILS.log('✅ IDManager: updateCampaignIdMappings завершен успешно');
  return true;
}

function getSpreadsheetCampaignData() {
  UTILS.log('📊 IDManager: Получаем данные из листа Bundle Grouped Campaigns');
  
  const sheet = UTILS.getSheet('Bundle Grouped Campaigns', UTILS.CONFIG.SPREADSHEET_ID);
  if (!sheet) {
    UTILS.log('❌ IDManager: Лист Bundle Grouped Campaigns не найден');
    return null;
  }
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    UTILS.log('❌ IDManager: Нет данных в листе');
    return null;
  }
  
  const headers = data[0];
  const campaignIdColIndex = UTILS.findColumnIndex(headers, ['campaign id', 'campaign id/link']);
  const internalIdColIndex = UTILS.findColumnIndex(headers, ['internal id']);
  
  UTILS.log(`🔍 IDManager: Найдены колонки - Campaign ID: ${campaignIdColIndex}, Internal ID: ${internalIdColIndex}`);
  
  if (campaignIdColIndex === -1) {
    UTILS.log('❌ IDManager: Колонка Campaign ID не найдена');
    return null;
  }
  
  return { sheet, data, campaignIdColIndex, internalIdColIndex };
}

function getCampaignCacheKey(campaignId) {
  return `campaign_mapping_${campaignId}`;
}

function needsFullRefresh() {
  const lastUpdate = UTILS.cache.get("campaign_mapping_last_update");
  if (!lastUpdate) {
    UTILS.log('🕐 IDManager: Первое выполнение - требуется полное обновление');
    return true;  
  }
  
  const lastUpdateDate = new Date(parseInt(lastUpdate));
  const hoursSinceLastUpdate = (Date.now() - lastUpdateDate) / (1000 * 60 * 60);
  const needsRefresh = hoursSinceLastUpdate > 24;
  
  UTILS.log(`🕐 IDManager: Последнее обновление ${hoursSinceLastUpdate.toFixed(1)} часов назад, полное обновление ${needsRefresh ? 'требуется' : 'не требуется'}`);
  return needsRefresh;
}

function fetchCampaignMappings() {
  UTILS.log('🌐 IDManager: Запрашиваем campaign mappings через GraphQL');
  
  const dateRange = UTILS.getDateRange(10);
  UTILS.log(`📅 IDManager: Период запроса - с ${dateRange.from} по ${dateRange.to}`);
  
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
  
  if (!result.success) {
    UTILS.log(`❌ IDManager: Ошибка GraphQL запроса: ${result.error}`);
    return null;
  }
  
  UTILS.log('📡 IDManager: GraphQL запрос выполнен успешно');
  
  try {
    const jsonResponse = JSON.parse(result.response.getContentText());
    if (jsonResponse.errors) {
      UTILS.log(`❌ IDManager: GraphQL ошибки: ${JSON.stringify(jsonResponse.errors)}`);
      return null;
    }
    
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
      
      UTILS.log(`🎯 IDManager: Извлечено ${Object.keys(mappings).length} mappings из ответа GraphQL`);
    } else {
      UTILS.log('⚠️ IDManager: Неожиданный формат ответа GraphQL');
    }
    
    return mappings;
    
  } catch (error) {
    UTILS.log(`❌ IDManager: Ошибка парсинга ответа GraphQL: ${error.message}`);
    return null;
  }
}

// Wrapper функция для обратной совместимости
function idlog() {
  UTILS.log('🔄 IDManager: Запуск через idlog() wrapper');
  updateCampaignIdMappings();
}