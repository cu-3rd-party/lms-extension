// version_check.js

(function() {
    // --- НАСТРОЙКА ---
    // Используем namespace browser (Firefox) или chrome (Chrome/others)
    const api = (typeof browser !== 'undefined') ? browser : chrome;
    
    const CURRENT_PLUGIN_VERSION = api.runtime.getManifest().version; // Версия плагина из manifest.json
    const GIST_URL = 'https://api.github.com/gists/f108f457039a5b11154dcb8e79f1b0da';
    const RELEASES_PAGE_URL = 'https://github.com/cu-3rd-party/lms-extension/releases/';
    const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 минут

    // --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

    // 1. Определение браузера
    function detectBrowser() {
        const ua = navigator.userAgent;
        if (ua.includes("Firefox")) {
            return "firefox";
        } else if (ua.includes("Safari") && !ua.includes("Chrome")) {
            return "safari";
        } else if (ua.includes("Chrome")) {
            return "chrome"; // Включает также Edge, Brave, Opera (обычно используют тот же стор/формат)
        }
        return "generic";
    }

    // 2. Сравнение версий (SemVer)
    // Возвращает:
    // 1, если v1 > v2
    // -1, если v1 < v2
    // 0, если равны
    function compareVersions(v1, v2) {
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);
        const length = Math.max(parts1.length, parts2.length);

        for (let i = 0; i < length; i++) {
            const num1 = parts1[i] || 0;
            const num2 = parts2[i] || 0;
            if (num1 > num2) return 1;
            if (num1 < num2) return -1;
        }
        return 0;
    }

    // --- ОСНОВНАЯ ЛОГИКА ---

    // Функция для получения данных из Gist с учетом браузера
    async function getLatestVersionFromGist() {
        try {
            const response = await fetch(GIST_URL);
            if (!response.ok) {
                console.error("[VersionCheck] Не удалось получить данные с GitHub. Статус:", response.status);
                return null;
            }
            const data = await response.json();
            if (data.files && data.files['version.json']) {
                const content = JSON.parse(data.files['version.json'].content);
                
                const browserName = detectBrowser();
                const specificKey = `version_${browserName}`;
                
                // Сначала ищем версию для конкретного браузера, если нет — общую
                if (content[specificKey]) {
                    console.log(`[VersionCheck] Используется версия для ${browserName}: ${content[specificKey]}`);
                    return content[specificKey];
                } else {
                    console.log(`[VersionCheck] Версия для ${browserName} не найдена, используется общая: ${content.version}`);
                    return content.version;
                }
            } else {
                 console.error("[VersionCheck] Файл version.json не найден в Gist.");
                 return null;
            }
        } catch (error) {
            console.error("[VersionCheck] Ошибка при запросе к Gist:", error);
            return null;
        }
    }

    // Функция для отображения уведомления
    function showUpdateNotification() {
        const headerActionsList = document.querySelector('ul.header__actions-list');
        if (!headerActionsList || document.getElementById('plugin-version-notification')) {
            return;
        }
        const originalLateDaysItem = headerActionsList.querySelector('li[automation-id="header-action"]');
        if (!originalLateDaysItem) return;

        const notificationElement = originalLateDaysItem.cloneNode(true);
        notificationElement.id = 'plugin-version-notification';

        const badgeDiv = notificationElement.querySelector('.badge');
        if (badgeDiv) {
            const linkHTML = `
                <a href="${RELEASES_PAGE_URL}" target="_blank" rel="noopener noreferrer" style="color: red; font-weight: bold; text-decoration: underline;">
                    Плагин устарел
                </a>
            `;
            badgeDiv.innerHTML = linkHTML;
        }
        headerActionsList.prepend(notificationElement);
    }

    // Функция для удаления уведомления
    function removeUpdateNotification() {
        const notificationElement = document.getElementById('plugin-version-notification');
        if (notificationElement) {
            notificationElement.remove();
        }
    }

    // Проверка необходимости обновления
    // Возвращает true, если remoteVersion (Gist) > currentVersion (Local)
    function isUpdateAvailable(remoteVersion, currentVersion) {
        if (!remoteVersion) return false;
        // Если удаленная версия БОЛЬШЕ текущей (1), значит нужно обновить.
        // Если они равны (0) или текущая новее (-1), обновлять не надо.
        return compareVersions(remoteVersion, currentVersion) === 1;
    }

    // Основная логика
    async function checkVersion() {
        const storedData = await api.storage.local.get(['lastVersionCheckTimestamp', 'cachedLatestVersion']);
        const lastCheckTime = storedData.lastVersionCheckTimestamp || 0;
        const cachedVersion = storedData.cachedLatestVersion;
        const currentTime = Date.now();

        // 1. ПРОВЕРКА ПО КЭШУ
        if (cachedVersion) {
            if (isUpdateAvailable(cachedVersion, CURRENT_PLUGIN_VERSION)) {
                showUpdateNotification();
            } else {
                removeUpdateNotification();
            }
        }

        // 2. ПРОВЕРКА ВРЕМЕНИ ЗАПРОСА
        if (currentTime - lastCheckTime < CHECK_INTERVAL_MS) {
            return; 
        }

        // 3. ЗАПРОС К GIST
        const latestVersion = await getLatestVersionFromGist();
        
        const updateData = { lastVersionCheckTimestamp: currentTime };
        if (latestVersion) {
            updateData.cachedLatestVersion = latestVersion;
        }
        await api.storage.local.set(updateData);
        
        // 4. ИТОГОВАЯ ПРОВЕРКА
        if (latestVersion) {
            if (isUpdateAvailable(latestVersion, CURRENT_PLUGIN_VERSION)) {
                console.log(`[VersionCheck] Доступна новая версия: ${latestVersion}. Текущая: ${CURRENT_PLUGIN_VERSION}`);
                showUpdateNotification();
            } else {
                console.log(`[VersionCheck] Обновление не требуется. (Gist: ${latestVersion}, Local: ${CURRENT_PLUGIN_VERSION})`);
                removeUpdateNotification();
            }
        }
    }

    checkVersion();

})();