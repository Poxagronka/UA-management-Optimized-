// 23_AutostopImpaired.gs - Автостоп Impaired кампаний
const IMPAIRED_CONFIG = {
  baseUrl: "https://app.appgrowth.com",
  username: "alexander.sakovich",
  password: "eesh9IL8weecheif4phai3wi",
  maxAttempts: 5
};

function loginAndSaveTrickyCampaigns() {
  const startTime = new Date();
  
  const spreadsheet = SpreadsheetApp.openById(UTILS.CONFIG.SPREADSHEET_ID);
  if (!spreadsheet) return;
  
  const campaignsData = fetchTrickyCampaignsData();
  if (!campaignsData || campaignsData.length === 0) return;
  
  const trickyCampaigns = campaignsData.filter(campaign => {
    const title = String(campaign.title || "").toLowerCase();
    return title.includes("tricky");
  });
  
  if (trickyCampaigns.length === 0) return;
  
  writeToAutostopSheet(spreadsheet, trickyCampaigns, campaignsData);
  const executionTime = (new Date() - startTime) / 1000;
  UTILS.log(`Autostop Impaired выполнен за ${executionTime.toFixed(2)} сек.`);
}

function fetchTrickyCampaignsData() {
  for (let attempt = 0; attempt < IMPAIRED_CONFIG.maxAttempts; attempt++) {
    try {
      // Получение страницы логина
      const loginPageRes = UrlFetchApp.fetch(`${IMPAIRED_CONFIG.baseUrl}/auth/`, {
        muteHttpExceptions: true,
        followRedirects: false,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Google-Apps-Script)" }
      });
      
      if (loginPageRes.getResponseCode() !== 200) {
        throw new Error('Login page failed');
      }
      
      const loginPageText = loginPageRes.getContentText();
      const cheerio = Cheerio.load(loginPageText);
      const csrfToken = cheerio('input[name="csrf_token"]').val();
      
      if (!csrfToken) throw new Error('CSRF token not found');
      
      // Извлечение cookies
      const loginHeaders = loginPageRes.getAllHeaders();
      const initialCookies = extractCookies(loginHeaders["Set-Cookie"]);
      
      // Выполнение логина
      const loginResult = performLogin(csrfToken, initialCookies);
      if (!loginResult.success) throw new Error('Login failed');
      
      // Получение страницы кампаний
      const campaignsData = fetchCampaignsPageData(loginResult.cookies);
      if (campaignsData && campaignsData.length > 0) {
        return campaignsData;
      }
      
    } catch (error) {
      UTILS.log(`❌ Попытка ${attempt + 1} неудачна: ${error.message}`);
      if (attempt < IMPAIRED_CONFIG.maxAttempts - 1) {
        Utilities.sleep((attempt + 1) * 5000);
      }
    }
  }
  
  return [];
}

function extractCookies(setCookieHeader) {
  if (!setCookieHeader) return "";
  const cookieArray = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  return cookieArray.map(c => c.split(";")[0]).join("; ");
}

function performLogin(csrfToken, initialCookies) {
  const loginPayload = {
    csrf_token: csrfToken,
    username: IMPAIRED_CONFIG.username,
    password: IMPAIRED_CONFIG.password,
    remember: "y"
  };
  
  const loginOptions = {
    method: "post",
    payload: loginPayload,
    headers: {
      "Cookie": initialCookies,
      "Content-Type": "application/x-www-form-urlencoded",
      "Origin": IMPAIRED_CONFIG.baseUrl,
      "Referer": `${IMPAIRED_CONFIG.baseUrl}/auth/`,
      "User-Agent": "Mozilla/5.0 (compatible; Google-Apps-Script)"
    },
    muteHttpExceptions: true,
    followRedirects: false
  };
  
  const loginRes = UrlFetchApp.fetch(`${IMPAIRED_CONFIG.baseUrl}/auth/`, loginOptions);
  if (loginRes.getResponseCode() !== 302) {
    return { success: false };
  }
  
  // Извлечение session cookies
  const loginHeaders = loginRes.getAllHeaders();
  const loginCookies = loginHeaders["Set-Cookie"] || loginHeaders["set-cookie"];
  
  if (!loginCookies) return { success: false };
  
  let sessionCookie = "", rememberToken = "";
  const cookiesArray = Array.isArray(loginCookies) ? loginCookies : [loginCookies];
  
  for (const cookie of cookiesArray) {
    if (String(cookie).includes("session=")) {
      const match = String(cookie).match(/session=[^;]+/);
      if (match) sessionCookie = match[0];
    }
    if (String(cookie).includes("remember_token=")) {
      const match = String(cookie).match(/remember_token=[^;]+/);
      if (match) rememberToken = match[0];
    }
  }
  
  if (!sessionCookie || !rememberToken) return { success: false };
  
  return { success: true, cookies: `${rememberToken}; ${sessionCookie}` };
}

