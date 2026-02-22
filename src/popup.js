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
    friendsEnabled: document.getElementById('friends-toggle'), // <-- ДОБАВИТЬ ЭТУ СТРОКУ
};

// Элементы UI для зависимых настроек
const endOfCourseCalcLabel = document.getElementById('end-of-course-calc-label');
const futureExamsDisplayContainer = document.getElementById('future-exams-display-container');
const futureExamsDisplayFormat = document.getElementById('future-exams-display-format');


// --- НОВОЕ: элементы UI для авто-переименования ДЗ ---
const autoRenameFormatContainer = document.getElementById('auto-rename-format-container');
const renameTemplateSelect = document.getElementById('rename-template-select');


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

// --- НОВОЕ: UI для авто-переименования ДЗ ---
function updateAutoRenameUI(isEnabled) {
    if (autoRenameFormatContainer) {
        autoRenameFormatContainer.style.display = isEnabled ? 'block' : 'none';
    }
}

// --- ОСНОВНАЯ ЛОГИКА ОБНОВЛЕНИЯ СОСТОЯНИЙ ---

/**
 * Обновляет состояние всех переключателей на основе данных из хранилища.
 */
function refreshToggleStates() {
    browser.storage.sync.get([...allKeys, 'autoRenameTemplate']).then((data) => {
        allKeys.forEach(key => {
            if (toggles[key]) {
                toggles[key].checked = !!data[key];
            }
        });

        // Особая логика для зависимых переключателей
        const isThemeEnabled = !!data.themeEnabled;
        const isAdvancedStatementsEnabled = !!data.advancedStatementsEnabled;
        const isAutoRenameEnabled = !!data.autoRenameEnabled; // НОВОЕ

        // OLED зависит от Темной темы
        if (toggles.oledEnabled) {
            toggles.oledEnabled.disabled = !isThemeEnabled;
        }

        // Калькулятор зависит от Расширенной ведомости
        if (toggles.endOfCourseCalcEnabled) {
            toggles.endOfCourseCalcEnabled.disabled = !isAdvancedStatementsEnabled;
            endOfCourseCalcLabel.classList.toggle('disabled-label', !isAdvancedStatementsEnabled);
        }

        if (data.stickerEnabled) {
            updateStickerUI(true);
            // Показываем кнопку редактора
            const editorContainer = document.getElementById('sticker-editor-container');
            if (editorContainer) editorContainer.style.display = 'block';
            
            loadStickerImage();
        } else {
            updateStickerUI(false);
            const editorContainer = document.getElementById('sticker-editor-container');
            if (editorContainer) editorContainer.style.display = 'none';
        }

         // НОВОЕ: логика UI авто-переименования
        updateAutoRenameUI(isAutoRenameEnabled);
        if (renameTemplateSelect && data.autoRenameTemplate) {
            renameTemplateSelect.value = data.autoRenameTemplate;
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
                // Логика для старого контейнера (чтобы не ломалось)
                updateStickerUI(isEnabled);
                
                // --- ИСПРАВЛЕНИЕ: Логика для НОВОГО контейнера с кнопками ---
                const editorContainer = document.getElementById('sticker-editor-container');
                if (editorContainer) {
                    editorContainer.style.display = isEnabled ? 'block' : 'none';
                }

                if (isEnabled) loadStickerImage();
            }
            // НОВОЕ: видимость выбора шаблона авто-переименования
            else if (key === 'autoRenameEnabled') {
                updateAutoRenameUI(isEnabled);
            }
        });
    }
});

const openEditorBtn = document.getElementById('open-editor-btn');
if (openEditorBtn) {
    openEditorBtn.addEventListener('click', () => {
        const targetUrl = 'https://my.centraluniversity.ru/learn/courses/view/actual?customIconEditor=true';
        
        // 1. Принудительно ставим галочку "Включено", если пользователь нажал кнопку редактора,
        // но забыл включить сам переключатель.
        if (toggles.stickerEnabled && !toggles.stickerEnabled.checked) {
            toggles.stickerEnabled.checked = true;
            // Обновляем pendingChanges вручную, так как событие change может не успеть отработать
            if (isInsideIframe) {
                pendingChanges['stickerEnabled'] = true;
            }
        }

        // 2. Логика перехода с гарантированным сохранением
        if (isInsideIframe) {
            // Если мы внутри Iframe, изменения лежат в pendingChanges.
            // Нужно СРОЧНО отправить их родителю перед тем, как страница перезагрузится.
            
            // Убедимся, что включение стикеров попало в изменения
            pendingChanges['stickerEnabled'] = true;

            window.parent.postMessage({
                action: 'receivePendingChanges',
                payload: pendingChanges,
                shouldReload: false // Ставим false, так как мы всё равно уходим со страницы
            }, '*');

            // Даем крошечную задержку (50мс), чтобы сообщение успело дойти до родителя,
            // и только потом меняем URL
            setTimeout(() => {
                window.parent.location.href = targetUrl;
            }, 50);

        } else {
            // Если открыто как отдельное окно браузера (popup)
            // Сначала явно сохраняем в storage, и только ПОСЛЕ успешного сохранения (then) закрываем окно.
            browser.storage.sync.set({ stickerEnabled: true }).then(() => {
                browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
                    if (tabs.length > 0) {
                        browser.tabs.update(tabs[0].id, { url: targetUrl });
                        window.close();
                    }
                });
            });
        }
    });
}

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

