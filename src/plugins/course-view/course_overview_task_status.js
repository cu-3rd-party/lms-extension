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

// eslint-disable-next-line no-unused-vars
async function activateCourseOverviewTaskStatus() {
  const match = window.location.pathname.match(/(?:actual|archived)\/(\d+)/);
  if (!match) return;

  const courseId = parseInt(match[1]);

  try {
    const [exercisesResponse, performanceResponse, allTasksResponse] = await Promise.all([
      fetch(`https://my.centraluniversity.ru/api/micro-lms/courses/${courseId}/exercises`),
      fetch(
        `https://my.centraluniversity.ru/api/micro-lms/courses/${courseId}/student-performance`
      ),
      fetch(`https://my.centraluniversity.ru/api/micro-lms/tasks/student`),
    ]);

    const exercisesData = await exercisesResponse.json();
    const performanceData = await performanceResponse.json();
    const allTasksData = await allTasksResponse.json();

    const skippedTasks = getSkippedTasks();
    const courseName = exercisesData.name;

    const tasksDatesMap = {};
    allTasksData.forEach((task) => {
      if (task.exercise && task.exercise.id) {
        tasksDatesMap[task.exercise.id] = {
          submitAt: task.submitAt ? new Date(task.submitAt).getTime() : 0,
          rejectAt: task.rejectAt ? new Date(task.rejectAt).getTime() : 0,
        };
      }
    });

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
        } else if (state === 'inProgress') {
          const times = tasksDatesMap[targetExercise.id] || { submitAt: 0, rejectAt: 0 };

          if (times.rejectAt > times.submitAt) {
            state = 'revision';
          } else if (times.submitAt > times.rejectAt) {
            state = 'hasSolution';
          } else if (score > 0 && score < 10) {
            state = 'revision';
          }
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

  const SOLVED_COLOR = '#28a745';
  const SKIPPED_COLOR = '#b516d7';
  const REVISION_COLOR = '#FE456A';

  longreadLinks.forEach(function (link) {
    const hrefMatch = link.getAttribute('href').match(/longreads\/(\d+)/);
    if (!hrefMatch) return;

    const longreadId = parseInt(hrefMatch[1]);
    const taskData = longreadToTaskMap[longreadId];

    const existingChip = link.querySelector('.state-chip');

    // ИСПРАВЛЕНИЕ #226: Если данных для лонгрида нет (или больше нет), обязательно вычищаем старую плашку,
    // которая могла остаться из-за переиспользования DOM-узла фреймворком.
    if (!taskData) {
      if (existingChip) existingChip.remove();
      return;
    }

    const state = taskData.state;
    const score = taskData.score;

    // Если плашка уже есть, проверяем, актуальна ли она.
    // Если она от другого лонгрида (переиспользование узла), удаляем и рисуем заново.
    if (existingChip) {
      if (
        existingChip.dataset.longreadId === String(longreadId) &&
        existingChip.dataset.state === state
      ) {
        return; // Плашка актуальна
      }
      existingChip.remove();
    }
    let customBgColor = '';

    switch (state) {
      case 'backlog':
        chipHTML = `<tui-chip data-appearance="support-neutral" data-original-status="Не начато">Не начато</tui-chip>`;
        break;
      case 'inProgress':
        chipHTML = `<tui-chip data-appearance="support-categorical-12-pale" data-original-status="В работе">В работе</tui-chip>`;
        break;
      case 'hasSolution':
        customBgColor = SOLVED_COLOR;
        chipHTML = `<tui-chip data-original-status="Есть решение">Есть решение</tui-chip>`;
        break;
      case 'revision':
        customBgColor = REVISION_COLOR;
        chipHTML = `<tui-chip data-original-status="Доработка">Доработка</tui-chip>`;
        break;
      case 'review':
        chipHTML = `<tui-chip data-appearance="support-categorical-13-pale" data-original-status="На проверке">На проверке</tui-chip>`;
        break;
      case 'failed':
        chipHTML = `<tui-chip data-appearance="negative-pale">Не сдано</tui-chip>`;
        break;
      case 'evaluated':
        chipHTML = `<tui-chip data-appearance="positive-pale">${score}/10</tui-chip>`;
        break;
      case 'skipped':
        customBgColor = SKIPPED_COLOR;
        chipHTML = `<tui-chip data-original-status="Метод скипа">Метод скипа</tui-chip>`;
        break;
      default:
        return;
    }

    if (!chipHTML) return;

    // --- ИСПРАВЛЕНИЕ ЛЕЙАУТА ---
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

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = chipHTML;
    const chipElement = tempDiv.firstElementChild;

    chipElement.setAttribute('_ngcontent-ng-c869453584', '');
    chipElement.setAttribute('tuiappearance', '');
    chipElement.setAttribute('tuiicons', '');
    chipElement.setAttribute('size', 's');
    chipElement.classList.add('state-chip');
    chipElement.setAttribute('data-size', 's');
    chipElement.setAttribute('data-original-culms-status', '');

    // Привязываем мета-данные лонгрида к плашке для предотвращения багов при DOM Recycling
    chipElement.setAttribute('data-longread-id', String(longreadId));
    chipElement.setAttribute('data-state', state);

    const colorStyles = customBgColor
      ? `background-color: ${customBgColor} !important; color: white !important; border: none !important;`
      : '';

    chipElement.style.cssText = `flex: 0 0 auto; padding: 4px 10px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 500; line-height: 1; ${colorStyles}`;

    link.appendChild(chipElement);
  });
}
