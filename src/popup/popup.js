// popup.js - УНИВЕРСАЛЬНАЯ ФИНАЛЬНАЯ ВЕРСИЯ (с отложенным сохранением)
'use strict';

// --- ОПРЕДЕЛЕНИЕ КОНТЕКСТА ---
const isInsideIframe = window.self !== window.top;

// Настройки, которые применяются "на лету" без перезагрузки (можно сохранять сразу)
const LIVE_SETTINGS = ['themeEnabled', 'oledEnabled'];

// --- БЛОК ДЛЯ УПРАВЛЕНИЯ ТЕМОЙ POPUP ---
const darkThemeLinkID = 'popup-dark-theme-style';

function applyPopupTheme(isEnabled) {
  const existingLink = document.getElementById(darkThemeLinkID);
  if (isEnabled && !existingLink) {
    const link = document.createElement('link');
    link.id = darkThemeLinkID;
    link.rel = 'stylesheet';
    link.href = browser.runtime.getURL('popup/popup_dark.css');
    document.head.appendChild(link);
    document.body.classList.add('dark-theme');
  } else if (!isEnabled && existingLink) {
    existingLink.remove();
    document.body.classList.remove('dark-theme');
  }
}
browser.storage.sync.set({
  advancedStatementsEnabled: true,
  endOfCourseCalcEnabled: true,
});

// --- УПРАВЛЕНИЕ ПЕРЕКЛЮЧАТЕЛЯМИ И ЭЛЕМЕНТАМИ ---
const toggles = {
  themeEnabled: document.getElementById('theme-toggle'),
  oledEnabled: document.getElementById('oled-toggle'),
  autoRenameEnabled: document.getElementById('auto-rename-toggle'),
  snowEnabled: document.getElementById('snow-toggle'),
  stickerEnabled: document.getElementById('sticker-toggle'),
  courseOverviewTaskStatusToggle: document.getElementById('course-overview-task-status-toggle'),
  emojiHeartsEnabled: document.getElementById('emoji-hearts-toggle'),
  oldCoursesDesignToggle: document.getElementById('old-courses-design-toggle'),
  futureExamsViewToggle: document.getElementById('future-exams-view-toggle'),
  courseOverviewAutoscrollToggle: document.getElementById('course-overview-autoscroll-toggle'),
  advancedStatementsEnabled: document.getElementById('advanced-statements-toggle'),
  endOfCourseCalcEnabled: document.getElementById('end-of-course-calc-toggle'),
  friendsEnabled: document.getElementById('friends-toggle'),
  hideBonusButtonEnabled: document.getElementById('hide-bonus-button-toggle'),
};

// Элементы UI для зависимых настроек
const endOfCourseCalcLabel = document.getElementById('end-of-course-calc-label');
const futureExamsDisplayContainer = document.getElementById('future-exams-display-container');
const futureExamsDisplayFormat = document.getElementById('future-exams-display-format');
const autoRenameFormatContainer = document.getElementById('auto-rename-format-container');
const renameTemplateSelect = document.getElementById('rename-template-select');
const stickerUploadContainer = document.getElementById('sticker-upload-container');
const stickerFileInput = document.getElementById('sticker-file-input');
const stickerPreview = document.getElementById('sticker-preview');
const noStickerText = document.getElementById('no-sticker-text');
const stickerResetBtn = document.getElementById('sticker-reset-btn');
const reloadNotice = document.getElementById('reload-notice');
const stickerFitSelect = document.getElementById('sticker-fit-select');
const gradesExportBtn = document.getElementById('grades-export-btn');
const gradesExportStatus = document.getElementById('grades-export-status');

const allKeys = [
  ...Object.keys(toggles),
  'futureExamsDisplayFormat',
  'autoRenameTemplate',
  'stickerObjectFit',
];
let pendingChanges = {};

// --- ФУНКЦИИ ДЛЯ РАБОТЫ СО СТИКЕРАМИ ---
function updateStickerUI(isEnabled) {
  if (stickerUploadContainer) {
    stickerUploadContainer.style.display = isEnabled ? 'block' : 'none';
  }
}

function loadStickerImage() {
  if (!stickerPreview || !noStickerText) return;

  browser.storage.local.get(['customStickerData']).then((result) => {
    if (result.customStickerData) {
      stickerPreview.src = result.customStickerData;
      stickerPreview.style.display = 'inline-block';
      noStickerText.style.display = 'none';
    } else {
      stickerPreview.src = '';
      stickerPreview.style.display = 'none';
      noStickerText.style.display = 'inline-block';
    }
  });
}

function updateAutoRenameUI(isEnabled) {
  if (autoRenameFormatContainer) {
    autoRenameFormatContainer.style.display = isEnabled ? 'block' : 'none';
  }
}

