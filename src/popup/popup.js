// popup.js - УНИВЕРСАЛЬНАЯ ФИНАЛЬНАЯ ВЕРСИЯ (с отложенным сохранением)
'use strict';

// --- ОПРЕДЕЛЕНИЕ КОНТЕКСТА ---
const isInsideIframe = window.self !== window.top;

// Настройки, которые применяются "на лету" без перезагрузки (можно сохранять сразу)
const LIVE_SETTINGS = ['themeEnabled', 'oledEnabled'];

// --- БЛОК ДЛЯ УПРАВЛЕНИЯ ТЕМОЙ POPUP ---
const darkThemeLinkID = 'popup-dark-theme-style';

function applyPopupTheme(isEnabled) {
  const existingLink = document.getElementById(darkThemeLinkID);
  if (isEnabled && !existingLink) {
    const link = document.createElement('link');
    link.id = darkThemeLinkID;
    link.rel = 'stylesheet';
    link.href = browser.runtime.getURL('popup/popup_dark.css');
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
  friendsEnabled: document.getElementById('friends-toggle'),
};

// Элементы UI для зависимых настроек
const endOfCourseCalcLabel = document.getElementById('end-of-course-calc-label');
const futureExamsDisplayContainer = document.getElementById('future-exams-display-container');
const futureExamsDisplayFormat = document.getElementById('future-exams-display-format');
const autoRenameFormatContainer = document.getElementById('auto-rename-format-container');
const renameTemplateSelect = document.getElementById('rename-template-select');
const stickerUploadContainer = document.getElementById('sticker-upload-container');
const stickerFileInput = document.getElementById('sticker-file-input');
const stickerPreview = document.getElementById('sticker-preview');
const noStickerText = document.getElementById('no-sticker-text');
const stickerResetBtn = document.getElementById('sticker-reset-btn');
const reloadNotice = document.getElementById('reload-notice');
const stickerFitSelect = document.getElementById('sticker-fit-select');
const disableExtensionOnceBtn = document.getElementById('disable-extension-once-btn');

const allKeys = [
  ...Object.keys(toggles),
  'futureExamsDisplayFormat',
  'autoRenameTemplate',
  'stickerObjectFit',
];
let pendingChanges = {};

// --- ФУНКЦИИ ДЛЯ РАБОТЫ СО СТИКЕРАМИ ---
function updateStickerUI(isEnabled) {
  if (stickerUploadContainer) {
    stickerUploadContainer.style.display = isEnabled ? 'block' : 'none';
  }
}

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

function updateAutoRenameUI(isEnabled) {
  if (autoRenameFormatContainer) {
    autoRenameFormatContainer.style.display = isEnabled ? 'block' : 'none';
  }
}

// --- ОСНОВНАЯ ЛОГИКА ОБНОВЛЕНИЯ СОСТОЯНИЙ ---
function refreshToggleStates() {
  browser.storage.sync.get([...allKeys, 'autoRenameTemplate']).then((data) => {
    allKeys.forEach((key) => {
      if (toggles[key]) {
        toggles[key].checked = !!data[key];
      }
    });

    const isThemeEnabled = !!data.themeEnabled;
    const isAdvancedStatementsEnabled = !!data.advancedStatementsEnabled;
    const isAutoRenameEnabled = !!data.autoRenameEnabled;

    if (toggles.oledEnabled) toggles.oledEnabled.disabled = !isThemeEnabled;
    if (toggles.endOfCourseCalcEnabled) {
      toggles.endOfCourseCalcEnabled.disabled = !isAdvancedStatementsEnabled;
      endOfCourseCalcLabel.classList.toggle('disabled-label', !isAdvancedStatementsEnabled);
    }

    if (data.stickerEnabled) {
      updateStickerUI(true);
      const editorContainer = document.getElementById('sticker-editor-container');
      if (editorContainer) editorContainer.style.display = 'block';
      loadStickerImage();
    } else {
      updateStickerUI(false);
      const editorContainer = document.getElementById('sticker-editor-container');
      if (editorContainer) editorContainer.style.display = 'none';
    }
    if (stickerFitSelect) stickerFitSelect.value = data.stickerObjectFit || 'cover';

    updateAutoRenameUI(isAutoRenameEnabled);
    if (renameTemplateSelect && data.autoRenameTemplate) {
      renameTemplateSelect.value = data.autoRenameTemplate;
    }

    applyPopupTheme(isThemeEnabled);
    updateFormatDisplayVisibility(data.futureExamsDisplayFormat);
  });
}

function updateFormatDisplayVisibility(displayFormat) {
  if (toggles['futureExamsViewToggle'] && futureExamsDisplayContainer) {
    futureExamsDisplayContainer.style.display = toggles['futureExamsViewToggle'].checked
      ? 'block'
      : 'none';
  }
  if (futureExamsDisplayFormat && displayFormat) {
    futureExamsDisplayFormat.value = displayFormat;
  }
}

// --- ДОБАВЛЕНИЕ ОБРАБОТЧИКОВ СОБЫТИЙ ---

// 1. Обработчики для всех переключателей
allKeys.forEach((key) => {
  const toggleElement = toggles[key];
  if (toggleElement) {
    toggleElement.addEventListener('change', () => {
      const isEnabled = toggleElement.checked;
      const change = { [key]: isEnabled };

      if (isInsideIframe) {
        // Если мы внутри iframe, просто копим изменения
        pendingChanges = { ...pendingChanges, ...change };

        // Живые настройки (тема) сохраняем сразу для мгновенного эффекта
        if (LIVE_SETTINGS.includes(key)) {
          browser.storage.sync.set(change);
        } else {
          // Для остальных просто показываем плашку "Применится после закрытия"
          if (reloadNotice) reloadNotice.style.display = 'block';
        }
      } else {
        // Если открыто как классический popup окна
        browser.storage.sync.set(change);
      }

      // --- Логика зависимостей ---
      if (key === 'themeEnabled') {
        if (toggles.oledEnabled) {
          toggles.oledEnabled.disabled = !isEnabled;
          if (!isEnabled && toggles.oledEnabled.checked) {
            toggles.oledEnabled.checked = false;
            const oledChange = { oledEnabled: false };
            if (isInsideIframe) {
              pendingChanges = { ...pendingChanges, ...oledChange };
              browser.storage.sync.set(oledChange); // OLED тоже Live настройка
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
              if (reloadNotice) reloadNotice.style.display = 'block';
            } else {
              browser.storage.sync.set(endOfCourseChange);
            }
          }
        }
      } else if (key === 'futureExamsViewToggle') {
        updateFormatDisplayVisibility();
      } else if (key === 'stickerEnabled') {
        updateStickerUI(isEnabled);
        const editorContainer = document.getElementById('sticker-editor-container');
        if (editorContainer) editorContainer.style.display = isEnabled ? 'block' : 'none';
        if (isEnabled) loadStickerImage();
      } else if (key === 'autoRenameEnabled') {
        updateAutoRenameUI(isEnabled);
      }
    });
  }
});

const openEditorBtn = document.getElementById('open-editor-btn');
if (openEditorBtn) {
  openEditorBtn.addEventListener('click', () => {
    const targetUrl =
      'https://my.centraluniversity.ru/learn/courses/view/actual?customIconEditor=true';

    if (toggles.stickerEnabled && !toggles.stickerEnabled.checked) {
      toggles.stickerEnabled.checked = true;
      if (isInsideIframe) pendingChanges['stickerEnabled'] = true;
    }

    if (isInsideIframe) {
      pendingChanges['stickerEnabled'] = true;
      window.parent.postMessage(
        {
          action: 'receivePendingChanges',
          payload: pendingChanges, // Отправляем всё накопленное перед переходом
          shouldReload: false,
        },
        '*'
      );

      setTimeout(() => {
        window.parent.location.href = targetUrl;
      }, 50);
    } else {
      browser.storage.sync.set({ stickerEnabled: true }).then(() => {
        browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
          if (tabs.length > 0) {
            browser.tabs.update(tabs[0].id, { url: targetUrl });
            window.close();
          }
        });
      });
    }
  });
}

