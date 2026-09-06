// Кнопка «Сделать заказ» в диалоге выбора времени.
//
// LMS показывает варианты слотов списком; те, где кончились места, помечены
// «Нет мест» и выбрать их нельзя. Именно на них и вешается кнопка: занять слот
// можно только в обмен на свой, а свести двоих готовых поменяться — задача
// бекенда.

if (typeof window.__culmsSwapButtonInit === 'undefined') {
  window.__culmsSwapButtonInit = true;

  const ITEM_SELECTOR = '.events-list__item';
  const MARKER_CLASS = 'culms-swap-mounted';

  const EVENT_TYPES = { лекция: 'lecture', семинар: 'seminar' };

  const DAY_NAMES = {
    monday: 'Понедельник',
    tuesday: 'Вторник',
    wednesday: 'Среда',
    thursday: 'Четверг',
    friday: 'Пятница',
    saturday: 'Суббота',
    sunday: 'Воскресенье',
  };

  const swap = () => window.__culmsSwap;

  /**
   * Разбирает подзаголовок диалога вида «Семинар 1 «Название курса»».
   * Номер может отсутствовать — тогда строка расписания в API единственная,
   * с eventRowNumber = 1.
   */
  function parseDialogHeader(dialog) {
    const subtitle = dialog.querySelector('.header .font-text-m');
    if (!subtitle) return null;

    const text = subtitle.textContent.trim();
    const match = text.match(/^([А-Яа-яЁё]+)\s*(\d+)?\s*[«"](.+)[»"]\s*$/);
    if (!match) return null;

    const eventType = EVENT_TYPES[match[1].toLowerCase()];
    if (!eventType) return null;

    return {
      eventType,
      eventRowNumber: match[2] ? parseInt(match[2], 10) : 1,
      courseName: match[3].trim(),
    };
  }

  /** Ищет курс по названию из заголовка диалога. */
  function findCourse(timetable, courseName) {
    const exact = timetable.find((c) => c.courseName === courseName);
    if (exact) return exact;

    // В таблице у некоторых курсов название с эмодзи-префиксом — сравниваем
    // по первой букве и дальше.
    const normalize = (s) => s.replace(/^[^\p{L}\p{N}]+/u, '').trim();
    const target = normalize(courseName);
    return timetable.find((c) => normalize(c.courseName) === target) || null;
  }

  /**
   * Проверяет, что n-й пункт списка в разметке — это действительно n-й вариант
   * из ответа API. Порядок совпадает, но связывать заказ не с тем слотом
   * дороже, чем не показать кнопку.
   */
  function itemMatchesOption(item, option) {
    const timeNode = item.querySelector('.font-text-m-bold');
    if (!timeNode) return false;

    const schedule = option.schedule || {};
    const expected = `${DAY_NAMES[schedule.dayOfWeek] || ''}, ${schedule.startTime} - ${schedule.endTime}`;
    return timeNode.textContent.trim() === expected;
  }

  function createButton(label, variant) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `culms-swap-btn culms-swap-btn_${variant}`;
    button.textContent = label;
    return button;
  }

  function createHint(text) {
    const hint = document.createElement('div');
    hint.className = 'culms-swap-hint';
    hint.textContent = text;
    return hint;
  }

  /** Открывает меню «Мои запросы» и подсвечивает выбор способа связи. */
  function askForContact() {
    window.dispatchEvent(new CustomEvent('culms-swap-request-contact'));
  }

  function mountRow(item, context) {
    const row = document.createElement('div');
    row.className = 'culms-swap-row';

    // Пункт списка сам по себе <button>; без остановки всплытия клик уйдёт в
    // LMS и та попробует выбрать недоступный слот.
    row.addEventListener('click', (e) => e.stopPropagation());
    item.appendChild(row);
    item.classList.add(MARKER_CLASS);

    render(row, context);
    return row;
  }

  function render(row, context) {
    row.textContent = '';

    if (context.error) {
      row.appendChild(createHint(context.error));
      return;
    }

    if (context.order) {
      const status = context.order.status;
      if (status === 'matched' && context.order.match) {
        row.appendChild(createHint('Нашлось совпадение — смотри «Мои запросы» внизу страницы'));
      } else if (status === 'completed') {
        row.appendChild(createHint('Обмен закрыт'));
      } else {
        row.appendChild(createHint('Заказ создан, ищем встречный'));
      }

      if (status === 'open' || status === 'matched') {
        const cancel = createButton('Отменить заказ', 'ghost');
        cancel.addEventListener('click', () => cancelOrder(row, context));
        row.appendChild(cancel);
      }
      return;
    }

    const create = createButton('Сделать заказ', 'primary');
    create.addEventListener('click', () => createOrder(row, context));
    row.appendChild(create);

    if (context.demand > 0) {
      const word = context.demand === 1 ? 'человек готов' : 'человека готовы';
      row.appendChild(createHint(`${context.demand} ${word} отдать этот слот`));
    }
  }

  async function createOrder(row, context) {
    row.textContent = '';
    row.appendChild(createHint('Создаём заказ…'));

    try {
      const contact = await swap().getStoredContact();
      if (!contact) {
        // Пока студент не выбрал способ связи, отправлять на сервер нечего:
        // совпадение без контакта бесполезно обеим сторонам.
        context.error = null;
        render(row, context);
        row.appendChild(createHint('Сначала выбери способ связи в «Мои запросы» внизу страницы'));
        askForContact();
        return;
      }

      context.order = await swap().createOrder(context.payload);
      window.dispatchEvent(new CustomEvent('culms-swap-orders-changed'));
    } catch (e) {
      swap().log('не удалось создать заказ:', e);
      context.error = `Не получилось: ${e.message}`;
    }

    render(row, context);
    context.error = null;
  }

  async function cancelOrder(row, context) {
    row.textContent = '';
    row.appendChild(createHint('Отменяем…'));

    try {
      await swap().cancelOrder(context.order.id);
      context.order = null;
      window.dispatchEvent(new CustomEvent('culms-swap-orders-changed'));
    } catch (e) {
      swap().log('не удалось отменить заказ:', e);
      context.error = `Не получилось: ${e.message}`;
    }

    render(row, context);
    context.error = null;
  }

  /** Заказы студента, разложенные по желаемому слоту. */
  async function loadOrdersByWanted() {
    const contact = await swap().getStoredContact();
    if (!contact) return {};

    try {
      const data = await swap().listOrders();
      return Object.fromEntries(data.orders.map((o) => [o.wanted_event_id, o]));
    } catch (e) {
      swap().log('заказы недоступны:', e.message);
      return {};
    }
  }

  async function decorateDialog(dialog) {
    const header = parseDialogHeader(dialog);
    if (!header) return;

    const timetable = await swap().getTimetable();
    const course = findCourse(timetable, header.courseName);
    if (!course) {
      swap().log('курс не найден по названию из диалога:', header.courseName);
      return;
    }

    const current = swap().findCurrentSlot(
      timetable,
      course.courseId,
      header.eventType,
      header.eventRowNumber
    );
    if (!current) return;

    const options = await swap().getEventOptions(
      course.courseId,
      header.eventType,
      header.eventRowNumber
    );

    const items = dialog.querySelectorAll(ITEM_SELECTOR);
    if (items.length !== options.length) {
      swap().log(`разметка и API разошлись: ${items.length} против ${options.length}`);
      return;
    }

    const orderable = [];
    options.forEach((option, index) => {
      const item = items[index];
      if (!item || item.classList.contains(MARKER_CLASS)) return;
      if (option.calendarEventId === current.calendarEventId) return;
      if (!swap().isOrderable(option)) return;
      if (!itemMatchesOption(item, option)) {
        swap().log('пункт списка не совпал со слотом из API, пропускаем');
        return;
      }
      orderable.push({ item, option });
    });

    if (!orderable.length) return;

    const [ordersByWanted, demand] = await Promise.all([
      loadOrdersByWanted(),
      swap().getDemand(orderable.map((o) => o.option.calendarEventId)),
    ]);

    orderable.forEach(({ item, option }) => {
      mountRow(item, {
        order: ordersByWanted[option.calendarEventId] || null,
        demand: demand[option.calendarEventId] || 0,
        error: null,
        payload: {
          course_id: course.courseId,
          course_name: course.courseName,
          event_type: header.eventType,
          event_row_number: header.eventRowNumber,
          offered_event_id: current.calendarEventId,
          offered_label: swap().slotLabel(current),
          wanted_event_id: option.calendarEventId,
          wanted_label: swap().slotLabel(option),
        },
      });
    });
  }

  let pending = null;
  let running = false;

  function scheduleDecorate() {
    if (pending) clearTimeout(pending);
    pending = setTimeout(async () => {
      pending = null;
      if (running) return;

      const dialog = document.querySelector('[data-appearance="drawer"] .events-list');
      if (!dialog) return;

      const container = dialog.closest('form') || dialog.parentElement;
      if (!container || !container.querySelector(`${ITEM_SELECTOR}:not(.${MARKER_CLASS})`)) return;

      running = true;
      try {
        await decorateDialog(container);
      } catch (e) {
        swap().log('не удалось разметить диалог:', e);
      } finally {
        running = false;
      }
    }, 200);
  }

  const observer = new MutationObserver(scheduleDecorate);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleDecorate();
}
