// contest_tasks_fix.js
// Показывает в таблице задач LMS, сколько задач решено в привязанном Яндекс.Контесте.
//
// В отличие от AKH-интеграции скрипт работает в isolated world и ходит в фон
// напрямую через browser.runtime.sendMessage — мост в page-context не нужен,
// потому что токены отсюда не требуются, а DOM у обоих миров общий.
//
// Вся сеть и все кеши живут в background (YandexContestServices). Здесь остаётся
// только сопоставление строк таблицы с ответом и отрисовка бейджей.

if (typeof window.__culmsContestTasksInitialized === 'undefined') {
  window.__culmsContestTasksInitialized = true;

  ('use strict');

  const POLL_INTERVAL = 3000;
  // Насколько устаревшими считаем данные, прежде чем спросить фон заново.
  // Совпадает с CONTEST_TTL в background: более частый запрос всё равно вернёт кеш.
  const DATA_TTL = 5 * 60 * 1000;
  const PROCESSED_ATTR = 'culmsContest';
  const BADGE_CLASS = 'culms-contest-badge';

  const STATE_LABELS = {
    not_entered: { text: 'не начат', color: '#A0A0A0', hint: 'Вы ещё не вошли в контест' },
    error: { text: 'ошибка', color: '#A0A0A0', hint: 'Не удалось получить данные контеста' },
  };

  // Про отсутствие авторизации на Яндексе сообщает попап расширения: иначе одна и та же
  // надпись продублировалась бы в каждой строке таблицы
  const SILENT_STATES = ['auth_required'];

  let entries = null;
  let entriesTs = 0;
  let isFetching = false;

  const isTasksPage = () => window.location.href.includes('/learn/tasks');

  // Плагин emoji-swap подменяет кружки на сердечки прямо в DOM, поэтому имена
  // курсов из API и из таблицы нужно приводить к общему виду перед сравнением.
  function normalize(text) {
    if (!text) return '';
    return text
      .split('❤️')
      .join('🔴')
      .split('💙')
      .join('🔵')
      .split('🖤')
      .join('⚫️')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function requestProgress() {
    return new Promise((resolve) => {
      browser.runtime
        .sendMessage({ action: 'CONTEST_FETCH_PROGRESS' })
        .then((response) => resolve(response && response.success ? response.data : null))
        .catch(() => resolve(null));
    });
  }

  function buildHint(entry) {
    if (entry.state !== 'ok') {
      return (STATE_LABELS[entry.state] || STATE_LABELS.error).hint;
    }
    const lines = (entry.problems || []).map((p) => `${p.solved ? '✓' : '—'} ${p.name}`);
    return [`Решено ${entry.solved} из ${entry.total}`, ...lines].join('\n');
  }

  function badgeConfig(entry) {
    if (entry.state !== 'ok') {
      const cfg = STATE_LABELS[entry.state] || STATE_LABELS.error;
      return { text: `КОНТЕСТ: ${cfg.text}`, color: cfg.color };
    }
    let color = '#A0A0A0';
    if (entry.total > 0 && entry.solved === entry.total) color = '#4CAF50';
    else if (entry.solved > 0) color = '#FF9800';
    return { text: `КОНТЕСТ: ${entry.solved}/${entry.total}`, color };
  }

  function renderBadge(row, entry) {
    const cell = row.querySelector('.task-table__state');
    if (!cell || cell.querySelector(`.${BADGE_CLASS}`)) return;

    const cfg = badgeConfig(entry);
    const badge = document.createElement('a');
    badge.className = BADGE_CLASS;
    badge.href = entry.contestUrl;
    badge.target = '_blank';
    badge.rel = 'noopener noreferrer';
    badge.title = buildHint(entry);
    badge.style = `display: block; font-size: 9px; font-weight: 800; color: ${cfg.color}; margin-top: 2px; letter-spacing: 0.5px; text-decoration: none;`;
    badge.textContent = cfg.text;
    cell.appendChild(badge);
  }

  function findEntry(row) {
    const taskName = normalize(row.querySelector('.task-table__task-name')?.textContent);
    const courseName = normalize(row.querySelector('.task-table__course-name')?.textContent);
    if (!taskName || !courseName) return null;

    return entries.find(
      (e) => normalize(e.taskName) === taskName && normalize(e.courseName) === courseName
    );
  }

  async function tick() {
    if (!isTasksPage() || isFetching) return;

    // Строки без метки появляются и при первой отрисовке, и после того, как
    // Angular перерисовал таблицу. Нет новых строк — не делаем ничего.
    const rows = Array.from(document.querySelectorAll('tr.task-table__task')).filter(
      (r) => !r.dataset[PROCESSED_ATTR]
    );
    if (rows.length === 0) return;

    if (!entries || Date.now() - entriesTs > DATA_TTL) {
      isFetching = true;
      try {
        const data = await requestProgress();
        if (data) {
          entries = data;
          entriesTs = Date.now();
        } else if (!entries) {
          // Интеграция выключена или фон не ответил — молча ждём следующего тика
          return;
        }
      } finally {
        isFetching = false;
      }
    }

    for (const row of rows) {
      const entry = findEntry(row);
      if (entry && SILENT_STATES.includes(entry.state)) {
        row.dataset[PROCESSED_ATTR] = entry.state;
      } else if (entry) {
        renderBadge(row, entry);
        row.dataset[PROCESSED_ATTR] = 'done';
      } else {
        row.dataset[PROCESSED_ATTR] = 'not_found';
      }
    }
  }

  browser.storage.sync.get('contestIntegrationEnabled').then((data) => {
    if (!data.contestIntegrationEnabled) return;
    setInterval(tick, POLL_INTERVAL);
    tick();
  });
}
