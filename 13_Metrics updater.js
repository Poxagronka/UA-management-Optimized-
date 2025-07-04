function updateBundleGroupedCampaigns() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var hiddenStatsSheet = spreadsheet.getSheetByName('AppodealStatsHidden');
  var bundleGroupedSheet = spreadsheet.getSheetByName('Bundle Grouped Campaigns');
  
  if (!hiddenStatsSheet || !bundleGroupedSheet) {
    throw new Error('One or both sheets not found. Please check sheet names.');
  }
  
  var hiddenStatsData = hiddenStatsSheet.getDataRange().getValues();
  var bundleGroupedData = bundleGroupedSheet.getDataRange().getValues();
  
  function findColumnIndexExact(headerRow, targetName) {
    for (var i = 0; i < headerRow.length; i++) {
      if (headerRow[i] === targetName) return i;
    }
    return -1;
  }
  
  function extractLocale(campaignName) {
    var m = campaignName.match(/\b([A-Z]{3})\b/);
    return m ? m[1] : '';
  }
  
  var hiddenHeaders = hiddenStatsData[0];
  var bundleHeaders = bundleGroupedData[0];
  
  var hiddenIdIdx = findColumnIndexExact(hiddenHeaders, 'Campaign ID');
  var bundleIdIdx = findColumnIndexExact(bundleHeaders, 'Campaign ID/Link');
  var bundleLocalIdx = findColumnIndexExact(bundleHeaders, 'Local');
  var hiddenAutoIdx = findColumnIndexExact(hiddenHeaders, 'is automated');
  var bundleAutoIdx = findColumnIndexExact(bundleHeaders, 'Is Automated');
  
  if ([hiddenIdIdx, bundleIdIdx, bundleLocalIdx, hiddenAutoIdx, bundleAutoIdx].some(idx => idx === -1)) {
    throw new Error('Ensure Campaign ID, Local, and Is Automated columns exist.');
  }
  
  var columnsToUpdate = [
    {
      bundleIdx: findColumnIndexExact(bundleHeaders, 'eARPU 365'),
      hiddenIdx: findColumnIndexExact(hiddenHeaders, 'Forecasted ARPU')
    },
    {
      bundleIdx: findColumnIndexExact(bundleHeaders, 'IPM'),
      hiddenIdx: findColumnIndexExact(hiddenHeaders, 'IPM')
    },
    {
      bundleIdx: findColumnIndexExact(bundleHeaders, 'eROAS d365'),
      hiddenIdx: findColumnIndexExact(hiddenHeaders, 'ROAS')
    },
    {
      bundleIdx: findColumnIndexExact(bundleHeaders, 'eProfit d730'),
      hiddenIdx: findColumnIndexExact(hiddenHeaders, 'Forecasted Profit'),
      divideBy: 10
    },
    {
      bundleIdx: bundleAutoIdx,
      hiddenIdx: hiddenAutoIdx
    }
  ];
  
  columnsToUpdate.forEach(function(col) {
    if (col.bundleIdx === -1 || col.hiddenIdx === -1) {
      throw new Error('Column mapping error: ' + JSON.stringify(col));
    }
  });
  
  var lookup = {};
  var nameIdx = findColumnIndexExact(hiddenHeaders, 'Campaign Name');
  for (var i = 1; i < hiddenStatsData.length; i++) {
    var id = hiddenStatsData[i][hiddenIdIdx];
    var name = hiddenStatsData[i][nameIdx] || '';
    if (id) {
      lookup[id] = {
        row: hiddenStatsData[i],
        locale: extractLocale(name)
      };
    }
  }
  
  var updates = 0;
  for (var r = 1; r < bundleGroupedData.length; r++) {
    var row = bundleGroupedData[r];
    var id = row[bundleIdIdx];
    if (lookup[id]) {
      columnsToUpdate.forEach(function(col) {
        var val = lookup[id].row[col.hiddenIdx];
        if (col.divideBy) {
          val = val / col.divideBy;
        }
        bundleGroupedSheet
          .getRange(r + 1, col.bundleIdx + 1)
          .setValue(val);
      });
      
      var loc = lookup[id].locale;
      if (loc) {
        bundleGroupedSheet
          .getRange(r + 1, bundleLocalIdx + 1)
          .setValue(loc);
      }
      updates++;
    }
  }
}