// var используется намеренно: при повторном внедрении const бросает «already declared».
var SKIPPED_TASKS_KEY = SKIPPED_TASKS_KEY || 'cu.lms.skipped-tasks';

const EMOJI_REGEX = /(?:🔴|🔵|⚫️|⚫|❤️|💙|🖤)/g;

// ИСПРАВЛЕНИЕ #167
function normalizeText(text) {
  if (!text) return '';
  let out = text;
  out = out.split('❤️').join('🔴');
  out = out.split('💙').join('🔵');
  out = out.split('🖤').join('⚫️');
  return out.trim();
}

function getTaskIdentifier(taskName, courseName) {
  if (!taskName || !courseName) return null;
  return `${normalizeText(courseName).toLowerCase()}::${normalizeText(taskName).toLowerCase()}`;
}

function getLegacyTaskIdentifier(taskName, courseName) {
  if (!taskName || !courseName) return null;
  const strip = (t) => t.replace(EMOJI_REGEX, '').trim().toLowerCase();
  return `${strip(courseName)}::${strip(taskName)}`;
}

function getSkippedTasks() {
  try {
    const skipped = localStorage.getItem(SKIPPED_TASKS_KEY);
    return skipped ? new Set(JSON.parse(skipped)) : new Set();
  } catch (_e) {
    return new Set();
  }
}

// Внедряем стили для светлой темы. Они без !important, поэтому ваша темная тема легко их перекроет.
function injectBadgeStyles() {
  if (document.getElementById('apricot-badge-styles')) return;
  const style = document.createElement('style');
  style.id = 'apricot-badge-styles';
  style.textContent = `
    /* Общая геометрия плашки в точности как на платформе */
    cu-task-state-badge.state-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 13px;
        font-weight: 500;
        line-height: 16px;
        border: 1px solid transparent;
        flex: 0 0 auto;
    }
    cu-task-state-badge.state-chip .circle {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-right: 6px;
        flex-shrink: 0;
        /* ИДЕАЛЬНО: Кружок всегда автоматически наследует цвет текста! */
        background-color: currentColor; 
    }

    /* --- ЦВЕТА СВЕТЛОЙ ТЕМЫ --- */
    /* На проверке */
    cu-task-state-badge.state-chip.task-state_base { background-color: #E6F7F8; color: #0093A8; }
    
    /* В работе */
    cu-task-state-badge.state-chip.task-state_warning { background-color: #FDF2D5; color: #B45309; } 
    
    /* Решение прикреплено / Оценка */
    cu-task-state-badge.state-chip.task-state_positive { background-color: #E8F5E9; color: #28A745; }
    
    /* Можно доработать / Не сдано */
    cu-task-state-badge.state-chip.task-state_negative { background-color: #FFEBF0; color: #FE456A; }
    
    /* Задано */
    cu-task-state-badge.state-chip.task-state_neutral { background-color: #F4F4F5; color: #6B7280; }
  `;
  document.head.appendChild(style);
}

// eslint-disable-next-line no-unused-vars
async function activateCourseOverviewTaskStatus() {
  const match = window.location.pathname.match(/(?:actual|archived)\/(\d+)/);
  if (!match) return;

  const courseId = parseInt(match[1]);

  try {
    injectBadgeStyles(); // Добавляем стили на страницу

    const [exercisesResponse, performanceResponse] = await Promise.all([
      fetch(`https://my.centraluniversity.ru/api/micro-lms/courses/${courseId}/exercises`),
      fetch(
        `https://my.centraluniversity.ru/api/micro-lms/courses/${courseId}/student-performance`
      ),
    ]);

    const exercisesData = await exercisesResponse.json();
    const performanceData = await performanceResponse.json();

    const skippedTasks = getSkippedTasks();
    const courseName = exercisesData.name;

    const exercisesByLongread = {};
    exercisesData.exercises.forEach((exercise) => {
      if (exercise.longread) {
        if (!exercisesByLongread[exercise.longread.id]) {
          exercisesByLongread[exercise.longread.id] = [];
        }
        exercisesByLongread[exercise.longread.id].push(exercise);
      }
    });

    const longreadToTaskMap = {};

    for (const [longreadId, exercises] of Object.entries(exercisesByLongread)) {
      const targetExercise = exercises[exercises.length - 1];
      const taskPerf = performanceData.tasks.find((t) => t.exerciseId === targetExercise.id);

      if (taskPerf) {
        const taskIdentifier = getTaskIdentifier(targetExercise.name, courseName);
        const legacyTaskIdentifier = getLegacyTaskIdentifier(targetExercise.name, courseName);

        let state = taskPerf.state;
        const score = Number(
          Math.min((taskPerf.score || 0) + (taskPerf.extraScore || 0), 10).toFixed(2)
        );

        if (skippedTasks.has(taskIdentifier) || skippedTasks.has(legacyTaskIdentifier)) {
          state = 'skipped';
        }

        longreadToTaskMap[longreadId] = { state: state, score: score };
      }
    }

    const courseOverview = await waitForElement('cu-course-overview', 10000);
    const expandContainers = courseOverview.querySelectorAll('tui-expand');

    expandContainers.forEach(function (container) {
      if (container.getAttribute('aria-expanded') === 'true') {
        addStatusChips(container, longreadToTaskMap);
      }
      const observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          if (mutation.attributeName === 'aria-expanded') {
            const isExpanded = container.getAttribute('aria-expanded') === 'true';
            if (isExpanded) {
              addStatusChips(container, longreadToTaskMap);
            }
          }
        });
      });
      observer.observe(container, { attributes: true, attributeFilter: ['aria-expanded'] });
    });
  } catch (e) {
    console.log('Error:', e);
  }
}

