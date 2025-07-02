// 13_AutostopImpaired.gs - Автостоп Impaired кампаний
const IMPAIRED_CONFIG = {
  baseUrl: "https://app.appgrowth.com",
  username: "alexander.sakovich",
  password: "eesh9IL8weecheif4phai3wi",
  maxAttempts: 5
};

function loginAndSaveTrickyCampaigns() {
  const startTime = new Date();
  UTILS.log('🎯 Impaired: Начинаем loginAndSaveTrickyCampaigns');
  
  const spreadsheet = SpreadsheetApp.openById(UTILS.CONFIG.SPREADSHEET_ID);
  if (!spreadsheet) {
    UTILS.log('❌ Impaired: Не удалось открыть таблицу');
    return;
  }
  
  UTILS.log('🌐 Impaired: Получаем данные tricky кампаний');
  const campaignsData = fetchTrickyCampaignsData();
  if (!campaignsData || campaignsData.length === 0) {
    UTILS.log('❌ Impaired: Не удалось получить данные кампаний');
    return;
  }
  
  UTILS.log(`📊 Impaired: Получено ${campaignsData.length} кампаний`);
  
  const trickyCampaigns = campaignsData.filter(campaign => {
    const title = String(campaign.title || "").toLowerCase();
    return title.includes("tricky");
  });
  
  UTILS.log(`🎯 Impaired: Найдено ${trickyCampaigns.length} tricky кампаний из ${campaignsData.length} общих`);
  
  if (trickyCampaigns.length === 0) {
    UTILS.log('⚠️ Impaired: Нет tricky кампаний для обработки');
    return;
  }
  
  writeToAutostopSheet(spreadsheet, trickyCampaigns, campaignsData);
  
  const executionTime = (new Date() - startTime) / 1000;
  UTILS.log(`🏁 Impaired: Автостоп выполнен за ${executionTime.toFixed(2)} секунд`);
}

function fetchTrickyCampaignsData() {
  UTILS.log(`🔐 Impaired: Начинаем аутентификацию (${IMPAIRED_CONFIG.maxAttempts} попыток)`);
  
  for (let attempt = 0; attempt < IMPAIRED_CONFIG.maxAttempts; attempt++) {
    try {
      UTILS.log(`🔄 Impaired: Попытка ${attempt + 1}/${IMPAIRED_CONFIG.maxAttempts}`);
      
      // Получение страницы логина
      UTILS.log('📥 Impaired: Получаем страницу логина');
      const loginPageRes = UrlFetchApp.fetch(`${IMPAIRED_CONFIG.baseUrl}/auth/`, {
        muteHttpExceptions: true,
        followRedirects: false,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Google-Apps-Script)" }
      });
      
      if (loginPageRes.getResponseCode() !== 200) {
        UTILS.log(`❌ Impaired: Ошибка получения страницы логина: ${loginPageRes.getResponseCode()}`);
        throw new Error('Login page failed');
      }
      
      const loginPageText = loginPageRes.getContentText();
      UTILS.log(`📄 Impaired: Получена страница логина (${loginPageText.length} символов)`);
      
      // Извлечение CSRF токена
      const csrfToken = extractCSRFToken(loginPageText);
      if (!csrfToken) {
        UTILS.log('❌ Impaired: CSRF токен не найден');
        throw new Error('CSRF token not found');
      }
      
      UTILS.log(`🔑 Impaired: CSRF токен получен: ${csrfToken.substring(0, 10)}...`);
      
      // Извлечение cookies
      const loginHeaders = loginPageRes.getAllHeaders();
      const initialCookies = extractCookies(loginHeaders["Set-Cookie"]);
      UTILS.log('🍪 Impaired: Извлечены начальные cookies');
      
      // Выполнение логина
      UTILS.log('🔐 Impaired: Выполняем логин');
      const loginResult = performLogin(csrfToken, initialCookies);
      if (!loginResult.success) {
        UTILS.log('❌ Impaired: Ошибка логина');
        throw new Error('Login failed');
      }
      
      UTILS.log('✅ Impaired: Авторизация успешна');
      
      // Получение страницы кампаний
      UTILS.log('🌐 Impaired: Запрашиваем страницу кампаний');
      const campaignsData = fetchCampaignsPageData(loginResult.cookies);
      if (campaignsData && campaignsData.length > 0) {
        UTILS.log(`📦 Impaired: Получено ${campaignsData.length} кампаний`);
        return campaignsData;
      }
      
      UTILS.log('⚠️ Impaired: Получены пустые данные кампаний');
      
    } catch (error) {
      UTILS.log(`❌ Impaired: Попытка ${attempt + 1} неудачна: ${error.message}`);
      if (attempt < IMPAIRED_CONFIG.maxAttempts - 1) {
        const sleepTime = (attempt + 1) * 5000;
        UTILS.log(`⏱️ Impaired: Ожидание ${sleepTime}мс перед следующей попыткой`);
        Utilities.sleep(sleepTime);
      }
    }
  }
  
  UTILS.log(`❌ Impaired: Не удалось получить данные после ${IMPAIRED_CONFIG.maxAttempts} попыток`);
  return [];
}

