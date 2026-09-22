// theme_editor_host.js — пипетка редактора тем на странице LMS.
//
// Сам редактор открыт в соседней вкладке (`plugins/theme-editor/`), поэтому
// чужой DOM ему не виден: разбирать элементы приходится здесь, на странице.
//
// Жест — правая кнопка мыши, а не левая. Пока редактор открыт, пипетка
// «взведена» постоянно, и забирать себе левый клик нельзя: по странице надо
// продолжать ходить — открывать курсы, разворачивать разделы, доходить до
// того самого элемента, который не так покрашен. ПКМ на это не влияет,
// поэтому он и стал жестом разбора (контекстное меню при этом подавляется —
// пока пипетка выключена, оно работает как обычно).
//
// Связь с редактором — через `storage.local`, а не `postMessage`: вкладки
// разные, общего окна у них нет, а `storage.onChanged` и так приходит во все
// вкладки сразу. Ключи служебные и в профиль темы не попадают (группа
// `private` в реестре настроек):
//
//   themePickerActive — редактор открыт, пипетка взведена;
//   themePageValues   — значения переменных каталога на этой странице;
//   themePickResult   — что получилось разобрать по последнему ПКМ;
//   themeSourceRequest / themeSourceDump — «покажи всё, что красит плагин».

// Polyfill to handle browser namespace differences (Chrome uses 'chrome', Firefox uses 'browser')
if (typeof browser === 'undefined') {
  var browser = chrome;
}

