'use strict';

document.addEventListener('DOMContentLoaded', () => {
    // --- НОВЫЙ БЛОК: Логика для применения темы к самому popup ---
    const POPUP_STYLE_ID = 'popup-dark-theme-style';

    /**
     * Применяет или удаляет CSS-файл темной темы из документа popup.
     * @param {boolean} isEnabled - Включить ли темную тему.
     */
    function applyPopupTheme(isEnabled) {
        const existingLink = document.getElementById(POPUP_STYLE_ID);
        
        if (isEnabled) {
            document.body.classList.add('dark-theme');
            if (!existingLink) {
                const link = document.createElement('link');
                link.id = POPUP_STYLE_ID;
                link.rel = 'stylesheet';
                link.href = browser.runtime.getURL('popup_dark.css'); // Указываем путь к файлу стилей
                document.head.appendChild(link);
            }
        } else {
            document.body.classList.remove('dark-theme');
            if (existingLink) {
                existingLink.remove();
            }
        }
    }
    
    // --- Определение всех элементов управления ---
    const controls = {
        themeEnabled: document.getElementById('theme-toggle'),
        oledEnabled: document.getElementById('oled-toggle'),
        autoRenameEnabled: document.getElementById('auto-rename-toggle'),
        renameTemplate: document.getElementById('rename-template-select'),
        courseOverviewTaskStatusToggle: document.getElementById('course-overview-task-status-toggle'),
        advancedStatementsEnabled: document.getElementById('advanced-statements-toggle'),
        endOfCourseCalcEnabled: document.getElementById('end-of-course-calc-toggle'),
        emojiHeartsEnabled: document.getElementById('emoji-hearts-toggle'),
        oldCoursesDesignToggle: document.getElementById('old-courses-design-toggle'),
        futureExamsViewToggle: document.getElementById('future-exams-view-toggle'),
        futureExamsDisplayFormat: document.getElementById('future-exams-display-format'),
        courseOverviewAutoscrollToggle: document.getElementById('course-overview-autoscroll-toggle'),
    };

    const dependentElements = {
        oledLabel: document.getElementById('oled-label'),
        endOfCourseCalcLabel: document.getElementById('end-of-course-calc-label'),
        autoRenameFormatContainer: document.getElementById('auto-rename-format-container'),
        futureExamsDisplayContainer: document.getElementById('future-exams-display-container'),
    };

    const allControlKeys = Object.keys(controls);

    /**
     * Обновляет состояние UI на основе данных из хранилища.
     */
    const updateUIFromStorage = () => {
        browser.storage.sync.get(allControlKeys).then(data => {
            allControlKeys.forEach(key => {
                const element = controls[key];
                if (!element) return;
                if (element.type === 'checkbox') {
                    element.checked = !!data[key];
                } else if (element.tagName === 'SELECT') {
                    element.value = data[key] || (key === 'renameTemplate' ? 'dz_fi' : 'date');
                }
            });
            
            // Применяем тему к самому окну popup
            applyPopupTheme(!!data.themeEnabled);
            
            // Обновляем видимость зависимых элементов
            updateDependentUI();
        });
    };
    
    const updateDependentUI = () => {
        const isThemeEnabled = controls.themeEnabled.checked;
        controls.oledEnabled.disabled = !isThemeEnabled;
        dependentElements.oledLabel.classList.toggle('disabled-label', !isThemeEnabled);

        const isAdvancedStatementsEnabled = controls.advancedStatementsEnabled.checked;
        controls.endOfCourseCalcEnabled.disabled = !isAdvancedStatementsEnabled;
        dependentElements.endOfCourseCalcLabel.classList.toggle('disabled-label', !isAdvancedStatementsEnabled);

        dependentElements.autoRenameFormatContainer.style.display = controls.autoRenameEnabled.checked ? 'flex' : 'none';
        dependentElements.futureExamsDisplayContainer.style.display = controls.futureExamsViewToggle.checked ? 'flex' : 'none';
    };

    /**
     * Сохраняет изменения в хранилище.
     */
    const handleControlChange = (key, value) => {
        let changesToSave = { [key]: value };
        if (key === 'themeEnabled' && !value) {
            changesToSave.oledEnabled = false;
        }
        if (key === 'advancedStatementsEnabled' && !value) {
            changesToSave.endOfCourseCalcEnabled = false;
        }
        browser.storage.sync.set(changesToSave);
    };

    // --- Назначение обработчиков событий ---
    allControlKeys.forEach(key => {
        const element = controls[key];
        if (!element) return;
        const eventType = (element.type === 'checkbox') ? 'change' : 'input';
        element.addEventListener(eventType, () => {
            const value = (element.type === 'checkbox') ? element.checked : element.value;
            handleControlChange(key, value);
        });
    });

    // --- Синхронизация UI ---
    browser.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync') {
            updateUIFromStorage();
        }
    });

    // --- Первоначальная загрузка ---
    updateUIFromStorage();
});
