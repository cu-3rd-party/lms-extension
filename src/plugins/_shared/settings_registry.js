// settings_registry.js — единый список настроек расширения и перенос их в JSON.
//
// Зачем реестр. Настройки раскиданы по двум хранилищам и десятку плагинов:
// тумблеры и выпадающие списки лежат в `storage.sync`, картинки и названия —
// в `storage.local`, а токены интеграций — там же рядом. Пока единственным
// «списком всего» был попап, выгрузить настройки в файл было нельзя: непонятно,
// что выгружать, а что трогать нельзя.
//
// Отсюда три задачи реестра:
//   1. знать все ключи, их область, тип и допустимые значения;
//   2. решать, что попадает в файл, а что нет — токены и кеши не попадают
//      никогда, иначе поделиться настройками значило бы отдать доступ к аккаунту;
//   3. проверять чужой файл при загрузке: формат публичный, и в нём приедет
//      что угодно — от старой версии до намеренно кривых значений.
//
// Наружу отдаётся `window.cuLmsSettings`. Файл подключает попап тегом
// `<script>`; контент-скриптам он не нужен.

// Polyfill to handle browser namespace differences (Chrome uses 'chrome', Firefox uses 'browser')
if (typeof browser === 'undefined') {
  var browser = chrome;
}

if (typeof window.cuLmsSettings === 'undefined') {
  ('use strict');

  const FORMAT = 'cu-lms-extension/profile';
  // Версия формата, а не расширения. Растёт, когда меняется структура файла.
  const FORMAT_VERSION = 1;

  // --- ГРУППЫ ---
  //
  // `private` в файл не попадает никогда и существует только чтобы ключ был
  // описан: незнакомый ключ в хранилище — повод проверить, не забыли ли его.
  const GROUPS = {
    appearance: 'Оформление',
    theme: 'Своя тема',
    features: 'Функции',
    integrations: 'Интеграции',
    content: 'Свои картинки и названия',
    personal: 'Личные данные',
    private: 'Не выгружается',
  };

  // `fallback` — значение, когда ключа в хранилище ещё нет. Оно должно
  // совпадать с тем, что подставляет сам плагин: попап рисовал `!!undefined`,
  // то есть «выключено», а friends_tab.js считал `!== false`, то есть
  // «включено» — галочка врала на свежей установке.
  const bool = (key, group, fallback = false) => ({
    key,
    area: 'sync',
    type: 'boolean',
    group,
    fallback,
  });
  const choice = (key, group, values, fallback) => ({
    key,
    area: 'sync',
    type: 'enum',
    group,
    values,
    fallback,
  });
  const range = (key, group, min, max, fallback) => ({
    key,
    area: 'sync',
    type: 'number',
    group,
    min,
    max,
    fallback,
  });
  const data = (key, group, type) => ({ key, area: 'local', type, group });
  // `pattern` — для строк, у которых важен формат (например дата «ГГГГ-ММ-ДД»):
  // без него в файле профиля могла бы приехать любая строка, а плагин ждёт дату.
  const text = (key, group, pattern, fallback = '') => ({
    key,
    area: 'sync',
    type: 'string',
    group,
    pattern,
    fallback,
  });

  // Семейство ключей с общим началом: ключ `…*` описывает их все разом.
  const prefixed = (prefix, group, type) => ({
    key: prefix + '*',
    prefix,
    area: 'local',
    type,
    group,
  });

  const REGISTRY = [
    // --- оформление ---
    bool('themeEnabled', 'appearance'),
    bool('oledEnabled', 'appearance'),
    bool('darkPdfEnabled', 'appearance'),
    bool('snowEnabled', 'appearance'),
    bool('emojiHeartsEnabled', 'appearance'),
    bool('oldCoursesDesignToggle', 'appearance'),
    bool('customLogoToggle', 'appearance'),
    bool('customBackgroundToggle', 'appearance'),
    choice('stickerObjectFit', 'appearance', ['cover', 'contain', 'fill', 'scale-down'], 'cover'),
    range('stickerScale', 'appearance', 25, 400, 100),
    choice('logoObjectFit', 'appearance', ['contain', 'cover', 'fill', 'none'], 'contain'),
    range('logoScale', 'appearance', 25, 400, 100),
    choice('backgroundFit', 'appearance', ['cover', 'contain', 'fill', 'tile', 'none'], 'cover'),
    range('backgroundVeil', 'appearance', 0, 95, 60),

    // --- своя тема ---
    // Отдельная группа, а не часть оформления: темой делятся сама по себе,
    // без обложек курсов и прочих настроек (вид профиля `theme`).
    bool('customThemeToggle', 'theme'),
    data('customThemeVars', 'theme', 'object'),
    data('customThemeCss', 'theme', 'string'),
    data('customThemeName', 'theme', 'string'),

    // --- функции ---
    bool('customCourseNamesToggle', 'features'),
    bool('futureExamsViewToggle', 'features'),
    choice('futureExamsDisplayFormat', 'features', ['date', 'week'], 'date'),
    // Дэшборд на странице «Мои курсы» — полоска под курсами из двух частей,
    // каждая со своей галочкой: ближайшие контрольные и дедлайны на две
    // недели. Места у полоски больше не выбирают (`futureExamsDashboardPlacement`
    // убран): из чужого профиля этот ключ просто пропускается.
    bool('futureExamsDashboardToggle', 'features'),
    bool('futureExamsDashboardDeadlines', 'features'),
    // С какого числа несданных дедлайнов день жёлтый, оранжевый и красный.
    // Порядок (каждый больше предыдущего) держат попап и сам дэшборд.
    range('deadlineLevelYellow', 'features', 2, 99, 3),
    range('deadlineLevelOrange', 'features', 2, 99, 6),
    range('deadlineLevelRed', 'features', 2, 99, 10),
    bool('courseOverviewTaskStatusToggle', 'features'),
    bool('courseOverviewAutoscrollToggle', 'features'),
    bool('courseAttendanceBarToggle', 'features'),
    bool('courseExporterToggle', 'features'),
    bool('advancedStatementsEnabled', 'features'),
    bool('endOfCourseCalcEnabled', 'features'),
    // Вкладка друзей показывается, пока её явно не выключили.
    bool('friendsEnabled', 'features', true),
    bool('hideBonusButtonEnabled', 'features'),
    // Статус «Аудиторная» в списке задач; по умолчанию выключен.
    bool('seminarStatusEnabled', 'features'),
    bool('autoRenameEnabled', 'features'),
    choice('autoRenameTemplate', 'features', ['short', 'full'], 'short'),
    // Скрытие старых заданий в архиве задач (поле даты над его таблицей).
    // Пустая дата означает «не выбрана» — тогда не прячется ничего.
    bool('hideTasksBeforeEnabled', 'features'),
    text('hideTasksBeforeDate', 'features', /^(\d{4}-\d{2}-\d{2})?$/),

    // --- интеграции ---
    bool('akhIntegrationEnabled', 'integrations'),
    bool('contestIntegrationEnabled', 'integrations'),
    // Списки курсов для фильтров интеграций: массив id.
    { key: 'akhCourseFilter', area: 'sync', type: 'array', group: 'integrations' },
    { key: 'contestCourseFilter', area: 'sync', type: 'array', group: 'integrations' },

    // --- свои картинки ---
    data('courseIcons', 'content', 'object'),
    data('customLogo', 'content', 'string'),
    data('customBackground', 'content', 'string'),
    // Свои картинки фона для страниц, курсов и разделов:
    // `customBackground.page:/learn/…`, `customBackground.course:1234`,
    // `customBackground.section:tasks` (см. background_scopes.js). Страниц
    // сколько угодно, поэтому ключи не перечислить — описываем префиксом.
    prefixed('customBackground.', 'content', 'string'),

    // --- личное ---
    data('courseNames', 'personal', 'object'),
    data('archivedCourseIds', 'personal', 'array'),
    // Архив задач: id заданий, спрятанных вручную, и id тех, что вернули из
    // списка скрытых вопреки границе по дате.
    data('hiddenArchivedTaskIds', 'personal', 'array'),
    data('shownArchivedTaskIds', 'personal', 'array'),
    // Сводная таблица ведомостей: id курсов, убранных из неё кнопкой в строке.
    data('gradebookHiddenCourseIds', 'personal', 'array'),
    // Граница по дате, при которой сделаны эти исключения: при другой они
    // сбрасываются.
    {
      key: 'shownArchivedTasksBorder',
      area: 'local',
      type: 'string',
      group: 'personal',
      pattern: /^(\d{4}-\d{2}-\d{2})?$/,
    },

    // --- наружу не отдаётся ---
    // Токены доступа: отдать их вместе с настройками — отдать аккаунт.
    data('akh_token', 'private', 'string'),
    data('akh_refresh_token', 'private', 'string'),
    data('swapDeviceKey', 'private', 'string'),
    // Кеши и служебное: в чужом профиле бесполезны и только мешают.
    data('courseMetaCache', 'private', 'array'),
    // Расписание контрольных с сервера и время, когда его скачали
    // (course-view/future_exams_api.js).
    data('futureExamsScheduleCache', 'private', 'object'),
    data('futureExamsScheduleCacheTimestamp', 'private', 'number'),
    data('futureExamsConfigCache', 'private', 'object'),
    data('futureExamsConfigCacheTimestamp', 'private', 'number'),
    data('cachedLatestVersion', 'private', 'string'),
    data('lastVersionCheckTimestamp', 'private', 'number'),
    data('lmsOrigin', 'private', 'string'),
    // Анонимная статистика (src/metrics.ts). Выключатель в файл не идёт:
    // согласие на сбор данных даёт человек в своём браузере, а не чужой
    // профиль. Id установки и день снимка — служебное.
    bool('metricsEnabled', 'private', true),
    data('metricsClientId', 'private', 'string'),
    data('metricsLastDaily', 'private', 'string'),
    // Через них вкладка редактора тем и страница LMS договариваются о пипетке:
    // состояние одного сеанса, чужому профилю оно ни к чему.
    { key: 'themePickerActive', area: 'local', type: 'boolean', group: 'private' },
    // Открыт ли редактор фона на страницах LMS — состояние одного сеанса.
    { key: 'backgroundEditorActive', area: 'local', type: 'boolean', group: 'private' },
    data('themePageValues', 'private', 'object'),
    data('themePickResult', 'private', 'object'),
    data('themeEditorTabId', 'private', 'number'),
    data('themeSourceRequest', 'private', 'number'),
    data('themeSourceDump', 'private', 'object'),
    // 3rd-theme workshop (plugins/workshop): ключ устройства — как у биржи, отдать
    // его значит отдать вход от имени студента; остальное — состояние этого
    // браузера: что примеряется сейчас и что уже установлено.
    data('workshopDeviceKey', 'private', 'string'),
    data('workshopStudentId', 'private', 'string'),
    data('workshopBackendUrl', 'private', 'string'),
    data('workshopTryOn', 'private', 'object'),
    data('workshopInstalled', 'private', 'object'),
    data('workshopTabId', 'private', 'number'),
  ];

  const BY_KEY = new Map(REGISTRY.filter((e) => !e.prefix).map((entry) => [entry.key, entry]));
  const PREFIXED = REGISTRY.filter((entry) => entry.prefix);

  /** Описание ключа: точное или по префиксу. */
  function entryFor(key) {
    return (
      BY_KEY.get(key) ||
      PREFIXED.find((entry) => key.startsWith(entry.prefix) && key.length > entry.prefix.length) ||
      null
    );
  }

  // Что входит в каждый вид профиля. `settings` — только поведение, его файл
  // весит килобайты; `visual` тянет картинки и может весить мегабайты.
  // `keys` — отдельные ключи сверх групп: мастерской нужны названия курсов, но
  // не остальная группа `personal` (архив курсов, скрытые задания).
  const KINDS = {
    settings: { groups: ['appearance', 'theme', 'features', 'integrations'], title: 'Настройки' },
    visual: { groups: ['appearance', 'theme', 'content'], title: 'Визуальный пак' },
    theme: { groups: ['theme'], title: 'Тема' },
    workshop: {
      groups: ['appearance', 'theme', 'content'],
      keys: ['courseNames', 'customCourseNamesToggle'],
      title: 'Тема из 3rd-theme workshop',
    },
    full: {
      groups: ['appearance', 'theme', 'features', 'integrations', 'content', 'personal'],
      title: 'Всё',
    },
  };

  const entriesFor = (kind) => {
    const spec = KINDS[kind];
    if (!spec) throw new Error('Неизвестный вид профиля: ' + kind);
    const keys = spec.keys || [];
    return REGISTRY.filter(
      (entry) => spec.groups.includes(entry.group) || keys.includes(entry.key)
    );
  };

  // --- СЛОИ ТЕМЫ ---
  //
  // Тему из мастерской ставят не обязательно целиком: можно взять палитру, а
  // свои обложки курсов оставить. Слой — это то, что человек видит галочкой.
  // Тот же список есть на сервере мастерской (app/payload.py) — там он только
  // для показа, решает всё равно расширение.
  const LAYERS = {
    theme: 'Палитра и CSS',
    appearance: 'Переключатели оформления',
    images: 'Логотип и фоны',
    covers: 'Обложки курсов',
    names: 'Названия курсов',
  };

  function layerOf(key) {
    if (key.startsWith('customTheme')) return 'theme';
    if (key === 'courseNames' || key === 'customCourseNamesToggle') return 'names';
    if (key === 'courseIcons') return 'covers';
    if (key === 'customLogo' || key === 'customBackground' || key.startsWith('customBackground.')) {
      return 'images';
    }
    return 'appearance';
  }

  // --- ПРОВЕРКА ЗНАЧЕНИЙ ---

  /** null — значение годное; строка — причина, по которой его отвергли. */
  function reject(entry, value) {
    switch (entry.type) {
      case 'boolean':
        return typeof value === 'boolean' ? null : 'ожидалось да/нет';
      case 'number': {
        if (typeof value !== 'number' || !Number.isFinite(value)) return 'ожидалось число';
        if (entry.min !== undefined && value < entry.min) return 'меньше ' + entry.min;
        if (entry.max !== undefined && value > entry.max) return 'больше ' + entry.max;
        return null;
      }
      case 'enum':
        return entry.values.includes(value) ? null : 'недопустимое значение';
      case 'string':
        if (typeof value !== 'string') return 'ожидалась строка';
        if (entry.pattern && !entry.pattern.test(value)) return 'не тот формат';
        return null;
      case 'array':
        return Array.isArray(value) ? null : 'ожидался список';
      case 'object':
        return value && typeof value === 'object' && !Array.isArray(value)
          ? null
          : 'ожидался объект';
      default:
        return 'неизвестный тип';
    }
  }

  // --- ВЫГРУЗКА ---

  async function collect(kind, meta = {}) {
    const entries = entriesFor(kind);
    const fixed = entries.filter((e) => !e.prefix);
    const families = entries.filter((e) => e.prefix);
    const syncKeys = fixed.filter((e) => e.area === 'sync').map((e) => e.key);
    const localKeys = fixed.filter((e) => e.area === 'local').map((e) => e.key);

    const [syncData, localData, allLocal] = await Promise.all([
      syncKeys.length ? browser.storage.sync.get(syncKeys) : Promise.resolve({}),
      localKeys.length ? browser.storage.local.get(localKeys) : Promise.resolve({}),
      // Ключи семейства заранее неизвестны — берём всё и отбираем по началу.
      families.length ? browser.storage.local.get(null) : Promise.resolve({}),
    ]);

    const values = {};
    families.forEach((entry) => {
      Object.keys(allLocal).forEach((key) => {
        if (key.startsWith(entry.prefix) && allLocal[key] !== undefined) {
          values[key] = allLocal[key];
        }
      });
    });
    fixed.forEach((entry) => {
      const source = entry.area === 'sync' ? syncData : localData;
      // Ключа может не быть вовсе — настройку никогда не трогали. В файл его
      // не пишем: пустое значение при загрузке затёрло бы чужую настройку.
      if (entry.key in source && source[entry.key] !== undefined) {
        values[entry.key] = source[entry.key];
      }
    });

    return {
      format: FORMAT,
      version: FORMAT_VERSION,
      kind,
      meta: {
        name: meta.name || KINDS[kind].title,
        author: meta.author || '',
        note: meta.note || '',
        createdAt: new Date().toISOString(),
        extensionVersion:
          (browser.runtime.getManifest && browser.runtime.getManifest().version) || '',
      },
      values,
    };
  }

  // --- ЗАГРУЗКА ---

  /**
   * Разбирает файл и делит ключи на принятые и отвергнутые, ничего не записывая.
   * Отдельный шаг нужен, чтобы попап показал, что именно приедет, до того как
   * перезапишет настройки.
   */
  function inspect(raw) {
    let profile = raw;
    if (typeof raw === 'string') {
      try {
        profile = JSON.parse(raw);
      } catch (_error) {
        return { ok: false, error: 'Это не JSON' };
      }
    }
    if (!profile || typeof profile !== 'object') return { ok: false, error: 'Пустой файл' };
    if (profile.format !== FORMAT) {
      return { ok: false, error: 'Чужой формат файла' };
    }
    if (typeof profile.version !== 'number' || profile.version > FORMAT_VERSION) {
      return {
        ok: false,
        error: 'Файл новее расширения — обнови расширение',
      };
    }
    if (!profile.values || typeof profile.values !== 'object') {
      return { ok: false, error: 'В файле нет настроек' };
    }

    const accepted = [];
    const rejected = [];
    Object.entries(profile.values).forEach(([key, value]) => {
      const entry = entryFor(key);
      if (!entry) {
        // Незнакомый ключ — скорее всего файл от новой версии. Пропускаем,
        // но говорим об этом вслух.
        rejected.push({ key, reason: 'расширение не знает такой настройки' });
        return;
      }
      if (entry.group === 'private') {
        rejected.push({ key, reason: 'такие ключи не переносятся' });
        return;
      }
      const problem = reject(entry, value);
      if (problem) {
        rejected.push({ key, reason: problem });
        return;
      }
      accepted.push({ entry, key, value });
    });

    return { ok: true, profile, accepted, rejected };
  }

  /**
   * Записывает то, что прошло проверку. Остальное не трогает.
   *
   * `options.only(key)` отбирает ключи — мастерская ставит тему по слоям.
   */
  async function apply(raw, options = {}) {
    const result = inspect(raw);
    if (!result.ok) return result;

    const accepted = options.only
      ? result.accepted.filter(({ key }) => options.only(key))
      : result.accepted;
    const sync = {};
    const local = {};
    accepted.forEach(({ entry, key, value }) => {
      (entry.area === 'sync' ? sync : local)[key] = value;
    });

    if (Object.keys(sync).length) await browser.storage.sync.set(sync);
    if (Object.keys(local).length) await browser.storage.local.set(local);

    return {
      ok: true,
      applied: accepted.map(({ key }) => key),
      rejected: result.rejected,
      kind: result.profile.kind,
      meta: result.profile.meta || {},
    };
  }

  /**
   * Текущие значения ключей по областям хранилища — чтобы потом вернуть всё
   * как было (примерка темы в мастерской). Ключа нет — в снимке `null`, и
   * при возврате он удаляется, а не записывается пустым. Возвращает снимок
   * background (`WORKSHOP_TRYON_END`): туда же шлёт плашка примерки с LMS.
   */
  async function snapshot(keys) {
    const byArea = { sync: [], local: [] };
    keys.forEach((key) => {
      const entry = entryFor(key);
      if (entry && entry.group !== 'private') byArea[entry.area].push(key);
    });
    const [sync, local] = await Promise.all([
      byArea.sync.length ? browser.storage.sync.get(byArea.sync) : Promise.resolve({}),
      byArea.local.length ? browser.storage.local.get(byArea.local) : Promise.resolve({}),
    ]);
    const pick = (keysInArea, data) =>
      Object.fromEntries(keysInArea.map((key) => [key, key in data ? data[key] : null]));
    return { sync: pick(byArea.sync, sync), local: pick(byArea.local, local) };
  }

  /**
   * Ключи вида профиля, которые сейчас лежат в хранилище. `only(key)` отбирает
   * из них нужные — мастерская так находит, что снимать при возврате к теме по
   * умолчанию.
   */
  async function storedKeys(kind, only = () => true) {
    const entries = entriesFor(kind);
    const [sync, local] = await Promise.all([
      browser.storage.sync.get(null),
      browser.storage.local.get(null),
    ]);
    const keys = [];
    entries.forEach((entry) => {
      const data = entry.area === 'sync' ? sync : local;
      if (entry.prefix) {
        Object.keys(data).forEach((key) => {
          if (key.startsWith(entry.prefix) && key.length > entry.prefix.length) keys.push(key);
        });
      } else if (entry.key in data) {
        keys.push(entry.key);
      }
    });
    return keys.filter(only);
  }

  /**
   * Удаляет ключи из хранилища — плагины берут тогда `fallback`, то есть
   * ведут себя как на свежей установке. Ключи `private` не трогает.
   */
  async function reset(keys) {
    const byArea = { sync: [], local: [] };
    keys.forEach((key) => {
      const entry = entryFor(key);
      if (entry && entry.group !== 'private') byArea[entry.area].push(key);
    });
    if (byArea.sync.length) await browser.storage.sync.remove(byArea.sync);
    if (byArea.local.length) await browser.storage.local.remove(byArea.local);
    return [...byArea.sync, ...byArea.local];
  }

  /** Значение настройки, когда её ещё ни разу не трогали. */
  function defaultFor(key) {
    const entry = entryFor(key);
    return entry ? entry.fallback : undefined;
  }

  window.cuLmsSettings = {
    FORMAT,
    FORMAT_VERSION,
    GROUPS,
    KINDS,
    LAYERS,
    REGISTRY,
    layerOf,
    snapshot,
    storedKeys,
    reset,
    defaultFor,
    entriesFor,
    entryFor,
    collect,
    inspect,
    apply,
  };
}
