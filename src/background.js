// background.js (Эта версия ПРАВИЛЬНАЯ, ее менять не нужно)

if (typeof importScripts === 'function') {
    try {
        importScripts('browser-polyfill.js');
    } catch (e) {
        window.cuLmsLog("Running in a non-MV3 environment or Firefox.");
    }
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
                    "future_exams_view.js", "courses_fix.js", "course_overview_task_status.js"]
        }).catch(err => console.error(`[BG_LOG] Error injecting courses_fix.js:`, err));
    }
    if (url.includes("/longreads/")) {
        browser.scripting.executeScript({
            target: { tabId: tabId },
            files: ["homework_weight_fix.js", "instant_doc_view_fix.js", "task_status_adaptation.js", "rename_hw.js"]
        }).catch(err => window.cuLmsLog(`[BG_LOG] Error injecting Longreads scripts:`, err));
    }
    if (url.includes("/learn/reports/student-performance")) {
         browser.scripting.executeScript({
            target: { tabId: tabId },
            files: ["archive-statements.js", "metrics_statements.js"]
        }).catch(err => console.error(`[BG_LOG] Error injecting reports scripts:`, err))
    }

    browser.scripting.executeScript({
        target: { tabId: tabId },
        files: ["plugin_page_loader.js"]
    }).catch(err => console.error(`[BG_LOG] Error injecting plugin_page_loader.js:`, err));
}

// Вставьте этот код в конец вашего существующего файла background.js

// Слушатели навигации
browser.webNavigation.onHistoryStateUpdated.addListener(details => {
    if (details.frameId === 0) handleNavigation(details.tabId, details.url);
});
browser.webNavigation.onCompleted.addListener(details => {
    if (details.frameId === 0) handleNavigation(details.tabId, details.url);
});
// --- Конец блока внедрения скриптов ---


// *** НОВАЯ, НАДЕЖНАЯ ЛОГИКА ОЧИСТКИ GIST ***
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "fetchGistContent") {
        fetch(request.url)
            .then(response => response.text())
            .then(text => {
                let processedText = text.trim();
                
                const prefix = "document.write('";
                const suffix = "')";
                // Это "шов", который появляется между файлами в Gist, \s* означает любой пробельный символ (включая перенос строки)
                const separatorRegex = /'\)\s*document\.write\('/g; 

                if (processedText.startsWith(prefix) && processedText.endsWith(suffix)) {
                    
                    // 1. Убираем внешнюю "обертку"
                    processedText = processedText.substring(prefix.length, processedText.length - suffix.length);
                    
                    // 2. Заменяем все "швы" между файлами на пустую строку
                    let rawHtml = processedText.replace(separatorRegex, '');
                    
                    // 3. Убираем экранирование символов
                    rawHtml = rawHtml
                        .replace(/\\'/g, "'").replace(/\\"/g, '"')
                        .replace(/\\n/g, '\n').replace(/\\\//g, '/')
                        .replace(/\\\\/g, '\\');

                    // 4. Извлекаем из чистого HTML ссылку на стили
                    const cssMatch = rawHtml.match(/<link.*?href="(.*?)"/);
                    const cssUrl = cssMatch ? cssMatch[1] : null;

                    sendResponse({ success: true, html: rawHtml, cssUrl: cssUrl });

                } else {
                    sendResponse({ success: false, error: "Ответ от Gist имеет неожиданный формат." });
                }
            })
            .catch(error => sendResponse({ success: false, error: error.message }));
        
        return true; // Обязательно для асинхронного ответа
    }
});