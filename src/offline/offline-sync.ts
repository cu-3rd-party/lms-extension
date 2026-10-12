// Офлайн-копия LMS: фоновая выгрузка понемногу.
//
// Что выгружается, как часто и в каком порядке — `survey()` ниже; подробно —
// в README рядом. Главное правило — не грузить интернет студента: за один
// заход не больше RUN_BUDGET запросов и мегабайт, между запросами пауза,
// заходы — раз в ALARM_MINUTES по `alarms` и при открытии страниц LMS (не
// чаще NAV_MIN_GAP_MS). Первая полная выгрузка поэтому растягивается на часы,
// а дальше за заход уходит пара запросов: лонгриды и условия заданий
// скачиваются один раз и больше не обновляются, файлы — по ключу
// `filename@version`. Первыми идут лонгриды, от новых к старым; задания старше
// месяца не качаются. Пока студент не выбрал курсы в попапе
// (`offlineCourseIds`), качается только список курсов — для выбора.
//
// Запросы к API идут из вкладки LMS (offline-fetch.ts), без неё — из фона.
// 401 или страница входа вместо JSON — заход прекращается, в попапе «войдите в
// LMS». Сеть или 5xx от micro-lms — тоже, и следующий заход откладывается тем
// дальше, чем больше неудач подряд: когда LMS лежит, долбить её незачем.
// Каждый шаг пишется в лог (meta.log) — его показывает «терминал» в попапе.

import browser from 'webextension-polyfill';
import './offline_store.js';
import { fetchLmsJsonInTab } from './offline-fetch';

interface OfflineRecord {
  key: string;
  data?: any;
  fetchedAt?: number;
  fp?: string;
  error?: number;
  failedAt?: number;
}

interface OfflineStore {
  recordsMap(): Promise<Map<string, OfflineRecord>>;
  fileIndex(): Promise<Map<string, { key: string; name: string; size: number }>>;
  getRecord(key: string): Promise<OfflineRecord | undefined>;
  putRecord(record: OfflineRecord): Promise<unknown>;
  putFile(file: Record<string, unknown>): Promise<unknown>;
  getMeta(key: string): Promise<any>;
  setMeta(key: string, value: unknown): Promise<unknown>;
  clearAll(): Promise<void>;
}

const store = (globalThis as unknown as { cuLmsOfflineStore: OfflineStore }).cuLmsOfflineStore;

// --- НАСТРОЙКИ ---

export const OFFLINE_SETTINGS = {
  offlineCacheEnabled: false,
  offlineCacheLongreads: true,
  offlineCacheHomework: true,
  offlineCacheSolutions: true,
  offlineCacheTasks: true,
  offlineCacheTimetable: true,
  offlineMaxFileMb: 250,
};

type Settings = typeof OFFLINE_SETTINGS;

async function readSettings(): Promise<Settings> {
  const saved = await browser.storage.sync.get(Object.keys(OFFLINE_SETTINGS));
  return { ...OFFLINE_SETTINGS, ...saved } as Settings;
}

// --- РАСПИСАНИЕ ---

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const ALARM = 'culms-offline-sync';
const ALARM_MINUTES = 5;
const NAV_MIN_GAP_MS = 3 * MINUTE;
// Пауза между запросами внутри захода.
const REQUEST_GAP_MS = 800;
// Сколько за один заход по таймеру или при открытии LMS.
const RUN_BUDGET = { requests: 20, bytes: 40 * 1024 * 1024 };
// «Скачать всё» (кнопка в попапе): без лимита, до конца очереди, пауза
// короче. LMS всё равно обрабатывает запросы студента по одному (~120 мс),
// так что чаще слать бесполезно.
const FULL_GAP_MS = 200;
// Неудачный запрос по отдельной записи (403, 404, файл не скачался) повторяем
// не раньше чем через сутки.
const RETRY_FAILED_MS = DAY;
// Откладывание после «LMS не отвечает»: 5 минут, 10, 20… но не дольше 2 часов.
const BACKOFF_BASE_MS = 5 * MINUTE;
const BACKOFF_MAX_MS = 2 * HOUR;
// Столько неудач подряд — и в попапе «LMS, похоже, не работает».
const DOWN_AFTER_FAILURES = 2;

