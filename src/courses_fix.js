// courses_fix.js (версия с drag-and-drop на странице активных курсов и исправленной логикой)

if (typeof window.culmsCourseFixInitialized === 'undefined') {
    window.culmsCourseFixInitialized = true;

    'use strict';
    let currentUrl = location.href;

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
              li.course-card {
                  cursor: grab;
                  user-select: none;
              }
              li.course-card.dragging {
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
        browser.storage.onChanged.addListener((changes) => {
            if (changes.oldCoursesDesignToggle || changes.futureExamsViewToggle) {
                window.location.reload();
                return;
            }

            if (changes.courseOverviewTaskStatusToggle) {
                window.location.reload();
                return;
            }

            // 🔧 Разделено, чтобы корректно отслеживать themeEnabled
            if (changes.archivedCourseIds) {
                window.cuLmsLog('Course Archiver: archivedCourseIds changed, re-rendering.');
                const currentPath = window.location.pathname;
                const isOnArchivedPage = currentPath.includes('/courses/view/archived');
                browser.storage.sync.get('oldCoursesDesignToggle').then((designData) => {
                    const useOldDesign = !!designData.oldCoursesDesignToggle;
                    if (!isOnArchivedPage || !useOldDesign) {
                        processCourses();
                    }
                });
            }

            if (changes.themeEnabled) {
                const isDark = changes.themeEnabled.newValue;
                window.cuLmsLog('Course Archiver: theme changed -> updating icon colors');
                updateArchiveButtonColors(isDark);
            }
        });

        const observer = new MutationObserver(() => {
            if (location.href !== currentUrl) {
                currentUrl = location.href;
                console.log('Course Archiver: URL changed, re-running logic.');
                processCourses();

                const currentPath = window.location.pathname;
                const isOnIndividualCoursePage = /\/view\/actual\/\d+/.test(currentPath);
                if (isOnIndividualCoursePage) {
                    processFutureExams();
                    processCourseOverviewTaskStatus();
                }
            }
        });

        observer.observe(document.body, { subtree: true, childList: true });

        processCourses();

        const currentPath = window.location.pathname;
        const isOnIndividualCoursePage = /\/view\/actual\/\d+/.test(currentPath);
        if (isOnIndividualCoursePage) {
            processFutureExams();
            processCourseOverviewTaskStatus();
        }
    }

    function updateArchiveButtonColors(isDark) {
        document.querySelectorAll('.archive-button-container span').forEach(span => {
            span.style.setProperty('background-color', isDark ? '#FFFFFF' : '#181a1c', 'important');
        });
    }

    const archiveButtonsObserver = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType !== 1) return;

                const containers = [];
                if (node.matches && node.matches('.archive-button-container')) {
                    containers.push(node);
                } else if (node.querySelector && node.querySelectorAll) {
                    node.querySelectorAll('.archive-button-container').forEach(c => containers.push(c));
                }

                if (containers.length > 0) {
                    browser.storage.sync.get('themeEnabled').then(data => {
                        const isDark = !!data.themeEnabled;
                        containers.forEach(container => {
                            container.querySelectorAll('span').forEach(span => {
                                span.style.setProperty('background-color', isDark ? '#FFFFFF' : '#181a1c', 'important');
                            });
                        });
                    });
                }
            });
        });
    });

    archiveButtonsObserver.observe(document.body, { childList: true, subtree: true });

    async function processCourses() {
        try {
            const courseList = await waitForElement('ul.course-list', 15000);
            const currentPath = window.location.pathname;
            const isOnArchivedPage = currentPath.includes('/courses/view/archived');

            if (isOnArchivedPage) {
                // На странице архива просто рендерим всё с нуля, без сортировки
                await renderArchivedPageFromScratch();
            } else {
                // На странице активных курсов обновляем существующие, применяем порядок и включаем drag-n-drop
                await updateExistingActiveCourses();
                await applyCustomOrder(courseList);
                setupDragAndDrop(courseList);
            }

            restoreSkillLevelIconColors();
            const designData = await browser.storage.sync.get('oldCoursesDesignToggle');
            const useOldDesign = !!designData.oldCoursesDesignToggle;

            if (useOldDesign && typeof simplifyAllCourseCards === 'function') {
                simplifyAllCourseCards();
                // observeCourseListChanges(); // Эта функция не определена в коде, возможно, она в другом файле
                courseList.classList.add('course-archiver-ready');
            }

        } catch (e) {
            window.cuLmsLog("Course Archiver: Not a course page, or content failed to load in time.", e);
        }
    }

    async function getCustomOrder() {
        try {
            const data = await browser.storage.local.get('courseOrder');
            return data.courseOrder || [];
        } catch (e) {
            console.error('Failed to get custom order:', e);
            return [];
        }
    }

    async function saveCustomOrder(order) {
        try {
            await browser.storage.local.set({ courseOrder: order });
        } catch (e) {
            console.error('Failed to save custom order:', e);
        }
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

        // Если сохраненного порядка нет, сохраняем текущий
        if (customOrder.length === 0) {
            const initialOrder = courses.map(course => course.getAttribute('data-course-id')).filter(Boolean);
            if (initialOrder.length > 0) {
                await saveCustomOrder(initialOrder);
            }
            return;
        }
        
        const finalOrder = [];
        const fragment = document.createDocumentFragment();

        // Сначала добавляем курсы в сохраненном порядке
        for (const courseId of customOrder) {
            if (courseMap.has(courseId)) {
                fragment.appendChild(courseMap.get(courseId));
                finalOrder.push(courseId);
                courseMap.delete(courseId);
            }
        }

        // Добавляем новые курсы (которых не было в сохраненном порядке) в конец
        courseMap.forEach((course, id) => {
            fragment.appendChild(course);
            finalOrder.push(id);
        });

        // Применяем порядок к DOM и сохраняем его
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

        const cards = courseList.querySelectorAll('li.course-card');
        cards.forEach(card => {
            card.draggable = true;
            card.removeEventListener('dragstart', handleDragStart); // Очистка старых слушателей
            card.addEventListener('dragstart', handleDragStart);
            card.removeEventListener('dragend', handleDragEnd);
            card.addEventListener('dragend', handleDragEnd);
            card.removeEventListener('dragover', handleDragOver);
            card.addEventListener('dragover', handleDragOver);
        });
    }

    function restoreSkillLevelIconColors() {
        const icons = document.querySelectorAll('.course-card .skill-level tui-icon');
        icons.forEach(icon => {
            const originalColor = icon.style.color;
            if (originalColor) {
                icon.style.setProperty('color', originalColor, 'important');
            }
        });
    }

    async function processFutureExams() {
        try {
            const futureExamsData = await browser.storage.sync.get('futureExamsViewToggle');
            const useFutureExams = !!futureExamsData.futureExamsViewToggle;
            if (useFutureExams && typeof viewFutureExams === 'function') {
                viewFutureExams();
            }
        } catch (e) {
            console.log("Something went wrong with future exams", e);
        }
    }

    async function processCourseOverviewTaskStatus() {
        try {
            const courseOverviewTaskStatusData = await browser.storage.sync.get('courseOverviewTaskStatusToggle');
            const useCourseOverviewTaskStatus = !!courseOverviewTaskStatusData.courseOverviewTaskStatusToggle;
            if (useCourseOverviewTaskStatus && typeof activateCourseOverviewTaskStatus === 'function') {
                activateCourseOverviewTaskStatus();
            }
        } catch (e) {
            console.log("Something went wrong with course overview task status", e);
        }
    }

    async function updateExistingActiveCourses() {
        const allApiCourses = await fetchAllCoursesData();
        const storedArchivedCourseIds = await getArchivedCoursesFromStorage();
        const themeData = await browser.storage.sync.get('themeEnabled');
        const isDarkTheme = !!themeData.themeEnabled;

        const courseNameMap = new Map();
        allApiCourses.forEach(course => courseNameMap.set(course.name.trim(), course));

        function normalizeEmoji(str) {
            return str.replace(/💙/g, '🔵').replace(/❤️/g, '🔴').replace(/🖤/g, '⚫️');
        }

        const courseCards = document.querySelectorAll('ul.course-list > li.course-card');
        for (const card of courseCards) {
            const nameElement = card.querySelector('.course-name');
            if (!nameElement) continue;

            const courseName = normalizeEmoji(nameElement.textContent.trim());
            const courseData = courseNameMap.get(courseName);
            if (!courseData) continue;

            const courseId = courseData.id;
            card.setAttribute('data-course-id', courseId); // Важно для сортировки

            const isLocallyArchived = storedArchivedCourseIds.has(courseId);

            if (isLocallyArchived) {
                card.style.display = 'none';
            } else {
                card.style.display = '';
                addOrUpdateButton(card, courseId, isLocallyArchived, isDarkTheme);
            }
        }
    }
    
    async function renderArchivedPageFromScratch() {
        const courseListContainer = document.querySelector('ul.course-list');
        if (!courseListContainer) return;

        const storedArchivedCourseIds = await getArchivedCoursesFromStorage();
        const allApiCourses = await fetchAllCoursesData();
        const themeData = await browser.storage.sync.get('themeEnabled');
        const isDarkTheme = !!themeData.themeEnabled;

        const templateLi = document.querySelector('li.course-card');
        // Если нет шаблона, возможно, страница еще не загрузилась.
        if (!templateLi) {
             console.error("Course Archiver: Template course card not found.");
             return;
        }

        const coursesToDisplay = allApiCourses.filter(course => {
            const isLocallyArchived = storedArchivedCourseIds.has(course.id);
            const isApiArchived = course.isArchived; // `isArchived` приходит из API
            return isApiArchived || isLocallyArchived;
        });

        courseListContainer.innerHTML = ''; // Очищаем список

        coursesToDisplay.forEach(courseData => {
            const newLi = createCourseCardElement(courseData, templateLi);
            if (newLi) {
                courseListContainer.appendChild(newLi);
                // На странице архива кнопка всегда должна быть "разархивировать"
                addOrUpdateButton(newLi, courseData.id, true, isDarkTheme);
            }
        });
    }


    async function fetchAllCoursesData() {
        try {
            const API_BASE_URL = 'https://my.centraluniversity.ru/api/micro-lms';
            const activeResponse = await fetch(`${API_BASE_URL}/courses/student?limit=10000&state=published`);
            const archivedResponse = await fetch(`${API_BASE_URL}/courses/student?limit=10000&state=archived`);
            if (!activeResponse.ok || !archivedResponse.ok) throw new Error('HTTP error!');
            const activeData = await activeResponse.json();
            const archivedData = await archivedResponse.json();
            const allCoursesMap = new Map();
            // Добавляем поле isArchived для удобства
            (activeData.items || []).forEach(course => {
                course.isArchived = false;
                allCoursesMap.set(course.id, course);
            });
            (archivedData.items || []).forEach(course => {
                course.isArchived = true;
                allCoursesMap.set(course.id, course);
            });
            return Array.from(allCoursesMap.values());
        } catch (error) {
            window.cuLmsLog(`Course Archiver: Failed to fetch all courses:`, error);
            return [];
        }
    }

    async function getArchivedCoursesFromStorage() {
        try {
            const data = await browser.storage.local.get('archivedCourseIds');
            return new Set(data.archivedCourseIds || []);
        } catch (e) {
            return new Set();
        }
    }

    async function setArchivedCoursesInStorage(archivedCourseIds) {
        try {
            await browser.storage.local.set({ archivedCourseIds: Array.from(archivedCourseIds) });
        } catch (e) {
            console.error("Course Archiver: Error saving data to storage", e);
        }
    }

    function createCourseCardElement(courseData, templateLi) {
        const newLi = templateLi.cloneNode(true);
        newLi.style.display = '';
        newLi.setAttribute('data-course-id', courseData.id);
        const title = newLi.querySelector('.course-name');
        if (title) title.textContent = escapeHtml(courseData.name);
        const linkComponent = newLi.querySelector('cu-course-card');
        if (linkComponent) {
            const originalLink = linkComponent.querySelector('a');
            if (originalLink) originalLink.remove();
            linkComponent.onclick = () => {
                window.location.href = `/learn/courses/view/actual/${courseData.id}`;
            };
            linkComponent.style.cursor = 'pointer';
        }
        return newLi;
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
        buttonContainer.style.cssText = `position: absolute; right: 8px; bottom: 4px; z-index: 10;`;
        buttonContainer.innerHTML = '';
        const archiveButton = document.createElement('button');
        archiveButton.style.cssText = `background: none; border: none; padding: 0; cursor: pointer; line-height: 0;`;
        const iconSpan = document.createElement('span');
        const iconUrl = isLocallyArchived
            ? browser.runtime.getURL('icons/unarchive.svg')
            : browser.runtime.getURL('icons/archive.svg');
        const iconColor = isDarkTheme ? '#FFFFFF' : '#181a1c';
        iconSpan.style.cssText = `
            display: inline-block;
            width: 24px;
            height: 24px;
            mask-image: url(${iconUrl});
            -webkit-mask-image: url(${iconUrl});
            mask-size: contain;
            -webkit-mask-size: contain;
            mask-repeat: no-repeat;
            background-color: ${iconColor} !important;
        `;
        archiveButton.appendChild(iconSpan);
        buttonContainer.appendChild(archiveButton);

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

            // Вместо перезагрузки страницы, просто скрываем/показываем элемент
            const isNowArchived = currentArchivedCourseIds.has(courseId);
            const currentPath = window.location.pathname;
            const isOnArchivedPage = currentPath.includes('/courses/view/archived');
            
            if (isOnArchivedPage) {
                // Если мы на странице архива и разархивировали курс, он должен исчезнуть
                if(!isNowArchived) li.style.display = 'none';
            } else {
                // Если мы на странице активных курсов и заархивировали, он должен исчезнуть
                if(isNowArchived) li.style.display = 'none';
            }
        });
    }

    function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const element = document.querySelector(selector);
            if (element) return resolve(element);
            const observer = new MutationObserver(() => {
                const foundElement = document.querySelector(selector);
                if (foundElement) {
                    observer.disconnect();
                    resolve(foundElement);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                const stillNotFound = document.querySelector(selector);
                if (stillNotFound) resolve(stillNotFound);
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