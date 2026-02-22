// instant_doc_view_modal.js
if (typeof window.__culmsInstantDocViewFixInitialized === "undefined") {
    window.__culmsInstantDocViewFixInitialized = true;

    'use strict';

    console.log('[CU LMS Fix] Script initialized (Modal View Mode)');

    // --- CSS стили для модального окна ---
    const style = document.createElement('style');
    style.innerHTML = `
        .cu-lms-modal-overlay {
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.85);
            z-index: 10000;
            display: flex;
            justify-content: center;
            align-items: center;
            opacity: 0;
            transition: opacity 0.2s ease-in-out;
            pointer-events: none;
        }
        .cu-lms-modal-overlay.active {
            opacity: 1;
            pointer-events: auto;
        }
        .cu-lms-modal-content {
            max-width: 90vw;
            max-height: 90vh;
            object-fit: contain;
            box-shadow: 0 0 20px rgba(0,0,0,0.5);
            border-radius: 4px;
            transform: scale(0.95);
            transition: transform 0.2s ease;
        }
        .cu-lms-modal-overlay.active .cu-lms-modal-content {
            transform: scale(1);
        }
        .cu-lms-close-btn {
            position: absolute;
            top: 20px;
            right: 20px;
            background: rgba(255, 255, 255, 0.1);
            border: none;
            color: white;
            font-size: 30px;
            cursor: pointer;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
        }
        .cu-lms-close-btn:hover {
            background: rgba(255, 255, 255, 0.3);
        }
        /* Спиннер загрузки */
        .cu-lms-spinner {
            border: 4px solid rgba(255, 255, 255, 0.3);
            border-top: 4px solid #fff;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: cu-spin 1s linear infinite;
            position: absolute;
        }
        @keyframes cu-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);

    // --- Создание HTML элементов модалки ---
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'cu-lms-modal-overlay';
    
    const spinner = document.createElement('div');
    spinner.className = 'cu-lms-spinner';
    
    const modalImage = document.createElement('img');
    modalImage.className = 'cu-lms-modal-content';
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'cu-lms-close-btn';
    closeBtn.innerHTML = '&times;';
    
    modalOverlay.appendChild(spinner);
    modalOverlay.appendChild(modalImage);
    modalOverlay.appendChild(closeBtn);
    document.body.appendChild(modalOverlay);

    // --- Логика управления модалкой ---
    function openModal(url) {
        spinner.style.display = 'block';
        modalImage.style.display = 'none';
        modalImage.src = ''; 
        
        modalOverlay.classList.add('active');
        
        // Когда картинка загрузится
        modalImage.onload = () => {
            spinner.style.display = 'none';
            modalImage.style.display = 'block';
        };

        modalImage.src = url;
    }

    function closeModal() {
        modalOverlay.classList.remove('active');
        setTimeout(() => {
            modalImage.src = '';
        }, 200); // Очищаем src после анимации исчезновения
    }

    // Закрытие по клику на фон
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
    // Закрытие по кнопке
    closeBtn.addEventListener('click', closeModal);
    // Закрытие по ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
            closeModal();
        }
    });

    // =========================================================
    // ОСНОВНАЯ ЛОГИКА ПОИСКА ФАЙЛОВ (из предыдущей версии)
    // =========================================================

    let materialsCache = null;
    let currentLongreadsId = null;
    let tasksCache = {};
    let commentsCache = {};

    async function fetchMaterials(longreadsId) {
        if (materialsCache && currentLongreadsId === longreadsId) return materialsCache;
        if (currentLongreadsId !== longreadsId) {
            materialsCache = null;
            tasksCache = {};
            commentsCache = {};
        }
        try {
            const resp = await fetch(`https://my.centraluniversity.ru/api/micro-lms/longreads/${longreadsId}/materials?limit=10000`, {credentials: "include"});
            if (!resp.ok) throw new Error(resp.status);
            const data = await resp.json();
            materialsCache = data;
            currentLongreadsId = longreadsId;
            return data;
        } catch (e) { return null; }
    }

    async function fetchTaskDetails(taskId) {
        if (!taskId) return null;
        if (tasksCache[taskId]) return tasksCache[taskId];
        try {
            const resp = await fetch(`https://my.centraluniversity.ru/api/micro-lms/tasks/${taskId}`, {credentials: "include"});
            const data = await resp.json();
            tasksCache[taskId] = data;
            return data;
        } catch (e) { return null; }
    }

    async function fetchTaskComments(taskId) {
        if (!taskId) return [];
        if (commentsCache[taskId]) return commentsCache[taskId];
        try {
            const resp = await fetch(`https://my.centraluniversity.ru/api/micro-lms/tasks/${taskId}/comments`, {credentials: "include"});
            const data = await resp.json();
            commentsCache[taskId] = data;
            return data;
        } catch (e) { return []; }
    }

    async function getDownloadUrl(fileElement, materialsData) {
        const fileNameDiv = fileElement.querySelector('.t-name');
        const fileTypeDiv = fileElement.querySelector('.t-type');
        if (!fileNameDiv || !fileTypeDiv) return null;

        const fullDisplayedFileName = fileNameDiv.textContent.trim() + fileTypeDiv.textContent.trim();
        let foundFilename = null;
        let foundVersion = null;

        // 1. Поиск в материалах
        for (const item of materialsData.items) {
            const attachments = item.attachments || item.content?.attachments || [];
            const found = attachments.find(att => att.name === fullDisplayedFileName);
            if (found) { foundFilename = found.filename; foundVersion = found.version; break; }
        }

        // 2. Поиск в задачах и комментариях
        if (!foundFilename) {
            const taskItems = materialsData.items.filter(item => item.taskId || item.task?.id);
            for (const item of taskItems) {
                const taskId = item.taskId || item.task.id;
                
                // А. В задаче
                const taskDetails = await fetchTaskDetails(taskId);
                if (taskDetails) {
                    const allAtts = [...(taskDetails.solution?.attachments || []), ...(taskDetails.content?.attachments || [])];
                    const foundInTask = allAtts.find(att => att.name === fullDisplayedFileName);
                    if (foundInTask) { foundFilename = foundInTask.filename; foundVersion = foundInTask.version; break; }
                }

                // Б. В комментариях
                const comments = await fetchTaskComments(taskId);
                if (comments && Array.isArray(comments)) {
                    for (const comment of comments) {
                        if (comment.attachments?.length) {
                            const foundInComment = comment.attachments.find(att => att.name === fullDisplayedFileName);
                            if (foundInComment) { foundFilename = foundInComment.filename; foundVersion = foundInComment.version; break; }
                        }
                    }
                }
                if (foundFilename) break;
            }
        }

        if (!foundFilename) return null;

        const encodedFilename = encodeURIComponent(foundFilename);
        const url = `https://my.centraluniversity.ru/api/micro-lms/content/download-link?filename=${encodedFilename}&version=${foundVersion}`;
        
        try {
            const resp = await fetch(url, {credentials: "include"});
            const data = await resp.json();
            return { url: data?.url, extension: fileTypeDiv.textContent.trim().toLowerCase() };
        } catch (e) { return null; }
    }

    async function handleFileClick(event) {
        if (event.target.closest('button.file-download') || event.target.closest('button[tuibutton]')) return;

        const container = event.currentTarget;
        const match = window.location.pathname.match(/longreads\/(\d+)/);
        if (!match) return;

        event.preventDefault();
        event.stopPropagation();

        // Визуальная индикация загрузки на самой карточке файла (полупрозрачность)
        container.style.opacity = '0.5';
        container.style.cursor = 'wait';

        const materialsData = await fetchMaterials(match[1]);
        const result = await getDownloadUrl(container, materialsData);
        
        container.style.opacity = '1';
        container.style.cursor = 'pointer';

        if (result && result.url) {
            let finalUrl = result.url;
            // Принудительно ставим inline
            if (finalUrl.includes('response-content-disposition=attachment')) {
                finalUrl = finalUrl.replace('response-content-disposition=attachment', 'response-content-disposition=inline');
            }

            const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'];
            
            if (imageExts.includes(result.extension)) {
                // Если картинка — открываем в модалке
                openModal(finalUrl);
            } else {
                // Если PDF или что-то другое — в новой вкладке
                window.open(finalUrl, '_blank');
            }
        } else {
            console.error('File link not found');
            // Если скрипт не нашел ссылку, можно просто ничего не делать или алертнуть
        }
    }

    function processElements() {
        const fileContainers = document.querySelectorAll('a.file:not([data-cu-fix-applied])');
        fileContainers.forEach(container => {
            container.dataset.cuFixApplied = 'true';
            container.addEventListener('click', handleFileClick, {capture: true});
            container.style.cursor = 'pointer';
        });
    }

    const observer = new MutationObserver((mutations) => {
        if (mutations.some(m => m.addedNodes.length > 0)) processElements();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    processElements();
}