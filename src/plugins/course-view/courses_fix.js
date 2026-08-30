// courses_fix.js — оркестратор виджетов страницы отдельного курса
/* global viewFutureExams, activateCourseOverviewTaskStatus, activateCourseExporter, activateCourseOverviewAutoscroll */

// Polyfill to handle browser namespace differences (Chrome uses 'chrome', Firefox uses 'browser')
if (typeof browser === 'undefined') {
  var browser = chrome;
}

if (typeof window.culmsCourseFixInitialized === 'undefined') {
  window.culmsCourseFixInitialized = true;

  ('use strict');
  let currentUrl = location.href;
  let previousUrl = null;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }

  function main() {
    const reloadKeys = [
      'futureExamsViewToggle',
      'courseOverviewTaskStatusToggle',
      'futureExamsDisplayFormat',
    ];
    browser.storage.onChanged.addListener((changes) => {
      if (reloadKeys.some((key) => key in changes)) {
        window.location.reload();
      }
    });

    const observer = new MutationObserver(() => {
      // Проверка на валидность контекста расширения
      try {
        if (typeof browser !== 'undefined' && !browser.runtime?.id) {
          observer.disconnect();
          return;
        }
      } catch (e) {
        observer.disconnect();
        return;
      }

      if (location.href !== currentUrl) {
        previousUrl = currentUrl;
        currentUrl = location.href;

        // Небольшая задержка, чтобы Angular успел отрендерить контент
        setTimeout(() => {
          const currentPath = window.location.pathname;
          const isOnIndividualCoursePage = /\/view\/(?:actual|archived)\/\d+/.test(currentPath);
          if (isOnIndividualCoursePage) {
            processInvidualCoursePage();
          }
        }, 300);
      }
    });

    observer.observe(document.body, { subtree: true, childList: true });

    // Начальная обработка с задержкой для первой загрузки страницы
    // Angular нужно время для рендеринга
    setTimeout(() => {
      const currentPath = window.location.pathname;
      const isOnIndividualCoursePage = /\/view\/(?:actual|archived)\/\d+/.test(currentPath);
      if (isOnIndividualCoursePage) {
        processInvidualCoursePage();
      }
    }, 500);
  }

  async function processInvidualCoursePage() {
    try {
      await processFutureExams();
      await processCourseOverviewTaskStatus();
      await processCourseExporter();

      const activeCoursesPathRegex = /^\/learn\/courses\/view\/(?:actual|archived)$/;
      if (previousUrl) {
        const previousPath = new URL(previousUrl).pathname;
        if (activeCoursesPathRegex.test(previousPath)) {
          await processCourseOverviewAutoscroll();
        }
      } else {
        await processCourseOverviewAutoscroll();
      }
    } catch (e) {
      window.cuLmsLog('Error processing individual course page', e);
    }
  }

  async function processFutureExams() {
    try {
      const { futureExamsViewToggle } = await browser.storage.sync.get('futureExamsViewToggle');
      const { futureExamsDisplayFormat } = await browser.storage.sync.get(
        'futureExamsDisplayFormat'
      );

      if (!!futureExamsViewToggle && typeof viewFutureExams === 'function') {
        await viewFutureExams(futureExamsDisplayFormat || 'date');
      }
    } catch (e) {
      console.log('Something went wrong with future exams', e);
    }
  }

  async function processCourseOverviewTaskStatus() {
    try {
      const { courseOverviewTaskStatusToggle } = await browser.storage.sync.get(
        'courseOverviewTaskStatusToggle'
      );
      if (
        !!courseOverviewTaskStatusToggle &&
        typeof activateCourseOverviewTaskStatus === 'function'
      ) {
        await activateCourseOverviewTaskStatus();
      }
    } catch (e) {
      console.log('Something went wrong with course overview task status', e);
    }
  }

  async function processCourseExporter() {
    try {
      const { courseExporterToggle } = await browser.storage.sync.get('courseExporterToggle');
      if (
        (!!courseExporterToggle || courseExporterToggle === undefined) &&
        typeof activateCourseExporter === 'function'
      ) {
        await activateCourseExporter();
      }
    } catch (e) {
      console.log('Something went wrong with course exporter', e);
    }
  }

  async function processCourseOverviewAutoscroll() {
    try {
      const { courseOverviewAutoscrollToggle } = await browser.storage.sync.get(
        'courseOverviewAutoscrollToggle'
      );
      if (
        !!courseOverviewAutoscrollToggle &&
        typeof activateCourseOverviewAutoscroll === 'function'
      ) {
        await activateCourseOverviewAutoscroll();
      }
    } catch (e) {
      console.log('Something went wrong with course overview task status', e);
    }
  }
}
