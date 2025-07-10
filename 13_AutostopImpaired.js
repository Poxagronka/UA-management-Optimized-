// 13_AutostopImpaired.js - Автостоп Impaired кампаний
const IMPAIRED_CONFIG = {
  baseUrl: "https://app.appgrowth.com",
  username: "alexander.sakovich",
  password: "eesh9IL8weecheif4phai3wi",
  maxAttempts: 3
};

function loginAndSaveTrickyCampaigns() {
  UTILS.log('🎯 Impaired: Начинаем loginAndSaveTrickyCampaigns');
  
  const spreadsheet = SpreadsheetApp.openById(UTILS.CONFIG.SPREADSHEET_ID);
  if (!spreadsheet) {
    UTILS.log('❌ Impaired: Не удалось открыть таблицу');
    return;
  }
  
  const campaignsData = fetchTrickyCampaignsData();
  if (!campaignsData || campaignsData.length === 0) {
    UTILS.log('❌ Impaired: Не удалось получить данные кампаний');
    return;
  }
  
  const trickyCampaigns = campaignsData.filter(campaign => {
    const title = String(campaign.title || "").toLowerCase();
    return title.includes("tricky");
  });
  
  UTILS.log(`🎯 Impaired: Найдено ${trickyCampaigns.length} tricky кампаний`);
  
  if (trickyCampaigns.length === 0) {
    UTILS.log('⚠️ Impaired: Нет tricky кампаний для обработки');
    return;
  }
  
  writeToAutostopSheet(spreadsheet, trickyCampaigns, campaignsData);
  UTILS.log('✅ Impaired: Автостоп выполнен');
}

function fetchTrickyCampaignsData() {
  UTILS.log('🔐 Impaired: Начинаем аутентификацию');
  
  for (let attempt = 0; attempt < IMPAIRED_CONFIG.maxAttempts; attempt++) {
    try {
      UTILS.log(`🔄 Impaired: Попытка ${attempt + 1}/${IMPAIRED_CONFIG.maxAttempts}`);
      
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
      const csrfToken = extractCSRFToken(loginPageText);
      if (!csrfToken) {
        throw new Error('CSRF token not found');
      }
      
      // Извлечение cookies
      const loginHeaders = loginPageRes.getAllHeaders();
      const initialCookies = extractCookies(loginHeaders["Set-Cookie"]);
      
      // Выполнение логина
      const loginResult = performLogin(csrfToken, initialCookies);
      if (!loginResult.success) {
        throw new Error('Login failed');
      }
      
      // Получение страницы кампаний
      const campaignsData = fetchCampaignsPageData(loginResult.cookies);
      if (campaignsData && campaignsData.length > 0) {
        UTILS.log(`📦 Impaired: Получено ${campaignsData.length} кампаний`);
        return campaignsData;
      }
      
    } catch (error) {
      UTILS.log(`❌ Impaired: Попытка ${attempt + 1} неудачна: ${error.message}`);
      if (attempt < IMPAIRED_CONFIG.maxAttempts - 1) {
        Utilities.sleep((attempt + 1) * 2000);
      }
    }
  }
  
  return [];
}

