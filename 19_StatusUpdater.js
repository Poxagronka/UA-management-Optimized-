var COMMENTS_CELL_CACHE = null;

function findCommentsCell() {
  if (COMMENTS_CELL_CACHE !== null) return COMMENTS_CELL_CACHE;
  
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName("Bundle Grouped Campaigns");
    
    if (!sheet) {
      var sheets = spreadsheet.getSheets();
      for (var i = 0; i < sheets.length; i++) {
        if (sheets[i].getSheetId().toString() === "1685744408") {
          sheet = sheets[i];
          break;
        }
      }
      if (!sheet) sheet = spreadsheet.getActiveSheet();
    }
    
    var textFinder = sheet.createTextFinder("Comments").matchCase(true).matchEntireCell(true);
    var ranges = textFinder.findAll();
    
    if (ranges && ranges.length > 0) {
      COMMENTS_CELL_CACHE = ranges[0];
      return COMMENTS_CELL_CACHE;
    }
    
    COMMENTS_CELL_CACHE = sheet.getRange("AA1");
    if (COMMENTS_CELL_CACHE.getValue() === "Comments") return COMMENTS_CELL_CACHE;
    
    var dataRange = sheet.getRange(1, 1, 5, 30);
    var values = dataRange.getValues();
    
    for (var row = 0; row < values.length; row++) {
      for (var col = 0; col < values[row].length; col++) {
        if (values[row][col] === "Comments") {
          COMMENTS_CELL_CACHE = sheet.getRange(row + 1, col + 1);
          return COMMENTS_CELL_CACHE;
        }
      }
    }
    
    return null;
  } catch (e) {
    return null;
  }
}

function updateCommentsCellDirectly(message, color) {
  try {
    var commentsCell = findCommentsCell();
    if (!commentsCell) return false;
    
    commentsCell.setValue(message);
    commentsCell.setBackground(color || '#ffffff');
    commentsCell.setFontColor('#333333');
    commentsCell.setFontWeight('bold');
    
    SpreadsheetApp.flush();
    return true;
  } catch (e) {
    return false;
  }
}

function resetCommentsCellCache() {
  COMMENTS_CELL_CACHE = null;
}

function testCommentsUpdate() {
  resetCommentsCellCache();
  var success = updateCommentsCellDirectly("🧪 ТЕСТ: Проверка обновления", "#ffd966");
  if (!success) return;
  
  Utilities.sleep(3000);
  updateCommentsCellDirectly("Comments", "#ffffff");
}

function openSpreadsheetByUrl(url) {
  try {
    var matches = url.match(/\/d\/([\w-]+)/);
    if (matches && matches[1]) {
      return SpreadsheetApp.openById(matches[1]);
    }
    return null;
  } catch (e) {
    return null;
  }
}

function updateCommentsInSpecificSpreadsheet(url, message, color) {
  resetCommentsCellCache();
  
  try {
    var spreadsheet = openSpreadsheetByUrl(url);
    if (!spreadsheet) return false;
    
    return updateCommentsCellDirectly(message, color);
  } catch (e) {
    return false;
  }
}