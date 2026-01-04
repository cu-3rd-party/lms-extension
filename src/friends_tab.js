// friends_tab.js

function waitForElement(selector) {
    return new Promise(resolve => {
        if (document.querySelector(selector)) return resolve(document.querySelector(selector));
        const observer = new MutationObserver(() => {
            if (document.querySelector(selector)) {
                resolve(document.querySelector(selector));
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    });
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

async function init() {
    const tabsContainer = await waitForElement('tui-tabs');
    if (document.getElementById('custom-friends-link')) return;

    injectModalStyles();

    if (chrome && chrome.storage) {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'sync' && (changes.themeEnabled || changes.oledEnabled)) {
                const overlay = document.getElementById('friends-overlay');
                if (overlay) {
                    chrome.storage.sync.get(['themeEnabled', 'oledEnabled'], (data) => {
                        applyThemeClasses(overlay, data.themeEnabled, data.oledEnabled);
                    });
                }
            }
        });
    }

    const friendsLink = document.createElement('a');
    friendsLink.id = 'custom-friends-link';
    friendsLink.className = 'header__tab-link'; 
    friendsLink.setAttribute('type', 'button');
    friendsLink.setAttribute('tuitab', '');
    friendsLink.href = '#'; 
    friendsLink.innerText = 'Друзья';

    const neighbor = tabsContainer.querySelector('.header__tab-link');
    if (neighbor) {
        Array.from(neighbor.attributes).forEach(attr => {
            if (attr.name.startsWith('_ngcontent') || attr.name === 'tuiicons') {
                friendsLink.setAttribute(attr.name, attr.value);
            }
        });
    }

    friendsLink.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const overlay = document.getElementById('friends-overlay');
        const isActive = friendsLink.classList.contains('header__tab-link_active');

        if (isActive && overlay && overlay.style.display !== 'none') {
            closeFriendsPage();
        } else {
            setActiveTabStyle(true);
            renderFriendsPage();
        }
    });

    const moreBtn = tabsContainer.querySelector('.t-more');
    if (moreBtn) {
        tabsContainer.insertBefore(friendsLink, moreBtn);
    } else {
        tabsContainer.appendChild(friendsLink);
    }

    tabsContainer.addEventListener('click', (e) => {
        const clickedTab = e.target.closest('.header__tab-link');
        if (clickedTab && clickedTab.id !== 'custom-friends-link') {
            closeFriendsPage();
        }
    });
}

function setActiveTabStyle(isActive) {
    const friendsLink = document.getElementById('custom-friends-link');
    if (!friendsLink) return;

    if (isActive) {
        document.querySelectorAll('.header__tab-link').forEach(el => {
            el.classList.remove('header__tab-link_active', '_active');
        });
        friendsLink.classList.add('header__tab-link_active', '_active');
    } else {
        friendsLink.classList.remove('header__tab-link_active', '_active');
        
        const currentPath = window.location.pathname;
        const tabs = document.querySelectorAll('.header__tab-link:not(#custom-friends-link)');
        let restored = false;
        
        tabs.forEach(tab => {
            const href = tab.getAttribute('href');
            if (href && currentPath.includes(href) && href !== '/') {
                tab.classList.add('header__tab-link_active', '_active');
                restored = true;
            }
        });
        if (!restored) {
             const learnTab = document.querySelector('a[href*="/learn/"]');
             if (learnTab) learnTab.classList.add('header__tab-link_active', '_active');
        }
    }
}

function closeFriendsPage() {
    const overlay = document.getElementById('friends-overlay');
    if (overlay) {
        overlay.style.display = 'none';
        document.body.style.overflow = ''; 
    }
    setActiveTabStyle(false);
}

function applyThemeClasses(element, isDark, isOled) {
    if (!element) return;
    element.classList.remove('theme-dark', 'theme-oled', 'theme-light');
    if (isDark) {
        if (isOled) {
            element.classList.add('theme-oled');
        } else {
            element.classList.add('theme-dark');
        }
    } else {
        element.classList.add('theme-light');
    }
}

