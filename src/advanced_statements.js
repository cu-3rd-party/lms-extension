// advanced_statements.js (Версия 46 - Гибкий расчет веса и количества)

(async function () {
    'use strict';

    // --- ЗАЩИТА ОТ ПОВТОРНОГО ЗАПУСКА ---
    if (window.isAdvancedStatementsInitialized) { return; }
    window.isAdvancedStatementsInitialized = true;
    // ------------------------------------

    // --- КОНФИГУРАЦИЯ ---
    const TARGET_PATH_REGEX = /^\/learn\/reports\/student-performance\/\d+\/activity$/;
    const API_URL_TEMPLATE = "https://my.centraluniversity.ru/api/micro-lms/courses/{courseId}/student-performance";
    const COURSE_INFO_URL_TEMPLATE = "https://my.centraluniversity.ru/api/micro-lms/courses/{courseId}/exercises";

    // --- НАСТРОЙКИ КУРСОВ ---
    const COURSE_DATA = {
        "архитектура компьютера и операционные системы": {
            "домашние задания": { "count": 9, "weight": 0.2 },
            "контрольная работа": { "count": 4, "weight": 0.4 },
            "экзамен": { "count": 1, "weight": 0.4 },
            "бонусная активность": { "count": 1, "weight": 0.1 }
        },
        "основы разработки на go": {
            "домашнее задания": { "count": 10, "weight": 0.2 },
            "контрольные работы": { "count": 3, "weight": 0.4 },
            "соревнование": { "count": 2, "weight": 0.4 },
            "бонусная активность": { "count": 2, "weight": 0.2 }
        },
        "базы данных": {
            "домашние задания": { "count": 4, "weight": 0.2 },
            "контрольная работа": { "count": 3, "weight": 0.4 },
            "проект": { "count": 1, "weight": 0.4 }
        },
        "алгоритмы и структуры данных i": {
            "домашние задания": { "count": 12, "weight": 0.15 },
            "семинары": { "count": 12, "weight": 0.15 },
            "контрольная работа": { "count": 2, "weight": 0.2 },
            "экзамен": { "count": 1, "weight": 0.2 },
            "коллоквиум": { "count": 1, "weight": 0.3 }
        },
        "основы мобильной разработки": {
            "аудиторная практика": { "count": 5, "weight": 0.2 },
            "домашние задания": { "count": 7, "weight": 0.2 },
            "проект": { "count": 1, "weight": 0.3 },
            "коллоквиум": { "count": 1, "weight": 0.3 }
        },
        "разработка на с++": {
            "домашние задания": { "count": 2, "weight": 0.6 },
            "проект": { "count": 1, "weight": 0.3 },
            "контрольная работа": { "count": 1, "weight": 0.1 }
        },
        "введение в экономику. основной уровень": {
            "домашние задания": { "count": 14, "weight": 0.25 },
            "аудиторная работа": { "count": 1, "weight": 0.1 },
            "мини-контрольные": { "count": 7, "weight": 0.15 },
            "контрольная работа 1": { "count": 1, "weight": 0.25 },
            "экзамен": { "count": 1, "weight": 0.25 }
        },
        "основы бизнес-аналитики. основной уровень": {
            "аудиторная работа": { "count": 1, "weight": 0.1 },
            "домашние задания": { "count": 12, "weight": 0.25 },
            "групповой проект": { "count": 1, "weight": 0.2 },
            "контрольная работа": { "count": 1, "weight": 0.15 },
            "экзамен": { "count": 1, "weight": 0.3 }
        },
        "микроэкономика i. основной уровень": {
            "домашние задания": { "count": 13, "weight": 0.1 },
            "самостоятельные работы": { "count": 7, "weight": 0.15 },
            "контрольная работа": { "count": 1, "weight": 0.25 },
            "аудиторная работа": { "count": 19, "weight": 0.15 },
            "экзамен": { "count": 1, "weight": 0.35 }
        },
        "продуктовая аналитика": {
            "домашние задания": { "count": 13, "weight": 0.3 },
            "аудиторная работа": { "count": 15, "weight": 0.2 },
            "контрольная работа": { "count": 1, "weight": 0.2 },
            "экзамен": { "count": 1, "weight": 0.3 }
        },
        "продуктовый менеджмент": {
            "домашние задания": { "count": 13, "weight": 0.3 },
            "аудиторная работа": { "count": 9, "weight": 0.1 },
            "квизы": { "count": 5, "weight": 0.15 },
            "буткемп (кейс-чемпионат)": { "count": 1, "weight": 0.15 },
            "экзамен": { "count": 1, "weight": 0.3 }
        },
        "введение в экономику. продвинутый уровень": {
            "домашние задания": { "count": 13, "weight": 0.2 },
            "аудиторная работа": { "count": 1, "weight": 0.15 },
            "финальный проект": { "count": 1, "weight": 0.15 },
            "дополнительная контрольная работа 1": { "count": 1, "weight": 0.25 },
            "дополнительная контрольная работа 2": { "count": 1, "weight": 0.25 }
        },
        "основы бизнес-аналитики. продвинутый уровень": {
            "аудиторная работа": { "count": 1, "weight": 0.3 },
            "домашние задания": { "count": 12, "weight": 0.4 },
            "кейс-чемпионат": { "count": 1, "weight": 0.3 }
        },
        "микроэкономика i. продвинутый уровень": {
            "домашние задания": { "count": 13, "weight": 0.2 },
            "самостоятельная работа": { "count": 4, "weight": 0.4 },
            "аудиторная работа": { "count": 14, "weight": 0.15 },
            "проект": { "count": 1, "weight": 0.25 }
        },
        "введение в статистику. основной уровень": {
            "домашние задания": { "count": 14, "weight": 0.15 },
            "кейсы": { "count": 4, "weight": 0.2 },
            "коллоквиум": { "count": 1, "weight": 0.15 },
            "контрольные работы": { "count": 2, "weight": 0.2 },
            "экзамен": { "count": 1, "weight": 0.3 }
        },
        "основы математического анализа и линейной алгебры": {
            "домашние задания": { "count": 15, "weight": 0.2 },
            "контест": { "count": 11, "weight": 0.2 },
            "проект": { "count": 1, "weight": 0.1 },
            "контрольная работа": { "count": 4, "weight": 0.2 },
            "экзамен": { "count": 1, "weight": 0.3 }
        },
        "линейная алгебра и геометрия": {
            "домашние задания": { "count": 14, "weight": 0.1 },
            "аудиторная работа": { "count": 3, "weight": 0.15 },
            "контрольная работа": { "count": 1, "weight": 0.2 },
            "коллоквиум": { "count": 1, "weight": 0.2 },
            "экзамен": { "count": 1, "weight": 0.35 }
        },
        "математический анализ. пилотный поток": {
            "домашние задания": { "count": 14, "weight": 0.2 },
            "контрольная работа": { "count": 2, "weight": 0.3 },
            "коллоквиум": { "count": 1, "weight": 0.15 },
            "экзамен": { "count": 1, "weight": 0.35 }
        },
        "дифференциальные уравнения": {
            "домашние задания": { "count": 14, "weight": 0.2 },
            "активность на семинарах": { "count": 14, "weight": 0.15 },
            "контрольная работа": { "count": 2, "weight": 0.3 },
            "итоговая работа": { "count": 1, "weight": 0.35 }
        },
        "математический анализ. продвинутый уровень": {
            "домашние задания": { "count": 14, "weight": 0.2 },
            "контрольная работа": { "count": 3, "weight": 0.3 },
            "коллоквиум": { "count": 1, "weight": 0.15 },
            "итоговая работа": { "count": 1, "weight": 0.35 }
        },
        "дифференциальная геометрия": {
            "домашние задания": { "count": 14, "weight": 0.2 },
            "активность на семинарах": { "count": 1, "weight": 0.15 },
            "контрольная работа": { "count": 1, "weight": 0.3 },
            "итоговая работа": { "count": 1, "weight": 0.35 }
        },
        "stem и проблемы энергетики и пищевой индустрии": {
            "аудиторная работа (лекции)": { "count": 8, "weight": 0.08 },
            "аудиторная работа (семинары)": { "count": 13, "weight": 0.34 },
            "домашние задания": { "count": 8, "weight": 0.28 },
            "выполнение кейсов": { "count": 2, "weight": 0.15 },
            "защита кейсов": { "count": 2, "weight": 0.15 }
        },
        "командная работа по agile": {
            "активность на занятиях": { "count": 14, "weight": 0.6 },
            "итоговый проект": { "count": 1, "weight": 0.4 }
        },
        "инициативность и управление изменениями": {
            "активность на занятиях": { "count": 14, "weight": 0.6 },
            "итоговый проект": { "count": 1, "weight": 0.4 }
        },
        "стресс-менеджмент и эмоциональный интеллект": {
            "активность на занятиях": { "count": 14, "weight": 0.6 },
            "итоговый проект": { "count": 1, "weight": 0.4 }
        },
        "креативные техники решения задач": {
            "активность на занятиях": { "count": 14, "weight": 0.6 },
            "итоговый проект": { "count": 1, "weight": 0.4 }
        },
        "использование данных в принятии решений": {
            "активность на занятиях": { "count": 14, "weight": 0.6 },
            "итоговый проект": { "count": 1, "weight": 0.4 }
        },
        "английский язык 1": {
            "домашние задания": { "count": 13, "weight": 0.2 },
            "аудиторная работа": { "count": 28, "weight": 0.25 },
            "контрольная работа": { "count": 1, "weight": 0.15 },
            "зачёт с оценкой": { "count": 1, "weight": 0.4 }
        },
        "разработка на python. основной": {
            "контест": { "count": 2, "weight": 0.2 },
            "проект 1": { "count": 1, "weight": 0.15 },
            "проект 2": { "count": 1, "weight": 0.15 },
            "проект 3": { "count": 1, "weight": 0.2 },
            "коллоквиум": { "count": 2, "weight": 0.3 },
            "бонусная активность": { "count": 13, "weight": 0.2 }
        },
        "разработка на python. углублённый": {
            "проект 1": { "count": 1, "weight": 0.05 },
            "проект 2": { "count": 1, "weight": 0.1 },
            "проект 3": { "count": 1, "weight": 0.1 },
            "проект 4": { "count": 1, "weight": 0.1 },
            "проект 5": { "count": 1, "weight": 0.15 },
            "проект 6": { "count": 1, "weight": 0.2 },
            "коллоквиум": { "count": 2, "weight": 0.3 },
            "бонусная активность": { "count": 12, "weight": 0.2 }
        },
        "разработка на python. профессиональный": {
            "проект 1": { "count": 1, "weight": 0.05 },
            "проект 2": { "count": 1, "weight": 0.1 },
            "проект 3": { "count": 1, "weight": 0.1 },
            "проект 4": { "count": 1, "weight": 0.1 },
            "проект 5": { "count": 1, "weight": 0.15 },
            "проект 6": { "count": 1, "weight": 0.2 },
            "коллоквиум": { "count": 2, "weight": 0.3 },
            "бонусная активность": { "count": 12, "weight": 0.2 }
        },
        "алгоритмы и структуры данных. продвинутый уровень": {
            "домашние задания": { "count": 8, "weight": 0.3 },
            "коллоквиум": { "count": 1, "weight": 0.4 },
            "экзамен": { "count": 1, "weight": 0.3 },
            "очная практика (бонусные баллы)": { "count": 7, "weight": 0.2 }
        },
        "основы финансов": {
            "домашние задания": { "count": 11, "weight": 0.25 },
            "контрольная работа": { "count": 1, "weight": 0.2 },
            "аудиторная работа": { "count": 1, "weight": 0.15 },
            "командный проект": { "count": 1, "weight": 0.2 },
            "экзамен": { "count": 1, "weight": 0.2 }
        },
        "математика для экономистов": {
            "домашние задания": { "count": 14, "weight": 0.2 },
            "квизы": { "count": 10, "weight": 0.2 },
            "контрольная работа": { "count": 1, "weight": 0.25 },
            "экзамен": { "count": 1, "weight": 0.35 }
        },
        "основы финансовой и управленческой отчётности": {
            "домашние задания": { "count": 12, "weight": 0.2 },
            "аудиторная работа": { "count": 21, "weight": 0.2 },
            "контрольная работа": { "count": 1, "weight": 0.2 },
            "кейс": { "count": 1, "weight": 0.1 },
            "экзамен": { "count": 1, "weight": 0.3 }
        },
        "введение в микроструктуру рынков (introduction to market microstructure)": {
            "аудиторная работа": { "count": 1, "weight": 0.1 },
            "защита проекта в рамках семинаров": { "count": 6, "weight": 0.4 },
            "зачёт": { "count": 1, "weight": 0.5 }
        },
        "machine learning": {
            "домашние задания": { "count": 8, "weight": 0.35 },
            "соревнование": { "count": 1, "weight": 0.25 },
            "проект": { "count": 1, "weight": 0.25 },
            "экзамен": { "count": 1, "weight": 0.2 }
        },
        "теория вероятностей и математическая статистика": {
            "домашние задания": { "count": 14, "weight": 0.2 },
            "активность на семинарах": { "count": 8, "weight": 0.15 },
            "контрольная работа": { "count": 2, "weight": 0.3 },
            "экзамен": { "count": 1, "weight": 0.35 },
            "бонусная активность": { "count": 15, "weight": 0.15 }
        },
        "методы выпуклой оптимизации. поток 1": {
            "домашние задания": { "count": 13, "weight": 0.25 },
            "аудиторная работа": { "count": 13, "weight": 0.1 },
            "контрольная работа": { "count": 2, "weight": 0.4 },
            "экзамен": { "count": 1, "weight": 0.35 }
        },
        "методы выпуклой оптимизации. поток 2": {
            "домашние задания": { "count": 12, "weight": 0.25 },
            "аудиторная работа": { "count": 12, "weight": 0.1 },
            "контрольная работа": { "count": 2, "weight": 0.4 },
            "экзамен": { "count": 1, "weight": 0.35 }
        },
        "линейная алгебра и геометрия. пилотный поток": {
            "домашние задания": { "count": 14, "weight": 0.1 },
            "индивидуальное домашнее задание": { "count": 2, "weight": 0.15 },
            "контрольная работа": { "count": 1, "weight": 0.2 },
            "коллоквиум": { "count": 1, "weight": 0.2 },
            "экзамен": { "count": 1, "weight": 0.35 }
        },
        "математический анализ. основной уровень": {
            "домашние задания": { "count": 14, "weight": 0.2 },
            "контрольная работа": { "count": 3, "weight": 0.3 },
            "коллоквиум": { "count": 1, "weight": 0.15 },
            "экзамен": { "count": 1, "weight": 0.35 }
        },
        "формальная верификация на lean": {
            "домашние задания": { "count": 12, "weight": 1.0 },
            "бонусные задания": { "count": 12, "weight": 0.15 }
        },
        "stem: искусство и наука": {
            "проект 1": { "count": 1, "weight": 0.15 },
            "проект 2": { "count": 1, "weight": 0.15 },
            "домашние задания": { "count": 6, "weight": 0.3 },
            "проект 3": { "count": 1, "weight": 0.2 },
            "аудиторная работа": { "count": 15, "weight": 0.2 }
        },
        "stem: философия и наука": {
            "аудиторная работа": { "count": 15, "weight": 0.2 },
            "домашние задания": { "count": 9, "weight": 0.2 },
            "итоговый проект": { "count": 1, "weight": 0.6 }
        },
        "бизнес-студия": {
            "домашние задания": { "count": 12, "weight": 0.6 },
            "групповой проект": { "count": 3, "weight": 0.4 }
        },
        "научная студия": {
            "домашние задания": { "count": 10, "weight": 0.3 },
            "аудиторная работа": { "count": 10, "weight": 0.1 },
            "отчёт": { "count": 1, "weight": 0.4 },
            "хакатон": { "count": 1, "weight": 0.2 }
        },
        "прикладные социальные науки": {
            "дз": { "count": 7, "weight": 0.5 }
        },
        "основы вычислительных систем": {
            "практическая работа": { "count": 11, "weight": 0.6 },
            "теоретическая работа": { "count": 7, "weight": 0.2 },
            "аудиторная работа": { "count": 11, "weight": 0.2 }
        },
        "квантовые технологии в действии": {
            "лабораторная работа": { "count": 1, "weight": 0.4 },
            "домашние задания": { "count": 6, "weight": 0.2 },
            "перевёрнутый класс": { "count": 2, "weight": 0.05 },
            "контрольная работа": { "count": 1, "weight": 0.2 },
            "бонусная активность (по желанию)": { "count": 3, "weight": 0.12 }
        },
        "нейронауки и нейроинтерфейсы": {
            "практическая часть (домашние задания)": { "count": 6, "weight": 0.6 },
            "аудиторная работа (проектная работа)": { "count": 1, "weight": 0.2 },
            "теоретическая часть (тесты)": { "count": 9, "weight": 0.2 }
        },
        "английский язык 2": {
            "домашние задания": { "count": 14, "weight": 0.2 },
            "аудиторная работа": { "count": 28, "weight": 0.25 },
            "контрольная работа": { "count": 1, "weight": 0.15 },
            "экзамен": { "count": 1, "weight": 0.4 }
        },
        "основы sql": {
            "аудиторная работа": { "count": 0, "weight": 0.3 },
            "тренажёр": { "count": 0, "weight": 0.2 },
            "промежуточный контроль": { "count": 0, "weight": 0.2 },
            "зачёт с оценкой": { "count": 0, "weight": 0.3 },
            "бонусная активность": { "count": 0, "weight": 0.1 }
        },
        "введение в статистику. продвинутый уровень": {
            "домашние задания": { "count": 14, "weight": 0 },
            "кейсы": { "count": 4, "weight": 0 },
            "коллоквиум": { "count": 1, "weight": 0 },
            "контрольные работы": { "count": 2, "weight": 0 },
            "итоговая работа": { "count": 1, "weight": 0 }
        },
        "математические основания теории вероятностей": {
            "тест": { "count": 5, "weight": 0 },
            "домашние задания": { "count": 14, "weight": 0 }
        },
        "студия компьютерных наук": {
            "домашние задания": { "count": 0, "weight": 0.25 },
            "аудиторная работа": { "count": 0, "weight": 0.15 },
            "контрольная работа (midterm)": { "count": 0, "weight": 0.3 },
            "контрольная работа (final)": { "count": 0, "weight": 0.3 }
        },
        "инновации: от идеи к решению": {
            "пасхалка: в хендбуке мало что сказано": { "count": 0, "weight": 0 }
        },
        "основы российской государственности": {
            "домашнее задание": { "count": 4, "weight": 0.25 },
            "аудиторная работа": { "count": 11, "weight": 0.25 },
            "проект": { "count": 1, "weight": 0.5 }
        }
    };

    // --- СЕЛЕКТОРЫ И ID ---
    const CONTAINER_ID = "advanced-statements-container";
    const PARENT_COMPONENT_SELECTOR = "cu-student-course-performance";
    const LOADER_SELECTOR = "cu-student-activity-performance-table tui-loader.content-loader";
    const ORIGINAL_TABLE_SELECTOR = "table.cu-table";
    const STYLE_ID = "adv-statements-layout-styles";

    let isInitialized = false;

    // --- ЛОГИКА НЕЧЕТКОГО ПОИСКА ---

    function levenshteinDistance(s1, s2) {
        s1 = s1.toLowerCase();
        s2 = s2.toLowerCase();
        const costs = [];
        for (let i = 0; i <= s1.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= s2.length; j++) {
                if (i === 0) {
                    costs[j] = j;
                } else {
                    if (j > 0) {
                        let newValue = costs[j - 1];
                        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                        }
                        costs[j - 1] = lastValue;
                        lastValue = newValue;
                    }
                }
            }
            if (i > 0) costs[s2.length] = lastValue;
        }
        return costs[s2.length];
    }

    function calculateSimilarity(s1, s2) {
        let longer = s1;
        let shorter = s2;
        if (s1.length < s2.length) {
            longer = s2;
            shorter = s1;
        }
        const longerLength = longer.length;
        if (longerLength === 0) {
            return 1.0;
        }
        return (longerLength - levenshteinDistance(longer, shorter)) / parseFloat(longerLength);
    }

    // --- ФИНАЛЬНАЯ ВЕРСИЯ ФУНКЦИИ ПОИСКА ---
    function findBestCourseMatch(apiCourseName, courseData) {
        if (!apiCourseName) return null;

        const apiNameLower = apiCourseName.toLowerCase().trim();

        // 1. Поиск точного совпадения (самый надежный)
        for (const key in courseData) {
            if (key.toLowerCase().trim() === apiNameLower) {
                console.log(`[Adv. Statements] Найдено точное соответствие для курса: "${apiCourseName}"`);
                return courseData[key];
            }
        }

        // 2. Поиск по префиксу (для случаев "Курс. Подзаголовок")
        let bestPrefixMatch = null;
        let longestPrefix = 0;
        for (const key in courseData) {
            const keyLower = key.toLowerCase().trim();
            if (apiNameLower.startsWith(keyLower) && keyLower.length > longestPrefix) {
                 bestPrefixMatch = key;
                 longestPrefix = keyLower.length;
            }
        }
        if (bestPrefixMatch) {
            console.log(`[Adv. Statements] Найдено соответствие по префиксу для "${apiCourseName}": "${bestPrefixMatch}"`);
            return courseData[bestPrefixMatch];
        }

        // 3. Поиск по схожести (для опечаток)
        let bestSimilarityMatch = null;
        let maxScore = 0.0;
        for (const key in courseData) {
            const keyLower = key.toLowerCase().trim();
            const score = calculateSimilarity(apiNameLower, keyLower);
            if (score > maxScore) {
                maxScore = score;
                bestSimilarityMatch = key;
            }
        }
        if (maxScore > 0.8) {
            console.log(`[Adv. Statements] Найдено соответствие по схожести для "${apiCourseName}": "${bestSimilarityMatch}" (схожесть: ${maxScore.toFixed(2)})`);
            return courseData[bestSimilarityMatch];
        }
        
        // 4. Очистка номера группы (для случаев "Курс_3")
        const processedApiName = apiNameLower.replace(/(?:\s+|\.|_)(?:поток|группа|group|stream)?\s*\d+$/, '').trim();
        if (processedApiName !== apiNameLower) {
             for (const key in courseData) {
                if (key.toLowerCase().trim() === processedApiName) {
                    console.log(`[Adv. Statements] Найдено соответствие после очистки номера группы для "${apiCourseName}": "${key}"`);
                    return courseData[key];
                }
            }
        }

        console.warn(`[Adv. Statements] Не найдена конфигурация для курса "${apiCourseName}". Наивысшая схожесть: ${maxScore.toFixed(2)} с "${bestSimilarityMatch}"`);
        return null;
    }


    // --- ОСНОВНАЯ ЛОГИКА ---

    async function initializeModule() {
        if (isInitialized) return;
        isInitialized = true;
        console.log("[Adv. Statements] Инициализация модуля...");

        const parentComponent = document.querySelector(PARENT_COMPONENT_SELECTOR);
        const loaderElement = document.querySelector(LOADER_SELECTOR);
        if (!parentComponent || !loaderElement) { console.error("[Adv. Statements] Не найдены базовые компоненты страницы."); isInitialized = false; return; }

        const contentObserver = new MutationObserver(async (mutations, observer) => {
            if (loaderElement.querySelector(ORIGINAL_TABLE_SELECTOR)) {
                observer.disconnect();
                if (document.getElementById(CONTAINER_ID)) return;

                try {
                    const { endOfCourseCalcEnabled } = await browser.storage.sync.get('endOfCourseCalcEnabled');
                    const calculationMode = endOfCourseCalcEnabled ? 'endOfCourse' : 'current';
                    const courseId = getCourseId();
                    const courseName = await fetchCourseName(courseId);
                    const courseConfig = findBestCourseMatch(courseName, COURSE_DATA);

                    if (courseName && !courseConfig && calculationMode === 'endOfCourse') {
                        console.warn(`[Adv. Statements] Конфигурация для этого курса не найдена. Проверьте ключ в COURSE_DATA.`);
                    }

                    const tasks = await fetchPerformanceData(courseId);
                    const calculatedData = calculateScores(tasks, courseConfig, calculationMode);
                    renderSidebar(calculatedData, parentComponent, loaderElement, calculationMode);

                } catch (error) {
                    console.error("[Adv. Statements] Критическая ошибка в initializeModule:", error);
                    isInitialized = false;
                }
            }
        });
        contentObserver.observe(loaderElement, { childList: true, subtree: true });
    }

    // Новая, улучшенная версия функции calculateScores
    function calculateScores(tasks, courseConfig, mode) {
        const activities = new Map();

        tasks.forEach(task => {
            if (!task.activity) return;
            const nameLower = task.activity.name.trim().toLowerCase();
            if (!activities.has(nameLower)) {
                // Сохраняем вес из API по умолчанию
                activities.set(nameLower, { name: task.activity.name, weight: task.activity.weight, scores: [], sum: 0, });
            }
            if (task.score !== null) {
                const activity = activities.get(nameLower);
                activity.scores.push(task.score);
                activity.sum += task.score;
            }
        });

        const finalActivities = new Map();
        const apiActivityNames = Array.from(activities.keys());

        if (mode === 'endOfCourse' && courseConfig) {
            for (const configName in courseConfig) {
                const configNameLower = configName.toLowerCase();
                let bestMatchName = null;
                let maxScore = 0.0;
                apiActivityNames.forEach(apiName => {
                    const score = calculateSimilarity(configNameLower, apiName);
                    if (score > maxScore) {
                        maxScore = score;
                        bestMatchName = apiName;
                    }
                });
                if (bestMatchName && maxScore > 0.7) {
                    finalActivities.set(configNameLower, activities.get(bestMatchName));
                } else {
                    const displayName = configName.charAt(0).toUpperCase() + configName.slice(1);
                    finalActivities.set(configNameLower, { name: displayName, weight: courseConfig[configName].weight, scores: [], sum: 0, });
                }
            }
        } else {
            activities.forEach((value, key) => finalActivities.set(key, value));
        }

        const calculatedActivities = [];
        let totalWeightedScore = 0;
        let totalWeight = 0;

        for (const [nameLower, data] of finalActivities.entries()) {
            let activityConfig = null;
            if (courseConfig) {
                let bestMatchKey = null;
                let maxScore = 0.0;
                for (const configKey in courseConfig) {
                    const score = calculateSimilarity(nameLower, configKey.toLowerCase().trim());
                    if (score > maxScore) {
                        maxScore = score;
                        bestMatchKey = configKey;
                    }
                }
                if (maxScore > 0.7) {
                    activityConfig = courseConfig[bestMatchKey];
                }
            }
            
            // --- НОВАЯ УМНАЯ ЛОГИКА ОПРЕДЕЛЕНИЯ ВЕСА И КОЛИЧЕСТВА ---

            const actualCount = data.scores.length; // Количество сданных работ из API
            let divisor;
            let countDisplay;
            let finalWeight = data.weight; // Вес из API по умолчанию

            // 1. Определяем итоговый ВЕС (weight)
            // Если в конфиге есть вес и он больше нуля, он имеет приоритет.
            if (activityConfig && activityConfig.weight > 0) {
                finalWeight = activityConfig.weight;
            }

            // 2. Определяем итоговый ДЕЛИТЕЛЬ (divisor) для среднего балла
            if (mode === 'endOfCourse' && activityConfig && activityConfig.count > 0) {
                // Если включен режим "на конец курса" и в конфиге указано ненулевое число работ, используем его.
                divisor = activityConfig.count;
                countDisplay = `${actualCount} / ${activityConfig.count}`;
            } else {
                // Во всех остальных случаях (режим "текущий" или count в конфиге = 0),
                // используем реальное количество сданных работ.
                divisor = actualCount;
                countDisplay = `${actualCount}`;
            }
            
            // --- КОНЕЦ НОВОЙ ЛОГИКИ ---

            const avg = (divisor > 0) ? (data.sum / divisor) : 0;
            const weightedScore = avg * finalWeight;

            calculatedActivities.push({
                name: data.name,
                averageScore: avg.toFixed(2),
                weight: finalWeight,
                weightedScore: weightedScore.toFixed(2),
                countDisplay: countDisplay,
            });
            totalWeightedScore += weightedScore;
            totalWeight += finalWeight;
        }

        return {
            activities: calculatedActivities.sort((a, b) => a.name.localeCompare(b.name)),
            totalWeightedScore: totalWeightedScore.toFixed(2),
            totalWeight: totalWeight,
        };
    }

    // --- ВСПОМОГАТЕЛЬНЫЕ И СЛУЖЕБНЫЕ ФУНКЦИИ ---

    function getCourseId() { const match = window.location.pathname.match(/student-performance\/(\d+)/); return match ? match[1] : null; }

    async function fetchCourseName(courseId) {
        if (!courseId) return null;
        const apiUrl = COURSE_INFO_URL_TEMPLATE.replace('{courseId}', courseId);
        try {
            const response = await fetch(apiUrl);
            if (!response.ok) return null;
            const data = await response.json();
            return data.name ? data.name.trim() : null;
        } catch (error) {
            console.error("[Adv. Statements] Ошибка при получении имени курса:", error);
            return null;
        }
    }

    async function fetchPerformanceData(courseId) { if (!courseId) return []; const apiUrl = API_URL_TEMPLATE.replace('{courseId}', courseId); try { const response = await fetch(apiUrl); if (!response.ok) throw new Error(`HTTP Error! Status: ${response.status}`); const data = await response.json(); return data.tasks || []; } catch (error) { console.error("[Adv. Statements] API Error:", error); return []; } }

    function resetState() {
        if (!isInitialized) return;
        const component = document.getElementById(CONTAINER_ID);
        if (component) component.remove();
        const styleSheet = document.getElementById(STYLE_ID);
        if (styleSheet) styleSheet.remove();
        isInitialized = false;
        window.isAdvancedStatementsInitialized = false;
    }

    function renderSidebar(data, parentComponent, loaderElement, calculationMode) {
        if (document.getElementById(CONTAINER_ID)) document.getElementById(CONTAINER_ID).remove();
        if (!document.getElementById(STYLE_ID)) {
            const styleSheet = document.createElement("style");
            styleSheet.id = STYLE_ID;
            styleSheet.innerHTML = `
                ${PARENT_COMPONENT_SELECTOR} { 
                    position: relative !important; 
                    padding-right: 580px !important; 
                    box-sizing: border-box !important; 
                } 
                .adv-table-count-col { 
                    text-align: center; 
                    width: 80px; 
                }
                #${CONTAINER_ID} .cu-table th.adv-table-count-col,
                #${CONTAINER_ID} .cu-table td.adv-table-count-col {
                    border-right: 1px solid rgba(255, 255, 255, 0.12);
                }
            `.replace(/\s\s+/g, ' ').trim();
            document.head.appendChild(styleSheet);
        }

        const originalTable = loaderElement.querySelector(ORIGINAL_TABLE_SELECTOR);
        const rowTemplate = originalTable.querySelector('tbody tr');
        if (!originalTable || !rowTemplate) { console.error("[Adv. Statements] Не удалось найти оригинальную таблицу или шаблон строки."); return; }

        const clonedTable = originalTable.cloneNode(true);
        clonedTable.querySelectorAll('thead th cu-tooltip').forEach(tip => tip.remove());
        
        const headerRow = clonedTable.querySelector('thead tr');
        const firstHeaderCell = headerRow.querySelector('th');
        if (firstHeaderCell) {
            const newHeaderCell = document.createElement('th');
            newHeaderCell.textContent = 'Количество';
            newHeaderCell.classList.add('adv-table-count-col');
            firstHeaderCell.insertAdjacentElement('afterend', newHeaderCell);
        }

        const tbody = clonedTable.querySelector('tbody');
        tbody.innerHTML = '';
        data.activities.forEach(act => {
            const newRow = rowTemplate.cloneNode(true);
            const firstCell = newRow.querySelector('td');
            if (firstCell) {
                const countCell = document.createElement('td');
                countCell.textContent = act.countDisplay;
                countCell.classList.add('adv-table-count-col');
                firstCell.insertAdjacentElement('afterend', countCell);
            }

            newRow.querySelector('.column-activity').textContent = act.name;
            newRow.querySelector('.column-average-score .signed-cell__average-score').textContent = act.averageScore;
            newRow.querySelector('.column-weight .signed-cell > span').textContent = `${Math.round(act.weight * 100)}%`;
            newRow.querySelector('.column-total > span').textContent = act.weightedScore;
            tbody.appendChild(newRow);
        });
        
        const footerRow = clonedTable.querySelector('tfoot tr');
        const firstFooterCell = footerRow.querySelector('td');
        if (firstFooterCell) {
            const emptyFooterCell = document.createElement('td');
            firstFooterCell.insertAdjacentElement('afterend', emptyFooterCell);
        }

        const footerCells = clonedTable.querySelectorAll('tfoot td');
        if (footerCells.length === 5) {
            footerCells[0].innerHTML = `<span cutext="s-bold" class="font-text-s-bold">Итог</span>`;
            footerCells[3].textContent = `${Math.round(data.totalWeight * 100)}%`;
            footerCells[4].querySelector('span').textContent = data.totalWeightedScore;
        }

        const container = document.createElement("div");
        container.id = CONTAINER_ID;
        const topOffset = loaderElement.offsetTop;
        container.style.cssText = `position: absolute; top: ${topOffset}px; right: 24px; width: 540px;`;
        const explanation = calculationMode === 'endOfCourse' ? 'Средний балл вычисляется по <b>всем</b> заданиям, запланированным в курсе (согласно настройкам плагина). Задания без оценки учитываются как 0.' : 'Средний балл вычисляется только по тем заданиям, где <b>уже выставлена оценка</b> (включая 0). Задания без оценки не учитываются.';
        container.innerHTML = `<fieldset class="t-content" style="border: none; padding: 0;"></fieldset><p style="font-size: 12px; color: #888; margin-top: 10px; line-height: 1.5;"><b>Принцип расчёта этой таблицы (справа):</b><br>${explanation}<br><br><b>Принцип расчёта ведомости LMS (слева):</b><br>Средний балл считается по <b>всем открытым</b> заданиям в рамках одной активности. Задания, по которым ещё не выставлена оценка, <b>учитываются в расчёте как 0.</b></p>`;
        container.querySelector('fieldset').appendChild(clonedTable);
        parentComponent.appendChild(container);
        console.log(`[Adv. Statements] Боковая панель отрисована в режиме: ${calculationMode}.`);
    }

    function handleLocationChange() { const isOnCorrectPage = TARGET_PATH_REGEX.test(window.location.pathname); const componentExists = document.querySelector(PARENT_COMPONENT_SELECTOR); if (isOnCorrectPage && componentExists && !isInitialized) { initializeModule(); } else if ((!isOnCorrectPage || !componentExists) && isInitialized) { resetState(); } }
    const navigationObserver = new MutationObserver(handleLocationChange);
    navigationObserver.observe(document.body, { childList: true, subtree: true });
    handleLocationChange();
    console.log("[Adv. Statements] Скрипт загружен и готов к работе.");

})();