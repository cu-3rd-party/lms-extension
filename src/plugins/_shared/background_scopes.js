// background_scopes.js — для каких страниц задана своя картинка фона.
//
// Картинку фона можно поставить на разную ширину охвата — «область»:
//
//   page    — ровно эта страница (конкретный курс, конкретный лонгрид);
//   course  — все страницы одного курса: обзор, темы, лонгриды;
//   section — раздел LMS целиком: задачи, расписание, ведомости…;
//   all     — все страницы (это старая общая картинка `customBackground`).
//
// На странице побеждает самая узкая область, у которой картинка есть: своя
// у страницы → у курса → у раздела → общая. Так можно поставить одну картинку
// на все курсы и перебить её у пары любимых.
//
// Хранится каждая область отдельным ключом `storage.local`:
// `customBackground.page:/learn/…`, `customBackground.course:1234`,
// `customBackground.section:tasks`. Отдельными — чтобы страница читала только
// свои 3–4 ключа, а не все картинки разом, и чтобы правка одной не гоняла
// мегабайты остальных через `storage.onChanged` во все вкладки.
//
// Список нужен троим: `custom_background.js` решает, что показать,
// `background_editor.js` рисует выбор области, а реестр настроек знает
// префикс ключей. Поэтому он лежит отдельно.

if (typeof window.cuLmsBackgroundScopes === 'undefined') {
  ('use strict');

  const COMMON_KEY = 'customBackground';
  const KEY_PREFIX = 'customBackground.';

  // Разделы определяются по адресу, а не по разметке: при переходе внутри SPA
  // адрес меняется сразу, а разметка доезжает позже. Порядок важен — лонгрид
  // лежит внутри адреса курса, архив задач внутри задач, поэтому узкий раздел
  // проверяется раньше широкого.
  const SECTIONS = [
    {
      id: 'courses',
      title: 'Список курсов',
      test: (path) =>
        /^\/learn\/courses\/view\/(actual|archived)(\/(?!\d+(\/|$))[^/]+)?$/.test(path),
    },
    { id: 'longreads', title: 'Материалы курсов', test: (path) => /\/longreads\//.test(path) },
    {
      id: 'course',
      title: 'Страницы курсов',
      test: (path) => /^\/learn\/courses\/view\/(actual|archived)\/\d+(\/|$)/.test(path),
    },
    {
      id: 'tasksArchive',
      title: 'Архив задач',
      test: (path) => /^\/learn\/tasks\/archived-student-tasks/.test(path),
    },
    { id: 'tasks', title: 'Задачи', test: (path) => /^\/learn\/tasks(\/|$)/.test(path) },
    {
      id: 'timetable',
      title: 'Расписание',
      test: (path) => /^\/learn\/timetable(\/|$)/.test(path),
    },
    { id: 'reports', title: 'Ведомости', test: (path) => /^\/learn\/reports(\/|$)/.test(path) },
  ];

  /** «/learn/tasks/» и «/learn//tasks» — та же страница, что «/learn/tasks». */
  function normalizePath(pathname) {
    const path = String(pathname || '/').replace(/\/{2,}/g, '/');
    return path.length > 1 ? path.replace(/\/+$/, '') : path;
  }

  function sectionFor(pathname) {
    const path = normalizePath(pathname);
    return SECTIONS.find((section) => section.test(path)) || null;
  }

  /**
   * id курса из адреса. Действующий и архивный курс — один и тот же курс,
   * поэтому `actual` и `archived` в ключ не входят.
   */
  function courseIdFor(pathname) {
    const match = /^\/learn\/courses\/view\/(?:actual|archived)\/(\d+)(\/|$)/.exec(
      normalizePath(pathname)
    );
    return match ? match[1] : null;
  }

  /**
   * Области текущей страницы от самой узкой к самой широкой — в этом же
   * порядке ищется картинка.
   */
  function scopesFor(pathname) {
    const path = normalizePath(pathname);
    const scopes = [{ kind: 'page', key: KEY_PREFIX + 'page:' + path, title: 'Эта страница' }];

    const courseId = courseIdFor(path);
    if (courseId) {
      scopes.push({
        kind: 'course',
        key: KEY_PREFIX + 'course:' + courseId,
        title: 'Весь этот курс',
      });
    }

    const section = sectionFor(path);
    if (section) {
      scopes.push({
        kind: 'section',
        key: KEY_PREFIX + 'section:' + section.id,
        title: 'Раздел «' + section.title + '»',
      });
    }

    scopes.push({ kind: 'all', key: COMMON_KEY, title: 'Все страницы' });
    return scopes;
  }

  /** Ключ хранилища, в котором лежит картинка какой-то области. */
  const isScopeKey = (key) => key === COMMON_KEY || String(key).startsWith(KEY_PREFIX);

  window.cuLmsBackgroundScopes = {
    COMMON_KEY,
    KEY_PREFIX,
    SECTIONS: SECTIONS.map(({ id, title }) => ({ id, title })),
    normalizePath,
    sectionFor: (pathname) => (sectionFor(pathname) || {}).id || null,
    courseIdFor,
    scopesFor,
    isScopeKey,
  };
}
