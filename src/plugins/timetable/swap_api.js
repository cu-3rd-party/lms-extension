// Клиент биржи обмена парами. Скрипт ничего не рисует — только собирает данные
// из LMS и ходит на бекенд. Интерфейсом занимаются swap_order_button.js и
// swap_menu.js.
//
// Бекенд: https://github.com/cu-3rd-party/lms-swap-backend

if (typeof window.__culmsSwapApiInit === 'undefined') {
  window.__culmsSwapApiInit = true;

  const SWAP_BACKEND_URL = 'https://lms.swap.cu3rd.ru';

  const STORAGE_DEVICE_KEY = 'swapDeviceKey';
  const STORAGE_CONTACT = 'swapContact';

  const api = typeof browser !== 'undefined' ? browser : chrome;

  // Расписание меняется редко, а диалог выбора времени открывают подряд по
  // нескольким строкам — держим ответ в памяти на время жизни страницы.
  let timetableCache = null;
  let identityCache = null;

  function log(...args) {
    if (typeof cuLmsLog === 'function') cuLmsLog('[Swap]', ...args);
  }

  // --- Данные из LMS ---------------------------------------------------------

  /**
   * Идентификатор студента и доступные способы связи.
   *
   * `/students/me` отдаёт заодно ИНН, СНИЛС, телефон и дату рождения — сюда
   * попадают только те три поля, которые нужны бирже, дальше по коду остальное
   * не уходит вообще никуда.
   */
  async function getIdentity() {
    if (identityCache) return identityCache;

    const response = await fetch('/api/student-hub/students/me', { credentials: 'include' });
    if (!response.ok) throw new Error(`students/me: HTTP ${response.status}`);
    const data = await response.json();

    const cuEmail = (data.emails || []).find((e) => e.type === 'Cu');
    identityCache = {
      studentId: data.id,
      cuEmail: cuEmail ? cuEmail.value : null,
      telegram: data.telegram || null,
    };
    return identityCache;
  }

  /** Расписание студента: строки с курсами и текущими слотами. */
  async function getTimetable() {
    if (timetableCache) return timetableCache;

    const response = await fetch('/api/micro-lms/students/me/timetables', {
      credentials: 'include',
    });
    if (!response.ok) throw new Error(`timetables: HTTP ${response.status}`);
    timetableCache = await response.json();
    return timetableCache;
  }

  /** Варианты слотов для одной строки расписания. */
  async function getEventOptions(courseId, eventType, eventRowNumber) {
    const url = `/api/micro-lms/students/me/timetables/${courseId}/${eventType}/${eventRowNumber}`;
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) throw new Error(`event options: HTTP ${response.status}`);
    return response.json();
  }

  /**
   * Слот, на котором студент сидит сейчас, — его он и отдаёт в обмен.
   * Берём из расписания, а не из подсветки в диалоге: разметка может
   * поменяться, ответ API — вряд ли.
   */
  function findCurrentSlot(timetable, courseId, eventType, eventRowNumber) {
    const course = timetable.find((c) => c.courseId === courseId);
    if (!course) return null;

    const row = (course.eventRows || []).find(
      (r) => r.eventType === eventType && r.eventRowNumber === eventRowNumber
    );
    return row && row.calendarEvent ? row.calendarEvent : null;
  }

  /** Человекочитаемая подпись слота — её увидит вторая сторона обмена. */
  function slotLabel(slot) {
    if (!slot) return '';

    const days = {
      monday: 'Понедельник',
      tuesday: 'Вторник',
      wednesday: 'Среда',
      thursday: 'Четверг',
      friday: 'Пятница',
      saturday: 'Суббота',
      sunday: 'Воскресенье',
    };

    const schedule = slot.schedule || {};
    const day = days[schedule.dayOfWeek] || schedule.dayOfWeek || '';
    const time = schedule.startTime ? `${schedule.startTime} - ${schedule.endTime}` : '';
    const host = (slot.hosts || []).map((h) => (h.name || '').trim()).join(', ');
    const room = slot.location ? slot.location.title : '';

    return [day, time, host, room].filter(Boolean).join(', ').slice(0, 255);
  }

  /**
   * Слот доступен для заказа, если мест нет, но по времени он подходит.
   *
   * Свободный слот заказывать незачем — на него можно записаться прямо в LMS.
   * Слот с пересечением по времени бесполезен: даже освободись место, LMS
   * не даст на него пересесть.
   */
  function isOrderable(option) {
    const conflicts = option.conflicts || [];
    if (conflicts.length === 0) return false;

    const hasCapacity = conflicts.some((c) => c.conflictType === 'capacity');
    const hasTime = conflicts.some((c) => c.conflictType === 'time');
    return hasCapacity && !hasTime;
  }

  // --- Локальное состояние ---------------------------------------------------

  /**
   * Ключ устройства. Токен сессии LMS лежит в HttpOnly-куках и недоступен
   * скрипту, поэтому бекенд опознаёт студента по этому ключу — он
   * генерируется один раз и живёт в storage.local.
   */
  async function getDeviceKey() {
    const stored = await api.storage.local.get(STORAGE_DEVICE_KEY);
    if (stored[STORAGE_DEVICE_KEY]) return stored[STORAGE_DEVICE_KEY];

    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const key = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    await api.storage.local.set({ [STORAGE_DEVICE_KEY]: key });
    return key;
  }

  /** Выбранный способ связи, как его последний раз сохранил студент. */
  async function getStoredContact() {
    const stored = await api.storage.local.get(STORAGE_CONTACT);
    return stored[STORAGE_CONTACT] || null;
  }

  async function setStoredContact(contact) {
    await api.storage.local.set({ [STORAGE_CONTACT]: contact });
  }

  /**
   * Контакт по умолчанию: студпочта, если она есть, иначе телеграм из ЛК.
   * Если в личном кабинете нет ни того, ни другого — студенту придётся
   * вписать что-то своё.
   */
  function defaultContact(identity) {
    if (identity.cuEmail) return { contact_type: 'cu_email', contact_value: identity.cuEmail };
    if (identity.telegram) {
      return { contact_type: 'telegram', contact_value: normalizeTelegram(identity.telegram) };
    }
    return null;
  }

  function normalizeTelegram(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
  }

  // --- Запросы к бекенду -----------------------------------------------------

  /**
   * Запрос идёт через background, а не напрямую отсюда: в Firefox
   * content-скрипты не получают обход CORS из host_permissions, и прямой
   * кросс-доменный fetch падает даже при корректных заголоках сервера.
   */
  async function request(method, path, body, options = {}) {
    const identity = await getIdentity();
    const deviceKey = await getDeviceKey();

    const response = await api.runtime.sendMessage({
      action: 'SWAP_API',
      method,
      url: `${SWAP_BACKEND_URL}${path}`,
      body,
      headers: options.anonymous
        ? {}
        : { Authorization: `Bearer ${deviceKey}`, 'X-Student-Id': identity.studentId },
    });

    if (!response) throw new Error('нет ответа от background');
    if (!response.success) {
      const error = new Error(response.error || 'запрос не удался');
      error.status = response.status;
      throw error;
    }
    return response.data;
  }

  /**
   * Привязывает студента к устройству и заодно сохраняет способ связи.
   * Повторный вызов с тем же ключом — обычное дело: так же обновляется контакт.
   */
  async function register(contact) {
    const identity = await getIdentity();
    const deviceKey = await getDeviceKey();

    const data = await request(
      'POST',
      '/api/v1/register',
      {
        student_id: identity.studentId,
        device_key: deviceKey,
        contact_type: contact.contact_type,
        contact_value: contact.contact_value,
      },
      { anonymous: true }
    );

    await setStoredContact(contact);
    return data;
  }

  /** Сохраняет контакт, регистрируя студента, если тот ещё не зарегистрирован. */
  async function saveContact(contact) {
    try {
      const data = await request('PUT', '/api/v1/me/contact', contact);
      await setStoredContact(contact);
      return data;
    } catch (e) {
      if (e.status === 401) return register(contact);
      throw e;
    }
  }

  const listOrders = () => request('GET', '/api/v1/orders');
  const createOrder = (payload) => request('POST', '/api/v1/orders', payload);
  const cancelOrder = (orderId) => request('DELETE', `/api/v1/orders/${orderId}`);
  const confirmMatch = (matchId) => request('POST', `/api/v1/matches/${matchId}/confirm`);
  const declineMatch = (matchId) => request('POST', `/api/v1/matches/${matchId}/decline`);

  /** Сколько человек готовы отдать каждый из слотов. Пустой объект при ошибке. */
  async function getDemand(eventIds) {
    if (!eventIds.length) return {};
    try {
      const query = eventIds.map((id) => `wanted_event_id=${encodeURIComponent(id)}`).join('&');
      const data = await request('GET', `/api/v1/demand?${query}`);
      return Object.fromEntries(data.map((d) => [d.wanted_event_id, d.offers]));
    } catch (e) {
      log('demand недоступен:', e.message);
      return {};
    }
  }

  window.__culmsSwap = {
    SWAP_BACKEND_URL,
    getIdentity,
    getTimetable,
    getEventOptions,
    findCurrentSlot,
    slotLabel,
    isOrderable,
    normalizeTelegram,
    defaultContact,
    getStoredContact,
    setStoredContact,
    register,
    saveContact,
    listOrders,
    createOrder,
    cancelOrder,
    confirmMatch,
    declineMatch,
    getDemand,
    log,
  };
}
