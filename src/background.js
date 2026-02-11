// background.js

if (typeof importScripts === 'function') {
    try { importScripts('browser-polyfill.js'); } catch (e) {}
}

if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
    var browser = chrome;
}

// --- СПИСОК ПРЕДМЕТОВ ---
const SUBJECTS_LIST = [
  // Software Engineering
  "Алгоритмы и структуры данных 2",
  "Алгоритмы и структуры данных 2. Продвинутый уровень",
  "Архитектура компьютера и операционные системы 2",
  "Многопоточная синхронизация",
  "Дискретная математика",
  "Основы промышленной разработки",
  "Основы разработки на Go",
  "Информационная безопасность",
  "Методы дискретной оптимизации",
  "Web-разработка",
  "Разработка на С++",
  "Разработка на С++ Часть 2",
  "Разработка на Kotlin",
  "Rocq",

  // Business
  "Введение в экономику. Основной уровень",
  "Основы бизнес-аналитики. Основной уровень",
  "Введение в алгоритмы и структуры данных",
  "Макроэкономика I. Основной уровень",
  "Основы финансов",
  "Основы маркетинга",
  "Теория игр. Основной уровень",
  "Финансы. Основной уровень",
  "Эконометрика I. Основной уровень",
  "Математическая статистика. Основной уровень",
  "Введение в экономику. Продвинутый уровень",
  "Макроэкономика I. Продвинутый уровень",
  "Математическая статистика. Продвинутый уровень",
  "Основы бизнес-аналитики. Продвинутый уровень",
  "Теория игр. Продвинутый уровень",
  "Финансы. Продвинутый уровень",
  "Эконометрика I. Продвинутый уровень",

  // AI
  "Введение в искусственный интеллект. Основной уровень",
  "Введение в статистику. Основной уровень",
  "Базы данных",
  "Deep Learning",
  "Введение в статистику. Продвинутый уровень",
  "Введение в искусственный интеллект. Продвинутый уровень",

  // Математика
  "Основы математического анализа и линейной алгебры 2",
  "Математический анализ 2. Основной уровень",
  "Математический анализ 2. Пилотный поток",
  "Линейная алгебра и геометрия 2",
  "Линейная алгебра и геометрия 2. Пилотный поток",
  "Алгебра",
  "Дополнительные главы математического анализа",
  "Математический анализ 2. Продвинутый уровень",

  // STEM
  "Бизнес-студия",
  "Искусство и наука",
  "Научная студия. В поисках нейтронов",
  "Научная студия. Лечение на Гамма-ноже",
  "Научная студия. Переменные звезды",
  "Научная студия. Перколяция: от лесных пожаров до нефтегазовых резервуаров",
  "Научная студия. Поиск экспортных рынтов",
  "Научная студия. Стратегия управления кадровой динамикой учителей в РФ",
  "Научная студия. Умный дом",
  "Студия компьютерных наук",
  "Философия и наука",

  // SOFT
  "Алгоритмы принятия решений",
  "Командная работа по Agile",
  "Креативные техники решения задач",
  "Публичные выступления и основы презентации",
  "Системное и критическое мышление",
  "Стратегическое мышление",
  "Стресс-менеджмент и эмоциональный интеллект",
  "Работа в команде и коллаборация",
  "Управление ресурсами: личная эффективность",
  "Целеполагание, планирование и самоорганизация",
  "Ясность в текстах",

  // Образовательный стандарт
  "Физкультура и спорт",
  "Английский язык 101S2",
  "Английский язык 102S2",
  "Английский язык 103S2",
  "Английский язык 103S2B",
  "Английский язык 104S2",
  "Английский язык 104S2B",
  "Английский язык 105S2",
  "Английский язык 105S2B",
  "Английский язык 202S4",
  "Английский язык 203S4",
  "Английский язык 204S4",
  "Английский язык 204S4B",
  "История России",

  // Humanities (факультативы вне плана)
  "Этика. Право. ИИ",
  "Как понимать кино?"
];

