// 07_CampaignManager.gs - Объединенный менеджер кампаний
function manageCampaignActions() {
  UTILS.log('🎯 CampManager: Начинаем manageCampaignActions');
  
  const currentHour = new Date().getHours();
  UTILS.log(`🕐 CampManager: Текущий час: ${currentHour}`);
  
  if (!isAfter1AM()) {
    UTILS.log('⏰ CampManager: Слишком рано для выполнения (до 1 AM)');
    return;
  }
  
  UTILS.log('🔄 CampManager: Перезапускаем остановленные кампании');
  restartStoppedCampaigns();
  
  if (isAfter3AM()) {
    UTILS.log('📊 CampManager: Управляем кампаниями на основе установок (после 3 AM)');
    manageCampaignsBasedOnInstalls();
  } else {
    UTILS.log('⏰ CampManager: Слишком рано для управления установками (до 3 AM)');
  }
  
  UTILS.log('✅ CampManager: manageCampaignActions завершен');
}

function stopCampaignIfHighImpressionsOrSpend() {
  UTILS.log('🛑 CampManager: Начинаем stopCampaignIfHighImpressionsOrSpend');
  
  const sheet = UTILS.getSheet("Planning", UTILS.CONFIG.SPREADSHEET_ID);
  if (!sheet) {
    UTILS.log('❌ CampManager: Лист Planning не найден');
    return;
  }
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  UTILS.log(`📊 CampManager: Найдено ${data.length - 1} строк данных для анализа`);
  
  const columnMap = {
    campaignId: UTILS.findColumnIndex(headers, ['campaign id/link']),
    impressions: UTILS.findColumnIndex(headers, ['impressions']),
    spend14d: UTILS.findColumnIndex(headers, ['spend in the last 14 days']),
    cpi14d: UTILS.findColumnIndex(headers, ['average cpi in the last 14 days']),
    impressionsLimit: UTILS.findColumnIndex(headers, ['impressions limit'])
  };
  
  const foundColumns = Object.entries(columnMap).filter(([key, idx]) => idx !== -1);
  UTILS.log(`🔍 CampManager: Найдены колонки: ${foundColumns.map(([key, idx]) => `${key}:${idx}`).join(', ')}`);
  
  if (Object.values(columnMap).some(idx => idx === -1)) {
    UTILS.log('❌ CampManager: Не все необходимые колонки найдены');
    return;
  }
  
  const campaignsToStop = [];
  let checkedCampaigns = 0, skippedByBackground = 0, skippedByInvalidId = 0;
  
  for (let i = 1; i < data.length; i++) {
    const campaignIdCell = sheet.getRange(i + 1, columnMap.campaignId + 1);
    const backgroundColor = campaignIdCell.getBackground();
    
    if (!UTILS.isStandardBackground(backgroundColor)) {
      skippedByBackground++;
      continue;
    }
    
    const row = data[i];
    const campaignId = UTILS.extractCampaignId(row[columnMap.campaignId]);
    
    if (!UTILS.isValidId(campaignId)) {
      skippedByInvalidId++;
      continue;
    }
    
    const impressions = UTILS.parseNumber(row[columnMap.impressions]) || 0;
    const spend = UTILS.parseNumber(row[columnMap.spend14d]) || 0;
    const cpi = UTILS.parseNumber(row[columnMap.cpi14d]) || 0;
    const impressionsLimit = UTILS.parseNumber(row[columnMap.impressionsLimit]) || 2000;
    
    checkedCampaigns++;
    
    // Проверка условий остановки
    const highImpressions = impressions > impressionsLimit;
    const highSpendAndCPI = spend > 100 && cpi > 5;
    
    if (highImpressions || highSpendAndCPI) {
      campaignsToStop.push({
        id: campaignId,
        reason: highImpressions ? `impressions (${impressions} > ${impressionsLimit})` : `spend/CPI (${spend}/${cpi})`,
        impressions,
        spend,
        cpi
      });
    }
  }
  
  UTILS.log(`📊 CampManager: Статистика проверки - Проверено: ${checkedCampaigns}, Пропущено по фону: ${skippedByBackground}, Невалидные ID: ${skippedByInvalidId}`);
  UTILS.log(`🛑 CampManager: Найдено кампаний для остановки: ${campaignsToStop.length}`);
  
  if (campaignsToStop.length > 0) {
    campaignsToStop.forEach(campaign => {
      UTILS.log(`🛑 CampManager: Останавливаем кампанию ${campaign.id} - причина: ${campaign.reason}`);
    });
    
    const campaignIds = campaignsToStop.map(c => c.id);
    stopCampaigns(campaignIds);
    
    UTILS.log(`✅ CampManager: Отправлены запросы на остановку ${campaignIds.length} кампаний`);
  } else {
    UTILS.log('✅ CampManager: Нет кампаний для остановки');
  }
  
  UTILS.log('✅ CampManager: stopCampaignIfHighImpressionsOrSpend завершен');
}

