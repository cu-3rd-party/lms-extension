// popup.js - УНИВЕРСАЛЬНАЯ ФИНАЛЬНАЯ ВЕРСИЯ (с отложенным сохранением)
'use strict';

// --- ОПРЕДЕЛЕНИЕ КОНТЕКСТА ---
const isInsideIframe = window.self !== window.top;

// --- ДОМЕНЫ LMS ---
// Копия списка из src/plugins/lms-hosts.ts: попап — обычный скрипт и
// импортировать модуль не может. При добавлении домена правь оба места.
const LMS_HOSTS = ['my.centraluniversity.ru', 'my.cu.ru'];
const DEFAULT_LMS_ORIGIN = 'https://my.centraluniversity.ru';

function isLmsUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && LMS_HOSTS.includes(parsed.hostname);
  } catch (_error) {
    return false;
  }
}

/**
 * Origin, на котором пользователь сейчас работает: у доменов LMS раздельные
 * сессии, поэтому запрос не на тот вернёт 401. Сначала смотрим активную
 * вкладку, потом — что запомнил фоновый скрипт при последней навигации.
 */
async function resolveLmsOrigin() {
  try {
    const [tab] = await browserApi.tabs.query({ active: true, currentWindow: true });
    if (isLmsUrl(tab?.url)) return new URL(tab.url).origin;
  } catch (_error) {
    // Вкладок может не быть — не страшно, ниже есть запасной вариант.
  }

  const data = await browser.storage.local.get('lmsOrigin');
  return typeof data.lmsOrigin === 'string' ? data.lmsOrigin : DEFAULT_LMS_ORIGIN;
}

// --- ПРОКСИ ДЛЯ API (ДЛЯ ПОДДЕРЖКИ FIREFOX IFRAME) ---
const browserApi = {
  tabs: {
    async query(options) {
      try {
        if (typeof browser !== 'undefined' && browser.tabs && browser.tabs.query) {
          return await browser.tabs.query(options);
        }
      } catch (e) {}
      return await browser.runtime.sendMessage({ action: 'TABS_QUERY', options });
    },
    async update(tabId, options) {
      try {
        if (typeof browser !== 'undefined' && browser.tabs && browser.tabs.update) {
          return await browser.tabs.update(tabId, options);
        }
      } catch (e) {}
      return await browser.runtime.sendMessage({ action: 'TABS_UPDATE', tabId, options });
    },
    async reload(tabId, options) {
      try {
        if (typeof browser !== 'undefined' && browser.tabs && browser.tabs.reload) {
          return await browser.tabs.reload(tabId, options);
        }
      } catch (e) {}
      return await browser.runtime.sendMessage({ action: 'TABS_RELOAD', tabId, options });
    },
    async sendMessage(tabId, message) {
      try {
        if (typeof browser !== 'undefined' && browser.tabs && browser.tabs.sendMessage) {
          return await browser.tabs.sendMessage(tabId, message);
        }
      } catch (e) {}
      return await browser.runtime.sendMessage({ action: 'TABS_SEND_MESSAGE', tabId, message });
    },
  },
};

// Настройки, которые применяются "на лету" без перезагрузки (можно сохранять сразу)
const LIVE_SETTINGS = [
  'themeEnabled',
  'oledEnabled',
  'darkPdfEnabled',
  'oldCoursesDesignToggle',
  'customCourseNamesToggle',
  'customLogoToggle',
  'customBackgroundToggle',
  'customThemeToggle',
  'futureExamsDashboardToggle',
  'futureExamsDashboardDeadlines',
];

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
browser.storage.sync.set({
  advancedStatementsEnabled: true,
  endOfCourseCalcEnabled: true,
});

// --- УПРАВЛЕНИЕ ПЕРЕКЛЮЧАТЕЛЯМИ И ЭЛЕМЕНТАМИ ---
const toggles = {
  themeEnabled: document.getElementById('theme-toggle'),
  oledEnabled: document.getElementById('oled-toggle'),
  darkPdfEnabled: document.getElementById('dark-pdf-toggle'),
  autoRenameEnabled: document.getElementById('auto-rename-toggle'),
  snowEnabled: document.getElementById('snow-toggle'),
  akhIntegrationEnabled: document.getElementById('akh-integration-toggle'),
  contestIntegrationEnabled: document.getElementById('contest-integration-toggle'),
  courseOverviewTaskStatusToggle: document.getElementById('course-overview-task-status-toggle'),
  emojiHeartsEnabled: document.getElementById('emoji-hearts-toggle'),
  oldCoursesDesignToggle: document.getElementById('old-courses-design-toggle'),
  customCourseNamesToggle: document.getElementById('custom-course-names-toggle'),
  customLogoToggle: document.getElementById('custom-logo-toggle'),
  customBackgroundToggle: document.getElementById('custom-background-toggle'),
  customThemeToggle: document.getElementById('custom-theme-toggle'),
  futureExamsViewToggle: document.getElementById('future-exams-view-toggle'),
  futureExamsDashboardToggle: document.getElementById('future-exams-dashboard-toggle'),
  futureExamsDashboardDeadlines: document.getElementById('future-exams-dashboard-deadlines-toggle'),
  courseOverviewAutoscrollToggle: document.getElementById('course-overview-autoscroll-toggle'),
  advancedStatementsEnabled: document.getElementById('advanced-statements-toggle'),
  endOfCourseCalcEnabled: document.getElementById('end-of-course-calc-toggle'),
  friendsEnabled: document.getElementById('friends-toggle'),
  hideBonusButtonEnabled: document.getElementById('hide-bonus-button-toggle'),
};

// Элементы UI для зависимых настроек
const endOfCourseCalcLabel = document.getElementById('end-of-course-calc-label');
const futureExamsDisplayContainer = document.getElementById('future-exams-display-container');
const futureExamsDisplayFormat = document.getElementById('future-exams-display-format');
const autoRenameFormatContainer = document.getElementById('auto-rename-format-container');
const renameTemplateSelect = document.getElementById('rename-template-select');
const reloadNotice = document.getElementById('reload-notice');
const oldCoursesDesignContainer = document.getElementById('old-courses-design-container');
const customCourseNamesContainer = document.getElementById('custom-course-names-container');
const customLogoContainer = document.getElementById('custom-logo-container');
const customLogoPreview = document.getElementById('custom-logo-preview');
const customLogoFile = document.getElementById('custom-logo-file');
const stickerFitSelect = document.getElementById('sticker-fit-select');
const stickerScaleSelect = document.getElementById('sticker-scale-select');
const logoFitSelect = document.getElementById('logo-fit-select');
const logoScaleSelect = document.getElementById('logo-scale-select');
const customBackgroundContainer = document.getElementById('custom-background-container');
const customBackgroundPreview = document.getElementById('custom-background-preview');
const customBackgroundFile = document.getElementById('custom-background-file');
const backgroundFitSelect = document.getElementById('background-fit-select');
const backgroundVeilSelect = document.getElementById('background-veil-select');
const customThemeContainer = document.getElementById('custom-theme-container');
const customThemeStatus = document.getElementById('custom-theme-status');
const openThemeEditorBtn = document.getElementById('open-theme-editor-btn');
const resetThemeBtn = document.getElementById('reset-theme-btn');
const themeNameInput = document.getElementById('theme-name-input');
const themeExportBtn = document.getElementById('theme-export-btn');
const themeImportBtn = document.getElementById('theme-import-btn');
const themeImportFile = document.getElementById('theme-import-file');
const themeFileStatus = document.getElementById('theme-file-status');
const gradesExportBtn = document.getElementById('grades-export-btn');
const gradesExportArchivedBtn = document.getElementById('grades-export-archived-btn');
const gradesExportStatus = document.getElementById('grades-export-status');
const deadlineLevels = document.getElementById('deadline-levels');
const deadlineGreenRange = document.getElementById('deadline-level-green-range');
// Пороги цвета дней с дедлайнами: с какого числа несданных день жёлтый,
// оранжевый и красный. Порядок полей — порядок ключей.
const DEADLINE_LEVELS = [
  { key: 'deadlineLevelYellow', input: document.getElementById('deadline-level-yellow') },
  { key: 'deadlineLevelOrange', input: document.getElementById('deadline-level-orange') },
  { key: 'deadlineLevelRed', input: document.getElementById('deadline-level-red') },
];
const DEADLINE_LEVEL_DEFAULTS = [3, 6, 10];

const allKeys = [
  ...Object.keys(toggles),
  'futureExamsDisplayFormat',
  'autoRenameTemplate',
  'akhCourseFilter',
  'contestCourseFilter',
  'stickerObjectFit',
  'stickerScale',
  'logoObjectFit',
  'logoScale',
  'backgroundFit',
  'backgroundVeil',
  ...DEADLINE_LEVELS.map((level) => level.key),
];
let pendingChanges = {};

function updateOldCoursesDesignUI(isEnabled) {
  if (oldCoursesDesignContainer) {
    oldCoursesDesignContainer.style.display = isEnabled ? 'block' : 'none';
  }
}

