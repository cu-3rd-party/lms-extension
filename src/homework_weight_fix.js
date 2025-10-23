// homework_weight_fix.js (ФИНАЛЬНАЯ ВЕРСИЯ с ИСПРАВЛЕНИЕМ РАЗМЕРА ИКОНКИ)
'use strict';

// --- ЧАСТЬ 1: ЛОГИКА ДЛЯ ОТОБРАЖЕНИЯ ВЕСА ЗАДАНИЯ ---
// (Этот блок кода не менялся)

async function processWeightInfo() {
    const match = window.location.pathname.match(/longreads\/(\d+)/);
    if (!match || document.querySelector('[data-culms-longread-weight]')) {
        return;
    }
    const longreadId = match[1];
    try {
        const apiResponse = await fetchLongreadData(longreadId);
        const weight = findWeightInApiResponse(apiResponse);
        if (weight === null) return;
        const infoList = await waitForElement('ul.task-info');
        if (infoList) insertWeightElement(infoList, weight);
    } catch (error) {
        if (!error.message.includes('not found within')) {
            console.error('Longread Weight: Error processing weight:', error);
        }
    }
}
async function fetchLongreadData(longreadId) {
    const apiUrl = `https://my.centraluniversity.ru/api/micro-lms/longreads/${longreadId}/materials?limit=10000`;
    const response = await fetch(apiUrl, { credentials: 'include' });
    if (!response.ok) throw new Error(`API request failed! Status: ${response.status}`);
    return await response.json();
}
function findWeightInApiResponse(data) {
    if (!data?.items?.length) return null;
    const itemWithWeight = data.items.find(item => item?.estimation?.activity?.weight !== undefined);
    return itemWithWeight ? itemWithWeight.estimation.activity.weight : null;
}
function findItemByTitle(list, title) {
    for (const li of list.querySelectorAll('.task-info__item')) {
        const titleSpan = li.querySelector('.task-info__item-title');
        if (titleSpan && titleSpan.textContent.trim() === title) return li;
    }
    return null;
}
function insertWeightElement(infoList, weight) {
    if (infoList.querySelector('[data-culms-longread-weight]')) return;
    const scoreIcon = infoList.querySelector('tui-icon[icon="cuIconAward02"]');
    if (scoreIcon) {
        const anchorItem = scoreIcon.closest('li.task-info__item');
        if (anchorItem) {
            const weightListItem = anchorItem.cloneNode(true);
            weightListItem.setAttribute('data-culms-longread-weight', 'true');
            const icon = weightListItem.querySelector('tui-icon');
            if (icon) {
                const newIconName = 'cuIconPieChart';
                icon.setAttribute('icon', newIconName);
                icon.style.setProperty('--t-icon', `url(/assets/cu/icons/${newIconName}.svg)`);
            }
            const valueSpan = weightListItem.querySelector('span.font-text-m');
            if (valueSpan) valueSpan.textContent = `Вес: ${Math.round(weight * 100)}%`;
            anchorItem.parentNode.insertBefore(weightListItem, anchorItem.nextSibling);
        }
    } else {
        const anchorItemByTitle = findItemByTitle(infoList, 'Оценка');
        if (anchorItemByTitle) {
            const weightListItem = anchorItemByTitle.cloneNode(true);
            weightListItem.setAttribute('data-culms-longread-weight', 'true');
            const titleSpan = weightListItem.querySelector('.task-info__item-title');
            if (titleSpan) titleSpan.textContent = 'Вес';
            const valueSpan = titleSpan.nextElementSibling;
            if (valueSpan) valueSpan.textContent = ` ${Math.round(weight * 100)}% `;
            anchorItemByTitle.parentNode.insertBefore(weightListItem, anchorItemByTitle.nextSibling);
        }
    }
}
function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const element = document.querySelector(selector);
        if (element) return resolve(element);
        const observer = new MutationObserver((_, obs) => {
            const foundElement = document.querySelector(selector);
            if (foundElement) {
                obs.disconnect();
                resolve(foundElement);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Element ${selector} not found within ${timeout}ms`));
        }, timeout);
    });
}

// --- ЧАСТЬ 2: ЛОГИКА ДЛЯ ЗАМЕНЫ ИКОНКИ (С ИЗМЕНЕНИЯМИ) ---

function persistentIconReplacer() {
    const originalIconSrcPart = "task-card-preview.svg";
    const newIconUrl = browser.runtime.getURL('icons/task-card-preview.svg'); // Убедитесь, что имя файла верное
    const processedAttribute = 'data-culms-icon-replaced';

    const iconObserver = new MutationObserver(() => {
        const iconsToReplace = document.querySelectorAll(`img[src*="${originalIconSrcPart}"]:not([${processedAttribute}])`);
        
        for (const icon of iconsToReplace) {
            icon.src = newIconUrl;
            icon.setAttribute(processedAttribute, 'true');
            
            // --- ДОБАВЛЕННЫЕ СТРОКИ ---
            // Принудительно задаем размеры, чтобы картинка не схлопывалась
            icon.style.width = '148px';
            icon.style.height = '150px';
            // -------------------------

            console.log('Icon replaced and resized successfully.');
        }
    });

    iconObserver.observe(document.body, { childList: true, subtree: true });
}

// --- ЗАПУСК ВСЕГО ---
persistentIconReplacer();
const navigationObserver = new MutationObserver(() => {
    processWeightInfo();
});
navigationObserver.observe(document.body, { childList: true, subtree: true });