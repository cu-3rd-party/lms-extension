// apricot_tasks_fix.js
'use strict';

// 1. Инициализация Proxy с исправленным порядком событий
if (typeof window.__akhCheckApi === 'undefined') {
  window.__akhCheckApi = (() => {
    async function _callProxy(action, params = {}) {
      const requestId = Math.random().toString(36).substring(7);

      return new Promise((resolve, reject) => {
        // Жёсткий таймаут
        const timeout = setTimeout(() => {
          window.removeEventListener(`AKH_PROXY_RESPONSE_${requestId}`, handler);
          reject(new Error('AKH_PROXY_TIMEOUT (Таймаут ожидания ответа от плагина)'));
        }, 8000);

        const handler = (e) => {
          clearTimeout(timeout);
          window.removeEventListener(`AKH_PROXY_RESPONSE_${requestId}`, handler);

          let response;
          try {
            response = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail;
          } catch (_err) {
            response = null;
          }

          if (response && response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response ? response.error : 'Unknown Proxy Error'));
          }
        };

        // Важно: сначала добавляем слушатель
        window.addEventListener(`AKH_PROXY_RESPONSE_${requestId}`, handler);

        // Затем через setTimeout(0) отправляем запрос — это решает race condition
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('AKH_PROXY_REQUEST', {
              detail: JSON.stringify({ action, params, requestId }),
            })
          );
        }, 0);
      });
    }

    return {
      fetchCourseDetails: (id) => _callProxy('AKH_FETCH_COURSE_DETAILS', { courseId: id }),
      fetchTaskProgress: (id) => _callProxy('AKH_FETCH_PROGRESS', { taskId: id }),
      fetchAllProgress: () => _callProxy('AKH_FETCH_ALL_PROGRESS'),
    };
  })();
}

