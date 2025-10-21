try {
    importScripts('browser-polyfill.js');
} catch (e) {
    console.log("Running in a non-MV3 environment or Firefox.");
}

let courseListObserver = null;

function simplifyAllCourseCards() {
    const courseCards = document.querySelectorAll('li.course-card');
    
    courseCards.forEach(card => {
        const cuCourseCard = card.querySelector('cu-course-card');
        if (!cuCourseCard) {
            return;
        }

        // пропуск если карточка уже обработана
        if (cuCourseCard.querySelector('.simplified-course-card')) {
            return;
        }

        const courseLink = cuCourseCard.querySelector('a[href*="/learn/courses/view/"]');
        let courseId = null;
        if (courseLink) {
            const hrefMatch = courseLink.href.match(/\/learn\/courses\/view\/[^\/]+\/(\d+)/);
            if (hrefMatch) {
                courseId = hrefMatch[1];
                card.setAttribute('data-course-id', courseId);
            }
        }

        // Извлекаем название курса ПЕРЕД очисткой
        const nameElement = cuCourseCard.querySelector('.course-name');
        if (!nameElement) {
            return;
        }
        
        const courseName = nameElement.textContent.trim();
        
        const archiveButtonContainer = cuCourseCard.querySelector('.archive-button-container');

        cuCourseCard.innerHTML = '';
        

        // Создаём наш упрощённый контейнер
        const simpleContainer = document.createElement('div');
        simpleContainer.className = 'simplified-course-card';
        
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

        simpleContainer.textContent = displayName;
        const fontSize = mediaQueryMobile.matches ? '12px' : mediaQueryTablet.matches ? '13px' : '14px';

        simpleContainer.style.cssText = `
            padding: 16px;
            border: 1px solid #b6b6b6ff;
            border-radius: 12px;
            background-color: #ffffff;
            font-size: ${fontSize};
            font-weight: 500;
            text-align: left;
            color: #1f2937;
            cursor: pointer;
            transition: all 0.3s ease;
            height: 80px;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            box-sizing: border-box;
            word-wrap: break-word;
            overflow-wrap: break-word;
            position: relative;
        `;
        
        simpleContainer.addEventListener('mouseenter', () => {
            simpleContainer.style.backgroundColor = '#ebebebff';
        });
        
        simpleContainer.addEventListener('mouseleave', () => {
            simpleContainer.style.backgroundColor = '#ffffff';
        });
        
        // Вставляем наш контейнер внутрь cu-course-card
        cuCourseCard.appendChild(simpleContainer);

        if (archiveButtonContainer) {
            simpleContainer.appendChild(archiveButtonContainer);
        }
    });

}

function observeCourseListChanges() {
    const courseLearning = document.querySelector('cu-course-learning');
    if (!courseLearning) {
        return;
    }
    
    // Отключаем предыдущий observer, если он был
    if (courseListObserver) {
        courseListObserver.disconnect();
    }
    
    // Создаём новый observer для отслеживания изменений
    courseListObserver = new MutationObserver((mutations) => {
        let shouldSimplify = false;
        
        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                // Проверяем, был ли добавлен или удалён ul.course-list
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        let courseListElement = null;
                        
                        if (node.matches('ul.course-list')) {
                            courseListElement = node;
                        } else {
                            courseListElement = node.querySelector('ul.course-list');
                        }
                        
                        if (courseListElement) {
                            // Добавляем класс чтобы список стал видимым
                            courseListElement.classList.add('course-archiver-ready');
                            shouldSimplify = true;
                        }
                    }
                });
                
                // Проверяем изменения внутри существующего ul.course-list
                if (mutation.target.matches('ul.course-list') || mutation.target.closest('ul.course-list')) {
                    shouldSimplify = true;
                }
            }
        });
        
        if (shouldSimplify) {
            simplifyAllCourseCards();
        }
    });
    
    // Наблюдаем за cu-course-learning с subtree: true чтобы ловить все изменения
    courseListObserver.observe(courseLearning, {
        childList: true,
        subtree: true // Наблюдаем за всем деревом внутри cu-course-learning
    });
    
}