function extractCSRFToken(html) {
  const patterns = [
    /name=["']csrf_token["']\s+value=["']([^"']+)["']/i,
    /value=["']([^"']+)["']\s+name=["']csrf_token["']/i,
    /<input[^>]+name=["']csrf_token["'][^>]+value=["']([^"']+)["']/i
  ];
  
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function extractCookies(setCookieHeader) {
  if (!setCookieHeader) return "";
  const cookieArray = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  return cookieArray.map(c => c.split(";")[0]).join("; ");
}

function performLogin(csrfToken, initialCookies) {
  const loginOptions = {
    method: "post",
    payload: {
      csrf_token: csrfToken,
      username: IMPAIRED_CONFIG.username,
      password: IMPAIRED_CONFIG.password,
      remember: "y"
    },
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
  
  const loginHeaders = loginRes.getAllHeaders();
  const loginCookies = loginHeaders["Set-Cookie"] || loginHeaders["set-cookie"];
  
  if (!loginCookies) {
    return { success: false };
  }
  
  let sessionCookie = "", rememberToken = "";
  const cookiesArray = Array.isArray(loginCookies) ? loginCookies : [loginCookies];
  
  for (const cookie of cookiesArray) {
    const cookieStr = String(cookie);
    if (cookieStr.includes("session=")) {
      const match = cookieStr.match(/session=[^;]+/);
      if (match) sessionCookie = match[0];
    }
    if (cookieStr.includes("remember_token=")) {
      const match = cookieStr.match(/remember_token=[^;]+/);
      if (match) rememberToken = match[0];
    }
  }
  
  if (!sessionCookie || !rememberToken) {
    return { success: false };
  }
  
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
  
  for (let i = 0; i < 3; i++) {
    const url = `${IMPAIRED_CONFIG.baseUrl}/campaigns/?_nocache=${Date.now()}_${i}`;
    const response = UrlFetchApp.fetch(url, options);
    
    if (response.getResponseCode() === 200) {
      const content = response.getContentText();
      UTILS.log(`📄 Impaired: Получен ответ (${content.length} символов)`);
      
      const data = extractCampaignsData(content);
      if (data && data.length > 0) {
        return data;
      }
    }
    
    if (i < 2) Utilities.sleep(1000);
  }
  
  return [];
}

function extractCampaignsData(content) {
  // Метод 1: Поиск window.__DATA__
  const dataMatch = content.match(/window\.__DATA__\s*=\s*({.+?});/s);
  if (dataMatch) {
    try {
      const data = JSON.parse(dataMatch[1]);
      if (data.campaigns && Array.isArray(data.campaigns)) {
        return data.campaigns;
      }
    } catch (e) {}
  }
  
  // Метод 2: Поиск в script тегах
  const scriptMatches = content.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
  if (scriptMatches) {
    for (const script of scriptMatches) {
      const scriptContent = script.replace(/<\/?script[^>]*>/gi, '');
      if (!scriptContent.includes('campaigns')) continue;
      
      // Поиск массива кампаний
      const patterns = [
        /campaigns['"]\s*:\s*(\[[^\]]+\])/g,
        /\[\s*({[^{}]*"id"\s*:\s*\d+[^{}]*},?\s*)+\]/g
      ];
      
      for (const pattern of patterns) {
        const matches = scriptContent.match(pattern);
        if (matches) {
          for (const match of matches) {
            try {
              let jsonStr = match.replace(/^campaigns['"]\s*:\s*/, '');
              const parsed = JSON.parse(jsonStr);
              if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed;
              }
            } catch (e) {}
          }
        }
      }
    }
  }
  
  return [];
}

function writeToAutostopSheet(spreadsheet, trickyCampaigns, allCampaigns) {
  const sheetName = "Autostop_Impaired";
  let sheet = spreadsheet.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  
  const headers = ["ID", "Impaired ID", "Title", "Impaired Title", "BI URL", "Last Updated"];
  
  // Чтение существующих данных
  const existingData = {};
  if (sheet.getLastRow() > 1) {
    try {
      const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
      const backgrounds = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getBackgrounds();
      
      values.forEach((row, i) => {
        const campaignId = String(row[0] || "").replace(/.*"([^"]+)".*/, "$1");
        const impairedId = String(row[1] || "").replace(/.*"([^"]+)".*/, "$1");
        const wasActive = backgrounds[i][0] !== "#FFCCCC";
        
        if (campaignId && /^\d+$/.test(campaignId)) {
          existingData[campaignId] = { wasActive, impairedId };
        }
      });
    } catch (e) {}
  }
  
  // Создание карты impaired кампаний
  const impairedMap = {};
  const impairedTitles = {};
  
  allCampaigns.forEach(campaign => {
    const title = String(campaign.title || "").toLowerCase();
    if (title.includes("pb impair")) {
      impairedTitles[campaign.id] = campaign.title;
      const relatedMatch = campaign.title.match(/related\s*=\s*(\d+)/i);
      if (relatedMatch) {
        impairedMap[relatedMatch[1]] = campaign.id;
      }
    }
  });
  
  // Подготовка данных
  const currentTime = new Date();
  const finalData = [];
  const campaignsToStop = [];
  const campaignsToStart = [];
  const currentActiveCampaignIds = new Set();
  
  // Активные кампании
  trickyCampaigns.forEach(campaign => {
    const campaignId = String(campaign.id);
    currentActiveCampaignIds.add(campaignId);
    
    const impairedId = impairedMap[campaignId] || "";
    const existingStatus = existingData[campaignId];
    const finalImpairedId = impairedId || (existingStatus ? existingStatus.impairedId : "");
    
    const impairedTitle = finalImpairedId ? impairedTitles[finalImpairedId] : "";
    const biUrl = campaign.bi_url || "";
    
    const rowData = [
      campaignId,
      finalImpairedId,
      campaign.title || "",
      impairedTitle,
      biUrl ? `=HYPERLINK("${IMPAIRED_CONFIG.baseUrl}${biUrl}", "Link")` : "",
      currentTime
    ];
    
    finalData.push({ data: rowData, isActive: true, impairedId: finalImpairedId });
    
    if (existingStatus && !existingStatus.wasActive && finalImpairedId) {
      campaignsToStart.push(finalImpairedId);
    }
  });
  
  // Остановленные кампании
  Object.entries(existingData).forEach(([campaignId, status]) => {
    if (!currentActiveCampaignIds.has(campaignId)) {
      const rowData = [
        campaignId,
        status.impairedId,
        `[STOPPED] Campaign ${campaignId}`,
        status.impairedId ? (impairedTitles[status.impairedId] || "") : "",
        "",
        currentTime
      ];
      
      finalData.push({ data: rowData, isActive: false });
      
      if (status.wasActive && status.impairedId) {
        campaignsToStop.push(status.impairedId);
      }
    }
  });
  
  // Очистка и запись данных
  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  if (finalData.length > 0) {
    const dataValues = finalData.map(row => row.data);
    sheet.getRange(2, 1, dataValues.length, headers.length).setValues(dataValues);
    
    // Применение цветов
    finalData.forEach((row, i) => {
      if (!row.isActive) {
        sheet.getRange(i + 2, 1, 1, headers.length).setBackground("#FFCCCC");
      }
    });
  }
  
  // Обновление статусов
  if (campaignsToStop.length > 0) {
    updateImpairedCampaignsStatus(campaignsToStop, false);
  }
  if (campaignsToStart.length > 0) {
    updateImpairedCampaignsStatus(campaignsToStart, true);
  }
}

function updateImpairedCampaignsStatus(campaignIds, active) {
  UTILS.log(`🔧 Impaired: Обновляем статус ${campaignIds.length} кампаний`);
  
  campaignIds.forEach(campaignId => {
    UTILS.fetchWithRetry(`${IMPAIRED_CONFIG.baseUrl}/campaigns2/${campaignId}`, {
      method: "patch",
      headers: {
        "Authorization": UTILS.CONFIG.API_TOKEN_APPGROWTH,
        "Content-Type": "application/json"
      },
      payload: JSON.stringify({ active: active })
    });
  });
}

function toggleTrickyTrackerTrigger() {
  const triggerName = "loginAndSaveTrickyCampaigns";
  const triggers = ScriptApp.getProjectTriggers();
  
  const existingTrigger = triggers.find(t => t.getHandlerFunction() === triggerName);
  
  if (existingTrigger) {
    ScriptApp.deleteTrigger(existingTrigger);
    return { status: "removed", message: "Триггер отключен" };
  } else {
    ScriptApp.newTrigger(triggerName).timeBased().everyHours(2).create();
    return { status: "created", message: "Триггер включен" };
  }
}