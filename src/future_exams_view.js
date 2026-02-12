async function viewFutureExams(displayFormat) {
    const schedule = {
      "Введение в экономику. Основной уровень": [
        { name: "Мини-контрольная работа", date: "16 02" },  // неделя 3
        { name: "Мини-контрольная работа", date: "23 02" },  // неделя 4
        { name: "Мини-контрольная работа", date: "09 03" },  // неделя 6
        { name: "Мини-контрольная работа", date: "16 03" },  // неделя 7
        { name: "Контрольная работа 1",     date: "30 03" }, // неделя 9
        { name: "Мини-контрольная",         date: "11 05" }, // неделя 13
        { name: "Мини-контрольная работа",  date: "25 05" }  // неделя 15
      ],

      "Введение в статистику. Продвинутый уровень": [
        { name: "Контрольная работа 1", date: "23 02" },   // неделя 4
        { name: "Контрольная работа 2", date: "23 03" },   // неделя 8
        { name: "Контрольная работа 3", date: "11 05" }    // неделя 13
      ],

      "Kotlin": [
        { name: "Устная защита", date: "23 02" },   // неделя 4
        { name: "Устная защита", date: "16 03" },   // gpt proebalsax
        { name: "Устная защита", date: "06 04" }    // неделя 10
      ],

      "Ясность в текстах": [
        { name: "Мини-проект", date: "23 02" },     // неделя 4
        { name: "Мини-проект", date: "16 03" },     // gpt blin
        { name: "Мини-проект", date: "06 04" },     // неделя 10
        { name: "Мини-проект", date: "11 05" }      // неделя 13
      ],

      "Основы математического анализа и линейной алгебры 2": [
        { name: "Контрольная работа 1",      date: "02 03" },  // неделя 5
        { name: "Контрольная работа 2 (устная)", date: "06 04" }, // неделя 10
        { name: "Контрольная работа 3",      date: "20 04" },  // неделя 12
        { name: "Контрольная работа 4",      date: "25 05" }   // неделя 15
      ],

      "Математический анализ 2. Основной уровень": [
        { name: "Контрольная работа 1", date: "02 03" },
        { name: "Коллоквиум",           date: "30 03" },
        { name: "Контрольная работа 2", date: "06 04" },
        { name: "Контрольная работа 3", date: "25 05" }
      ],

      "Введение в статистику. Основной уровень": [
        { name: "Контрольная работа 1", date: "02 03" },
        { name: "Контрольная работа 2", date: "23 03" },
        { name: "Контрольная работа 3", date: "18 05" }
      ],

      "Финансы. Основной уровень": [
        { name: "Контрольная работа 1", date: "02 03" },
        { name: "Контрольная работа 2", date: "23 03" },
        { name: "Контрольная работа 3", date: "20 04" },
        { name: "Защита проекта",       date: "18 05" }
      ],

      "Математический анализ 2. Продвинутый уровень": [
        { name: "Контрольная работа 1", date: "02 03" },
        { name: "Коллоквиум",           date: "30 03" },
        { name: "Контрольная работа 2", date: "06 04" },
        { name: "Контрольная работа 3", date: "25 05" }
      ],

      "Бизнес-студия": [
        { name: "Защита проекта",          date: "02 03" },
        { name: "Защита проекта",          date: "06 04" },
        { name: "Итоговая защита проекта", date: "18 05" },
        { name: "Потоковая презентация проектов", date: "25 05" }
      ],

      "Линейная алгебра и геометрия 2. Основной уровень": [
        { name: "Аудиторная работа", date: "09 03" },
        { name: "Контрольная работа", date: "23 03" },
        { name: "Коллоквиум",         date: "20 04" },
      ],

      "Введение в искусственный интеллект. Продвинутый уровень": [
        { name: "Контест", date: "09 03" },
        { name: "Контест", date: "30 03" },
        { name: "Контест", date: "20 04" }
      ],

      "Дискретная математика": [
        { name: "Контрольная работа 1", date: "09 03" },
        { name: "Контрольная работа 2", date: "06 04" },
        { name: "Контрольная работа 3", date: "25 05" }
      ],

      "Основы разработки на Go": [
        { name: "Контрольная работа 1", date: "09 03" },
        { name: "Проект",               date: "30 03" },
        { name: "Контрольная работа 2", date: "06 04" },
        { name: "Контрольная работа 3", date: "18 05" }
      ],

      "Основы бизнес-аналитики. Основной уровень": [
        { name: "Контрольная работа",     date: "16 03" },
        { name: "Итоговая защита проекта", date: "25 05" }
      ],

      "Математический анализ 2. Пилотный поток": [
        { name: "Контрольная работа 1", date: "16 03" },
        { name: "Коллоквиум",           date: "30 03" },
        { name: "Контрольная работа 2", date: "18 05" }
      ],

      "Линейная алгебра и геометрия 2. Пилотный поток": [
        { name: "Контрольная работа", date: "06 04" },
        { name: "Коллоквиум",         date: "11 05" }
      ],

      // Другие курсы, которые встречаются реже / один раз
      "Основы финансов": [
        { name: "Контрольная работа", date: "23 03" }
      ],

      "Информационная безопасность": [
        { name: "Коллоквиум", date: "23 03" }
      ],

      "Введение в экономику. Продвинутый уровень": [
        { name: "Контрольная работа 1", date: "30 03" }
      ],

      "Разработка на С++ 1": [
        { name: "Проект", date: "11 05" },
        { name: "Контрольная работа 1", date: "25 05" }
      ],

      "Разработка на С++ 2": [
        { name: "Проект", date: "11 05" },
        { name: "Контрольная работа 1", date: "11 05" }
      ],

      "STEM: Искусство и наука": [
        { name: "Защита концепции итогового проекта", date: "11 05" },
        { name: "Защита концепции итогового проекта", date: "18 05" }
      ],

      "STEM: Философия и наука": [
        { name: "Сдача итогового проекта", date: "25 05" }
      ],

      "Научная студия": [
        { name: "Защита/презентация итоговых работ", date: "25 05" }
      ],

      "SOFT": [
        { name: "Итоговый проект", date: "25 05" }
      ],

      "Английский язык 101S2": [
        { name: "Контрольная работа 1", date: "30 03" },
        { name: "Контрольная работа 2", date: "18 05" },
        { name: "Итоговое оценивание/зачет", date: "25 05" }
      ],
      "Английский язык 102S2": [
        { name: "Контрольная работа", date: "16 03" },
        { name: "Контрольная работа 2", date: "18 05" },
        { name: "Итоговое оценивание/зачет", date: "25 05" }
      ],
      "Английский язык 103S2": [
        { name: "Контрольная работа", date: "23 03" },
        { name: "Контрольная работа 2", date: "18 05" },
        { name: "Итоговое оценивание/зачет", date: "25 05" }
      ],
      "Английский язык 103S2B": [
        { name: "Контрольная работа 1", date: "30 03" },
        { name: "Тест", date: "11 05" },
        { name: "Контрольная работа 2", date: "18 05" },
        { name: "Итоговое оценивание/зачет", date: "25 05" }
      ],
      "Английский язык 104S2": [
        { name: "Контрольная работа", date: "23 03" },
        { name: "Итоговое письменное оценивание/зачет", date: "18 05" },
        { name: "Устное итоговое зачетное задание + тест", date: "25 05" }
      ],
      "Английский язык 104S2B": [
        { name: "Контрольная работа", date: "23 03" },
        { name: "Итоговое письменное оценивание/зачет", date: "18 05" },
        { name: "Устное итоговое зачетное задание + тест", date: "25 05" }
      ],
      "Английский язык 105S2": [
        { name: "Контрольная работа", date: "16 03" },
        { name: "Устное итоговое зачетное задание + тест", date: "25 05" }
      ],
      "Английский язык 105S2B": [
        { name: "Контрольная работа", date: "16 03" },
        { name: "Итоговое письменное оценивание/зачет", date: "18 05" },
        { name: "Устное итоговое зачетное задание + тест", date: "25 05" }
      ]


      // Если нужны остальные курсы из старого списка, но они не появились в таблице — их можно оставить пустыми или удалить
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
        const items = getUpcomingScheduleItems(courseTitle, schedule, displayFormat);

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
    const itemType = 'future-exam';
    item.setAttribute('data-item-type', itemType);

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

function getUpcomingScheduleItems(courseTitle, schedule, displayFormat) {
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

    // Дата отсечения (показывать события начиная с "завтра")
    const daysLater = new Date(now);
    daysLater.setDate(now.getDate() + 1);
    daysLater.setHours(0, 0, 0, 0);

    // 1. Точка отсчета: 2 февраля (начало 1-й недели)
    const semesterStart = new Date(currentYear, 1, 2); // Месяц 1 = Февраль

    // 2. Точка возобновления после каникул: 11 мая (начало 13-й недели)
    const holidaysEnd = new Date(currentYear, 4, 11); // Месяц 4 = Май

    const items = schedule[matchingKey]
        .map(item => {
            const [day, month] = item.date.split(' ').map(d => d.trim().padStart(2, '0'));
            // Месяцы в JS начинаются с 0 (Январь - 0, Май - 4)
            const itemDate = new Date(currentYear, parseInt(month, 10) - 1, parseInt(day, 10));
            return {
                ...item,
                parsedDate: itemDate
            };
        })
        .filter(item => item.parsedDate >= daysLater)
        .map(item => {
            const startDate = item.parsedDate;
            let title;

            if (displayFormat === 'week') {
                const msPerDay = 24 * 60 * 60 * 1000;
                
                // Считаем разницу в днях от 2 февраля
                const diffTime = startDate.getTime() - semesterStart.getTime();
                const diffDays = Math.floor(diffTime / msPerDay);
                
                // Базовый расчет недели (делим на 7 дней, +1 так как старт с 1-й недели)
                let weekNumber = Math.floor(diffDays / 7) + 1;

                // КОРРЕКТИРОВКА НА МАЙСКИЕ ПРАЗДНИКИ
                // Если дата события 11 мая или позже, вычитаем 2 недели каникул
                if (startDate >= holidaysEnd) {
                    weekNumber -= 2;
                }

                // (Опционально) Если событие вдруг выпадает на сами каникулы (27.04 - 10.05)
                const holidaysStart = new Date(currentYear, 3, 27); // 27 апреля
                if (startDate >= holidaysStart && startDate < holidaysEnd) {
                    title = `Каникулы. ${item.name}`;
                } else {
                    title = `Неделя ${weekNumber}. ${item.name}`;
                }

            } else {
                // Формат даты, если не 'week'
                const endDate = new Date(startDate);
                endDate.setDate(startDate.getDate() + 7); // условно +неделя
                const formatDate = (date) => {
                    const d = String(date.getDate()).padStart(2, '0');
                    const m = String(date.getMonth() + 1).padStart(2, '0');
                    return `${d}.${m}`;
                };
                title = `${item.name}. ${formatDate(startDate)}-${formatDate(endDate)}`;
            }

            return {
                title,
                originalName: item.name
            };
        });

    return items;
}