if (typeof window.__culmsThemeEditorHostInitialized === 'undefined') {
  window.__culmsThemeEditorHostInitialized = true;

  ('use strict');

  const ACTIVE_KEY = 'themePickerActive';
  const VALUES_KEY = 'themePageValues';
  const RESULT_KEY = 'themePickResult';
  const SOURCE_REQUEST_KEY = 'themeSourceRequest';
  const SOURCE_DUMP_KEY = 'themeSourceDump';

  const HIGHLIGHT_ID = 'culms-theme-highlight';
  const HINT_ID = 'culms-theme-pick-hint';
  const TOAST_ID = 'culms-theme-pick-toast';

  // Классы, которые Angular и Taiga раздают сами: в селекторе от них нет
  // толку, они меняются от сборки к сборке и от состояния компонента.
  const JUNK_CLASS = /^(ng-|_ng|cdk-|tui-hosted|culms-)/;
  // Цвета, ради которых всё затевалось. `border` разбирается по сторонам:
  // чаще всего они одинаковые, тогда покажем одной строкой.
  const COLOR_PROPS = [
    { prop: 'background-color', label: 'Фон' },
    { prop: 'color', label: 'Текст' },
    { prop: 'border-top-color', label: 'Рамка сверху' },
    { prop: 'border-right-color', label: 'Рамка справа' },
    { prop: 'border-bottom-color', label: 'Рамка снизу' },
    { prop: 'border-left-color', label: 'Рамка слева' },
    { prop: 'outline-color', label: 'Обводка' },
    { prop: 'fill', label: 'Заливка иконки' },
    { prop: 'stroke', label: 'Контур иконки' },
    { prop: 'text-decoration-color', label: 'Подчёркивание' },
  ];
  const TRANSPARENT = new Set(['rgba(0, 0, 0, 0)', 'transparent', 'none', '']);

  let picking = false;
  let probe = null;
  let toastTimer = null;

  // --- ЦВЕТА ---

  /**
   * «#e8eaed» → «rgb(232, 234, 237)». Сравнивать значения как строки нельзя:
   * одна и та же краска в CSS записана то hex, то rgb, то через переменную.
   * Браузер умеет приводить их сам — этим и пользуемся, через скрытый элемент.
   */
  function resolveColor(value) {
    const text = String(value || '').trim();
    if (!text) return '';

    if (!probe) {
      probe = document.createElement('span');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;pointer-events:none';
      document.documentElement.appendChild(probe);
    }

    probe.style.color = '';
    probe.style.color = text;
    // Значение не приняли — цветом оно не было (например, «14px» или мусор).
    if (!probe.style.color) return '';
    return getComputedStyle(probe).color;
  }

  // --- СЕЛЕКТОР ЭЛЕМЕНТА ---

  function classesOf(element) {
    return [...element.classList].filter((name) => !JUNK_CLASS.test(name)).slice(0, 2);
  }

  function selectorFor(element) {
    const tag = element.tagName.toLowerCase();
    // id вида `tui-dropdown-12` генерируется Taiga на каждый показ, такой
    // селектор протухнет к следующему открытию — берём только осмысленные.
    const id = element.id && !/\d{2,}$/.test(element.id) ? '#' + CSS.escape(element.id) : '';
    const classes = classesOf(element)
      .map((name) => '.' + CSS.escape(name))
      .join('');
    return tag + id + classes;
  }

  /** Селектор, который попадает по элементу и по возможности только по нему. */
  function describeSelector(element) {
    let selector = selectorFor(element);
    let node = element.parentElement;
    let depth = 0;

    while (node && node !== document.body && depth < 3) {
      if (document.querySelectorAll(selector).length <= 1) break;
      selector = selectorFor(node) + ' > ' + selector;
      node = node.parentElement;
      depth += 1;
    }

    let matches = 0;
    try {
      matches = document.querySelectorAll(selector).length;
    } catch (_error) {
      // Экзотическое имя класса могло не пережить экранирование.
      selector = element.tagName.toLowerCase();
      matches = document.querySelectorAll(selector).length;
    }

    return { selector, matches };
  }

  function pathOf(element) {
    const parts = [];
    let node = element;
    while (node && node !== document.documentElement && parts.length < 6) {
      parts.unshift(node.tagName.toLowerCase());
      node = node.parentElement;
    }
    return parts.join(' › ');
  }

  // --- РАЗБОР ЭЛЕМЕНТА ---

  /**
   * Свойство осмысленно только вместе со своим «включателем»: у элемента без
   * рамки `border-color` всё равно посчитан, у не-SVG посчитан `fill`, а
   * `outline-color` по умолчанию равен цвету текста. Показывать это всё —
   * значит закопать настоящие цвета элемента в шум.
   */
  function isMeaningful(prop, style, element) {
    if (prop.startsWith('border-')) {
      const side = prop.replace('-color', '-style');
      const width = prop.replace('-color', '-width');
      return (
        style.getPropertyValue(side) !== 'none' && parseFloat(style.getPropertyValue(width)) > 0
      );
    }
    if (prop === 'outline-color') {
      return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
    }
    if (prop === 'fill' || prop === 'stroke') return element instanceof SVGElement;
    if (prop === 'text-decoration-color') return style.textDecorationLine !== 'none';
    return true;
  }

  function collectColors(style, element) {
    const found = [];
    const borders = COLOR_PROPS.filter((item) => item.prop.startsWith('border-'));
    const sameBorder = borders.every(
      (item) => style.getPropertyValue(item.prop) === style.getPropertyValue(borders[0].prop)
    );

    COLOR_PROPS.forEach(({ prop, label }) => {
      if (sameBorder && prop.startsWith('border-') && prop !== 'border-top-color') return;
      if (!isMeaningful(prop, style, element)) return;

      const value = style.getPropertyValue(prop).trim();
      // Фон показываем всегда: «прозрачный фон» — тоже ответ на вопрос
      // «почему не красится». Остальное без цвета только шумит.
      if (TRANSPARENT.has(value) && prop !== 'background-color') return;

      found.push({
        prop: sameBorder && prop === 'border-top-color' ? 'border-color' : prop,
        label: sameBorder && prop === 'border-top-color' ? 'Рамка' : label,
        value,
        resolved: resolveColor(value),
        transparent: TRANSPARENT.has(value),
      });
    });

    return found;
  }

  /** Переменные каталога, которые дотягиваются до элемента и совпали по цвету. */
  function collectTokens(style, colors) {
    const catalogue = window.cuLmsThemeTokens;
    if (!catalogue) return [];

    const byResolved = new Map();
    colors.forEach((color) => {
      if (!color.resolved) return;
      if (!byResolved.has(color.resolved)) byResolved.set(color.resolved, []);
      byResolved.get(color.resolved).push(color.prop);
    });

    const result = [];
    catalogue.TOKENS.forEach((token) => {
      const value = style.getPropertyValue(token.name).trim();
      if (!value) return;

      const resolved = resolveColor(value);
      const matchedProps = resolved ? byResolved.get(resolved) || [] : [];
      if (!matchedProps.length) return;

      result.push({
        name: token.name,
        label: token.label,
        hint: token.hint,
        group: token.group,
        value,
        resolved,
        matchedProps,
      });
    });

    return result;
  }

  function inspect(element) {
    const style = getComputedStyle(element);
    const colors = collectColors(style, element);
    const { selector, matches } = describeSelector(element);

    return {
      selector,
      matches,
      path: pathOf(element),
      tag: element.tagName.toLowerCase(),
      text: (element.textContent || '').trim().slice(0, 80),
      colors,
      tokens: collectTokens(style, colors),
    };
  }

  /** Значения переменных каталога на корне — «что сейчас на странице». */
  function rootValues() {
    const catalogue = window.cuLmsThemeTokens;
    if (!catalogue) return {};

    const style = getComputedStyle(document.documentElement);
    const values = {};
    catalogue.TOKENS.forEach((token) => {
      const value = style.getPropertyValue(token.name).trim();
      if (value) values[token.name] = value;
    });
    return values;
  }

  // --- ЭКРАННЫЕ ПОДСКАЗКИ ---

  function highlight() {
    let box = document.getElementById(HIGHLIGHT_ID);
    if (box) return box;

    box = document.createElement('div');
    box.id = HIGHLIGHT_ID;
    // Тонкая рамка, а не заливка: пипетка взведена всё время, пока открыт
    // редактор, и страницей в это время продолжают пользоваться.
    box.style.cssText =
      'position:fixed;z-index:2147483646;pointer-events:none;outline:1px dashed #4c8dff;' +
      'outline-offset:1px;background:rgba(76,141,255,0.08);display:none';
    document.documentElement.appendChild(box);
    return box;
  }

  function hint() {
    let bar = document.getElementById(HINT_ID);
    if (bar) return bar;

    bar = document.createElement('div');
    bar.id = HINT_ID;
    bar.style.cssText =
      'position:fixed;z-index:2147483647;left:16px;bottom:16px;padding:7px 14px;' +
      'border-radius:999px;background:rgba(20,20,22,0.88);color:#fff;' +
      "font:13px/1.2 'Inter', sans-serif;box-shadow:0 4px 14px rgba(0,0,0,0.3);" +
      'pointer-events:none';
    bar.textContent = 'Пипетка: ПКМ по элементу · Esc — выключить';
    document.documentElement.appendChild(bar);
    return bar;
  }

  /** Разобрали элемент, а редактор в другой вкладке — надо об этом сказать. */
  function toast(text) {
    let box = document.getElementById(TOAST_ID);
    if (!box) {
      box = document.createElement('div');
      box.id = TOAST_ID;
      box.style.cssText =
        'position:fixed;z-index:2147483647;left:16px;bottom:56px;padding:9px 14px;' +
        'border-radius:10px;background:#2f6fed;color:#fff;max-width:320px;' +
        "font:13px/1.35 'Inter', sans-serif;box-shadow:0 6px 18px rgba(0,0,0,0.35);" +
        'pointer-events:none';
      document.documentElement.appendChild(box);
    }

    box.textContent = text;
    box.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      box.style.display = 'none';
    }, 2600);
  }

  function moveHighlight(element) {
    const box = highlight();
    if (!element) {
      box.style.display = 'none';
      return;
    }
    const rect = element.getBoundingClientRect();
    box.style.display = 'block';
    box.style.left = rect.left + 'px';
    box.style.top = rect.top + 'px';
    box.style.width = rect.width + 'px';
    box.style.height = rect.height + 'px';
  }

  function targetAt(event) {
    const element = event.target;
    if (!(element instanceof Element)) return null;
    // Свои же слои под пипетку не подставляем.
    if (element.closest('#' + HIGHLIGHT_ID + ',#' + HINT_ID + ',#' + TOAST_ID)) return null;
    return element;
  }

  // --- ПИПЕТКА ---

  const onMove = (event) => moveHighlight(targetAt(event));

  const onContextMenu = (event) => {
    const element = targetAt(event);
    if (!element) return;

    // Контекстное меню забираем себе только пока пипетка взведена: закрыл
    // редактор — правая кнопка снова работает как обычно.
    event.preventDefault();
    event.stopPropagation();

    const payload = inspect(element);
    browser.storage.local.set({
      [VALUES_KEY]: rootValues(),
      [RESULT_KEY]: { ...payload, at: Date.now() },
    });

    moveHighlight(element);
    toast('Разобрали ' + payload.selector + ' — смотрите вкладку редактора темы');
  };

  const onKeyDown = (event) => {
    if (event.key !== 'Escape' || !picking) return;
    browser.storage.local.set({ [ACTIVE_KEY]: false });
  };

  function startPicking() {
    if (picking) return;
    picking = true;

    highlight();
    hint();
    // Значения со страницы редактор показывает в палитре как «сейчас на
    // странице»; пишем их сразу, не дожидаясь первого ПКМ.
    browser.storage.local.set({ [VALUES_KEY]: rootValues() });

    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('contextmenu', onContextMenu, true);
    window.addEventListener('keydown', onKeyDown, true);
  }

  function stopPicking() {
    if (!picking) return;
    picking = false;

    document.getElementById(HIGHLIGHT_ID)?.remove();
    document.getElementById(HINT_ID)?.remove();
    document.getElementById(TOAST_ID)?.remove();
    clearTimeout(toastTimer);

    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('contextmenu', onContextMenu, true);
    window.removeEventListener('keydown', onKeyDown, true);
  }

  function setPicking(active) {
    if (active) startPicking();
    else stopPicking();
  }

  // --- ВЫГРУЗКА СТИЛЕЙ ПЛАГИНА ---
  //
  // Пипеткой находится не всё: до чего-то не доберёшься мышью (состояния
  // hover, элементы во всплывашках), а что-то плагин красит правилом, а не
  // переменной. Поэтому редактор умеет попросить «покажи всё, что ты
  // красишь», и ответ собирается здесь — из живых `<style>` на странице, то
  // есть ровно из того, что сейчас применено.

  // Подписи к нашим стилям: по одному id не поймёшь, что это за кусок CSS.
  const STYLE_LABELS = {
    'culms-dark-theme-style-base': 'Тёмная тема плагина (dark-theme.css)',
    'culms-dark-theme-style-oled': 'OLED-надстройка тёмной темы',
    'culms-custom-theme': 'Ваша тема — то, что применяется сейчас',
    'culms-custom-background': 'Своя картинка на фоне',
    'culms-custom-logo': 'Свой логотип',
    'cu-gist-dark-theme-injected-style': 'Тёмное оформление панели новостей',
  };

  function collectPluginStyles() {
    const found = [];
    document.querySelectorAll('style[id]').forEach((style) => {
      const id = style.id;
      if (!id.startsWith('culms-') && !id.startsWith('cu-')) return;
      const css = style.textContent || '';
      if (!css.trim()) return;
      found.push({ id, label: STYLE_LABELS[id] || id, css });
    });
    return found;
  }

  async function answerSourceRequest(requestedAt) {
    if (typeof requestedAt !== 'number') return;

    // Вкладок с LMS может быть несколько, и каждая полезет отвечать одним и
    // тем же — а это сотни килобайт. Расходимся по времени и проверяем, не
    // ответил ли кто-то раньше.
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 250));
    const current = await browser.storage.local.get(SOURCE_DUMP_KEY);
    if (current[SOURCE_DUMP_KEY]?.forRequest === requestedAt) return;

    await browser.storage.local.set({
      [SOURCE_DUMP_KEY]: {
        forRequest: requestedAt,
        url: location.href,
        styles: collectPluginStyles(),
      },
    });
  }

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (ACTIVE_KEY in changes) setPicking(!!changes[ACTIVE_KEY].newValue);
    if (SOURCE_REQUEST_KEY in changes)
      void answerSourceRequest(changes[SOURCE_REQUEST_KEY].newValue);
  });

  browser.storage.local.get(ACTIVE_KEY).then((data) => setPicking(!!data[ACTIVE_KEY]));

  window.cuLmsThemeEditor = {
    inspect,
    rootValues,
    setPicking,
    isPicking: () => picking,
    collectPluginStyles,
  };
}
