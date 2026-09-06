// Меню «Мои запросы» внизу страницы записи на пары.
//
// Здесь студент выбирает, как с ним связываться, и видит свои заказы вместе с
// найденными совпадениями. Сами заказы создаются в диалоге выбора времени —
// см. swap_order_button.js.

if (typeof window.__culmsSwapMenuInit === 'undefined') {
  window.__culmsSwapMenuInit = true;

  const MENU_ID = 'culms-swap-menu';
  const ANCHOR_SELECTOR = 'cu-student-timetable-events';
  const POLL_INTERVAL_MS = 20000;

  const swap = () => window.__culmsSwap;

  let pollTimer = null;
  let identity = null;

  /**
   * Плагин cu-clubs переиспользует адрес /learn/timetable: по хэшу #cuclubs он
   * прячет `cu-student-timetable-events` и рисует на его месте страницу клубов.
   * Наше меню — соседний узел, а не потомок, поэтому само оно не спрячется.
   */
  function isClubsPage() {
    return window.location.hash === '#cuclubs';
  }

  function syncVisibility() {
    const menu = document.getElementById(MENU_ID);
    if (menu) menu.hidden = isClubsPage();
  }

  // --- Разметка --------------------------------------------------------------

  function buildMenu() {
    const section = document.createElement('section');
    section.id = MENU_ID;
    section.className = 'culms-swap-menu';

    section.innerHTML = `
      <div class="culms-swap-menu__head">
        <h2 class="culms-swap-menu__title">Мои запросы</h2>
        <span class="culms-swap-menu__badge">биржа обмена парами</span>
      </div>
      <p class="culms-swap-menu__lead">
        Если нужная пара помечена «Нет мест», оставь заказ прямо в окне выбора времени.
        Когда найдётся тот, кто хочет твой слот, а отдаёт нужный тебе, — вы увидите
        контакты друг друга. Дальше договариваетесь и идёте к куратору: местами
        вас меняет он, через интерфейс LMS это сделать нельзя.
      </p>

      <div class="culms-swap-contact" data-role="contact">
        <div class="culms-swap-contact__title">Как с тобой связаться</div>
        <div class="culms-swap-contact__options" data-role="options"></div>
        <input
          class="culms-swap-contact__custom"
          data-role="custom-input"
          type="text"
          maxlength="200"
          placeholder="@username, почта или ссылка"
          hidden
        />
        <div class="culms-swap-contact__actions">
          <button type="button" class="culms-swap-btn culms-swap-btn_primary" data-role="save">
            Сохранить
          </button>
          <span class="culms-swap-contact__status" data-role="contact-status"></span>
        </div>
        <p class="culms-swap-contact__note">
          Контакт увидит только тот, с кем совпал обмен. Больше о тебе на сервер ничего не уходит.
        </p>
      </div>

      <div class="culms-swap-orders" data-role="orders">
        <div class="culms-swap-empty">Загружаем заказы…</div>
      </div>
    `;

    return section;
  }

  function contactOption(value, label, hint, disabled) {
    const wrapper = document.createElement('label');
    wrapper.className = 'culms-swap-option' + (disabled ? ' culms-swap-option_disabled' : '');

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'culms-swap-contact-type';
    input.value = value;
    input.disabled = disabled;

    const text = document.createElement('span');
    text.className = 'culms-swap-option__label';
    text.textContent = label;

    wrapper.append(input, text);

    if (hint) {
      const hintNode = document.createElement('span');
      hintNode.className = 'culms-swap-option__hint';
      hintNode.textContent = hint;
      wrapper.appendChild(hintNode);
    }

    return wrapper;
  }

  function renderContactOptions(root) {
    const options = root.querySelector('[data-role="options"]');
    const customInput = root.querySelector('[data-role="custom-input"]');
    options.textContent = '';

    const telegram = identity.telegram ? swap().normalizeTelegram(identity.telegram) : null;

    options.append(
      contactOption(
        'cu_email',
        'Студенческая почта',
        identity.cuEmail || 'в личном кабинете не указана',
        !identity.cuEmail
      ),
      contactOption(
        'telegram',
        'Телеграм из личного кабинета',
        telegram || 'в личном кабинете не указан',
        !telegram
      ),
      contactOption('custom', 'Указать другое', '', false)
    );

    options.addEventListener('change', () => {
      customInput.hidden = selectedType(root) !== 'custom';
      if (!customInput.hidden) customInput.focus();
    });
  }

  function selectedType(root) {
    const checked = root.querySelector('input[name="culms-swap-contact-type"]:checked');
    return checked ? checked.value : null;
  }

  function selectType(root, type) {
    const input = root.querySelector(`input[name="culms-swap-contact-type"][value="${type}"]`);
    if (input && !input.disabled) input.checked = true;
    root.querySelector('[data-role="custom-input"]').hidden = type !== 'custom';
  }

  // --- Способ связи ----------------------------------------------------------

  function contactFromForm(root) {
    const type = selectedType(root);
    if (!type) return { error: 'Выбери способ связи' };

    if (type === 'custom') {
      const value = root.querySelector('[data-role="custom-input"]').value.trim();
      if (!value) return { error: 'Впиши, как с тобой связаться' };
      return { contact: { contact_type: 'custom', contact_value: value } };
    }

    if (type === 'cu_email') {
      return { contact: { contact_type: 'cu_email', contact_value: identity.cuEmail } };
    }

    return {
      contact: {
        contact_type: 'telegram',
        contact_value: swap().normalizeTelegram(identity.telegram),
      },
    };
  }

  async function saveContact(root) {
    const status = root.querySelector('[data-role="contact-status"]');
    const { contact, error } = contactFromForm(root);

    if (error) {
      status.textContent = error;
      status.className = 'culms-swap-contact__status culms-swap-contact__status_error';
      return;
    }

    status.textContent = 'Сохраняем…';
    status.className = 'culms-swap-contact__status';

    try {
      await swap().saveContact(contact);
      status.textContent = 'Сохранено';
      status.className = 'culms-swap-contact__status culms-swap-contact__status_ok';
      await refreshOrders(root);
    } catch (e) {
      swap().log('не удалось сохранить контакт:', e);
      status.textContent = `Не получилось: ${e.message}`;
      status.className = 'culms-swap-contact__status culms-swap-contact__status_error';
    }
  }

  async function restoreContact(root) {
    const stored = await swap().getStoredContact();
    const contact = stored || swap().defaultContact(identity);
    if (!contact) return;

    selectType(root, contact.contact_type);
    if (contact.contact_type === 'custom') {
      root.querySelector('[data-role="custom-input"]').value = contact.contact_value;
    }

    if (!stored) {
      // Значение подставлено по умолчанию и на сервер ещё не уходило —
      // говорим об этом прямо, чтобы студент нажал «Сохранить» осознанно.
      const status = root.querySelector('[data-role="contact-status"]');
      status.textContent = 'Проверь и нажми «Сохранить»';
      status.className = 'culms-swap-contact__status';
    }
  }

  // --- Заказы ----------------------------------------------------------------

  // Закрытые заказы сервер не отдаёт вовсе — показывать тут нечего.
  const STATUS_LABELS = {
    open: 'Ищем встречный заказ',
    matched: 'Нашлось совпадение',
  };

  const CONTACT_LABELS = {
    cu_email: 'Студенческая почта',
    telegram: 'Телеграм',
    custom: 'Контакт',
  };

  function renderOrder(order) {
    const card = document.createElement('article');
    card.className = `culms-swap-order culms-swap-order_${order.status}`;

    const head = document.createElement('div');
    head.className = 'culms-swap-order__head';

    const course = document.createElement('div');
    course.className = 'culms-swap-order__course';
    course.textContent = order.course_name;

    const status = document.createElement('span');
    status.className = `culms-swap-status culms-swap-status_${order.status}`;
    status.textContent = STATUS_LABELS[order.status] || order.status;

    head.append(course, status);

    const swapLine = document.createElement('div');
    swapLine.className = 'culms-swap-order__slots';
    swapLine.innerHTML = `
      <div class="culms-swap-slot">
        <span class="culms-swap-slot__caption">отдаёшь</span>
        <span class="culms-swap-slot__value"></span>
      </div>
      <span class="culms-swap-order__arrow">→</span>
      <div class="culms-swap-slot">
        <span class="culms-swap-slot__caption">хочешь</span>
        <span class="culms-swap-slot__value"></span>
      </div>
    `;
    const values = swapLine.querySelectorAll('.culms-swap-slot__value');
    values[0].textContent = order.offered_label;
    values[1].textContent = order.wanted_label;

    card.append(head, swapLine);

    if (order.match) {
      card.appendChild(renderMatch(order.match));
    }

    // У сосватанного заказа отмены нет: рядом уже стоит ОК, а две кнопки с
    // разным смыслом на одной карточке только путают.
    if (order.status === 'open') {
      const actions = document.createElement('div');
      actions.className = 'culms-swap-order__actions';

      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'culms-swap-btn culms-swap-btn_ghost';
      cancel.textContent = 'Отменить заказ';
      cancel.addEventListener('click', () => withBusy(cancel, () => swap().cancelOrder(order.id)));
      actions.appendChild(cancel);

      card.appendChild(actions);
    }

    return card;
  }

  function renderMatch(match) {
    const box = document.createElement('div');
    box.className = 'culms-swap-match';

    const title = document.createElement('div');
    title.className = 'culms-swap-match__title';
    title.textContent = 'Нашёлся человек для обмена';

    const contact = document.createElement('div');
    contact.className = 'culms-swap-match__contact';
    contact.textContent = `${CONTACT_LABELS[match.counterpart_contact_type]}: ${match.counterpart_contact_value}`;

    const detail = document.createElement('div');
    detail.className = 'culms-swap-match__detail';
    detail.textContent = `Он отдаёт: ${match.counterpart_gives_label}`;

    const hint = document.createElement('p');
    hint.className = 'culms-swap-match__hint';
    hint.textContent =
      'Свяжитесь, убедитесь, что меняться хотят оба, и напишите куратору — ' +
      'он поменяет вас местами вручную. Сами вы пересесть не сможете: оба слота ' +
      'заняты под завязку, и LMS не даст занять чужое место, пока его не освободили.';

    const actions = document.createElement('div');
    actions.className = 'culms-swap-match__actions';

    // Одна кнопка вместо «обменялись / не получилось»: чем кончился разговор с
    // куратором, сервису знать незачем. ОК просто убирает карточку у нажавшего.
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'culms-swap-btn culms-swap-btn_primary';
    ok.textContent = 'ОК';
    ok.title = 'Убрать из «Моих запросов»';
    ok.addEventListener('click', () => withBusy(ok, () => swap().closeMatch(match.id)));

    actions.append(ok);
    box.append(title, contact, detail, hint, actions);
    return box;
  }

  /** Блокирует кнопку на время запроса и перерисовывает список после него. */
  async function withBusy(button, action) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Секунду…';
    try {
      await action();
    } catch (e) {
      swap().log('действие не удалось:', e);
      button.textContent = 'Не получилось';
      setTimeout(() => {
        button.textContent = original;
        button.disabled = false;
      }, 2000);
      return;
    }
    await refreshOrders(document.getElementById(MENU_ID));
  }

  function renderEmpty(text) {
    const empty = document.createElement('div');
    empty.className = 'culms-swap-empty';
    empty.textContent = text;
    return empty;
  }

  async function refreshOrders(root) {
    if (!root) return;
    const container = root.querySelector('[data-role="orders"]');

    const contact = await swap().getStoredContact();
    if (!contact) {
      container.textContent = '';
      container.appendChild(
        renderEmpty('Выбери способ связи и сохрани его — после этого можно оставлять заказы.')
      );
      return;
    }

    let data;
    try {
      data = await swap().listOrders();
    } catch (e) {
      swap().log('не удалось загрузить заказы:', e);
      container.textContent = '';
      container.appendChild(renderEmpty(`Биржа недоступна: ${e.message}`));
      return;
    }

    container.textContent = '';

    if (!data.orders.length) {
      container.appendChild(
        renderEmpty('Заказов пока нет. Открой время у нужной пары и нажми «Сделать заказ».')
      );
      return;
    }

    // Совпадения — наверх: это единственное, что требует действий студента.
    const weight = { matched: 0, open: 1 };
    const sorted = [...data.orders].sort(
      (a, b) => (weight[a.status] ?? 2) - (weight[b.status] ?? 2)
    );
    sorted.forEach((order) => container.appendChild(renderOrder(order)));
  }

  // --- Монтирование ----------------------------------------------------------

  function startPolling(root) {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (!document.getElementById(MENU_ID)) {
        clearInterval(pollTimer);
        pollTimer = null;
        return;
      }
      // Пока открыта страница клубов, меню скрыто — дёргать сервер незачем.
      if (isClubsPage()) return;
      refreshOrders(root);
    }, POLL_INTERVAL_MS);
  }

  async function mount(anchor) {
    if (document.getElementById(MENU_ID)) return;

    identity = await swap().getIdentity();

    const menu = buildMenu();
    anchor.parentElement.insertBefore(menu, anchor.nextSibling);

    syncVisibility();
    renderContactOptions(menu);
    await restoreContact(menu);
    menu.querySelector('[data-role="save"]').addEventListener('click', () => saveContact(menu));
    menu.querySelector('[data-role="custom-input"]').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveContact(menu);
    });

    await refreshOrders(menu);
    startPolling(menu);

    window.addEventListener('culms-swap-orders-changed', () => refreshOrders(menu));
    window.addEventListener('culms-swap-request-contact', () => {
      const contactBox = menu.querySelector('[data-role="contact"]');
      contactBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      contactBox.classList.add('culms-swap-contact_attention');
      setTimeout(() => contactBox.classList.remove('culms-swap-contact_attention'), 2500);
    });
  }

  let mounting = false;

  function tryMount() {
    if (document.getElementById(MENU_ID)) {
      syncVisibility();
      return;
    }
    if (mounting || isClubsPage()) return;

    const anchor = document.querySelector(ANCHOR_SELECTOR);
    if (!anchor || !anchor.querySelector('table.cu-table tbody tr')) return;

    mounting = true;
    mount(anchor)
      .catch((e) => swap().log('не удалось собрать меню:', e))
      .finally(() => {
        mounting = false;
      });
  }

  const observer = new MutationObserver(tryMount);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('hashchange', tryMount);
  tryMount();
}