// --- ОСНОВНАЯ ЛОГИКА ОБНОВЛЕНИЯ СОСТОЯНИЙ ---
function refreshToggleStates() {
  browser.storage.sync.get([...allKeys, 'autoRenameTemplate']).then((data) => {
    allKeys.forEach((key) => {
      if (toggles[key]) {
        toggles[key].checked = !!data[key];
      }
    });

    const isThemeEnabled = !!data.themeEnabled;
    const isAdvancedStatementsEnabled = !!data.advancedStatementsEnabled;
    const isAutoRenameEnabled = !!data.autoRenameEnabled;

    if (toggles.oledEnabled) toggles.oledEnabled.disabled = !isThemeEnabled;
    if (toggles.endOfCourseCalcEnabled) {
      toggles.endOfCourseCalcEnabled.disabled = !isAdvancedStatementsEnabled;
      endOfCourseCalcLabel.classList.toggle('disabled-label', !isAdvancedStatementsEnabled);
    }

    if (data.stickerEnabled) {
      updateStickerUI(true);
      const editorContainer = document.getElementById('sticker-editor-container');
      if (editorContainer) editorContainer.style.display = 'block';
      loadStickerImage();
    } else {
      updateStickerUI(false);
      const editorContainer = document.getElementById('sticker-editor-container');
      if (editorContainer) editorContainer.style.display = 'none';
    }
    if (stickerFitSelect) stickerFitSelect.value = data.stickerObjectFit || 'cover';

    updateAutoRenameUI(isAutoRenameEnabled);
    if (renameTemplateSelect && data.autoRenameTemplate) {
      renameTemplateSelect.value = data.autoRenameTemplate;
    }

    applyPopupTheme(isThemeEnabled);
    updateFormatDisplayVisibility(data.futureExamsDisplayFormat);
  });
}

function updateFormatDisplayVisibility(displayFormat) {
  if (toggles['futureExamsViewToggle'] && futureExamsDisplayContainer) {
    futureExamsDisplayContainer.style.display = toggles['futureExamsViewToggle'].checked
      ? 'block'
      : 'none';
  }
  if (futureExamsDisplayFormat && displayFormat) {
    futureExamsDisplayFormat.value = displayFormat;
  }
}

// --- ДОБАВЛЕНИЕ ОБРАБОТЧИКОВ СОБЫТИЙ ---

// 1. Обработчики для всех переключателей
allKeys.forEach((key) => {
  const toggleElement = toggles[key];
  if (toggleElement) {
    toggleElement.addEventListener('change', () => {
      const isEnabled = toggleElement.checked;
      const change = { [key]: isEnabled };

      if (isInsideIframe) {
        // Если мы внутри iframe, просто копим изменения
        pendingChanges = { ...pendingChanges, ...change };

        // Живые настройки (тема) сохраняем сразу для мгновенного эффекта
        if (LIVE_SETTINGS.includes(key)) {
          browser.storage.sync.set(change);
        } else {
          // Для остальных просто показываем плашку "Применится после закрытия"
          if (reloadNotice) reloadNotice.style.display = 'block';
        }
      } else {
        // Если открыто как классический popup окна
        browser.storage.sync.set(change);
      }

      // --- Логика зависимостей ---
      if (key === 'themeEnabled') {
        if (toggles.oledEnabled) {
          toggles.oledEnabled.disabled = !isEnabled;
          if (!isEnabled && toggles.oledEnabled.checked) {
            toggles.oledEnabled.checked = false;
            const oledChange = { oledEnabled: false };
            if (isInsideIframe) {
              pendingChanges = { ...pendingChanges, ...oledChange };
              browser.storage.sync.set(oledChange); // OLED тоже Live настройка
            } else {
              browser.storage.sync.set(oledChange);
            }
          }
        }
      } else if (key === 'advancedStatementsEnabled') {
        if (toggles.endOfCourseCalcEnabled) {
          toggles.endOfCourseCalcEnabled.disabled = !isEnabled;
          endOfCourseCalcLabel.classList.toggle('disabled-label', !isEnabled);
          if (!isEnabled && toggles.endOfCourseCalcEnabled.checked) {
            toggles.endOfCourseCalcEnabled.checked = false;
            const endOfCourseChange = { endOfCourseCalcEnabled: false };
            if (isInsideIframe) {
              pendingChanges = { ...pendingChanges, ...endOfCourseChange };
              if (reloadNotice) reloadNotice.style.display = 'block';
            } else {
              browser.storage.sync.set(endOfCourseChange);
            }
          }
        }
      } else if (key === 'futureExamsViewToggle') {
        updateFormatDisplayVisibility();
      } else if (key === 'stickerEnabled') {
        updateStickerUI(isEnabled);
        const editorContainer = document.getElementById('sticker-editor-container');
        if (editorContainer) editorContainer.style.display = isEnabled ? 'block' : 'none';
        if (isEnabled) loadStickerImage();
      } else if (key === 'autoRenameEnabled') {
        updateAutoRenameUI(isEnabled);
      }
    });
  }
});

