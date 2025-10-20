// dark_theme.js (кросс-браузерная версия)
'use strict';

// "Предохранитель" от повторного запуска.
if (typeof window.darkThemeInitialized === 'undefined') {
    window.darkThemeInitialized = true;

    const STYLE_ID_BASE = 'culms-dark-theme-style-base';
    const STYLE_ID_OLED = 'culms-dark-theme-style-oled';
    let themeToggleButton = null;

    /**
     * Применяет или удаляет CSS темной темы со страницы.
     */
    async function applyTheme(isEnabled) {
        const base = document.getElementById(STYLE_ID_BASE);
        const oled = document.getElementById(STYLE_ID_OLED);

        if (!isEnabled) {
            if (base) base.remove();
            if (oled) oled.remove();
            return;
        }

        // Убеждаемся, что базовая темная таблица стилей присутствует
        if (!base) {
            const respBase = await fetch(browser.runtime.getURL('style.css'));
            const cssBase = await respBase.text();
            const styleBase = document.createElement('style');
            styleBase.id = STYLE_ID_BASE;
            styleBase.textContent = cssBase;
            document.head.appendChild(styleBase);
        }

        // Применяем или удаляем OLED-переопределения поверх базовых
        const { oledEnabled } = await browser.storage.sync.get('oledEnabled');
        if (oledEnabled) {
            if (!document.getElementById(STYLE_ID_OLED)) {
                const respOled = await fetch(browser.runtime.getURL('style_oled.css'));
                const cssOled = await respOled.text();
                const styleOled = document.createElement('style');
                styleOled.id = STYLE_ID_OLED;
                styleOled.textContent = cssOled;
                document.head.appendChild(styleOled);
            }
        } else if (oled) {
            oled.remove();
        }
    }

    /**
     * Обновляет иконку и подсказку на кнопке.
     */
    async function updateButtonState() {
        if (!themeToggleButton) return;
        const data = await browser.storage.sync.get('themeEnabled');
        const isEnabled = !!data.themeEnabled;
        const iconUrl = isEnabled ? 'icons/sun.svg' : 'icons/moon.svg';
        themeToggleButton.style.setProperty('--t-icon-start', `url(${browser.runtime.getURL(iconUrl)})`);
        themeToggleButton.title = isEnabled ? 'Переключить на светлую тему' : 'Переключить на темную тему';
    }

    /**
     * Создает и настраивает кнопку переключения темы.
     */
    function createThemeToggleButton() {
        const listItem = document.createElement('li');
        listItem.setAttribute('automation-id', 'header-action-theme-toggle');
        listItem.classList.add('theme-toggle-container');
        listItem.style.display = 'flex';
        listItem.style.alignItems = 'center';

        const button = document.createElement('button');
        button.setAttribute('tuiappearance', '');
        button.setAttribute('tuiicons', '');
        button.setAttribute('tuiiconbutton', '');
        button.type = 'button';
        button.setAttribute('data-appearance', 'tertiary-no-padding');
        button.setAttribute('data-size', 'm');
        button.classList.add('button-action');

        button.addEventListener('click', async () => {
            const data = await browser.storage.sync.get('themeEnabled');
            await browser.storage.sync.set({ themeEnabled: !data.themeEnabled });
        });

        listItem.appendChild(button);
        themeToggleButton = button;
        updateButtonState();
        return listItem;
    }

    /**
     * Ищет место для вставки и добавляет туда кнопку.
     */
    function addButtonToHeader() {
        if (document.querySelector('.theme-toggle-container')) return;

        const headerActionsList = document.querySelector('ul.header__actions-list');
        const userProfileMenu = document.querySelector('cu-user-profile-menu');

        if (headerActionsList && userProfileMenu) {
            const toggleButtonElement = createThemeToggleButton();
            headerActionsList.insertBefore(toggleButtonElement, userProfileMenu.parentElement);
        }
    }

    /**
     * Ожидает появления элемента в DOM и затем выполняет действие.
     */
    function waitForHeaderAndAddButton() {
        const observer = new MutationObserver((mutations, obs) => {
            if (document.querySelector('ul.header__actions-list')) {
                addButtonToHeader();
                obs.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // --- ОСНОВНАЯ ЛОГИКА ---

    // 1. Слушаем изменения в хранилище.
    browser.storage.onChanged.addListener(async (changes, namespace) => {
        const themeChanged = 'themeEnabled' in changes;
        const oledChanged = 'oledEnabled' in changes;
        if (themeChanged || oledChanged) {
            const data = await browser.storage.sync.get(['themeEnabled', 'oledEnabled']);
            // Применяем базовую и OLED-тему соответственно
            await applyTheme(!!data.themeEnabled);
            updateButtonState();
            // Также синхронизируем ShadowDOM
            toggleShadowDomTheme(!!data.themeEnabled, !!data.oledEnabled);
        }
    });

    // 2. Применяем тему при первой загрузке скрипта.
    browser.storage.sync.get(['themeEnabled', 'oledEnabled']).then((data) => {
        if (data.themeEnabled) {
            applyTheme(true);
            toggleShadowDomTheme(true, !!data.oledEnabled);
        }
    });

    // 3. Пытаемся добавить кнопку сразу, а если не получилось - ждем появления шапки.
    addButtonToHeader();
    waitForHeaderAndAddButton();


    // --- НОВЫЙ БЛОК: Логика для Shadow DOM ---

    const SHADOW_STYLE_ID_NEW = 'culms-shadow-theme-fix'; // Уникальный ID для стилей в Shadow DOM

    const shadowDomCssTextDark = `
        :host, :root {
            --informer-tui-base-01: rgb(32, 33, 36) !important;
            --informer-tui-base-02: rgb(40, 41, 44) !important;
            --informer-tui-base-03: rgb(55, 56, 60) !important;
            --informer-tui-elevation-01: rgb(32, 33, 36) !important;
            --informer-tui-background-base: rgb(32, 33, 36) !important;
            --informer-tui-const-white: rgb(32, 33, 36) !important;
            --informer-tui-text-01: rgb(255, 255, 255) !important;
            --informer-tui-text-02: #BDC1C6 !important;
            --informer-tui-text-03: #BDC1C6 !important;
            --informer-tui-text-primary: rgb(255, 255, 255) !important;
            --informer-tui-text-secondary: #BDC1C6 !important;
            --informer-tui-text-tertiary: #BDC1C6 !important;
            --informer-tui-primary: #4285F4 !important;
            --informer-tui-primary-text: #ffffff !important;
            --informer-tui-secondary: rgb(40, 41, 44) !important;
            --informer-tui-secondary-hover: rgb(55, 56, 60) !important;
            --informer-tui-link: #8ab4f8 !important;
        }
        .tui-island, .onbording-popup { background-color: rgb(40, 41, 44) !important; }
        .side-buttons button .t-wrapper { background: rgb(50, 51, 54) !important; }
        svg path[fill="currentColor"] { fill: #E8EAED !important; }
        button[appearance="whiteblock"] { background-color: rgb(40, 41, 44) !important; border-bottom-color: rgb(55, 56, 60) !important; }
        button[appearance="whiteblock"]:hover { background-color: rgb(55, 56, 60) !important; }
        .data-list button[appearance="whiteblock"] div.t-wrapper { background-color: var(--culms-dark-bg-secondary) !important; border: none !important; box-shadow: none !important; border-bottom: 1px solid rgb(55, 56, 60) !important; }
        .data-list button[appearance="whiteblock"]:hover div.t-wrapper { background-color: rgb(55, 56, 60) !important; border-bottom-color: rgb(85, 86, 90) !important; }
        .data-list button[appearance="whiteblock"] .title__text { color: #E8EAED !important; }
        .data-list button[appearance="whiteblock"] informer-copy-category-link-button svg path { fill: #BDC1C6 !important; }
    `;

    const shadowDomCssTextOled = `
        :host, :root {
            --informer-tui-base-01: #000000 !important;
            --informer-tui-base-02: #0b0b0b !important;
            --informer-tui-base-03: #161616 !important;
            --informer-tui-elevation-01: #000000 !important;
            --informer-tui-background-base: #000000 !important;
            --informer-tui-const-white: #000000 !important;
            --informer-tui-text-01: #ffffff !important;
            --informer-tui-text-02: #e6e6e6 !important;
            --informer-tui-text-03: #b3b3b3 !important;
            --informer-tui-text-primary: #ffffff !important;
            --informer-tui-text-secondary: #e6e6e6 !important;
            --informer-tui-text-tertiary: #b3b3b3 !important;
            --informer-tui-primary: #4285F4 !important;
            --informer-tui-primary-text: #ffffff !important;
            --informer-tui-secondary: #0b0b0b !important;
            --informer-tui-secondary-hover: #161616 !important;
            --informer-tui-link: #8ab4f8 !important;
        }
        .tui-island, .onbording-popup { background-color: #0b0b0b !important; }
        .side-buttons button .t-wrapper { background: #111111 !important; }
        svg path[fill="currentColor"] { fill: #e6e6e6 !important; }
        button[appearance="whiteblock"] { background-color: #0b0b0b !important; border-bottom-color: #161616 !important; }
        button[appearance="whiteblock"]:hover { background-color: #161616 !important; }
        .data-list button[appearance="whiteblock"] div.t-wrapper { background-color: #0b0b0b !important; border: none !important; box-shadow: none !important; border-bottom: 1px solid #161616 !important; }
        .data-list button[appearance="whiteblock"]:hover div.t-wrapper { background-color: #161616 !important; border-bottom-color: #2e2e2e !important; }
        .data-list button[appearance="whiteblock"] .title__text { color: #e6e6e6 !important; }
        .data-list button[appearance="whiteblock"] informer-copy-category-link-button svg path { fill: #b3b3b3 !important; }
    `;

    /**
     * Функция, которая находит все виджеты и применяет/удаляет стили в их Shadow DOM.
     */
    function toggleShadowDomTheme(isEnabled, isOled) {
        const hosts = document.querySelectorAll('informer-widget-element, informer-case-list-element');
        hosts.forEach(host => {
            if (host.shadowRoot) {
                const existingStyle = host.shadowRoot.getElementById(SHADOW_STYLE_ID_NEW);
                if (isEnabled && !existingStyle) {
                    const style = document.createElement('style');
                    style.id = SHADOW_STYLE_ID_NEW;
                    style.textContent = isOled ? shadowDomCssTextOled : shadowDomCssTextDark;
                    host.shadowRoot.appendChild(style);
                } else if (!isEnabled && existingStyle) {
                    existingStyle.remove();
                } else if (isEnabled && existingStyle) {
                    // Переключаемся между темной и oled-темой
                    existingStyle.textContent = isOled ? shadowDomCssTextOled : shadowDomCssTextDark;
                }
            }
        });
    }

    // Наблюдатель за появлением новых виджетов на странице.
    const shadowDomObserver = new MutationObserver(async () => {
        const data = await browser.storage.sync.get(['themeEnabled', 'oledEnabled']);
        if (data.themeEnabled) {
            toggleShadowDomTheme(true, !!data.oledEnabled);
        }
    });

    // Запускаем наблюдателя.
    shadowDomObserver.observe(document.body, { childList: true, subtree: true });
}