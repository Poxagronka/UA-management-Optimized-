const trickyBaseUrl = "https://app.appgrowth.com";
const trickyUsername = "alexander.sakovich";
const trickyPassword = "eesh9IL8weecheif4phai3wi";
const trickyLoginUrl = trickyBaseUrl + "/auth/";
const trickyCampaignsUrl = trickyBaseUrl + "/campaigns/";
const trickyMaxAttempts = 10;
const trickyApiToken = "5633e0c5add593327673a87c41be17da";

function loginAndSaveTrickyCampaigns() {
  const startTime = new Date();
  
  const ssId = "1U5i1MSEodBPj1dF-qlyQKBABegwVpPR7-t-1rKoMhzQ";
  const spreadsheet = SpreadsheetApp.openById(ssId);
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
}

function fetchTrickyCampaignsData() {
  let attempts = 0;
  
  while (attempts < trickyMaxAttempts) {
    try {
      const loginPageRes = UrlFetchApp.fetch(trickyLoginUrl, {
        muteHttpExceptions: true,
        followRedirects: false,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Google-Apps-Script)" }
      });
      
      if (loginPageRes.getResponseCode() !== 200) {
        attempts++;
        Utilities.sleep(attempts * 5000);
        continue;
      }
      
      const loginPageText = loginPageRes.getContentText();
      const cheerio = Cheerio.load(loginPageText);
      const csrfToken = cheerio('input[name="csrf_token"]').val();
      
      if (!csrfToken) {
        attempts++;
        Utilities.sleep(attempts * 5000);
        continue;
      }
      
      let initialCookies = "";
      const loginPageHeaders = loginPageRes.getAllHeaders();
      if (loginPageHeaders["Set-Cookie"]) {
        const cookieArray = Array.isArray(loginPageHeaders["Set-Cookie"]) ? loginPageHeaders["Set-Cookie"] : [loginPageHeaders["Set-Cookie"]];
        initialCookies = cookieArray.map(c => c.split(";")[0]).join("; ");
      }
      
      const loginPayload = {
        csrf_token: csrfToken,
        username: trickyUsername,
        password: trickyPassword,
        remember: "y"
      };
      
      const loginOptions = {
        method: "post",
        payload: loginPayload,
        headers: {
          "Cookie": initialCookies,
          "Content-Type": "application/x-www-form-urlencoded",
          "Origin": trickyBaseUrl,
          "Referer": trickyLoginUrl,
          "User-Agent": "Mozilla/5.0 (compatible; Google-Apps-Script)"
        },
        muteHttpExceptions: true,
        followRedirects: false,
      };
      
      const loginRes = UrlFetchApp.fetch(trickyLoginUrl, loginOptions);
      const loginStatusCode = loginRes.getResponseCode();
      
      if (loginStatusCode !== 302) {
        attempts++;
        Utilities.sleep(attempts * 5000);
        continue;
      }
      
      const loginHeaders = loginRes.getAllHeaders();
      let loginCookies = loginHeaders["Set-Cookie"] || loginHeaders["set-cookie"];
      let sessionCookie = "";
      let rememberToken = "";
      
      if (loginCookies) {
        const cookiesArray = Array.isArray(loginCookies) ? loginCookies : [loginCookies];
        for (let i = 0; i < cookiesArray.length; i++) {
          const cookie = cookiesArray[i];
          if (!cookie) continue;
          if (String(cookie).indexOf("session=") !== -1) {
            const match = String(cookie).match(/session=[^;]+/);
            if (match && match[0]) {
              sessionCookie = match[0];
            }
          }
          if (String(cookie).indexOf("remember_token=") !== -1) {
            const match = String(cookie).match(/remember_token=[^;]+/);
            if (match && match[0]) {
              rememberToken = match[0];
            }
          }
        }
      }
      
      if (!sessionCookie || !rememberToken) {
        attempts++;
        Utilities.sleep(attempts * 5000);
        continue;
      }
      
      try {
        UrlFetchApp.fetch(trickyBaseUrl, {
          method: "get",
          headers: {
            "Cookie": rememberToken + "; " + sessionCookie,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
          },
          muteHttpExceptions: true,
          followRedirects: true
        });
        Utilities.sleep(randomDelayTricky(700, 1200));
      } catch (e) {
        // Ignore errors
      }
      
      const combinedCookies = rememberToken + "; " + sessionCookie;
      const campaignsFetchOptions = {
        method: "get",
        headers: {
          "Cookie": combinedCookies,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          "Referer": trickyBaseUrl + "/",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
        },
        muteHttpExceptions: true,
        followRedirects: true,
        contentType: "application/x-www-form-urlencoded"
      };
      
      let campaignsRes;
      let responseSize = 0;
      let innerAttempts = 0;
      const maxInnerAttempts = 5;
      let hasTableData = false;
      let hasJsonData = false;
      let content = "";
      
      while (innerAttempts < maxInnerAttempts) {
        if (innerAttempts > 0) {
          const baseDelay = 1500;
          const progressiveDelay = baseDelay * (innerAttempts * 1.5);
          const delayTime = randomDelayTricky(progressiveDelay, progressiveDelay + 1000);
          Utilities.sleep(delayTime);
        }
        
        const noCacheParam = `_nocache=${new Date().getTime()}_${innerAttempts}`;
        const requestUrl = trickyCampaignsUrl + (trickyCampaignsUrl.includes('?') ? '&' : '?') + noCacheParam;
        
        campaignsRes = UrlFetchApp.fetch(requestUrl, campaignsFetchOptions);
        content = campaignsRes.getContentText();
        responseSize = content.length;
        
        hasTableData = content.indexOf('<table class="table') > -1;
        hasJsonData = content.indexOf('window.__DATA__') > -1 
                      || (content.indexOf('"id":') > -1 && content.indexOf('"title":') > -1);
        
        if (responseSize >= 300000 && (hasJsonData || hasTableData)) {
          if (hasJsonData) {
            Utilities.sleep(1000);
          }
          break;
        } else {
          innerAttempts++;
        }
      }
      
      const campaignsStatusCode = campaignsRes.getResponseCode();
      
      if (campaignsStatusCode !== 200) {
        attempts++;
        Utilities.sleep(attempts * 5000);
        continue;
      }
      
      const campaignsContent = campaignsRes.getContentText();
      const parsedData = extractAllCampaignsData(campaignsContent);
      
      if (parsedData && parsedData.length > 0) {
        return parsedData;
      }
      
    } catch (e) {
      // Ignore errors and continue attempts
    }
    
    attempts++;
    const sleepTime = attempts * 5000;
    Utilities.sleep(sleepTime);
  }
  
  return [];
}

