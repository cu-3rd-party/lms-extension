// metrics-hit.ts — чистая часть статистики: что и в каком виде уходит в
// Яндекс Метрику. Без API браузера, чтобы проверять тестом
// (tests/source/metrics.test.ts). Отправка и согласие — в metrics.ts.

export const COUNTER_ID = 113341269;
export const WATCH_URL = `https://mc.yandex.ru/watch/${COUNTER_ID}`;
// Условный адрес: сайта там нет, но Метрике нужен page-url, а по пути видно,
// откуда пришло событие. Цели идут как `goal://ext.cu3rd.ru/<цель>`.
export const SITE_HOST = 'ext.cu3rd.ru';

export const METRICS_KEYS = {
  /** storage.sync: выключатель в попапе. Нет ключа — включено. */
  enabled: 'metricsEnabled',
  /** storage.local: анонимный id установки. Переживает сброс настроек. */
  clientId: 'metricsClientId',
  /** storage.local: день последнего снимка, `ГГГГ-ММ-ДД`. */
  lastDaily: 'metricsLastDaily',
} as const;

/**
 * Тумблеры функций и их значения по умолчанию — те же, что в реестре
 * настроек (`plugins/_shared/settings_registry.js`, группы appearance, theme,
 * features, integrations). Совпадение проверяет tests/source/metrics.test.ts.
 */
export const FEATURE_TOGGLES: Readonly<Record<string, boolean>> = {
  themeEnabled: false,
  oledEnabled: false,
  darkPdfEnabled: false,
  snowEnabled: false,
  emojiHeartsEnabled: false,
  oldCoursesDesignToggle: false,
  customLogoToggle: false,
  customBackgroundToggle: false,
  customThemeToggle: false,
  customCourseNamesToggle: false,
  futureExamsViewToggle: false,
  futureExamsDashboardToggle: false,
  futureExamsDashboardDeadlines: false,
  courseOverviewTaskStatusToggle: false,
  courseOverviewAutoscrollToggle: false,
  courseExporterToggle: false,
  advancedStatementsEnabled: false,
  endOfCourseCalcEnabled: false,
  friendsEnabled: true,
  hideBonusButtonEnabled: false,
  autoRenameEnabled: false,
  hideTasksBeforeEnabled: false,
  akhIntegrationEnabled: false,
  contestIntegrationEnabled: false,
};

/**
 * Цели. Те же идентификаторы нужно завести в Метрике: «Цели» → «JavaScript-
 * событие», условие «идентификатор цели совпадает». Список с описаниями —
 * в METRICS.md.
 */
export const GOALS = [
  'install',
  'update',
  'grades_export',
  'grades_export_archived',
  'pdf_viewer_open',
  'theme_editor_open',
  'swap_order_create',
  'swap_order_cancel',
  'friends_schedule',
  'friends_search',
  'gradebook_open',
  'course_export',
  'settings_export',
  'settings_import',
  'settings_reset',
  'workshop_open',
  'workshop_theme_install',
  'file_download',
] as const;

export type Goal = (typeof GOALS)[number];

export function isGoal(value: unknown): value is Goal {
  return typeof value === 'string' && (GOALS as readonly string[]).includes(value);
}

/** Id в формате `_ym_uid`: секунды и девять случайных цифр. */
export function makeClientId(now = Date.now()): string {
  const random = String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
  return String(Math.floor(now / 1000)) + random;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `ГГГГ-ММ-ДД` по местному времени: «сутки» — это сутки человека. */
export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface Hit {
  kind: 'pageview' | 'goal';
  /** Путь на SITE_HOST для просмотра или идентификатор цели. */
  target: string;
  title?: string;
  params?: Record<string, unknown>;
  clientId: string;
  language?: string;
  now?: Date;
}

/** Адрес запроса в формате `tag.js`. Отдельно от отправки — ради теста. */
export function buildHitUrl(hit: Hit): string {
  const now = hit.now ?? new Date();
  const stamp =
    now.getFullYear() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds());
  const random = () => String(Math.floor(Math.random() * 1e9));

  // Поля `browser-info` разделены двоеточием. Заголовок идёт последним: в
  // нём двоеточие допустимо, Метрика берёт всё до конца строки.
  const info: Array<[string, string | number]> = [
    [hit.kind === 'pageview' ? 'pv' : 'ar', 1],
    ['z', -now.getTimezoneOffset()],
    ['i', stamp],
    ['et', Math.floor(now.getTime() / 1000)],
    ['rn', random()],
    ['la', hit.language ?? ''],
    ['en', 'utf-8'],
    ['u', hit.clientId],
    ['hid', random()],
  ];
  if (hit.title) info.push(['t', hit.title]);

  const pageUrl = `https://${SITE_HOST}/${hit.kind === 'pageview' ? hit.target : ''}`;
  const query = new URLSearchParams({
    'browser-info': info.map(([key, value]) => `${key}:${value}`).join(':'),
    'page-url': hit.kind === 'goal' ? `goal://${SITE_HOST}/${hit.target}` : pageUrl,
  });
  if (hit.kind === 'goal') query.set('page-ref', pageUrl);
  if (hit.params && Object.keys(hit.params).length) {
    query.set('site-info', JSON.stringify(hit.params));
  }
  return `${WATCH_URL}?${query}`;
}

/** Состояние тумблеров функций: `on` / `off`, отсутствующий ключ — значение по умолчанию. */
export function featureSnapshot(stored: Record<string, unknown>): Record<string, 'on' | 'off'> {
  const snapshot: Record<string, 'on' | 'off'> = {};
  for (const [key, fallback] of Object.entries(FEATURE_TOGGLES)) {
    const value = key in stored ? !!stored[key] : fallback;
    snapshot[key] = value ? 'on' : 'off';
  }
  return snapshot;
}
