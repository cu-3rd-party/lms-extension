// plugin_page_loader.js - ПОЛНАЯ ФИНАЛЬНАЯ ВЕРСИЯ (с Gist и динамической темой)
'use strict';

// --- КОНСТАНТЫ ---
const OVERLAY_ID = 'cu-plugin-overlay-container';
const CONTENT_WRAPPER_ID = 'cu-plugin-content-wrapper';
const PLUGIN_BUTTON_ID = 'cu-plugin-main-button';
const GIST_PANEL_ID = 'cu-plugin-gist-right-panel';
const GIST_STYLE_ID = 'cu-gist-dark-theme-injected-style';
let leftIframe = null;

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
        if (!contentWrapper || !rightPanel) return;

        if (isEnabled) {
            contentWrapper.style.background = '#2c2c2e';
            rightPanel.style.color = '#e0e0e0';
        } else {
            contentWrapper.style.background = '#ffffff';
            rightPanel.style.color = '#333333';
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

        if (!window.isGistContentLoaded) {
            fetchGistContent();
        }
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
        
        const contentWrapper = document.createElement('div');
        contentWrapper.id = CONTENT_WRAPPER_ID;
        contentWrapper.style.cssText = `display: flex; gap: 15px; width: 100%; max-width: 1400px; height: 100%; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); overflow: hidden; transition: background-color 0.3s;`;
        
        leftIframe = document.createElement('iframe');
        leftIframe.src = chrome.runtime.getURL('popup.html');
        leftIframe.style.cssText = `flex: 0 0 380px; border: none;`;
        
        const rightPanel = document.createElement('div');
        rightPanel.id = GIST_PANEL_ID;
        rightPanel.style.cssText = `flex-grow: 1; height: 100%; overflow: auto; padding: 20px; box-sizing: border-box; transition: color 0.3s;`;
        rightPanel.textContent = 'Загрузка...';
        
        contentWrapper.appendChild(leftIframe);
        contentWrapper.appendChild(rightPanel);
        overlay.appendChild(contentWrapper);
        document.body.appendChild(overlay);

        overlay.addEventListener('click', closePluginMenu);
        contentWrapper.addEventListener('click', (e) => e.stopPropagation());
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
                pluginListItem.querySelector(`#${PLUGIN_BUTTON_ID}`).addEventListener('click', handlePluginToggle);
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
                console.error("Не удалось загрузить gist_dark.css:", e);
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
        const data = await browser.storage.sync.get('themeEnabled');
        applyGistTheme(!!data.themeEnabled);
        
        chrome.runtime.sendMessage({ action: "fetchGistContent", url: "https://gist.github.com/xfx1337/76aaac0351cfaf6f099d67eaf79b00b7.js" }, (response) => {
             if (chrome.runtime.lastError) { 
                 rightPanel.textContent = "Ошибка: " + chrome.runtime.lastError.message; 
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
                 rightPanel.textContent = "Ошибка загрузки Gist: " + (response ? response.error : "Нет ответа."); 
             }
        });
    }

    // --- СЛУШАТЕЛИ ---

    // Слушатель сообщений от iframe
    window.addEventListener('message', async (event) => {
        if (event.source !== leftIframe.contentWindow) return;
        if (event.data && event.data.action === 'receivePendingChanges') {
            const changes = event.data.payload;
            if (Object.keys(changes).length > 0) {
                await browser.storage.sync.set(changes);
                location.reload();
            }
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