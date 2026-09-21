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
  scripting: {
    async executeScript(options) {
      if (options.func && options.func.name === 'fetchAllGradesForExport') {
        const resp = await browser.runtime.sendMessage({ action: 'GRADES_EXPORT_EXECUTE' });
        if (resp.success) return [{ result: resp.result }];
        throw new Error(resp.error || 'Ошибка выполнения скрипта экспорта');
      }
      try {
        if (
          typeof browser !== 'undefined' &&
          browser.scripting &&
          browser.scripting.executeScript
        ) {
          return await browser.scripting.executeScript(options);
        }
      } catch (e) {}
      throw new Error('API scripting недоступно в этом контексте');
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
  futureExamsViewToggle: document.getElementById('future-exams-view-toggle'),
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
const gradesExportBtn = document.getElementById('grades-export-btn');
const gradesExportStatus = document.getElementById('grades-export-status');

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

// --- АККОРДЕОН РАЗДЕЛОВ ---
//
// Разделов девять, и раскрытыми они не помещаются ни в окно попапа, ни в
// панель на странице: чтобы дойти до нижних, приходилось листать. Поэтому
// заголовок работает кнопкой, а содержимое сворачивается.
//
// Разметку не трогаем, а заворачиваем содержимое в .section-body здесь: так
// новый раздел в popup.html становится сворачиваемым сам, без правки скрипта.

const ACCORDION_KEY = 'culms.popup.openSections';

function readOpenSections() {
  try {
    const saved = JSON.parse(localStorage.getItem(ACCORDION_KEY) || '[]');
    return new Set(Array.isArray(saved) ? saved : []);
  } catch (_error) {
    return new Set();
  }
}

function saveOpenSections(open) {
  try {
    localStorage.setItem(ACCORDION_KEY, JSON.stringify([...open]));
  } catch (_error) {
    // Приватный режим или заблокированное хранилище — просто не запомним.
  }
}

/**
 * Складывает разделы в общую обёртку: по ней CSS раскладывает их в два
 * столбца. Делается из скрипта, чтобы новый раздел в popup.html попадал в
 * раскладку сам, без правки разметки.
 */
function groupSections() {
  const sections = [...document.querySelectorAll('.section')];
  if (!sections.length || document.querySelector('.sections')) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'sections';
  sections[0].parentNode.insertBefore(wrapper, sections[0]);
  sections.forEach((section) => wrapper.appendChild(section));
}

function initAccordion() {
  const saved = localStorage.getItem(ACCORDION_KEY);
  const open = readOpenSections();
  // Первый заход: раскрываем верхний раздел, иначе меню выглядит пустым
  // списком заголовков и непонятно, что с ним делать.
  let firstRun = saved === null;

  document.querySelectorAll('.section').forEach((section) => {
    const title = section.querySelector('h3');
    if (!title || section.classList.contains('section_collapsible')) return;

    const body = document.createElement('div');
    body.className = 'section-body';
    while (title.nextSibling) body.appendChild(title.nextSibling);
    section.appendChild(body);
    section.classList.add('section_collapsible');

    // Ключ — название раздела: пережимает добавление и перестановку разделов,
    // в отличие от порядкового номера.
    const id = title.textContent.trim();
    const setOpen = (isOpen) => {
      section.classList.toggle('section_open', isOpen);
      title.setAttribute('aria-expanded', String(isOpen));
    };

    title.setAttribute('role', 'button');
    title.setAttribute('tabindex', '0');
    if (firstRun) {
      open.add(id);
      firstRun = false;
    }
    setOpen(open.has(id));

    const toggle = () => {
      const next = !section.classList.contains('section_open');
      setOpen(next);
      if (next) open.add(id);
      else open.delete(id);
      saveOpenSections(open);
    };

    title.addEventListener('click', toggle);
    title.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      toggle();
    });
  });
}

groupSections();
initAccordion();

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

browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') refreshToggleStates();
});

refreshToggleStates();