const TASK_STATES = [
  'backlog',
  'inProgress',
  'submitted',
  'review',
  'reworking',
  'evaluated',
  'failed',
];
// Задания, у которых уже есть решение.
const SOLVED_STATES = new Set(['submitted', 'review', 'reworking', 'evaluated', 'failed']);

const API = '/api/micro-lms';

type Category =
  | 'offlineCacheLongreads'
  | 'offlineCacheHomework'
  | 'offlineCacheSolutions'
  | 'offlineCacheTasks'
  | 'offlineCacheTimetable';

/** Списки: ключ записи, адрес, как часто обновлять и для каких разделов нужен. */
const LISTS: { key: string; label: string; path: string; ttl: number; for: Category[] }[] = [
  {
    key: 'courses',
    label: 'Список курсов',
    path: `${API}/courses/student?limit=10000&state=published`,
    ttl: DAY,
    for: ['offlineCacheLongreads', 'offlineCacheHomework'],
  },
  {
    key: 'tasks',
    label: 'Задания и дедлайны',
    path: `${API}/tasks/student?${TASK_STATES.map((s) => `state=${s}`).join('&')}`,
    ttl: 2 * HOUR,
    for: ['offlineCacheTasks', 'offlineCacheSolutions'],
  },
  {
    key: 'timetable',
    label: 'Расписание',
    path: `${API}/students/me/timetables`,
    ttl: DAY,
    for: ['offlineCacheTimetable'],
  },
];

// --- ЧТО СКАЧАТЬ ---

interface FileRef {
  key: string;
  name: string;
  filename: string;
  version: string;
  length: number;
}

type Job =
  | { type: 'json'; key: string; path: string; label: string; fp?: string }
  | { type: 'file'; key: string; file: FileRef; label: string };

const isExercise = (item: any) =>
  item?.discriminator === 'coding' || item?.discriminator === 'questions';

function fileRef(raw: any): FileRef | null {
  if (!raw?.filename || !raw?.version) return null;
  const name = raw.name || String(raw.filename).split('/').pop() || 'file';
  return {
    key: `${raw.filename}@${raw.version}`,
    name,
    filename: raw.filename,
    version: raw.version,
    length: Number(raw.length) || 0,
  };
}

/** Файлы материалов лонгрида с учётом выбранных разделов. */
export function longreadFiles(items: any[], settings: Settings): FileRef[] {
  const files: FileRef[] = [];
  for (const item of items || []) {
    if (isExercise(item)) {
      if (!settings.offlineCacheHomework) continue;
      for (const attachment of item.attachments || []) {
        const ref = fileRef(attachment);
        if (ref) files.push(ref);
      }
    } else if (item?.discriminator === 'file' || item?.discriminator === 'image') {
      // video и audio — тоже файлы, но обычно огромные; их не берём.
      if (!settings.offlineCacheLongreads) continue;
      const ref = fileRef(item.content || item);
      if (ref) files.push(ref);
    }
  }
  return files;
}

/** Материалы лонгрида без того, что студент выгружать не просил. */
function filterMaterials(data: any, settings: Settings) {
  const items = (data?.items || []).filter((item: any) =>
    isExercise(item) ? settings.offlineCacheHomework : settings.offlineCacheLongreads
  );
  return { items };
}

function taskFingerprint(task: any): string {
  return [
    task.state,
    task.submitAt,
    task.evaluateAt,
    task.rejectAt,
    task.score,
    task.extraScore,
  ].join('|');
}

const isDue = (record: OfflineRecord | undefined, ttl: number, now: number) => {
  if (!record) return true;
  if (record.error && record.failedAt) return now - record.failedAt > RETRY_FAILED_MS;
  return !record.fetchedAt || now - record.fetchedAt > ttl;
};

/**
 * Задания старше месяца не нужны: ни подробности с решением, ни строка в
 * списке. Дата задания — дедлайн, без него — отправка или создание. Будущий
 * дедлайн — всегда нужен.
 */
