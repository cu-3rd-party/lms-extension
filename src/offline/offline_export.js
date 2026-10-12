// offline_export.js — «Сохранить копию на диск»: вся офлайн-копия одним zip.
//
// Один zip, а не папка, потому что так работает везде: выбрать папку и писать
// в неё умеет только Chromium, API загрузок нет в Safari, а скачать один файл
// по ссылке со страницы расширения можно в любом браузере. Куда его сохранить,
// спрашивает сам браузер (или кладёт в «Загрузки»).
//
// Внутри архива:
//   Открыть LMS офлайн.html   — та же offline LMS, открывается двойным кликом;
//   _offline/                  — её код и данные (data.js: решения, оценки за них и
//                                всё остальное — личное, не для пересылки);
//   Курсы/<курс>/<NN. тема>/<NN. лонгрид>/
//       <лонгрид>.html         — текст лонгрида и заданий, ссылки на файлы рядом;
//       файлы лонгрида и условий;
//       Моё решение/           — свои отправленные файлы.
// Папку курса можно переслать как есть: ей ничего, кроме себя, не нужно.

/* global fflate */
(function () {
  'use strict';

  const viewer = window.cuLmsOfflineViewer;
  if (!viewer || viewer.STANDALONE) return;

  const ROOT_PAGE = 'Открыть LMS офлайн.html';
  const NAME_LIMIT = 60;

  /** Имя, которое примут Windows, macOS и Linux. */
  function safeName(name, fallback = 'без названия') {
    const cleaned = String(name || '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/, '');
    const short = cleaned.length > NAME_LIMIT ? cleaned.slice(0, NAME_LIMIT).trim() : cleaned;
    return short || fallback;
  }

  /** Имя файла с сохранённым расширением, даже если обрезали. */
  function safeFileName(name) {
    const text = String(name || 'file');
    const dot = text.lastIndexOf('.');
    if (dot <= 0 || text.length - dot > 8) return safeName(text, 'file');
    return safeName(text.slice(0, dot), 'file') + text.slice(dot).replace(/[<>:"/\\|?*]/g, '_');
  }

  const pad = (n) => String(n).padStart(2, '0');

  /** Путь, которого ещё нет в архиве: «a.pdf», «a (2).pdf»… */
  function uniquePath(path, taken) {
    if (!taken.has(path.toLowerCase())) {
      taken.add(path.toLowerCase());
      return path;
    }
    const dot = path.lastIndexOf('.');
    const slash = path.lastIndexOf('/');
    const hasExt = dot > slash;
    for (let i = 2; ; i++) {
      const candidate = hasExt
        ? `${path.slice(0, dot)} (${i})${path.slice(dot)}`
        : `${path} (${i})`;
      if (!taken.has(candidate.toLowerCase())) {
        taken.add(candidate.toLowerCase());
        return candidate;
      }
    }
  }

  function relative(fromDir, toPath) {
    const from = fromDir ? fromDir.split('/') : [];
    const to = toPath.split('/');
    let common = 0;
    while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++;
    return [...Array(from.length - common).fill('..'), ...to.slice(common)]
      .map(encodeURIComponent)
      .join('/');
  }

  /**
   * Раскладка: где в архиве окажется каждый файл и каждая страница лонгрида.
   * Файл, который встречается в нескольких лонгридах, кладётся один раз — в
   * первый, остальные ссылаются туда.
   */
  function layout(model) {
    const taken = new Set([ROOT_PAGE.toLowerCase()]);
    const filePaths = new Map();
    const pages = [];

    const place = (key, dir, name) => {
      if (!model.hasFile(key) || filePaths.has(key)) return;
      filePaths.set(key, uniquePath(`${dir}/${safeFileName(name)}`, taken));
    };

    const longreadDirs = new Map();
    for (const course of model.courses) {
      const courseDir = `Курсы/${safeName(course.name)}`;
      model.themes(course.id).forEach((theme, themeIndex) => {
        const themeDir = `${courseDir}/${pad(themeIndex + 1)}. ${safeName(theme.name)}`;
        (theme.longreads || []).forEach((longread, index) => {
          const items = model.materials(longread.id);
          if (!items) return;
          const dir = uniquePath(
            `${themeDir}/${pad(index + 1)}. ${safeName(longread.name)}`,
            taken
          );
          longreadDirs.set(longread.id, dir);
          pages.push({ longreadId: longread.id, dir, name: safeName(longread.name) });
        });
      });
    }

    // Файлы — по порядку лонгридов, решения — в «Моё решение» рядом с заданием.
    for (const [longreadId, dir] of longreadDirs) {
      for (const item of model.materials(longreadId) || []) {
        const own = viewer.fileRefOf(item.content || item);
        if (own) place(own.key, dir, own.name);
        for (const attachment of item.attachments || []) {
          const ref = viewer.fileRefOf(attachment);
          if (ref) place(ref.key, dir, ref.name);
        }
        const details = item.taskId != null ? model.taskDetails(item.taskId) : null;
        for (const attachment of details?.solution?.attachments || []) {
          const ref = viewer.fileRefOf(attachment);
          if (ref) place(ref.key, `${dir}/Моё решение`, ref.name);
        }
      }
    }

    // Решения заданий, чей лонгрид не скачан (например, выключены лонгриды).
    for (const task of model.tasks) {
      const details = model.taskDetails(task.id);
      if (!details?.solution?.attachments?.length) continue;
      const dir =
        longreadDirs.get(task.longread?.id) ||
        `Курсы/${safeName(task.course?.name)}/Задания/${safeName(task.exercise?.name)}`;
      for (const attachment of details.solution.attachments) {
        const ref = viewer.fileRefOf(attachment);
        if (ref) place(ref.key, `${dir}/Моё решение`, ref.name);
      }
    }

    return { filePaths, pages };
  }

  function pageHtml(title, body, css) {
    return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${css}</style>
</head>
<body class="static">
<main class="view"><div class="page">
${body}
</div></main>
</body>
</html>
`;
  }

  function escapeHtml(text) {
    return String(text).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  }

  /** Страница одного лонгрида: тот же рендер, что в offline LMS. */
  function longreadPage(model, page, filePaths, css) {
    const ctx = {
      model,
      link: (ref) => (filePaths.has(ref.key) ? relative(page.dir, filePaths.get(ref.key)) : null),
    };
    const wrapper = document.createElement('div');
    const place = model.longreadPlace.get(page.longreadId) || {};
    wrapper.append(
      viewer.h(
        'p',
        { class: 'crumbs' },
        [place.course?.name, place.theme?.name].filter(Boolean).join(' / ')
      ),
      viewer.h('h1', null, place.longread?.name || page.name),
      viewer.h('article', { class: 'longread' }, viewer.longreadContent(page.longreadId, ctx))
    );
    // Ссылки на нескачанные файлы в статичной странице не нужны.
    wrapper
      .querySelectorAll('[data-file-key]')
      .forEach((el) => el.removeAttribute('data-file-key'));
    // Стили встроены, чтобы страница жила и в пересланной папке курса; шрифт
    // берётся из _offline/fonts по относительному пути (нет его — системный).
    const fontsDir = relative(page.dir, '_offline/fonts/x').replace(/x$/, '');
    const pageCss = css.split("url('fonts/").join(`url('${fontsDir}`);
    return pageHtml(place.longread?.name || page.name, wrapper.innerHTML, pageCss);
  }

  function rootPage() {
    return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LMS офлайн</title>
<link rel="stylesheet" href="_offline/offline.css">
</head>
<body>
<div id="app"><p class="empty">Загрузка… Если страница не открывается, проверь, что папка _offline лежит рядом.</p></div>
<script src="_offline/data.js"></script>
<script src="_offline/offline_viewer.js"></script>
</body>
</html>
`;
  }

  const FONT_FILES = ['inter-cyrillic.woff2', 'inter-latin.woff2', 'OFL.txt'];

  const README = `Офлайн-копия LMS ЦУ — сделана плагином CU LMS Enhancer.

«Открыть LMS офлайн.html» — открой двойным кликом: курсы, лонгриды, задания,
расписание. Интернет не нужен.

Курсы/ — материалы по курсам обычными файлами. Папку курса можно переслать
как есть. Если в ней есть «Моё решение» — это твои отправленные работы,
перед пересылкой их стоит удалить.

_offline/data.js — данные для страницы, в том числе личные: решения и оценки
за них. Не пересылай эту папку, если не хочешь ими делиться.
`;

  async function buildZip(model, onProgress) {
    const source = model.source;
    const { filePaths, pages } = layout(model);
    const encoder = new TextEncoder();
    const [css, viewerJs] = await Promise.all([
      fetch('offline.css').then((r) => r.text()),
      fetch('offline_viewer.js').then((r) => r.text()),
    ]);

    const records = {};
    for (const [key, record] of source.records) {
      if (record?.data !== undefined)
        records[key] = { data: record.data, fetchedAt: record.fetchedAt };
    }
    const files = {};
    for (const [key, path] of filePaths) {
      const info = source.files.get(key);
      files[key] = { path, name: info?.name, size: info?.size };
    }
    const dataJs =
      'window.CU_LMS_OFFLINE_DATA = ' +
      JSON.stringify({ savedAt: Date.now(), records, files }) +
      ';\n';

    const chunks = [];
    const zip = new fflate.Zip();
    const finished = new Promise((resolve, reject) => {
      zip.ondata = (error, chunk, final) => {
        if (error) return reject(error);
        chunks.push(chunk);
        if (final) resolve();
      };
    });

    const addText = (path, text) => {
      const entry = new fflate.ZipDeflate(path, { level: 6 });
      zip.add(entry);
      entry.push(encoder.encode(text), true);
    };
    // PDF, картинки и архивы и так сжаты — кладём без сжатия, так в разы быстрее.
    const addBinary = (path, bytes) => {
      const entry = new fflate.ZipPassThrough(path);
      zip.add(entry);
      entry.push(bytes, true);
    };

    addText(ROOT_PAGE, rootPage());
    addText('README.txt', README);
    addText('_offline/offline.css', css);
    addText('_offline/offline_viewer.js', viewerJs);
    addText('_offline/data.js', dataJs);
    // Шрифт LMS (Inter, OFL) — чтобы копия и на чужом компьютере выглядела как LMS.
    for (const name of FONT_FILES) {
      const response = await fetch(`fonts/${name}`);
      if (!response.ok) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (name.endsWith('.txt')) addText(`_offline/fonts/${name}`, new TextDecoder().decode(bytes));
      else addBinary(`_offline/fonts/${name}`, bytes);
    }
    for (const page of pages) {
      addText(`${page.dir}/${page.name}.html`, longreadPage(model, page, filePaths, css));
    }

    let done = 0;
    for (const [key, path] of filePaths) {
      onProgress(`Файлы: ${done} из ${filePaths.size}`);
      const blob = await source.fileBlob(key);
      if (blob) addBinary(path, new Uint8Array(await blob.arrayBuffer()));
      done += 1;
    }
    onProgress('Собираю архив…');
    zip.end();
    await finished;
    return new Blob(chunks, { type: 'application/zip' });
  }

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    // Браузер мог ещё не начать читать blob — отпускаем с запасом.
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
  }

  function zipName() {
    const date = new Date();
    return `LMS офлайн ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.zip`;
  }

  document.addEventListener('culms-offline-ready', (event) => {
    const { model } = event.detail;
    const slot = document.getElementById('header-actions');
    if (!slot) return;
    const status = viewer.h('span', { class: 'muted small', id: 'export-status' });
    const button = viewer.h(
      'button',
      {
        class: 'button',
        type: 'button',
        id: 'export-zip',
        title: 'Zip с этой страницей и всеми файлами. Распакуй и открой «Открыть LMS офлайн.html».',
      },
      'Сохранить копию на диск'
    );
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const blob = await buildZip(model, (text) => (status.textContent = text));
        saveBlob(blob, zipName());
        status.textContent = `Готово: ${(blob.size / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
      } catch (error) {
        console.error('[Offline] архив не собрался', error);
        status.textContent = `Не получилось: ${error?.message || error}`;
      } finally {
        button.disabled = false;
      }
    });
    slot.replaceChildren(status, button);
  });

  window.cuLmsOfflineExport = { buildZip, layout, safeName, safeFileName };
})();
