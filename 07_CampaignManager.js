// 07_CampaignManager.gs - Объединенный менеджер кампаний
function manageCampaignActions() {
  if (!isAfter1AM()) return;
  
  restartStoppedCampaigns();
  
  if (isAfter3AM()) {
    manageCampaignsBasedOnInstalls();
  }
}

function stopCampaignIfHighImpressionsOrSpend() {
  const sheet = UTILS.getSheet("Planning", UTILS.CONFIG.SPREADSHEET_ID);
  if (!sheet) return;
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  const columnMap = {
    campaignId: UTILS.findColumnIndex(headers, ['campaign id/link']),
    impressions: UTILS.findColumnIndex(headers, ['impressions']),
    spend14d: UTILS.findColumnIndex(headers, ['spend in the last 14 days']),
    cpi14d: UTILS.findColumnIndex(headers, ['average cpi in the last 14 days']),
    impressionsLimit: UTILS.findColumnIndex(headers, ['impressions limit'])
  };
  
  if (Object.values(columnMap).some(idx => idx === -1)) return;
  
  const campaignsToStop = [];
  
  for (let i = 1; i < data.length; i++) {
    const campaignIdCell = sheet.getRange(i + 1, columnMap.campaignId + 1);
    const backgroundColor = campaignIdCell.getBackground();
    
    if (!UTILS.isStandardBackground(backgroundColor)) continue;
    
    const row = data[i];
    const campaignId = UTILS.extractCampaignId(row[columnMap.campaignId]);
    
    if (!UTILS.isValidId(campaignId)) continue;
    
    const impressions = UTILS.parseNumber(row[columnMap.impressions]) || 0;
    const spend = UTILS.parseNumber(row[columnMap.spend14d]) || 0;
    const cpi = UTILS.parseNumber(row[columnMap.cpi14d]) || 0;
    const impressionsLimit = UTILS.parseNumber(row[columnMap.impressionsLimit]) || 2000;
    
    if (impressions > impressionsLimit || (spend > 100 && cpi > 5)) {
      campaignsToStop.push(campaignId);
    }
  }
  
  if (campaignsToStop.length > 0) {
    stopCampaigns(campaignsToStop);
  }
}

function increaseOptimizationUntilActive() {
  main(); // Запуск основного скрипта
  
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
  
  // Создание колонки freeze если её нет
  if (columnMap.freeze === -1) {
    const newCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, newCol).setValue("Optimization Freeze Timestamp");
    columnMap.freeze = newCol - 1;
  }
  
  if (Object.values(columnMap).some(idx => idx === -1)) return;
  
  const now = new Date();
  const formattedNow = UTILS.formatDate(now, "yyyy-MM-dd HH:mm");
  const updates = [];
  
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
        }
      }
    } else {
      if (freezeRaw) {
        updates.push({ row: i + 2, col: columnMap.freeze + 1, value: "" });
      }
    }
  }
  
  UTILS.batchUpdate(sheet, updates);
}

function restartStoppedCampaigns() {
  const sheet = UTILS.getSheet("Bundle Grouped Campaigns", UTILS.CONFIG.SPREADSHEET_ID);
  if (!sheet) return;
  
  const data = sheet.getDataRange().getValues();
  const backgrounds = sheet.getDataRange().getBackgrounds();
  const headers = data[0];
  
  const columnMap = {
    campaignId: UTILS.findColumnIndex(headers, ['campaign id/link']),
    stoppedByLimit: UTILS.findColumnIndex(headers, ['stopped by install limit'])
  };
  
  if (Object.values(columnMap).some(idx => idx === -1)) return;
  
  const today = UTILS.formatDate(new Date(), "yyyy-MM-dd");
  const campaignsToRestart = [];
  
  for (let i = 1; i < data.length; i++) {
    if (!UTILS.isStandardBackground(backgrounds[i][0])) continue;
    
    const campaignId = UTILS.extractCampaignId(data[i][columnMap.campaignId]);
    const stoppedInfo = data[i][columnMap.stoppedByLimit];
    
    if (campaignId && stoppedInfo && String(stoppedInfo).includes("Yes")) {
      const dateMatch = String(stoppedInfo).match(/Yes\s*\((\d{4}-\d{2}-\d{2})/);
      if (dateMatch && dateMatch[1] && dateMatch[1] !== today) {
        campaignsToRestart.push(campaignId);
      } else if (!dateMatch) {
        campaignsToRestart.push(campaignId);
      }
    }
  }
  
  if (campaignsToRestart.length > 0) {
    startCampaigns(campaignsToRestart);
  }
}

function manageCampaignsBasedOnInstalls() {
  const sheet = UTILS.getSheet("Bundle Grouped Campaigns", UTILS.CONFIG.SPREADSHEET_ID);
  if (!sheet) return;
  
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
  }
  
  if (columnMap.campaignId === -1 || columnMap.todayInstalls === -1) return;
  
  const campaignsToStop = [];
  const now = new Date();
  const dateTimeFormat = UTILS.formatDate(now, "yyyy-MM-dd HH:mm");
  const today = UTILS.formatDate(now, "yyyy-MM-dd");
  const updates = [];
  
  for (let i = 1; i < data.length; i++) {
    if (!UTILS.isStandardBackground(backgrounds[i][0])) continue;
    
    const row = data[i];
    const campaignId = UTILS.extractCampaignId(row[columnMap.campaignId]);
    const todayInstalls = UTILS.parseNumber(row[columnMap.todayInstalls]) || 0;
    const status = columnMap.status !== -1 ? row[columnMap.status] : "";
    const stoppedByLimit = columnMap.stoppedByLimit !== -1 ? row[columnMap.stoppedByLimit] : "";
    const installLimit = columnMap.installLimit !== -1 ? 
      (UTILS.parseNumber(row[columnMap.installLimit]) || 100) : 100;
    
    if (!UTILS.isValidId(campaignId)) continue;
    
    // Проверка на уже остановленные сегодня
    if (stoppedByLimit && String(stoppedByLimit).includes("Yes")) {
      const dateMatch = String(stoppedByLimit).match(/Yes\s*\((\d{4}-\d{2}-\d{2})/);
      if (dateMatch && dateMatch[1] === today) continue;
    }
    
    if (todayInstalls > installLimit && (!status || status.toLowerCase() === "running")) {
      campaignsToStop.push(campaignId);
      
      if (columnMap.stoppedByLimit !== -1) {
        updates.push({ row: i + 1, col: columnMap.stoppedByLimit + 1, value: `Yes (${dateTimeFormat})` });
      }
      if (columnMap.status !== -1) {
        updates.push({ row: i + 1, col: columnMap.status + 1, value: "stopped" });
      }
    }
  }
  
  if (campaignsToStop.length > 0) {
    stopCampaigns(campaignsToStop);
    UTILS.batchUpdate(sheet, updates);
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
  campaignIds.forEach(campaignId => {
    patchCampaign(campaignId, { active: false });
  });
}

function startCampaigns(campaignIds) {
  campaignIds.forEach(campaignId => {
    const result = patchCampaign(campaignId, { active: true });
    if (result) {
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