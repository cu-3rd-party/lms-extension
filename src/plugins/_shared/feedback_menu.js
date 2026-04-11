// feedback_loader.js
'use strict';

// --- КОНСТАНТЫ ---
var FEEDBACK_OVERLAY_ID = 'cu-plugin-feedback-overlay';
var FEEDBACK_BUTTON_ID = 'cu-plugin-feedback-button';

/**
 * Скрывает оверлей фидбека при навигации (SPA)
 */
function cleanupFeedbackState() {
  const overlay = document.getElementById(FEEDBACK_OVERLAY_ID);
  if (overlay) {
    overlay.style.display = 'none';
  }
}

// --- БЛОК ОДНОРАЗОВОЙ ИНИЦИАЛИЗАЦИИ ---
if (typeof window.isFeedbackLoaderInitialized === 'undefined') {
  window.isFeedbackLoaderInitialized = true;

  /**
   * Открывает/закрывает popup с формой фидбека
   */
  function handleFeedbackToggle() {
    // Если открыто основное меню плагина, закрываем его (чтобы не было нагромождения)
    const mainPluginOverlay = document.getElementById('cu-plugin-overlay-container');
    if (mainPluginOverlay) mainPluginOverlay.style.display = 'none';

    const overlay = document.getElementById(FEEDBACK_OVERLAY_ID);
    if (overlay) {
      overlay.style.display = overlay.style.display === 'flex' ? 'none' : 'flex';
    }
  }

  /**
   * Создает структуру окна (оверлей + iframe)
   */
  function createFeedbackStructure() {
    if (document.getElementById(FEEDBACK_OVERLAY_ID)) return;

    // Затемненный фон
    const overlay = document.createElement('div');
    overlay.id = FEEDBACK_OVERLAY_ID;
    overlay.style.cssText = `position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0, 0, 0, 0.6); z-index: 10001; display: none; justify-content: center; align-items: center; padding: 20px; box-sizing: border-box; backdrop-filter: blur(3px);`;

    // Контейнер с формой
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `width: 100%; max-width: 480px; height: 90vh; max-height: 700px; background: transparent; border-radius: 12px; overflow: hidden; position: relative; display: flex; flex-direction: column; box-shadow: 0 10px 30px rgba(0,0,0,0.3);`;

    // Кнопка закрытия
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = `position: absolute; top: 12px; right: 15px; width: 30px; height: 30px; background: #f3f4f6; color: #374151; border: none; border-radius: 50%; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10; transition: background 0.2s;`;
    closeBtn.onmouseover = () => (closeBtn.style.background = '#e5e7eb');
    closeBtn.onmouseout = () => (closeBtn.style.background = '#f3f4f6');
    closeBtn.addEventListener('click', () => {
      overlay.style.display = 'none';
    });

    // Iframe с вашей формой
    const iframe = document.createElement('iframe');
    iframe.src = 'https://feedback.cu3rd.ru/form';
    iframe.style.cssText = `width: 100%; height: 100%; border: none; background: #f9fafb;`; // Цвет подстраивается под вашу форму

    wrapper.appendChild(closeBtn);
    wrapper.appendChild(iframe);
    overlay.appendChild(wrapper);
    document.body.appendChild(overlay);

    // Закрытие при клике мимо окна
    overlay.addEventListener('click', () => {
      overlay.style.display = 'none';
    });
    wrapper.addEventListener('click', (e) => e.stopPropagation());
  }

  /**
   * Наблюдатель, который добавляет кнопку в меню профиля пользователя
   */
  function setupFeedbackButtonInjector() {
    const observer = new MutationObserver(() => {
      const userActionsList = document.querySelector('ul.user-actions');
      if (userActionsList && !document.getElementById(FEEDBACK_BUTTON_ID)) {
        const feedbackListItem = document.createElement('li');

        // Векторная иконка в base64 (сообщение), чтобы не создавать отдельный SVG файл
        const feedbackIcon =
          'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik0yMSAxMS41YTguMzggOC4zOCAwIDAgMS0uOSAzLjggOC41IDguNSAwIDAgMS03LjYgNC43IDguMzggOC4zOCAwIDAgMS0zLjgtLjlMMyAyMWwxLjktNS43YTguMzggOC4zOCAwIDAgMS0uOS0zLjggOC41IDguNSAwIDAgMSA0LjctNy42IDguMzggOC4zOCAwIDAgMSAzLjgtLjloLjVhOC40OCA4LjQ4IDAgMCAxIDggOHYuNXoiPjwvcGF0aD48L3N2Zz4=';

        feedbackListItem.innerHTML = `<button id="${FEEDBACK_BUTTON_ID}" tuiappearance="" tuiicons="" tuibutton="" type="button" size="m" class="user-actions__action-button" data-appearance="tertiary" data-icon-start="svg" data-size="m" style="--t-icon-start: url('${feedbackIcon}');"><div class="user-actions__action-title">Оставить фидбек</div></button>`;

        feedbackListItem
          .querySelector(`#${FEEDBACK_BUTTON_ID}`)
          .addEventListener('click', handleFeedbackToggle);
        userActionsList.appendChild(feedbackListItem);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Запуск логики
  createFeedbackStructure();
  setupFeedbackButtonInjector();
}

// Выполняется при каждом SPA-переходе (скрывает открытое окно, если страница поменялась)
cleanupFeedbackState();
