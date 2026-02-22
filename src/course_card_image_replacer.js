'use strict';

(function() {
// Защита от повторного запуска
if (window.stickerReplacerInitialized) return;
window.stickerReplacerInitialized = true;

// --- НАСТРОЙКИ ---
// Обновленный селектор: ищем и tui-icon (старый дизайн) и img.course-icon (новый)
const TARGET_ICON_SELECTOR = 'img.course-icon, tui-icon[class*="course-icon"]';

// Универсальный доступ к API
const api = (typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null));

let isEnabled = false;
let globalStickerUrl = null;
let courseIconsMap = {}; // { "969": "base64..." }
let observer = null;
let isEditorMode = false;

// --- УТИЛИТЫ ---

function safeGet(area, keys) {
    return new Promise((resolve) => {
        try {
            if (typeof browser !== 'undefined' && browser.storage && browser.storage[area]) {
                browser.storage[area].get(keys).then(resolve).catch(() => resolve({}));
            } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage[area]) {
                chrome.storage[area].get(keys, (data) => resolve(data || {}));
            } else {
                resolve({});
            }
        } catch (e) { resolve({}); }
    });
}

/**
 * Получает уникальный ID курса.
 * Сначала ищет data-course-id (самый надежный), затем href, затем название.
 */
function getCourseId(iconNode) {
    // 1. Ищем data-course-id на карточке или списке (как в вашем примере)
    const dataItem = iconNode.closest('[data-course-id]');
    if (dataItem) {
        return dataItem.getAttribute('data-course-id');
    }

    // 2. Ищем ссылку (старый метод)
    const parentLink = iconNode.closest('a[href*="/learn/courses/"]');
    if (parentLink) {
        const href = parentLink.getAttribute('href');
        return href.split('?')[0].replace('/learn/courses/', '').replace('/', '');
    }

    // 3. Фолбек по названию
    const card = iconNode.closest('.t-card') || iconNode.closest('cu-course-card') || iconNode.parentNode;
    if (card) {
        const titleNode = card.querySelector('.course-name') || card;
        const title = titleNode.innerText ? titleNode.innerText.substring(0, 30) : null;
        if (title) return `title_${title.trim()}`;
    }
    return null;
}

/**
 * Обработчик клика в режиме редактора.
 * Используем stopImmediatePropagation, чтобы убить стандартный переход.
 */
function handleEditorClick(e) {
    if (!isEditorMode) return;
    
    // Блокируем ВСЁ стандартное поведение
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const iconNode = e.target;
    const courseId = getCourseId(iconNode);

    if (!courseId) {
        console.warn('[Sticker] Не удалось определить ID курса');
        return;
    }

    // Запуск выбора файла
    openFilePicker(courseId, iconNode);
    return false;
}

function openFilePicker(courseId, imgElement) {
    let fileInput = document.getElementById('temp-sticker-input');
    if (!fileInput) {
        fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'temp-sticker-input';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);
    }

    fileInput.onchange = null;
    fileInput.value = ''; // Сброс, чтобы можно было выбрать тот же файл

    fileInput.onchange = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (file.size > 3 * 1024 * 1024) {
            alert('Картинка слишком большая (макс 3МБ)');
            return;
        }

        const reader = new FileReader();
        reader.onload = (readerEvent) => {
            const base64 = readerEvent.target.result;
            
            // Визуально обновляем сразу
            if (imgElement.tagName === 'IMG') {
                imgElement.src = base64;
            } else {
                // Если это был tui-icon, заменяем его
                const newImg = createCustomImage(imgElement, base64);
                imgElement.parentNode.replaceChild(newImg, imgElement);
                // Перевешиваем слушатель на новую картинку
                newImg.addEventListener('click', handleEditorClick, true);
            }

            // Сохраняем во временный буфер
            pendingChanges[courseId] = base64;
            
            // Активируем кнопку сохранения
            updateSaveButtonStatus(true);
        };
        reader.readAsDataURL(file);
    };

    fileInput.click();
}

/**
 * Создает IMG элемент с нужными стилями
 */
