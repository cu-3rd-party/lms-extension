async function viewFutureExams() {
    const schedule = {
      "Основы математического анализа и линейной алгебры (MiA)": [
        { name: "Контест 1", weight: "10%", date: "08 09" },
        { name: "Контест 2", weight: "10%", date: "15 09" },
        { name: "Контест 3", weight: "10%", date: "22 09" },
        { name: "Контест 4", weight: "10%", date: "29 09" },
        { name: "Контрольная работа №1", weight: "10%", date: "06 10" },
        { name: "Контест 5", weight: "10%", date: "13 10" },
        { name: "Контест 6", weight: "10%", date: "20 10" },
        { name: "Контест 7", weight: "10%", date: "27 10" },
        { name: "Контест 8", weight: "10%", date: "03 11" },
        { name: "Контрольная работа №2 (устный формат)", weight: "10%", date: "10 11" },
        { name: "Контест 9", weight: "10%", date: "17 11" },
        { name: "Контрольная работа №3", weight: "10%", date: "24 11" },
        { name: "Контест 10", weight: "10%", date: "01 12" },
        { name: "Контест 11", weight: "10%", date: "08 12" },
        { name: "Контрольная работа №4", weight: "10%", date: "15 12" }
      ],
      "Разработка на Python. Профессиональный": [
        { name: "Проект 1", weight: "10%", date: "15 09" },
        { name: "Проект 2", weight: "10%", date: "06 10" },
        { name: "Проект 3", weight: "10%", date: "20 10" },
        { name: "Коллоквиум", weight: "10%", date: "20 10" },
        { name: "Проект 4", weight: "10%", date: "03 11" },
        { name: "Проект 5", weight: "10%", date: "17 11" },
        { name: "Проект 6", weight: "10%", date: "08 12" },
        { name: "Коллоквиум", weight: "10%", date: "08 12" }
      ],
      "Разработка на Python. Углубленный": [
        { name: "Проект 1", weight: "10%", date: "22 09" },
        { name: "Проект 2", weight: "10%", date: "06 10" },
        { name: "Проект 3", weight: "10%", date: "20 10" },
        { name: "Коллоквиум", weight: "10%", date: "20 10" },
        { name: "Проект 4", weight: "10%", date: "03 11" },
        { name: "Проект 5", weight: "10%", date: "17 11" },
        { name: "Проект 6", weight: "10%", date: "08 12" },
        { name: "Коллоквиум", weight: "10%", date: "08 12" }
      ],
      "Разработка на Python. Основной": [
        { name: "Контест 1", weight: "10%", date: "22 09" },
        { name: "Контест 2", weight: "10%", date: "20 10" },
        { name: "Коллоквиум", weight: "10%", date: "27 10" },
        { name: "Контест 3", weight: "10%", date: "17 11" },
        { name: "Проект", weight: "10%", date: "01 12" },
        { name: "Проект 2", weight: "10%", date: "15 12" },
        { name: "Коллоквиум", weight: "10%", date: "15 12" }
      ],
      "Линейная алгебра и геометрия": [
        { name: "Индивидуальная самостоятельная работа 1", weight: "10%", date: "22 09" },
        { name: "Индивидуальная самостоятельная работа 2", weight: "10%", date: "20 10" },
        { name: "Индивидуальная самостоятельная работа 3", weight: "10%", date: "10 11" },
        { name: "Коллоквиум", weight: "10%", date: "24 11" },
        { name: "Контрольная работа №1", weight: "10%", date: "01 12" }
      ],
      "Математический анализ": [
        { name: "Контрольная работа №1", weight: "10%", date: "06 10" },
        { name: "Коллоквиум", weight: "10%", date: "27 10" },
        { name: "Контрольная работа №2", weight: "10%", date: "17 11" },
        { name: "Контрольная работа №3", weight: "10%", date: "08 12" }
      ],
      "Математический анализ. Продвинутый уровень": [
        { name: "Контрольная работа №1", weight: "10%", date: "06 10" },
        { name: "Коллоквиум", weight: "10%", date: "27 10" },
        { name: "Контрольная работа №2", weight: "10%", date: "17 11" },
        { name: "Контрольная работа №3", weight: "10%", date: "08 12" }
      ],
      "Математический анализ. Пилотный поток": [
        { name: "Контрольная работа №1", weight: "10%", date: "27 10" },
        { name: "Коллоквиум", weight: "10%", date: "17 11" },
        { name: "Контрольная работа №2", weight: "10%", date: "24 11" }
      ],
      "Введение в статистику": [
        { name: "Письменный коллоквиум", weight: "10%", date: "13 10" },
        { name: "Контрольная работа №1", weight: "10%", date: "27 10" },
        { name: "Контрольная работа №2", weight: "10%", date: "08 12" }
      ],
      "Введение в статистику. Продвинутый уровень": [
        { name: "Письменный коллоквиум", weight: "10%", date: "29 09" },
        { name: "Контрольная работа №1", weight: "10%", date: "27 10" },
        { name: "Контрольная работа №2", weight: "10%", date: "01 12" }
      ],
      "Введение в экономику": [
        { name: "Мини-контрольная 1", weight: "10%", date: "22 09" },
        { name: "Мини-контрольная 2", weight: "10%", date: "29 09" },
        { name: "Мини-контрольная 3", weight: "10%", date: "13 10" },
        { name: "Мини-контрольная 4", weight: "10%", date: "20 10" },
        { name: "Контрольная работа №1", weight: "10%", date: "03 11" },
        { name: "Мини-контрольная 5", weight: "10%", date: "17 11" },
        { name: "Мини-контрольная 5", weight: "10%", date: "01 12" },
        { name: "Мини-контрольная 6", weight: "10%", date: "15 12" }
      ],
      "Введение в экономику. Продвинутый уровень": [
        { name: "Контрольная работа №1", weight: "10%", date: "03 11" }
      ],
      "Основы бизнес-аналитики": [
        { name: "Бизнес-игра", weight: "10%", date: "20 10" },
        { name: "Контрольная работа", weight: "10%", date: "20 10" },
        { name: "Сдача проекта", weight: "10%", date: "15 12" }
      ],
      "Основы бизнес-аналитики. Продвинутый уровень": [
        { name: "Сдача проекта", weight: "10%", date: "08 12" },
        { name: "Кейс-чемпионат", weight: "10%", date: "15 12" }
      ],
      "Линейная алгебра. Пилотный поток": [
        { name: "Контрольная работа", weight: "10%", date: "10 11" },
        { name: "Коллоквиум", weight: "10%", date: "01 12" }
      ],
      "Бизнес-студия": [
        { name: "Защита проекта 1", weight: "10%", date: "29 09" },
        { name: "Защита проекта 2", weight: "10%", date: "03 11" },
        { name: "Защита проекта 3", weight: "10%", date: "01 12" }
      ],
      "Разработка на Go": [
        { name: "Контрольная работа 1", weight: "10%", date: "13 10" },
        { name: "Контест", weight: "10%", date: "20 10" },
        { name: "Контрольная работа 2", weight: "10%", date: "10 11" },
        { name: "Контрольная работа 3", weight: "10%", date: "08 12" },
        { name: "Контест 2", weight: "10%", date: "15 12" }
      ],
      "Английский язык 101S1": [
        { name: "Контрольная работа", weight: "10%", date: "03 11" },
        { name: "Зачет", weight: "10%", date: "15 12" }
      ],
      "Английский язык 102S1": [
        { name: "Контрольная работа", weight: "10%", date: "27 10" },
        { name: "Зачет", weight: "10%", date: "15 12" }
      ],
      "Английский язык 103S1": [
        { name: "Контрольная работа", weight: "10%", date: "03 11" },
        { name: "Зачет", weight: "10%", date: "15 12" }
      ],
      "Английский язык 104S1": [
        { name: "Контрольная работа", weight: "10%", date: "10 11" },
        { name: "Зачет", weight: "10%", date: "15 12" }
      ],
      "Английский язык 105S1": [
        { name: "Контрольная работа", weight: "10%", date: "03 11" },
        { name: "Зачет", weight: "10%", date: "15 12" }
      ],
      "Основы финансов": [
        { name: "Контрольная работа", weight: "10%", date: "27 10" }
      ],
      "ОРГ": [
        { name: "Сдача роекта", weight: "10%", date: "08 12" }
      ],
      "Основы российской государственности": [
        { name: "Сдача проекта", weight: "10%", date: "08 12" }
      ],
      "Научная студия": [
        { name: "Защита/презентация работ", weight: "10%", date: "15 12" }
      ],
      "STEM: Искусство и наука": [
        { name: "Сдача проекта", weight: "10%", date: "15 12" }
      ],
      "STEM: Философия и наука": [
        { name: "Сдача проекта", weight: "10%", date: "15 12" }
      ],
      "Микроэкономика-1": [
        { name: "Квиз 1", weight: "10%", date: "22 09" },
        { name: "Квиз 2", weight: "10%", date: "06 10" },
        { name: "Квиз 3", weight: "10%", date: "20 10" },
        { name: "Контрольная работа", weight: "10%", date: "27 10" },
        { name: "Квиз 4", weight: "10%", date: "03 11" },
        { name: "Квиз 5", weight: "10%", date: "17 11" },
        { name: "Квиз 6", weight: "10%", date: "01 12" },
        { name: "Квиз 7", weight: "10%", date: "15 12" }
      ],
      "Микроэкономика-1 (черный)": [
        { name: "Самостоятельная работа 1", weight: "10%", date: "06 10" },
        { name: "Самостоятельная работа 2", weight: "10%", date: "17 11" },
        { name: "Самостоятельная работа 3", weight: "10%", date: "01 12" },
        { name: "Самостоятельная работа 4", weight: "10%", date: "15 12" }
      ],
      "Теория вероятностей и математическая статистика": [
        { name: "Практикум 1", weight: "10%", date: "22 09" },
        { name: "Практикум 2", weight: "10%", date: "06 10" },
        { name: "Практикум 3", weight: "10%", date: "27 10" },
        { name: "Контрольная работа №1", weight: "10%", date: "03 11" },
        { name: "Практикум 4", weight: "10%", date: "10 11" },
        { name: "Практикум 5", weight: "10%", date: "24 11" },
        { name: "Практикум 6", weight: "10%", date: "01 12" },
        { name: "Контрольная работа №2", weight: "10%", date: "08 12" },
        { name: "Практикум 7", weight: "10%", date: "15 12" }
      ],
      "Разработка АКОС": [
        { name: "Контрольная работа 1", weight: "10%", date: "29 09" },
        { name: "Контрольная работа 2", weight: "10%", date: "20 10" },
        { name: "Контрольная работа 3", weight: "10%", date: "17 11" },
        { name: "Контрольная работа 4", weight: "10%", date: "15 12" }
      ],
      "Математические основания теории вероятностей": [
        { name: "Тест 1", weight: "10%", date: "29 09" },
        { name: "Тест 2", weight: "10%", date: "20 10" },
        { name: "Тест 3", weight: "10%", date: "10 11" },
        { name: "Тест 4", weight: "10%", date: "24 11" },
        { name: "Тест 5", weight: "10%", date: "15 12" }
      ],
      "Разработка Базы данных": [
        { name: "Контрольная работа 1", weight: "10%", date: "06 10" },
        { name: "Контрольная работа 2", weight: "10%", date: "20 10" },
        { name: "Контрольная работа 3", weight: "10%", date: "17 11" },
        { name: "Проект", weight: "10%", date: "08 12" },
      ],
      "Дифференциальные уравнения": [
        { name: "Контрольная работа №1", weight: "10%", date: "06 10" },
        { name: "Контрольная работа №2", weight: "10%", date: "17 11" }
      ],
      "Продуктовый менеджмент": [
        { name: "Промежуточная презентация проекта 1", weight: "10%", date: "13 10" },
        { name: "Промежуточная презентация проекта 2", weight: "10%", date: "10 11" },
        { name: "Промежуточная презентация проекта 3", weight: "10%", date: "08 12" }
      ],
      "Алгоритмы и структуры данных": [
        { name: "Контрольная работа 1", weight: "10%", date: "13 10" },
        { name: "Контрольная работа 2", weight: "10%", date: "10 11" },
        { name: "Коллоквиум", weight: "10%", date: "01 12" }
      ],
      "Математика для экономистов": [
        { name: "Контрольная работа", weight: "10%", date: "20 10" }
      ],
      "STEM: Проблемы энергетики и пищевой индустрии": [
        { name: "Защита работ на паре 1", weight: "10%", date: "20 10" },
        { name: "Защита работ на паре 2", weight: "10%", date: "08 12" },
        { name: "Защита работ на паре 3", weight: "10%", date: "15 12" }
      ],
      "Продуктовая аналитика": [
        { name: "Контрольная работа", weight: "10%", date: "27 10" }
      ],
      "Методы выпуклой оптимизации 2 поток (группа Меркулова)": [
        { name: "Контрольная работа №1", weight: "10%", date: "20 10" },
        { name: "Контрольная работа №2", weight: "10%", date: "08 12" }
      ],
      "Методы выпуклой оптимизации 1 поток (группа Богданова)": [
        { name: "Контрольная работа №1", weight: "10%", date: "27 10" },
        { name: "Контрольная работа №2", weight: "10%", date: "08 12" }
      ],
      "SQL": [
        { name: "Контрольная работа", weight: "10%", date: "03 11" }
      ],
      "Основы финансовой и управленческой отчётности": [
        { name: "Контрольная работа", weight: "10%", date: "10 11" },
        { name: "Кейс", weight: "10%", date: "15 12" }
      ],
      "Разработка на С++": [
        { name: "Проект", weight: "10%", date: "01 12" }
      ],
      "Основы мобильной разработки": [
        { name: "Проект", weight: "10%", date: "15 12" }
      ],
      "SOFT-курсы": [
        { name: "Защита проектов", weight: "10%", date: "08 12" },
        { name: "Зачет", weight: "10%", date: "15 12" }
      ],
      "STEM: Квантовые технологии в действии": [
        { name: "Контрольная работа", weight: "10%", date: "15 12" }
      ],
      "Английский язык 202S3": [
        { name: "Контрольная работа", weight: "10%", date: "27 10" },
      ],
      "Английский язык 203S3": [
        { name: "Контрольная работа", weight: "10%", date: "27 10" },
      ],
      "Английский язык 204S3": [
        { name: "Контрольная работа", weight: "10%", date: "27 10" },
      ],

    };

    try {
        const courseOverview = await waitForElement('cu-course-overview', 10000);
       
        const existingAccordion = courseOverview.querySelector('tui-accordion.cu-accordion.themes-accordion');
        
        if (!existingAccordion) {
            console.log('Accordion not found in cu-course-overview');
            return;
        }
        
        if (existingAccordion.querySelector('.custom-future-exam-item')) {
            return;
        }
        
        const titleElement = courseOverview.querySelector('h1.page-title');
        const courseTitle = titleElement.textContent.trim();
        const items = getUpcomingScheduleItems(courseTitle, schedule);

        if (items.length === 0) {
            return;
        }
       
        items.forEach((item, index) => {
            const accordionItem = createAccordionItem(
                `future-${index}`, 
                item.title, 
                1000 + index
            );
            accordionItem.classList.add('custom-future-exam-item');
           
            const icon = accordionItem.querySelector('cu-status-mark');
            if (icon) {
                icon.style.setProperty('color', '#dc2626', 'important');
            }
           
            existingAccordion.appendChild(accordionItem);
        });
    } catch (e) {
        console.log('cu-course-overview not found within timeout:', e);
    }
}


