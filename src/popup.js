// popup.js - УНИВЕРСАЛЬНАЯ ФИНАЛЬНАЯ ВЕРСИЯ (с контекстной плашкой)
'use strict';

// --- ОПРЕДЕЛЕНИЕ КОНТЕКСТА ---
// Эта проверка определяет, запущен ли скрипт внутри iframe на странице
const isInsideIframe = (window.self !== window.top);


// --- БЛОК ДЛЯ УПРАВЛЕНИЯ ТЕМОЙ POPUP (без изменений) ---

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
    emojiHeartsEnabled: document.getElementById('emoji-hearts-toggle'),
    oldCoursesDesignToggle: document.getElementById('old-courses-design-toggle'),
    futureExamsViewToggle: document.getElementById('future-exams-view-toggle')
};

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
        if (toggles.oledEnabled) {
            toggles.oledEnabled.disabled = !toggles.themeEnabled.checked;
        }
        applyPopupTheme(!!data.themeEnabled);
    });
}

// 1. Добавляем обработчики, которые работают по-разному в зависимости от контекста
allKeys.forEach(key => {
    const toggleElement = toggles[key];
    if (toggleElement) {
        toggleElement.addEventListener('change', () => {
            const isEnabled = toggleElement.checked;
            
            if (isInsideIframe) {
                // Показываем плашку, только если мы на странице, где перезагрузка отложена
                if (reloadNotice) reloadNotice.style.display = 'block';
                // Накапливаем изменения для отложенной записи
                pendingChanges[key] = isEnabled;
            } else {
                // Если мы в popup браузера - сохраняем немедленно
                browser.storage.sync.set({ [key]: isEnabled });
            }

            // Особая логика для OLED
            if (key === 'themeEnabled') {
                if (toggles.oledEnabled) {
                    toggles.oledEnabled.disabled = !isEnabled;
                    if (!isEnabled && toggles.oledEnabled.checked) {
                        toggles.oledEnabled.checked = false;
                        if (isInsideIframe) {
                            pendingChanges['oledEnabled'] = false;
                        } else {
                            browser.storage.sync.set({ oledEnabled: false });
                        }
                    }
                }
            }
        });
    }
});

// 2. Слушатели сообщений и изменений в хранилище

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

// 3. При первой загрузке обновляем состояние
refreshToggleStates();