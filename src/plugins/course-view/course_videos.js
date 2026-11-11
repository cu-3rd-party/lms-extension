// course_videos.js
// Две кнопки над таблицей вкладки «Видеозаписи» курса:
//  - «Получить ссылки на записи» — список ссылок во всплывающем окне;
//  - «Скачать мои видеозаписи» — файлы по одному через загрузки браузера.
//
// Записи лежат не в LMS, а в Контур.Толк: LMS отдаёт только ссылку на страницу
// плеера. Метаданные и сами файлы берёт background (KTALK_*): со страницы LMS
// в Толк не сходить из-за CORS. Нужен вход в Толк в этом же браузере.
(() => {
  if (window.cuCourseVideosLoaded) return;
  window.cuCourseVideosLoaded = true;

  const api = typeof browser !== 'undefined' ? browser : chrome;
  const log = (...args) => (window.cuLmsLog || console.log)(...args);
  const PAGE_RE = /\/learn\/courses\/view\/(?:actual|archived)\/(\d+)\/videos\/?$/;
  const HOST_SELECTOR = 'cu-course-overview-videos';
  const SCAN_DELAY_MS = 150;
  const ONLY_MINE_KEY = 'cuVideosOnlyMine';

  // Свой переключатель «только мои пары» (нативный «Мои пары» страницы расширению недоступен).
  let onlyMine = true;
  try {
    onlyMine = localStorage.getItem(ONLY_MINE_KEY) !== '0';
  } catch (_e) {
    // localStorage недоступен — остаётся «только мои».
  }
  const POLL_MS = 2000;

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const sanitizePath = (name) => name.replace(/[\\/:*?"<>|]/g, '_').trim();

  const THEMES = {
    light: { bg: '#ffffff', text: '#333333', border: '#e6e9ef', hover: '#f5f5f5', link: '#2f6fed' },
    dark: {
      bg: 'rgb(32, 33, 36)',
      text: '#E8EAED',
      border: 'rgb(55, 56, 60)',
      hover: 'rgba(255, 255, 255, 0.1)',
      link: '#8ab4f8',
    },
    oled: { bg: '#000000', text: '#ffffff', border: '#333333', hover: '#111111', link: '#8ab4f8' },
  };
  let theme = THEMES.light;

  // --- данные ---

  async function lmsJson(url) {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      credentials: 'include',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  function sendToBackground(message) {
    return api.runtime.sendMessage(message);
  }

  /**
   * Записи пар курса. onlyMine=true — только «мои» пары (myEvents=true, как у
   * переключателя «Мои пары» на этой вкладке), false — все пары курса.
   */
  async function gatherRecordings(courseId, onProgress, onlyMine = true) {
    onProgress('Поиск записей...');
    const events = [];
    const limit = 100;
    for (let offset = 0; ; offset += limit) {
      const page = await lmsJson(
        `/api/micro-lms/calendar-events/recording-events?offset=${offset}&limit=${limit}` +
          `&myEvents=${onlyMine}&eventTypes=seminar&eventTypes=lecture&courseId=${courseId}`
      );
      events.push(...(page.items || []));
      if (!page.items?.length || events.length >= (page.paging?.totalCount ?? 0)) break;
    }

    const found = [];
    for (const [index, event] of events.entries()) {
      onProgress(`Записи: ${index + 1}/${events.length}`);
      const recordings = await lmsJson(
        `/api/micro-lms/calendar-events/${event.id}/recordings?actualDate=${event.eventDatetime.actualDate}`
      );
      for (const recording of recordings || []) {
        const id = String(recording.url || '')
          .split('/')
          .filter(Boolean)
          .pop();
        if (id) {
          found.push({
            id,
            url: recording.url,
            duration: recording.duration,
            title: event.title,
            date: event.eventDatetime.actualDate,
            time: event.eventDatetime.startTime,
          });
        }
      }
      await delay(SCAN_DELAY_MS);
    }
    return found;
  }

  const stamp = (r) => `${r.date} ${r.time}`;

  function recordingLine(r) {
    const minutes = r.duration ? ` · ${Math.round(r.duration / 60)} мин` : '';
    return `${stamp(r)} — ${r.title}${minutes}`;
  }

  /** Одна запись: ставит загрузку и ждёт её конца, сообщая проценты. */
  async function downloadOne(url, filename, onPercent) {
    const started = await sendToBackground({ action: 'KTALK_DOWNLOAD', url, filename });
    if (!started?.success) throw new Error(started?.error || 'загрузка не началась');
    for (;;) {
      await delay(POLL_MS);
      const status = await sendToBackground({ action: 'KTALK_DOWNLOAD_STATUS', id: started.id });
      if (!status?.success) throw new Error(status?.error || 'нет статуса');
      onPercent(status.total > 0 ? Math.round((status.received / status.total) * 100) : 0);
      if (status.state === 'complete') return;
      if (status.state === 'interrupted') throw new Error(status.error || 'прервана');
    }
  }

  /** Скачивает записи по одной: следующая стартует, когда закончилась предыдущая. */
  async function downloadRecordings(courseId, recordings, onProgress, isCancelled) {
    onProgress('Запрос к Толку...');
    const info = await sendToBackground({
      action: 'KTALK_RECORDING_INFO',
      ids: recordings.map((r) => r.id),
    });
    if (!info?.success) throw new Error(info?.error || 'Толк не ответил');
    const byId = new Map(info.items.map((item) => [item.id, item]));

    // Папка названа по id курса, как у ZIP-выгрузки (course_{id}_materials.zip).
    const folder = `course_${courseId}_videos`;
    const result = { done: 0, failed: [] };
    for (const [index, r] of recordings.entries()) {
      if (isCancelled()) break;
      const label = `${index + 1}/${recordings.length}`;
      const best = [...(byId.get(r.id)?.qualities || [])].sort((a, b) => b.height - a.height)[0];
      if (!best) {
        log(`No video file for ${r.url}`, byId.get(r.id)?.error);
        result.failed.push(`${recordingLine(r)} — ${byId.get(r.id)?.error || 'нет файла'}`);
        continue;
      }
      const filename = `${folder}/${sanitizePath(`${stamp(r).replace(':', '-')} ${r.title}`)}.mp4`;
      const onPercent = (percent) => onProgress(`Видео ${label}: ${percent}%`);
      try {
        try {
          await downloadOne(best.url, filename, onPercent);
        } catch (firstError) {
          // Сессия Толка живёт недолго: посреди очереди она могла истечь. Просим
          // Толк выпустить её заново (заодно получаем свежую ссылку) и пробуем ещё раз.
          log(`Video download retry: ${filename}`, firstError);
          onProgress(`Видео ${label}: повтор...`);
          const again = await sendToBackground({ action: 'KTALK_RECORDING_INFO', ids: [r.id] });
          const fresh = [...(again?.items?.[0]?.qualities || [])].sort(
            (a, b) => b.height - a.height
          )[0];
          if (!fresh) throw firstError;
          await downloadOne(fresh.url, filename, onPercent);
        }
        result.done++;
      } catch (e) {
        log(`Video download failed: ${filename}`, e);
        result.failed.push(`${recordingLine(r)} — ${e.message}`);
      }
    }
    return result;
  }

  // --- интерфейс ---

  function applyTheme(isDark, isOled) {
    theme = isDark ? (isOled ? THEMES.oled : THEMES.dark) : THEMES.light;
    document.querySelectorAll('.cu-videos-ui').forEach(paint);
  }

  function paint(el) {
    if (el.dataset.role === 'panel') el.style.color = theme.text;
    if (el.dataset.role === 'button') {
      el.style.color = theme.text;
      el.style.borderColor = theme.border;
      el.style.backgroundColor = 'transparent';
    }
    if (el.dataset.role === 'modal') {
      el.style.backgroundColor = theme.bg;
      el.style.color = theme.text;
      el.style.borderColor = theme.border;
    }
    el.querySelectorAll('[data-role=link]').forEach((a) => (a.style.color = theme.link));
    el.querySelectorAll('[data-role=button]').forEach(paint);
  }

  function makeButton(label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cu-videos-ui';
    button.dataset.role = 'button';
    button.style.cssText = `
      border: 1px solid; border-radius: 12px; padding: 10px 16px; font-size: 14px;
      font-weight: 500; cursor: pointer; transition: background-color 0.2s, opacity 0.2s;
      font-family: inherit; background: transparent;
    `;
    button.onmouseenter = () => (button.style.backgroundColor = theme.hover);
    button.onmouseleave = () => (button.style.backgroundColor = 'transparent');
    button.textContent = label;
    paint(button);
    return button;
  }

  /** Окно поверх страницы. Возвращает { body, close }. */
  function openModal(title) {
    const overlay = document.createElement('div');
    overlay.className = 'cu-videos-ui';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 10000; background: rgba(0, 0, 0, 0.5);
      display: flex; align-items: center; justify-content: center; padding: 16px;
    `;
    const modal = document.createElement('div');
    modal.className = 'cu-videos-ui';
    modal.dataset.role = 'modal';
    modal.style.cssText = `
      width: min(720px, 100%); max-height: 80vh; display: flex; flex-direction: column; gap: 12px;
      border: 1px solid; border-radius: 20px; padding: 20px; box-sizing: border-box;
      font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    `;
    const heading = document.createElement('h3');
    heading.style.cssText = 'margin: 0; font-size: 16px; font-weight: 600;';
    heading.textContent = title;
    const body = document.createElement('div');
    body.style.cssText = 'overflow: auto; font-size: 14px; line-height: 1.5; min-height: 40px;';
    const footer = document.createElement('div');
    footer.style.cssText = 'display: flex; gap: 10px; justify-content: flex-end;';
    modal.append(heading, body, footer);
    overlay.append(modal);

    const close = () => overlay.remove();
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) close();
    });
    document.body.append(overlay);
    paint(modal);
    return { body, footer, close };
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_e) {
      return false;
    }
  }

  async function showLinks(courseId, courseName, button) {
    const original = button.textContent;
    try {
      const recordings = await gatherRecordings(
        courseId,
        (msg) => (button.textContent = msg),
        onlyMine
      );
      const modal = openModal(`Ссылки на записи · ${courseName}`);
      if (recordings.length === 0) {
        modal.body.textContent = 'Записей пока нет.';
      } else {
        for (const r of recordings) {
          const row = document.createElement('div');
          row.style.cssText = 'margin-bottom: 10px;';
          const caption = document.createElement('div');
          caption.textContent = recordingLine(r);
          const link = document.createElement('a');
          link.dataset.role = 'link';
          link.className = 'cu-videos-ui';
          link.href = r.url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = r.url;
          link.style.cssText = 'word-break: break-all;';
          row.append(caption, link);
          modal.body.append(row);
        }
        const copy = makeButton('Скопировать всё');
        copy.onclick = async () => {
          const text = recordings.map((r) => `${recordingLine(r)}\n${r.url}`).join('\n\n');
          copy.textContent = (await copyText(text)) ? 'Скопировано' : 'Не удалось скопировать';
        };
        modal.footer.append(copy);
      }
      const closeButton = makeButton('Закрыть');
      closeButton.onclick = modal.close;
      modal.footer.append(closeButton);
      paint(modal.body.closest('[data-role=modal]'));
    } catch (e) {
      log('Video links failed', e);
      alert('Не удалось получить ссылки на записи.');
    } finally {
      button.textContent = original;
    }
  }

  // --- \u043F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0430 \u043F\u0440\u043E \u0434\u0438\u0430\u043B\u043E\u0433 \u00AB\u043A\u0443\u0434\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C\u00BB ---

  const SKIP_HINT_KEY = 'cuVideosSkipSaveHint';

  /** \u041A\u0430\u043A \u043E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0432\u043E\u043F\u0440\u043E\u0441 \u00AB\u043A\u0443\u0434\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C\u00BB \u0432 \u0440\u0430\u0437\u043D\u044B\u0445 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430\u0445. */
  const BROWSER_STEPS = [
    {
      id: 'chrome',
      name: 'Google Chrome, Brave',
      steps:
        '\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u2192 \u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u2192 \u0432\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u00AB\u0412\u0441\u0435\u0433\u0434\u0430 \u0441\u043F\u0440\u0430\u0448\u0438\u0432\u0430\u0442\u044C, \u043A\u0443\u0434\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0442\u044C \u0444\u0430\u0439\u043B\u044B\u00BB ' +
        '(chrome://settings/downloads, \u0443 Brave \u2014 brave://settings/downloads).',
    },
    {
      id: 'edge',
      name: 'Microsoft Edge',
      steps:
        '\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u2192 \u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u2192 \u0432\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u00AB\u0421\u043F\u0440\u0430\u0448\u0438\u0432\u0430\u0442\u044C, \u0447\u0442\u043E \u0434\u0435\u043B\u0430\u0442\u044C \u0441 \u043A\u0430\u0436\u0434\u043E\u0439 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u043E\u0439\u00BB ' +
        '(edge://settings/downloads).',
    },
    {
      id: 'firefox',
      name: 'Firefox',
      steps:
        '\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u2192 \u041E\u0441\u043D\u043E\u0432\u043D\u044B\u0435 \u2192 \u00AB\u0424\u0430\u0439\u043B\u044B \u0438 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F\u00BB \u2192 \u00AB\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0438\u00BB: \u0432\u044B\u0431\u0440\u0430\u0442\u044C ' +
        '\u00AB\u0421\u043E\u0445\u0440\u0430\u043D\u044F\u0442\u044C \u0444\u0430\u0439\u043B\u044B \u0432\u00BB \u0438 \u0441\u043D\u044F\u0442\u044C \u00AB\u0412\u0441\u0435\u0433\u0434\u0430 \u0432\u044B\u0434\u0430\u0432\u0430\u0442\u044C \u0437\u0430\u043F\u0440\u043E\u0441 \u043D\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435 \u0444\u0430\u0439\u043B\u043E\u0432\u00BB ' +
        '(about:preferences).',
    },
    {
      id: 'opera',
      name: 'Opera',
      steps:
        '\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u2192 \u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u2192 \u0411\u0440\u0430\u0443\u0437\u0435\u0440 \u2192 \u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u2192 \u0432\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u00AB\u0421\u043F\u0440\u0430\u0448\u0438\u0432\u0430\u0442\u044C, \u043A\u0443\u0434\u0430 ' +
        '\u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0442\u044C \u043A\u0430\u0436\u0434\u044B\u0439 \u0444\u0430\u0439\u043B\u00BB (opera://settings/downloads).',
    },
    {
      id: 'yandex',
      name: '\u042F\u043D\u0434\u0435\u043A\u0441 \u0411\u0440\u0430\u0443\u0437\u0435\u0440',
      steps:
        '\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u2192 \u0418\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442\u044B \u2192 \u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u2192 \u0432\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u00AB\u0412\u0441\u0435\u0433\u0434\u0430 \u0441\u043F\u0440\u0430\u0448\u0438\u0432\u0430\u0442\u044C, \u043A\u0443\u0434\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0442\u044C \u0444\u0430\u0439\u043B\u044B\u00BB.',
    },
  ];

  function detectBrowser() {
    const ua = navigator.userAgent;
    if (/YaBrowser/.test(ua)) return 'yandex';
    if (/OPR\//.test(ua)) return 'opera';
    if (/Edg\//.test(ua)) return 'edge';
    if (/Firefox\//.test(ua)) return 'firefox';
    if (/Safari\//.test(ua) && !/Chrom(e|ium)|CriOS|FxiOS/.test(ua)) return 'safari';
    return 'chrome';
  }

  function paragraph(text) {
    const p = document.createElement('p');
    p.style.cssText = 'margin: 0 0 10px;';
    p.textContent = text;
    return p;
  }

  /**
   * \u041E\u043A\u043D\u043E \u043F\u0435\u0440\u0435\u0434 \u0441\u043A\u0430\u0447\u0438\u0432\u0430\u043D\u0438\u0435\u043C. \u0411\u0440\u0430\u0443\u0437\u0435\u0440 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E \u0441\u043F\u0440\u0430\u0448\u0438\u0432\u0430\u0435\u0442 \u043C\u0435\u0441\u0442\u043E \u0434\u043B\u044F \u041A\u0410\u0416\u0414\u041E\u0413\u041E
   * \u0444\u0430\u0439\u043B\u0430, \u0430 \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u0435 \u043E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u044D\u0442\u043E \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u2014 \u0442\u043E\u043B\u044C\u043A\u043E \u0441\u0430\u043C \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C.
   * \u0412\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442 true, \u0435\u0441\u043B\u0438 \u043C\u043E\u0436\u043D\u043E \u043A\u0430\u0447\u0430\u0442\u044C.
   */
  function confirmSaveLocation() {
    try {
      if (localStorage.getItem(SKIP_HINT_KEY) === '1') return Promise.resolve(true);
    } catch (_e) {
      // localStorage \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u2014 \u043F\u0440\u043E\u0441\u0442\u043E \u043F\u043E\u043A\u0430\u0436\u0435\u043C \u043F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0443.
    }
    return new Promise((resolve) => {
      const modal = openModal(
        '\u041F\u0435\u0440\u0435\u0434 \u0441\u043A\u0430\u0447\u0438\u0432\u0430\u043D\u0438\u0435\u043C'
      );
      modal.body.append(
        paragraph(
          '\u0417\u0430\u043F\u0438\u0441\u0435\u0439 \u043C\u043D\u043E\u0433\u043E, \u0438 \u043A\u0430\u0436\u0434\u0430\u044F \u2014 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0439 \u0444\u0430\u0439\u043B \u043D\u0430 \u0441\u043E\u0442\u043D\u0438 \u043C\u0435\u0433\u0430\u0431\u0430\u0439\u0442. \u0411\u0440\u0430\u0443\u0437\u0435\u0440 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E ' +
            '\u0441\u043F\u0440\u0430\u0448\u0438\u0432\u0430\u0435\u0442, \u043A\u0443\u0434\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C, \u043F\u0440\u0438 \u041A\u0410\u0416\u0414\u041E\u0419 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0435 \u2014 \u043F\u0440\u0438\u0434\u0451\u0442\u0441\u044F \u043E\u0442\u0432\u0435\u0447\u0430\u0442\u044C \u043D\u0430 \u043E\u043A\u043D\u043E ' +
            '\u0441\u0442\u043E\u043B\u044C\u043A\u043E \u0440\u0430\u0437, \u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0437\u0430\u043F\u0438\u0441\u0435\u0439. \u0420\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u0435 \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u043E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u044D\u0442\u043E\u0442 \u0432\u043E\u043F\u0440\u043E\u0441 ' +
            '\u0437\u0430 \u0432\u0430\u0441, \u044D\u0442\u043E \u0434\u0435\u043B\u0430\u0435\u0442\u0441\u044F \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430. \u041E\u0434\u0438\u043D \u0440\u0430\u0437 \u043E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \u0435\u0433\u043E \u2014 ' +
            '\u0438 \u0444\u0430\u0439\u043B\u044B \u043B\u044F\u0433\u0443\u0442 \u0432 \u043F\u0430\u043F\u043A\u0443 \u0437\u0430\u0433\u0440\u0443\u0437\u043E\u043A \u0441\u0430\u043C\u0438, \u0432 \u00ABcourse_{id}_videos\u00BB.'
        )
      );

      const mine = detectBrowser();
      const current = BROWSER_STEPS.find((b) => b.id === mine);
      if (current) {
        const box = document.createElement('div');
        box.style.cssText =
          'margin: 0 0 10px; padding: 10px 12px; border: 1px solid; border-radius: 12px;';
        box.dataset.role = 'button';
        const head = document.createElement('div');
        head.style.cssText = 'font-weight: 600; margin-bottom: 4px;';
        head.textContent = `Ваш браузер — ${current.name}`;
        const text = document.createElement('div');
        text.textContent = current.steps;
        box.append(head, text);
        modal.body.append(box);
        paint(box);
      }
      const others = document.createElement('details');
      const summary = document.createElement('summary');
      summary.style.cssText = 'cursor: pointer; margin-bottom: 6px;';
      summary.textContent =
        '\u0414\u0440\u0443\u0433\u0438\u0435 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u044B';
      others.append(summary);
      for (const b of BROWSER_STEPS.filter((item) => item.id !== mine)) {
        const row = document.createElement('p');
        row.style.cssText = 'margin: 0 0 8px;';
        const strong = document.createElement('strong');
        strong.textContent = `${b.name}: `;
        row.append(strong, document.createTextNode(b.steps));
        others.append(row);
      }
      modal.body.append(others);

      const label = document.createElement('label');
      label.style.cssText =
        'display: flex; gap: 8px; align-items: center; margin-top: 10px; cursor: pointer;';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      label.append(
        checkbox,
        document.createTextNode(
          '\u042F \u0443\u0436\u0435 \u043E\u0442\u043A\u043B\u044E\u0447\u0438\u043B, \u0431\u043E\u043B\u044C\u0448\u0435 \u043D\u0435 \u043F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0442\u044C'
        )
      );
      modal.body.append(label);

      const cancel = makeButton('\u041E\u0442\u043C\u0435\u043D\u0430');
      const go = makeButton('\u0421\u043A\u0430\u0447\u0430\u0442\u044C');
      cancel.onclick = () => {
        modal.close();
        resolve(false);
      };
      go.onclick = () => {
        if (checkbox.checked) {
          try {
            localStorage.setItem(SKIP_HINT_KEY, '1');
          } catch (_e) {
            // \u041D\u0435 \u0437\u0430\u043F\u043E\u043C\u043D\u0438\u043B\u043E\u0441\u044C \u2014 \u0441\u043F\u0440\u043E\u0441\u0438\u043C \u0432 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0440\u0430\u0437.
          }
        }
        modal.close();
        resolve(true);
      };
      modal.footer.append(cancel, go);
      paint(modal.body.closest('[data-role=modal]'));
    });
  }

  function showNoDownloads() {
    const modal = openModal(
      '\u0421\u043A\u0430\u0447\u0438\u0432\u0430\u043D\u0438\u0435 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E'
    );
    modal.body.append(
      paragraph(
        '\u042D\u0442\u043E\u0442 \u0431\u0440\u0430\u0443\u0437\u0435\u0440 \u043D\u0435 \u0434\u0430\u0451\u0442 \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u044E \u0441\u043A\u0430\u0447\u0438\u0432\u0430\u0442\u044C \u0444\u0430\u0439\u043B\u044B (\u0442\u0430\u043A \u0432 Safari). \u041D\u0430\u0436\u043C\u0438\u0442\u0435 ' +
          '\u00AB\u041F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u0441\u0441\u044B\u043B\u043A\u0438 \u043D\u0430 \u0437\u0430\u043F\u0438\u0441\u0438\u00BB \u0438 \u0441\u043A\u0430\u0447\u0430\u0439\u0442\u0435 \u0437\u0430\u043F\u0438\u0441\u0438 \u0441\u043E \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B \u0422\u043E\u043B\u043A\u0430 \u0432\u0440\u0443\u0447\u043D\u0443\u044E.'
      )
    );
    const close = makeButton('\u0417\u0430\u043A\u0440\u044B\u0442\u044C');
    close.onclick = modal.close;
    modal.footer.append(close);
    paint(modal.body.closest('[data-role=modal]'));
  }

  async function downloadAll(courseId, courseName, button) {
    const original = button.textContent;
    const caps = await sendToBackground({ action: 'KTALK_CAPS' }).catch(() => null);
    if (!caps?.downloads) return showNoDownloads();
    if (!(await confirmSaveLocation())) return;

    let cancelled = false;
    button.onclick = () => {
      cancelled = true;
      button.textContent = 'Останавливаю...';
    };
    try {
      window.cuLmsTrack?.('course_export');
      const recordings = await gatherRecordings(
        courseId,
        (msg) => (button.textContent = msg),
        onlyMine
      );
      if (recordings.length === 0) {
        alert('Записей пока нет.');
        return;
      }
      const result = await downloadRecordings(
        courseId,
        recordings,
        (msg) => (button.textContent = `${msg} · нажми, чтобы остановить`),
        () => cancelled
      );
      const failed = result.failed.length
        ? `\n\nНе скачались (${result.failed.length}):\n${result.failed.join('\n')}`
        : '';
      alert(
        `Скачано записей: ${result.done} из ${recordings.length}` +
          `${cancelled ? ' (остановлено)' : ''}.\n` +
          `Папка: «Загрузки/course_${courseId}_videos».${failed}`
      );
    } catch (e) {
      log('Video download failed', e);
      alert(`Не удалось скачать записи: ${e.message}`);
    } finally {
      button.textContent = original;
      button.onclick = () => downloadAll(courseId, courseName, button);
    }
  }

  function ensurePanel() {
    const match = window.location.pathname.match(PAGE_RE);
    const existing = document.getElementById('cu-course-videos-panel');
    if (!match) {
      existing?.remove();
      return;
    }
    const host = document.querySelector(HOST_SELECTOR);
    if (!host) return;
    if (existing && host.contains(existing)) return;
    existing?.remove();

    const courseId = Number(match[1]);
    const title = document.querySelector('cu-course-overview h1.page-title');
    const courseName = title ? title.textContent.trim() : `Course ${courseId}`;

    const panel = document.createElement('div');
    panel.id = 'cu-course-videos-panel';
    panel.className = 'cu-videos-ui';
    panel.dataset.role = 'panel';
    panel.style.cssText = 'display: flex; flex-wrap: wrap; gap: 10px; margin: 16px 0;';

    const linksButton = makeButton('Получить ссылки на записи');
    linksButton.onclick = () => showLinks(courseId, courseName, linksButton);
    const downloadButton = makeButton('Скачать мои видеозаписи');
    downloadButton.onclick = () => downloadAll(courseId, courseName, downloadButton);
    const mineLabel = document.createElement('label');
    mineLabel.className = 'cu-videos-ui';
    mineLabel.style.cssText =
      'display: flex; gap: 8px; align-items: center; cursor: pointer; font-size: 14px; flex-basis: 100%;';
    const mineBox = document.createElement('input');
    mineBox.type = 'checkbox';
    mineBox.checked = onlyMine;
    mineBox.onchange = () => {
      onlyMine = mineBox.checked;
      try {
        localStorage.setItem(ONLY_MINE_KEY, onlyMine ? '1' : '0');
      } catch (_e) {
        // Не запомнилось — в следующий раз снова «только мои».
      }
    };
    mineLabel.append(mineBox, document.createTextNode('Скачивать только мои пары'));
    panel.append(mineLabel, linksButton, downloadButton);
    paint(panel);
    // Над таблицей, под фильтрами. Загрузчик таблицы Angular создаёт позже
    // формы фильтров — без него панель встала бы не на место, ждём его.
    const table = host.querySelector(':scope > tui-loader');
    if (!table) return;
    table.before(panel);
  }

  // --- запуск ---

  function readTheme() {
    try {
      if (!api.runtime?.id) return;
      api.storage.sync.get(['themeEnabled', 'oledEnabled']).then(
        (data) => applyTheme(!!data.themeEnabled, !!data.oledEnabled),
        (err) => log(err)
      );
    } catch (_e) {
      // Контекст расширения инвалидирован (обновление) — оформление не обязательно.
    }
  }

  readTheme();
  api.storage?.onChanged?.addListener((changes, area) => {
    if (area === 'sync' && ('themeEnabled' in changes || 'oledEnabled' in changes)) readTheme();
  });

  let timer = null;
  const observer = new MutationObserver((mutations) => {
    try {
      if (!api.runtime?.id) return observer.disconnect();
    } catch (_e) {
      return observer.disconnect();
    }
    // Свои же правки панели и окна не должны запускать проверку заново.
    if (mutations.every((m) => m.target.closest?.('.cu-videos-ui'))) return;
    clearTimeout(timer);
    timer = setTimeout(ensurePanel, 300);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  ensurePanel();
})();
