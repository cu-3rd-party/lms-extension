// version_check.js (с удалением уведомления при актуальной версии и парсингом версии из манифеста)

(function() {
    // --- НАСТРОЙКА ---
    const CURRENT_PLUGIN_VERSION = browser.runtime.getManifest().version; // Версия плагина из manifest.json
    const GIST_URL = 'https://api.github.com/gists/f108f457039a5b11154dcb8e79f1b0da';
    const RELEASES_PAGE_URL = 'https://github.com/cu-3rd-party/lms-extension/releases/';
    const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 минут

    // --- ЛОГИКА ---

    // Функция для получения данных из Gist (без изменений)
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
                return content.version;
            } else {
                 console.error("[VersionCheck] Файл version.json не найден в Gist.");
                 return null;
            }
        } catch (error) {
            console.error("[VersionCheck] Ошибка при запросе к Gist:", error);
            return null;
        }
    }

    // Функция для отображения уведомления (без изменений)
    function showUpdateNotification() {
        const headerActionsList = document.querySelector('ul.header__actions-list');
        // Не добавляем, если контейнера нет или уведомление уже есть
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

    // --- НОВАЯ ФУНКЦИЯ ---
    // Функция для удаления уведомления об обновлении
    function removeUpdateNotification() {
        const notificationElement = document.getElementById('plugin-version-notification');
        if (notificationElement) {
            notificationElement.remove();
        }
    }

    // Основная логика с проверкой кэша и удалением уведомления
    async function checkVersion() {
        const storedData = await browser.storage.local.get(['lastVersionCheckTimestamp', 'cachedLatestVersion']);
        const lastCheckTime = storedData.lastVersionCheckTimestamp || 0;
        const cachedVersion = storedData.cachedLatestVersion;
        const currentTime = Date.now();

        // 1. ПРОВЕРКА ПО КЭШУ И РЕАКЦИЯ
        // Решаем, показывать или скрывать уведомление, на основе сохраненных данных
        if (cachedVersion) {
            if (cachedVersion !== CURRENT_PLUGIN_VERSION) {
                showUpdateNotification();
            } else {
                // Если кэшированная версия совпадает с текущей, уведомление нужно убрать
                removeUpdateNotification();
            }
        }

        // 2. ПРОВЕРЯЕМ, НУЖНО ЛИ ДЕЛАТЬ НОВЫЙ ЗАПРОС
        if (currentTime - lastCheckTime < CHECK_INTERVAL_MS) {
            return; // Выходим, если 5 минут еще не прошли
        }

        // 3. ЕСЛИ ВРЕМЯ ПРИШЛО, ДЕЛАЕМ ЗАПРОС К GIST
        const latestVersion = await getLatestVersionFromGist();
        
        // Обновляем время последней проверки в любом случае
        const updateData = { lastVersionCheckTimestamp: currentTime };
        if (latestVersion) {
            updateData.cachedLatestVersion = latestVersion;
        }
        await browser.storage.local.set(updateData);
        
        // 4. ПОСЛЕ СВЕЖЕЙ ПРОВЕРКИ СНОВА РЕШАЕМ, ПОКАЗЫВАТЬ ИЛИ УДАЛЯТЬ
        if (latestVersion) {
            if (latestVersion !== CURRENT_PLUGIN_VERSION) {
                console.log(`[VersionCheck] Обнаружена новая версия: ${latestVersion}. Текущая: ${CURRENT_PLUGIN_VERSION}`);
                showUpdateNotification();
            } else {
                console.log(`[VersionCheck] Установлена последняя версия плагина (${CURRENT_PLUGIN_VERSION}).`);
                // Явное удаление уведомления после успешной проверки
                removeUpdateNotification();
            }
        }
    }

    checkVersion();

})();