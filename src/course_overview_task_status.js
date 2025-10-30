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
    } catch (e) { return new Set(); }
}

async function activateCourseOverviewTaskStatus() {
  // Достаем id курса из url
  const match = window.location.pathname.match(/actual\/(\d+)/);
  if (!match) {
    return;
  }
  const courseId = match[1];
  
  try {
    // Добываем таски и оценки к ним
    const [exercisesResponse, performanceResponse] = await Promise.all([
      fetch(`https://my.centraluniversity.ru/api/micro-lms/courses/${courseId}/exercises`),
      fetch(`https://my.centraluniversity.ru/api/micro-lms/courses/${courseId}/student-performance`)
    ]);
    // https://my.centraluniversity.ru/api/micro-lms/materials/33293
    const exercisesData = await exercisesResponse.json();
    const performanceData = await performanceResponse.json();

    const skippedTasks = getSkippedTasks();
    const courseName = exercisesData.name;
    
    // Создаем мап для типа таски и оценки по ней
    const longreadToTaskMap = {};

    const inProgressTasks = performanceData.tasks.filter(t => {
      if (t.state !== 'inProgress') return false;
      
      const exercise = exercisesData.exercises.find(ex => ex.id === t.exerciseId);
      if (!exercise) return false;
      
      const taskIdentifier = getTaskIdentifier(exercise.name, courseName);
      return !skippedTasks.has(taskIdentifier);
    });

    const materialChecks = await Promise.all(
      inProgressTasks.map(async (task) => {
        try {
          const materialResponse = await fetch(
            `https://my.centraluniversity.ru/api/micro-lms/materials/${task.exerciseId}`
          );
          const materialData = await materialResponse.json();
          return {
            exerciseId: task.exerciseId,
            hasSubmission: materialData.task?.submitAt != null
          };
        } catch (e) {
          console.log(`Error checking material ${task.exerciseId}:`, e);
          return {
            exerciseId: task.exerciseId,
            hasSubmission: false
          };
        }
      })
    );

    const submissionMap = {};
    materialChecks.forEach(check => {
      submissionMap[check.exerciseId] = check.hasSubmission;
    });
    
    for (const exercise of exercisesData.exercises) {
      if (exercise.longread) {
        const task = performanceData.tasks.find(t => t.exerciseId === exercise.id);
        
        if (task) {
          const taskIdentifier = getTaskIdentifier(exercise.name, courseName);
          let state = task.state;
          
          if (skippedTasks.has(taskIdentifier)) {
            state = 'skipped';
          } else if (state === 'inProgress' && submissionMap[exercise.id]) {
            state = 'hasSolution';
          }
          
          longreadToTaskMap[exercise.longread.id] = {
            state: state,
            score: Number(Math.min((task.score || 0) + (task.extraScore || 0), 10).toFixed(2))
          };
        }
      }
    }
    
    // Ждем появления главного контейнера
    const courseOverview = await waitForElement('cu-course-overview', 10000);
    const expandContainers = courseOverview.querySelectorAll('tui-expand');
    
    // Для каждого ставим обсервер на открытие
    expandContainers.forEach(function(container) {
      if (container.getAttribute('aria-expanded') === 'true') {
        addStatusChips(container, longreadToTaskMap);
      }
      
      const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
          if (mutation.attributeName === 'aria-expanded') {
            const isExpanded = container.getAttribute('aria-expanded') === 'true';
            
            if (isExpanded) {
              addStatusChips(container, longreadToTaskMap);
            }
          }
        });
      });
      
      observer.observe(container, { 
        attributes: true,
        attributeFilter: ['aria-expanded']
      });
    });
  }
  catch (e) {
    console.log('Error:', e);
  }
}

function addStatusChips(container, longreadToTaskMap) {
  const liElements = container.querySelectorAll('li.longreads-list-item');
  
  liElements.forEach(function(li) {
    if (!li.querySelector('.task-table__state')) {
      const anchor = li.querySelector('a[href*="/longreads/"]');
      if (!anchor) return;
      
      const hrefMatch = anchor.getAttribute('href').match(/longreads\/(\d+)/);
      if (!hrefMatch) return;
      
      const longreadId = parseInt(hrefMatch[1]);
      
      const taskData = longreadToTaskMap[longreadId];
      if (!taskData) return; // не добавляем плашку, если в списке тасок элемента нет (лонгриды)
      
      // На основе типа таски создаем элемент
      let chipHTML = '';
      const state = taskData.state;
      const score = taskData.score 
      switch(state) {
        case 'backlog':
          chipHTML = `<tui-chip data-appearance="support-neutral" data-original-status="Не начато">Не начато</tui-chip>`;
          break;
        case 'inProgress':
          chipHTML = `<tui-chip data-appearance="support-categorical-12-pale" data-original-status="В работе">В работе</tui-chip>`;
          break;
        case 'hasSolution':
          chipHTML = `<tui-chip data-appearance="support-categorical-12-pale" data-original-status="Есть решение">Есть решение</tui-chip>`;
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
      chipElement.style.cssText = `padding: var(--cu-chip-padding-vertical-s) var(--cu-chip-padding-horizontal-s); position: absolute; right: 6px; top: 50%; transform: translateY(-50%); ${state === 'skipped' ? 'background-color: #b516d7 !important; color: white !important' : ''}`;

      li.appendChild(chipElement);
    }
  });
}