// custom_theme.js — своя палитра поверх LMS.
//
// Тем было две: родная светлая и наша тёмная. Эта — третья: набор значений для
// цветовых переменных плюс произвольный CSS, и то и другое человек правит сам
// в редакторе тем. Применяется поверх любой базовой темы: можно подкрасить
// светлую LMS, а можно перебрать нашу тёмную.
//
// Почему стиль должен лежать последним в `<head>`. Объявления переменных в
// `dark-theme.css` местами помечены `!important`, а среди важных объявлений с
// одинаковой специфичностью выигрывает то, что идёт позже. Тёмная тема
// вставляется при включении тумблера, то есть может приехать уже после нас —
// поэтому за порядком следим наблюдателем, а не надеемся на порядок загрузки.
//
// Правки применяются без перезагрузки: редактор пишет в хранилище, а
// `storage.onChanged` приходит во все вкладки сразу — в этом и смысл «живого»
// редактирования.

// Polyfill to handle browser namespace differences (Chrome uses 'chrome', Firefox uses 'browser')
if (typeof browser === 'undefined') {
  var browser = chrome;
}

if (typeof window.__culmsCustomThemeInitialized === 'undefined') {
  window.__culmsCustomThemeInitialized = true;

  ('use strict');

  const SETTING_KEY = 'customThemeToggle';
  const VARS_KEY = 'customThemeVars';
  const CSS_KEY = 'customThemeCss';

  const STYLE_ID = 'culms-custom-theme';

  let enabled = false;
  let vars = {};
  let css = '';
  let headObserver = null;

  /** Каталог подключается отдельным скриптом; без него темы просто нет. */
  function tokens() {
    return window.cuLmsThemeTokens || null;
  }

  function buildCss() {
    const catalogue = tokens();
    if (!catalogue) return '';
    return catalogue.buildCss(vars, css);
  }

  /** Держит наш стиль последним: иначе тёмная тема перебьёт переменные. */
  function keepLast(style) {
    const head = document.head;
    if (!head || head.lastElementChild === style) return;
    head.appendChild(style);
  }

  function startWatchingHead() {
    if (headObserver || !document.head) return;

    headObserver = new MutationObserver(() => {
      const style = document.getElementById(STYLE_ID);
      // Стиль мог удалиться вместе с перерисовкой — тогда просто соберём заново.
      if (style) keepLast(style);
      else if (enabled) apply();
    });

    headObserver.observe(document.head, { childList: true });
  }

  function stopWatchingHead() {
    if (!headObserver) return;
    headObserver.disconnect();
    headObserver = null;
  }

  function apply() {
    const existing = document.getElementById(STYLE_ID);
    const text = enabled ? buildCss() : '';

    if (!text) {
      if (existing) existing.remove();
      stopWatchingHead();
      return;
    }

    const style = existing || document.createElement('style');
    if (!existing) style.id = STYLE_ID;
    if (style.textContent !== text) style.textContent = text;

    keepLast(style);
    if (!style.isConnected) (document.head || document.documentElement).appendChild(style);
    startWatchingHead();
  }

  async function init() {
    const [syncData, localData] = await Promise.all([
      browser.storage.sync.get(SETTING_KEY),
      browser.storage.local.get([VARS_KEY, CSS_KEY]),
    ]);

    const catalogue = tokens();
    enabled = !!syncData[SETTING_KEY];
    vars = catalogue ? catalogue.normalizeVars(localData[VARS_KEY]) : {};
    css = catalogue ? catalogue.normalizeCss(localData[CSS_KEY]) : '';
    apply();
  }

  browser.storage.onChanged.addListener((changes, area) => {
    const catalogue = tokens();
    let dirty = false;

    if (area === 'sync' && SETTING_KEY in changes) {
      enabled = !!changes[SETTING_KEY].newValue;
      dirty = true;
    }
    if (area === 'local' && VARS_KEY in changes) {
      vars = catalogue ? catalogue.normalizeVars(changes[VARS_KEY].newValue) : {};
      dirty = true;
    }
    if (area === 'local' && CSS_KEY in changes) {
      css = catalogue ? catalogue.normalizeCss(changes[CSS_KEY].newValue) : '';
      dirty = true;
    }

    if (dirty) apply();
  });

  if (document.head) void init();
  else document.addEventListener('DOMContentLoaded', () => void init());
}
