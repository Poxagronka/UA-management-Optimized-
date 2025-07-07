// 03_AuthAndDataRetrieval.gs - Упрощенная версия
const AUTH_CONFIG = {
  baseUrl: "https://app.appgrowth.com",
  username: "alexander.sakovich", 
  password: "eesh9IL8weecheif4phai3wi",
  maxAttempts: 5
};

function loginAndSaveCampaigns() {
  const startTime = new Date();
  UTILS.log('🕒 Auth: Начало выполнения loginAndSaveCampaigns');
  
  const targetSheets = UTILS.getTargetSheets();
  if (targetSheets.length === 0) {
    UTILS.log('❌ Auth: Не найдены целевые листы');
    return;
  }
  
  UTILS.log(`📋 Auth: Найдено ${targetSheets.length} целевых листов: ${targetSheets.map(s => s.getName()).join(', ')}`);
  
  // Сбор всех Campaign ID
  let allCampaignIds = [];
  let campaignSheetMap = {};
  
  for (const sheet of targetSheets) {
    const campaigns = collectCampaignIdsSafe(sheet, sheet.getName());
    UTILS.log(`📊 Auth: Лист "${sheet.getName()}" - найдено ${campaigns.length} кампаний`);
    
    allCampaignIds = allCampaignIds.concat(campaigns.map(c => c.id));
    
    campaigns.forEach(campaign => {
      campaignSheetMap[campaign.id] = {
        sheetName: sheet.getName(),
        rowIndex: campaign.rowIndex
      };
    });
  }
  
  allCampaignIds = [...new Set(allCampaignIds)];
  UTILS.log(`📊 Auth: Найдено ${allCampaignIds.length} активных кампаний`);
  
  if (allCampaignIds.length === 0) {
    UTILS.log('⚠️ Auth: Не найдено активных кампаний');
    return;
  }
  
  // Получение данных кампаний
  const campaignsData = fetchCampaignsData(allCampaignIds);
  if (!campaignsData || Object.keys(campaignsData).length === 0) {
    UTILS.log('❌ Auth: Не удалось получить данные кампаний');
    return;
  }
  
  UTILS.log(`✅ Auth: Получены данные для ${Object.keys(campaignsData).length} кампаний`);
  
  // Обновление данных в листах
  updateSheetsData(targetSheets, campaignsData, campaignSheetMap);
  
  const executionTime = (new Date() - startTime) / 1000;
  UTILS.log(`🏁 Auth: Скрипт выполнен за ${executionTime.toFixed(2)} секунд`);
}

function collectCampaignIdsSafe(sheet, sheetName) {
  UTILS.log(`🔍 Auth: Собираем Campaign ID из листа "${sheetName}"`);
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  // Поиск колонок
  const idColumnIndex = UTILS.findColumnIndex(headers, ['campaign id/link', 'campaign id', 'id']);
  const statusColumnIndex = UTILS.findColumnIndex(headers, ['campaign status', 'status']);
  
  if (idColumnIndex === -1) {
    UTILS.log(`❌ Auth: Не найдена колонка с Campaign ID в листе "${sheetName}"`);
    return [];
  }
  
  UTILS.log(`📋 Auth: Лист "${sheetName}" - найдены колонки ID: ${idColumnIndex}, Status: ${statusColumnIndex}`);
  
  // Получаем валидные строки с фильтром по статусу
  const validRowsData = UTILS.getValidRows(sheet, {
    statusFilter: 'running',
    statusColumn: statusColumnIndex
  });
  
  const campaignIds = [];
  let validCount = 0, skippedByInvalidId = 0;
  
  // Проходим по валидным строкам
  validRowsData.forEach(row => {
    const campaignIdCell = String(row.data[idColumnIndex] || "");
    const campaignId = UTILS.extractCampaignId(campaignIdCell);
    
    if (campaignId) {
      campaignIds.push({ 
        id: campaignId, 
        rowIndex: row.index + 1
      });
      validCount++;
    } else {
      skippedByInvalidId++;
    }
  });
  
  UTILS.log(`📊 Auth: Лист "${sheetName}" - валидных: ${validCount}, невалидный ID: ${skippedByInvalidId}`);
  return campaignIds;
}

