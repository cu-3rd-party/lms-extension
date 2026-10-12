// Как попасть в офлайн-копию, когда LMS лежит.
//
// Кнопка плагина живёт на странице LMS, а если LMS не открывается, страницы
// нет — и меню тоже. Про кнопку расширения на панели браузера студент может
// не знать. Поэтому есть адрес, который легко запомнить:
// my.centraluniversity.ru/offline (и my.cu.ru/offline). Переход
// перехватывается в onBeforeNavigate — до запроса к LMS, так что работает и
// при лежащей LMS, и при живой.
//
// Сами в копию не перекидываем, даже если LMS не открылась: плагин может
// ошибиться, а студент тогда не попадёт в работающую LMS.

import browser from 'webextension-polyfill';
import { isLmsUrl } from '../plugins/lms-hosts';

const OFFLINE_PAGE = 'offline/offline.html';
const OFFLINE_PATHS = new Set(['/offline', '/offline/']);

function isOfflineShortcut(url: string): boolean {
  if (!isLmsUrl(url)) return false;
  return OFFLINE_PATHS.has(new URL(url).pathname);
}

export function initOfflineEntry(): void {
  const navFilter = {
    url: [{ hostSuffix: 'centraluniversity.ru' }, { hostSuffix: 'cu.ru' }],
  };

  browser.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId !== 0 || !isOfflineShortcut(details.url)) return;
    void browser.tabs.update(details.tabId, { url: browser.runtime.getURL(OFFLINE_PAGE) });
  }, navFilter);
}