function createCustomImage(originalNode, srcUrl) {
    const newImage = document.createElement('img');
    newImage.className = originalNode.className || 'course-icon'; 
    newImage.src = srcUrl;
    newImage.setAttribute('data-custom-sticker', 'true');
    
    // Стили
    newImage.style.setProperty('width', '100%', 'important');
    newImage.style.setProperty('height', '100%', 'important');
    newImage.style.setProperty('min-width', '100%', 'important');
    newImage.style.setProperty('min-height', '100%', 'important');
    newImage.style.setProperty('object-fit', 'fit', 'important'); 
    newImage.style.setProperty('border-radius', 'inherit', 'important');
    newImage.style.setProperty('display', 'block', 'important');

    // Если редактор - добавляем рамку
    if (isEditorMode) {
        newImage.style.setProperty('cursor', 'pointer', 'important');
        newImage.style.setProperty('border', '4px solid #2196F3', 'important');
        newImage.style.setProperty('box-sizing', 'border-box', 'important');
    }

    return newImage;
}

/**
 * Основная функция замены
 */
function replaceIcon(iconNode) {
    if (!isEnabled) return;

    // Проверка, обрабатывали ли мы этот узел кликом
    if (isEditorMode && !iconNode.hasAttribute('data-editor-click-attached')) {
        // ВАЖНО: useCapture = true (третий аргумент), чтобы перехватить до Angular
        iconNode.addEventListener('click', handleEditorClick, true);
        iconNode.setAttribute('data-editor-click-attached', 'true');
        
        // Визуальная индикация редактора
        iconNode.style.setProperty('cursor', 'pointer', 'important');
        iconNode.style.setProperty('border', '4px solid #2196F3', 'important');
        iconNode.style.setProperty('box-sizing', 'border-box', 'important');
        iconNode.title = "Нажмите, чтобы изменить иконку";
    }

    // Если картинка только что загружена пользователем, не трогаем src
    if (pendingChanges[getCourseId(iconNode)]) return;

    const courseId = getCourseId(iconNode);
    let targetSrc = courseIconsMap[courseId] || globalStickerUrl;

    if (!targetSrc) return;

    // Если это уже IMG
    if (iconNode.tagName.toLowerCase() === 'img') {
        if (iconNode.src !== targetSrc) {
            iconNode.src = targetSrc;
            iconNode.setAttribute('data-custom-sticker', 'true');
            // Применяем стили fit
            iconNode.style.setProperty('object-fit', 'cover', 'important');
        }
    } 
    // Если это TUI-ICON или что-то другое
    else {
        const parentCard = iconNode.parentNode;
        if (!parentCard) return;

        const newImage = createCustomImage(iconNode, targetSrc);
        
        // Очистка родителя для корректного отображения
        parentCard.style.setProperty('background', 'transparent', 'important');
        parentCard.style.setProperty('padding', '0', 'important');

        try {
            parentCard.replaceChild(newImage, iconNode);
            // Нужно повесить слушатель на новый элемент
            if (isEditorMode) {
                newImage.addEventListener('click', handleEditorClick, true);
                newImage.setAttribute('data-editor-click-attached', 'true');
            }
        } catch (e) {}
    }
}

// --- ИНТЕРФЕЙС РЕДАКТОРА ---

let pendingChanges = {};

function updateSaveButtonStatus(hasChanges) {
    const btn = document.getElementById('save-course-icons-btn');
    if (btn) {
        if (hasChanges) {
            btn.innerText = 'Сохранить изменения (есть новые)';
            btn.style.backgroundColor = '#4CAF50'; // Green
        } else {
            btn.innerText = 'Сохранить иконки';
            btn.style.backgroundColor = '#2196F3'; // Blue
        }
    }
}

