(() => {
  // --- SVG ИКОНКИ ---
  const chevronSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
  const checkSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

  // --- СТИЛИ ---
  const cuClubsCss = `
    .cu-events-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
    .cu-event-card { background: #ffffff; border: 1px solid #e7e8ea; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 8px; transition: transform 0.2s, box-shadow 0.2s; height: 100%; box-sizing: border-box; }
    .cu-event-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); }
    .cu-event-date { font-size: 13px; color: #8b929e; font-weight: 500; display: flex; align-items: center; }
    .cu-event-date::before { content: ""; display: inline-block; width: 8px; height: 8px; background-color: #3375ff; border-radius: 50%; margin-right: 8px; }
    .cu-event-club { font-size: 18px; font-weight: 600; color: #000000; }
    .cu-event-name { font-size: 14px; color: #000000; flex-grow: 1; line-height: 1.4; margin-bottom: 8px; }
    
    /* Стили кнопки записи */
    .cu-event-link { display: block; width: 100%; box-sizing: border-box; margin-top: auto; padding: 10px 16px; background-color: #3375ff !important; color: #ffffff !important; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 500; text-align: center; transition: all 0.2s ease; cursor: pointer; }
    .cu-event-link:hover { background-color: #2860d8 !important; }
    
    .cu-table-container { overflow-x: auto; border-radius: 12px; border: 1px solid #e7e8ea; background: #ffffff; }
    .cu-custom-table { width: 100%; text-align: left; border-collapse: collapse; }
    .cu-custom-table th { padding: 12px 16px; border-bottom: 1px solid #e7e8ea; background: #f5f5f6; font-weight: 600; font-size: 14px; color: #000000; }
    .cu-custom-table td { padding: 12px 16px; border-bottom: 1px solid #e7e8ea; font-size: 14px; color: #000000; }
    .cu-custom-table tr:last-child td { border-bottom: none; }
    .cu-text-secondary { color: #8b929e !important; }

    /* Стили для сгруппированной ячейки дня недели */
    .cu-day-group { font-weight: 600 !important; vertical-align: top; border-right: 1px solid #e7e8ea; }

    /* --- КАСТОМНЫЙ ФИЛЬТР (Taiga UI Клон) --- */
    .cu-filter-wrapper { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; position: relative; z-index: 10; }
    .cu-filter-label { font-size: 14px; font-weight: 500; color: #8b929e; }
    
    .cu-tui-select-container { position: relative; width: 300px; }
    .cu-tui-select { display: flex; align-items: center; justify-content: space-between; padding: 0 12px 0 16px; min-height: 36px; background: #ffffff; border: 1px solid #e7e8ea; border-radius: 8px; cursor: pointer; transition: border-color 0.2s, box-shadow 0.2s; user-select: none; }
    .cu-tui-select:hover { border-color: #d3d4d7; }
    .cu-tui-select._open { border-color: #3375ff; }
    .cu-tui-select-text { font-size: 14px; color: #000000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 8px; }
    .cu-tui-select-text._placeholder { color: #8b929e; }
    .cu-tui-arrow { color: #8b929e; display: flex; align-items: center; transition: transform 0.2s; }
    .cu-tui-select._open .cu-tui-arrow { transform: rotate(180deg); color: #000000; }

    .cu-tui-dropdown { position: absolute; top: calc(100% + 4px); left: 0; width: 100%; background: #ffffff; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); border: 1px solid #e7e8ea; max-height: 250px; overflow-y: auto; display: none; z-index: 100; flex-direction: column; padding: 4px 0; }
    .cu-tui-dropdown._visible { display: flex; }
    
    .cu-tui-option { display: flex; align-items: center; padding: 8px 16px; cursor: pointer; transition: background 0.15s; }
    .cu-tui-option:hover { background: #f5f5f6; }
    
    .cu-tui-checkbox { width: 16px; height: 16px; border: 1.5px solid #b6b9c0; border-radius: 4px; margin-right: 12px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0; }
    .cu-tui-option._selected .cu-tui-checkbox { background: #3375ff; border-color: #3375ff; }
    .cu-tui-option-text { font-size: 14px; color: #000000; }

    .cu-tui-dropdown::-webkit-scrollbar { width: 6px; }
    .cu-tui-dropdown::-webkit-scrollbar-track { background: transparent; }
    .cu-tui-dropdown::-webkit-scrollbar-thumb { background: #d3d4d7; border-radius: 4px; }

    /* --- ТЕМНАЯ ТЕМА --- */
    .cu-clubs-dark .cu-event-card { background: #232328; border-color: #333338; }
    .cu-clubs-dark .cu-event-card:hover { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4); }
    .cu-clubs-dark .cu-event-club, .cu-clubs-dark .cu-event-name { color: #ffffff; }
    .cu-clubs-dark .cu-event-date { color: #a1a1aa; }
    .cu-clubs-dark h1, .cu-clubs-dark h2 { color: #ffffff !important; }
    .cu-clubs-dark .cu-table-container { background: #19191c; border-color: #333338; }
    .cu-clubs-dark .cu-custom-table th { background: #232328; border-color: #333338; color: #ffffff; }
    .cu-clubs-dark .cu-custom-table td { border-color: #333338; color: #ececed; }
    .cu-clubs-dark .cu-text-secondary { color: #a1a1aa !important; }
    .cu-clubs-dark .cu-filter-label { color: #a1a1aa; }
    .cu-clubs-dark .cu-day-group { border-right-color: #333338; } 
    
    /* Темная тема: Кнопка */
    .cu-clubs-dark .cu-event-link { background-color: rgba(51, 117, 255, 0.15) !important; color: #749dff !important; }
    .cu-clubs-dark .cu-event-link:hover { background-color: rgba(51, 117, 255, 0.25) !important; }

    /* Темная тема: Фильтр */
    .cu-clubs-dark .cu-tui-select { background: #232328; border-color: #333338; }
    .cu-clubs-dark .cu-tui-select:hover { border-color: #44444a; }
    .cu-clubs-dark .cu-tui-select._open { border-color: #3375ff; }
    .cu-clubs-dark .cu-tui-select-text { color: #ffffff; }
    .cu-clubs-dark .cu-tui-select-text._placeholder { color: #a1a1aa; }
    .cu-clubs-dark .cu-tui-select._open .cu-tui-arrow { color: #ffffff; }
    .cu-clubs-dark .cu-tui-dropdown { background: #232328; border-color: #333338; box-shadow: 0 4px 16px rgba(0,0,0,0.5); }
    .cu-clubs-dark .cu-tui-option:hover { background: #333338; }
    .cu-clubs-dark .cu-tui-option-text { color: #ffffff; }
    .cu-clubs-dark .cu-tui-checkbox { border-color: #55555c; }
    .cu-clubs-dark .cu-tui-dropdown::-webkit-scrollbar-thumb { background: #55555c; }

    /* --- OLED ТЕМА --- */
    .cu-clubs-oled .cu-event-card { background: #000000; border-color: #222222; }
    .cu-clubs-oled .cu-event-card:hover { box-shadow: 0 4px 12px rgba(255, 255, 255, 0.05); }
    .cu-clubs-oled .cu-event-club, .cu-clubs-oled .cu-event-name { color: #ffffff; }
    .cu-clubs-oled .cu-event-date { color: #888888; }
    .cu-clubs-oled h1, .cu-clubs-oled h2 { color: #ffffff !important; }
    .cu-clubs-oled .cu-table-container { background: #000000; border-color: #222222; }
    .cu-clubs-oled .cu-custom-table th { background: #0a0a0a; border-color: #222222; color: #ffffff; }
    .cu-clubs-oled .cu-custom-table td { border-color: #222222; color: #dddddd; }
    .cu-clubs-oled .cu-text-secondary { color: #888888 !important; }
    .cu-clubs-oled .cu-filter-label { color: #888888; }
    .cu-clubs-oled .cu-day-group { border-right-color: #222222; } 
    
    /* OLED тема: Кнопка */
    .cu-clubs-oled .cu-event-link { background-color: rgba(51, 117, 255, 0.2) !important; color: #749dff !important; }
    .cu-clubs-oled .cu-event-link:hover { background-color: rgba(51, 117, 255, 0.3) !important; }

    /* OLED тема: Фильтр */
    .cu-clubs-oled .cu-tui-select { background: #000000; border-color: #222222; }
    .cu-clubs-oled .cu-tui-select:hover { border-color: #333333; }
    .cu-clubs-oled .cu-tui-select._open { border-color: #3375ff; }
    .cu-clubs-oled .cu-tui-select-text { color: #ffffff; }
    .cu-clubs-oled .cu-tui-select-text._placeholder { color: #888888; }
    .cu-clubs-oled .cu-tui-select._open .cu-tui-arrow { color: #ffffff; }
    .cu-clubs-oled .cu-tui-dropdown { background: #000000; border-color: #222222; box-shadow: 0 4px 16px rgba(255,255,255,0.05); }
    .cu-clubs-oled .cu-tui-option:hover { background: #111111; }
    .cu-clubs-oled .cu-tui-option-text { color: #ffffff; }
    .cu-clubs-oled .cu-tui-checkbox { border-color: #444444; }
    .cu-clubs-oled .cu-tui-dropdown::-webkit-scrollbar-thumb { background: #444444; }
  `;

  function injectStyle() {
    if (!document.getElementById('cu-clubs-style')) {
      const style = document.createElement('style');
      style.id = 'cu-clubs-style';
      style.textContent = cuClubsCss;
      document.head.appendChild(style);
    }
  }

  const EVENTS_API = 'https://api.lms.cu3rd.ru/api/v1/events';
  const RECURRING_API = 'https://api.lms.cu3rd.ru/api/v1/events/recurring';

  const rawSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`;
  const CU_CLUBS_ICON = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(rawSvg)}`;

  const extApi = typeof browser !== 'undefined' ? browser : chrome;

  let currentEventsData = [];
  let currentRecurringData = [];
  let selectedClubs = [];

  function applyThemeToContainer() {
    const container = document.getElementById('cu-clubs-container');
    if (!container) return;
    extApi.storage.sync.get(['themeEnabled', 'oledEnabled']).then((data) => {
      container.classList.remove('cu-clubs-dark', 'cu-clubs-oled');
      if (data.themeEnabled) {
        container.classList.add(data.oledEnabled ? 'cu-clubs-oled' : 'cu-clubs-dark');
      }
    });
  }

  function initCuClubs() {
    injectStyle();

    extApi.storage.onChanged.addListener((changes) => {
      if ('themeEnabled' in changes || 'oledEnabled' in changes) applyThemeToContainer();
    });

    const observer = new MutationObserver(() => {
      handlePageRender();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('hashchange', () => {
      handlePageRender();
    });

    document.addEventListener('click', (e) => {
      const dropdown = document.getElementById('cu-tui-dropdown');
      const container = document.getElementById('cu-tui-select-container');
      const select = document.getElementById('cu-tui-select');

      if (
        dropdown &&
        dropdown.classList.contains('_visible') &&
        container &&
        !container.contains(e.target)
      ) {
        dropdown.classList.remove('_visible');
        select.classList.remove('_open');
      }
    });

    handlePageRender();
  }

  function injectSidebarTab() {
    const navList = document.querySelector('ul.nav-list');
    if (!navList || document.querySelector('.cu-clubs-tab')) return;

    const templateLi = document
      .querySelector('[automation-id="sidebar-item-timetable"]')
      ?.closest('.nav-list__item');
    if (!templateLi) return;

    const li = templateLi.cloneNode(true);
    li.classList.add('cu-clubs-tab');

    const navTab = li.querySelector('cu-navtab');
    if (navTab) navTab.setAttribute('automation-id', 'sidebar-item-cu-clubs');

    const link = li.querySelector('a');
    if (link) {
      link.setAttribute('aria-label', 'Клубы ЦУ');
      link.setAttribute('href', '/learn/timetable#cuclubs');
      link.style.setProperty('--t-icon-start', `url("${CU_CLUBS_ICON}")`);

      link.classList.remove('cu-navtab__main-element_active');
      delete link.dataset.clubsFix;

      link.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.location.pathname.includes('/learn/timetable')) {
          window.location.hash = 'cuclubs';
        } else {
          const nativeTimetableTab = document.querySelector(
            '[automation-id="sidebar-item-timetable"] a'
          );
          if (nativeTimetableTab) {
            nativeTimetableTab.click();
            setTimeout(() => {
              window.location.hash = 'cuclubs';
            }, 50);
          } else {
            window.location.href = '/learn/timetable#cuclubs';
          }
        }
      });
    }

    navList.appendChild(li);
  }

  function updateSidebarState() {
    const isClubsPage =
      window.location.pathname.includes('/learn/timetable') && window.location.hash === '#cuclubs';

    const customTab = document.querySelector('[automation-id="sidebar-item-cu-clubs"] a');
    if (customTab) {
      if (isClubsPage) customTab.classList.add('cu-navtab__main-element_active');
      else customTab.classList.remove('cu-navtab__main-element_active');
    }

    const timetableTab = document.querySelector('[automation-id="sidebar-item-timetable"] a');
    if (timetableTab) {
      if (isClubsPage) {
        timetableTab.classList.remove('cu-navtab__main-element_active');
      }

      if (!timetableTab.dataset.clubsFix) {
        timetableTab.dataset.clubsFix = 'true';
        timetableTab.addEventListener('click', (e) => {
          if (window.location.hash === '#cuclubs') {
            e.preventDefault();
            window.location.hash = '';
          }
        });
      }
    }
  }

  function handlePageRender() {
    injectSidebarTab();
    updateSidebarState();

    const isClubsPage =
      window.location.pathname.includes('/learn/timetable') && window.location.hash === '#cuclubs';
    const container = document.querySelector('.cu-container.sidebar__content');
    const standardTimetable = document.querySelector('cu-student-timetable-events');

    if (!container) return;

    let clubsContainer = document.getElementById('cu-clubs-container');

    if (isClubsPage) {
      if (standardTimetable && standardTimetable.style.display !== 'none') {
        standardTimetable.style.display = 'none';
      }

      const breadcrumbLast = container.querySelector('.breadcrumbs__item_last');
      if (breadcrumbLast && breadcrumbLast.textContent.trim() !== 'Клубы') {
        breadcrumbLast.dataset.originalText = breadcrumbLast.textContent;
        breadcrumbLast.textContent = 'Клубы';
      }

      if (!clubsContainer) {
        clubsContainer = document.createElement('div');
        clubsContainer.id = 'cu-clubs-container';
        container.appendChild(clubsContainer);
        clubsContainer.innerHTML = `<h1 class="font-service-heading-2" style="margin-bottom: 24px;">Мероприятия CuClubs</h1><tui-loader size="xxl" class="content-loader" data-size="xxl"></tui-loader>`;

        applyThemeToContainer();
        fetchAndRenderClubs(clubsContainer);
      } else if (clubsContainer.style.display === 'none') {
        clubsContainer.style.display = 'block';
        applyThemeToContainer();
      }
    } else {
      if (standardTimetable && standardTimetable.style.display === 'none') {
        standardTimetable.style.display = '';
      }
      if (clubsContainer && clubsContainer.style.display !== 'none') {
        clubsContainer.style.display = 'none';
      }

      const breadcrumbLast = container.querySelector('.breadcrumbs__item_last');
      if (
        breadcrumbLast &&
        breadcrumbLast.dataset.originalText &&
        breadcrumbLast.textContent === 'Клубы'
      ) {
        breadcrumbLast.textContent = breadcrumbLast.dataset.originalText;
      }
    }
  }

  async function fetchAndRenderClubs(container) {
    try {
      const [eventsRes, recurringRes] = await Promise.all([
        fetch(EVENTS_API).then((r) => r.json()),
        fetch(RECURRING_API).then((r) => r.json()),
      ]);

      currentEventsData = eventsRes.events || [];
      currentRecurringData = recurringRes.events || [];

      const clubsSet = new Set();
      currentEventsData.forEach((e) => clubsSet.add(e.club_name));
      currentRecurringData.forEach((e) => clubsSet.add(e.club_name));
      const uniqueClubs = Array.from(clubsSet).sort();

      container.innerHTML = `
        <h1 class="font-service-heading-2" style="margin-bottom: 16px;">Мероприятия CuClubs</h1>
        <div class="cu-filter-wrapper">
          <span class="cu-filter-label">Клубы:</span>
          
          <div class="cu-tui-select-container" id="cu-tui-select-container">
            <div class="cu-tui-select" id="cu-tui-select">
              <span class="cu-tui-select-text _placeholder" id="cu-tui-select-text">Все клубы</span>
              <div class="cu-tui-arrow">${chevronSvg}</div>
            </div>
            
            <div class="cu-tui-dropdown" id="cu-tui-dropdown">
              ${uniqueClubs
                .map(
                  (club) => `
                <div class="cu-tui-option" data-value="${club}">
                  <div class="cu-tui-checkbox"></div>
                  <span class="cu-tui-option-text">${club}</span>
                </div>
              `
                )
                .join('')}
            </div>
          </div>

        </div>
        <div id="cu-clubs-dynamic-content"></div>
      `;

      const contentDiv = document.getElementById('cu-clubs-dynamic-content');
      setupCustomSelect(uniqueClubs, contentDiv);
      renderFilteredContent(contentDiv);
    } catch (error) {
      console.error('Failed to fetch clubs data:', error);
      container.innerHTML = `
        <h1 class="font-service-heading-2" style="margin-bottom: 24px;">Мероприятия CuClubs</h1>
        <div style="color: #ff3333; padding: 16px; background: rgba(255, 51, 51, 0.1); border-radius: 8px;">
          Произошла ошибка при загрузке данных о клубах.
        </div>`;
    }
  }

  function setupCustomSelect(allClubs, contentDiv) {
    const selectBox = document.getElementById('cu-tui-select');
    const dropdown = document.getElementById('cu-tui-dropdown');
    const selectText = document.getElementById('cu-tui-select-text');
    const options = dropdown.querySelectorAll('.cu-tui-option');

    selectBox.addEventListener('click', () => {
      dropdown.classList.toggle('_visible');
      selectBox.classList.toggle('_open');
    });

    options.forEach((option) => {
      option.addEventListener('click', () => {
        const value = option.getAttribute('data-value');
        const checkbox = option.querySelector('.cu-tui-checkbox');

        if (selectedClubs.includes(value)) {
          selectedClubs = selectedClubs.filter((c) => c !== value);
          option.classList.remove('_selected');
          checkbox.innerHTML = '';
        } else {
          selectedClubs.push(value);
          option.classList.add('_selected');
          checkbox.innerHTML = checkSvg;
        }

        updateSelectText(selectText);
        renderFilteredContent(contentDiv);
      });
    });
  }

  function updateSelectText(element) {
    if (selectedClubs.length === 0) {
      element.textContent = 'Все клубы';
      element.classList.add('_placeholder');
    } else if (selectedClubs.length === 1) {
      element.textContent = selectedClubs[0];
      element.classList.remove('_placeholder');
    } else {
      element.textContent = `Выбрано: ${selectedClubs.length}`;
      element.classList.remove('_placeholder');
    }
  }

  function renderFilteredContent(container) {
    const isFilterEmpty = selectedClubs.length === 0;

    const events = isFilterEmpty
      ? currentEventsData
      : currentEventsData.filter((e) => selectedClubs.includes(e.club_name));

    const recurring = isFilterEmpty
      ? currentRecurringData
      : currentRecurringData.filter((e) => selectedClubs.includes(e.club_name));

    let html = '';

    if (events.length === 0 && recurring.length === 0) {
      html = `<div style="color: var(--tui-text-02); padding: 32px 0; text-align: center;">Событий не найдено</div>`;
      container.innerHTML = html;
      return;
    }

    if (events.length > 0) {
      html += `<h2 class="font-service-heading-3" style="margin: 0 0 16px;">Ближайшие события</h2><div class="cu-events-grid">`;
      events.forEach((e) => {
        html += `
          <div class="cu-event-card">
            <div class="cu-event-date">${e.event_date} • ${e.event_time}</div>
            <div class="cu-event-club">${e.club_name}</div>
            <div class="cu-event-name">${e.event_name || 'Встреча клуба'}</div>
            ${e.event_link ? `<a class="cu-event-link" href="${e.event_link}" target="_blank">Записаться</a>` : ''}
          </div>`;
      });
      html += `</div>`;
    }

    if (recurring.length > 0) {
      html += `<h2 class="font-service-heading-3" style="margin: 32px 0 16px;">Регулярные встречи</h2>`;
      const daysOrder = {
        Понедельник: 1,
        Вторник: 2,
        Среда: 3,
        Четверг: 4,
        Пятница: 5,
        Суббота: 6,
        Воскресенье: 7,
      };

      const sortedRecurring = [...recurring].sort(
        (a, b) => (daysOrder[a.day_of_week] || 99) - (daysOrder[b.day_of_week] || 99)
      );

      html += `
        <div class="cu-table-container">
          <table class="cu-custom-table">
            <thead>
              <tr>
                <th style="width: 20%;">День недели</th>
                <th style="width: 25%;">Время</th>
                <th style="width: 55%;">Клуб</th>
              </tr>
            </thead>
            <tbody>`;

      const groupedRecurring = {};
      sortedRecurring.forEach((e) => {
        if (!groupedRecurring[e.day_of_week]) {
          groupedRecurring[e.day_of_week] = [];
        }
        groupedRecurring[e.day_of_week].push(e);
      });

      Object.keys(groupedRecurring).forEach((day) => {
        const itemsInGroup = groupedRecurring[day];

        itemsInGroup.forEach((e, index) => {
          html += `<tr>`;

          if (index === 0) {
            html += `<td rowspan="${itemsInGroup.length}" class="cu-day-group">${e.day_of_week}</td>`;
          }

          html += `
            <td class="cu-text-secondary">${e.event_time}</td>
            <td style="font-weight: 500;">${e.club_name}</td>
          </tr>`;
        });
      });

      html += `</tbody></table></div>`;
    }

    container.innerHTML = html;
  }

  // Запуск
  initCuClubs();
})();
