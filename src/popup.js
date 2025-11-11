// popup.js - УНИВЕРСАЛЬНАЯ ФИНАЛЬНАЯ ВЕРСИЯ (с контекстной плашкой и всеми опциями)
'use strict';

// --- ОПРЕДЕЛЕНИЕ КОНТЕКСТА ---
const isInsideIframe = (window.self !== window.top);

// --- БЛОК ДЛЯ УПРАВЛЕНИЯ ТЕМОЙ POPUP ---
const darkThemeLinkID = 'popup-dark-theme-style';

function applyPopupTheme(isEnabled) {
    const existingLink = document.getElementById(darkThemeLinkID);
    if (isEnabled && !existingLink) {
        const link = document.createElement('link');
        link.id = darkThemeLinkID;
        link.rel = 'stylesheet';
        link.href = browser.runtime.getURL('popup_dark.css');
        document.head.appendChild(link);
        document.body.classList.add('dark-theme');
    } else if (!isEnabled && existingLink) {
        existingLink.remove();
        document.body.classList.remove('dark-theme');
    }
}

// --- УПРАВЛЕНИЕ ПЕРЕКЛЮЧАТЕЛЯМИ И ПЛАШКОЙ ---
const toggles = {
    themeEnabled: document.getElementById('theme-toggle'),
    oledEnabled: document.getElementById('oled-toggle'),
    autoRenameEnabled: document.getElementById('auto-rename-toggle'),
    courseOverviewTaskStatusToggle: document.getElementById('course-overview-task-status-toggle'),
    emojiHeartsEnabled: document.getElementById('emoji-hearts-toggle'),
    oldCoursesDesignToggle: document.getElementById('old-courses-design-toggle'),
    futureExamsViewToggle: document.getElementById('future-exams-view-toggle'),
    courseOverviewAutoscrollToggle: document.getElementById('course-overview-autoscroll-toggle'),
    advancedStatementsEnabled: document.getElementById('advanced-statements-toggle'),
    endOfCourseCalcEnabled: document.getElementById('end-of-course-calc-toggle'), // <-- НОВАЯ СТРОКА
};

const endOfCourseCalcLabel = document.getElementById('end-of-course-calc-label'); // <-- НОВАЯ СТРОКА
const reloadNotice = document.getElementById('reload-notice');
const allKeys = Object.keys(toggles);
let pendingChanges = {};

/**
 * Обновляет состояние всех переключателей на основе данных из хранилища.
 */
function refreshToggleStates() {
    browser.storage.sync.get(allKeys).then((data) => {
        allKeys.forEach(key => {
            if (toggles[key]) {
                toggles[key].checked = !!data[key];
            }
        });
        
        // Особая логика для зависимых переключателей
        const isThemeEnabled = !!data.themeEnabled;
        const isAdvancedStatementsEnabled = !!data.advancedStatementsEnabled;

        if (toggles.oledEnabled) {
            toggles.oledEnabled.disabled = !isThemeEnabled;
        }
        
        // --- НОВАЯ ЛОГИКА ЗАВИСИМОСТИ ---
        if (toggles.endOfCourseCalcEnabled) {
            toggles.endOfCourseCalcEnabled.disabled = !isAdvancedStatementsEnabled;
            endOfCourseCalcLabel.classList.toggle('disabled-label', !isAdvancedStatementsEnabled);
        }
        
        applyPopupTheme(isThemeEnabled);
    });
}

// Обработчики событий
allKeys.forEach(key => {
    const toggleElement = toggles[key];
    if (toggleElement) {
        toggleElement.addEventListener('change', () => {
            const isEnabled = toggleElement.checked;
            
            const change = { [key]: isEnabled };

            if (isInsideIframe) {
                if (reloadNotice) reloadNotice.style.display = 'block';
                pendingChanges = { ...pendingChanges, ...change };
            } else {
                browser.storage.sync.set(change);
            }

            // --- ОБНОВЛЕННАЯ ЛОГИКА ЗАВИСИМОСТЕЙ ---
            if (key === 'themeEnabled') {
                if (toggles.oledEnabled) {
                    toggles.oledEnabled.disabled = !isEnabled;
                    if (!isEnabled && toggles.oledEnabled.checked) {
                        toggles.oledEnabled.checked = false;
                        const oledChange = { oledEnabled: false };
                        if (isInsideIframe) {
                            pendingChanges = { ...pendingChanges, ...oledChange };
                        } else {
                            browser.storage.sync.set(oledChange);
                        }
                    }
                }
            } else if (key === 'advancedStatementsEnabled') {
                if (toggles.endOfCourseCalcEnabled) {
                    toggles.endOfCourseCalcEnabled.disabled = !isEnabled;
                    endOfCourseCalcLabel.classList.toggle('disabled-label', !isEnabled);
                    if (!isEnabled && toggles.endOfCourseCalcEnabled.checked) {
                        toggles.endOfCourseCalcEnabled.checked = false;
                        const endOfCourseChange = { endOfCourseCalcEnabled: false };
                        if (isInsideIframe) {
                            pendingChanges = { ...pendingChanges, ...endOfCourseChange };
                        } else {
                            browser.storage.sync.set(endOfCourseChange);
                        }
                    }
                }
            }
        });
    }
});

// Слушатели сообщений и изменений
if (isInsideIframe) {
    window.addEventListener('message', (event) => {
        if (event.source !== window.parent) return;
        if (event.data && event.data.action === 'getPendingChanges') {
            window.parent.postMessage({
                action: 'receivePendingChanges',
                payload: pendingChanges
            }, '*');
            pendingChanges = {}; 
            if (reloadNotice) reloadNotice.style.display = 'none';
        }
    });
}

browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
        refreshToggleStates();
    }
});

// Первоначальная загрузка
refreshToggleStates();