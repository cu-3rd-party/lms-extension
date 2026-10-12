// offline_viewer.js — минимальная LMS из офлайн-копии.
//
// Работает в двух местах одним кодом:
//   1. страница расширения offline/offline.html — данные из IndexedDB
//      (offline_store.js), файлы отдаются как blob:;
//   2. распакованный архив «Сохранить копию на диск» — данные из
//      `_offline/data.js` (window.CU_LMS_OFFLINE_DATA), файлы лежат рядом в
//      папке «Курсы». Плагин для этого не нужен: файл открывается двойным
//      кликом. JSON рядом браузер со страницы на диске прочитать не даёт, а
//      <script src> — даёт, поэтому данные в .js.
//
// Разделы — по адресу после #: #/ (курсы), #/course/ID, #/longread/ID, #/tasks,
// #/timetable.
//
// Наружу — `window.cuLmsOfflineViewer`: экспорт (offline_export.js) берёт
// отсюда модель данных и отрисовку лонгрида для html-страниц в архиве.

(function () {
  'use strict';

  if (window.cuLmsOfflineViewer) return;

  const STANDALONE = !!window.CU_LMS_OFFLINE_DATA;

  // --- ДАННЫЕ ---

  /**
   * Источник: записи, сведения о файлах и способ получить ссылку на файл.
   * `fileHref(key)` — синхронная ссылка, если она известна сразу (архив),
   * `fileUrl(key)` — ссылка на blob (расширение).
   */
  async function loadSource() {
    if (STANDALONE) {
      const data = window.CU_LMS_OFFLINE_DATA;
      const records = new Map(Object.entries(data.records || {}));
      const files = new Map(Object.entries(data.files || {}));
      return {
        records,
        files,
        savedAt: data.savedAt,
        sizeBytes: copySize(records, files),
        fileHref: (key) => (files.has(key) ? encodePath(files.get(key).path) : null),
        fileUrl: async (key) => (files.has(key) ? encodePath(files.get(key).path) : null),
      };
    }
    const store = window.cuLmsOfflineStore;
    const [allRecords, files, chosen] = await Promise.all([
      store.recordsMap(),
      store.fileIndex(),
      readChosenCourses(),
    ]);
    // Только выбранные курсы: снятые могли остаться в копии с прошлого раза.
    // Отсюда же данные идут в архив — лишнее не попадёт и туда.
    const records = onlyChosenCourses(allRecords, chosen);
    const urls = new Map();
    return {
      records,
      files,
      savedAt: null,
      // Размер — всей копии, как в попапе, а не только показанного.
      sizeBytes: copySize(allRecords, files),
      fileHref: () => null,
      fileUrl: async (key) => {
        if (urls.has(key)) return urls.get(key);
        const file = await store.getFile(key);
        if (!file) return null;
        const blob = file.blob || new Blob([file.buffer], { type: file.mime || '' });
        const url = URL.createObjectURL(blob);
        urls.set(key, url);
        return url;
      },
      fileBlob: async (key) => {
        const file = await store.getFile(key);
        if (!file) return null;
        return file.blob || new Blob([file.buffer], { type: file.mime || '' });
      },
    };
  }

  /** Курсы, выбранные во вкладке «Офлайн» (offlineCourseIds); null — не выбирали. */
  async function readChosenCourses() {
    const api = globalThis.browser || globalThis.chrome;
    try {
      const saved = await api?.storage?.sync?.get('offlineCourseIds');
      const ids = saved?.offlineCourseIds;
      return Array.isArray(ids) ? new Set(ids.map(Number)) : null;
    } catch (_error) {
      return null;
    }
  }

  /**
   * Записи только по выбранным курсам: структура, лонгриды, задания и решения,
   * расписание. Курсы ещё не выбраны — значит, все. Записи других видов
   * (ведомости, посещаемость, профиль — их качали прежние версии) выпадают.
   */
  function onlyChosenCourses(records, chosen) {
    if (!chosen)
      chosen = new Set((records.get('courses')?.data?.items || []).map((c) => Number(c.id)));
    const has = (id) => chosen.has(Number(id));
    const longreads = new Set();
    for (const [key, record] of records) {
      const [kind, id] = key.split(':');
      if (kind !== 'overview' || !has(id)) continue;
      for (const theme of record.data?.themes || []) {
        for (const longread of theme.longreads || []) longreads.add(Number(longread.id));
      }
    }
    // Курс задания — из самого задания, а если его там нет — из списка заданий.
    const taskCourse = new Map();
    const tasks = records.get('tasks')?.data;
    if (Array.isArray(tasks)) {
      for (const task of tasks) {
        taskCourse.set(Number(task.id), task.course?.id);
        if (has(task.course?.id)) longreads.add(Number(task.longread?.id));
      }
    }

    const out = new Map();
    const withData = (record, data) => ({ ...record, data });
    for (const [key, record] of records) {
      const [kind, id] = key.split(':');
      const data = record?.data;
      switch (kind) {
        case 'overview':
          if (has(id)) out.set(key, record);
          break;
        case 'longread':
          if (longreads.has(Number(id))) out.set(key, record);
          break;
        case 'task':
          if (has(data?.course?.id ?? taskCourse.get(Number(id)))) out.set(key, record);
          break;
        case 'courses':
          out.set(
            key,
            withData(record, { ...data, items: (data?.items || []).filter((c) => has(c.id)) })
          );
          break;
        case 'tasks':
          out.set(
            key,
            withData(record, Array.isArray(data) ? data.filter((t) => has(t.course?.id)) : data)
          );
          break;
        case 'timetable':
          out.set(
            key,
            withData(record, Array.isArray(data) ? data.filter((c) => has(c.courseId)) : data)
          );
          break;
        default:
        // Прочее (ведомости, посещаемость, профиль — их качали прежние версии)
        // не показываем и в архив не кладём.
      }
    }
    return out;
  }

  /** Сколько занимает копия: файлы и записи (JSON в UTF-8). */
  function copySize(records, files) {
    const encoder = new TextEncoder();
    let bytes = 0;
    for (const file of files.values()) bytes += Number(file?.size) || 0;
    for (const record of records.values()) bytes += encoder.encode(JSON.stringify(record)).length;
    return bytes;
  }

  function encodePath(path) {
    return path.split('/').map(encodeURIComponent).join('/');
  }

  /** Модель поверх записей: курсы, темы, лонгриды и задания связаны между собой. */
  function buildModel(source) {
    const rec = (key) => source.records.get(key)?.data;
    // Только курсы со скачанной структурой: снятые в попапе и ещё не
    // дошедшие до очереди показывать нечем.
    const courses = [...(rec('courses')?.items || [])]
      .filter((course) => rec(`overview:${course.id}`))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'));
    const tasks = Array.isArray(rec('tasks')) ? rec('tasks') : [];
    const taskById = new Map(tasks.map((t) => [t.id, t]));

    // Где лонгрид: курс и тема. По обзорам курсов, а для заданий — ещё и по
    // списку заданий (там есть курс, тема и лонгрид).
    const longreadPlace = new Map();
    for (const course of courses) {
      const themes = rec(`overview:${course.id}`)?.themes || [];
      for (const theme of themes) {
        (theme.longreads || []).forEach((longread, index) => {
          longreadPlace.set(longread.id, { course, theme, longread, index });
        });
      }
    }
    for (const task of tasks) {
      const id = task.longread?.id;
      if (id == null || longreadPlace.has(id)) continue;
      longreadPlace.set(id, {
        course: task.course || {},
        theme: task.theme || {},
        longread: task.longread,
        index: 0,
      });
    }

    let fetchedAt = 0;
    for (const record of source.records.values()) {
      if (record?.fetchedAt > fetchedAt) fetchedAt = record.fetchedAt;
    }

    return {
      source,
      rec,
      courses,
      tasks,
      taskById,
      longreadPlace,
      fetchedAt: source.savedAt || fetchedAt,
      themes: (courseId) =>
        [...(rec(`overview:${courseId}`)?.themes || [])].sort(
          (a, b) => (a.order ?? 0) - (b.order ?? 0)
        ),
      materials: (longreadId) => rec(`longread:${longreadId}`)?.items || null,
      taskDetails: (taskId) => rec(`task:${taskId}`),
      hasFile: (key) => source.files.has(key),
      fileInfo: (key) => source.files.get(key),
    };
  }

  // --- ФОРМАТЫ ---

  const STATE_NAMES = {
    backlog: 'Не начато',
    inProgress: 'В работе',
    submitted: 'Отправлено',
    review: 'На проверке',
    reworking: 'На доработке',
    evaluated: 'Проверено',
    failed: 'Не сдано',
  };

  const EVENT_TYPES = {
    lecture: 'Лекция',
    seminar: 'Семинар',
    practice: 'Практика',
    laboratory: 'Лабораторная',
    exam: 'Экзамен',
  };

  const WEEKDAYS = [
    ['monday', 'Понедельник'],
    ['tuesday', 'Вторник'],
    ['wednesday', 'Среда'],
    ['thursday', 'Четверг'],
    ['friday', 'Пятница'],
    ['saturday', 'Суббота'],
    ['sunday', 'Воскресенье'],
  ];

  function formatDate(value, withTime = true) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'long',
      // Год — только если не текущий: «7 октября в 17:03», но «1 января 2027 г.».
      ...(!withTime || date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
      ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    });
  }

  function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
    return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
  }

  function formatScore(value) {
    if (value == null || value === '') return '—';
    const number = Number(value);
    return Number.isFinite(number) ? String(Math.round(number * 100) / 100).replace('.', ',') : '—';
  }

  // --- DOM ---

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs || {})) {
      if (value == null || value === false) continue;
      if (name === 'class') el.className = value;
      else if (name.startsWith('on') && typeof value === 'function') {
        el.addEventListener(name.slice(2), value);
      } else el.setAttribute(name, value === true ? '' : String(value));
    }
    for (const child of children.flat(Infinity)) {
      if (child == null || child === false) continue;
      el.append(child instanceof Node ? child : String(child));
    }
    return el;
  }

  /**
   * HTML из LMS (текст лонгрида, описание задания) без скриптов и обработчиков.
   * В странице расширения их и так не пустит CSP, а в архиве, открытом с
   * диска, CSP нет.
   */
  function sanitizedHtml(html) {
    const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
    doc
      .querySelectorAll('script, iframe, object, embed, link, meta, style, form, base, frame')
      .forEach((node) => node.remove());
    for (const el of doc.body.querySelectorAll('*')) {
      for (const attr of [...el.attributes]) {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim();
        if (name.startsWith('on')) el.removeAttribute(attr.name);
        else if (
          ['href', 'src', 'xlink:href', 'action', 'formaction'].includes(name) &&
          /^(javascript|vbscript|data):/i.test(value) &&
          !(name === 'src' && /^data:image\//i.test(value))
        ) {
          el.removeAttribute(attr.name);
        }
      }
      if (el.tagName === 'A') {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    }
    const fragment = document.createDocumentFragment();
    for (const node of [...doc.body.childNodes]) fragment.append(document.importNode(node, true));
    return fragment;
  }

  function parseViewContent(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(raw);
    } catch (_error) {
      return { value: String(raw) };
    }
  }

  /** Текст: HTML из редактора LMS или простой текст. */
  function richText(value) {
    if (!value) return null;
    const text = String(value);
    if (/<[a-z][\s\S]*>/i.test(text)) return h('div', { class: 'rich' }, sanitizedHtml(text));
    return h('div', { class: 'rich rich--plain' }, text);
  }

  // --- ФАЙЛЫ ---

  function fileRefOf(raw) {
    if (!raw?.filename || !raw?.version) return null;
    return {
      key: `${raw.filename}@${raw.version}`,
      name: raw.name || String(raw.filename).split('/').pop(),
      length: Number(raw.length) || 0,
    };
  }

  function fileExtension(name) {
    const match = /\.([a-z0-9]{1,5})$/i.exec(String(name || ''));
    return match ? match[1].toLowerCase() : '';
  }

  // --- ИКОНКИ ---
  // Контурные иконки 24×24 в духе иконок LMS (cuIcon*). Свои, нарисованные
  // заново, — рисуются через DOM, без innerHTML.
  const ICONS = {
    courses: [
      'M2 5h6a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H2z',
      'M22 5h-6a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h7z',
    ],
    tasks: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
    timetable: [
      'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
      'M16 3v4M8 3v4M3 11h18',
    ],
    grades: [
      'M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
      'M14 3v5h5M9 17v-3M12 17v-6M15 17v-2',
    ],
    attendance: [
      'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
      'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
      'M16 11l2 2 4-4',
    ],
    profile: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'],
    bookOpen: [
      'M2 5h6a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H2z',
      'M22 5h-6a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h7z',
    ],
    file: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6'],
    download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
    calendar: [
      'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
      'M16 3v4M8 3v4M3 11h18',
    ],
    award: ['M12 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12z', 'M8.5 13 7 22l5-3 5 3-1.5-9'],
    chevronRight: ['M9 6l6 6-6 6'],
    chevronDown: ['M6 9l6 6 6-6'],
    arrowLeft: ['M19 12H5', 'M12 19l-7-7 7-7'],
    // Категории курсов — как значки на карточках LMS.
    catDoc: [
      'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
      'M14 2v6h6M8 13h8M8 17h5',
    ],
    catMolecule: [
      'M12 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM5 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM19 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
      'M11 8l-5 8M13 8l5 8M7 18h10',
    ],
    catMath: ['M5 7h6M8 4v6M14 7h5M5 17l4-4M9 17l-4-4M14 15h5M14 19h5'],
    catAcademic: ['M2 9l10-5 10 5-10 5z', 'M6 11v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5'],
    catMessage: ['M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z'],
    catCode: ['M8 7l-5 5 5 5', 'M16 7l5 5-5 5', 'M14 4l-4 16'],
    catBriefcase: [
      'M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
      'M9 6V4h6v2M3 12h18',
    ],
    catChip: ['M7 7h10v10H7z', 'M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4'],
  };

  function icon(name, className = '') {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', `icon ${className}`.trim());
    svg.setAttribute('aria-hidden', 'true');
    for (const d of ICONS[name] || []) {
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', d);
      svg.append(path);
    }
    return svg;
  }

  /**
   * Вложение — как в LMS: плашка с рамкой, зелёная иконка файла, имя,
   * расширение и кнопка скачивания справа. `ctx.link(ref)` даёт адрес: в
   * архиве — путь к файлу, в расширении — null, и ссылка заполняется позже
   * (`hydrate`).
   */
  function fileCard(ref, ctx, note) {
    const cached = ctx.model.hasFile(ref.key);
    const info = ctx.model.fileInfo(ref.key);
    const size = formatSize(info?.size || ref.length);
    const ext = fileExtension(ref.name);
    const base = ext ? ref.name.slice(0, -(ext.length + 1)) : ref.name;
    const nameParts = [
      h('span', { class: 'file__base' }, base),
      ext && h('span', { class: 'file__type' }, `.${ext}`),
    ];
    if (!cached) {
      return h(
        'div',
        { class: 'file file--missing' },
        icon('file', 'file__icon'),
        h(
          'span',
          { class: 'file__text' },
          h('span', { class: 'file__name' }, nameParts),
          h(
            'span',
            { class: 'file__meta' },
            [size, note || 'не скачан'].filter(Boolean).join(' · ')
          )
        )
      );
    }
    const href = ctx.link(ref);
    return h(
      'div',
      { class: 'file' },
      icon('file', 'file__icon'),
      h(
        'span',
        { class: 'file__text' },
        h(
          'a',
          {
            class: 'file__name',
            href: href || '#',
            target: '_blank',
            rel: 'noopener',
            'data-file-key': href ? null : ref.key,
          },
          nameParts
        ),
        size && h('span', { class: 'file__meta' }, size)
      ),
      h(
        'a',
        {
          class: 'file__download',
          href: href || '#',
          download: ref.name,
          title: 'Скачать',
          'aria-label': 'Скачать',
          'data-file-key': href ? null : ref.key,
        },
        icon('download')
      )
    );
  }

  function imageBlock(ref, ctx, scale) {
    if (!ctx.model.hasFile(ref.key)) return fileCard(ref, ctx);
    const href = ctx.link(ref);
    return h(
      'figure',
      { class: 'image' },
      h('img', {
        src: href || '',
        alt: ref.name,
        'data-file-key': href ? null : ref.key,
        style: scale ? `max-width: ${Math.max(10, Math.min(100, scale))}%` : null,
      })
    );
  }

  /** Подставляет blob-ссылки вместо `data-file-key` (страница расширения). */
  async function hydrate(root, source) {
    for (const el of root.querySelectorAll('[data-file-key]')) {
      const url = await source.fileUrl(el.getAttribute('data-file-key'));
      if (!url) continue;
      el.setAttribute(el.tagName === 'IMG' ? 'src' : 'href', url);
      el.removeAttribute('data-file-key');
    }
  }

  // Бейдж статуса — как cu-task-state-badge: точка и подпись на бледном фоне.
  const STATE_TONE = {
    backlog: 'neutral',
    inProgress: 'neutral',
    submitted: 'base',
    review: 'base',
    reworking: 'negative',
    evaluated: 'positive',
    failed: 'negative',
  };

  function stateBadge(state) {
    if (!state) return null;
    return h(
      'span',
      { class: `state state--${STATE_TONE[state] || 'neutral'}`, 'data-state': state },
      h('span', { class: 'state__dot' }),
      STATE_NAMES[state] || state
    );
  }

  /** Дата как в LMS: «Пт, 18 сентября в 22:00» (год — если не текущий). */
  function formatDeadline(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return '—';
    const weekday = date.toLocaleDateString('ru-RU', { weekday: 'short' });
    return `${weekday[0].toUpperCase()}${weekday.slice(1)}, ${formatDate(value)}`;
  }

  /** Короткая дата для таблицы заданий, как в LMS: «Ср, 03 дек. 17:00». */
  function formatShortDeadline(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return '—';
    const weekday = date.toLocaleDateString('ru-RU', { weekday: 'short' });
    const day = date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'short',
      ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
    });
    const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return `${weekday[0].toUpperCase()}${weekday.slice(1)}, ${day} ${time}`;
  }

  const OPEN_STATES = new Set(['backlog', 'inProgress', 'reworking']);
  const isOverdue = (state, deadline) =>
    OPEN_STATES.has(state) && deadline && new Date(deadline).getTime() < Date.now();

  // --- ЛОНГРИД ---

  /** Задание в лонгриде — карточка как cu-student-task-preview. */
  function exerciseBlock(item, ctx) {
    const content = parseViewContent(item.viewContent);
    const estimation = item.estimation || {};
    const task = item.taskId != null ? ctx.model.taskById.get(item.taskId) : null;
    const details = item.taskId != null ? ctx.model.taskDetails(item.taskId) : null;
    const state = details?.state || task?.state;
    const deadline = task?.deadline || details?.deadline || estimation.deadline;
    const score = details?.score ?? task?.score;
    const maxScore = estimation.maxScore ?? task?.exercise?.maxScore;

    const solution = details?.solution;
    const solutionFiles = (solution?.attachments || []).map(fileRefOf).filter(Boolean);

    return h(
      'section',
      { class: 'exercise' },
      stateBadge(state),
      h('h3', { class: 'exercise__name' }, item.name || 'Задание'),
      h(
        'div',
        { class: 'exercise__facts' },
        deadline &&
          h(
            'div',
            { class: `exercise__fact${isOverdue(state, deadline) ? ' danger' : ''}` },
            icon('calendar'),
            `Дедлайн: ${formatDeadline(deadline)}`
          ),
        maxScore != null &&
          h(
            'div',
            { class: 'exercise__fact' },
            icon('award'),
            `${score != null ? formatScore(score) : 0}/${formatScore(maxScore)} баллов`
          ),
        estimation.activity?.name &&
          h(
            'div',
            { class: 'exercise__fact muted' },
            `${estimation.activity.name}${estimation.activity.weight != null ? ` · вес ${Math.round(estimation.activity.weight * 100)}%` : ''}`
          )
      ),
      richText(content.description),
      item.discriminator === 'questions' &&
        h('p', { class: 'note' }, 'Тест с вопросами — пройти его можно только в LMS.'),
      (item.attachments || [])
        .map(fileRefOf)
        .filter(Boolean)
        .map((ref) => fileCard(ref, ctx)),
      (solution || score != null) &&
        h(
          'div',
          { class: 'solution' },
          h('h4', null, 'Моё решение'),
          score != null &&
            h(
              'p',
              null,
              `Оценка: ${formatScore(score)}${details?.extraScore ? ` + ${formatScore(details.extraScore)}` : ''}`
            ),
          details?.submitAt &&
            h('p', { class: 'muted' }, `Отправлено ${formatDate(details.submitAt)}`),
          solution?.solutionUrl &&
            h(
              'p',
              null,
              h(
                'a',
                { href: solution.solutionUrl, target: '_blank', rel: 'noopener noreferrer' },
                solution.solutionUrl
              )
            ),
          solutionFiles.map((ref) => fileCard(ref, ctx))
        )
    );
  }

  function materialBlock(item, ctx) {
    switch (item.discriminator) {
      case 'markdown': {
        const content = parseViewContent(item.viewContent);
        return richText(content.value);
      }
      case 'file':
      case 'video':
      case 'audio': {
        const ref = fileRefOf(item.content || item);
        return ref && fileCard(ref, ctx, item.discriminator === 'file' ? null : 'только в LMS');
      }
      case 'image': {
        const ref = fileRefOf(item.content || item);
        return ref && imageBlock(ref, ctx, item.imageScale);
      }
      case 'coding':
      case 'questions':
        return exerciseBlock(item, ctx);
      case 'videoPlatform':
        return h(
          'div',
          { class: 'file file--missing' },
          icon('file', 'file__icon'),
          h(
            'span',
            { class: 'file__text' },
            h('span', { class: 'file__name' }, item.name || 'Видео'),
            h('span', { class: 'file__meta' }, 'видео — только в LMS')
          )
        );
      default:
        return item.name ? h('p', { class: 'muted' }, item.name) : null;
    }
  }

  /** Содержимое лонгрида. Тот же код рисует html-страницы в архиве. */
  function longreadContent(longreadId, ctx) {
    const items = ctx.model.materials(longreadId);
    if (!items) return [h('p', { class: 'empty' }, 'Этот лонгрид ещё не скачан.')];
    const sorted = [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const blocks = sorted.map((item) => materialBlock(item, ctx)).filter(Boolean);
    return blocks.length ? blocks : [h('p', { class: 'empty' }, 'Здесь пусто.')];
  }

  // --- РАЗДЕЛЫ ---

  function pageTitle(text, sub) {
    return [h('h1', null, text), sub && h('p', { class: 'muted lead' }, sub)];
  }

  /** Хлебные крошки как в LMS: серые ссылки через «›», последняя — синяя. */
  function crumbs(items) {
    const parts = [];
    items.forEach(([text, href], index) => {
      if (index) parts.push(icon('chevronRight', 'crumbs__sep'));
      const last = index === items.length - 1;
      parts.push(
        href && !last
          ? h('a', { href }, text)
          : h('span', { class: last ? 'crumbs__last' : null }, text)
      );
    });
    return h('nav', { class: 'crumbs', 'aria-label': 'Навигация' }, parts);
  }

  function emptyNote(what) {
    return h(
      'p',
      { class: 'empty' },
      `${what} в копии нет. Включи этот раздел в меню плагина (вкладка «Офлайн») и открой LMS, пока она работает.`
    );
  }

  // Категория курса — значок и подпись, как на карточках LMS (category).
  const CATEGORIES = {
    withoutCategory: ['Без категории', 'catDoc'],
    stem: ['STEM', 'catMolecule'],
    mathematics: ['Математика', 'catMath'],
    general: ['Общее', 'catAcademic'],
    softSkills: ['Soft skills', 'catMessage'],
    development: ['Разработка', 'catCode'],
    business: ['Бизнес', 'catBriefcase'],
    ml: ['ML', 'catChip'],
  };

  function courseCategory(course) {
    return CATEGORIES[course.category] || [course.category || 'Без категории', 'catDoc'];
  }

  /** «Мои курсы»: белый остров с заголовком и сетка карточек на сером фоне. */
  function viewCourses(ctx) {
    const { model } = ctx;
    const island = h('section', { class: 'island' }, h('h1', null, 'Мои курсы'));
    if (!model.courses.length) return [island, emptyNote('Курсов')];
    return [
      island,
      h(
        'div',
        { class: 'cards' },
        model.courses.map((course) => {
          const themes = model.themes(course.id);
          let total = 0;
          let cached = 0;
          for (const theme of themes) {
            for (const longread of theme.longreads || []) {
              total += 1;
              if (model.materials(longread.id)) cached += 1;
            }
          }
          const [categoryName, categoryIcon] = courseCategory(course);
          return h(
            'a',
            { class: 'card', href: `#/course/${course.id}` },
            h(
              'span',
              { class: 'card__header' },
              h('span', { class: 'card__icon' }, icon(categoryIcon)),
              h('span', { class: 'card__category' }, categoryName)
            ),
            h('span', { class: 'card__title' }, course.name),
            h(
              'span',
              { class: 'card__meta' },
              themes.length ? `скачано ${cached} из ${total} лонгридов` : 'структура не скачана'
            )
          );
        })
      ),
    ];
  }

  /** Курс: темы аккордеоном, как в LMS; внутри — лонгриды строками. */
  function viewCourse(ctx, courseId) {
    const { model } = ctx;
    const course = model.courses.find((c) => String(c.id) === courseId);
    const themes = model.themes(courseId);
    const title = course?.name || model.rec(`overview:${courseId}`)?.name || `Курс ${courseId}`;
    const head = [crumbs([['Мои курсы', '#/'], [title]]), h('h1', { class: 'page-title' }, title)];
    if (!themes.length) return [...head, emptyNote('Структуры курса')];

    return [
      ...head,
      h(
        'div',
        { class: 'themes' },
        themes.map((theme) =>
          h(
            'details',
            { class: 'theme' },
            h(
              'summary',
              null,
              h('span', { class: 'theme__icon' }, icon('bookOpen')),
              h('h3', { class: 'theme__name' }, theme.name),
              icon('chevronDown', 'theme__chevron')
            ),
            h(
              'div',
              { class: 'longreads' },
              (theme.longreads || []).map((longread) => {
                const cached = !!model.materials(longread.id);
                const exercises = longread.exercises || [];
                return h(
                  'a',
                  {
                    class: `longread-link${cached ? '' : ' is-missing'}`,
                    href: `#/longread/${longread.id}`,
                  },
                  h('span', { class: 'longread-link__name' }, longread.name),
                  exercises.length > 0 &&
                    h(
                      'span',
                      { class: 'longread-link__meta' },
                      exercises.map((e) => e.name).join(', ')
                    ),
                  !cached && h('span', { class: 'longread-link__meta' }, 'не скачан')
                );
              })
            )
          )
        )
      ),
    ];
  }

  function viewLongread(ctx, longreadId) {
    const place = ctx.model.longreadPlace.get(Number(longreadId)) || {};
    const title = place.longread?.name || `Лонгрид ${longreadId}`;
    const courseHref = place.course?.id != null ? `#/course/${place.course.id}` : '#/';
    return [
      crumbs(
        [
          ['Мои курсы', '#/'],
          place.course?.name && [place.course.name, courseHref],
          place.theme?.name && [place.theme.name],
          [title],
        ].filter(Boolean)
      ),
      h('a', { class: 'back-link', href: courseHref }, icon('arrowLeft'), 'К списку всех тем'),
      h('h1', { class: 'longread-title' }, title),
      h('article', { class: 'longread' }, longreadContent(Number(longreadId), ctx)),
    ];
  }

  const TASK_FILTERS = [
    ['active', 'Активные', ['backlog', 'inProgress', 'reworking']],
    ['review', 'На проверке', ['submitted', 'review']],
    ['done', 'Проверенные', ['evaluated', 'failed']],
    ['all', 'Все', null],
  ];

  /** Задания: вкладки-пилюли и таблица без шапки, как «Мои задания» в LMS. */
  function viewTasks(ctx, filter = 'active') {
    const { model } = ctx;
    if (!model.source.records.has('tasks'))
      return [...pageTitle('Мои задания'), emptyNote('Заданий')];
    const [, , states] = TASK_FILTERS.find(([id]) => id === filter) || TASK_FILTERS[0];
    const list = model.tasks
      .filter((task) => !states || states.includes(task.state))
      .sort((a, b) => {
        const da = new Date(a.deadline || 0).getTime();
        const db = new Date(b.deadline || 0).getTime();
        return filter === 'active' ? da - db : db - da;
      });

    return [
      ...pageTitle('Мои задания', `За последний месяц и впереди: ${model.tasks.length}`),
      h(
        'div',
        { class: 'tabs' },
        TASK_FILTERS.map(([id, name]) =>
          h('a', { class: `tab${id === filter ? ' is-active' : ''}`, href: `#/tasks/${id}` }, name)
        )
      ),
      list.length
        ? h(
            'table',
            { class: 'table task-table' },
            h(
              'tbody',
              null,
              list.map((task) => {
                const name = task.exercise?.name || 'Задание';
                return h(
                  'tr',
                  null,
                  h(
                    'td',
                    { class: 'task-table__info' },
                    h(
                      'div',
                      { class: 'task-table__name' },
                      task.longread?.id != null
                        ? h('a', { href: `#/longread/${task.longread.id}` }, name)
                        : name
                    ),
                    h('div', { class: 'task-table__course' }, task.course?.name || '')
                  ),
                  h('td', { class: 'task-table__state' }, stateBadge(task.state)),
                  h(
                    'td',
                    { class: 'task-table__score' },
                    task.score != null
                      ? `${formatScore(task.score)}/${formatScore(task.exercise?.maxScore)}`
                      : ''
                  ),
                  h(
                    'td',
                    {
                      class: `task-table__deadline${isOverdue(task.state, task.deadline) ? ' danger' : ''}`,
                    },
                    formatShortDeadline(task.deadline)
                  )
                );
              })
            )
          )
        : h('p', { class: 'empty' }, 'Таких заданий нет.'),
    ];
  }

  // Аудитория: раньше строка, с октября 2026 — объект { title, building }.
  function placeOf(location) {
    if (!location) return '';
    if (typeof location === 'string') return location;
    return [location.title, location.building].filter(Boolean).join(' · ');
  }

  // Преподаватели: раньше один `host`, теперь массив `hosts`.
  function hostsOf(event) {
    const list = Array.isArray(event.hosts) ? event.hosts : event.host ? [event.host] : [];
    return list
      .map((host) => String(host?.name || '').trim())
      .filter(Boolean)
      .join(', ');
  }

  // Трансляция пары — как в плагине «Мои пары» (timetable/timetable_join.js):
  // комната в Контур.Толке — id серии занятий из расписания без дефисов.
  // Офлайн она, конечно, не откроется, но ссылку можно скопировать с телефона.
  const KTALK_ORIGIN = 'https://centraluniversity.ktalk.ru/';

  function joinUrl(calendarEventId) {
    return KTALK_ORIGIN + String(calendarEventId).replace(/-/g, '');
  }

  function viewTimetable(ctx) {
    const data = ctx.model.rec('timetable');
    if (!Array.isArray(data)) return [...pageTitle('Мои пары'), emptyNote('Расписания')];
    const byDay = new Map(WEEKDAYS.map(([id]) => [id, []]));
    for (const course of data) {
      for (const row of course.eventRows || []) {
        const event = row.calendarEvent || {};
        const schedule = event.schedule || {};
        byDay.get(schedule.dayOfWeek)?.push({ course, row, event, schedule });
      }
    }
    return [
      ...pageTitle('Мои пары', 'Недельное расписание пар из LMS.'),
      WEEKDAYS.map(([id, name]) => {
        const items = byDay
          .get(id)
          .sort((a, b) => String(a.schedule.startTime).localeCompare(String(b.schedule.startTime)));
        if (!items.length) return null;
        return h(
          'section',
          { class: 'day' },
          h('h2', null, name),
          items.map(({ course, row, event, schedule }) =>
            h(
              'div',
              { class: 'lesson' },
              h(
                'div',
                { class: 'lesson__time' },
                `${schedule.startTime || ''}–${schedule.endTime || ''}`
              ),
              h(
                'div',
                null,
                h('div', { class: 'lesson__title' }, course.courseName || ''),
                h(
                  'div',
                  { class: 'muted small' },
                  [
                    EVENT_TYPES[row.eventType || event.eventType] || row.eventType || '',
                    placeOf(event.location),
                    hostsOf(event),
                    schedule.interval === 2 ? 'раз в две недели' : null,
                    schedule.startDate &&
                      `${formatDate(schedule.startDate, false)} – ${formatDate(schedule.endDate, false)}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                )
              ),
              event.calendarEventId &&
                h(
                  'a',
                  {
                    class: 'lesson__join',
                    href: joinUrl(event.calendarEventId),
                    target: '_blank',
                    rel: 'noopener noreferrer',
                  },
                  'Трансляция'
                )
            )
          )
        );
      }),
    ];
  }

  // --- ОБОЛОЧКА ---

  const NAV = [
    // Названия и порядок — как в меню LMS.
    ['#/', 'Курсы', 'courses'],
    ['#/tasks', 'Мои задания', 'tasks'],
    ['#/timetable', 'Мои пары', 'timetable'],
  ];

  function route(ctx) {
    const parts = (location.hash.replace(/^#\/?/, '') || '').split('/');
    switch (parts[0]) {
      case 'course':
        return viewCourse(ctx, parts[1]);
      case 'longread':
        return viewLongread(ctx, parts[1]);
      case 'tasks':
        return viewTasks(ctx, parts[1]);
      case 'timetable':
        return viewTimetable(ctx);
      default:
        return viewCourses(ctx);
    }
  }

  function renderShell(model) {
    const app = document.getElementById('app');
    // Как в LMS: шапка во всю ширину, меню слева, содержимое — колонкой по центру.
    app.replaceChildren(
      h(
        'header',
        { class: 'header' },
        h(
          'a',
          { class: 'brand', href: '#/' },
          h(
            'span',
            null,
            h('div', { class: 'brand__name' }, 'LMS офлайн'),
            h(
              'div',
              { class: 'brand__sub' },
              model.fetchedAt
                ? `Данные на ${formatDate(model.fetchedAt)} · ${formatSize(model.source.sizeBytes) || '0 КБ'}`
                : 'Копия пуста'
            )
          )
        ),
        h('div', { class: 'header__actions', id: 'header-actions' })
      ),
      h(
        'aside',
        { class: 'nav' },
        h(
          'nav',
          null,
          NAV.map(([href, name, iconName]) =>
            h('a', { href, 'data-nav': href }, icon(iconName), h('span', null, name))
          )
        )
      ),
      h('main', { id: 'view', class: 'view' })
    );
  }

  async function renderView(ctx) {
    const view = document.getElementById('view');
    const current = '#/' + (location.hash.replace(/^#\/?/, '').split('/')[0] || '');
    for (const link of document.querySelectorAll('[data-nav]')) {
      const target = link.getAttribute('data-nav');
      const active =
        target === current ||
        (target === '#/' && ['#/', '#/course', '#/longread'].includes(current));
      link.classList.toggle('is-active', active);
    }
    // В LMS серый фон только у «Мои курсы» — остальные страницы белые.
    view.classList.toggle('view--grey', current === '#/');
    view.replaceChildren(h('div', { class: 'page' }, [route(ctx)].flat(Infinity).filter(Boolean)));
    view.scrollTop = 0;
    window.scrollTo(0, 0);
    if (!STANDALONE) await hydrate(view, ctx.model.source);
  }

  async function start() {
    const source = await loadSource();
    const model = buildModel(source);
    const ctx = { model, link: (ref) => source.fileHref(ref.key) };
    renderShell(model);
    window.addEventListener('hashchange', () => void renderView(ctx));
    await renderView(ctx);
    document.dispatchEvent(new CustomEvent('culms-offline-ready', { detail: { model } }));
  }

  window.cuLmsOfflineViewer = {
    STANDALONE,
    loadSource,
    buildModel,
    onlyChosenCourses,
    longreadContent,
    fileRefOf,
    formatDate,
    h,
  };

  function boot() {
    start().catch((error) => {
      console.error('[Offline] не открылась копия', error);
      document
        .getElementById('app')
        ?.replaceChildren(
          h('p', { class: 'empty' }, `Копия не открылась: ${error?.message || error}`)
        );
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
