 (function() {
     'use strict';

     let renameEnabled = false; // Главный переключатель
     let currentTemplate = 'dz_fi'; // Шаблон по умолчанию
     let observer = null;
     let isInitialized = false;

     function log(...args) {
         if (typeof window.cuLmsLog === 'function') {
             window.cuLmsLog(...args);
         } else {
             console.log('AutoRename:', ...args);
         }
     }

     function getFileExtension(filename) {
         return filename.slice((filename.lastIndexOf(".") >>> 0) + 1);
     }

     // ... (Все функции для получения номера недели и имени пользователя остаются без изменений) ...
     function getLastHistoryDate() {
         const dateElements = document.querySelectorAll('.task-history-card__date');
         if (dateElements.length === 0) return null;
         const lastDateElement = dateElements[dateElements.length - 1];
         const dateText = lastDateElement.textContent.trim();
         const dateMatch = dateText.match(/(\d{2}\.\d{2}\.\d{4})/);
         return dateMatch ? dateMatch[1] : null;
     }
     function calculateWeekNumber(targetDate) {
         const baseDate = new Date(2025, 8, 8);
         const [day, month, year] = targetDate.split('.');
         const currentDate = new Date(`${year}-${month}-${day}`);
         const timeDiff = currentDate.getTime() - baseDate.getTime();
         const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
         return Math.floor(daysDiff / 7) + 1;
     }
     function findWeekNumberInUI() {
         const weekElementsNotArray = document.querySelectorAll('a[href*="/learn/courses/view/actual/"], .week-navigation__item--active, [class*="week"]');
         const weekElements = Array.from(weekElementsNotArray);
         for (const element of weekElements.reverse()) {
             const weekMatch = element.textContent.match(/неделя\s*(\d+)/i) || element.textContent.match(/(\d+)/);
             if (weekMatch) return parseInt(weekMatch[1]);
         }
         return 0;
     }
     function findHomeworkNumberInH4() {
         const h4Elements = document.querySelectorAll('h4');
         for (const h4 of h4Elements) {
             const hwMatch = h4.textContent.match(/ДЗ\s*(\d+)/i);
             if (hwMatch) return parseInt(hwMatch[1]);
         }
         return 0;
     }
     function getWeekNumber() {
         let week = findWeekNumberInUI() || findHomeworkNumberInH4();
         if (week > 0) return week;
         const lastDate = getLastHistoryDate();
         return lastDate ? calculateWeekNumber(lastDate) : 0;
     }
     function getUserNameParts() {
         const historyNameElementsNotArray = document.querySelectorAll('.task-history-card__actor-name');
         const historyNameElements = Array.from(historyNameElementsNotArray);
         for (const element of historyNameElements.reverse()) {
             const fullName = element.textContent.trim().replace(/\s+/g, ' ');
             if (fullName && !fullName.includes('Системный пользователь')) {
                 const nameParts = fullName.split(' ');
                 return { lastName: nameParts[0] || '', firstName: nameParts[1] || '' };
             }
         }
         const firstHistoryElement = document.querySelector('.task-history-card__actor-name');
         if (firstHistoryElement) {
             const nameParts = firstHistoryElement.textContent.trim().replace(/\s+/g, ' ').split(' ');
             return { lastName: nameParts[0] || '', firstName: nameParts[1] || '' };
         }
         return { firstName: 'Unknown', lastName: 'User' };
     }

     // Функция для переименования файлов
     function renameFiles(files, fileInput) {
         // ГЛАВНАЯ ПРОВЕРКА
         if (!renameEnabled || !files || files.length === 0) {
             return;
         }

         const weekNumber = getWeekNumber();
         const { firstName, lastName } = getUserNameParts();

         log(`Переименование по шаблону "${currentTemplate}": Неделя ${weekNumber}, Пользователь ${lastName} ${firstName}`);
         const dataTransfer = new DataTransfer();

         for (const file of files) {
             const extension = getFileExtension(file.name);
             let newName = file.name;
             let prefix = '', nameOrder = '';

             switch (currentTemplate) {
                 case 'dz_if': prefix = 'ДЗ'; nameOrder = `${firstName}_${lastName}`; break;
                 case 'dz_fi': prefix = 'ДЗ'; nameOrder = `${lastName}_${firstName}`; break;
                 case 'hw_if': prefix = 'HW'; nameOrder = `${firstName}_${lastName}`; break;
                 case 'hw_fi': prefix = 'HW'; nameOrder = `${lastName}_${firstName}`; break;
             }

             if (prefix && nameOrder) {
                 newName = `${prefix}_${weekNumber}_${nameOrder}${extension ? '.' + extension : ''}`;
             }
             const newFile = new File([file], newName, { type: file.type, lastModified: file.lastModified });
             dataTransfer.items.add(newFile);
             log(`Файл "${file.name}" переименован в "${newName}"`);
         }
         if (fileInput) fileInput.files = dataTransfer.files;
     }

     // Обработчики событий
     function handleFileChange(event) {
         if (!renameEnabled) return;
         renameFiles(event.target.files, event.target);
     }
     
     function handleFileDrop(event) {
         const dropZone = event.currentTarget;
         if (!renameEnabled) {
             dropZone.classList.remove('drag-over');
             return;
         }
         event.preventDefault();
         event.stopPropagation();
         dropZone.classList.remove('drag-over');
         
         const fileInput = dropZone.querySelector('input[type="file"]');
         const droppedFiles = event.dataTransfer.files;
         if (fileInput && droppedFiles.length > 0) {
             renameFiles(droppedFiles, fileInput);
             fileInput.dispatchEvent(new Event('change', { bubbles: true }));
         }
     }

     function processExistingInputs() {
         document.querySelectorAll('cu-files[automation-id="add-solution-file"]').forEach(wrapper => {
             if (wrapper.hasAttribute('data-auto-rename-handled')) return;
             wrapper.setAttribute('data-auto-rename-handled', 'true');
             
             const input = wrapper.querySelector('input[type="file"]');
             if (input) input.addEventListener('change', handleFileChange);

             wrapper.addEventListener('dragover', (e) => {
                 if (!renameEnabled) return;
                 e.preventDefault(); e.stopPropagation();
                 e.currentTarget.classList.add('drag-over');
             }, { capture: true });
             wrapper.addEventListener('dragleave', (e) => {
                 if (!renameEnabled) return;
                 e.preventDefault(); e.stopPropagation();
                 e.currentTarget.classList.remove('drag-over');
             }, { capture: true });
             wrapper.addEventListener('drop', handleFileDrop, { capture: true });
         });
     }
     
     // ... (startDOMObserver и addDragDropStyles без изменений) ...
     function startDOMObserver() {
         if (observer) observer.disconnect();
         observer = new MutationObserver(() => {
             if (document.querySelector('cu-files[automation-id="add-solution-file"]:not([data-auto-rename-handled])')) {
                 processExistingInputs();
             }
         });
         observer.observe(document.body, { childList: true, subtree: true });
     }
     function addDragDropStyles() {
         const styleId = 'auto-rename-drag-styles';
         if (document.getElementById(styleId)) return;
         const style = document.createElement('style');
         style.id = styleId;
         style.textContent = `.drag-over { border: 2px dashed #007bff !important; background-color: rgba(0, 123, 255, 0.1) !important; }`;
         document.head.appendChild(style);
     }
     
     // Функция для проверки ИЗМЕНЕНИЙ в настройках
     function checkSettingChange() {
         if (typeof browser !== 'undefined') {
             // Запрашиваем оба ключа
             browser.storage.sync.get(['autoRenameEnabled', 'renameTemplate']).then(data => {
                 const newEnabled = !!data.autoRenameEnabled;
                 const newTemplate = data.renameTemplate || 'dz_fi'; // Дефолтное значение

                 if (renameEnabled !== newEnabled || currentTemplate !== newTemplate) {
                     log(`Настройки изменились: Включено (${renameEnabled} -> ${newEnabled}), Шаблон ('${currentTemplate}' -> '${newTemplate}')`);
                     renameEnabled = newEnabled;
                     currentTemplate = newTemplate;
                 }
             }).catch(error => {
                 log('Ошибка при получении настроек:', error);
                 renameEnabled = false;
             });
         }
     }

     function startSettingsChecker() {
         setInterval(checkSettingChange, 1000);
         checkSettingChange();
     }
     
     function initialize() {
         if (isInitialized) return;
         isInitialized = true;
         log('Инициализация скрипта автопереименования');
         
         addDragDropStyles();
         processExistingInputs();
         startDOMObserver();
         startSettingsChecker();
         
         if (typeof browser !== 'undefined') {
             browser.storage.onChanged.addListener((changes, area) => {
                 if (area === 'sync' && (changes.autoRenameEnabled || changes.renameTemplate)) {
                     checkSettingChange();
                 }
             });
         }
         
         // SPA-Навигация
         const originalPushState = history.pushState;
         history.pushState = function(...args) {
             originalPushState.apply(this, args);
             setTimeout(processExistingInputs, 300);
         };
         window.addEventListener('popstate', () => {
             setTimeout(processExistingInputs, 300);
         });
     }

     if (document.readyState === 'loading') {
         document.addEventListener('DOMContentLoaded', initialize);
     } else {
         initialize();
     }
 })();
