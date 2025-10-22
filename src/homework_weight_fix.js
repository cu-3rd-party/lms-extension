// homework_weight_fix.js (ИСПРАВЛЕННАЯ версия для Firefox)
'use strict';

/**
 * Основная функция, запускающая всю логику.
 */
async function runLogic() {
    const match = window.location.pathname.match(/longreads\/(\d+)/);
    if (!match || document.querySelector('[data-culms-longread-weight]')) {
        return;
    }
    const longreadId = match[1];
    try {
        const apiResponse = await fetchLongreadData(longreadId);
        const weight = findWeightInApiResponse(apiResponse);
        if (weight === null) {
            window.cuLmsLog('Longread Weight: Weight not found in API response.');
            return;
        }
        const infoList = await waitForElement('ul.task-info');
        if (infoList) {
            insertWeightElement(infoList, weight);
        }
    } catch (error) {
        window.cuLmsLog('Longread Weight: Error:', error);
    }
}

/**
 * Делает запрос к API и возвращает данные.
 */
async function fetchLongreadData(longreadId) {
    const apiUrl = `https://my.centraluniversity.ru/api/micro-lms/longreads/${longreadId}/materials?limit=10000`;
    // ИЗМЕНЕНИЕ: Добавлен параметр credentials, чтобы Firefox отправлял cookie для аутентификации.
    const response = await fetch(apiUrl, { credentials: 'include' });
    if (!response.ok) {
        throw new Error(`API request failed! Status: ${response.status}`);
    }
    return await response.json();
}

/**
 * Находит первое валидное значение веса в ответе API.
 */
function findWeightInApiResponse(data) {
    if (!data?.items?.length) return null;
    const itemWithWeight = data.items.find(item =>
        item?.estimation?.activity && typeof item.estimation.activity.weight === 'number'
    );
    return itemWithWeight ? itemWithWeight.estimation.activity.weight : null;
}

/**
 * Ищет <li> по тексту в его заголовке.
 */
function findItemByTitle(listElement, title) {
    for (const li of listElement.querySelectorAll('.task-info__item')) {
        const titleSpan = li.querySelector('.task-info__item-title');
        if (titleSpan && titleSpan.textContent.trim() === title) {
            return li;
        }
    }
    return null;
}

/**
 * Клонирует подходящий элемент, заполняет его данными о весе и вставляет на страницу.
 */
function insertWeightElement(infoList, weight) {
    if (infoList.querySelector('[data-culms-longread-weight]')) return;
    const anchorItem = findItemByTitle(infoList, 'Статус');
    if (!anchorItem) {
        window.cuLmsLog('Longread Weight: Could not find "Статус" item to insert after.');
        return;
    }
    const cloneSourceItem = findItemByTitle(infoList, 'Оценка') || findItemByTitle(infoList, 'Дедлайн');
    if (!cloneSourceItem) {
        window.cuLmsLog('Longread Weight: Could not find a suitable item to clone.');
        return;
    }
    const weightListItem = cloneSourceItem.cloneNode(true);
    weightListItem.setAttribute('data-culms-longread-weight', 'true');
    const titleSpan = weightListItem.querySelector('.task-info__item-title');
    const valueSpan = weightListItem.querySelectorAll('span')[1];
    if (titleSpan) titleSpan.textContent = 'Вес';
    if (valueSpan) valueSpan.innerHTML = ` ${Math.round(weight * 100)}% `;
    anchorItem.parentNode.insertBefore(weightListItem, anchorItem.nextSibling);
    window.cuLmsLog('Longread Weight: Weight info added successfully.');
}

/**
 * Ожидает появления элемента в DOM.
 */
function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const element = document.querySelector(selector);
        if (element) return resolve(element);
        const observer = new MutationObserver((mutations, obs) => {
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

// --- Запускаем основную логику ---
runLogic();