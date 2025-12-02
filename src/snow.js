'use strict';

// Защита от повторной инициализации
if (typeof window.snowEffectInitialized === 'undefined') {
    window.snowEffectInitialized = true;

    // --- УНИВЕРСАЛЬНЫЙ ДОСТУП К API БРАУЗЕРА ---
    const api = window.browser || window.chrome;

    function safeGetStorage(keys) {
        return new Promise((resolve) => {
            if (window.browser && window.browser.storage) {
                window.browser.storage.sync.get(keys).then(resolve);
            } else {
                window.chrome.storage.sync.get(keys, resolve);
            }
        });
    }

    // --- ПЕРЕМЕННЫЕ ---
    let snowCanvas = null;
    let animationFrameId = null;

    // Конфигурация снега
    const SNOW_CONFIG = {
        count: 150, // Количество снежинок
        speed: 1.5, // Скорость падения
        wind: 0.5   // Боковое смещение
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

            // Если улетела за пределы экрана
            if (this.y > h + 10 || this.x > w + 10 || this.x < -10) {
                this.init(true);
            }
        }

        draw(ctx) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            
            // Цвет: светло-голубой (Ice Blue), виден и на белом, и на черном фоне
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
        if (isEnabled) {
            if (snowCanvas) return; // Уже включено

            snowCanvas = document.createElement('canvas');
            snowCanvas.style.position = 'fixed';
            snowCanvas.style.top = '0';
            snowCanvas.style.left = '0';
            snowCanvas.style.width = '100vw';
            snowCanvas.style.height = '100vh';
            snowCanvas.style.pointerEvents = 'none'; // Клики проходят сквозь
            snowCanvas.style.zIndex = '2147483647'; // Максимальный Z-Index
            document.body.appendChild(snowCanvas);

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
    
    // 1. Слушаем изменения настроек из Popup (работает и в Chrome, и в Firefox)
    api.storage.onChanged.addListener((changes) => {
        if ('snowEnabled' in changes) {
            const newValue = changes.snowEnabled.newValue;
            toggleSnowEffect(!!newValue);
        }
    });

    // 2. Проверяем настройку при загрузке страницы
    safeGetStorage('snowEnabled').then((data) => {
        if (data && data.snowEnabled) {
            toggleSnowEffect(true);
        }
    });
}