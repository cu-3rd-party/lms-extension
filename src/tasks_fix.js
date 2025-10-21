'use strict';

// --- КОНСТАНТЫ ДЛЯ LOCALSTORAGE ---
const FILTER_STORAGE_KEY = 'cu.lms.actual-student-tasks-custom-filter';
const DEFAULT_FILTER_KEY = 'cu.lms.actual-student-tasks-filter';

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
    } catch (error) { window.cuLmsLog('Task Status Updater: Failed to clean localStorage filters.', error); }
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

// --- НОВАЯ ЛОГИКА: Троттлинг для MutationObserver ---
let canRunLogic = true;

/**
 * Обертка для запуска основной логики с ограничением по частоте (не чаще раза в секунду).
 */
function throttledCheckAndRun() {
    if (!canRunLogic) return; // Если вызов был недавно, выходим

    const taskTableExists = document.querySelector('.task-table');
    const isHeaderMissing = !document.querySelector('[data-culms-weight-header]');

    if (taskTableExists && isHeaderMissing) {
        canRunLogic = false; // Блокируем повторный запуск
        runLogic();
        setTimeout(() => {
            canRunLogic = true; // Разрешаем новый запуск через 1 секунду
        }, 1000);
    }
}

/**
 * Главный инициализатор, который запускает наблюдатель.
 */
function initializeObserver() {
    // Теперь наблюдатель вызывает функцию с ограничением по частоте
    const observer = new MutationObserver(throttledCheckAndRun);
    observer.observe(document.body, { childList: true, subtree: true });
}


/**
 * Основная логика-координатор.
 */
async function runLogic() {
    try {
        injectDynamicStyles();
        await waitForElement('tr[class*="task-table__task"]');
        window.cuLmsLog('Task Status Updater: Task rows found. Starting DOM modification.');

        const settings = await browser.storage.sync.get('emojiHeartsEnabled');
        const isEmojiSwapEnabled = !!settings.emojiHeartsEnabled;

        const tasksData = await fetchTasksData();
        buildTableStructure();

        if (tasksData && tasksData.length > 0) {
            populateTableData(tasksData, isEmojiSwapEnabled);
        }

        // Инициализируем фильтры с восстановлением сохраненных параметров
        initializeFilters();
        setupDropdownInterceptor();

    } catch (error) {
        window.cuLmsLog('Task Status Updater: Error in runLogic:', error);
    }
}

/**
 *  Внедряет CSS-правила, которые зависят от активной темы.
 */
function injectDynamicStyles() {
    const styleId = 'culms-tasks-fix-styles';
    const existingStyle = document.getElementById(styleId);
    if (existingStyle) existingStyle.remove();

    const isDarkTheme = !!document.getElementById('culms-dark-theme-style-base');
    const seminarRowBg = isDarkTheme ? 'rgb(20,20,20)' : '#E0E0E0';
    const seminarChipBg = '#000000';
    const solvedChipBg = '#28a745';

    const cssRules = `
        tr[data-culms-row-type="seminar"] { background-color: ${seminarRowBg} !important; }
        .state-chip[data-culms-status="seminar"] {
            background-color: ${seminarChipBg} !important;
            color: white !important;
            ${isDarkTheme ? 'border: 1px solid #444;' : ''}
        }
        .state-chip[data-culms-status="solved"] {
            background-color: ${solvedChipBg} !important;
            color: white !important;
        }
    `;

    const styleElement = document.createElement('style');
    styleElement.id = styleId;
    styleElement.textContent = cssRules;
    document.head.appendChild(styleElement);
}

/**
 * ЭТАП 1: Только структурные изменения. Добавляет заголовок и пустые ячейки.
 */
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

/**
 * ЭТАП 2: Заполняет ячейки данными и устанавливает атрибуты для стилей.
 */
function populateTableData(tasksData, isEmojiSwapEnabled) {
    document.querySelectorAll('tr[class*="task-table__task"]').forEach(row => {
        const statusElement = row.querySelector('.state-chip');
        const weightCell = row.querySelector('[data-culms-weight-cell]');
        if (!statusElement || !weightCell) return;

        statusElement.removeAttribute('data-culms-status');
        row.removeAttribute('data-culms-row-type');

        const htmlNames = extractTaskAndCourseNamesFromElement(statusElement);
        const task = findMatchingTask(htmlNames, tasksData);

        if (task) {
            if (task.exercise?.activity?.name === 'Аудиторная работа') {
                statusElement.textContent = 'Аудиторная';
                statusElement.setAttribute('data-culms-status', 'seminar');
                row.setAttribute('data-culms-row-type', 'seminar');
            }
            else if (task.submitAt !== null && (statusElement.textContent.includes('В работе') || statusElement.textContent.includes('Есть решение'))) {
                statusElement.textContent = 'Есть решение';
                statusElement.setAttribute('data-culms-status', 'solved');
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
                while (node = walker.nextNode()) {
                    replaceTextInNode(node, EMOJI_TO_HEARTS_MAP);
                }
            }
        }
    });
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
    } catch (error) { window.cuLmsLog('Task Status Updater: Failed to fetch tasks:', error); return []; }
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
const HARDCODED_STATUSES = ["В работе", "Есть решение", "Ревью", "Бэклог", "Аудиторная"];
const masterCourseList = new Set();
let selectedStatuses = new Set(HARDCODED_STATUSES);
let selectedCourses = new Set();

