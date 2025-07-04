var CACHE_GROUPS = 600;

function log(message) {
  Logger.log(message);
}

function getNumericVal(val) {
  if (val === "no data" || val === "") return -Infinity;
  var num = parseFloat(val);
  return isNaN(num) ? -Infinity : num;
}

function isNonStandardBackground(color) {
  if (!color) return false;
  color = color.toLowerCase().trim();
  return color !== '' && color !== '#ffffff' && color !== 'white' && color !== 'transparent';
}

function isGroupHeaderBackground(color) {
  if (!color) return false;
  return color.toLowerCase().trim() === '#cbffdf';
}

function identifyGroups(allData, allBackgrounds, sourceColIndex) {
  var groups = [];
  var currentStart = -1;
  var currentBundle = null;
  
  for (var i = 1; i < allData.length; i++) {
    var bg = allBackgrounds[i][0];
    if (isGroupHeaderBackground(bg)) {
      if (currentStart !== -1) {
        groups.push({ start: currentStart, end: i-1, bundleId: currentBundle });
      }
      currentStart = i;
      currentBundle = allData[i][sourceColIndex];
    }
  }
  
  if (currentStart !== -1) {
    groups.push({ start: currentStart, end: allData.length-1, bundleId: currentBundle });
  }
  
  return groups;
}

function hasAnyValues(sheet, column, startRow, endRow) {
  var range = sheet.getRange(startRow, column, endRow - startRow + 1, 1);
  var values = range.getValues();
  
  for (var i = 0; i < values.length; i++) {
    var val = values[i][0];
    if (val !== "" && val !== "no data" && val !== 0 && val !== "0" && val !== "0.00") {
      return true;
    }
  }
  return false;
}

function updateBundleGroupTotals(existingSheet, existingHeader, existingGroups) {
  var TARGET = "eProfit d730";
  
  try {
    var sheet = existingSheet;
    var header = existingHeader;
    var groups = existingGroups;
    
    if (!sheet) {
      var ss = SpreadsheetApp.openById("1U5i1MSEodBPj1dF-qlyQKBABegwVpPR7-t-1rKoMhzQ");
      sheet = ss.getSheetByName("Bundle Grouped Campaigns");
      if (!sheet) return;
    }
    
    if (!header) {
      header = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
    }
    
    if (!groups) {
      var data = sheet.getRange(1,1,sheet.getLastRow(), sheet.getLastColumn()).getValues();
      var bgs = sheet.getRange(1,1,sheet.getLastRow(),1).getBackgrounds();
      var srcIdx = header.indexOf("Source");
      groups = identifyGroups(data, bgs, srcIdx);
    }
    
    var colIdx = header.indexOf(TARGET);
    if (colIdx === -1) return;

    var cache = CacheService.getScriptCache();
    var key = "bundle_group_totals_" + sheet.getSheetId();
    var cached = cache.get(key);
    var now = Math.floor(Date.now()/1000);
    
    if (cached) {
      var obj = JSON.parse(cached);
      if (obj.timestamp && now - obj.timestamp < CACHE_GROUPS) {
        for (var i = 0; i < obj.groupTotals.length && i < groups.length; i++) {
          if (obj.groupTotals[i] !== null) {
            sheet.getRange(groups[i].start+1, colIdx+1).setValue(obj.groupTotals[i]);
          } else {
            sheet.getRange(groups[i].start+1, colIdx+1).setValue("");
          }
        }
        if (obj.overall !== undefined && obj.overall !== null) {
          var idIdx = header.indexOf("Campaign ID/Link");
          var ids = sheet.getRange(1, idIdx+1, sheet.getLastRow(),1).getValues();
          for (var j=0; j<ids.length; j++) {
            if (ids[j][0]==="Overall") {
              sheet.getRange(j+1, colIdx+1).setValue(obj.overall);
              break;
            }
          }
        }
        return;
      }
    }

    var allRowBackgrounds = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getBackgrounds();
    var vals = sheet.getRange(1, colIdx+1, sheet.getLastRow(),1).getValues();
    var totals = [];
    var eProfitCol = colIdx;
    
    for (var g=0; g<groups.length; g++) {
      var sum = 0;
      var allInvalid = true;
      var hasValues = hasAnyValues(sheet, colIdx+1, groups[g].start+2, groups[g].end+1);
      
      if (!hasValues) {
        sheet.getRange(groups[g].start+1, colIdx+1).setValue("");
        totals.push(null);
        continue;
      }
      
      for (var r=groups[g].start+1; r<=groups[g].end; r++) {
        var rowHasNonStandardBg = isNonStandardBackground(allRowBackgrounds[r][eProfitCol]);
        
        if (!rowHasNonStandardBg) {
          var v = getNumericVal(vals[r][0]);
          if (v !== -Infinity) {
            sum += v;
            allInvalid = false;
          }
        }
      }
      
      if (!allInvalid) {
        var form = sum.toFixed(2);
        sheet.getRange(groups[g].start+1, colIdx+1).setValue(form);
        totals.push(parseFloat(form));
      } else {
        sheet.getRange(groups[g].start+1, colIdx+1).setValue("");
        totals.push(null);
      }
    }
    
    var overall = null;
    var idCol = header.indexOf("Campaign ID/Link");
    if (idCol !== -1) {
      var idVals = sheet.getRange(1, idCol+1, sheet.getLastRow(),1).getValues();
      for (var k=0; k<idVals.length; k++) {
        if (idVals[k][0]==="Overall") {
          var s = 0; 
          var validGroups = 0;
          for(var t=0; t<totals.length; t++) {
            if (totals[t] !== null) {
              s += totals[t];
              validGroups++;
            }
          }
          if (validGroups > 0) {
            overall = s.toFixed(2);
            sheet.getRange(k+1, colIdx+1).setValue(overall);
          } else {
            sheet.getRange(k+1, colIdx+1).setValue("");
          }
          break;
        }
      }
    }
    
    cache.put(key, JSON.stringify({ 
      timestamp: now, 
      groupTotals: totals, 
      overall: overall 
    }), CACHE_GROUPS);
    
  } catch (e) {
    log("❌ Ошибка: " + e.message);
  }
}

