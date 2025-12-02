// popup.js - УНИВЕРСАЛЬНАЯ ФИНАЛЬНАЯ ВЕРСИЯ (с контекстной плашкой, всеми опциями и загрузкой стикеров)
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

// --- УПРАВЛЕНИЕ ПЕРЕКЛЮЧАТЕЛЯМИ И ЭЛЕМЕНТАМИ ---
const toggles = {
    themeEnabled: document.getElementById('theme-toggle'),
    oledEnabled: document.getElementById('oled-toggle'),
    autoRenameEnabled: document.getElementById('auto-rename-toggle'),
    snowEnabled: document.getElementById('snow-toggle'),
    stickerEnabled: document.getElementById('sticker-toggle'),
    courseOverviewTaskStatusToggle: document.getElementById('course-overview-task-status-toggle'),
    emojiHeartsEnabled: document.getElementById('emoji-hearts-toggle'),
    oldCoursesDesignToggle: document.getElementById('old-courses-design-toggle'),
    futureExamsViewToggle: document.getElementById('future-exams-view-toggle'),
    courseOverviewAutoscrollToggle: document.getElementById('course-overview-autoscroll-toggle'),
    advancedStatementsEnabled: document.getElementById('advanced-statements-toggle'),
    endOfCourseCalcEnabled: document.getElementById('end-of-course-calc-toggle'),
};

// Элементы UI для зависимых настроек
const endOfCourseCalcLabel = document.getElementById('end-of-course-calc-label');
const futureExamsDisplayContainer = document.getElementById('future-exams-display-container');
const futureExamsDisplayFormat = document.getElementById('future-exams-display-format');

// Элементы UI для стикеров
const stickerUploadContainer = document.getElementById('sticker-upload-container');
const stickerFileInput = document.getElementById('sticker-file-input');
const stickerPreview = document.getElementById('sticker-preview');
const noStickerText = document.getElementById('no-sticker-text');
const stickerResetBtn = document.getElementById('sticker-reset-btn');

// Уведомление о перезагрузке (для iframe)
const reloadNotice = document.getElementById('reload-notice');

// Объединяем все ключи настроек для удобства
const allKeys = [...Object.keys(toggles), 'futureExamsDisplayFormat'];
let pendingChanges = {};


// --- ФУНКЦИИ ДЛЯ РАБОТЫ СО СТИКЕРАМИ ---

/**
 * Показывает или скрывает блок загрузки картинки
 */
function updateStickerUI(isEnabled) {
    if (stickerUploadContainer) {
        stickerUploadContainer.style.display = isEnabled ? 'block' : 'none';
    }
}

/**
 * Загружает превью стикера из local storage (не sync, т.к. размер большой)
 */
function loadStickerImage() {
    if (!stickerPreview || !noStickerText) return;
    
    browser.storage.local.get(['customStickerData']).then((result) => {
        if (result.customStickerData) {
            stickerPreview.src = result.customStickerData;
            stickerPreview.style.display = 'inline-block';
            noStickerText.style.display = 'none';
        } else {
            stickerPreview.src = '';
            stickerPreview.style.display = 'none';
            noStickerText.style.display = 'inline-block';
        }
    });
}

// --- ОСНОВНАЯ ЛОГИКА ОБНОВЛЕНИЯ СОСТОЯНИЙ ---

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

        // OLED зависит от Темной темы
        if (toggles.oledEnabled) {
            toggles.oledEnabled.disabled = !isThemeEnabled;
        }

        // Калькулятор зависит от Расширенной ведомости
        if (toggles.endOfCourseCalcEnabled) {
            toggles.endOfCourseCalcEnabled.disabled = !isAdvancedStatementsEnabled;
            endOfCourseCalcLabel.classList.toggle('disabled-label', !isAdvancedStatementsEnabled);
        }

        // Логика UI стикеров
        if (data.stickerEnabled) {
            updateStickerUI(true);
            loadStickerImage();
        } else {
            updateStickerUI(false);
        }

        // Применяем тему к самому popup
        applyPopupTheme(isThemeEnabled);

        // Обновляем отображение полей, зависящих от состояний переключателей
        updateFormatDisplayVisibility(data.futureExamsDisplayFormat);
    });
}

