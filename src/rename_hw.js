// ==UserScript==
// @name         Автоматическое переименование ДЗ для SPA
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Автоматически переименовывает файлы ДЗ в формат ДЗ_номернедели_ФИ (оптимизировано для SPA), поддерживает drag-n-drop
// @author       (Ваше имя)
// @match        https://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let renameEnabled = false;
    let currentSetting = null;
    let observer = null;
    let isInitialized = false;

    // Функция для логирования
    function log(...args) {
        if (typeof window.cuLmsLog === 'function') {
            window.cuLmsLog(...args);
        } else {
            console.log('AutoRename:', ...args);
        }
    }

    // Функция для получения расширения файла
    function getFileExtension(filename) {
        return filename.slice((filename.lastIndexOf(".") >>> 0) + 1);
    }

    // Функция для получения даты из последнего элемента истории
    function getLastHistoryDate() {
        const dateElements = document.querySelectorAll('.task-history-card__date');
        if (dateElements.length === 0) {
            log('Не найдены элементы с датой в истории');
            return null;
        }

        const lastDateElement = dateElements[dateElements.length - 1];
        const dateText = lastDateElement.textContent.trim();
        
        log('Найден текст даты:', dateText);

        const dateMatch = dateText.match(/(\d{2}\.\d{2}\.\d{4})/);
        if (dateMatch) {
            return dateMatch[1];
        }

        log('Не удалось извлечь дату из текста:', dateText);
        return null;
    }

    // Функция для вычисления номера недели от 8 сентября
    function calculateWeekNumber(targetDate) {
        const baseDate = new Date(2025, 8, 8); // Месяцы 0-based: 8 = сентябрь
        const [day, month, year] = targetDate.split('.');
        const currentDate = new Date(`${year}-${month}-${day}`);

        log('Базовая дата (08.09.2025):', baseDate);
        log('Текущая дата:', currentDate);

        const timeDiff = currentDate.getTime() - baseDate.getTime();
        const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
        
        log('Разница в днях:', daysDiff);

        const weekNumber = Math.floor(daysDiff / 7) + 1;
        log('Вычисленный номер недели:', weekNumber);
        return weekNumber;
    }

    // Функция для поиска номера недели в интерфейсе
    function findWeekNumberInUI() {
        log('Поиск номера недели в интерфейсе...');
        
        // Поиск в навигации или заголовках
        const weekElements = Array.from(document.querySelectorAll([
            'a[href*="/learn/courses/view/actual/"]',
            '.week-navigation__item--active',
            '.course-navigation__week',
            '[class*="week"]',
            '[class*="неделя"]'
        ].join(',')));
        
        for (const element of weekElements) {
            const text = element.textContent.trim();
            log('Проверяем элемент:', text);
            
            if (text.includes('Неделя') || text.includes('неделя') || text.match(/неделя\s*\d+/i)) {
                const weekMatch = text.match(/(\d+)/);
                if (weekMatch) {
                    const weekNum = parseInt(weekMatch[0]);
                    log('Найден номер недели в интерфейсе:', weekNum);
                    return weekNum;
                }
            }
        }
        
        // Поиск в заголовке страницы
        const pageTitle = document.title;
        const titleWeekMatch = pageTitle.match(/неделя\s*(\d+)/i);
        if (titleWeekMatch) {
            const weekNum = parseInt(titleWeekMatch[1]);
            log('Найден номер недели в заголовке страницы:', weekNum);
            return weekNum;
        }
        
        log('Номер недели в интерфейсе не найден');
        return 0;
    }

    // Функция для поиска номера ДЗ в заголовке h4
    function findHomeworkNumberInH4() {
        log('Поиск номера ДЗ в заголовках h4...');
        
        // Ищем все h4 элементы
        const h4Elements = document.querySelectorAll('h4');
        
        for (const h4 of h4Elements) {
            const text = h4.textContent.trim();
            log('Проверяем h4:', text);
            
            // Ищем паттерны типа "ДЗ 3", "ДЗ3", "Homework 3" и т.д.
            const hwMatch = text.match(/ДЗ\s*(\d+)/i) || text.match(/Homework\s*(\d+)/i) || text.match(/HW\s*(\d+)/i);
            
            if (hwMatch) {
                const hwNumber = parseInt(hwMatch[1]);
                log('Найден номер ДЗ в h4:', hwNumber);
                return hwNumber;
            }
            
            // Также проверяем наличие чисел в тексте (первое число)
            const numberMatch = text.match(/(\d+)/);
            if (numberMatch && text.includes('ДЗ')) {
                const hwNumber = parseInt(numberMatch[1]);
                log('Найден номер ДЗ в h4 (по первому числу):', hwNumber);
                return hwNumber;
            }
        }
        
        // Дополнительный поиск по конкретному селектору из примера
        const specificH4 = document.querySelector('h4.heading-text.font-text-l-bold');
        if (specificH4) {
            const text = specificH4.textContent.trim();
            log('Найден специфичный h4:', text);
            
            const hwMatch = text.match(/ДЗ\s*(\d+)/i) || text.match(/(\d+)/);
            if (hwMatch) {
                const hwNumber = parseInt(hwMatch[1]);
                log('Найден номер ДЗ в специфичном h4:', hwNumber);
                return hwNumber;
            }
        }
        
        log('Номер ДЗ в h4 не найден');
        return 0;
    }

    // Функция для получения номера недели
    function getWeekNumber() {
        // Уровень 1: Поиск номера недели в интерфейсе
        const uiWeekNumber = findWeekNumberInUI();
        if (uiWeekNumber > 0) {
            log('Уровень 1: Используем номер недели из интерфейса:', uiWeekNumber);
            return uiWeekNumber;
        }
        
        log('Уровень 1: Номер недели в интерфейсе не найден, переходим к уровню 2');
        
        // Уровень 2: Поиск номера ДЗ в заголовке h4
        const h4HomeworkNumber = findHomeworkNumberInH4();
        if (h4HomeworkNumber > 0) {
            log('Уровень 2: Используем номер ДЗ из h4 как номер недели:', h4HomeworkNumber);
            return h4HomeworkNumber;
        }
        
        log('Уровень 2: Номер ДЗ в h4 не найден, переходим к уровню 3');
        
        // Уровень 3: Вычисление по дате из истории
        const lastDate = getLastHistoryDate();
        if (lastDate) {
            log('Уровень 3: Используем дату из истории для расчета недели:', lastDate);
            return calculateWeekNumber(lastDate);
        }

        log('Уровень 3: Не удалось определить номер недели, используем 0');
        return 0;
    }

    // Функция для получения ФИ пользователя
    function getUserName() {
        const profileElement = document.querySelector('.task-history-card__actor-name');
        if (!profileElement) {
            log('Не удалось найти имя профиля.');
            return 'Unknown';
        }
        
        return profileElement.textContent.trim().replace(/\s+/g, ' ');
    }

    // Функция для переименования файлов
    function renameFiles(files, fileInput) {
        if (!renameEnabled || !files || files.length === 0) {
            return;
        }

        const weekNumber = getWeekNumber();
        const userName = getUserName();

        log(`Переименование: Неделя ${weekNumber}, Пользователь ${userName}`);

        const dataTransfer = new DataTransfer();

        for (const file of files) {
            const extension = getFileExtension(file.name);
            const newName = `ДЗ_${weekNumber}_${userName}${extension ? '.' + extension : ''}`;

            const newFile = new File([file], newName, {
                type: file.type,
                lastModified: file.lastModified,
            });

            dataTransfer.items.add(newFile);
            log(`Файл "${file.name}" переименован в "${newName}"`);
        }
        
        if (fileInput) {
            fileInput.files = dataTransfer.files;
        }
        log('Все файлы успешно переименованы.');
        return dataTransfer.files;
    }

    // Обработчик изменения файлов через диалог
    function handleFileChange(event) {
        if (!renameEnabled) {
            log('Переименование отключено');
            return;
        }
        
        log('Обнаружено изменение файлового input через диалог');
        renameFiles(event.target.files, event.target);
    }
    
    // Обработчик перетаскивания файлов
    function handleFileDrop(event) {
        const dropZone = event.currentTarget;
        
        // ИЗМЕНЕНО: Если скрипт выключен, просто убираем подсветку и выходим,
        // позволяя стандартному обработчику сайта сработать.
        if (!renameEnabled) {
            dropZone.classList.remove('drag-over');
            return;
        }
        
        // Если скрипт включен, полностью перехватываем событие.
        event.preventDefault();
        event.stopPropagation();
        
        dropZone.classList.remove('drag-over');
        log('Обнаружен drop файлов');

        const fileInput = dropZone.querySelector('input[type="file"]');
        if (!fileInput) {
            log('Не найден input[type="file"] внутри drop-зоны');
            return;
        }
        
        const droppedFiles = event.dataTransfer.files;
        if (droppedFiles.length > 0) {
            renameFiles(droppedFiles, fileInput);
            
            const changeEvent = new Event('change', { bubbles: true });
            fileInput.dispatchEvent(changeEvent);
        }
    }

    // Функция для обработки существующих input'ов и их оберток
    function processExistingInputs() {
        const fileWrappers = document.querySelectorAll('cu-files[automation-id="add-solution-file"]');
        
        fileWrappers.forEach(wrapper => {
            if (!wrapper.hasAttribute('data-auto-rename-handled')) {
                log('Найден новый компонент загрузки, добавляем обработчики');
                wrapper.setAttribute('data-auto-rename-handled', 'true');
                
                const input = wrapper.querySelector('input[type="file"]');
                if (input) {
                    input.addEventListener('change', handleFileChange);
                }

                // ИЗМЕНЕНО: Логика обработчиков теперь проверяет, включен ли скрипт.
                wrapper.addEventListener('dragover', (e) => {
                    // Если скрипт выключен, ничего не делаем, позволяем событию идти дальше.
                    if (!renameEnabled) return;
                    
                    e.preventDefault();
                    e.stopPropagation();
                    e.currentTarget.classList.add('drag-over');
                }, { capture: true });

                wrapper.addEventListener('dragleave', (e) => {
                    // Если скрипт выключен, ничего не делаем.
                    if (!renameEnabled) return;
                    
                    e.preventDefault();
                    e.stopPropagation();
                    e.currentTarget.classList.remove('drag-over');
                }, { capture: true });

                wrapper.addEventListener('drop', handleFileDrop, { capture: true });
                log('Обработчики Drag and Drop добавлены в режиме захвата');
            }
        });
    }

    // Функция для наблюдения за изменениями DOM
    function startDOMObserver() {
        if (observer) {
            observer.disconnect();
        }

        observer = new MutationObserver((mutations) => {
            let shouldProcess = false;
            
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === 1) {
                            if (node.matches && (
                                node.matches('cu-files[automation-id="add-solution-file"]') ||
                                node.querySelector('cu-files[automation-id="add-solution-file"]')
                            )) {
                                shouldProcess = true;
                                break;
                            }
                        }
                    }
                }
                
                if (shouldProcess) break;
            }
            
            if (shouldProcess) {
                log('Обнаружены изменения DOM, проверяем компоненты загрузки');
                setTimeout(processExistingInputs, 100);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        log('Observer запущен');
    }

    // Функция для управления состоянием скрипта
    function startOrStop(enable) {
        const wasEnabled = renameEnabled;
        renameEnabled = !!enable;
        
        log(`Состояние переименования: ${renameEnabled ? 'ВКЛ' : 'ВЫКЛ'}`);
        
        if (wasEnabled !== renameEnabled) {
            if (renameEnabled) {
                processExistingInputs();
            }
        }
    }

    // Функция для проверки изменений в настройках
    function checkSettingChange() {
        if (typeof browser !== 'undefined') {
            browser.storage.sync.get('autoRenameEnabled').then(data => {
                const newSetting = !!data.autoRenameEnabled;
                
                if (currentSetting !== newSetting) {
                    log(`Обнаружено изменение настройки: ${currentSetting} -> ${newSetting}`);
                    currentSetting = newSetting;
                    startOrStop(newSetting);
                }
                
            }).catch(error => {
                log('Ошибка при получении настроек:', error);
                const newSetting = false;
                if (currentSetting !== newSetting) {
                    currentSetting = newSetting;
                    startOrStop(newSetting);
                }
            });
        } else {
            const newSetting = false; // По умолчанию выключено, если нет API расширений
            if (currentSetting !== newSetting) {
                currentSetting = newSetting;
                startOrStop(newSetting);
            }
        }
    }

    // Функция для периодической проверки настроек
    function startSettingsChecker() {
        setInterval(checkSettingChange, 500);
    }
    
    // Добавление стилей для визуальной обратной связи
    function addDragDropStyles() {
        const styleId = 'auto-rename-drag-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .drag-over {
                border: 2px dashed #007bff !important;
                background-color: rgba(0, 123, 255, 0.1) !important;
            }
        `;
        document.head.appendChild(style);
        log('Стили для Drag and Drop добавлены');
    }

    // Основная функция инициализации
    function initialize() {
        if (isInitialized) {
            return;
        }
        
        log('Инициализация скрипта для SPA');
        isInitialized = true;
        
        // Добавляем стили
        addDragDropStyles();
        
        // Обрабатываем существующие inputs
        processExistingInputs();
        
        // Запускаем observer для новых inputs
        startDOMObserver();
        
        // Запускаем проверку настроек
        startSettingsChecker();
        
        // Слушаем изменения в настройках
        if (typeof browser !== 'undefined') {
            browser.storage.onChanged.addListener((changes, area) => {
                if (area === 'sync' && changes.autoRenameEnabled) {
                    log('Мгновенное обновление по изменению хранилища');
                    checkSettingChange();
                }
            });
        }

        // Дополнительная обработка при навигации (для SPA)
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = function(...args) {
            originalPushState.apply(this, args);
            setTimeout(processExistingInputs, 300);
        };

        history.replaceState = function(...args) {
            originalReplaceState.apply(this, args);
            setTimeout(processExistingInputs, 300);
        };

        window.addEventListener('popstate', () => {
            setTimeout(processExistingInputs, 300);
        });

        log('SPA-обработчики навигации установлены');
    }

    // Умная инициализация с задержкой
    function smartInitialize() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initialize);
        } else {
            setTimeout(initialize, 1000);
        }
        
        setTimeout(initialize, 3000);
    }

    // Запускаем умную инициализацию
    smartInitialize();
})();
