// theme_editor.js — редактор своей темы: палитра, свой CSS и разбор элемента.
//
// Редактор живёт в отдельной вкладке: поверх страницы он занимал полэкрана
// и мешал смотреть на то, что красишь. Рядом держат вкладку с LMS и щёлкают
// между ними.
//
// Чужой DOM из вкладки расширения не виден, поэтому элементы разбирает
// контент-скрипт `_shared/theme_editor_host.js` на самой странице: пока
// редактор открыт, там взведена пипетка, и ПКМ по элементу присылает сюда
// его цвета. Связь — через `storage.local`: общего окна у вкладок нет, а
// `storage.onChanged` приходит во все сразу.
//
// Ничего не «применяется» отсюда напрямую: редактор только пишет в
// `storage.local`, а контент-скрипт `custom_theme.js` слушает хранилище и
// пересобирает стиль во всех вкладках. Поэтому правка видна сразу и там, где
// редактор не открыт, и поэтому же здесь нет кнопки «Сохранить» для палитры.

// Polyfill to handle browser namespace differences (Chrome uses 'chrome', Firefox uses 'browser')
if (typeof browser === 'undefined') {
  var browser = chrome;
}

(() => {
  'use strict';

  const TOGGLE_KEY = 'customThemeToggle';
  const VARS_KEY = 'customThemeVars';
  const CSS_KEY = 'customThemeCss';
  const NAME_KEY = 'customThemeName';

  // Служебные ключи пипетки. В профиль темы не попадают — группа `private`.
  const PICK_ACTIVE_KEY = 'themePickerActive';
  const PICK_VALUES_KEY = 'themePageValues';
  const PICK_RESULT_KEY = 'themePickResult';
  const SOURCE_REQUEST_KEY = 'themeSourceRequest';
  const SOURCE_DUMP_KEY = 'themeSourceDump';

  // Дольше ждать нечего: либо вкладка LMS открыта и отвечает сразу, либо её нет.
  const SOURCE_TIMEOUT = 2500;
  // Подсветку строк рисуем поэлементно, и на выгрузке тёмной темы (больше
  // десяти тысяч строк) это заметно тормозит. Ей хватает простого текста.
  const GUTTER_MAX_LINES = 3000;

  // Правки летят в хранилище на каждый сдвиг ползунка в колорпикере —
  // задержка убирает сотни записей подряд, оставаясь незаметной глазу.
  const SAVE_DELAY = 150;
  const CSS_DELAY = 400;

  const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\brgba?\([^()]*\)|\bhsla?\([^()]*\)/g;
  const PIPETTE_MARK = '/* правила из пипетки */';

  const tokens = window.cuLmsThemeTokens;

  const state = {
    enabled: false,
    picking: false,
    // Что показано в редакторе CSS: своя тема, шпаргалка по переменным или
    // выгрузка стилей плагина со страницы.
    source: 'mine',
    readonlyText: '',
    sourceRequest: 0,
    vars: {},
    css: '',
    name: '',
    // Значения переменных, как их видит открытая страница LMS. Их пишет
    // контент-скрипт: без них пришлось бы показывать наши дефолты и врать
    // про светлую тему, где значения совсем другие.
    computed: {},
    element: null,
  };

  const $ = (id) => document.getElementById(id);
  const el = {
    contextNote: $('context-note'),
    enabled: $('theme-enabled'),
    pick: $('pick-toggle'),
    pickNote: $('pick-note'),
    palette: $('palette'),
    filter: $('palette-filter'),
    onlyChanged: $('only-changed'),
    resetVars: $('reset-vars'),
    cssText: $('css-text'),
    gutter: $('gutter'),
    cssSource: $('css-source'),
    cssCopy: $('css-copy'),
    searchWrap: $('search-wrap'),
    search: $('css-search'),
    searchNext: $('css-search-next'),
    searchCount: $('css-search-count'),
    cssApply: $('css-apply'),
    cssAuto: $('css-auto'),
    cssRevert: $('css-revert'),
    cssDownload: $('css-download'),
    cssUpload: $('css-upload'),
    cssFile: $('css-file'),
    cssStatus: $('css-status'),
    caretWrap: $('caret-wrap'),
    caretColor: $('caret-color'),
    elementEmpty: $('element-empty'),
    elementResult: $('element-result'),
    warning: $('warning'),
    warningText: $('warning-text'),
    warningAction: $('warning-action'),
  };

  // --- ЦВЕТА ---

  let probe = null;

  /** Любая запись цвета → «rgb(r, g, b)». Пересчёт делает сам браузер. */
  function toRgb(value) {
    const text = String(value || '').trim();
    if (!text) return '';

    if (!probe) {
      probe = document.createElement('span');
      probe.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
      document.body.appendChild(probe);
    }

    probe.style.color = '';
    probe.style.color = text;
    if (!probe.style.color) return '';
    return getComputedStyle(probe).color;
  }

  /** «rgb(232, 234, 237)» → «#e8eaed». Прозрачность теряется — она в тексте. */
  function toHex(value) {
    const parts = toRgb(value).match(/\d+(\.\d+)?/g);
    if (!parts || parts.length < 3) return '';
    return (
      '#' +
      parts
        .slice(0, 3)
        .map((part) => Math.round(Number(part)).toString(16).padStart(2, '0'))
        .join('')
    );
  }

  // --- ХРАНИЛИЩЕ ---

  let saveTimer = null;
  let cssTimer = null;

  function scheduleVarsSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      browser.storage.local.set({ [VARS_KEY]: state.vars });
    }, SAVE_DELAY);
  }

  function saveCss(immediately) {
    clearTimeout(cssTimer);
    const write = () => browser.storage.local.set({ [CSS_KEY]: state.css });
    if (immediately) write();
    else cssTimer = setTimeout(write, CSS_DELAY);
  }

  async function loadAll() {
    const [sync, local] = await Promise.all([
      browser.storage.sync.get([TOGGLE_KEY, 'themeEnabled']),
      browser.storage.local.get([VARS_KEY, CSS_KEY, NAME_KEY, PICK_VALUES_KEY, PICK_RESULT_KEY]),
    ]);

    state.enabled = !!sync[TOGGLE_KEY];
    state.vars = tokens.normalizeVars(local[VARS_KEY]);
    state.css = tokens.normalizeCss(local[CSS_KEY]);
    state.name = typeof local[NAME_KEY] === 'string' ? local[NAME_KEY] : '';
    // Значения со страницы мог записать уже открытый где-то контент-скрипт.
    state.computed = local[PICK_VALUES_KEY] || {};
    // Прошлый разбор показываем на своей вкладке, но не открываем её сами:
    // человек только что зашёл, а элемент разбирали в прошлый раз.
    const last = local[PICK_RESULT_KEY];
    if (last && typeof last === 'object' && last.selector) state.element = last;

    document.body.classList.toggle('dark', !!sync.themeEnabled);
  }

  // --- ПАЛИТРА ---

  /** Что стоит в этой переменной сейчас: правка → страница → наша тёмная тема. */
  function effectiveValue(token) {
    if (token.name in state.vars) return state.vars[token.name];
    if (state.computed[token.name]) return state.computed[token.name];
    return token.dark || '';
  }

  function valueSource(token) {
    if (token.name in state.vars) return 'своё значение';
    if (state.computed[token.name]) return 'сейчас на странице';
    return 'из тёмной темы';
  }

  function matchesFilter(token, query) {
    if (!query) return true;
    const haystack = (token.label + ' ' + token.hint + ' ' + token.name).toLowerCase();
    return haystack.includes(query);
  }

  function renderPalette() {
    const query = el.filter.value.trim().toLowerCase();
    const onlyChanged = el.onlyChanged.checked;
    el.palette.textContent = '';

    tokens.GROUPS.forEach((group) => {
      const list = tokens.TOKENS.filter(
        (token) =>
          token.group === group.id &&
          matchesFilter(token, query) &&
          (!onlyChanged || token.name in state.vars)
      );
      if (!list.length) return;

      const section = document.createElement('div');
      section.className = 'group';

      const title = document.createElement('h2');
      title.textContent = group.title;
      const hint = document.createElement('p');
      hint.className = 'muted';
      hint.textContent = group.hint;

      const grid = document.createElement('div');
      grid.className = 'tokens';
      list.forEach((token) => grid.appendChild(renderToken(token)));

      section.append(title, hint, grid);
      el.palette.appendChild(section);
    });

    if (!el.palette.children.length) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'Ничего не нашлось.';
      el.palette.appendChild(empty);
    }
  }

  function renderToken(token) {
    const value = effectiveValue(token);
    const row = document.createElement('div');
    row.className = 'token' + (token.name in state.vars ? ' changed' : '');
    row.dataset.token = token.name;

    const swatch = document.createElement('div');
    swatch.className = 'swatch';
    const fill = document.createElement('span');
    fill.style.background = value;
    swatch.appendChild(fill);

    const body = document.createElement('div');
    body.className = 'token-body';

    const label = document.createElement('div');
    label.className = 'token-label';
    label.textContent = token.label;

    const hint = document.createElement('div');
    hint.className = 'muted';
    hint.textContent = token.hint + ' · ' + valueSource(token);

    const name = document.createElement('div');
    name.className = 'token-name';
    name.textContent = token.name;

    const controls = document.createElement('div');
    controls.className = 'token-row';

    const color = document.createElement('input');
    color.type = 'color';
    color.value = toHex(value) || '#000000';
    color.title = 'Выбрать цвет';

    const text = document.createElement('input');
    text.type = 'text';
    // Полупрозрачные и вычисляемые значения (`rgba(...)`, `var(--x)`) в
    // колорпикер не влезают, поэтому рядом всегда есть поле с точным текстом.
    text.value = value;
    text.spellcheck = false;

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'ghost token-reset';
    reset.textContent = '↺';
    reset.title = 'Вернуть исходное значение';
    reset.disabled = !(token.name in state.vars);

    const setValue = (next, updateText) => {
      state.vars[token.name] = next;
      fill.style.background = next;
      if (updateText) text.value = next;
      row.classList.add('changed');
      reset.disabled = false;
      hint.textContent = token.hint + ' · своё значение';
      scheduleVarsSave();
    };

    color.addEventListener('input', () => {
      text.classList.remove('invalid');
      setValue(color.value, true);
    });

    text.addEventListener('input', () => {
      const normalized = tokens.normalizeValue(text.value);
      // Непонятное значение в хранилище не пускаем: CSS его молча выбросит, а
      // человек будет искать, почему цвет не поменялся. Плюс тема уезжает в
      // файл, которым делятся, — мусору там не место. `var(...)` пропускаем:
      // браузер такое значение вне страницы LMS не вычислит.
      const usable = normalized && (toRgb(normalized) || /^var\(/.test(normalized));
      text.classList.toggle('invalid', !usable);
      if (!usable) return;

      const hex = toHex(normalized);
      if (hex) color.value = hex;
      setValue(normalized, false);
    });

    reset.addEventListener('click', () => {
      delete state.vars[token.name];
      scheduleVarsSave();
      const back = effectiveValue(token);
      text.value = back;
      fill.style.background = back;
      color.value = toHex(back) || '#000000';
      row.classList.remove('changed');
      reset.disabled = true;
      hint.textContent = token.hint + ' · ' + valueSource(token);
    });

    controls.append(color, text, reset);
    body.append(label, hint, name, controls);
    row.append(swatch, body);
    return row;
  }

  /** Подсветить переменную в палитре — сюда ведёт кнопка из разбора элемента. */
  function focusToken(name) {
    switchTab('palette');
    el.filter.value = '';
    el.onlyChanged.checked = false;
    renderPalette();

    const row = el.palette.querySelector('[data-token="' + CSS.escape(name) + '"]');
    if (!row) return;
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row.classList.add('flash');
    setTimeout(() => row.classList.remove('flash'), 1300);
    row.querySelector('input[type="text"]')?.focus();
  }

  // --- РЕДАКТОР CSS ---

  let pendingChip = null;
  let caretRange = null;

  /** Позиции цветов в строке — по ним рисуются квадратики на полях. */
  function colorsInLine(line) {
    COLOR_RE.lastIndex = 0;
    const found = [];
    let match;
    while ((match = COLOR_RE.exec(line)) !== null) {
      found.push({ text: match[0], index: match.index });
      if (found.length >= 4) break;
    }
    return found;
  }

  function lineOffsets(text) {
    const offsets = [0];
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] === '\n') offsets.push(i + 1);
    }
    return offsets;
  }

  function renderGutter() {
    const lines = el.cssText.value.split('\n');
    el.gutter.textContent = '';

    // Выгрузка стилей плагина — это десятки тысяч строк, и поля с
    // квадратиками для неё пришлось бы рисовать целиком: вкладка подвисала бы
    // на каждом переключении. Такому тексту хватает простого просмотра.
    if (lines.length > GUTTER_MAX_LINES) {
      el.gutter.hidden = true;
      return;
    }
    el.gutter.hidden = false;

    lines.forEach((line, index) => {
      const row = document.createElement('div');
      row.className = 'gutter-line';

      colorsInLine(line).forEach((color, occurrence) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.style.background = color.text;
        // В чужом тексте квадратик — просто образец цвета: править нечего,
        // это не наш файл.
        if (state.source === 'mine') {
          chip.title = color.text + ' — нажмите, чтобы поменять';
          chip.addEventListener('click', () => openChipPicker(index, occurrence, color.text));
        } else {
          chip.title = color.text;
          chip.disabled = true;
        }
        row.appendChild(chip);
      });

      const number = document.createElement('span');
      number.textContent = String(index + 1);
      row.appendChild(number);

      el.gutter.appendChild(row);
    });

    el.gutter.scrollTop = el.cssText.scrollTop;
  }

  function openChipPicker(lineIndex, occurrence, current) {
    pendingChip = { lineIndex, occurrence };
    el.caretColor.value = toHex(current) || '#000000';
    el.caretColor.dataset.mode = 'chip';
    el.caretColor.click();
  }

  /** Меняет N-й цвет в строке, не трогая остального текста. */
  function replaceChipColor(nextColor) {
    if (!pendingChip) return;
    const lines = el.cssText.value.split('\n');
    const line = lines[pendingChip.lineIndex];
    if (line === undefined) return;

    const colors = colorsInLine(line);
    const target = colors[pendingChip.occurrence];
    if (!target) return;

    lines[pendingChip.lineIndex] =
      line.slice(0, target.index) + nextColor + line.slice(target.index + target.text.length);
    setCssText(lines.join('\n'));
  }

  /** Цвет, внутри которого стоит курсор, — его правит колорпикер в тулбаре. */
  function findCaretColor() {
    const text = el.cssText.value;
    const caret = el.cssText.selectionStart;
    COLOR_RE.lastIndex = 0;
    let match;
    while ((match = COLOR_RE.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (caret >= start && caret <= end) return { start, end, text: match[0] };
    }
    return null;
  }

  function updateCaretColor() {
    caretRange = findCaretColor();
    el.caretWrap.hidden = !caretRange;
    if (caretRange) el.caretColor.value = toHex(caretRange.text) || '#000000';
  }

  function replaceCaretColor(nextColor) {
    if (!caretRange) return;
    const text = el.cssText.value;
    const updated = text.slice(0, caretRange.start) + nextColor + text.slice(caretRange.end);
    const caret = caretRange.start + nextColor.length;

    setCssText(updated);
    el.cssText.setSelectionRange(caret, caret);
    caretRange = { start: caretRange.start, end: caret, text: nextColor };
  }

  /** Единственная точка, через которую меняется текст: иначе разъедутся поля. */
  function setCssText(next, options = {}) {
    state.css = next;

    // Правило из пипетки может прилететь, когда на вкладке открыта справка, —
    // тогда меняем только файл, а показанный текст не трогаем.
    if (state.source === 'mine') {
      const scroll = el.cssText.scrollTop;
      el.cssText.value = next;
      el.cssText.scrollTop = scroll;
      renderGutter();
      checkCss();
    }

    if (options.silent !== true && el.cssAuto.checked) saveCss(false);
  }

  /**
   * Проверка ровно одна — баланс скобок. Полноценный разбор CSS тут не нужен:
   * браузер молча выкидывает непонятные правила, а вот незакрытая скобка
   * съедает весь остаток файла, и это как раз тот случай, когда человек не
   * понимает, почему «ничего не работает».
   */
  function checkCss() {
    const text = el.cssText.value;
    const open = (text.match(/\{/g) || []).length;
    const close = (text.match(/\}/g) || []).length;
    const size = new Blob([text]).size;

    if (open !== close) {
      el.cssStatus.className = 'status error';
      el.cssStatus.textContent =
        'Скобки не сходятся: { — ' +
        open +
        ', } — ' +
        close +
        '. Правила после ошибки не применятся.';
      return;
    }
    if (text.length > tokens.CSS_MAX) {
      el.cssStatus.className = 'status error';
      el.cssStatus.textContent =
        'Файл больше ' + Math.round(tokens.CSS_MAX / 1024) + ' КБ — лишнее не сохранится.';
      return;
    }

    el.cssStatus.className = 'status';
    el.cssStatus.textContent =
      text.trim() === ''
        ? 'Пусто. Можно писать обычный CSS — он применится поверх стилей LMS.'
        : 'Строк: ' + text.split('\n').length + ' · ' + size + ' Б';
  }

  // --- ИСТОЧНИКИ ТЕКСТА ---
  //
  // Кроме своей темы вкладка показывает ещё два текста, оба только для
  // чтения. Пипеткой находится не всё: до чего-то не доберёшься мышью
  // (состояния hover, элементы во всплывашках), а что-то плагин красит
  // правилом, а не переменной, — и тогда единственный способ понять, что
  // вообще можно поменять, это посмотреть список целиком.

  /** Шпаргалка: все переменные каталога с подписями и текущими значениями. */
  function buildVarsSheet() {
    const lines = [
      '/* Все переменные, которые задаёт плагин, — с подписями.',
      '   Значения показаны те, что сейчас на странице LMS (если она открыта),',
      '   иначе — из тёмной темы плагина.',
      '',
      '   Это справка, править её нельзя: нажмите «Скопировать в мою тему»,',
      '   и нужные строки уедут в редактируемый файл. Менять переменные',
      '   удобнее на вкладке «Палитра» — там же колорпикер. */',
      '',
      ':root {',
    ];

    tokens.GROUPS.forEach((group) => {
      const list = tokens.TOKENS.filter((token) => token.group === group.id);
      if (!list.length) return;

      lines.push('  /* ===== ' + group.title + ' ===== */');
      lines.push('  /* ' + group.hint + ' */');
      list.forEach((token) => {
        const own = token.name in state.vars ? ' · изменено вами' : '';
        lines.push('');
        lines.push('  /* ' + token.label + ' — ' + token.hint + own + ' */');
        lines.push('  ' + token.name + ': ' + (effectiveValue(token) || 'не задана') + ';');
      });
      lines.push('');
    });

    lines.push('}', '');
    return lines.join('\n');
  }

  /** Выгрузка со страницы: то, что плагин реально применил к LMS. */
  function buildPluginSheet(dump) {
    const parts = [
      '/* Стили, которые плагин применяет к странице ' + (dump.url || 'LMS') + '.',
      '   Это выгрузка живых <style> с открытой вкладки LMS, то есть ровно то,',
      '   что сейчас работает: тёмная тема, OLED-надстройка, фон, логотип и',
      '   ваша собственная тема.',
      '',
      '   Только чтение. Чтобы что-то перебить, выделите правило и нажмите',
      '   «Скопировать в мою тему» — своя тема применяется поверх этих. */',
      '',
    ];

    dump.styles.forEach((style) => {
      parts.push('/* ===== ' + style.label + ' ===== */');
      parts.push(
        '/* элемент <style id="' + style.id + '">, строк: ' + style.css.split('\n').length + ' */'
      );
      parts.push('');
      parts.push(style.css.trim());
      parts.push('');
    });

    if (!dump.styles.length) {
      parts.push('/* Плагин сейчас ничего не красит: тёмная тема и своя тема выключены. */');
    }

    return parts.join('\n');
  }

  let sourceTimer = null;

  /** Просит открытую вкладку LMS прислать свои стили. */
  function requestPluginStyles() {
    const at = Date.now();
    state.sourceRequest = at;
    showReadonly('/* Спрашиваем у вкладки с LMS, что она сейчас красит… */\n');

    browser.storage.local.set({ [SOURCE_REQUEST_KEY]: at });

    clearTimeout(sourceTimer);
    sourceTimer = setTimeout(() => {
      if (state.source !== 'plugin' || state.readonlyText.indexOf('Спрашиваем') === -1) return;
      showReadonly(
        '/* Ни одна вкладка LMS не ответила.\n' +
          '   Откройте my.centraluniversity.ru или my.cu.ru в соседней вкладке\n' +
          '   и выберите этот пункт ещё раз. */\n'
      );
    }, SOURCE_TIMEOUT);
  }

  function applyPluginDump(dump) {
    if (!dump || dump.forRequest !== state.sourceRequest) return;
    clearTimeout(sourceTimer);
    if (state.source === 'plugin') showReadonly(buildPluginSheet(dump));
    // Выгрузка весит сотни килобайт — в хранилище ей делать нечего.
    browser.storage.local.remove(SOURCE_DUMP_KEY);
  }

  function showReadonly(text) {
    state.readonlyText = text;
    el.cssText.value = text;
    el.cssText.scrollTop = 0;
    renderGutter();

    el.cssStatus.className = 'status';
    el.cssStatus.textContent =
      'Только чтение · строк: ' +
      text.split('\n').length +
      ' · ' +
      new Blob([text]).size +
      ' Б · выделите нужное и нажмите «Скопировать в мою тему» (без выделения уедет весь текст)';
    el.searchCount.textContent = '';
  }

  /** Переключает вкладку styles.css между своим файлом и справками. */
  function renderSource() {
    const editable = state.source === 'mine';

    el.cssText.readOnly = !editable;
    el.cssApply.hidden = !editable;
    el.cssAuto.parentElement.hidden = !editable;
    el.cssRevert.hidden = !editable;
    el.cssUpload.hidden = !editable;
    el.cssCopy.hidden = editable;
    el.searchWrap.hidden = editable;
    if (!editable) el.caretWrap.hidden = true;

    if (editable) {
      el.cssText.value = state.css;
      renderGutter();
      checkCss();
      return;
    }

    if (state.source === 'vars') showReadonly(buildVarsSheet());
    else requestPluginStyles();
  }

  /** Переносит выделенное (или весь текст справки) в свою тему. */
  function copyToMine() {
    const start = el.cssText.selectionStart;
    const end = el.cssText.selectionEnd;
    const chunk = (end > start ? el.cssText.value.slice(start, end) : el.cssText.value).trim();
    if (!chunk) return;

    const header =
      state.source === 'vars' ? '/* из справки по переменным */' : '/* из стилей плагина */';
    state.css = (state.css.trimEnd() + '\n\n' + header + '\n' + chunk + '\n').trimStart();
    saveCss(true);

    el.cssSource.value = 'mine';
    state.source = 'mine';
    renderSource();
    el.cssText.focus();
    el.cssText.setSelectionRange(el.cssText.value.length, el.cssText.value.length);
  }

  // --- ПОИСК ПО ТЕКСТУ ---

  /**
   * Прокрутку считаем сами: у textarea нет `scrollIntoView` для выделения, а
   * в выгрузке тёмной темы совпадение обычно за экраном.
   */
  function scrollToOffset(offset) {
    const before = el.cssText.value.slice(0, offset).split('\n').length - 1;
    const lineHeight = 20;
    el.cssText.scrollTop = Math.max(0, before * lineHeight - el.cssText.clientHeight / 2);
    el.gutter.scrollTop = el.cssText.scrollTop;
  }

  function findNext() {
    const query = el.search.value.trim().toLowerCase();
    if (!query) return;

    const text = el.cssText.value.toLowerCase();
    const total = text.split(query).length - 1;
    if (!total) {
      el.searchCount.textContent = 'не найдено';
      return;
    }

    const from = el.cssText.selectionEnd || 0;
    let index = text.indexOf(query, from);
    // Дошли до конца — начинаем сначала, это привычнее, чем упереться.
    if (index === -1) index = text.indexOf(query);

    const before = text.slice(0, index).split(query).length;
    el.searchCount.textContent = before + ' из ' + total;
    el.cssText.focus();
    el.cssText.setSelectionRange(index, index + query.length);
    scrollToOffset(index);
  }

  // --- ПРАВИЛА ИЗ ПИПЕТКИ ---

  /** Дописывает или правит `selector { prop: value }` в блоке пипетки. */
  function upsertRule(selector, prop, value) {
    let text = state.css;
    if (!text.includes(PIPETTE_MARK)) {
      text = (text.trimEnd() + '\n\n' + PIPETTE_MARK + '\n').trimStart();
    }

    const from = text.indexOf(PIPETTE_MARK);
    const head = text.slice(0, from);
    let tail = text.slice(from);

    const ruleRe = new RegExp(
      '(^|\\n)' + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'
    );
    const found = tail.match(ruleRe);

    if (found) {
      const body = found[2];
      const propRe = new RegExp('(^|\\n)\\s*' + prop + '\\s*:[^;]*;');
      const declaration = '\n  ' + prop + ': ' + value + ' !important;';
      const nextBody = propRe.test(body)
        ? body.replace(propRe, declaration)
        : body.replace(/\s*$/, '') + declaration + '\n';
      tail = tail.replace(found[0], found[1] + selector + ' {' + nextBody + '}');
    } else {
      tail =
        tail.trimEnd() + '\n' + selector + ' {\n  ' + prop + ': ' + value + ' !important;\n}\n';
    }

    setCssText(head + tail);
    saveCss(true);
  }

  // --- РАЗБОР ЭЛЕМЕНТА ---

  function renderElement() {
    const data = state.element;
    el.elementEmpty.hidden = !!data;
    el.elementResult.hidden = !data;
    el.elementResult.textContent = '';
    if (!data) return;

    el.elementResult.appendChild(renderSelectorCard(data));
    el.elementResult.appendChild(renderColorsCard(data));
    el.elementResult.appendChild(renderTokensCard(data));
  }

  function renderSelectorCard(data) {
    const card = document.createElement('div');
    card.className = 'card';

    const title = document.createElement('h2');
    title.textContent = 'Элемент';

    const path = document.createElement('p');
    path.className = 'muted';
    path.textContent = data.path + (data.text ? ' · «' + data.text + '»' : '');

    const row = document.createElement('div');
    row.className = 'selector-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = data.selector;
    input.addEventListener('input', () => {
      data.selector = input.value.trim();
    });

    const insert = document.createElement('button');
    insert.type = 'button';
    insert.className = 'ghost';
    insert.textContent = 'Пустое правило в CSS';
    insert.addEventListener('click', () => {
      setCssText(state.css.trimEnd() + '\n\n' + data.selector + ' {\n  \n}\n');
      saveCss(true);
      switchTab('css');
    });

    row.append(input, insert);

    const count = document.createElement('p');
    count.className = 'muted';
    count.textContent =
      data.matches === 1
        ? 'Селектор попадает ровно в этот элемент.'
        : 'Селектор попадает в ' + data.matches + ' элементов — правило заденет их все.';

    card.append(title, path, row, count);
    return card;
  }

  function renderColorsCard(data) {
    const card = document.createElement('div');
    card.className = 'card';

    const title = document.createElement('h2');
    title.textContent = 'Цвета элемента';
    card.appendChild(title);

    if (!data.colors.length) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'Своих цветов нет — элемент просто наследует их у родителя.';
      card.appendChild(empty);
      return card;
    }

    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent =
      'Цвет отсюда правит только этот селектор: правило уйдёт в блок «правила из пипетки» в styles.css.';
    card.appendChild(note);

    data.colors.forEach((color) => {
      const row = document.createElement('div');
      row.className = 'prop';

      const swatch = document.createElement('div');
      swatch.className = 'swatch';
      const fill = document.createElement('span');
      fill.style.background = color.value;
      swatch.appendChild(fill);

      const name = document.createElement('div');
      name.className = 'prop-name';
      name.textContent = color.label;

      const value = document.createElement('div');
      value.className = 'prop-value';
      value.textContent = color.transparent ? 'прозрачно (' + color.value + ')' : color.value;

      const picker = document.createElement('input');
      picker.type = 'color';
      picker.value = toHex(color.value) || '#000000';
      picker.addEventListener('change', () => {
        fill.style.background = picker.value;
        value.textContent = picker.value;
        upsertRule(data.selector, color.prop, picker.value);
      });

      row.append(swatch, name, value, picker);
      card.appendChild(row);
    });

    return card;
  }

  function renderTokensCard(data) {
    const card = document.createElement('div');
    card.className = 'card';

    const title = document.createElement('h2');
    title.textContent = 'Переменные, которые сюда дотягиваются';
    card.appendChild(title);

    if (!data.tokens.length) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent =
        'Ни одна переменная каталога не совпала по цвету — значит, цвет задан напрямую в стилях LMS. Меняйте его правилом выше.';
      card.appendChild(empty);
      return card;
    }

    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent =
      'Их цвет совпал с цветом элемента. Менять лучше переменную: перекрасятся все похожие места сразу, а не один селектор.';
    card.appendChild(note);

    data.tokens.forEach((token) => {
      const row = document.createElement('div');
      row.className = 'prop';

      const swatch = document.createElement('div');
      swatch.className = 'swatch';
      const fill = document.createElement('span');
      fill.style.background = token.value;
      swatch.appendChild(fill);

      const name = document.createElement('div');
      name.className = 'prop-name';
      name.textContent = token.label;

      const value = document.createElement('div');
      value.className = 'prop-value';
      value.textContent = token.name + ' = ' + token.value;

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'Править';
      edit.addEventListener('click', () => focusToken(token.name));

      row.append(swatch, name, value, edit);
      card.appendChild(row);
    });

    return card;
  }

  // --- ВКЛАДКИ И ОБЩЕЕ СОСТОЯНИЕ ---

  function switchTab(name) {
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.tab === name);
    });
    $('tab-palette').hidden = name !== 'palette';
    $('tab-css').hidden = name !== 'css';
    $('tab-element').hidden = name !== 'element';
  }

  function renderWarning() {
    if (state.enabled) {
      el.warning.hidden = true;
      return;
    }
    el.warning.hidden = false;
    el.warningText.textContent =
      'Своя тема выключена — правки сохраняются, но на страницах LMS их не видно.';
    el.warningAction.hidden = false;
  }

  function renderContextNote() {
    const name = state.name ? '«' + state.name + '» · ' : '';
    el.contextNote.textContent =
      name +
      'правки применяются во всех открытых вкладках LMS сразу — держите LMS в соседней вкладке. ' +
      'Сохранить тему в файл и загрузить чужую можно в меню плагина, раздел «Выбор темы».';
  }

  /** Пипетка живёт на странице LMS, здесь только её выключатель. */
  function renderPickState() {
    el.pick.checked = state.picking;
    el.pickNote.textContent = state.picking
      ? 'Пипетка включена: ПКМ по элементу на вкладке LMS — его цвета приедут сюда'
      : 'Пипетка выключена: правая кнопка на странице работает как обычно';
    // Пока пипетка взведена, на всех вкладках LMS перехвачено контекстное
    // меню — это надо видеть, а не вычитывать из серой строчки.
    el.pickNote.classList.toggle('pick-note_on', state.picking);
    el.pick.parentElement.classList.toggle('pick-row_on', state.picking);
  }

  function setPicking(active) {
    state.picking = active;
    browser.storage.local.set({ [PICK_ACTIVE_KEY]: active });
    renderPickState();
  }

  // --- СКАЧИВАНИЕ ---
  //
  // Экспорт и импорт тем живут в меню плагина: редактор правит текущую тему,
  // а файлами заведует меню — там же, где выгрузка остальных настроек, и
  // тем же форматом (вид профиля `theme`). Здесь остаётся только «скачать»
  // для текста, который открыт во вкладке styles.css.

  function download(filename, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // --- РЕЗУЛЬТАТ ПИПЕТКИ ---

  /**
   * Разбор приходит из вкладки LMS через хранилище. Момент `at` нужен, чтобы
   * отличить новый разбор от старого: ткнуть дважды в один и тот же элемент —
   * обычное дело, а по содержимому такие записи не отличаются.
   */
  function applyPickResult(result) {
    if (!result || typeof result !== 'object' || !result.selector) return;
    if (state.element && state.element.at === result.at) return;

    state.element = result;
    renderElement();
    switchTab('element');
  }

  // --- СОБЫТИЯ ---

  function bind() {
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    el.enabled.addEventListener('change', () => {
      state.enabled = el.enabled.checked;
      browser.storage.sync.set({ [TOGGLE_KEY]: state.enabled });
      renderWarning();
    });

    el.warningAction.addEventListener('click', () => {
      el.enabled.checked = true;
      el.enabled.dispatchEvent(new Event('change'));
    });

    el.filter.addEventListener('input', renderPalette);
    el.onlyChanged.addEventListener('change', renderPalette);

    el.resetVars.addEventListener('click', () => {
      if (!Object.keys(state.vars).length) return;
      if (!confirm('Вернуть все переменные к исходным значениям?')) return;
      state.vars = {};
      browser.storage.local.set({ [VARS_KEY]: {} });
      renderPalette();
    });

    el.pick.addEventListener('change', () => setPicking(el.pick.checked));

    el.cssText.addEventListener('input', () => {
      if (state.source !== 'mine') return;
      setCssText(el.cssText.value);
    });
    el.cssText.addEventListener('scroll', () => {
      el.gutter.scrollTop = el.cssText.scrollTop;
    });
    ['keyup', 'click', 'select'].forEach((type) =>
      el.cssText.addEventListener(type, () => {
        if (state.source === 'mine') updateCaretColor();
      })
    );

    el.caretColor.addEventListener('input', () => {
      if (el.caretColor.dataset.mode === 'chip') replaceChipColor(el.caretColor.value);
      else replaceCaretColor(el.caretColor.value);
    });
    el.caretColor.addEventListener('change', () => {
      if (el.caretColor.dataset.mode === 'chip') {
        replaceChipColor(el.caretColor.value);
        el.caretColor.dataset.mode = '';
        pendingChip = null;
      } else {
        replaceCaretColor(el.caretColor.value);
      }
      saveCss(true);
    });

    el.cssSource.addEventListener('change', () => {
      state.source = el.cssSource.value;
      renderSource();
    });
    el.cssCopy.addEventListener('click', copyToMine);
    el.searchNext.addEventListener('click', findNext);
    el.search.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      findNext();
    });

    el.cssApply.addEventListener('click', () => saveCss(true));
    el.cssRevert.addEventListener('click', async () => {
      const data = await browser.storage.local.get(CSS_KEY);
      setCssText(tokens.normalizeCss(data[CSS_KEY]), { silent: true });
    });
    el.cssDownload.addEventListener('click', () =>
      // Скачиваем то, что видно: справку тоже бывает удобно утащить к себе.
      download(
        state.source === 'mine' ? 'lms-theme.css' : 'lms-' + state.source + '.css',
        state.source === 'mine' ? state.css : state.readonlyText,
        'text/css'
      )
    );
    el.cssUpload.addEventListener('click', () => el.cssFile.click());
    el.cssFile.addEventListener('change', async () => {
      const file = el.cssFile.files[0];
      el.cssFile.value = '';
      if (!file) return;
      setCssText(tokens.normalizeCss(await file.text()));
      saveCss(true);
    });

    // Хранилище меняют и попап, и вторая копия редактора. Поле, в котором
    // сейчас печатают, не трогаем — иначе текст прыгал бы под руками.
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && TOGGLE_KEY in changes) {
        state.enabled = !!changes[TOGGLE_KEY].newValue;
        el.enabled.checked = state.enabled;
        renderWarning();
      }
      if (area === 'local' && VARS_KEY in changes) {
        const next = tokens.normalizeVars(changes[VARS_KEY].newValue);
        if (JSON.stringify(next) === JSON.stringify(state.vars)) return;
        state.vars = next;
        if (!el.palette.contains(document.activeElement)) renderPalette();
      }
      if (area === 'local' && CSS_KEY in changes) {
        const next = tokens.normalizeCss(changes[CSS_KEY].newValue);
        if (next === state.css || document.activeElement === el.cssText) return;
        setCssText(next, { silent: true });
      }
      if (area === 'local' && SOURCE_DUMP_KEY in changes) {
        applyPluginDump(changes[SOURCE_DUMP_KEY].newValue);
      }
      // Тему могли переименовать или загрузить из файла в меню плагина.
      if (area === 'local' && NAME_KEY in changes) {
        state.name =
          typeof changes[NAME_KEY].newValue === 'string' ? changes[NAME_KEY].newValue : '';
        renderContextNote();
      }
      if (area === 'local' && PICK_VALUES_KEY in changes) {
        state.computed = changes[PICK_VALUES_KEY].newValue || {};
        if (!el.palette.contains(document.activeElement)) renderPalette();
      }
      if (area === 'local' && PICK_RESULT_KEY in changes) {
        applyPickResult(changes[PICK_RESULT_KEY].newValue);
      }
      // Пипетку может выключить и сама страница — по Esc.
      if (area === 'local' && PICK_ACTIVE_KEY in changes) {
        state.picking = !!changes[PICK_ACTIVE_KEY].newValue;
        renderPickState();
      }
    });

    // Вкладку закрыли — на странице LMS пипетку надо разоружить, иначе там
    // навсегда останется отобранное контекстное меню.
    window.addEventListener('pagehide', () => {
      browser.storage.local.set({ [PICK_ACTIVE_KEY]: false });
    });
  }

  // --- СТАРТ ---

  async function start() {
    if (!tokens) {
      document.body.textContent = 'Каталог переменных не загрузился.';
      return;
    }

    await loadAll();
    el.enabled.checked = state.enabled;
    bind();
    renderContextNote();
    renderWarning();
    renderPalette();
    setCssText(state.css, { silent: true });
    renderElement();
    renderSource();
    switchTab('palette');

    // Редактор открыт — значит пипетка нужна; выключатель рядом, если мешает.
    setPicking(true);
  }

  void start();
})();
