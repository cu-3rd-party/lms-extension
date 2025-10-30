// popup.js (кросс-браузерная версия)

const themeToggle = document.getElementById('theme-toggle');
const oledToggle = document.getElementById('oled-toggle');
const emojiHeartsToggle = document.getElementById('emoji-hearts-toggle');
const oldCoursesDesignToggle = document.getElementById('old-courses-design-toggle');
const futureExamsViewToggle = document.getElementById('future-exams-view-toggle');
const autoRenameToggle = document.getElementById('auto-rename-toggle');
const courseOverviewTaskStatusToggle = document.getElementById('course-overview-task-status-toggle');

// 1. При открытии popup, получить текущее состояние и обновить переключатель
browser.storage.sync.get(['themeEnabled', 'oledEnabled', 'emojiHeartsEnabled',
                          'oldCoursesDesignToggle', 'futureExamsViewToggle', 'autoRenameEnabled', 'courseOverviewTaskStatusToggle']).then((data) => {
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
    if (futureExamsViewToggle) {
        futureExamsViewToggle.checked = !!data.futureExamsViewToggle;
    }
    if (autoRenameToggle) {
        autoRenameToggle.checked = !!data.autoRenameEnabled;
    if (courseOverviewTaskStatusToggle) {
        courseOverviewTaskStatusToggle.checked = !!data.courseOverviewTaskStatusToggle;
    }
});

// 2. При клике на переключатель, сохранить новое состояние.
themeToggle.addEventListener('change', () => {
    const isEnabled = themeToggle.checked;
    browser.storage.sync.set({ themeEnabled: isEnabled });
    if (oledToggle) {
        oledToggle.disabled = !isEnabled;
    }
});

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

if (futureExamsViewToggle) {
    futureExamsViewToggle.addEventListener('change', () => {
        const isEnabled = futureExamsViewToggle.checked;
        browser.storage.sync.set({ futureExamsViewToggle: isEnabled });
    });
}

if (autoRenameToggle) {
    autoRenameToggle.addEventListener('change', () => {
        const isEnabled = autoRenameToggle.checked;
        browser.storage.sync.set({ autoRenameEnabled: isEnabled });
    });
}

if (courseOverviewTaskStatusToggle) {
    courseOverviewTaskStatusToggle.addEventListener('change', () => {
        const isEnabled = courseOverviewTaskStatusToggle.checked;
        browser.storage.sync.set({ courseOverviewTaskStatusToggle: isEnabled });
    });
}