function updateFormatDisplayVisibility(displayFormat) {
    if (toggles['futureExamsViewToggle'] && futureExamsDisplayContainer) {
        futureExamsDisplayContainer.style.display = toggles['futureExamsViewToggle'].checked ? 'block' : 'none';
    }

    if (futureExamsDisplayFormat && displayFormat) {
        futureExamsDisplayFormat.value = displayFormat;
    }
}


// --- ДОБАВЛЕНИЕ ОБРАБОТЧИКОВ СОБЫТИЙ ---

// 1. Обработчики для всех переключателей (checkboxes)
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

            // --- Логика зависимостей ---
            
            // Зависимость OLED от Темы
            if (key === 'themeEnabled') {
                if (toggles.oledEnabled) {
                    toggles.oledEnabled.disabled = !isEnabled;
                    if (!isEnabled && toggles.oledEnabled.checked) {
                        toggles.oledEnabled.checked = false;
                        const oledChange = { oledEnabled: false };
                        if (isInsideIframe) pendingChanges = { ...pendingChanges, ...oledChange };
                        else browser.storage.sync.set(oledChange);
                    }
                }
            } 
            // Зависимость Калькулятора от Ведомости
            else if (key === 'advancedStatementsEnabled') {
                if (toggles.endOfCourseCalcEnabled) {
                    toggles.endOfCourseCalcEnabled.disabled = !isEnabled;
                    endOfCourseCalcLabel.classList.toggle('disabled-label', !isEnabled);
                    if (!isEnabled && toggles.endOfCourseCalcEnabled.checked) {
                        toggles.endOfCourseCalcEnabled.checked = false;
                        const endOfCourseChange = { endOfCourseCalcEnabled: false };
                        if (isInsideIframe) pendingChanges = { ...pendingChanges, ...endOfCourseChange };
                        else browser.storage.sync.set(endOfCourseChange);
                    }
                }
            } 
            // Видимость настроек экзаменов
            else if (key === 'futureExamsViewToggle') {
                updateFormatDisplayVisibility();
            }
            // Видимость настроек стикеров
            else if (key === 'stickerEnabled') {
                updateStickerUI(isEnabled);
                if (isEnabled) loadStickerImage();
            }
        });
    }
});

// 2. Обработчик для выпадающего списка формата экзаменов
if (futureExamsDisplayFormat) {
    futureExamsDisplayFormat.addEventListener('change', () => {
        const selectedFormat = futureExamsDisplayFormat.value;
        if (isInsideIframe) {
            if (reloadNotice) reloadNotice.style.display = 'block';
            pendingChanges['futureExamsDisplayFormat'] = selectedFormat;
        } else {
            browser.storage.sync.set({ futureExamsDisplayFormat: selectedFormat });
        }
    });
}

// 3. Обработчик ЗАГРУЗКИ ФАЙЛА (Стикеры)
if (stickerFileInput) {
    stickerFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // Лимит 3 МБ
        if (file.size > 3 * 1024 * 1024) {
            alert('Файл слишком большой! Пожалуйста, выберите картинку до 3 МБ.');
            stickerFileInput.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            const base64String = e.target.result;
            // Сохраняем в LOCAL storage (большие данные)
            browser.storage.local.set({ customStickerData: base64String }).then(() => {
                loadStickerImage();
                // Если мы не в iframe, можно уведомить background или content script, 
                // но storage listener там сработает сам.
            });
        };
        reader.readAsDataURL(file);
    });
}

// 4. Обработчик УДАЛЕНИЯ КАРТИНКИ (Стикеры)
if (stickerResetBtn) {
    stickerResetBtn.addEventListener('click', () => {
        browser.storage.local.remove('customStickerData').then(() => {
            loadStickerImage();
            stickerFileInput.value = '';
        });
    });
}


// --- СИСТЕМНЫЕ СЛУШАТЕЛИ ---

// Слушатели сообщений из iframe (если popup открыт внутри страницы)
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

// Слушаем изменения в хранилище, чтобы popup всегда отражал актуальное состояние
// (например, если открыто несколько вкладок или настройки изменены программно)
browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
        refreshToggleStates();
    }
});

// Первоначальная инициализация
refreshToggleStates();