// custom_background.js — своя картинка вместо фона страницы.
//
// LMS выкладывает интерфейс «островками» (карточки, таблицы, панели) поверх
// сплошной заливки. Задача — заменить именно заливку, не трогая островки.
//
// Два подхода, которые НЕ работают, и почему:
//
//   1. Переопределить переменную темы. Заливку рисует не один слой:
//      `cu-sidebar-layout` берёт цвет из `--sidebar-layout-content-background-color`,
//      внутренний `cu-<раздел>-layout` — из `--accent-pale`, а в мобильной
//      раскладке поверх всего ложится `div.content` из компонента сайдбара с
//      `--elevation-01`. Одной переменной не обойтись, а перечислить теги
//      нельзя: у каждого раздела свой, и Angular-атрибуты (`_nghost-ng-c235008457`)
//      меняются от сборки к сборке.
//
//   2. Сделать слои прозрачными и показать картинку на `html`. Прозрачность
//      обнажает то, что за слоем прячется: в мобильной раскладке за `div.content`
//      лежит раскрытое меню, и его пункты проступают прямо сквозь карточки.
//
// Поэтому картинка кладётся ПОВЕРХ заливки — на сами слои-полотна, вместе с
// `background-attachment: fixed`. Фиксированный фон привязан к окну, а не к
// элементу, так что несколько слоёв показывают один и тот же кадр картинки и
// стыкуются бесшовно. Ничего не обнажается: слой как был непрозрачным, так и
// остался, просто теперь на нём картинка.
//
// Сами слои ищутся по геометрии, а не по именам: непрозрачный элемент шире 60 %
// окна и площадью больше 40 % экрана — это полотно. Карточки и острова меньше,
// поэтому под правило не попадают; меню, шапка и диалоги исключены явно.
//
// Поверх картинки идёт подложка — полупрозрачная заливка цветом темы. Без неё
// текст, лежащий прямо на полотне (таблица заданий, заголовки разделов), висит
// поверх фотографии и не читается: островка под ним в разметке просто нет.
// Подложка — второй слой того же `background-image`, потому что отдельная
// панель не работает: на странице курсов картинку рисует внутренний слой,
// который лёг бы поверх панели.
//
// Картинка бывает не одна: своя у страницы, у курса, у раздела или общая на
// все страницы — какие области бывают и в каком порядке ищутся, описано в
// `background_scopes.js`. Скрипт инжектится один раз на вкладку, а LMS — SPA,
// поэтому смену страницы ловим сами: на каждой мутации сверяем адрес.
// Картинки читаются лениво — только ключи областей текущей страницы — и
// запоминаются, чтобы при возврате на страницу не читать их заново.
//
// Наружу отдаётся `window.cuLmsCustomBackground`: через него редактор фона
// (`background_editor.js`) узнаёт, какая картинка сейчас на экране и откуда.

// Polyfill to handle browser namespace differences (Chrome uses 'chrome', Firefox uses 'browser')
if (typeof browser === 'undefined') {
  var browser = chrome;
}