function fetchCampaignsPageData(cookies) {
  const options = {
    method: "get",
    headers: {
      "Cookie": cookies,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    },
    muteHttpExceptions: true,
    followRedirects: true
  };
  
  // Несколько попыток получения данных
  for (let i = 0; i < 3; i++) {
    const url = `${IMPAIRED_CONFIG.baseUrl}/campaigns/?_nocache=${Date.now()}_${i}`;
    const response = UrlFetchApp.fetch(url, options);
    
    if (response.getResponseCode() === 200) {
      const content = response.getContentText();
      const data = extractAllCampaignsData(content);
      
      if (data && data.length > 0) return data;
    }
    
    Utilities.sleep(UTILS.randomDelay(1000, 2000));
  }
  
  return [];
}

function extractAllCampaignsData(content) {
  const cheerio = Cheerio.load(content);
  let campaignsData = null;
  
  // Поиск данных в скриптах
  cheerio('script').each((index, script) => {
    const scriptContent = cheerio(script).html();
    
    if (scriptContent && scriptContent.includes('window.__DATA__')) {
      try {
        const dataMatch = scriptContent.match(/window\.__DATA__\s*=\s*({.+});/s);
        if (dataMatch && dataMatch[1]) {
          const data = JSON.parse(dataMatch[1]);
          if (data.campaigns && Array.isArray(data.campaigns)) {
            campaignsData = data.campaigns;
            return false; // break
          }
        }
      } catch (e) {
        // Игнорируем ошибки парсинга
      }
    }
  });
  
  return campaignsData || [];
}

function writeToAutostopSheet(spreadsheet, trickyCampaignsData, allCampaignsData) {
  const sheetName = "Autostop_Impaired";
  
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  
  const headers = ["ID", "Impaired ID", "Title", "Impaired Title", "BI URL", "Last Updated"];
  
  // Чтение существующих данных
  const existingCampaignStatuses = {};
  if (sheet.getLastRow() > 1) {
    try {
      const dataRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6);
      const values = dataRange.getDisplayValues();
      const backgrounds = dataRange.getBackgrounds();
      
      for (let i = 0; i < values.length; i++) {
        const campaignId = extractIdFromCell(values[i][0]);
        const impairedId = extractIdFromCell(values[i][1]);
        const wasActive = backgrounds[i][0] !== "#FFCCCC";
        
        if (campaignId && /^\d+$/.test(campaignId)) {
          existingCampaignStatuses[campaignId] = {
            wasActive: wasActive,
            impairedId: impairedId || ""
          };
        }
      }
    } catch (e) {
      // Игнорируем ошибки чтения
    }
  }
  
  // Создание карты impaired кампаний
  const impairedCampaignsMap = {};
  const impairedTitlesMap = {};
  const allImpairedCampaigns = [];
  
  for (const campaign of allCampaignsData) {
    const title = String(campaign.title || "").toLowerCase();
    if (title.includes("pb impair")) {
      allImpairedCampaigns.push({
        id: campaign.id,
        title: campaign.title
      });
      impairedTitlesMap[campaign.id] = campaign.title;
    }
  }
  
  // Поиск связей между кампаниями
  for (const impairedCampaign of allImpairedCampaigns) {
    const relatedMatch = impairedCampaign.title.match(/related\s*=\s*(\d+)/i);
    if (relatedMatch && relatedMatch[1]) {
      const relatedId = relatedMatch[1];
      const trickyCampaign = trickyCampaignsData.find(c => String(c.id) === relatedId);
      if (trickyCampaign) {
        impairedCampaignsMap[relatedId] = impairedCampaign.id;
      }
    }
  }
  
  // Подготовка финальных данных
  const currentTime = new Date();
  const finalData = [];
  const campaignsToStop = [];
  const campaignsToStart = [];
  const currentActiveCampaignIds = new Set();
  
  // Активные кампании
  for (const campaign of trickyCampaignsData) {
    const campaignId = String(campaign.id);
    currentActiveCampaignIds.add(campaignId);
    
    const impairedId = impairedCampaignsMap[campaignId] || "";
    const existingStatus = existingCampaignStatuses[campaignId];
    const finalImpairedId = impairedId || (existingStatus ? existingStatus.impairedId : "");
    
    let impairedTitle = "";
    if (finalImpairedId) {
      impairedTitle = impairedTitlesMap[finalImpairedId] || "";
    }
    
    const biUrl = campaign.bi_url || "";
    const rowData = [
      campaignId,
      finalImpairedId,
      campaign.title || "",
      impairedTitle,
      biUrl ? `=HYPERLINK("${IMPAIRED_CONFIG.baseUrl}${biUrl}", "Link")` : "",
      currentTime
    ];
    
    finalData.push({
      data: rowData,
      isActive: true,
      campaignId: campaignId,
      impairedId: finalImpairedId
    });
    
    // Проверка на необходимость запуска
    if (existingStatus && !existingStatus.wasActive && finalImpairedId) {
      campaignsToStart.push(finalImpairedId);
    }
  }
  
  // Остановленные кампании
  for (const [campaignId, status] of Object.entries(existingCampaignStatuses)) {
    if (!currentActiveCampaignIds.has(campaignId)) {
      const rowData = [
        campaignId,
        status.impairedId,
        `[STOPPED] Campaign ${campaignId}`,
        status.impairedId ? (impairedTitlesMap[status.impairedId] || "") : "",
        "",
        currentTime
      ];
      
      finalData.push({
        data: rowData,
        isActive: false,
        campaignId: campaignId,
        impairedId: status.impairedId
      });
      
      if (status.wasActive && status.impairedId) {
        campaignsToStop.push(status.impairedId);
      }
    }
  }
  
  // Очистка и запись новых данных
  sheet.clear();
  
  // Заголовки
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#4285F4");
  headerRange.setFontColor("#FFFFFF");
  sheet.setFrozenRows(1);
  
  // Данные
  if (finalData.length > 0) {
    const dataValues = finalData.map(row => row.data);
    const dataRange = sheet.getRange(2, 1, dataValues.length, headers.length);
    dataRange.setValues(dataValues);
    
    // Применение фонов и ссылок
    for (let i = 0; i < finalData.length; i++) {
      const row = finalData[i];
      const rowIndex = i + 2;
      
      // Красный фон для неактивных
      if (!row.isActive) {
        sheet.getRange(rowIndex, 1, 1, headers.length).setBackground("#FFCCCC");
      }
      
      // Создание гиперссылок
      if (row.campaignId) {
        const campaignLink = UTILS.createHyperlink(row.campaignId, `${IMPAIRED_CONFIG.baseUrl}/campaigns/${row.campaignId}`);
        sheet.getRange(rowIndex, 1).setRichTextValue(campaignLink);
      }
      
      if (row.impairedId) {
        const impairedLink = UTILS.createHyperlink(row.impairedId, `${IMPAIRED_CONFIG.baseUrl}/campaigns/${row.impairedId}`);
        sheet.getRange(rowIndex, 2).setRichTextValue(impairedLink);
      }
    }
    
    // Форматирование времени
    const timeColumn = sheet.getRange(2, 6, finalData.length, 1);
    timeColumn.setNumberFormat("yyyy-mm-dd hh:mm:ss");
    
    sheet.autoResizeColumns(1, headers.length);
  }
  
  // Обновление статусов кампаний
  if (campaignsToStop.length > 0) {
    updateImpairedCampaignsStatus(campaignsToStop, false);
  }
  
  if (campaignsToStart.length > 0) {
    updateImpairedCampaignsStatus(campaignsToStart, true);
  }
}

