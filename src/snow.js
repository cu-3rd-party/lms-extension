'use strict';

// Защита от повторной инициализации
if (typeof window.snowEffectInitialized === 'undefined') {
    window.snowEffectInitialized = true;

    // --- УНИВЕРСАЛЬНЫЙ ДОСТУП К API ---
    // В Firefox 'browser' доступен глобально, в Chrome 'chrome'.
    // window.browser может быть недоступен в некоторых контекстах Firefox.
    const api = (typeof browser !== 'undefined' ? browser : chrome);

    /**
     * Безопасное получение данных из хранилища (Promise-based)
     */
    function safeGetStorage(keys) {
        return new Promise((resolve) => {
            try {
                // Попытка использовать стандартный browser API (Firefox)
                if (typeof browser !== 'undefined' && browser.storage) {
                    browser.storage.sync.get(keys)
                        .then(resolve)
                        .catch(err => {
                            console.error('[SNOW] Storage error:', err);
                            resolve({}); // Возвращаем пустоту, чтобы не ломать скрипт
                        });
                } 
                // Попытка использовать chrome API (Chrome / Fallback)
                else if (typeof chrome !== 'undefined' && chrome.storage) {
                    chrome.storage.sync.get(keys, (data) => {
                        if (chrome.runtime.lastError) {
                            console.error('[SNOW] Chrome storage error:', chrome.runtime.lastError);
                            resolve({});
                        } else {
                            resolve(data || {});
                        }
                    });
                } else {
                    console.warn('[SNOW] No storage API found');
                    resolve({});
                }
            } catch (e) {
                console.error('[SNOW] Unexpected storage error:', e);
                resolve({});
            }
        });
    }

    // --- ПЕРЕМЕННЫЕ ---
    let snowCanvas = null;
    let animationFrameId = null;

    // Конфигурация снега
    const SNOW_CONFIG = {
        count: 150, 
        speed: 1.5, 
        wind: 0.5   
    };

    let particles = [];
    let w = window.innerWidth;
    let h = window.innerHeight;

    // --- КЛАСС СНЕЖИНКИ ---
    class Snowflake {
        constructor() {
            this.init();
        }

        init(isReset = false) {
            w = window.innerWidth;
            h = window.innerHeight;

            this.x = Math.random() * w;
            this.y = isReset ? -10 : Math.random() * h;
            this.radius = Math.random() * 3 + 1; 
            this.speedY = Math.random() * SNOW_CONFIG.speed + 0.5;
            this.speedX = (Math.random() - 0.5) * SNOW_CONFIG.wind;
            this.opacity = Math.random() * 0.5 + 0.3;
        }

        update() {
            this.y += this.speedY;
            this.x += this.speedX;

            if (this.y > h + 10 || this.x > w + 10 || this.x < -10) {
                this.init(true);
            }
        }

        draw(ctx) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            // Цвет: светло-голубой
            ctx.fillStyle = `rgba(190, 215, 255, ${this.opacity})`;
            ctx.fill();
        }
    }

    // --- ЛОГИКА АНИМАЦИИ ---
    function loop() {
        if (!snowCanvas) return;
        const ctx = snowCanvas.getContext('2d');
        ctx.clearRect(0, 0, w, h);

        particles.forEach(p => {
            p.update();
            p.draw(ctx);
        });

        animationFrameId = requestAnimationFrame(loop);
    }

    function handleResize() {
        w = window.innerWidth;
        h = window.innerHeight;
        if (snowCanvas) {
            snowCanvas.width = w;
            snowCanvas.height = h;
        }
    }

    // --- УПРАВЛЕНИЕ ВКЛ/ВЫКЛ ---
    function toggleSnowEffect(isEnabled) {
        console.log('[SNOW] Toggling effect:', isEnabled); // Лог для отладки

        if (isEnabled) {
            if (snowCanvas) return; // Уже включено

            snowCanvas = document.createElement('canvas');
            snowCanvas.id = 'culms-snow-canvas'; // ID для удобства поиска в DOM
            snowCanvas.style.position = 'fixed';
            snowCanvas.style.top = '0';
            snowCanvas.style.left = '0';
            snowCanvas.style.width = '100vw';
            snowCanvas.style.height = '100vh';
            snowCanvas.style.pointerEvents = 'none'; 
            snowCanvas.style.zIndex = '2147483647'; 
            
            // ВАЖНО: Крепим к documentElement (<html>), это надежнее для Firefox/LMS
            (document.documentElement || document.body).appendChild(snowCanvas);

            handleResize();
            window.addEventListener('resize', handleResize);

            particles = [];
            for (let i = 0; i < SNOW_CONFIG.count; i++) {
                particles.push(new Snowflake());
            }

            loop();
        } else {
            if (snowCanvas) {
                snowCanvas.remove();
                snowCanvas = null;
            }
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            window.removeEventListener('resize', handleResize);
            particles = [];
        }
    }

    // --- ЗАПУСК ---
    
    // 1. Слушатель изменений (универсальный)
    if (api && api.storage) {
        api.storage.onChanged.addListener((changes) => {
            if ('snowEnabled' in changes) {
                toggleSnowEffect(!!changes.snowEnabled.newValue);
            }
        });
    }

    // 2. Инициализация при старте
    safeGetStorage('snowEnabled').then((data) => {
        console.log('[SNOW] Initial state loaded:', data); // Лог
        if (data && data.snowEnabled) {
            toggleSnowEffect(true);
        }
    });
}