// 2. Обработчики дропдаунов (откладываем сохранение в Iframe)
if (futureExamsDisplayFormat) {
  futureExamsDisplayFormat.addEventListener('change', () => {
    const selectedFormat = futureExamsDisplayFormat.value;
    if (isInsideIframe) {
      pendingChanges['futureExamsDisplayFormat'] = selectedFormat;
      if (reloadNotice) reloadNotice.style.display = 'block';
    } else {
      browser.storage.sync.set({ futureExamsDisplayFormat: selectedFormat });
    }
  });
}

if (renameTemplateSelect) {
  renameTemplateSelect.addEventListener('change', () => {
    const template = renameTemplateSelect.value;
    if (isInsideIframe) {
      pendingChanges['autoRenameTemplate'] = template;
      if (reloadNotice) reloadNotice.style.display = 'block';
    } else {
      browser.storage.sync.set({ autoRenameTemplate: template });
    }
  });
}

if (stickerFitSelect) {
  stickerFitSelect.addEventListener('change', () => {
    const val = stickerFitSelect.value;
    if (isInsideIframe) {
      pendingChanges['stickerObjectFit'] = val;
      if (reloadNotice) reloadNotice.style.display = 'block';
    } else {
      browser.storage.sync.set({ stickerObjectFit: val });
    }
  });
}

