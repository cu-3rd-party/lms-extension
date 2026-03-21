(async function () {
  const APRICOT_COURSE_ID = 98;
  const TARGET_COURSE = 'Основы промышленной разработки';

  // Добавляем поле priority. Чем выше цифра, тем важнее статус!
  // Если в задаче есть статусы 1 и 3, итоговым покажется статус с приоритетом 3.
  const STATUS_MAP = {
    Accepted: { text: 'ACCEPTED', color: '#4CAF50', priority: 1 },
    'On review': { text: 'ON REVIEW', color: '#FF9800', priority: 2 },
    // Группа статусов, требующих доработки (красные)
    'Rework after review': { text: 'REWORK', color: '#F44336', priority: 3 },
    Rework: { text: 'REWORK', color: '#F44336', priority: 3 },
    Rejected: { text: 'REJECTED', color: '#F44336', priority: 3 },

    None: { text: 'NONE', color: '#888', priority: 0 },
  };

  function normalize(name) {
    return name
      .toLowerCase()
      .replace(/дз\s*\d+\.?/g, '') // Убираем "ДЗ 1."
      .replace(/неделя\s*\d+\.?/g, '') // Убираем "Неделя 6."
      .replace(/[^a-zа-яё0-9]/g, ' ') // Убираем спецсимволы
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Функция, которая из массива задач выбирает "самый плохой/важный" статус
  function getHighestPriorityStatus(tasks) {
    if (!tasks || tasks.length === 0) return null;

    let highestPriority = -1;
    let bestStatus = null;

    for (const t of tasks) {
      const statusStr = t.status || 'None';
      const priority = STATUS_MAP[statusStr]?.priority || 0;

      // Если находим статус с более высоким приоритетом — запоминаем его
      if (priority > highestPriority) {
        highestPriority = priority;
        bestStatus = statusStr;
      }
    }
    return bestStatus;
  }

  let isFetching = false;

  async function tick() {
    if (!window.__akhCheckApi || isFetching) return;

    const rows = Array.from(document.querySelectorAll('tr.task-table__task')).filter(
      (r) => !r.dataset.apricotProcessed
    );

    if (rows.length === 0) return;

    // Сразу помечаем строки, чтобы защититься от дублей
    rows.forEach((r) => (r.dataset.apricotProcessed = 'processing'));

    isFetching = true;
    let allProgress;
    try {
      allProgress = await window.__akhCheckApi.fetchAllProgress();
    } catch (e) {
      console.error('Apricot: Failed to fetch progress', e);
      rows.forEach((r) => r.removeAttribute('data-apricot-processed'));
      return;
    } finally {
      isFetching = false;
    }

    if (!allProgress) return;

    const courseData = allProgress.find((c) => c.id === APRICOT_COURSE_ID);
    if (!courseData) return;

    const individualTasks = courseData.tasks?.result || [];
    const taskGroups = courseData.taskGroups?.result || [];

    for (const row of rows) {
      const courseName = row.querySelector('.task-table__course-name')?.textContent || '';
      if (!courseName.includes(TARGET_COURSE)) {
        row.dataset.apricotProcessed = 'skip';
        continue;
      }

      const lmsNameRaw = row.querySelector('.task-table__task-name')?.textContent || '';
      const lmsName = normalize(lmsNameRaw);

      let finalStatus = null;
      let scoreStr = '';

      // 1. Ищем ВСЕ совпадения в одиночных задачах (теперь filter, а не find)
      const directMatches = individualTasks.filter(
        (t) => lmsName.includes(normalize(t.name)) || normalize(t.name).includes(lmsName)
      );

      if (directMatches.length > 0) {
        // Выбираем самый высокий приоритет среди всех найденных саб-тасок
        finalStatus = getHighestPriorityStatus(directMatches);

        // Суммируем баллы, если под одну строку LMS попало несколько тасок
        const curScore = directMatches.reduce((acc, t) => acc + (t.score || 0), 0);
        const maxScore = directMatches.reduce((acc, t) => acc + (t.maxScore || 0), 0);
        scoreStr = `${curScore}/${maxScore}`;
      }
      // 2. Если не нашли, ищем в группах
      else {
        const groupMatch = taskGroups.find(
          (g) =>
            lmsName.includes(normalize(g.groupName)) ||
            normalize(g.groupName).includes(lmsName) ||
            (lmsName.includes('git') && g.groupName.toLowerCase().includes('git'))
        );

        if (groupMatch && groupMatch.tasks?.length > 0) {
          finalStatus = getHighestPriorityStatus(groupMatch.tasks);

          const curScore = groupMatch.tasks.reduce((acc, t) => acc + (t.score || 0), 0);
          scoreStr = `${curScore}/${groupMatch.aggregatedMaxScore || 0}`;
        }
      }

      if (finalStatus) {
        const cell = row.querySelector('.task-table__state');

        if (cell && !cell.querySelector('.apricot-akh-badge')) {
          // Фолбэк, если статус с бэка вообще неизвестен
          const cfg = STATUS_MAP[finalStatus] || { text: finalStatus.toUpperCase(), color: '#888' };
          const badge = document.createElement('div');

          badge.className = 'apricot-akh-badge';
          badge.style = `
                        font-size: 9px; 
                        font-weight: 800; 
                        color: ${cfg.color}; 
                        margin-top: 2px;
                        letter-spacing: 0.5px;
                    `;
          badge.textContent = `AKH: ${cfg.text}`;

          if (scoreStr) {
            badge.title = `Баллы: ${scoreStr}`;
          }

          cell.appendChild(badge);
        }
        row.dataset.apricotProcessed = 'done';
      } else {
        row.dataset.apricotProcessed = 'not_found';
      }
    }
  }

  setInterval(tick, 3000);
  tick();
})();