const RECENT_TASK_MS = 30 * DAY;

export function isRecentTask(task: any, now: number): boolean {
  const date = Date.parse(task?.deadline || task?.submitAt || task?.createdAt || '');
  return Number.isFinite(date) && date >= now - RECENT_TASK_MS;
}

/** Ответ списка заданий без старых — их не храним вовсе. */
function recentTasks(data: any, now: number) {
  return Array.isArray(data) ? data.filter((task) => isRecentTask(task, now)) : data;
}

interface Progress {
  key: string;
  label: string;
  done: number;
  total: number;
  bytes?: number;
  skipped?: number;
}

const fmtCourse = (course: any) => (course?.name ? ` · ${course.name}` : '');

/**
 * Что скачано и что осталось: очередь на сейчас и прогресс по разделам.
 *
 * Порядок очереди — что нужнее офлайн:
 *   1. список курсов и обзоры выбранных курсов — без них не узнать лонгриды;
 *   2. лонгриды от новых к старым, каждый сразу со своими файлами — чтобы
 *      свежая неделя была целиком, даже если до старых очередь ещё не дошла;
 *   3. задания и расписание;
 *   4. решения за последний месяц и их файлы.
 */
export function survey(
  records: Map<string, OfflineRecord>,
  files: Map<string, { size?: number }>,
  fileFailures: Record<string, number>,
  settings: Settings,
  chosen: Set<number> | null,
  now: number
): { jobs: Job[]; progress: Progress[] } {
  const jobs: Job[] = [];
  const progress: Progress[] = [];
  const enabled = (cats: Category[]) => cats.some((c) => settings[c]);
  const listJob = (key: string) => {
    const list = LISTS.find((l) => l.key === key)!;
    return { type: 'json' as const, key, path: list.path, label: list.label };
  };

  const maxBytes = settings.offlineMaxFileMb * 1024 * 1024;
  const queued = new Set<string>();
  /** Файл в очередь (если нужен) и в счёт раздела. */
  const countFile = (ref: FileRef, bucket: Progress, where: string) => {
    if (ref.length > maxBytes) {
      bucket.skipped = (bucket.skipped || 0) + 1;
      return;
    }
    bucket.total += 1;
    const saved = files.get(ref.key);
    if (saved) {
      bucket.done += 1;
      bucket.bytes = (bucket.bytes || 0) + (saved.size || 0);
      return;
    }
    const failedAt = fileFailures[ref.key];
    if (failedAt && now - failedAt < RETRY_FAILED_MS) return;
    if (queued.has(ref.key)) return;
    queued.add(ref.key);
    jobs.push({ type: 'file', key: ref.key, file: ref, label: `Файл «${ref.name}»${where}` });
  };

  const wantMaterials = settings.offlineCacheLongreads || settings.offlineCacheHomework;

  // 0. Список курсов нужен всегда — по нему студент выбирает, что качать.
  // Пока не выбрал, больше ничего не качаем.
  if (isDue(records.get('courses'), DAY, now)) jobs.push(listJob('courses'));
  if (!chosen) return { jobs, progress };

  // 1. Структура выбранных курсов.
  const courses: any[] = (records.get('courses')?.data?.items || []).filter((course: any) =>
    chosen.has(Number(course.id))
  );

  if (wantMaterials) {
    const overviews: Progress = { key: 'overviews', label: 'Структура курсов', done: 0, total: 0 };
    for (const course of courses) {
      const key = `overview:${course.id}`;
      const saved = records.get(key);
      overviews.total += 1;
      if (saved?.data) overviews.done += 1;
      if (isDue(saved, DAY, now)) {
        jobs.push({
          type: 'json',
          key,
          path: `${API}/courses/${course.id}/overview`,
          label: `Структура курса «${course.name}»`,
        });
      }
    }
    progress.push(overviews);

    // 2. Лонгриды — от новых к старым, каждый со своими файлами.
    const longreads: Progress = { key: 'longreads', label: 'Лонгриды', done: 0, total: 0 };
    const longreadFilesProgress: Progress = {
      key: 'longreadFiles',
      label: 'Файлы лонгридов и условий',
      done: 0,
      total: 0,
    };
    const entries: { course: any; longread: any; at: number; order: number }[] = [];
    for (const course of courses) {
      const themes = records.get(`overview:${course.id}`)?.data?.themes || [];
      for (const theme of themes) {
        (theme.longreads || []).forEach((longread: any, index: number) => {
          const hasExercises = (longread.exercises || []).length > 0;
          if (!settings.offlineCacheLongreads && !hasExercises) return;
          const at = Date.parse(
            longread.publishedAt || longread.publishDate || theme.publishDate || ''
          );
          entries.push({
            course,
            longread,
            at: Number.isFinite(at) ? at : 0,
            order: (theme.order ?? 0) * 1000 + index,
          });
        });
      }
    }
    entries.sort((a, b) => b.at - a.at || b.order - a.order);
    for (const { course, longread } of entries) {
      const key = `longread:${longread.id}`;
      const saved = records.get(key);
      longreads.total += 1;
      if (saved?.data) longreads.done += 1;
      if (!saved || isDue(saved, Infinity, now)) {
        jobs.push({
          type: 'json',
          key,
          path: `${API}/longreads/${longread.id}/materials?limit=10000`,
          label: `Лонгрид «${longread.name}»${fmtCourse(course)}`,
        });
      }
      for (const ref of longreadFiles(saved?.data?.items, settings)) {
        countFile(ref, longreadFilesProgress, fmtCourse(course));
      }
    }
    progress.push(longreads, longreadFilesProgress);
  }

  // 3. Остальные списки.
  const lists: Progress = {
    key: 'lists',
    label: 'Задания и расписание',
    done: 0,
    total: 0,
  };
  for (const list of LISTS) {
    if (list.key === 'courses' || !enabled(list.for)) continue;
    const saved = records.get(list.key);
    lists.total += 1;
    if (saved?.data !== undefined && !saved.error) lists.done += 1;
    if (isDue(saved, list.ttl, now)) jobs.push(listJob(list.key));
  }
  if (lists.total) progress.push(lists);

  // 4. Решения за последний месяц: задание перечитываем, когда в списке
  // поменялись статус или оценка. Условие задания едет в том же ответе.
  if (settings.offlineCacheSolutions) {
    const solutions: Progress = { key: 'solutions', label: 'Решения за месяц', done: 0, total: 0 };
    const solutionFiles: Progress = {
      key: 'solutionFiles',
      label: 'Файлы решений',
      done: 0,
      total: 0,
    };
    const tasks: any[] = Array.isArray(records.get('tasks')?.data)
      ? records.get('tasks')!.data
      : [];
    for (const task of tasks) {
      if (!SOLVED_STATES.has(task.state) && !task.submitAt) continue;
      if (!isRecentTask(task, now) || !chosen.has(Number(task.course?.id))) continue;
      const key = `task:${task.id}`;
      const fp = taskFingerprint(task);
      const saved = records.get(key);
      solutions.total += 1;
      if (saved?.data && saved.fp === fp) solutions.done += 1;
      const stale = !saved || (saved.error ? isDue(saved, 0, now) : saved.fp !== fp);
      if (stale) {
        jobs.push({
          type: 'json',
          key,
          path: `${API}/tasks/${task.id}`,
          fp,
          label: `Решение «${task.exercise?.name || task.id}»${fmtCourse(task.course)}`,
        });
      }
      for (const attachment of saved?.data?.solution?.attachments || []) {
        const ref = fileRef(attachment);
        if (ref) countFile(ref, solutionFiles, fmtCourse(task.course));
      }
    }
    progress.push(solutions, solutionFiles);
  }

  return { jobs, progress };
}

