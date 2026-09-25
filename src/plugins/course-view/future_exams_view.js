// Расписание, его кэш и разбор дат живут в future_exams_api.js
// (`window.cuLmsFutureExams`): тем же расписанием пользуется дэшборд под
// списком курсов, и номера недель у них должны совпадать.

// eslint-disable-next-line no-unused-vars
async function viewFutureExams(displayFormat) {
  const futureExams = window.cuLmsFutureExams;
  if (!futureExams) return;

  // null — сервер недоступен и кэша нет: показывать нечего.
  const data = await futureExams.load();
  if (!data) return;
  const { schedule, config } = data;

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

    // Расписание контрольных ищется по названию курса, поэтому берём
    // оригинальное: пользователь мог переименовать курс в расширении.
    const courseTitle = window.cuLmsCourseNames
      ? window.cuLmsCourseNames.originalFor(titleElement, titleElement.textContent.trim())
      : titleElement.textContent.trim();
    const items = getUpcomingScheduleItems(courseTitle, schedule, displayFormat, config);

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
        // Паддинг и border-bottom обычно даёт правило
        // `.cu-accordion ._has-arrow button.t-header.t-header_hoverable`
        // (см. dark-theme.css) — но оно требует ОБА класса, которые мы
        // только что сняли (тут и на accordionItem выше), поэтому без
        // этого элемент откатывается на дефолтный вид компонента: другая
        // рамка и другие отступы, "не ровно" относительно родных тем.
        // Прописываем то же самое явно, независимо от классов.
        headerButton.style.padding =
          'var(--cu-accordion-item-padding-top) var(--cu-accordion-item-padding-right) var(--cu-accordion-item-padding-bottom) var(--cu-accordion-item-padding-left)';
        headerButton.style.borderBottom = 'none';
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

function getUpcomingScheduleItems(courseTitle, schedule, displayFormat, config) {
  const futureExams = window.cuLmsFutureExams;

  // Курс ищется по вхождению ключа в название; из нескольких подходящих
  // ключей побеждает самый длинный (см. findScheduleKey).
  const matchingKey = futureExams.findScheduleKey(courseTitle, schedule);
  if (!matchingKey) {
    return [];
  }

  const today = new Date();
  // Точка отсчёта для номера недели задаётся в админке сервера
  // (data/config.json, поле semesterStart), а не хардкодится тут: иначе
  // при смене семестра номера недель "уезжают" (было именно так — тут
  // раньше было захардкожено "2 февраля"). Год к ней подбирает общий модуль.
  const semesterStart = futureExams.semesterStartDay(config, today);
  // Показываем события начиная с "завтра"
  const tomorrow = futureExams.dayOf(today) + 1;

  const formatDate = (date) => {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${d}.${m}`;
  };

  return schedule[matchingKey]
    .filter((item) => item && typeof item.name === 'string')
    .map((item) => ({ ...item, day: futureExams.resolveDay(item.date, semesterStart) }))
    .filter((item) => item.day !== null && item.day >= tomorrow)
    .map((item) => {
      let title;

      if (displayFormat === 'week') {
        title = `Неделя ${futureExams.weekNumber(item.day, semesterStart)}. ${item.name}`;
      } else {
        // Формат даты, если не 'week'
        const startDate = futureExams.dateOf(item.day);
        const endDate = futureExams.dateOf(item.day + 7); // условно +неделя
        title = `${item.name}. ${formatDate(startDate)}-${formatDate(endDate)}`;
      }

      return {
        title,
        originalName: item.name,
      };
    });
}
