// custom_logo.js — свой логотип вместо фирменного ЦУ в шапке, а если LMS
// переделана под себя — обязательная надпись «НЕ ЯВЛЯЕТСЯ ОФИЦИАЛЬНОЙ LMS».
//
// Логотип LMS рисует не картинкой, а CSS-маской: у ссылки
// `cu-navigation-link.header__logo-link a` в инлайновом стиле лежит
// `--t-icon-start: url(assets/cu/icons/cuIconLogo.svg)`, а псевдоэлемент
// `::before` красит эту маску текущим цветом текста. Поэтому подменить нечего:
// нет ни `<img>`, ни `background-image`, который можно было бы переписать.
//
// Отсюда подход: снимаем маску и кладём на тот же псевдоэлемент свою картинку
// фоном. Всё делается одним правилом в `<style>`, без наблюдателя за DOM —
// шапку Angular может перерисовывать сколько угодно, глобальный стиль
// продолжит действовать.
//
// Надпись. Свои иконки курсов, свои названия и картинка на фоне дают
// страницу, которая выглядит как настоящая LMS, но показывает то, чего в LMS
// нет. Чтобы такой скриншот нельзя было выдать за официальный, фирменный
// логотип в этом случае принудительно заменяется надписью. Выключить её
// нельзя — только поставить на это место свою картинку: со своим логотипом
// страница за официальную уже не сойдёт.

// Polyfill to handle browser namespace differences (Chrome uses 'chrome', Firefox uses 'browser')
if (typeof browser === 'undefined') {
  var browser = chrome;
}