const openEditorBtn = document.getElementById('open-editor-btn');
if (openEditorBtn) {
  openEditorBtn.addEventListener('click', () => {
    const targetUrl =
      'https://my.centraluniversity.ru/learn/courses/view/actual?customIconEditor=true';

    if (toggles.stickerEnabled && !toggles.stickerEnabled.checked) {
      toggles.stickerEnabled.checked = true;
      if (isInsideIframe) pendingChanges['stickerEnabled'] = true;
    }

    if (isInsideIframe) {
      pendingChanges['stickerEnabled'] = true;
      window.parent.postMessage(
        {
          action: 'receivePendingChanges',
          payload: pendingChanges, // Отправляем всё накопленное перед переходом
          shouldReload: false,
        },
        '*'
      );

      setTimeout(() => {
        window.parent.location.href = targetUrl;
      }, 50);
    } else {
      browser.storage.sync.set({ stickerEnabled: true }).then(() => {
        browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
          if (tabs.length > 0) {
            browser.tabs.update(tabs[0].id, { url: targetUrl });
            window.close();
          }
        });
      });
    }
  });
}

// 2. Обработчики дропдаунов (откладываем сохранение в Iframe)
if (futureExamsDisplayFormat) {
  futureExamsDisplayFormat.addEventListener('change', () => {
    const selectedFormat = futureExamsDisplayFormat.value;
    if (isInsideIframe) {
      pendingChanges['futureExamsDisplayFormat'] = selectedFormat;
      if (reloadNotice) reloadNotice.style.display = 'block';
    } else {
      browser.storage.sync.set({ futureExamsDisplayFormat: selectedFormat });
    }
  });
}

if (renameTemplateSelect) {
  renameTemplateSelect.addEventListener('change', () => {
    const template = renameTemplateSelect.value;
    if (isInsideIframe) {
      pendingChanges['autoRenameTemplate'] = template;
      if (reloadNotice) reloadNotice.style.display = 'block';
    } else {
      browser.storage.sync.set({ autoRenameTemplate: template });
    }
  });
}

if (stickerFitSelect) {
  stickerFitSelect.addEventListener('change', () => {
    const val = stickerFitSelect.value;
    if (isInsideIframe) {
      pendingChanges['stickerObjectFit'] = val;
      if (reloadNotice) reloadNotice.style.display = 'block';
    } else {
      browser.storage.sync.set({ stickerObjectFit: val });
    }
  });
}

// 3. Обработчик загрузки файла
if (stickerFileInput) {
  stickerFileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      alert('Файл слишком большой! Пожалуйста, выберите картинку до 3 МБ.');
      stickerFileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      const base64String = e.target.result;
      browser.storage.local.set({ customStickerData: base64String }).then(() => {
        loadStickerImage();
      });
    };
    reader.readAsDataURL(file);
  });
}

// 4. Обработчик удаления картинки
if (stickerResetBtn) {
  stickerResetBtn.addEventListener('click', () => {
    browser.storage.local.remove('customStickerData').then(() => {
      loadStickerImage();
      stickerFileInput.value = '';
    });
  });
}

// --- СИСТЕМНЫЕ СЛУШАТЕЛИ ---

// Отправка накопленных изменений родителю при закрытии меню
if (isInsideIframe) {
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;

    if (event.data && event.data.action === 'getPendingChanges') {
      // Перезагрузка нужна, если в pendingChanges есть что-то помимо "живых" настроек
      const needsReload = Object.keys(pendingChanges).some((k) => !LIVE_SETTINGS.includes(k));

      window.parent.postMessage(
        {
          action: 'receivePendingChanges',
          payload: pendingChanges, // Теперь мы реально передаем все изменения
          shouldReload: needsReload,
        },
        '*'
      );

      pendingChanges = {};
      if (reloadNotice) reloadNotice.style.display = 'none';
    }
  });
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') refreshToggleStates();
});

refreshToggleStates();