// --- ЗАПРОСЫ ---

class StopRun extends Error {
  constructor(
    message: string,
    readonly reason: 'auth' | 'down'
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const LMS_TAB_PATTERNS = ['https://my.centraluniversity.ru/*', 'https://my.cu.ru/*'];

/** Вкладка LMS на нужном домене: у доменов раздельные сессии. */
async function findLmsTab(origin: string): Promise<number | null> {
  try {
    const tabs = await browser.tabs.query({ url: LMS_TAB_PATTERNS });
    const usable = tabs.filter((tab) => tab.id != null && !tab.discarded);
    const same = usable.find((tab) => tab.url?.startsWith(origin + '/'));
    return (same || usable[0])?.id ?? null;
  } catch (_error) {
    return null;
  }
}

async function lmsJson(origin: string, path: string): Promise<{ status: number; data: any }> {
  const tabId = await findLmsTab(origin);
  if (tabId != null) {
    try {
      const [result] = await browser.scripting.executeScript({
        target: { tabId },
        func: fetchLmsJsonInTab,
        args: [path],
      });
      if (result?.result) return result.result as { status: number; data: any };
    } catch (_error) {
      // Вкладку закрыли или увели — попробуем из фона.
    }
  }
  try {
    const response = await fetch(origin + path, {
      credentials: 'include',
      headers: { accept: 'application/json, text/plain, */*' },
    });
    if (!response.ok) return { status: response.status, data: null };
    try {
      return { status: 200, data: await response.json() };
    } catch (_error) {
      return { status: -1, data: null };
    }
  } catch (_error) {
    return { status: 0, data: null };
  }
}

/**
 * 200 — данные; 401 и не-JSON — нужен вход; сеть и 5xx от micro-lms — LMS не
 * отвечает. LMS падает по частям: 12.10.2026 micro-lms работал, а student-hub
 * (профиль) отдавал 502. 5xx от других сервисов останавливать выгрузку не
 * должен — такая запись просто пропускается до завтра.
 */
function checkStatus(status: number, path: string): 'ok' | 'skip' {
  if (status === 200) return 'ok';
  if (status === 401 || status === -1) throw new StopRun('Нужно войти в LMS', 'auth');
  if (status === 0 || (status >= 500 && path.startsWith(API + '/'))) {
    // Путь без query — чтобы по статусу в попапе было видно, какой сервис упал.
    const where = path.split('?')[0];
    throw new StopRun(status ? `${where} ответил ${status}` : `${where}: нет ответа`, 'down');
  }
  console.log('[Offline] пропуск', status, path);
  return 'skip';
}

// --- ЛОГ ---
//
// Что делала выгрузка — для «терминала» во вкладке «Офлайн». Последние
// LOG_LIMIT строк в meta.log; пишется после каждого запроса, чтобы попап,
// который опрашивает статус раз в пару секунд, видел ход захода вживую.

const LOG_LIMIT = 300;

interface LogLine {
  t: number;
  level: 'ok' | 'err' | 'skip' | 'info';
  text: string;
}

let logBuffer: LogLine[] | null = null;

async function log(level: LogLine['level'], text: string) {
  logBuffer ??= ((await store.getMeta('log')) as LogLine[] | undefined) || [];
  logBuffer.push({ t: Date.now(), level, text });
  if (logBuffer.length > LOG_LIMIT) logBuffer.splice(0, logBuffer.length - LOG_LIMIT);
  await store.setMeta('log', logBuffer);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
}

/** Что пришло — коротко для лога. */
function describe(job: Extract<Job, { type: 'json' }>, value: any): string {
  if (job.key.startsWith('longread:')) {
    const items = value?.items || [];
    return `${job.label} — блоков: ${items.length}`;
  }
  if (job.key.startsWith('overview:')) {
    const count = (value?.themes || []).reduce(
      (sum: number, theme: any) => sum + (theme.longreads || []).length,
      0
    );
    return `${job.label} — лонгридов: ${count}`;
  }
  if (job.key === 'courses') return `${job.label} — курсов: ${(value?.items || []).length}`;
  if (job.key === 'tasks') return `${job.label} — за месяц и впереди: ${value.length}`;
  return job.label;
}

async function runJsonJob(origin: string, job: Extract<Job, { type: 'json' }>, settings: Settings) {
  const { status, data } = await lmsJson(origin, job.path);
  const now = Date.now();
  if (checkStatus(status, job.path) === 'skip') {
    const old = await store.getRecord(job.key);
    await store.putRecord({ ...old, key: job.key, error: status, failedAt: now });
    await log('skip', `${job.label} — ответ ${status}, повторю через сутки`);
    return;
  }
  let value = data;
  if (job.key.startsWith('longread:')) value = filterMaterials(data, settings);
  if (job.key === 'tasks') value = recentTasks(data, now);
  await store.putRecord({ key: job.key, data: value, fetchedAt: now, fp: job.fp });
  await log('ok', describe(job, value));
}

async function runFileJob(
  origin: string,
  job: Extract<Job, { type: 'file' }>,
  settings: Settings
): Promise<number> {
  const { file } = job;
  const linkPath =
    `${API}/content/download-link?filename=${encodeURIComponent(file.filename)}` +
    `&version=${encodeURIComponent(file.version)}`;
  const { status, data } = await lmsJson(origin, linkPath);
  if (checkStatus(status, linkPath) === 'skip' || !data?.url) {
    await markFileFailed(file.key);
    await log('skip', `${job.label} — ссылка не выдана (${status}), повторю через сутки`);
    return 0;
  }

  // Ссылка подписана, куки не нужны — качает сам фон. С октября 2026 файлы
  // лежат в Selectel (university-lms-materials.s3.ru-7.storage.selcloud.ru,
  // раньше storage.yandexcloud.net). Его CORS отвечает любому Origin, в том
  // числе chrome-extension:// и moz-extension://, поэтому отдельный
  // host_permissions под него не нужен.
  let blob: Blob;
  try {
    const response = await fetch(data.url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    blob = await response.blob();
  } catch (error) {
    await markFileFailed(file.key);
    await log('err', `${job.label} — не скачался: ${(error as Error)?.message || error}`);
    return 0;
  }
  // LMS указала размер меньше настоящего — такой файл больше не пробуем.
  if (blob.size > settings.offlineMaxFileMb * 1024 * 1024) {
    await markFileFailed(file.key);
    await log('skip', `${job.label} — ${formatBytes(blob.size)}, больше лимита`);
    return blob.size;
  }

  const entry = {
    key: file.key,
    name: file.name,
    size: blob.size,
    mime: blob.type || '',
    savedAt: Date.now(),
  };
  try {
    await store.putFile({ ...entry, blob });
  } catch (_error) {
    // Старый Safari не умел класть Blob в IndexedDB — тогда байтами.
    await store.putFile({ ...entry, buffer: await blob.arrayBuffer() });
  }
  await log('ok', `${job.label} — ${formatBytes(blob.size)}`);
  return blob.size;
}

async function markFileFailed(key: string) {
  const failures = (await store.getMeta('fileFailures')) || {};
  failures[key] = Date.now();
  await store.setMeta('fileFailures', failures);
}

// --- ЗАХОДЫ ---

export interface SyncState {
  lastRunAt?: number;
  lastSuccessAt?: number;
  lastError?: string | null;
  reason?: 'auth' | 'down' | null;
  failures?: number;
  nextRunAfter?: number;
}

let running: Promise<void> | null = null;
// «Скачать всё»: заход идёт без лимита, пока очередь не опустеет. Флаг можно
// поднять и посреди обычного захода — тот продолжится уже без лимита.
let fullMode = false;
// «Остановить»: заход кончается после текущего запроса.
let stopRequested = false;
let getOrigin: () => string = () => 'https://my.centraluniversity.ru';

async function readState(): Promise<SyncState> {
  return (await store.getMeta('state')) || {};
}

/**
 * Курсы, выбранные во вкладке «Офлайн». null — ещё не выбирали: тогда
 * качается только список курсов, чтобы было из чего выбрать.
 */
async function readChosenCourses(): Promise<Set<number> | null> {
  const saved = await browser.storage.sync.get('offlineCourseIds');
  const list = saved.offlineCourseIds;
  return Array.isArray(list) ? new Set(list.map(Number)) : null;
}

async function currentSurvey(settings: Settings, chosen: Set<number> | null) {
  return survey(
    await store.recordsMap(),
    await store.fileIndex(),
    (await store.getMeta('fileFailures')) || {},
    settings,
    chosen,
    Date.now()
  );
}

async function syncOnce(): Promise<void> {
  const settings = await readSettings();
  if (!settings.offlineCacheEnabled) return;

  const state = await readState();
  const now = Date.now();
  if (!fullMode && state.nextRunAfter && now < state.nextRunAfter) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  const chosen = await readChosenCourses();
  const origin = getOrigin();

  let requests = 0;
  let bytes = 0;
  const next: SyncState = { ...state, lastRunAt: now };
  const budgetLeft = () =>
    !stopRequested && (fullMode || (requests < RUN_BUDGET.requests && bytes < RUN_BUDGET.bytes));

  try {
    // Очередь пересчитывается перед каждым запросом: из обзора курса
    // появляются лонгриды, из лонгрида — его файлы, и они встают сразу за
    // ним. Каждое задание оставляет след (данные, отметку об ошибке или о
    // неудачном файле), поэтому повторно в очередь не попадает; на случай
    // ошибки в этом рассуждении — стоп, если первым снова стоит то же самое.
    let first = (await currentSurvey(settings, chosen)).jobs[0];
    if (first) {
      await log('info', fullMode ? '▶ Скачать всё: до конца очереди' : '▶ Заход по расписанию');
    }
    let previous: string | null = null;
    while (first && budgetLeft() && first.key !== previous) {
      if (requests > 0) await sleep(fullMode ? FULL_GAP_MS : REQUEST_GAP_MS);
      if (first.type === 'json') {
        requests += 1;
        await runJsonJob(origin, first, settings);
      } else {
        requests += 2;
        bytes += await runFileJob(origin, first, settings);
      }
      previous = first.key;
      first = (await currentSurvey(settings, chosen)).jobs[0];
    }
    if (requests) {
      await log(
        'info',
        !first
          ? `■ Всё скачано: запросов ${requests}, ${formatBytes(bytes)}`
          : stopRequested
            ? `■ Остановлено: запросов ${requests}, скачано ${formatBytes(bytes)}`
            : `■ Пауза до следующего захода: запросов ${requests}, скачано ${formatBytes(bytes)}`
      );
    }
    Object.assign(next, {
      lastSuccessAt: Date.now(),
      lastError: null,
      reason: null,
      failures: 0,
      nextRunAfter: 0,
    });
  } catch (error) {
    if (!(error instanceof StopRun)) throw error;
    const failures = (state.failures || 0) + 1;
    const delay =
      error.reason === 'down' ? Math.min(BACKOFF_BASE_MS * 2 ** (failures - 1), BACKOFF_MAX_MS) : 0;
    await log(
      'err',
      error.reason === 'down'
        ? `■ ${error.message} — следующая попытка через ${Math.round(delay / MINUTE)} мин`
        : `■ ${error.message}`
    );
    Object.assign(next, {
      lastError: error.message,
      reason: error.reason,
      failures,
      nextRunAfter: delay ? Date.now() + delay : 0,
    });
  } finally {
    await store.setMeta('state', next);
  }
}

/**
 * Один заход за раз: таймер, навигация и кнопка не должны пересекаться.
 * `full` — «Скачать всё»: если заход уже идёт, он просто снимает лимит.
 */
export function runOfflineSync(full = false): Promise<void> {
  if (full) {
    fullMode = true;
    stopRequested = false;
    if (running) void log('info', '▶ Скачать всё: продолжаю без лимита');
  }
  if (!running) {
    running = syncOnce()
      .catch((error) => {
        console.error('[Offline] ошибка выгрузки', error);
        return log('err', `■ Ошибка: ${(error as Error)?.message || error}`);
      })
      .finally(() => {
        running = null;
        fullMode = false;
        stopRequested = false;
      });
  }
  return running;
}

/** «Остановить»: текущий запрос доделывается, дальше — снова по таймеру. */
export function stopOfflineSync(): void {
  if (!running) return;
  stopRequested = true;
  fullMode = false;
}

/** Открыли страницу LMS — хороший момент докачать, вкладка с куками уже есть. */
export async function offlineOnLmsNavigation(): Promise<void> {
  const settings = await readSettings();
  if (!settings.offlineCacheEnabled || running) return;
  const state = await readState();
  if (state.lastRunAt && Date.now() - state.lastRunAt < NAV_MIN_GAP_MS) return;
  void runOfflineSync(false);
}

async function syncAlarm(enabled: boolean) {
  if (!browser.alarms) return;
  if (!enabled) {
    await browser.alarms.clear(ALARM);
    return;
  }
  const existing = await browser.alarms.get(ALARM);
  if (!existing) {
    browser.alarms.create(ALARM, { delayInMinutes: 1, periodInMinutes: ALARM_MINUTES });
  }
}

export function initOfflineSync(originGetter: () => string): void {
  getOrigin = originGetter;
  void readSettings().then((s) => syncAlarm(s.offlineCacheEnabled));

  browser.alarms?.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) void runOfflineSync(false);
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.offlineCacheEnabled) {
      const enabled = !!changes.offlineCacheEnabled.newValue;
      void syncAlarm(enabled);
      // Включили — сразу качаем список курсов, чтобы было из чего выбрать.
      if (enabled) void runOfflineSync(false);
    } else if (changes.offlineCourseIds) {
      // Выбрали курсы — начинаем, не дожидаясь таймера.
      void readSettings().then((s) => {
        if (s.offlineCacheEnabled) void runOfflineSync(false);
      });
    }
  });
}