// Логика сброса настроек
const resetBtn = document.getElementById('reset-all-settings-btn');
if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    const confirmed = confirm(
      'Это действие сбросит все настройки:\n- Удалит скрытые курсы и друзей\n- Сбросит порядок курсов\n- Вернет стандартные настройки\n\nПродолжить?'
    );
    if (!confirmed) return;

    browser.storage.local.clear();

    if (isInsideIframe) {
      window.parent.postMessage({ action: 'RESET_LMS_LOCAL_STORAGE_IFRAME' }, '*');
    } else {
      browserApi.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        if (tabs.length > 0) {
          browserApi.tabs
            .sendMessage(tabs[0].id, { action: 'RESET_LMS_LOCAL_STORAGE_FROM_POPUP' })
            .catch(() => {});
        }
      });
    }

    const defaultSettings = {
      themeEnabled: false,
      oledEnabled: false,
      darkPdfEnabled: false,
      autoRenameEnabled: false,
      autoRenameTemplate: 'dz_fi',
      akhIntegrationEnabled: false,
      akhCourseFilter: [],
      contestIntegrationEnabled: false,
      contestCourseFilter: [],
      courseOverviewTaskStatusToggle: false,
      advancedStatementsEnabled: true,
      endOfCourseCalcEnabled: true,
      emojiHeartsEnabled: false,
      snowEnabled: false,
      oldCoursesDesignToggle: false,
      customCourseNamesToggle: false,
      stickerObjectFit: 'cover',
      stickerScale: 100,
      customLogoToggle: false,
      logoObjectFit: 'contain',
      logoScale: 100,
      customBackgroundToggle: false,
      backgroundFit: 'cover',
      backgroundVeil: 60,
      futureExamsViewToggle: false,
      futureExamsDisplayFormat: 'date',
      courseOverviewAutoscrollToggle: false,
      friendsEnabled: true,
      hideBonusButtonEnabled: false,
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

      if (autoRenameFormatContainer) autoRenameFormatContainer.style.display = 'none';
      if (futureExamsDisplayContainer) futureExamsDisplayContainer.style.display = 'none';
      if (oldCoursesDesignContainer) oldCoursesDesignContainer.style.display = 'none';
      if (customCourseNamesContainer) customCourseNamesContainer.style.display = 'none';
      if (stickerFitSelect) stickerFitSelect.value = defaultSettings.stickerObjectFit;
      if (stickerScaleSelect) stickerScaleSelect.value = String(defaultSettings.stickerScale);
      if (logoFitSelect) logoFitSelect.value = defaultSettings.logoObjectFit;
      if (logoScaleSelect) logoScaleSelect.value = String(defaultSettings.logoScale);
      if (backgroundFitSelect) backgroundFitSelect.value = defaultSettings.backgroundFit;
      if (backgroundVeilSelect) backgroundVeilSelect.value = String(defaultSettings.backgroundVeil);

      if (reloadNotice) reloadNotice.style.display = 'block';
    } else {
      browser.storage.sync.set(defaultSettings);
    }
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
  const { pickButtonId, resetButtonId, input, storageKey, limits, status, preview, emptyText } =
    options;
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
    });
  }

  const resetButton = document.getElementById(resetButtonId);
  if (resetButton) {
    resetButton.addEventListener('click', async () => {
      await browser.storage.local.remove(storageKey);
      await refresh();
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

async function saveProfileFile(profile) {
  const text = JSON.stringify(profile, null, 2);
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
  gradesExportBtn.addEventListener('click', handleGradesExportClick);
}

function setGradesExportStatus(message, type = 'info') {
  if (!gradesExportStatus) return;

  gradesExportStatus.textContent = message;
  gradesExportStatus.style.color =
    type === 'error' ? '#d93025' : type === 'success' ? '#188038' : '#666';
}

async function handleGradesExportClick() {
  if (!gradesExportBtn) return;

  try {
    gradesExportBtn.disabled = true;
    setGradesExportStatus('Ищу активную вкладку LMS...');

    if (!window.XLSX) {
      throw new Error('Модуль Excel не загрузился. Пересобери расширение и открой popup заново.');
    }

    const [tab] = await browserApi.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !isLmsUrl(tab.url)) {
      throw new Error('Открой вкладку LMS (my.centraluniversity.ru или my.cu.ru) перед экспортом.');
    }

    setGradesExportStatus('Собираю оценки через API LMS...');
    const [injectionResult] = await browserApi.scripting.executeScript({
      target: { tabId: tab.id },
      func: fetchAllGradesForExport,
    });

    const result = injectionResult?.result;
    if (!result?.success) {
      throw new Error(result?.error || 'Не удалось получить данные LMS.');
    }

    if (!result.courses?.length) {
      throw new Error('Не нашёл активных курсов с оценками.');
    }

    setGradesExportStatus(`Генерирую Excel: ${result.courses.length} курсов...`);
    generateGradesWorkbook(result.courses);
    setGradesExportStatus('Готово: grades.xlsx скачан.', 'success');
  } catch (error) {
    console.error('[CU LMS] Grades export failed:', error);
    setGradesExportStatus(error.message || 'Ошибка экспорта оценок.', 'error');
  } finally {
    gradesExportBtn.disabled = false;
  }
}

async function fetchAllGradesForExport() {
  const normalizeFetchedNumber = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };

  const enrichPerformanceTask = (task, exercisesById) => {
    const exercise = exercisesById.get(task.exerciseId) || task.exercise || null;
    const activity = task.activity || exercise?.activity || null;

    return {
      id: task.id,
      exerciseId: task.exerciseId,
      state: task.state,
      score: task.score,
      extraScore: task.extraScore,
      maxScore: normalizeFetchedNumber(task.maxScore ?? exercise?.maxScore, 10),
      activity: activity
        ? {
            id: activity.id,
            name: activity.name,
            weight: activity.weight,
            maxExercisesCount: activity.maxExercisesCount,
          }
        : null,
      exercise: exercise
        ? {
            id: exercise.id,
            name: exercise.name,
          }
        : null,
    };
  };

  const makeExerciseOnlyTask = (exercise) => ({
    id: null,
    exerciseId: exercise.id,
    state: 'planned',
    score: null,
    extraScore: null,
    maxScore: normalizeFetchedNumber(exercise.maxScore, 10),
    activity: exercise.activity
      ? {
          id: exercise.activity.id,
          name: exercise.activity.name,
          weight: exercise.activity.weight,
          maxExercisesCount: exercise.activity.maxExercisesCount,
        }
      : null,
    exercise: {
      id: exercise.id,
      name: exercise.name,
    },
  });

  const fetchJson = async (url) => {
    const response = await fetch(url, {
      headers: { accept: 'application/json, text/plain, */*' },
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`LMS API вернул ${response.status} для ${url}`);
    }

    return response.json();
  };

  try {
    const coursesData = await fetchJson('/api/micro-lms/performance/student?isArchived=false');

    const courses = Array.isArray(coursesData?.courses)
      ? coursesData.courses
      : Array.isArray(coursesData?.items)
        ? coursesData.items
        : [];

    const activeCourses = courses.filter((course) => {
      const status = course.courseStudentsStatus || course.courseStudentStatus || course.status;
      return course.id && status !== 'listener' && status !== 'слушатель';
    });

    const exportedCourses = [];
    for (const course of activeCourses) {
      const [performance, exercisesData] = await Promise.all([
        fetchJson(`/api/micro-lms/courses/${course.id}/student-performance`),
        fetchJson(`/api/micro-lms/courses/${course.id}/exercises`),
      ]);
      const exercises = Array.isArray(exercisesData?.exercises) ? exercisesData.exercises : [];
      // Fetch course-level activities to detect зачёт with оценкой and insert placeholders if missing
      let courseActivities = [];
      try {
        const activitiesResp = await fetchJson(`/api/micro-lms/courses/${course.id}/activities`);
        if (Array.isArray(activitiesResp)) courseActivities = activitiesResp;
      } catch (e) {
        // ignore if endpoint unavailable
        courseActivities = [];
      }
      const exercisesById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
      const tasks = Array.isArray(performance?.tasks) ? performance.tasks : [];
      const taskExerciseIds = new Set(tasks.map((task) => task.exerciseId));
      const exerciseOnlyTasks = exercises
        .filter((exercise) => exercise.id && !taskExerciseIds.has(exercise.id))
        .map(makeExerciseOnlyTask);
      // Build placeholders for activities that exist in course activities but have no tasks yet
      // This ensures that exams, зачёт, etc. appear in the export regardless of their names.
      const placeholders = [];
      if (Array.isArray(courseActivities)) {
        const existingActIds = new Set(tasks.map((t) => t.activity?.id).filter(Boolean));
        for (const act of courseActivities) {
          if (!act?.id) continue;
          if (
            !existingActIds.has(act.id) &&
            typeof act.maxExercisesCount === 'number' &&
            act.maxExercisesCount > 0
          ) {
            placeholders.push({
              id: null,
              exerciseId: null,
              state: 'planned',
              score: null,
              extraScore: null,
              maxScore: 10,
              activity: {
                id: act.id,
                name: act.name,
                weight: act.weight,
                maxExercisesCount: act.maxExercisesCount,
              },
              exercise: {
                id: null,
                name: act.name,
              },
            });
          }
        }
      }

      // (stable) no extra handling of activities-perf data here

      exportedCourses.push({
        id: course.id,
        name: course.name || `Курс ${course.id}`,
        tasks: [
          ...tasks.map((task) => enrichPerformanceTask(task, exercisesById)),
          ...placeholders,
          ...exerciseOnlyTasks,
        ],
      });
    }

    return { success: true, courses: exportedCourses };
  } catch (error) {
    console.error('[CU LMS] Grades export fetch failed:', error);
    return { success: false, error: error.message || 'Ошибка запроса к LMS API.' };
  }
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

  XLSX.writeFile(workbook, 'grades.xlsx');
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
