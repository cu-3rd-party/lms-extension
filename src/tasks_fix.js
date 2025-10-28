if (typeof window.__culmsTasksFixInitialized === 'undefined') {
    window.__culmsTasksFixInitialized = true;

    'use strict';

    // --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ДЛЯ УПРАВЛЕНИЯ СОСТОЯНИЕМ ---
    let dropdownObserver = null; // Будем хранить здесь наблюдателя за фильтрами
    let isCleanedUp = false;     // Флаг, чтобы очистка не запускалась многократно

    // --- ПРОВЕРКА URL ПРИ НАВИГАЦИИ ВНУТРИ SPA ---
    const isArchivedPage = () => window.location.href.includes('/tasks/archived-student-tasks');

    // --- ОБНОВЛЕННАЯ ФУНКЦИЯ ОЧИСТКИ ---
    function cleanupModifications() {
        // 1. Отключаем наблюдателя за выпадающими списками.
        // ЭТО КЛЮЧЕВОЙ ШАГ для возврата оригинальных фильтров.
        if (dropdownObserver) {
            dropdownObserver.disconnect();
            dropdownObserver = null;
            window.cuLmsLog('Task Status Updater: Dropdown observer disconnected.');
        }

        // 2. Удаляем элементы из таблицы
        document.querySelector('[data-culms-weight-header]')?.remove();
        document.querySelectorAll('tr[class*="task-table__task"]').forEach(row => {
            row.querySelector('[data-culms-weight-cell]')?.remove();
            row.querySelector('.culms-action-button')?.remove();
            row.style.display = ''; 
        });
        
        // 3. Удаляем добавленные стили
        document.getElementById('culms-tasks-fix-styles')?.remove();
        
        isCleanedUp = true; // Устанавливаем флаг, что очистка произведена
        window.cuLmsLog('Task Status Updater: Cleaned up DOM modifications for archived page.');
    }


    // --- КОНСТАНТЫ ДЛЯ LOCALSTORAGE ---
    const FILTER_STORAGE_KEY = 'cu.lms.actual-student-tasks-custom-filter';
    const DEFAULT_FILTER_KEY = 'cu.lms.actual-student-tasks-filter';
    const SKIPPED_TASKS_KEY = 'cu.lms.skipped-tasks';

    // --- КОНСТАНТЫ СТАТУСОВ ---
    const SKIPPED_STATUS_TEXT = "Метод скипа";

    // --- КЭШ ДЛЯ ЗАГРУЖЕННЫХ ИКОНОК ---
    const svgIconCache = {};

    // --- БЛОК ОЧИСТКИ ФИЛЬТРОВ В LOCALSTORAGE ---
    (function cleanFiltersInLocalStorage() {
        try {
            const storedFilterJSON = localStorage.getItem(DEFAULT_FILTER_KEY);
            if (storedFilterJSON) {
                const filterData = JSON.parse(storedFilterJSON);
                if (filterData.course?.length > 0 || filterData.state?.length > 0) {
                    window.cuLmsLog('Task Status Updater: Cleaning default filters...');
                    filterData.course = [];
                    filterData.state = [];
                    localStorage.setItem(DEFAULT_FILTER_KEY, JSON.stringify(filterData));
                }
            }
        } catch (error) {
            window.cuLmsLog('Task Status Updater: Failed to clean localStorage filters.', error);
        }
    })();

    // --- ВСТРОЕННАЯ ЛОГИКА EMOJI_SWAP ---
    const EMOJI_TO_HEARTS_MAP = new Map([
        ['🔵', '💙'], ['🔴', '❤️'], ['⚫️', '🖤'], ['⚫', '🖤'],
    ]);

    function replaceTextInNode(node, map) {
        let out = node.nodeValue;
        for (const [from, to] of map) {
            if (out.includes(from)) out = out.split(from).join(to);
        }
        node.nodeValue = out;
    }

    const EMOJI_REGEX = /[🔴🔵⚫️⚫❤️💙🖤]/g;

    function stripEmojis(text) {
        if (!text) return '';
        return text.replace(EMOJI_REGEX, '').trim();
    }

    // --- ОБНОВЛЕННАЯ ЛОГИКА: Троттлинг для MutationObserver ---
    let canRunLogic = true;

    function throttledCheckAndRun() {
        if (isArchivedPage()) {
            if (!isCleanedUp) { // Запускаем очистку только один раз
                cleanupModifications();
            }
            return;
        }
        
        // Если мы вернулись на страницу активных задач, сбрасываем флаг
        isCleanedUp = false;

        if (!canRunLogic) return;
        
        const taskTableExists = document.querySelector('.task-table');
        const isHeaderMissing = !document.querySelector('[data-culms-weight-header]');

        if (taskTableExists && isHeaderMissing) {
            canRunLogic = false;
            runLogic();
            setTimeout(() => { canRunLogic = true; }, 1000);
        }
    }

    function initializeObserver() {
        const observer = new MutationObserver(throttledCheckAndRun);
        observer.observe(document.body, { childList: true, subtree: true });
    }

    async function runLogic() {
        try {
            refreshDynamicStyles();
            await waitForElement('tr[class*="task-table__task"]');
            window.cuLmsLog('Task Status Updater: Task rows found. Starting DOM modification.');
            const settings = await browser.storage.sync.get('emojiHeartsEnabled');
            const isEmojiSwapEnabled = !!settings.emojiHeartsEnabled;
            const tasksData = await fetchTasksData();
            buildTableStructure();
            if (tasksData && tasksData.length > 0) {
                await populateTableData(tasksData, isEmojiSwapEnabled);
            }
            initializeFilters();
            // Запускаем перехватчик фильтров КАЖДЫЙ РАЗ при запуске основной логики
            setupDropdownInterceptor();
        } catch (error) {
            window.cuLmsLog('Task Status Updater: Error in runLogic:', error);
        }
    }

    async function getIconSVG(iconName) {
        if (svgIconCache[iconName]) {
            return svgIconCache[iconName];
        }
        try {
            const url = browser.runtime.getURL(`icons/${iconName}.svg`);
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
            let text = await response.text();

            // Удаляем атрибуты fill и stroke, чтобы цвет полностью управлялся через CSS
            text = text.replace(/ (fill|stroke)="[^"]+"/g, '');

            const sanitizedText = text.replace(/<\?xml.*?\?>/g, '').replace(/<!DOCTYPE.*?>/g, '');
            svgIconCache[iconName] = sanitizedText;
            return sanitizedText;
        } catch (error) {
            console.error(`Error fetching icon ${iconName}:`, error);
            return `<span style="color: red; font-weight: bold;">!</span>`; // Fallback
        }
    }

    function refreshDynamicStyles() {
        const styleId = 'culms-tasks-fix-styles';
        // Удаляем старые стили, если они есть
        if (document.getElementById(styleId)) {
            document.getElementById(styleId).remove();
        }

        const isDarkTheme = !!document.getElementById('culms-dark-theme-style-base');
        const seminarRowBg = isDarkTheme ? 'rgb(20,20,20)' : '#E0E0E0';
        const seminarChipBg = '#000000';
        const solvedChipBg = '#28a745';
        const skippedChipBg = '#b516d7';
        const modalBgColor = `var(--tui-base-01, ${isDarkTheme ? '#2d2d2d' : 'white'})`;
        const modalTextColor = `var(--tui-text-01, ${isDarkTheme ? '#e0e0e0' : '#333'})`;
        const iconColor = isDarkTheme ? '#FFFFFF' : 'var(--tui-status-attention, #000000)';

        const checkboxThemeStyle = isDarkTheme
            ? `
            input[tuicheckbox][data-appearance="primary"]:checked {
                filter: brightness(0) invert(1) !important;
            }
        `
            : '';

        const cssRules = `
            /* 1. Импортируем шрифт Inter с нужным начертанием (400) с Google Fonts */
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');

            /* --- Стили таблицы (остаются без изменений) --- */
            tr[data-culms-row-type="seminar"] { background-color: ${seminarRowBg} !important; }
            .state-chip[data-culms-status="seminar"] { background-color: ${seminarChipBg} !important; color: white !important; ${isDarkTheme ? 'border: 1px solid #444;' : ''} }
            .state-chip[data-culms-status="solved"] { background-color: ${solvedChipBg} !important; color: white !important; }
            .state-chip[data-culms-status="skipped"] { background-color: ${skippedChipBg} !important; color: white !important; }

            .culms-late-days-container { display: flex; align-items: center; justify-content: flex-start; }
            .culms-action-button { display: inline-flex; align-items: center; justify-content: center; background: transparent; border: none; cursor: pointer; height: 24px; width: 24px; padding: 0; margin-right: 8px; opacity: 0.6; transition: opacity 0.2s; }
            .culms-action-button:hover { opacity: 1; }
            .culms-action-button svg { width: 18px; height: 18px; color: ${iconColor}; fill: currentColor; }

            /* --- Стили модального окна (ОБНОВЛЕНЫ) --- */
            .culms-modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.6); z-index: 1050; display: flex; align-items: center; justify-content: center; }
            
            .culms-modal-content {
                background: ${modalBgColor};
                color: ${modalTextColor};
                padding: 24px 30px;
                border-radius: 12px;
                text-align: center;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                max-width: 400px;
                /* 2. Применяем семейство шрифтов ко всему модальному окну */
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, Roboto, "Segoe UI", "Helvetica Neue", sans-serif;
            }

            .culms-modal-content p {
                margin: 0 0 20px 0;
                /* 3. Применяем точные параметры шрифта к тексту сообщения */
                font-weight: 400;
                font-size: 1rem;
                line-height: 1.5rem;
                font-style: normal;
            }

            .culms-modal-buttons button {
                margin: 0 10px;
                padding: 8px 16px;
                border-radius: 5px;
                border: 1px solid transparent;
                cursor: pointer;
                font-weight: bold; /* Кнопки обычно делают жирнее для акцента */
                font-family: inherit; /* Наследуем 'Inter' от родителя */
            }
            
            .culms-modal-confirm { background-color: #28a745; color: white; border-color: #28a745; }
            .culms-modal-cancel { background-color: #dc3545; color: white; border-color: #dc3545; }
            
            ${checkboxThemeStyle}
        `;
        const styleElement = document.createElement('style');
        styleElement.id = styleId;
        styleElement.textContent = cssRules;
        document.head.appendChild(styleElement);
    }

    function buildTableStructure() {
        const headerRow = document.querySelector('.task-table__header');
        if (headerRow && !headerRow.querySelector('[data-culms-weight-header]')) {
            const scoreHeader = headerRow.querySelector('.task-table__score');
            const stateHeader = headerRow.querySelector('.task-table__state');
            if (scoreHeader && stateHeader) {
                const weightHeader = scoreHeader.cloneNode(true);
                weightHeader.setAttribute('data-culms-weight-header', 'true');
                weightHeader.textContent = 'Вес';
                stateHeader.parentNode.insertBefore(weightHeader, stateHeader.nextSibling);
            }
        }
        document.querySelectorAll('tr[class*="task-table__task"]').forEach(row => {
            if (row.querySelector('[data-culms-weight-cell]')) return;
            const originalScoreCell = row.querySelector('.task-table__score');
            const stateCell = row.querySelector('.task-table__state');
            if (originalScoreCell && stateCell) {
                const weightCell = originalScoreCell.cloneNode(true);
                weightCell.setAttribute('data-culms-weight-cell', 'true');
                weightCell.textContent = '';
                stateCell.parentNode.insertBefore(weightCell, stateCell.nextSibling);
            }
        });
    }

    async function populateTableData(tasksData, isEmojiSwapEnabled) {
        const skippedTasks = getSkippedTasks();
        const rows = document.querySelectorAll('tr[class*="task-table__task"]');

        const processingPromises = Array.from(rows).map(async (row) => {
            const statusElement = row.querySelector('.state-chip');
            const weightCell = row.querySelector('[data-culms-weight-cell]');
            const lateDaysCell = row.querySelector('.task-table__late-days');

            if (!statusElement || !weightCell) return;

            if (!statusElement.dataset.originalStatus) {
                statusElement.dataset.originalStatus = statusElement.textContent.trim();
                statusElement.dataset.originalCulmsStatus = statusElement.getAttribute('data-culms-status') || '';
            }

            statusElement.removeAttribute('data-culms-status');
            row.removeAttribute('data-culms-row-type');

            const htmlNames = extractTaskAndCourseNamesFromElement(statusElement);
            const task = findMatchingTask(htmlNames, tasksData);
            const taskIdentifier = getTaskIdentifier(htmlNames.taskName, htmlNames.courseName);
            const isSkipped = skippedTasks.has(taskIdentifier);

            if (task) {
                if (lateDaysCell) {
                    let container = lateDaysCell.querySelector('.culms-late-days-container');
                    if (!container) {
                        container = document.createElement('div');
                        container.className = 'culms-late-days-container';
                        while (lateDaysCell.firstChild) {
                            container.appendChild(lateDaysCell.firstChild);
                        }
                        lateDaysCell.appendChild(container);
                    }

                    let skipButton = container.querySelector('.culms-action-button');
                    if (!skipButton) {
                        skipButton = document.createElement('button');
                        skipButton.className = 'culms-action-button';
                        container.prepend(skipButton);
                        skipButton.addEventListener('click', (e) => {
                            e.stopPropagation();
                            onSkipButtonClick(task, row, statusElement, skipButton);
                        });
                    }
                    await updateButtonIcon(skipButton, isSkipped);
                }

                if (isSkipped) {
                    statusElement.textContent = SKIPPED_STATUS_TEXT;
                    statusElement.setAttribute('data-culms-status', 'skipped');
                } else {
                    statusElement.textContent = statusElement.dataset.originalStatus;
                    if (task.exercise?.activity?.name === 'Аудиторная работа') {
                        statusElement.textContent = 'Аудиторная';
                        statusElement.setAttribute('data-culms-status', 'seminar');
                        row.setAttribute('data-culms-row-type', 'seminar');
                    } else if (task.submitAt !== null && (statusElement.textContent.includes('В работе') || statusElement.textContent.includes('Есть решение'))) {
                        statusElement.textContent = 'Есть решение';
                        statusElement.setAttribute('data-culms-status', 'solved');
                    }
                }

                const weight = task.exercise?.activity?.weight;
                weightCell.textContent = (weight !== undefined && weight !== null) ? `${Math.round(weight * 100)}%` : '';
            } else {
                weightCell.textContent = '';
            }

            if (isEmojiSwapEnabled) {
                const courseNameElement = row.querySelector('.task-table__course-name');
                if (courseNameElement) {
                    const walker = document.createTreeWalker(courseNameElement, NodeFilter.SHOW_TEXT);
                    let node;
                    while ((node = walker.nextNode())) {
                        replaceTextInNode(node, EMOJI_TO_HEARTS_MAP);
                    }
                }
            }
        });

        await Promise.all(processingPromises);
    }

    // --- ЛОГИКА ПРОПУСКА ЗАДАЧ И МОДАЛЬНОГО ОКНА ---
    function onSkipButtonClick(task, row, statusElement, button) {
        const taskIdentifier = getTaskIdentifier(task.exercise.name, task.course.name);
        const isCurrentlySkipped = getSkippedTasks().has(taskIdentifier);

        if (isCurrentlySkipped) {
            handleCancelSkipTask(task, row, statusElement, button);
        } else {
            handleSkipTask(task, row, statusElement, button);
        }
    }

    async function updateButtonIcon(button, isSkipped) {
        const iconName = isSkipped ? 'cancelskip' : 'skip';
        button.innerHTML = await getIconSVG(iconName);
        button.title = isSkipped ? 'Отменить метод скипа' : 'Применить метод скипа';
        button.dataset.isSkipped = isSkipped;
    }

    function handleSkipTask(task, row, statusElement, button) {
        showConfirmationModal('Вы уверены, что хотите применить метод скипа(статус виден только вам)?', (confirmed) => {
            if (confirmed) {
                const taskIdentifier = getTaskIdentifier(task.exercise.name, task.course.name);
                addSkippedTask(taskIdentifier);
                statusElement.textContent = SKIPPED_STATUS_TEXT;
                statusElement.setAttribute('data-culms-status', 'skipped');
                row.removeAttribute('data-culms-row-type');
                updateButtonIcon(button, true);
                applyCombinedFilter();
            }
        });
    }

    function handleCancelSkipTask(task, row, statusElement, button) {
        const taskIdentifier = getTaskIdentifier(task.exercise.name, task.course.name);
        removeSkippedTask(taskIdentifier);
        statusElement.textContent = statusElement.dataset.originalStatus;
        const originalCulmsStatus = statusElement.dataset.originalCulmsStatus;
        if (originalCulmsStatus) {
            statusElement.setAttribute('data-culms-status', originalCulmsStatus);
        } else {
            statusElement.removeAttribute('data-culms-status');
        }
        if (task.exercise?.activity?.name === 'Аудиторная работа') {
            statusElement.setAttribute('data-culms-status', 'seminar');
        } else if (task.submitAt !== null && (statusElement.textContent.includes('В работе') || statusElement.textContent.includes('Есть решение'))) {
            statusElement.setAttribute('data-culms-status', 'solved');
        }
        updateButtonIcon(button, false);
        applyCombinedFilter();
    }


    function showConfirmationModal(message, callback) {
        if (document.querySelector('.culms-modal-backdrop')) document.querySelector('.culms-modal-backdrop').remove();
        const backdrop = document.createElement('div');
        backdrop.className = 'culms-modal-backdrop';
        backdrop.innerHTML = `
            <div class="culms-modal-content">
                <p>${message}</p>
                <div class="culms-modal-buttons">
                    <button class="culms-modal-confirm">Да</button>
                    <button class="culms-modal-cancel">Нет</button>
                </div>
            </div>`;
        document.body.appendChild(backdrop);
        const closeModal = (result) => { backdrop.remove(); callback(result); };
        backdrop.querySelector('.culms-modal-confirm').onclick = () => closeModal(true);
        backdrop.querySelector('.culms-modal-cancel').onclick = () => closeModal(false);
        backdrop.onclick = (e) => { if (e.target === backdrop) closeModal(false); };
    }

    // --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ПРОПУСКА ЗАДАЧ ---
    function getTaskIdentifier(taskName, courseName) {
        if (!taskName || !courseName) return null;
        return `${stripEmojis(courseName.toLowerCase())}::${stripEmojis(taskName.toLowerCase())}`;
    }
    function getSkippedTasks() {
        try {
            const skipped = localStorage.getItem(SKIPPED_TASKS_KEY);
            return skipped ? new Set(JSON.parse(skipped)) : new Set();
        } catch (e) { return new Set(); }
    }
    function saveSkippedTasks(skippedSet) {
        localStorage.setItem(SKIPPED_TASKS_KEY, JSON.stringify(Array.from(skippedSet)));
    }
    function addSkippedTask(taskIdentifier) {
        if (!taskIdentifier) return;
        const skipped = getSkippedTasks();
        skipped.add(taskIdentifier);
        saveSkippedTasks(skipped);
    }
    function removeSkippedTask(taskIdentifier) {
        if (!taskIdentifier) return;
        const skipped = getSkippedTasks();
        skipped.delete(taskIdentifier);
        saveSkippedTasks(skipped);
    }

    // --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
    function findMatchingTask(htmlNames, tasksData) {
        if (!htmlNames?.taskName || !htmlNames?.courseName) return null;
        const cleanHtmlTaskName = stripEmojis(htmlNames.taskName.toLowerCase());
        const cleanHtmlCourseName = stripEmojis(htmlNames.courseName.toLowerCase());
        return tasksData.find(task => {
            const cleanApiTaskName = stripEmojis(task.exercise?.name?.toLowerCase());
            const cleanApiCourseName = stripEmojis(task.course?.name?.toLowerCase());
            return cleanApiTaskName === cleanHtmlTaskName && cleanApiCourseName === cleanHtmlCourseName;
        });
    }

    async function fetchTasksData() {
        try {
            const response = await fetch('https://my.centraluniversity.ru/api/micro-lms/tasks/student');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            window.cuLmsLog('Task Status Updater: Failed to fetch tasks:', error);
            return [];
        }
    }

    function extractTaskAndCourseNamesFromElement(element) {
        const taskRow = element.closest('tr[class*="task-table__task"]');
        if (!taskRow) return null;
        const taskName = taskRow.querySelector('.task-table__task-name')?.textContent.trim();
        const courseName = taskRow.querySelector('.task-table__course-name')?.textContent.trim();
        return { taskName, courseName };
    }

    function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const el = document.querySelector(selector);
            if (el) return resolve(el);
            const observer = new MutationObserver(() => {
                const foundEl = document.querySelector(selector);
                if (foundEl) { observer.disconnect(); resolve(foundEl); }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => { observer.disconnect(); reject(new Error(`Timeout for ${selector}`)); }, timeout);
        });
    }

    // --- ЛОГИКА ФИЛЬТРОВ (С СОХРАНЕНИЕМ ПАРАМЕТРОВ) ---
    const HARDCODED_STATUSES = ["В работе", "Есть решение", "На проверке", "Не начато", "Аудиторная", SKIPPED_STATUS_TEXT];
    const masterCourseList = new Set();
    let selectedStatuses = new Set(HARDCODED_STATUSES);
    let selectedCourses = new Set();

    function loadFilterSettings() {
        try {
            const savedFilters = localStorage.getItem(FILTER_STORAGE_KEY);
            if (savedFilters) {
                const { statuses, courses } = JSON.parse(savedFilters);
                if (statuses && Array.isArray(statuses)) selectedStatuses = new Set(statuses);
                if (courses && Array.isArray(courses)) selectedCourses = new Set(courses);
                window.cuLmsLog('Task Status Updater: Filter settings loaded from storage');
            }
        } catch (error) {
            window.cuLmsLog('Task Status Updater: Failed to load filter settings:', error);
            selectedStatuses = new Set(HARDCODED_STATUSES);
        }
    }

    function saveFilterSettings() {
        try {
            const filterData = { statuses: Array.from(selectedStatuses), courses: Array.from(selectedCourses), timestamp: new Date().toISOString() };
            localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filterData));
        } catch (error) {
            window.cuLmsLog('Task Status Updater: Failed to save filter settings:', error);
        }
    }

    function initializeFilters() {
        loadFilterSettings();
        if (masterCourseList.size === 0) {
            document.querySelectorAll('tr[class*="task-table__task"] .task-table__course-name').forEach(el => {
                const courseName = el.textContent.trim();
                if (courseName) masterCourseList.add(courseName);
            });
            if (selectedCourses.size === 0) {
                masterCourseList.forEach(course => selectedCourses.add(course));
            }
            window.cuLmsLog('Task Status Updater: Master course list created with saved selections.');
        }
        applyCombinedFilter();
    }

    function applyCombinedFilter() {
        document.querySelectorAll('tr[class*="task-table__task"]').forEach(row => {
            const statusEl = row.querySelector('.state-chip');
            const courseEl = row.querySelector('.task-table__course-name');
            if (statusEl && courseEl) {
                const isStatusVisible = selectedStatuses.has(statusEl.textContent.trim());
                const isCourseVisible = selectedCourses.has(courseEl.textContent.trim());
                row.style.display = (isStatusVisible && isCourseVisible) ? '' : 'none';
            }
        });
    }

    function handleStatusFilterClick(event) {
        const optionButton = event.target.closest('button[tuioption]');
        if (!optionButton) return;
        updateSelection(selectedStatuses, optionButton.textContent.trim(), optionButton);
        applyCombinedFilter();
        saveFilterSettings();
    }

    function handleCourseFilterClick(event) {
        const optionButton = event.target.closest('button[tuioption]');
        if (!optionButton) return;
        updateSelection(selectedCourses, optionButton.textContent.trim(), optionButton);
        applyCombinedFilter();
        saveFilterSettings();
    }

    function updateSelection(selectionSet, text, button) {
        if (selectionSet.has(text)) selectionSet.delete(text);
        else selectionSet.add(text);
        const isSelected = selectionSet.has(text);
        button.classList.toggle('t-option_selected', isSelected);
        button.setAttribute('aria-selected', isSelected.toString());
        const checkbox = button.querySelector('input[tuicheckbox]');
        if (checkbox) checkbox.checked = isSelected;
    }

    function setupDropdownInterceptor() {
        // Если наблюдатель уже есть, не создаем новый
        if (dropdownObserver) return;

        dropdownObserver = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                for (const node of mutation.addedNodes) {
                    // Проверяем URL прямо здесь, чтобы не модифицировать фильтры на странице архива
                    if (isArchivedPage() || node.nodeType !== 1 || !node.matches('tui-dropdown')) continue;

                    const dataListWrapper = node.querySelector('tui-data-list-wrapper.multiselect__dropdown');
                    if (!dataListWrapper) continue;
                    const statusFilterContainer = document.querySelector('cu-multiselect-filter[controlname="state"]');
                    const courseFilterContainer = document.querySelector('cu-multiselect-filter[controlname="course"]');
                    if (!dataListWrapper.dataset.culmsRebuilt && statusFilterContainer?.contains(document.activeElement)) buildDropdown(dataListWrapper, 'state');
                    else if (!dataListWrapper.dataset.culmsRebuilt && courseFilterContainer?.contains(document.activeElement)) buildDropdown(dataListWrapper, 'course');
                }
            }
        });
        dropdownObserver.observe(document.body, { childList: true, subtree: true });
        window.cuLmsLog('Task Status Updater: Dropdown observer initialized.');
    }

    function buildDropdown(dataListWrapper, type) {
        dataListWrapper.dataset.culmsRebuilt = 'true';
        const dataList = dataListWrapper.querySelector('tui-data-list');
        if (!dataList) return;
        dataList.innerHTML = '';
        if (type === 'state') {
            HARDCODED_STATUSES.forEach(text => {
                const isSelected = selectedStatuses.has(text);
                dataList.appendChild(createFilterOption(text, isSelected));
            });
            dataListWrapper.addEventListener('click', handleStatusFilterClick);
        } else if (type === 'course') {
            const sortedCourses = [...masterCourseList].sort();
            sortedCourses.forEach(text => {
                const isSelected = selectedCourses.has(text);
                dataList.appendChild(createFilterOption(text, isSelected));
            });
            dataListWrapper.addEventListener('click', handleCourseFilterClick);
        }
    }

    function createFilterOption(text, isSelected) {
        const button = document.createElement('button');
        button.className = 'ng-star-inserted';
        if (isSelected) button.classList.add('t-option_selected');
        button.setAttribute('tuiicons', '');
        button.setAttribute('type', 'button');
        button.setAttribute('role', 'option');
        button.setAttribute('automation-id', 'tui-data-list-wrapper__option');
        button.setAttribute('tuielement', '');
        button.setAttribute('tuioption', '');
        button.setAttribute('aria-selected', isSelected.toString());
        const finalStyle = `pointer-events: none; --t-checked-icon: url(assets/cu/icons/cuIconCheck.svg); --t-indeterminate-icon: url(assets/cu/icons/cuIconMinus.svg);`;
        button.innerHTML = `<tui-multi-select-option><input tuiappearance tuicheckbox type="checkbox" class="_readonly" data-appearance="primary" data-size="s" style="${finalStyle}"><span class="t-content ng-star-inserted"> ${text} </span></tui-multi-select-option>`;
        const checkbox = button.querySelector('input[tuicheckbox]');
        if (checkbox) checkbox.checked = isSelected;
        return button;
    }
    
    // ИСПРАВЛЕННЫЙ СЛУШАТЕЛЬ С ЗАДЕРЖКОЙ
    browser.storage.onChanged.addListener((changes) => {
        if (changes.themeEnabled) {
            // Запускаем обновление с небольшой задержкой, чтобы избежать гонки состояний
            setTimeout(() => {
                window.cuLmsLog('Task Status Updater: Theme changed, refreshing styles and icons...');
                
                // Шаг 1: Обновляем CSS-переменные
                refreshDynamicStyles();
                
                // Шаг 2: Очищаем кэш SVG, чтобы они гарантированно были перерисованы без fill
                Object.keys(svgIconCache).forEach(key => delete svgIconCache[key]);

                // Шаг 3: Находим все кнопки и принудительно обновляем их иконки
                document.querySelectorAll('.culms-action-button').forEach(button => {
                    const isSkipped = button.dataset.isSkipped === 'true';
                    updateButtonIcon(button, isSkipped); 
                });
            }, 100); // 100 миллисекунд — надежная задержка
        }
    });

    // --- Запуск скрипта ---
    // Главный наблюдатель, который управляет циклами запуска и очистки
    initializeObserver();
    // Первоначальный запуск
    throttledCheckAndRun();
}