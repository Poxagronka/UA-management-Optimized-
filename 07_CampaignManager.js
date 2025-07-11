// 07_CampaignManager.gs - Объединенный менеджер кампаний
function manageCampaignActions() {
  UTILS.log('🎯 CampManager: Начинаем manageCampaignActions');
  
  const now = new Date();
  const currentHour = now.getHours();
  const timezone = now.toString().match(/GMT[+-]\d{4}/)?.[0] || 'Unknown';
  UTILS.log(`🕐 CampManager: Текущее время: ${now.toISOString()}, Час: ${currentHour}, Timezone: ${timezone}`);
  
  // СТРОГАЯ проверка времени - только после 3:00
  if (currentHour < 3) {
    UTILS.log(`⏰ CampManager: Слишком рано для выполнения (${currentHour}:xx < 3:00). Выход.`);
    return;
  }
  
  UTILS.log('🔄 CampManager: Перезапускаем остановленные кампании');
  restartStoppedCampaigns();
  
  UTILS.log('📊 CampManager: Управляем кампаниями на основе установок (после 3 AM)');
  manageCampaignsBasedOnInstalls();
  
  UTILS.log('✅ CampManager: manageCampaignActions завершен');
}

function stopCampaignIfHighImpressionsOrSpend() {
  UTILS.log('🛑 CampManager: Начинаем stopCampaignIfHighImpressionsOrSpend');
  
  // Добавляем проверку времени для безопасности
  const currentHour = new Date().getHours();
  if (currentHour < 3) {
    UTILS.log(`⏰ CampManager: Функция stopCampaignIfHighImpressionsOrSpend пропущена (${currentHour}:xx < 3:00)`);
    return;
  }
  
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
  
  // КРИТИЧЕСКИ ВАЖНАЯ ПРОВЕРКА ВРЕМЕНИ
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const timeString = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
  
  UTILS.log(`🕐 CampManager: Текущее время: ${now.toISOString()}, Локальное: ${timeString}`);
  
  // СТРОГАЯ проверка - НИ В КОЕМ СЛУЧАЕ не выполнять до 3:00
  if (currentHour < 3) {
    UTILS.log(`❌ CampManager: ЗАПРЕЩЕНО! Остановка по лимиту инсталов разрешена только после 3:00. Текущее время: ${timeString}`);
    UTILS.log(`❌ CampManager: Функция manageCampaignsBasedOnInstalls ПРИНУДИТЕЛЬНО ПРЕРВАНА`);
    return;
  }
  
  UTILS.log(`✅ CampManager: Время проверено - ${timeString} >= 03:00. Продолжаем выполнение.`);
  
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
  const dateTimeFormat = UTILS.formatDate(now, "yyyy-MM-dd HH:mm");
  const today = UTILS.formatDate(now, "yyyy-MM-dd");
  const updates = [];
  
  UTILS.log(`📊 CampManager: Начинаем проверку лимитов инсталов в ${dateTimeFormat}`);
  
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
      UTILS.log(`🛑 CampManager: Кампания ${campaignId} превысила лимит: ${todayInstalls} > ${installLimit}`);
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
    UTILS.log(`✅ CampManager: Остановлено ${campaignsToStop.length} кампаний по лимиту инсталов в ${dateTimeFormat}`);
  } else {
    UTILS.log(`✅ CampManager: Нет кампаний для остановки по лимиту инсталов в ${dateTimeFormat}`);
  }
}

// Утилитарные функции (убираем, так как они могут обходить проверки)
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