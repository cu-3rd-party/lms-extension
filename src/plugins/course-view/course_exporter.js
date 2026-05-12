// course_exporter.js
/* global fflate, PDFLib */

// Кэш для хранения данных материалов и задач
var materialsCache = typeof materialsCache !== 'undefined' ? materialsCache : null;
var currentLongreadsId = typeof currentLongreadsId !== 'undefined' ? currentLongreadsId : null;
var tasksCache = typeof tasksCache !== 'undefined' ? tasksCache : {};

var COURSE_SCAN_DELAY_MS = 300; // Задержка между запросами (в мс)

// Mock-функция лога, чтобы избежать ошибок, если она не определена
if (!window.cuLmsLog) {
  window.cuLmsLog = console.log;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    if (timeout > 0) {
      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout waiting for element: ${selector}`));
      }, timeout);
    }
  });
}

async function fetchMaterials(longreadsId) {
  if (materialsCache && currentLongreadsId === longreadsId) {
    window.cuLmsLog('Returning materials from cache for longreads ID:', longreadsId);
    return materialsCache;
  }

  window.cuLmsLog(`Fetching materials for longreads ID: ${longreadsId}`);
  const apiUrl = `https://my.centraluniversity.ru/api/micro-lms/longreads/${longreadsId}/materials?limit=10000`;

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: { accept: 'application/json, text/plain, */*' },
      mode: 'cors',
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        window.cuLmsLog('Unauthorized: Please ensure you are logged in.');
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    materialsCache = data;
    currentLongreadsId = longreadsId;
    return data;
  } catch (error) {
    window.cuLmsLog('Error fetching longreads materials:', error);
    return null;
  }
}

async function fetchTaskDetails(taskId) {
  if (!taskId) return null;
  if (tasksCache[taskId]) return tasksCache[taskId];

  const apiUrl = `https://my.centraluniversity.ru/api/micro-lms/tasks/${taskId}`;
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: { accept: 'application/json, text/plain, */*' },
      mode: 'cors',
      credentials: 'include',
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();
    tasksCache[taskId] = data;
    return data;
  } catch (error) {
    window.cuLmsLog('Error fetching task details:', error);
    return null;
  }
}

async function getDownloadLinkApi(filename, version) {
  const encodedFilename = encodeURIComponent(filename).replace(/\//g, '%2F');
  const apiUrl = `https://my.centraluniversity.ru/api/micro-lms/content/download-link?filename=${encodedFilename}&version=${version}`;

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: { accept: 'application/json' },
      mode: 'cors',
      credentials: 'include',
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data ? data.url : null;
  } catch (error) {
    window.cuLmsLog(`Error fetching download link for ${filename}:`, error);
    return null;
  }
}

async function fetchCourseOverview(courseId) {
  const apiUrl = `https://my.centraluniversity.ru/api/micro-lms/courses/${courseId}/overview`;
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: { accept: 'application/json' },
      mode: 'cors',
      credentials: 'include',
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data.themes.map((theme) => ({
      id: theme.id,
      name: theme.name,
      longreads: theme.longreads.map((longread) => ({
        id: longread.id,
        name: longread.name,
        downloadUrls: [],
      })),
    }));
  } catch (error) {
    window.cuLmsLog(`Error fetching overview for course ${courseId}:`, error);
    return [];
  }
}