function increaseOptimizationUntilActive() {
  UTILS.log('📈 CampManager: Начинаем increaseOptimizationUntilActive');
  
  main(); // Запуск основного скрипта
  
  const sheet = UTILS.getSheet("Planning", UTILS.CONFIG.SPREADSHEET_ID);
  if (!sheet) {
    UTILS.log('❌ CampManager: Лист Planning не найден');
    return;
  }
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  const columnMap = {
    campaignId: UTILS.findColumnIndex(headers, ['campaign id/link']),
    status: UTILS.findColumnIndex(headers, ['campaign status']),
    pace: UTILS.findColumnIndex(headers, ['pace']),
    spend: UTILS.findColumnIndex(headers, ['spend in the last 14 days']),
    pricing: UTILS.findColumnIndex(headers, ['optimization']),
    optValue: UTILS.findColumnIndex(headers, ['latest optimization value']),
    freeze: UTILS.findColumnIndex(headers, ['optimization freeze timestamp'])
  };
  
  // Создание колонки freeze если её нет
  if (columnMap.freeze === -1) {
    const newCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, newCol).setValue("Optimization Freeze Timestamp");
    columnMap.freeze = newCol - 1;
    UTILS.log(`📝 CampManager: Создана новая колонка Freeze Timestamp в позиции ${newCol}`);
  }
  
  if (Object.values(columnMap).some(idx => idx === -1)) {
    UTILS.log('❌ CampManager: Не все необходимые колонки найдены');
    return;
  }
  
  const now = new Date();
  const formattedNow = UTILS.formatDate(now, "yyyy-MM-dd HH:mm");
  const updates = [];
  let processedCampaigns = 0, increasedOptimization = 0;
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const campaignId = UTILS.extractCampaignId(row[columnMap.campaignId]);
    const status = String(row[columnMap.status] || "").trim().toLowerCase();
    const pace = UTILS.parseNumber(row[columnMap.pace]) || 0;
    const spend = UTILS.parseNumber(row[columnMap.spend]) || 0;
    const pricing = String(row[columnMap.pricing] || "").trim();
    const optValue = UTILS.parseNumber(row[columnMap.optValue]) || 0;
    const freezeRaw = row[columnMap.freeze];
    
    if (status === "running") {
      processedCampaigns++;
      
      // Логика управления freeze timestamp
      if (pace === 0 && spend === 0 && freezeRaw) {
        updates.push({ row: i + 2, col: columnMap.freeze + 1, value: "" });
      }
      
      if (pace !== 0 || spend !== 0) {
        if (!freezeRaw || typeof freezeRaw !== "string" || freezeRaw.trim() === "") {
          const freezeInfo = `${formattedNow}|${spend}|${pace}`;
          updates.push({ row: i + 2, col: columnMap.freeze + 1, value: freezeInfo });
          continue;
        } else {
          const parts = freezeRaw.split("|");
          if (parts.length < 3) {
            const newFreezeInfo = `${formattedNow}|${spend}|${pace}`;
            updates.push({ row: i + 2, col: columnMap.freeze + 1, value: newFreezeInfo });
            continue;
          }
          
          try {
            const freezeTime = new Date(parts[0]);
            const diff = now - freezeTime;
            
            if (diff < 3 * 3600 * 1000) continue; // Менее 3 часов
            
            const freezeSpend = parseFloat(parts[1]) || 0;
            const freezePace = parseFloat(parts[2]) || 0;
            const spendDiff = Math.abs(freezeSpend - spend);
            const paceDiff = Math.abs(freezePace - pace);
            
            if (spendDiff < 0.01 && paceDiff < 0.01) {
              updates.push({ row: i + 2, col: columnMap.freeze + 1, value: "" });
            } else {
              updates.push({ row: i + 2, col: columnMap.freeze + 1, value: "" });
              continue;
            }
          } catch (e) {
            const newFreezeInfo = `${formattedNow}|${spend}|${pace}`;
            updates.push({ row: i + 2, col: columnMap.freeze + 1, value: newFreezeInfo });
            continue;
          }
        }
      }
      
      // Логика увеличения оптимизации
      let delta = 0;
      const lowerPricing = pricing.toLowerCase();
      if (lowerPricing.includes("cpm")) delta = 5;
      else if (lowerPricing.includes("cpa")) delta = 1;
      else if (lowerPricing.includes("cpi")) delta = 0.05;
      
      if (delta > 0) {
        const newOptValue = optValue + delta;
        const patchSuccess = patchCampaign(campaignId, { optimization_value: newOptValue });
        if (patchSuccess) {
          updates.push({ row: i + 2, col: columnMap.optValue + 1, value: newOptValue });
          increasedOptimization++;
        }
      }
    } else {
      if (freezeRaw) {
        updates.push({ row: i + 2, col: columnMap.freeze + 1, value: "" });
      }
    }
  }
  
  UTILS.log(`📊 CampManager: Обработано кампаний: ${processedCampaigns}, Увеличена оптимизация: ${increasedOptimization}`);
  
  if (updates.length > 0) {
    UTILS.batchUpdate(sheet, updates);
    UTILS.log(`✅ CampManager: Применено ${updates.length} обновлений`);
  }
  
  UTILS.log('✅ CampManager: increaseOptimizationUntilActive завершен');
}

