try {
    importScripts('browser-polyfill.js');
} catch (e) {
    console.log("Running in a non-MV3 environment or Firefox.");
}

let courseListObserver = null;

/**
 * Применяет стили с правильными цветами.
 */
function styleSimplifiedCard(simpleContainer, fontSize, isDarkTheme) {
    // --- ИСПРАВЛЕНИЕ ЦВЕТА ---
    // Эти цвета подобраны в точном соответствии с вашим скриншотом
    const darkThemeBg = '#202124';           // Правильный темно-серый фон
    const darkThemeBorder = '#505052';      // Светлая рамка
    const darkThemeHoverBg = '#3D3D40';     // Фон при наведении
    const darkThemeHoverBorder = '#707072'; // Рамка при наведении

    simpleContainer.style.cssText = `
        padding: 12px 16px;
        border: 1px solid ${isDarkTheme ? darkThemeBorder : '#d0d0d0'};
        border-radius: 12px;
        background-color: ${isDarkTheme ? darkThemeBg : '#ffffff'};
        font-size: ${fontSize};
        font-weight: 500;
        text-align: left;
        color: ${isDarkTheme ? '#e5e5e5' : '#1f2937'};
        cursor: pointer;
        transition: all 0.25s ease;
        width: 100%;
        height: 100%;
        min-height: 110px;
        box-sizing: border-box;
        word-wrap: break-word;
        overflow-wrap: break-word;
        position: relative; 
        display: flex;
        flex-direction: column;
        justify-content: center;
    `;

    simpleContainer.addEventListener('mouseenter', () => {
        simpleContainer.style.backgroundColor = isDarkTheme ? darkThemeHoverBg : '#f5f5f5';
        simpleContainer.style.borderColor = isDarkTheme ? darkThemeHoverBorder : '#c0c0c0';
    });

    simpleContainer.addEventListener('mouseleave', () => {
        simpleContainer.style.backgroundColor = isDarkTheme ? darkThemeBg : '#ffffff';
        simpleContainer.style.borderColor = isDarkTheme ? darkThemeBorder : '#d0d0d0';
    });
}

/**
 * Заменяет старую карточку на новую, перенося кнопку архивации.
 */
function simplifyAllCourseCards() {
    if (window.location.pathname.includes('/courses/view/archived')) {
        return;
    }

    const courseList = document.querySelector('ul.course-list');
    if (!courseList) return;

    const courseCards = courseList.querySelectorAll('li.course-list__item');

    courseCards.forEach(li => {
        const cuCourseCard = li.querySelector('cu-course-card');
        const nameElement = li.querySelector('.course-name.font-text-s-bold');
        if (!cuCourseCard || !nameElement) return;
        if (cuCourseCard.querySelector('.simplified-course-card')) return;

        const archiveButtonContainer = cuCourseCard.querySelector('.archive-button-container');
        const courseName = nameElement.textContent.trim();
        const simpleContainer = document.createElement('div');
        simpleContainer.className = 'simplified-course-card';

        const mediaQueryTablet = window.matchMedia('(max-width: 1200px)');
        const mediaQueryMobile = window.matchMedia('(max-width: 900px)');
        let maxLength = mediaQueryMobile.matches ? 40 : (mediaQueryTablet.matches ? 55 : null);
        
        let displayName = courseName;
        if (maxLength && courseName.length > maxLength) {
            let truncated = courseName.substring(0, maxLength);
            const lastSpaceIndex = truncated.lastIndexOf(' ');
            if (lastSpaceIndex > 0) {
                 const remainingText = courseName.substring(lastSpaceIndex + 1);
                 const nextSpaceIndex = remainingText.indexOf(' ');
                 const thrownOutWord = nextSpaceIndex > 0 ? remainingText.substring(0, nextSpaceIndex) : remainingText;
                 truncated = truncated.substring(0, lastSpaceIndex);
                 displayName = thrownOutWord.toLowerCase() === 'уровень' ? truncated : truncated + '...';
            } else {
                 displayName = truncated + '...';
            }
        }
        simpleContainer.textContent = displayName;

        const fontSize = mediaQueryMobile.matches ? '12px' : mediaQueryTablet.matches ? '13px' : '14px';

        browser.storage.sync.get('themeEnabled').then(data => {
            const isDarkTheme = !!data.themeEnabled;
            styleSimplifiedCard(simpleContainer, fontSize, isDarkTheme);
        });

        cuCourseCard.innerHTML = '';
        cuCourseCard.appendChild(simpleContainer);
        
        if (archiveButtonContainer) {
            simpleContainer.appendChild(archiveButtonContainer);
        }

        const clickHandler = (e) => {
            if (e.target.closest('.archive-button-container')) return;
            if (cuCourseCard) cuCourseCard.click();
        };
        li.removeEventListener('click', clickHandler);
        li.addEventListener('click', clickHandler);
    });

    courseList.classList.add('course-archiver-ready');
}

function observeCourseListChanges() {
    const targetNode = document.body;
    if (!targetNode) return;
    if (courseListObserver) courseListObserver.disconnect();

    courseListObserver = new MutationObserver(() => {
        if (document.querySelector('ul.course-list') && !document.querySelector('.simplified-course-card')) {
            setTimeout(simplifyAllCourseCards, 350);
        }
    });

    courseListObserver.observe(targetNode, { childList: true, subtree: true });
}

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

// Старт
browser.storage.sync.get('oldCoursesDesignToggle').then((data) => {
    const useOldDesign = !!data.oldCoursesDesignToggle;
    if (useOldDesign && !window.location.pathname.includes('/courses/view/archived')) {
        if (document.querySelector('ul.course-list')) {
             setTimeout(simplifyAllCourseCards, 350);
        }
        observeCourseListChanges();
    }
}).catch(err => {
    console.error('[course_card_simplifier] Failed to read settings:', err);
});