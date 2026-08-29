// pdf_dark_theme.js — Dark theme for PDF files in longreads
//
// Этот файл только перехватывает клик по PDF-вложению и достаёт ссылку на
// оригинал. Скачиванием, перекраской и показом занимается отдельная страница
// расширения plugins/longreads/pdf_viewer.html (см. pdf_viewer.js) — вкладку
// с ней открывает background по сообщению OPEN_PDF_VIEWER.
//
// Раньше всё это жило прямо здесь: window.open('', '_blank') + document.write
// + <embed> с blob-URL. В Firefox так не работает (вкладка навсегда оставалась
// на about:blank), поэтому тяжёлая часть вынесена на страницу расширения.
// Не возвращай её обратно в content-скрипт.

if (typeof browser === 'undefined') {
  // var, а не const: файл переинжектится при каждой SPA-навигации.
  var browser = chrome;
}

if (typeof window.__culmsPdfDarkThemeInitialized === 'undefined') {
  window.__culmsPdfDarkThemeInitialized = true;

  ('use strict');

  const LOG_PREFIX = '[CU LMS PDF Dark]';

  // =========================================================================
  // Storage key
  // =========================================================================
  const SETTING_KEY = 'darkPdfEnabled';

  // =========================================================================
  // DOM integration — intercept PDF file links in longreads
  // =========================================================================

  function isPdfFile(fileElement) {
    const typeDiv = fileElement.querySelector('.t-type');
    return typeDiv && typeDiv.textContent.trim().toLowerCase() === '.pdf';
  }

  let isDarkPdfStateEnabled = false;
  browser.storage.sync.get([SETTING_KEY]).then((data) => {
    isDarkPdfStateEnabled = !!data[SETTING_KEY];
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[SETTING_KEY]) {
      isDarkPdfStateEnabled = changes[SETTING_KEY].newValue;
    }
  });

  // Get the download URL for a PDF file element via the LMS API
  async function getPdfDownloadUrl(fileElement) {
    const nameDiv = fileElement.querySelector('.t-name');
    const typeDiv = fileElement.querySelector('.t-type');
    if (!nameDiv || !typeDiv) return null;

    const displayName = nameDiv.textContent.trim() + typeDiv.textContent.trim();
    const match = window.location.pathname.match(/longreads\/(\d+)/);
    if (!match) return null;

    // Use the shared materials API if available
    let materialsData;
    if (window.__culmsLmsApi?.fetchMaterials) {
      materialsData = await window.__culmsLmsApi.fetchMaterials(match[1]);
    } else {
      const resp = await fetch(
        `https://my.centraluniversity.ru/api/micro-lms/longreads/${match[1]}/materials?limit=10000`,
        { credentials: 'include' }
      );
      materialsData = await resp.json();
    }

    if (!materialsData?.items) return null;

    let foundFilename = null,
      foundVersion = null;
    for (const item of materialsData.items) {
      if (item.content?.name === displayName && item.content?.filename) {
        foundFilename = item.content.filename;
        foundVersion = item.content.version || item.version;
        break;
      }
      const attachments = item.attachments || item.content?.attachments || [];
      const found = attachments.find((att) => att.name === displayName);
      if (found) {
        foundFilename = found.filename;
        foundVersion = found.version;
        break;
      }
    }

    if (!foundFilename) return null;

    const linkResp = await fetch(
      `https://my.centraluniversity.ru/api/micro-lms/content/download-link?filename=${encodeURIComponent(foundFilename)}&version=${foundVersion}`,
      { credentials: 'include' }
    );
    const linkData = await linkResp.json();
    return linkData?.url || null;
  }

  // =========================================================================
  // Перехват кликов по PDF-вложениям
  // =========================================================================

  /** Отдаёт клик Angular'у, как будто мы в него и не вмешивались. */
  function passClickThrough(fileElement) {
    fileElement.dataset.cuPdfDarkIgnore = 'true';
    fileElement.click();
  }

  document.addEventListener(
    'click',
    async (e) => {
      const fileElement = e.target.closest('a.file');
      if (!fileElement) return;

      // Don't intercept download button clicks
      if (e.target.closest('button[tuiiconbutton]') || e.target.closest('button[tuibutton]'))
        return;

      // Allow fallback clicks to pass through to Angular natively
      if (fileElement.dataset.cuPdfDarkIgnore === 'true') {
        delete fileElement.dataset.cuPdfDarkIgnore;
        return;
      }

      if (!isPdfFile(fileElement)) return;
      if (!isDarkPdfStateEnabled) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const originalOpacity = fileElement.style.opacity;
      const originalCursor = fileElement.style.cursor;
      fileElement.style.opacity = '0.5';
      fileElement.style.cursor = 'wait';

      // Весь обработчик обёрнут в try/catch намеренно: он async, и любое
      // необработанное исключение здесь превращается в тихий unhandled
      // rejection — именно так предыдущая версия молча ломалась в Firefox.
      try {
        // Вкладку открывает background через tabs.create, а не window.open,
        // поэтому блокировщик всплывающих окон не при чём и можно спокойно
        // дождаться ссылки перед открытием.
        const pdfUrl = await getPdfDownloadUrl(fileElement);

        if (!pdfUrl) {
          // Файла нет в API материалов — скорее всего это решение студента.
          // Мы уже остановили распространение события, поэтому кликаем сами.
          passClickThrough(fileElement);
          return;
        }

        const filename =
          (fileElement.querySelector('.t-name')?.textContent?.trim() || 'Document') +
          (fileElement.querySelector('.t-type')?.textContent?.trim() || '.pdf');

        const response = await browser.runtime.sendMessage({
          action: 'OPEN_PDF_VIEWER',
          url: pdfUrl,
          filename,
        });

        if (!response?.success) {
          throw new Error(response?.error || 'background не смог открыть вкладку');
        }
      } catch (err) {
        console.error(`${LOG_PREFIX} Не удалось открыть тёмный PDF:`, err);
        // Лучше отдать пользователю обычный светлый PDF, чем ничего.
        passClickThrough(fileElement);
      } finally {
        fileElement.style.opacity = originalOpacity;
        fileElement.style.cursor = originalCursor;
      }
    },
    { capture: true }
  );
}
