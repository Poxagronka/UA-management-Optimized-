// 01_Main.gs - Упрощенная версия
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Мои скрипты')
    .addItem('Update all', 'main')
    .addItem('Impaired Autostopper trigger ON/OFF', 'toggleTrickyTrackerTrigger')
    .addItem('Обновить гиперссылки', 'updateHyperlinks')
    .addItem('Логин и обновление кампаний', 'loginAndSaveCampaigns')
    .addItem('Обновить данные Campaign API', 'updateCampaignDataInAllSheets')
    .addItem('Получить отчет Reporting API', 'getReportDataForAllSheets')
    .addItem('Патч Campaign Optimization', 'runPatchCampaignOptimization')
    .addItem('Create source hyperlinks', 'createSourceLinksInPlanning')
    .addSeparator()
    .addItem('Pivot-report', 'createCampaignPivotReport')
    .addItem('Clear Pivot', 'clearAllData')
    .addToUi();
}

function main() {
  const executionId = Utilities.getUuid().substring(0, 8);
  const startTime = new Date();
  const lock = LockService.getScriptLock();
  
  try {
    if (!lock.tryLock(30000)) {
      SpreadsheetApp.getActive().toast("Скрипт уже выполняется", "Ошибка", 10);
      return { success: false, reason: 'already_running' };
    }
    
    UTILS.log(`[${executionId}] ЗАПУСК СКРИПТА`);
    UTILS.status.update("RUNNING", "Initializing script", "#e6f7ff");
    
    const functions = [
      { name: 'updateCampaignIdMappings', func: updateCampaignIdMappings },
      { name: 'toggleCampaignAutoBids', func: toggleCampaignAutoBids },
      { name: 'runPatchCampaignOptimization', func: runPatchCampaignOptimization },
      { name: 'updateCampaignDataInAllSheets', func: updateCampaignDataInAllSheets },
      { name: 'getReportDataForAllSheets', func: getReportDataForAllSheets },
      { name: 'loginAndSaveCampaigns', func: loginAndSaveCampaigns },
      { name: 'updateEROASData', func: updateEROASData },
      { name: 'updateBundleGroupedCampaigns', func: updateBundleGroupedCampaigns },
      { name: 'stopCampaignIfHighImpressionsOrSpend', func: stopCampaignIfHighImpressionsOrSpend },
      { name: 'manageCampaignActions', func: manageCampaignActions },
      { name: 'groupMetrics', func: groupMetrics },
      { name: 'copyStatusToTarget', func: copyStatusToTarget },
      { name: 'updateHyperlinks', func: updateHyperlinks },
      { name: 'runMaxCPICalculation', func: runMaxCPICalculation },
      { name: 'checkHighCPI', func: checkHighCPI }
    ];
    
    let completed = 0, failed = 0;
    const failedFunctions = [];
    
    for (const func of functions) {
      try {
        UTILS.status.update("RUNNING", func.name, "#2196f3");
        UTILS.log(`[${executionId}] Начинаем: ${func.name}`);
        
        const result = executeWithRetry(func.func, func.name);
        if (result.success) {
          completed++;
          UTILS.log(`[${executionId}] ✅ ${func.name}`);
        } else {
          failed++;
          failedFunctions.push(func.name);
          UTILS.log(`[${executionId}] ❌ ${func.name}: ${result.error}`);
        }
      } catch (error) {
        failed++;
        failedFunctions.push(func.name);
        UTILS.log(`[${executionId}] ❌ ${func.name}: ${error.message}`);
      }
      
      Utilities.sleep(2000);
      if (completed % 5 === 0) UTILS.cleanup();
    }
    
    const executionTime = (new Date() - startTime) / 1000;
    const successRate = Math.round((completed / functions.length) * 100);
    const statusColor = failed === 0 ? "#e8f5e9" : (failed <= 3 ? "#fff3e0" : "#ffcdd2");
    
    UTILS.status.update("COMPLETED", `${completed}/${functions.length} (${successRate}%) за ${executionTime.toFixed(1)}с`, statusColor);
    UTILS.log(`[${executionId}] ЗАВЕРШЕНО: ${completed}/${functions.length} (${successRate}%)`);
    
    SpreadsheetApp.getActive().toast(`Обновление завершено: ${completed}/${functions.length} (${successRate}%)${failed > 0 ? `. Ошибок: ${failed}` : ''}`, "Готово", 10);
    
    return {
      success: failed <= 3,
      executionId,
      completed,
      failed,
      total: functions.length,
      executionTime,
      successRate,
      failedFunctions
    };
    
  } catch (error) {
    const errorMsg = `КРИТИЧЕСКАЯ ОШИБКА: ${error.message}`;
    UTILS.log(`[${executionId}] ${errorMsg}`);
    UTILS.status.update("ERROR", errorMsg, "#ffebee");
    SpreadsheetApp.getActive().toast(errorMsg, "Критическая ошибка", 20);
    return { success: false, error: error.message, executionId };
    
  } finally {
    UTILS.cleanup();
    UTILS.status.update("READY", "Comments", "#ffffff");
    lock.releaseLock();
  }
}

function executeWithRetry(func, funcName, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = func();
      return { success: true, result, attempts: attempt };
    } catch (error) {
      UTILS.log(`${funcName} попытка ${attempt} ошибка: ${error.message}`);
      
      if (error.message.includes('INTERNAL') || error.message.includes('quota')) {
        UTILS.cleanup();
        Utilities.sleep(5000 * attempt);
      } else if (attempt < maxRetries) {
        Utilities.sleep(2000);
      }
      
      if (attempt === maxRetries) {
        return { success: false, error: error.message, attempts: attempt, funcName };
      }
    }
  }
}