// instant_doc_view_fix.js (адаптированная версия)
if (typeof window.__culmsInstantDocViewFixInitialized === "undefined") {
    window.__culmsInstantDocViewFixInitialized = true;

    'use strict';

    // Кэши сбрасываются при каждой новой инъекции скрипта, что предотвращает использование старых данных.
    let materialsCache = null;
    let currentLongreadsId = null;
    let tasksCache = {};

    async function fetchMaterials(longreadsId) {
        if (materialsCache && currentLongreadsId === longreadsId) {
            return materialsCache;
        }
        const apiUrl = `https://my.centraluniversity.ru/api/micro-lms/longreads/${longreadsId}/materials?limit=10000`;
        try {
            const response = await fetch(apiUrl, {credentials: "include"});
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
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
            const response = await fetch(apiUrl, {credentials: "include"});
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            tasksCache[taskId] = data;
            return data;
        } catch (error) {
            window.cuLmsLog('Error fetching task details:', error);
            return null;
        }
    }

    async function getDownloadUrl(fileElement, materialsData) {
        const fileNameDiv = fileElement.querySelector('.t-name');
        const fileTypeDiv = fileElement.querySelector('.t-type');
        if (!fileNameDiv || !fileTypeDiv) return null;

        const fullDisplayedFileName = fileNameDiv.textContent.trim() + fileTypeDiv.textContent.trim();
        let foundFilename = null;
        let foundVersion = null;

        for (const item of materialsData.items) {
            // Ищем в разных местах, где может быть файл
            const attachments = item.attachments || item.content?.attachments || item.solution?.attachments || [];
            if (item.discriminator === "file" && item.content) attachments.push(item.content);

            const foundAttachment = attachments.find(att => att.name === fullDisplayedFileName);
            if (foundAttachment) {
                foundFilename = foundAttachment.filename;
                foundVersion = foundAttachment.version;
                break;
            }

            // Проверяем задачи
            if (item.taskId || item.task?.id) {
                const taskDetails = await fetchTaskDetails(item.taskId || item.task.id);
                const solutionAttachment = taskDetails?.solution?.attachments?.find(att => att.name === fullDisplayedFileName);
                if (solutionAttachment) {
                    foundFilename = solutionAttachment.filename;
                    foundVersion = solutionAttachment.version;
                    break;
                }
            }
        }

        if (!foundFilename || !foundVersion) {
            window.cuLmsLog('Could not find corresponding attachment data for:', fullDisplayedFileName);
            return null;
        }

        const encodedFilename = encodeURIComponent(foundFilename);
        const downloadLinkApiUrl = `https://my.centraluniversity.ru/api/micro-lms/content/download-link?filename=${encodedFilename}&version=${foundVersion}`;

        try {
            const response = await fetch(downloadLinkApiUrl, {credentials: "include"});
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            return data?.url;
        } catch (error) {
            window.cuLmsLog('Error fetching download link:', error);
            return null;
        }
    }

    async function overrideDownloadButtons() {
        const match = window.location.pathname.match(/longreads\/(\d+)/);
        if (!match) return;

        const longreadsId = match[1];
        const materialsData = await fetchMaterials(longreadsId);
        if (!materialsData?.items?.length) return;

        const fileContainers = document.querySelectorAll('a.file:not([data-has-listener-for-open])');

        fileContainers.forEach(container => {
            container.addEventListener('click', async (event) => {
                if (event.target.closest('button.file-download, button[tuiiconbutton]')) {
                    return; // Это кнопка "Скачать", не мешаем ей
                }
                event.preventDefault();
                event.stopPropagation();

                const url = await getDownloadUrl(container, materialsData);
                if (url) {
                    // Вместо sendMessage просто открываем новую вкладку
                    window.open(url, '_blank');
                } else {
                    window.cuLmsLog('Failed to get download URL for opening in new tab.');
                }
            }, {capture: true});

            container.dataset.hasListenerForOpen = 'true';
        });
    }

    // --- Запускаем основную логику ---
    overrideDownloadButtons();
}