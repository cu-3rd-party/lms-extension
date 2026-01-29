(function() {
    'use strict';

    // 1. СПИСОК ИКОНОК
    // Добавьте сюда части названий файлов иконок, которые нужно перекрасить
    const TARGET_ICONS = [
        'cuIconChevronSelectorVertical.svg',
        // 'anotherIcon.svg', 
        // 'settingsIcon.svg'
    ];

    // Функция, которая делает иконку белой
    function makeWhite(element) {
        // Проверяем, обрабатывали ли мы её уже, чтобы не нагружать браузер
        if (element.dataset.colorFixed === "true") return;

        const styleAttr = element.getAttribute('style') || '';
        
        // Проверяем, содержит ли стиль одно из названий наших иконок
        const isTarget = TARGET_ICONS.some(iconName => styleAttr.includes(iconName));

        if (isTarget) {
            // Применяем жесткий фильтр:
            // brightness(0) делает её черной (убирает исходные цвета)
            // invert(1) делает её белой
            element.style.filter = 'brightness(0) invert(1)';
            
            // Помечаем, что обработали
            element.dataset.colorFixed = "true";
        }
    }

    // 2. ОБРАБОТЧИК СУЩЕСТВУЮЩИХ ИКОНОК
    // Запускаем один раз сразу, для тех иконок, что уже есть на странице
    document.querySelectorAll('tui-icon').forEach(makeWhite);

    // 3. НАБЛЮДАТЕЛЬ (MutationObserver)
    // Следит за изменениями на странице и ловит новые иконки
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            // Если добавлены новые узлы (элементы)
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach((node) => {
                    // Если это элемент (а не текст)
                    if (node.nodeType === 1) {
                        // Если сам элемент - это иконка
                        if (node.tagName && node.tagName.toLowerCase() === 'tui-icon') {
                            makeWhite(node);
                        }
                        // Или если внутри добавленного элемента есть иконки (например, загрузился целый блок)
                        else {
                            const iconsInside = node.querySelectorAll ? node.querySelectorAll('tui-icon') : [];
                            iconsInside.forEach(makeWhite);
                        }
                    }
                });
            }
            // Если у существующей иконки изменился атрибут style (например, иконку подменили динамически)
            else if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                if (mutation.target.tagName && mutation.target.tagName.toLowerCase() === 'tui-icon') {
                    // Сбрасываем метку, чтобы перепроверить стиль
                    mutation.target.dataset.colorFixed = "false"; 
                    makeWhite(mutation.target);
                }
            }
        });
    });

    // Начинаем наблюдение за всем документом
    observer.observe(document.body, {
        childList: true, // следить за добавлением/удалением детей
        subtree: true,   // следить за всеми вложенными элементами
        attributes: true, // следить за изменением атрибутов (на случай смены style)
        attributeFilter: ['style'] // фильтр только по style, для производительности
    });

    console.log('Icon Color Fixer: Запущен и следит за иконками.');

})();