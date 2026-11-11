// course_card_score.js — «накоплено (ещё можно набрать)» на карточках курсов.
//
// На «Мои курсы» (`/learn/courses/view/actual[/<вкладка>]`) в правом нижнем углу
// каждой карточки пишется то же, что родной виджет «Прогресс по курсу» внутри
// курса: накопленные баллы зелёным и в скобках жёлтым — сколько ещё можно
// набрать, например `0.53(9.8)`. Числа форматируются как в родном виджете:
// накоплено — до сотых, остаток — до десятых.
//
// Формат выбирается в попапе (`courseCardScoreFormat`):
//  - `left` — `накоплено(ещё можно набрать)`;
//  - `possible` — `накоплено/можно было набрать к сегодняшнему дню`, например
//    `2.47/3.55`: максимум за уже проверенные работы, как в строке «Можно было
//    набрать» виджета курса. Считается общей формулой (`cuLmsPossibleScore`) по
//    `courses/{id}/student-performance`; у курса без весов — только накоплено.
//
// Карточка не знает id курса (в ней только название), поэтому id берётся из
// списка курсов по названию — оригинальному, если включены свои названия
// (`cuLmsCourseNames`). Баллы — `courses/{id}/student/progress`, по запросу на
// курс, понемногу и с кэшем на несколько минут. Выключена по умолчанию:
// тумблер в попапе («Курсы», ключ `courseCardScoreToggle`).

