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
  
  const columnMap = {
    campaignId: UTILS.findColumnIndex(headers, ['campaign id/link']),
    impressions: UTILS.findColumnIndex(headers, ['impressions']),
    spend14d: UTILS.findColumnIndex(headers, ['spend in the last 14 days']),
    cpi14d: UTILS.findColumnIndex(headers, ['average cpi in the last 14 days']),
    impressionsLimit: UTILS.findColumnIndex(headers, ['impressions limit'])
  };
  
  if (Object.values(columnMap).some(idx => idx === -1)) {
    UTILS.log('❌ CampManager: Не все необходимые колонки найдены');
    return;
  }
  
  const validRows = UTILS.getValidRows(sheet);
  const campaignsToStop = [];
  
  validRows.forEach(row => {
    const campaignId = UTILS.extractCampaignId(row.data[columnMap.campaignId]);
    if (!UTILS.isValidId(campaignId)) return;
    
    const impressions = UTILS.parseNumber(row.data[columnMap.impressions]) || 0;
    const spend = UTILS.parseNumber(row.data[columnMap.spend14d]) || 0;
    const cpi = UTILS.parseNumber(row.data[columnMap.cpi14d]) || 0;
    const impressionsLimit = UTILS.parseNumber(row.data[columnMap.impressionsLimit]) || 2000;
    
    const highImpressions = impressions > impressionsLimit;
    const highSpendAndCPI = spend > 100 && cpi > 5;
    
    if (highImpressions || highSpendAndCPI) {
      campaignsToStop.push(campaignId);
    }
  });
  
  if (campaignsToStop.length > 0) {
    stopCampaigns(campaignsToStop);
    UTILS.log(`✅ CampManager: Отправлены запросы на остановку ${campaignsToStop.length} кампаний`);
  }
  
  UTILS.log('✅ CampManager: stopCampaignIfHighImpressionsOrSpend завершен');
}

function increaseOptimizationUntilActive() {
  UTILS.log('📈 CampManager: Начинаем increaseOptimizationUntilActive');
  
  const sheet = UTILS.getSheet("Planning", UTILS.CONFIG.SPREADSHEET_ID);
  if (!sheet) return;
  
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
  
  if (columnMap.freeze === -1) {
    const newCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, newCol).setValue("Optimization Freeze Timestamp");
    columnMap.freeze = newCol - 1;
  }
  
  if (Object.values(columnMap).some(idx => idx === -1)) return;
  
  const now = new Date();
  const formattedNow = UTILS.formatDate(now, "yyyy-MM-dd HH:mm");
  const updates = [];
  
  const validRows = UTILS.getValidRows(sheet);
  
  validRows.forEach(row => {
    const campaignId = UTILS.extractCampaignId(row.data[columnMap.campaignId]);
    const status = String(row.data[columnMap.status] || "").trim().toLowerCase();
    const pace = UTILS.parseNumber(row.data[columnMap.pace]) || 0;
    const spend = UTILS.parseNumber(row.data[columnMap.spend]) || 0;
    const pricing = String(row.data[columnMap.pricing] || "").trim();
    const optValue = UTILS.parseNumber(row.data[columnMap.optValue]) || 0;
    const freezeRaw = row.data[columnMap.freeze];
    
    if (status === "running") {
      // Управление freeze timestamp
      if (pace === 0 && spend === 0 && freezeRaw) {
        updates.push({ row: row.index + 1, col: columnMap.freeze + 1, value: "" });
      }
      
      if (pace !== 0 || spend !== 0) {
        if (!freezeRaw || typeof freezeRaw !== "string" || freezeRaw.trim() === "") {
          const freezeInfo = `${formattedNow}|${spend}|${pace}`;
          updates.push({ row: row.index + 1, col: columnMap.freeze + 1, value: freezeInfo });
          return;
        } else {
          const parts = freezeRaw.split("|");
          if (parts.length < 3) {
            const newFreezeInfo = `${formattedNow}|${spend}|${pace}`;
            updates.push({ row: row.index + 1, col: columnMap.freeze + 1, value: newFreezeInfo });
            return;
          }
          
          try {
            const freezeTime = new Date(parts[0]);
            const diff = now - freezeTime;
            
            if (diff < 3 * 3600 * 1000) return;
            
            const freezeSpend = parseFloat(parts[1]) || 0;
            const freezePace = parseFloat(parts[2]) || 0;
            const spendDiff = Math.abs(freezeSpend - spend);
            const paceDiff = Math.abs(freezePace - pace);
            
            if (spendDiff < 0.01 && paceDiff < 0.01) {
              updates.push({ row: row.index + 1, col: columnMap.freeze + 1, value: "" });
            } else {
              updates.push({ row: row.index + 1, col: columnMap.freeze + 1, value: "" });
              return;
            }
          } catch (e) {
            const newFreezeInfo = `${formattedNow}|${spend}|${pace}`;
            updates.push({ row: row.index + 1, col: columnMap.freeze + 1, value: newFreezeInfo });
            return;
          }
        }
      }
      
      // Увеличение оптимизации
      let delta = 0;
      const lowerPricing = pricing.toLowerCase();
      if (lowerPricing.includes("cpm")) delta = 5;
      else if (lowerPricing.includes("cpa")) delta = 1;
      else if (lowerPricing.includes("cpi")) delta = 0.05;
      
      if (delta > 0) {
        const newOptValue = optValue + delta;
        if (patchCampaign(campaignId, { optimization_value: newOptValue })) {
          updates.push({ row: row.index + 1, col: columnMap.optValue + 1, value: newOptValue });
        }
      }
    } else if (freezeRaw) {
      updates.push({ row: row.index + 1, col: columnMap.freeze + 1, value: "" });
    }
  });
  
  if (updates.length > 0) {
    UTILS.batchUpdate(sheet, updates);
  }
  
  UTILS.log('✅ CampManager: increaseOptimizationUntilActive завершен');
}