function injectModalStyles() {
    if (document.getElementById('friends-global-styles')) return;
    const style = document.createElement('style');
    style.id = 'friends-global-styles';
    style.innerHTML = `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        :root {
            --fr-bg: #ffffff;
            --fr-card-bg: #f5f7fa; 
            --fr-text: #333333;
            --fr-text-sec: #666666;
            --fr-border: #e0e0e0;
            --fr-input-bg: #ffffff;
            --fr-input-border: #cccccc;
            --fr-accent: #4285F4;
            --fr-danger: #ff453a;
            --fr-overlay: rgba(0, 0, 0, 0.5);
            --fr-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }

        #friends-overlay.theme-dark {
            --fr-bg: #202124;
            --fr-card-bg: #2c2d31;
            --fr-text: #e8eaed;
            --fr-text-sec: #9aa0a6;
            --fr-border: #3c4043;
            --fr-input-bg: #171717;
            --fr-input-border: #3c4043;
            --fr-overlay: rgba(0, 0, 0, 0.7);
            --fr-shadow: 0 4px 12px rgba(0,0,0,0.5);
        }

        #friends-overlay.theme-oled {
            --fr-bg: #000000;
            --fr-card-bg: #121212;
            --fr-text: #ffffff;
            --fr-text-sec: #b0b0b0;
            --fr-border: #333333;
            --fr-input-bg: #000000;
            --fr-input-border: #333333;
            --fr-overlay: rgba(0, 0, 0, 0.9);
        }

        #friends-overlay * {
            box-sizing: border-box;
            font-family: 'Inter', sans-serif !important;
        }

        #friends-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background-color: var(--fr-overlay) !important;
            z-index: 2147483647;
            display: flex;
            justify-content: center;
            align-items: flex-start;
            padding-top: 60px;
            backdrop-filter: blur(4px);
        }

        .cu-ext-window {
            background-color: var(--fr-bg) !important;
            color: var(--fr-text) !important;
            width: 90%;
            max-width: 1100px;
            max-height: 85vh;
            border-radius: 16px;
            border: 1px solid var(--fr-border);
            box-shadow: var(--fr-shadow);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            position: relative;
        }

        .cu-ext-header {
            padding: 20px 30px;
            border-bottom: 1px solid var(--fr-border);
            background-color: var(--fr-bg) !important;
            flex-shrink: 0;
        }

        .cu-ext-top-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-right: 30px;
        }

        .cu-ext-title {
            margin: 0;
            font-size: 24px;
            font-weight: 700;
            color: var(--fr-text) !important;
        }

        .cu-ext-close {
            position: absolute;
            top: 20px;
            right: 20px;
            background: transparent !important;
            border: none !important;
            color: var(--fr-text-sec) !important;
            font-size: 32px;
            line-height: 1;
            cursor: pointer;
            padding: 0;
        }
        .cu-ext-close:hover { color: var(--fr-text) !important; }

        .cu-ext-search-box {
            display: flex;
            gap: 10px;
            position: relative;
            background: transparent !important;
        }
        
        .cu-ext-input {
            flex-grow: 1;
            background-color: var(--fr-input-bg) !important;
            color: var(--fr-text) !important;
            border: 1px solid var(--fr-input-border) !important;
            padding: 10px 14px;
            border-radius: 8px;
            font-size: 14px;
            outline: none;
        }
        .cu-ext-input:focus { border-color: var(--fr-accent) !important; }

        .cu-ext-list-container {
            padding: 20px 30px;
            overflow-y: auto;
            flex-grow: 1;
            background-color: var(--fr-bg) !important;
        }
        
        .cu-ext-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
            gap: 15px;
            list-style: none;
            padding: 0;
            margin: 0;
            align-items: start; /* Карточки не тянутся */
        }

        .cu-ext-item {
            background-color: var(--fr-card-bg) !important;
            border: 1px solid var(--fr-border) !important;
            border-radius: 12px;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            transition: border-color 0.2s;
        }
        .cu-ext-item * { background-color: transparent !important; } 
        .cu-ext-item:hover { border-color: var(--fr-text-sec) !important; }

        .cu-ext-info {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
        }

        .cu-ext-names {
            overflow: hidden;
            flex-grow: 1;
            margin-right: 10px;
            cursor: pointer;
        }
        
        .cu-ext-name {
            font-size: 16px;
            font-weight: 700;
            color: var(--fr-text) !important;
            margin-bottom: 2px;
            display: block;
        }
        .cu-ext-email {
            font-size: 13px;
            color: var(--fr-text-sec) !important;
            display: block;
            word-break: break-all;
        }

        .cu-ext-actions {
            display: flex;
            gap: 6px;
            flex-shrink: 0;
            align-items: center;
        }

        .cu-ext-btn {
            padding: 6px 12px;
            border-radius: 6px;
            border: none;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: 0.2s;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }
        
        .cu-ext-btn-primary {
            background-color: var(--fr-accent) !important;
            color: #fff !important;
        }
        .cu-ext-btn-primary:hover { opacity: 0.9; }

        .cu-ext-btn-sec {
            background-color: transparent !important;
            border: 1px solid var(--fr-border) !important;
            color: var(--fr-text) !important;
        }
        .cu-ext-btn-sec:hover {
            border-color: var(--fr-text-sec) !important;
            background-color: rgba(128,128,128, 0.1) !important;
        }

        .cu-ext-btn-del {
            color: var(--fr-danger) !important;
            border: 1px solid rgba(255, 69, 58, 0.3) !important;
            background-color: transparent !important;
            width: 32px;
            height: 32px;
            padding: 0;
            font-size: 16px;
        }
        .cu-ext-btn-del:hover {
            background-color: rgba(255, 69, 58, 0.1) !important;
            border-color: var(--fr-danger) !important;
        }

        .cu-ext-subjects {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            padding-top: 8px;
            border-top: 1px solid var(--fr-border) !important;
            margin-top: 0;
        }
        
        .cu-ext-tag {
            font-size: 11px;
            padding: 3px 8px;
            border-radius: 4px;
            background-color: var(--fr-input-bg) !important;
            color: var(--fr-text) !important;
            border: 1px solid var(--fr-border) !important;
        }

        /* --- НОВЫЕ СТИЛИ ДЛЯ РАСПИСАНИЯ --- */
        .cu-ext-schedule-box {
            margin-top: 10px;
            background-color: var(--fr-input-bg) !important;
            border: 1px solid var(--fr-border);
            border-radius: 8px;
            padding: 10px;
            font-size: 12px;
            line-height: 1.5;
            color: var(--fr-text);
            display: none;
            flex-direction: column;
            gap: 4px;
            animation: fadeIn 0.2s ease-out;
        }

        .cu-ext-sch-row {
            display: flex;
            justify-content: space-between;
            border-bottom: 1px dashed var(--fr-border);
            padding-bottom: 4px;
        }
        .cu-ext-sch-row:last-child { border-bottom: none; }
        
        .cu-ext-day { font-weight: 700; min-width: 30px; color: var(--fr-accent); }
        .cu-ext-time { text-align: right; color: var(--fr-text); }
        .cu-ext-free { color: #28a745; }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-5px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .cu-ext-suggestions {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: var(--fr-bg) !important;
            border: 1px solid var(--fr-border);
            border-radius: 0 0 8px 8px;
            z-index: 100;
            max-height: 250px;
            overflow-y: auto;
            display: none;
        }
        .cu-ext-suggestions.visible { display: block; }
        
        .cu-ext-s-item {
            padding: 10px 14px;
            cursor: pointer;
            border-bottom: 1px solid var(--fr-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .cu-ext-s-item:hover { background-color: var(--fr-card-bg) !important; }

        .cu-ext-window ::-webkit-scrollbar { width: 8px; height: 8px; }
        .cu-ext-window ::-webkit-scrollbar-track { background: transparent; }
        .cu-ext-window ::-webkit-scrollbar-thumb { background: var(--fr-border); border-radius: 4px; }
    `;
    document.head.appendChild(style);
}