function extractAllCampaignsData(content) {
  const campaigns = [];
  const cheerio = Cheerio.load(content);
  const scripts = cheerio('script');
  
  let campaignsData = null;
  
  scripts.each((index, script) => {
    const scriptContent = cheerio(script).html();
    
    if (scriptContent && scriptContent.includes('window.__DATA__')) {
      try {
        const dataMatch = scriptContent.match(/window\.__DATA__\s*=\s*({.+});/s);
        if (dataMatch && dataMatch[1]) {
          const jsonStr = dataMatch[1];
          const data = JSON.parse(jsonStr);
          
          if (data.campaigns && Array.isArray(data.campaigns)) {
            campaignsData = data.campaigns;
          }
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
    
    if (!campaignsData && scriptContent && scriptContent.includes('let data = [')) {
      try {
        const startIndex = scriptContent.indexOf('let data = [');
        if (startIndex !== -1) {
          let bracketCount = 0;
          let inString = false;
          let escapeNext = false;
          let endIndex = -1;
          
          for (let i = startIndex + 11; i < scriptContent.length; i++) {
            const char = scriptContent[i];
            
            if (escapeNext) {
              escapeNext = false;
              continue;
            }
            
            if (char === '\\') {
              escapeNext = true;
              continue;
            }
            
            if (char === '"' && !inString) {
              inString = true;
            } else if (char === '"' && inString) {
              inString = false;
            }
            
            if (!inString) {
              if (char === '[' || char === '{') {
                bracketCount++;
              } else if (char === ']' || char === '}') {
                bracketCount--;
                if (bracketCount === 0 && char === ']') {
                  endIndex = i + 1;
                  break;
                }
              }
            }
          }
          
          if (endIndex !== -1) {
            const dataArrayStr = scriptContent.substring(startIndex + 11, endIndex);
            const parsed = JSON.parse(dataArrayStr);
            if (Array.isArray(parsed) && parsed.length > 0) {
              campaignsData = parsed;
            }
          }
        }
      } catch (e) {
        // Continue search
      }
    }
  });
  
  if (!campaignsData) {
    const dataRegex = /let\s+data\s*=\s*(\[[\s\S]*?\]);/;
    const match = content.match(dataRegex);
    if (match && match[1]) {
      try {
        campaignsData = JSON.parse(match[1]);
      } catch (e) {
        // Ignore
      }
    }
  }
  
  return campaignsData || [];
}

function writeToAutostopSheet(spreadsheet, trickyCampaignsData, allCampaignsData) {
  const sheetName = "Autostop_Impaired";
  
  let sheet = spreadsheet.getSheetByName(sheetName);
  let isNewSheet = false;
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    isNewSheet = true;
  }
  
  const headers = ["ID", "Impaired ID", "Title", "Impaired Title", "BI URL", "Last Updated"];
  
  const existingCampaignStatuses = {};
  
  if (!isNewSheet) {
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      try {
        const dataRange = sheet.getRange(2, 1, lastRow - 1, 6);
        const values = dataRange.getDisplayValues();
        const backgrounds = dataRange.getBackgrounds();
        
        for (let i = 0; i < values.length; i++) {
          const row = values[i];
          const background = backgrounds[i][0];
          
          let campaignId = String(row[0] || "").trim();
          
          if (campaignId.includes('=HYPERLINK')) {
            const match = campaignId.match(/=HYPERLINK\([^,]+,\s*"([^"]+)"\)/);
            if (match) {
              campaignId = match[1];
            }
          }
          
          let impairedId = String(row[1] || "").trim();
          if (impairedId.includes('=HYPERLINK')) {
            const match = impairedId.match(/=HYPERLINK\([^,]+,\s*"([^"]+)"\)/);
            if (match) {
              impairedId = match[1];
            }
          }
          
          if (campaignId && /^\d+$/.test(campaignId)) {
            const wasActive = background !== "#FFCCCC" && background !== "#ffcccc";
            existingCampaignStatuses[campaignId] = {
              wasActive: wasActive,
              impairedId: impairedId || ""
            };
          }
        }
        
      } catch (e) {
        // Ignore errors when reading existing data
      }
    }
  }
  
  const impairedCampaignsMap = {};
  const impairedTitlesMap = {};
  const allImpairedCampaigns = [];
  const usedImpairedIds = new Set();
  
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
  
  let foundConnections = 0;
  for (const impairedCampaign of allImpairedCampaigns) {
    const relatedMatch = impairedCampaign.title.match(/related\s*=\s*(\d+)/i);
    if (relatedMatch && relatedMatch[1]) {
      const relatedId = relatedMatch[1];
      const trickyCampaign = trickyCampaignsData.find(c => String(c.id) === relatedId);
      if (trickyCampaign) {
        impairedCampaignsMap[relatedId] = impairedCampaign.id;
        usedImpairedIds.add(impairedCampaign.id);
        foundConnections++;
      }
    }
  }
  
  const currentTime = new Date();
  const finalData = [];
  const campaignsToStop = [];
  const campaignsToStart = [];
  const currentActiveCampaignIds = new Set();
  
  for (const campaign of trickyCampaignsData) {
    const campaignId = String(campaign.id);
    currentActiveCampaignIds.add(campaignId);
    
    const impairedId = impairedCampaignsMap[campaignId] || "";
    let impairedTitle = "";
    
    const existingStatus = existingCampaignStatuses[campaignId];
    const finalImpairedId = impairedId || (existingStatus ? existingStatus.impairedId : "");
    
    if (finalImpairedId) {
      impairedTitle = impairedTitlesMap[finalImpairedId] || "";
    }
    
    const biUrl = campaign.bi_url || "";
    const rowData = [
      campaignId,
      finalImpairedId,
      campaign.title || "",
      impairedTitle,
      biUrl ? `=HYPERLINK("${trickyBaseUrl}${biUrl}", "Link")` : "",
      currentTime
    ];
    
    finalData.push({
      data: rowData,
      isActive: true,
      campaignId: campaignId,
      impairedId: finalImpairedId,
      wasActive: existingStatus ? existingStatus.wasActive : true
    });
    
    if (existingStatus && !existingStatus.wasActive && finalImpairedId) {
      campaignsToStart.push(finalImpairedId);
    }
  }
  
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
        impairedId: status.impairedId,
        wasActive: status.wasActive
      });
      
      if (status.wasActive && status.impairedId) {
        campaignsToStop.push(status.impairedId);
      }
    }
  }
  
  const addedImpairedIds = new Set();
  
  for (const row of finalData) {
    if (row.data[1]) {
      addedImpairedIds.add(String(row.data[1]));
    }
  }
  
  let addedUnpairedCount = 0;
  for (const impairedCampaign of allImpairedCampaigns) {
    const impairedId = String(impairedCampaign.id);
    
    if (!usedImpairedIds.has(impairedCampaign.id) && !addedImpairedIds.has(impairedId)) {
      const rowData = [
        "",
        impairedId,
        "",
        impairedCampaign.title,
        "",
        currentTime
      ];
      
      finalData.push({
        data: rowData,
        isActive: true,
        campaignId: "",
        impairedId: impairedId,
        wasActive: true
      });
      
      addedImpairedIds.add(impairedId);
      addedUnpairedCount++;
    }
  }
  
  const currentLastRow = sheet.getLastRow();
  const targetRows = finalData.length + 1;
  
  if (currentLastRow < targetRows) {
    sheet.insertRows(currentLastRow + 1, targetRows - currentLastRow);
  } else if (currentLastRow > targetRows && currentLastRow > 2) {
    const rowsToDelete = Math.min(currentLastRow - targetRows, currentLastRow - 2);
    if (rowsToDelete > 0) {
      sheet.deleteRows(targetRows + 1, rowsToDelete);
    }
  }
  
  if (sheet.getLastRow() > 1) {
    const clearRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length);
    clearRange.clear();
  }
  
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#4285F4");
  headerRange.setFontColor("#FFFFFF");
  sheet.setFrozenRows(1);
  
  if (finalData.length > 0) {
    const dataValues = finalData.map(row => row.data);
    const dataRange = sheet.getRange(2, 1, dataValues.length, headers.length);
    dataRange.setValues(dataValues);
    
    const backgrounds = [];
    
    for (let i = 0; i < finalData.length; i++) {
      const row = finalData[i];
      const rowIndex = i + 2;
      
      const rowBackground = row.isActive ? null : "#FFCCCC";
      backgrounds.push([rowBackground, rowBackground, rowBackground, rowBackground, rowBackground, rowBackground]);
      
      if (row.campaignId) {
        try {
          const campaignRichText = SpreadsheetApp.newRichTextValue()
            .setText(row.campaignId)
            .setLinkUrl(`${trickyBaseUrl}/campaigns/${row.campaignId}`)
            .build();
          sheet.getRange(rowIndex, 1).setRichTextValue(campaignRichText);
        } catch (e) {
          sheet.getRange(rowIndex, 1).setFormula(`=HYPERLINK("${trickyBaseUrl}/campaigns/${row.campaignId}", "${row.campaignId}")`);
        }
      }
      
      if (row.impairedId) {
        try {
          const impairedRichText = SpreadsheetApp.newRichTextValue()
            .setText(row.impairedId)
            .setLinkUrl(`${trickyBaseUrl}/campaigns/${row.impairedId}`)
            .build();
          sheet.getRange(rowIndex, 2).setRichTextValue(impairedRichText);
        } catch (e) {
          sheet.getRange(rowIndex, 2).setFormula(`=HYPERLINK("${trickyBaseUrl}/campaigns/${row.impairedId}", "${row.impairedId}")`);
        }
      }
    }
    
    if (backgrounds.length > 0) {
      dataRange.setBackgrounds(backgrounds);
    }
    
    const timeColumn = sheet.getRange(2, 6, finalData.length, 1);
    timeColumn.setNumberFormat("yyyy-mm-dd hh:mm:ss");
    
    sheet.autoResizeColumns(1, headers.length);
  }
  
  if (campaignsToStop.length > 0) {
    updateImpairedCampaignsStatus(campaignsToStop, false);
  }
  
  if (campaignsToStart.length > 0) {
    updateImpairedCampaignsStatus(campaignsToStart, true);
  }
}

