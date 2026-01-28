// course_friends_list.js

(function() {
    const WIDGET_ID = 'cu-friends-floating-widget';

    // --- НАСТРОЙКИ ТЕМЫ ---
    const THEME = {
        light: {
            bg: '#ffffff',
            text: '#333333',
            textSec: '#888888',
            border: '#e0e0e0',
            shadow: '0 4px 20px rgba(0,0,0,0.1)',
            hover: '#f5f5f5'
        },
        dark: {
            bg: 'rgb(32, 33, 36)', 
            text: '#E8EAED',      
            textSec: '#BDC1C6',   
            border: 'rgb(55, 56, 60)', 
            shadow: '0 4px 20px rgba(0,0,0,0.5)',
            hover: 'rgb(55, 56, 60)'
        }
    };
    let currentTheme = 'light';

    // --- УТИЛИТЫ ---

    function waitForElement(selector) {
        return new Promise(resolve => {
            const existing = document.querySelector(selector);
            if (existing) return resolve(existing);
            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) {
                    resolve(el);
                    observer.disconnect();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        });
    }

    function normalize(str) {
        if (!str) return '';
        return str.toLowerCase()
            .replace(/[—–−-]/g, ' ') 
            .replace(/[.,:;()]/g, '') 
            .replace(/\s+/g, ' ')     
            .trim();
    }

    function areCoursesSimilar(pageTitle, subject) {
        const p = normalize(pageTitle);
        const s = normalize(subject);

        if (!p || !s) return false;
        if (p === s) return true;
        if (p.includes(s) || s.includes(p)) return true;

        return false;
    }

    // --- ЛОГИКА ТЕМЫ ---
    async function initTheme() {
        try {
            const data = await browser.storage.sync.get(['themeEnabled']);
            updateWidgetTheme(!!data.themeEnabled);
            
            browser.storage.onChanged.addListener((changes) => {
                if ('themeEnabled' in changes) {
                    updateWidgetTheme(changes.themeEnabled.newValue);
                }
            });
        } catch (e) {
            console.error('Theme init error:', e);
        }
    }

    function updateWidgetTheme(isDark) {
        currentTheme = isDark ? 'dark' : 'light';
        const widget = document.getElementById(WIDGET_ID);
        if (!widget) return;

        const colors = THEME[currentTheme];
        widget.style.backgroundColor = colors.bg;
        widget.style.color = colors.text;
        widget.style.borderColor = colors.border;
        widget.style.boxShadow = colors.shadow;

        const header = widget.querySelector('.cw-header');
        if (header) header.style.borderBottomColor = colors.border;

        const items = widget.querySelectorAll('.cw-item');
        items.forEach(item => {
            item.style.borderBottomColor = colors.border;
            item.onmouseenter = () => item.style.backgroundColor = colors.hover;
            item.onmouseleave = () => item.style.backgroundColor = 'transparent';
            
            const email = item.querySelector('.cw-email');
            if (email) email.style.color = colors.textSec;
        });

        const empty = widget.querySelector('.cw-empty');
        if (empty) empty.style.color = colors.textSec;
    }

    // --- ЛОГИКА ВИДЖЕТА ---

    function createWidget() {
        const widget = document.createElement('div');
        widget.id = WIDGET_ID;
        // Изменено transition: теперь анимируем opacity
        widget.style.cssText = `
            position: fixed;
            top: 110px;
            right: 70px;
            width: 260px;
            max-height: calc(100vh - 130px);
            overflow-y: auto;
            border-radius: 12px;
            border: 1px solid #ccc;
            z-index: 1;
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            transition: background-color 0.3s, color 0.3s, border-color 0.3s, opacity 0.2s ease-in-out;
            display: none;
            opacity: 1;
        `;
        document.body.appendChild(widget);
        return widget;
    }

    // НОВАЯ ФУНКЦИЯ: Проверка перекрывающих элементов (Сайдбар или Меню профиля)
    function checkOverlays() {
        const widget = document.getElementById(WIDGET_ID);
        // Если виджет не создан или закрыт пользователем (крестиком), ничего не делаем
        if (!widget || widget.style.display === 'none') return;

        // 1. Проверка сайдбара уведомлений
        const isNotifOpen = document.querySelector('cu-notification-sidebar-header');
        
        // 2. Проверка меню профиля (класс из вашего примера)
        const isProfileOpen = document.querySelector('.user-profile-menu__content');

        if (isNotifOpen || isProfileOpen) {
            // Скрываем виджет
            widget.style.opacity = '0';
            widget.style.pointerEvents = 'none'; // Чтобы сквозь него можно было кликать
        } else {
            // Показываем виджет
            widget.style.opacity = '1';
            widget.style.pointerEvents = 'auto';
        }
    }
    
    function renderFriendsList(widget, courseName) {
        const allFriends = JSON.parse(localStorage.getItem('cu_friends_list')) || [];
        
        const classmates = allFriends.filter(friend => 
            friend.subjects && 
            Array.isArray(friend.subjects) && 
            friend.subjects.some(subj => areCoursesSimilar(courseName, subj))
        );

        widget.innerHTML = '';

        // Шапка
        const header = document.createElement('div');
        header.className = 'cw-header';
        header.innerHTML = `
            <span style="font-weight: 600; font-size: 14px;">Друзья на курсе (прошлый семестр)</span>
            <span style="font-size: 18px; line-height: 1; opacity: 0.7; cursor: pointer;" id="cw-close">×</span>
        `;
        header.style.cssText = `
            padding: 12px 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid transparent;
        `;
        header.querySelector('#cw-close').onclick = () => {
            widget.style.display = 'none';
        };
        widget.appendChild(header);

        // Список
        const content = document.createElement('div');
        
        if (classmates.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'cw-empty';
            empty.innerText = 'Никого нет (или данные о предметах не обновлены)';
            empty.style.cssText = `
                padding: 16px;
                text-align: center;
                font-size: 13px;
                opacity: 0.8;
            `;
            content.appendChild(empty);
        } else {
            const list = document.createElement('div');
            classmates.forEach(friend => {
                const item = document.createElement('div');
                item.className = 'cw-item';
                item.title = "Открыть календарь";
                item.style.cssText = `
                    padding: 10px 16px;
                    border-bottom: 1px solid transparent;
                    cursor: pointer;
                    transition: background-color 0.2s;
                `;
                
                const colors = THEME[currentTheme];
                item.onmouseenter = () => item.style.backgroundColor = colors.hover;
                item.onmouseleave = () => item.style.backgroundColor = 'transparent';
                
                // === ЛОГИКА ОТКРЫТИЯ КАЛЕНДАРЯ ===
                item.onclick = async (e) => {
                    e.stopPropagation();
                    const email = friend.email;
                    if (!email) return;

                    const yandexCalendarUrl = `https://calendar.yandex.ru/week?layers=${encodeURIComponent(email)}`;
                    
                    try {
                        const api = (typeof browser !== 'undefined' ? browser : chrome);
                        const response = await api.runtime.sendMessage({ action: "GET_CALENDAR_LINK", email: email });
                        
                        if (response && response.success && response.link) {
                            window.open(response.link, '_blank');
                        } else {
                            window.open(yandexCalendarUrl, '_blank');
                        }
                    } catch (err) {
                        window.open(yandexCalendarUrl, '_blank');
                    }
                };
                // ==================================

                const displayName = friend.name || friend.email.split('@')[0];
                
                item.innerHTML = `
                    <div style="font-size: 14px; font-weight: 500;">${displayName}</div>
                    <div class="cw-email" style="font-size: 11px; margin-top: 2px;">${friend.email}</div>
                `;
                list.appendChild(item);
            });
            content.appendChild(list);
        }
        widget.appendChild(content);
        
        // Проверяем перекрытия сразу после рендера
        checkOverlays();
    }

    function isValidCoursePage() {
        return /\/learn\/courses\/view\/(actual|archived)\/\d+/.test(location.href);
    }

    async function initCourseFriends() {
        if (!isValidCoursePage()) {
            const w = document.getElementById(WIDGET_ID);
            if (w) w.style.display = 'none';
            return;
        }

        const urlMatch = location.href.match(/\/courses\/view\/(?:actual|archived)\/(\d+)/);
        const courseId = urlMatch ? urlMatch[1] : null;

        if (!courseId) return;

        await waitForElement('.breadcrumbs__item');
        
        const allBreadcrumbs = document.querySelectorAll('.breadcrumbs__item');
        let courseName = '';

        for (const item of allBreadcrumbs) {
            const href = item.getAttribute('href');
            if (href && new RegExp(`/${courseId}$`).test(href)) {
                courseName = item.innerText.trim();
                break;
            }
        }

        if (!courseName) {
            const isMainCoursePage = new RegExp(`/${courseId}$`).test(location.pathname);
            if (isMainCoursePage) {
                const lastBreadcrumb = document.querySelector('.breadcrumbs__item.breadcrumbs__item_last');
                if (lastBreadcrumb) {
                    courseName = lastBreadcrumb.innerText.trim();
                }
            }
        }

        if (!courseName) return;
        
        let widget = document.getElementById(WIDGET_ID);
        if (!widget) {
            widget = createWidget();
        }

        renderFriendsList(widget, courseName);
        
        const data = await browser.storage.sync.get(['themeEnabled']);
        updateWidgetTheme(!!data.themeEnabled);

        widget.style.display = 'block';
    }


    // --- ЗАПУСК ---

    initTheme();
    initCourseFriends();

    let lastUrl = location.href;
    const observer = new MutationObserver(() => {
        // 1. Проверяем смену URL
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            if (isValidCoursePage()) {
                setTimeout(initCourseFriends, 800);
            } else {
                const w = document.getElementById(WIDGET_ID);
                if (w) w.style.display = 'none';
            }
        } else {
            if (isValidCoursePage()) {
                 const breadcrumb = document.querySelector('.breadcrumbs__item.breadcrumbs__item_last');
                 const w = document.getElementById(WIDGET_ID);
                 if (breadcrumb && (!w || w.style.display === 'none')) {
                     // Можно добавить логику повторной инициализации
                 }
            }
        }

        // 2. Проверяем перекрытия (уведомления или профиль) при любом изменении DOM
        checkOverlays();
    });
    
    observer.observe(document.body, { childList: true, subtree: true });

})();