const YandexServices = {
    // --- CALENDAR SERVICE ---
    Calendar: {
        async getEvents(email, daysAhead = 30) {
            if (!email) throw new Error("Email обязателен");
            const session = await this._getSessionConfig();
            const now = new Date();
            const future = new Date();
            future.setDate(now.getDate() + daysAhead);
            return await this._fetchEvents(email, session, now, future);
        },

        async getPublicLink(email) {
            // Мы убрали try-catch и fallback-ссылку.
            // Если сессии нет, _getSessionConfig выбросит ошибку, и фронтенд покажет просьбу войти.
            const session = await YandexServices.Mail._getSessionConfig();
            const url = `https://mail.yandex.ru/web-api/models/liza1?_m=get-public-id`;
            const payload = {
                "models": [{ "name": "get-public-id", "params": { "email": email }, "meta": { "requestAttempt": 1 } }],
                "_ckey": session.ckey, "_uid": session.uid
            };
            
            const response = await fetch(url, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
            const json = await response.json();
            const data = json.models?.[0]?.data;
            
            if (data && data.public_id) {
                return `https://calendar.yandex.ru/schedule/public/${data.public_id}?uid=${session.uid}`;
            }
            
            // Если публичного ID нет, выбрасываем ошибку, чтобы на фронте открылось сообщение
            throw new Error("Не удалось получить публичную ссылку или нет доступа");
        },

        // === ФУНКЦИЯ АНАЛИЗА РАСПИСАНИЯ ===
        // === ФУНКЦИЯ АНАЛИЗА РАСПИСАНИЯ ===
        // Добавили аргумент targetDate
        async analyzeSchedule(email, targetDate = null) {
            try {
                const session = await this._getSessionConfig();
                
                // 1. УСТАНАВЛИВАЕМ ДАТУ
                // Если дата передана с фронта — используем её, иначе берем текущую
                const datePoint = targetDate ? new Date(targetDate) : new Date();
                
                // УБРАЛИ СТРОКУ: datePoint.setDate(datePoint.getDate() - 35); 
                // Теперь мы смотрим ровно ту дату, которую запросили (текущую)
                
                // Находим понедельник этой недели
                const day = datePoint.getDay() || 7; 
                datePoint.setDate(datePoint.getDate() - (day - 1));
                datePoint.setHours(0, 0, 0, 0);
                
                const startOfWeek = new Date(datePoint);
                const endOfWeek = new Date(datePoint);
                endOfWeek.setDate(endOfWeek.getDate() + 7);

                // 2. ПОЛУЧАЕМ СОБЫТИЯ
                const eventsRaw = await this._fetchEvents(email, session, startOfWeek, endOfWeek);
                
                // 3. ФИЛЬТРАЦИЯ И ПАРСИНГ
                const events = (eventsRaw || []).filter(e => 
                    //!e.hidden && // ну типа скрытые меро. но политика вуза пока непонятна, оставим так
                    e.decision !== 'no' && 
                    e.availability !== 'free'
                );

                const schedule = {};
                const daysMap = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

                for (let i = 0; i < 6; i++) { 
                    const currentDay = new Date(startOfWeek);
                    currentDay.setDate(startOfWeek.getDate() + i);
                    
                    const dayEvents = events.filter(e => {
                        const eStart = new Date(e.start); 
                        return eStart.getDate() === currentDay.getDate() && 
                               eStart.getMonth() === currentDay.getMonth();
                    });

                    if (dayEvents.length === 0) {
                        schedule[daysMap[currentDay.getDay()]] = "Свободен";
                        continue;
                    }

                    // Сортируем
                    dayEvents.sort((a, b) => new Date(a.start) - new Date(b.start));

                    // Склеиваем
                    const merged = [];
                    if (dayEvents.length > 0) {
                        let current = { 
                            start: new Date(dayEvents[0].start), 
                            end: new Date(dayEvents[0].end) 
                        };

                        for (let k = 1; k < dayEvents.length; k++) {
                            const nextEv = {
                                start: new Date(dayEvents[k].start),
                                end: new Date(dayEvents[k].end)
                            };
                            
                            const gap = (nextEv.start - current.end) / (1000 * 60);
                            
                            if (nextEv.start <= current.end || gap < 15) {
                                if (nextEv.end > current.end) current.end = nextEv.end;
                            } else {
                                merged.push(current);
                                current = nextEv;
                            }
                        }
                        merged.push(current);
                    }

                    // Форматируем
                    const totalStart = merged[0].start.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'});
                    const totalEnd = merged[merged.length - 1].end.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'});
                    
                    let resultString = `${totalStart} - ${totalEnd}`;

                    const breaks = [];
                    for (let m = 0; m < merged.length - 1; m++) {
                        const breakStart = merged[m].end;
                        const breakEnd = merged[m+1].start;
                        const diffMins = (breakEnd - breakStart) / (1000 * 60);
                        
                        if (diffMins >= 20) {
                            const bs = breakStart.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'});
                            const be = breakEnd.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'});
                            breaks.push(`${bs}-${be}`);
                        }
                    }

                    if (breaks.length > 0) {
                        resultString += ` (окна: ${breaks.join(', ')})`;
                    }

                    schedule[daysMap[currentDay.getDay()]] = resultString;
                }

                return { 
                    success: true, 
                    schedule: schedule, 
                    weekStart: startOfWeek.toLocaleDateString('ru-RU') 
                };

            } catch (e) {
                console.error("Schedule error:", e);
                return { success: false, error: e.message };
            }
        },

        async analyzeSubjects(email) {
            try {
                const session = await this._getSessionConfig();

                let end = new Date();
                let start = new Date();

                // Устанавливаем базовый диапазон: сегодня - 15 дней, сегодня + 15 дней
                start.setDate(start.getDate() - 15);
                end.setDate(end.getDate() + 15);

                // Граничная дата: 11 февраля 2026 года (месяц 1 = февраль)
                const limitDate = new Date(2026, 1, 9);

                // Если расчетный старт оказался раньше 11 февраля 2026
                if (start < limitDate) {
                    // Устанавливаем жесткий период: 11.02.2026 — 26.02.2026
                    start = new Date(2026, 1, 9);
                    end = new Date(2026, 1, 26);
                }

                const events = await this._fetchEvents(email, session, start, end);
                const foundSubjects = new Set();

                if (!events || events.length === 0) return [];

                const sortedSubjects = [...SUBJECTS_LIST].sort((a, b) => b.length - a.length);

                events.forEach(event => {
                    const rawTitle = (event.name || event.subject || "").trim();
                    if (!rawTitle) return;

                    let cleanTitle = rawTitle;

                    cleanTitle = cleanTitle.replace(/^[^a-zA-Zа-яА-ЯёЁ0-9]+/, '');
                    cleanTitle = cleanTitle.replace(/^Зачет\.?\s*/i, '');
                    cleanTitle = cleanTitle.replace(/[—–−]/g, '-'); 
                    cleanTitle = cleanTitle.replace(/\s+/g, ' '); 
                    cleanTitle = cleanTitle.toLowerCase().trim();

                    if (!cleanTitle) return;

                    // ОБНОВЛЕННЫЙ РЕГУЛЯРКА ДЛЯ АНГЛИЙСКОГО (добавлено [a-z]?)
                    const englishGroupMatch = cleanTitle.match(/^английский язык\s+([0-9]+s[0-9]+(?:-[0-9]+[a-z]?)?)/);
                    
                    if (englishGroupMatch) {
                        const group = englishGroupMatch[1].toUpperCase(); 
                        foundSubjects.add(`Английский язык ${group}`);
                        return; 
                    }

                    for (const subject of sortedSubjects) {
                        let normalizedSubject = subject.toLowerCase()
                                                       .replace(/[—–−]/g, '-')
                                                       .replace(/\s+/g, ' ')
                                                       .trim();

                        if (cleanTitle.startsWith(normalizedSubject)) {
                            foundSubjects.add(subject);
                            break; 
                        }
                    }
                });

                const hasSpecificEnglish = Array.from(foundSubjects).some(s => 
                    s.startsWith("Английский язык") && s.length > "Английский язык".length
                );

                if (hasSpecificEnglish) {
                    foundSubjects.delete("Английский язык");
                }
                
                return Array.from(foundSubjects).sort();
            } catch (e) {
                console.error("Subject analysis error:", e);
                // ВАЖНО: Возвращаем null при ошибке, чтобы фронтенд понял, что это сбой сети/auth
                return null;
            }
        },

        async _getSessionConfig() {
            const uid = await YandexServices._getCookie('yandexuid', "https://calendar.yandex.ru");
            if (!uid) throw new Error("Нет авторизации в Яндекс Календаре");
            
            const response = await fetch(`https://calendar.yandex.ru/?uid=${uid}`);
            const text = await response.text();
            
            const matchCkey = text.match(/"ckey"\s*:\s*"([^"]+)"/);
            if (!matchCkey) throw new Error("Не удалось получить ключ API Календаря (ckey)");
            
            return { ckey: matchCkey[1], uid: uid, timezone: "Europe/Moscow" };
        },

        async _fetchEvents(email, session, start, end) {
            const dateFormat = (d) => d.toISOString().split('T')[0];
            const url = `https://calendar.yandex.ru/api/models?_models=get-events-by-login`;
            const cid = `MAYA-${Math.floor(Math.random() * 100000000)}-${Date.now()}`;

            const payload = {
                "models": [{
                    "name": "get-events-by-login",
                    "params": {
                        "limitAttendees": true,
                        "login": email,
                        "opaqueOnly": true,
                        "email": email,
                        "from": dateFormat(start),
                        "to": dateFormat(end)
                    }
                }]
            };

            const headers = {
                'Content-Type': 'application/json',
                'x-requested-with': 'XMLHttpRequest',
                'x-yandex-maya-ckey': session.ckey,
                'x-yandex-maya-uid': session.uid,
                'x-yandex-maya-cid': cid,
                'x-yandex-maya-user-agent': 'maya-frontend',
                'x-yandex-maya-locale': 'ru',
                'x-yandex-maya-timezone': session.timezone
            };
            
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) throw new Error(`Network error: ${response.status}`);
            
            const json = await response.json();
            const model = json.models?.[0];

            if (model?.status === "error") {
                if (model.error === "ckey") throw new Error("Ключ ckey недействителен. Обновите календарь.");
                console.error("API Error details:", model.error);
                throw new Error(`API Error: ${JSON.stringify(model.error)}`);
            }

            return model?.data?.events || [];
        }
    },

    // --- MAIL SERVICE ---
    // --- MAIL SERVICE ---
    Mail: {
        async searchContacts(query) {
            if (!query || query.length < 3) return [];

            // Попробуем выполнить запрос до 2 раз
            const maxRetries = 2;
            
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    // Каждый раз получаем свежий конфиг, чтобы ckey был актуальным
                    const session = await this._getSessionConfig();
                    return await this._fetchContacts(query, session);
                } catch (e) {
                    // Если ошибка именно в невалидном ключе (ckey), пробуем снова
                    if (e.message === "INVALID_CKEY") {
                        console.warn(`[Mail] Ckey устарел. Попытка ${attempt} из ${maxRetries}...`);
                        if (attempt === maxRetries) return []; // Если попытки кончились, возвращаем пустоту
                        // Иначе цикл продолжится, получит новый session и повторит запрос
                        continue;
                    }
                    
                    // Если другая ошибка — выводим в консоль и выходим
                    console.error("Search contacts error:", e);
                    return [];
                }
            }
            return [];
        },

        async _getSessionConfig() {
            const uid = await YandexServices._getCookie('yandexuid', "https://mail.yandex.ru");
            if (!uid) throw new Error("Нет авторизации в Яндекс Почте");
            
            // Запрос страницы для получения актуального ckey
            const response = await fetch(`https://mail.yandex.ru/?uid=${uid}`);
            const text = await response.text();
            
            const matchCkey = text.match(/"ckey":\s*"([^"]+)"/);
            if (!matchCkey) throw new Error("Не удалось получить ключ API Почты");
            
            return { ckey: matchCkey[1], uid: uid };
        },

        async _fetchContacts(query, session) {
            const url = `https://mail.yandex.ru/web-api/models/liza1?_m=abook-contacts`;
            const payload = {
                "models": [{
                    "name": "abook-contacts",
                    "params": { "pagesize": "10", "q": query, "type": "normal" },
                    "meta": { "requestAttempt": 1 }
                }],
                "_ckey": session.ckey, "_uid": session.uid
            };

            const response = await fetch(url, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error(`Network error: ${response.status}`);
            
            const json = await response.json();
            const model = json.models?.[0];

            // --- ДОБАВЛЕНА ОБРАБОТКА ОШИБОК CKEY ---
            if (model && model.status === "error") {
                if (model.error === "ckey") {
                    throw new Error("INVALID_CKEY"); // Сигнал для searchContacts, что надо повторить
                }
                // Другие ошибки API игнорируем или логируем, но возвращаем пустой список
                console.error("Mail API Error:", model.error);
                return [];
            }
            // ----------------------------------------

            const contacts = model?.data?.contact || [];

            return contacts
                .filter(c => c.email && c.email.length > 0)
                .map(c => ({
                    name: c.name.full || c.name.first + ' ' + c.name.last,
                    email: c.email[0].value,
                    avatar: c.monogram 
                }));
        }
    },

    async _getCookie(name, url) {
        try {
            return new Promise((resolve) => {
                chrome.cookies.get({ url: url, name: name }, (cookie) => {
                    resolve(cookie ? cookie.value : null);
                });
            });
        } catch (e) { return null; }
    }
};