function extractIdFromCell(cellValue) {
  if (!cellValue) return '';
  
  const str = String(cellValue);
  if (str.includes('=HYPERLINK')) {
    const match = str.match(/=HYPERLINK\([^,]+,\s*"([^"]+)"\)/);
    if (match) return match[1];
  }
  
  return /^\d+$/.test(str.trim()) ? str.trim() : '';
}

function updateImpairedCampaignsStatus(campaignIds, active) {
  const batchSize = 10;
  const maxRetries = 3;
  
  for (let i = 0; i < campaignIds.length; i += batchSize) {
    const batch = campaignIds.slice(i, i + batchSize);
    
    for (const campaignId of batch) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const result = UTILS.fetchWithRetry(
          `${IMPAIRED_CONFIG.baseUrl}/campaigns2/${campaignId}`,
          {
            method: "patch",
            headers: {
              "Authorization": UTILS.CONFIG.API_TOKEN_APPGROWTH,
              "Content-Type": "application/json"
            },
            payload: JSON.stringify({ active: active })
          }
        );
        
        if (result.success) break;
        
        if (attempt < maxRetries) {
          Utilities.sleep(1000 * attempt);
        }
      }
    }
    
    if (i + batchSize < campaignIds.length) {
      Utilities.sleep(500);
    }
  }
}

function toggleTrickyTrackerTrigger() {
  const triggerName = "loginAndSaveTrickyCampaigns";
  const triggers = ScriptApp.getProjectTriggers();
  
  let existingTrigger = null;
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === triggerName) {
      existingTrigger = trigger;
      break;
    }
  }
  
  if (existingTrigger) {
    ScriptApp.deleteTrigger(existingTrigger);
    return {
      status: "removed",
      message: "Автоматическое выполнение отключено"
    };
  } else {
    ScriptApp.newTrigger(triggerName)
      .timeBased()
      .everyHours(2)
      .create();
    
    return {
      status: "created",
      message: "Автоматическое выполнение включено (каждые 2 часа)"
    };
  }
}