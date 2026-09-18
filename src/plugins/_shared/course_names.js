// course_names.js — свои названия курсов по всей LMS.
//
// Подменять название только на карточке бессмысленно: курс упоминается ещё в
// таблице заданий, крошках, заголовке страницы курса и архиве. Поэтому подмена
// живёт в общем модуле, а не внутри плагина карточек.
//
// Главное требование — не сломать то, что завязано на настоящее название
// (метод скипа, расписание контрольных, виджет друзей). Поэтому:
//   * рядом с подменённым текстом мы всегда оставляем оригинал в
//     `data-culms-orig-name`;
//   * наружу отдаётся `window.cuLmsCourseNames` с обратным преобразованием.
// Потребители обязаны спрашивать оригинал, а не читать текст напрямую.

// Polyfill to handle browser namespace differences (Chrome uses 'chrome', Firefox uses 'browser')
if (typeof browser === 'undefined') {
  var browser = chrome;
}

if (typeof window.__culmsCourseNamesInitialized === 'undefined') {
  window.__culmsCourseNamesInitialized = true;

  ('use strict');

  const SETTING_KEY = 'customCourseNamesToggle';
  const NAMES_KEY = 'courseNames';
  const COURSES_API = '/api/micro-lms/courses/student?limit=200&offset=0';
  const ORIGINAL_ATTR = 'data-culms-orig-name';
  // Текст, который записали мы сами. Нужен, чтобы никогда не затирать то, что
  // после нас успел отрисовать Angular: возвращаем оригинал только если на
  // экране всё ещё ровно наша подстановка.
  const SHOWN_ATTR = 'data-culms-shown-name';
  // Тот же ключ и формат, что у course-view/course_cards.js: список курсов
  // один и тот же, и прогретый одним модулем кеш экономит запрос другому.
  const META_CACHE_KEY = 'courseMetaCache';

  // Места, где LMS показывает название курса целиком, а не внутри предложения.
  // Точечный список вместо обхода всех текстовых узлов: так подмена не залезет
  // в произвольный текст, где название курса встретилось случайно.
  const NAME_SELECTORS = [
    '.course-name', // карточка курса в списке
    '.task-table__course-name', // таблица заданий
    // Ячейка с названием в таблицах: архив курсов и ведомости на широком
    // экране. Текст лежит не в самой ячейке, а в `span.limited-lines-text`
    // внутри неё — поэтому важен обход вложенных узлов (см. applyToElement).
    'td.name-cell',
    // Все крошки, а не только последняя: внутри темы и урока курс оказывается
    // средним звеном («Обучение › Мои курсы › Курс › Тема › Урок»).
    // Совпадение точное, поэтому соседние крошки не задеваются.
    '.breadcrumbs__item',
    // Taiga держит рядом невидимую копию крошек — по ней он меряет, влезают ли
    // они в строку, и из неё же собирает выпадающий список, когда не влезают.
    // Без подмены там крошка схлопнулась бы обратно в родное название.
    'tui-breadcrumbs a',
    'h1.page-title',
    'h1.course-learning__title',
    // Ведомости. На узком экране список — карточки, на широком — таблица
    // (её покрывает `td.name-cell` выше). Заголовок самой ведомости один и тот
    // же в обоих случаях, он же на вкладке «Активность».
    'a.report-card h4',
    'cu-student-course-performance h1.title',
    // Фильтр «Курс» в списке заданий. Опции рисует и сама LMS, и
    // courses/tasks_fix.js — селектор покрывает оба варианта.
    'tui-multi-select-option span',
    // Свёрнутый чип того же фильтра с выбранным курсом.
    '.cu-filter-value__first',
  ];

  let enabled = false;
  let overrides = {};
  /** нормализованное оригинальное название → кастомное */
  let customByOriginal = new Map();
  /** нормализованное кастомное название → оригинальное */
  let originalByCustom = new Map();
  /** id курса → оригинальное название */
  let nameById = new Map();
  let metaPromise = null;
  let observer = null;

  const log = (...args) =>
    typeof window.cuLmsLog === 'function' ? window.cuLmsLog(...args) : undefined;

  const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim().toLowerCase();

  /** Строит соответствие id → настоящее название. */
  function applyCourseMeta(items) {
    const map = new Map();
    (items || []).forEach((item) => {
      if (item && item.id != null && item.name) map.set(String(item.id), item.name);
    });
    nameById = map;
    return map.size > 0;
  }

  async function loadCourseMeta() {
    if (metaPromise) return metaPromise;

    metaPromise = (async () => {
      try {
        const response = await fetch(COURSES_API, {
          credentials: 'same-origin',
          headers: { accept: 'application/json' },
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);

        const payload = await response.json();
        const items = Array.isArray(payload) ? payload : payload.items || [];
        applyCourseMeta(items);
        browser.storage.local
          .set({
            [META_CACHE_KEY]: items.map((i) => ({ id: i.id, name: i.name, category: i.category })),
          })
          .catch(() => {});
      } catch (error) {
        log('[course-names] Не удалось получить список курсов:', error);
      }
    })();

    return metaPromise;
  }

  /** Перестраивает прямое и обратное соответствия названий. */
  function rebuildMaps() {
    customByOriginal = new Map();
    originalByCustom = new Map();

    Object.entries(overrides).forEach(([courseId, custom]) => {
      const original = nameById.get(String(courseId));
      if (!original || !custom || original === custom) return;
      customByOriginal.set(normalize(original), custom);
      originalByCustom.set(normalize(custom), original);
    });
  }

  // --- ПОДМЕНА В DOM ---

  /**
   * Подменяет название в элементе.
   *
   * Работаем по текстовым узлам, а не по `textContent`, по двум причинам:
   *
   * 1. Название может быть лишь частью содержимого. В свёрнутом чипе фильтра
   *    лежат два отдельных текстовых узла — «Курс: » и само название, — и
   *    сравнение всего текста элемента не дало бы совпадения.
   * 2. В разметке Angular рядом с текстом лежат комментарии-якоря `<!---->`
   *    (например, внутри опции фильтра), а перезапись `textContent` их
   *    удаляет — после этого Angular не может обновлять такой узел.
   */
  /**
   * Все непустые текстовые узлы элемента, включая вложенные.
   *
   * Обход именно вглубь, а не только по прямым детям: LMS часто заворачивает
   * название в служебный `span` (`td.name-cell > span.limited-lines-text` в
   * таблицах курсов и ведомостей). По прямым детям такой элемент выглядел бы
   * пустым, и подмена молча не срабатывала.
   */
  function textNodesOf(element) {
    const nodes = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (walker.currentNode.nodeValue.trim()) nodes.push(walker.currentNode);
    }
    return nodes;
  }

  function applyToElement(element) {
    const stashed = element.getAttribute(ORIGINAL_ATTR);
    const shown = element.getAttribute(SHOWN_ATTR);

    const textNodes = textNodesOf(element);
    if (!textNodes.length) return;

    for (const node of textNodes) {
      const current = node.nodeValue.trim();
      // Уже подменённый узел сопоставляем по оригиналу, а не по тому, что видно.
      const base = stashed && current === shown ? stashed : current;
      const custom = enabled ? customByOriginal.get(normalize(base)) : null;

      if (custom) {
        if (current !== custom) {
          element.setAttribute(ORIGINAL_ATTR, base);
          element.setAttribute(SHOWN_ATTR, custom);
          // Замена внутри значения узла сохраняет окружающие пробелы.
          node.nodeValue = node.nodeValue.replace(current, custom);
        }
        return;
      }

      // Возвращаем оригинал только если на экране всё ещё наша подстановка:
      // иначе Angular уже отрисовал сюда другое, и запись затёрла бы его.
      if (stashed && shown && current === shown) {
        node.nodeValue = node.nodeValue.replace(current, stashed);
        element.removeAttribute(ORIGINAL_ATTR);
        element.removeAttribute(SHOWN_ATTR);
        return;
      }
    }

    // Нашей подстановки в элементе уже нет — снимаем метки.
    if (stashed) {
      element.removeAttribute(ORIGINAL_ATTR);
      element.removeAttribute(SHOWN_ATTR);
    }
  }

  function applyAll() {
    // Обычный случай — переименований нет: тогда работы нет вовсе, кроме снятия
    // уже проставленных подмен (их ищем по атрибуту).
    if (!customByOriginal.size && !document.querySelector('[' + ORIGINAL_ATTR + ']')) return;

    const selector = NAME_SELECTORS.join(',');
    document.querySelectorAll(selector).forEach(applyToElement);
    // Элементы, из которых подмену уже надо снять, могли выпасть из списка
    // селекторов (например, крошку перерисовали другим классом).
    document.querySelectorAll('[' + ORIGINAL_ATTR + ']').forEach(applyToElement);
  }

  function startObserver() {
    if (observer) return;

    observer = new MutationObserver(() => {
      try {
        if (typeof browser !== 'undefined' && !(browser.runtime && browser.runtime.id)) {
          observer.disconnect();
          observer = null;
          return;
        }
      } catch (_e) {
        observer.disconnect();
        observer = null;
        return;
      }
      // Подменяем синхронно, прямо в колбэке наблюдателя. Колбэк
      // `MutationObserver` — микрозадача: он выполняется в том же таске, что и
      // сама мутация, то есть ДО отрисовки кадра. Любое откладывание
      // (`setTimeout`, `requestAnimationFrame`) означает, что браузер успевает
      // показать родное название, а мы меняем его уже на глазах у пользователя.
      // Мутации приходят пачкой на таск, так что лишних проходов это не даёт.
      applyAll();
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  // --- ПУБЛИЧНОЕ API ДЛЯ ОСТАЛЬНЫХ ПЛАГИНОВ ---

  const api = {
    /** Готовность соответствий (список курсов подгружен). */
    ready: null,

    isEnabled: () => enabled,

    /** Оригинальное название курса по тому, что сейчас на экране. */
    toOriginal(text) {
      if (!text) return text;
      return originalByCustom.get(normalize(text)) || text;
    },

    /** Что показывать вместо оригинального названия. */
    toDisplay(original) {
      if (!original) return original;
      return customByOriginal.get(normalize(original)) || original;
    },

    /**
     * Оригинальное название для элемента: сперва из `data-culms-orig-name`
     * (в том числе у родителей), иначе — обратным преобразованием текста.
     */
    originalFor(element, fallbackText) {
      if (element) {
        const holder = element.closest('[' + ORIGINAL_ATTR + ']');
        if (holder) return holder.getAttribute(ORIGINAL_ATTR);
      }
      return api.toOriginal(fallbackText ?? element?.textContent?.trim());
    },

    getOriginalById: (courseId) => nameById.get(String(courseId)) || null,

    /** Сохранить/снять своё название. Пустая строка убирает переименование. */
    async setOverride(courseId, customName) {
      const next = { ...overrides };
      const value = (customName || '').trim();
      if (value) next[String(courseId)] = value;
      else delete next[String(courseId)];

      await browser.storage.local.set({ [NAMES_KEY]: next });
      overrides = next;
      rebuildMaps();
      applyAll();
    },

    getOverride: (courseId) => overrides[String(courseId)] || null,
  };

  window.cuLmsCourseNames = api;

  // --- ЗАПУСК ---

  async function init() {
    const [syncData, localData] = await Promise.all([
      browser.storage.sync.get(SETTING_KEY),
      browser.storage.local.get([NAMES_KEY, META_CACHE_KEY]),
    ]);

    enabled = !!syncData[SETTING_KEY];
    overrides = localData[NAMES_KEY] || {};

    // Сначала поднимаем соответствие из кеша и сразу включаем подмену: ждать
    // сеть нельзя, иначе LMS успеет отрисовать родные названия.
    applyCourseMeta(localData[META_CACHE_KEY]);
    rebuildMaps();
    startObserver();
    applyAll();

    // Свежий список приходит следом и поправляет расхождения.
    await loadCourseMeta();
    rebuildMaps();
    applyAll();
  }

  api.ready = init();

  browser.storage.onChanged.addListener((changes, area) => {
    let dirty = false;

    if (area === 'sync' && SETTING_KEY in changes) {
      enabled = !!changes[SETTING_KEY].newValue;
      dirty = true;
    }
    if (area === 'local' && NAMES_KEY in changes) {
      overrides = changes[NAMES_KEY].newValue || {};
      dirty = true;
    }

    if (dirty) {
      rebuildMaps();
      applyAll();
    }
  });
}
