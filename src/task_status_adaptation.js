// == task_status_adaptation.js (Версия 7.0, без Shadow DOM, прямой доступ) ==

if (typeof window.__culmsLongreadFixInitialized === 'undefined') {
    window.__culmsLongreadFixInitialized = true;

    'use strict';

    // --- КОНСТАНТЫ ---
    const SKIPPED_TASKS_KEY = 'cu.lms.skipped-tasks';
    const SKIPPED_STATUS_TEXT = "Метод скипа";
    const EMOJI_REGEX = /[🔴🔵⚫️⚫❤️💙🖤]/g;

    // --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
    function stripEmojis(text) {
        if (!text) return '';
        return text.replace(EMOJI_REGEX, '').trim();
    }

    function getSkippedTasks() {
        try {
            const skipped = localStorage.getItem(SKIPPED_TASKS_KEY);
            return skipped ? new Set(JSON.parse(skipped)) : new Set();
        } catch (e) { return new Set(); }
    }

    /**
     * Обрабатывает один конкретный элемент <cu-student-task>.
     * @param {HTMLElement} taskElement - Элемент <cu-student-task>.
     * @param {Set<string>} skippedTasks - Набор всех пропущенных задач.
     */
    function processTaskElement(taskElement, skippedTasks) {
        // Ищем элементы напрямую внутри taskElement, без shadowRoot.
        const taskNameElement = taskElement.querySelector('.task-name');
        const statusChipElement = taskElement.querySelector('tui-chip');

        if (!taskNameElement || !statusChipElement) {
            // Если внутренние элементы еще не отрисовались, MutationObserver вызовет нас снова.
            return;
        }
        
        // Помечаем, чтобы не обрабатывать повторно в том же цикле.
        taskElement.setAttribute('data-culms-processed', 'true');

        const taskNameOnPage = stripEmojis(taskNameElement.textContent.trim()).toLowerCase();
        
        let isTaskSkipped = false;
        for (const skippedIdentifier of skippedTasks) {
            const storedTaskName = skippedIdentifier.split('::')[1];
            if (storedTaskName && storedTaskName === taskNameOnPage) {
                isTaskSkipped = true;
                break;
            }
        }

        if (isTaskSkipped) {
            window.cuLmsLog(`Longread Fix: Match found! Applying 'skipped' status to task "${taskNameOnPage}"`);

            if (!statusChipElement.dataset.originalStatus) {
                statusChipElement.dataset.originalStatus = statusChipElement.textContent.trim();
            }

            statusChipElement.textContent = SKIPPED_STATUS_TEXT;
            statusChipElement.dataset.culmsStatus = 'skipped';
        }
    }

    /**
     * Внедряет глобальные стили для статуса.
     */
    function injectGlobalStyles() {
        const styleId = 'culms-longread-fix-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            /* Стилизуем чип внутри компонента по data-атрибуту */
            cu-student-task tui-chip[data-culms-status="skipped"] {
                background-color: #b516d7 !important;
                color: white !important;
            }
        `;
        document.head.appendChild(style);
    }
    
    /**
     * Основная функция, которая ищет новые элементы и запускает их обработку.
     */
    function runCheck() {
        const skippedTasks = getSkippedTasks();
        if (skippedTasks.size === 0) return;

        // Ищем все контейнеры задач, которые еще не были обработаны.
        const taskElements = document.querySelectorAll('cu-student-task:not([data-culms-processed])');
        
        if (taskElements.length > 0) {
             taskElements.forEach(element => processTaskElement(element, skippedTasks));
        }
    }

    // --- ЗАПУСК СКРИПТА ---

    if (window.location.href.includes('/longreads/')) {
        if(!window.cuLmsLog) {
            window.cuLmsLog = console.log.bind(window.console, '%cCU LMS Fix:', 'background: #4A5568; color: #E2E8F0; padding: 2px 6px; border-radius: 4px;');
        }
        
        injectGlobalStyles();
        
        // Запускаем проверку один раз на случай, если контент уже есть.
        setTimeout(runCheck, 500);

        // Наблюдатель следит за появлением новых элементов в DOM.
        const observer = new MutationObserver(runCheck);
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        window.cuLmsLog('Longread Fix: Observer initialized and watching for tasks.');
    }
}