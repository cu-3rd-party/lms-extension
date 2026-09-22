// background_editor.js — редактор фона прямо на странице LMS.
//
// Включается из попапа кнопкой «Редактор фона» (`storage.local.backgroundEditorActive`)
// и показывает в углу страницы панель. Дальше человек ходит по LMS как обычно,
// а на нужной странице выбирает, для чего ставить картинку: только эта
// страница, весь курс, раздел или все страницы (области — в
// `background_scopes.js`). Картинка применяется сразу; «Готово» выключает
// редактор во всех вкладках.
//
// Флаг лежит в хранилище, а не в памяти вкладки: так панель переживает
// перезагрузку страницы и переход по обычной ссылке, а попап может включить
// её, не зная, в какой вкладке LMS человек сейчас.
//
// Панель живёт в Shadow DOM: стили LMS и нашей тёмной темы красят всё подряд
// (`button`, `select`, `*`) и развалили бы её, а её стили — страницу.
//
// Что сейчас на экране и какие области есть у страницы, панель узнаёт у
// `custom_background.js` через `window.cuLmsCustomBackground` — он же
// сообщает о смене страницы, чтобы панель не следила за адресом сама.

// Polyfill to handle browser namespace differences (Chrome uses 'chrome', Firefox uses 'browser')
if (typeof browser === 'undefined') {
  var browser = chrome;
}

