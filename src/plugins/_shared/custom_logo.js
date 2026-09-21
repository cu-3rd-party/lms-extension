// custom_logo.js — свой логотип вместо фирменного ЦУ в шапке.
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

  let enabled = false;
  let logo = null;
  let fit = DEFAULT_FIT;
  let scale = DEFAULT_SCALE;

  function normalizeFit(value) {
    return Object.prototype.hasOwnProperty.call(FITS, value) ? value : DEFAULT_FIT;
  }

  function normalizeScale(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return DEFAULT_SCALE;
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(num)));
  }

  /**
   * Правило для псевдоэлемента с логотипом.
   *
   * `mask-image: none` обязателен: пока маска на месте, браузер показывает
   * закрашенный силуэт родного логотипа, а не наш фон. `background-color`
   * гасим по той же причине — Taiga красит им маску.
   */
  function buildCss(dataUrl) {
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

  function apply() {
    const style = document.getElementById(STYLE_ID);

    if (!enabled || !logo) {
      if (style) style.remove();
      return;
    }

    const css = buildCss(logo);
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

  async function init() {
    const [syncData, localData] = await Promise.all([
      browser.storage.sync.get([SETTING_KEY, FIT_KEY, SCALE_KEY]),
      browser.storage.local.get(LOGO_KEY),
    ]);

    enabled = !!syncData[SETTING_KEY];
    fit = normalizeFit(syncData[FIT_KEY]);
    scale = normalizeScale(syncData[SCALE_KEY]);
    logo = localData[LOGO_KEY] || null;
    apply();
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
    }
    if (area === 'local' && LOGO_KEY in changes) {
      logo = changes[LOGO_KEY].newValue || null;
      dirty = true;
    }

    if (dirty) apply();
  });

  void init();
}
