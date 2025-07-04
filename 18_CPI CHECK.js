function checkHighCPI() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bundle Grouped Campaigns');
    if (!sheet) return;

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2) return;

    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var cpiCol = -1, limitCol = -1, localCol = -1, eroasCol = -1, isAutomatedCol = -1;
    
    for (var i = 0; i < headers.length; i++) {
      var header = String(headers[i]).trim().toLowerCase();
      if (header.indexOf('today cpi') !== -1 || header.indexOf('cpi today') !== -1) {
        cpiCol = i + 1;
      } else if (header.indexOf('limit cpi') !== -1 || header.indexOf('cpi limit') !== -1 || header === 'limit сpi') {
        limitCol = i + 1;
      } else if (header === 'local' || header === 'country' || header === 'geo') {
        localCol = i + 1;
      } else if (header.indexOf('eroas d365') !== -1) {
        eroasCol = i + 1;
      } else if (header.indexOf('is automated') !== -1 || header === 'automated') {
        isAutomatedCol = i + 1;
      }
    }
    
    if (cpiCol === -1 || localCol === -1) return;

    var allData = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var redColor = '#EF5350', blueColor = '#4169E1', blackColor = '#000000';
    
    var cpiColors = [], cpiWeights = [], eroasColors = [], eroasWeights = [];
    
    for (var i = 0; i < allData.length; i++) {
      cpiColors.push(blackColor);
      cpiWeights.push('normal');
      if (eroasCol !== -1) {
        eroasColors.push(blackColor);
        eroasWeights.push('normal');
      }
    }
    
    for (var i = 0; i < allData.length; i++) {
      var row = allData[i];
      
      try {
        var cpiVal = parseFloat(row[cpiCol - 1]) || 0;
        var limitVal = limitCol !== -1 ? parseFloat(row[limitCol - 1]) : null;
        var country = localCol !== -1 ? String(row[localCol - 1]).trim() : '';
        var isAutomated = false;
        
        if (isAutomatedCol !== -1) {
          isAutomated = String(row[isAutomatedCol - 1]).trim().toUpperCase() === 'TRUE';
        }
        
        var tier = getCountryTier(country);
        var modified = false;
        
        if (!isAutomated) {
          if (limitVal !== null && !isNaN(limitVal) && cpiVal > limitVal) {
            cpiColors[i] = blueColor;
            cpiWeights[i] = 'bold';
            modified = true;
          } else {
            var thresh = getCPIThresholdByCountryTier(tier);
            if (cpiVal > thresh) {
              cpiColors[i] = redColor;
              cpiWeights[i] = 'bold';
              modified = true;
            }
          }
        }
        
        if (eroasCol !== -1) {
          var eroasVal = parseFloat(row[eroasCol - 1]);
          if (!isNaN(eroasVal) && eroasVal < 80) {
            eroasColors[i] = redColor;
            eroasWeights[i] = 'bold';
            modified = true;
          }
        }
        
      } catch (e) {
        // Silent error handling
      }
    }
    
    var cpiColors2D = cpiColors.map(function(color) { return [color]; });
    var cpiWeights2D = cpiWeights.map(function(weight) { return [weight]; });
    
    var cpiRange = sheet.getRange(2, cpiCol, allData.length);
    cpiRange.setFontColors(cpiColors2D);
    cpiRange.setFontWeights(cpiWeights2D);
    
    if (eroasCol !== -1) {
      var eroasColors2D = eroasColors.map(function(color) { return [color]; });
      var eroasWeights2D = eroasWeights.map(function(weight) { return [weight]; });
      
      var eroasRange = sheet.getRange(2, eroasCol, allData.length);
      eroasRange.setFontColors(eroasColors2D);
      eroasRange.setFontWeights(eroasWeights2D);
    }
    
  } catch (error) {
    // Silent error handling
  }
}

function getCountryTier(countryCode) {
  if (!countryCode) return 4;
  var code = String(countryCode).trim().toUpperCase();
  var map2 = {'CA':'CAN','AU':'AUS','KR':'KOR','BR':'BRA','MX':'MEX','TH':'THA','TW':'TWN','NZ':'NZL','VN':'VNM','HK':'HKG','JP':'JPN'};
  if (map2[code]) code = map2[code];
  if (code === 'USA') return 1;
  if (['CAN','GBR','AUS','DEU'].indexOf(code) !== -1) return 2;
  if (['JPN','KOR','FRA','ITA','ESP','NZL','SGP','NOR','SWE','DNK','FIN'].indexOf(code) !== -1) return 3;
  return 4;
}

function getCPIThresholdByCountryTier(tier) {
  switch (tier) {
    case 1: return 1.9;
    case 2: return 1.0;
    case 3: return 0.5;
    default: return 0.15;
  }
}

function safeLog(message) {
  try {
    console.log(message);
  } catch (e) {
    // Silent error handling
  }
}