function addStatusChips(container, longreadToTaskMap) {
  const longreadLinks = container.querySelectorAll('a.longread');

  longreadLinks.forEach(function (link) {
    const hrefMatch = link.getAttribute('href').match(/longreads\/(\d+)/);
    if (!hrefMatch) return;

    const longreadId = parseInt(hrefMatch[1]);
    const taskData = longreadToTaskMap[longreadId];

    const existingChip = link.querySelector('.state-chip');

    if (!taskData) {
      if (existingChip) existingChip.remove();
      return;
    }

    const state = taskData.state;
    const score = taskData.score;

    if (existingChip) {
      if (
        existingChip.dataset.longreadId === String(longreadId) &&
        existingChip.dataset.state === state
      ) {
        return;
      }
      existingChip.remove();
    }

    let hasCircle = true;
    let customStyle = '';

    switch (state) {
      case 'backlog':
        badgeClass = 'task-state_neutral';
        badgeText = 'Задано';
        break;
      case 'inProgress':
        badgeClass = 'task-state_warning';
        badgeText = 'В работе';
        break;
      case 'submitted':
      case 'hasSolution':
        badgeClass = 'task-state_positive';
        badgeText = 'Решение прикреплено';
        break;
      case 'reworking':
      case 'revision':
        badgeClass = 'task-state_negative';
        badgeText = 'Можно доработать';
        break;
      case 'review':
        badgeClass = 'task-state_base';
        badgeText = 'На проверке';
        break;
      case 'failed':
        badgeClass = 'task-state_negative';
        badgeText = 'Не сдано';
        hasCircle = false; // У "Не сдано" кружка нет
        break;
      case 'evaluated':
        badgeClass = 'task-state_positive';
        badgeText = `${score}/10`;
        hasCircle = false; // У оценки кружка нет
        break;
      case 'skipped':
        badgeClass = 'task-state_neutral';
        badgeText = 'Метод скипа';
        hasCircle = false;
        // Для кастомного скипа оставляем жесткий фиолетовый
        customStyle =
          'background-color: #b516d7 !important; color: white !important; border: none !important;';
        break;
      default:
        return;
    }

    if (!badgeText) return;

    // --- ЛЕЙАУТ ---
    link.style.display = 'flex';
    link.style.justifyContent = 'space-between';
    link.style.alignItems = 'center';
    link.style.flexWrap = 'nowrap';

    const h3 = link.querySelector('h3');
    if (h3) {
      h3.style.flex = '1 1 auto';
      h3.style.marginRight = '12px';
      h3.style.minWidth = '0';
    }

    // Собираем HTML плашки
    const circleHTML = hasCircle ? `<div class="circle"></div>` : '';

    const badgeHTML = `
      <cu-task-state-badge data-size="xs" class="${badgeClass} state-chip" data-longread-id="${longreadId}" data-state="${state}" style="${customStyle}">
        ${circleHTML}
        <span>${badgeText}</span>
      </cu-task-state-badge>
    `;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = badgeHTML;
    const badgeElement = tempDiv.firstElementChild;

    link.appendChild(badgeElement);
  });
}