/**
 * Центральная функция для обработки навигации и внедрения скриптов.
 * @param {number} tabId - ID вкладки, где произошло событие.
 * @param {string} url - URL страницы.
 */
function handleNavigation(tabId, url) {
    // Прекращаем выполнение, если URL не соответствует целевому сайту
    if (!url || !url.startsWith("https://my.centraluniversity.ru/")) return;

    // Внедряем скрипт проверки версии на всех страницах домена
    browser.scripting.executeScript({
        target: { tabId: tabId },
        files: ["version_check.js"]
    }).catch(err => console.error(`[BG_LOG] Error injecting version_check.js:`, err));
    browser.scripting.executeScript({
        target: { tabId: tabId },
        files: ["browser-polyfill.js","reset.js"]
    }).catch(err => console.error(`[BG_LOG] Error injecting reset.js:`, err));

    // --- ИНЖЕКЦИЯ ДЛЯ FRIENDS TAB (NEW) ---
    // Внедряем стили и скрипт для вкладки друзей на ВСЕХ страницах,
    // так как шапка сайта есть везде.

    browser.scripting.insertCSS({
        target: { tabId: tabId },
        files: ["styles.css"]
    }).catch(err => console.log("CSS injection error (might be duplicate)", err));

    // should be enabled since v1.8
    browser.scripting.executeScript({
       target: { tabId: tabId },
       files: ["browser-polyfill.js", "friends_tab.js"]
    }).catch(err => console.error(`[BG_LOG] Error injecting friends_tab.js:`, err));
    // ----------------------------------------

    // browser.scripting.executeScript({
    //     target: { tabId: tabId },
    //     files: ["browser-polyfill.js", "rgb_outline_effect.js"]
    // }).catch(err => console.error(`[BG_LOG] Error injecting rgb_outline_effect.js:`, err));


    // --- ЛОГИКА РАЗДЕЛЬНОГО ВНЕДРЕНИЯ ---

    if (url.includes("/learn/tasks")) {
        // СТРАНИЦА ЗАДАЧ: Внедряем объединенный tasks_fix, но НЕ emoji_swap
        browser.scripting.executeScript({
            target: { tabId: tabId },
            files: ["browser-polyfill.js", "dark_theme.js", "tasks_fix.js", "snow.js", "course_card_image_replacer.js"]
        }).catch(err => console.error(`[BG_LOG] Error injecting scripts for Tasks page:`, err));
    } else {
        // ДРУГИE СТРАНИЦЫ: Внедряем стандартный набор, включая emoji_swap
        browser.scripting.executeScript({
            target: { tabId: tabId },
            files: ["browser-polyfill.js", "dark_theme.js", "emoji_swap.js", "snow.js", "course_card_image_replacer.js"]
        }).catch(err => console.error(`[BG_LOG] Error injecting default scripts:`, err));
    }

    // Внедрение скриптов для страницы просмотра курсов
    if (url.includes("/learn/courses/view")) {
        browser.scripting.executeScript({
            target: { tabId: tabId },
            files: ["browser-polyfill.js", "course_card_simplifier.js",
                 "courses_fix.js", "course_overview_task_status.js",
                    "course_overview_autoscroll.js", "course_friends_list.js", "future_exams_view.js"]

        }).catch(err => console.error(`[BG_LOG] Error injecting courses_fix.js:`, err));
    }

    // Внедрение скриптов для страниц с материалами (лонгридами)
    if (url.includes("/longreads/")) {
        browser.scripting.executeScript({
            target: { tabId: tabId },
            files: ["homework_weight_fix.js", "instant_doc_view_fix.js", "task_status_adaptation.js", "rename_hw.js"]
        }).catch(err => console.error(`[BG_LOG] Error injecting Longreads scripts:`, err));
    }

    // --- ОБНОВЛЕННЫЙ БЛОК ДЛЯ СТРАНИЦЫ УСПЕВАЕМОСТИ ---
    if (url.includes("/learn/reports/student-performance")) {
         // Внедряем скрипты для общей страницы успеваемости (архив и GPA калькулятор)
         
        // CURRENTLY DISABLED!
        // browser.scripting.executeScript({
        //     target: { tabId: tabId },
        //     files: ["archive-statements.js", "metrics_statements.js"]
        // }).catch(err => console.error(`[BG_LOG] Error injecting reports scripts:`, err));
        
        // --- НОВАЯ ЛОГИКА ДЛЯ СТАНДАРТИЗИРОВАННОЙ ВЕДОМОСТИ ---
        // Проверяем, что мы находимся на конкретной странице успеваемости по активностям
        if (url.includes("/activity")) {
            // Проверяем, включена ли опция в настройках расширения
            browser.storage.sync.get(['advancedStatementsEnabled']).then(settings => {
                if (settings.advancedStatementsEnabled) {
                    browser.scripting.executeScript({
                        target: { tabId: tabId },
                        files: ["advanced_statements.js"]
                    }).catch(err => console.error(`[BG_LOG] Error injecting advanced_statements.js:`, err));
                }
            }).catch(err => console.error(`[BG_LOG] Error getting settings for advanced statements:`, err));
        }
    }

    // Внедряем загрузчик страницы плагина (для настроек)
    browser.scripting.executeScript({
        target: { tabId: tabId },
        files: ["plugin_page_loader.js"]
    }).catch(err => console.error(`[BG_LOG] Error injecting plugin_page_loader.js:`, err));
}