if (typeof window.__culmsCustomLogoInitialized === 'undefined') {
  window.__culmsCustomLogoInitialized = true;

  ('use strict');

  const SETTING_KEY = 'customLogoToggle';
  const LOGO_KEY = 'customLogo';
  const FIT_KEY = 'logoObjectFit';
  const SCALE_KEY = 'logoScale';
  const STYLE_ID = 'culms-custom-logo';

  // Для CSS-свойства `content`: `\A` — перевод строки, надпись идёт в две.
  const DISCLAIMER = 'НЕ ЯВЛЯЕТСЯ\\A ОФИЦИАЛЬНОЙ LMS';

  // Настройки, из-за которых LMS перестаёт быть похожей на себя. Каждая
  // считается, только когда включена и в ней что-то есть: тумблер без картинок
  // ничего на странице не меняет, а картинки при выключенном тумблере не
  // показываются.
  const ICONS_TOGGLE = 'oldCoursesDesignToggle'; // course-view/course_cards.js
  const ICONS_KEY = 'courseIcons';
  const NAMES_TOGGLE = 'customCourseNamesToggle'; // course_names.js
  const NAMES_KEY = 'courseNames';
  const BACKGROUND_TOGGLE = 'customBackgroundToggle'; // custom_background.js

  // Коробка под логотип — 180×32, то есть очень широкая. Картинка обычных
  // пропорций при `contain` вписывается по высоте и занимает лишь левый край,
  // поэтому режим вставки вынесен в настройку.
  const FITS = {
    // Вся картинка целиком, пустое место по бокам.
    contain: 'contain',
    // Заполнить всю ширину, лишнее обрезать сверху и снизу.
    cover: 'cover',
    // Растянуть по обеим сторонам, пропорции не сохраняются.
    fill: '100% 100%',
    // Пиксель в пиксель, без подгонки.
    none: 'auto',
  };
  const DEFAULT_FIT = 'contain';
  const DEFAULT_SCALE = 100;
  const MIN_SCALE = 25;
  const MAX_SCALE = 400;

  const scopes = window.cuLmsBackgroundScopes;

  let enabled = false;
  let logo = null;
  let fit = DEFAULT_FIT;
  let scale = DEFAULT_SCALE;

  let iconsOn = false;
  let hasIcons = false;
  let namesOn = false;
  let hasNames = false;
  let backgroundOn = false;
  // Ключи областей фона, в которых лежит картинка (см. background_scopes.js).
  // `null` — ещё не читали: список собирается, только когда фон включён.
  let backgroundKeys = null;

  const log = (...args) =>
    typeof window.cuLmsLog === 'function' ? window.cuLmsLog(...args) : undefined;

  function normalizeFit(value) {
    return Object.prototype.hasOwnProperty.call(FITS, value) ? value : DEFAULT_FIT;
  }

  function normalizeScale(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return DEFAULT_SCALE;
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(num)));
  }

  /** В объекте «курс → значение» есть хоть одно непустое значение. */
  const hasAnyValue = (map) =>
    !!map && typeof map === 'object' && Object.values(map).some((value) => !!value);

  function isCustomized() {
    return (
      (iconsOn && hasIcons) ||
      (namesOn && hasNames) ||
      (backgroundOn && !!backgroundKeys && backgroundKeys.size > 0)
    );
  }

  /**
   * Правило для псевдоэлемента с логотипом.
   *
   * `mask-image: none` обязателен: пока маска на месте, браузер показывает
   * закрашенный силуэт родного логотипа, а не наш фон. `background-color`
   * гасим по той же причине — Taiga красит им маску.
   */
  function buildLogoCss(dataUrl) {
    // Масштаб — через transform, а не через background-size: так он работает
    // одинаково при любом режиме вставки. Точка отсчёта слева, чтобы логотип
    // рос вправо, а не наползал на край окна. На раскладку это не влияет:
    // transform не меняет размер коробки, только то, что нарисовано.
    const transform = scale === 100 ? 'none' : `scale(${scale / 100})`;

    return `
cu-navigation-link.header__logo-link a::before {
  -webkit-mask-image: none !important;
  mask-image: none !important;
  background-color: transparent !important;
  background-image: url("${dataUrl}") !important;
  background-repeat: no-repeat !important;
  background-position: left center !important;
  background-size: ${FITS[fit]} !important;
  transform: ${transform} !important;
  transform-origin: left center !important;
}
`;
  }

  /**
   * Надпись вместо логотипа — текстом того же псевдоэлемента.
   *
   * Размеры коробки задаёт LMS (180×32, на узком экране — 48×32), и туда
   * надпись не влезает, поэтому они сбрасываются: плашка берёт ширину по
   * тексту, в две строки. Размер шрифта задан явно, потому что Taiga ставит
   * иконкам `font-size: 1.5rem` и меряет ими коробку.
   *
   * Цвет — свой, а не из темы: `--tui-status-negative` в LMS местами
   * указывает на бледный `--negative-pale`, и надпись почти пропадала.
   * Белым по сплошному красному её видно в любой теме.
   */
  function buildDisclaimerCss() {
    return `
cu-navigation-link.header__logo-link a::before {
  content: "${DISCLAIMER}" !important;
  display: block !important;
  box-sizing: border-box !important;
  inline-size: auto !important;
  block-size: auto !important;
  width: auto !important;
  height: auto !important;
  margin: 0 !important;
  padding: 0.1875rem 0.5rem !important;
  -webkit-mask: none !important;
  mask: none !important;
  background: #e00000 !important;
  border: 2px solid #e00000 !important;
  border-radius: 0.5rem !important;
  color: #fff !important;
  opacity: 1 !important;
  filter: none !important;
  font-family: inherit !important;
  font-size: 0.6875rem !important;
  font-weight: 700 !important;
  line-height: 0.8125rem !important;
  letter-spacing: 0.02em !important;
  text-align: left !important;
  white-space: pre !important;
  transform: none !important;
}
`;
  }

  function buildCss() {
    if (enabled && logo) return buildLogoCss(logo);
    if (isCustomized()) return buildDisclaimerCss();
    return '';
  }

  function apply() {
    const style = document.getElementById(STYLE_ID);
    const css = buildCss();

    if (!css) {
      if (style) style.remove();
      return;
    }

    if (style) {
      if (style.textContent !== css) style.textContent = css;
      return;
    }

    const created = document.createElement('style');
    created.id = STYLE_ID;
    created.textContent = css;
    // `head` на момент внедрения обычно уже есть, но подстраховываемся: без
    // него стиль просто некуда положить, и логотип остался бы родным.
    (document.head || document.documentElement).appendChild(created);
  }

  /**
   * Какие области фона с картинкой. Ключи заранее неизвестны (у каждой
   * страницы и курса свой), поэтому перебираем все. `getKeys` отдаёт одни
   * имена; где его нет, приходится читать хранилище целиком — вместе с
   * картинками, поэтому и делается это только при включённом фоне.
   */
  async function readBackgroundKeys() {
    const area = browser.storage.local;
    let keys = null;

    if (typeof area.getKeys === 'function') {
      try {
        keys = await area.getKeys();
      } catch (error) {
        log('[custom-logo] storage.local.getKeys недоступен:', error);
      }
    }

    if (keys) {
      const present = keys.filter((key) => scopes.isScopeKey(key));
      // Пустые значения оставляет старый формат; их тоже надо отсеять.
      const values = present.length ? await area.get(present) : {};
      return new Set(present.filter((key) => !!values[key]));
    }

    const all = await area.get(null);
    return new Set(Object.keys(all).filter((key) => scopes.isScopeKey(key) && !!all[key]));
  }

  async function refreshBackgroundKeys() {
    if (!backgroundOn || backgroundKeys) return;
    try {
      backgroundKeys = await readBackgroundKeys();
    } catch (error) {
      log('[custom-logo] Не удалось узнать, есть ли картинки фона:', error);
      return;
    }
    apply();
  }

  async function init() {
    const [syncData, localData] = await Promise.all([
      browser.storage.sync.get([
        SETTING_KEY,
        FIT_KEY,
        SCALE_KEY,
        ICONS_TOGGLE,
        NAMES_TOGGLE,
        BACKGROUND_TOGGLE,
      ]),
      browser.storage.local.get([LOGO_KEY, NAMES_KEY]),
    ]);

    enabled = !!syncData[SETTING_KEY];
    fit = normalizeFit(syncData[FIT_KEY]);
    scale = normalizeScale(syncData[SCALE_KEY]);
    logo = localData[LOGO_KEY] || null;
    namesOn = !!syncData[NAMES_TOGGLE];
    hasNames = hasAnyValue(localData[NAMES_KEY]);
    iconsOn = !!syncData[ICONS_TOGGLE];
    backgroundOn = !!syncData[BACKGROUND_TOGGLE];
    apply();

    // Картинки курсов тяжёлые (десятки килобайт на курс), поэтому их читаем
    // отдельно и только когда они вообще могут быть на экране.
    if (iconsOn) {
      const iconsData = await browser.storage.local.get(ICONS_KEY);
      hasIcons = hasAnyValue(iconsData[ICONS_KEY]);
      apply();
    }
    await refreshBackgroundKeys();
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
      if (SCALE_KEY in changes) {
        scale = normalizeScale(changes[SCALE_KEY].newValue);
        dirty = true;
      }
      if (NAMES_TOGGLE in changes) {
        namesOn = !!changes[NAMES_TOGGLE].newValue;
        dirty = true;
      }
      if (ICONS_TOGGLE in changes) {
        iconsOn = !!changes[ICONS_TOGGLE].newValue;
        dirty = true;
        if (iconsOn) {
          browser.storage.local
            .get(ICONS_KEY)
            .then((data) => {
              hasIcons = hasAnyValue(data[ICONS_KEY]);
              apply();
            })
            .catch((error) => log('[custom-logo] Не удалось прочитать картинки курсов:', error));
        }
      }
      if (BACKGROUND_TOGGLE in changes) {
        backgroundOn = !!changes[BACKGROUND_TOGGLE].newValue;
        dirty = true;
        void refreshBackgroundKeys();
      }
    }

    if (area === 'local') {
      if (LOGO_KEY in changes) {
        logo = changes[LOGO_KEY].newValue || null;
        dirty = true;
      }
      if (NAMES_KEY in changes) {
        hasNames = hasAnyValue(changes[NAMES_KEY].newValue);
        dirty = true;
      }
      if (ICONS_KEY in changes) {
        hasIcons = hasAnyValue(changes[ICONS_KEY].newValue);
        dirty = true;
      }
      // Список областей фона держим в актуальном виде, только если уже
      // прочитали его: иначе он соберётся целиком при включении фона.
      if (backgroundKeys) {
        Object.keys(changes).forEach((key) => {
          if (!scopes.isScopeKey(key)) return;
          if (changes[key].newValue) backgroundKeys.add(key);
          else backgroundKeys.delete(key);
          dirty = true;
        });
      }
    }

    if (dirty) apply();
  });

  void init();
}