async function scanLongreadMaterials(longreadId, includeHomework = true) {
  const downloadUrls = [];
  const materialsData = await fetchMaterials(longreadId);

  if (!materialsData || !materialsData.items) return downloadUrls;

  for (const item of materialsData.items) {
    const filesToProcess = [];

    if (item.attachments && item.attachments.length > 0) {
      filesToProcess.push(...item.attachments);
    }
    if (item.discriminator === 'file' && item.content) {
      filesToProcess.push(item.content);
    } else if (item.discriminator === 'file' && item.filename && item.version) {
      filesToProcess.push({ name: item.filename, filename: item.filename, version: item.version });
    }

    if (includeHomework && (item.taskId || (item.task && item.task.id))) {
      const taskId = item.taskId || item.task.id;
      await delay(COURSE_SCAN_DELAY_MS);
      const taskDetails = await fetchTaskDetails(taskId);
      if (taskDetails?.solution?.attachments?.length > 0) {
        filesToProcess.push(...taskDetails.solution.attachments);
      }
    }

    // Получаем ссылки на скачивание параллельно для всех файлов в одном элементе лонгрида
    const linkPromises = filesToProcess.map(async (file) => {
      if (!file.filename || !file.version || !file.name) return null;
      const url = await getDownloadLinkApi(file.filename, file.version);
      return url ? { fileName: file.name, fullDownloadLink: url } : null;
    });

    const results = await Promise.all(linkPromises);
    results.forEach((res) => {
      if (res) downloadUrls.push(res);
    });

    await delay(COURSE_SCAN_DELAY_MS / 2);
  }
  return downloadUrls;
}

async function gatherAllFiles(courseId, courseName, includeHomework = true, onProgress = () => {}) {
  window.cuLmsLog(`Starting scan for course: ${courseName} (${courseId})`);
  onProgress('Загрузка структуры курса...');

  const themes = await fetchCourseOverview(courseId);
  await delay(COURSE_SCAN_DELAY_MS * 3);

  const allFiles = [];
  let totalLongreads = 0;
  themes.forEach((t) => (totalLongreads += t.longreads.length));
  let processedLongreads = 0;

  for (const theme of themes) {
    for (const longread of theme.longreads) {
      processedLongreads++;
      const percent = Math.round((processedLongreads / totalLongreads) * 100);
      onProgress(`Скан: ${percent}%`);
      window.cuLmsLog(`\n---> Processing longread: ${longread.name} (ID: ${longread.id})`);
      const urls = await scanLongreadMaterials(longread.id, includeHomework);
      allFiles.push(
        ...urls.map((u) => ({
          ...u,
          themeName: theme.name,
          longreadName: longread.name,
          longreadId: longread.id,
        }))
      );
      await delay(COURSE_SCAN_DELAY_MS);
    }
  }

  return allFiles;
}