/**
 * Загружает сохраненные параметры фильтров из localStorage
 */
function loadFilterSettings() {
    try {
        const savedFilters = localStorage.getItem(FILTER_STORAGE_KEY);
        if (savedFilters) {
            const { statuses, courses } = JSON.parse(savedFilters);
            
            if (statuses && Array.isArray(statuses)) {
                selectedStatuses = new Set(statuses);
            }
            
            if (courses && Array.isArray(courses)) {
                selectedCourses = new Set(courses);
            }
            window.cuLmsLog('Task Status Updater: Filter settings loaded from storage');
        }
    } catch (error) {
        window.cuLmsLog('Task Status Updater: Failed to load filter settings:', error);
        // В случае ошибки используем значения по умолчанию
        selectedStatuses = new Set(HARDCODED_STATUSES);
    }
}

/**
 * Сохраняет текущие параметры фильтров в localStorage
 */
function saveFilterSettings() {
    try {
        const filterData = {
            statuses: Array.from(selectedStatuses),
            courses: Array.from(selectedCourses),
            timestamp: new Date().toISOString()
        };
        localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filterData));
    } catch (error) {
        window.cuLmsLog('Task Status Updater: Failed to save filter settings:', error);
    }
}

/**
 * Однократно сканирует страницу, создает "главный список" курсов и восстанавливает сохраненные настройки
 */
function initializeFilters() {
    // Загружаем сохраненные настройки
    loadFilterSettings();
    
    // Заполняем главный список только если он пуст
    if (masterCourseList.size === 0) {
        document.querySelectorAll('tr[class*="task-table__task"] .task-table__course-name').forEach(el => {
            const courseName = el.textContent.trim();
            if (courseName) masterCourseList.add(courseName);
        });
        
        // Если нет сохраненных курсов, выбираем все по умолчанию
        if (selectedCourses.size === 0) {
            masterCourseList.forEach(course => selectedCourses.add(course));
        }
        
        window.cuLmsLog('Task Status Updater: Master course list created with saved selections.');
    }
    
    // Применяем фильтры после инициализации
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
    saveFilterSettings(); // Сохраняем после изменения
}

function handleCourseFilterClick(event) {
    const optionButton = event.target.closest('button[tuioption]');
    if (!optionButton) return;
    updateSelection(selectedCourses, optionButton.textContent.trim(), optionButton);
    applyCombinedFilter();
    saveFilterSettings(); // Сохраняем после изменения
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
    const observer = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1 || !node.matches('tui-dropdown')) continue;
                const dataListWrapper = node.querySelector('tui-data-list-wrapper.multiselect__dropdown');
                if (!dataListWrapper) continue;
                const statusFilterContainer = document.querySelector('cu-multiselect-filter[controlname="state"]');
                const courseFilterContainer = document.querySelector('cu-multiselect-filter[controlname="course"]');
                if (!dataListWrapper.dataset.culmsRebuilt && statusFilterContainer?.contains(document.activeElement)) buildDropdown(dataListWrapper, 'state');
                else if (!dataListWrapper.dataset.culmsRebuilt && courseFilterContainer?.contains(document.activeElement)) buildDropdown(dataListWrapper, 'course');
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
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
    button.setAttribute('tuiicons', ''); button.setAttribute('type', 'button'); button.setAttribute('role', 'option');
    button.setAttribute('automation-id', 'tui-data-list-wrapper__option'); button.setAttribute('tuielement', '');
    button.setAttribute('tuioption', ''); button.setAttribute('aria-selected', isSelected.toString());
    const finalStyle = `pointer-events: none; --t-checked-icon: url(assets/cu/icons/cuIconCheck.svg); --t-indeterminate-icon: url(assets/cu/icons/cuIconMinus.svg);`;
    button.innerHTML = `<tui-multi-select-option><input tuiappearance tuicheckbox type="checkbox" class="_readonly" data-appearance="primary" data-size="s" style="${finalStyle}"><span class="t-content ng-star-inserted"> ${text} </span></tui-multi-select-option>`;
    const checkbox = button.querySelector('input[tuicheckbox]');
    if (checkbox) checkbox.checked = isSelected;
    return button;
}

// --- Запуск скрипта ---

// 1. Пробуем запустить логику сразу
throttledCheckAndRun();

// 2. Настраиваем наблюдатель для отслеживания последующих изменений в DOM
initializeObserver();