function renderFriendsPage() {
    let overlay = document.getElementById('friends-overlay');
    
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'friends-overlay';
        
        if (chrome && chrome.storage) {
            chrome.storage.sync.get(['themeEnabled', 'oledEnabled'], (data) => {
                applyThemeClasses(overlay, !!data.themeEnabled, !!data.oledEnabled);
            });
        }
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeFriendsPage();
        });

        document.body.appendChild(overlay);
    }

    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    const contentHtml = `
        <div class="cu-ext-window">
            <button class="cu-ext-close" id="modalCloseBtn" title="Закрыть">×</button>
            
            <div class="cu-ext-header">
                <div class="cu-ext-top-row">
                    <h1 class="cu-ext-title">Мои друзья</h1>
                    <button id="updateAllSubjectsBtn" class="cu-ext-btn cu-ext-btn-sec">
                        ↻ Обновить все предметы
                    </button>
                </div>
                
                <div class="cu-ext-search-container" style="position: relative;">
                    <div class="cu-ext-search-box">
                        <input type="text" id="friendSearchInput" class="cu-ext-input" placeholder="Имя или email (например: Игорь)" autocomplete="off">
                        <button id="addFriendBtn" class="cu-ext-btn cu-ext-btn-primary">Добавить</button>
                    </div>
                    <div id="suggestionsList" class="cu-ext-suggestions"></div>
                </div>
                <div id="statusMsg" style="margin-top: 10px;"></div>
            </div>

            <div class="cu-ext-list-container">
                <ul id="friendsList" class="cu-ext-list"></ul>
            </div>
        </div>
    `;

    overlay.innerHTML = contentHtml;
    document.getElementById('modalCloseBtn').addEventListener('click', closeFriendsPage);

    bindFriendsLogic();
}

