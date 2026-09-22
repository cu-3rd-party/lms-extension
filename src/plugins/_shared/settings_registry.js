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
    bool('courseOverviewTaskStatusToggle', 'features'),
    bool('courseOverviewAutoscrollToggle', 'features'),
    bool('courseExporterToggle', 'features'),
    bool('advancedStatementsEnabled', 'features'),
    bool('endOfCourseCalcEnabled', 'features'),
    // Вкладка друзей показывается, пока её явно не выключили.
    bool('friendsEnabled', 'features', true),
    bool('hideBonusButtonEnabled', 'features'),
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

    // --- наружу не отдаётся ---
    // Токены доступа: отдать их вместе с настройками — отдать аккаунт.
    data('akh_token', 'private', 'string'),
    data('akh_refresh_token', 'private', 'string'),
    data('swapDeviceKey', 'private', 'string'),
    // Кеши и служебное: в чужом профиле бесполезны и только мешают.
    data('courseMetaCache', 'private', 'array'),
    data('cachedLatestVersion', 'private', 'string'),
    data('lastVersionCheckTimestamp', 'private', 'number'),
    data('lmsOrigin', 'private', 'string'),
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
  const KINDS = {
    settings: { groups: ['appearance', 'theme', 'features', 'integrations'], title: 'Настройки' },
    visual: { groups: ['appearance', 'theme', 'content'], title: 'Визуальный пак' },
    theme: { groups: ['theme'], title: 'Тема' },
    full: {
      groups: ['appearance', 'theme', 'features', 'integrations', 'content', 'personal'],
      title: 'Всё',
    },
  };

  const entriesFor = (kind) => {
    const spec = KINDS[kind];
    if (!spec) throw new Error('Неизвестный вид профиля: ' + kind);
    return REGISTRY.filter((entry) => spec.groups.includes(entry.group));
  };

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

  /** Записывает то, что прошло проверку. Остальное не трогает. */
  async function apply(raw) {
    const result = inspect(raw);
    if (!result.ok) return result;

    const sync = {};
    const local = {};
    result.accepted.forEach(({ entry, key, value }) => {
      (entry.area === 'sync' ? sync : local)[key] = value;
    });

    if (Object.keys(sync).length) await browser.storage.sync.set(sync);
    if (Object.keys(local).length) await browser.storage.local.set(local);

    return {
      ok: true,
      applied: result.accepted.map(({ key }) => key),
      rejected: result.rejected,
      kind: result.profile.kind,
      meta: result.profile.meta || {},
    };
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
    REGISTRY,
    defaultFor,
    entriesFor,
    entryFor,
    collect,
    inspect,
    apply,
  };
}