if (typeof window.__culmsBackgroundEditorInitialized === 'undefined') {
  window.__culmsBackgroundEditorInitialized = true;

  ('use strict');

  const EDITOR_KEY = 'backgroundEditorActive';
  const SETTING_KEY = 'customBackgroundToggle';
  const FIT_KEY = 'backgroundFit';
  const VEIL_KEY = 'backgroundVeil';
  const HOST_ID = 'culms-background-editor';

  // Те же пределы, что у общей картинки в попапе (`BACKGROUND_LIMITS`):
  // больше — пережимаем, иначе хранилище раздувается, а вкладки тормозят.
  const MAX_SIDE = 1920;
  const RAW_LIMIT = 512 * 1024;
  const MAX_RAW_ANIMATED = 1024 * 1024;
  const MAX_SOURCE = 64 * 1024 * 1024;

  const FIT_OPTIONS = [
    ['cover', 'Заполнить экран'],
    ['contain', 'Целиком'],
    ['fill', 'Растянуть'],
    ['tile', 'Плиткой'],
    ['none', 'Как есть'],
  ];
  const VEIL_OPTIONS = [0, 20, 40, 60, 75, 90];

  let host = null;
  let root = null;
  let unsubscribe = null;
  // Область, для которой выбираем картинку. По умолчанию — самая узкая:
  // «поставить свой фон на эту страницу» — главный сценарий редактора.
  let selectedKind = 'page';
  let collapsed = false;
  let busy = false;
  let fit = 'cover';
  let veil = 60;

  const background = () => window.cuLmsCustomBackground || null;

  // --- КАРТИНКА ---

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  async function shrink(dataUrl) {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Не удалось открыть изображение'));
      img.src = dataUrl;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const webp = canvas.toDataURL('image/webp', 0.9);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
  }

  /**
   * Готовит файл так же, как попап: вектор и мелочь — как есть, анимацию
   * сохраняем анимацией (пережимая, если тяжёлая), остальное — через canvas.
   */
  async function prepareImage(file, onStatus) {
    const dataUrl = await readAsDataUrl(file);
    if (file.type === 'image/svg+xml') return dataUrl;

    const formats = window.cuLmsGifReencode;
    if (formats && formats.isAnimated(new Uint8Array(await file.arrayBuffer()))) {
      if (file.size <= MAX_RAW_ANIMATED) return dataUrl;
      if (formats.supported()) {
        const result = await formats.run(file, {
          maxBytes: MAX_RAW_ANIMATED,
          onProgress: onStatus,
        });
        if (result) return result.dataUrl;
      }
    }

    if (file.size <= RAW_LIMIT) return dataUrl;
    return shrink(dataUrl);
  }

  async function setImage(scope, file) {
    if (!file || busy) return;
    if (!/^image\//.test(file.type)) {
      setStatus('Это не картинка.');
      return;
    }
    if (file.size > MAX_SOURCE) {
      setStatus(`Файл больше ${MAX_SOURCE / (1024 * 1024)} МБ.`);
      return;
    }

    busy = true;
    render();
    try {
      setStatus('Готовлю картинку…');
      const prepared = await prepareImage(file, setStatus);
      await browser.storage.local.set({ [scope.key]: prepared });
      // Человек только что поставил фон — значит, хочет его видеть, даже если
      // тумблер «Своя картинка на фоне» был выключен.
      const sync = await browser.storage.sync.get(SETTING_KEY);
      if (!sync[SETTING_KEY]) await browser.storage.sync.set({ [SETTING_KEY]: true });
      setStatus('');
    } catch (_error) {
      setStatus('Не удалось обработать картинку. Выберите другой файл.');
    } finally {
      busy = false;
      render();
    }
  }

  async function removeImage(scope) {
    await browser.storage.local.remove(scope.key);
  }

  // --- ПАНЕЛЬ ---

  function isDark() {
    return !!document.getElementById('culms-dark-theme-style-base');
  }

  function stylesheet() {
    const dark = isDark();
    const c = dark
      ? {
          bg: '#202124',
          text: '#e8eaed',
          muted: '#9aa0a6',
          border: '#3c4043',
          hover: '#2d2e31',
          accent: '#8ab4f8',
          accentText: '#202124',
        }
      : {
          bg: '#ffffff',
          text: '#202124',
          muted: '#5f6368',
          border: '#dadce0',
          hover: '#f1f3f4',
          accent: '#1a73e8',
          accentText: '#ffffff',
        };
    return `
      :host { all: initial; }
      .panel {
        position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;
        width: 320px; max-width: calc(100vw - 32px); max-height: calc(100vh - 40px);
        overflow: auto; box-sizing: border-box;
        background: ${c.bg}; color: ${c.text};
        border: 1px solid ${c.border}; border-radius: 12px;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
        font: 13px/1.4 'Inter', -apple-system, BlinkMacSystemFont, system-ui, Roboto, 'Segoe UI', sans-serif;
        color-scheme: ${dark ? 'dark' : 'light'};
      }
      .panel.dragover { outline: 2px dashed ${c.accent}; outline-offset: -6px; }
      .head { display: flex; align-items: center; gap: 8px; padding: 12px 14px; }
      .title { flex: 1 1 auto; font-weight: 700; font-size: 14px; }
      .body { padding: 0 14px 14px; }
      .panel.collapsed .body { display: none; }
      .muted { color: ${c.muted}; font-size: 12px; }
      .path { font-family: ui-monospace, Consolas, monospace; font-size: 11px; color: ${c.muted};
        overflow-wrap: anywhere; margin: -4px 0 10px; }
      .now { margin: 0 0 10px; }
      .scopes { display: flex; flex-direction: column; gap: 4px; margin: 0 0 10px; }
      .scope { display: flex; align-items: center; gap: 8px; padding: 6px 8px;
        border: 1px solid ${c.border}; border-radius: 8px; cursor: pointer; }
      .scope:hover { background: ${c.hover}; }
      .scope.selected { border-color: ${c.accent}; }
      .scope input { margin: 0; accent-color: ${c.accent}; }
      .scope-text { flex: 1 1 auto; min-width: 0; }
      .scope-thumb { width: 36px; height: 24px; flex: 0 0 auto; border-radius: 4px;
        border: 1px solid ${c.border}; background: ${c.hover} center / cover no-repeat; }
      .badge { font-size: 11px; color: ${c.accent}; white-space: nowrap; }
      .preview { height: 110px; border-radius: 8px; border: 1px solid ${c.border};
        background: ${c.hover} center / cover no-repeat; display: flex; align-items: center;
        justify-content: center; text-align: center; padding: 8px; box-sizing: border-box;
        margin: 0 0 10px; }
      .row { display: flex; gap: 6px; margin: 0 0 8px; }
      .row > * { flex: 1 1 0; }
      button, select {
        font: inherit; font-size: 13px; border-radius: 8px; padding: 7px 10px;
        border: 1px solid ${c.border}; background: ${c.bg}; color: ${c.text}; cursor: pointer;
      }
      button:hover:not(:disabled) { background: ${c.hover}; }
      button:disabled { opacity: 0.5; cursor: default; }
      button.primary { background: ${c.accent}; border-color: ${c.accent}; color: ${c.accentText}; }
      button.primary:hover:not(:disabled) { background: ${c.accent}; filter: brightness(1.08); }
      button.icon { flex: 0 0 auto; padding: 2px 8px; font-size: 16px; line-height: 20px; }
      label.field { display: flex; flex-direction: column; gap: 3px; }
      .status { margin: 0 0 8px; }
      .status:empty { display: none; }
      .done { width: 100%; }
    `;
  }

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([key, value]) => {
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (value === true) node.setAttribute(key, '');
      else if (value !== false && value != null) node.setAttribute(key, value);
    });
    children.forEach((child) => child && node.appendChild(child));
    return node;
  }

  const cssUrl = (dataUrl) => `url("${String(dataUrl).replace(/"/g, '%22')}")`;

  let statusText = '';
  function setStatus(text) {
    statusText = text || '';
    const node = root && root.querySelector('.status');
    if (node) node.textContent = statusText;
  }

  function render() {
    if (!root) return;
    const api = background();
    const panel = root.querySelector('.panel');
    panel.classList.toggle('collapsed', collapsed);
    root.querySelector('[data-action="collapse"]').textContent = collapsed ? '▴' : '▾';
    root.querySelector('[data-action="collapse"]').title = collapsed ? 'Развернуть' : 'Свернуть';

    const body = root.querySelector('.body');
    body.textContent = '';

    if (!api) {
      body.appendChild(el('p', { class: 'muted', text: 'Фон ещё загружается…' }));
      return;
    }

    const state = api.state();
    if (!state.scopes.some((scope) => scope.kind === selectedKind)) selectedKind = 'page';
    const selected = state.scopes.find((scope) => scope.kind === selectedKind);
    const winner = state.scopes.find((scope) => scope.key === state.shownKey);

    body.appendChild(el('div', { class: 'path', text: location.pathname }));
    body.appendChild(
      el('p', {
        class: 'now',
        text: winner
          ? `Сейчас на фоне: ${winner.title.toLowerCase()}.`
          : 'Сейчас на фоне обычная заливка.',
      })
    );

    body.appendChild(el('div', { class: 'muted', text: 'Поставить картинку для:' }));
    const list = el('div', { class: 'scopes', role: 'radiogroup' });
    state.scopes.forEach((scope) => {
      const radio = el('input', {
        type: 'radio',
        name: 'scope',
        value: scope.kind,
        checked: scope.kind === selectedKind,
        onchange: () => {
          selectedKind = scope.kind;
          render();
        },
      });
      const thumb = el('span', { class: 'scope-thumb' });
      if (scope.image) thumb.style.backgroundImage = cssUrl(scope.image);
      const text = el('span', { class: 'scope-text' }, [
        el('div', { text: scope.title }),
        el('div', { class: 'muted', text: scope.image ? 'своя картинка' : 'нет картинки' }),
      ]);
      const badge =
        scope.key === state.shownKey ? el('span', { class: 'badge', text: 'на экране' }) : null;
      list.appendChild(
        el(
          'label',
          {
            class: 'scope' + (scope.kind === selectedKind ? ' selected' : ''),
            'data-kind': scope.kind,
          },
          [radio, thumb, text, badge]
        )
      );
    });
    body.appendChild(list);

    const preview = el('div', { class: 'preview muted' });
    if (selected.image) {
      preview.style.backgroundImage = cssUrl(selected.image);
    } else {
      preview.textContent =
        'Картинки нет. Выберите файл или перетащите его на панель.' +
        (winner ? ` Пока здесь видна: ${winner.title.toLowerCase()}.` : '');
    }
    body.appendChild(preview);

    const fileInput = el('input', {
      type: 'file',
      accept: 'image/*',
      hidden: true,
      onchange: () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        void setImage(selected, file);
      },
    });
    body.appendChild(fileInput);
    body.appendChild(
      el('div', { class: 'row' }, [
        el('button', {
          type: 'button',
          class: 'primary',
          'data-action': 'pick',
          disabled: busy,
          text: selected.image ? 'Заменить картинку' : 'Выбрать картинку',
          onclick: () => fileInput.click(),
        }),
        el('button', {
          type: 'button',
          'data-action': 'remove',
          disabled: busy || !selected.image,
          text: 'Убрать',
          onclick: () => void removeImage(selected),
        }),
      ])
    );
    body.appendChild(el('div', { class: 'status muted', 'aria-live': 'polite', text: statusText }));

    if (!state.enabled && winner) {
      body.appendChild(
        el('p', {
          class: 'muted',
          text: 'Своя картинка на фоне выключена в меню — включится, как только выберете картинку.',
        })
      );
    }

    // Вставка и подложка — общие для всех картинок: у каждой своей они бы
    // только путали.
    const fitSelect = el(
      'select',
      {
        onchange: () => void browser.storage.sync.set({ [FIT_KEY]: fitSelect.value }),
      },
      FIT_OPTIONS.map(([value, label]) =>
        el('option', { value, selected: value === fit, text: label })
      )
    );
    const veilSelect = el(
      'select',
      {
        onchange: () => void browser.storage.sync.set({ [VEIL_KEY]: Number(veilSelect.value) }),
      },
      VEIL_OPTIONS.map((value) =>
        el('option', {
          value: String(value),
          selected: value === veil,
          text: value ? `${value}%` : 'Нет',
        })
      )
    );
    body.appendChild(
      el('div', { class: 'row' }, [
        el('label', { class: 'field' }, [
          el('span', { class: 'muted', text: 'Вставка' }),
          fitSelect,
        ]),
        el('label', { class: 'field' }, [
          el('span', { class: 'muted', text: 'Подложка' }),
          veilSelect,
        ]),
      ])
    );

    body.appendChild(
      el('button', {
        type: 'button',
        class: 'done',
        'data-action': 'done',
        text: 'Готово — закрыть редактор',
        onclick: () => void browser.storage.local.set({ [EDITOR_KEY]: false }),
      })
    );
  }

  function currentDropScope() {
    const api = background();
    if (!api) return null;
    return api.state().scopes.find((scope) => scope.kind === selectedKind) || null;
  }

  async function open() {
    if (host) return;
    const sync = await browser.storage.sync.get([FIT_KEY, VEIL_KEY]);
    if (sync[FIT_KEY]) fit = sync[FIT_KEY];
    if (Number.isFinite(Number(sync[VEIL_KEY])) && sync[VEIL_KEY] !== undefined)
      veil = Number(sync[VEIL_KEY]);

    host = document.createElement('div');
    host.id = HOST_ID;
    root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = stylesheet();
    const panel = el('div', { class: 'panel', role: 'dialog', 'aria-label': 'Редактор фона' }, [
      el('div', { class: 'head' }, [
        el('span', { class: 'title', text: 'Фон страницы' }),
        el('button', {
          type: 'button',
          class: 'icon',
          'data-action': 'collapse',
          onclick: () => {
            collapsed = !collapsed;
            render();
          },
        }),
        el('button', {
          type: 'button',
          class: 'icon',
          'data-action': 'close',
          title: 'Закрыть редактор',
          text: '×',
          onclick: () => void browser.storage.local.set({ [EDITOR_KEY]: false }),
        }),
      ]),
      el('div', { class: 'body' }),
    ]);

    // Картинку можно просто перетащить на панель — в выбранную область.
    panel.addEventListener('dragover', (event) => {
      event.preventDefault();
      panel.classList.add('dragover');
    });
    panel.addEventListener('dragleave', () => panel.classList.remove('dragover'));
    panel.addEventListener('drop', (event) => {
      event.preventDefault();
      panel.classList.remove('dragover');
      const file = event.dataTransfer && event.dataTransfer.files[0];
      const scope = currentDropScope();
      if (file && scope) void setImage(scope, file);
    });

    root.append(style, panel);
    // В `html`, а не в `body`: Angular перерисовывает содержимое `body`.
    document.documentElement.appendChild(host);

    const api = background();
    if (api) unsubscribe = api.subscribe(render);
    render();
  }

  function close() {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    if (host) host.remove();
    host = null;
    root = null;
    statusText = '';
  }

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && EDITOR_KEY in changes) {
      if (changes[EDITOR_KEY].newValue) void open();
      else close();
    }
    if (area === 'sync' && host) {
      if (FIT_KEY in changes) fit = changes[FIT_KEY].newValue || 'cover';
      if (VEIL_KEY in changes && changes[VEIL_KEY].newValue !== undefined) {
        veil = Number(changes[VEIL_KEY].newValue);
      }
      if (FIT_KEY in changes || VEIL_KEY in changes || SETTING_KEY in changes) render();
    }
  });

  browser.storage.local.get(EDITOR_KEY).then((data) => {
    if (data[EDITOR_KEY]) void open();
  });
}
