// Используем var для избежания ошибки already declared при перезагрузке расширения
var bonusButtonObserver = bonusButtonObserver || null;

/**
 * Скрывает или показывает кнопку "Бонус за друга"
 */
function toggleBonusButton(hide) {
  // Ищем кастомный тег кнопки
  const bonusAction = document.querySelector('cu-referrals-header-action');

  if (bonusAction) {
    // Находим родительский <li>, чтобы скрыть его целиком (иначе съедет верстка)
    const listItem = bonusAction.closest('li[automation-id="header-action"]');

    if (hide) {
      if (listItem) listItem.style.display = 'none';
      bonusAction.style.display = 'none';
    } else {
      if (listItem) listItem.style.display = '';
      bonusAction.style.display = '';
    }
  }
}

/**
 * Следит за появлением хедера (Angular может отрендерить его с задержкой)
 */
function observeBonusButtonChanges() {
  const targetNode = document.body;
  if (!targetNode) return;

  if (bonusButtonObserver) bonusButtonObserver.disconnect();

  bonusButtonObserver = new MutationObserver(() => {
    // Если кнопка появилась в DOM, скрываем её и можем остановить обзервер
    if (document.querySelector('cu-referrals-header-action')) {
      toggleBonusButton(true);
      // Если кнопка точно найдена и скрыта, можно отключить обзервер для экономии ресурсов
      // Но если хедер часто перерисовывается, лучше закомментировать строку ниже
      // bonusButtonObserver.disconnect();
    }
  });

  bonusButtonObserver.observe(targetNode, { childList: true, subtree: true });
}

// Подписываемся на изменения настроек в реальном времени (всплывающее окно)
browser.storage.onChanged.addListener((changes) => {
  if (changes.hideBonusButtonEnabled) {
    const isHidden = !!changes.hideBonusButtonEnabled.newValue;
    if (isHidden) {
      toggleBonusButton(true);
      observeBonusButtonChanges();
    } else {
      if (bonusButtonObserver) bonusButtonObserver.disconnect();
      toggleBonusButton(false);
    }
  }
});

// Старт: проверяем настройку при загрузке страницы
browser.storage.sync
  .get('hideBonusButtonEnabled')
  .then((data) => {
    const shouldHide = !!data.hideBonusButtonEnabled;
    if (shouldHide) {
      // Пробуем скрыть сразу
      toggleBonusButton(true);
      // Вешаем обзервер на случай, если Angular ещё не дорендерил хедер
      observeBonusButtonChanges();
    }
  })
  .catch((err) => {
    console.error('[hide_bonus] Failed to read settings:', err);
  });
