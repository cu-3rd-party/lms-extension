// popup.js - УНИВЕРСАЛЬНАЯ ФИНАЛЬНАЯ ВЕРСИЯ (с контекстной плашкой и всеми опциями)
'use strict';

// --- ОПРЕДЕЛЕНИЕ КОНТЕКСТА ---
// Эта проверка определяет, запущен ли скрипт внутри iframe на странице
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

// Централизованный объект для всех переключателей.
// Ключ - это имя опции в browser.storage.sync
const toggles = {
    themeEnabled: document.getElementById('theme-toggle'),
    oledEnabled: document.getElementById('oled-toggle'),
    autoRenameEnabled: document.getElementById('auto-rename-toggle'),
    courseOverviewTaskStatusToggle: document.getElementById('course-overview-task-status-toggle'),
    emojiHeartsEnabled: document.getElementById('emoji-hearts-toggle'),
    oldCoursesDesignToggle: document.getElementById('old-courses-design-toggle'),
    futureExamsViewToggle: document.getElementById('future-exams-view-toggle'),
    courseOverviewAutoscrollToggle: document.getElementById('course-overview-autoscroll-toggle'),
};

const futureExamsDisplayContainer = document.getElementById('future-exams-display-container');
const futureExamsDisplayFormat = document.getElementById('future-exams-display-format');

const reloadNotice = document.getElementById('reload-notice');
const allKeys = [...Object.keys(toggles), 'futureExamsDisplayFormat'];
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
        // Особая логика для OLED-переключателя
        if (toggles.oledEnabled) {
            toggles.oledEnabled.disabled = !toggles.themeEnabled.checked;
        }
        // Применяем тему к самому popup
        applyPopupTheme(!!data.themeEnabled);

        // Апдейты отображения полей, зависящих от состояний переключателей
        updateFormatDisplayVisibility(data.futureExamsDisplayFormat);
    });
}

function updateFormatDisplayVisibility(displayFormat) {
  if (toggles['futureExamsViewToggle'].checked) {
    futureExamsDisplayContainer.style.display = 'block';
  }
  else {
    futureExamsDisplayContainer.style.display = 'none';
  }

  if (futureExamsDisplayFormat && displayFormat) {
    futureExamsDisplayFormat.value = displayFormat;
  }
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

            // Особая логика для OLED: он зависит от темной темы
            if (key === 'themeEnabled') {
                if (toggles.oledEnabled) {
                    toggles.oledEnabled.disabled = !isEnabled;
                    // Если темную тему выключают, OLED тоже выключается
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

            if (key === 'futureExamsViewToggle') {
                updateFormatDisplayVisibility();
            }
        });
    }
});

// 2. Слушатели сообщений (для iframe) и изменений в хранилище (для синхронизации)

if (isInsideIframe) {
    // Этот код работает только на странице настроек
    window.addEventListener('message', (event) => {
        // Убеждаемся, что сообщение пришло от родительского окна
        if (event.source !== window.parent) return;

        if (event.data && event.data.action === 'getPendingChanges') {
            // Отправляем накопленные изменения родительскому окну
            window.parent.postMessage({
                action: 'receivePendingChanges',
                payload: pendingChanges
            }, '*');
            
            // Сбрасываем изменения и скрываем плашку
            pendingChanges = {}; 
            if (reloadNotice) reloadNotice.style.display = 'none';
        }
    });
}

if (futureExamsDisplayFormat) {
    futureExamsDisplayFormat.addEventListener('change', () => {
        const selectedFormat = futureExamsDisplayFormat.value;
        
        if (isInsideIframe) {
            // В iframe накапливаем изменения
            if (reloadNotice) reloadNotice.style.display = 'block';
            pendingChanges['futureExamsDisplayFormat'] = selectedFormat;
        } else {
            // В popup браузера сохраняем сразу
            browser.storage.sync.set({ futureExamsDisplayFormat: selectedFormat });
        }
    });
}

// Слушаем изменения в хранилище, чтобы popup всегда отражал актуальное состояние
browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
        refreshToggleStates();
    }
});

// 3. При первой загрузке popup, обновляем состояние всех переключателей
refreshToggleStates();