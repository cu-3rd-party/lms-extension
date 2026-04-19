// eslint-disable-next-line no-unused-vars
async function viewFutureExams(displayFormat) {
  const schedule = {
    'Введение в экономику. Основной уровень': [
      { name: 'Мини-контрольная работа', date: '16 02' }, // неделя 3
      { name: 'Мини-контрольная работа', date: '23 02' }, // неделя 4
      { name: 'Мини-контрольная работа', date: '09 03' }, // неделя 6
      { name: 'Мини-контрольная работа', date: '16 03' }, // неделя 7
      { name: 'Контрольная работа 1', date: '30 03' }, // неделя 9
      { name: 'Мини-контрольная', date: '11 05' }, // неделя 13
      { name: 'Мини-контрольная работа', date: '25 05' }, // неделя 15
    ],

    'Введение в статистику. Продвинутый уровень': [
      { name: 'Контрольная работа 1', date: '23 02' }, // неделя 4
      { name: 'Контрольная работа 2', date: '23 03' }, // неделя 8
      { name: 'Контрольная работа 3', date: '11 05' }, // неделя 13
    ],

    Kotlin: [
      { name: 'Устная защита', date: '23 02' }, // неделя 4
      { name: 'Устная защита', date: '16 03' }, // gpt proebalsax
      { name: 'Устная защита', date: '06 04' }, // неделя 10
    ],

    'Ясность в текстах': [
      { name: 'Мини-проект', date: '23 02' }, // неделя 4
      { name: 'Мини-проект', date: '16 03' }, // gpt blin
      { name: 'Мини-проект', date: '06 04' }, // неделя 10
      { name: 'Мини-проект', date: '11 05' }, // неделя 13
    ],

    'Основы математического анализа и линейной алгебры 2': [
      { name: 'Контрольная работа 1', date: '02 03' }, // неделя 5
      { name: 'Контрольная работа 2 (устная)', date: '06 04' }, // неделя 10
      { name: 'Контрольная работа 3', date: '20 04' }, // неделя 12
      { name: 'Контрольная работа 4', date: '25 05' }, // неделя 15
    ],

    'Математический анализ 2. Основной уровень': [
      { name: 'Контрольная работа 1', date: '02 03' },
      { name: 'Коллоквиум', date: '30 03' },
      { name: 'Контрольная работа 2', date: '06 04' },
      { name: 'Контрольная работа 3', date: '25 05' },
    ],

    'Введение в статистику. Основной уровень': [
      { name: 'Контрольная работа 1', date: '02 03' },
      { name: 'Контрольная работа 2', date: '23 03' },
      { name: 'Контрольная работа 3', date: '18 05' },
    ],

    'Математический анализ 2. Продвинутый уровень': [
      { name: 'Контрольная работа 1', date: '02 03' },
      { name: 'Коллоквиум', date: '30 03' },
      { name: 'Контрольная работа 2', date: '06 04' },
      { name: 'Контрольная работа 3', date: '25 05' },
    ],

    'Бизнес-студия': [
      { name: 'Защита проекта', date: '02 03' },
      { name: 'Защита проекта', date: '06 04' },
      { name: 'Итоговая защита проекта', date: '18 05' },
      { name: 'Потоковая презентация проектов', date: '25 05' },
    ],

    'Линейная алгебра и геометрия 2': [
      { name: 'Аудиторная работа', date: '09 03' },
      { name: 'Контрольная работа', date: '23 03' },
      { name: 'Коллоквиум', date: '20 04' },
    ],

    'Введение в искусственный интеллект. Продвинутый уровень': [
      { name: 'Контест', date: '09 03' },
      { name: 'Контест', date: '30 03' },
      { name: 'Контест', date: '20 04' },
    ],

    'Введение в искусственный интеллект. Основной уровень': [{ name: 'Коллоквиум', date: '16 03' }],

    'Дискретная математика': [
      { name: 'Контрольная работа 1', date: '09 03' },
      { name: 'Контрольная работа 2', date: '06 04' },
      { name: 'Контрольная работа 3', date: '25 05' },
    ],

    'Основы разработки на Go': [
      { name: 'Контрольная работа 1', date: '09 03' },
      { name: 'Проект', date: '30 03' },
      { name: 'Контрольная работа 2', date: '06 04' },
      { name: 'Контрольная работа 3', date: '18 05' },
    ],

    'Основы бизнес-аналитики. Основной уровень': [
      { name: 'Контрольная работа', date: '16 03' },
      { name: 'Итоговая защита проекта', date: '25 05' },
    ],

    'Математический анализ 2. Пилотный поток': [
      { name: 'Контрольная работа 1', date: '16 03' },
      { name: 'Коллоквиум', date: '30 03' },
      { name: 'Контрольная работа 2', date: '18 05' },
    ],

    'Линейная алгебра и геометрия 2. Пилотный поток': [
      { name: 'Контрольная работа', date: '06 04' },
      { name: 'Коллоквиум', date: '11 05' },
    ],

    // Другие курсы, которые встречаются реже / один раз
    'Основы финансов': [{ name: 'Контрольная работа', date: '23 03' }],

    'Информационная безопасность': [{ name: 'Коллоквиум', date: '23 03' }],

    'Введение в экономику. Продвинутый уровень': [{ name: 'Контрольная работа 1', date: '30 03' }],

    'STEM: Искусство и наука': [
      { name: 'Защита концепции итогового проекта', date: '11 05' },
      { name: 'Защита концепции итогового проекта', date: '18 05' },
    ],

    'STEM: Философия и наука': [{ name: 'Сдача итогового проекта', date: '25 05' }],

    'Научная студия': [{ name: 'Защита/презентация итоговых работ', date: '25 05' }],

    SOFT: [{ name: 'Итоговый проект', date: '25 05' }],

    'Английский язык 101S2': [
      { name: 'Контрольная работа 1', date: '30 03' },
      { name: 'Контрольная работа 2', date: '18 05' },
      { name: 'Итоговое оценивание/зачет', date: '25 05' },
    ],
    'Английский язык 102S2': [
      { name: 'Контрольная работа', date: '16 03' },
      { name: 'Контрольная работа 2', date: '18 05' },
      { name: 'Итоговое оценивание/зачет', date: '25 05' },
    ],
    'Английский язык 103S2': [
      { name: 'Контрольная работа', date: '23 03' },
      { name: 'Контрольная работа 2', date: '18 05' },
      { name: 'Итоговое оценивание/зачет', date: '25 05' },
    ],
    'Английский язык 103S2B': [
      { name: 'Контрольная работа 1', date: '30 03' },
      { name: 'Тест', date: '11 05' },
      { name: 'Контрольная работа 2', date: '18 05' },
      { name: 'Итоговое оценивание/зачет', date: '25 05' },
    ],
    'Английский язык 104S2': [
      { name: 'Контрольная работа', date: '23 03' },
      { name: 'Итоговое письменное оценивание/зачет', date: '18 05' },
      { name: 'Устное итоговое зачетное задание + тест', date: '25 05' },
    ],
    'Английский язык 104S2B': [
      { name: 'Контрольная работа', date: '23 03' },
      { name: 'Итоговое письменное оценивание/зачет', date: '18 05' },
      { name: 'Устное итоговое зачетное задание + тест', date: '25 05' },
    ],
    'Английский язык 105S2': [
      { name: 'Контрольная работа', date: '16 03' },
      { name: 'Устное итоговое зачетное задание + тест', date: '25 05' },
    ],
    'Английский язык 105S2B': [
      { name: 'Контрольная работа', date: '16 03' },
      { name: 'Итоговое письменное оценивание/зачет', date: '18 05' },
      { name: 'Устное итоговое зачетное задание + тест', date: '25 05' },
    ],

    'Английский 202S4 / 203S4 / 204S4': [
      { name: 'Тест', date: '02 02' }, // неделя 1
    ],

    // 4th sem
    'Многопоточная синхронизация': [
      { name: 'Проект', date: '09 02' }, // неделя 2
      { name: 'Проект', date: '02 03' }, // неделя 5
      { name: 'Итоговый проект', date: '13 04' }, // неделя 11
      { name: 'Сдача итогового проекта', date: '25 05' }, // неделя 15
    ],

    'Deep Learning': [
      { name: 'Тест', date: '16 02' }, // неделя 3
      { name: 'Тест', date: '02 03' }, // неделя 5
      { name: 'Тест', date: '11 05' }, // неделя 13
    ],

    'Архитектура компьютера и операционные системы 2': [
      { name: 'Контрольная работа 1', date: '23 02' }, // неделя 4
      { name: 'Контрольная работа 2', date: '23 03' }, // неделя 8
      { name: 'Контрольная работа 3', date: '20 04' }, // неделя 12
      { name: 'Контрольная работа 4', date: '25 05' }, // неделя 15
    ],

    'Разработка на Kotlin': [
      { name: 'Устная защита', date: '23 02' }, // неделя 4
      { name: 'Устная защита', date: '16 03' }, // неделя 7
      { name: 'Устная защита', date: '06 04' }, // неделя 10
    ],

    'Дополнительные главы математического анализа': [
      { name: 'Контрольная работа 1', date: '02 03' }, // неделя 5
      { name: 'Коллоквиум', date: '23 03' }, // неделя 8
      { name: 'Контрольная работа 2', date: '18 05' }, // неделя 14
    ],

    'Финансы. Основной уровень': [
      { name: 'Контрольная работа 1', date: '02 03' }, // неделя 5
      { name: 'Контрольная работа 2', date: '23 03' }, // неделя 8
      { name: 'Контрольная работа 3', date: '20 04' }, // неделя 12
      { name: 'Защита проекта', date: '18 05' }, // неделя 14
    ],

    'Базы данных (для ML)': [
      { name: 'Контрольная работа 1', date: '09 03' }, // неделя 6
      { name: 'Контрольная работа 2', date: '23 03' }, // неделя 8
      { name: 'Контрольная работа 3', date: '20 04' }, // неделя 12
    ],

    'Алгоритмы и структуры данных 2': [
      { name: 'Контрольная работа 1', date: '09 03' }, // неделя 6
      { name: 'Контрольная работа 2', date: '06 04' }, // неделя 10
      { name: 'Коллоквиум', date: '11 05' }, // неделя 13
    ],

    'Алгоритмы и структуры данных': [
      { name: 'Контрольная работа 1', date: '09 03' }, // неделя 6
      { name: 'Контрольная работа 2', date: '06 04' }, // неделя 10
      { name: 'Коллоквиум', date: '11 05' }, // неделя 13
    ],

    'Методы дискретной оптимизации': [
      { name: 'Контрольная работа 1', date: '16 03' }, // неделя 7
      { name: 'Контрольная работа 2', date: '20 04' }, // неделя 12
    ],

    'Алгоритмы и структуры данных. Продвинутый уровень': [
      { name: 'Контрольная работа', date: '16 03' }, // неделя 7
      { name: 'Коллоквиум', date: '20 04' }, // неделя 12
    ],

    'Математическая статистика. Основной уровень': [
      { name: 'Контрольная работа 1', date: '16 03' }, // неделя 7
      { name: 'Контест 1', date: '30 03' }, // неделя 9
      { name: 'Контест 2', date: '20 04' }, // неделя 12
      { name: 'Контест 3', date: '18 05' }, // неделя 14
    ],

    'Креативные техники решения задач': [
      { name: 'Итоговый проект', date: '16 03' }, // неделя 7
    ],

    'Эконометрика 1. Основной уровень': [
      { name: 'Контрольная работа', date: '23 03' }, // неделя 8
    ],

    'Эконометрика 1. Продвинутый уровень': [
      { name: 'Контрольная работа', date: '23 03' }, // неделя 8
      { name: 'Групповой проект в формате хакатона', date: '25 05' }, // неделя 15
    ],

    'Английский 204S4': [
      { name: 'Тест', date: '23 03' }, // неделя 8
    ],
    'Английский 203S4': [
      { name: 'Тест', date: '23 03' }, // неделя 8
    ],

    'Работа в команде и коллаборация': [
      { name: 'Мини-проект', date: '23 03' }, // неделя 8
    ],

    'Управление ресурсами: личная эффективность': [
      { name: 'Итоговый проект', date: '23 03' }, // неделя 8
    ],

    'Макроэкономика 1. Основной уровень': [
      { name: 'Контрольная работа', date: '30 03' }, // неделя 9
    ],

    'Макроэкономика 1. Продвинутый уровень': [
      { name: 'Контрольная работа', date: '30 03' }, // неделя 9
      { name: 'Защита групповой работы со статьями', date: '13 04' }, // неделя 11
      { name: 'Защита группового проекта (кейс)', date: '25 05' }, // неделя 15
    ],

    'Английский язык 202S4': [
      { name: 'Тест', date: '30 03' }, // неделя 9
    ],
    'Английский язык 202S4B': [
      { name: 'Тест', date: '30 03' }, // неделя 9
    ],

    'Математическая статистика. Продвинутый уровень': [
      { name: 'Коллоквиум 1', date: '30 03' }, // неделя 9
      { name: 'Коллоквиум 2', date: '11 05' }, // неделя 13
    ],

    'Теория игр. Основной уровень': [
      { name: 'Контрольная работа', date: '06 04' }, // неделя 10
    ],

    'Web-разработка': [
      { name: 'Проект', date: '20 04' }, // неделя 12
      { name: 'Проект', date: '25 05' }, // неделя 15
    ],

    'Разработка на С++ 1': [
      { name: 'Проект', date: '11 05' }, // неделя 13
      { name: 'Контрольная работа 1', date: '25 05' }, // неделя 15
    ],

    'Разработка на С++ 2': [
      { name: 'Проект', date: '11 05' }, // неделя 13
      { name: 'Контрольная работа 1', date: '25 05' }, // неделя 15
    ],

    'Основы маркетинга': [
      { name: 'Бизнес-игра', date: '18 05' }, // неделя 14
      { name: 'Защита проекта (экзамен)', date: '25 05' }, // неделя 15
    ],

    Алгебра: [
      { name: 'Контрольная работа', date: '18 05' }, // неделя 14
    ],
    'Английский язык 204S4': [
      { name: 'Тест + письменная часть экзамена', date: '25 05' }, // неделя 15
    ],
    'Английский язык 204S4B': [
      { name: 'Тест + письменная часть экзамена', date: '25 05' }, // неделя 15
    ],

    'Теория игр. Продвинутый уровень': [
      { name: 'Защита проекта', date: '25 05' }, // неделя 15
    ],

    // Если нужны остальные курсы из старого списка, но они не появились в таблице — их можно оставить пустыми или удалить
  };

  try {
    const themesContainer = await waitForElement('cu-course-overview .themes-container', 10000);

    if (!themesContainer) {
      console.log('Themes container not found within timeout');
      return;
    }

    if (themesContainer.querySelector('.custom-future-exam-item')) {
      return;
    }

    const titleElement = document.querySelector('cu-course-overview h1.page-title');
    if (!titleElement) {
      console.log('Course title element not found');
      return;
    }

    const courseTitle = titleElement.textContent.trim();
    const items = getUpcomingScheduleItems(courseTitle, schedule, displayFormat);

    if (items.length === 0) {
      return;
    }

    // Ищем оригинальную неделю-аккордеон, чтобы использовать её как идеальный шаблон
    const templateAccordion = themesContainer.querySelector('tui-accordion');
    if (!templateAccordion) {
      console.log('No template accordion found to clone');
      return;
    }

    items.forEach((item, index) => {
      // 1. Клонируем оригинальный элемент (с сохранением всех Angular-классов)
      const clone = templateAccordion.cloneNode(true);

      // Добавляем наш класс-метку, чтобы не дублировать
      clone.classList.add('custom-future-exam-item');

      // 2. Меняем служебные ID, чтобы не конфликтовать с платформой
      const accordionItem = clone.querySelector('tui-accordion-item');
      if (accordionItem) {
        accordionItem.setAttribute('data-theme-id', `future-${index}`);
        accordionItem.setAttribute('data-item-type', 'future-exam');
        // УДАЛЯЕМ КЛАСС _has-arrow, чтобы убрать отступ под стрелку
        accordionItem.classList.remove('_has-arrow');
      }

      // 3. Устанавливаем текст будущего экзамена
      const titleH3 = clone.querySelector('h3');
      if (titleH3) {
        titleH3.textContent = item.title;
      }

      // 4. Перекрашиваем левую иконку (книжку) в красный цвет
      const icon = clone.querySelector('.icon-container tui-icon');
      if (icon) {
        icon.style.setProperty('color', '#dc2626', 'important');
      }

      // 5. Очищаем скрытое содержимое недели (внутри клона могли остаться чужие материалы)
      const expandContent = clone.querySelector('tui-expand .t-wrapper');
      if (expandContent) {
        expandContent.innerHTML = '';
      }

      // --- НОВОЕ: 6. Удаляем иконку стрелочки ---
      const chevron = clone.querySelector('tui-icon[tuichevron]');
      if (chevron) {
        chevron.remove();
      }

      // (Опционально) Чтобы элемент не реагировал на наведение как кнопка:
      const headerButton = clone.querySelector('.t-header_hoverable');
      if (headerButton) {
        headerButton.classList.remove('t-header_hoverable');
        headerButton.style.cursor = 'default';
      }
      // ------------------------------------------

      // 7. Добавляем красивый клон в конец списка
      themesContainer.appendChild(clone);
    });
  } catch (e) {
    console.log('Error in viewFutureExams:', e);
  }
}

