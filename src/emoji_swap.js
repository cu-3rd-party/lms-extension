// emoji_swap.js (ФИНАЛЬНАЯ ВЕРСИЯ С КООРДИНАЦИЕЙ)
'use strict';

// Prevent double init
if (typeof window.culmsEmojiSwapInitialized === 'undefined') {
    window.culmsEmojiSwapInitialized = true;

    // Emoji maps (без изменений)
    const toHearts = new Map([
        ['🔵', '💙'], ['🔴', '❤️'], ['⚫️', '🖤'], ['⚫', '🖤'],
    ]);
    const toCircles = new Map([
        ['💙', '🔵'], ['❤️', '🔴'], ['🖤', '⚫️'],
    ]);

    let currentEnabled = false;
    let observerInitialized = false;

    // Функции-помощники (без изменений)
    function replaceWithMap(str, map) {
        let out = str;
        for (const [from, to] of map) {
            if (out.includes(from)) out = out.split(from).join(to);
        }
        return out;
    }
    function replaceInTextNode(textNode, enable) {
        if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;
        const map = enable ? toHearts : toCircles;
        const next = replaceWithMap(textNode.nodeValue, map);
        if (next !== textNode.nodeValue) textNode.nodeValue = next;
    }
    function replaceInSubtree(root, enable) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        while (walker.nextNode()) {
            replaceInTextNode(walker.currentNode, enable);
        }
    }
    function runSwap(enable) {
        replaceInSubtree(document.body, enable);
        document.querySelectorAll('*').forEach(el => {
            if (el.shadowRoot) replaceInSubtree(el.shadowRoot, enable);
        });
    }

    // Наблюдатель (без изменений, но будет запускаться позже)
    const observer = new MutationObserver(() => {
        if (currentEnabled) runSwap(true);
    });

    /**
     * ГЛАВНАЯ ФУНКЦИЯ ЗАПУСКА
     * Выполняет первую замену и запускает постоянное наблюдение.
     * Гарантирует, что это произойдет только один раз.
     */
    function safeInitializeAndObserve() {
        if (observerInitialized) return; // Защита от повторного запуска
        observerInitialized = true;

        window.cuLmsLog('Emoji Swap: Safe to initialize. Running first swap and starting observer.');
        runSwap(true); // Первый запуск
        observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    }


    // --- НОВАЯ ЛОГИКА ИНИЦИАЛИЗАЦИИ ---
    function startOrStop(enabled) {
        currentEnabled = !!enabled;

        if (currentEnabled) {
            // Маляр ждет...
            window.cuLmsLog('Emoji Swap: Enabled. Waiting for safe signal from tasks_fix.js...');

            // 1. Устанавливаем таймер-фолбэк. Если за 2 секунды сигнал не придет,
            // считаем, что мы не на странице задач, и можно работать.
            const fallbackTimeout = setTimeout(() => {
                window.cuLmsLog('Emoji Swap: Fallback timer fired. Initializing.');
                window.removeEventListener('culms-tasks-fix-complete', onTasksFixComplete);
                safeInitializeAndObserve();
            }, 2000);

            // 2. Определяем, что делать, когда придет сигнал
            const onTasksFixComplete = () => {
                window.cuLmsLog('Emoji Swap: Received "culms-tasks-fix-complete" signal. Initializing.');
                clearTimeout(fallbackTimeout); // Отменяем фолбэк
                window.removeEventListener('culms-tasks-fix-complete', onTasksFixComplete); // Убираем слушатель
                safeInitializeAndObserve();
            };

            // 3. Начинаем слушать сигнал
            window.addEventListener('culms-tasks-fix-complete', onTasksFixComplete, { once: true });

        } else {
            // Если выключено, просто отключаем все
            observer.disconnect();
            runSwap(false);
        }
    }

    // Загрузка настроек и запуск (без изменений)
    browser.storage.onChanged.addListener(changes => {
        if (changes.emojiHeartsEnabled) {
            // Перезагрузка страницы, чтобы применить новую логику ожидания
            window.location.reload();
        }
    });

    browser.storage.sync.get('emojiHeartsEnabled').then(data => {
        startOrStop(!!data.emojiHeartsEnabled);
    }).catch(() => {
        startOrStop(false);
    });
}