function restartStoppedCampaigns() {
  UTILS.log('🔄 CampManager: Начинаем restartStoppedCampaigns');
  
  const sheet = UTILS.getSheet("Bundle Grouped Campaigns", UTILS.CONFIG.SPREADSHEET_ID);
  if (!sheet) return;
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  const columnMap = {
    campaignId: UTILS.findColumnIndex(headers, ['campaign id/link']),
    stoppedByLimit: UTILS.findColumnIndex(headers, ['stopped by install limit'])
  };
  
  if (Object.values(columnMap).some(idx => idx === -1)) return;
  
  const validRows = UTILS.getValidRows(sheet);
  const today = UTILS.formatDate(new Date(), "yyyy-MM-dd");
  const campaignsToRestart = [];
  
  validRows.forEach(row => {
    const campaignId = UTILS.extractCampaignId(row.data[columnMap.campaignId]);
    const stoppedInfo = row.data[columnMap.stoppedByLimit];
    
    if (campaignId && stoppedInfo && String(stoppedInfo).includes("Yes")) {
      const dateMatch = String(stoppedInfo).match(/Yes\s*\((\d{4}-\d{2}-\d{2})/);
      if (dateMatch && dateMatch[1] && dateMatch[1] !== today) {
        campaignsToRestart.push(campaignId);
      } else if (!dateMatch) {
        campaignsToRestart.push(campaignId);
      }
    }
  });
  
  if (campaignsToRestart.length > 0) {
    startCampaigns(campaignsToRestart);
    UTILS.log(`✅ CampManager: Отправлены запросы на перезапуск ${campaignsToRestart.length} кампаний`);
  }
}

function manageCampaignsBasedOnInstalls() {
  UTILS.log('📊 CampManager: Начинаем manageCampaignsBasedOnInstalls');
  
  // ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА ВРЕМЕНИ для безопасности
  const currentHour = new Date().getHours();
  if (currentHour < 3) {
    UTILS.log(`⏰ CampManager: Слишком рано для остановки по лимиту инсталов (${currentHour}:xx < 3:00)`);
    return;
  }
  
  const sheet = UTILS.getSheet("Bundle Grouped Campaigns", UTILS.CONFIG.SPREADSHEET_ID);
  if (!sheet) return;
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  const columnMap = {
    campaignId: UTILS.findColumnIndex(headers, ['campaign id/link']),
    todayInstalls: UTILS.findColumnIndex(headers, ['today installs']),
    status: UTILS.findColumnIndex(headers, ['campaign status']),
    stoppedByLimit: UTILS.findColumnIndex(headers, ['stopped by install limit']),
    installLimit: UTILS.findColumnIndex(headers, ['install limit'])
  };
  
  if (columnMap.stoppedByLimit === -1) {
    const lastColumn = sheet.getLastColumn();
    sheet.getRange(1, lastColumn + 1).setValue("Stopped by install limit");
    columnMap.stoppedByLimit = lastColumn;
  }
  
  if (columnMap.campaignId === -1 || columnMap.todayInstalls === -1) return;
  
  const validRows = UTILS.getValidRows(sheet);
  const campaignsToStop = [];
  const now = new Date();
  const dateTimeFormat = UTILS.formatDate(now, "yyyy-MM-dd HH:mm");
  const today = UTILS.formatDate(now, "yyyy-MM-dd");
  const updates = [];
  
  validRows.forEach(row => {
    const campaignId = UTILS.extractCampaignId(row.data[columnMap.campaignId]);
    const todayInstalls = UTILS.parseNumber(row.data[columnMap.todayInstalls]) || 0;
    const status = columnMap.status !== -1 ? row.data[columnMap.status] : "";
    const stoppedByLimit = columnMap.stoppedByLimit !== -1 ? row.data[columnMap.stoppedByLimit] : "";
    const installLimit = columnMap.installLimit !== -1 ? 
      (UTILS.parseNumber(row.data[columnMap.installLimit]) || 100) : 100;
    
    if (!UTILS.isValidId(campaignId)) return;
    
    // Проверка на уже остановленные сегодня
    if (stoppedByLimit && String(stoppedByLimit).includes("Yes")) {
      const dateMatch = String(stoppedByLimit).match(/Yes\s*\((\d{4}-\d{2}-\d{2})/);
      if (dateMatch && dateMatch[1] === today) return;
    }
    
    if (todayInstalls > installLimit && (!status || status.toLowerCase() === "running")) {
      campaignsToStop.push(campaignId);
      
      if (columnMap.stoppedByLimit !== -1) {
        updates.push({ row: row.index + 1, col: columnMap.stoppedByLimit + 1, value: `Yes (${dateTimeFormat})` });
      }
      if (columnMap.status !== -1) {
        updates.push({ row: row.index + 1, col: columnMap.status + 1, value: "stopped" });
      }
    }
  });
  
  UTILS.log(`📊 CampManager: К остановке по лимиту инсталов: ${campaignsToStop.length}`);
  
  if (campaignsToStop.length > 0) {
    stopCampaigns(campaignsToStop);
    if (updates.length > 0) {
      UTILS.batchUpdate(sheet, updates);
    }
    UTILS.log(`✅ CampManager: Остановлено ${campaignsToStop.length} кампаний по лимиту инсталов`);
  }
}

// Утилитарные функции
function isAfter1AM() {
  return new Date().getHours() >= 1;
}

function isAfter3AM() {
  return new Date().getHours() >= 3;
}

function stopCampaigns(campaignIds) {
  UTILS.log(`🛑 CampManager: Останавливаем ${campaignIds.length} кампаний`);
  
  campaignIds.forEach(campaignId => {
    patchCampaign(campaignId, { active: false });
  });
}

function startCampaigns(campaignIds) {
  UTILS.log(`🔄 CampManager: Запускаем ${campaignIds.length} кампаний`);
  
  campaignIds.forEach(campaignId => {
    if (patchCampaign(campaignId, { active: true })) {
      updateCampaignStatus(campaignId, "running");
      updateStoppedByLimitStatus(campaignId, "No");
    }
  });
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
  const headers = data[0];
  
  const campaignIdCol = UTILS.findColumnIndex(headers, ['campaign id/link']);
  const fieldCol = UTILS.findColumnIndex(headers, [fieldName.toLowerCase()]);
  
  if (campaignIdCol === -1 || fieldCol === -1) return;
  
  const validRows = UTILS.getValidRows(sheet);
  
  for (const row of validRows) {
    const rowCampaignId = UTILS.extractCampaignId(row.data[campaignIdCol]);
    if (rowCampaignId && rowCampaignId === campaignId) {
      sheet.getRange(row.index + 1, fieldCol + 1).setValue(value);
      return;
    }
  }
}