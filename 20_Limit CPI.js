function calculateMaxCPI() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bundle Grouped Campaigns');
    if (!sheet) throw new Error('Лист "Bundle Grouped Campaigns" не найден');
    
    var values = sheet.getDataRange().getValues();
    var headerRow = values[0];
    
    var eARPU365ColumnIndex = headerRow.indexOf('eARPU 365');
    var limitCPIColumnIndex = headerRow.indexOf('Limit СPI');
    
    if (eARPU365ColumnIndex === -1 || limitCPIColumnIndex === -1) {
      throw new Error('Не удалось найти колонку eARPU 365 или Limit СPI');
    }
    
    var newValues = [];
    
    for (var i = 1; i < values.length; i++) {
      var eARPU365 = parseFloat(values[i][eARPU365ColumnIndex]);
      var limitCPI = '';
      
      if (!isNaN(eARPU365) && eARPU365 !== 0) {
        limitCPI = Number((eARPU365 / 1.6).toFixed(2));
      }
      
      newValues.push([limitCPI]);
    }
    
    if (newValues.length > 0) {
      sheet.getRange(2, limitCPIColumnIndex + 1, newValues.length, 1).setValues(newValues);
    }
    
  } catch (error) {
    throw error;
  }
}

function runMaxCPICalculation() {
  try {
    calculateMaxCPI();
  } catch (error) {
    throw error;
  }
}

function safeLog(message) {
  try {
    console.log(message);
  } catch (e) {
    // Silent error handling
  }
}