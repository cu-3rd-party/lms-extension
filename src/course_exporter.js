// course_exporter.js
// ==UserScript==
// @name         Central University Course Exporter (Local Server Plugin)
// @namespace    http://tampermonkey.net/
// @version      2.5
// @description  Triggers the background process to scan ALL available courses and upload materials.
// @author       You
// @match        https://my.centraluniversity.ru/learn/courses/view/actual
// @grant        none
// ==/UserScript==

(() => {
    // Простая проверка, чтобы не отправлять сообщение много раз при SPA-навигации
    if (window.courseExporterTriggered) {
        return;
    }
    window.courseExporterTriggered = true;

    const ACCESS_TOKEN_KEY = 'cu_enhancer_access_token';
    const cuLmsLog = console.log;

    function getAuthToken() {
        return localStorage.getItem(ACCESS_TOKEN_KEY);
    }

    function initialize() {
        if (window.location.href === 'https://my.centraluniversity.ru/learn/courses/view/actual') {
            cuLmsLog('Course Exporter Plugin: Page detected. Attempting to start background process...');

            const authToken = getAuthToken();

            if (authToken) {
                cuLmsLog('Auth token found. Sending "startExport" command to background script.');
                // В Chrome/Edge используется chrome.runtime, в Firefox - browser.runtime.
                // browser-polyfill.js, который вы уже используете, сглаживает эти различия.
                browser.runtime.sendMessage({
                    command: "startExport",
                    token: authToken
                });
            } else {
                cuLmsLog('Auth token not found in localStorage. Cannot start export process.');
            }
        }
    }

    // Небольшая задержка, чтобы страница и другие скрипты успели прогрузиться
    setTimeout(initialize, 2000);

})();