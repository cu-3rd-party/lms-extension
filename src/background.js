// background.js

try {
    importScripts('browser-polyfill.js');
} catch (e) {
    console.log("Running in a non-MV3 environment or Firefox.");
}

// ====================================================================
// НОВАЯ ЧАСТЬ: ЛОГИКА ЭКСПОРТА КУРСОВ В ФОНОВОМ РЕЖИМЕ
// ====================================================================

let isExporting = false; // Флаг, чтобы предотвратить повторный запуск

// Все функции из course_exporter.js переносятся сюда
const API_DELAY_MS = 1000;
const cuLmsLog = (message, ...args) => console.log(`[Exporter BG] ${message}`, ...args);

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Все функции API (fetchStudentCourses, fetchCourseOverview, и т.д.)
// должны быть здесь. Мы просто переносим их из course_exporter.js.

async function fetchMaterials(longreadsId) {
    cuLmsLog(`Fetching materials for longread ID: ${longreadsId}`);
    const apiUrl = `https://my.centraluniversity.ru/api/micro-lms/longreads/${longreadsId}/materials?limit=10000`;
    try {
        const response = await fetch(apiUrl, {
            method: "GET",
            headers: { "accept": "application/json, text/plain, */*" },
            mode: "cors",
            credentials: "include"
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        cuLmsLog(`Error fetching longreads materials for ${longreadsId}:`, error);
        return null;
    }
}

async function fetchStudentCourses() {
    cuLmsLog('Fetching student courses...');
    const apiUrl = 'https://my.centraluniversity.ru/api/micro-lms/courses/student?limit=10000';
    try {
        const response = await fetch(apiUrl, {
            method: "GET",
            headers: { "accept": "application/json" },
            mode: "cors",
            credentials: "include"
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        cuLmsLog(`Found ${data.items.length} courses.`);
        return data.items;
    } catch (error) {
        cuLmsLog('Error fetching student courses:', error);
        return [];
    }
}

async function fetchCourseOverview(courseId) {
    cuLmsLog(`Fetching overview for course ID: ${courseId}`);
    const apiUrl = `https://my.centraluniversity.ru/api/micro-lms/courses/${courseId}/overview`;
    try {
        const response = await fetch(apiUrl, {
            method: "GET",
            headers: { "accept": "application/json" },
            mode: "cors",
            credentials: "include"
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        cuLmsLog(`Error fetching overview for course ${courseId}:`, error);
        return null;
    }
}

async function getDownloadLinkApi(filename, version) {
    const encodedFilename = encodeURIComponent(filename).replace(/\//g, '%2F');
    const apiUrl = `https://my.centraluniversity.ru/api/micro-lms/content/download-link?filename=${encodedFilename}&version=${version}`;
    try {
        const response = await fetch(apiUrl, {
            method: "GET",
            headers: { "accept": "application/json" },
            mode: "cors",
            credentials: "include"
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        return data ? data.url : null;
    } catch (error) {
        cuLmsLog(`Error fetching download link for ${filename}:`, error);
        return null;
    }
}

async function scanLongreadForAllFiles(longreadId) {
    const materialsData = await fetchMaterials(longreadId);
    if (!materialsData || !materialsData.items) return [];

    const foundFiles = [];
    for (const item of materialsData.items) {
        let fileToProcess = null;
        if (item.discriminator === "file" && item.content) {
            fileToProcess = item.content;
        } else if (item.attachments && item.attachments.length > 0) {
            const attachmentFile = item.attachments.find(a => a.discriminator === "file" && a.content);
            if (attachmentFile) fileToProcess = attachmentFile.content;
        }

        if (fileToProcess && fileToProcess.filename && fileToProcess.version) {
            cuLmsLog(`Found file "${fileToProcess.name}". Getting download link...`);
            const url = await getDownloadLinkApi(fileToProcess.filename, fileToProcess.version);
            if (url) {
                foundFiles.push({
                    download_link: url,
                    filename: fileToProcess.name
                });
            }
        }
    }
    return foundFiles;
}

async function getMissingLongreadsFromServer(payload, token) {
    cuLmsLog('[Local] Sending course structure to localhost:8000/api/fetch/');
    try {
        const response = await fetch('http://localhost:8000/api/fetch/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        if (response.status === 401) throw new Error(`Authorization failed.`);
        if (!response.ok) throw new Error(`Local server returned status: ${response.status}`);
        const data = await response.json();
        cuLmsLog(`[Local] Server responded with ${data.missing_longreads.length} missing longreads.`);
        return data.missing_longreads;
    } catch (error) {
        cuLmsLog('[Local] Error communicating with /api/fetch/.', error);
        return null;
    }
}

async function uploadLongreadData(payload, token) {
    cuLmsLog(`[Local] Uploading data for longread ID ${payload.longread_id}`);
    try {
        const response = await fetch('http://localhost:8000/api/upload/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        if (response.status === 401) throw new Error(`Authorization failed.`);
        if (!response.ok) throw new Error(`Local server returned status: ${response.status}`);
        cuLmsLog(`[Local] Successfully uploaded longread ${payload.longread_id}.`);
        return true;
    } catch (error) {
        cuLmsLog(`[Local] Error uploading data for longread ${payload.longread_id}:`, error);
        return false;
    }
}

// Главная функция, запускающая весь процесс
async function processAllCourses(authToken) {
    if (!authToken) {
        cuLmsLog('Auth token not provided. Aborting.');
        return;
    }
    cuLmsLog('--- Starting background course processing for ALL courses ---');
    const courses = await fetchStudentCourses();
    if (!courses || courses.length === 0) {
        cuLmsLog('No student courses found. Stopping.');
        return;
    }

    cuLmsLog(`Found ${courses.length} courses to process.`);

    for (const course of courses) {
        cuLmsLog(`--- Processing course: "${course.name}" (ID: ${course.id}) ---`);
        const overview = await fetchCourseOverview(course.id);
        if (!overview || !overview.themes) {
            cuLmsLog(`Could not fetch course overview for "${course.name}". Skipping.`);
            continue;
        }

        const longreadInfoMap = new Map();
        const payloadForFetch = {
            courses: [{
                course_id: course.id,
                themes: overview.themes.map(theme => {
                    theme.longreads.forEach(longread => {
                        longreadInfoMap.set(longread.id, {
                            course_title: course.name,
                            theme_id: theme.id,
                            theme_title: theme.name,
                            longread_title: longread.name,
                        });
                    });
                    return {
                        theme_id: theme.id,
                        longreads: theme.longreads.map(lr => lr.id),
                    };
                }),
            }],
        };

        const missingIds = await getMissingLongreadsFromServer(payloadForFetch, authToken);
        if (!missingIds || missingIds.length === 0) {
            cuLmsLog(`Local server has all materials for "${course.name}". Skipping.`);
            continue;
        }

        cuLmsLog(`--- Processing ${missingIds.length} missing longreads for "${course.name}" ---`);
        for (const longreadId of missingIds) {
            const info = longreadInfoMap.get(longreadId);
            if (!info) {
                cuLmsLog(`Warning: Could not find metadata for missing longread ID ${longreadId}. Skipping.`);
                continue;
            }
            const files = await scanLongreadForAllFiles(longreadId);
            if (files && files.length > 0) {
                const uploadPayload = {
                    course_id: course.id,
                    theme_id: info.theme_id,
                    longread_id: longreadId,
                    files: files,
                    course_title: info.course_title,
                    theme_title: info.theme_title,
                    longread_title: info.longread_title,
                };
                await uploadLongreadData(uploadPayload, authToken);
            } else {
                cuLmsLog(`No download links found for longread "${info.longread_title}" (ID: ${longreadId}).`);
            }
            await delay(API_DELAY_MS);
        }
        cuLmsLog(`--- Finished processing for course: "${course.name}" ---`);
        await delay(API_DELAY_MS * 2);
    }

    cuLmsLog('--- All courses processed. Background processing finished ---');
}

// Слушатель сообщений от content-скриптов
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.command === 'startExport') {
        if (isExporting) {
            console.log("[Exporter BG] Export process is already running. Ignoring new request.");
            return;
        }

        isExporting = true;
        console.log("[Exporter BG] Received start command. Starting export process.");

        // Запускаем процесс и после его завершения (успешного или нет) сбрасываем флаг
        processAllCourses(message.token).finally(() => {
            isExporting = false;
            console.log("[Exporter BG] Export process finished. Ready for new tasks.");
        });
    }
});


// ====================================================================
// СТАРАЯ ЧАСТЬ: ВНЕДРЕНИЕ СКРИПТОВ (остается без изменений)
// ====================================================================

browser.webNavigation.onHistoryStateUpdated.addListener(details => {
    if (details.frameId === 0) handleNavigation(details.tabId, details.url);
});

browser.webNavigation.onCompleted.addListener(details => {
    if (details.frameId === 0) handleNavigation(details.tabId, details.url);
});

function handleNavigation(tabId, url) {
    if (!url || !url.startsWith("https://my.centraluniversity.ru/")) return;

    // --- ОБЩИЕ СКРИПТЫ ---
    browser.scripting.executeScript({
        target: { tabId: tabId },
        files: ["browser-polyfill.js", "open_courses_tab.js"]
    }).catch(err => console.error(`[BG_LOG] Error injecting open_courses_tab.js:`, err));

    // --- ЛОГИКА РАЗДЕЛЬНОГО ВНЕДРЕНИЯ ---
    if (url.includes("/learn/tasks")) {
        browser.scripting.executeScript({
            target: { tabId: tabId },
            files: ["browser-polyfill.js", "dark_theme.js", "tasks_fix.js"]
        }).catch(err => console.error(`[BG_LOG] Error injecting scripts for Tasks page:`, err));
    } else {
        browser.scripting.executeScript({
            target: { tabId: tabId },
            files: ["browser-polyfill.js", "dark_theme.js", "emoji_swap.js"]
        }).catch(err => console.error(`[BG_LOG] Error injecting default scripts:`, err));
    }

    // --- ВНЕДРЕНИЕ СКРИПТОВ ДЛЯ КОНКРЕТНЫХ СТРАНИЦ ---
    if (url.includes("/learn/courses/view/actual")) {
        browser.scripting.executeScript({
            target: { tabId: tabId },
            files: ["browser-polyfill.js", "course_exporter.js"]
        }).catch(err => console.error(`[BG_LOG] Error injecting course_exporter.js:`, err));
    }

    if (url.includes("/learn/courses/view")) {
        browser.scripting.executeScript({
            target: { tabId: tabId },
            files: ["browser-polyfill.js", "course_card_simplifier.js", "courses_fix.js"]
        }).catch(err => console.error(`[BG_LOG] Error injecting courses_fix.js:`, err));
    }

    if (url.includes("/longreads/")) {
        browser.scripting.executeScript({
            target: { tabId: tabId },
            files: ["homework_weight_fix.js", "instant_doc_view_fix.js"]
        }).catch(err => console.error(`[BG_LOG] Error injecting Longreads scripts:`, err));
    }
}