// Логика сброса настроек
const resetBtn = document.getElementById('reset-all-settings-btn');
if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    const confirmed = confirm(
      'Это действие сбросит все настройки:\n- Удалит скрытые курсы и друзей\n- Сбросит порядок курсов\n- Удалит стикер\n- Вернет стандартные настройки\n\nПродолжить?'
    );
    if (!confirmed) return;

    browser.storage.local.clear().then(() => {
      if (stickerFileInput) stickerFileInput.value = '';
      loadStickerImage();
    });

    if (isInsideIframe) {
      window.parent.postMessage({ action: 'RESET_LMS_LOCAL_STORAGE_IFRAME' }, '*');
    } else {
      browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        if (tabs.length > 0) {
          browser.tabs
            .sendMessage(tabs[0].id, { action: 'RESET_LMS_LOCAL_STORAGE_FROM_POPUP' })
            .catch(() => {});
        }
      });
    }

    const defaultSettings = {
      themeEnabled: false,
      oledEnabled: false,
      autoRenameEnabled: false,
      autoRenameTemplate: 'dz_fi',
      courseOverviewTaskStatusToggle: false,
      advancedStatementsEnabled: true,
      endOfCourseCalcEnabled: true,
      emojiHeartsEnabled: false,
      snowEnabled: false,
      oldCoursesDesignToggle: false,
      futureExamsViewToggle: false,
      futureExamsDisplayFormat: 'date',
      stickerEnabled: false,
      courseOverviewAutoscrollToggle: false,
      friendsEnabled: true,
      hideBonusButtonEnabled: false,
    };

    if (isInsideIframe) {
      pendingChanges = { ...pendingChanges, ...defaultSettings };

      // Сбрасываем тему сразу, чтобы было визуально понятно, что меню обнулилось
      browser.storage.sync.set({
        themeEnabled: false,
        oledEnabled: false,
      });

      Object.keys(defaultSettings).forEach((key) => {
        if (toggles[key]) {
          toggles[key].checked = defaultSettings[key];
          if (key === 'themeEnabled' && toggles.oledEnabled)
            toggles.oledEnabled.disabled = !defaultSettings[key];
          if (key === 'advancedStatementsEnabled' && toggles.endOfCourseCalcEnabled)
            toggles.endOfCourseCalcEnabled.disabled = !defaultSettings[key];
        }
      });

      if (renameTemplateSelect) renameTemplateSelect.value = defaultSettings.autoRenameTemplate;
      if (futureExamsDisplayFormat)
        futureExamsDisplayFormat.value = defaultSettings.futureExamsDisplayFormat;

      if (stickerUploadContainer) stickerUploadContainer.style.display = 'none';
      if (autoRenameFormatContainer) autoRenameFormatContainer.style.display = 'none';
      if (futureExamsDisplayContainer) futureExamsDisplayContainer.style.display = 'none';

      if (reloadNotice) reloadNotice.style.display = 'block';
    } else {
      browser.storage.sync.set(defaultSettings);
    }
  });
}

const resetCourseIconsBtn = document.getElementById('reset-course-icons-btn');
if (resetCourseIconsBtn) {
  resetCourseIconsBtn.addEventListener('click', () => {
    const confirmed = confirm('Сбросить иконки для ВСЕХ курсов? Перезагрузите страницу.');

    if (confirmed) {
      browser.storage.local.remove('courseIcons').then(() => {
        if (isInsideIframe) {
          window.parent.location.reload();
        } else {
          browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
            if (tabs.length > 0) {
              browser.tabs.reload(tabs[0].id);
              window.close();
            }
          });
        }
      });
    }
  });
}

if (gradesExportBtn) {
  gradesExportBtn.addEventListener('click', handleGradesExportClick);
}

function setGradesExportStatus(message, type = 'info') {
  if (!gradesExportStatus) return;

  gradesExportStatus.textContent = message;
  gradesExportStatus.style.color =
    type === 'error' ? '#d93025' : type === 'success' ? '#188038' : '#666';
}

async function handleGradesExportClick() {
  if (!gradesExportBtn) return;

  try {
    gradesExportBtn.disabled = true;
    setGradesExportStatus('Ищу активную вкладку LMS...');

    if (!window.XLSX) {
      throw new Error('Модуль Excel не загрузился. Пересобери расширение и открой popup заново.');
    }

    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith('https://my.centraluniversity.ru/')) {
      throw new Error('Открой вкладку my.centraluniversity.ru перед экспортом.');
    }

    setGradesExportStatus('Собираю оценки через API LMS...');
    const [injectionResult] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: fetchAllGradesForExport,
    });

    const result = injectionResult?.result;
    if (!result?.success) {
      throw new Error(result?.error || 'Не удалось получить данные LMS.');
    }

    if (!result.courses?.length) {
      throw new Error('Не нашёл активных курсов с оценками.');
    }

    setGradesExportStatus(`Генерирую Excel: ${result.courses.length} курсов...`);
    generateGradesWorkbook(result.courses);
    setGradesExportStatus('Готово: Central_University_Grades_Forecast.xlsx скачан.', 'success');
  } catch (error) {
    console.error('[CU LMS] Grades export failed:', error);
    setGradesExportStatus(error.message || 'Ошибка экспорта оценок.', 'error');
  } finally {
    gradesExportBtn.disabled = false;
  }
}

