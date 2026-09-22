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
    overlay.style.cssText = `position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0, 0, 0, 0.6); z-index: 10000; display: none; justify-content: center; align-items: center; padding: 40px; box-sizing: border-box;`;

    // Меню — это сам попап. Раньше рядом на пол-экрана висела панель с
    // гитхабом: она открывалась всегда, занимала больше места, чем настройки,
    // и мешала в них ориентироваться. Теперь она за кнопкой в углу.
    const contentWrapper = document.createElement('div');
    contentWrapper.id = CONTENT_WRAPPER_ID;
    contentWrapper.style.cssText = `display: flex; gap: 0; height: 100%; max-height: 820px; width: min(740px, calc(100vw - 80px)); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); overflow: hidden; transition: background-color 0.3s, width 0.2s;`;

    leftIframe = document.createElement('iframe');
    leftIframe.src = chrome.runtime.getURL('popup/popup.html');
    // Меню раскладывает разделы в два столбца — при 740 px их видно оба.
    // Если места меньше, попап сам схлопнет колонки в одну.
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
    document.body.appendChild(overlay);

    overlay.addEventListener('click', closePluginMenu);
    contentWrapper.addEventListener('click', (e) => e.stopPropagation());
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
        ? 'min(1260px, calc(100vw - 80px))'
        : 'min(740px, calc(100vw - 80px))';
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
        const pluginListItem = document.createElement('li');
        pluginListItem.innerHTML = `<button id="${PLUGIN_BUTTON_ID}" tuiappearance="" tuiicons="" tuibutton="" type="button" size="m" class="user-actions__action-button" data-appearance="tertiary" data-icon-start="svg" data-size="m" style="--t-icon-start: url(${chrome.runtime.getURL('icons/plugin.svg')});"><div class="user-actions__action-title">Плагин</div></button>`;
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

    // Редактор тем открывается отдельной вкладкой (её создаёт background по
    // запросу попапа) — здесь остаётся только убрать меню со страницы, чтобы
    // она была видна: пипетка работает именно по ней.
    if (event.data && event.data.action === 'openThemeEditor') {
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
