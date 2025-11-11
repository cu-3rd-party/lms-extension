// background.js (Полная версия с интеграцией advanced_statements.js)

// Попытка импортировать полифилл для совместимости с Manifest V3 (Chrome)
if (typeof importScripts === 'function') {
    try {
        importScripts('browser-polyfill.js');
    } catch (e) {
        // Это нормально для сред, где browser.* уже доступен, например, Firefox MV2
        console.log("Running in a non-MV3 environment or Firefox where polyfill is not needed.");
    }
}

/**
 * Центральная функция для обработки навигации и внедрения скриптов.
 * @param {number} tabId - ID вкладки, где произошло событие.
 * @param {string} url - URL страницы.
 */
function handleNavigation(tabId, url) {
    // Прекращаем выполнение, если URL не соответствует целевому сайту
    if (!url || !url.startsWith("https://my.centraluniversity.ru/")) return;

    // Внедряем скрипт проверки версии на всех страницах домена
    browser.scripting.executeScript({
        target: { tabId: tabId },
        files: ["version_check.js"]
    }).catch(err => console.error(`[BG_LOG] Error injecting version_check.js:`, err));

    // --- ЛОГИКА РАЗДЕЛЬНОГО ВНЕДРЕНИЯ ---

    if (url.includes("/learn/tasks")) {
        // СТРАНИЦА ЗАДАЧ: Внедряем объединенный tasks_fix, но НЕ emoji_swap
        browser.scripting.executeScript({
            target: { tabId: tabId },
            files: ["browser-polyfill.js", "dark_theme.js", "tasks_fix.js"]
        }).catch(err => console.error(`[BG_LOG] Error injecting scripts for Tasks page:`, err));
    } else {
        // ДРУГИE СТРАНИЦЫ: Внедряем стандартный набор, включая emoji_swap
        browser.scripting.executeScript({
            target: { tabId: tabId },
            files: ["browser-polyfill.js", "dark_theme.js", "emoji_swap.js"]
        }).catch(err => console.error(`[BG_LOG] Error injecting default scripts:`, err));
    }

    // Внедрение скриптов для страницы просмотра курсов
    if (url.includes("/learn/courses/view")) {
        browser.scripting.executeScript({
            target: { tabId: tabId },
            files: ["browser-polyfill.js", "course_card_simplifier.js",
                    "future_exams_view.js", "courses_fix.js", "course_overview_task_status.js",
                    "course_overview_autoscroll.js"]
        }).catch(err => console.error(`[BG_LOG] Error injecting courses_fix.js:`, err));
    }

    // Внедрение скриптов для страниц с материалами (лонгридами)
    if (url.includes("/longreads/")) {
        browser.scripting.executeScript({
            target: { tabId: tabId },
            files: ["homework_weight_fix.js", "instant_doc_view_fix.js", "task_status_adaptation.js", "rename_hw.js"]
        }).catch(err => console.error(`[BG_LOG] Error injecting Longreads scripts:`, err));
    }

    // --- ОБНОВЛЕННЫЙ БЛОК ДЛЯ СТРАНИЦЫ УСПЕВАЕМОСТИ ---
    if (url.includes("/learn/reports/student-performance")) {
         // Внедряем скрипты для общей страницы успеваемости (архив и GPA калькулятор)
         browser.scripting.executeScript({
            target: { tabId: tabId },
            files: ["archive-statements.js", "metrics_statements.js"]
        }).catch(err => console.error(`[BG_LOG] Error injecting reports scripts:`, err));
        
        // --- НОВАЯ ЛОГИКА ДЛЯ СТАНДАРТИЗИРОВАННОЙ ВЕДОМОСТИ ---
        // Проверяем, что мы находимся на конкретной странице успеваемости по активностям
        if (url.includes("/activity")) {
            // Проверяем, включена ли опция в настройках расширения
            browser.storage.sync.get(['advancedStatementsEnabled']).then(settings => {
                if (settings.advancedStatementsEnabled) {
                    browser.scripting.executeScript({
                        target: { tabId: tabId },
                        files: ["advanced_statements.js"]
                    }).catch(err => console.error(`[BG_LOG] Error injecting advanced_statements.js:`, err));
                }
            }).catch(err => console.error(`[BG_LOG] Error getting settings for advanced statements:`, err));
        }
    }

    // Внедряем загрузчик страницы плагина (для настроек)
    browser.scripting.executeScript({
        target: { tabId: tabId },
        files: ["plugin_page_loader.js"]
    }).catch(err => console.error(`[BG_LOG] Error injecting plugin_page_loader.js:`, err));
}

// --- СЛУШАТЕЛИ НАВИГАЦИИ ---
// Отслеживаем переходы внутри SPA (Single Page Application)
browser.webNavigation.onHistoryStateUpdated.addListener(details => {
    // frameId === 0 означает, что событие произошло в основном окне, а не в iframe
    if (details.frameId === 0) {
        handleNavigation(details.tabId, details.url);
    }
});

// Отслеживаем полную загрузку страницы (например, после F5 или прямого перехода)
browser.webNavigation.onCompleted.addListener(details => {
    if (details.frameId === 0) {
        handleNavigation(details.tabId, details.url);
    }
});


// --- ЛОГИКА ОБРАБОТКИ GIST ---
// Слушатель сообщений от других частей расширения (например, от content scripts)
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "fetchGistContent") {
        fetch(request.url)
            .then(response => response.text())
            .then(text => {
                let processedText = text.trim();
                
                const prefix = "document.write('";
                const suffix = "')";
                // Регулярное выражение для поиска "шва" между файлами в Gist
                const separatorRegex = /'\)\s*document\.write\('/g; 

                if (processedText.startsWith(prefix) && processedText.endsWith(suffix)) {
                    
                    // 1. Убираем внешнюю "обертку" document.write
                    processedText = processedText.substring(prefix.length, processedText.length - suffix.length);
                    
                    // 2. Заменяем все "швы" на пустую строку, чтобы "склеить" файлы
                    let rawHtml = processedText.replace(separatorRegex, '');
                    
                    // 3. Убираем экранирование символов, добавленное Gist'ом
                    rawHtml = rawHtml
                        .replace(/\\'/g, "'").replace(/\\"/g, '"')
                        .replace(/\\n/g, '\n').replace(/\\\//g, '/')
                        .replace(/\\\\/g, '\\');

                    // 4. Извлекаем из чистого HTML ссылку на CSS стили, если они есть
                    const cssMatch = rawHtml.match(/<link.*?href="(.*?)"/);
                    const cssUrl = cssMatch ? cssMatch[1] : null;

                    sendResponse({ success: true, html: rawHtml, cssUrl: cssUrl });

                } else {
                    sendResponse({ success: false, error: "Ответ от Gist имеет неожиданный формат." });
                }
            })
            .catch(error => sendResponse({ success: false, error: error.message }));
        
        // Возвращаем true, чтобы указать, что ответ будет асинхронным
        return true;
    }
});