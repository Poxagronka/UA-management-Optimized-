// 03_AuthAndDataRetrieval.gs - Упрощенная версия
const AUTH_CONFIG = {
  baseUrl: "https://app.appgrowth.com",
  username: "alexander.sakovich", 
  password: "eesh9IL8weecheif4phai3wi",
  maxAttempts: 5
};

function loginAndSaveCampaigns() {
  const startTime = new Date();
  UTILS.log('🕒 Начало выполнения loginAndSaveCampaigns');
  
  const spreadsheet = SpreadsheetApp.openById(UTILS.CONFIG.SPREADSHEET_ID);
  const sheetNames = ["Planning", "Bundle Grouped Campaigns"];
  
  // Сбор всех Campaign ID
  let allCampaignIds = [];
  let campaignSheetMap = {};
  
  for (const sheetName of sheetNames) {
    const sheet = UTILS.getSheet(sheetName);
    if (!sheet) continue;
    
    const campaigns = UTILS.collectCampaignIds(sheet);
    allCampaignIds = allCampaignIds.concat(campaigns.map(c => c.id));
    
    campaigns.forEach(campaign => {
      campaignSheetMap[campaign.id] = {
        sheetName,
        rowIndex: campaign.rowIndex
      };
    });
  }
  
  allCampaignIds = [...new Set(allCampaignIds)];
  UTILS.log(`📊 Найдено ${allCampaignIds.length} активных кампаний`);
  
  if (allCampaignIds.length === 0) {
    UTILS.log('⚠️ Не найдено активных кампаний');
    return;
  }
  
  // Получение данных кампаний
  const campaignsData = fetchCampaignsData(allCampaignIds);
  if (!campaignsData || Object.keys(campaignsData).length === 0) {
    UTILS.log('❌ Не удалось получить данные кампаний');
    return;
  }
  
  UTILS.log(`✅ Получены данные для ${Object.keys(campaignsData).length} кампаний`);
  
  // Обновление данных в листах
  updateSheetsData(sheetNames, campaignsData, campaignSheetMap, spreadsheet);
  
  const executionTime = (new Date() - startTime) / 1000;
  UTILS.log(`🏁 Скрипт выполнен за ${executionTime.toFixed(2)} секунд`);
}

function fetchCampaignsData(campaignIds) {
  for (let attempt = 0; attempt < AUTH_CONFIG.maxAttempts; attempt++) {
    try {
      // Шаг 1: Получение страницы логина
      const loginPageRes = UrlFetchApp.fetch(`${AUTH_CONFIG.baseUrl}/auth/`, {
        muteHttpExceptions: true,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Google-Apps-Script)" }
      });
      
      if (loginPageRes.getResponseCode() !== 200) throw new Error('Login page failed');
      
      // Извлечение CSRF токена
      const loginPageText = loginPageRes.getContentText();
      const cheerio = Cheerio.load(loginPageText);
      const csrfToken = cheerio('input[name="csrf_token"]').val();
      if (!csrfToken) throw new Error('CSRF token not found');
      
      // Извлечение cookies
      const loginHeaders = loginPageRes.getAllHeaders();
      const initialCookies = extractCookies(loginHeaders["Set-Cookie"]);
      
      // Шаг 2: Логин
      const loginResult = performLogin(csrfToken, initialCookies);
      if (!loginResult.success) throw new Error('Login failed');
      
      // Шаг 3: Получение страницы кампаний
      const campaignsData = fetchCampaignsPage(loginResult.cookies, campaignIds);
      if (campaignsData && Object.keys(campaignsData).length > 0) {
        return campaignsData;
      }
      
    } catch (error) {
      UTILS.log(`❌ Попытка ${attempt + 1} неудачна: ${error.message}`);
      if (attempt < AUTH_CONFIG.maxAttempts - 1) {
        Utilities.sleep((attempt + 1) * 5000);
      }
    }
  }
  
  UTILS.log(`❌ Не удалось получить данные после ${AUTH_CONFIG.maxAttempts} попыток`);
  return {};
}

function extractCookies(setCookieHeader) {
  if (!setCookieHeader) return "";
  const cookieArray = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  return cookieArray.map(c => c.split(";")[0]).join("; ");
}

