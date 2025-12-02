'use strict';

(function() {
    // Защита от повторного запуска
    if (window.stickerReplacerInitialized) return;
    window.stickerReplacerInitialized = true;

    // Селектор иконки
    const TARGET_ICON_SELECTOR = 'tui-icon[class*="course-icon"]';
    
    // --- УНИВЕРСАЛЬНЫЙ ДОСТУП К API (ИСПРАВЛЕНО ДЛЯ FIREFOX) ---
    // Используем глобальный browser, если он есть, иначе chrome
    const api = (typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null));

    let isEnabled = false;
    let stickerDataUrl = null;
    let observer = null;

    function log(msg, ...args) {
        // Оставьте true для отладки
        const DEBUG = true; 
        if (DEBUG) console.log(`[STICKER]: ${msg}`, ...args);
    }

    /**
     * Безопасное чтение storage (Универсальное)
     */
    function safeGet(area, keys) {
        return new Promise((resolve) => {
            try {
                // 1. Попытка для Firefox (стандартный API с промисами)
                if (typeof browser !== 'undefined' && browser.storage && browser.storage[area]) {
                    browser.storage[area].get(keys)
                        .then(resolve)
                        .catch(err => {
                            console.error('[STICKER] FF Storage error:', err);
                            resolve({});
                        });
                }
                // 2. Попытка для Chrome (API с колбэками)
                else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage[area]) {
                    chrome.storage[area].get(keys, (data) => {
                        if (chrome.runtime.lastError) {
                            console.error('[STICKER] Chrome storage error:', chrome.runtime.lastError);
                            resolve({});
                        } else {
                            resolve(data || {});
                        }
                    });
                } else {
                    log(`API storage.${area} не найден!`);
                    resolve({});
                }
            } catch (e) {
                console.error('[STICKER] Critical storage error:', e);
                resolve({});
            }
        });
    }

    /**
     * Основная функция замены
     */
    function replaceIcon(iconNode) {
        if (!isEnabled || !stickerDataUrl) return;

        // Если это уже наша картинка
        if (iconNode.tagName.toLowerCase() === 'img' && iconNode.hasAttribute('data-custom-sticker')) {
            return;
        }

        const parentCard = iconNode.parentNode;
        if (!parentCard) return;

        // Создаем изображение
        const newImage = document.createElement('img');
        newImage.src = stickerDataUrl;
        newImage.className = iconNode.className; 
        newImage.setAttribute('data-custom-sticker', 'true'); 

        // --- СТИЛИ (РАСТЯГИВАНИЕ) ---
        newImage.style.setProperty('width', '100%', 'important');
        newImage.style.setProperty('height', '100%', 'important');
        newImage.style.setProperty('min-width', '100%', 'important');
        newImage.style.setProperty('min-height', '100%', 'important');
        
        // 'cover' обрезает края, но сохраняет пропорции.
        newImage.style.setProperty('fill', 'cover', 'important'); 
        
        newImage.style.setProperty('border-radius', 'inherit', 'important');
        newImage.style.setProperty('display', 'block', 'important');

        // --- ОЧИСТКА РОДИТЕЛЯ ---
        parentCard.style.setProperty('background', 'transparent', 'important');
        parentCard.style.setProperty('background-color', 'transparent', 'important');
        parentCard.style.setProperty('border', 'none', 'important');
        parentCard.style.setProperty('box-shadow', 'none', 'important');
        parentCard.style.setProperty('padding', '0', 'important');
        parentCard.style.setProperty('overflow', 'hidden', 'important');
        parentCard.style.setProperty('display', 'block', 'important'); 

        try {
            parentCard.replaceChild(newImage, iconNode);
        } catch (e) {
            // Игнорируем ошибки при удалении
        }
    }

    /**
     * Наблюдатель
     */
    const handleMutations = (mutations) => {
        if (!isEnabled || !stickerDataUrl) return;

        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.matches(TARGET_ICON_SELECTOR)) {
                        replaceIcon(node);
                    }
                    const iconsInside = node.querySelectorAll(TARGET_ICON_SELECTOR);
                    iconsInside.forEach(replaceIcon);
                }
            }
        }
    };

    function startReplacer() {
        log('Запуск замены...');
        const existingIcons = document.querySelectorAll(TARGET_ICON_SELECTOR);
        existingIcons.forEach(replaceIcon);

        if (!observer) {
            observer = new MutationObserver(handleMutations);
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    /**
     * Инициализация
     */
    async function init() {
        log('Инициализация скрипта...');
        
        // 1. Получаем настройки (Sync)
        const syncData = await safeGet('sync', ['stickerEnabled']);
        isEnabled = !!syncData.stickerEnabled;
        log(`Статус stickerEnabled: ${isEnabled}`);

        if (isEnabled) {
            // 2. Получаем картинку (Local)
            const localData = await safeGet('local', ['customStickerData']);
            
            if (localData && localData.customStickerData) {
                stickerDataUrl = localData.customStickerData;
                log('Картинка загружена.');
                startReplacer();
            } else {
                log('Картинка не найдена в local storage.');
            }
        }
    }

    // Слушатель изменений (работает и в Chrome, и в FF через api wrapper)
    if (api && api.storage) {
        api.storage.onChanged.addListener((changes, area) => {
            if (area === 'sync' && 'stickerEnabled' in changes) {
                location.reload(); 
            }
            if (area === 'local' && 'customStickerData' in changes) {
                stickerDataUrl = changes.customStickerData.newValue;
                document.querySelectorAll('img[data-custom-sticker="true"]').forEach(img => {
                    img.src = stickerDataUrl;
                });
                if (stickerDataUrl) startReplacer();
            }
        });
    }

    // Запуск
    setTimeout(init, 500);

})();