function updateImpairedCampaignsStatus(campaignIds, active) {
  const batchSize = 10;
  const retryDelay = 1000;
  const maxRetries = 3;
  
  for (let i = 0; i < campaignIds.length; i += batchSize) {
    const batch = campaignIds.slice(i, i + batchSize);
    
    for (const campaignId of batch) {
      let success = false;
      
      for (let attempt = 1; attempt <= maxRetries && !success; attempt++) {
        try {
          const response = UrlFetchApp.fetch(`https://app.appgrowth.com/campaigns2/${campaignId}`, {
            method: "patch",
            headers: {
              "Authorization": trickyApiToken,
              "Content-Type": "application/json"
            },
            payload: JSON.stringify({ active: active }),
            muteHttpExceptions: true
          });
          
          const responseCode = response.getResponseCode();
          
          if (responseCode === 200 || responseCode === 204) {
            success = true;
          } else if (responseCode >= 500 || responseCode === 429) {
            if (attempt < maxRetries) {
              Utilities.sleep(retryDelay * attempt);
            }
          } else {
            break;
          }
          
        } catch (error) {
          if (attempt < maxRetries) {
            Utilities.sleep(retryDelay * attempt);
          }
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

function randomDelayTricky(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function maskSensitiveDataTricky(data) {
  if (!data) return '';
  if (typeof data !== 'string') {
    if (Array.isArray(data)) {
      return data.map(item => maskSensitiveDataTricky(item)).join(', ');
    } else {
      try {
        data = String(data);
      } catch (e) {
        return '[НЕСТРОКОВЫЕ ДАННЫЕ]';
      }
    }
  }
  return data.replace(/(token|session)=([^;]+)/gi, '$1=[MASKED]');
}