// 05_PatchCampaignOptimization.gs - Упрощенная версия
function runPatchCampaignOptimization() {
  const manager = createPatchManager();
  const result = manager.run();
  toggleCampaignAutoBids();
  return result;
}

function createPatchManager() {
  const CACHE_VERSION = "4";
  const CACHE_PREFIX = `campaign_patch_v${CACHE_VERSION}_`;
  
  return {
    run: () => {
      try {
        UTILS.log("🔧 PatchOptimization: Начинаем обработку");
        
        const targetSheets = UTILS.getTargetSheets();
        if (targetSheets.length === 0) {
          UTILS.log("❌ PatchOptimization: Не найдены целевые листы");
          return { success: false, error: "No target sheets found" };
        }
        
        UTILS.log(`📊 PatchOptimization: Найдено ${targetSheets.length} целевых листов для обработки`);
        
        let allRequests = [];
        for (let i = 0; i < targetSheets.length; i++) {
          const sheet = targetSheets[i];
          UTILS.log(`📋 PatchOptimization: Обрабатываем лист "${sheet.getName()}" (${i + 1}/${targetSheets.length})`);
          const sheetRequests = processSheet(sheet);
          allRequests = allRequests.concat(sheetRequests);
          UTILS.log(`📋 PatchOptimization: Лист "${sheet.getName()}" - найдено ${sheetRequests.length} запросов`);
        }
        
        UTILS.log(`🚀 PatchOptimization: Итого подготовлено ${allRequests.length} запросов`);
        
        if (allRequests.length === 0) {
          UTILS.log("✅ PatchOptimization: Нет запросов для обновления");
          return { success: true, stats: { processed: 0, updated: 0, errors: 0 } };
        }
        
        const result = executeBatchRequests(allRequests);
        UTILS.log(`🎉 PatchOptimization: Завершено. Обработано: ${result.processed}, Обновлено: ${result.updated}, Ошибок: ${result.errors}`);
        return { success: true, stats: result };
        
      } catch (error) {
        UTILS.log(`❌ PatchOptimization: Критическая ошибка - ${error.message}`);
        return { success: false, error: String(error) };
      }
    },
    
    clearCache: () => {
      try {
        const newVersion = parseInt(CACHE_VERSION) + 1;
        UTILS.cache.put(`${CACHE_PREFIX}version`, newVersion.toString());
        return true;
      } catch (error) {
        return false;
      }
    }
  };

  function processSheet(sheet) {
    const sheetName = sheet.getName();
    
    const data = sheet.getDataRange().getValues();
    const backgrounds = sheet.getDataRange().getBackgrounds();
    const headers = data[0];
    
    // Поиск необходимых колонок
    const columnMap = {
      campaignId: UTILS.findColumnIndex(headers, ['campaign id/link', 'campaign id', 'id']),
      status: UTILS.findColumnIndex(headers, ['campaign status', 'status', 'active']),
      optimization: UTILS.findColumnIndex(headers, ['latest optimization value', 'optimization value', 'optimization']),
      dailyBudget: UTILS.findColumnIndex(headers, ['daily budget', 'budget'])
    };
    
    // Проверка наличия необходимых колонок
    const missingColumns = Object.entries(columnMap).filter(([key, idx]) => idx === -1).map(([key]) => key);
    if (missingColumns.length > 0) {
      UTILS.log(`⚠️ PatchOptimization: Лист "${sheetName}" пропущен - отсутствуют колонки: ${missingColumns.join(', ')}`);
      return [];
    }
    
    const requests = [];
    const cacheKeys = [];
    const rowDataMap = new Map();
    let validCampaigns = 0;
    let skippedByBackground = 0;
    let skippedByInvalidId = 0;
    
    // Подготовка данных для кеширования и обработки
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const campaignId = UTILS.extractCampaignId(row[columnMap.campaignId]);
      
      if (!UTILS.isValidId(campaignId)) {
        skippedByInvalidId++;
        continue;
      }
      
      if (!UTILS.isStandardBackground(backgrounds[i][columnMap.campaignId])) {
        skippedByBackground++;
        continue;
      }
      
      validCampaigns++;
      const cacheKey = `${CACHE_PREFIX}${campaignId}`;
      cacheKeys.push(cacheKey);
      
      const payload = createPayload(
        row[columnMap.status],
        row[columnMap.optimization], 
        row[columnMap.dailyBudget]
      );
      
      rowDataMap.set(cacheKey, {
        campaignId,
        payload,
        cacheKey,
        hash: getDataHash(payload)
      });
    }
    
    if (validCampaigns === 0) {
      UTILS.log(`⚠️ PatchOptimization: Лист "${sheetName}" - нет валидных кампаний для обработки`);
      return [];
    }
    
    // Проверка кеша
    const cachedValues = UTILS.cache.getAll(cacheKeys);
    let cachedCount = 0;
    
    for (const cacheKey of cacheKeys) {
      const rowData = rowDataMap.get(cacheKey);
      if (!rowData) continue;
      
      // Проверка кеша
      if (cachedValues[cacheKey]) {
        try {
          const cachedData = JSON.parse(cachedValues[cacheKey]);
          if (cachedData.hash === rowData.hash) {
            cachedCount++;
            continue;
          }
        } catch (e) {}
      }
      
      // Создание запроса
      requests.push({
        url: `${UTILS.CONFIG.BASE_URL_APPGROWTH}/campaigns2/${rowData.campaignId}`,
        method: "patch",
        headers: {
          "Authorization": UTILS.CONFIG.API_TOKEN_APPGROWTH,
          "Content-Type": "application/json"
        },
        payload: JSON.stringify(rowData.payload),
        campaignId: rowData.campaignId,
        cacheKey: rowData.cacheKey,
        originalPayload: rowData.payload,
        hash: rowData.hash
      });
    }
    
    if (cachedCount > 0) {
      UTILS.log(`💾 PatchOptimization: Лист "${sheetName}" - найдено в кеше: ${cachedCount}, новых запросов: ${requests.length}`);
    }
    
    return requests;
  }

  function createPayload(status, optimizationValue, dailyBudget) {
    const payload = {
      active: convertStatusToActive(status)
    };
    
    const parsedOptimization = UTILS.parseNumber(optimizationValue);
    if (parsedOptimization !== null && parsedOptimization >= 0 && parsedOptimization <= 100) {
      payload.optimization_value = parsedOptimization;
    }
    
    const parsedBudget = UTILS.parseNumber(dailyBudget);
    if (parsedBudget !== null && parsedBudget > 0) {
      payload.daily_budget = parsedBudget;
    }
    
    return payload;
  }

  function convertStatusToActive(status) {
    if (!status) return false;
    const statusStr = String(status).trim().toLowerCase();
    return ["running", "active", "true", "1", "on", "enabled"].includes(statusStr);
  }

  function getDataHash(data) {
    const str = JSON.stringify(data, Object.keys(data).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString();
  }

  function executeBatchRequests(requests) {
    if (requests.length === 0) {
      return { processed: 0, updated: 0, errors: 0 };
    }

    UTILS.log(`🚀 PatchOptimization: Начинаем выполнение ${requests.length} запросов`);
    const batchSize = UTILS.CONFIG.BATCH_SIZE;
    const cacheUpdates = {};
    let totalUpdated = 0;
    let totalErrors = 0;
    
    // Разбивка на батчи
    const totalBatches = Math.ceil(requests.length / batchSize);
    UTILS.log(`📦 PatchOptimization: Разбиваем на ${totalBatches} батчей по ${batchSize} запросов`);
    
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      const currentBatch = Math.floor(i / batchSize) + 1;
      
      UTILS.log(`⚡ PatchOptimization: Выполняем батч ${currentBatch}/${totalBatches} (${batch.length} запросов)`);
      
      let batchUpdated = 0;
      let batchErrors = 0;
      
      batch.forEach((request, requestIndex) => {
        const result = UTILS.fetchWithRetry(request.url, {
          method: request.method,
          headers: request.headers,
          payload: request.payload
        });
        
        if (result.success) {
          const cacheData = JSON.stringify({
            payload: request.originalPayload,
            hash: request.hash,
            lastUpdated: new Date().toISOString()
          });
          cacheUpdates[request.cacheKey] = cacheData;
          batchUpdated++;
          totalUpdated++;
        } else {
          batchErrors++;
          totalErrors++;
          if (batchErrors <= 3) { // Логируем только первые 3 ошибки на батч
            UTILS.log(`❌ PatchOptimization: Ошибка для кампании ${request.campaignId}: ${result.error}`);
          }
        }
        
        // Лог прогресса каждые 10 запросов в батче
        if ((requestIndex + 1) % 10 === 0 || requestIndex === batch.length - 1) {
          UTILS.log(`   📊 Батч ${currentBatch}: выполнено ${requestIndex + 1}/${batch.length} запросов`);
        }
      });
      
      UTILS.log(`✅ PatchOptimization: Батч ${currentBatch} завершен - успешно: ${batchUpdated}, ошибок: ${batchErrors}`);
      
      // Пауза между батчами
      if (i + batchSize < requests.length) {
        Utilities.sleep(500);
      }
    }
    
    // Обновление кеша
    if (Object.keys(cacheUpdates).length > 0) {
      UTILS.log(`💾 PatchOptimization: Обновляем кеш для ${Object.keys(cacheUpdates).length} кампаний`);
      UTILS.cache.putAll(cacheUpdates);
    }
    
    UTILS.log(`🎯 PatchOptimization: Итоги выполнения - Всего: ${requests.length}, Успешно: ${totalUpdated}, Ошибок: ${totalErrors}`);
    
    return {
      processed: requests.length,
      updated: totalUpdated,
      errors: totalErrors
    };
  }
}

function clearCampaignCache() {
  const manager = createPatchManager();
  return manager.clearCache();
}