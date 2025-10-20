'use strict';

if (!window.customSidebarObserverInitialized) {
    window.customSidebarObserverInitialized = true;
    console.log('[CU Enhancer] Initializing sidebar script v47 (Navigation Fix)...');

    // --- КОНФИГУРАЦИЯ И КОНСТАНТЫ ---
    const TAB_ID = 'my-custom-courses-tab';
    const TAB_TEXT = 'Открытая система курсов';
    const SOURCE_ELEMENT_SELECTOR = 'a[href="/learn/tasks"]';

    const TARGET_URL = 'https://my.centraluniversity.ru/learn/courses/view/actual';
    const DISPLAY_URL = 'https://my.centraluniversity.ru/learn/courses/view/open-system';

    const API_HOST = 'http://127.0.0.1:8000';
    const SESSION_STORAGE_KEY_COURSE_TARGET = 'customCourseTarget';

    // Ключи для хранения токенов в localStorage для постоянства между сессиями
    const ACCESS_TOKEN_KEY = 'cu_enhancer_access_token';
    const REFRESH_TOKEN_KEY = 'cu_enhancer_refresh_token';


    let isCustomTabActive = false;

    // --- УТИЛИТА ДЛЯ УВЕДОМЛЕНИЙ (Toast) ---
    const showToast = (message, duration = 3500) => {
        const toastId = 'cu-enhancer-toast';
        const existingToast = document.getElementById(toastId);
        if (existingToast) {
            existingToast.remove();
        }

        const toast = document.createElement('div');
        toast.id = toastId;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: #dc3545; /* Red for errors */
            color: white;
            padding: 15px 25px;
            border-radius: 8px;
            z-index: 10005;
            font-size: 16px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.25);
            transition: opacity 0.5s ease, top 0.5s ease;
            opacity: 0;
            top: 0;
        `;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.top = '20px';
        }, 100);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.top = '0';
            setTimeout(() => toast.remove(), 500);
        }, duration);
    };


    // --- МОДУЛЬ УПРАВЛЕНИЯ АВТОРИЗАЦИЕЙ (AuthManager) ---
    const authManager = {
        getAccessToken: () => localStorage.getItem(ACCESS_TOKEN_KEY),

        setTokens: (access, refresh) => {
            localStorage.setItem(ACCESS_TOKEN_KEY, access);
            localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
        },

        logout: () => {
            localStorage.removeItem(ACCESS_TOKEN_KEY);
            localStorage.removeItem(REFRESH_TOKEN_KEY);
            authUI.show('login', '', 'Ваша сессия истекла. Пожалуйста, войдите снова.');
        },

        isLoggedIn: () => {
            return !!authManager.getAccessToken();
        },

        fetchWithAuth: async (url, options = {}) => {
            const token = authManager.getAccessToken();
            if (!token) {
                authUI.show('login', '', 'Для доступа к этому разделу необходимо войти.');
                throw new Error('Not authenticated');
            }

            const headers = {
                ...options.headers,
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            };

            const response = await fetch(url, { ...options, headers });

            if (response.status === 401) {
                authManager.logout();
                throw new Error('Unauthorized');
            }

            return response;
        }
    };

    // --- МОДУЛЬ UI ДЛЯ АВТОРИЗАЦИИ (AuthUI) ---
    const authUI = {
        switchView: null,

        create: () => {
            if (document.getElementById('cu-auth-modal')) return;

            const modalHTML = `
                <div id="cu-auth-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 9999; display: none;"></div>
                <div id="cu-auth-modal" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #fff; padding: 30px; border-radius: 8px; z-index: 10000; width: 400px; box-shadow: 0 5px 15px rgba(0,0,0,0.3); display: none; color: #333;">
                    <button id="cu-auth-close" style="position: absolute; top: 10px; right: 10px; background: none; border: none; font-size: 24px; cursor: pointer;">&times;</button>
                    <div id="cu-auth-content"></div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);

            const loginForm = `
                <h2 style="text-align: center; margin-bottom: 20px;">Вход</h2>
                <form data-view="login">
                    <p class="cu-auth-message" style="color: #007bff; text-align: center; margin-bottom: 15px; min-height: 1.2em;"></p>
                    <input type="email" name="email" placeholder="Email" required style="width: 100%; padding: 10px; margin-bottom: 10px; border: 1px solid #ccc; border-radius: 4px;">
                    <input type="password" name="password" placeholder="Пароль" required style="width: 100%; padding: 10px; margin-bottom: 20px; border: 1px solid #ccc; border-radius: 4px;">
                    <button type="submit" style="width: 100%; padding: 12px; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Войти</button>
                    <p class="cu-auth-error" style="color: red; text-align: center; margin-top: 10px; min-height: 1.2em;"></p>
                    <p style="text-align: center; margin-top: 15px;">Нет аккаунта? <a href="#" id="cu-show-register">Регистрация</a></p>
                </form>
            `;

            const registerForm = `
                <h2 style="text-align: center; margin-bottom: 20px;">Регистрация</h2>
                <form data-view="register">
                    <p class="cu-auth-message" style="color: #28a745; text-align: center; margin-bottom: 15px; min-height: 1.2em;"></p>
                    <input type="email" name="email" placeholder="Email" required style="width: 100%; padding: 10px; margin-bottom: 10px; border: 1px solid #ccc; border-radius: 4px;">
                    <input type="password" name="password" placeholder="Пароль" required style="width: 100%; padding: 10px; margin-bottom: 20px; border: 1px solid #ccc; border-radius: 4px;">
                    <button type="submit" style="width: 100%; padding: 12px; background-color: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">Зарегистрироваться</button>
                    <p class="cu-auth-error" style="color: red; text-align: center; margin-top: 10px; min-height: 1.2em;"></p>
                    <p style="text-align: center; margin-top: 15px;">Уже есть аккаунт? <a href="#" id="cu-show-login">Войти</a></p>
                </form>
            `;

            const verifyForm = `
                 <h2 style="text-align: center; margin-bottom: 20px;">Подтверждение Email</h2>
                <form data-view="verify">
                    <p class="cu-auth-message" style="color: #28a745; text-align: center; margin-bottom: 15px; min-height: 1.2em;"></p>
                    <input type="email" name="email" placeholder="Email" required readonly style="width: 100%; padding: 10px; margin-bottom: 10px; border: 1px solid #ccc; border-radius: 4px; background: #eee;">
                    <input type="text" name="code" placeholder="Код из письма" required style="width: 100%; padding: 10px; margin-bottom: 20px; border: 1px solid #ccc; border-radius: 4px;">
                    <button type="submit" style="width: 100%; padding: 12px; background-color: #17a2b8; color: white; border: none; border-radius: 4px; cursor: pointer;">Подтвердить</button>
                    <p class="cu-auth-error" style="color: red; text-align: center; margin-top: 10px; min-height: 1.2em;"></p>
                </form>
            `;

            const content = document.getElementById('cu-auth-content');

            const switchView = (view, email = '', message = '') => {
                let currentForm;
                if (view === 'login') currentForm = loginForm;
                else if (view === 'register') currentForm = registerForm;
                else if (view === 'verify') currentForm = verifyForm;
                content.innerHTML = currentForm;

                if (message) {
                    const messageEl = content.querySelector('.cu-auth-message');
                    if (messageEl) messageEl.textContent = message;
                }

                if (view === 'verify' && email) {
                    content.querySelector('input[name="email"]').value = email;
                }
            };
            
            this.switchView = switchView;

            this.switchView('login');

            document.getElementById('cu-auth-modal').addEventListener('click', (e) => {
                 if (e.target.id === 'cu-show-register') { e.preventDefault(); this.switchView('register'); }
                 if (e.target.id === 'cu-show-login') { e.preventDefault(); this.switchView('login'); }
            });

            document.getElementById('cu-auth-content').addEventListener('submit', async (e) => {
                e.preventDefault();
                const form = e.target;
                const view = form.dataset.view;
                const email = form.querySelector('input[name="email"]').value;
                const password = form.querySelector('input[name="password"]') ? form.querySelector('input[name="password"]').value : null;
                const code = form.querySelector('input[name="code"]') ? form.querySelector('input[name="code"]').value : null;
                const errorEl = form.querySelector('.cu-auth-error');
                const messageEl = form.querySelector('.cu-auth-message');
                errorEl.textContent = '';
                if(messageEl) messageEl.textContent = '';

                try {
                    let response, data;
                    switch (view) {
                        case 'register':
                            response = await fetch(`${API_HOST}/api/auth/register/`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ email, password })
                            });
                            data = await response.json();
                            if (!response.ok) throw new Error(data.detail || data.message || 'Ошибка регистрации');
                            this.switchView('verify', email, 'Письмо с кодом подтверждения отправлено на ваш email.');
                            break;

                        case 'verify':
                             response = await fetch(`${API_HOST}/api/auth/verify/`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ email, code })
                            });
                            data = await response.json();
                            if (!response.ok) throw new Error(data.detail || data.message || 'Ошибка верификации');
                            this.switchView('login', '', 'Email успешно подтвержден. Теперь вы можете войти.');
                            break;

                        case 'login':
                            response = await fetch(`${API_HOST}/api/auth/login/`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ email, password })
                            });
                            data = await response.json();
                             if (!response.ok) throw new Error(data.detail || data.message || 'Ошибка входа');
                            authManager.setTokens(data.access, data.refresh);
                            authUI.hide();
                            window.location.reload();
                            break;
                    }
                } catch (err) {
                     errorEl.textContent = err.message;
                }
            });

            document.getElementById('cu-auth-overlay').addEventListener('click', this.hide);
            document.getElementById('cu-auth-close').addEventListener('click', this.hide);
        },

        show: (view = 'login', email = '', message = '') => {
            if (authUI.switchView) {
                authUI.switchView(view, email, message);
            }
            document.getElementById('cu-auth-overlay').style.display = 'block';
            document.getElementById('cu-auth-modal').style.display = 'block';
        },

        hide: () => {
            document.getElementById('cu-auth-overlay').style.display = 'none';
            document.getElementById('cu-auth-modal').style.display = 'none';
        }
    };

    // --- CSS-ИНЖЕКТОР ---
    const injectCss = () => {
        if (document.getElementById('cu-enhancer-styles')) return;
        const style = document.createElement('style');
        style.id = 'cu-enhancer-styles';
        style.textContent = `
            .custom-courses-active > * { display: none !important; }
            .custom-courses-active > [data-dynamic-course="true"] { display: block !important; }

            .custom-expand-container {
                display: grid;
                grid-template-rows: 0fr;
                transition: grid-template-rows 0.3s ease-in-out;
            }
            .custom-expand-container > div {
                overflow: hidden;
            }
            .custom-expand-container.is-open {
                grid-template-rows: 1fr;
            }
        `;
        document.head.appendChild(style);
    };

    // --- ХЕЛПЕР ДЛЯ СОЗДАНИЯ КАРТОЧЕК ---
    const createCustomCourseCard = (courseData, templateCard, templateCourseId) => {
        const newCard = templateCard.cloneNode(true);
        
        // Этот блок делает внутренний квадрат с логотипом чёрным. Он работает правильно.
        const imageContainer = newCard.querySelector('div[class*="image"]');
        if (imageContainer) {
            imageContainer.style.setProperty('background-color', 'black', 'important');
        }

        newCard.style.display = '';
        newCard.dataset.dynamicCourse = 'true';

        const titleElement = newCard.querySelector('h2.course-card__title, .course-name');
        if (titleElement) {
            titleElement.textContent = courseData.course_title || `Course ${courseData.course_id}`;
        }

        const linkElement = document.createElement('a');
        linkElement.href = '#';
        linkElement.style.textDecoration = 'none';
        linkElement.style.color = 'inherit';
        linkElement.style.display = 'block';
        linkElement.dataset.customCourseId = courseData.course_id;
        linkElement.dataset.templateCourseId = templateCourseId;

        while (newCard.firstChild) {
            linkElement.appendChild(newCard.firstChild);
        }

        newCard.appendChild(linkElement);
        linkElement.addEventListener('click', handleCustomCourseClick);

        const progressBar = newCard.querySelector('cu-progress-bar');
        if(progressBar) progressBar.remove();

        const archiveButton = newCard.querySelector('.archive-button-container');
        if(archiveButton) archiveButton.remove();

        if (courseData.course_id === 'readme') {
            // Находим иконку внутри карточки, чтобы использовать её как отправную точку
            const iconNode = newCard.querySelector('tui-icon[class*="course-icon"]');
            if (iconNode) {
                
                // --- НОВЫЙ НАДЁЖНЫЙ ПОДХОД ---
                // Ищем ближайшего родителя, который является основным элементом карточки.
                // Селектор '[class*="course-card"]' найдет элемент, даже если у него сложный класс.
                const mainCardElement = iconNode.closest('[class*="course-card"]');
                
                if (mainCardElement) {
                    // Применяем черный фон к найденному главному контейнеру карточки.
                    mainCardElement.style.setProperty('background', 'black', 'important');
                }
                // --- КОНЕЦ НОВОГО ПОДХОДА ---

                const newImage = document.createElement('img');

                try {
                    newImage.src = chrome.runtime.getURL('icons/cu_3rd_party.png');
                } catch (e) {
                    try {
                        newImage.src = browser.runtime.getURL('icons/cu_3rd_party.png');
                    } catch (e2) {
                        console.error('[CU Enhancer] Could not set README icon URL.', e2);
                    }
                }

                newImage.className = iconNode.className;
                newImage.style.setProperty('width', '100%', 'important');
                newImage.style.setProperty('height', '100%', 'important');
                newImage.style.setProperty('object-fit', 'contain', 'important');
                newImage.style.setProperty('border', 'none', 'important');

                if (iconNode.parentNode) {
                    iconNode.parentNode.replaceChild(newImage, iconNode);
                }
            }
        }
        return newCard;
    };

    // --- ОБРАБОТЧИКИ КЛИКОВ И ЗАГРУЗКИ ---
    const handleCustomCourseClick = (event) => {
        event.preventDefault();
        const targetElement = event.currentTarget;

        const customCourseId = targetElement.dataset.customCourseId;
        const templateCourseId = targetElement.dataset.templateCourseId;

        if (!templateCourseId) {
            console.error('[CU Enhancer] Template Course ID not found on clicked element.');
            return;
        }

        const title = targetElement.querySelector('h2.course-card__title, .course-name')?.textContent;
        sessionStorage.setItem(SESSION_STORAGE_KEY_COURSE_TARGET, JSON.stringify({ id: customCourseId, title: title }));
        window.location.href = `https://my.centraluniversity.ru/learn/courses/view/actual/${templateCourseId}`;
    };

    const base64ToBlob = (base64, contentType = '') => {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: contentType });
    };

    const showFileSelectionModal = (files) => {
        const modalId = 'cu-file-selection-modal';
        if (document.getElementById(modalId)) return;

        const overlay = document.createElement('div');
        overlay.id = `${modalId}-overlay`;
        overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 10001;';

        const modal = document.createElement('div');
        modal.id = modalId;
        modal.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 25px; border-radius: 8px; z-index: 10002; min-width: 400px; max-width: 80%; color: #333;';

        const title = document.createElement('h3');
        title.textContent = 'Выберите файл для открытия';
        title.style.marginTop = '0';
        title.style.marginBottom = '20px';
        modal.appendChild(title);

        const fileList = document.createElement('ul');
        fileList.style.cssText = 'list-style: none; padding: 0; margin: 0;';
        modal.appendChild(fileList);

        const closeModal = () => {
            overlay.remove();
            modal.remove();
        };

        files.forEach(file => {
            const listItem = document.createElement('li');
            const button = document.createElement('button');
            button.textContent = file.filename;
            button.style.cssText = 'width: 100%; padding: 10px; margin-bottom: 8px; border: 1px solid #ccc; border-radius: 4px; background: #f8f8f8; text-align: left; cursor: pointer;';
            button.onmouseover = () => button.style.backgroundColor = '#e9e9e9';
            button.onmouseout = () => button.style.backgroundColor = '#f8f8f8';
            button.addEventListener('click', () => {
                const mimeType = file.filename.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';
                const fileBlob = base64ToBlob(file.contents, mimeType);
                const blobUrl = URL.createObjectURL(fileBlob);
                window.open(blobUrl, '_blank');
                closeModal();
            });
            listItem.appendChild(button);
            fileList.appendChild(listItem);
        });

        overlay.addEventListener('click', closeModal);
        document.body.appendChild(overlay);
        document.body.appendChild(modal);
    };

    const handleLongreadClick = async (event, courseId, themeId, longreadId) => {
        event.preventDefault();
        const linkWrapper = event.currentTarget;
        const linkElement = linkWrapper.querySelector('.longread-title');
        if (!linkElement) return;

        const originalText = linkElement.textContent;

        try {
            linkElement.textContent = 'Загрузка...';
            linkWrapper.style.pointerEvents = 'none';

            const url = `${API_HOST}/api/course/${courseId}/theme/${themeId}/longread/${longreadId}/`;
            const response = await authManager.fetchWithAuth(url);

            if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);

            const filesData = await response.json();

            if (!Array.isArray(filesData) || filesData.length === 0) {
                throw new Error('Материалы не найдены или вернулся некорректный ответ.');
            }

            if (filesData.length === 1) {
                const file = filesData[0];
                const mimeType = file.filename.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';
                const pdfBlob = base64ToBlob(file.contents, mimeType);
                const blobUrl = URL.createObjectURL(pdfBlob);
                window.open(blobUrl, '_blank');
            } else {
                showFileSelectionModal(filesData);
            }

        } catch (error) {
            console.error('[CU Enhancer] Failed to fetch or open material:', error);
            if (error.message !== 'Unauthorized' && error.message !== 'Not authenticated') {
                 showToast(`Не удалось загрузить материал: ${error.message}`);
            }
        } finally {
            linkElement.textContent = originalText;
            linkWrapper.style.pointerEvents = '';
        }
    };


    // --- ФУНКЦИИ МОДИФИКАЦИИ СТРАНИЦ ---
    const applyCourseDetailModifications = async () => {
        const courseDataRaw = sessionStorage.getItem(SESSION_STORAGE_KEY_COURSE_TARGET);
        if (!courseDataRaw) return;

        const courseData = JSON.parse(courseDataRaw);
        sessionStorage.removeItem(SESSION_STORAGE_KEY_COURSE_TARGET);

        try {
            console.log(`[CU Enhancer] Modifying course page for course ID: ${courseData.id}`);

            const pageTitle = await waitForElement('h1.page-title');
            const breadcrumbsContainer = await waitForElement('cu-breadcrumbs');

            if (pageTitle && courseData.title) pageTitle.textContent = courseData.title;
            
            const response = await authManager.fetchWithAuth(`${API_HOST}/api/course/${courseData.id}/`);
            if (!response.ok) throw new Error('Failed to fetch themes');
            const longreadsData = await response.json();

            let definitiveCourseTitle = courseData.title;
            if (longreadsData.length > 0 && longreadsData[0].course_title) {
                definitiveCourseTitle = longreadsData[0].course_title;
            }

            if (pageTitle) {
                pageTitle.textContent = definitiveCourseTitle;
            }
            if (breadcrumbsContainer) {
                const actualCoursesLink = breadcrumbsContainer.querySelector('a[href="/learn/courses/view/actual"]');
                if (actualCoursesLink) {
                    actualCoursesLink.textContent = 'Открытая система курсов';
                    actualCoursesLink.href = DISPLAY_URL;
                }
                const lastBreadcrumbLink = breadcrumbsContainer.querySelector('a.breadcrumbs__item_last');
                if (lastBreadcrumbLink) {
                    lastBreadcrumbLink.textContent = definitiveCourseTitle;
                    lastBreadcrumbLink.removeAttribute('href');
                    lastBreadcrumbLink.style.pointerEvents = 'none';
                    lastBreadcrumbLink.style.color = 'inherit';
                }
            }

            const themesMap = longreadsData.reduce((acc, longread) => {
                (acc[longread.theme_id] = acc[longread.theme_id] || []).push(longread);
                return acc;
            }, {});

            const accordion = await waitForElement('tui-accordion.themes-accordion');

            const initialTheme = await waitForElement('tui-accordion-item', accordion);
            const headerButton = initialTheme.querySelector('button.t-header');
            if (headerButton && !headerButton.classList.contains('t-header_open')) headerButton.click();
            const materialItemProto = await waitForElement('li.longreads-list-item', initialTheme);
            const templateTheme = initialTheme.cloneNode(true);
            const templateMaterialItem = materialItemProto.cloneNode(true);
            if (headerButton && headerButton.classList.contains('t-header_open')) headerButton.click();

            const hideOriginalsObserver = new MutationObserver(() => {
                accordion.querySelectorAll('tui-accordion-item:not([data-custom-theme="true"])').forEach(el => {
                    if (el.style.display !== 'none') el.style.display = 'none';
                });
            });
            hideOriginalsObserver.observe(accordion, { childList: true });
            accordion.querySelectorAll('tui-accordion-item:not([data-custom-theme="true"])').forEach(el => el.style.display = 'none');

            const customThemeIds = Object.keys(themesMap);
            for (const themeId of customThemeIds) {
                const longreadsInTheme = themesMap[themeId];
                if (longreadsInTheme.length === 0) continue;

                const newTheme = templateTheme.cloneNode(true);
                newTheme.dataset.customTheme = 'true';
                newTheme.style.display = '';

                const titleEl = newTheme.querySelector('h2.themes-accordion-item__item-title');
                if (titleEl) {
                    const themeTitle = longreadsInTheme[0].theme_title;
                    titleEl.textContent = themeTitle || `Theme ${themeId}`;
                }

                const contentList = newTheme.querySelector('ul.longreads-list');
                if (contentList) {
                    contentList.innerHTML = '';
                    longreadsInTheme.forEach(longread => {
                        const newMaterial = templateMaterialItem.cloneNode(true);
                        const materialLink = newMaterial.querySelector('a');
                        const materialTitle = newMaterial.querySelector('h3.longread-title');
                        if (materialTitle && materialLink) {
                            materialTitle.textContent = longread.longread_title || `Longread ${longread.longread_id}`;
                            materialLink.href = `#`;
                            materialLink.addEventListener('click', (event) => {
                                handleLongreadClick(event, courseData.id, themeId, longread.longread_id);
                            });
                        }
                        contentList.appendChild(newMaterial);
                    });
                }

                const expandEl = newTheme.querySelector('tui-expand');
                const contentWrapper = newTheme.querySelector('.t-content');
                if (expandEl && contentWrapper) {
                    const simpleContainer = document.createElement('div');
                    simpleContainer.className = 'custom-expand-container';
                    const innerDiv = document.createElement('div');
                    innerDiv.appendChild(contentWrapper);
                    simpleContainer.appendChild(innerDiv);
                    expandEl.parentNode.replaceChild(simpleContainer, expandEl);
                }

                accordion.appendChild(newTheme);
            }

            accordion.addEventListener('click', (event) => {
                if (event.target.closest('a')) return;
                const button = event.target.closest('button.t-header');
                const parentTheme = button?.closest('[data-custom-theme="true"]');
                if (!parentTheme) return;

                const expandContainer = parentTheme.querySelector('.custom-expand-container');
                const chevron = parentTheme.querySelector('tui-icon[tuichevron]');
                if (button && expandContainer && chevron) {
                    button.classList.toggle('t-header_open');
                    chevron.classList.toggle('_chevron-rotated');
                    expandContainer.classList.toggle('is-open');
                }
            });

            console.log('[CU Enhancer] Course page modified. Titles and breadcrumbs are now displayed.');

        } catch (error) {
            console.error('[CU Enhancer] Error modifying course detail page:', error);
             if (error.message !== 'Unauthorized' && error.message !== 'Not authenticated') {
                showToast(`Не удалось загрузить данные курса. Возможно, проблема с сервером.`);
            }
        }
    };

    const applyModifications = async () => {
        const courseList = await waitForElement('ul.course-list');
        if (!courseList || courseList.dataset.modified === 'true') return;

        const breadcrumbsContainer = document.querySelector('tui-breadcrumbs');
        if (breadcrumbsContainer) {
            const mainLink = breadcrumbsContainer.querySelector('a[href="/learn/"]');
            if (mainLink) mainLink.textContent = 'CU 3rd party ';
            const coursesLink = breadcrumbsContainer.querySelector('a[href="/learn/courses/view/actual"]');
            if (coursesLink) coursesLink.textContent = 'Открытая система курсов';
        }
        const pageTitle = document.querySelector('h1.page-title');
        if (pageTitle && !pageTitle.dataset.originalTitle) {
            pageTitle.dataset.originalTitle = pageTitle.textContent;
            pageTitle.textContent = 'Открытая система курсов';
        }

        courseList.classList.add('custom-courses-active');

        const templateCourseCard = courseList.firstElementChild;
        let templateCourseId = null;

        if (!templateCourseCard) {
            console.error('[CU Enhancer] Не найдена карточка-шаблон для клонирования!');
            return;
        }

        const originalLink = templateCourseCard.querySelector('a');
        if (originalLink && originalLink.href) {
            const match = originalLink.href.match(/\/(\d+)$/);
            if (match) templateCourseId = match[1];
        } else {
            templateCourseId = 587; // Fallback ID
            console.warn(`[CU Enhancer] Could not find template course ID automatically. Using fallback ID: ${templateCourseId}`);
        }

        const readmeData = { course_title: 'README', course_id: 'readme' };
        const readmeCard = createCustomCourseCard(readmeData, templateCourseCard, templateCourseId);
        courseList.appendChild(readmeCard);


        try {
            const response = await authManager.fetchWithAuth(`${API_HOST}/api/courses/`);
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            const coursesData = await response.json();
            const uniqueCourses = coursesData.filter((c, i, a) => i === a.findIndex(f => f.course_id === c.course_id));

            uniqueCourses.forEach(course => {
                const newItem = createCustomCourseCard(course, templateCourseCard, templateCourseId);
                courseList.appendChild(newItem);
            });

        } catch (error) {
            console.error('[CU Enhancer] Error fetching courses:', error);
            if (error.message === 'Unauthorized' || error.message === 'Not authenticated') return;

            const errorData = { course_title: 'Ошибка загрузки курсов. Сервер недоступен.', course_id: 'error' };
            const errorCard = createCustomCourseCard(errorData, templateCourseCard, templateCourseId);
            courseList.appendChild(errorCard);
        }

        courseList.dataset.modified = 'true';
    };

    const revertModifications = async () => {
        const courseList = document.querySelector('ul.course-list');
        if (!courseList || !courseList.dataset.modified) return;
        
        sessionStorage.removeItem(SESSION_STORAGE_KEY_COURSE_TARGET);

        const breadcrumbsContainer = document.querySelector('tui-breadcrumbs');
        if (breadcrumbsContainer) {
            const mainLink = breadcrumbsContainer.querySelector('a[href="/learn/"]');
            if (mainLink) mainLink.textContent = 'Обучение';
            const coursesLink = breadcrumbsContainer.querySelector('a[href="/learn/courses/view/actual"]');
            if (coursesLink) coursesLink.textContent = 'Актуальные курсы';
        }
        const pageTitle = document.querySelector('h1.page-title');
        if (pageTitle && pageTitle.dataset.originalTitle) {
            pageTitle.textContent = pageTitle.dataset.originalTitle;
            delete pageTitle.dataset.originalTitle;
        }

        courseList.classList.remove('custom-courses-active');
        courseList.querySelectorAll('[data-dynamic-course="true"]').forEach(el => el.remove());

        delete courseList.dataset.modified;
    };

    // --- УПРАВЛЕНИЕ UI И ОСНОВНАЯ ЛОГИКА ---
    const ensureCustomTabExists = () => {
        if (document.getElementById(TAB_ID)) return;
        const sourceAnchor = document.querySelector(SOURCE_ELEMENT_SELECTOR);
        if (!sourceAnchor) return;
        const sourceListItem = sourceAnchor.closest('li.nav-list__item');
        if (!sourceListItem) return;
        const clonedListItem = sourceListItem.cloneNode(true);
        clonedListItem.id = TAB_ID;
        const link = clonedListItem.querySelector('a');
        if (!link) return;
        link.href = TARGET_URL;
        link.setAttribute('aria-label', TAB_TEXT);
        link.classList.remove('cu-navtab__main-element_active');

        try {
            const iconUrl = browser.runtime.getURL('icons/course_system.svg');
            link.style.setProperty('--t-icon-start', `url(${iconUrl})`);
        } catch (e) {
            try {
                const iconUrl = chrome.runtime.getURL('icons/course_system.svg');
                link.style.setProperty('--t-icon-start', `url(${iconUrl})`);
            } catch (e2) {
                 console.error('[CU Enhancer] Could not set icon URL.', e2);
            }
        }

        const textSpan = clonedListItem.querySelector('.cu-navtab__main-element-text');
        if (textSpan) textSpan.textContent = TAB_TEXT;
        const chevron = clonedListItem.querySelector('.cu-navtab__chevron');
        if (chevron) chevron.remove();

        link.addEventListener('click', (event) => {
            event.preventDefault();
            if (authManager.isLoggedIn()) {
                sessionStorage.setItem('shouldModifyPage', 'true');
                window.location.href = TARGET_URL;
            } else {
                authUI.show();
            }
        });
        sourceListItem.insertAdjacentElement('afterend', clonedListItem);
    };

    const setActiveTabHighlight = () => {
        const customTabLink = document.querySelector(`#${TAB_ID} a`);
        if (customTabLink) {
            customTabLink.classList.toggle('cu-navtab__main-element_active', isCustomTabActive);
        }
    };

    const addOriginalCourseLinkListener = () => {
        const originalLinks = document.querySelectorAll(`a[href^="/learn/courses/view/actual"]`);
        originalLinks.forEach(link => {
            if (link.closest(`#${TAB_ID}`)) return;
            if (link.dataset.revertListenerAttached) return;

            link.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                
                sessionStorage.removeItem('shouldModifyPage');
                sessionStorage.removeItem(SESSION_STORAGE_KEY_COURSE_TARGET);
                
                window.location.href = link.href;
            }, true); 

            link.dataset.revertListenerAttached = 'true';
        });
    };

    const main = async () => {
        authUI.create();
        injectCss();

        if (/\/learn\/courses\/view\/actual\/\d+/.test(window.location.href)) {
            if (sessionStorage.getItem(SESSION_STORAGE_KEY_COURSE_TARGET)) {
                 if (!authManager.isLoggedIn()) {
                    sessionStorage.removeItem(SESSION_STORAGE_KEY_COURSE_TARGET);
                    window.location.href = 'https://my.centraluniversity.ru/learn/';
                    return;
                }
                await applyCourseDetailModifications();
            }
        }
        else {
            const shouldModify = sessionStorage.getItem('shouldModifyPage') === 'true';
            if ((window.location.href.startsWith(DISPLAY_URL) || (shouldModify && window.location.href.startsWith(TARGET_URL))) && authManager.isLoggedIn()) {
                isCustomTabActive = true;
                await applyModifications();
                if (shouldModify) {
                    history.replaceState(null, '', DISPLAY_URL);
                    sessionStorage.removeItem('shouldModifyPage');
                }
            } else {
                isCustomTabActive = false;
                if (document.querySelector('[data-modified="true"]')) {
                    await revertModifications();
                }
            }
        }

        const globalObserver = new MutationObserver(() => {
            ensureCustomTabExists();
            setActiveTabHighlight();
            addOriginalCourseLinkListener();
        });
        globalObserver.observe(document.body, { childList: true, subtree: true });

        ensureCustomTabExists();
        setActiveTabHighlight();
        addOriginalCourseLinkListener();
    };

    function waitForElement(selector, parent = document.body) {
        return new Promise(resolve => {
            const el = parent.querySelector(selector);
            if (el) return resolve(el);
            const observer = new MutationObserver(() => {
                const el = parent.querySelector(selector);
                if (el) {
                    observer.disconnect();
                    resolve(el);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        });
    }

    main();
}