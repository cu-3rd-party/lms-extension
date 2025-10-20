// ==UserScript==
// @name         Central University Course Exporter (Local Server Plugin)
// @namespace    http://tampermonkey.net/
// @version      2.4
// @description  Scans ALL available courses and uploads all material info to a local server with authentication.
// @author       You
// @match        https://my.centraluniversity.ru/learn/courses/view/actual
// @grant        none
// ==/UserScript==

(() => {
    if (window.courseExporterHasRun) {
        console.log('Course Exporter Plugin: Detected duplicate execution. Aborting.');
        return;
    }
    window.courseExporterHasRun = true;

    // ====================================================================
    // Глобальные переменные и вспомогательные функции
    // ====================================================================

    let materialsCache = null;
    let currentLongreadsId = null;

    const API_DELAY_MS = 1000;
    const cuLmsLog = console.log;

    const ACCESS_TOKEN_KEY = 'cu_enhancer_access_token';

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function getAuthToken() {
        return localStorage.getItem(ACCESS_TOKEN_KEY);
    }

    // ====================================================================
    // ФУНКЦИИ ДЛЯ API-ЗАПРОСОВ К СЕРВЕРУ УНИВЕРСИТЕТА
    // ====================================================================
    async function fetchMaterials(longreadsId) {
        // Очищаем кэш для каждого нового лонгрида, т.к. теперь обрабатываем много курсов
        if (currentLongreadsId !== longreadsId) {
            materialsCache = null;
        }

        if (materialsCache) {
            cuLmsLog(`[CU] Returning materials from cache for longread ID: ${longreadsId}`);
            return materialsCache;
        }

        cuLmsLog(`[CU] Fetching materials for longread ID: ${longreadsId}`);
        const apiUrl = `https://my.centraluniversity.ru/api/micro-lms/longreads/${longreadsId}/materials?limit=10000`;
        try {
            const response = await fetch(apiUrl, {
                method: "GET",
                headers: { "accept": "application/json, text/plain, */*" },
                mode: "cors",
                credentials: "include"
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            materialsCache = data;
            currentLongreadsId = longreadsId;
            return data;
        } catch (error)
        {
            cuLmsLog(`[CU] Error fetching longreads materials for ${longreadsId}:`, error);
            return null;
        }
    }

    async function fetchStudentCourses() {
        cuLmsLog('[CU] Fetching student courses...');
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
            cuLmsLog(`[CU] Found ${data.items.length} courses.`);
            return data.items;
        } catch (error) {
            cuLmsLog('[CU] Error fetching student courses:', error);
            return [];
        }
    }

    async function fetchCourseOverview(courseId) {
        cuLmsLog(`[CU] Fetching overview for course ID: ${courseId}`);
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
            cuLmsLog(`[CU] Error fetching overview for course ${courseId}:`, error);
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
                cuLmsLog(`[CU] Found file "${fileToProcess.name}". Getting download link...`);
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
            cuLmsLog(`[CU] Error fetching download link for ${filename}:`, error);
            return null;
        }
    }

    // ====================================================================
    // ФУНКЦИИ ДЛЯ ВЗАИМОДЕЙСТВИЯ С ЛОКАЛЬНЫМ СЕРВЕРОМ
    // ====================================================================

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
            if (response.status === 401) {
                throw new Error(`Authorization failed. Token might be invalid or expired.`);
            }
            if (!response.ok) {
                throw new Error(`Local server returned status: ${response.status}`);
            }
            const data = await response.json();
            cuLmsLog(`[Local] Server responded with ${data.missing_longreads.length} missing longreads.`);
            return data.missing_longreads;
        } catch (error) {
            cuLmsLog('[Local] Error communicating with /api/fetch/.', error);
            return null;
        }
    }

    async function uploadLongreadData(payload, token) {
        cuLmsLog(`[Local] Uploading data for longread ID ${payload.longread_id} to localhost:8000/api/upload/`);
        try {
            const response = await fetch('http://localhost:8000/api/upload/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            if (response.status === 401) {
                throw new Error(`Authorization failed. Token might be invalid or expired.`);
            }
            if (!response.ok) {
                throw new Error(`Local server returned status: ${response.status}`);
            }
            cuLmsLog(`[Local] Successfully uploaded longread ${payload.longread_id}.`);
            return true;
        } catch (error) {
            cuLmsLog(`[Local] Error uploading data for longread ${payload.longread_id}:`, error);
            return false;
        }
    }

    // ====================================================================
    // ОСНОВНАЯ ЛОГИКА
    // ====================================================================

    /**
     * ИЗМЕНЕНО: Обрабатывает все курсы студента, а не только первый.
     */
    async function processAllCourses() {
        cuLmsLog('--- Starting background course processing for ALL courses ---');

        const authToken = getAuthToken();
        if (!authToken) {
            cuLmsLog('[Exporter] Auth token not found in localStorage. Please log in using the main plugin first. Aborting.');
            return;
        }
        cuLmsLog('[Exporter] Auth token found. Proceeding with export.');

        const courses = await fetchStudentCourses();
        if (!courses || courses.length === 0) {
            cuLmsLog('No student courses found. Stopping.');
            return;
        }

        cuLmsLog(`Found ${courses.length} courses to process.`);

        // ИЗМЕНЕНО: Цикл для обработки каждого курса
        for (const course of courses) {
            cuLmsLog(`--- Processing course: "${course.name}" (ID: ${course.id}) ---`);

            const overview = await fetchCourseOverview(course.id);
            if (!overview || !overview.themes) {
                cuLmsLog(`Could not fetch course overview for "${course.name}". Skipping.`);
                continue; // Переходим к следующему курсу
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
                cuLmsLog(`Local server has all materials for "${course.name}", or an error occurred. Skipping.`);
                continue; // Переходим к следующему курсу
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
                    cuLmsLog(`Warning: No download links found for longread "${info.longread_title}" (ID: ${longreadId}). Skipping.`);
                }

                await delay(API_DELAY_MS); // Задержка между обработкой лонгридов
            }
            
            cuLmsLog(`--- Finished processing longreads for course: "${course.name}" ---`);
            await delay(API_DELAY_MS * 2); // Дополнительная задержка между курсами
        }

        cuLmsLog('--- All courses processed. Background processing finished ---');
    }

    // ====================================================================
    // ЗАПУСК СКРИПТА
    // ====================================================================
    function initialize() {
        if (window.location.href === 'https://my.centraluniversity.ru/learn/courses/view/actual') {
            cuLmsLog('Course Exporter Plugin: Detected correct page. Starting process in 3 seconds...');
            // ИЗМЕНЕНО: Вызываем функцию для обработки всех курсов
            setTimeout(processAllCourses, 3000);
        }
    }

    initialize();

})();