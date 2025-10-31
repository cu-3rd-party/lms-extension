// gpa_calculator.js (Версия 25 - Финал. Адаптация к SPA + Управление состоянием)

(async function () {
    const ALLOWED_PATH = "/learn/reports/student-performance";
    const API_URL = "https://my.centraluniversity.ru/api/micro-lms/performance/student";
    const ARCHIVE_KEY = "cu.lms.archived-statements";

    // --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ МОДУЛЯ ---
    let isGpaInitialized = false; // Локальный флаг состояния, отслеживающий, активен ли модуль
    let allCoursesData = []; // Кэш данных, чтобы не запрашивать их каждый раз при возврате на страницу

    if (!window.cuLmsLog) {
        window.cuLmsLog = console.log;
    }

    // --- ВСЕ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (без изменений) ---

    async function fetchPerformanceData() {
        try {
            const response = await fetch(API_URL);
            if (!response.ok) throw new Error(`HTTP ошибка! Статус: ${response.status}`);
            const data = await response.json();
            window.cuLmsLog("[LMS GPA] Данные успеваемости успешно получены.");
            return data.courses || [];
        } catch (error) {
            console.error("[LMS GPA] ОШИБКА: Не удалось получить данные:", error);
            return [];
        }
    }

    async function loadArchivedCourses() {
        try {
            const data = await browser.storage.local.get(ARCHIVE_KEY);
            return data[ARCHIVE_KEY] ? Object.keys(data[ARCHIVE_KEY]) : [];
        } catch (error) {
            console.error("[LMS GPA] ОШИБКА: Не удалось загрузить архив:", error);
            return [];
        }
    }

    function calculateGPA(courses) {
        if (!courses || courses.length === 0) return "N/A";
        const validCourses = courses.filter(course =>
            course.total !== null &&
            !/вступительный контест|пульс-опрос|ознакомление с/i.test(course.name)
        );
        if (validCourses.length === 0) return "N/A";
        const totalPoints = validCourses.reduce((sum, course) => sum + course.total, 0);
        const gpa = totalPoints / validCourses.length;
        return gpa.toFixed(2);
    }

    async function recalculateAndUpdateUI() {
        if (!document.getElementById("lms-gpa-table-container")) return; // Если таблицы нет, ничего не делаем
        window.cuLmsLog("[LMS GPA] Запускаю пересчет GPA из-за изменения архива...");
        
        const archivedCourseHrefs = await loadArchivedCourses();
        const archivedCourseIds = archivedCourseHrefs.map(href => parseInt(href.split('/').pop(), 10));

        const archivedCourses = allCoursesData.filter(course => archivedCourseIds.includes(course.id));
        const nonArchivedCourses = allCoursesData.filter(course => !archivedCourseIds.includes(course.id));

        const gpaData = {
            all: calculateGPA(allCoursesData),
            nonArchived: calculateGPA(nonArchivedCourses),
            archived: calculateGPA(archivedCourses),
        };

        document.getElementById("gpa-all-value").textContent = gpaData.all;
        document.getElementById("gpa-non-archived-value").textContent = gpaData.nonArchived;
        document.getElementById("gpa-archived-value").textContent = gpaData.archived;
        window.cuLmsLog("[LMS GPA] Таблица GPA обновлена.");
    }

    function renderInitialTable(gpaData) {
        // Код этой функции полностью без изменений
        const mainComponent = document.querySelector("cu-student-performance");
        const mainLoader = document.querySelector("tui-loader.content-loader");
        if (!mainComponent || !mainLoader) return;

        const contentObserver = new MutationObserver((mutations, observer) => {
            if (mainLoader.querySelector('table.cu-table')) {
                observer.disconnect();
                if (document.getElementById("lms-gpa-table-container")) return;
                window.cuLmsLog("[LMS GPA] Оригинальная таблица отрисована. Создаю GPA таблицу.");

                const styleId = "lms-gpa-layout-styles";
                if (!document.getElementById(styleId)) {
                    const styleSheet = document.createElement("style");
                    styleSheet.id = styleId;
                    styleSheet.innerHTML = `cu-student-performance { position: relative !important; padding-right: 304px !important; box-sizing: border-box !important; }`;
                    document.head.appendChild(styleSheet);
                }

                const gpaTableContainer = document.createElement("div");
                gpaTableContainer.id = "lms-gpa-table-container";
                const topOffset = mainLoader.offsetTop;
                gpaTableContainer.style.cssText = `position: absolute; top: ${topOffset}px; right: 24px; width: 280px;`;
                gpaTableContainer.innerHTML = `
                    <fieldset class="t-content" style="border: none; padding: 0;">
                        <table tuitable class="cu-table" data-size="m">
                           <thead><tr tuithgroup><th tuith>Метрика</th><th tuith>Значение</th></tr></thead>
                           <tbody tuitbody>
                               <tr tuitr><td tuitd class="_border-right">GPA (все)</td><td tuitd><strong id="gpa-all-value">${gpaData.all}</strong></td></tr>
                               <tr tuitr><td tuitd class="_border-right">GPA (текущие)</td><td tuitd><strong id="gpa-non-archived-value">${gpaData.nonArchived}</strong></td></tr>
                               <tr tuitr><td tuitd class="_border-right">GPA (архив)</td><td tuitd><strong id="gpa-archived-value">${gpaData.archived}</strong></td></tr>
                           </tbody>
                        </table>
                    </fieldset>`;
                mainComponent.appendChild(gpaTableContainer);
            }
        });
        contentObserver.observe(mainLoader, { childList: true, subtree: true });
    }

    // --- ФУНКЦИИ УПРАВЛЕНИЯ СОСТОЯНИЕМ ---

    async function initializeGpaModule() {
        if (isGpaInitialized) return; // Защита от повторной инициализации
        isGpaInitialized = true; // Сразу ставим флаг
        window.cuLmsLog("[LMS GPA] Инициализация модуля...");

        // Получаем данные, только если наш кэш пуст
        if (allCoursesData.length === 0) {
            allCoursesData = await fetchPerformanceData();
            if (allCoursesData.length === 0) {
                isGpaInitialized = false; // Сбрасываем флаг, если данные не пришли
                return;
            }
        }

        const archivedHrefs = await loadArchivedCourses();
        const archivedIds = archivedHrefs.map(href => parseInt(href.split('/').pop(), 10));
        const initialGpaData = {
            all: calculateGPA(allCoursesData),
            nonArchived: calculateGPA(allCoursesData.filter(c => !archivedIds.includes(c.id))),
            archived: calculateGPA(allCoursesData.filter(c => archivedIds.includes(c.id))),
        };
        
        renderInitialTable(initialGpaData);
    }

    function resetState() {
        if (!isGpaInitialized) return; // Нечего сбрасывать, если не было инициализации
        const gpaTable = document.getElementById("lms-gpa-table-container");
        if (gpaTable) gpaTable.remove();
        isGpaInitialized = false;
        window.cuLmsLog("[LMS GPA] Состояние сброшено, компонент удален со страницы.");
    }

    // --- ГЛАВНЫЙ "СТОРОЖ" И ТОЧКА ВХОДА ---

    function handleDomChanges() {
        const isOnCorrectPage = window.location.pathname === ALLOWED_PATH;
        const mainComponentExists = document.querySelector("cu-student-performance");

        if (isOnCorrectPage && mainComponentExists && !isGpaInitialized) {
            initializeGpaModule();
        } else if ((!isOnCorrectPage || !mainComponentExists) && isGpaInitialized) {
            resetState();
        }
    }

    // Устанавливаем слушатель на изменение хранилища ОДИН РАЗ
    if (!window.isGpaStorageListenerAdded) {
        browser.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'local' && changes[ARCHIVE_KEY]) {
                recalculateAndUpdateUI();
            }
        });
        window.isGpaStorageListenerAdded = true;
    }

    // Запускаем постоянное наблюдение за DOM
    const observer = new MutationObserver(handleDomChanges);
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Первоначальная проверка на случай, если скрипт загрузился после отрисовки компонента (например, при F5)
    handleDomChanges();

    window.cuLmsLog("[LMS GPA] GPA Calculator script loaded and is now observing DOM changes.");

})();