function fetchCampaignsData(campaignIds) {
  UTILS.log(`🔐 Auth: Начинаем аутентификацию (${AUTH_CONFIG.maxAttempts} попыток)`);
  
  for (let attempt = 0; attempt < AUTH_CONFIG.maxAttempts; attempt++) {
    try {
      UTILS.log(`🔄 Auth: Попытка ${attempt + 1}/${AUTH_CONFIG.maxAttempts}`);
      
      // Шаг 1: Получение страницы логина
      UTILS.log(`📥 Auth: Получаем страницу логина`);
      const loginPageRes = UrlFetchApp.fetch(`${AUTH_CONFIG.baseUrl}/auth/`, {
        muteHttpExceptions: true,
        followRedirects: false,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Google-Apps-Script)" }
      });
      
      if (loginPageRes.getResponseCode() !== 200) {
        UTILS.log(`❌ Auth: Ошибка получения страницы логина: ${loginPageRes.getResponseCode()}`);
        throw new Error('Login page failed');
      }
      
      const loginPageText = loginPageRes.getContentText();
      UTILS.log(`📄 Auth: Получена страница логина (${loginPageText.length} символов)`);
      
      // Извлечение CSRF токена - используем несколько методов
      let csrfToken = null;
      
      // Метод 1: стандартный input
      let match = loginPageText.match(/name=["']csrf_token["']\s+value=["']([^"']+)["']/i);
      if (match) csrfToken = match[1];
      
      // Метод 2: обратный порядок атрибутов
      if (!csrfToken) {
        match = loginPageText.match(/value=["']([^"']+)["']\s+name=["']csrf_token["']/i);
        if (match) csrfToken = match[1];
      }
      
      // Метод 3: с type=hidden
      if (!csrfToken) {
        match = loginPageText.match(/<input[^>]+name=["']csrf_token["'][^>]+value=["']([^"']+)["']/i);
        if (match) csrfToken = match[1];
      }
      
      // Метод 4: поиск любого input с csrf_token
      if (!csrfToken) {
        match = loginPageText.match(/csrf_token["'][^>]*value=["']([^"']+)["']/i);
        if (match) csrfToken = match[1];
      }
      
      if (!csrfToken) {
        UTILS.log(`❌ Auth: CSRF токен не найден в HTML (${loginPageText.substring(0, 500)}...)`);
        throw new Error('CSRF token not found');
      }
      
      UTILS.log(`🔑 Auth: CSRF токен получен: ${csrfToken.substring(0, 10)}...`);
      
      // Извлечение cookies
      const loginHeaders = loginPageRes.getAllHeaders();
      const initialCookies = extractCookies(loginHeaders["Set-Cookie"]);
      UTILS.log(`🍪 Auth: Извлечены начальные cookies`);
      
      // Шаг 2: Логин
      UTILS.log(`🔐 Auth: Выполняем логин`);
      const loginResult = performLogin(csrfToken, initialCookies);
      if (!loginResult.success) {
        UTILS.log(`❌ Auth: Ошибка логина`);
        throw new Error('Login failed');
      }
      
      UTILS.log(`✅ Auth: Авторизация успешна`);
      
      // Шаг 3: Получение страницы кампаний с улучшенным парсингом
      UTILS.log(`🌐 Auth: Запрашиваем страницу кампаний`);
      const campaignsData = fetchCampaignsPageWithBetterParsing(loginResult.cookies, campaignIds);
      if (campaignsData && Object.keys(campaignsData).length > 0) {
        UTILS.log(`📦 Auth: Получено ${Object.keys(campaignsData).length} кампаний`);
        return campaignsData;
      }
      
      UTILS.log(`⚠️ Auth: Получены пустые данные кампаний`);
      
    } catch (error) {
      UTILS.log(`❌ Auth: Попытка ${attempt + 1} неудачна: ${error.message}`);
      if (attempt < AUTH_CONFIG.maxAttempts - 1) {
        const sleepTime = (attempt + 1) * 5000;
        UTILS.log(`⏱️ Auth: Ожидание ${sleepTime}мс перед следующей попыткой`);
        Utilities.sleep(sleepTime);
      }
    }
  }
  
  UTILS.log(`❌ Auth: Не удалось получить данные после ${AUTH_CONFIG.maxAttempts} попыток`);
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
  const statusCode = loginRes.getResponseCode();
  
  UTILS.log(`🔐 Auth: Ответ логина - статус: ${statusCode}`);
  
  if (statusCode !== 302) {
    UTILS.log(`❌ Auth: Ожидался редирект (302), получен ${statusCode}`);
    return { success: false };
  }
  
  // Извлечение session cookies
  const loginHeaders = loginRes.getAllHeaders();
  const loginCookies = loginHeaders["Set-Cookie"] || loginHeaders["set-cookie"];
  
  if (!loginCookies) {
    UTILS.log(`❌ Auth: Не получены cookies после логина`);
    return { success: false };
  }
  
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
  
  if (!sessionCookie || !rememberToken) {
    UTILS.log(`❌ Auth: Не найдены session cookies - session: ${!!sessionCookie}, remember: ${!!rememberToken}`);
    return { success: false };
  }
  
  UTILS.log(`🍪 Auth: Получены session cookies`);
  return { success: true, cookies: `${rememberToken}; ${sessionCookie}` };
}

function fetchCampaignsPageWithBetterParsing(cookies, campaignIds) {
  const options = {
    method: "get",
    headers: {
      "Cookie": cookies,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache"
    },
    muteHttpExceptions: true,
    followRedirects: true
  };
  
  // Несколько попыток получения данных с разными параметрами
  for (let i = 0; i < 5; i++) {
    UTILS.log(`📡 Auth: Запрос кампаний - попытка ${i + 1}/5`);
    
    const baseDelay = i > 0 ? 1500 * i : 0;
    if (baseDelay > 0) {
      UTILS.log(`⏱️ Auth: Ожидание ${baseDelay}мс`);
      Utilities.sleep(baseDelay);
    }
    
    const url = `${AUTH_CONFIG.baseUrl}/campaigns/?_nocache=${Date.now()}_${i}`;
    const response = UrlFetchApp.fetch(url, options);
    
    if (response.getResponseCode() === 200) {
      const content = response.getContentText();
      UTILS.log(`📄 Auth: Получен ответ (${content.length} символов)`);
      
      // Проверяем что в ответе есть данные о кампаниях
      const hasTableData = content.includes('<table class="table');
      const hasJsonData = content.includes('window.__DATA__') || (content.includes('"id":') && content.includes('"title":'));
      const hasTargetCampaigns = campaignIds.some(id => content.includes(`"id":${id}`));
      
      UTILS.log(`🔍 Auth: Анализ ответа - Table: ${hasTableData}, JSON: ${hasJsonData}, Target campaigns: ${hasTargetCampaigns}`);
      
      if (content.length >= 300000 && (hasJsonData || hasTableData)) {
        UTILS.log(`✅ Auth: Получен полный ответ, начинаем парсинг`);
        const data = extractCampaignsDataAdvanced(content, campaignIds);
        
        if (Object.keys(data).length > 0) {
          UTILS.log(`✅ Auth: Извлечено ${Object.keys(data).length} кампаний из HTML`);
          return data;
        }
      }
      
      // Если полных данных нет, но есть частичные
      if (hasTargetCampaigns) {
        UTILS.log(`📊 Auth: Найдены частичные данные, используем минимальный парсинг`);
        const minimalData = extractMinimalCampaignData(content, campaignIds);
        if (Object.keys(minimalData).length > 0) {
          UTILS.log(`📦 Auth: Извлечено ${Object.keys(minimalData).length} кампаний (минимальные данные)`);
          return minimalData;
        }
      }
      
      UTILS.log(`⚠️ Auth: Не найдены данные кампаний в ответе`);
    } else {
      UTILS.log(`❌ Auth: Ошибка запроса кампаний: ${response.getResponseCode()}`);
    }
  }
  
  return {};
}

function extractCampaignsDataAdvanced(content, campaignIds) {
  UTILS.log(`🔍 Auth: Улучшенный парсинг данных кампаний`);
  
  const result = {};
  
  // Метод 1: Поиск window.__DATA__
  const dataMatch = content.match(/window\.__DATA__\s*=\s*({.+?});/s);
  if (dataMatch) {
    UTILS.log(`🎯 Auth: Найден window.__DATA__`);
    try {
      const data = JSON.parse(dataMatch[1]);
      if (data.campaigns && Array.isArray(data.campaigns)) {
        UTILS.log(`📊 Auth: Найдено ${data.campaigns.length} кампаний в window.__DATA__`);
        return processCampaignsFromData(data.campaigns, campaignIds);
      }
    } catch (e) {
      UTILS.log(`⚠️ Auth: Ошибка парсинга window.__DATA__: ${e.message}`);
    }
  }
  
  // Метод 2: Поиск в script тегах
  const scriptMatches = content.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
  if (scriptMatches) {
    UTILS.log(`📋 Auth: Найдено ${scriptMatches.length} script тегов`);
    
    for (let i = 0; i < scriptMatches.length; i++) {
      const scriptContent = scriptMatches[i].replace(/<\/?script[^>]*>/gi, '');
      
      // Поиск различных форматов JSON
      const jsonPatterns = [
        /\[\s*({[^{}]*"id"\s*:\s*\d+[^{}]*},?\s*)+\]/g,
        /{\s*"\d+":\s*{[^{}]*},?\s*}/g,
        /var\s+\w+\s*=\s*(\[\s*{[^]*}\s*\])/g,
        /campaigns\s*:\s*(\[[^\]]+\])/g
      ];
      
      for (const pattern of jsonPatterns) {
        const matches = scriptContent.match(pattern);
        if (matches) {
          for (const match of matches) {
            try {
              let jsonStr = match.replace(/^(var\s+\w+\s*=\s*)/, '').replace(/^campaigns\s*:\s*/, '').replace(/;$/, '');
              const parsed = JSON.parse(jsonStr);
              
              if (Array.isArray(parsed)) {
                const foundData = processCampaignsFromData(parsed, campaignIds);
                if (Object.keys(foundData).length > 0) {
                  UTILS.log(`✅ Auth: Извлечены данные из script ${i + 1}`);
                  return foundData;
                }
              }
            } catch (e) {
              // Продолжаем поиск
            }
          }
        }
      }
    }
  }
  
  UTILS.log(`❌ Auth: Не найдены данные кампаний в JSON`);
  return result;
}

function processCampaignsFromData(campaignsArray, campaignIds) {
  const result = {};
  let matchedCount = 0;
  
  for (const campaign of campaignsArray) {
    if (!campaignIds.includes(String(campaign.id))) continue;
    
    const campaignId = String(campaign.id);
    result[campaignId] = {
      local: UTILS.extractLocale(campaign.title || ''),
      outOfBudget: campaign.out_of_budget === true,
      pausedBy: campaign.paused_by || campaign.paused_reason || '',
      dailyBudget: UTILS.parseNumber(campaign.daily_budget) || 0,
      source: UTILS.extractSource(campaign.title || '') || 'не изменено'
    };
    matchedCount++;
  }
  
  UTILS.log(`🎯 Auth: Сопоставлено ${matchedCount} кампаний с целевым списком`);
  return result;
}

function extractMinimalCampaignData(content, campaignIds) {
  UTILS.log(`🔍 Auth: Минимальный парсинг данных кампаний`);
  
  const result = {};
  
  for (const id of campaignIds) {
    // Поиск блока с кампанией по ID
    const campaignRegex = new RegExp(`\\{[^\\}]*"id"\\s*:\\s*${id}[^\\}]*\\}`, 'i');
    const campaignMatch = content.match(campaignRegex);
    
    if (campaignMatch) {
      const campaignBlock = campaignMatch[0];
      
      // Извлечение названия
      const titleMatch = campaignBlock.match(/"title"\s*:\s*"([^"]+)"/i);
      if (titleMatch) {
        const title = titleMatch[1];
        result[id] = {
          local: UTILS.extractLocale(title),
          outOfBudget: campaignBlock.includes('"out_of_budget":true'),
          pausedBy: '',
          dailyBudget: 0,
          source: UTILS.extractSource(title) || 'не изменено'
        };
      }
    }
  }
  
  UTILS.log(`📦 Auth: Минимальный парсинг - извлечено ${Object.keys(result).length} кампаний`);
  return result;
}

function updateSheetsData(targetSheets, campaignsData, campaignSheetMap) {
  UTILS.log(`📝 Auth: Начинаем обновление ${targetSheets.length} листов`);
  
  let totalUpdates = 0;
  
  for (const sheet of targetSheets) {
    const sheetName = sheet.getName();
    UTILS.log(`📄 Auth: Обрабатываем лист "${sheetName}"`);
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const columnMap = {
      local: UTILS.findColumnIndex(headers, 'local'),
      outOfBudget: UTILS.findColumnIndex(headers, 'out of budget'),
      pausedBy: UTILS.findColumnIndex(headers, 'paused by'),
      dailyBudget: UTILS.findColumnIndex(headers, 'daily budget'),
      source: UTILS.findColumnIndex(headers, 'source')
    };
    
    UTILS.log(`🔍 Auth: Лист "${sheetName}" - найдены колонки: ${Object.entries(columnMap).filter(([k,v]) => v !== -1).map(([k,v]) => `${k}:${v}`).join(', ')}`);
    
    const updates = [];
    let sheetUpdates = 0;
    
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
          sheetUpdates++;
        }
      });
    }
    
    // Применение обновлений
    if (updates.length > 0) {
      UTILS.batchUpdate(sheet, updates);
    }
    
    totalUpdates += sheetUpdates;
    UTILS.log(`✅ Auth: Лист "${sheetName}" - обновлено ${sheetUpdates} ячеек`);
  }
  
  UTILS.log(`🎉 Auth: ИТОГО обновлено ${totalUpdates} ячеек в ${targetSheets.length} листах`);
}