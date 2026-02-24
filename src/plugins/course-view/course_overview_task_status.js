const SKIPPED_TASKS_KEY = 'cu.lms.skipped-tasks';

function stripEmojis(text) {
  const EMOJI_REGEX = /[🔴🔵⚫️⚫❤️💙🖤]/g;
  if (!text) return '';
  return text.replace(EMOJI_REGEX, '').trim();
}

function getTaskIdentifier(taskName, courseName) {
  if (!taskName || !courseName) return null;
  return `${stripEmojis(courseName.toLowerCase())}::${stripEmojis(taskName.toLowerCase())}`;
}

function getSkippedTasks() {
  try {
    const skipped = localStorage.getItem(SKIPPED_TASKS_KEY);
    return skipped ? new Set(JSON.parse(skipped)) : new Set();
  } catch (e) {
    return new Set();
  }
}

async function activateCourseOverviewTaskStatus() {
  // ИЗМЕНЕНИЕ: Добавлена поддержка (?:actual|archived)
  const match = window.location.pathname.match(/(?:actual|archived)\/(\d+)/);
  if (!match) return;

  const courseId = parseInt(match[1]); // Важно привести к числу для сравнения

  try {
    // 1. Запрашиваем упражнения, успеваемость И глобальный список задач (где есть даты)
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

    // 2. Создаем карту дат из глобального списка задач (tasks/student)
    // Ключ = exercise.id, Значение = { submitAt, rejectAt }
    const tasksDatesMap = {};
    allTasksData.forEach((task) => {
      if (task.exercise && task.exercise.id) {
        tasksDatesMap[task.exercise.id] = {
          submitAt: task.submitAt ? new Date(task.submitAt).getTime() : 0,
          rejectAt: task.rejectAt ? new Date(task.rejectAt).getTime() : 0,
        };
      }
    });

    // 3. ГРУППИРОВКА: Собираем упражнения по ID лонгрида
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

    // 4. Проходим по каждому лонгриду и выбираем ПОСЛЕДНЮЮ задачу
    for (const [longreadId, exercises] of Object.entries(exercisesByLongread)) {
      const targetExercise = exercises[exercises.length - 1];

      // Находим статус в performance (там актуальный score)
      const taskPerf = performanceData.tasks.find((t) => t.exerciseId === targetExercise.id);

      if (taskPerf) {
        const taskIdentifier = getTaskIdentifier(targetExercise.name, courseName);
        let state = taskPerf.state;
        const score = Number(
          Math.min((taskPerf.score || 0) + (taskPerf.extraScore || 0), 10).toFixed(2)
        );

        if (skippedTasks.has(taskIdentifier)) {
          state = 'skipped';
        } else if (state === 'inProgress') {
          // Берем даты из глобальной карты, которую мы создали выше
          const times = tasksDatesMap[targetExercise.id] || { submitAt: 0, rejectAt: 0 };

          if (times.rejectAt > times.submitAt) {
            state = 'revision'; // Отклонено позже отправки -> Доработка
          } else if (times.submitAt > times.rejectAt) {
            state = 'hasSolution'; // Отправлено позже отклонения -> Есть решение
          } else if (score > 0 && score < 10) {
            // ФОЛЛБЕК: Если даты равны (0), но есть оценка и статус inProgress — это Доработка
            state = 'revision';
          }
        }

        longreadToTaskMap[longreadId] = {
          state: state,
          score: score,
        };
      }
    }

    // Отрисовка (без изменений)
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
  const liElements = container.querySelectorAll('li.longreads-list-item');

  // Ваши цвета
  const SOLVED_COLOR = '#28a745';
  const SKIPPED_COLOR = '#b516d7';
  const REVISION_COLOR = '#FE456A';

  liElements.forEach(function (li) {
    if (!li.querySelector('.task-table__state')) {
      const anchor = li.querySelector('a[href*="/longreads/"]');
      if (!anchor) return;

      const hrefMatch = anchor.getAttribute('href').match(/longreads\/(\d+)/);
      if (!hrefMatch) return;

      const longreadId = parseInt(hrefMatch[1]);

      const taskData = longreadToTaskMap[longreadId];
      if (!taskData) return;

      let chipHTML = '';
      const state = taskData.state;
      const score = taskData.score;

      // Переменная для хранения кастомного цвета фона
      let customBgColor = '';

      switch (state) {
        case 'backlog':
          chipHTML = `<tui-chip data-appearance="support-neutral" data-original-status="Не начато">Не начато</tui-chip>`;
          break;
        case 'inProgress':
          chipHTML = `<tui-chip data-appearance="support-categorical-12-pale" data-original-status="В работе">В работе</tui-chip>`;
          break;
        case 'hasSolution':
          // Убираем data-appearance, чтобы стили не перебивались, и задаем цвет
          customBgColor = SOLVED_COLOR;
          chipHTML = `<tui-chip data-original-status="Есть решение">Есть решение</tui-chip>`;
          break;
        case 'revision':
          // Задаем цвет доработки
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
          // Задаем цвет скипа
          customBgColor = SKIPPED_COLOR;
          chipHTML = `<tui-chip data-original-status="Метод скипа">Метод скипа</tui-chip>`;
          break;
        default:
          return;
      }

      li.style.position = 'relative';

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

      // Формируем стили. Если задан кастомный цвет, добавляем его с !important и делаем текст белым
      const colorStyles = customBgColor
        ? `background-color: ${customBgColor} !important; color: white !important;`
        : '';

      chipElement.style.cssText = `padding: var(--cu-chip-padding-vertical-s) var(--cu-chip-padding-horizontal-s); position: absolute; right: 6px; top: 50%; transform: translateY(-50%); ${colorStyles}`;

      li.appendChild(chipElement);
    }
  });
}