// 2. Основная логика
(async function () {
  // Курсы, выбранные в попапе. Скрипт работает в page-context и до storage не дотянется,
  // поэтому tasks_fix.js кладёт список имён в data-атрибут <html> — DOM у обоих миров общий.
  function getSelectedCourses() {
    try {
      const raw = document.documentElement.dataset.culmsAkhCourses;
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(normalizeCourseName) : [];
    } catch (_e) {
      return [];
    }
  }

  // Плагин emoji-swap подменяет кружки на сердечки прямо в DOM, поэтому имя курса
  // из таблицы и имя из API нужно привести к общему виду перед сравнением.
  function normalizeCourseName(name) {
    if (!name) return '';
    return name
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

  const STATUS_MAP = {
    Accepted: { text: 'ACCEPTED', color: '#4CAF50', priority: 1 },
    'On review': { text: 'ON REVIEW', color: '#FF9800', priority: 2 },
    'Rework after review': { text: 'REWORK', color: '#F44336', priority: 3 },
    Rework: { text: 'REWORK', color: '#F44336', priority: 3 },
    Rejected: { text: 'REJECTED', color: '#F44336', priority: 3 },
    None: { text: 'NONE', color: '#888', priority: 0 },
  };

  function normalize(name) {
    return name
      .toLowerCase()
      .replace(/дз\s*\d+\.?/g, '')
      .replace(/неделя\s*\d+\.?/g, '')
      .replace(/[^a-zа-яё0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Имена совпадают, если одно входит в другое. Пустое после normalize имя
  // («ДЗ 3.») входило бы в любое, поэтому такие не сравниваем вовсе.
  function namesMatch(lmsName, akhNameRaw) {
    const akhName = normalize(akhNameRaw || '');
    if (!lmsName || !akhName) return false;
    return lmsName.includes(akhName) || akhName.includes(lmsName);
  }

  function getHighestPriorityStatus(tasks) {
    if (!tasks || tasks.length === 0) return null;
    let highestPriority = -1;
    let bestStatus = null;
    for (const t of tasks) {
      const statusStr = t.status || 'None';
      const priority = STATUS_MAP[statusStr]?.priority || 0;
      if (priority > highestPriority) {
        highestPriority = priority;
        bestStatus = statusStr;
      }
    }
    return bestStatus;
  }

  function formatDeadline(isoString) {
    if (!isoString) return null;
    const d = new Date(isoString);
    const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const months = [
      'янв.',
      'февр.',
      'мар.',
      'апр.',
      'мая',
      'июн.',
      'июл.',
      'авг.',
      'сент.',
      'окт.',
      'нояб.',
      'дек.',
    ];
    return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  // Уведомление об ошибке авторизации
  function showAkhAuthNotification() {
    const bannerId = 'akh-auth-notification';
    let banner = document.getElementById(bannerId);

    if (!document.getElementById('akh-auth-styles')) {
      const style = document.createElement('style');
      style.id = 'akh-auth-styles';
      style.textContent = `
        #${bannerId} {
          position: fixed;
          bottom: 24px;
          right: 24px;
          width: 340px;
          background: #18181b;
          border: 1px solid #27272a;
          border-radius: 12px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
          z-index: 2147483647 !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          cursor: pointer;
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 16px;
          box-sizing: border-box;
          transition: all 0.2s ease;
          text-decoration: none;
        }
        #${bannerId}:hover {
          transform: translateY(-4px);
          box-shadow: 0 25px 30px -5px rgba(0, 0, 0, 0.3);
          border-color: #ef4444;
        }
        .akh-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .akh-content {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .akh-title {
          color: #f4f4f5;
          font-size: 14px;
          font-weight: 600;
          line-height: 1.4;
        }
        .akh-desc {
          color: #a1a1aa;
          font-size: 12px;
          font-weight: 400;
          line-height: 1.5;
        }
      `;
      document.head.appendChild(style);
    }

    if (!banner) {
      banner = document.createElement('div');
      banner.id = bannerId;
      banner.innerHTML = `
        <div class="akh-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
        </div>
        <div class="akh-content">
          <div class="akh-title">Ошибка AKH: нужна авторизация</div>
          <div class="akh-desc">Нажмите здесь, чтобы открыть akhcheck.ru. Нажмите там F5, а затем обновите эту страницу.</div>
        </div>
      `;

      banner.onclick = () => window.open('https://akhcheck.ru', '_blank');
      document.body.appendChild(banner);
    } else {
      banner.style.display = 'flex';
      if (banner.parentElement !== document.body) {
        document.body.appendChild(banner);
      }
    }
  }

  function removeAkhAuthNotification() {
    const notificationElement = document.getElementById('akh-auth-notification');
    if (notificationElement) {
      notificationElement.style.display = 'none';
    }
  }

  // Ищет задачу LMS в одном курсе AKHCheck. null — в этом курсе её нет.
  function matchInCourse(lmsName, { individualTasks, taskGroups, courseTasks }) {
    let finalStatus = null;
    let scoreStr = '';
    let akhDeadline = null;
    let isDeadlineUrgent = false;

    // Поиск по отдельным задачам
    const directMatches = individualTasks.filter((t) => namesMatch(lmsName, t.name));

    if (directMatches.length > 0) {
      finalStatus = getHighestPriorityStatus(directMatches);
      const curScore = directMatches.reduce((acc, t) => acc + (t.score || 0), 0);
      const maxScore = directMatches.reduce((acc, t) => acc + (t.maxScore || 0), 0);
      scoreStr = `${curScore}/${maxScore}`;
    } else {
      // Поиск по группам задач
      const groupMatch = taskGroups.find(
        (g) =>
          namesMatch(lmsName, g.groupName) ||
          (lmsName.includes('git') && g.groupName?.toLowerCase().includes('git'))
      );
      if (groupMatch && groupMatch.tasks?.length > 0) {
        finalStatus = getHighestPriorityStatus(groupMatch.tasks);
        const curScore = groupMatch.tasks.reduce((acc, t) => acc + (t.score || 0), 0);
        scoreStr = `${curScore}/${groupMatch.aggregatedMaxScore || 0}`;
      }
    }

    // Поиск дедлайна
    let matchedCourseTasks = courseTasks.filter((t) => namesMatch(lmsName, t.name));
    if (matchedCourseTasks.length === 0 && lmsName.includes('git')) {
      matchedCourseTasks = courseTasks.filter((t) => normalize(t.name).includes('git'));
    }

    const taskWithDeadline = matchedCourseTasks.find((t) => t.deadline);
    if (taskWithDeadline) {
      akhDeadline = formatDeadline(taskWithDeadline.deadline);
      const timeRemaining = new Date(taskWithDeadline.deadline).getTime() - Date.now();
      isDeadlineUrgent = timeRemaining < 24 * 60 * 60 * 1000;
    }

    if (!finalStatus && !akhDeadline) return null;
    return { finalStatus, scoreStr, akhDeadline, isDeadlineUrgent };
  }

  let isFetching = false;

  async function tick() {
    if (!window.__akhCheckApi || isFetching) return;

    const rows = Array.from(document.querySelectorAll('tr.task-table__task')).filter(
      (r) => !r.dataset.apricotProcessed
    );
    if (rows.length === 0) return;

    // Отсекаем чужие курсы до сети: если среди новых строк нет ни одной из выбранных,
    // запрашивать прогресс незачем
    const selectedCourses = getSelectedCourses();
    const targetRows = rows.filter((r) =>
      selectedCourses.includes(
        normalizeCourseName(r.querySelector('.task-table__course-name')?.textContent)
      )
    );
    rows.forEach((r) => {
      if (!targetRows.includes(r)) r.dataset.apricotProcessed = 'skip';
    });
    if (targetRows.length === 0) return;

    targetRows.forEach((r) => (r.dataset.apricotProcessed = 'processing'));
    isFetching = true;

    let allProgress;

    try {
      allProgress = await window.__akhCheckApi.fetchAllProgress();
      removeAkhAuthNotification();
    } catch (e) {
      console.warn('[CU LMS] AKH Fetch Failed:', e.message);
      showAkhAuthNotification();

      targetRows.forEach((r) => r.removeAttribute('data-apricot-processed'));
      isFetching = false;
      return;
    }

    // id курса на AKHCheck меняется каждый семестр, поэтому не зашиваем его, а берём
    // все курсы студента. Свежие — первыми: у них id больше, и одноимённая задача
    // прошлого семестра не перебьёт текущую.
    const akhCourses = (Array.isArray(allProgress) ? allProgress : [])
      .filter((c) => c && c.id != null)
      .sort((a, b) => b.id - a.id);

    // Детали курса нужны только ради дедлайнов, так что сбой тут не повод прятать статусы
    const courseDetails = await Promise.all(
      akhCourses.map((c) => window.__akhCheckApi.fetchCourseDetails(c.id).catch(() => null))
    );
    isFetching = false;

    const courses = akhCourses.map((c, i) => ({
      individualTasks: c.tasks?.result || [],
      taskGroups: c.taskGroups?.result || [],
      courseTasks: courseDetails[i]?.tasks || [],
    }));

    for (const row of targetRows) {
      const lmsNameRaw = row.querySelector('.task-table__task-name')?.textContent || '';
      const lmsName = normalize(lmsNameRaw);

      let match = null;
      for (const course of courses) {
        match = matchInCourse(lmsName, course);
        if (match) break;
      }

      const { finalStatus, scoreStr, akhDeadline, isDeadlineUrgent } = match || {};

      // Отрисовка результатов
      if (finalStatus || akhDeadline) {
        if (finalStatus) {
          const cell = row.querySelector('.task-table__state');
          if (cell && !cell.querySelector('.apricot-akh-badge')) {
            const cfg = STATUS_MAP[finalStatus] || {
              text: finalStatus.toUpperCase(),
              color: '#888',
            };
            const badge = document.createElement('div');
            badge.className = 'apricot-akh-badge';
            badge.style = `font-size: 9px; font-weight: 800; color: ${cfg.color}; margin-top: 2px; letter-spacing: 0.5px;`;
            badge.textContent = `AKH: ${cfg.text}`;
            cell.appendChild(badge);
          }
        }

        if (scoreStr) {
          const scoreCells = Array.from(row.querySelectorAll('.task-table__score'));
          const targetScoreCell =
            scoreCells.find((c) => !c.hasAttribute('data-culms-weight-cell')) || scoreCells[1];

          if (targetScoreCell && !targetScoreCell.querySelector('.apricot-akh-score-badge')) {
            const scoreBadge = document.createElement('div');
            scoreBadge.className = 'apricot-akh-score-badge';
            scoreBadge.style = `font-size: 11px; font-weight: 600; color: #A0A0A0; margin-top: 4px; line-height: 1.2; white-space: nowrap;`;
            scoreBadge.textContent = `AKH: ${scoreStr}`;
            targetScoreCell.appendChild(scoreBadge);
          }
        }

        if (akhDeadline) {
          const deadlineCell = row.querySelector('.task-table__deadline');
          if (deadlineCell && !deadlineCell.querySelector('.apricot-akh-deadline-badge')) {
            const deadlineColor = isDeadlineUrgent ? '#F44336' : '#A0A0A0';
            const deadlineBadge = document.createElement('div');
            deadlineBadge.className = 'apricot-akh-deadline-badge';
            deadlineBadge.style = `font-size: 11px; font-weight: 600; color: ${deadlineColor}; margin-top: 4px; line-height: 1.2;`;
            deadlineBadge.textContent = `AKH: ${akhDeadline}`;
            deadlineCell.appendChild(deadlineBadge);
          }
        }

        row.dataset.apricotProcessed = 'done';
      } else {
        row.dataset.apricotProcessed = 'not_found';
      }
    }
  }

  // Запуск
  setInterval(tick, 3000);
  tick(); // первый запуск сразу
})();
