// plugin_page_loader.js - ПОЛНАЯ ФИНАЛЬНАЯ ВЕРСИЯ (с Gist и динамической темой)
'use strict';

// --- КОНСТАНТЫ ---
// var используется намеренно: скрипт может быть внедрён повторно при SPA-навигации,
// и const/let бросили бы SyntaxError «already declared».
var OVERLAY_ID = 'cu-plugin-overlay-container';
var CONTENT_WRAPPER_ID = 'cu-plugin-content-wrapper';
var PLUGIN_BUTTON_ID = 'cu-plugin-main-button';
var GIST_PANEL_ID = 'cu-plugin-gist-right-panel';
var NEWS_BUTTON_ID = 'cu-plugin-news-button';
var WORKSHOP_BANNER_ID = 'cu-plugin-workshop-banner';
var GIST_STYLE_ID = 'cu-gist-dark-theme-injected-style';
var leftIframe = leftIframe || null;

/**
 * Скрывает оверлей.
 */
function cleanupPluginState() {
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) {
    overlay.style.display = 'none';
  }
}

/**
 * Пункт меню профиля собираем клонированием нативного: Taiga 5 стилизует
 * кнопку по `data-tui-version`, а меню — по `_ngcontent-*`, без них пункт
 * выходит без отступов и иконки. Функция глобальная — ею пользуется и
 * feedback_menu.js, который внедряется следом.
 */
function createUserActionItem(list, id, title, iconUrl) {
  const native = list.querySelector('li');
  const item = native ? native.cloneNode(true) : document.createElement('li');
  if (!native) {
    item.innerHTML = `<button tuiappearance="" tuiicons="" tuibutton="" type="button" size="m" class="user-actions__action-button" data-appearance="tertiary" data-size="m"><div class="user-actions__action-title"></div></button>`;
  }
  const button = item.querySelector('button');
  button.id = id;
  button.removeAttribute('custatistevent');
  button.setAttribute('data-icon-start', 'svg');
  button.style.setProperty('--t-icon-start', `url("${iconUrl}")`);
  item.querySelector('.user-actions__action-title').textContent = title;
  return item;
}