function createAccordionItem(themeId, title, index) {
  const accordionWrapper = document.createElement('tui-accordion');
  accordionWrapper.className = 'cu-accordion ng-star-inserted custom-future-exam-item';
  accordionWrapper.setAttribute('tuigroup', '');
  accordionWrapper.setAttribute('data-orientation', 'vertical');
  accordionWrapper.setAttribute('data-size', 'l');

  accordionWrapper.innerHTML = `
      <!-- Убран класс _has-arrow -->
      <tui-accordion-item data-theme-id="${themeId}" data-borders="all" data-size="m" class="" data-item-type="future-exam">
          <div automation-id="tui-accordion__item-wrapper" class="t-wrapper">
              <!-- Убран класс t-header_hoverable и добавлен cursor: default -->
              <button automation-id="tui-accordion__item-header" type="button" class="t-header" style="cursor: default;">
                  <span automation-id="tui-accordion__item-title" class="t-title">
                      <div class="theme-details">
                          <div class="icon-container">
                              <tui-icon icon="cuIconBookOpen02" size="xs" class="icon" data-icon="svg" style="--t-icon: url(assets/cu/icons/cuIconBookOpen02.svg); color: #dc2626 !important;"></tui-icon>
                          </div>
                          <h3 cutext="m-bold" class="limited-lines-text text-primary font-text-m-bold" style="--lines-count: 2;">
                              ${title}
                          </h3>
                      </div>
                  </span>
                  <!-- СТРЕЛОЧКА БЫЛА УДАЛЕНА ОТСЮДА -->
              </button>
              <tui-expand class="ng-tns-c2581238906-${index} ng-star-inserted" aria-expanded="false">
                  <div class="t-wrapper ng-tns-c2581238906-${index} ng-trigger ng-trigger-tuiParentAnimation"></div>
              </tui-expand>
          </div>
      </tui-accordion-item>
  `;

  return accordionWrapper;
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
    .map((item) => {
      const [day, month] = item.date.split(' ').map((d) => d.trim().padStart(2, '0'));
      // Месяцы в JS начинаются с 0 (Январь - 0, Май - 4)
      const itemDate = new Date(currentYear, parseInt(month, 10) - 1, parseInt(day, 10));
      return {
        ...item,
        parsedDate: itemDate,
      };
    })
    .filter((item) => item.parsedDate >= daysLater)
    .map((item) => {
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
        originalName: item.name,
      };
    });

  return items;
}