async function fetchAllGradesForExport() {
  const normalizeFetchedNumber = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };

  const enrichPerformanceTask = (task, exercisesById) => {
    const exercise = exercisesById.get(task.exerciseId) || task.exercise || null;
    const activity = task.activity || exercise?.activity || null;

    return {
      id: task.id,
      exerciseId: task.exerciseId,
      state: task.state,
      score: task.score,
      extraScore: task.extraScore,
      maxScore: normalizeFetchedNumber(task.maxScore ?? exercise?.maxScore, 10),
      activity: activity
        ? {
            id: activity.id,
            name: activity.name,
            weight: activity.weight,
            maxExercisesCount: activity.maxExercisesCount,
          }
        : null,
      exercise: exercise
        ? {
            id: exercise.id,
            name: exercise.name,
          }
        : null,
    };
  };

  const makeExerciseOnlyTask = (exercise) => ({
    id: null,
    exerciseId: exercise.id,
    state: 'planned',
    score: null,
    extraScore: null,
    maxScore: normalizeFetchedNumber(exercise.maxScore, 10),
    activity: exercise.activity
      ? {
          id: exercise.activity.id,
          name: exercise.activity.name,
          weight: exercise.activity.weight,
          maxExercisesCount: exercise.activity.maxExercisesCount,
        }
      : null,
    exercise: {
      id: exercise.id,
      name: exercise.name,
    },
  });

  const fetchJson = async (url) => {
    const response = await fetch(url, {
      headers: { accept: 'application/json, text/plain, */*' },
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`LMS API вернул ${response.status} для ${url}`);
    }

    return response.json();
  };

  try {
    const coursesData = await fetchJson(
      'https://my.centraluniversity.ru/api/micro-lms/performance/student?isArchived=false'
    );

    const courses = Array.isArray(coursesData?.courses)
      ? coursesData.courses
      : Array.isArray(coursesData?.items)
        ? coursesData.items
        : [];

    const activeCourses = courses.filter((course) => {
      const status = course.courseStudentsStatus || course.courseStudentStatus || course.status;
      return course.id && status !== 'listener' && status !== 'слушатель';
    });

    const exportedCourses = [];
    for (const course of activeCourses) {
      const [performance, exercisesData] = await Promise.all([
        fetchJson(
          `https://my.centraluniversity.ru/api/micro-lms/courses/${course.id}/student-performance`
        ),
        fetchJson(`https://my.centraluniversity.ru/api/micro-lms/courses/${course.id}/exercises`),
      ]);
      const exercises = Array.isArray(exercisesData?.exercises) ? exercisesData.exercises : [];
      // Fetch course-level activities to detect зачёт with оценкой and insert placeholders if missing
      let courseActivities = [];
      try {
        const activitiesResp = await fetchJson(
          `https://my.centraluniversity.ru/api/micro-lms/courses/${course.id}/activities`
        );
        if (Array.isArray(activitiesResp)) courseActivities = activitiesResp;
      } catch (e) {
        // ignore if endpoint unavailable
        courseActivities = [];
      }
      const exercisesById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
      const tasks = Array.isArray(performance?.tasks) ? performance.tasks : [];
      const taskExerciseIds = new Set(tasks.map((task) => task.exerciseId));
      const exerciseOnlyTasks = exercises
        .filter((exercise) => exercise.id && !taskExerciseIds.has(exercise.id))
        .map(makeExerciseOnlyTask);
      // Build placeholders for activities that exist in course activities but have no tasks yet
      // This ensures that exams, зачёт, etc. appear in the export regardless of their names.
      const placeholders = [];
      if (Array.isArray(courseActivities)) {
        const existingActIds = new Set(tasks.map((t) => t.activity?.id).filter(Boolean));
        for (const act of courseActivities) {
          if (!act?.id) continue;
          if (
            !existingActIds.has(act.id) &&
            typeof act.maxExercisesCount === 'number' &&
            act.maxExercisesCount > 0
          ) {
            placeholders.push({
              id: null,
              exerciseId: null,
              state: 'planned',
              score: null,
              extraScore: null,
              maxScore: 10,
              activity: {
                id: act.id,
                name: act.name,
                weight: act.weight,
                maxExercisesCount: act.maxExercisesCount,
              },
              exercise: {
                id: null,
                name: act.name,
              },
            });
          }
        }
      }

      // (stable) no extra handling of activities-perf data here

      exportedCourses.push({
        id: course.id,
        name: course.name || `Курс ${course.id}`,
        tasks: [
          ...tasks.map((task) => enrichPerformanceTask(task, exercisesById)),
          ...placeholders,
          ...exerciseOnlyTasks,
        ],
      });
    }

    return { success: true, courses: exportedCourses };
  } catch (error) {
    console.error('[CU LMS] Grades export fetch failed:', error);
    return { success: false, error: error.message || 'Ошибка запроса к LMS API.' };
  }
}

