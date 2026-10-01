// Мастерская тем: то, что должно жить в background, а не на странице.
//
// Страница мастерской (plugins/workshop/workshop.html) ходит на сервер сама —
// это страница расширения, CORS ей не мешает. Сюда вынесено только то, что
// ей недоступно или что нужно ещё и плашке примерки на LMS:
//   - узнать `student_id`: куки LMS есть у background, а не у страницы
//     расширения;
//   - показать вкладку LMS, чтобы примерку было видно;
//   - закончить примерку — оставить тему или вернуть всё как было. Плашка на
//     LMS и страница мастерской шлют сюда одно и то же сообщение, поэтому
//     возврат написан один раз.
//
// Сервер: https://github.com/cu-3rd-party/lms-workshop-backend

import browser from 'webextension-polyfill';
import { LMS_HOSTS } from './plugins/lms-hosts';

export const WORKSHOP_BACKEND_ORIGIN = 'https://lms.workshop.cu3rd.ru';

const KEYS = {
  deviceKey: 'workshopDeviceKey',
  studentId: 'workshopStudentId',
  backendUrl: 'workshopBackendUrl',
  tryOn: 'workshopTryOn',
  installed: 'workshopInstalled',
} as const;

interface Snapshot {
  sync?: Record<string, unknown>;
  local?: Record<string, unknown>;
}

interface TryOn {
  themeId: string;
  versionId: string;
  number: number;
  title: string;
  roomId: string;
  backup: Snapshot;
}

/**
 * Адрес сервера. Его можно подменить ключом `workshopBackendUrl` — для
 * разработки с локальным сервером; в профиль ключ не попадает.
 */
async function backendBase(): Promise<string> {
  const stored = await browser.storage.local.get(KEYS.backendUrl);
  const url = stored[KEYS.backendUrl];
  return typeof url === 'string' && /^https?:\/\//.test(url)
    ? url.replace(/\/+$/, '')
    : WORKSHOP_BACKEND_ORIGIN;
}

/**
 * `student_id` из LMS. Отдаём наружу только его: `/students/me` возвращает
 * ещё ИНН, СНИЛС и телефон, и дальше этой функции они не уходят.
 */
export async function workshopIdentity(lmsApi: (path: string) => string): Promise<string> {
  const response = await fetch(lmsApi('/api/student-hub/students/me'), {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error('Войди в LMS — мастерская узнаёт тебя по аккаунту LMS');
  }
  if (!response.ok) throw new Error(`LMS: HTTP ${response.status}`);
  const data = (await response.json()) as { id?: unknown };
  if (typeof data.id !== 'string' || !data.id) throw new Error('LMS не отдала id студента');
  await browser.storage.local.set({ [KEYS.studentId]: data.id });
  return data.id;
}

/** Делает активной вкладку LMS; если такой нет — открывает «Мои курсы». */
export async function focusLmsTab(lmsOrigin: string): Promise<void> {
  const tabs = await browser.tabs.query({
    url: LMS_HOSTS.map((host) => `https://${host}/*`),
  });
  const tab = tabs.find((t) => t.active) ?? tabs[0];
  if (tab?.id != null) {
    await browser.tabs.update(tab.id, { active: true });
    if (tab.windowId != null) await browser.windows.update(tab.windowId, { focused: true });
    return;
  }
  await browser.tabs.create({ url: `${lmsOrigin}/learn/courses/view/actual` });
}

async function restore(snapshot: Snapshot): Promise<void> {
  for (const area of ['sync', 'local'] as const) {
    const values = snapshot[area] ?? {};
    const toSet: Record<string, unknown> = {};
    const toRemove: string[] = [];
    Object.entries(values).forEach(([key, value]) => {
      if (value === null || value === undefined) toRemove.push(key);
      else toSet[key] = value;
    });
    if (toRemove.length) await browser.storage[area].remove(toRemove);
    if (Object.keys(toSet).length) await browser.storage[area].set(toSet);
  }
}

/**
 * Отметка «поставил» на сервере — для счётчика установок. Не получилось —
 * не беда: тема уже стоит, счётчик не стоит того, чтобы ронять установку.
 */
export async function recordInstall(themeId: string, versionId: string): Promise<void> {
  const stored = await browser.storage.local.get([KEYS.deviceKey, KEYS.studentId]);
  const deviceKey = stored[KEYS.deviceKey];
  const studentId = stored[KEYS.studentId];
  if (typeof deviceKey !== 'string' || typeof studentId !== 'string') return;
  try {
    await fetch(`${await backendBase()}/api/v1/themes/${encodeURIComponent(themeId)}/install`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deviceKey}`,
        'X-Student-Id': studentId,
      },
      body: JSON.stringify({ version_id: versionId }),
    });
  } catch (_error) {
    // сервер недоступен — счётчик подождёт
  }
}

/** Запоминает, какая версия какой темы стоит, — чтобы показать «есть обновление». */
export async function markInstalled(entry: Omit<TryOn, 'backup'>): Promise<void> {
  const stored = await browser.storage.local.get(KEYS.installed);
  const installed = (stored[KEYS.installed] as Record<string, unknown> | undefined) ?? {};
  installed[entry.themeId] = {
    versionId: entry.versionId,
    number: entry.number,
    title: entry.title,
    roomId: entry.roomId,
    installedAt: new Date().toISOString(),
  };
  await browser.storage.local.set({ [KEYS.installed]: installed });
}

/**
 * Конец примерки. `keep` — оставить тему (это и есть установка), иначе
 * вернуть настройки из снимка, сделанного перед примеркой.
 */
export async function endTryOn(keep: boolean): Promise<{ ended: boolean }> {
  const stored = await browser.storage.local.get(KEYS.tryOn);
  const tryOn = stored[KEYS.tryOn] as TryOn | undefined;
  if (!tryOn) return { ended: false };

  if (keep) {
    const { backup: _backup, ...entry } = tryOn;
    await markInstalled(entry);
    void recordInstall(tryOn.themeId, tryOn.versionId);
  } else {
    await restore(tryOn.backup ?? {});
  }
  await browser.storage.local.remove(KEYS.tryOn);
  return { ended: true };
}