if (typeof window.__culmsCustomBackgroundInitialized === 'undefined') {
  window.__culmsCustomBackgroundInitialized = true;

  ('use strict');

  const SETTING_KEY = 'customBackgroundToggle';
  const FIT_KEY = 'backgroundFit';
  const VEIL_KEY = 'backgroundVeil';
  // Пока редактор открыт, за переходами следим и без картинок: панель должна
  // узнавать о смене страницы.
  const EDITOR_KEY = 'backgroundEditorActive';

  const STYLE_ID = 'culms-custom-background';
  const CANVAS_CLASS = 'culms-bg-canvas';

  // Панели, а не полотно: на них картинка сделала бы текст нечитаемым.
  const SKIP_INSIDE = 'cu-sidebar, cu-header, tui-dialogs, tui-dialog, [role="dialog"], tui-alerts';
  // Доля окна, начиная с которой непрозрачный слой считаем полотном.
  const MIN_WIDTH_RATIO = 0.6;
  const MIN_AREA_RATIO = 0.4;
  // Полотна живут у корня дерева; ограничение нужно, чтобы не обходить
  // страницу целиком на каждую перерисовку Angular.
  const MAX_DEPTH = 14;

  const FITS = {
    // Заполнить экран целиком, лишнее обрезать.
    cover: { size: 'cover', repeat: 'no-repeat' },
    // Показать картинку целиком, по краям останется заливка темы.
    contain: { size: 'contain', repeat: 'no-repeat' },
    // Растянуть по обеим сторонам: ничего не обрежется, но пропорции поедут.
    // Для фона `fixed` проценты считаются от окна, так что это ровно экран.
    fill: { size: '100% 100%', repeat: 'no-repeat' },
    // Плитка из картинки в оригинальном размере.
    tile: { size: 'auto', repeat: 'repeat' },
    // Как есть, по центру.
    none: { size: 'auto', repeat: 'no-repeat' },
  };
  const DEFAULT_FIT = 'cover';
  // Без подложки текст, который лежит прямо на полотне (например, таблица
  // заданий), оказывается поверх фотографии и не читается.
  const DEFAULT_VEIL = 60;
  const FALLBACK_VEIL_COLOR = '255, 255, 255';

  const scopes = window.cuLmsBackgroundScopes;

  let enabled = false;
  let editorActive = false;
  let fit = DEFAULT_FIT;
  let veil = DEFAULT_VEIL;
  // Цвет подложки берём у самого полотна, поэтому он совпадает с темой:
  // в светлой забеливает, в тёмной затемняет.
  let veilColor = FALLBACK_VEIL_COLOR;
  let observer = null;
  let resizeTimer = null;

  // Прочитанные картинки областей: ключ → dataUrl или null («нет картинки»).
  const imageCache = new Map();
  // Что сейчас на экране: адрес, его области и ключ, чья картинка победила.
  let shownPath = null;
  let shownKey = null;
  let shownImage = null;
  // Номер прохода: чтение из хранилища асинхронное, и ответ для страницы, с
  // которой уже ушли, не должен перебить картинку новой.
  let applyToken = 0;
  const listeners = new Set();

  const currentPath = () => scopes.normalizePath(location.pathname);

  /** Картинки областей страницы; недостающие дочитывает из хранилища. */
  async function loadScopeImages(list) {
    const missing = list.map((scope) => scope.key).filter((key) => !imageCache.has(key));
    if (missing.length) {
      const data = await browser.storage.local.get(missing);
      missing.forEach((key) => imageCache.set(key, data[key] || null));
    }
  }

  function notify() {
    listeners.forEach((fn) => {
      try {
        fn();
      } catch (_error) {
        // Слушатель — панель редактора; её ошибка фону не мешает.
      }
    });
  }

  function normalizeFit(value) {
    return Object.prototype.hasOwnProperty.call(FITS, value) ? value : DEFAULT_FIT;
  }

  function normalizeVeil(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return DEFAULT_VEIL;
    return Math.min(95, Math.max(0, Math.round(num)));
  }

  /** «rgb(244, 244, 245)» → «244, 244, 245». */
  function toRgbTriple(color) {
    const parts = String(color).match(/\d+/g);
    return parts && parts.length >= 3 ? parts.slice(0, 3).join(', ') : null;
  }

  function buildCss(dataUrl) {
    const { size, repeat } = FITS[fit];
    // Подложка — вторым слоем фона на том же элементе, а не отдельной панелью.
    // Отдельная панель не годится: на странице курсов картинку рисует
    // внутренний слой, который лёг бы поверх такой панели и свёл её на нет.
    // Слоем фона она всегда оказывается между картинкой и содержимым.
    const shade =
      veil > 0
        ? `linear-gradient(rgba(${veilColor}, ${veil / 100}), rgba(${veilColor}, ${veil / 100})), `
        : '';
    const shadeSize = veil > 0 ? 'auto, ' : '';
    const shadeRepeat = veil > 0 ? 'no-repeat, ' : '';

    // `html` — на случай, если страница короче окна: ниже контента полотна нет.
    return `
html,
.${CANVAS_CLASS} {
  background-image: ${shade}url("${dataUrl}") !important;
  background-size: ${shadeSize}${size} !important;
  background-repeat: ${shadeRepeat}${repeat} !important;
  background-position: center center !important;
  background-attachment: fixed !important;
}
`;
  }

  /**
   * Слои-полотна: непрозрачные элементы во всю ширину окна.
   *
   * Обход идёт от `body` вглубь и обрезается по ширине: внутри узкого элемента
   * полотна уже не будет, а карточек и прочей мелочи на странице сотни, и
   * считать по ним `getComputedStyle` на каждую мутацию слишком дорого.
   */
  function collectCanvasLayers() {
    const minWidth = window.innerWidth * MIN_WIDTH_RATIO;
    const minArea = window.innerWidth * window.innerHeight * MIN_AREA_RATIO;
    const found = [];

    const walk = (parent, depth) => {
      if (depth > MAX_DEPTH) return;

      for (const element of parent.children) {
        const rect = element.getBoundingClientRect();
        if (rect.width < minWidth) continue;

        const style = window.getComputedStyle(element);
        const paints = style.backgroundColor !== 'rgba(0, 0, 0, 0)';
        const floating = style.position === 'fixed' || style.position === 'sticky';

        if (
          paints &&
          !floating &&
          rect.width * rect.height >= minArea &&
          !element.closest(SKIP_INSIDE)
        ) {
          found.push(element);
        }

        walk(element, depth + 1);
      }
    };

    if (document.body) walk(document.body, 0);
    return found;
  }

  /** Помечает полотна и возвращает true, если поменялся цвет подложки. */
  function markCanvasLayers() {
    const layers = collectCanvasLayers();
    const wanted = new Set(layers);

    document.querySelectorAll('.' + CANVAS_CLASS).forEach((element) => {
      if (!wanted.has(element)) element.classList.remove(CANVAS_CLASS);
    });

    // Цвет читаем до того, как повесили класс: после этого фон всё равно
    // остаётся цветом темы (мы добавляем только картинку), но так надёжнее.
    const color = layers.length ? toRgbTriple(getComputedStyle(layers[0]).backgroundColor) : null;
    const changed = !!color && color !== veilColor;
    if (color) veilColor = color;

    wanted.forEach((element) => element.classList.add(CANVAS_CLASS));
    return changed;
  }

  function unmarkCanvasLayers() {
    document
      .querySelectorAll('.' + CANVAS_CLASS)
      .forEach((element) => element.classList.remove(CANVAS_CLASS));
  }

  const onResize = () => {
    // Набор полотен зависит от ширины окна: в узкой раскладке LMS перекладывает
    // разделы по-другому.
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (enabled && shownImage && markCanvasLayers()) render();
    }, 150);
  };

  function startWatching() {
    if (observer) return;

    observer = new MutationObserver(() => {
      try {
        if (typeof browser !== 'undefined' && !(browser.runtime && browser.runtime.id)) {
          stopWatching();
          return;
        }
      } catch (_error) {
        stopWatching();
        return;
      }

      // Перешли на другую страницу — у неё может быть своя картинка.
      if (currentPath() !== shownPath) {
        void apply();
        return;
      }

      // Angular пересобирает раздел при переходе, и новое полотно приходит
      // уже без нашего класса. Если у нового раздела другой цвет темы,
      // подложку пересобираем под него.
      if (enabled && shownImage && markCanvasLayers()) render();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', onResize);
  }

  function stopWatching() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    window.removeEventListener('resize', onResize);
    clearTimeout(resizeTimer);
  }

  /** Рисует `shownImage` — или убирает фон, если картинки нет. */
  function render() {
    const style = document.getElementById(STYLE_ID);

    if (!enabled || !shownImage) {
      if (style) style.remove();
      unmarkCanvasLayers();
      return;
    }

    // Сначала разметка: из неё узнаём цвет темы для подложки.
    markCanvasLayers();

    const css = buildCss(shownImage);
    if (style) {
      if (style.textContent !== css) style.textContent = css;
    } else {
      const created = document.createElement('style');
      created.id = STYLE_ID;
      created.textContent = css;
      (document.head || document.documentElement).appendChild(created);
    }
  }

  /**
   * Находит картинку для текущей страницы и рисует её. Пока новая картинка
   * читается, на экране остаётся прежняя: мигнуть общей по пути хуже.
   */
  async function apply() {
    const token = ++applyToken;
    const path = currentPath();
    const list = scopes.scopesFor(path);
    shownPath = path;

    // За переходами следим всегда, пока фон включён: следующая страница может
    // оказаться со своей картинкой, даже если на этой её нет.
    if (enabled || editorActive) startWatching();
    else stopWatching();

    if (enabled || editorActive) {
      try {
        await loadScopeImages(list);
      } catch (_error) {
        // Контекст расширения умер (обновили расширение) — тихо выходим.
        return;
      }
    }
    if (token !== applyToken) return;

    const winner = list.find((scope) => imageCache.get(scope.key));
    shownKey = winner ? winner.key : null;
    shownImage = winner ? imageCache.get(winner.key) : null;
    render();
    notify();
  }

  async function init() {
    const [syncData, localData] = await Promise.all([
      browser.storage.sync.get([SETTING_KEY, FIT_KEY, VEIL_KEY]),
      browser.storage.local.get(EDITOR_KEY),
    ]);

    enabled = !!syncData[SETTING_KEY];
    fit = normalizeFit(syncData[FIT_KEY]);
    veil = normalizeVeil(syncData[VEIL_KEY]);
    editorActive = !!localData[EDITOR_KEY];
    await apply();
  }

  browser.storage.onChanged.addListener((changes, area) => {
    let dirty = false;

    if (area === 'sync') {
      if (SETTING_KEY in changes) {
        enabled = !!changes[SETTING_KEY].newValue;
        dirty = true;
      }
      if (FIT_KEY in changes) {
        fit = normalizeFit(changes[FIT_KEY].newValue);
        dirty = true;
      }
      if (VEIL_KEY in changes) {
        veil = normalizeVeil(changes[VEIL_KEY].newValue);
        dirty = true;
      }
    }

    if (area === 'local') {
      if (EDITOR_KEY in changes) {
        editorActive = !!changes[EDITOR_KEY].newValue;
        dirty = true;
      }
      Object.keys(changes).forEach((key) => {
        if (!scopes.isScopeKey(key)) return;
        // Кеш держим только для прочитанных ключей: чужие страницы дочитаются,
        // когда на них зайдут.
        if (imageCache.has(key) || scopes.scopesFor(currentPath()).some((s) => s.key === key)) {
          imageCache.set(key, changes[key].newValue || null);
          dirty = true;
        }
      });
    }

    if (dirty) void apply();
  });

  window.cuLmsCustomBackground = {
    /** Области текущей страницы и у каких из них есть картинка. */
    state() {
      const list = scopes.scopesFor(currentPath());
      return {
        enabled,
        shownKey,
        scopes: list.map((scope) => ({ ...scope, image: imageCache.get(scope.key) || null })),
      };
    },
    /** Подписка на смену страницы или картинки; возвращает отписку. */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    refresh: () => apply(),
  };

  if (document.body) void init();
  else document.addEventListener('DOMContentLoaded', () => void init());
}