if (renameTemplateSelect) {
    renameTemplateSelect.addEventListener('change', () => {
        const template = renameTemplateSelect.value;
        if (isInsideIframe) {
            if (reloadNotice) reloadNotice.style.display = 'block';
            pendingChanges['autoRenameTemplate'] = template;
        } else {
            browser.storage.sync.set({ autoRenameTemplate: template });
        }
        // Тут мы только сохраняем шаблон.
        // Контент-скрипт должен сам подхватить это через storage.onChanged и дернуть rename_hw.
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
        // Проверяем, что сообщение от родителя
        if (event.source !== window.parent) return;
        
        // Родитель просит изменения перед закрытием
        if (event.data && event.data.action === 'getPendingChanges') {
            
            // Проверяем, нужно ли перезагружать страницу
            // Если меняли стикеры, тему или снег — нужна перезагрузка
            const needsReload = 'stickerEnabled' in pendingChanges || 
                                'themeEnabled' in pendingChanges ||
                                'snowEnabled' in pendingChanges;

            window.parent.postMessage({
                action: 'receivePendingChanges',
                payload: pendingChanges,
                shouldReload: needsReload // <-- Важный флаг, если ваш контент-скрипт его поддерживает
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

const resetBtn = document.getElementById('reset-all-settings-btn');

if (resetBtn) {
    resetBtn.addEventListener('click', () => {
        const confirmed = confirm('Это действие сбросит все настройки:\n- Удалит скрытые курсы и друзей\n- Сбросит порядок курсов\n- Удалит стикер\n- Вернет стандартные настройки\n\nПродолжить?');
        if (!confirmed) return;

        // 1. Очистка хранилища РАСШИРЕНИЯ (это попап делает сам)
        browser.storage.local.clear().then(() => {
            console.log('Extension Local Storage cleared');
            if (stickerFileInput) stickerFileInput.value = '';
            loadStickerImage(); 
        });

        // 2. Очистка хранилища САЙТА (LMS)
        if (isInsideIframe) {
            // Вариант А: Мы внутри Iframe -> шлем postMessage родителю
            // (Родитель - это content.js, который мы обновили в Шаге 1)
            window.parent.postMessage({ action: 'RESET_LMS_LOCAL_STORAGE_IFRAME' }, '*');
        } else {
            // Вариант Б: Мы в обычном меню -> шлем сообщение во вкладку
            browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
                if (tabs.length > 0) {
                    browser.tabs.sendMessage(tabs[0].id, { 
                        action: 'RESET_LMS_LOCAL_STORAGE_FROM_POPUP' 
                    }).catch(err => {
                        console.log("Контент-скрипт не ответил (возможно, страница не загружена полностью):", err);
                    });
                }
            });
        }

        // 3. Сброс настроек UI и Sync
        const defaultSettings = {
            themeEnabled: false,
            oledEnabled: false,
            autoRenameEnabled: false,
            autoRenameTemplate: 'dz_fi',
            courseOverviewTaskStatusToggle: false,
            advancedStatementsEnabled: true,
            endOfCourseCalcEnabled: true,
            emojiHeartsEnabled: false,
            snowEnabled: false,
            oldCoursesDesignToggle: false,
            futureExamsViewToggle: false,
            futureExamsDisplayFormat: 'date',
            stickerEnabled: false,
            courseOverviewAutoscrollToggle: false,
            friendsEnabled: true 
        };

        if (isInsideIframe) {
            // UI обновление для iframe
            pendingChanges = { ...pendingChanges, ...defaultSettings };
            
            Object.keys(defaultSettings).forEach(key => {
                if (toggles[key]) {
                    toggles[key].checked = defaultSettings[key];
                    if (key === 'themeEnabled' && toggles.oledEnabled) toggles.oledEnabled.disabled = !defaultSettings[key];
                    if (key === 'advancedStatementsEnabled' && toggles.endOfCourseCalcEnabled) toggles.endOfCourseCalcEnabled.disabled = !defaultSettings[key];
                }
            });
            
            if (renameTemplateSelect) renameTemplateSelect.value = defaultSettings.autoRenameTemplate;
            if (futureExamsDisplayFormat) futureExamsDisplayFormat.value = defaultSettings.futureExamsDisplayFormat;
            
            if (stickerUploadContainer) stickerUploadContainer.style.display = 'none';
            if (autoRenameFormatContainer) autoRenameFormatContainer.style.display = 'none';
            if (futureExamsDisplayContainer) futureExamsDisplayContainer.style.display = 'none';

            if (reloadNotice) reloadNotice.style.display = 'block';

        } else {
            // Для обычного popup
            browser.storage.sync.set(defaultSettings);
        }
    });
}
const resetCourseIconsBtn = document.getElementById('reset-course-icons-btn');
if (resetCourseIconsBtn) {
    resetCourseIconsBtn.addEventListener('click', () => {
        const confirmed = confirm('Сбросить иконки для ВСЕХ курсов? Перезагрузите страницу.');
        
        if (confirmed) {
            browser.storage.local.remove('courseIcons').then(() => {
                // Принудительная перезагрузка родительской страницы
                if (isInsideIframe) {
                    window.parent.location.reload();
                } else {
                    browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
                        if (tabs.length > 0) {
                            browser.tabs.reload(tabs[0].id);
                            window.close();
                        }
                    });
                }
            });
        }
    });
}