// popup.js (кросс-браузерная версия)

const themeToggle = document.getElementById('theme-toggle');
const oledToggle = document.getElementById('oled-toggle');
const emojiHeartsToggle = document.getElementById('emoji-hearts-toggle');
const oldCoursesDesignToggle = document.getElementById('old-courses-design-toggle');

// 1. При открытии popup, получить текущее состояние и обновить переключатель
// Используем browser.storage, который возвращает Promise, понятный полифиллу
browser.storage.sync.get(['themeEnabled', 'oledEnabled', 'emojiHeartsEnabled', 'oldCoursesDesignToggle']).then((data) => {
    themeToggle.checked = !!data.themeEnabled;
    if (oledToggle) {
        oledToggle.checked = !!data.oledEnabled;
        oledToggle.disabled = !themeToggle.checked;
    }
    if (emojiHeartsToggle) {
        emojiHeartsToggle.checked = !!data.emojiHeartsEnabled;
    }
    if (oldCoursesDesignToggle) {
        oldCoursesDesignToggle.checked = !!data.oldCoursesDesignToggle;
    }
});

// 2. При клике на переключатель, сохранить новое состояние.
// Content script на странице сам подхватит это изменение через storage.onChanged
themeToggle.addEventListener('change', () => {
    const isEnabled = themeToggle.checked;
    browser.storage.sync.set({ themeEnabled: isEnabled });
    if (oledToggle) {
        oledToggle.disabled = !isEnabled;
    }
});

// 3. OLED toggle controls variant of dark
if (oledToggle) {
    oledToggle.addEventListener('change', () => {
        const isOled = oledToggle.checked;
        browser.storage.sync.set({ oledEnabled: isOled });
    });
}

if (emojiHeartsToggle) {
    emojiHeartsToggle.addEventListener('change', () => {
        const isEnabled = emojiHeartsToggle.checked;
        browser.storage.sync.set({ emojiHeartsEnabled: isEnabled });
    });
}

if (oldCoursesDesignToggle) {
    oldCoursesDesignToggle.addEventListener('change', () => {
        const isEnabled = oldCoursesDesignToggle.checked;
        browser.storage.sync.set({ oldCoursesDesignToggle: isEnabled });
    });
}