function injectEditorUI() {
    if (document.getElementById('save-course-icons-btn')) return;

    const headerList = document.querySelector('.header__actions-list');
    if (!headerList) {
        setTimeout(injectEditorUI, 1000);
        return;
    }

    const li = document.createElement('li');
    li.className = 'header-action-item'; 
    li.style.display = 'flex';
    li.style.alignItems = 'center';
    li.style.marginLeft = '10px';
    li.style.zIndex = '9999';

    const btn = document.createElement('button');
    btn.id = 'save-course-icons-btn';
    btn.innerText = 'Сохранить иконки';
    btn.style.cssText = `
        background-color: #2196F3;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 20px;
        cursor: pointer;
        font-weight: 600;
        font-family: 'Inter', sans-serif;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        transition: all 0.2s;
    `;

    btn.onclick = async (e) => {
        e.stopPropagation(); // Чтобы не сработало что-то еще
        
        if (Object.keys(pendingChanges).length === 0) {
            alert('Вы ничего не изменили.');
            return;
        }

        const newMap = { ...courseIconsMap, ...pendingChanges };
        
        try {
            await api.storage.local.set({ courseIcons: newMap });
            if (confirm('Иконки сохранены! Выйти из режима редактора?')) {
                const url = new URL(window.location.href);
                url.searchParams.delete('customIconEditor');
                window.location.href = url.toString();
            } else {
                courseIconsMap = newMap;
                pendingChanges = {};
                updateSaveButtonStatus(false);
            }
        } catch (e) {
            alert('Ошибка сохранения: ' + e.message);
        }
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.innerText = '✖';
    cancelBtn.title = "Выйти без сохранения";
    cancelBtn.style.cssText = `
        background: rgba(0,0,0,0.05);
        color: #666;
        border: none;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        margin-left: 8px;
        cursor: pointer;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    cancelBtn.onclick = (e) => {
        e.stopPropagation();
        const url = new URL(window.location.href);
        url.searchParams.delete('customIconEditor');
        window.location.href = url.toString();
    };

    li.appendChild(btn);
    li.appendChild(cancelBtn);
    headerList.prepend(li);
}

// --- ЗАПУСК ---

const handleMutations = (mutations) => {
    if (!isEnabled && !isEditorMode) return;

    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.matches && node.matches(TARGET_ICON_SELECTOR)) {
                    replaceIcon(node);
                }
                const iconsInside = node.querySelectorAll ? node.querySelectorAll(TARGET_ICON_SELECTOR) : [];
                iconsInside.forEach(replaceIcon);
                
                if (isEditorMode) injectEditorUI();
            }
        }
    }
};

function startReplacer() {
    const existingIcons = document.querySelectorAll(TARGET_ICON_SELECTOR);
    existingIcons.forEach(replaceIcon);

    if (!observer) {
        observer = new MutationObserver(handleMutations);
        observer.observe(document.body, { childList: true, subtree: true });
    }
    
    if (isEditorMode) injectEditorUI();
}

async function init() {
    // 1. Проверяем режим редактора сразу
    const params = new URLSearchParams(window.location.search);
    isEditorMode = params.get('customIconEditor') === 'true';

    // 2. Настройки
    const syncData = await safeGet('sync', ['stickerEnabled']);
    // Если включен редактор, мы работаем даже если галочка выключена (чтобы можно было настроить)
    isEnabled = !!syncData.stickerEnabled || isEditorMode; 

    if (isEnabled) {
        const localData = await safeGet('local', ['customStickerData', 'courseIcons']);
        globalStickerUrl = localData.customStickerData || null;
        courseIconsMap = localData.courseIcons || {};

        startReplacer();
    }
}

// Отслеживание изменений настроек
if (api && api.storage) {
    api.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && 'stickerEnabled' in changes) location.reload();
        if (area === 'local') {
            if ('customStickerData' in changes) globalStickerUrl = changes.customStickerData.newValue;
            if ('courseIcons' in changes) courseIconsMap = changes.courseIcons.newValue || {};
            
            // Если мы НЕ в редакторе, обновляем живьем. В редакторе не обновляем, чтобы не сбить работу
            if (!isEditorMode) {
                document.querySelectorAll(TARGET_ICON_SELECTOR).forEach(replaceIcon);
            }
        }
    });
}

// Старт
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Фолбек для SPA переходов (URL change detection)
let lastUrl = location.href; 
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    const params = new URLSearchParams(window.location.search);
    const newMode = params.get('customIconEditor') === 'true';
    if (newMode !== isEditorMode) {
        window.location.reload(); 
    }
  }
}).observe(document, {subtree: true, childList: true});

})();