function createAccordionItem(themeId, title, index) {
    const item = document.createElement('tui-accordion-item');
    item.className = 'themes-accordion-item _has-arrow ng-star-inserted';
    item.setAttribute('_ngcontent-ng-c3060997220', '');
    item.setAttribute('_nghost-ng-c1368414471', '');
    item.setAttribute('data-theme-id', themeId);
    item.setAttribute('data-borders', 'all');
    item.setAttribute('data-size', 'm');
    
    item.innerHTML = `
        <div _ngcontent-ng-c1368414471="" automation-id="tui-accordion__item-wrapper" class="t-wrapper">
            <button _ngcontent-ng-c1368414471="" automation-id="tui-accordion__item-header" type="button" class="t-header t-header_hoverable">
                <span _ngcontent-ng-c1368414471="" automation-id="tui-accordion__item-title" class="t-title">
                    <div _ngcontent-ng-c3060997220="" class="themes-accordion__item-overview" automation-id="theme-${title}">
                        <cu-status-mark _ngcontent-ng-c3060997220="" class="themes-accordion__item-status inProgress outlined" _nghost-ng-c3382935032="">
                            <tui-icon _ngcontent-ng-c3382935032="" data-icon="svg" style="--t-icon: url(assets/cu/icons/cuIconBookOpen01.svg);"></tui-icon>
                        </cu-status-mark>
                        <h2 _ngcontent-ng-c3060997220="" cutext="l-bold" class="themes-accordion-item__item-title font-text-l-bold">${title}</h2>
                    </div>
                </span>
            </button>
            <tui-expand _ngcontent-ng-c1368414471="" _nghost-ng-c2581238906="" class="ng-tns-c2581238906-${index} ng-star-inserted" aria-expanded="false">
                <div _ngcontent-ng-c2581238906="" class="t-wrapper ng-tns-c2581238906-${index} ng-trigger ng-trigger-tuiParentAnimation"></div>
            </tui-expand>
        </div>
    `;
    
    return item;
}