function generateGradesWorkbook(courses) {
  const XLSX = window.XLSX;
  const workbook = XLSX.utils.book_new();
  const usedSheetNames = new Set();
  const courseSheets = courses.map((course) => ({
    course,
    sheetName: makeUniqueSheetName(course.name, usedSheetNames),
  }));

  const summaryRows = [
    ['Курс', 'Накопленный балл', 'Категорий', 'Заданий'],
    ...courseSheets.map(({ course, sheetName }) => [
      course.name,
      { t: 'n', f: `${quoteSheetName(sheetName)}!B1` },
      groupTasksByActivity(course.tasks).length,
      getPlannedTasksCount(groupTasksByActivity(course.tasks)),
    ]),
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet['!cols'] = [{ wch: 42 }, { wch: 18 }, { wch: 12 }, { wch: 10 }];
  applySummarySheetStyles(summarySheet, summaryRows.length);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Сводка');

  courseSheets.forEach(({ course, sheetName }) => {
    const groups = groupTasksByActivity(course.tasks);
    const maxTasks = getMaxTasksInGroups(groups);
    const rows = [
      [
        'НАКОПЛЕННЫЙ БАЛЛ:',
        { t: 'n', f: makeCourseTotalFormula(groups.length) },
        '',
        'Меняй значения в строках "Баллы", чтобы увидеть прогноз.',
      ],
      ['Курс:', course.name],
      [
        'Цвета:',
        'зеленый - оценено',
        'красный - провалено',
        'желтый - в работе/на проверке',
        'серый - без оценки',
      ],
      [
        'Категория',
        'Вес',
        'Заданий в категории',
        'Вклад в итог (баллы)',
        'Средний балл',
        ...Array.from({ length: maxTasks }, (_, index) => `Задача ${index + 1}`),
      ],
    ];
    const groupMeta = [];

    groups.forEach((group) => {
      const categoryRow = rows.length + 1;
      const scoreRow = categoryRow + 1;
      const plannedTasks = getPlannedTasks(group);
      const taskCount = plannedTasks.length;
      const scoreSumFormula = makeScoreSumFormula(plannedTasks.length, scoreRow);

      rows.push([
        group.name,
        group.weight,
        taskCount,
        {
          t: 'n',
          f: `ROUND(IF(C${categoryRow}>0,(${scoreSumFormula}/C${categoryRow})*B${categoryRow},0),2)`,
        },
        {
          t: 'n',
          f: `ROUND(IF(C${categoryRow}>0,${scoreSumFormula}/C${categoryRow},0),2)`,
        },
        ...plannedTasks.map((task) => formatTaskName(task)),
      ]);

      rows.push([
        'Баллы для прогноза',
        '',
        '',
        '',
        '',
        ...plannedTasks.map((task) => getTaskScore(task)),
      ]);

      rows.push([]);
      groupMeta.push({ categoryRow, scoreRow, group, plannedTasks });
    });

    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols'] = [
      { wch: 28 },
      { wch: 10 },
      { wch: 18 },
      { wch: 16 },
      { wch: 14 },
      ...Array.from({ length: maxTasks }, () => ({ wch: 26 })),
    ];
    sheet['!rows'] = makeCourseRowHeights(rows.length, groupMeta);
    applyCourseSheetStyles(sheet, groupMeta, maxTasks);
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  });

  XLSX.writeFile(workbook, 'Central_University_Grades_Forecast.xlsx');
}

function groupTasksByActivity(tasks) {
  const groups = new Map();

  tasks.forEach((task) => {
    const activity = task.activity || task.exercise?.activity || {};
    let key = activity.id || activity.name;
    let nameForGroup = activity.name || 'Активность без веса';

    // Special handling: some exports place a "Зачёт/зачет" task without an activity.
    // In that case, group them under a dedicated "Зачёт" category.
    if (!key) {
      const exName = (task.exercise?.name || '').toLowerCase();
      if (exName.includes('зачёт') || exName.includes('зачет')) {
        key = 'zachet';
        nameForGroup = 'Зачёт';
      } else {
        key = 'without-activity';
        nameForGroup = 'Активность без веса';
      }
    }

    if (!groups.has(key)) {
      groups.set(key, {
        name: nameForGroup,
        weight: normalizeNumber(activity.weight, 0),
        maxCount: normalizeNumber(activity.maxExercisesCount, 0),
        tasks: [],
      });
    }

    groups.get(key).tasks.push(task);
  });

  return Array.from(groups.values());
}

function makeCourseTotalFormula(groupCount) {
  if (groupCount === 0) return '0';

  const contributionCells = [];
  for (let index = 0; index < groupCount; index += 1) {
    contributionCells.push(`D${5 + index * 3}`);
  }

  return `ROUND(SUM(${contributionCells.join(',')}),2)`;
}