function bindFriendsLogic() {
    const input = document.getElementById('friendSearchInput');
    const suggestionsBox = document.getElementById('suggestionsList');
    const list = document.getElementById('friendsList');
    const statusDiv = document.getElementById('statusMsg');
    const updateAllBtn = document.getElementById('updateAllSubjectsBtn');

    const getStoredFriends = () => JSON.parse(localStorage.getItem('cu_friends_list')) || [];
    const saveStoredFriends = (friends) => localStorage.setItem('cu_friends_list', JSON.stringify(friends));

    const fetchSubjectsForEmail = (email) => {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: "ANALYZE_SUBJECTS", email: email }, (response) => {
                if (response && response.success) {
                    resolve(response.subjects || []);
                } else {
                    resolve(null);
                }
            });
        });
    };

    const renderList = () => {
        const friends = getStoredFriends();
        list.innerHTML = '';
        
        if (friends.length === 0) {
            list.style.display = 'block'; 
            list.innerHTML = '<div style="color: var(--fr-text-sec); font-size: 16px; text-align: center; padding: 40px;">Пока никого нет.<br>Введите имя в поиске выше.</div>';
            return;
        } else {
            list.style.display = 'grid'; 
        }

        friends.forEach((friend, index) => {
            const li = document.createElement('li');
            li.className = 'cu-ext-item';
            
            const displayName = friend.name || friend.email;
            
            let subjectsHtml = '';
            if (friend.subjects && friend.subjects.length > 0) {
                subjectsHtml = friend.subjects.map(s => `<span class="cu-ext-tag">${s}</span>`).join('');
            } else if (friend.subjects && friend.subjects.length === 0) {
                subjectsHtml = '<span style="color: var(--fr-text-sec); font-size: 12px; font-style: italic;">Предметов не найдено</span>';
            }

            li.innerHTML = `
                <div class="cu-ext-info">
                    <div class="cu-ext-names" title="Открыть календарь">
                        <div class="cu-ext-name">${displayName}</div>
                        <div class="cu-ext-email">${friend.email}</div>
                    </div>
                    <div class="cu-ext-actions">
                        <button class="cu-ext-btn cu-ext-btn-sec busy-btn" title="Анализ расписания">
                            Занятость
                        </button>
                        <button class="cu-ext-btn cu-ext-btn-sec subjects-btn" data-email="${friend.email}" data-index="${index}">
                            Предметы
                        </button>
                        <button class="cu-ext-btn cu-ext-btn-del delete-btn" data-index="${index}" title="Удалить">
                            ✕
                        </button>
                    </div>
                </div>
                
                <!-- Блок предметов -->
                <div class="cu-ext-subjects" style="display: none;">${subjectsHtml}</div>
                
                <!-- Блок расписания (Добавлено) -->
                <div class="cu-ext-schedule-box" style="display: none;"></div>
            `;

            // Клик по имени -> открыть ссылку
            const nameBlock = li.querySelector('.cu-ext-names');
            nameBlock.addEventListener('click', async (e) => {
                e.stopPropagation();
                
                const email = friend.email;
                if (!email) return;

                const yandexCalendarUrl = `https://calendar.yandex.ru/week?layers=${encodeURIComponent(email)}`;
                nameBlock.style.opacity = '0.5';

                try {
                    const response = await chrome.runtime.sendMessage({ action: "GET_CALENDAR_LINK", email: email });
                    if (response && response.success && response.link) {
                        window.open(response.link, '_blank');
                    } else {
                        window.open(yandexCalendarUrl, '_blank');
                    }
                } catch (err) {
                    window.open(yandexCalendarUrl, '_blank');
                } finally {
                    nameBlock.style.opacity = '1';
                }
            });
            
            // --- ЛОГИКА КНОПКИ "ЗАНЯТОСТЬ" (ОБНОВЛЕНА) ---
            const busyBtn = li.querySelector('.busy-btn');
            const schedBox = li.querySelector('.cu-ext-schedule-box');
            const subjContainer = li.querySelector('.cu-ext-subjects');
            
            busyBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                
                if (schedBox.style.display === 'flex') {
                    schedBox.style.display = 'none';
                    return;
                }

                subjContainer.style.display = 'none';

                schedBox.style.display = 'flex';
                schedBox.innerHTML = '<span style="color: var(--fr-text-sec);">Анализ (месяц назад)...</span>';
                busyBtn.disabled = true;

                try {
                    const response = await chrome.runtime.sendMessage({ 
                        action: "GET_WEEKLY_SCHEDULE", 
                        email: friend.email 
                    });

                    if (response && response.success && response.schedule) {
                        let html = `<div style="margin-bottom:6px; font-weight:600; font-size:11px; color:var(--fr-text-sec);">НЕДЕЛЯ ОТ: ${response.weekStart}</div>`;
                        
                        const daysOrder = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
                        daysOrder.forEach(day => {
                            const val = response.schedule[day] || "Нет данных";
                            const isFree = val === "Свободен";
                            
                            html += `
                                <div class="cu-ext-sch-row">
                                    <span class="cu-ext-day">${day}</span>
                                    <span class="cu-ext-time ${isFree ? 'cu-ext-free' : ''}">${val}</span>
                                </div>
                            `;
                        });
                        schedBox.innerHTML = html;
                    } else {
                        schedBox.innerHTML = '<span style="color: var(--fr-danger);">Нет доступа или данных</span>';
                    }
                } catch (err) {
                    schedBox.innerHTML = '<span style="color: var(--fr-danger);">Ошибка связи</span>';
                } finally {
                    busyBtn.disabled = false;
                }
            });

            // --- ЛОГИКА КНОПКИ "ПРЕДМЕТЫ" ---
            const subjBtn = li.querySelector('.subjects-btn');
            
            subjBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                
                if (subjContainer.style.display === 'flex') {
                    subjContainer.style.display = 'none';
                    return;
                }
                
                schedBox.style.display = 'none';
                
                subjContainer.style.display = 'flex';
                subjBtn.disabled = true;
                subjBtn.innerText = '...';
                
                try {
                    const subjects = await fetchSubjectsForEmail(friend.email);
                    if (subjects !== null) {
                        const currentFriends = getStoredFriends();
                        const friendIdx = currentFriends.findIndex(f => f.email === friend.email);
                        if (friendIdx !== -1) {
                            currentFriends[friendIdx].subjects = subjects;
                            saveStoredFriends(currentFriends);
                        }
                        if (subjects.length > 0) {
                            subjContainer.innerHTML = subjects.map(s => `<span class="cu-ext-tag">${s}</span>`).join('');
                        } else {
                            subjContainer.innerHTML = '<span style="color: var(--fr-text-sec); font-size: 12px; font-style: italic;">Нет предметов</span>';
                        }
                    } else {
                        subjContainer.innerHTML = '<span style="color: var(--fr-danger);">Ошибка</span>';
                    }
                } catch(err) {
                    subjContainer.innerHTML = '<span style="color: var(--fr-danger);">Ошибка</span>';
                } finally {
                    subjBtn.disabled = false;
                    subjBtn.innerText = 'Предметы';
                }
            });

            list.appendChild(li);
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); 
                const idx = e.target.dataset.index;
                const friends = getStoredFriends();
                friends.splice(idx, 1);
                saveStoredFriends(friends);
                renderList();
            });
        });
    };

    updateAllBtn.addEventListener('click', async () => {
        const friends = getStoredFriends();
        if (friends.length === 0) return;
        updateAllBtn.disabled = true;
        const originalText = updateAllBtn.innerText;
        updateAllBtn.innerText = 'Загрузка...';

        let completed = 0;
        let hasChanges = false;
        
        const promises = friends.map(async (friend) => {
            try {
                const subjects = await fetchSubjectsForEmail(friend.email);
                if (subjects !== null) {
                    friend.subjects = subjects;
                    hasChanges = true;
                }
            } catch (e) { console.error(e); } 
            finally {
                completed++;
                updateAllBtn.innerText = `Загрузка... ${Math.round((completed / friends.length) * 100)}%`;
            }
        });

        await Promise.all(promises);

        if (hasChanges) {
            saveStoredFriends(friends);
            renderList();
            statusDiv.innerHTML = `<p style="color: #28a745; margin-bottom: 0; font-size: 14px;">Предметы обновлены!</p>`;
            setTimeout(() => statusDiv.innerHTML = '', 3000);
        }
        updateAllBtn.innerText = originalText;
        updateAllBtn.disabled = false;
    });

    const addFriendToStorage = (name, email) => {
        const friends = getStoredFriends();
        if (friends.find(f => f.email === email)) {
            statusDiv.innerHTML = `<p style="color: var(--fr-danger); margin-bottom: 0;">Уже в списке</p>`;
            setTimeout(() => statusDiv.innerHTML = '', 2000);
            return;
        }
        friends.push({ name, email, addedAt: new Date().toISOString(), subjects: [] });
        saveStoredFriends(friends);
        input.value = '';
        suggestionsBox.classList.remove('visible');
        renderList();
    };

    const performSearch = debounce((query) => {
        if (!query || query.length < 3) {
            suggestionsBox.classList.remove('visible');
            return;
        }
        chrome.runtime.sendMessage({ action: "SEARCH_CONTACTS", query: query }, (response) => {
            suggestionsBox.innerHTML = '';
            if (response && response.success && response.contacts.length > 0) {
                suggestionsBox.classList.add('visible');
                response.contacts.forEach(contact => {
                    const div = document.createElement('div');
                    div.className = 'cu-ext-s-item';
                    div.innerHTML = `
                        <div>
                            <div class="cu-ext-name" style="font-size: 14px;">${contact.name}</div>
                            <div class="cu-ext-email" style="font-size: 12px;">${contact.email}</div>
                        </div>
                        <span style="font-size:20px; color: var(--fr-text-sec);">+</span>
                    `;
                    div.addEventListener('click', () => addFriendToStorage(contact.name, contact.email));
                    suggestionsBox.appendChild(div);
                });
            } else {
                suggestionsBox.classList.remove('visible');
            }
        });
    }, 400);

    input.addEventListener('input', (e) => performSearch(e.target.value));
    
    document.querySelector('.cu-ext-window').addEventListener('click', (e) => {
        if (!e.target.closest('.cu-ext-search-container')) suggestionsBox.classList.remove('visible');
    });

    document.getElementById('addFriendBtn').addEventListener('click', () => {
        const val = input.value.trim();
        if(val.includes('@')) addFriendToStorage(val.split('@')[0], val);
    });

    renderList();
}

init();