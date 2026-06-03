// courses_fix.js (финальная версия с поддержкой actual и archived страниц)
/* global viewFutureExams, activateCourseOverviewTaskStatus, activateCourseExporter, activateCourseOverviewAutoscroll */

// Polyfill to handle browser namespace differences (Chrome uses 'chrome', Firefox uses 'browser')
if (typeof browser === 'undefined') {
  var browser = chrome;
}

if (typeof window.culmsCourseFixInitialized === 'undefined') {
  window.culmsCourseFixInitialized = true;

  ('use strict');
  let currentUrl = location.href;
  let previousUrl = null;

  // Удален код для drag-and-drop (официальная версия теперь поддерживается нативно)

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }

  function main() {
    const reloadKeys = [
      'futureExamsViewToggle',
      'courseOverviewTaskStatusToggle',
      'futureExamsDisplayFormat',
    ];
    browser.storage.onChanged.addListener((changes) => {
      if (reloadKeys.some((key) => key in changes)) {
        window.location.reload();
      }

      if (changes.archivedCourseIds) {
        window.cuLmsLog('Course Archiver: archivedCourseIds changed, re-rendering.');
        processCourses();
      }

      if (changes.themeEnabled) {
        const isDark = changes.themeEnabled.newValue;
        window.cuLmsLog('Course Archiver: theme changed -> updating icon colors');
        updateArchiveButtonColors(isDark);
      }
    });

    const observer = new MutationObserver(() => {
      // Проверка на валидность контекста расширения
      try {
        if (typeof browser !== 'undefined' && !browser.runtime?.id) {
          observer.disconnect();
          return;
        }
      } catch (e) {
        observer.disconnect();
        return;
      }

      if (location.href !== currentUrl) {
        previousUrl = currentUrl;
        currentUrl = location.href;
        window.cuLmsLog('Course Archiver: URL changed from', previousUrl, 'to', currentUrl);

        // Небольшая задержка, чтобы Angular успел отрендерить контент
        setTimeout(() => {
          processCourses();

          const currentPath = window.location.pathname;
          const isOnIndividualCoursePage = /\/view\/(?:actual|archived)\/\d+/.test(currentPath);
          if (isOnIndividualCoursePage) {
            processInvidualCoursePage();
          }
        }, 300);
      }
    });

    observer.observe(document.body, { subtree: true, childList: true });

    // Дополнительно отслеживаем клики по ссылкам для более надежного определения навигации
    document.addEventListener(
      'click',
      (e) => {
        const link = e.target.closest('a[href]');
        if (link && link.href && link.href !== location.href) {
          const targetPath = new URL(link.href).pathname;
          // Если это переход между вкладками курсов
          if (targetPath.includes('/courses/view/actual')) {
            window.cuLmsLog('Course Archiver: Detected navigation via click to', targetPath);
            setTimeout(() => {
              if (location.pathname.includes('/courses/view/actual')) {
                processCourses();
              }
            }, 350);
          }
        }
      },
      true
    );

    // Начальная обработка с задержкой для первой загрузки страницы
    // Angular нужно время для рендеринга
    window.cuLmsLog('Course Archiver: Initial page load, waiting for Angular to render...');
    setTimeout(() => {
      processCourses();

      const currentPath = window.location.pathname;
      const isOnIndividualCoursePage = /\/view\/(?:actual|archived)\/\d+/.test(currentPath);
      if (isOnIndividualCoursePage) {
        processInvidualCoursePage();
      }
    }, 500);
  }

  function updateArchiveButtonColors(isDark) {
    document.querySelectorAll('.archive-action-button, .unarchive-button').forEach((button) => {
      applyArchiveButtonStyles(button, isDark);
    });
  }

  function getArchiveButtonBackground(isDarkTheme) {
    return isDarkTheme
      ? 'var(--culms-dark-bg-secondary, #3a3d42)'
      : 'var(--neutral-no-opaque, #e6e9ef)';
  }

  function applyArchiveButtonStyles(button, isDarkTheme) {
    const buttonBackground = getArchiveButtonBackground(isDarkTheme);
    button.style.setProperty('background', buttonBackground, 'important');
    button.style.setProperty('background-color', buttonBackground, 'important');
    button.style.setProperty('border', `1px solid ${buttonBackground}`, 'important');
    button.style.setProperty('border-color', buttonBackground, 'important');
    button.style.setProperty('opacity', '1', 'important');

    const icon = button.querySelector('img');
    if (icon) {
      icon.style.setProperty(
        'filter',
        isDarkTheme ? 'brightness(0) invert(1)' : 'none',
        'important'
      );
    }
  }

  let processCoursesTimeout = null;

  async function processCourses() {
    // Debounce: отменяем предыдущий вызов, если он еще не выполнился
    if (processCoursesTimeout) {
      clearTimeout(processCoursesTimeout);
    }

    processCoursesTimeout = setTimeout(async () => {
      try {
        const currentPath = window.location.pathname;
        window.cuLmsLog('Course Archiver: Processing courses on path:', currentPath);

        const isOnArchivedPage = currentPath.includes('/courses/view/archived');
        // Проверяем, что мы на странице actual (включая подстраницы required, elective, listener, internal)
        const isOnActualPage = currentPath.includes('/courses/view/actual');

        if (isOnArchivedPage) {
          window.cuLmsLog('Course Archiver: On archived page');
          await processArchivedCoursesTable();
        } else if (isOnActualPage) {
          window.cuLmsLog('Course Archiver: On actual page, waiting for course list');
          const courseList = await waitForElement('ul.course-list', 15000);
          window.cuLmsLog(
            'Course Archiver: Found course list with',
            courseList.children.length,
            'items'
          );
          await updateExistingActiveCourses(courseList);
          // Убрана поддержка кастомного drag-and-drop (официальный cdkDrag теперь работает нативно)
          courseList.classList.add('course-archiver-ready');
          window.cuLmsLog('Course Archiver: Finished processing courses');
        }
      } catch (e) {
        window.cuLmsLog(
          'Course Archiver: Not a course page, or content failed to load in time.',
          e
        );
        const courseList = document.querySelector('ul.course-list');
        if (courseList) {
          courseList.classList.add('course-archiver-ready');
        }
      }
      processCoursesTimeout = null;
    }, 100); // Небольшая задержка для debounce
  }

  async function processArchivedCoursesTable() {
    const tbody = await waitForElement('table.cu-table tbody', 15000);
    if (tbody.dataset.processed) return;
    tbody.dataset.processed = 'true';

    const allApiCourses = await fetchAllCoursesData();
    const storedArchivedCourseIds = await getArchivedCoursesFromStorage();
    const { themeEnabled: isDarkTheme } = await browser.storage.sync.get('themeEnabled');

    const courseNameMap = new Map(allApiCourses.map((course) => [course.name.trim(), course]));
    const displayedCourseNames = new Set();

    tbody.querySelectorAll('tr.course-row').forEach((row) => {
      const nameElement = row.querySelector('.name-cell span');
      if (!nameElement) return;
      const courseName = nameElement.textContent.trim();
      displayedCourseNames.add(courseName);
      const courseData = courseNameMap.get(courseName);
      if (courseData) {
        row.setAttribute('data-course-id', courseData.id);
        addUnarchiveButtonToRow(row, courseData.id, !!isDarkTheme);
      }
    });

    const coursesToAdd = allApiCourses.filter(
      (course) =>
        storedArchivedCourseIds.has(course.id) && !displayedCourseNames.has(course.name.trim())
    );

    coursesToAdd.forEach((courseData) => {
      const newRow = createArchivedCourseRow(courseData);
      tbody.appendChild(newRow);
      addUnarchiveButtonToRow(newRow, courseData.id, !!isDarkTheme);
    });
  }

  function createArchivedCourseRow(courseData) {
    const tr = document.createElement('tr');
    tr.className = 'course-row ng-star-inserted';
    tr.setAttribute('tuitr', '');
    tr.setAttribute('data-course-id', courseData.id);
    tr.setAttribute('tabindex', '0');
    tr.style.setProperty('--t-row-height', '48px');

    // Добавляем _nghost атрибут для точного соответствия стилям
    tr.innerHTML = `
            <td tuitd _nghost-ng-c4079261847 class="name-cell ng-star-inserted">
                <span class="limited-lines-text" style="--lines-count: 1;">${escapeHtml(courseData.name)}</span>
            </td>
            <td tuitd _nghost-ng-c4079261847 class="ng-star-inserted"><div>–</div></td>
            <td tuitd _nghost-ng-c4079261847 class="ng-star-inserted">
                <div class="category-badge">
                    <span cutext="s" class="font-text-s">Локально</span>
                </div>
            </td>
        `;
    tr.addEventListener('click', (e) => {
      if (e.target.closest('.unarchive-button')) return;
      window.location.href = `/learn/courses/view/actual/${courseData.id}`;
    });
    tr.style.cursor = 'pointer';
    return tr;
  }

  function addUnarchiveButtonToRow(row, courseId, isDarkTheme) {
    const nameCell = row.querySelector('.name-cell');
    if (!nameCell || nameCell.querySelector('.unarchive-button')) return;

    nameCell.style.display = 'flex';
    nameCell.style.justifyContent = 'flex-start';
    nameCell.style.alignItems = 'center';

    const button = document.createElement('button');
    button.className = 'unarchive-button';
    button.style.cssText =
      'border-radius: 10px; padding: 6px; cursor: pointer; line-height: 0; margin-right: 16px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;';
    applyArchiveButtonStyles(button, isDarkTheme);

    const iconUrl = '/learn/assets/cu/icons/cuIconArchive.svg';

    button.innerHTML = `
                    <img src="${iconUrl}" alt="unarchive" width="22" height="22" style="display: block;"/>
        `;

    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const currentArchivedCourseIds = await getArchivedCoursesFromStorage();
      if (currentArchivedCourseIds.has(courseId)) {
        currentArchivedCourseIds.delete(courseId);
        await setArchivedCoursesInStorage(currentArchivedCourseIds);
        row.style.display = 'none';
      }
    });

    const spanElement = nameCell.querySelector('span');
    if (spanElement) {
      nameCell.insertBefore(button, spanElement);
    } else {
      nameCell.prepend(button);
    }
  }

  async function updateExistingActiveCourses(courseList) {
    // Ждем, пока в списке действительно появятся курсы (Angular может рендерить их асинхронно)
    let attempts = 0;
    const maxAttempts = 30; // увеличено с 20 до 30 для первой загрузки

    while (courseList.children.length === 0 && attempts < maxAttempts) {
      window.cuLmsLog(
        'Course Archiver: Waiting for courses to appear in DOM, attempt',
        attempts + 1
      );
      await new Promise((resolve) => setTimeout(resolve, 150)); // увеличено с 100 до 150
      attempts++;
    }

    if (courseList.children.length === 0) {
      window.cuLmsLog('Course Archiver: No courses found in list after waiting');
      return;
    }

    window.cuLmsLog('Course Archiver: Found', courseList.children.length, 'courses in list');

    // Небольшая дополнительная задержка, чтобы Angular завершил рендеринг карточек
    await new Promise((resolve) => setTimeout(resolve, 200));

    const allApiCourses = await fetchAllCoursesData();
    const storedArchivedCourseIds = await getArchivedCoursesFromStorage();
    const { themeEnabled: isDarkTheme } = await browser.storage.sync.get('themeEnabled');

    const courseNameMap = new Map(allApiCourses.map((course) => [course.name.trim(), course]));
    const normalizeEmoji = (str) =>
      str.replace(/💙/g, '🔵').replace(/❤️/g, '🔴').replace(/🖤/g, '⚫️');

    let processedCount = 0;
    for (const card of courseList.querySelectorAll('li.course-list__item')) {
      // Пробуем разные селекторы для названия курса (новая и старая структура)
      const nameElement =
        card.querySelector('.course-name') ||
        card.querySelector('cu-course-card .limited-lines-text') ||
        card.querySelector('.font-text-s-bold');
      if (!nameElement) {
        window.cuLmsLog('Course Archiver: Could not find course name element in card', card);
        continue;
      }
      const courseName = normalizeEmoji(nameElement.textContent.trim());
      const courseData = courseNameMap.get(courseName);
      if (!courseData) {
        window.cuLmsLog('Course Archiver: Could not find course data for:', courseName);
        continue;
      }

      const courseId = courseData.id;
      card.setAttribute('data-course-id', courseId);

      const isLocallyArchived = storedArchivedCourseIds.has(courseId);
      card.style.display = isLocallyArchived ? 'none' : '';
      if (!isLocallyArchived) {
        addOrUpdateButton(card, courseId, isLocallyArchived, !!isDarkTheme);
        processedCount++;
      }
    }

    window.cuLmsLog('Course Archiver: Processed', processedCount, 'active courses');
  }

  function addOrUpdateButton(li, courseId, isLocallyArchived, isDarkTheme) {
    // Новая структура: кнопка добавляется внутри cu-course-card
    const cuCourseCard = li.querySelector('cu-course-card');
    if (!cuCourseCard) return;

    // Убеждаемся, что cu-course-card имеет relative позиционирование
    cuCourseCard.style.position = 'relative';

    let buttonContainer = li.querySelector('.archive-button-container');
    if (!buttonContainer) {
      buttonContainer = document.createElement('div');
      buttonContainer.className = 'archive-button-container';
      cuCourseCard.appendChild(buttonContainer);
    }
    buttonContainer.style.cssText = `position: absolute; right: 8px; bottom: 8px; z-index: 10;`;

    const iconUrl = '/learn/assets/cu/icons/cuIconArchive.svg';

    buttonContainer.innerHTML = `
                        <button class="archive-action-button" style="border-radius: 10px; padding: 6px; cursor: pointer; line-height: 0; display: inline-flex; align-items: center; justify-content: center;">
                            <img src="${iconUrl}" alt="archive" width="22" height="22" style="display: block;"/>
            </button>
        `;

    const archiveButton = buttonContainer.querySelector('button');
    applyArchiveButtonStyles(archiveButton, isDarkTheme);

    archiveButton.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const currentArchivedCourseIds = await getArchivedCoursesFromStorage();
      if (currentArchivedCourseIds.has(courseId)) {
        currentArchivedCourseIds.delete(courseId);
      } else {
        currentArchivedCourseIds.add(courseId);
      }
      await setArchivedCoursesInStorage(currentArchivedCourseIds);
      li.style.display = 'none';
    });
  }

  // Функции drag-and-drop удалены, так как теперь используется официальный cdkDrag

  async function processInvidualCoursePage() {
    try {
      await processFutureExams();
      await processCourseOverviewTaskStatus();
      await processCourseExporter();

      // ИЗМЕНЕНИЕ 3: Теперь скролл работает, даже если пришли из списка архива
      const activeCoursesPathRegex = /^\/learn\/courses\/view\/(?:actual|archived)$/;
      if (previousUrl) {
        const previousPath = new URL(previousUrl).pathname;
        if (activeCoursesPathRegex.test(previousPath)) {
          await processCourseOverviewAutoscroll();
        }
      } else {
        await processCourseOverviewAutoscroll();
      }
    } catch (e) {
      window.cuLmsLog('Error processing individual course page', e);
    }
  }

  async function processFutureExams() {
    try {
      const { futureExamsViewToggle } = await browser.storage.sync.get('futureExamsViewToggle');
      const { futureExamsDisplayFormat } = await browser.storage.sync.get(
        'futureExamsDisplayFormat'
      );

      if (!!futureExamsViewToggle && typeof viewFutureExams === 'function') {
        await viewFutureExams(futureExamsDisplayFormat || 'date');
      }
    } catch (e) {
      console.log('Something went wrong with future exams', e);
    }
  }

  async function processCourseOverviewTaskStatus() {
    try {
      const { courseOverviewTaskStatusToggle } = await browser.storage.sync.get(
        'courseOverviewTaskStatusToggle'
      );
      if (
        !!courseOverviewTaskStatusToggle &&
        typeof activateCourseOverviewTaskStatus === 'function'
      ) {
        await activateCourseOverviewTaskStatus();
      }
    } catch (e) {
      console.log('Something went wrong with course overview task status', e);
    }
  }

  async function processCourseExporter() {
    try {
      const { courseExporterToggle } = await browser.storage.sync.get('courseExporterToggle');
      if (
        (!!courseExporterToggle || courseExporterToggle === undefined) &&
        typeof activateCourseExporter === 'function'
      ) {
        await activateCourseExporter();
      }
    } catch (e) {
      console.log('Something went wrong with course exporter', e);
    }
  }

  async function processCourseOverviewAutoscroll() {
    try {
      const { courseOverviewAutoscrollToggle } = await browser.storage.sync.get(
        'courseOverviewAutoscrollToggle'
      );
      if (
        !!courseOverviewAutoscrollToggle &&
        typeof activateCourseOverviewAutoscroll === 'function'
      ) {
        await activateCourseOverviewAutoscroll();
      }
    } catch (e) {
      console.log('Something went wrong with course overview task status', e);
    }
  }

  async function fetchAllCoursesData() {
    try {
      const API_BASE_URL = 'https://my.centraluniversity.ru/api/micro-lms';
      const [activeResponse, archivedResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/courses/student?limit=10000&state=published`),
        fetch(`${API_BASE_URL}/courses/student?limit=10000&state=archived`),
      ]);
      if (!activeResponse.ok || !archivedResponse.ok) throw new Error('HTTP error!');
      const activeData = await activeResponse.json();
      const archivedData = await archivedResponse.json();
      const allCoursesMap = new Map();
      (activeData.items || []).forEach((c) => allCoursesMap.set(c.id, { ...c, isArchived: false }));
      (archivedData.items || []).forEach((c) =>
        allCoursesMap.set(c.id, { ...c, isArchived: true })
      );
      return Array.from(allCoursesMap.values());
    } catch (error) {
      window.cuLmsLog(`Course Archiver: Failed to fetch all courses:`, error);
      return [];
    }
  }

  async function getArchivedCoursesFromStorage() {
    const { archivedCourseIds } = await browser.storage.local.get('archivedCourseIds');
    return new Set(archivedCourseIds || []);
  }

  async function setArchivedCoursesInStorage(archivedCourseIds) {
    await browser.storage.local.set({
      archivedCourseIds: Array.from(archivedCourseIds),
    });
  }

  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      let element = document.querySelector(selector);

      // Проверяем не только наличие элемента, но и что он имеет содержимое
      const isElementReady = (el) => {
        if (!el) return false;
        // Для списка курсов проверяем, что в нем есть дочерние элементы
        if (selector === 'ul.course-list') {
          return el.children.length > 0;
        }
        return true;
      };

      if (element && isElementReady(element)) {
        window.cuLmsLog(
          'Course Archiver: Element',
          selector,
          'found immediately with',
          element.children?.length,
          'children'
        );
        return resolve(element);
      }

      const observer = new MutationObserver(() => {
        element = document.querySelector(selector);
        if (element && isElementReady(element)) {
          window.cuLmsLog(
            'Course Archiver: Element',
            selector,
            'found via observer with',
            element.children?.length,
            'children'
          );
          observer.disconnect();
          resolve(element);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        element = document.querySelector(selector);
        if (element) {
          window.cuLmsLog(
            'Course Archiver: Element',
            selector,
            'found on timeout with',
            element.children?.length,
            'children'
          );
          resolve(element);
        } else {
          reject(new Error(`Element ${selector} not found within ${timeout}ms`));
        }
      }, timeout);
    });
  }

  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return String(text).replace(/[&<>"']/g, (m) => map[m]);
  }
}