function extractCSRFToken(html) {
  // Поиск CSRF токена в HTML
  let match = html.match(/name=["']csrf_token["']\s+value=["']([^"']+)["']/i);
  if (match) return match[1];
  
  match = html.match(/value=["']([^"']+)["']\s+name=["']csrf_token["']/i);
  if (match) return match[1];
  
  match = html.match(/<input[^>]+name=["']csrf_token["'][^>]+value=["']([^"']+)["']/i);
  if (match) return match[1];
  
  return null;
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
  const statusCode = loginRes.getResponseCode();
  
  UTILS.log(`🔐 Impaired: Ответ логина - статус: ${statusCode}`);
  
  if (statusCode !== 302) {
    UTILS.log(`❌ Impaired: Ожидался редирект (302), получен ${statusCode}`);
    return { success: false };
  }
  
  // Извлечение session cookies
  const loginHeaders = loginRes.getAllHeaders();
  const loginCookies = loginHeaders["Set-Cookie"] || loginHeaders["set-cookie"];
  
  if (!loginCookies) {
    UTILS.log('❌ Impaired: Не получены cookies после логина');
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
    UTILS.log(`❌ Impaired: Не найдены session cookies - session: ${!!sessionCookie}, remember: ${!!rememberToken}`);
    return { success: false };
  }
  
  UTILS.log('🍪 Impaired: Получены session cookies');
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
    UTILS.log(`📡 Impaired: Запрос кампаний - попытка ${i + 1}/3`);
    
    const url = `${IMPAIRED_CONFIG.baseUrl}/campaigns/?_nocache=${Date.now()}_${i}`;
    const response = UrlFetchApp.fetch(url, options);
    
    if (response.getResponseCode() === 200) {
      const content = response.getContentText();
      UTILS.log(`📄 Impaired: Получен ответ (${content.length} символов)`);
      
      const data = extractAllCampaignsData(content);
      
      if (data && data.length > 0) {
        UTILS.log(`✅ Impaired: Извлечено ${data.length} кампаний из HTML`);
        return data;
      } else {
        UTILS.log('⚠️ Impaired: Не найдены данные кампаний в ответе');
      }
    } else {
      UTILS.log(`❌ Impaired: Ошибка запроса кампаний: ${response.getResponseCode()}`);
    }
    
    if (i < 2) {
      Utilities.sleep(UTILS.randomDelay(1000, 2000));
    }
  }
  
  return [];
}

function extractAllCampaignsData(content) {
  UTILS.log('🔍 Impaired: Парсим данные кампаний из HTML');
  
  // Поиск данных в скриптах - упрощенная версия без внешних библиотек
  let campaignsData = null;
  
  // Поиск window.__DATA__
  const dataMatch = content.match(/window\.__DATA__\s*=\s*({.+?});/s);
  if (dataMatch) {
    try {
      const data = JSON.parse(dataMatch[1]);
      if (data.campaigns && Array.isArray(data.campaigns)) {
        campaignsData = data.campaigns;
        UTILS.log(`📊 Impaired: Найдено ${campaignsData.length} кампаний в window.__DATA__`);
      }
    } catch (e) {
      UTILS.log(`⚠️ Impaired: Ошибка парсинга window.__DATA__: ${e.message}`);
    }
  }
  
  // Если не найдено в window.__DATA__, ищем в script тегах
  if (!campaignsData) {
    const scriptMatches = content.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
    if (scriptMatches) {
      UTILS.log(`📋 Impaired: Найдено ${scriptMatches.length} тегов script для поиска`);
      
      for (const script of scriptMatches) {
        const scriptContent = script.replace(/<\/?script[^>]*>/gi, '');
        if (!scriptContent.includes('campaigns')) continue;
        
        // Поиск массива кампаний
        const campaignsMatch = scriptContent.match(/campaigns['"]\s*:\s*(\[[^\]]+\])/);
        if (campaignsMatch) {
          try {
            campaignsData = JSON.parse(campaignsMatch[1]);
            UTILS.log(`📊 Impaired: Найдено ${campaignsData.length} кампаний в script теге`);
            break;
          } catch (e) {
            // Продолжаем поиск
          }
        }
      }
    }
  }
  
  if (!campaignsData) {
    UTILS.log('❌ Impaired: Не найдены данные кампаний в JSON');
  }
  
  return campaignsData || [];
}

function writeToAutostopSheet(spreadsheet, trickyCampaignsData, allCampaignsData) {
  UTILS.log(`📝 Impaired: Записываем данные в лист Autostop_Impaired`);
  
  const sheetName = "Autostop_Impaired";
  
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    UTILS.log(`📄 Impaired: Создаем новый лист ${sheetName}`);
    sheet = spreadsheet.insertSheet(sheetName);
  } else {
    UTILS.log(`📄 Impaired: Используем существующий лист ${sheetName}`);
  }
  
  const headers = ["ID", "Impaired ID", "Title", "Impaired Title", "BI URL", "Last Updated"];
  
  // Чтение существующих данных
  const existingCampaignStatuses = {};
  if (sheet.getLastRow() > 1) {
    try {
      const dataRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6);
      const values = dataRange.getDisplayValues();
      const backgrounds = dataRange.getBackgrounds();
      
      let existingCount = 0;
      for (let i = 0; i < values.length; i++) {
        const campaignId = extractIdFromCell(values[i][0]);
        const impairedId = extractIdFromCell(values[i][1]);
        const wasActive = backgrounds[i][0] !== "#FFCCCC";
        
        if (campaignId && /^\d+$/.test(campaignId)) {
          existingCampaignStatuses[campaignId] = {
            wasActive: wasActive,
            impairedId: impairedId || ""
          };
          existingCount++;
        }
      }
      
      UTILS.log(`📊 Impaired: Найдено ${existingCount} существующих записей`);
    } catch (e) {
      UTILS.log(`⚠️ Impaired: Ошибка чтения существующих данных: ${e.message}`);
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
  
  UTILS.log(`🎯 Impaired: Найдено ${allImpairedCampaigns.length} impaired кампаний`);
  
  // Поиск связей между кампаниями
  let linkedCount = 0;
  for (const impairedCampaign of allImpairedCampaigns) {
    const relatedMatch = impairedCampaign.title.match(/related\s*=\s*(\d+)/i);
    if (relatedMatch && relatedMatch[1]) {
      const relatedId = relatedMatch[1];
      const trickyCampaign = trickyCampaignsData.find(c => String(c.id) === relatedId);
      if (trickyCampaign) {
        impairedCampaignsMap[relatedId] = impairedCampaign.id;
        linkedCount++;
      }
    }
  }
  
  UTILS.log(`🔗 Impaired: Найдено ${linkedCount} связей между tricky и impaired кампаниями`);
  
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
  
  UTILS.log(`📊 Impaired: Статистика данных - Активных: ${trickyCampaignsData.length}, Остановленных: ${Object.keys(existingCampaignStatuses).length - currentActiveCampaignIds.size}`);
  UTILS.log(`🎯 Impaired: К остановке: ${campaignsToStop.length}, К запуску: ${campaignsToStart.length}`);
  
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
    let appliedLinks = 0;
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
        appliedLinks++;
      }
      
      if (row.impairedId) {
        const impairedLink = UTILS.createHyperlink(row.impairedId, `${IMPAIRED_CONFIG.baseUrl}/campaigns/${row.impairedId}`);
        sheet.getRange(rowIndex, 2).setRichTextValue(impairedLink);
        appliedLinks++;
      }
    }
    
    // Форматирование времени
    const timeColumn = sheet.getRange(2, 6, finalData.length, 1);
    timeColumn.setNumberFormat("yyyy-mm-dd hh:mm:ss");
    
    sheet.autoResizeColumns(1, headers.length);
    
    UTILS.log(`📝 Impaired: Записано ${finalData.length} строк данных, создано ${appliedLinks} гиперссылок`);
  }
  
  // Обновление статусов кампаний
  if (campaignsToStop.length > 0) {
    UTILS.log(`🛑 Impaired: Останавливаем ${campaignsToStop.length} impaired кампаний`);
    updateImpairedCampaignsStatus(campaignsToStop, false);
  }
  
  if (campaignsToStart.length > 0) {
    UTILS.log(`🔄 Impaired: Запускаем ${campaignsToStart.length} impaired кампаний`);
    updateImpairedCampaignsStatus(campaignsToStart, true);
  }
  
  UTILS.log('✅ Impaired: Запись в лист Autostop_Impaired завершена');
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
  UTILS.log(`🔧 Impaired: Обновляем статус ${campaignIds.length} кампаний (active: ${active})`);
  
  const batchSize = 10;
  const maxRetries = 3;
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < campaignIds.length; i += batchSize) {
    const batch = campaignIds.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(campaignIds.length / batchSize);
    
    UTILS.log(`⚡ Impaired: Обрабатываем батч ${batchNum}/${totalBatches} (${batch.length} кампаний)`);
    
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
        
        if (result.success) {
          successCount++;
          break;
        } else {
          if (attempt < maxRetries) {
            Utilities.sleep(1000 * attempt);
          } else {
            errorCount++;
            UTILS.log(`❌ Impaired: Не удалось обновить кампанию ${campaignId} после ${maxRetries} попыток`);
          }
        }
      }
    }
    
    if (i + batchSize < campaignIds.length) {
      Utilities.sleep(500);
    }
  }
  
  UTILS.log(`📊 Impaired: Обновление статусов завершено - Успешно: ${successCount}, Ошибок: ${errorCount}`);
}

function toggleTrickyTrackerTrigger() {
  UTILS.log('🔄 Impaired: Переключаем триггер автоматического выполнения');
  
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
    UTILS.log('❌ Impaired: Автоматическое выполнение отключено');
    return {
      status: "removed",
      message: "Автоматическое выполнение отключено"
    };
  } else {
    ScriptApp.newTrigger(triggerName)
      .timeBased()
      .everyHours(2)
      .create();
    
    UTILS.log('✅ Impaired: Автоматическое выполнение включено (каждые 2 часа)');
    return {
      status: "created",
      message: "Автоматическое выполнение включено (каждые 2 часа)"
    };
  }
}