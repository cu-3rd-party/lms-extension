/**
 * rgb_outline_effect.js
 * Исправленная версия для Cross-browser (Chrome + Firefox)
 */
'use strict';

class RGBOutlineEffect {
    constructor() {
        this.isEnabled = false;
        this.outlineWidth = 2;
        this.animationSpeed = 16; 
        this.currentElement = null;
        this.styleElement = null;
        this.hueShift = 0;
        this.animationFrameId = null;
        
        // Пытаемся получить доступ к API:
        // 1. window.browser (Firefox или Chrome с полифилом)
        // 2. window.chrome (Чистый Chrome)
        this.browserApi = window.browser || window.chrome;

        this.init();
    }

    async init() {
        // Проверка наличия API
        if (!this.browserApi || !this.browserApi.storage) {
            console.warn('RGB Outline: Storage API not found. Check permissions in manifest.json.');
            // Можно включить по умолчанию, если API недоступно, чтобы фича работала хотя бы локально
            this.isEnabled = true; 
            this.createStyleElement();
            this.setupListeners();
            this.startAnimation();
            return;
        }

        try {
            // Чтение настроек. Используем унификацию Promise/Callback
            const data = await this.getStorageData(['rgbOutlineEnabled']);
            
            // По умолчанию включено (true), если ключа нет
            this.isEnabled = data.rgbOutlineEnabled === undefined ? true : !!data.rgbOutlineEnabled;
            
            this.createStyleElement();
            
            if (this.isEnabled) {
                this.setupListeners();
                this.startAnimation();
            }

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
                        this.stopAnimation();
                    }
                }
            });

        } catch (error) {
            console.error('RGB Outline: Error initializing settings', error);
        }
    }

    /**
     * Обертка для поддержки и Chrome (callback), и Firefox/Polyfill (Promise)
     */
    getStorageData(keys) {
        return new Promise((resolve, reject) => {
            // Если есть полифил (возвращает Promise)
            const result = this.browserApi.storage.sync.get(keys);
            if (result && typeof result.then === 'function') {
                result.then(resolve).catch(reject);
            } else {
                // Чистый Chrome (Callback)
                this.browserApi.storage.sync.get(keys, (data) => {
                    if (this.browserApi.runtime.lastError) {
                        reject(this.browserApi.runtime.lastError);
                    } else {
                        resolve(data);
                    }
                });
            }
        });
    }

    createStyleElement() {
        if (this.styleElement) return;

        this.styleElement = document.createElement('style');
        this.styleElement.id = 'rgb-outline-effect-style';
        this.styleElement.textContent = `
            .rgb-outline-active {
                outline-width: 2px !important;
                outline-style: solid !important;
                outline-offset: -2px !important;
                z-index: 2147483647 !important;
            }
            html, body, iframe, video {
                outline: none !important;
            }
        `;

        (document.head || document.documentElement).appendChild(this.styleElement);
    }

    setupListeners() {
        if (this.listenersActive) return; // Защита от дублирования
        
        this.boundMouseMove = this.handleMouseMove.bind(this);
        this.boundMouseLeave = this.handleMouseLeave.bind(this);
        
        document.addEventListener('mousemove', this.boundMouseMove, true);
        document.addEventListener('mouseleave', this.boundMouseLeave, true);
        this.listenersActive = true;
    }

    removeListeners() {
        if (this.boundMouseMove) {
            document.removeEventListener('mousemove', this.boundMouseMove, true);
            document.removeEventListener('mouseleave', this.boundMouseLeave, true);
        }
        this.listenersActive = false;
    }

    handleMouseMove(e) {
        if (!this.isEnabled) return;

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
            
            // Если анимация была остановлена, перезапускаем
            if (!this.animationFrameId) {
                this.startAnimation();
            }
        }
    }

    handleMouseLeave(e) {
        if (e.relatedTarget === null || e.target === document) {
            this.removeOutline();
            this.currentElement = null;
        }
    }

    shouldApplyOutline(element) {
        if (!element || element === document || element === document.documentElement) return false;
        
        const tagName = element.tagName.toLowerCase();
        const ignoreTags = ['html', 'head', 'script', 'style', 'meta', 'link', 'noscript', 'iframe'];
        if (ignoreTags.includes(tagName)) return false;

        return true;
    }

    removeOutline() {
        if (this.currentElement) {
            this.currentElement.classList.remove('rgb-outline-active');
            this.currentElement.style.outlineColor = '';
        }
    }

    startAnimation() {
        if (this.animationFrameId) return; // Уже запущена

        const animate = () => {
            if (!this.isEnabled) {
                this.animationFrameId = null;
                return;
            }

            this.hueShift = (this.hueShift + 2) % 360;

            if (this.currentElement) {
                this.currentElement.style.outlineColor = `hsl(${this.hueShift}, 100%, 50%)`;
            }

            this.animationFrameId = requestAnimationFrame(animate);
        };

        this.animationFrameId = requestAnimationFrame(animate);
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