// metrics.ts — анонимная статистика использования в Яндекс Метрику.
//
// Что хотим знать: сколько людей пользуется расширением, в каких браузерах и
// какими функциями. Отсюда два вида событий:
//   - раз в сутки «снимок» — просмотр страницы `/daily` с параметрами визита:
//     версия, сборка и состояние тумблеров функций (вкл/выкл). Отвечает на
//     вопрос «у скольких включена функция»;
//   - цели на действия (`trackGoal`) — выгрузил оценки, открыл PDF, создал
//     заявку на обмен пары. Включённая функция ещё не значит, что ею
//     пользуются. Список целей — GOALS в metrics-hit.ts.
// Браузер и ОС Метрика определяет сама по User-Agent запроса.
//
// Почему не код счётчика `tag.js`. Manifest V3 запрещает исполнять скрипты с
// чужих серверов — Chrome Web Store за такое отклоняет расширение, — а
// подсовывать его на страницу LMS значит запускать чужой код внутри LMS.
// Поэтому запросы собираем сами в том же формате, что шлёт `tag.js`; формат
// описан в конфиге Метрики для AMP:
// https://github.com/ampproject/amphtml/blob/main/extensions/amp-analytics/0.1/vendors/metrika.json
//
// Запрос уходит с `mode: 'no-cors'` и без cookie: ответ нам не нужен, а без
// разрешения на mc.yandex.ru в host_permissions Chrome не станет при
// обновлении отключать расширение до подтверждения нового разрешения.
//
// Кто такой «пользователь». Cookie Метрики у запросов из фона не работают
// (сторонние, а в Firefox и Safari ещё и изолированы), поэтому id установки
// генерируем сами в формате `_ym_uid` и передаём в поле `u`. Ничего из LMS —
// почту, имя, id студента, адреса страниц — не отправляем.
//
// Выключается в попапе (Настройки → «Анонимная статистика»), по умолчанию
// включено. В Firefox сверх того нужно его собственное согласие на
// `technicalAndInteraction` — человек даёт его при установке или в
// about:addons (см. `firefoxConsent`).

import browser from 'webextension-polyfill';
import {
  FEATURE_TOGGLES,
  METRICS_KEYS,
  buildHitUrl,
  featureSnapshot,
  localDay,
  makeClientId,
  type Goal,
  type Hit,
} from './metrics-hit';

export { GOALS, METRICS_KEYS, isGoal, type Goal } from './metrics-hit';

// ---------------------------------------------------------------------------
// Согласие
// ---------------------------------------------------------------------------

/**
 * Согласие Firefox на технические данные. `null` — браузер такого согласия не
 * знает (Chrome, Safari, Firefox до 140): решает только наш выключатель.
 */
async function firefoxConsent(): Promise<boolean | null> {
  try {
    const perms = (await browser.permissions.getAll()) as { data_collection?: string[] };
    if (!Array.isArray(perms.data_collection)) return null;
    return perms.data_collection.includes('technicalAndInteraction');
  } catch (_error) {
    return null;
  }
}

export async function isMetricsAllowed(): Promise<boolean> {
  const data = await browser.storage.sync.get(METRICS_KEYS.enabled);
  if (data[METRICS_KEYS.enabled] === false) return false;
  return (await firefoxConsent()) !== false;
}

// ---------------------------------------------------------------------------
// Запрос
// ---------------------------------------------------------------------------

async function clientId(): Promise<string> {
  const data = await browser.storage.local.get(METRICS_KEYS.clientId);
  const saved = data[METRICS_KEYS.clientId];
  if (typeof saved === 'string' && /^\d{17,19}$/.test(saved)) return saved;

  const created = makeClientId();
  await browser.storage.local.set({ [METRICS_KEYS.clientId]: created });
  return created;
}

/** Сборка расширения: Метрика видит браузер, но не то, какую сборку в нём поставили. */
function buildName(): string {
  if (typeof (browser.runtime as { getBrowserInfo?: unknown }).getBrowserInfo === 'function') {
    return 'firefox';
  }
  const ua = navigator.userAgent;
  return /Safari\//.test(ua) && !/Chrome\/|Chromium\//.test(ua) ? 'safari' : 'chrome';
}

function baseParams(): Record<string, unknown> {
  return { version: browser.runtime.getManifest().version, build: buildName() };
}

async function send(hit: Omit<Hit, 'clientId' | 'language'>): Promise<void> {
  if (!(await isMetricsAllowed())) return;
  const url = buildHitUrl({
    ...hit,
    clientId: await clientId(),
    language: navigator.language,
  });
  await fetch(url, { mode: 'no-cors', credentials: 'omit', cache: 'no-store' });
}

// ---------------------------------------------------------------------------
// Наружу
// ---------------------------------------------------------------------------

/** Цель на действие. Ошибки глотает: статистика не должна ломать функцию. */
export function trackGoal(goal: Goal, params?: Record<string, unknown>): void {
  void send({ kind: 'goal', target: goal, params: { ...baseParams(), ...params } }).catch(() => {});
}

// День, за который снимок уже ушёл, — чтобы не читать storage на каждой
// навигации. Service worker засыпает и теряет его, тогда выручает
// METRICS_KEYS.lastDaily.
let dailySentOn = '';
let dailyInflight = false;

/** Снимок раз в сутки. Зовётся при каждой навигации по LMS. */
export function maybeSendDaily(): void {
  const today = localDay();
  if (dailyInflight || dailySentOn === today) return;
  dailyInflight = true;

  void (async () => {
    const data = await browser.storage.local.get(METRICS_KEYS.lastDaily);
    if (data[METRICS_KEYS.lastDaily] !== today) {
      // Выключенная статистика день не «тратит»: включат — снимок уйдёт сразу.
      if (!(await isMetricsAllowed())) return;

      // День записываем до отправки: упавший запрос не повторяем на каждой
      // навигации, завтра будет новый.
      await browser.storage.local.set({ [METRICS_KEYS.lastDaily]: today });
      const stored = await browser.storage.sync.get(Object.keys(FEATURE_TOGGLES));
      await send({
        kind: 'pageview',
        target: 'daily',
        title: 'Ежедневный снимок',
        params: { ...baseParams(), features: featureSnapshot(stored) },
      });
    }
    dailySentOn = today;
  })()
    .catch(() => {})
    .finally(() => {
      dailyInflight = false;
    });
}

/** Установка и обновление расширения. */
export function trackInstall(reason: string, previousVersion?: string): void {
  if (reason === 'install') trackGoal('install');
  if (reason === 'update') trackGoal('update', { from: previousVersion ?? '' });
}