function updateCustomCourseNamesUI(isEnabled) {
  if (customCourseNamesContainer) {
    customCourseNamesContainer.style.display = isEnabled ? 'block' : 'none';
  }
}

function updateCustomBackgroundUI(isEnabled) {
  if (customBackgroundContainer) {
    customBackgroundContainer.style.display = isEnabled ? 'block' : 'none';
  }
  if (isEnabled) void refreshImagePreview(customBackgroundPreview, 'customBackground');
}

/** Показывает, что уже накручено в теме: иначе непонятно, есть ли она вообще. */
async function refreshThemeStatus() {
  if (!customThemeStatus) return;

  const data = await browser.storage.local.get([
    'customThemeVars',
    'customThemeCss',
    'customThemeName',
  ]);
  if (themeNameInput && document.activeElement !== themeNameInput) {
    themeNameInput.value = typeof data.customThemeName === 'string' ? data.customThemeName : '';
  }
  const vars =
    data.customThemeVars && typeof data.customThemeVars === 'object'
      ? Object.keys(data.customThemeVars).length
      : 0;
  const cssLines =
    typeof data.customThemeCss === 'string' && data.customThemeCss.trim()
      ? data.customThemeCss.trim().split(/\r?\n/).length
      : 0;

  if (!vars && !cssLines) {
    customThemeStatus.textContent = 'Пока ничего не настроено.';
    return;
  }
  customThemeStatus.textContent =
    'Изменённых переменных: ' + vars + ' · строк своего CSS: ' + cssLines;
}

function updateCustomThemeUI(isEnabled) {
  if (customThemeContainer) {
    customThemeContainer.style.display = isEnabled ? 'block' : 'none';
  }
  if (isEnabled) void refreshThemeStatus();
}

function updateCustomLogoUI(isEnabled) {
  if (customLogoContainer) {
    customLogoContainer.style.display = isEnabled ? 'block' : 'none';
  }
  if (isEnabled) void refreshLogoPreview();
}

/** Показывает в попапе то, что сейчас лежит в хранилище. */
async function refreshImagePreview(node, storageKey, emptyText = 'Картинка не выбрана') {
  if (!node) return;

  const data = await browser.storage.local.get(storageKey);
  const image = data[storageKey];

  node.style.backgroundImage = image ? `url("${image}")` : '';
  node.classList.toggle('logo-preview_empty', !image);
  node.textContent = image ? '' : emptyText;
}

const refreshLogoPreview = () =>
  refreshImagePreview(customLogoPreview, 'customLogo', 'Логотип не выбран');

function updateAutoRenameUI(isEnabled) {
  if (autoRenameFormatContainer) {
    autoRenameFormatContainer.style.display = isEnabled ? 'block' : 'none';
  }
}

// --- ВКЛАДКИ МЕНЮ ---
//
// Слева список вкладок, справа — настройки выбранной. Раньше разделы шли
// аккордеоном в два столбца: их было девять, и нужное приходилось искать по
// заголовкам. Теперь функции разложены по вкладкам в popup.html, а кнопки
// вкладок строятся здесь из .tab-panel — новая вкладка в разметке попадает в
// список сама.

const TAB_KEY = 'culms.popup.tab';

// Значки вкладок: контурные, 24×24, красятся цветом текста кнопки.
const TAB_ICONS = {
  theme: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  look: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  courses:
    '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  deadlines: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  tasks:
    '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  grades: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  friends:
    '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
};

function readSavedTab() {
  try {
    return localStorage.getItem(TAB_KEY);
  } catch (_error) {
    return null;
  }
}

function saveTab(id) {
  try {
    localStorage.setItem(TAB_KEY, id);
  } catch (_error) {
    // Приватный режим или заблокированное хранилище — просто не запомним.
  }
}

