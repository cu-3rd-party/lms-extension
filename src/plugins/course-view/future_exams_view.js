// https://github.com/cu-3rd-party/lms-future-exams-backend
const FUTURE_EXAMS_BACKEND_URL = 'https://lms.exams.cu3rd.ru';
// Расписание и дата первой недели правятся вручную через админку сервера,
// а не каждую минуту — получасовой TTL достаточен и не дёргает сервер на
// каждое открытие курса.
const FUTURE_EXAMS_CACHE_TTL_MS = 30 * 60 * 1000;

/**
 * Тянет JSON с удалённого сервера (см. README.md этого плагина) с кэшем в
 * browser.storage.local. Раньше расписание было захардкожено прямо в этом
 * файле — теперь его правят через админку сервера без релиза расширения.
 * При недоступности сервера отдаём последний закэшированный ответ (или
 * `fallback`, если кэша ещё нет) — плагин никогда не должен ронять страницу
 * курса из-за сетевой ошибки.
 *
 * Запрос идёт через background (сообщение FETCH_JSON), а не напрямую
 * fetch() отсюда: в Firefox content-скрипты не получают CORS-обход из
 * host_permissions (в отличие от Chrome), и прямой кросс-доменный fetch
 * падает с "CORS request did not succeed" даже когда сервер шлёт
 * Access-Control-Allow-Origin. У background-скрипта такого ограничения нет.
 */
async function fetchWithCache(url, cacheKey, fallback) {
  const api = typeof browser !== 'undefined' ? browser : chrome;
  const timestampKey = `${cacheKey}Timestamp`;
  const stored = await api.storage.local.get([cacheKey, timestampKey]);
  const cached = stored[cacheKey];
  const cachedAt = stored[timestampKey] || 0;

  if (cached && Date.now() - cachedAt < FUTURE_EXAMS_CACHE_TTL_MS) {
    return cached;
  }

  try {
    const response = await api.runtime.sendMessage({ action: 'FETCH_JSON', url });
    if (!response || !response.success) {
      throw new Error((response && response.error) || 'no response from background');
    }
    const data = response.data;
    await api.storage.local.set({ [cacheKey]: data, [timestampKey]: Date.now() });
    return data;
  } catch (e) {
    console.log(`[FutureExams] Failed to fetch ${url}, falling back to cache:`, e);
    return cached || fallback;
  }
}

// eslint-disable-next-line no-unused-vars
async function viewFutureExams(displayFormat) {
  const [schedule, config] = await Promise.all([
    fetchWithCache(`${FUTURE_EXAMS_BACKEND_URL}/api/schedule`, 'futureExamsScheduleCache', {}),
    fetchWithCache(`${FUTURE_EXAMS_BACKEND_URL}/api/config`, 'futureExamsConfigCache', {}),
  ]);

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
    const items = getUpcomingScheduleItems(
      courseTitle,
      schedule,
      displayFormat,
      config.semesterStart
    );

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

function getUpcomingScheduleItems(courseTitle, schedule, displayFormat, semesterStartStr) {
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

  // 1. Точка отсчета для расчёта номера недели — задаётся в админке сервера
  // (data/config.json, поле semesterStart), а не хардкодится тут: иначе
  // при смене семестра номера недель "уезжают" (было именно так — тут
  // раньше было захардкожено "2 февраля").
  const [startDay, startMonth] = (semesterStartStr || '01 09').split(' ').map((d) => d.trim());
  const semesterStart = new Date(currentYear, parseInt(startMonth, 10) - 1, parseInt(startDay, 10));

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

        // Разница в днях от даты первой недели семестра
        const diffTime = startDate.getTime() - semesterStart.getTime();
        const diffDays = Math.floor(diffTime / msPerDay);

        // Делим на 7 дней, +1 так как старт с 1-й недели
        const weekNumber = Math.floor(diffDays / 7) + 1;

        title = `Неделя ${weekNumber}. ${item.name}`;
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