// 3. Обработчик загрузки файла
if (stickerFileInput) {
  stickerFileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      alert('Файл слишком большой! Пожалуйста, выберите картинку до 3 МБ.');
      stickerFileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      const base64String = e.target.result;
      browser.storage.local.set({ customStickerData: base64String }).then(() => {
        loadStickerImage();
      });
    };
    reader.readAsDataURL(file);
  });
}

// 4. Обработчик удаления картинки
if (stickerResetBtn) {
  stickerResetBtn.addEventListener('click', () => {
    browser.storage.local.remove('customStickerData').then(() => {
      loadStickerImage();
      stickerFileInput.value = '';
    });
  });
}

// --- СИСТЕМНЫЕ СЛУШАТЕЛИ ---

// Отправка накопленных изменений родителю при закрытии меню
if (isInsideIframe) {
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;

    if (event.data && event.data.action === 'getPendingChanges') {
      // Перезагрузка нужна, если в pendingChanges есть что-то помимо "живых" настроек
      const needsReload = Object.keys(pendingChanges).some((k) => !LIVE_SETTINGS.includes(k));

      window.parent.postMessage(
        {
          action: 'receivePendingChanges',
          payload: pendingChanges, // Теперь мы реально передаем все изменения
          shouldReload: needsReload,
        },
        '*'
      );

      pendingChanges = {};
      if (reloadNotice) reloadNotice.style.display = 'none';
    }
  });
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') refreshToggleStates();
});

refreshToggleStates();

if (disableExtensionOnceBtn) {
  disableExtensionOnceBtn.addEventListener('click', () => {
    if (isInsideIframe) {
      window.parent.postMessage({ action: 'reloadWithoutExtension' }, '*');
      return;
    }

    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const activeTabId = tabs[0]?.id;
      if (typeof activeTabId !== 'number') {
        alert('Не удалось определить активную вкладку.');
        return;
      }

      browser.runtime
        .sendMessage({ action: 'BYPASS_EXTENSION_ONCE', tabId: activeTabId })
        .then(() => {
          window.close();
        })
        .catch((error) => {
          alert(error.message || 'Не удалось перезагрузить страницу без плагина.');
        });
    });
  });
}

// Логика сброса настроек
const resetBtn = document.getElementById('reset-all-settings-btn');
if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    const confirmed = confirm(
      'Это действие сбросит все настройки:\n- Удалит скрытые курсы и друзей\n- Сбросит порядок курсов\n- Удалит стикер\n- Вернет стандартные настройки\n\nПродолжить?'
    );
    if (!confirmed) return;

    browser.storage.local.clear().then(() => {
      if (stickerFileInput) stickerFileInput.value = '';
      loadStickerImage();
    });

    if (isInsideIframe) {
      window.parent.postMessage({ action: 'RESET_LMS_LOCAL_STORAGE_IFRAME' }, '*');
    } else {
      browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        if (tabs.length > 0) {
          browser.tabs
            .sendMessage(tabs[0].id, { action: 'RESET_LMS_LOCAL_STORAGE_FROM_POPUP' })
            .catch(() => {});
        }
      });
    }

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
      friendsEnabled: true,
    };

    if (isInsideIframe) {
      pendingChanges = { ...pendingChanges, ...defaultSettings };

      // Сбрасываем тему сразу, чтобы было визуально понятно, что меню обнулилось
      browser.storage.sync.set({
        themeEnabled: false,
        oledEnabled: false,
      });

      Object.keys(defaultSettings).forEach((key) => {
        if (toggles[key]) {
          toggles[key].checked = defaultSettings[key];
          if (key === 'themeEnabled' && toggles.oledEnabled)
            toggles.oledEnabled.disabled = !defaultSettings[key];
          if (key === 'advancedStatementsEnabled' && toggles.endOfCourseCalcEnabled)
            toggles.endOfCourseCalcEnabled.disabled = !defaultSettings[key];
        }
      });

      if (renameTemplateSelect) renameTemplateSelect.value = defaultSettings.autoRenameTemplate;
      if (futureExamsDisplayFormat)
        futureExamsDisplayFormat.value = defaultSettings.futureExamsDisplayFormat;

      if (stickerUploadContainer) stickerUploadContainer.style.display = 'none';
      if (autoRenameFormatContainer) autoRenameFormatContainer.style.display = 'none';
      if (futureExamsDisplayContainer) futureExamsDisplayContainer.style.display = 'none';

      if (reloadNotice) reloadNotice.style.display = 'block';
    } else {
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
        if (isInsideIframe) {
          window.parent.location.reload();
        } else {
          browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
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
