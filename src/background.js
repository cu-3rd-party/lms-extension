// background.js (Эта версия ПРАВИЛЬНАЯ, ее менять не нужно)

try {
    importScripts('browser-polyfill.js');
} catch (e) {
    window.cuLmsLog("Running in a non-MV3 environment or Firefox.");
}

browser.webNavigation.onHistoryStateUpdated.addListener(details => {
    if (details.frameId === 0) handleNavigation(details.tabId, details.url);
});

browser.webNavigation.onCompleted.addListener(details => {
    if (details.frameId === 0) handleNavigation(details.tabId, details.url);
});

function handleNavigation(tabId, url) {
    if (!url || !url.startsWith("https://my.centraluniversity.ru/")) return;

    // --- ЛОГИКА РАЗДЕЛЬНОГО ВНЕДРЕНИЯ ---
    if (url.includes("/learn/tasks")) {
        // СТРАНИЦА ЗАДАЧ: Внедряем объединенный tasks_fix, но НЕ emoji_swap
        browser.scripting.executeScript({
            target: { tabId: tabId },
            files: ["browser-polyfill.js", "dark_theme.js", "tasks_fix.js"]
        }).catch(err => window.cuLmsLog(`[BG_LOG] Error injecting scripts for Tasks page:`, err));
    } else {
        // ДРУГИE СТРАНИЦЫ: Внедряем стандартный набор, включая emoji_swap
        browser.scripting.executeScript({
            target: { tabId: tabId },
            files: ["browser-polyfill.js", "dark_theme.js", "emoji_swap.js"]
        }).catch(err => window.cuLmsLog(`[BG_LOG] Error injecting default scripts:`, err));
    }

    // Внедрение других скриптов для других страниц
    if (url.includes("/learn/courses/view")) {
        browser.scripting.executeScript({
            target: { tabId: tabId },
            files: ["browser-polyfill.js", "course_card_simplifier.js",
                    "future_exams_view.js", "courses_fix.js"]
        }).catch(err => console.error(`[BG_LOG] Error injecting courses_fix.js:`, err));
    }
    if (url.includes("/longreads/")) {
        browser.scripting.executeScript({
            target: { tabId: tabId },
            files: ["homework_weight_fix.js", "instant_doc_view_fix.js"]
        }).catch(err => window.cuLmsLog(`[BG_LOG] Error injecting Longreads scripts:`, err));
    }
    if (url.includes("/learn/reports/student-performance")) {
         browser.scripting.executeScript({
            target: { tabId: tabId },
            files: ["archive-statements.js"]
        }).catch(err => console.error(`[BG_LOG] Error injecting reports scripts:`, err))
    }
}