// --- ДЛЯ ПОПАПА ---

// Сколько весят записи (тексты лонгридов, задания, расписание) — как JSON в
// UTF-8. Попап спрашивает статус раз в 2 секунды, поэтому результат
// запоминается, пока не поменялись записи.
let dataBytesCache: { stamp: string; bytes: number } | null = null;

function dataBytes(records: Map<string, OfflineRecord>): number {
  let latest = 0;
  for (const record of records.values()) {
    latest = Math.max(latest, record.fetchedAt || 0, record.failedAt || 0);
  }
  const stamp = `${records.size}:${latest}`;
  if (dataBytesCache?.stamp === stamp) return dataBytesCache.bytes;
  const encoder = new TextEncoder();
  let bytes = 0;
  for (const record of records.values()) bytes += encoder.encode(JSON.stringify(record)).length;
  dataBytesCache = { stamp, bytes };
  return bytes;
}

export async function offlineStatus() {
  const settings = await readSettings();
  const state = await readState();
  const chosen = await readChosenCourses();
  const records = await store.recordsMap();
  const files = await store.fileIndex();
  const { jobs, progress } = survey(
    records,
    files,
    (await store.getMeta('fileFailures')) || {},
    settings,
    chosen,
    Date.now()
  );

  let bytes = 0;
  for (const file of files.values()) bytes += file.size || 0;

  return {
    enabled: settings.offlineCacheEnabled,
    state,
    running: !!running,
    full: !!running && fullMode,
    coursesChosen: !!chosen,
    progress,
    pending: settings.offlineCacheEnabled ? jobs.length : 0,
    next: settings.offlineCacheEnabled ? jobs.slice(0, 3).map((job) => job.label) : [],
    files: files.size,
    bytes,
    // Размер копии целиком: файлы и записи.
    dataBytes: dataBytes(records),
    // Для выбора курсов: все текущие, отмеченные — те, что качаются.
    courses: (records.get('courses')?.data?.items || []).map((course: any) => ({
      id: course.id,
      name: course.name,
      enabled: !!chosen?.has(Number(course.id)),
    })),
    log: ((await store.getMeta('log')) as LogLine[] | undefined)?.slice(-120) || [],
    hasData: records.size > 0,
  };
}

export async function clearOfflineCache(): Promise<void> {
  if (running) await running;
  await store.clearAll();
  logBuffer = null;
}