function initTabs() {
  const list = document.querySelector('.menu-tabs');
  const panels = [...document.querySelectorAll('.tab-panel')];
  if (!list || !panels.length || list.childElementCount) return;

  const buttons = panels.map((panel) => {
    const id = panel.dataset.tab;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu-tab';
    button.id = `menu-tab-${id}`;
    button.dataset.tab = id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `menu-panel-${id}`);

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('class', 'menu-tab__icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = TAB_ICONS[id] || '<circle cx="12" cy="12" r="4"/>';

    const label = document.createElement('span');
    label.textContent = panel.dataset.title || id;
    button.append(icon, label);

    panel.id = `menu-panel-${id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', button.id);
    list.appendChild(button);
    return button;
  });

  const content = document.querySelector('.menu-content');
  const select = (id, { focus = false } = {}) => {
    const index = Math.max(
      0,
      panels.findIndex((panel) => panel.dataset.tab === id)
    );
    panels.forEach((panel, i) => {
      panel.hidden = i !== index;
      buttons[i].setAttribute('aria-selected', String(i === index));
      buttons[i].tabIndex = i === index ? 0 : -1;
    });
    if (focus) buttons[index].focus();
    if (content) content.scrollTop = 0;
    saveTab(panels[index].dataset.tab);
  };

  buttons.forEach((button, index) => {
    button.addEventListener('click', () => select(button.dataset.tab));
    // Стрелки ходят по вкладкам, как в обычном списке вкладок.
    button.addEventListener('keydown', (event) => {
      const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
      let next = null;
      if (step) next = (index + step + buttons.length) % buttons.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = buttons.length - 1;
      if (next === null) return;
      event.preventDefault();
      select(buttons[next].dataset.tab, { focus: true });
    });
  });

  select(readSavedTab());
}

function showMenuVersion() {
  const target = document.getElementById('menu-version');
  if (!target) return;
  try {
    target.textContent = `версия ${browser.runtime.getManifest().version}`;
  } catch (_error) {
    // Без версии меню работает так же.
  }
}

initTabs();
showMenuVersion();

/** Значение тумблера по умолчанию — из реестра настроек. */
function defaultToggleValue(key) {
  const registry = window.cuLmsSettings;
  if (!registry || typeof registry.defaultFor !== 'function') return false;
  return !!registry.defaultFor(key);
}

// --- ОСНОВНАЯ ЛОГИКА ОБНОВЛЕНИЯ СОСТОЯНИЙ ---
function refreshToggleStates() {
  browser.storage.sync.get([...allKeys, 'autoRenameTemplate']).then((data) => {
    allKeys.forEach((key) => {
      if (!toggles[key]) return;
      // Ключа может не быть вовсе: тогда показываем то же, что подставит сам
      // плагин, иначе галочка врёт (так было с вкладкой друзей).
      toggles[key].checked = key in data ? !!data[key] : defaultToggleValue(key);
    });

    const isThemeEnabled = !!data.themeEnabled;
    const isAdvancedStatementsEnabled = !!data.advancedStatementsEnabled;
    const isAutoRenameEnabled = !!data.autoRenameEnabled;

    if (toggles.oledEnabled) toggles.oledEnabled.disabled = !isThemeEnabled;
    if (toggles.endOfCourseCalcEnabled) {
      toggles.endOfCourseCalcEnabled.disabled = !isAdvancedStatementsEnabled;
      endOfCourseCalcLabel.classList.toggle('disabled-label', !isAdvancedStatementsEnabled);
    }

    updateAutoRenameUI(isAutoRenameEnabled);
    updateOldCoursesDesignUI(!!data.oldCoursesDesignToggle);
    updateCustomCourseNamesUI(!!data.customCourseNamesToggle);
    updateCustomLogoUI(!!data.customLogoToggle);
    updateCustomBackgroundUI(!!data.customBackgroundToggle);
    updateCustomThemeUI(!!data.customThemeToggle);
    if (stickerFitSelect) stickerFitSelect.value = data.stickerObjectFit || 'cover';
    if (stickerScaleSelect) stickerScaleSelect.value = String(data.stickerScale || 100);
    if (logoFitSelect) logoFitSelect.value = data.logoObjectFit || 'contain';
    if (logoScaleSelect) logoScaleSelect.value = String(data.logoScale || 100);
    if (backgroundFitSelect) backgroundFitSelect.value = data.backgroundFit || 'cover';
    if (backgroundVeilSelect) {
      backgroundVeilSelect.value = String(
        data.backgroundVeil === undefined ? 60 : data.backgroundVeil
      );
    }
    updateDeadlineLevelsUI(data);
    updateCourseFilters(data);
    updateContestAuthStatus();
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
      } else if (key === 'futureExamsDashboardDeadlines') {
        if (deadlineLevels) deadlineLevels.hidden = !isEnabled;
      } else if (key === 'autoRenameEnabled') {
        updateAutoRenameUI(isEnabled);
      } else if (key === 'oldCoursesDesignToggle') {
        updateOldCoursesDesignUI(isEnabled);
      } else if (key === 'customCourseNamesToggle') {
        updateCustomCourseNamesUI(isEnabled);
      } else if (key === 'customLogoToggle') {
        updateCustomLogoUI(isEnabled);
      } else if (key === 'customBackgroundToggle') {
        updateCustomBackgroundUI(isEnabled);
      } else if (key === 'customThemeToggle') {
        updateCustomThemeUI(isEnabled);
      } else if (key === 'akhIntegrationEnabled' || key === 'contestIntegrationEnabled') {
        updateCourseFilters();
        if (key === 'contestIntegrationEnabled') updateContestAuthStatus();
      }
    });
  }
});

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

// --- СТАТУС АВТОРИЗАЦИИ НА contest.yandex.ru ---
// Показываем прямо в попапе при включении интеграции, а не бейджем в таблице задач:
// без входа в Яндекс надпись была бы одинаковой у каждой контестной строки.
const contestAuthStatus = document.getElementById('contest-auth-status');

function setContestAuthStatus(text, modifier, linkText) {
  if (!contestAuthStatus) return;

  contestAuthStatus.textContent = text;
  contestAuthStatus.className = modifier
    ? `integration-status integration-status_${modifier}`
    : 'integration-status';

  if (linkText) {
    contestAuthStatus.append(' ');
    const link = document.createElement('a');
    link.href = 'https://contest.yandex.ru/';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = linkText;
    contestAuthStatus.appendChild(link);
  }
}

function updateContestAuthStatus() {
  if (!contestAuthStatus) return;

  // Состояние берём из чекбокса: внутри iframe изменение тумблера до storage ещё не дошло
  const toggle = toggles.contestIntegrationEnabled;
  const isEnabled = toggle ? toggle.checked : false;
  contestAuthStatus.style.display = isEnabled ? 'block' : 'none';
  if (!isEnabled) return;

  if (!contestAuthStatus.textContent) setContestAuthStatus('Проверяю вход в Яндекс...');

  browser.runtime
    .sendMessage({ action: 'CONTEST_CHECK_AUTH' })
    .then((response) => {
      const data = response && response.success ? response.data : null;

      if (!data || data.state === 'unknown') {
        setContestAuthStatus('Не удалось проверить вход в Яндекс.', 'error', 'Открыть контест');
      } else if (data.state === 'anonymous') {
        setContestAuthStatus(
          'Вы не авторизованы на contest.yandex.ru — прогресс не будет виден.',
          'error',
          'Войти'
        );
      } else {
        setContestAuthStatus(
          data.login ? `Вход выполнен: ${data.login}` : 'Вход в Яндекс выполнен.',
          'ok'
        );
      }
    })
    .catch(() => {
      setContestAuthStatus('Не удалось проверить вход в Яндекс.', 'error', 'Открыть контест');
    });
}

// --- ФИЛЬТР КУРСОВ ДЛЯ ВНЕШНИХ ИНТЕГРАЦИЙ ---
// Обе интеграции (AKHCheck и Яндекс.Контест) сканируют только выбранные здесь курсы.
// Пустой список означает «не выбрано»: интеграция не делает ни одного запроса.
const COURSE_FILTERS = [
  {
    key: 'akhCourseFilter',
    toggleKey: 'akhIntegrationEnabled',
    container: document.getElementById('akh-course-filter-container'),
    list: document.getElementById('akh-course-list'),
  },
  {
    key: 'contestCourseFilter',
    toggleKey: 'contestIntegrationEnabled',
    container: document.getElementById('contest-course-filter-container'),
    list: document.getElementById('contest-course-list'),
  },
];

// Список курсов общий для обоих селекторов, поэтому тянем его один раз на открытие попапа
let coursesPromise = null;

function loadCourses() {
  if (!coursesPromise) {
    coursesPromise = browser.runtime
      .sendMessage({ action: 'LMS_FETCH_COURSES' })
      .then((response) => {
        if (response && response.success) return response.data;
        coursesPromise = null; // разрешаем повторную попытку
        return null;
      })
      .catch(() => {
        coursesPromise = null;
        return null;
      });
  }
  return coursesPromise;
}

function saveSetting(key, value) {
  if (isInsideIframe) {
    pendingChanges = { ...pendingChanges, [key]: value };
    if (reloadNotice) reloadNotice.style.display = 'block';
  } else {
    browser.storage.sync.set({ [key]: value });
  }
}

function setCourseHint(filter, text) {
  filter.list.textContent = '';
  filter.list.dataset.signature = '';
  const hint = document.createElement('div');
  hint.className = 'course-hint';
  hint.textContent = text;
  filter.list.appendChild(hint);
}

function renderCourseFilter(filter, courses, selected) {
  const selectedIds = new Set(selected.map((c) => c && c.id));
  // Курс, выбранный раньше, но пропавший из активных (архив, смена семестра),
  // оставляем в списке — иначе он молча выпал бы из фильтра
  const missing = selected.filter((c) => c && !courses.some((x) => x.id === c.id));
  const items = [...courses, ...missing];

  // Перерисовываем только при реальных изменениях, иначе сохранение галочки
  // тут же вызовет storage.onChanged и сбросит скролл списка
  const signature = JSON.stringify([items.map((c) => c.id), [...selectedIds].sort()]);
  if (filter.list.dataset.signature === signature) return;

  filter.list.textContent = '';
  for (const course of items) {
    const item = document.createElement('label');
    item.className = 'course-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedIds.has(course.id);
    checkbox.dataset.course = JSON.stringify({ id: course.id, name: course.name });
    checkbox.addEventListener('change', () => {
      const next = Array.from(filter.list.querySelectorAll('input:checked')).map((input) =>
        JSON.parse(input.dataset.course)
      );
      filter.list.dataset.signature = '';
      saveSetting(filter.key, next);
    });

    const name = document.createElement('span');
    name.textContent = course.name;

    item.append(checkbox, name);
    filter.list.appendChild(item);
  }
  filter.list.dataset.signature = signature;
}

function updateCourseFilters(data) {
  const selections = data
    ? Promise.resolve(data)
    : browser.storage.sync.get(COURSE_FILTERS.map((f) => f.key));

  selections.then((stored) => {
    for (const filter of COURSE_FILTERS) {
      if (!filter.container || !filter.list) continue;

      // Читаем состояние из самого чекбокса: внутри iframe переключатель мог
      // измениться, а до storage изменение ещё не дошло
      const toggle = toggles[filter.toggleKey];
      const isEnabled = toggle ? toggle.checked : !!stored[filter.toggleKey];
      filter.container.style.display = isEnabled ? 'block' : 'none';
      if (!isEnabled) continue;

      const selected = Array.isArray(stored[filter.key]) ? stored[filter.key] : [];
      if (!filter.list.childElementCount) setCourseHint(filter, 'Загружаю курсы...');

      loadCourses().then((courses) => {
        if (!courses) {
          setCourseHint(filter, 'Не удалось получить курсы. Откройте LMS и войдите в неё.');
          return;
        }
        if (!courses.length) {
          setCourseHint(filter, 'Активных курсов не найдено.');
          return;
        }
        renderCourseFilter(filter, courses, selected);
      });
    }
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

// --- ПОРОГИ ЦВЕТА ДЕДЛАЙНОВ ---
//
// Тот же разбор, что в course-view/exams_dashboard.js (toThresholds): целые
// от 2 до 99, каждый больше предыдущего. Поле, которое правят, остаётся как
// есть, а соседние сдвигаются за ним: поставил жёлтый 7 — оранжевый станет 8.

function toDeadlineThresholds(values, fixedIndex = -1) {
  const clamp = (value, fallback) => {
    const raw = Math.round(Number(value));
    return Math.min(99, Math.max(2, Number.isFinite(raw) ? raw : fallback));
  };
  const result = DEADLINE_LEVEL_DEFAULTS.map((fallback, index) => clamp(values[index], fallback));
  // Дальше сдвигаем только соседей правленого поля; места выше 99 не хватает
  // — тогда уступает и оно само.
  for (let index = Math.max(fixedIndex + 1, 1); index < result.length; index++) {
    result[index] = Math.max(result[index], result[index - 1] + 1);
  }
  for (let index = Math.min(fixedIndex, result.length) - 1; index >= 0; index--) {
    result[index] = Math.min(result[index], result[index + 1] - 1);
  }
  let previous = 1;
  return result.map((value) => (previous = Math.max(previous + 1, Math.min(99, value))));
}

function updateDeadlineLevelsUI(data) {
  if (!deadlineLevels) return;
  deadlineLevels.hidden = !data.futureExamsDashboardDeadlines;
  const thresholds = toDeadlineThresholds(DEADLINE_LEVELS.map((level) => data[level.key]));
  DEADLINE_LEVELS.forEach((level, index) => {
    // Поле, в котором сейчас печатают, не трогаем — иначе курсор прыгал бы.
    if (document.activeElement !== level.input) level.input.value = String(thresholds[index]);
  });
  const greenEnd = thresholds[0] - 1;
  deadlineGreenRange.textContent = greenEnd === 1 ? '1' : `1–${greenEnd}`;
}

DEADLINE_LEVELS.forEach((level, index) => {
  if (!level.input) return;
  level.input.addEventListener('change', () => {
    const thresholds = toDeadlineThresholds(
      DEADLINE_LEVELS.map((entry) => entry.input.value),
      index
    );
    DEADLINE_LEVELS.forEach((entry, position) => {
      entry.input.value = String(thresholds[position]);
    });
    browser.storage.sync.set(
      Object.fromEntries(
        DEADLINE_LEVELS.map((entry, position) => [entry.key, thresholds[position]])
      )
    );
  });
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') refreshToggleStates();
});

refreshToggleStates();

// --- АНОНИМНАЯ СТАТИСТИКА (см. src/metrics.ts) ---
//
// Не в общем `toggles`: те в меню на странице копятся до закрытия, а этот
// пишется сразу. В Firefox 140+ у статистики есть ещё и согласие самого
// браузера (`technicalAndInteraction`, его спрашивают при установке): без
// него background ничего не шлёт, поэтому включение здесь просит и его.

/** Цель статистики. Список целей и проверку держит background. */
function trackGoal(goal) {
  browser.runtime.sendMessage({ action: 'METRICS_GOAL', goal }).catch(() => {});
}

const metricsToggle = document.getElementById('metrics-toggle');
const metricsStatus = document.getElementById('metrics-status');
const FIREFOX_DATA_CONSENT = { data_collection: ['technicalAndInteraction'] };
// null — у браузера нет своего согласия на сбор данных (Chrome, Safari,
// старый Firefox). Узнаём заранее: `permissions.request` в Firefox работает
// только синхронно из обработчика клика, ждать там `getAll` нельзя.
let firefoxDataConsent = null;

async function readFirefoxDataConsent() {
  try {
    const perms = await browser.permissions.getAll();
    if (!Array.isArray(perms.data_collection)) return null;
    return perms.data_collection.includes('technicalAndInteraction');
  } catch (_error) {
    return null;
  }
}

async function refreshMetricsToggle() {
  if (!metricsToggle) return;
  firefoxDataConsent = await readFirefoxDataConsent();
  const data = await browser.storage.sync.get('metricsEnabled');
  metricsToggle.checked = data.metricsEnabled !== false && firefoxDataConsent !== false;
}

if (metricsToggle) {
  metricsToggle.addEventListener('change', () => {
    const enabled = metricsToggle.checked;
    if (metricsStatus) metricsStatus.textContent = '';

    if (firefoxDataConsent === null) {
      browser.storage.sync.set({ metricsEnabled: enabled });
      return;
    }

    // Firefox: согласие браузера и наш выключатель меняем вместе, чтобы в
    // about:addons было видно то же, что здесь.
    const consent = enabled
      ? browser.permissions.request(FIREFOX_DATA_CONSENT)
      : browser.permissions.remove(FIREFOX_DATA_CONSENT).then(() => false);
    consent
      .catch(() => null)
      .then(async (granted) => {
        await browser.storage.sync.set({ metricsEnabled: enabled });
        if (enabled && granted !== true && metricsStatus) {
          metricsStatus.textContent =
            'Firefox не дал разрешение. Включить можно в about:addons → расширение → «Разрешения и данные».';
        }
        await refreshMetricsToggle();
      });
  });
  void refreshMetricsToggle();
}

// --- СБРОС ВСЕХ НАСТРОЕК ---
//
// Раньше сброс писал в storage.sync свой список «значений по умолчанию»: он
// отставал от плагинов (не было, например, courseExporterToggle), а в меню на
// странице и вовсе откладывался до закрытия меню. Теперь хранилища чистятся
// целиком — плагины берут те же значения, что на свежей установке.
//
// Ключи устройства остаются: по ним сервер биржи пар и 3rd-theme workshop
// узнают автора, и без них человек потерял бы свои темы и заявки. Это не
// настройки.
//
// Статистика тоже переживает сброс: id установки — иначе после сброса
// человек посчитается новым пользователем, а выключатель — потому что отказ
// от статистики не «настройка по умолчанию», которую можно вернуть.
const RESET_KEEP_LOCAL = [
  'swapDeviceKey',
  'workshopDeviceKey',
  'workshopStudentId',
  'metricsClientId',
];
const RESET_KEEP_SYNC = ['metricsEnabled'];

async function resetAllSettings() {
  const kept = await browser.storage.local.get(RESET_KEEP_LOCAL);
  await browser.storage.local.clear();
  if (Object.keys(kept).length) await browser.storage.local.set(kept);
  const keptSync = await browser.storage.sync.get(RESET_KEEP_SYNC);
  await browser.storage.sync.clear();
  if (Object.keys(keptSync).length) await browser.storage.sync.set(keptSync);
  // Эти две попап и так ставит при каждом открытии (см. начало файла).
  await browser.storage.sync.set({ advancedStatementsEnabled: true, endOfCourseCalcEnabled: true });
  pendingChanges = {};
}

const resetBtn = document.getElementById('reset-all-settings-btn');
if (resetBtn) {
  resetBtn.addEventListener('click', async () => {
    const confirmed = confirm(
      'Сбросить все настройки расширения?\n\n' +
        '- Выключатся все функции и тёмная тема\n' +
        '- Удалятся своя тема, логотип, фоны, обложки и названия курсов\n' +
        '- Вернутся скрытые курсы и задания, удалятся друзья и фильтры задач\n' +
        '- Придётся заново войти в интеграции\n\n' +
        'Страница LMS перезагрузится.'
    );
    if (!confirmed) return;

    resetBtn.disabled = true;
    try {
      await resetAllSettings();
    } catch (error) {
      resetBtn.disabled = false;
      alert('Не получилось сбросить настройки: ' + (error.message || error));
      return;
    }
    trackGoal('settings_reset');

    // localStorage самой LMS (фильтры задач, друзья, настройки таблицы оценок)
    // чистит reset.js на странице, после чего страницу перезагружаем: часть
    // плагинов читает настройки только при загрузке.
    if (isInsideIframe) {
      window.parent.postMessage({ action: 'RESET_LMS_LOCAL_STORAGE_IFRAME' }, '*');
      window.parent.postMessage(
        { action: 'receivePendingChanges', payload: {}, shouldReload: true },
        '*'
      );
      return;
    }
    const [tab] = await browserApi.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      const cleared = await browserApi.tabs
        .sendMessage(tab.id, { action: 'RESET_LMS_LOCAL_STORAGE_FROM_POPUP' })
        .catch(() => null);
      // Ответил reset.js — значит, это вкладка LMS.
      if (cleared && cleared.success) await browserApi.tabs.reload(tab.id);
    }
    location.reload();
  });
}

// Обе настройки плагин применяет на лету, поэтому сохраняем сразу,
// не откладывая до закрытия меню.
if (stickerFitSelect) {
  stickerFitSelect.addEventListener('change', () => {
    browser.storage.sync.set({ stickerObjectFit: stickerFitSelect.value });
  });
}

if (stickerScaleSelect) {
  stickerScaleSelect.addEventListener('change', () => {
    browser.storage.sync.set({ stickerScale: Number(stickerScaleSelect.value) });
  });
}

// --- СВОЯ ТЕМА ---
//
// Редактор живёт на отдельной странице расширения и всегда открывается
// вкладкой: поверх LMS он занимал полэкрана и закрывал то, что красишь.
// Из меню на сайте вдобавок убираем само меню — страница нужна для пипетки.
if (openThemeEditorBtn) {
  openThemeEditorBtn.addEventListener('click', () => {
    browser.runtime.sendMessage({ action: 'OPEN_THEME_EDITOR' });
    if (isInsideIframe) {
      window.parent.postMessage({ action: 'openThemeEditor' }, '*');
      return;
    }
    window.close();
  });
}

// 3rd-theme workshop — тоже отдельная вкладка (plugins/workshop).
const openWorkshopBtn = document.getElementById('open-workshop-btn');
if (openWorkshopBtn) {
  openWorkshopBtn.addEventListener('click', () => {
    browser.runtime.sendMessage({ action: 'OPEN_WORKSHOP' });
    if (isInsideIframe) {
      window.parent.postMessage({ action: 'openWorkshop' }, '*');
      return;
    }
    window.close();
  });
}

function setThemeFileStatus(text, kind = 'info') {
  if (!themeFileStatus) return;
  themeFileStatus.textContent = text || '';
  themeFileStatus.style.color =
    kind === 'error' ? '#d93025' : kind === 'success' ? '#188038' : '#666';
}

// Тема — это файл, которым делятся, поэтому экспорт и импорт живут здесь, а не
// в редакторе: редактор правит текущую тему, меню заведует файлами. Формат и
// проверки общие с остальными настройками — вид профиля `theme`.
if (themeNameInput) {
  themeNameInput.addEventListener('change', () => {
    browser.storage.local.set({ customThemeName: themeNameInput.value.trim() });
  });
}

if (themeExportBtn) {
  themeExportBtn.addEventListener('click', async () => {
    const registry = window.cuLmsSettings;
    if (!registry) {
      setThemeFileStatus('Реестр настроек не загрузился — пересобери расширение.', 'error');
      return;
    }

    const name = themeNameInput ? themeNameInput.value.trim() : '';
    setThemeFileStatus('Собираю...');

    try {
      await browser.storage.local.set({ customThemeName: name });
      const profile = await registry.collect('theme', { name });
      const size = await saveProfileFile(profile);
      const vars = Object.keys(profile.values.customThemeVars || {}).length;
      setThemeFileStatus(
        `Сохранено: ${vars} переменных, ${(size / 1024).toFixed(1)} КБ.`,
        'success'
      );
    } catch (error) {
      setThemeFileStatus('Не удалось сохранить: ' + (error.message || error), 'error');
    }
  });
}

if (themeImportBtn && themeImportFile) {
  themeImportBtn.addEventListener('click', () => themeImportFile.click());

  themeImportFile.addEventListener('change', async () => {
    const file = themeImportFile.files && themeImportFile.files[0];
    themeImportFile.value = '';
    if (!file) return;

    const registry = window.cuLmsSettings;
    if (!registry) {
      setThemeFileStatus('Реестр настроек не загрузился — пересобери расширение.', 'error');
      return;
    }

    try {
      const text = await file.text();
      // Сначала разбор без записи: чужой файл перезапишет то, что человек
      // настраивал руками, — надо показать, что именно приедет.
      const preview = registry.inspect(text);
      if (!preview.ok) {
        setThemeFileStatus(preview.error, 'error');
        return;
      }

      const themeKeys = preview.accepted.filter(({ entry }) => entry.group === 'theme');
      if (!themeKeys.length) {
        setThemeFileStatus('В файле нет темы — это профиль с другими настройками.', 'error');
        return;
      }

      const meta = preview.profile.meta || {};
      const title = meta.name ? `«${meta.name}»` : 'тему';
      const question = `Загрузить ${title}?\n\nТекущая палитра и свой CSS будут перезаписаны.`;
      if (!confirm(question)) {
        setThemeFileStatus('Отменено.');
        return;
      }

      const result = await registry.apply(text);
      if (!result.ok) {
        setThemeFileStatus(result.error, 'error');
        return;
      }

      refreshToggleStates();
      await refreshThemeStatus();
      setThemeFileStatus(`Тема загружена (${themeKeys.length} ключей).`, 'success');
    } catch (error) {
      setThemeFileStatus('Не удалось прочитать файл: ' + (error.message || error), 'error');
    }
  });
}

if (resetThemeBtn) {
  resetThemeBtn.addEventListener('click', async () => {
    if (!confirm('Удалить свою палитру и свой CSS? Тумблер останется включённым.')) return;
    await browser.storage.local.set({ customThemeVars: {}, customThemeCss: '' });
    await refreshThemeStatus();
  });
}

// Логотип применяется без перезагрузки, поэтому пишем в sync сразу.
if (logoFitSelect) {
  logoFitSelect.addEventListener('change', () => {
    browser.storage.sync.set({ logoObjectFit: logoFitSelect.value });
  });
}

if (logoScaleSelect) {
  logoScaleSelect.addEventListener('change', () => {
    browser.storage.sync.set({ logoScale: Number(logoScaleSelect.value) });
  });
}

if (backgroundFitSelect) {
  backgroundFitSelect.addEventListener('change', () => {
    browser.storage.sync.set({ backgroundFit: backgroundFitSelect.value });
  });
}

if (backgroundVeilSelect) {
  backgroundVeilSelect.addEventListener('change', () => {
    browser.storage.sync.set({ backgroundVeil: Number(backgroundVeilSelect.value) });
  });
}

const openCardEditorBtn = document.getElementById('open-card-editor-btn');
if (openCardEditorBtn) {
  openCardEditorBtn.addEventListener('click', async () => {
    const targetUrl =
      (await resolveLmsOrigin()) + '/learn/courses/view/actual/all?customCardEditor=true';

    // Без старого дизайна редактировать нечего — включаем его заодно.
    if (toggles.oldCoursesDesignToggle) toggles.oldCoursesDesignToggle.checked = true;
    updateOldCoursesDesignUI(true);

    browser.storage.sync.set({ oldCoursesDesignToggle: true }).then(() => {
      if (isInsideIframe) {
        pendingChanges = { ...pendingChanges, oldCoursesDesignToggle: true };
        window.parent.postMessage(
          { action: 'receivePendingChanges', payload: pendingChanges, shouldReload: false },
          '*'
        );
        setTimeout(() => {
          window.parent.location.href = targetUrl;
        }, 50);
      } else {
        browserApi.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
          if (tabs.length > 0) {
            browserApi.tabs.update(tabs[0].id, { url: targetUrl });
            window.close();
          }
        });
      }
    });
  });
}

// Архив курсов — тоже local: это просто список id, но живёт рядом с иконками.
const resetArchivedCoursesBtn = document.getElementById('reset-archived-courses-btn');
if (resetArchivedCoursesBtn) {
  resetArchivedCoursesBtn.addEventListener('click', () => {
    if (!confirm('Вернуть в список актуальных все курсы, убранные в архив?')) return;
    browser.storage.local.remove('archivedCourseIds');
  });
}

const resetCourseNamesBtn = document.getElementById('reset-course-names-btn');
if (resetCourseNamesBtn) {
  resetCourseNamesBtn.addEventListener('click', () => {
    if (!confirm('Вернуть всем курсам их настоящие названия?')) return;
    browser.storage.local.remove('courseNames');
  });
}

// --- СВОИ КАРТИНКИ: ЛОГОТИП И ФОН ---
//
// Готовятся одинаково и теми же правилами, что обложки курсов: общий модуль
// plugins/course-view/gif_reencode.js подключён в popup.html.

// Логотип рисуется в коробке 180x32, фон растягивается на весь экран.
const LOGO_LIMITS = { maxSide: 600, rawLimit: 256 * 1024 };
const BACKGROUND_LIMITS = { maxSide: 1920, rawLimit: 512 * 1024 };
// Столько же, сколько у обложек: MAX_RAW_ANIMATED_BYTES в course_cards.js.
const MAX_RAW_ANIMATED_IMAGE_BYTES = 1024 * 1024;
const SLOW_REENCODE_BYTES = 3 * 1024 * 1024;
const SECONDS_PER_MB = 0.45;
const MAX_IMAGE_SOURCE_BYTES = 64 * 1024 * 1024;

const customLogoStatus = document.getElementById('custom-logo-status');
const customBackgroundStatus = document.getElementById('custom-background-status');

const setStatus = (node) => (text) => {
  if (node) node.textContent = text || '';
};

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

/** Перерисовывает картинку под нужный размер. */
async function canvasImage(dataUrl, maxSide) {
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось открыть изображение'));
    img.src = dataUrl;
  });

  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  // webp с прозрачностью — логотипы почти всегда на прозрачном фоне.
  const webp = canvas.toDataURL('image/webp', 0.9);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
}

/**
 * Готовит любой файл к сохранению: вектор и мелочь как есть, анимацию
 * сохраняет анимацией (пережимая, если тяжёлая), остальное — через canvas.
 */
async function prepareImage(file, { maxSide, rawLimit, onStatus }) {
  const dataUrl = await readFileAsDataUrl(file);

  // svg перерисовывать в canvas нельзя — потеряется резкость на любом экране.
  if (file.type === 'image/svg+xml') return dataUrl;

  const formats = window.cuLmsGifReencode;
  if (formats && formats.isAnimated(new Uint8Array(await file.arrayBuffer()))) {
    if (file.size <= MAX_RAW_ANIMATED_IMAGE_BYTES) return dataUrl;

    if (formats.supported()) {
      const megabytes = file.size / (1024 * 1024);
      const seconds = Math.max(2, Math.round(megabytes * SECONDS_PER_MB));
      const proceed =
        file.size < SLOW_REENCODE_BYTES ||
        confirm(
          `Картинка весит ${megabytes.toFixed(1)} МБ — её нужно пережать, иначе она не ` +
            `поместится в хранилище. Это займёт примерно ${seconds} с.\n\n` +
            `ОК — пережать, Отмена — быстро сохранить только первый кадр.`
        );

      if (proceed) {
        const result = await formats.run(file, {
          maxBytes: MAX_RAW_ANIMATED_IMAGE_BYTES,
          onProgress: onStatus,
        });
        onStatus('');
        if (result) return result.dataUrl;
      }
    }
  }

  if (file.size <= rawLimit) return dataUrl;
  return canvasImage(dataUrl, maxSide);
}

/** Общая обвязка кнопок «выбрать» и «сбросить» для логотипа и фона. */
function setupImagePicker(options) {
  const {
    pickButtonId,
    resetButtonId,
    input,
    storageKey,
    limits,
    status,
    preview,
    emptyText,
    onChange,
  } = options;
  const onStatus = setStatus(status);
  const refresh = () => refreshImagePreview(preview, storageKey, emptyText);

  const pickButton = document.getElementById(pickButtonId);
  if (pickButton && input) {
    pickButton.addEventListener('click', () => input.click());

    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      // Сбрасываем значение, иначе повторный выбор того же файла не даст события.
      input.value = '';
      if (!file) return;

      if (file.size > MAX_IMAGE_SOURCE_BYTES) {
        alert(
          `Файл ${(file.size / (1024 * 1024)).toFixed(0)} МБ — слишком большой. ` +
            `Максимум ${MAX_IMAGE_SOURCE_BYTES / (1024 * 1024)} МБ.`
        );
        return;
      }

      try {
        const prepared = await prepareImage(file, { ...limits, onStatus });
        // Картинки живут в local, а не в sync: в квоту sync они не влезают.
        await browser.storage.local.set({ [storageKey]: prepared });
        await refresh();
      } catch (_error) {
        alert('Не удалось обработать картинку. Выберите другой файл.');
      } finally {
        onStatus('');
      }
      // После `finally`: статус уже стёрт, и подпись можно рисовать заново.
      if (onChange) await onChange();
    });
  }

  const resetButton = document.getElementById(resetButtonId);
  if (resetButton) {
    resetButton.addEventListener('click', async () => {
      await browser.storage.local.remove(storageKey);
      await refresh();
      if (onChange) await onChange();
    });
  }
}

setupImagePicker({
  pickButtonId: 'pick-logo-btn',
  resetButtonId: 'reset-logo-btn',
  input: customLogoFile,
  storageKey: 'customLogo',
  limits: LOGO_LIMITS,
  status: customLogoStatus,
  preview: customLogoPreview,
  emptyText: 'Логотип не выбран',
});

setupImagePicker({
  pickButtonId: 'pick-background-btn',
  resetButtonId: 'reset-background-btn',
  input: customBackgroundFile,
  storageKey: 'customBackground',
  limits: BACKGROUND_LIMITS,
  status: customBackgroundStatus,
  preview: customBackgroundPreview,
  emptyText: 'Картинка не выбрана',
});

// --- РЕДАКТОР ФОНА ---
//
// Разные картинки на разных страницах ставятся не отсюда, а панелью прямо на
// странице LMS (plugins/_shared/background_editor.js): там видно, как фон
// ляжет, и там известно, на какой странице человек. Попап её только включает
// флагом в хранилище — панель появится во всех открытых вкладках LMS.

const openBackgroundEditorBtn = document.getElementById('open-background-editor-btn');
const backgroundEditorStatus = document.getElementById('background-editor-status');

async function activeLmsTab() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab && tab.url && isLmsUrl(tab.url) ? tab : null;
  } catch (_error) {
    return null;
  }
}

if (openBackgroundEditorBtn) {
  openBackgroundEditorBtn.addEventListener('click', async () => {
    // Панель на странице LMS: из попапа над чужим сайтом её не увидеть.
    if (!isInsideIframe && !(await activeLmsTab())) {
      if (backgroundEditorStatus) {
        backgroundEditorStatus.textContent = 'Откройте вкладку LMS и нажмите ещё раз.';
      }
      return;
    }

    await browser.storage.local.set({ backgroundEditorActive: true });
    // Без тумблера картинки не видно — а редактор открывают, чтобы видеть.
    await browser.storage.sync.set({ customBackgroundToggle: true });
    if (toggles.customBackgroundToggle) toggles.customBackgroundToggle.checked = true;

    // Обычный попап закрываем, чтобы не загораживал страницу. Меню на самой
    // странице (iframe) закрывает его собственная кнопка.
    if (!isInsideIframe) window.close();
    else if (backgroundEditorStatus) {
      backgroundEditorStatus.textContent = 'Панель редактора — в правом нижнем углу страницы.';
    }
  });
}

// --- НАСТРОЙКИ ФАЙЛОМ ---
//
// Что именно выгружается и что отвергается при загрузке, решает реестр
// plugins/_shared/settings_registry.js — он же подключён в popup.html.

const profileKindSelect = document.getElementById('profile-kind-select');
const profileStatus = document.getElementById('profile-status');
const profileImportFile = document.getElementById('profile-import-file');

function setProfileStatus(text, kind = 'info') {
  if (!profileStatus) return;
  profileStatus.textContent = text || '';
  profileStatus.style.color =
    kind === 'error' ? '#d93025' : kind === 'success' ? '#188038' : '#666';
}

/** Имя файла вида «cu-lms-visual-2026-09-21.json». */
function profileFileName(kind) {
  const date = new Date().toISOString().slice(0, 10);
  return `cu-lms-${kind}-${date}.json`;
}

/**
 * Firefox: файл отдаёт background (DOWNLOAD_FILE в background.ts). Сам попап
 * там закрывается, едва браузер откроет «Сохранить как», и его blob: умирает
 * раньше, чем браузер его прочтёт, — в загрузках остаётся «Failed».
 * `getBrowserInfo` есть только у Firefox. true — загрузка началась.
 */
async function downloadViaBackground(data, filename, mime, saveAs) {
  if (typeof browser.runtime.getBrowserInfo !== 'function') return false;
  const response = await browser.runtime.sendMessage({
    action: 'DOWNLOAD_FILE',
    data,
    filename,
    mime,
    saveAs,
  });
  if (!response || !response.success) {
    throw new Error((response && response.error) || 'Не получилось скачать файл');
  }
  return true;
}

async function saveProfileFile(profile) {
  const text = JSON.stringify(profile, null, 2);
  if (await downloadViaBackground(text, profileFileName(profile.kind), 'application/json', true)) {
    return text.length;
  }
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  try {
    // downloads даёт диалог «куда сохранить» и переживает закрытие попапа.
    if (browser.downloads && browser.downloads.download) {
      await browser.downloads.download({
        url,
        filename: profileFileName(profile.kind),
        saveAs: true,
      });
      return text.length;
    }
  } catch (_error) {
    // Ниже обычная ссылка — она работает и без разрешения downloads.
  }

  const link = document.createElement('a');
  link.href = url;
  link.download = profileFileName(profile.kind);
  link.click();
  return text.length;
}

const profileExportBtn = document.getElementById('profile-export-btn');
if (profileExportBtn) {
  profileExportBtn.addEventListener('click', async () => {
    const registry = window.cuLmsSettings;
    if (!registry) {
      setProfileStatus('Реестр настроек не загрузился — пересобери расширение.', 'error');
      return;
    }

    const kind = (profileKindSelect && profileKindSelect.value) || 'settings';
    setProfileStatus('Собираю...');

    try {
      const profile = await registry.collect(kind);
      const size = await saveProfileFile(profile);
      trackGoal('settings_export');
      const count = Object.keys(profile.values).length;
      setProfileStatus(`Сохранено: ${count} настроек, ${(size / 1024).toFixed(1)} КБ.`, 'success');
    } catch (error) {
      setProfileStatus('Не удалось сохранить: ' + (error.message || error), 'error');
    }
  });
}

const profileImportBtn = document.getElementById('profile-import-btn');
if (profileImportBtn && profileImportFile) {
  profileImportBtn.addEventListener('click', () => profileImportFile.click());

  profileImportFile.addEventListener('change', async () => {
    const file = profileImportFile.files && profileImportFile.files[0];
    profileImportFile.value = '';
    if (!file) return;

    const registry = window.cuLmsSettings;
    if (!registry) {
      setProfileStatus('Реестр настроек не загрузился — пересобери расширение.', 'error');
      return;
    }

    try {
      const text = await file.text();
      // Сначала разбор без записи: показываем, что приедет, и только потом
      // перезаписываем чужими значениями то, что человек настраивал руками.
      const preview = registry.inspect(text);
      if (!preview.ok) {
        setProfileStatus(preview.error, 'error');
        return;
      }

      const meta = preview.profile.meta || {};
      const title = meta.name ? `«${meta.name}»` : 'профиль';
      const skipped = preview.rejected.length ? `\nПропустим: ${preview.rejected.length}.` : '';
      const confirmed = confirm(
        `Загрузить ${title}?\n\nПрименим настроек: ${preview.accepted.length}.${skipped}\n\n` +
          `Текущие значения этих настроек будут перезаписаны.`
      );
      if (!confirmed) {
        setProfileStatus('Отменено.');
        return;
      }

      const result = await registry.apply(text);
      if (!result.ok) {
        setProfileStatus(result.error, 'error');
        return;
      }

      trackGoal('settings_import');
      refreshToggleStates();
      await refreshImagePreview(customLogoPreview, 'customLogo', 'Логотип не выбран');
      await refreshImagePreview(customBackgroundPreview, 'customBackground');

      const tail = result.rejected.length ? `, пропущено ${result.rejected.length}` : '';
      setProfileStatus(`Применено ${result.applied.length} настроек${tail}.`, 'success');
      if (reloadNotice) reloadNotice.style.display = 'block';
    } catch (error) {
      setProfileStatus('Не удалось прочитать файл: ' + (error.message || error), 'error');
    }
  });
}

const resetCourseIconsBtn = document.getElementById('reset-course-icons-btn');
if (resetCourseIconsBtn) {
  resetCourseIconsBtn.addEventListener('click', () => {
    if (!confirm('Сбросить свои иконки для всех курсов?')) return;
    // courseIcons живёт в local, а не в sync: картинки не влезают в квоту sync.
    browser.storage.local.remove('courseIcons');
  });
}

if (gradesExportBtn) {
  gradesExportBtn.addEventListener('click', () => handleGradesExportClick(false));
}
if (gradesExportArchivedBtn) {
  gradesExportArchivedBtn.addEventListener('click', () => handleGradesExportClick(true));
}

function setGradesExportStatus(message, type = 'info') {
  if (!gradesExportStatus) return;

  gradesExportStatus.textContent = message;
  gradesExportStatus.style.color =
    type === 'error' ? '#d93025' : type === 'success' ? '#188038' : '#666';
}

function setGradesExportBusy(isBusy) {
  [gradesExportBtn, gradesExportArchivedBtn].forEach((button) => {
    if (button) button.disabled = isBusy;
  });
}

/**
 * Выгрузка оценок в Excel.
 *
 * @param {boolean} archived false — текущие курсы, true — архивные.
 */
async function handleGradesExportClick(archived) {
  const fileName = archived ? 'grades-archive.xlsx' : 'grades.xlsx';

  try {
    setGradesExportBusy(true);
    setGradesExportStatus('Ищу активную вкладку LMS...');

    if (!window.XLSX) {
      throw new Error('Модуль Excel не загрузился. Пересобери расширение и открой popup заново.');
    }

    const [tab] = await browserApi.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !isLmsUrl(tab.url)) {
      throw new Error('Открой вкладку LMS (my.centraluniversity.ru или my.cu.ru) перед экспортом.');
    }

    setGradesExportStatus(
      archived
        ? 'Собираю оценки архивных курсов через API LMS...'
        : 'Собираю оценки через API LMS...'
    );
    // Оценки собирает функция из src/grades-export.ts: background запускает её
    // во вкладке LMS, и запросы к API идут оттуда с куками пользователя.
    const response = await browser.runtime.sendMessage({
      action: 'GRADES_EXPORT_EXECUTE',
      tabId: tab.id,
      archived,
    });
    if (!response?.success) {
      throw new Error(response?.error || 'Ошибка выполнения скрипта экспорта');
    }

    const result = response.result;
    if (!result?.success) {
      throw new Error(result?.error || 'Не удалось получить данные LMS.');
    }

    if (!result.courses?.length) {
      throw new Error(
        archived ? 'Не нашёл архивных курсов.' : 'Не нашёл активных курсов с оценками.'
      );
    }

    setGradesExportStatus(`Генерирую Excel: ${result.courses.length} курсов...`);
    await downloadWorkbook(generateGradesWorkbook(result.courses), fileName);
    setGradesExportStatus(`Готово: ${fileName} скачан.`, 'success');
  } catch (error) {
    console.error('[CU LMS] Grades export failed:', error);
    setGradesExportStatus(error.message || 'Ошибка экспорта оценок.', 'error');
  } finally {
    setGradesExportBusy(false);
  }
}

/**
 * Отдаёт книгу на скачивание. Не через XLSX.writeFile: раз у расширения есть
 * разрешение downloads, SheetJS зовёт downloads.download с saveAs: true и на
 * каждую выгрузку открывает «Сохранить как», а попап на панели браузера,
 * потеряв фокус, закрывается. Здесь спрашивать ли, куда сохранить, решает
 * настройка браузера.
 */
async function downloadWorkbook(workbook, fileName) {
  const data = window.XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (await downloadViaBackground(data, fileName, mime, false)) return;
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  // Браузер читает файл не мгновенно — ссылку держим живой с запасом.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);

  if (browser.downloads?.download) {
    await browser.downloads.download({ url, filename: fileName });
    return;
  }

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function generateGradesWorkbook(courses) {
  const XLSX = window.XLSX;
  const workbook = XLSX.utils.book_new();
  const usedSheetNames = new Set();
  const courseSheets = courses.map((course) => ({
    course,
    sheetName: makeUniqueSheetName(course.name, usedSheetNames),
  }));

  const summaryRows = [
    ['Курс', 'Накопленный балл', 'Категорий', 'Заданий'],
    ...courseSheets.map(({ course, sheetName }) => [
      { t: 's', f: `HYPERLINK("#${quoteSheetName(sheetName)}!A1","${course.name}")` },
      { t: 'n', f: `${quoteSheetName(sheetName)}!C1` },
      groupTasksByActivity(course.tasks).length,
      getPlannedTasksCount(groupTasksByActivity(course.tasks)),
    ]),
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet['!cols'] = [{ wch: 42 }, { wch: 18 }, { wch: 12 }, { wch: 10 }];
  applySummarySheetStyles(summarySheet, summaryRows.length);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Сводка');

  courseSheets.forEach(({ course, sheetName }) => {
    const groups = groupTasksByActivity(course.tasks);
    const maxTasks = getMaxTasksInGroups(groups);
    const rows = [
      [
        { t: 's', v: 'Перейти к сводке', f: `HYPERLINK("#'Сводка'!A1","Сводка")` },
        'НАКОПЛЕННЫЙ БАЛЛ:',
        { t: 'n', f: makeCourseTotalFormula(groups.length) },
        '',
        'Меняй значения в строках "Баллы", чтобы увидеть прогноз.',
        { t: 's', v: 'Сводка', f: `HYPERLINK("#'Сводка'!A1","Сводка")` },
      ],
      ['Курс:', course.name],
      [
        'Цвета:',
        'зеленый - оценено',
        'красный - провалено',
        'желтый - в работе/на проверке',
        'серый - без оценки',
      ],
      [
        'Категория',
        'Вес',
        'Заданий в категории',
        'Вклад в итог (баллы)',
        'Средний балл',
        ...Array.from({ length: maxTasks }, (_, index) => `Задача ${index + 1}`),
      ],
    ];
    const groupMeta = [];

    groups.forEach((group) => {
      const categoryRow = rows.length + 1;
      const scoreRow = categoryRow + 1;
      const plannedTasks = getPlannedTasks(group);
      const taskCount = plannedTasks.length;
      const scoreSumFormula = makeScoreSumFormula(plannedTasks.length, scoreRow);

      rows.push([
        group.name,
        group.weight,
        taskCount,
        {
          t: 'n',
          f: `ROUND(IF(C${categoryRow}>0,(${scoreSumFormula}/C${categoryRow})*B${categoryRow},0),2)`,
        },
        {
          t: 'n',
          f: `ROUND(IF(C${categoryRow}>0,${scoreSumFormula}/C${categoryRow},0),2)`,
        },
        ...plannedTasks.map((task) => formatTaskName(task)),
      ]);

      rows.push([
        'Баллы для прогноза',
        '',
        '',
        '',
        '',
        ...plannedTasks.map((task) => getTaskScore(task)),
      ]);

      rows.push([]);
      groupMeta.push({ categoryRow, scoreRow, group, plannedTasks });
    });

    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols'] = [
      { wch: 28 },
      { wch: 10 },
      { wch: 18 },
      { wch: 16 },
      { wch: 14 },
      ...Array.from({ length: maxTasks }, () => ({ wch: 26 })),
    ];
    sheet['!rows'] = makeCourseRowHeights(rows.length, groupMeta);
    applyCourseSheetStyles(sheet, groupMeta, maxTasks);
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  });

  return workbook;
}

function groupTasksByActivity(tasks) {
  const groups = new Map();

  tasks.forEach((task) => {
    const activity = task.activity || task.exercise?.activity || {};
    let key = activity.id || activity.name;
    let nameForGroup = activity.name || 'Активность без веса';

    // Special handling: some exports place a "Зачёт/зачет" task without an activity.
    // In that case, group them under a dedicated "Зачёт" category.
    if (!key) {
      const exName = (task.exercise?.name || '').toLowerCase();
      if (exName.includes('зачёт') || exName.includes('зачет')) {
        key = 'zachet';
        nameForGroup = 'Зачёт';
      } else {
        key = 'without-activity';
        nameForGroup = 'Активность без веса';
      }
    }

    if (!groups.has(key)) {
      groups.set(key, {
        name: nameForGroup,
        weight: normalizeNumber(activity.weight, 0),
        maxCount: normalizeNumber(activity.maxExercisesCount, 0),
        tasks: [],
      });
    }

    groups.get(key).tasks.push(task);
  });

  return Array.from(groups.values());
}

function makeCourseTotalFormula(groupCount) {
  if (groupCount === 0) return '0';

  const contributionCells = [];
  for (let index = 0; index < groupCount; index += 1) {
    contributionCells.push(`D${5 + index * 3}`);
  }

  return `ROUND(SUM(${contributionCells.join(',')}),2)`;
}

function makeScoreSumFormula(taskCount, scoreRow) {
  if (taskCount === 0) return '0';

  // Stable baseline: first task uses column 5 + index (E, F, G, ...)
  return `(${Array.from({ length: taskCount }, (_, index) => {
    const column = toColumnName(5 + index);
    return `MIN(10,MAX(0,IF(ISNUMBER(${column}${scoreRow}),${column}${scoreRow},0)))`;
  }).join('+')})`;
}

function formatTaskName(task) {
  return task.exercise?.name || task.name || task.title || 'Без названия';
}

function getTaskScore(task) {
  if (task.score === null || task.score === undefined || task.score === '') return '';

  const score = Number(task.score);
  const extraScore = Number(task.extraScore || 0);
  if (!Number.isFinite(score)) return '';

  return roundToTwo(Math.min(score + (Number.isFinite(extraScore) ? extraScore : 0), 10));
}

function normalizeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundToTwo(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getMaxTasksInGroups(groups) {
  return groups.reduce((max, group) => Math.max(max, getPlannedTaskCount(group)), 1);
}

function getPlannedTasksCount(groups) {
  return groups.reduce((total, group) => total + getPlannedTaskCount(group), 0);
}

function getPlannedTaskCount(group) {
  return Math.max(group.maxCount || 0, group.tasks.length, 1);
}

function getPlannedTasks(group) {
  const plannedCount = getPlannedTaskCount(group);
  const tasks = [...group.tasks];

  for (let index = tasks.length; index < plannedCount; index += 1) {
    tasks.push({
      state: 'planned',
      score: null,
      extraScore: null,
      maxScore: 10,
      activity: {
        id: null,
        name: group.name,
        weight: group.weight,
        maxExercisesCount: group.maxCount,
      },
      exercise: {
        id: null,
        name: `${group.name}: задача ${index + 1}`,
      },
    });
  }

  return tasks;
}

function toColumnName(index) {
  let columnNumber = index + 1;
  let name = '';

  while (columnNumber > 0) {
    const remainder = (columnNumber - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    columnNumber = Math.floor((columnNumber - 1) / 26);
  }

  return name;
}

function makeCourseRowHeights(rowCount, groupMeta) {
  const rows = Array.from({ length: rowCount }, () => ({ hpt: 22 }));
  rows[0] = { hpt: 26 };
  rows[3] = { hpt: 28 };

  groupMeta.forEach(({ categoryRow, scoreRow }) => {
    rows[categoryRow - 1] = { hpt: 46 };
    rows[scoreRow - 1] = { hpt: 24 };
    rows[scoreRow] = { hpt: 8 };
  });

  return rows;
}

function applySummarySheetStyles(sheet, rowCount) {
  // 4 columns: Курс, Накопленный балл, Категорий, Заданий
  for (let column = 0; column < 4; column += 1) {
    applyCellStyle(sheet, `${toColumnName(column)}1`, STYLES.header);
  }

  for (let row = 2; row <= rowCount; row += 1) {
    applyCellStyle(sheet, `A${row}`, STYLES.text);
    applyCellStyle(sheet, `B${row}`, STYLES.points);
    applyCellStyle(sheet, `C${row}`, STYLES.integer);
    applyCellStyle(sheet, `D${row}`, STYLES.integer);
  }
}

function applyCourseSheetStyles(sheet, groupMeta, maxTasks) {
  applyCellStyle(sheet, 'A1', STYLES.title);
  applyCellStyle(sheet, 'B1', STYLES.total);

  for (let column = 0; column < 5 + maxTasks; column += 1) {
    applyCellStyle(sheet, `${toColumnName(column)}4`, STYLES.header);
  }

  groupMeta.forEach(({ categoryRow, scoreRow, plannedTasks }) => {
    ['A', 'B', 'C', 'D', 'E'].forEach((column) => {
      applyCellStyle(sheet, `${column}${categoryRow}`, STYLES.category);
    });
    applyCellStyle(sheet, `B${categoryRow}`, STYLES.weight);
    applyCellStyle(sheet, `C${categoryRow}`, STYLES.integerCategory);
    applyCellStyle(sheet, `D${categoryRow}`, STYLES.pointsCategory);
    applyCellStyle(sheet, `E${categoryRow}`, STYLES.pointsCategory);
    applyCellStyle(sheet, `A${scoreRow}`, STYLES.scoreLabel);

    plannedTasks.forEach((task, index) => {
      const column = toColumnName(5 + index);
      const taskStyle = getTaskStatusStyle(task.state);
      applyCellStyle(sheet, `${column}${categoryRow}`, taskStyle.name);
      applyCellStyle(sheet, `${column}${scoreRow}`, taskStyle.score);
    });
  });
}

function applyCellStyle(sheet, address, style) {
  if (!sheet[address]) return;
  sheet[address].s = style.s;
  if (style.z) sheet[address].z = style.z;
}

function getTaskStatusStyle(state) {
  if (state === 'evaluated') {
    return { name: STYLES.taskEvaluated, score: STYLES.scoreEvaluated };
  }

  if (state === 'failed') {
    return { name: STYLES.taskFailed, score: STYLES.scoreFailed };
  }

  if (['review', 'submitted', 'reworking', 'inProgress'].includes(state)) {
    return { name: STYLES.taskInProgress, score: STYLES.scoreInProgress };
  }

  return { name: STYLES.taskEmpty, score: STYLES.scoreEmpty };
}

const STYLES = {
  header: {
    s: {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '1F4E78' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: makeBorder('D9E2F3'),
    },
  },
  title: {
    s: {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '0B5D2A' } },
      alignment: { vertical: 'center' },
      border: makeBorder('D9EAD3'),
    },
  },
  total: {
    z: '0.00',
    s: {
      font: { bold: true, color: { rgb: '0B5D2A' } },
      fill: { fgColor: { rgb: 'E2F0D9' } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: makeBorder('D9EAD3'),
    },
  },
  text: {
    s: {
      alignment: { vertical: 'center' },
      border: makeBorder('E7E6E6'),
    },
  },
  points: {
    z: '0.00',
    s: {
      alignment: { horizontal: 'right', vertical: 'center' },
      border: makeBorder('E7E6E6'),
    },
  },
  integer: {
    z: '0',
    s: {
      alignment: { horizontal: 'right', vertical: 'center' },
      border: makeBorder('E7E6E6'),
    },
  },
  category: {
    s: {
      font: { bold: true },
      fill: { fgColor: { rgb: 'DDEBF7' } },
      alignment: { vertical: 'center', wrapText: true },
      border: makeBorder('B4C6E7'),
    },
  },
  weight: {
    z: '0.00',
    s: {
      font: { bold: true },
      fill: { fgColor: { rgb: 'DDEBF7' } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: makeBorder('B4C6E7'),
    },
  },
  integerCategory: {
    z: '0',
    s: {
      font: { bold: true },
      fill: { fgColor: { rgb: 'DDEBF7' } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: makeBorder('B4C6E7'),
    },
  },
  pointsCategory: {
    z: '0.00',
    s: {
      font: { bold: true },
      fill: { fgColor: { rgb: 'DDEBF7' } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: makeBorder('B4C6E7'),
    },
  },
  scoreLabel: {
    s: {
      font: { italic: true, color: { rgb: '666666' } },
      alignment: { vertical: 'center' },
      border: makeBorder('E7E6E6'),
    },
  },
  taskEvaluated: makeTaskNameStyle('D9EAD3'),
  scoreEvaluated: makeScoreStyle('EAF5E6'),
  taskFailed: makeTaskNameStyle('F4CCCC'),
  scoreFailed: makeScoreStyle('FCE4E4'),
  taskInProgress: makeTaskNameStyle('FFF2CC'),
  scoreInProgress: makeScoreStyle('FFF8DC'),
  taskEmpty: makeTaskNameStyle('E7E6E6'),
  scoreEmpty: makeScoreStyle('F3F3F3'),
};

function makeTaskNameStyle(fillColor) {
  return {
    s: {
      font: { bold: true, sz: 10 },
      fill: { fgColor: { rgb: fillColor } },
      alignment: { vertical: 'top', wrapText: true },
      border: makeBorder('D9D9D9'),
    },
  };
}

function makeScoreStyle(fillColor) {
  return {
    z: '0.00',
    s: {
      fill: { fgColor: { rgb: fillColor } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: makeBorder('D9D9D9'),
    },
  };
}

function makeBorder(color) {
  const style = { style: 'thin', color: { rgb: color } };
  return {
    top: style,
    right: style,
    bottom: style,
    left: style,
  };
}

function makeUniqueSheetName(name, usedNames) {
  const cleanName = String(name || 'Курс')
    .replace(/[\\/?*[\]:]/g, ' ')
    .split('')
    .map((char) => (char.charCodeAt(0) < 32 ? ' ' : char))
    .join('')
    .replace(/[\u{1f300}-\u{1faff}\u{2600}-\u{27bf}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  const baseName = (cleanName || 'Курс').slice(0, 31);
  let sheetName = baseName;
  let counter = 2;

  while (usedNames.has(sheetName)) {
    const suffix = ` ${counter}`;
    sheetName = `${baseName.slice(0, 31 - suffix.length)}${suffix}`;
    counter += 1;
  }

  usedNames.add(sheetName);
  return sheetName;
}

function quoteSheetName(sheetName) {
  return `'${sheetName.replace(/'/g, "''")}'`;
}