// --- СЛУШАТЕЛИ НАВИГАЦИИ ---
// Отслеживаем переходы внутри SPA (Single Page Application)
browser.webNavigation.onHistoryStateUpdated.addListener(details => {
    // frameId === 0 означает, что событие произошло в основном окне, а не в iframe
    if (details.frameId === 0) {
        handleNavigation(details.tabId, details.url);
    }
});

// Отслеживаем полную загрузку страницы (например, после F5 или прямого перехода)
browser.webNavigation.onCompleted.addListener(details => {
    if (details.frameId === 0) {
        handleNavigation(details.tabId, details.url);
    }
});


// --- ОБРАБОТЧИК СООБЩЕНИЙ (ЕДИНЫЙ ДЛЯ ВСЕГО) ---
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    // 1. ЛОГИКА ОБРАБОТКИ GIST
    if (request.action === "fetchGistContent") {
        fetch(request.url)
            .then(response => response.text())
            .then(text => {
                let processedText = text.trim();
                const prefix = "document.write('";
                const suffix = "')";
                const separatorRegex = /'\)\s*document\.write\('/g; 
                if (processedText.startsWith(prefix) && processedText.endsWith(suffix)) {
                    processedText = processedText.substring(prefix.length, processedText.length - suffix.length);
                    let rawHtml = processedText.replace(separatorRegex, '');
                    rawHtml = rawHtml
                        .replace(/\\'/g, "'").replace(/\\"/g, '"')
                        .replace(/\\n/g, '\n').replace(/\\\//g, '/')
                        .replace(/\\\\/g, '\\');
                    const cssMatch = rawHtml.match(/<link.*?href="(.*?)"/);
                    const cssUrl = cssMatch ? cssMatch[1] : null;
                    sendResponse({ success: true, html: rawHtml, cssUrl: cssUrl });
                } else {
                    sendResponse({ success: false, error: "Ответ от Gist имеет неожиданный формат." });
                }
            })
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    // 2. ЛОГИКА YANDEX MAIL (Поиск контактов по имени)
    if (request.action === "SEARCH_CONTACTS") {
        YandexServices.Mail.searchContacts(request.query).then(c => sendResponse({success:true, contacts:c})).catch(e=>sendResponse({success:false}));
        return true; 
    }
    if (request.action === "ANALYZE_SUBJECTS") {
        YandexServices.Calendar.analyzeSubjects(request.email).then(s => sendResponse({success:true, subjects:s})).catch(e=>sendResponse({success:false}));
        return true;
    }
    if (request.action === "GET_WEEKLY_SCHEDULE") {
        // Передаем request.date вторым аргументом
        YandexServices.Calendar.analyzeSchedule(request.email, request.date)
            .then(res => sendResponse(res))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
    if (request.action === "GET_CALENDAR_LINK") {
        YandexServices.Calendar.getPublicLink(request.email).then(l=>sendResponse({success:true, link:l})).catch(e=>sendResponse({success:false}));
        return true;
    }
});

