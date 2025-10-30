async function activateCourseOverviewTaskStatus() {
  // Extract course ID from URL
  const match = window.location.pathname.match(/actual\/(\d+)/);
  if (!match) {
    return;
  }
  const courseId = match[1];
  
  try {
    // Fetch exercises and student performance data
    const [exercisesResponse, performanceResponse] = await Promise.all([
      fetch(`https://my.centraluniversity.ru/api/micro-lms/courses/${courseId}/exercises`),
      fetch(`https://my.centraluniversity.ru/api/micro-lms/courses/${courseId}/student-performance`)
    ]);
    
    const exercisesData = await exercisesResponse.json();
    const performanceData = await performanceResponse.json();
    
    // Create dict where key is longread.id and value is task info
    const longreadToTaskMap = {};
    
    for (const exercise of exercisesData.exercises) {
      if (exercise.longread) {
        const task = performanceData.tasks.find(t => t.exerciseId === exercise.id);
        
        if (task) {
          longreadToTaskMap[exercise.longread.id] = {
            state: task.state,
            score: Number(Math.min((task.score || 0) + (task.extraScore || 0), 10).toFixed(2))
          };
        }
      }
    }
    
    console.log('Longread to Task mapping:', longreadToTaskMap);
    
    // Wait for course overview element
    const courseOverview = await waitForElement('cu-course-overview', 10000);
    const expandContainers = courseOverview.querySelectorAll('tui-expand');
    
    // Set up observer for each container
    expandContainers.forEach(function(container) {
      // Check if container is already expanded and add chips immediately
      if (container.getAttribute('aria-expanded') === 'true') {
        addStatusChips(container, longreadToTaskMap);
      }
      
      // Create a MutationObserver to watch for aria-expanded changes
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
      
      // Start observing the container for attribute changes
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
    // Check if the status element hasn't been added already
    if (!li.querySelector('.task-table__state')) {
      // Find the anchor element and extract longread ID
      const anchor = li.querySelector('a[href*="/longreads/"]');
      if (!anchor) return;
      
      const hrefMatch = anchor.getAttribute('href').match(/longreads\/(\d+)/);
      if (!hrefMatch) return;
      
      const longreadId = parseInt(hrefMatch[1]);
      
      // Check if this longread has task data
      const taskData = longreadToTaskMap[longreadId];
      if (!taskData) return; // Don't add chip if not in map
      
      // Determine chip content based on state
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
        case 'review':
          chipHTML = `<tui-chip data-appearance="support-categorical-13-pale" data-original-status="На проверке">На проверке</tui-chip>`;
          break;
        case 'failed':
          chipHTML = `<tui-chip data-appearance="negative-pale">Не сдано</tui-chip>`;
          break;
        case 'evaluated':
          chipHTML = `<tui-chip data-appearance="positive-pale">${score}/10</tui-chip>`;
          break;
        default:
          return; // не добавляем, если статус какой-то другой
      }

      li.style.position = 'relative';

      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = chipHTML;
      const chipElement = tempDiv.firstElementChild;

      // Set attributes and styles directly on the chip
      chipElement.setAttribute('_ngcontent-ng-c869453584', '');
      chipElement.setAttribute('tuiappearance', '');
      chipElement.setAttribute('tuiicons', '');
      chipElement.setAttribute('size', 's');
      chipElement.classList.add('state-chip');
      chipElement.setAttribute('data-size', 's');
      chipElement.setAttribute('data-original-culms-status', '');
      chipElement.style.cssText = 'padding: var(--cu-chip-padding-vertical-s) var(--cu-chip-padding-horizontal-s); position: absolute; right: 6px; top: 50%; transform: translateY(-50%);';

      li.appendChild(chipElement);
    }
  });
}