async function downloadFileBuffer(url, retries = 3) {
  const bypassUrl = new URL(url);
  bypassUrl.searchParams.set('ngsw-bypass', 'true');

  for (let i = 0; i < retries; i++) {
    try {
      return await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', bypassUrl.toString(), true);
        xhr.responseType = 'arraybuffer';

        // Отключаем кэширование
        xhr.setRequestHeader('Cache-Control', 'no-cache');
        xhr.setRequestHeader('Pragma', 'no-cache');

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr.response);
          } else {
            reject(new Error(`HTTP ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error('Network Error'));
        xhr.ontimeout = () => reject(new Error('Timeout'));

        // Устанавливаем разумный таймаут (60 сек)
        xhr.timeout = 60000;

        xhr.send();
      });
    } catch (e) {
      if (i === retries - 1) throw e;
      window.cuLmsLog(`Download attempt ${i + 1} failed for ${url}, retrying...`, e);
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

function sanitizePath(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

async function runZipExport(
  courseId,
  courseName,
  includeHomework = true,
  flattenFolders = false,
  onProgress = () => {}
) {
  const files = await gatherAllFiles(courseId, courseName, includeHomework, onProgress);

  if (files.length === 0) {
    onProgress('Файлы не найдены');
    return;
  }

  window.cuLmsLog(`Gathered ${files.length} files. Starting streaming ZIP export...`);

  const zipChunks = [];
  const zip = new fflate.Zip();

  // Создаем промис, который зарезолвится, когда придет финальный чанк
  const zipFinished = new Promise((resolve, reject) => {
    zip.ondata = (err, data, final) => {
      if (err) {
        window.cuLmsLog('fflate streaming error:', err);
        reject(err);
        return;
      }
      if (data) zipChunks.push(data);
      if (final) resolve();
    };
  });

  let processedFiles = 0;
  const existingPaths = new Set();

  for (const f of files) {
    processedFiles++;
    const percent = Math.round((processedFiles / files.length) * 100);
    onProgress(`Сбор: ${percent}%`);

    try {
      let buffer = await downloadFileBuffer(f.fullDownloadLink);
      window.cuLmsLog(
        `[${processedFiles}/${files.length}] Downloaded: ${f.fileName} (${buffer.byteLength} bytes)`
      );

      const safeFile = sanitizePath(f.fileName);
      let filePath;
      if (flattenFolders) {
        filePath = safeFile;
        let counter = 1;
        while (existingPaths.has(filePath)) {
          const lastDot = safeFile.lastIndexOf('.');
          if (lastDot !== -1) {
            filePath = `${safeFile.substring(0, lastDot)}_${counter}${safeFile.substring(lastDot)}`;
          } else {
            filePath = `${safeFile}_${counter}`;
          }
          counter++;
        }
      } else {
        const safeTheme = sanitizePath(f.themeName);
        const safeLongread = sanitizePath(`${f.longreadName} (${f.longreadId})`);
        filePath = `${safeTheme}/${safeLongread}/${safeFile}`;

        let counter = 1;
        let originalPath = filePath;
        while (existingPaths.has(filePath)) {
          const lastDot = originalPath.lastIndexOf('.');
          if (lastDot !== -1) {
            filePath = `${originalPath.substring(0, lastDot)}_${counter}${originalPath.substring(lastDot)}`;
          } else {
            filePath = `${originalPath}_${counter}`;
          }
          counter++;
        }
      }

      existingPaths.add(filePath);

      // Важно: добавляем файл в архив ТОЛЬКО после успешной загрузки
      const zipFile = new fflate.ZipDeflate(filePath, { level: 6 });
      zip.add(zipFile);
      zipFile.push(new Uint8Array(buffer), true);

      buffer = null;

      if (processedFiles % 5 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    } catch (e) {
      window.cuLmsLog(`Error adding ${f.fileName} to ZIP:`, e);
      // Если файл не скачался, мы его просто пропускаем,
      // не добавляя в zip.add(), поэтому fflate не будет его ждать.
    }
  }

  window.cuLmsLog('All files processed. Finalizing ZIP...');
  onProgress('Завершение...');
  zip.end();

  // Ждем финализации с таймаутом на всякий случай
  await Promise.race([
    zipFinished,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Zip finalization timeout')), 30000)
    ),
  ]);

  window.cuLmsLog('ZIP finalized. Triggering download...');
  const blob = new Blob(zipChunks, { type: 'application/zip' });
  zipChunks.length = 0;

  const url = URL.createObjectURL(blob);
  const filename = `course_${courseId}_materials.zip`;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.cuLmsLog('Download triggered (a.click)');

  // Показываем уведомление пользователю
  setTimeout(() => {
    alert('Экспорт материалов завершен успешно!');
  }, 100);

  // В Firefox немедленное удаление элемента и отзыв URL могут прервать скачивание
  setTimeout(() => {
    if (a.parentNode) document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 60000);
}

async function runPdfExport(courseId, courseName, includeHomework = false, onProgress = () => {}) {
  const files = await gatherAllFiles(courseId, courseName, includeHomework, onProgress);
  const pdfFiles = files.filter((f) => f.fileName.toLowerCase().endsWith('.pdf'));

  window.cuLmsLog(`Gathered ${pdfFiles.length} PDF files. Merging...`);

  if (pdfFiles.length === 0) {
    onProgress('PDF файлы не найдены');
    return;
  }

  const mergedPdf = await PDFLib.PDFDocument.create();

  let processedFiles = 0;
  for (const f of pdfFiles) {
    processedFiles++;
    const percent = Math.round((processedFiles / pdfFiles.length) * 100);
    onProgress(`Сбор: ${percent}%`);
    try {
      let buffer = await downloadFileBuffer(f.fullDownloadLink);
      let pdf = await PDFLib.PDFDocument.load(buffer);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));

      // Явно зануляем временные объекты для освобождения памяти
      buffer = null;
      pdf = null;

      // Даем браузеру обработать UI события
      if (processedFiles % 5 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    } catch (e) {
      window.cuLmsLog(`Error merging PDF ${f.fileName}:`, e);
    }
  }

  onProgress('Сборка итогового PDF...');
  const pdfBytes = await mergedPdf.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const filename = `course_${courseId}_combined.pdf`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.cuLmsLog('Download triggered (a.click)');

  // Показываем уведомление пользователю
  setTimeout(() => {
    alert('Экспорт PDF завершен успешно!');
  }, 100);

  // В Firefox немедленное удаление элемента и отзыв URL могут прервать скачивание
  setTimeout(() => {
    if (a.parentNode) document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 60000);
}

var isExportInitializing =
  typeof isExportInitializing !== 'undefined' ? isExportInitializing : false;

var EXPORT_THEME = {
  light: {
    bg: '#ffffff',
    text: '#333333',
    border: '#e6e9ef',
    shadow: '0 4px 20px rgba(0,0,0,0.05)',
    btnBg: 'transparent',
    btnBorder: '#e6e9ef',
    btnHover: '#f5f5f5',
  },
  dark: {
    bg: 'rgb(32, 33, 36)',
    text: '#E8EAED',
    border: 'rgb(55, 56, 60)',
    shadow: '0 4px 20px rgba(0,0,0,0.2)',
    btnBg: 'rgba(255, 255, 255, 0.05)',
    btnBorder: 'rgb(55, 56, 60)',
    btnHover: 'rgba(255, 255, 255, 0.1)',
  },
  oled: {
    bg: '#000000',
    text: '#ffffff',
    border: '#333333',
    shadow: 'none',
    btnBg: 'transparent',
    btnBorder: '#333333',
    btnHover: '#111111',
  },
};
var currentExportTheme = 'light';

function updateExportWidgetTheme(isDark, isOled) {
  if (isDark) {
    currentExportTheme = isOled ? 'oled' : 'dark';
  } else {
    currentExportTheme = 'light';
  }

  const widget = document.getElementById('cu-export-course-widget');
  if (!widget) return;

  const colors = EXPORT_THEME[currentExportTheme];
  widget.style.backgroundColor = colors.bg;
  widget.style.color = colors.text;
  widget.style.borderColor = colors.border;
  widget.style.boxShadow = colors.shadow;

  ['export-zip-all-btn', 'export-zip-no-hw-btn', 'export-pdf-no-hw-btn'].forEach((id) => {
    const btn = widget.querySelector(`#${id}`);
    if (btn) {
      btn.style.backgroundColor = colors.btnBg;
      btn.style.borderColor = colors.btnBorder;
      btn.style.color = colors.text;
      btn.onmouseenter = () => (btn.style.backgroundColor = colors.btnHover);
      btn.onmouseleave = () => (btn.style.backgroundColor = colors.btnBg);
    }
  });
}

var cuExportApi = typeof browser !== 'undefined' ? browser : chrome;

function getExportStorageData(keys, callback) {
  // Защита от Error: Extension context invalidated
  try {
    if (typeof browser !== 'undefined' && !browser.runtime?.id) return;
    if (typeof chrome !== 'undefined' && !chrome.runtime?.id) return;

    if (typeof browser !== 'undefined') {
      cuExportApi.storage.sync.get(keys).then(callback, (err) => window.cuLmsLog(err));
    } else {
      cuExportApi.storage.sync.get(keys, callback);
    }
  } catch (e) {
    // Контекст инвалидирован, просто выходим
  }
}

async function activateCourseExporter() {
  if (isExportInitializing) return;
  isExportInitializing = true;

  try {
    const match = window.location.pathname.match(/(?:actual|archived)\/(\d+)/);
    if (!match) return;

    const courseId = parseInt(match[1]);

    const courseNameElement = document.querySelector('cu-course-overview h1.page-title');
    const courseName = courseNameElement
      ? courseNameElement.textContent.trim()
      : `Course ${courseId}`;

    let widget = document.getElementById('cu-export-course-widget');
    if (!widget) {
      widget = document.createElement('div');
      widget.id = 'cu-export-course-widget';
      widget.style.cssText = `
        position: relative;
        width: 100%;
        border-radius: 20px;
        border: 1px solid transparent;
        z-index: 1;
        font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        background-color: transparent;
        transition: background-color 0.3s, color 0.3s, border-color 0.3s, box-shadow 0.3s;
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
      `;

      widget.innerHTML = `
        <div class="header" style="padding: 16px 20px 8px; display: flex; flex-direction: column;">
            <h3 class="header__title" style="margin: 0; font-size: 16px; font-weight: 600; color: inherit;">Экспорт материалов</h3>
        </div>
        <div style="padding: 0 20px 16px; display: flex; flex-direction: column; gap: 10px;">
            <button id="export-zip-all-btn" style="
                border-radius: 12px;
                padding: 10px 14px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: background-color 0.2s, opacity 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 1px solid transparent;
            ">
                <span id="export-zip-all-text">ZIP (всё + ДЗ)</span>
            </button>
            
            <button id="export-zip-no-hw-btn" style="
                border-radius: 12px;
                padding: 10px 14px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: background-color 0.2s, opacity 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 1px solid transparent;
            ">
                <span id="export-zip-no-hw-text">ZIP (без ДЗ)</span>
            </button>
            
            <button id="export-pdf-no-hw-btn" style="
                border-radius: 12px;
                padding: 10px 14px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: background-color 0.2s, opacity 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 1px solid transparent;
            ">
                <span id="export-pdf-no-hw-text">PDF (без ДЗ)</span>
            </button>
        </div>
      `;

      const zipAllBtn = widget.querySelector('#export-zip-all-btn');
      const zipNoHwBtn = widget.querySelector('#export-zip-no-hw-btn');
      const pdfNoHwBtn = widget.querySelector('#export-pdf-no-hw-btn');
      const zipAllText = widget.querySelector('#export-zip-all-text');
      const zipNoHwText = widget.querySelector('#export-zip-no-hw-text');
      const pdfNoHwText = widget.querySelector('#export-pdf-no-hw-text');

      const setButtonsState = (disabled) => {
        zipAllBtn.style.pointerEvents = disabled ? 'none' : 'auto';
        zipNoHwBtn.style.pointerEvents = disabled ? 'none' : 'auto';
        pdfNoHwBtn.style.pointerEvents = disabled ? 'none' : 'auto';
        zipAllBtn.style.opacity = disabled ? '0.6' : '1';
        zipNoHwBtn.style.opacity = disabled ? '0.6' : '1';
        pdfNoHwBtn.style.opacity = disabled ? '0.6' : '1';
      };

      zipAllBtn.addEventListener('click', async () => {
        setButtonsState(true);
        zipAllText.innerText = 'Сканирование...';
        try {
          await runZipExport(courseId, courseName, true, false, (msg) => {
            zipAllText.innerText = msg;
          });
        } catch (err) {
          window.cuLmsLog('Export ZIP all failed', err);
          alert('Ошибка при экспорте ZIP (всё).');
        } finally {
          setButtonsState(false);
          zipAllText.innerText = 'ZIP (всё + ДЗ)';
        }
      });

      zipNoHwBtn.addEventListener('click', async () => {
        setButtonsState(true);
        zipNoHwText.innerText = 'Сканирование...';
        try {
          await runZipExport(courseId, courseName, false, true, (msg) => {
            zipNoHwText.innerText = msg;
          });
        } catch (err) {
          window.cuLmsLog('Export ZIP no hw failed', err);
          alert('Ошибка при экспорте ZIP (без ДЗ).');
        } finally {
          setButtonsState(false);
          zipNoHwText.innerText = 'ZIP (без ДЗ)';
        }
      });

      pdfNoHwBtn.addEventListener('click', async () => {
        setButtonsState(true);
        pdfNoHwText.innerText = 'Сборка PDF...';
        try {
          await runPdfExport(courseId, courseName, false, (msg) => {
            pdfNoHwText.innerText = msg;
          });
        } catch (err) {
          window.cuLmsLog('Export PDF failed', err);
          alert('Ошибка при сборке PDF.');
        } finally {
          setButtonsState(false);
          pdfNoHwText.innerText = 'PDF (без ДЗ)';
        }
      });
    }

    // Ищем боковую панель как в course_friends_list
    const targetContainerSelector = 'cu-widgets-panel .widgets-container.second-section';
    const fallbackContainerSelector = 'cu-widgets-panel .widgets-container';

    let targetContainer = document.querySelector(targetContainerSelector);
    if (!targetContainer) {
      targetContainer = document.querySelector(fallbackContainerSelector);
    }

    // Если контейнер еще не прогрузился, подождем его
    if (!targetContainer) {
      targetContainer = await waitForElement(fallbackContainerSelector, 10000).catch(() => null);
      if (targetContainer) {
        // Если появился основной контейнер, возможно появилась и second-section
        const second = document.querySelector(targetContainerSelector);
        if (second) targetContainer = second;
      }
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

    if (cuExportApi && cuExportApi.storage) {
      getExportStorageData(['themeEnabled', 'oledEnabled'], (data) => {
        updateExportWidgetTheme(!!data.themeEnabled, !!data.oledEnabled);
      });
    }

    widget.style.display = 'flex';
  } catch (e) {
    window.cuLmsLog('Error activating course exporter:', e);
  } finally {
    isExportInitializing = false;
  }
}

if (cuExportApi && cuExportApi.storage && !window.cuExportThemeListenerAdded) {
  window.cuExportThemeListenerAdded = true;
  cuExportApi.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && ('themeEnabled' in changes || 'oledEnabled' in changes)) {
      getExportStorageData(['themeEnabled', 'oledEnabled'], (data) => {
        updateExportWidgetTheme(!!data.themeEnabled, !!data.oledEnabled);
      });
    }
  });
}