function getUpcomingScheduleItems(courseTitle, schedule) {
    const titleLower = courseTitle.toLowerCase();
    
    let matchingKey = null;
    for (const key of Object.keys(schedule)) {
        if (titleLower.includes(key.toLowerCase())) {
            matchingKey = key;
            break;
        }
    }
    
    if (!matchingKey) {
        return [];
    }
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const daysLater = new Date(now);
    daysLater.setDate(now.getDate() + 1);
    
    const items = schedule[matchingKey]
        .map(item => {
            const [day, month] = item.date.split(' ').map(d => d.padStart(2, '0'));
            // считаем что все в одном году
            const itemDate = new Date(currentYear, parseInt(month) - 1, parseInt(day));
            
            return {
                ...item,
                parsedDate: itemDate
            };
        })
        .filter(item => item.parsedDate >= daysLater)
        .map(item => {
            const startDate = item.parsedDate;
            const endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 7);
            
            const formatDate = (date) => {
                const d = String(date.getDate()).padStart(2, '0');
                const m = String(date.getMonth() + 1).padStart(2, '0');
                return `${d}.${m}`;
            };
            
            return {
                title: `${item.name}. ${formatDate(startDate)}-${formatDate(endDate)}`,
                originalName: item.name,
                dateRange: `${formatDate(startDate)}-${formatDate(endDate)}`
            };
        });
    
    return items;
}
