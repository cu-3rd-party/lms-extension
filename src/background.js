// background.js

try {
    importScripts('browser-polyfill.js');
} catch (e) {
    console.log("Running in a non-MV3 environment or Firefox.");
}

// Слушатели событий навигации
browser.webNavigation.onHistoryStateUpdated.addListener(details => {
    if (details.frameId === 0) handleNavigation(details.tabId, details.url);
});

browser.webNavigation.onCompleted.addListener(details => {
    if (details.frameId === 0) handleNavigation(details.tabId, details.url);
});

/**
 * Обрабатывает навигацию и внедряет нужные скрипты.
 * @param {number} tabId - ID вкладки.
 * @param {string} url - URL страницы.
 */
function handleNavigation(tabId, url) {
    if (!url || !url.startsWith("https://my.centraluniversity.ru/")) return;

    // --- ОБЩИЕ СКРИПТЫ ---
    // СИСТЕМА ОТКРЫТЫХ КУРСОВ (внедряется всегда)
    browser.scripting.executeScript({
        target: { tabId: tabId },
        files: ["browser-polyfill.js", "open_courses_tab.js"]
    }).catch(err => console.error(`[BG_LOG] Error injecting open_courses_tab.js:`, err));

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

    // --- ВНЕДРЕНИЕ СКРИПТОВ ДЛЯ КОНКРЕТНЫХ СТРАНИЦ ---

    // СТРАНИЦА АКТУАЛЬНЫХ КУРСОВ: Запускаем наш новый плагин-экспортер
    // ВАЖНО: Этот блок добавлен для загрузки вашего нового скрипта
    if (url.includes("/learn/courses/view/actual")) {
        browser.scripting.executeScript({
            target: { tabId: tabId },
            // Убедитесь, что скрипт из предыдущего ответа сохранен как 'course_exporter_plugin.js'
            files: ["browser-polyfill.js", "course_exporter.js"]
        }).catch(err => console.error(`[BG_LOG] Error injecting course_exporter_plugin.js:`, err));
    }

    // ЛЮБАЯ СТРАНИЦА ПРОСМОТРА КУРСОВ
    if (url.includes("/learn/courses/view")) {
        browser.scripting.executeScript({
            target: { tabId: tabId },
            files: ["browser-polyfill.js", "course_card_simplifier.js", "courses_fix.js"]
        }).catch(err => console.error(`[BG_LOG] Error injecting courses_fix.js:`, err));
    }

    // СТРАНИЦА ЛОНГРИДОВ
    if (url.includes("/longreads/")) {
        browser.scripting.executeScript({
            target: { tabId: tabId },
            files: ["homework_weight_fix.js", "instant_doc_view_fix.js"]
        }).catch(err => console.error(`[BG_LOG] Error injecting Longreads scripts:`, err));
    }
}