function performLogin(csrfToken, initialCookies) {
  const loginPayload = {
    csrf_token: csrfToken,
    username: AUTH_CONFIG.username,
    password: AUTH_CONFIG.password,
    remember: "y"
  };
  
  const loginOptions = {
    method: "post",
    payload: loginPayload,
    headers: {
      "Cookie": initialCookies,
      "Content-Type": "application/x-www-form-urlencoded",
      "Origin": AUTH_CONFIG.baseUrl,
      "Referer": `${AUTH_CONFIG.baseUrl}/auth/`,
      "User-Agent": "Mozilla/5.0 (compatible; Google-Apps-Script)"
    },
    muteHttpExceptions: true,
    followRedirects: false
  };
  
  const loginRes = UrlFetchApp.fetch(`${AUTH_CONFIG.baseUrl}/auth/`, loginOptions);
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

function fetchCampaignsPage(cookies, campaignIds) {
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
    const url = `${AUTH_CONFIG.baseUrl}/campaigns/?_nocache=${Date.now()}_${i}`;
    const response = UrlFetchApp.fetch(url, options);
    
    if (response.getResponseCode() === 200) {
      const content = response.getContentText();
      const data = extractCampaignsData(content, campaignIds);
      
      if (Object.keys(data).length > 0) return data;
    }
    
    Utilities.sleep(1000 * (i + 1));
  }
  
  return {};
}

function extractCampaignsData(content, campaignIds) {
  const result = {};
  
  // Поиск JSON данных в скриптах
  const cheerio = Cheerio.load(content);
  let campaignsData = null;
  
  cheerio('script').each((_, script) => {
    const scriptContent = cheerio(script).html();
    if (!scriptContent || !scriptContent.includes('window.__DATA__')) return;
    
    try {
      const match = scriptContent.match(/window\.__DATA__\s*=\s*({.+});/s);
      if (match?.[1]) {
        const data = JSON.parse(match[1]);
        if (data.campaigns && Array.isArray(data.campaigns)) {
          campaignsData = data.campaigns;
          return false; // break
        }
      }
    } catch (e) {}
  });
  
  if (!campaignsData) return result;
  
  // Обработка найденных кампаний
  for (const campaign of campaignsData) {
    if (!campaignIds.includes(String(campaign.id))) continue;
    
    const campaignId = String(campaign.id);
    result[campaignId] = {
      local: UTILS.extractLocale(campaign.title || ''),
      outOfBudget: campaign.out_of_budget === true,
      pausedBy: campaign.paused_by || campaign.paused_reason || '',
      dailyBudget: UTILS.parseNumber(campaign.daily_budget) || 0,
      source: UTILS.extractSource(campaign.title || '') || 'не изменено'
    };
  }
  
  return result;
}

function updateSheetsData(sheetNames, campaignsData, campaignSheetMap, spreadsheet) {
  let totalUpdates = 0;
  
  for (const sheetName of sheetNames) {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) continue;
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const columnMap = {
      local: UTILS.findColumnIndex(headers, 'local'),
      outOfBudget: UTILS.findColumnIndex(headers, 'out of budget'),
      pausedBy: UTILS.findColumnIndex(headers, 'paused by'),
      dailyBudget: UTILS.findColumnIndex(headers, 'daily budget'),
      source: UTILS.findColumnIndex(headers, 'source')
    };
    
    const updates = [];
    
    for (const campaignId in campaignsData) {
      const sheetInfo = campaignSheetMap[campaignId];
      if (!sheetInfo || sheetInfo.sheetName !== sheetName) continue;
      
      const campaign = campaignsData[campaignId];
      const row = sheetInfo.rowIndex;
      
      // Подготовка обновлений
      Object.entries(columnMap).forEach(([field, colIndex]) => {
        if (colIndex !== -1 && campaign[field] !== undefined) {
          if (field === 'source' && campaign[field] === 'не изменено') return;
          
          updates.push({
            row,
            col: colIndex + 1,
            value: campaign[field]
          });
        }
      });
    }
    
    // Применение обновлений
    UTILS.batchUpdate(sheet, updates);
    totalUpdates += updates.length;
  }
  
  UTILS.log(`🎉 ИТОГО обновлено ${totalUpdates} ячеек в таблице`);
}