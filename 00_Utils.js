// 00_Utils.gs - Общие утилиты
const UTILS = {
  // Конфигурация
  CONFIG: {
    SPREADSHEET_ID: "1U5i1MSEodBPj1dF-qlyQKBABegwVpPR7-t-1rKoMhzQ",
    TARGET_SPREADSHEET_ID: "1xRZSs_5GadQ3HjdPwq9FJ7HrSDEMvf9suVCkw53yQUQ",
    API_TOKEN_APPGROWTH: "5633e0c5add593327673a87c41be17da",
    API_TOKEN_APPODEAL: "eyJhbGciOiJIUzUxMiJ9.eyJpc3MiOiJBcHBvZGVhbCIsImF1ZCI6WyJBcHBvZGVhbCJdLCJhZG1pbiI6dHJ1ZSwic3ViIjoyMzU4MzcsInR5cCI6ImFjY2VzcyIsImV4cCI6IjE4OTQ3MzY4MjAifQ.2TSLNElXLvfBxsOAJ4pYk106cSblF9kwkBreA-0Gs5DdRB3WFjo2aZzPKkxUYf8A95lbSpN55t41LJcWzatSCA",
    BASE_URL_APPGROWTH: "https://app.appgrowth.com",
    BASE_URL_APPODEAL: "https://app.appodeal.com/graphql",
    CACHE_EXPIRATION: 24 * 60 * 60,
    BATCH_SIZE: 50,
    MAX_RETRIES: 3,
    TARGET_SHEETS: ["Planning", "Bundle Grouped Campaigns"],
    
    // Структура заголовков для Bundle Grouped Campaigns:
    // Campaign ID/Link, internal id, Edit, Local, Source, Campaign Status, Install limit, 
    // Stopped by install limit, Today Installs, Is Automated, Optimization, Overall Budget,
    // Latest optimization value, Today CPI, Limit СPI, Average CPI in the last 14 days,
    // eARPU 365, Impressions, IPM, eROAS d365, eProfit d730, Daily Budget, Today Spend,
    // Spend in the last 14 days, Paused by, Out of Budget, Comments
  },

  // Логирование
  log: (message) => {
    try {
      if (typeof message === 'object') message = JSON.stringify(message);
      console.log(message.length > 1000 ? message.substring(0, 1000) + '...' : message);
    } catch (e) {}
  },

  // Централизованная проверка валидности строк
  getValidRows: (sheet, options = {}) => {
    const { 
      includeGroupHeaders = false, 
      statusFilter = null, 
      statusColumn = null,
      startRow = 1 
    } = options;
    
    const data = sheet.getDataRange().getValues();
    const backgrounds = sheet.getDataRange().getBackgrounds();
    const validRows = [];
    
    for (let i = startRow; i < data.length; i++) {
      const bgColor = backgrounds[i][0];
      
      // Пропускаем строки с цветным фоном, кроме заголовков групп если нужно
      if (!UTILS.isStandardBackground(bgColor)) {
        if (includeGroupHeaders && bgColor?.toLowerCase() === '#cbffdf') {
          validRows.push({ index: i, isGroupHeader: true, data: data[i] });
        }
        continue;
      }
      
      // Проверка статуса если указано
      if (statusFilter && statusColumn !== null) {
        const status = String(data[i][statusColumn] || '').toLowerCase();
        if (status && status !== statusFilter) continue;
      }
      
      validRows.push({ index: i, isGroupHeader: false, data: data[i] });
    }
    
    return validRows;
  },

  // Упрощенная функция для получения только индексов
  getValidRowIndices: (sheet, options = {}) => {
    return UTILS.getValidRows(sheet, options).map(row => row.index);
  },

  // Извлечение Campaign ID
  extractCampaignId: (cellValue) => {
    if (!cellValue) return null;
    const str = String(cellValue);
    
    if (str.startsWith('=HYPERLINK(')) {
      const match = str.match(/=HYPERLINK\("([^"]+)"/);
      if (match?.[1]) {
        const idMatch = match[1].match(/\/(\d+)$/);
        if (idMatch?.[1]) return idMatch[1];
      }
    }
    
    if (str.includes('appgrowth.com/campaigns/')) {
      const match = str.match(/campaigns\/(\d+)/);
      if (match?.[1]) return match[1];
    }
    
    return /^\d+$/.test(str.trim()) ? str.trim() : null;
  },

  // Поиск индекса колонки
  findColumnIndex: (headers, patterns) => {
    const normalized = headers.map(h => String(h).toLowerCase().trim());
    const searchPatterns = Array.isArray(patterns) ? patterns : [patterns];
    
    for (const pattern of searchPatterns) {
      const index = normalized.indexOf(pattern.toLowerCase());
      if (index !== -1) return index;
    }
    return -1;
  },

  // Получение листа
  getSheet: (sheetName, spreadsheetId = null) => {
    try {
      const ssId = spreadsheetId || UTILS.CONFIG.SPREADSHEET_ID;
      const ss = SpreadsheetApp.openById(ssId);
      return ss.getSheetByName(sheetName);
    } catch (error) {
      UTILS.log(`Error getting sheet ${sheetName}: ${error.message}`);
      return null;
    }
  },

  // Получение целевых листов для обработки
  getTargetSheets: (spreadsheetId = null) => {
    try {
      const ssId = spreadsheetId || UTILS.CONFIG.SPREADSHEET_ID;
      const ss = SpreadsheetApp.openById(ssId);
      return UTILS.CONFIG.TARGET_SHEETS.map(sheetName => ss.getSheetByName(sheetName)).filter(sheet => sheet !== null);
    } catch (error) {
      UTILS.log(`Error getting target sheets: ${error.message}`);
      return [];
    }
  },

  // Проверка стандартного фона
  isStandardBackground: (color) => {
    return !color || color === '' || color === '#ffffff' || color === '#FFFFFF';
  },

  // Безопасный парсинг числа
  parseNumber: (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number' && isFinite(value)) return value;
    if (typeof value === 'string') {
      const clean = value.replace(/[^\d.-]/g, '');
      const parsed = parseFloat(clean);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  },

  // Форматирование даты
  formatDate: (date, format = 'yyyy-MM-dd') => {
    return Utilities.formatDate(date || new Date(), 'GMT', format);
  },

  // Извлечение локали из названия кампании
  extractLocale: (title) => {
    if (!title) return '';
    const match = title.match(/\b([A-Z]{3})\b/);
    return match ? match[1] : '';
  },

  // Извлечение source из названия кампании
  extractSource: (title) => {
    if (!title) return null;
    
    const stopWords = ["ambo", "cpi", "cpa", "cpa2", "bidmachine", "pubnative", "fyber", "smaato", "autobudget", "skipctr", "106", "80", "2"];
    
    const match = title.match(/(?:subject|subj)\s*=\s*([^\s]+(?:\.[^\s]+)*)/i);
    if (match?.[1]) {
      let source = match[1].trim();
      for (const stop of stopWords) {
        const stopIndex = source.search(new RegExp(`\\b${stop}\\b`, 'i'));
        if (stopIndex !== -1) {
          source = source.substring(0, stopIndex).trim();
          break;
        }
      }
      source = source.replace(/[=/]+$/, '').trim();
      if (source && !stopWords.includes(source.toLowerCase())) return source;
    }
    
    const numMatch = title.match(/\b\d{6,}\b/);
    if (numMatch) return numMatch[0];
    
    const pkgMatch = title.match(/\b(com\.|and\.|ru\.)[a-zA-Z0-9._]+/i);
    if (pkgMatch?.[0]?.includes('.')) return pkgMatch[0];
    
    return null;
  },

  // API запрос с повторами
  fetchWithRetry: (url, options, maxRetries = 3) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = UrlFetchApp.fetch(url, { ...options, muteHttpExceptions: true });
        const code = response.getResponseCode();
        
        if (code === 200 || code === 204) return { success: true, response };
        if (code >= 500 || code === 429) throw new Error(`HTTP ${code}`);
        return { success: false, response };
        
      } catch (error) {
        if (attempt < maxRetries) {
          Utilities.sleep(1000 * attempt);
        } else {
          return { success: false, error: error.message };
        }
      }
    }
  },

  // Кеширование
  cache: {
    get: (key) => CacheService.getScriptCache().get(key),
    put: (key, value, expiration = UTILS.CONFIG.CACHE_EXPIRATION) => {
      CacheService.getScriptCache().put(key, typeof value === 'string' ? value : JSON.stringify(value), expiration);
    },
    getAll: (keys) => CacheService.getScriptCache().getAll(keys) || {},
    putAll: (data, expiration = UTILS.CONFIG.CACHE_EXPIRATION) => {
      CacheService.getScriptCache().putAll(data, expiration);
    },
    remove: (key) => CacheService.getScriptCache().remove(key)
  },

  // Сбор Campaign ID из листа
  collectCampaignIds: (sheet, statusFilter = 'running') => {
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const idCol = UTILS.findColumnIndex(headers, ['campaign id/link', 'campaign id', 'id']);
    const statusCol = UTILS.findColumnIndex(headers, ['campaign status', 'status']);
    
    if (idCol === -1) {
      UTILS.log(`❌ CollectIds: Не найдена колонка Campaign ID в листе "${sheet.getName()}"`);
      return [];
    }
    
    const validRows = UTILS.getValidRows(sheet, { 
      statusFilter, 
      statusColumn: statusCol 
    });
    
    return validRows.map(row => ({
      id: UTILS.extractCampaignId(row.data[idCol]),
      rowIndex: row.index + 1,
      sheetName: sheet.getName()
    })).filter(item => item.id);
  },

  // Пакетное обновление
  batchUpdate: (sheet, updates) => {
    if (!updates || updates.length === 0) return;
    
    const grouped = {};
    updates.forEach(update => {
      const key = `${update.row}_${update.col}`;
      grouped[key] = update;
    });
    
    Object.values(grouped).forEach(update => {
      try {
        const range = sheet.getRange(update.row, update.col);
        if (update.richText) {
          range.setRichTextValue(update.richText);
        } else {
          range.setValue(update.value);
        }
      } catch (e) {
        UTILS.log(`Error updating ${update.row},${update.col}: ${e.message}`);
      }
    });
  },

  // Создание гиперссылки
  createHyperlink: (text, url) => {
    return SpreadsheetApp.newRichTextValue().setText(text).setLinkUrl(url).build();
  },

  // Получение диапазона дат
  getDateRange: (daysBack = 10) => ({
    from: UTILS.formatDate(new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)),
    to: UTILS.formatDate(new Date())
  }),

  // Статус скрипта
  status: {
    commentsCell: null, // Координаты ячейки Comments
    
    findCommentsCell: () => {
      try {
        const sheet = UTILS.getSheet('Bundle Grouped Campaigns');
        if (!sheet) return null;
        
        // Ищем ячейку с текстом "Comments" во всем листе
        const dataRange = sheet.getDataRange();
        const values = dataRange.getValues();
        
        for (let row = 0; row < values.length; row++) {
          for (let col = 0; col < values[row].length; col++) {
            if (String(values[row][col]).toLowerCase().trim() === 'comments') {
              const cellLocation = { row: row + 1, col: col + 1 };
              UTILS.status.commentsCell = cellLocation;
              UTILS.log(`✅ Status: Найдена ячейка Comments в позиции [${cellLocation.row}, ${cellLocation.col}]`);
              return cellLocation;
            }
          }
        }
        
        UTILS.log('⚠️ Status: Ячейка Comments не найдена');
        return null;
      } catch (e) {
        UTILS.log(`❌ Status: Ошибка поиска ячейки Comments: ${e.message}`);
        return null;
      }
    },
    
    update: (status, message, color = '#ffffff') => {
      try {
        if (!UTILS.status.commentsCell) return;
        
        const sheet = UTILS.getSheet('Bundle Grouped Campaigns');
        if (!sheet) return;
        
        const cell = sheet.getRange(UTILS.status.commentsCell.row, UTILS.status.commentsCell.col);
        cell.setValue(`[${status}] ${message}`);
        cell.setBackground(color);
        cell.setFontWeight('bold');
        SpreadsheetApp.flush();
      } catch (e) {
        UTILS.log(`❌ Status: Ошибка обновления статуса: ${e.message}`);
      }
    },
    
    restore: () => {
      try {
        if (!UTILS.status.commentsCell) return;
        
        const sheet = UTILS.getSheet('Bundle Grouped Campaigns');
        if (!sheet) return;
        
        const cell = sheet.getRange(UTILS.status.commentsCell.row, UTILS.status.commentsCell.col);
        cell.setValue('Comments');
        cell.setBackground('#ffffff');
        cell.setFontWeight('bold'); // Жирный текст как у других заголовков
        cell.setFontColor('#000000');
        SpreadsheetApp.flush();
        UTILS.log('✅ Status: Восстановлена ячейка Comments');
      } catch (e) {
        UTILS.log(`❌ Status: Ошибка восстановления: ${e.message}`);
      }
    }
  },

  // Обработка ошибок
  handleError: (error, context = '') => {
    const message = `${context}: ${error.message || error}`;
    UTILS.log(message);
    return { success: false, error: message };
  },

  // Проверка валидности ID
  isValidId: (id) => {
    return id && /^\d+$/.test(String(id).trim());
  },

  // Генерация случайной задержки
  randomDelay: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,

  // Очистка памяти
  cleanup: () => {
    try {
      SpreadsheetApp.flush();
      Utilities.sleep(500);
    } catch (e) {}
  },

  // Безопасный toast
  safeToast: (message, title = "Готово", timeout = 10) => {
    try {
      const spreadsheet = SpreadsheetApp.openById(UTILS.CONFIG.SPREADSHEET_ID);
      if (spreadsheet) {
        spreadsheet.toast(message, title, timeout);
      }
    } catch (e) {
      UTILS.log(`Toast error: ${e.message}. Message: ${message}`);
    }
  }
};

// Экспорт для обратной совместимости
function safeLog(message) { UTILS.log(message); }
function extractCampaignId(value) { return UTILS.extractCampaignId(value); }
function findColumnIndex(headers, pattern) { return UTILS.findColumnIndex(headers, pattern); }
function isStandardBackground(color) { return UTILS.isStandardBackground(color); }
function extractLocale(title) { return UTILS.extractLocale(title); }
function extractSource(title) { return UTILS.extractSource(title); }