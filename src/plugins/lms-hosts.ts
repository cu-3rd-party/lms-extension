// Домены LMS. У ЦУ их два, и это полноценные зеркала одного приложения:
// одинаковые пути, одинаковый API. Сессии при этом раздельные — cookie живут
// на своём домене, поэтому запросы всегда идут на тот origin, где сейчас
// работает пользователь, а не на зашитый в код.
//
// Список продублирован литералами в `manifest.config.js` (host_permissions,
// content_scripts, web_accessible_resources): манифест собирается отдельно, и
// тянуть туда импорт из src ради трёх строк не стоит. При добавлении домена
// правь оба места.

export const LMS_HOSTS = ['my.centraluniversity.ru', 'my.cu.ru'];

/** Куда ходить, пока не знаем, на каком домене сидит пользователь. */
export const DEFAULT_LMS_ORIGIN = 'https://my.centraluniversity.ru';

/** Страница LMS — любая из на обоих доменов. */
export function isLmsUrl(url: string | undefined | null): boolean {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && LMS_HOSTS.includes(parsed.hostname);
  } catch (_error) {
    return false;
  }
}

/** Origin страницы LMS или null, если это не она. */
export function lmsOriginOf(url: string | undefined | null): string | null {
  return isLmsUrl(url) ? new URL(url as string).origin : null;
}
