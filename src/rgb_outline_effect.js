/**
 * rgb_outline_effect.js
 * Динамическая RGB обводка активного элемента под курсором
 * Управляется через настройки плагина
 */

'use strict';

class RGBOutlineEffect {
    constructor() {
        this.isEnabled = false;
        this.outlineWidth = 2; // px
        this.outlineColor = { r: 255, g: 0, b: 0 }; // По умолчанию красный
        this.animationSpeed = 50; // мс между обновлениями
        this.currentElement = null;
        this.styleElement = null;
        this.hueShift = 0;
        this.animationFrameId = null;
        
        this.init();
    }

    /**
     * Инициализация - загрузка настроек и установка слушателей
     */
    async init() {
        // Загружаем состояние из хранилища
        const data = await browser.storage.sync.get(['rgbOutlineEnabled']);
        this.isEnabled = !!data.rgbOutlineEnabled;

        // Создаем стиль для outline
        this.createStyleElement();

        // Если включено, начинаем слушать события
        if (this.isEnabled) {
            this.setupListeners();
            this.startAnimation();
        }

        // Слушаем изменения настроек
        browser.storage.onChanged.addListener((changes, area) => {
            if (area === 'sync' && changes.rgbOutlineEnabled) {
                this.isEnabled = changes.rgbOutlineEnabled.newValue;
                if (this.isEnabled) {
                    this.setupListeners();
                    this.startAnimation();
                } else {
                    this.removeListeners();
                    this.stopAnimation();
                    this.removeOutline();
                }
            }
        });
    }

    /**
     * Создание элемента стиля для обводки
     */
    createStyleElement() {
        if (this.styleElement) return;

        this.styleElement = document.createElement('style');
        this.styleElement.id = 'rgb-outline-effect-style';
        this.styleElement.textContent = `
            .rgb-outline-active {
                outline: 2px solid rgb(255, 0, 0) !important;
                outline-offset: 2px !important;
                transition: outline-color 0.05s ease !important;
            }

            /* Исключаем элементы, которые не должны иметь обводку */
            html,
            body,
            head,
            script,
            style,
            meta,
            link,
            noscript {
                outline: none !important;
            }

            /* Исключаем скрытые элементы */
            [style*="display: none"],
            [hidden] {
                outline: none !important;
            }
        `;

        if (document.head) {
            document.head.appendChild(this.styleElement);
        }
    }

    /**
     * Настройка слушателей событий
     */
    setupListeners() {
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e), true);
        document.addEventListener('mouseleave', (e) => this.handleMouseLeave(e), true);
    }

    /**
     * Удаление слушателей событий
     */
    removeListeners() {
        document.removeEventListener('mousemove', (e) => this.handleMouseMove(e), true);
        document.removeEventListener('mouseleave', (e) => this.handleMouseLeave(e), true);
    }

    /**
     * Обработчик движения мыши
     */
    handleMouseMove(e) {
        const element = e.target;

        // Проверяем, нужно ли применять обводку
        if (!this.shouldApplyOutline(element)) {
            this.removeOutline();
            this.currentElement = null;
            return;
        }

        // Если это другой элемент, обновляем
        if (this.currentElement !== element) {
            this.removeOutline();
            this.currentElement = element;
            if (this.currentElement) {
                this.currentElement.classList.add('rgb-outline-active');
            }
        }
    }

    /**
     * Обработчик ухода мыши
     */
    handleMouseLeave(e) {
        if (e.target === document) {
            this.removeOutline();
            this.currentElement = null;
        }
    }

    /**
     * Проверка, должна ли применяться обводка к элементу
     */
    shouldApplyOutline(element) {
        // Не применяем к документу, body и заблокированным элементам
        if (!element || element === document || element === document.documentElement) {
            return false;
        }

        // Не применяем к скрытым элементам
        const style = window.getComputedStyle(element);
        if (
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            style.opacity === '0' ||
            element.hidden
        ) {
            return false;
        }

        // Не применяем к системным элементам
        const tagName = element.tagName.toLowerCase();
        if (['html', 'head', 'body', 'script', 'style', 'meta', 'link', 'noscript'].includes(tagName)) {
            return false;
        }

        return true;
    }

    /**
     * Удаление обводки с текущего элемента
     */
    removeOutline() {
        if (this.currentElement) {
            this.currentElement.classList.remove('rgb-outline-active');
        }
    }

    /**
     * Начало анимации RGB обводки
     */
    startAnimation() {
        if (this.animationFrameId) return;

        const animate = () => {
            if (!this.isEnabled || !this.currentElement) {
                this.animationFrameId = null;
                return;
            }

            // Обновляем цвет обводки на основе hueShift
            const rgb = this.hsvToRgb(this.hueShift % 360, 100, 100);
            if (this.currentElement) {
                this.currentElement.style.outlineColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
            }

            // Увеличиваем hueShift для следующего кадра
            this.hueShift = (this.hueShift + 3) % 360;

            this.animationFrameId = setTimeout(animate, this.animationSpeed);
        };

        animate();
    }

    /**
     * Остановка анимации
     */
    stopAnimation() {
        if (this.animationFrameId) {
            clearTimeout(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    /**
     * Преобразование HSV в RGB
     */
    hsvToRgb(h, s, v) {
        const c = v * s / 100;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = v / 100 - c;

        let r = 0, g = 0, b = 0;

        if (h >= 0 && h < 60) {
            r = c;
            g = x;
            b = 0;
        } else if (h >= 60 && h < 120) {
            r = x;
            g = c;
            b = 0;
        } else if (h >= 120 && h < 180) {
            r = 0;
            g = c;
            b = x;
        } else if (h >= 180 && h < 240) {
            r = 0;
            g = x;
            b = c;
        } else if (h >= 240 && h < 300) {
            r = x;
            g = 0;
            b = c;
        } else if (h >= 300 && h < 360) {
            r = c;
            g = 0;
            b = x;
        }

        return {
            r: Math.round((r + m) * 255),
            g: Math.round((g + m) * 255),
            b: Math.round((b + m) * 255)
        };
    }
}

// Инициализация эффекта при загрузке документа
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new RGBOutlineEffect();
    });
} else {
    new RGBOutlineEffect();
}