// --- БЛОК ОДНОРАЗОВОЙ ИНИЦИАЛИЗАЦИИ ---
if (typeof window.isPluginPageLoaderInitialized === 'undefined') {
  window.isPluginPageLoaderInitialized = true;
  window.isGistContentLoaded = false;

  /**
   * Применяет тему (светлую/темную) к контейнеру плагина.
   * @param {boolean} isEnabled - Включена ли темная тема.
   */
  function applyContainerTheme(isEnabled) {
    const contentWrapper = document.getElementById(CONTENT_WRAPPER_ID);
    const rightPanel = document.getElementById(GIST_PANEL_ID);
    const newsButton = document.getElementById(NEWS_BUTTON_ID);
    if (!contentWrapper || !rightPanel) return;

    if (isEnabled) {
      contentWrapper.style.background = '#2c2c2e';
      rightPanel.style.color = '#e0e0e0';
      if (newsButton) {
        newsButton.style.background = 'rgba(44,44,46,0.92)';
        newsButton.style.color = '#e8eaed';
      }
    } else {
      contentWrapper.style.background = '#ffffff';
      rightPanel.style.color = '#333333';
      if (newsButton) {
        newsButton.style.background = 'rgba(255,255,255,0.92)';
        newsButton.style.color = '#333333';
      }
    }
  }

  /**
   * Открывает меню плагина и применяет актуальную тему.
   */
  async function openPluginMenu() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    const themeData = await browser.storage.sync.get('themeEnabled');
    applyContainerTheme(!!themeData.themeEnabled);

    overlay.style.display = 'flex';
  }

  /**
   * Закрывает меню, запрашивает изменения у iframe и перезагружает, если нужно.
   */
  function closePluginMenu() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay || !leftIframe) return;

    overlay.style.display = 'none';
    leftIframe.contentWindow.postMessage({ action: 'getPendingChanges' }, '*');
  }

  /**
   * Обработчик для кнопки плагина.
   */
  function handlePluginToggle() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    const isVisible = overlay.style.display === 'flex';

    if (isVisible) {
      closePluginMenu();
    } else {
      openPluginMenu();
    }
  }

  /**
   * Создает DOM-структуру плагина.
   */
  function createPluginStructure() {
    if (document.getElementById(OVERLAY_ID)) return;
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    // Сверху отступ больше: там висит кнопка «Что нового», и в узком окне
    // она наезжала на полосу вкладок меню.
    overlay.style.cssText = `position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0, 0, 0, 0.6); z-index: 10000; display: none; justify-content: center; align-items: center; padding: 56px 40px 40px; box-sizing: border-box;`;

    // Меню — это сам попап. Раньше рядом на пол-экрана висела панель с
    // гитхабом: она открывалась всегда, занимала больше места, чем настройки,
    // и мешала в них ориентироваться. Теперь она за кнопкой в углу.
    const contentWrapper = document.createElement('div');
    contentWrapper.id = CONTENT_WRAPPER_ID;
    contentWrapper.style.cssText = `display: flex; gap: 0; height: 100%; max-height: 820px; width: min(980px, calc(100vw - 80px)); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); overflow: hidden; transition: background-color 0.3s, width 0.2s;`;

    leftIframe = document.createElement('iframe');
    leftIframe.src = chrome.runtime.getURL('popup/popup.html');
    // Меню — вкладки слева и настройки справа, при 980 px просторно обоим.
    // На узком экране попап сам переносит вкладки в полосу сверху.
    leftIframe.style.cssText = `flex: 1 1 auto; min-width: 320px; border: none;`;

    const rightPanel = document.createElement('div');
    rightPanel.id = GIST_PANEL_ID;
    // Свёрнута по умолчанию; ширину и отступы получает только раскрытой,
    // иначе пустая колонка растягивала бы окно.
    // Панель не съедает меню: на узком экране она ужимается, а не растёт.
    rightPanel.style.cssText = `display: none; flex: 0 0 520px; max-width: 40%; height: 100%; overflow: auto; padding: 20px; box-sizing: border-box; border-left: 1px solid rgba(128,128,128,0.25); transition: color 0.3s;`;
    rightPanel.textContent = 'Загрузка...';

    const newsButton = document.createElement('button');
    newsButton.id = NEWS_BUTTON_ID;
    newsButton.type = 'button';
    newsButton.textContent = 'Что нового';
    newsButton.style.cssText = `position: absolute; top: 16px; right: 16px; padding: 7px 14px; border: none; border-radius: 999px; font: 13px/1 'Inter', sans-serif; cursor: pointer; background: rgba(255,255,255,0.92); color: #333; box-shadow: 0 2px 8px rgba(0,0,0,0.25);`;
    newsButton.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleNewsPanel();
    });

    contentWrapper.appendChild(leftIframe);
    contentWrapper.appendChild(rightPanel);
    overlay.appendChild(contentWrapper);
    overlay.appendChild(newsButton);
    overlay.appendChild(createWorkshopBanner());
    document.body.appendChild(overlay);

    overlay.addEventListener('click', closePluginMenu);
    contentWrapper.addEventListener('click', (e) => e.stopPropagation());
  }

  /**
   * Вход в 3rd-theme workshop — в левом верхнем углу оверлея, вне меню, напротив
   * «Что нового». Тёмный, в цветах 3rd party, при любой теме меню. 3rd-theme workshop
   * открывается отдельной вкладкой, меню закрывается — как и по кнопке во
   * вкладке «Тема».
   */
  function createWorkshopBanner() {
    const banner = document.createElement('button');
    banner.id = WORKSHOP_BANNER_ID;
    banner.type = 'button';
    banner.title = 'Темы других студентов: примерить, поставить, опубликовать свою';
    banner.style.cssText = `position: absolute; top: 8px; left: 16px; display: flex; align-items: center; gap: 9px; height: 40px; padding: 0 14px 0 10px; border: 1px solid rgba(255,255,255,0.14); border-radius: 12px; background: linear-gradient(135deg, #1b1d21 0%, #2b2f36 100%); color: #f2f2f4; font: 13px/1.2 'Inter', sans-serif; text-align: left; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.3); transition: transform 0.15s ease, box-shadow 0.15s ease;`;

    const svgNs = 'http://www.w3.org/2000/svg';
    const logo = document.createElementNS(svgNs, 'svg');
    logo.setAttribute('viewBox', '0 0 152 147');
    logo.setAttribute('aria-hidden', 'true');
    logo.style.cssText = 'flex: 0 0 24px; width: 24px; height: 23px; fill: currentColor;';
    const path = document.createElementNS(svgNs, 'path');
    // Знак 3rd party.
    path.setAttribute(
      'd',
      'M151.803 64.031 108.512 91.58v51.539l-6.218 3.695-35.063-19.454 8.104-5.153 24.799 13.749v-39.06l-40.87 26.027L.404 90.461v-7.264L43.68 55.649V4.097L49.9.403l58.6 32.499v48.686l32.802-20.874-24.823-13.75v-9.638l35.312 19.441.012 6.634zM96.076 89.505l-48.037-26.63-37.135 23.64 39.02 21.615 9.041 5.002 37.123-23.627zm4.045-51.614L52.072 11.248v44.225l48.037 26.63V37.891z'
    );
    logo.appendChild(path);

    const text = document.createElement('span');
    text.style.cssText = 'display: flex; flex-direction: column;';
    const title = document.createElement('span');
    title.textContent = '3rd-theme workshop';
    title.style.cssText = 'font-weight: 600; white-space: nowrap;';
    const by = document.createElement('span');
    by.textContent = 'темы для LMS';
    by.style.cssText = 'font-size: 11px; color: #9aa0a6;';
    text.append(title, by);
    banner.append(logo, text);

    banner.addEventListener('mouseenter', () => {
      banner.style.transform = 'translateY(-1px)';
      banner.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
    });
    banner.addEventListener('mouseleave', () => {
      banner.style.transform = '';
      banner.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
    });
    banner.addEventListener('click', (e) => {
      e.stopPropagation();
      browser.runtime.sendMessage({ action: 'OPEN_WORKSHOP' });
      closePluginMenu();
    });
    return banner;
  }

  /**
   * Показывает или прячет панель с новостями. Содержимое тянем при первом
   * открытии: обычно оно не нужно, а запрос не бесплатный.
   */
  function toggleNewsPanel() {
    const rightPanel = document.getElementById(GIST_PANEL_ID);
    const newsButton = document.getElementById(NEWS_BUTTON_ID);
    if (!rightPanel) return;

    const wrapper = document.getElementById(CONTENT_WRAPPER_ID);
    const willOpen = rightPanel.style.display === 'none';
    rightPanel.style.display = willOpen ? 'block' : 'none';
    if (wrapper) {
      wrapper.style.width = willOpen
        ? 'min(1500px, calc(100vw - 80px))'
        : 'min(980px, calc(100vw - 80px))';
    }
    if (newsButton) newsButton.textContent = willOpen ? 'Скрыть новости' : 'Что нового';

    if (willOpen && !window.isGistContentLoaded) fetchGistContent();
  }

  /**
   * Устанавливает "вечный" наблюдатель за DOM для кнопки.
   */
  function setupPersistentButtonInjector() {
    const observer = new MutationObserver(() => {
      const userActionsList = document.querySelector('ul.user-actions');
      if (userActionsList && !document.getElementById(PLUGIN_BUTTON_ID)) {
        const pluginListItem = createUserActionItem(
          userActionsList,
          PLUGIN_BUTTON_ID,
          'Плагин',
          chrome.runtime.getURL('icons/plugin.svg')
        );
        pluginListItem
          .querySelector(`#${PLUGIN_BUTTON_ID}`)
          .addEventListener('click', handlePluginToggle);
        userActionsList.appendChild(pluginListItem);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // --- ПОЛНЫЙ КОД ДЛЯ GIST И ТЕМЫ ---

  /**
   * Вставляет или удаляет CSS для темной темы Gist'a
   * @param {boolean} isEnabled
   */
  async function applyGistTheme(isEnabled) {
    const existingStyle = document.getElementById(GIST_STYLE_ID);
    if (isEnabled && !existingStyle) {
      try {
        const response = await fetch(chrome.runtime.getURL('gist_dark.css'));
        const css = await response.text();
        const style = document.createElement('style');
        style.id = GIST_STYLE_ID;
        style.textContent = css;
        document.head.appendChild(style);
      } catch (e) {
        console.error('Не удалось загрузить gist_dark.css:', e);
      }
    } else if (!isEnabled && existingStyle) {
      existingStyle.remove();
    }
  }

  /**
   * Загружает и отображает Gist.
   */
  async function fetchGistContent() {
    window.isGistContentLoaded = true;
    const rightPanel = document.getElementById(GIST_PANEL_ID);
    if (!rightPanel) return;

    rightPanel.textContent = 'Загрузка Gist...';

    let data;
    try {
      data = await browser.storage.sync.get('themeEnabled');
    } catch (e) {
      rightPanel.textContent = 'Ошибка: контекст расширения недоступен. Перезагрузите страницу.';
      return;
    }
    applyGistTheme(!!data.themeEnabled);

    try {
      chrome.runtime.sendMessage(
        {
          action: 'fetchGistContent',
          url: 'https://gist.github.com/xfx1337/76aaac0351cfaf6f099d67eaf79b00b7.js',
        },
        (response) => {
          if (chrome.runtime.lastError) {
            rightPanel.textContent = 'Ошибка: ' + chrome.runtime.lastError.message;
            return;
          }
          if (response && response.success) {
            rightPanel.innerHTML = response.html;
            if (response.cssUrl && !document.getElementById('gist-stylesheet')) {
              const gistStyle = document.createElement('link');
              gistStyle.id = 'gist-stylesheet';
              gistStyle.rel = 'stylesheet';
              gistStyle.type = 'text/css';
              gistStyle.href = response.cssUrl;
              document.head.appendChild(gistStyle);
            }
          } else {
            rightPanel.textContent =
              'Ошибка загрузки Gist: ' + (response ? response.error : 'Нет ответа.');
          }
        }
      );
    } catch (e) {
      rightPanel.textContent = 'Ошибка: контекст расширения недоступен. Перезагрузите страницу.';
    }
  }

  // --- СЛУШАТЕЛИ ---

  // Слушатель сообщений от iframe
  window.addEventListener('message', async (event) => {
    if (event.source !== leftIframe.contentWindow) return;
    if (event.data && event.data.action === 'receivePendingChanges') {
      const changes = event.data.payload;
      const shouldReload = !!event.data.shouldReload;
      // Изменения уже сохранены popup.js напрямую в storage — здесь только резервное сохранение
      if (Object.keys(changes).length > 0) {
        await browser.storage.sync.set(changes);
      }
      // Перезагрузка только если это реально нужно (снег, стикер)
      if (shouldReload) location.reload();
    }

    // Редактор тем и мастерская открываются отдельной вкладкой (её создаёт
    // background по запросу попапа) — здесь остаётся только убрать меню со
    // страницы, чтобы она была видна: пипетка и примерка работают по ней.
    if (
      event.data &&
      (event.data.action === 'openThemeEditor' || event.data.action === 'openWorkshop')
    ) {
      closePluginMenu();
    }
  });

  // Слушатель изменений темы
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && 'themeEnabled' in changes) {
      applyContainerTheme(!!changes.themeEnabled.newValue);
      applyGistTheme(!!changes.themeEnabled.newValue);
    }
  });

  // --- ЗАПУСК ОДНОРАЗОВОЙ ЛОГИКИ ---
  createPluginStructure();
  setupPersistentButtonInjector();
}

// --- КОД, ВЫПОЛНЯЕМЫЙ ПРИ КАЖДОЙ НАВИГАЦИИ ---
cleanupPluginState();