function updateROASValuesOnly() {
  try {
    var ss = SpreadsheetApp.openById("1U5i1MSEodBPj1dF-qlyQKBABegwVpPR7-t-1rKoMhzQ");
    var sheet = ss.getSheetByName("Bundle Grouped Campaigns");
    if (!sheet) return;
    
    var headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
    var roasIdx = headers.indexOf("eROAS d365");
    if (roasIdx===-1) return;

    var cache = CacheService.getScriptCache();
    var key = "bundle_roas_values_"+sheet.getSheetId();
    var cached = cache.get(key);
    var now = Math.floor(Date.now()/1000);
    
    if (cached) {
      var obj = JSON.parse(cached);
      if (obj.timestamp && now-obj.timestamp<CACHE_GROUPS) {
        for (var i=0; i<obj.groupValues.length; i++) {
          if (obj.groupValues[i] !== null && obj.groupRows[i]) {
            sheet.getRange(obj.groupRows[i], obj.roasCol+1).setValue(obj.groupValues[i]);
          } else if (obj.groupRows[i]) {
            sheet.getRange(obj.groupRows[i], obj.roasCol+1).setValue("");
          }
        }
        if (obj.overallVal !== null && obj.overallRow) {
          sheet.getRange(obj.overallRow, obj.roasCol+1).setValue(obj.overallVal);
        } else if (obj.overallRow) {
          sheet.getRange(obj.overallRow, obj.roasCol+1).setValue("");
        }
        return;
      }
    }
    
    var allBackgrounds = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getBackgrounds();
    var bgs = sheet.getRange(1,1,sheet.getLastRow(),1).getBackgrounds();
    var vals = sheet.getRange(1, roasIdx+1, sheet.getLastRow(),1).getValues();
    var ids = sheet.getRange(1,1,sheet.getLastRow(),1).getValues();
    var hdrs = [];
    var overallRow = -1;
    
    for (var j=0; j<bgs.length; j++) {
      var c = bgs[j][0].toLowerCase();
      if (c==="#cbffdf") hdrs.push(j+1);
      if (ids[j][0]==="Overall") overallRow=j+1;
    }
    
    var sums=[];
    var cnts=[];
    var rows=[];
    var groupValues = [];
    
    for (var x=0; x<hdrs.length; x++) {
      var start=hdrs[x];
      var end = x<hdrs.length-1? hdrs[x+1]-1 : sheet.getLastRow();
      var hasValues = hasAnyValues(sheet, roasIdx+1, start+1, end);
      
      if (!hasValues) {
        sheet.getRange(start, roasIdx+1).setValue("");
        groupValues.push(null);
        sums.push(0);
        cnts.push(0);
        rows.push(start);
        continue;
      }
      
      var sum=0; 
      var cnt=0;
      var allInvalid = true;
      
      for (var y=start+1; y<=end; y++) {
        var rowHasNonStandardBg = isNonStandardBackground(allBackgrounds[y-1][roasIdx]);
        
        if (!rowHasNonStandardBg) {
          var n = getNumericVal(vals[y-1][0]);
          if (n!==-Infinity) { 
            sum+=n; 
            cnt++; 
            allInvalid = false;
          }
        }
      }
      
      if (!allInvalid && cnt > 0) {
        var avg = (sum/cnt).toFixed(2);
        sheet.getRange(start, roasIdx+1).setValue(avg);
        groupValues.push(avg);
      } else {
        sheet.getRange(start, roasIdx+1).setValue("");
        groupValues.push(null);
      }
      
      sums.push(sum);
      cnts.push(cnt);
      rows.push(start);
    }
    
    var overallVal = null;
    var totalCnt = 0;
    for (var z=0; z<cnts.length; z++) {
      totalCnt += cnts[z];
    }
    
    if (totalCnt > 0 && overallRow > 0) {
      var total = 0; 
      for(var z=0; z<sums.length; z++) {
        total += sums[z];
      }
      overallVal = (total/totalCnt).toFixed(2);
      sheet.getRange(overallRow, roasIdx+1).setValue(overallVal);
    } else if (overallRow > 0) {
      sheet.getRange(overallRow, roasIdx+1).setValue("");
    }
    
    cache.put(key, JSON.stringify({ 
      timestamp: now, 
      roasCol: roasIdx, 
      groupValues: groupValues, 
      groupRows: rows, 
      overallVal: overallVal, 
      overallRow: overallRow
    }), CACHE_GROUPS);
    
  } catch(e) {
    log("❌ Ошибка eROAS: " + e.message);
  }
}

function clearMetricsCache() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Bundle Grouped Campaigns");
  if (!sheet) return;
  
  var cache = CacheService.getScriptCache();
  cache.remove("bundle_group_totals_" + sheet.getSheetId());
  cache.remove("bundle_roas_values_" + sheet.getSheetId());
}

function groupMetrics() {
  updateBundleGroupTotals();
  updateROASValuesOnly();
}