// Запускаем обсервер для поддержания виджета на экране
if (!window.cuExportWidgetObserver) {
  let debounceTimeout = null;
  window.cuExportWidgetObserver = new MutationObserver((mutations) => {
    // Проверяем, не инвалидирован ли контекст расширения (актуально при обновлении/перезагрузке)
    try {
      if (typeof browser !== 'undefined' && !browser.runtime?.id) {
        window.cuExportWidgetObserver.disconnect();
        return;
      }
      if (typeof chrome !== 'undefined' && !chrome.runtime?.id) {
        window.cuExportWidgetObserver.disconnect();
        return;
      }
    } catch (e) {
      window.cuExportWidgetObserver.disconnect();
      return;
    }

    // Игнорируем, если изменения произошли только внутри нашего виджета (например, прогресс-бар)
    const isOnlyInternal = mutations.every((m) => {
      const target = m.target;
      return (
        target.id === 'cu-export-course-widget' ||
        (target.closest && target.closest('#cu-export-course-widget'))
      );
    });
    if (isOnlyInternal) return;

    const match = window.location.pathname.match(/(?:actual|archived)\/(\d+)/);
    if (!match) return;

    const widget = document.getElementById('cu-export-course-widget');
    const inCorrectContainer = widget && widget.closest('cu-widgets-panel');

    if (!widget || !inCorrectContainer) {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        if (typeof activateCourseExporter === 'function') {
          activateCourseExporter();
        }
      }, 500);
    } else {
      widget.style.display = 'flex';
    }
  });
  window.cuExportWidgetObserver.observe(document.body, { childList: true, subtree: true });
}

// Инициализируем виджет сразу
if (typeof activateCourseExporter === 'function') {
  activateCourseExporter();
}
