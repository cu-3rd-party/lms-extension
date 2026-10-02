// workshop.js — страница 3rd-theme workshop: комнаты, витрина, примерка,
// установка и публикация.
//
// Тема — это профиль настроек вида `workshop` (см. settings_registry.js и
// PROFILE-FORMAT.md): палитра и CSS, переключатели оформления, логотип и
// фоны, обложки и названия курсов. Ставится она по слоям — человек
// снимает галочки с того, что брать не хочет.
//
// Примерка — это настоящая установка с запасным выходом: перед записью
// темы делается снимок затронутых ключей и кладётся в `workshopTryOn`.
// Пока он там лежит, на страницах LMS висит плашка (_shared/workshop_tryon.js)
// с кнопками «Оставить» и «Вернуть как было»; обе уходят в background, он
// и возвращает снимок на место (workshop-background.ts).
//
// Маршруты — в hash, чтобы работала кнопка «назад»:
//   #room/<id>, #theme/<id>, #publish, #publish/<themeId>, #mine.

// Polyfill to handle browser namespace differences (Chrome uses 'chrome', Firefox uses 'browser')
if (typeof browser === 'undefined') {
  var browser = chrome;
}

(() => {
  'use strict';

  const api = window.cuLmsWorkshopApi;
  const registry = window.cuLmsSettings;

  // Сервер принимает картинки до 4 МБ и до шести скриншотов. Больше — пережимаем
  // здесь же, чтобы не отправлять человека в редактор картинок.
  const MAX_SCREENSHOTS = 6;
  const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024;
  const MAX_IMAGE_SIDE = 2560;
  const SEARCH_DELAY = 300;

  const state = {
    me: null,
    rooms: [],
    roomId: null,
    sort: 'new',
    query: '',
    installed: {},
    tryOn: null,
  };

  const $ = (id) => document.getElementById(id);
  const main = $('main');

  // --- DOM ---------------------------------------------------------------

  const PROPS = new Set(['value', 'checked', 'disabled', 'hidden', 'selected', 'multiple']);

  /** Элемент с детьми. Текст всегда уходит в textNode — никакого innerHTML. */
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    Object.entries(props || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === false) return;
      if (key === 'class') el.className = value;
      else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (PROPS.has(key)) el[key] = value;
      else el.setAttribute(key, value === true ? '' : String(value));
    });
    children.flat(Infinity).forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      el.append(child instanceof Node ? child : String(child));
    });
    return el;
  }

  /** replaceChildren, который пропускает null/false — им удобно выключать куски разметки. */
  function put(el, ...children) {
    el.replaceChildren(
      ...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false)
    );
  }

  function formatDate(value) {
    if (!value) return '';
    return new Date(value).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  }

  function plural(n, one, few, many) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  }

  let toastTimer = null;
  function toast(text, kind = 'info') {
    const el = $('toast');
    el.textContent = text;
    el.className = kind === 'error' ? 'toast error' : 'toast';
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), kind === 'error' ? 6000 : 3500);
  }

  /** Запускает действие кнопки: блокирует её и показывает ошибку тостом. */
  async function busy(button, work) {
    if (button) button.disabled = true;
    try {
      return await work();
    } catch (error) {
      toast(error.message || String(error), 'error');
      return undefined;
    } finally {
      if (button) button.disabled = false;
    }
  }

  // --- модалки -------------------------------------------------------------

  function openModal({ title, body, actions = [], wide = false, onClose = null }) {
    const root = $('modal-root');
    const close = () => {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      if (onClose) onClose();
    };
    const onKey = (event) => {
      if (event.key === 'Escape') close();
    };
    const buttons = actions.map((action) =>
      h(
        'button',
        {
          class: `btn ${action.kind || ''}`,
          type: action.submit ? 'submit' : 'button',
          onclick: action.submit
            ? null
            : (event) => busy(event.currentTarget, () => action.onClick(close)),
        },
        action.label
      )
    );
    const form = h(
      'form',
      {
        class: wide ? 'modal wide' : 'modal',
        onsubmit: (event) => {
          event.preventDefault();
          const submit = actions.find((a) => a.submit);
          if (submit) busy(event.submitter, () => submit.onClick(close));
        },
      },
      h('h2', {}, title),
      body,
      buttons.length ? h('div', { class: 'modal-actions' }, buttons) : null
    );
    const backdrop = h(
      'div',
      {
        class: 'modal-backdrop',
        onmousedown: (event) => {
          if (event.target === backdrop) close();
        },
      },
      form
    );
    root.append(backdrop);
    document.addEventListener('keydown', onKey);
    const focusable = form.querySelector('input, textarea, select');
    if (focusable) focusable.focus();
    return close;
  }

  /** Да/нет. Закрыли крестиком, фоном или Esc — это «нет». */
  function confirmDialog(title, text, okLabel = 'Да', danger = false) {
    return new Promise((resolve) => {
      let answer = false;
      openModal({
        title,
        body: h('p', {}, text),
        onClose: () => resolve(answer),
        actions: [
          { label: 'Отмена', kind: 'ghost', onClick: (close) => close() },
          {
            label: okLabel,
            kind: danger ? 'danger' : 'primary',
            submit: true,
            onClick: (close) => {
              answer = true;
              close();
            },
          },
        ],
      });
    });
  }

  // --- данные ----------------------------------------------------------------

  async function loadRooms() {
    state.rooms = await api.get('/api/v1/rooms');
    renderSidebar();
  }

  function roomById(id) {
    return state.rooms.find((room) => room.id === id) || null;
  }

  async function loadLocalState() {
    const stored = await browser.storage.local.get(['workshopTryOn', 'workshopInstalled']);
    state.tryOn = stored.workshopTryOn || null;
    state.installed = stored.workshopInstalled || {};
  }

  // --- боковая панель --------------------------------------------------------

  function renderSidebar() {
    const nav = $('rooms');
    put(
      nav,
      ...state.rooms.map((room) =>
        h(
          'button',
          {
            class: room.id === state.roomId ? 'room-link active' : 'room-link',
            onclick: () => (location.hash = `#room/${room.id}`),
            title: room.is_public ? 'Общая комната: темы проходят модерацию' : `Код: ${room.code}`,
          },
          h('span', {}, room.is_public ? '🌐' : room.is_owner ? '★' : '🔒'),
          h('span', { class: 'name' }, room.name),
          h('span', { class: 'count' }, room.theme_count)
        )
      )
    );
    $('nickname-btn').textContent = state.me?.nickname
      ? `Ты в 3rd-theme workshop: ${state.me.nickname} ✎`
      : 'Задать ник ✎';
  }

  // --- какая тема стоит --------------------------------------------------------
  //
  // Новая тема снимает прежнюю целиком, так что в `workshopInstalled` одна
  // запись. Несколько бывает у тех, кто ставил темы, пока они ложились
  // друг на друга, — тогда «стоит сейчас» последняя поставленная. Нет ни
  // одной — смотрим, не включена ли своя тема из редактора.

  function currentInstalled() {
    let latest = null;
    Object.entries(state.installed).forEach(([themeId, entry]) => {
      if (!latest || String(entry.installedAt) > String(latest.installedAt)) {
        latest = { ...entry, themeId };
      }
    });
    return latest;
  }

  async function renderCurrentTheme() {
    const box = $('current-theme');
    const [sync, local] = await Promise.all([
      browser.storage.sync.get('customThemeToggle'),
      browser.storage.local.get('customThemeName'),
    ]);
    const tryOn = state.tryOn;
    const installed = currentInstalled();
    let title = 'Тема по умолчанию';
    let hint = 'LMS как есть, без тем из 3rd-theme workshop';
    let link = null;
    if (tryOn) {
      title = tryOn.isDefault ? 'Тема по умолчанию' : `${tryOn.title} · v${tryOn.number}`;
      hint = 'Примерка — оставь или верни как было';
      link = tryOn.isDefault ? null : tryOn.themeId;
    } else if (installed) {
      title = `${installed.title} · v${installed.number}`;
      hint = 'Из 3rd-theme workshop';
      link = installed.themeId;
    } else if (sync.customThemeToggle) {
      title = local.customThemeName || 'Своя тема';
      hint = 'Своя, из редактора тем';
    }
    put(
      box,
      h('span', { class: 'current-theme__label' }, tryOn ? 'Примеряешь' : 'Стоит сейчас'),
      link
        ? h(
            'button',
            {
              class: 'current-theme__title link',
              title: 'Открыть тему',
              onclick: () => (location.hash = `#theme/${link}`),
            },
            title
          )
        : h('span', { class: 'current-theme__title' }, title),
      h('span', { class: 'current-theme__hint' }, hint)
    );
  }

  // --- плашка примерки -------------------------------------------------------

  function renderTryOnBar() {
    const bar = $('tryon-bar');
    const tryOn = state.tryOn;
    document.body.classList.toggle('has-tryon', !!tryOn);
    if (!tryOn) {
      bar.hidden = true;
      put(bar);
      return;
    }
    bar.hidden = false;
    put(
      bar,
      h(
        'span',
        {},
        tryOn.isDefault
          ? 'Примеряешь тему по умолчанию'
          : `Примеряешь «${tryOn.title}» v${tryOn.number}`
      ),
      h('span', { class: 'spacer' }),
      h(
        'button',
        {
          class: 'btn',
          onclick: () => browser.runtime.sendMessage({ action: 'WORKSHOP_FOCUS_LMS' }),
        },
        'Посмотреть на LMS'
      ),
      h(
        'button',
        { class: 'btn', onclick: (event) => busy(event.currentTarget, () => endTryOn(false)) },
        'Вернуть как было'
      ),
      h(
        'button',
        { class: 'btn solid', onclick: (event) => busy(event.currentTarget, () => endTryOn(true)) },
        'Оставить'
      )
    );
  }

  async function endTryOn(keep) {
    const response = await browser.runtime.sendMessage({ action: 'WORKSHOP_TRYON_END', keep });
    if (!response || !response.success) {
      throw new Error((response && response.error) || 'Не получилось закончить примерку');
    }
    toast(keep ? 'Тема установлена' : 'Вернули как было');
  }

  // --- установка и примерка ----------------------------------------------------

  /**
   * Скачивает версию и отбирает ключи выбранных слоёв. Проверку значений
   * делает реестр: в профиле может быть что угодно, а ставим только то, что
   * эта версия расширения знает.
   *
   * `stale` — всё оформление, что стоит сейчас: прежняя тема, своя палитра,
   * фоны, обложки и переименования. Новая тема его не дополняет, а заменяет —
   * иначе от старой оставались бы фоны и названия, которых в новой нет.
   */
  async function prepareInstall(theme, version, layers) {
    const profile = await api.resolveProfile(theme.id, version.id);
    const inspected = registry.inspect(profile);
    if (!inspected.ok) throw new Error(inspected.error);
    const only = (key) => layers.includes(registry.layerOf(key));
    const keys = inspected.accepted.map(({ key }) => key).filter(only);
    if (!keys.length) {
      throw new Error('В выбранных слоях нечего ставить — отметь хотя бы один');
    }
    const stale = await registry.storedKeys('workshop');
    return { profile, only, keys, stale, skipped: inspected.rejected.length };
  }

  /** Снимает прежнее оформление и пишет тему на чистое место. */
  async function replaceWith(profile, only, stale) {
    await registry.reset(stale);
    const result = await registry.apply(profile, { only });
    if (!result.ok) throw new Error(result.error);
    return result;
  }

  function installEntry(theme, version) {
    return {
      themeId: theme.id,
      versionId: version.id,
      number: version.number,
      title: version.title,
      roomId: theme.room_id,
    };
  }

  async function tryOnTheme(theme, version, layers) {
    // Примерка поверх примерки: сперва вернуть исходное, иначе снимок второй
    // темы запомнил бы первую вместо настроек человека.
    if (state.tryOn) await endTryOn(false);
    const { profile, only, keys, stale } = await prepareInstall(theme, version, layers);
    // В снимке и то, что тема запишет, и то, что снимется перед ней.
    const backup = await registry.snapshot([...new Set([...stale, ...keys])]);
    // Снимок пишется до темы: если запись оборвётся на полпути, вернуть всё
    // равно будет из чего.
    await browser.storage.local.set({
      workshopTryOn: { ...installEntry(theme, version), backup, startedAt: Date.now() },
    });
    await replaceWith(profile, only, stale);
    await browser.runtime.sendMessage({ action: 'WORKSHOP_FOCUS_LMS' });
  }

  async function installTheme(theme, version, layers) {
    if (state.tryOn) {
      if (
        !state.tryOn.isDefault &&
        state.tryOn.themeId === theme.id &&
        state.tryOn.versionId === version.id
      ) {
        await endTryOn(true);
        return;
      }
      await endTryOn(false);
    }
    const { profile, only, stale, skipped } = await prepareInstall(theme, version, layers);
    const result = await replaceWith(profile, only, stale);

    // Прежние темы сняты целиком — установленной остаётся одна. То же делает
    // background, когда примерку оставляют с плашки на LMS (markInstalled в
    // workshop-background.ts).
    state.installed = {
      [theme.id]: { ...installEntry(theme, version), installedAt: new Date().toISOString() },
    };
    await browser.storage.local.set({ workshopInstalled: state.installed });
    api.post(`/api/v1/themes/${theme.id}/install`, { version_id: version.id }).catch(() => {});
    toast(
      `«${version.title}» установлена: ${result.applied.length} ${plural(result.applied.length, 'настройка', 'настройки', 'настроек')}` +
        (skipped ? `, ${skipped} пропущено — обнови расширение` : '')
    );
  }

  // --- тема по умолчанию ---------------------------------------------------------
  //
  // Вернуться к тому, как LMS выглядит на свежей установке расширения: снять
  // из хранилища ключи выбранных слоёв, и плагины возьмут свои значения по
  // умолчанию. Сервер для этого не нужен — кнопка работает, даже если
  // мастерская не загрузилась.

  // Названия курсов — свои, а не чужая тема: по умолчанию их не трогаем.
  const DEFAULT_LAYERS = ['theme', 'appearance', 'images', 'covers'];

  async function defaultKeys(layers) {
    const keys = await registry.storedKeys('workshop', (key) =>
      layers.includes(registry.layerOf(key))
    );
    if (!keys.length) throw new Error('В выбранных слоях и так всё по умолчанию');
    return keys;
  }

  async function tryOnDefault(layers) {
    if (state.tryOn) await endTryOn(false);
    const keys = await defaultKeys(layers);
    const backup = await registry.snapshot(keys);
    await browser.storage.local.set({
      workshopTryOn: { isDefault: true, title: 'Тема по умолчанию', backup, startedAt: Date.now() },
    });
    await registry.reset(keys);
    await browser.runtime.sendMessage({ action: 'WORKSHOP_FOCUS_LMS' });
  }

  async function installDefault(layers) {
    if (state.tryOn) {
      if (state.tryOn.isDefault) {
        await endTryOn(true);
        return;
      }
      await endTryOn(false);
    }
    const removed = await registry.reset(await defaultKeys(layers));
    // Чужих тем больше нет — и отметок «установлена» тоже. То же делает
    // background, когда примерку темы по умолчанию оставляют с плашки на LMS.
    state.installed = {};
    await browser.storage.local.remove('workshopInstalled');
    toast(
      `Тема по умолчанию: сброшено ${removed.length} ${plural(removed.length, 'настройка', 'настройки', 'настроек')}`
    );
  }

  function defaultThemeModal() {
    const boxes = Object.entries(registry.LAYERS).map(([layer, label]) => {
      const box = h('input', { type: 'checkbox', checked: DEFAULT_LAYERS.includes(layer) });
      return { layer, box, label: h('label', {}, box, label) };
    });
    const chosen = () => boxes.filter(({ box }) => box.checked).map(({ layer }) => layer);
    const run = (work) => async (close) => {
      const layers = chosen();
      if (!layers.length) throw new Error('Отметь хотя бы один слой');
      await work(layers);
      close();
      // Значки «установлена» на карточках поменялись — перерисовать.
      if (state.me) route();
    };
    openModal({
      title: 'Тема по умолчанию',
      body: [
        h(
          'p',
          {},
          'LMS станет такой, как на свежей установке расширения: без своей палитры, логотипа, фонов и обложек. Сервер 3rd-theme workshop для этого не нужен.'
        ),
        h(
          'div',
          { class: 'field' },
          h('span', {}, 'Что сбросить'),
          h(
            'div',
            { class: 'layers' },
            boxes.map(({ label }) => label)
          ),
          h(
            'span',
            { class: 'hint' },
            'Свои картинки и CSS удалятся. Сначала примерь — на LMS будет кнопка «Вернуть как было».'
          )
        ),
      ],
      actions: [
        { label: 'Отмена', kind: 'ghost', onClick: (close) => close() },
        { label: 'Примерить', onClick: run(tryOnDefault) },
        { label: 'Поставить', kind: 'primary', submit: true, onClick: run(installDefault) },
      ],
    });
  }

  // --- комната -----------------------------------------------------------------

  function themeCard(theme) {
    const installed = state.installed[theme.id];
    let badge = null;
    if (installed && installed.number < theme.latest_version) {
      badge = h('span', { class: 'badge accent' }, 'есть обновление');
    } else if (installed) {
      const current = currentInstalled();
      badge = h(
        'span',
        { class: 'badge ok' },
        current && current.themeId === theme.id ? 'стоит сейчас' : 'установлена'
      );
    }
    return h(
      'button',
      { class: 'card', onclick: () => (location.hash = `#theme/${theme.id}`) },
      h('img', { class: 'cover', src: api.assetUrl(theme.cover_url), alt: '', loading: 'lazy' }),
      h(
        'div',
        { class: 'card-body' },
        h('div', { class: 'card-title' }, h('span', {}, theme.title), badge),
        h('span', { class: 'muted small' }, theme.author.nickname),
        h(
          'div',
          { class: 'stats' },
          h('span', { title: 'Лайки' }, `${theme.liked ? '♥' : '♡'} ${theme.likes}`),
          h('span', { title: 'Установки' }, `⤓ ${theme.installs}`),
          h('span', { title: 'Версия' }, `v${theme.latest_version}`)
        )
      )
    );
  }

  async function showRoom(roomId) {
    let room = roomById(roomId);
    if (!room) {
      await loadRooms();
      room = roomById(roomId);
    }
    if (!room) {
      location.hash = `#room/${state.rooms[0].id}`;
      return;
    }
    state.roomId = room.id;
    renderSidebar();

    const grid = h('div', { class: 'grid' });
    const search = h('input', {
      type: 'search',
      placeholder: 'Поиск по названию и описанию',
      value: state.query,
    });
    const sort = h(
      'select',
      {},
      h('option', { value: 'new' }, 'Сначала новые'),
      h('option', { value: 'popular' }, 'Больше установок'),
      h('option', { value: 'likes' }, 'Больше лайков')
    );
    sort.value = state.sort;

    const load = async () => {
      put(grid, h('p', { class: 'muted' }, 'Загружаю…'));
      const params = new URLSearchParams({ sort: state.sort, q: state.query });
      try {
        const themes = await api.get(`/api/v1/rooms/${room.id}/themes?${params}`);
        if (state.roomId !== room.id) return;
        put(
          grid,
          ...(themes.length
            ? themes.map(themeCard)
            : [
                h(
                  'div',
                  { class: 'empty', style: 'grid-column: 1 / -1' },
                  state.query
                    ? 'Ничего не нашлось.'
                    : room.is_public
                      ? 'Здесь пока пусто. Опубликуй свою тему — после модерации она появится у всех.'
                      : 'Здесь пока пусто. Опубликуй тему — она сразу появится у всех в комнате.'
                ),
              ])
        );
      } catch (error) {
        put(grid, h('p', { class: 'error' }, error.message));
      }
    };

    let searchTimer = null;
    search.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.query = search.value.trim();
        load();
      }, SEARCH_DELAY);
    });
    sort.addEventListener('change', () => {
      state.sort = sort.value;
      load();
    });

    const headActions = [];
    if (!room.is_public) {
      headActions.push(
        h(
          'button',
          {
            class: 'btn',
            onclick: () =>
              navigator.clipboard.writeText(room.code).then(() => toast('Код скопирован')),
            title: 'Скопировать код',
          },
          'Код ',
          h('span', { class: 'code' }, room.code)
        ),
        h(
          'button',
          { class: 'btn', onclick: () => roomSettingsModal(room) },
          room.is_owner ? 'Управление' : 'Участники'
        )
      );
    }

    put(
      main,
      h(
        'div',
        { class: 'room-head' },
        h(
          'div',
          {},
          h('h1', {}, room.name),
          h(
            'p',
            { class: 'muted' },
            room.is_public
              ? 'Общая комната — её видят все. Новые темы и их версии проходят модерацию.'
              : `Приватная комната · ${room.member_count} ${plural(room.member_count, 'участник', 'участника', 'участников')}. Войти можно только по коду`
          )
        ),
        headActions.length ? h('div', { class: 'row' }, headActions) : null
      ),
      h('div', { class: 'toolbar' }, search, sort),
      grid
    );
    await load();
  }

  // --- тема ------------------------------------------------------------------

  function gallery(version) {
    const images = [version.cover_url, ...version.screenshot_urls]
      .filter(Boolean)
      .map(api.assetUrl);
    let current = 0;
    const stageImg = h('img', { src: images[0] || '', alt: '' });
    const thumbs = h('div', { class: 'thumbs' });

    const show = (index) => {
      current = index;
      stageImg.src = images[index];
      [...thumbs.children].forEach((thumb, i) => thumb.classList.toggle('active', i === index));
    };
    const openLightbox = () => {
      let index = current;
      const img = h('img', { src: images[index], alt: '' });
      const counter = h('span', {});
      const update = () => {
        img.src = images[index];
        counter.textContent = `${index + 1} / ${images.length} · ←/→ листать · Esc закрыть`;
      };
      const onKey = (event) => {
        if (event.key === 'Escape') close();
        if (event.key === 'ArrowRight') index = (index + 1) % images.length;
        if (event.key === 'ArrowLeft') index = (index - 1 + images.length) % images.length;
        update();
      };
      const box = h('div', { class: 'lightbox', onclick: () => close() }, img, counter);
      const close = () => {
        box.remove();
        document.removeEventListener('keydown', onKey);
      };
      document.addEventListener('keydown', onKey);
      update();
      document.body.append(box);
    };

    if (images.length > 1) {
      images.forEach((url, index) =>
        thumbs.append(
          h(
            'button',
            { class: index === 0 ? 'active' : '', onclick: () => show(index) },
            h('img', { src: url, alt: '', loading: 'lazy' })
          )
        )
      );
    }
    return h(
      'div',
      {},
      h('div', { class: 'stage', onclick: openLightbox, title: 'Открыть во весь экран' }, stageImg),
      images.length > 1 ? thumbs : null
    );
  }

  const STATUS = {
    approved: ['опубликована', 'ok'],
    pending: ['на модерации', 'pending'],
    rejected: ['отклонена', 'bad'],
  };

  function statusBadge(status) {
    const [text, kind] = STATUS[status] || [status, ''];
    return h('span', { class: `badge ${kind}` }, text);
  }

  async function showTheme(themeId) {
    put(main, h('p', { class: 'muted center' }, 'Загружаю тему…'));
    let theme;
    try {
      theme = await api.get(`/api/v1/themes/${themeId}`);
    } catch (error) {
      put(main, h('p', { class: 'error center' }, error.message));
      return;
    }
    state.roomId = theme.room_id;
    renderSidebar();
    const room = roomById(theme.room_id);

    const versions = theme.versions;
    let version = versions.find((v) => v.status === 'approved') || versions[0];

    const left = h('div', {});
    const panel = h('aside', { class: 'panel' });

    const render = () => {
      put(
        left,
        gallery(version),
        version.description ? h('p', { class: 'description' }, version.description) : null,
        version.changelog
          ? h(
              'div',
              {},
              h('h3', {}, `Что нового в v${version.number}`),
              h('p', { class: 'description' }, version.changelog)
            )
          : null
      );
      renderPanel();
    };

    const layerBoxes = new Map();
    const renderPanel = () => {
      const installed = state.installed[theme.id];
      const select = h(
        'select',
        {
          onchange: () => {
            version = versions.find((v) => v.id === select.value);
            render();
          },
        },
        versions.map((v) =>
          h(
            'option',
            { value: v.id, selected: v.id === version.id },
            `v${v.number} · ${formatDate(v.created_at)}` +
              (v.status !== 'approved' ? ` · ${STATUS[v.status][0]}` : '')
          )
        )
      );

      layerBoxes.clear();
      const layers = h(
        'div',
        { class: 'layers' },
        version.layers.map((layer) => {
          const box = h('input', { type: 'checkbox', checked: true });
          layerBoxes.set(layer, box);
          return h('label', { class: 'check' }, box, registry.LAYERS[layer] || layer);
        })
      );
      const chosenLayers = () => [...layerBoxes].filter(([, box]) => box.checked).map(([l]) => l);

      const likeBtn = h(
        'button',
        {
          class: theme.liked ? 'btn like on' : 'btn like',
          onclick: (event) =>
            busy(event.currentTarget, async () => {
              if (theme.liked) await api.del(`/api/v1/themes/${theme.id}/like`);
              else await api.put(`/api/v1/themes/${theme.id}/like`);
              theme.liked = !theme.liked;
              theme.likes += theme.liked ? 1 : -1;
              renderPanel();
            }),
        },
        `${theme.liked ? '♥' : '♡'} ${theme.likes}`
      );

      const authorTools = [];
      if (theme.is_mine) {
        authorTools.push(
          h(
            'button',
            { class: 'btn', onclick: () => (location.hash = `#publish/${theme.id}`) },
            'Выпустить новую версию'
          )
        );
      }
      if (theme.can_delete) {
        authorTools.push(
          h(
            'button',
            {
              class: 'btn danger',
              onclick: async (event) => {
                const own = theme.is_mine;
                const ok = await confirmDialog(
                  'Удалить тему?',
                  own
                    ? 'Тема пропадёт из комнаты вместе со всеми версиями. У тех, кто её поставил, она останется.'
                    : 'Ты владелец комнаты и удаляешь чужую тему. Автор увидит, что её больше нет.',
                  'Удалить',
                  true
                );
                if (!ok) return;
                busy(event.target, async () => {
                  await api.del(`/api/v1/themes/${theme.id}`);
                  toast('Тема удалена');
                  await loadRooms();
                  location.hash = `#room/${theme.room_id}`;
                });
              },
            },
            'Удалить тему'
          )
        );
      }

      const notApproved = version.status !== 'approved';
      put(
        panel,
        h('h1', {}, version.title),
        h(
          'p',
          { class: 'muted' },
          `${theme.author.nickname} · ${room ? room.name : ''}`,
          h('br'),
          `⤓ ${theme.installs} ${plural(theme.installs, 'установка', 'установки', 'установок')} · ${formatBytes(version.payload_bytes)}`
        ),
        theme.removed_reason
          ? h('p', { class: 'warn' }, `Тему снял модератор: ${theme.removed_reason}`)
          : null,
        h('div', { class: 'row' }, likeBtn, theme.can_report ? reportLink(theme, version) : null),
        h('label', { class: 'field' }, h('span', {}, 'Версия'), select),
        notApproved
          ? h(
              'p',
              { class: version.status === 'rejected' ? 'warn' : 'note' },
              version.status === 'rejected'
                ? `Модератор отклонил эту версию: ${version.reject_reason || 'без объяснения'}`
                : 'Эта версия ждёт модерации — пока её видишь только ты.'
            )
          : null,
        installed
          ? h(
              'p',
              { class: 'note' },
              installed.versionId === version.id
                ? 'Эта версия у тебя установлена.'
                : `У тебя установлена v${installed.number}.`
            )
          : null,
        h('div', { class: 'field' }, h('span', {}, 'Что поставить'), layers),
        h(
          'div',
          { class: 'actions' },
          h(
            'button',
            {
              class: 'btn',
              title: 'Тема применится сразу, а на LMS появится кнопка «Вернуть как было»',
              onclick: (event) =>
                busy(event.currentTarget, () => tryOnTheme(theme, version, chosenLayers())),
            },
            'Примерить'
          ),
          h(
            'button',
            {
              class: 'btn primary',
              onclick: (event) =>
                busy(event.currentTarget, async () => {
                  await installTheme(theme, version, chosenLayers());
                  renderPanel();
                }),
            },
            'Установить'
          )
        ),
        h(
          'p',
          { class: 'muted small' },
          'Тема заменяет твоё оформление целиком: прежние палитра, фоны, логотип, обложки и названия курсов снимаются, даже если в новой теме их нет. Названия и обложки применятся только к курсам, которые у тебя есть.'
        ),
        authorTools.length ? h('div', { class: 'row' }, authorTools) : null
      );
    };

    put(
      main,
      h(
        'button',
        { class: 'link back', onclick: () => (location.hash = `#room/${theme.room_id}`) },
        `← ${room ? room.name : 'Назад'}`
      ),
      h('div', { class: 'theme-view' }, left, panel)
    );
    render();
  }

  function reportLink(theme, version) {
    return h(
      'button',
      {
        class: 'link small',
        onclick: () => {
          const reason = h('textarea', {
            placeholder:
              'Что не так? Например: «непристойная картинка» или «CSS прячет кнопку сдачи»',
            required: true,
            minlength: 3,
            maxlength: 1000,
          });
          openModal({
            title: 'Пожаловаться на тему',
            body: h(
              'div',
              { class: 'field' },
              reason,
              h('span', { class: 'hint' }, 'Жалобу увидит модератор 3rd-theme workshop.')
            ),
            actions: [
              { label: 'Отмена', kind: 'ghost', onClick: (close) => close() },
              {
                label: 'Отправить',
                kind: 'danger',
                submit: true,
                onClick: async (close) => {
                  await api.post(`/api/v1/themes/${theme.id}/reports`, {
                    reason: reason.value,
                    version_id: version.id,
                  });
                  close();
                  toast('Жалоба отправлена');
                },
              },
            ],
          });
        },
      },
      'Пожаловаться'
    );
  }

  // --- публикация -----------------------------------------------------------

  /** Пережимает картинку, если она больше, чем примет сервер. */
  async function prepareImage(file) {
    const fits =
      file.size <= MAX_IMAGE_BYTES && /^image\/(png|jpeg|webp|gif|avif)$/.test(file.type);
    if (fits) return file;
    const bitmap = await createImageBitmap(file);
    let scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    for (let quality = 0.9; quality > 0.4; quality -= 0.15) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
      if (blob && blob.size <= MAX_IMAGE_BYTES) {
        return new File([blob], file.name.replace(/\.\w+$/, '') + '.webp', { type: 'image/webp' });
      }
      scale *= 0.8;
    }
    throw new Error(`«${file.name}» не ужимается до 4 МБ — возьми картинку поменьше`);
  }

  async function urlToFile(url, name) {
    const response = await fetch(api.assetUrl(url));
    const blob = await response.blob();
    return new File([blob], name, { type: blob.type });
  }

  function pickFiles(multiple) {
    return new Promise((resolve) => {
      const input = h('input', { type: 'file', accept: 'image/*', multiple });
      input.addEventListener('change', () => resolve([...input.files]));
      input.click();
    });
  }

  async function showPublish(themeId) {
    put(main, h('p', { class: 'muted center' }, 'Собираю твои настройки…'));
    let theme = null;
    let previous = null;
    try {
      if (themeId) {
        theme = await api.get(`/api/v1/themes/${themeId}`);
        previous = theme.versions[0];
      }
    } catch (error) {
      put(main, h('p', { class: 'error center' }, error.message));
      return;
    }

    const profile = await registry.collect('workshop');
    const present = {};
    Object.entries(profile.values).forEach(([key, value]) => {
      const layer = registry.layerOf(key);
      present[layer] = (present[layer] || 0) + JSON.stringify(value).length;
    });

    const images = { cover: null, shots: [] };
    if (previous) {
      // Картинки прошлой версии подставляем сразу: чаще всего меняют тему, а
      // не обложку. Сервер всё равно хранит одинаковые файлы один раз.
      try {
        if (previous.cover_url) images.cover = await urlToFile(previous.cover_url, 'cover');
        images.shots = await Promise.all(
          previous.screenshot_urls.map((url, i) => urlToFile(url, `screenshot-${i + 1}`))
        );
      } catch (_error) {
        // не скачались — человек выберет заново
      }
    }

    const publicRoom = state.rooms.find((r) => r.is_public);
    const roomSelect = theme
      ? null
      : h(
          'select',
          {},
          state.rooms.map((room) =>
            h(
              'option',
              { value: room.id, selected: room.id === (state.roomId || publicRoom?.id) },
              room.is_public ? `${room.name} — с модерацией` : room.name
            )
          )
        );
    const title = h('input', {
      required: true,
      maxlength: 80,
      value: previous ? previous.title : '',
      placeholder: 'Например: «Ночной Иннополис»',
    });
    const description = h(
      'textarea',
      {
        maxlength: 2000,
        placeholder: 'Что в теме, под какую тему LMS она рассчитана, чем вдохновлялся',
      },
      previous ? previous.description : ''
    );
    const changelog = theme
      ? h('textarea', { maxlength: 2000, placeholder: 'Что поменялось с прошлой версии' })
      : null;
    const nickname = state.me.nickname
      ? null
      : h('input', { required: true, maxlength: 40, placeholder: 'Как тебя подписать' });

    const layerBoxes = new Map();
    const layers = h(
      'div',
      { class: 'layers' },
      Object.entries(registry.LAYERS).map(([layer, label]) => {
        const has = layer in present;
        const box = h('input', {
          type: 'checkbox',
          checked: has && (!previous || previous.layers.includes(layer)),
          disabled: !has,
        });
        layerBoxes.set(layer, box);
        return h(
          'label',
          { class: has ? '' : 'disabled' },
          box,
          label,
          h('span', { class: 'muted small' }, has ? formatBytes(present[layer]) : 'не настроено')
        );
      })
    );

    const imagesBox = h('div', { class: 'shots' });
    const renderImages = () => {
      const tile = (file, onRemove, cls) => {
        const url = URL.createObjectURL(file);
        return h(
          'div',
          { class: `shot ${cls || ''}` },
          h('img', { src: url, alt: '', onload: () => URL.revokeObjectURL(url) }),
          h('button', { class: 'remove', type: 'button', title: 'Убрать', onclick: onRemove }, '×')
        );
      };
      const children = [];
      if (images.cover) {
        children.push(
          tile(
            images.cover,
            () => {
              images.cover = null;
              renderImages();
            },
            'cover-shot'
          )
        );
      } else {
        children.push(
          h(
            'button',
            {
              class: 'drop shot cover-shot',
              type: 'button',
              onclick: async () => {
                const [file] = await pickFiles(false);
                if (!file) return;
                images.cover = await busy(null, () => prepareImage(file));
                renderImages();
              },
            },
            'Главный экран — обязательно. Скриншот «Моих курсов» с темой.'
          )
        );
      }
      images.shots.forEach((file, index) =>
        children.push(
          tile(file, () => {
            images.shots.splice(index, 1);
            renderImages();
          })
        )
      );
      if (images.shots.length < MAX_SCREENSHOTS) {
        children.push(
          h(
            'button',
            {
              class: 'drop',
              type: 'button',
              onclick: async () => {
                const files = await pickFiles(true);
                const room = MAX_SCREENSHOTS - images.shots.length;
                for (const file of files.slice(0, room)) {
                  const prepared = await busy(null, () => prepareImage(file));
                  if (prepared) images.shots.push(prepared);
                }
                renderImages();
              },
            },
            `+ скриншоты (до ${MAX_SCREENSHOTS})`
          )
        );
      }
      put(imagesBox, ...children);
    };
    renderImages();

    const moderationNote = h('p', { class: 'note' });
    const updateNote = () => {
      const room = theme ? roomById(theme.room_id) : roomById(roomSelect.value);
      moderationNote.textContent =
        room && room.is_public
          ? 'В общей комнате тему сначала посмотрит модератор. Пока он не одобрит, её видишь только ты — статус в «Моих темах».'
          : 'В приватной комнате модерации нет: тема появится у всех участников сразу.';
    };
    if (roomSelect) roomSelect.addEventListener('change', updateNote);
    updateNote();

    const submit = h(
      'button',
      { class: 'btn primary', type: 'submit' },
      theme ? 'Выпустить версию' : 'Опубликовать'
    );

    const form = h(
      'form',
      {
        class: 'form',
        onsubmit: (event) => {
          event.preventDefault();
          busy(submit, async () => {
            const chosen = [...layerBoxes].filter(([, box]) => box.checked).map(([l]) => l);
            const values = Object.fromEntries(
              Object.entries(profile.values).filter(([key]) =>
                chosen.includes(registry.layerOf(key))
              )
            );
            if (!Object.keys(values).length) throw new Error('Отметь хотя бы один слой темы');
            if (!images.cover) throw new Error('Добавь картинку главного экрана');

            if (nickname) {
              state.me = await api.put('/api/v1/me', { nickname: nickname.value });
              renderSidebar();
            }

            const body = new FormData();
            body.append('title', title.value);
            body.append('description', description.value);
            if (changelog) body.append('changelog', changelog.value);
            body.append(
              'payload',
              new Blob([JSON.stringify({ ...profile, kind: 'workshop', values })], {
                type: 'application/json',
              }),
              'theme.json'
            );
            body.append('cover', images.cover, images.cover.name || 'cover');
            images.shots.forEach((file) => body.append('screenshots', file, file.name || 'shot'));

            submit.textContent = 'Отправляю…';
            const saved = theme
              ? await api.upload(`/api/v1/themes/${theme.id}/versions`, body)
              : await api.upload(`/api/v1/rooms/${roomSelect.value}/themes`, body);
            const pending = saved.versions[0].status === 'pending';
            toast(pending ? 'Отправлено на модерацию' : 'Опубликовано');
            await loadRooms();
            location.hash = pending ? '#mine' : `#theme/${saved.id}`;
          }).finally(() => {
            submit.textContent = theme ? 'Выпустить версию' : 'Опубликовать';
          });
        },
      },
      h('h1', {}, theme ? `Новая версия «${previous.title}»` : 'Опубликовать тему'),
      h(
        'p',
        { class: 'muted' },
        'В тему уходят твои текущие настройки оформления. Сначала настрой LMS так, как хочешь показать, — потом публикуй.'
      ),
      roomSelect ? h('label', { class: 'field' }, h('span', {}, 'Комната'), roomSelect) : null,
      moderationNote,
      nickname
        ? h('label', { class: 'field' }, h('span', {}, 'Твой ник в 3rd-theme workshop'), nickname)
        : null,
      h('label', { class: 'field' }, h('span', {}, 'Название'), title),
      h('label', { class: 'field' }, h('span', {}, 'Описание'), description),
      changelog ? h('label', { class: 'field' }, h('span', {}, 'Что нового'), changelog) : null,
      h(
        'div',
        { class: 'field' },
        h(
          'span',
          {},
          'Что входит в тему ',
          h(
            'span',
            { class: 'hint' },
            '— названия и обложки курсов увидят только те, у кого те же курсы'
          )
        ),
        layers
      ),
      h(
        'div',
        { class: 'field' },
        h('span', {}, 'Картинки ', h('span', { class: 'hint' }, 'большие пережмутся сами')),
        imagesBox
      ),
      h(
        'div',
        { class: 'row' },
        submit,
        h('button', { class: 'btn ghost', type: 'button', onclick: () => history.back() }, 'Отмена')
      )
    );
    put(main, form);
  }

  // --- мои темы ---------------------------------------------------------------

  async function showMine() {
    put(main, h('p', { class: 'muted center' }, 'Загружаю…'));
    let themes;
    try {
      themes = await api.get('/api/v1/me/themes');
    } catch (error) {
      put(main, h('p', { class: 'error center' }, error.message));
      return;
    }
    state.roomId = null;
    renderSidebar();

    const item = (theme) => {
      const latest = theme.versions[0];
      const hasPending = theme.versions.some((v) => v.status === 'pending');
      return h(
        'div',
        { class: 'mine-item' },
        h('img', { class: 'cover', src: api.assetUrl(latest.cover_url), alt: '' }),
        h(
          'div',
          {},
          h(
            'div',
            { class: 'row' },
            h('strong', {}, latest.title),
            h('span', { class: 'muted small' }, `«${theme.room_name}»`)
          ),
          theme.removed_reason
            ? h('p', { class: 'warn' }, `Снята модератором: ${theme.removed_reason}`)
            : null,
          h(
            'ul',
            { class: 'versions' },
            theme.versions.map((v) =>
              h(
                'li',
                {},
                h('span', {}, `v${v.number}`),
                statusBadge(v.status),
                h('span', { class: 'muted small' }, formatDate(v.created_at)),
                v.reject_reason ? h('span', { class: 'error small' }, v.reject_reason) : null,
                v.status !== 'approved'
                  ? h(
                      'button',
                      {
                        class: 'link small',
                        onclick: async (event) => {
                          const ok = await confirmDialog(
                            'Отозвать версию?',
                            theme.versions.length === 1
                              ? 'Это единственная версия — тема удалится целиком.'
                              : `Версия v${v.number} удалится. Опубликованные останутся.`,
                            'Отозвать',
                            true
                          );
                          if (ok) {
                            busy(event.target, async () => {
                              await api.del(`/api/v1/themes/${theme.id}/versions/${v.id}`);
                              showMine();
                            });
                          }
                        },
                      },
                      'отозвать'
                    )
                  : null
              )
            )
          ),
          h(
            'div',
            { class: 'row', style: 'margin-top: 10px' },
            h(
              'button',
              { class: 'btn small', onclick: () => (location.hash = `#theme/${theme.id}`) },
              'Открыть'
            ),
            theme.removed_reason || hasPending
              ? null
              : h(
                  'button',
                  { class: 'btn small', onclick: () => (location.hash = `#publish/${theme.id}`) },
                  'Новая версия'
                )
          )
        )
      );
    };

    put(
      main,
      h('h1', {}, 'Мои темы'),
      h('p', { class: 'muted' }, 'Все твои темы во всех комнатах и решения модератора по ним.'),
      themes.length
        ? h('div', { class: 'mine' }, themes.map(item))
        : h('div', { class: 'empty' }, 'Ты ещё ничего не публиковал.')
    );
  }

  // --- модалки комнат и ника --------------------------------------------------

  function createRoomModal() {
    const name = h('input', {
      required: true,
      maxlength: 80,
      placeholder: 'Например: Б-101 или «Друзья»',
    });
    openModal({
      title: 'Новая комната',
      body: h(
        'div',
        { class: 'field' },
        name,
        h('span', { class: 'hint' }, 'Войти в неё можно будет только по коду из шести символов.')
      ),
      actions: [
        { label: 'Отмена', kind: 'ghost', onClick: (close) => close() },
        {
          label: 'Создать',
          kind: 'primary',
          submit: true,
          onClick: async (close) => {
            const room = await api.post('/api/v1/rooms', { name: name.value });
            close();
            await loadRooms();
            location.hash = `#room/${room.id}`;
            openModal({
              title: 'Комната создана',
              body: h(
                'div',
                {},
                h('p', {}, 'Передай код тем, кого зовёшь:'),
                h(
                  'p',
                  { class: 'center', style: 'padding: 8px 0' },
                  h('span', { class: 'code' }, room.code)
                )
              ),
              actions: [
                {
                  label: 'Скопировать код',
                  kind: 'primary',
                  onClick: async (done) => {
                    await navigator.clipboard.writeText(room.code);
                    toast('Код скопирован');
                    done();
                  },
                },
              ],
            });
          },
        },
      ],
    });
  }

  function joinRoomModal() {
    const code = h('input', {
      class: 'code-input',
      required: true,
      maxlength: 8,
      placeholder: 'XXXXXX',
      autocomplete: 'off',
      spellcheck: 'false',
    });
    openModal({
      title: 'Войти по коду',
      body: code,
      actions: [
        { label: 'Отмена', kind: 'ghost', onClick: (close) => close() },
        {
          label: 'Войти',
          kind: 'primary',
          submit: true,
          onClick: async (close) => {
            const room = await api.post('/api/v1/rooms/join', { code: code.value });
            close();
            await loadRooms();
            location.hash = `#room/${room.id}`;
            toast(`Ты в комнате «${room.name}»`);
          },
        },
      ],
    });
  }

  function nicknameModal() {
    const input = h('input', { required: true, maxlength: 40, value: state.me.nickname || '' });
    openModal({
      title: 'Ник в 3rd-theme workshop',
      body: h(
        'div',
        { class: 'field' },
        input,
        h('span', { class: 'hint' }, 'Его видят под твоими темами и в списках участников комнат.')
      ),
      actions: [
        { label: 'Отмена', kind: 'ghost', onClick: (close) => close() },
        {
          label: 'Сохранить',
          kind: 'primary',
          submit: true,
          onClick: async (close) => {
            state.me = await api.put('/api/v1/me', { nickname: input.value });
            renderSidebar();
            close();
          },
        },
      ],
    });
  }

  async function roomSettingsModal(room) {
    const members = await busy(null, () => api.get(`/api/v1/rooms/${room.id}/members`));
    if (!members) return;
    const bans = room.is_owner
      ? (await busy(null, () => api.get(`/api/v1/rooms/${room.id}/bans`))) || []
      : [];

    const kick = async (member, close) => {
      const withThemes = h('input', { type: 'checkbox' });
      openModal({
        title: `Выгнать ${member.nickname}?`,
        body: h(
          'div',
          {},
          h('p', {}, 'Обратно по коду он не войдёт, пока ты не снимешь запрет.'),
          h('label', { class: 'row' }, withThemes, 'Удалить и его темы в этой комнате')
        ),
        actions: [
          { label: 'Отмена', kind: 'ghost', onClick: (done) => done() },
          {
            label: 'Выгнать',
            kind: 'danger',
            submit: true,
            onClick: async (done) => {
              await api.del(
                `/api/v1/rooms/${room.id}/members/${member.student_id}?delete_themes=${withThemes.checked}`
              );
              done();
              close();
              await loadRooms();
              roomSettingsModal(roomById(room.id) || room);
            },
          },
        ],
      });
    };

    const body = h('div', { class: 'form' });
    let close = null;

    if (room.is_owner) {
      const name = h('input', { maxlength: 80, value: room.name });
      body.append(
        h(
          'label',
          { class: 'field' },
          h('span', {}, 'Название'),
          h(
            'div',
            { class: 'row' },
            name,
            h(
              'button',
              {
                class: 'btn',
                type: 'button',
                onclick: (event) =>
                  busy(event.currentTarget, async () => {
                    await api.patch(`/api/v1/rooms/${room.id}`, { name: name.value });
                    await loadRooms();
                    toast('Переименовано');
                    if (state.roomId === room.id) showRoom(room.id);
                  }),
              },
              'Сохранить'
            )
          )
        ),
        h(
          'div',
          { class: 'field' },
          h('span', {}, 'Код'),
          h(
            'div',
            { class: 'row' },
            h('span', { class: 'code' }, room.code),
            h(
              'button',
              {
                class: 'btn',
                type: 'button',
                onclick: async (event) => {
                  const ok = await confirmDialog(
                    'Сменить код?',
                    'Старый код перестанет пускать. Те, кто уже в комнате, останутся.',
                    'Сменить'
                  );
                  if (!ok) return;
                  busy(event.target, async () => {
                    const updated = await api.post(`/api/v1/rooms/${room.id}/code`);
                    await loadRooms();
                    close();
                    roomSettingsModal(updated);
                    if (state.roomId === room.id) showRoom(room.id);
                  });
                },
              },
              'Сменить код'
            )
          )
        )
      );
    }

    body.append(
      h('h3', {}, `Участники · ${members.length}`),
      h(
        'ul',
        { class: 'people' },
        members.map((member) =>
          h(
            'li',
            {},
            h('span', { class: 'spacer' }, member.nickname, member.is_owner ? ' · владелец' : ''),
            room.is_owner && !member.is_owner
              ? h(
                  'button',
                  { class: 'btn small danger', type: 'button', onclick: () => kick(member, close) },
                  'Выгнать'
                )
              : null
          )
        )
      )
    );

    if (room.is_owner && bans.length) {
      body.append(
        h('h3', {}, `Выгнаны · ${bans.length}`),
        h(
          'ul',
          { class: 'people' },
          bans.map((ban) =>
            h(
              'li',
              {},
              h('span', { class: 'spacer' }, ban.nickname),
              h(
                'button',
                {
                  class: 'btn small',
                  type: 'button',
                  onclick: (event) =>
                    busy(event.currentTarget, async () => {
                      await api.del(`/api/v1/rooms/${room.id}/bans/${ban.student_id}`);
                      event.target.closest('li').remove();
                      toast(`${ban.nickname} снова может войти по коду`);
                    }),
                },
                'Пустить обратно'
              )
            )
          )
        )
      );
    }

    const dangerActions = room.is_owner
      ? {
          label: 'Удалить комнату',
          kind: 'danger',
          onClick: async (done) => {
            const ok = await confirmDialog(
              'Удалить комнату?',
              `«${room.name}» пропадёт у всех участников вместе со всеми темами. Это необратимо.`,
              'Удалить',
              true
            );
            if (!ok) return;
            await api.del(`/api/v1/rooms/${room.id}`);
            done();
            await loadRooms();
            location.hash = `#room/${state.rooms[0].id}`;
          },
        }
      : {
          label: 'Выйти из комнаты',
          kind: 'danger',
          onClick: async (done) => {
            const ok = await confirmDialog(
              'Выйти из комнаты?',
              'Вернуться можно будет по коду. Твои темы в комнате останутся.',
              'Выйти',
              true
            );
            if (!ok) return;
            await api.post(`/api/v1/rooms/${room.id}/leave`);
            done();
            await loadRooms();
            location.hash = `#room/${state.rooms[0].id}`;
          },
        };

    close = openModal({
      title: room.name,
      body,
      wide: true,
      actions: [dangerActions, { label: 'Готово', kind: 'primary', onClick: (done) => done() }],
    });
  }

  // --- маршрутизация ----------------------------------------------------------

  async function route() {
    const [view, id] = location.hash.slice(1).split('/');
    // Модалки здесь не закрываем: действия закрывают свои сами до перехода,
    // а окно с кодом новой комнаты открывается уже после него.
    window.scrollTo(0, 0);
    if (view === 'theme' && id) return showTheme(id);
    if (view === 'publish') return showPublish(id || null);
    if (view === 'mine') return showMine();
    if (view === 'room' && id) return showRoom(id);
    location.hash = `#room/${state.rooms[0].id}`;
    return undefined;
  }

  function renderFatal(error) {
    put(
      main,
      h(
        'div',
        { class: 'empty' },
        h('h2', {}, '3rd-theme workshop не открылся'),
        h('p', {}, error.message || String(error)),
        h(
          'div',
          { class: 'row', style: 'justify-content: center' },
          h(
            'button',
            {
              class: 'btn',
              onclick: () => browser.runtime.sendMessage({ action: 'WORKSHOP_FOCUS_LMS' }),
            },
            'Открыть LMS'
          ),
          h('button', { class: 'btn primary', onclick: () => start() }, 'Попробовать ещё раз')
        )
      )
    );
  }

  async function start() {
    put(main, h('p', { class: 'muted center' }, 'Загружаю 3rd-theme workshop…'));
    try {
      state.me = await api.init();
      await loadRooms();
    } catch (error) {
      renderFatal(error);
      return;
    }
    await route();
  }

  // --- запуск ------------------------------------------------------------------

  $('join-room-btn').addEventListener('click', joinRoomModal);
  $('create-room-btn').addEventListener('click', createRoomModal);
  $('mine-btn').addEventListener('click', () => (location.hash = '#mine'));
  $('publish-btn').addEventListener('click', () => (location.hash = '#publish'));
  $('default-theme-btn').addEventListener('click', defaultThemeModal);
  $('nickname-btn').addEventListener('click', () => state.me && nicknameModal());
  window.addEventListener('hashchange', () => {
    if (state.me) route();
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && 'themeEnabled' in changes) {
      document.body.classList.toggle('dark', !!changes.themeEnabled.newValue);
    }
    if (area === 'sync' && 'customThemeToggle' in changes) renderCurrentTheme();
    if (area !== 'local') return;
    if ('workshopTryOn' in changes) {
      state.tryOn = changes.workshopTryOn.newValue || null;
      renderTryOnBar();
    }
    if ('workshopInstalled' in changes) {
      state.installed = changes.workshopInstalled.newValue || {};
    }
    if (['workshopTryOn', 'workshopInstalled', 'customThemeName'].some((key) => key in changes)) {
      renderCurrentTheme();
    }
  });

  (async () => {
    const sync = await browser.storage.sync.get('themeEnabled');
    document.body.classList.toggle('dark', !!sync.themeEnabled);
    await loadLocalState();
    renderTryOnBar();
    renderCurrentTheme();
    await start();
  })();
})();
