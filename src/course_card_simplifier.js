try {
    importScripts('browser-polyfill.js');
} catch (e) {
    console.log("Running in a non-MV3 environment or Firefox.");
}

let courseListObserver = null;

/**
 * Применяет цвета карточек в зависимости от темы
 */
function styleSimplifiedCard(simpleContainer, fontSize, isDarkTheme) {
    simpleContainer.style.cssText = `
        padding: 12px 16px;
        border: 1px solid ${isDarkTheme ? '#404040' : '#d0d0d0'};
        border-radius: 12px;
        background-color: ${isDarkTheme ? '#181a1c' : '#ffffff'};
        font-size: ${fontSize};
        font-weight: 500;
        text-align: left;
        color: ${isDarkTheme ? '#e5e5e5' : '#1f2937'};
        cursor: pointer;
        transition: all 0.25s ease;
        min-height: 90px;
        min-width: 180px;
        display: flex;
        width: 100%;
        box-sizing: border-box;
        word-wrap: break-word;
        overflow-wrap: break-word;
        position: relative;
    `;

    simpleContainer.addEventListener('mouseenter', () => {
        simpleContainer.style.backgroundColor = isDarkTheme ? '#222' : '#f5f5f5';
        simpleContainer.style.borderColor = isDarkTheme ? '#919191' : '#c0c0c0';
    });

    simpleContainer.addEventListener('mouseleave', () => {
        simpleContainer.style.backgroundColor = isDarkTheme ? '#181a1c' : '#ffffff';
        simpleContainer.style.borderColor = isDarkTheme ? '#404040' : '#d0d0d0';
    });
}

/**
 * Упрощает все карточки
 */
function simplifyAllCourseCards() {
    const courseCards = document.querySelectorAll('li.course-card');

    courseCards.forEach(card => {
        const cuCourseCard = card.querySelector('cu-course-card');
        if (!cuCourseCard) return;

        // если уже обработана
        if (cuCourseCard.querySelector('.simplified-course-card')) return;

        const courseLink = cuCourseCard.querySelector('a[href*="/learn/courses/view/"]');
        let courseId = null;
        if (courseLink) {
            const hrefMatch = courseLink.href.match(/\/learn\/courses\/view\/[^\/]+\/(\d+)/);
            if (hrefMatch) {
                courseId = hrefMatch[1];
                card.setAttribute('data-course-id', courseId);
            }
        }

        const nameElement = cuCourseCard.querySelector('.course-name');
        if (!nameElement) return;

        const courseName = nameElement.textContent.trim();
        const archiveButtonContainer = cuCourseCard.querySelector('.archive-button-container');
        cuCourseCard.innerHTML = '';

        // адаптивное обрезание названия
        const mediaQueryTablet = window.matchMedia('(max-width: 1200px)');
        const mediaQueryMobile = window.matchMedia('(max-width: 900px)');

        let maxLength;
        if (mediaQueryMobile.matches) {
            maxLength = 40;
        } else if (mediaQueryTablet.matches) {
            maxLength = 55;
        } else {
            maxLength = null;
        }

        let displayName = courseName;
        if (maxLength && courseName.length > maxLength) {
            let truncated = courseName.substring(0, maxLength);
            const lastSpaceIndex = truncated.lastIndexOf(' ');

            if (lastSpaceIndex > 0) {
                const remainingText = courseName.substring(lastSpaceIndex + 1);
                const nextSpaceIndex = remainingText.indexOf(' ');
                const thrownOutWord = nextSpaceIndex > 0
                    ? remainingText.substring(0, nextSpaceIndex)
                    : remainingText;

                truncated = truncated.substring(0, lastSpaceIndex);

                displayName = thrownOutWord.toLowerCase() === 'уровень'
                    ? truncated
                    : truncated + '...';
            } else {
                displayName = truncated + '...';
            }
        }

        const simpleContainer = document.createElement('div');
        simpleContainer.className = 'simplified-course-card';
        simpleContainer.textContent = displayName;

        const fontSize = mediaQueryMobile.matches ? '12px' : mediaQueryTablet.matches ? '13px' : '14px';

        // получаем текущую тему и применяем стили
        browser.storage.sync.get('themeEnabled').then(data => {
            const isDarkTheme = !!data.themeEnabled;
            styleSimplifiedCard(simpleContainer, fontSize, isDarkTheme);
        });

        cuCourseCard.appendChild(simpleContainer);

        if (archiveButtonContainer) {
            simpleContainer.appendChild(archiveButtonContainer);
        }
    });
}

/**
 * Наблюдает за изменениями DOM и вызывает simplifyAllCourseCards
 */
function observeCourseListChanges() {
    const courseLearning = document.querySelector('cu-course-learning');
    if (!courseLearning) return;

    if (courseListObserver) {
        courseListObserver.disconnect();
    }

    courseListObserver = new MutationObserver((mutations) => {
        let shouldSimplify = false;

        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        let courseListElement = null;

                        if (node.matches('ul.course-list')) {
                            courseListElement = node;
                        } else {
                            courseListElement = node.querySelector('ul.course-list');
                        }

                        if (courseListElement) {
                            courseListElement.classList.add('course-archiver-ready');
                            shouldSimplify = true;
                        }
                    }
                });

                if (mutation.target.matches('ul.course-list') || mutation.target.closest('ul.course-list')) {
                    shouldSimplify = true;
                }
            }
        });

        if (shouldSimplify) {
            simplifyAllCourseCards();
        }
    });

    courseListObserver.observe(courseLearning, {
        childList: true,
        subtree: true
    });
}

/**
 * Реакция на изменение темы — обновляем все карточки
 */
browser.storage.onChanged.addListener((changes) => {
    if (changes.themeEnabled) {
        const isDarkTheme = !!changes.themeEnabled.newValue;

        document.querySelectorAll('.simplified-course-card').forEach(card => {
            const computedStyle = window.getComputedStyle(card);
            const fontSize = computedStyle.fontSize;
            styleSimplifiedCard(card, fontSize, isDarkTheme);
        });
    }
});

// Старт: выполняем только если включён oldCoursesDesignToggle в настройках
browser.storage.sync.get('oldCoursesDesignToggle').then((data) => {
    const useOldDesign = !!data.oldCoursesDesignToggle;
    if (useOldDesign) {
        observeCourseListChanges();
        simplifyAllCourseCards();
    } else {
        // Если не используется — ничего не делаем. courses_fix.js обработает переключение и reload'ы.
    }
}).catch(err => {
    // В случае ошибки чтения настроек безопаснее ничего не менять
    console.error('[course_card_simplifier] Failed to read oldCoursesDesignToggle:', err);
});