function makeScoreSumFormula(taskCount, scoreRow) {
  if (taskCount === 0) return '0';

  // Stable baseline: first task uses column 5 + index (E, F, G, ...)
  return `(${Array.from({ length: taskCount }, (_, index) => {
    const column = toColumnName(5 + index);
    return `MIN(10,MAX(0,IF(ISNUMBER(${column}${scoreRow}),${column}${scoreRow},0)))`;
  }).join('+')})`;
}

function formatTaskName(task) {
  return task.exercise?.name || task.name || task.title || 'Без названия';
}

function getTaskScore(task) {
  if (task.score === null || task.score === undefined || task.score === '') return '';

  const score = Number(task.score);
  const extraScore = Number(task.extraScore || 0);
  if (!Number.isFinite(score)) return '';

  return roundToTwo(Math.min(score + (Number.isFinite(extraScore) ? extraScore : 0), 10));
}

function normalizeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundToTwo(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getMaxTasksInGroups(groups) {
  return groups.reduce((max, group) => Math.max(max, getPlannedTaskCount(group)), 1);
}

function getPlannedTasksCount(groups) {
  return groups.reduce((total, group) => total + getPlannedTaskCount(group), 0);
}

function getPlannedTaskCount(group) {
  return Math.max(group.maxCount || 0, group.tasks.length, 1);
}

function getPlannedTasks(group) {
  const plannedCount = getPlannedTaskCount(group);
  const tasks = [...group.tasks];

  for (let index = tasks.length; index < plannedCount; index += 1) {
    tasks.push({
      state: 'planned',
      score: null,
      extraScore: null,
      maxScore: 10,
      activity: {
        id: null,
        name: group.name,
        weight: group.weight,
        maxExercisesCount: group.maxCount,
      },
      exercise: {
        id: null,
        name: `${group.name}: задача ${index + 1}`,
      },
    });
  }

  return tasks;
}

function toColumnName(index) {
  let columnNumber = index + 1;
  let name = '';

  while (columnNumber > 0) {
    const remainder = (columnNumber - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    columnNumber = Math.floor((columnNumber - 1) / 26);
  }

  return name;
}

function makeCourseRowHeights(rowCount, groupMeta) {
  const rows = Array.from({ length: rowCount }, () => ({ hpt: 22 }));
  rows[0] = { hpt: 26 };
  rows[3] = { hpt: 28 };

  groupMeta.forEach(({ categoryRow, scoreRow }) => {
    rows[categoryRow - 1] = { hpt: 46 };
    rows[scoreRow - 1] = { hpt: 24 };
    rows[scoreRow] = { hpt: 8 };
  });

  return rows;
}

function applySummarySheetStyles(sheet, rowCount) {
  for (let column = 0; column < 4; column += 1) {
    applyCellStyle(sheet, `${toColumnName(column)}1`, STYLES.header);
  }

  for (let row = 2; row <= rowCount; row += 1) {
    applyCellStyle(sheet, `A${row}`, STYLES.text);
    applyCellStyle(sheet, `B${row}`, STYLES.points);
    applyCellStyle(sheet, `C${row}`, STYLES.integer);
    applyCellStyle(sheet, `D${row}`, STYLES.integer);
  }
}

function applyCourseSheetStyles(sheet, groupMeta, maxTasks) {
  applyCellStyle(sheet, 'A1', STYLES.title);
  applyCellStyle(sheet, 'B1', STYLES.total);

  for (let column = 0; column < 5 + maxTasks; column += 1) {
    applyCellStyle(sheet, `${toColumnName(column)}4`, STYLES.header);
  }

  groupMeta.forEach(({ categoryRow, scoreRow, plannedTasks }) => {
    ['A', 'B', 'C', 'D', 'E'].forEach((column) => {
      applyCellStyle(sheet, `${column}${categoryRow}`, STYLES.category);
    });
    applyCellStyle(sheet, `B${categoryRow}`, STYLES.weight);
    applyCellStyle(sheet, `C${categoryRow}`, STYLES.integerCategory);
    applyCellStyle(sheet, `D${categoryRow}`, STYLES.pointsCategory);
    applyCellStyle(sheet, `E${categoryRow}`, STYLES.pointsCategory);
    applyCellStyle(sheet, `A${scoreRow}`, STYLES.scoreLabel);

    plannedTasks.forEach((task, index) => {
      const column = toColumnName(5 + index);
      const taskStyle = getTaskStatusStyle(task.state);
      applyCellStyle(sheet, `${column}${categoryRow}`, taskStyle.name);
      applyCellStyle(sheet, `${column}${scoreRow}`, taskStyle.score);
    });
  });
}

function applyCellStyle(sheet, address, style) {
  if (!sheet[address]) return;
  sheet[address].s = style.s;
  if (style.z) sheet[address].z = style.z;
}

function getTaskStatusStyle(state) {
  if (state === 'evaluated') {
    return { name: STYLES.taskEvaluated, score: STYLES.scoreEvaluated };
  }

  if (state === 'failed') {
    return { name: STYLES.taskFailed, score: STYLES.scoreFailed };
  }

  if (['review', 'submitted', 'reworking', 'inProgress'].includes(state)) {
    return { name: STYLES.taskInProgress, score: STYLES.scoreInProgress };
  }

  return { name: STYLES.taskEmpty, score: STYLES.scoreEmpty };
}

const STYLES = {
  header: {
    s: {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '1F4E78' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: makeBorder('D9E2F3'),
    },
  },
  title: {
    s: {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '0B5D2A' } },
      alignment: { vertical: 'center' },
      border: makeBorder('D9EAD3'),
    },
  },
  total: {
    z: '0.00',
    s: {
      font: { bold: true, color: { rgb: '0B5D2A' } },
      fill: { fgColor: { rgb: 'E2F0D9' } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: makeBorder('D9EAD3'),
    },
  },
  text: {
    s: {
      alignment: { vertical: 'center' },
      border: makeBorder('E7E6E6'),
    },
  },
  points: {
    z: '0.00',
    s: {
      alignment: { horizontal: 'right', vertical: 'center' },
      border: makeBorder('E7E6E6'),
    },
  },
  integer: {
    z: '0',
    s: {
      alignment: { horizontal: 'right', vertical: 'center' },
      border: makeBorder('E7E6E6'),
    },
  },
  category: {
    s: {
      font: { bold: true },
      fill: { fgColor: { rgb: 'DDEBF7' } },
      alignment: { vertical: 'center', wrapText: true },
      border: makeBorder('B4C6E7'),
    },
  },
  weight: {
    z: '0.00',
    s: {
      font: { bold: true },
      fill: { fgColor: { rgb: 'DDEBF7' } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: makeBorder('B4C6E7'),
    },
  },
  integerCategory: {
    z: '0',
    s: {
      font: { bold: true },
      fill: { fgColor: { rgb: 'DDEBF7' } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: makeBorder('B4C6E7'),
    },
  },
  pointsCategory: {
    z: '0.00',
    s: {
      font: { bold: true },
      fill: { fgColor: { rgb: 'DDEBF7' } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: makeBorder('B4C6E7'),
    },
  },
  scoreLabel: {
    s: {
      font: { italic: true, color: { rgb: '666666' } },
      alignment: { vertical: 'center' },
      border: makeBorder('E7E6E6'),
    },
  },
  taskEvaluated: makeTaskNameStyle('D9EAD3'),
  scoreEvaluated: makeScoreStyle('EAF5E6'),
  taskFailed: makeTaskNameStyle('F4CCCC'),
  scoreFailed: makeScoreStyle('FCE4E4'),
  taskInProgress: makeTaskNameStyle('FFF2CC'),
  scoreInProgress: makeScoreStyle('FFF8DC'),
  taskEmpty: makeTaskNameStyle('E7E6E6'),
  scoreEmpty: makeScoreStyle('F3F3F3'),
};

function makeTaskNameStyle(fillColor) {
  return {
    s: {
      font: { bold: true, sz: 10 },
      fill: { fgColor: { rgb: fillColor } },
      alignment: { vertical: 'top', wrapText: true },
      border: makeBorder('D9D9D9'),
    },
  };
}

function makeScoreStyle(fillColor) {
  return {
    z: '0.00',
    s: {
      fill: { fgColor: { rgb: fillColor } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: makeBorder('D9D9D9'),
    },
  };
}

function makeBorder(color) {
  const style = { style: 'thin', color: { rgb: color } };
  return {
    top: style,
    right: style,
    bottom: style,
    left: style,
  };
}

function makeUniqueSheetName(name, usedNames) {
  const cleanName = String(name || 'Курс')
    .replace(/[\\/?*[\]:]/g, ' ')
    .split('')
    .map((char) => (char.charCodeAt(0) < 32 ? ' ' : char))
    .join('')
    .replace(/[\u{1f300}-\u{1faff}\u{2600}-\u{27bf}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  const baseName = (cleanName || 'Курс').slice(0, 31);
  let sheetName = baseName;
  let counter = 2;

  while (usedNames.has(sheetName)) {
    const suffix = ` ${counter}`;
    sheetName = `${baseName.slice(0, 31 - suffix.length)}${suffix}`;
    counter += 1;
  }

  usedNames.add(sheetName);
  return sheetName;
}

function quoteSheetName(sheetName) {
  return `'${sheetName.replace(/'/g, "''")}'`;
}
