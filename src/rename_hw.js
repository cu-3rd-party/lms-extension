// rename_hw.js — версия с получением имени/фамилии из API /api/account/me
(function () {
  'use strict';

  let renameEnabled = false;        // (autoRenameEnabled)
  let currentTemplate = 'dz_fi';    // (autoRenameTemplate)
  let observer = null;
  let isInitialized = false;

  // --- ДАННЫЕ ПОЛЬЗОВАТЕЛЯ ИЗ API ---
  const ME_URL = 'https://my.centraluniversity.ru/api/account/me';
  let userInfoCache = null;         // { firstName, lastName }
  let userInfoPromise = null;       // Promise<{ firstName, lastName }>

  function log(...args) {
    if (typeof window.cuLmsLog === 'function') window.cuLmsLog(...args);
    else console.log('AutoRename:', ...args);
  }

  function getFileExtension(filename) {
    return filename.slice((filename.lastIndexOf('.') >>> 0) + 1);
  }

  // --- БЛОК РАБОТЫ С ДАТОЙ/НЕДЕЛЕЙ ---

  function getLastHistoryDate() {
    const dateElements = document.querySelectorAll('.task-history-card__date');
    if (dateElements.length === 0) return null;
    const lastDateElement = dateElements[dateElements.length - 1];
    const dateText = lastDateElement.textContent.trim();
    const dateMatch = dateText.match(/(\d{2}\.\d{2}\.\d{4})/);
    return dateMatch ? dateMatch[1] : null;
  }

  function calculateWeekNumber(targetDate) {
    const baseDate = new Date(2025, 8, 8); // 8 сентября 2025
    const [day, month, year] = targetDate.split('.');
    const currentDate = new Date(`${year}-${month}-${day}`);
    const timeDiff = currentDate.getTime() - baseDate.getTime();
    const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    return Math.floor(daysDiff / 7) + 1;
  }

  function findWeekNumberInUI() {
    const weekElementsNotArray = document.querySelectorAll(
      'a[href*="/learn/courses/view/actual/"], .week-navigation__item--active, [class*="week"]'
    );
    const weekElements = Array.from(weekElementsNotArray);
    for (const element of weekElements.reverse()) {
      const weekMatch =
        element.textContent.match(/неделя\s*(\d+)/i) ||
        element.textContent.match(/(\d+)/);
      if (weekMatch) return parseInt(weekMatch[1], 10);
    }
    return 0;
  }

  function findHomeworkNumberInH4() {
    const h4Elements = document.querySelectorAll('h4');
    for (const h4 of h4Elements) {
      const hwMatch = h4.textContent.match(/ДЗ\s*(\d+)/i);
      if (hwMatch) return parseInt(hwMatch[1], 10);
    }
    return 0;
  }

  function getWeekNumber() {
    let week = findWeekNumberInUI() || findHomeworkNumberInH4();
    if (week > 0) return week;
    const lastDate = getLastHistoryDate();
    return lastDate ? calculateWeekNumber(lastDate) : 0;
  }

  // --- ПОЛУЧЕНИЕ ИМЕНИ/ФАМИЛИИ ИЗ API /api/account/me ---

  async function fetchMeFromApi() {
    try {
      const resp = await fetch(ME_URL, {
        method: 'GET',
        credentials: 'include', // важно: тянем куки/сессию
        headers: { 'Accept': 'application/json' }
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      }

      const data = await resp.json();

      const firstName = (data.given_name || '').trim();
      const lastName = (data.family_name || '').trim();

      if (!firstName || !lastName) {
        // fallback: пробуем распарсить data.name ("Имя Фамилия")
        const full = (data.name || '').trim().replace(/\s+/g, ' ');
        const parts = full.split(' ');
        return {
          firstName: firstName || (parts[0] || 'Unknown'),
          lastName: lastName || (parts[1] || 'User')
        };
      }

      return { firstName, lastName };
    } catch (e) {
      log('Не удалось получить данные пользователя из /api/account/me:', e);
      return { firstName: 'Unknown', lastName: 'User' };
    }
  }

  function getUserNamePartsAsync() {
    // 1) если уже есть кеш — отдаем сразу
    if (userInfoCache) return Promise.resolve(userInfoCache);

    // 2) если запрос уже в процессе — используем его
    if (userInfoPromise) return userInfoPromise;

    // 3) иначе стартуем запрос
    userInfoPromise = fetchMeFromApi().then(info => {
      userInfoCache = info;
      return info;
    });

    return userInfoPromise;
  }

  // --- ПЕРЕИМЕНОВАНИЕ ФАЙЛОВ ---

  async function renameFiles(files, fileInput) {
    if (!renameEnabled || !files || files.length === 0) return;

    const weekNumber = getWeekNumber();
    const { firstName, lastName } = await getUserNamePartsAsync();

    log(`Переименование по шаблону "${currentTemplate}": Неделя ${weekNumber}, Пользователь ${lastName} ${firstName}`);

    const dataTransfer = new DataTransfer();

    for (const file of files) {
      const extension = getFileExtension(file.name);
      let newName = file.name;
      let prefix = '';
      let nameOrder = '';

      switch (currentTemplate) {
        case 'dz_if':
          prefix = 'ДЗ';
          nameOrder = `${firstName}_${lastName}`;
          break;
        case 'dz_fi':
          prefix = 'ДЗ';
          nameOrder = `${lastName}_${firstName}`;
          break;
        case 'hw_if':
          prefix = 'HW';
          nameOrder = `${firstName}_${lastName}`;
          break;
        case 'hw_fi':
          prefix = 'HW';
          nameOrder = `${lastName}_${firstName}`;
          break;
      }

      if (prefix && nameOrder) {
        newName = `${prefix}_${weekNumber}_${nameOrder}${extension ? '.' + extension : ''}`;
      }

      const newFile = new File([file], newName, {
        type: file.type,
        lastModified: file.lastModified
      });

      dataTransfer.items.add(newFile);
      log(`Файл "${file.name}" переименован в "${newName}"`);
    }

    if (fileInput) fileInput.files = dataTransfer.files;
  }

  // --- ОБРАБОТЧИКИ СОБЫТИЙ ДЛЯ INPUT / DnD ---

  async function handleFileChange(event) {
    if (!renameEnabled) return;
    await renameFiles(event.target.files, event.target);
  }

  async function handleFileDrop(event) {
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
      await renameFiles(droppedFiles, fileInput);
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function processExistingInputs() {
    document.querySelectorAll('cu-files[automation-id="add-solution-file"]').forEach(wrapper => {
      if (wrapper.hasAttribute('data-auto-rename-handled')) return;
      wrapper.setAttribute('data-auto-rename-handled', 'true');

      const input = wrapper.querySelector('input[type="file"]');
      if (input) input.addEventListener('change', handleFileChange);

      wrapper.addEventListener(
        'dragover',
        e => {
          if (!renameEnabled) return;
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.classList.add('drag-over');
        },
        { capture: true }
      );

      wrapper.addEventListener(
        'dragleave',
        e => {
          if (!renameEnabled) return;
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.classList.remove('drag-over');
        },
        { capture: true }
      );

      wrapper.addEventListener('drop', handleFileDrop, { capture: true });
    });
  }

  // --- DOM Observer / Стили для DnD ---

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
    style.textContent =
      `.drag-over { border: 2px dashed #007bff !important;` +
      ` background-color: rgba(0, 123, 255, 0.1) !important; }`;
    document.head.appendChild(style);
  }

  // --- НАСТРОЙКИ: ЗАГРУЗКА И СЛУШАТЕЛИ ---

  function loadSettingsFromStorage() {
    if (typeof browser === 'undefined' || !browser.storage || !browser.storage.sync) {
      log('browser.storage.sync недоступен, авто-переименование отключено');
      renameEnabled = false;
      return;
    }

    browser.storage.sync
      .get(['autoRenameEnabled', 'autoRenameTemplate'])
      .then(data => {
        const newEnabled = !!data.autoRenameEnabled;
        const newTemplate = data.autoRenameTemplate || 'dz_fi';

        log(`Инициализация настроек: Включено = ${newEnabled}, Шаблон = '${newTemplate}'`);

        renameEnabled = newEnabled;
        currentTemplate = newTemplate;
      })
      .catch(error => {
        log('Ошибка при получении настроек из storage.sync:', error);
        renameEnabled = false;
      });
  }

  function handleStorageChanges(changes, area) {
    if (area !== 'sync') return;

    let changed = false;

    if (changes.autoRenameEnabled) {
      const oldVal = renameEnabled;
      const newVal = !!changes.autoRenameEnabled.newValue;
      renameEnabled = newVal;
      log(`autoRenameEnabled: ${oldVal} -> ${newVal}`);
      changed = true;
    }

    if (changes.autoRenameTemplate) {
      const oldTpl = currentTemplate;
      const newTpl = changes.autoRenameTemplate.newValue || 'dz_fi';
      currentTemplate = newTpl;
      log(`autoRenameTemplate: '${oldTpl}' -> '${newTpl}'`);
      changed = true;
    }

    if (changed) {
      log(`Обновлены настройки авто-переименования: enabled=${renameEnabled}, template='${currentTemplate}'`);
    }
  }

  // --- ИНИЦИАЛИЗАЦИЯ ---

  function initialize() {
    if (isInitialized) return;
    isInitialized = true;
    log('Инициализация скрипта автопереименования');

    addDragDropStyles();
    processExistingInputs();
    startDOMObserver();

    // настройки
    loadSettingsFromStorage();

    // можно заранее прогреть кеш user info (не обязательно, но ускоряет первое переименование)
    getUserNamePartsAsync().then(info => {
      log(`Пользователь из API: ${info.lastName} ${info.firstName}`);
    });

    if (typeof browser !== 'undefined' && browser.storage && browser.storage.onChanged) {
      browser.storage.onChanged.addListener(handleStorageChanges);
    }

    const originalPushState = history.pushState;
    history.pushState = function (...args) {
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