(function () {
  'use strict';

  if (window.__culmsCardScoreLoaded) return;
  window.__culmsCardScoreLoaded = true;

  const TOGGLE = 'courseCardScoreToggle';
  const COURSES_API = '/api/micro-lms/courses/student?limit=200&offset=0&state=published';
  const PROGRESS_API = (id) => `/api/micro-lms/courses/${id}/student/progress`;
  const PERFORMANCE_API = (id) => `/api/micro-lms/courses/${id}/student-performance`;
  const FORMAT_KEY = 'courseCardScoreFormat';
  const BADGE_CLASS = 'culms-card-score';
  const STYLE_ID = 'culms-card-score-style';
  const CARD_ATTR = 'data-culms-score-id';
  // Список «Мои курсы» и его вкладки-фильтры; страница курса — числовой id.
  const LIST_RE = /^\/learn\/courses\/view\/actual(\/(?!\d+$)[^/]+)?\/?$/;
  // Баллы запоминаются между заходами (storage.local) и рисуются сразу из
  // запомненного; свежие запрашиваются в фоне, если запомненным больше STALE_MS.
  const SCORE_CACHE_KEY = 'courseCardScoreCache';
  // Тот же ключ и формат, что у course_cards.js и course_names.js: список
  // «название → id» уже лежит в хранилище, ждать из-за него сеть незачем.
  const META_CACHE_KEY = 'courseMetaCache';
  const STALE_MS = 2 * 60 * 1000;
  const RETRY_MS = 60 * 1000;
  const SAVE_DELAY_MS = 500;
  const CONCURRENCY = 6;
  const GREEN = '#2ea44f';
  const YELLOW = '#e0a100';
  // Красная точка «Можно было набрать» в виджете курса.
  const ORANGE = '#f4521e';

  const state = { enabled: false, format: 'left' };
  let idByName = null; // Map: нормализованное название → id
  let namesPromise = null;
  /**
   * id → { value: { earned, left, possible? }, at, failedAt? } или только { failedAt }.
   * possible: число; null — у курса нет весов; undefined — ещё не запрашивали.
   */
  const cache = new Map();
  const pending = new Set();
  const queue = [];
  let active = 0;

  // emoji-swap заменяет 🔴/🔵/⚫ на ❤️/💙/🖤 в тексте карточки, а в API кружки.
  const HEARTS = [
    [/❤/g, '🔴'],
    [/💙/g, '🔵'],
    [/🖤/g, '⚫'],
  ];
  const normalize = (name) =>
    HEARTS.reduce((out, [heart, circle]) => out.replace(heart, circle), name || '')
      .replace(/️/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  const round = (value, digits) => String(Math.round(value * 10 ** digits) / 10 ** digits);

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      cu-course-card[${CARD_ATTR}] { position: relative; }
      .${BADGE_CLASS} {
        position: absolute; right: 16px; bottom: 12px; z-index: 2;
        font-size: 14px; font-weight: 600; line-height: 1; white-space: nowrap;
        pointer-events: none;
      }
      /* Тёмная тема красит всё в карточке правилом «cu-course-card * { color: … !important }»
         — цвета чисел перебивают его только с !important и большей специфичностью. */
      cu-course-card .${BADGE_CLASS} .${BADGE_CLASS}__earned { color: ${GREEN} !important; }
      cu-course-card .${BADGE_CLASS} .${BADGE_CLASS}__left { color: ${YELLOW} !important; }
      cu-course-card .${BADGE_CLASS} .${BADGE_CLASS}__possible { color: ${ORANGE} !important; }
      /* «Старый дизайн» карточек прячет всё, кроме обложки, и рисует обложку-картинку:
         показываем бейдж принудительно и кладём на тёмную подложку, чтобы читался на любой. */
      ul.course-list.culms-old-design cu-course-card > .${BADGE_CLASS}.${BADGE_CLASS} {
        display: block !important;
        z-index: 3 !important;
        padding: 4px 8px !important;
        border-radius: 8px !important;
        background: rgba(0, 0, 0, 0.6) !important;
        color: #fff !important;
      }
    `;
    // Скрипт стартует на document_start, когда <head> может ещё не быть.
    (document.head || document.documentElement).append(style);
  }

  const buildNames = (items) =>
    new Map(
      items.filter((item) => item?.name != null).map((item) => [normalize(item.name), item.id])
    );

  /** Список курсов из сети — раз за заход, в фоне: карточки уже могут быть нарисованы из кэша. */
  function refreshNames() {
    namesPromise ??= fetch(COURSES_API, {
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((payload) => {
        const items = Array.isArray(payload) ? payload : payload.items || [];
        idByName = buildNames(items);
        queueSync();
      })
      .catch(() => {
        // Не вышло — попробуем при следующей перерисовке, но не чаще раза в минуту.
        setTimeout(() => (namesPromise = null), RETRY_MS);
      });
  }

  const local = () => {
    const ext = typeof browser !== 'undefined' ? browser : window.chrome;
    return ext?.storage?.local || null;
  };

  /** Запомненное с прошлого захода: названия курсов и баллы. */
  async function loadStored() {
    const area = local();
    if (!area) return;
    try {
      const stored = await area.get([SCORE_CACHE_KEY, META_CACHE_KEY]);
      const meta = stored[META_CACHE_KEY];
      if (Array.isArray(meta) && meta.length && !idByName) idByName = buildNames(meta);
      for (const [id, entry] of Object.entries(stored[SCORE_CACHE_KEY] || {})) {
        if (entry && Number.isFinite(entry.earned) && Number.isFinite(entry.left)) {
          const possible =
            entry.possible === null || Number.isFinite(entry.possible) ? entry.possible : undefined;
          cache.set(Number(id), {
            value: { earned: entry.earned, left: entry.left, possible },
            at: entry.at,
          });
        }
      }
    } catch (_error) {
      // Хранилище недоступно (контекст расширения обновился) — обойдёмся сетью.
    }
  }

  let saveTimer = null;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const area = local();
      if (!area) return;
      const out = {};
      for (const [id, entry] of cache) {
        if (entry.value) out[id] = { ...entry.value, at: entry.at };
      }
      try {
        void Promise.resolve(area.set({ [SCORE_CACHE_KEY]: out })).catch(() => {});
      } catch (_error) {
        // Контекст расширения обновился — запомнить не вышло, не страшно.
      }
    }, SAVE_DELAY_MS);
  }

  /** Название курса на карточке — оригинальное, даже если оно переименовано. */
  function cardName(card) {
    const element = card.querySelector('.course-name');
    if (!element) return '';
    const names = window.cuLmsCourseNames;
    const text = names?.originalFor ? names.originalFor(element) : element.textContent;
    return String(text || '').trim();
  }

  const getJson = (url) =>
    fetch(url, { credentials: 'same-origin', headers: { accept: 'application/json' } }).then(
      (response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      }
    );

  /** Максимум к сегодняшнему дню: число, null (нет весов) или undefined (не вышло). */
  async function loadPossible(id) {
    try {
      const data = await getJson(PERFORMANCE_API(id));
      return window.cuLmsPossibleScore.possibleFrom(Array.isArray(data?.tasks) ? data.tasks : []);
    } catch (_error) {
      return undefined;
    }
  }

  function pump() {
    while (active < CONCURRENCY && queue.length) {
      const id = queue.shift();
      active++;
      // Второй запрос нужен только формату «накоплено/можно было набрать».
      const wantPossible = state.format === 'possible';
      Promise.all([getJson(PROGRESS_API(id)), wantPossible ? loadPossible(id) : undefined])
        .then(([data, possible]) => {
          const earned = Number(data?.earnedScore);
          const left = Number(data?.leftToEarnScore);
          if (!Number.isFinite(earned) || !Number.isFinite(left)) throw new Error('shape');
          // Не запрашивали (формат «left») — оставляем прежнее значение, не затираем его.
          const kept = cache.get(id)?.value?.possible;
          cache.set(id, {
            value: { earned, left, possible: wantPossible ? possible : kept },
            at: Date.now(),
          });
          saveSoon();
        })
        // Неудача не стирает прежние числа: лучше показать вчерашние, чем пустоту.
        .catch(() => cache.set(id, { ...cache.get(id), failedAt: Date.now() }))
        .finally(() => {
          pending.delete(id);
          active--;
          pump();
          queueSync();
        });
    }
  }

  function request(id) {
    const entry = cache.get(id);
    // Формат поменяли на «можно было набрать», а в кэше этого числа ещё нет — нужен запрос.
    const needPossible = state.format === 'possible' && entry?.value?.possible === undefined;
    if (entry?.value && !needPossible && Date.now() - entry.at < STALE_MS) return;
    if (entry?.failedAt && Date.now() - entry.failedAt < RETRY_MS) return;
    if (pending.has(id)) return;
    pending.add(id);
    queue.push(id);
    pump();
  }

  function removeAll() {
    document.querySelectorAll('.' + BADGE_CLASS).forEach((badge) => badge.remove());
    document.querySelectorAll(`cu-course-card[${CARD_ATTR}]`).forEach((card) => {
      card.removeAttribute(CARD_ATTR);
    });
  }

  function renderBadge(card, id) {
    const entry = cache.get(id);
    let badge = card.querySelector(':scope > .' + BADGE_CLASS);
    if (!entry?.value) {
      badge?.remove();
      return;
    }
    const earned = round(entry.value.earned, 2);
    // Второе число: ещё можно набрать — или, в формате «possible», сколько можно было
    // набрать к сегодняшнему дню (нет числа — показываем только накоплено).
    const possible = state.format === 'possible';
    const second = possible
      ? Number.isFinite(entry.value.possible)
        ? round(entry.value.possible, 2)
        : null
      : round(entry.value.left, 1);
    const shape = `${possible ? 'possible' : 'left'}${second === null ? '-' : '+'}`;
    if (badge && badge.dataset.shape !== shape) {
      badge.remove();
      badge = null;
    }
    if (!badge) {
      badge = document.createElement('span');
      badge.className = BADGE_CLASS;
      badge.dataset.shape = shape;
      const kind = possible ? 'possible' : 'left';
      badge.innerHTML =
        `<span class="${BADGE_CLASS}__earned"></span>` +
        (second === null
          ? ''
          : possible
            ? `/<span class="${BADGE_CLASS}__${kind}"></span>`
            : `(<span class="${BADGE_CLASS}__${kind}"></span>)`);
      card.append(badge);
    }
    badge.title = possible
      ? 'Накоплено / можно было набрать к сегодняшнему дню'
      : 'Накоплено (ещё можно набрать)';
    const [earnedEl, secondEl] = badge.querySelectorAll('span');
    if (earnedEl.textContent !== earned) earnedEl.textContent = earned;
    if (secondEl && secondEl.textContent !== second) secondEl.textContent = second;
  }

  function sync() {
    if (!state.enabled || !LIST_RE.test(location.pathname)) {
      removeAll();
      return;
    }
    const cards = [...document.querySelectorAll('cu-course-card')];
    if (!cards.length) return;
    ensureStyle();
    refreshNames();
    if (!idByName) return;
    for (const card of cards) {
      const id = idByName.get(normalize(cardName(card)));
      if (id == null) {
        card.removeAttribute(CARD_ATTR);
        card.querySelector(':scope > .' + BADGE_CLASS)?.remove();
        continue;
      }
      // Angular переиспользует карточки при смене вкладки: id мог поменяться.
      if (card.getAttribute(CARD_ATTR) !== String(id)) {
        card.setAttribute(CARD_ATTR, String(id));
        card.querySelector(':scope > .' + BADGE_CLASS)?.remove();
      }
      request(id);
      renderBadge(card, id);
    }
  }

  let queued = false;
  function queueSync() {
    if (queued) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      sync();
    }, 60);
  }

  // Бейдж ставится синхронно, прямо в колбэке наблюдателя: он выполняется микрозадачей
  // сразу после вставки карточек, то есть ДО отрисовки кадра, и карточка появляется
  // уже с числами. Любое откладывание (setTimeout, rAF) показало бы сначала голую
  // карточку. Название — в characterData: Angular может вписать его в уже вставленный узел.
  new MutationObserver((mutations) => {
    // Свои же правки (бейдж, атрибут) не должны запускать проверку заново.
    if (
      mutations.every(
        (m) =>
          m.target.parentElement?.closest?.('.' + BADGE_CLASS) ||
          m.target.closest?.('.' + BADGE_CLASS)
      )
    )
      return;
    sync();
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  window.addEventListener('popstate', queueSync);

  // Выключено по умолчанию; смена галочки в попапе действует сразу. Без API
  // хранилища (поддельная страница в тесте) включено.
  const ext = typeof browser !== 'undefined' ? browser : window.chrome;
  void loadStored().then(queueSync);
  if (ext?.storage?.sync) {
    ext.storage.sync
      .get([TOGGLE, FORMAT_KEY])
      .then((settings) => {
        state.enabled = settings?.[TOGGLE] === true;
        state.format = settings?.[FORMAT_KEY] === 'possible' ? 'possible' : 'left';
        queueSync();
      })
      .catch(() => queueSync());
    ext.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !(TOGGLE in changes || FORMAT_KEY in changes)) return;
      if (TOGGLE in changes) state.enabled = changes[TOGGLE].newValue === true;
      if (FORMAT_KEY in changes) {
        state.format = changes[FORMAT_KEY].newValue === 'possible' ? 'possible' : 'left';
      }
      queueSync();
    });
  } else {
    state.enabled = true;
    queueSync();
  }
})();
