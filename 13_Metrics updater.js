function updateBundleGroupedCampaigns() {
  UTILS.log('🔄 Metrics: Начинаем updateBundleGroupedCampaigns (взвешенный по спенду eROAS d730)');
  
  const spreadsheet = SpreadsheetApp.openById(UTILS.CONFIG.SPREADSHEET_ID);
  const hiddenStatsSheet = spreadsheet.getSheetByName('AppodealStatsHidden');
  const bundleGroupedSheet = spreadsheet.getSheetByName('Bundle Grouped Campaigns');
  
  if (!hiddenStatsSheet || !bundleGroupedSheet) {
    UTILS.log(`❌ Metrics: Не найдены необходимые листы - Hidden: ${!!hiddenStatsSheet}, Bundle: ${!!bundleGroupedSheet}`);
    throw new Error('Required sheets not found');
  }
  
  const hiddenStatsData = hiddenStatsSheet.getDataRange().getValues();
  const bundleGroupedData = bundleGroupedSheet.getDataRange().getValues();
  
  UTILS.log(`📊 Metrics: Исходные данные - Hidden: ${hiddenStatsData.length - 1} строк, Bundle: ${bundleGroupedData.length - 1} строк`);
  
  const hiddenHeaders = hiddenStatsData[0];
  const bundleHeaders = bundleGroupedData[0];
  
  const hiddenIdIdx = UTILS.findColumnIndex(hiddenHeaders, ['Campaign ID']);
  const bundleIdIdx = UTILS.findColumnIndex(bundleHeaders, ['Campaign ID/Link']);
  const bundleLocalIdx = UTILS.findColumnIndex(bundleHeaders, ['Local']);
  const hiddenAutoIdx = UTILS.findColumnIndex(hiddenHeaders, ['Is Automated']);
  const bundleAutoIdx = UTILS.findColumnIndex(bundleHeaders, ['Is Automated']);
  
  UTILS.log(`🔍 Metrics: Найдены колонки - Hidden ID: ${hiddenIdIdx}, Bundle ID: ${bundleIdIdx}, Local: ${bundleLocalIdx}, Auto: ${hiddenAutoIdx}/${bundleAutoIdx}`);
  
  if ([hiddenIdIdx, bundleIdIdx, bundleLocalIdx, hiddenAutoIdx, bundleAutoIdx].some(idx => idx === -1)) {
    UTILS.log(`❌ Metrics: Не найдены необходимые колонки`);
    throw new Error('Required columns not found');
  }
  
  const columnsToUpdate = [
    { bundleIdx: UTILS.findColumnIndex(bundleHeaders, 'eARPU 365'), hiddenIdx: UTILS.findColumnIndex(hiddenHeaders, 'eARPU 365') },
    { bundleIdx: UTILS.findColumnIndex(bundleHeaders, 'IPM'), hiddenIdx: UTILS.findColumnIndex(hiddenHeaders, 'IPM') },
    { bundleIdx: UTILS.findColumnIndex(bundleHeaders, ['eROAS d730', 'eroas d730']), hiddenIdx: UTILS.findColumnIndex(hiddenHeaders, ['eROAS 730']) },
    { bundleIdx: UTILS.findColumnIndex(bundleHeaders, 'eProfit d730'), hiddenIdx: UTILS.findColumnIndex(hiddenHeaders, 'eProfit 730'), divideBy: 10 },
    { bundleIdx: bundleAutoIdx, hiddenIdx: hiddenAutoIdx }
  ];
  
  const validColumns = columnsToUpdate.filter(col => col.bundleIdx !== -1 && col.hiddenIdx !== -1);
  UTILS.log(`📋 Metrics: Найдено ${validColumns.length} колонок для обновления`);
  
  // Создание lookup таблицы
  const lookup = {};
  const nameIdx = UTILS.findColumnIndex(hiddenHeaders, 'Campaign Name');
  
  for (let i = 1; i < hiddenStatsData.length; i++) {
    const id = hiddenStatsData[i][hiddenIdIdx];
    const name = hiddenStatsData[i][nameIdx] || '';
    if (id) {
      lookup[id] = {
        row: hiddenStatsData[i],
        locale: UTILS.extractLocale(name)
      };
    }
  }
  
  UTILS.log(`🗂️ Metrics: Создана lookup таблица для ${Object.keys(lookup).length} кампаний`);
  
  // Применение обновлений только к валидным строкам
  const validRows = UTILS.getValidRows(bundleGroupedSheet);
  const updates = [];
  let matchedCount = 0;
  
  validRows.forEach(row => {
    const id = row.data[bundleIdIdx];
    if (lookup[id]) {
      validColumns.forEach(col => {
        let val = lookup[id].row[col.hiddenIdx];
        if (col.divideBy) val = val / col.divideBy;
        updates.push({ row: row.index + 1, col: col.bundleIdx + 1, value: val });
      });
      
      const loc = lookup[id].locale;
      if (loc) {
        updates.push({ row: row.index + 1, col: bundleLocalIdx + 1, value: loc });
      }
      matchedCount++;
    }
  });
  
  UTILS.log(`🎯 Metrics: Сопоставлено ${matchedCount} кампаний, подготовлено ${updates.length} обновлений`);
  
  if (updates.length > 0) {
    UTILS.batchUpdate(bundleGroupedSheet, updates);
    UTILS.log(`✅ Metrics: Применено ${updates.length} обновлений`);
  }
  
  UTILS.log('✅ Metrics: updateBundleGroupedCampaigns завершен (взвешенный по спенду eROAS d730)');
}