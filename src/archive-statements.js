const ARCHIVE_KEY = "cu.lms.archived-statements";
const ALLOWED_PATH = "/learn/reports/student-performance";

(async function () {
    const initialPath = window.location.pathname;
    if (!initialPath.startsWith(ALLOWED_PATH)) {
        console.log("[LMS Extension] Skipped: not on student performance section");
        return;
    }

    if (!window.cuLmsLog) {
        window.cuLmsLog = console.log;
    }
    window.cuLmsLog("[LMS Extension] Student Performance Enhancer loaded");

    let archivedCourses = new Map();
    let currentView = 'main'; // 'main' или 'archive'
    let isInitialized = false;

    function getNormalizedPath() {
        return window.location.pathname.replace(/\/$/, '');
    }

    let currentPath = getNormalizedPath();
    let currentTheme = null;

    function showLoader() {
        const loaderContainer = document.querySelector('tui-loader[_ngcontent-ng-c3267422601]');
        if (!loaderContainer) {
            window.cuLmsLog("[LMS Extension] Loader container not found");
            return;
        }
        if (loaderContainer.querySelector('.lms-extension-loader')) return;
        const loader = document.createElement('div');
        loader.className = 'lms-extension-loader';
        loader.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: var(--tui-base-01, #fff);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100;
        `;
        const spinner = document.createElement('div');
        spinner.style.cssText = `
            width: 48px;
            height: 48px;
            border: 4px solid var(--tui-base-05, #e0e0e0);
            border-top-color: var(--tui-primary, #526ed3);
            border-radius: 50%;
            animation: lms-spin 1s linear infinite;
        `;
        loader.appendChild(spinner);
        loaderContainer.style.position = 'relative';
        loaderContainer.appendChild(loader);
        if (!document.querySelector('#lms-loader-styles')) {
            const style = document.createElement('style');
            style.id = 'lms-loader-styles';
            style.textContent = `
                @keyframes lms-spin {
                    to { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    function hideLoader() {
        const loader = document.querySelector('.lms-extension-loader');
        if (loader) {
            loader.remove();
        }
    }

    async function loadArchivedCourses() {
        try {
            const data = await browser.storage.local.get(ARCHIVE_KEY);
            if (data[ARCHIVE_KEY]) {
                archivedCourses = new Map(Object.entries(data[ARCHIVE_KEY]));
                window.cuLmsLog(`[LMS Extension] Loaded ${archivedCourses.size} archived courses`);
            }
        } catch (error) {
            window.cuLmsLog("[LMS Extension] Failed to load archive:", error);
        }
    }

    async function saveArchivedCourses() {
        try {
            const obj = Object.fromEntries(archivedCourses);
            if (archivedCourses.size === 0) {
                await browser.storage.local.remove(ARCHIVE_KEY);
                window.cuLmsLog("[LMS Extension] Archive cleared completely");
                return;
            }
            await browser.storage.local.set({ [ARCHIVE_KEY]: obj });
        } catch (error) {
            window.cuLmsLog("[LMS Extension] Failed to save archive:", error);
        }
    }

    function applyArchivedState() {
        const table = document.querySelector("table.cu-table");
        if (!table) return;
        for (const [href] of archivedCourses) {
            const row = table.querySelector(`a[href="${href}"]`)?.closest("tr");
            if (row) row.style.display = "none";
        }
    }

    async function addArchiveButtons() {
        const rows = document.querySelectorAll("tr[tuitr]");
        const themeData = await browser.storage.sync.get("themeEnabled");
        const isDarkTheme = !!themeData.themeEnabled;
        currentTheme = isDarkTheme;

        for (const row of rows) {
            if (row.querySelector(".lms-archive-btn")) continue;

            const cells = row.querySelectorAll("td");
            const firstCell = cells[0];
            const secondCell = cells[1];
            if (!firstCell || !secondCell) continue;

            const link = firstCell.querySelector("a");
            if (!link) continue;

            const courseName = link.textContent.trim();
            const courseHref = link.getAttribute("href");
            const scoreText = secondCell.textContent.trim();

            secondCell.style.position = "relative";

            const archiveButton = document.createElement("button");
            archiveButton.className = "lms-archive-btn";
            archiveButton.style.cssText = `
                position: absolute;
                right: 1rem;
                top: 50%;
                transform: translateY(-50%);
                width: 1.25rem;
                height: 1.25rem;
                padding: 0;
                border: none;
                background: none;
                cursor: pointer;
                line-height: 0;
            `;

            const iconUrl = browser.runtime.getURL("icons/archive.svg");
            const iconSpan = document.createElement("span");
            iconSpan.className = "lms-icon-span";
            iconSpan.style.cssText = `
                display: inline-block;
                width: 100%;
                height: 100%;
                mask-image: url(${iconUrl});
                -webkit-mask-image: url(${iconUrl});
                mask-size: contain;
                -webkit-mask-size: contain;
                mask-repeat: no-repeat;
                background-color: ${isDarkTheme ? "#FFFFFF" : "#4b5563"};
                transition: background-color 0.2s;
            `;

            archiveButton.appendChild(iconSpan);
            secondCell.appendChild(archiveButton);

            archiveButton.addEventListener("mouseenter", () => {
                iconSpan.style.backgroundColor = "#1f2937";
            });
            archiveButton.addEventListener("mouseleave", () => {
                const theme = currentTheme !== null ? currentTheme : isDarkTheme;
                iconSpan.style.backgroundColor = theme ? "#FFFFFF" : "#4b5563";
            });

            archiveButton.addEventListener("click", async (e) => {
                e.stopPropagation();

                archivedCourses.set(courseHref, {
                    name: courseName,
                    href: courseHref,
                    score: scoreText
                });

                row.style.display = "none";
                await saveArchivedCourses();
                window.cuLmsLog("[LMS Extension] Archived:", courseName);
            });
        }
    }

    function addBreadcrumbNavigation() {
        const breadcrumbs = document.querySelector("tui-breadcrumbs");

        if (!breadcrumbs) {
            window.cuLmsLog("[LMS Extension] ❌ breadcrumbs not found!");
            return;
        }

        const existingArchiveLink = breadcrumbs.querySelector(".archive-link");

        if (existingArchiveLink) {
            window.cuLmsLog("[LMS Extension] ⚠️ Archive link already exists, skipping creation");
            attachStatementLinkHandler();
            return;
        }

        const separator = document.createElement("tui-icon");
        separator.className = "t-icon";
        separator.dataset.icon = "svg";
        separator.style = `
            --t-icon: url(assets/cu/icons/cuIconChevronRight.svg);
            width: 16px;
            height: 16px;
            flex-shrink: 0;
            margin: 0 4px;
        `;

        const archiveLink = document.createElement("a");
        archiveLink.textContent = "Архивированные";
        archiveLink.className = "breadcrumbs__item archive-link";
        archiveLink.setAttribute("tuiappearance", "");
        archiveLink.setAttribute("tuiicons", "");
        archiveLink.setAttribute("tuilink", "");
        archiveLink.dataset.appearance = "action-grayscale";

        breadcrumbs.appendChild(separator);
        breadcrumbs.appendChild(archiveLink);

        const mainFieldset = document.querySelector("fieldset.t-content");
        const archivePlaceholder = document.createElement("div");
        archivePlaceholder.className = "archive-placeholder";
        archivePlaceholder.style.display = "none";

        if (mainFieldset && mainFieldset.parentNode) {
            // ✅ Добавляем маркер, чтобы легко найти основную таблицу
            mainFieldset.dataset.lmsMainTable = "true";
            mainFieldset.parentNode.insertBefore(archivePlaceholder, mainFieldset.nextSibling);
        }

        const activeColor =
            getComputedStyle(document.documentElement)
                .getPropertyValue("--culms-dark-status-neutral")
                .trim() || "#007BFF";

        // Обработчик клика по ссылке "Архивированные"
        archiveLink.addEventListener("click", (e) => {
            e.preventDefault();

            if (currentView === 'archive') {
                return;
            }

            currentView = 'archive';

            if (mainFieldset) {
                mainFieldset.style.display = "none";
            }
            archivePlaceholder.style.display = "block";

            archiveLink.style.color = activeColor;
            archiveLink.classList.add("breadcrumbs__item_last");

            // Убираем активный класс у других элементов
            const allBreadcrumbItems = breadcrumbs.querySelectorAll(".breadcrumbs__item");
            allBreadcrumbItems.forEach(item => {
                if (item !== archiveLink) {
                    item.style.color = "";
                    item.classList.remove("breadcrumbs__item_last");
                }
            });

            renderArchivedTableUI();
        });

        // Добавляем обработчики на кнопку "Ведомость"
        attachStatementLinkHandler();
    }

    function attachStatementLinkHandler() {
        const breadcrumbs = document.querySelector("tui-breadcrumbs");
        if (!breadcrumbs) {
            window.cuLmsLog("[LMS Extension] ❌ breadcrumbs not found in attachStatementLinkHandler");
            return;
        }

        const allLinks = breadcrumbs.querySelectorAll('a[href="/learn/reports/student-performance"]');

        const mainFieldset = document.querySelector("fieldset.t-content");
        const archiveLink = breadcrumbs.querySelector(".archive-link");

        const activeColor =
            getComputedStyle(document.documentElement)
                .getPropertyValue("--culms-dark-status-neutral")
                .trim() || "#007BFF";

        allLinks.forEach((link, index) => {
            if (link.classList.contains("archive-link")) {
                return;
            }
            if (link.dataset.lmsHandlerAttached === "true") {
                window.cuLmsLog(`[LMS Extension] ⏭️ Handler already attached to link ${index}`);
                return;
            }

            link.dataset.lmsHandlerAttached = "true";

            link.addEventListener("click", async (e) => {
                if (currentView === 'main') {
                    return;
                }

                window.cuLmsLog("[LMS Extension] 🛑 Preventing default and switching to main view");
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                currentView = 'main';

                const currentMainFieldset = document.querySelector("fieldset.t-content");
                const currentArchivePlaceholder = document.querySelector(".archive-placeholder");
                const currentArchiveLink = document.querySelector(".archive-link");

                if (currentMainFieldset) {
                    currentMainFieldset.style.display = "";
                }

                if (currentArchivePlaceholder) {
                    currentArchivePlaceholder.style.display = "none";
                }

                link.style.color = activeColor;
                link.classList.add("breadcrumbs__item_last");
                if (currentArchiveLink) {
                    currentArchiveLink.style.color = "";
                    currentArchiveLink.classList.remove("breadcrumbs__item_last");
                }

                await loadArchivedCourses();
                applyArchivedState();
                await addArchiveButtons();

            }, true);

            window.cuLmsLog(`[LMS Extension] ✅ Handler attached successfully to link ${index}`);
        });
    }

    async function renderArchivedTableUI() {
        const archivePlaceholder = document.querySelector(".archive-placeholder");
        if (!archivePlaceholder) return;

        archivePlaceholder.innerHTML = "";

        const themeData = await browser.storage.sync.get("themeEnabled");
        const isDarkTheme = !!themeData.themeEnabled;
        currentTheme = isDarkTheme;

        const fieldset = document.createElement("fieldset");
        fieldset.setAttribute("_ngcontent-ng-c37613583", "");
        fieldset.className = "t-content";

        const scrollbar = document.createElement("tui-scrollbar");
        scrollbar.setAttribute("_ngcontent-ng-c3267422601", "");
        scrollbar.className = "scroll-bar _native-hidden";
        scrollbar.setAttribute("_nghost-ng-c2057308684", "");

        const contentWrapper = document.createElement("div");
        contentWrapper.setAttribute("_ngcontent-ng-c2057308684", "");
        contentWrapper.className = "t-content";

        const table = document.createElement("table");
        table.setAttribute("_ngcontent-ng-c3267422601", "");
        table.setAttribute("tuitable", "");
        table.className = "cu-table _stuck";
        table.dataset.size = "m";

        const thead = document.createElement("thead");
        thead.setAttribute("_ngcontent-ng-c3267422601", "");
        thead.innerHTML = `
      <tr _ngcontent-ng-c3267422601="" tuithgroup="">
        <th _ngcontent-ng-c3267422601="" tuith="" class="column-course _sticky" _nghost-ng-c1881890297="">
          Предмет
        </th>
        <th _ngcontent-ng-c3267422601="" tuith="" tuisortable="" class="column-total _sticky" _nghost-ng-c1881890297="">
          <button _ngcontent-ng-c1881890297="" type="button" class="t-sort">
            Итого
            <tui-icon _ngcontent-ng-c1881890297="" class="t-icon" data-icon="svg"
              style="--t-icon: url(assets/cu/icons/cuIconChevronSelectorVertical.svg);
                     width: 16px; height: 16px;">
            </tui-icon>
          </button>
        </th>
      </tr>
    `;

        const tbody = document.createElement("tbody");
        tbody.setAttribute("_ngcontent-ng-c3267422601", "");
        tbody.setAttribute("tuitbody", "");
        tbody.setAttribute("_nghost-ng-c1775097393", "");

        if (archivedCourses.size === 0) {
            tbody.innerHTML = `
        <tr _ngcontent-ng-c3267422601="" tuitr="" style="--t-row-height: 48px;">
          <td _ngcontent-ng-c3267422601="" tuitd="" colspan="2" style="text-align: center; padding: 2rem;">
            Нет архивированных ведомостей
          </td>
        </tr>
      `;
        } else {
            archivedCourses.forEach((course) => {
                const tr = document.createElement("tr");
                tr.setAttribute("_ngcontent-ng-c3267422601", "");
                tr.setAttribute("tuitr", "");
                tr.style = "--t-row-height: 48px;";

                const firstCell = document.createElement("td");
                firstCell.setAttribute("_ngcontent-ng-c3267422601", "");
                firstCell.setAttribute("tuitd", "");
                firstCell.className = "_border-right column-course link-container";
                firstCell.setAttribute("_nghost-ng-c4079261847", "");

                const link = document.createElement("a");
                link.setAttribute("_ngcontent-ng-c3267422601", "");
                link.setAttribute("tuiappearance", "");
                link.setAttribute("tuiicons", "");
                link.setAttribute("tuilink", "");
                link.dataset.appearance = "action";
                link.href = course.href;
                link.textContent = course.name;

                link.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    window.cuLmsLog(`[LMS Extension] Archive link intercepted: ${course.href}`);

                    const mainFieldset = document.querySelector("fieldset[data-lms-main-table='true']");
                    if (!mainFieldset) {
                        window.cuLmsLog("[LMS Extension] ❌ Main fieldset not found! Falling back to hard nav.");
                        window.location.href = course.href;
                        return;
                    }

                    const originalLink = mainFieldset.querySelector(`a[href="${course.href}"]`);

                    if (originalLink) {
                        window.cuLmsLog("[LMS Extension] ✅ Found original link. Simulating click...");
                        originalLink.click();
                    } else {
                        window.cuLmsLog(`[LMS Extension] ❌ Original link not found. Falling back to hard nav.`);
                        window.location.href = course.href; // Запасной вариант
                    }
                });

                firstCell.appendChild(link); // Добавляем ссылку в ячейку

                const secondCell = document.createElement("td");
                secondCell.setAttribute("_ngcontent-ng-c3267422601", "");
                secondCell.setAttribute("tuitd", "");
                secondCell.setAttribute("_nghost-ng-c4079261847", "");
                secondCell.style.position = "relative";
                secondCell.textContent = course.score + " ";

                const unarchiveButton = document.createElement("button");
                unarchiveButton.className = "lms-unarchive-btn";
                unarchiveButton.style.cssText = `
                  position: absolute;
                  right: 1rem;
                  top: 50%;
                  transform: translateY(-50%);
                  width: 1.25rem;
                  height: 1.25rem;
                  padding: 0;
                  border: none;
                  background: none;
                  cursor: pointer;
                  line-height: 0;
                  z-index: 10;
                `;

                const iconUrl = browser.runtime.getURL("icons/unarchive.svg");
                const iconSpan = document.createElement("span");
                iconSpan.className = "lms-icon-span";
                iconSpan.style.cssText = `
                  display: inline-block;
                  width: 100%;
                  height: 100%;
                  mask-image: url(${iconUrl});
                  -webkit-mask-image: url(${iconUrl});
                  mask-size: contain;
                  -webkit-mask-size: contain;
                  mask-repeat: no-repeat;
                  background-color: ${isDarkTheme ? "#FFFFFF" : "#4b5563"};
                  transition: background-color 0.2s;
                  pointer-events: none;
                `;

                unarchiveButton.appendChild(iconSpan);
                secondCell.appendChild(unarchiveButton);

                unarchiveButton.addEventListener("mouseenter", () => {
                    iconSpan.style.backgroundColor = "#1f2937";
                });
                unarchiveButton.addEventListener("mouseleave", () => {
                    const theme = currentTheme !== null ? currentTheme : isDarkTheme;
                    iconSpan.style.backgroundColor = theme ? "#FFFFFF" : "#4b5563";
                });

                unarchiveButton.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    e.preventDefault();

                    archivedCourses.delete(course.href);
                    await saveArchivedCourses();

                    const mainTable = document.querySelector("table.cu-table");
                    const originalRow = mainTable?.querySelector(`a[href="${course.href}"]`)?.closest("tr");
                    if (originalRow) {
                        originalRow.style.display = "";
                    }

                    await renderArchivedTableUI();
                });

                tr.appendChild(firstCell);
                tr.appendChild(secondCell);
                tbody.appendChild(tr);
            });
        }

        table.appendChild(thead);
        table.appendChild(tbody);
        contentWrapper.appendChild(table);
        scrollbar.appendChild(contentWrapper);
        fieldset.appendChild(scrollbar);
        archivePlaceholder.appendChild(fieldset);
    }

    function cleanup() {
        window.cuLmsLog("[LMS Extension] Cleaning up UI...");

        const breadcrumbs = document.querySelector("tui-breadcrumbs");
        if (breadcrumbs) {
            const archiveLink = breadcrumbs.querySelector(".archive-link");
            if (archiveLink) {
                const separator = archiveLink.previousElementSibling;
                if (separator && separator.tagName === "TUI-ICON") {
                    separator.remove();
                }
                archiveLink.remove();
            }
        }

        const archivePlaceholder = document.querySelector(".archive-placeholder");
        if (archivePlaceholder) {
            archivePlaceholder.remove();
        }

        document.querySelectorAll(".lms-archive-btn, .lms-unarchive-btn").forEach(btn => btn.remove());

        document.querySelectorAll("table.cu-table tr[tuitr]").forEach(row => {
            row.style.display = "";
        });

        hideLoader();

        currentView = 'main';
        isInitialized = false; // Важно сбросить, чтобы initialize() мог запуститься

        window.cuLmsLog("[LMS Extension] Cleanup complete");
    }

    async function initialize() {
        if (getNormalizedPath() !== ALLOWED_PATH) {
            window.cuLmsLog("[LMS Extension] initialize() skipped: not on main page");
            return;
        }

        if (isInitialized) {
            window.cuLmsLog("[LMS Extension] initialize() skipped: already initialized");
            return;
        }

        window.cuLmsLog("[LMS Extension] Starting initialization");

        const tableExists = !!document.querySelector("table.cu-table tr[tuitr]");
        if (!tableExists) {
            showLoader();
        }

        await loadArchivedCourses();

        // currentView всегда 'main' при первой инициализации
        applyArchivedState();
        await addArchiveButtons();
        addBreadcrumbNavigation();

        if (!tableExists) {
            hideLoader();
        }

        isInitialized = true;
        window.cuLmsLog("[LMS Extension] Initialization complete");
    }

    async function initObserver() {
        const mainContainer = document.body;
        let timeoutId;

        const observer = new MutationObserver(async () => {
            const newPath = getNormalizedPath();

            if (newPath !== currentPath) {
                window.cuLmsLog("[LMS Extension] Path changed from", currentPath, "to", newPath);
                currentPath = newPath;

                if (newPath === ALLOWED_PATH) {
                    window.cuLmsLog("[LMS Extension] Returned to main statements page, reinitializing...");
                    cleanup();
                    await initialize();
                    return;
                }

                if (newPath.startsWith(ALLOWED_PATH + "/") || !newPath.startsWith(ALLOWED_PATH)) {
                    window.cuLmsLog("[LMS Extension] On child page or left section, cleaning up...");
                    cleanup();
                    return;
                }
            }

            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(async () => {

                if (currentPath !== ALLOWED_PATH) {
                    return;
                }

                const table = document.querySelector("tr[tuitr]");

                if (table && !isInitialized) {
                    await initialize();
                } else if (table && isInitialized && currentView === 'main') {
                    applyArchivedState();
                    addArchiveButtons();
                    addBreadcrumbNavigation();
                }

            }, 150);
        });

        observer.observe(mainContainer, { childList: true, subtree: true });
    }


    async function waitForAngularRender() {
        const breadcrumbs = document.querySelector("tui-breadcrumbs");

        if (breadcrumbs) {
            window.cuLmsLog("[LMS Extension] Angular render detected (breadcrumbs found)");
            await new Promise(resolve => setTimeout(resolve, 100));

            // Сначала запускаем наблюдатель
            initObserver();

            // Потом пытаемся инициализироваться
            // (initialize() сам проверит, нужно ли)
            await initialize();
        } else {
            setTimeout(waitForAngularRender, 100);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", waitForAngularRender);
    } else {
        waitForAngularRender();
    }

    // Слушаем изменения темы (без изменений)
    browser.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync' && changes.themeEnabled) {
            const isDarkTheme = !!changes.themeEnabled.newValue;
            currentTheme = isDarkTheme;

            document.querySelectorAll('.lms-icon-span').forEach(iconSpan => {
                iconSpan.style.backgroundColor = isDarkTheme ? "#FFFFFF" : "#4b5563";
            });

            window.cuLmsLog(`[LMS Extension] Theme changed to ${isDarkTheme ? 'dark' : 'light'}, icons updated`);
        }
    });
})();