function restartStoppedCampaigns() {
  UTILS.log('🔄 CampManager: Начинаем restartStoppedCampaigns');
  
  const sheet = UTILS.getSheet("Bundle Grouped Campaigns", UTILS.CONFIG.SPREADSHEET_ID);
  if (!sheet) {
    UTILS.log('❌ CampManager: Лист Bundle Grouped Campaigns не найден');
    return;
  }
  
  const data = sheet.getDataRange().getValues();
  const backgrounds = sheet.getDataRange().getBackgrounds();
  const headers = data[0];
  
  const columnMap = {
    campaignId: UTILS.findColumnIndex(headers, ['campaign id/link']),
    stoppedByLimit: UTILS.findColumnIndex(headers, ['stopped by install limit'])
  };
  
  if (Object.values(columnMap).some(idx => idx === -1)) {
    UTILS.log(`❌ CampManager: Не найдены необходимые колонки - Campaign ID: ${columnMap.campaignId}, Stopped: ${columnMap.stoppedByLimit}`);
    return;
  }
  
  UTILS.log(`🔍 CampManager: Найдены колонки - Campaign ID: ${columnMap.campaignId}, Stopped: ${columnMap.stoppedByLimit}`);
  
  const today = UTILS.formatDate(new Date(), "yyyy-MM-dd");
  const campaignsToRestart = [];
  let checkedCampaigns = 0, skippedByBackground = 0;
  
  for (let i = 1; i < data.length; i++) {
    if (!UTILS.isStandardBackground(backgrounds[i][0])) {
      skippedByBackground++;
      continue;
    }
    
    const campaignId = UTILS.extractCampaignId(data[i][columnMap.campaignId]);
    const stoppedInfo = data[i][columnMap.stoppedByLimit];
    
    checkedCampaigns++;
    
    if (campaignId && stoppedInfo && String(stoppedInfo).includes("Yes")) {
      const dateMatch = String(stoppedInfo).match(/Yes\s*\((\d{4}-\d{2}-\d{2})/);
      if (dateMatch && dateMatch[1] && dateMatch[1] !== today) {
        campaignsToRestart.push({
          id: campaignId,
          stopDate: dateMatch[1],
          reason: 'stopped_yesterday'
        });
      } else if (!dateMatch) {
        campaignsToRestart.push({
          id: campaignId,
          reason: 'no_date_info'
        });
      }
    }
  }
  
  UTILS.log(`📊 CampManager: Статистика - Проверено: ${checkedCampaigns}, Пропущено по фону: ${skippedByBackground}`);
  UTILS.log(`🔄 CampManager: Найдено кампаний для перезапуска: ${campaignsToRestart.length}`);
  
  if (campaignsToRestart.length > 0) {
    campaignsToRestart.forEach(campaign => {
      UTILS.log(`🔄 CampManager: Перезапускаем кампанию ${campaign.id} - причина: ${campaign.reason}${campaign.stopDate ? ` (остановлена ${campaign.stopDate})` : ''}`);
    });
    
    const campaignIds = campaignsToRestart.map(c => c.id);
    startCampaigns(campaignIds);
    
    UTILS.log(`✅ CampManager: Отправлены запросы на перезапуск ${campaignIds.length} кампаний`);
  } else {
    UTILS.log('✅ CampManager: Нет кампаний для перезапуска');
  }
}

function manageCampaignsBasedOnInstalls() {
  UTILS.log('📊 CampManager: Начинаем manageCampaignsBasedOnInstalls');
  
  const sheet = UTILS.getSheet("Bundle Grouped Campaigns", UTILS.CONFIG.SPREADSHEET_ID);
  if (!sheet) {
    UTILS.log('❌ CampManager: Лист Bundle Grouped Campaigns не найден');
    return;
  }
  
  const data = sheet.getDataRange().getValues();
  const backgrounds = sheet.getDataRange().getBackgrounds();
  const headers = data[0];
  
  const columnMap = {
    campaignId: UTILS.findColumnIndex(headers, ['campaign id/link']),
    todayInstalls: UTILS.findColumnIndex(headers, ['today installs']),
    status: UTILS.findColumnIndex(headers, ['campaign status']),
    stoppedByLimit: UTILS.findColumnIndex(headers, ['stopped by install limit']),
    installLimit: UTILS.findColumnIndex(headers, ['install limit'])
  };
  
  // Создание колонки если её нет
  if (columnMap.stoppedByLimit === -1) {
    const lastColumn = sheet.getLastColumn();
    sheet.getRange(1, lastColumn + 1).setValue("Stopped by install limit");
    columnMap.stoppedByLimit = lastColumn;
    UTILS.log(`📝 CampManager: Создана новая колонка Stopped by install limit в позиции ${lastColumn + 1}`);
  }
  
  if (columnMap.campaignId === -1 || columnMap.todayInstalls === -1) {
    UTILS.log(`❌ CampManager: Не найдены обязательные колонки - Campaign ID: ${columnMap.campaignId}, Today Installs: ${columnMap.todayInstalls}`);
    return;
  }
  
  const campaignsToStop = [];
  const now = new Date();
  const dateTimeFormat = UTILS.formatDate(now, "yyyy-MM-dd HH:mm");
  const today = UTILS.formatDate(now, "yyyy-MM-dd");
  const updates = [];
  
  let checkedCampaigns = 0, skippedByBackground = 0, alreadyStopped = 0;
  
  for (let i = 1; i < data.length; i++) {
    if (!UTILS.isStandardBackground(backgrounds[i][0])) {
      skippedByBackground++;
      continue;
    }
    
    const row = data[i];
    const campaignId = UTILS.extractCampaignId(row[columnMap.campaignId]);
    const todayInstalls = UTILS.parseNumber(row[columnMap.todayInstalls]) || 0;
    const status = columnMap.status !== -1 ? row[columnMap.status] : "";
    const stoppedByLimit = columnMap.stoppedByLimit !== -1 ? row[columnMap.stoppedByLimit] : "";
    const installLimit = columnMap.installLimit !== -1 ? 
      (UTILS.parseNumber(row[columnMap.installLimit]) || 100) : 100;
    
    if (!UTILS.isValidId(campaignId)) continue;
    
    checkedCampaigns++;
    
    // Проверка на уже остановленные сегодня
    if (stoppedByLimit && String(stoppedByLimit).includes("Yes")) {
      const dateMatch = String(stoppedByLimit).match(/Yes\s*\((\d{4}-\d{2}-\d{2})/);
      if (dateMatch && dateMatch[1] === today) {
        alreadyStopped++;
        continue;
      }
    }
    
    if (todayInstalls > installLimit && (!status || status.toLowerCase() === "running")) {
      campaignsToStop.push({
        id: campaignId,
        installs: todayInstalls,
        limit: installLimit,
        rowIndex: i + 1
      });
      
      if (columnMap.stoppedByLimit !== -1) {
        updates.push({ row: i + 1, col: columnMap.stoppedByLimit + 1, value: `Yes (${dateTimeFormat})` });
      }
      if (columnMap.status !== -1) {
        updates.push({ row: i + 1, col: columnMap.status + 1, value: "stopped" });
      }
    }
  }
  
  UTILS.log(`📊 CampManager: Статистика - Проверено: ${checkedCampaigns}, Пропущено по фону: ${skippedByBackground}, Уже остановлено: ${alreadyStopped}`);
  UTILS.log(`🛑 CampManager: Найдено кампаний для остановки по лимиту установок: ${campaignsToStop.length}`);
  
  if (campaignsToStop.length > 0) {
    campaignsToStop.forEach(campaign => {
      UTILS.log(`🛑 CampManager: Останавливаем кампанию ${campaign.id} - установок: ${campaign.installs} > лимит: ${campaign.limit}`);
    });
    
    const campaignIds = campaignsToStop.map(c => c.id);
    stopCampaigns(campaignIds);
    
    if (updates.length > 0) {
      UTILS.batchUpdate(sheet, updates);
      UTILS.log(`✅ CampManager: Обновлено статусов в таблице: ${updates.length}`);
    }
    
    UTILS.log(`✅ CampManager: Отправлены запросы на остановку ${campaignIds.length} кампаний`);
  } else {
    UTILS.log('✅ CampManager: Нет кампаний для остановки по лимиту установок');
  }
}

// Утилитарные функции
function isAfter1AM() {
  const now = new Date();
  return now.getHours() >= 1;
}

function isAfter3AM() {
  const now = new Date();
  return now.getHours() >= 3;
}

function stopCampaigns(campaignIds) {
  UTILS.log(`🛑 CampManager: Останавливаем ${campaignIds.length} кампаний`);
  
  let successCount = 0, errorCount = 0;
  
  campaignIds.forEach(campaignId => {
    const success = patchCampaign(campaignId, { active: false });
    if (success) {
      successCount++;
    } else {
      errorCount++;
    }
  });
  
  UTILS.log(`📊 CampManager: Остановка завершена - Успешно: ${successCount}, Ошибок: ${errorCount}`);
}

function startCampaigns(campaignIds) {
  UTILS.log(`🔄 CampManager: Запускаем ${campaignIds.length} кампаний`);
  
  let successCount = 0, errorCount = 0;
  
  campaignIds.forEach(campaignId => {
    const result = patchCampaign(campaignId, { active: true });
    if (result) {
      updateCampaignStatus(campaignId, "running");
      updateStoppedByLimitStatus(campaignId, "No");
      successCount++;
    } else {
      errorCount++;
    }
  });
  
  UTILS.log(`📊 CampManager: Запуск завершен - Успешно: ${successCount}, Ошибок: ${errorCount}`);
}

function patchCampaign(campaignId, payload) {
  const result = UTILS.fetchWithRetry(
    `${UTILS.CONFIG.BASE_URL_APPGROWTH}/campaigns2/${campaignId}`,
    {
      method: "patch",
      headers: {
        "Authorization": UTILS.CONFIG.API_TOKEN_APPGROWTH,
        "Content-Type": "application/json"
      },
      payload: JSON.stringify(payload)
    }
  );
  return result.success;
}

function updateCampaignStatus(campaignId, status) {
  updateCampaignField(campaignId, 'campaign status', status);
}

function updateStoppedByLimitStatus(campaignId, value) {
  updateCampaignField(campaignId, 'stopped by install limit', value);
}

function updateCampaignField(campaignId, fieldName, value) {
  const sheet = UTILS.getSheet("Bundle Grouped Campaigns", UTILS.CONFIG.SPREADSHEET_ID);
  if (!sheet) return;
  
  const data = sheet.getDataRange().getValues();
  const backgrounds = sheet.getDataRange().getBackgrounds();
  const headers = data[0];
  
  const campaignIdCol = UTILS.findColumnIndex(headers, ['campaign id/link']);
  const fieldCol = UTILS.findColumnIndex(headers, [fieldName.toLowerCase()]);
  
  if (campaignIdCol === -1 || fieldCol === -1) return;
  
  for (let i = 1; i < data.length; i++) {
    if (!UTILS.isStandardBackground(backgrounds[i][0])) continue;
    
    const rowCampaignId = UTILS.extractCampaignId(data[i][campaignIdCol]);
    if (rowCampaignId && rowCampaignId === campaignId) {
      sheet.getRange(i + 1, fieldCol + 1).setValue(value);
      return;
    }
  }
}