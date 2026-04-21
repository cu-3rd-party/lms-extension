// course_friends_list.js

(function () {
  const WIDGET_ID = 'cu-friends-floating-widget';

  // --- НАСТРОЙКИ ТЕМЫ ---
  const THEME = {
    light: {
      bg: '#ffffff',
      text: '#333333',
      textSec: '#888888',
      border: '#e0e0e0',
      shadow: '0 4px 20px rgba(0,0,0,0.05)',
      hover: '#f5f5f5',
    },
    dark: {
      bg: 'rgb(32, 33, 36)',
      text: '#E8EAED',
      textSec: '#BDC1C6',
      border: 'rgb(55, 56, 60)',
      shadow: '0 4px 20px rgba(0,0,0,0.2)',
      hover: 'rgb(55, 56, 60)',
    },
    oled: {
      bg: '#000000',
      text: '#ffffff',
      textSec: '#b0b0b0',
      border: '#333333',
      shadow: 'none',
      hover: '#111111',
    },
  };
  let currentTheme = 'light';

  // Флаг для предотвращения одновременного создания нескольких виджетов
  let isInitializing = false;

  // Определение API
  const api = typeof browser !== 'undefined' ? browser : chrome;

  function getStorageData(keys, callback) {
    if (typeof browser !== 'undefined') {
      api.storage.sync.get(keys).then(callback, (err) => console.error(err));
    } else {
      api.storage.sync.get(keys, callback);
    }
  }

  // --- УТИЛИТЫ ---

  function waitForElement(selector) {
    return new Promise((resolve) => {
      const existing = document.querySelector(selector);
      if (existing) return resolve(existing);
      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          resolve(el);
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  function normalize(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .replace(/[—–−-]/g, ' ')
      .replace(/[.,:;()]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeSubjectName(str) {
    if (!str) return '';
    let s = str.toLowerCase();

    s = s.replace(/[cс]\s*\+\+/g, ' cpp ');
    s = s.replace(/[.,:;()[\]]/g, ' ');
    s = s.replace(/[—–−-]/g, ' ');

    const words = s.split(/\s+/);

    const stopWords = new Set([
      'на',
      'in',
      'of',
      'for',
      'языке',
      'программирования',
      'часть',
      'part',
      'level',
      'уровень',
      'module',
      'модуль',
      'course',
      'курс',
    ]);

    const meaningfulWords = words.filter((w) => {
      const clean = w.trim();
      return clean.length > 0 && !stopWords.has(clean);
    });

    return meaningfulWords.join(' ');
  }

  function areCoursesSimilar(pageTitle, subject) {
    const p = normalizeSubjectName(pageTitle);
    const s = normalizeSubjectName(subject);
    if (!p || !s) return false;
    if (p === s) return true;
    if (p.includes(s) || s.includes(p)) return true;
    return false;
  }

  // --- ЛОГИКА ТЕМЫ ---
  async function initTheme() {
    try {
      if (api && api.storage) {
        getStorageData(['themeEnabled', 'oledEnabled'], (data) => {
          updateWidgetTheme(!!data.themeEnabled, !!data.oledEnabled);
        });

        api.storage.onChanged.addListener((changes, area) => {
          if (area === 'sync' && ('themeEnabled' in changes || 'oledEnabled' in changes)) {
            getStorageData(['themeEnabled', 'oledEnabled'], (data) => {
              updateWidgetTheme(!!data.themeEnabled, !!data.oledEnabled);
            });
          }
        });
      }
    } catch (e) {
      console.error('Theme init error:', e);
    }
  }

  function updateWidgetTheme(isDark, isOled) {
    if (isDark) {
      currentTheme = isOled ? 'oled' : 'dark';
    } else {
      currentTheme = 'light';
    }

    const widgets = document.querySelectorAll(`#${WIDGET_ID}`);
    widgets.forEach((widget) => {
      const colors = THEME[currentTheme];
      widget.style.backgroundColor = colors.bg;
      widget.style.color = colors.text;
      widget.style.borderColor = colors.border;
      widget.style.boxShadow = colors.shadow;

      const header = widget.querySelector('.cw-header');
      if (header) header.style.borderBottomColor = colors.border;

      const items = widget.querySelectorAll('.cw-item');
      items.forEach((item) => {
        item.style.borderBottomColor = colors.border;
        item.onmouseenter = () => (item.style.backgroundColor = colors.hover);
        item.onmouseleave = () => (item.style.backgroundColor = 'transparent');
        item.style.backgroundColor = 'transparent';

        const email = item.querySelector('.cw-email');
        if (email) email.style.color = colors.textSec;
      });

      const empty = widget.querySelector('.cw-empty');
      if (empty) empty.style.color = colors.textSec;
    });
  }

  // --- ЛОГИКА ВИДЖЕТА ---

  function createWidget() {
    const widget = document.createElement('div');
    widget.id = WIDGET_ID;

    // Убрали margin-top и margin-bottom, чтобы сайт сам выставил родной отступ
    widget.style.cssText = `
            position: relative; 
            width: 100%;
            max-height: 400px;
            overflow-y: auto;
            border-radius: 20px;
            border: 1px solid #ccc;
            z-index: 1;
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            transition: background-color 0.3s, color 0.3s, border-color 0.3s, opacity 0.2s ease-in-out;
            display: none;
            opacity: 1;
            box-sizing: border-box;
        `;

    return widget;
  }

  function renderFriendsList(widget, courseName) {
    const allFriends = JSON.parse(localStorage.getItem('cu_friends_list')) || [];

    const classmates = allFriends.filter(
      (friend) =>
        friend.subjects &&
        Array.isArray(friend.subjects) &&
        friend.subjects.some((subj) => areCoursesSimilar(courseName, subj))
    );

    widget.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'cw-header';
    header.innerHTML = `
            <span style="font-weight: 600; font-size: 16px;">Друзья на курсе</span>
            <span style="font-size: 18px; line-height: 1; opacity: 0.7; cursor: pointer; display:none;" id="cw-close">×</span>
        `;
    header.style.cssText = `
            padding: 16px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid transparent;
        `;
    header.querySelector('#cw-close').onclick = () => {
      widget.style.display = 'none';
    };
    widget.appendChild(header);

    const content = document.createElement('div');

    if (classmates.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'cw-empty';
      empty.innerText = 'Никого нет (или данные о предметах не обновлены)';
      empty.style.cssText = `
                padding: 16px 20px;
                text-align: center;
                font-size: 13px;
                opacity: 0.8;
            `;
      content.appendChild(empty);
    } else {
      const list = document.createElement('div');
      classmates.forEach((friend) => {
        const item = document.createElement('div');
        item.className = 'cw-item';
        item.title = 'Открыть календарь';
        item.style.cssText = `
                    padding: 12px 20px;
                    border-bottom: 1px solid transparent;
                    cursor: pointer;
                    transition: background-color 0.2s;
                `;

        const colors = THEME[currentTheme];
        item.onmouseenter = () => (item.style.backgroundColor = colors.hover);
        item.onmouseleave = () => (item.style.backgroundColor = 'transparent');

        item.onclick = async (e) => {
          e.stopPropagation();
          const email = friend.email;
          if (!email) return;

          const yandexCalendarUrl = `https://calendar.yandex.ru/week?layers=${encodeURIComponent(email)}`;

          try {
            const response = await api.runtime.sendMessage({
              action: 'GET_CALENDAR_LINK',
              email: email,
            });

            if (response && response.success && response.link) {
              window.open(response.link, '_blank');
            } else {
              window.open(yandexCalendarUrl, '_blank');
            }
          } catch (err) {
            window.open(yandexCalendarUrl, '_blank');
          }
        };

        const displayName = friend.name || friend.email.split('@')[0];

        item.innerHTML = `
                    <div style="font-size: 14px; font-weight: 500;">${displayName}</div>
                    <div class="cw-email" style="font-size: 12px; margin-top: 2px;">${friend.email}</div>
                `;
        list.appendChild(item);
      });
      content.appendChild(list);
    }
    widget.appendChild(content);
  }

  function isExactCourseMainPage() {
    return /\/learn\/courses\/view\/(actual|archived)\/\d+\/?(\?.*)?$/.test(location.href);
  }

  async function initCourseFriends() {
    // Если функция уже работает, не запускаем ее повторно
    if (isInitializing) return;
    isInitializing = true;

    try {
      if (!isExactCourseMainPage()) {
        const w = document.getElementById(WIDGET_ID);
        if (w) w.style.display = 'none';
        return;
      }

      const urlMatch = location.href.match(/\/courses\/view\/(?:actual|archived)\/(\d+)/);
      const courseId = urlMatch ? urlMatch[1] : null;

      if (!courseId) return;

      await waitForElement('.breadcrumbs__item');

      const allBreadcrumbs = document.querySelectorAll('.breadcrumbs__item');
      let courseName = '';

      for (const item of allBreadcrumbs) {
        const href = item.getAttribute('href');
        if (href && new RegExp(`/${courseId}$`).test(href)) {
          courseName = item.innerText.trim();
          break;
        }
      }

      if (!courseName) {
        const isMainCoursePage = new RegExp(`/${courseId}$`).test(location.pathname);
        if (isMainCoursePage) {
          const lastBreadcrumb = document.querySelector(
            '.breadcrumbs__item.breadcrumbs__item_last'
          );
          if (lastBreadcrumb) {
            courseName = lastBreadcrumb.innerText.trim();
          }
        }
      }

      if (!courseName) return;

      // Удаляем дубликаты, если они вдруг образовались
      const existingWidgets = document.querySelectorAll(`#${WIDGET_ID}`);
      if (existingWidgets.length > 1) {
        for (let i = 1; i < existingWidgets.length; i++) {
          existingWidgets[i].remove();
        }
      }

      let widget = document.getElementById(WIDGET_ID);
      if (!widget) {
        widget = createWidget();
      }

      const targetContainerSelector = 'cu-widgets-panel .widgets-container.second-section';
      const fallbackContainerSelector = 'cu-widgets-panel .widgets-container';

      let targetContainer = await waitForElement(targetContainerSelector);
      if (!targetContainer) {
        targetContainer = await waitForElement(fallbackContainerSelector);
      }

      if (targetContainer) {
        if (widget.parentElement !== targetContainer) {
          targetContainer.appendChild(widget);
        }
      } else {
        if (widget.parentElement !== document.body) {
          document.body.appendChild(widget);
        }
      }

      renderFriendsList(widget, courseName);

      getStorageData(['themeEnabled', 'oledEnabled'], (data) => {
        updateWidgetTheme(!!data.themeEnabled, !!data.oledEnabled);
      });

      widget.style.display = 'block';
    } finally {
      // Освобождаем блокировку, когда закончили отрисовку
      isInitializing = false;
    }
  }

  // --- ЗАПУСК ---

  function startWidget() {
    initTheme();

    if (isExactCourseMainPage()) {
      initCourseFriends();
    }

    if (!window.cuFriendsObserver) {
      let initTimeout = null;

      window.cuFriendsObserver = new MutationObserver(() => {
        if (isExactCourseMainPage()) {
          const widget = document.getElementById(WIDGET_ID);
          const inCorrectContainer = widget && widget.closest('cu-widgets-panel');

          if (!widget || !inCorrectContainer) {
            // Очищаем предыдущий таймаут (дебаунс)
            clearTimeout(initTimeout);
            // Ждем 500мс после последней мутации DOM
            initTimeout = setTimeout(() => {
              initCourseFriends();
            }, 500);
          } else {
            widget.style.display = 'block';
          }
        } else {
          const w = document.getElementById(WIDGET_ID);
          if (w) w.style.display = 'none';
        }
      });

      window.cuFriendsObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  function stopWidget() {
    const w = document.getElementById(WIDGET_ID);
    if (w) {
      w.style.display = 'none';
    }
  }

  // --- MAIN ENTRY POINT ---

  if (api && api.storage) {
    getStorageData(['friendsEnabled'], (data) => {
      const isEnabled = data.friendsEnabled !== false;
      if (isEnabled) {
        startWidget();
      }
    });

    api.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.friendsEnabled) {
        if (changes.friendsEnabled.newValue) {
          startWidget();
          if (isExactCourseMainPage()) initCourseFriends();
        } else {
          stopWidget();
        }
      }
    });
  } else {
    startWidget();
  }
})();
