// file_download.js — кнопка «Скачать» у файлов в лонгриде скачивает файл.
//
// Сама LMS и по клику на файл, и по «Скачать» делает одно и то же:
// window.open на ссылку хранилища. PDF браузер показывает во вкладке, а
// остальное сохраняет с именем из пути ссылки — Safari выходит
// «%D0%9D%D0%B5…_0107f4ac.xlsx». Клик по файлу пусть открывает его как
// раньше, а «Скачать» мы забираем себе: находим файл через API LMS и
// сохраняем его под настоящим именем.
//
// Скачивает background (DOWNLOAD_URL, downloads.download с filename): ему не
// мешает CORS и имя он ставит сам. Где API загрузок нет (Safari), качаем
// со страницы как blob — хранилище отдаёт CORS для LMS — и сохраняем через
// <a download>. Не вышло ничего — отдаём клик LMS.

// Polyfill to handle browser namespace differences (Chrome uses 'chrome', Firefox uses 'browser')
if (typeof browser === 'undefined') {
  var browser = chrome;
}

if (typeof window.__culmsFileDownloadInitialized === 'undefined') {
  window.__culmsFileDownloadInitialized = true;

  (() => {
    'use strict';

    const LOG_PREFIX = '[CU LMS File Download]';
    const NATIVE_FLAG = 'cuDownloadNative';
    // У вложений задания — кнопка «Скачать» (.file-download), у файлов-
    // материалов лонгрида — кнопка-иконка без подписи и без класса; общее у
    // них только иконка загрузки.
    const DOWNLOAD_BUTTON = [
      'a.file button.file-download',
      'a.file button[data-icon-end*="Download"]',
      'a.file button[data-icon-start*="Download"]',
    ].join(', ');
    const tasksCache = new Map();
    const commentsCache = new Map();

    function getJson(url) {
      return fetch(url, { credentials: 'include' }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      });
    }

    /** Запрос один на задание, даже если «Скачать» жмут подряд. */
    function cached(cache, key, load) {
      if (!cache.has(key)) {
        cache.set(
          key,
          load().catch(() => {
            cache.delete(key);
            return null;
          })
        );
      }
      return cache.get(key);
    }

    const fetchTask = (id) => cached(tasksCache, id, () => getJson(`/api/micro-lms/tasks/${id}`));
    const fetchComments = (id) =>
      cached(commentsCache, id, () => getJson(`/api/micro-lms/tasks/${id}/comments`));

    function fetchMaterials(longreadId) {
      if (window.__culmsLmsApi) return window.__culmsLmsApi.fetchMaterials(longreadId);
      return getJson(`/api/micro-lms/longreads/${longreadId}/materials?limit=10000`).catch(
        () => null
      );
    }

    /**
     * Вложение с таким именем, как на карточке: в материалах лонгрида, в его
     * заданиях (условие, решение) и в комментариях к ним. Совпадение по имени —
     * других связей карточки с API в разметке нет.
     */
    async function findAttachment(displayName) {
      const match = location.pathname.match(/longreads\/(\d+)/);
      if (!match) return null;
      const materials = await fetchMaterials(match[1]);
      if (!materials?.items) return null;

      const byName = (list) =>
        (list || []).find((att) => att && att.name === displayName && att.filename);

      for (const item of materials.items) {
        if (item.content?.name === displayName && item.content?.filename) {
          return {
            filename: item.content.filename,
            version: item.content.version || item.version,
          };
        }
        const found = byName(item.attachments) || byName(item.content?.attachments);
        if (found) return found;
      }

      const taskIds = materials.items.map((item) => item.taskId || item.task?.id).filter(Boolean);
      for (const taskId of taskIds) {
        const task = await fetchTask(taskId);
        const found =
          byName(task?.exercise?.attachments) ||
          byName(task?.content?.attachments) ||
          byName(task?.solution?.attachments);
        if (found) return found;
      }
      for (const taskId of taskIds) {
        const comments = await fetchComments(taskId);
        for (const comment of Array.isArray(comments) ? comments : []) {
          const found = byName(comment.attachments);
          if (found) return found;
        }
      }
      return null;
    }

    async function downloadLink({ filename, version }) {
      const params = new URLSearchParams({ filename, version: version || '' });
      const data = await getJson(`/api/micro-lms/content/download-link?${params}`);
      if (!data?.url) throw new Error('LMS не отдала ссылку на файл');
      return data.url;
    }

    /** Имя без символов, которые не пропустит файловая система. */
    function safeName(name) {
      return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'file';
    }

    async function saveViaBackground(url, filename) {
      try {
        const response = await browser.runtime.sendMessage({
          action: 'DOWNLOAD_URL',
          url,
          filename,
        });
        return !!response?.success;
      } catch (_error) {
        return false;
      }
    }

    async function saveViaBlob(url, filename) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Браузер читает blob не мгновенно — держим ссылку живой с запасом.
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    }

    /** Отдаёт клик LMS, как будто мы в него не вмешивались. */
    function passToLms(button) {
      button.dataset[NATIVE_FLAG] = 'true';
      button.click();
    }

    document.addEventListener(
      'click',
      async (event) => {
        const button = event.target.closest(DOWNLOAD_BUTTON);
        if (!button) return;
        if (button.dataset[NATIVE_FLAG]) {
          delete button.dataset[NATIVE_FLAG];
          return;
        }
        const file = button.closest('a.file');
        const name = file.querySelector('.t-name')?.textContent.trim();
        const type = file.querySelector('.t-type')?.textContent.trim() || '';
        if (!name) return;

        // До Angular и до ссылки на самой карточке: у карточек материалов
        // instant_doc_view_fix.js ставит href с target=_blank, и без этого
        // кнопка открывала бы файл во вкладке.
        event.preventDefault();
        event.stopImmediatePropagation();

        button.disabled = true;
        let native = false;
        try {
          const attachment = await findAttachment(name + type);
          if (attachment) {
            const url = await downloadLink(attachment);
            const filename = safeName(name + type);
            if (!(await saveViaBackground(url, filename))) await saveViaBlob(url, filename);
          } else {
            native = true;
          }
        } catch (error) {
          console.error(`${LOG_PREFIX} Не удалось скачать «${name}${type}»:`, error);
          native = true;
        } finally {
          // Заблокированная кнопка повторный клик не примет — сперва вернуть.
          button.disabled = false;
          if (native) passToLms(button);
        }
      },
      { capture: true }
    );
  })();
}
