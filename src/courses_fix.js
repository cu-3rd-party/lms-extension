// courses_fix.js (финальная версия с полной идентичностью строк и кросс-браузерной совместимостью)

// Polyfill to handle browser namespace differences (Chrome uses 'chrome', Firefox uses 'browser')
if (typeof browser === 'undefined') {
    var browser = chrome;
}

if (typeof window.culmsCourseFixInitialized === 'undefined') {
    window.culmsCourseFixInitialized = true;

    'use strict';
    let currentUrl = location.href;
    let previousUrl = null;

    (async function () {
        const designData = await browser.storage.sync.get('oldCoursesDesignToggle');
        const useOldDesign = !!designData.oldCoursesDesignToggle;

        if (useOldDesign) {
            const style = document.createElement('style');
            style.id = 'course-archiver-preload-style';
            style.textContent = `
              ul.course-list {
                  opacity: 0 !important;
                  visibility: hidden !important;
              }
              ul.course-list.course-archiver-ready {
                  opacity: 1 !important;
                  visibility: visible !important
              }
              li.course-list__item {
                  cursor: grab;
                  user-select: none;
              }
              li.course-list__item.dragging {
                  opacity: 0.5;
                  cursor: grabbing;
              }
          `;
            document.head.appendChild(style);
        }
    })();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', main);
    } else {
        main();
    }

    function main() {
        const reloadKeys = [
          'oldCoursesDesignToggle',
          'futureExamsViewToggle',
          'courseOverviewTaskStatusToggle',
          'futureExamsDisplayFormat'
        ];
        browser.storage.onChanged.addListener((changes) => {
            if (reloadKeys.some(key => key in changes)) {
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
            if (location.href !== currentUrl) {
                previousUrl = currentUrl;
                currentUrl = location.href;
                console.log('Course Archiver: URL changed, re-running logic.');
                processCourses();

                const currentPath = window.location.pathname;
                const isOnIndividualCoursePage = /\/view\/actual\/\d+/.test(currentPath);
                if (isOnIndividualCoursePage) {
                   processInvidualCoursePage();
                }
            }
        });

        observer.observe(document.body, { subtree: true, childList: true });
        processCourses();

        const currentPath = window.location.pathname;
        const isOnIndividualCoursePage = /\/view\/actual\/\d+/.test(currentPath);
        if (isOnIndividualCoursePage) {
          processInvidualCoursePage();
        }
    }

    function updateArchiveButtonColors(isDark) {
        const color = isDark ? '#FFFFFF' : '#181a1c';
        document.querySelectorAll('.archive-button-container span, .unarchive-button span').forEach(span => {
            span.style.setProperty('background-color', color, 'important');
        });
    }

    async function processCourses() {
        try {
            const currentPath = window.location.pathname;
            const isOnArchivedPage = currentPath.includes('/courses/view/archived');

            if (isOnArchivedPage) {
                await processArchivedCoursesTable();
            } else {
                const courseList = await waitForElement('ul.course-list', 15000);
                await updateExistingActiveCourses(courseList);
                await applyCustomOrder(courseList);
                setupDragAndDrop(courseList);
            }
        } catch (e) {
            window.cuLmsLog("Course Archiver: Not a course page, or content failed to load in time.", e);
        }
    }

    async function processArchivedCoursesTable() {
        const tbody = await waitForElement('table.cu-table tbody', 15000);
        if (tbody.dataset.processed) return;
        tbody.dataset.processed = 'true';

        const allApiCourses = await fetchAllCoursesData();
        const storedArchivedCourseIds = await getArchivedCoursesFromStorage();
        const { themeEnabled: isDarkTheme } = await browser.storage.sync.get('themeEnabled');

        const courseNameMap = new Map(allApiCourses.map(course => [course.name.trim(), course]));
        const displayedCourseNames = new Set();
        
        tbody.querySelectorAll('tr.course-row').forEach(row => {
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

        const coursesToAdd = allApiCourses.filter(course =>
            storedArchivedCourseIds.has(course.id) && !displayedCourseNames.has(course.name.trim())
        );

        coursesToAdd.forEach(courseData => {
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
        button.style.cssText = 'background: none; border: none; padding: 0; cursor: pointer; line-height: 0; margin-right: 16px; flex-shrink: 0;';

        const iconUrl = browser.runtime.getURL('icons/unarchive.svg');
        const iconColor = isDarkTheme ? '#FFFFFF' : '#181a1c';

        button.innerHTML = `
          <span style="display: inline-block; width: 24px; height: 24px; mask-image: url(${iconUrl}); -webkit-mask-image: url(${iconUrl}); mask-size: contain; -webkit-mask-size: contain; mask-repeat: no-repeat; background-color: ${iconColor} !important;"></span>
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
        const allApiCourses = await fetchAllCoursesData();
        const storedArchivedCourseIds = await getArchivedCoursesFromStorage();
        const { themeEnabled: isDarkTheme } = await browser.storage.sync.get('themeEnabled');

        const courseNameMap = new Map(allApiCourses.map(course => [course.name.trim(), course]));
        const normalizeEmoji = str => str.replace(/💙/g, '🔵').replace(/❤️/g, '🔴').replace(/🖤/g, '⚫️');

        for (const card of courseList.querySelectorAll('li.course-list__item')) {
            const nameElement = card.querySelector('.course-name.font-text-s-bold');
            if (!nameElement) continue;
            const courseData = courseNameMap.get(normalizeEmoji(nameElement.textContent.trim()));
            if (!courseData) continue;
            
            const courseId = courseData.id;
            card.setAttribute('data-course-id', courseId);
            
            const isLocallyArchived = storedArchivedCourseIds.has(courseId);
            card.style.display = isLocallyArchived ? 'none' : '';
            if (!isLocallyArchived) {
                addOrUpdateButton(card, courseId, isLocallyArchived, !!isDarkTheme);
            }
        }
    }
    
    function addOrUpdateButton(li, courseId, isLocallyArchived, isDarkTheme) {
        const imageAreaContainer = li.querySelector('div.course-card');
        if (!imageAreaContainer) return;

        imageAreaContainer.style.position = 'relative';
        let buttonContainer = li.querySelector('.archive-button-container');
        if (!buttonContainer) {
            buttonContainer = document.createElement('div');
            buttonContainer.className = 'archive-button-container';
            imageAreaContainer.appendChild(buttonContainer);
        }
        buttonContainer.style.cssText = `position: absolute; right: 8px; bottom: 4px; z-index: 2;`;
        
        const iconUrl = isLocallyArchived
            ? browser.runtime.getURL('icons/unarchive.svg')
            : browser.runtime.getURL('icons/archive.svg');
        const iconColor = isDarkTheme ? '#FFFFFF' : '#181a1c';
        
        buttonContainer.innerHTML = `
            <button style="background: none; border: none; padding: 0; cursor: pointer; line-height: 0;">
              <span style="display: inline-block; width: 24px; height: 24px; mask-image: url(${iconUrl}); -webkit-mask-image: url(${iconUrl}); mask-size: contain; -webkit-mask-size: contain; mask-repeat: no-repeat; background-color: ${iconColor} !important;"></span>
            </button>
        `;

        buttonContainer.querySelector('button').addEventListener('click', async (event) => {
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

    async function getCustomOrder() {
        const { courseOrder } = await browser.storage.local.get('courseOrder');
        return courseOrder || [];
    }

    async function saveCustomOrder(order) {
        await browser.storage.local.set({ courseOrder: order });
    }

    async function applyCustomOrder(courseList) {
        if (!courseList) return;
        const customOrder = await getCustomOrder();
        const courses = Array.from(courseList.children);
        const courseMap = new Map();
        courses.forEach(course => {
            const id = course.getAttribute('data-course-id');
            if (id) courseMap.set(id, course);
        });

        if (customOrder.length === 0) {
            const initialOrder = courses.map(course => course.getAttribute('data-course-id')).filter(Boolean);
            if (initialOrder.length > 0) await saveCustomOrder(initialOrder);
            return;
        }
        
        const finalOrder = [];
        const fragment = document.createDocumentFragment();

        customOrder.forEach(courseId => {
            if (courseMap.has(courseId)) {
                fragment.appendChild(courseMap.get(courseId));
                finalOrder.push(courseId);
                courseMap.delete(courseId);
            }
        });

        courseMap.forEach((course, id) => {
            fragment.appendChild(course);
            finalOrder.push(id);
        });

        courseList.innerHTML = '';
        courseList.appendChild(fragment);
        await saveCustomOrder(finalOrder);
    }

    function setupDragAndDrop(courseList) {
        if (!courseList) return;
        let draggedElement = null;

        const handleDragStart = function(e) {
            draggedElement = this;
            this.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', this.getAttribute('data-course-id'));
        };
        const handleDragEnd = function() {
            this.classList.remove('dragging');
            draggedElement = null;
            const newOrder = Array.from(courseList.children)
                .map(item => item.getAttribute('data-course-id'))
                .filter(Boolean);
            saveCustomOrder(newOrder);
        };
        const handleDragOver = function(e) {
            e.preventDefault();
            if (!draggedElement || this === draggedElement) return;
            const rect = this.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (e.clientY < midY) {
                this.parentNode.insertBefore(draggedElement, this);
            } else {
                this.parentNode.insertBefore(draggedElement, this.nextSibling);
            }
        };

        const cards = courseList.querySelectorAll('li.course-list__item');
        cards.forEach(card => {
            card.draggable = true;
            card.removeEventListener('dragstart', handleDragStart);
            card.addEventListener('dragstart', handleDragStart);
            card.removeEventListener('dragend', handleDragEnd);
            card.addEventListener('dragend', handleDragEnd);
            card.removeEventListener('dragover', handleDragOver);
            card.addEventListener('dragover', handleDragOver);
        });
    }

    async function processInvidualCoursePage() {
      try {
          await processFutureExams();
          await processCourseOverviewTaskStatus();
          
          const activeCoursesPathRegex = /^\/learn\/courses\/view\/actual$/;
          if (previousUrl) {
            const previousPath = new URL(previousUrl).pathname;
            if (activeCoursesPathRegex.test(previousPath)) {
                await processCourseOverviewAutoscroll();
            }
          } else {
            await processCourseOverviewAutoscroll();
          }
      } catch (e) {
          window.cuLmsLog("Error processing individual course page", e);
      }
    }

    async function processFutureExams() {
        try {
            const { futureExamsViewToggle } = await browser.storage.sync.get('futureExamsViewToggle');
            const { futureExamsDisplayFormat } = await browser.storage.sync.get('futureExamsDisplayFormat');

            if (!!futureExamsViewToggle && typeof viewFutureExams === 'function') {
                await viewFutureExams(futureExamsDisplayFormat || 'date');
            }
        } catch (e) {
            console.log("Something went wrong with future exams", e);
        }
    }

    async function processCourseOverviewTaskStatus() {
        try {
            const { courseOverviewTaskStatusToggle } = await browser.storage.sync.get('courseOverviewTaskStatusToggle');
            if (!!courseOverviewTaskStatusToggle && typeof activateCourseOverviewTaskStatus === 'function') {
                await activateCourseOverviewTaskStatus();
            }
        } catch (e) {
            console.log("Something went wrong with course overview task status", e);
        }
    }

    async function processCourseOverviewAutoscroll() {
        try {
            const { courseOverviewAutoscrollToggle } = await browser.storage.sync.get('courseOverviewAutoscrollToggle');
            if (!!courseOverviewAutoscrollToggle && typeof activateCourseOverviewAutoscroll === 'function') {
                await activateCourseOverviewAutoscroll();
            }
        } catch (e) {
            console.log("Something went wrong with course overview task status", e);
        }
    }

    async function fetchAllCoursesData() {
        try {
            const API_BASE_URL = 'https://my.centraluniversity.ru/api/micro-lms';
            const [activeResponse, archivedResponse] = await Promise.all([
                fetch(`${API_BASE_URL}/courses/student?limit=10000&state=published`),
                fetch(`${API_BASE_URL}/courses/student?limit=10000&state=archived`)
            ]);
            if (!activeResponse.ok || !archivedResponse.ok) throw new Error('HTTP error!');
            const activeData = await activeResponse.json();
            const archivedData = await archivedResponse.json();
            const allCoursesMap = new Map();
            (activeData.items || []).forEach(c => allCoursesMap.set(c.id, { ...c, isArchived: false }));
            (archivedData.items || []).forEach(c => allCoursesMap.set(c.id, { ...c, isArchived: true }));
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
        await browser.storage.local.set({ archivedCourseIds: Array.from(archivedCourseIds) });
    }

    function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            let element = document.querySelector(selector);
            if (element) return resolve(element);
            
            const observer = new MutationObserver(() => {
                element = document.querySelector(selector);
                if (element) {
                    observer.disconnect();
                    resolve(element);
                }
            });
            
            observer.observe(document.body, { childList: true, subtree: true });
            
            setTimeout(() => {
                observer.disconnect();
                element = document.querySelector(selector);
                if (element) resolve(element);
                else reject(new Error(`Element ${selector} not found within ${timeout}ms`));
            }, timeout);
        });
    }

    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return String(text).replace(/[&<>"']/g, m => map[m]);
    }
}