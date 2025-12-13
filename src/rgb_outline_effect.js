/**
 * rgb_outline_effect.js
 */
'use strict';

class RGBOutlineEffect {
    constructor() {
        this.isEnabled = false;
        this.outlineWidth = 2;
        this.animationSpeed = 16; // ~60 FPS (было 50мс, лучше использовать requestAnimationFrame)
        this.currentElement = null;
        this.styleElement = null;
        this.hueShift = 0;
        this.animationFrameId = null;
        
        // Кроссбраузерная поддержка API
        this.browserApi = window.chrome || window.browser; 

        this.init();
    }

    async init() {
        // Проверка наличия API (на случай запуска вне расширения)
        if (!this.browserApi || !this.browserApi.storage) {
            console.warn('RGB Outline: Storage API not found.');
            return;
        }

        // Загружаем настройки. По умолчанию считаем включенным, если настройки нет (для теста)
        // Либо добавьте дефолтное значение {rgbOutlineEnabled: true}
        this.browserApi.storage.sync.get(['rgbOutlineEnabled'], (data) => {
            // Если undefined, ставим true для теста, иначе берем значение
            this.isEnabled = data.rgbOutlineEnabled === undefined ? true : !!data.rgbOutlineEnabled;
            
            this.createStyleElement();
            
            if (this.isEnabled) {
                this.setupListeners();
                this.startAnimation(); // Запускаем цикл сразу
            }
        });

        // Слушаем изменения настроек
        this.browserApi.storage.onChanged.addListener((changes, area) => {
            if (area === 'sync' && changes.rgbOutlineEnabled) {
                this.isEnabled = changes.rgbOutlineEnabled.newValue;
                if (this.isEnabled) {
                    this.setupListeners();
                    this.startAnimation();
                } else {
                    this.removeListeners();
                    this.removeOutline();
                    // Анимацию не останавливаем полностью, она просто будет крутиться вхолостую 
                    // или можно поставить флаг паузы внутри animate
                }
            }
        });
    }

    createStyleElement() {
        if (this.styleElement) return;

        this.styleElement = document.createElement('style');
        this.styleElement.id = 'rgb-outline-effect-style';
        // Убрали !important у цвета, чтобы JS мог его менять
        // Убрали transition, чтобы смена цвета была мгновенной и плавной через JS
        this.styleElement.textContent = `
            .rgb-outline-active {
                outline-width: 2px !important;
                outline-style: solid !important;
                outline-offset: -2px !important; /* Внутрь, чтобы не дергать разметку */
                z-index: 2147483647 !important;
            }

            /* Исключения */
            html, body, iframe, video {
                outline: none !important;
            }
        `;

        (document.head || document.documentElement).appendChild(this.styleElement);
    }

    setupListeners() {
        // Bind контекста, чтобы не терять this при удалении слушателя
        this.boundMouseMove = this.handleMouseMove.bind(this);
        this.boundMouseLeave = this.handleMouseLeave.bind(this);
        
        document.addEventListener('mousemove', this.boundMouseMove, true);
        document.addEventListener('mouseleave', this.boundMouseLeave, true);
    }

    removeListeners() {
        if (this.boundMouseMove) {
            document.removeEventListener('mousemove', this.boundMouseMove, true);
            document.removeEventListener('mouseleave', this.boundMouseLeave, true);
        }
    }

    handleMouseMove(e) {
        const element = e.target;

        if (!this.shouldApplyOutline(element)) {
            this.removeOutline();
            this.currentElement = null;
            return;
        }

        if (this.currentElement !== element) {
            this.removeOutline();
            this.currentElement = element;
            this.currentElement.classList.add('rgb-outline-active');
            
            // Важно: убеждаемся, что анимация запущена
            if (!this.animationFrameId) {
                this.startAnimation();
            }
        }
    }

    handleMouseLeave(e) {
        // Убираем только если ушли за пределы документа
        if (e.relatedTarget === null || e.target === document) {
            this.removeOutline();
            this.currentElement = null;
        }
    }

    shouldApplyOutline(element) {
        if (!element || element === document || element === document.documentElement) return false;
        
        // Простая проверка тегов
        const tagName = element.tagName.toLowerCase();
        const ignoreTags = ['html', 'head', 'script', 'style', 'meta', 'link', 'noscript', 'iframe'];
        if (ignoreTags.includes(tagName)) return false;

        return true;
    }

    removeOutline() {
        if (this.currentElement) {
            this.currentElement.classList.remove('rgb-outline-active');
            this.currentElement.style.outlineColor = ''; // Чистим инлайн стиль
        }
    }

    startAnimation() {
        // Используем requestAnimationFrame для плавности
        const animate = () => {
            if (!this.isEnabled) {
                this.animationFrameId = null;
                return;
            }

            this.hueShift = (this.hueShift + 2) % 360; // Скорость смены цвета

            if (this.currentElement) {
                // HSL проще для радуги, чем конвертация HSV->RGB вручную
                this.currentElement.style.outlineColor = `hsl(${this.hueShift}, 100%, 50%)`;
            }

            this.animationFrameId = requestAnimationFrame(animate);
        };

        // Запускаем, только если еще не запущено
        if (!this.animationFrameId) {
            this.animationFrameId = requestAnimationFrame(animate);
        }
    }

    stopAnimation() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }
}

// Запуск
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new RGBOutlineEffect());
} else {
    new RGBOutlineEffect();
}