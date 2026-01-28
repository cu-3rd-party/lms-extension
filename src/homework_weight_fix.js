// homework_weight_fix_full.js (ФИНАЛЬНАЯ ВЕРСИЯ: ИКОНКА + ВЕС + LATE DAYS)
'use strict';

// --- ЧАСТЬ 1: ЛОГИКА ДЛЯ ОТОБРАЖЕНИЯ ВЕСА ЗАДАНИЯ ---
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
    let anchorItem;

    if (scoreIcon) {
        anchorItem = scoreIcon.closest('li.task-info__item');
    } else {
        anchorItem = findItemByTitle(infoList, 'Оценка');
    }

    if (anchorItem) {
        const weightListItem = anchorItem.cloneNode(true);
        weightListItem.setAttribute('data-culms-longread-weight', 'true');

        // Удаляем кнопку "Оценить" из клонированного элемента
        const buttonToRemove = weightListItem.querySelector('button');
        if (buttonToRemove) {
            buttonToRemove.remove();
        }

        // Логика для случая, когда нашли элемент по иконке
        if (scoreIcon) {
            const icon = weightListItem.querySelector('tui-icon');
            if (icon) {
                const newIconName = 'cuIconPieChart';
                icon.setAttribute('icon', newIconName);
                icon.style.setProperty('--t-icon', `url(/assets/cu/icons/${newIconName}.svg)`);
            }
            const valueSpan = weightListItem.querySelector('span.font-text-m') || weightListItem.querySelector('.task-info__item-title + span');
            if (valueSpan) valueSpan.textContent = `Вес: ${Math.round(weight * 100)}%`;
        
        // Логика для случая, когда нашли элемент по заголовку "Оценка"
        } else {
            const titleSpan = weightListItem.querySelector('.task-info__item-title');
            if (titleSpan) titleSpan.textContent = 'Вес';
            
            const valueSpan = titleSpan.nextElementSibling;
            if (valueSpan) valueSpan.textContent = ` ${Math.round(weight * 100)}% `;
        }

        anchorItem.parentNode.insertBefore(weightListItem, anchorItem.nextSibling);
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

// --- ЧАСТЬ 2: ЛОГИКА ДЛЯ ЗАМЕНЫ ИКОНКИ (С ФИКСОМ РАЗМЕРА) ---

function persistentIconReplacer() {
    const originalIconSrcPart = "task-card-preview.svg";
    const newIconUrl = browser.runtime.getURL('icons/task-card-preview.svg'); 
    const processedAttribute = 'data-culms-icon-replaced';

    const iconObserver = new MutationObserver(() => {
        const iconsToReplace = document.querySelectorAll(`img[src*="${originalIconSrcPart}"]:not([${processedAttribute}])`);
        
        for (const icon of iconsToReplace) {
            icon.src = newIconUrl;
            icon.setAttribute(processedAttribute, 'true');
            
            // Принудительно задаем размеры
            icon.style.width = '148px';
            icon.style.height = '150px';

            console.log('Icon replaced and resized successfully.');
        }
    });

    iconObserver.observe(document.body, { childList: true, subtree: true });
}

// --- ЧАСТЬ 3: ЛОГИКА ДЛЯ LATE DAYS (ВЕРНУЛ ОБРАТНО) ---

function processLdOnTaskPage() {
    const processedAttribute = 'data-culms-ld-button-added';

    async function fetchStudent() {
        try {
            const r = await fetch("https://my.centraluniversity.ru/api/micro-lms/students/me", {
                credentials: "include"
            });
            if (!r.ok) return null;
            return await r.json();
        } catch {
            return null;
        }
    }

    async function fetchLongreadMeta() {
        try {
            const url = location.href;
            const match = url.match(/longreads\/(\d+)/);
            if (!match) return null;

            const longreadId = match[1];
            const apiUrl = `https://my.centraluniversity.ru/api/micro-lms/longreads/${longreadId}/materials?limit=10000`;

            const r = await fetch(apiUrl, { credentials: "include" });
            if (!r.ok) return null;

            const json = await r.json();
            if (!json?.items?.length) return null;

            const meta = json.items[0]
            const taskId = meta.taskId
            const anotherApiUrl = `https://my.centraluniversity.ru/api/micro-lms/tasks/${taskId}`;
            
            const r2 = await fetch(anotherApiUrl, { credentials: "include" });
            if (!r2.ok) return null;
            
            const taskMeta = await r2.json();
            if (!!taskMeta) return [meta, taskMeta];
            return null
        } catch (e) {
            return null;
        }
    }

    function showDeadlineModal(lateDaysBalance, taskId) {
        const overlay = document.createElement('div');
        const isDarkTheme = !!document.getElementById('culms-dark-theme-style-base');

        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: ${isDarkTheme ? '#202124' : 'white'};
            color: ${isDarkTheme ? 'white' : 'black'};
            border-radius: 12px;
            padding: 24px;
            max-width: 360px;
            width: 90%;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        `;
        
        modal.innerHTML = `
            <cu-late-days-editor _nghost-ng-c2119068531="" style="display: flex; flex-direction: column; gap: 24px;">
                <h3 _ngcontent-ng-c2119068531="" class="header" style="font: var(--font-service-heading-3-desktop); margin: 0;">Перенести дедлайн</h3>
                
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <label _ngcontent-ng-c2119068531="" tuilabel="" class="cu-label days-form__available-days-label" data-orientation="vertical">
                        Кол-во дней 
                    </label>
                    <div style="position: relative; width: 100%;">
                        <tui-textfield _ngcontent-ng-c2119068531="" tuiicons="" tuitextfieldsize="m" class="cu-text-field" style="--t-side: 0px; width: 100%; font-family: inherit;" data-size="m">
                            <input _ngcontent-ng-c2119068531="" tuiappearance="" tuitextfield="" tuiinputnumber="" placeholder="0" 
                            style="width: 100%; height: 48px; padding: 0px 0px 0px 12px; box-sizing:border-box; border-radius: 8px; font-size: 16px;"
                            data-appearance="textfield" data-focus="false" id="tui_31763374551225" class="_empty ng-untouched ng-pristine ng-invalid" inputmode="numeric" maxlength="23">   
                        </tui-textfield>
                        <span style="position: absolute; right: 16px; top: 50%; transform: translateY(-50%); color: ${isDarkTheme ? 'white' : '#999'}; font-family: 'Inter', sans-serif; font-size: 16px; pointer-events: none;">из ${lateDaysBalance}</span>
                    </div>
                </div>
                <div _ngcontent-ng-c907829761="" automation-id="tui-error__text" tuianimated="" class="t-message-text" style="color: red;  font-family: 'Inter', sans-serif; display:none;">
                    Ошибка: проверьте введённые данные
                </div>
                <div _ngcontent-ng-c2119068531="" class="days-form-buttons" style="display: flex; gap: 12px; justify-content: flex-end;">
                    <button _ngcontent-ng-c2119068531="" tuiappearance="" tuiicons="" tuibutton="" size="m" type="button" 
                    style="background: var(--cu-button-background-color, var(--cu-button-background-color-default)); color: var(--cu-button-text-color, var(--cu-button-text-color-default))" data-appearance="tertiary" data-size="m" class="cancel-btn">
                        Отменить
                    </button>
                    <button _ngcontent-ng-c2119068531="" tuiappearance="" tuiicons="" tuibutton="" size="m" type="submit" style="" data-appearance="primary" data-size="m" class="submit-btn">
                        Перенести
                    </button>
                </div>
            </cu-late-days-editor>
        `;

        const closeModal = () => overlay.remove();

        overlay.addEventListener("click", e => {
            if (e.target === overlay) closeModal();
        });

        modal.querySelector(".cancel-btn").addEventListener("click", closeModal);

        modal.querySelector(".submit-btn").addEventListener("click", async e => {
            e.preventDefault();

            const input = modal.querySelector("input[tuiinputnumber]");
            const errorLabel = modal.querySelector('.t-message-text');
            const days = parseInt(input.value, 10);

            errorLabel.style.display = "none";

            if (isNaN(days) || days <= 0 || days > lateDaysBalance) {
                errorLabel.textContent = `Доступно ${lateDaysBalance} дней`;
                errorLabel.style.display = "block";
                return;
            }

            try {
                const r = await fetch(`https://my.centraluniversity.ru/api/micro-lms/tasks/${taskId}/late-days-prolong`, {
                    method: "PUT",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ lateDays: days })
                });

                if (!r.ok) {
                    errorLabel.textContent = "Более недели скипать нельзя :(";
                    errorLabel.style.display = "block";
                    return;
                }

                closeModal();
                window.location.reload();

            } catch (err) {
                errorLabel.textContent = "Сетевая ошибка.";
                errorLabel.style.display = "block";
            }
        });

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }

    async function insertDeadlineButton(taskPreview) {
        if (taskPreview.hasAttribute(processedAttribute)) return;

        const taskTagsDiv = taskPreview.querySelector(".task-tags");
        if (!taskTagsDiv) return;

        const [meta, taskMeta] = await fetchLongreadMeta(taskPreview);
        let allowLateDays =
            meta && taskMeta &&
            meta?.estimation?.activity?.isLateDaysEnabled === true &&
            taskMeta?.task?.state !== "evaluated" &&
            taskMeta?.task?.state !== "review";

        let alreadyExists =
          taskTagsDiv.querySelector('button[tuiiconbutton]') ||
          taskTagsDiv.querySelector('tui-icon.warning-icon');

        if (alreadyExists) {
            return;
        }

        let lateDaysBalance = 0;
        if (allowLateDays)
        {
            const student = await fetchStudent();
            lateDaysBalance = student?.lateDaysBalance ?? 0;

            if (lateDaysBalance === 0) {
                taskPreview.setAttribute(processedAttribute, "true");
                return;
            }
        }

        alreadyExists =
            taskTagsDiv.querySelector('button[tuiiconbutton]') ||
            taskTagsDiv.querySelector('tui-icon.warning-icon');

        if (alreadyExists) return;
    
        if (allowLateDays) {
            const button = document.createElement("button");
            button.setAttribute('tuiappearance', '');
            button.setAttribute('tuiicons', '');
            button.setAttribute('tuiiconbutton', '');
            button.setAttribute('type', 'button');
            button.setAttribute('tuihint', 'Перенести дедлайн');
            button.setAttribute('data-appearance', 'tertiary');
            button.setAttribute('data-icon-start', 'svg');
            button.setAttribute('data-size', 'xxs');
            button.style.cssText = '--t-icon-start: url(assets/cu/icons/cuIconCalendarPlus01.svg);';

            button.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                showDeadlineModal(lateDaysBalance, taskMeta?.id);
            });

            taskTagsDiv.appendChild(button);

            if (taskMeta?.lateDays != null) {
                const cancelBtn = document.createElement("button");
                cancelBtn.setAttribute('tuiappearance', '');
                cancelBtn.setAttribute('tuiicons', '');
                cancelBtn.setAttribute('tuiiconbutton', '');
                cancelBtn.setAttribute('type', 'button');
                cancelBtn.setAttribute('tuihint', 'Отменить перенос');
                cancelBtn.classList.add("task-table__late-days-reset-button");
                cancelBtn.style.cssText = '--t-icon-start: url(assets/cu/icons/cuIconXClose.svg);';
                cancelBtn.setAttribute('data-appearance', 'tertiary-destructive');
                cancelBtn.setAttribute('data-icon-start', 'svg');
                cancelBtn.setAttribute('data-size', 'xxs');

                cancelBtn.addEventListener("click", async e => {
                    e.preventDefault();
                    e.stopPropagation();

                    const taskId = taskMeta?.id;
                    if (!taskId) return;

                    try {
                        const r = await fetch(
                            `https://my.centraluniversity.ru/api/micro-lms/tasks/${taskId}/late-days-cancel`,
                            {
                                method: "PUT",
                                credentials: "include"
                            }
                        );

                        if (r.ok) {
                          window.location.reload();
                        } else if (r.status === 400) {
                            let errorLabel = taskTagsDiv.querySelector('.t-message-text');
                            if (!errorLabel) {
                                errorLabel = document.createElement("div");
                                errorLabel.setAttribute('automation-id', 'tui-error__text');
                                errorLabel.setAttribute('tuianimated', '');
                                errorLabel.className = 't-message-text';
                                errorLabel.style.cssText = 'color: red; font-family: "Inter", sans-serif; display: block; margin-top: 8px;';
                                errorLabel.textContent = 'Нет доступных Late Days для отмены – до дедлайна менее 24 часов';
                                taskTagsDiv.parentElement.insertBefore(errorLabel, taskTagsDiv.nextSibling);
                                
                                setTimeout(() => {
                                    errorLabel.remove();
                                }, 5000);
                            }
                        }
                    } catch (err) {
                    
                    }
                });

                taskTagsDiv.appendChild(cancelBtn);
            }
        }
        taskPreview.setAttribute(processedAttribute, "true");
    }

    function runForExisting() {
        const list = document.querySelectorAll("cu-student-task-preview");
        for (const preview of list) insertDeadlineButton(preview);
    }

    runForExisting();
}

// --- ЗАПУСК ВСЕГО ---
persistentIconReplacer();
const navigationObserver = new MutationObserver(() => {
    processWeightInfo();
    // processLdOnTaskPage(); ЗААРХИВИРОВАНО, реализовано командой ЦУ
});
navigationObserver.observe(document.body, { childList: true, subtree: true });