// course_cards.js — старый дизайн карточек курсов: обложка с подписью снизу,
// свои картинки на обложке и собственный архив курсов.
//
// LMS в редизайне выкинула обложки: теперь `cu-course-card` — это текстовая
// плашка с категорией и названием, а `img.course-icon` (по которому работал
// старый `course_card_image_replacer.js`) больше не существует. Поэтому обложку
// мы рисуем сами поверх нативной карточки, не трогая её обработчики кликов.
//
// Редактировать карточки можно только в режиме редактора (`?customCardEditor=true`) —
// как в старой версии: вне его клик по карточке должен открывать курс, а не
// диалог выбора файла.
//
// Архив — целиком наш: LMS архивирует курсы сама (`state=archived`), и повлиять
// на это из расширения нельзя. Поэтому «заархивированный пользователем» курс мы
// просто прячем из списка актуальных и показываем отдельным блоком на странице
// архивных курсов, откуда его можно вернуть.

// Polyfill to handle browser namespace differences (Chrome uses 'chrome', Firefox uses 'browser')
if (typeof browser === 'undefined') {
  var browser = chrome;
}

if (typeof window.__culmsCourseCardsInitialized === 'undefined') {
  window.__culmsCourseCardsInitialized = true;

  ('use strict');

  // --- КОНСТАНТЫ ---
  const SETTING_KEY = 'oldCoursesDesignToggle';
  const ICONS_KEY = 'courseIcons';
  const ARCHIVE_KEY = 'archivedCourseIds';
  // Слепок списка курсов с прошлого захода: без него первая отрисовка ждала бы
  // сеть, и заархивированные карточки успевали мелькнуть на экране.
  const META_CACHE_KEY = 'courseMetaCache';
  const FIT_KEY = 'stickerObjectFit';
  const SCALE_KEY = 'stickerScale';
  const EDITOR_PARAM = 'customCardEditor';
  // Раньше режим назывался «редактор иконок» — старые ссылки не ломаем.
  const LEGACY_EDITOR_PARAM = 'customIconEditor';

  const ROOT_CLASS = 'culms-old-design';
  const DARK_CLASS = 'culms-old-design--dark';
  const EDIT_CLASS = 'culms-old-design--editing';
  const COVER_CLASS = 'culms-cover';
  const TITLE_CLASS = 'culms-old-title';
  const HIDDEN_CLASS = 'culms-archived-item';
  const ACTIONS_CLASS = 'culms-card-actions';
  const EDITOR_BAR_ID = 'culms-card-editor-bar';
  const BUSY_ID = 'culms-card-busy';
  const ARCHIVED_ROW_CLASS = 'culms-archived-row';

  const COURSES_API = '/api/micro-lms/courses/student?limit=200&offset=0&state=published';
  const COURSE_URL_PREFIX = '/learn/courses/view/actual/';

  // `fit` из старой версии был невалидным значением object-fit и просто
  // игнорировался браузером — вместо него используем `scale-down`.
  const ALLOWED_FITS = new Set(['cover', 'contain', 'fill', 'scale-down']);
  const DEFAULT_FIT = 'cover';
  const DEFAULT_SCALE = 100;
  const MIN_SCALE = 25;
  const MAX_SCALE = 400;

  // Картинку ужимаем перед сохранением: storage.local не резиновый, а оригиналы
  // с телефона легко весят по 5 МБ.
  //
  // 480 px — с запасом: обложка занимает ~200 CSS px по длинной стороне, то есть
  // даже на экране с DPR 2 больше ~430 px не нужно. Раньше здесь было 800 px, и
  // каждая картинка весила ~130 КБ вместо ~70 КБ. В Chrome это незаметно, а в
  // Firefox `storage.local` — это IndexedDB со structured clone через IPC, и
  // лишние мегабайты видно глазом: картинки появляются с задержкой.
  const MAX_ICON_SIDE = 480;
  const ICON_QUALITY = 0.85;
  // Анимацию сохраняем как есть: перерисовка в canvas оставляет только первый
  // кадр. Потолок — чтобы одна картинка не съела всю квоту `storage.local`
  // (без `unlimitedStorage` это 10 МБ на все курсы, а base64 ещё +33 %).
  const MAX_RAW_ANIMATED_BYTES = 1024 * 1024;
  // Верхняя планка на исходник — только чтобы не уронить вкладку на декодировании
  // чего-то совсем гигантского. Всё, что меньше, мы умеем ужать сами.
  const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
  // Начиная с этого размера перекодирование заметно затягивается, и про него
  // честнее предупредить заранее: оно идёт в основном потоке, вкладка подвисает.
  const SLOW_REENCODE_BYTES = 3 * 1024 * 1024;
  // Грубая оценка по замерам: гифка 14 МБ (1280×720, 140 кадров) — около 6 с.
  const SECONDS_PER_MB = 0.45;

  // Цвета категорий — те же, что LMS использовала на старых обложках
  // (продублированы в dark-theme.css для `.course-card.<категория>`).
  const CATEGORY_COLORS = {
    general: '#ff662c',
    mathematics: '#775aff',
    design: '#6e7277',
    stem: '#3995a1',
    softSkills: '#c1f229',
    ml: '#06a2f1',
    business: '#00a651',
    development: '#be84fc',
  };
  // Подписи категорий — как их показывает сама LMS. Нужны на странице архивных
  // курсов, где наших карточек в DOM нет и взять текст неоткуда.
  const CATEGORY_LABELS = {
    general: 'Общие',
    mathematics: 'Математика',
    design: 'Дизайн',
    stem: 'STEM',
    softSkills: 'Soft skills',
    ml: 'ML',
    business: 'Бизнес',
    development: 'Разработка',
    withoutCategory: 'Без категории',
  };
  // Иконки категорий — те же файлы, что LMS ставит в `--t-icon`. Нужны для
  // бейджа в нашей строке архива: если категории нет в карте, иконку убираем
  // и остаётся только подпись.
  const CATEGORY_ICONS = {
    general: 'url(assets/cu/icons/cuIconBrandAcademic.svg)',
    mathematics: 'url(assets/cu/icons/cuIconBrandMath.svg)',
    stem: 'url(assets/cu/icons/cuIconBrandMolecule.svg)',
    softSkills: 'url(assets/cu/icons/cuIconBrandMessage.svg)',
    ml: 'url(assets/cu/icons/cuIconBrandChip.svg)',
    business: 'url(assets/cu/icons/cuIconBrandBriefcase.svg)',
    development: 'url(assets/cu/icons/cuIconBrandCode.svg)',
    withoutCategory: 'url(assets/cu/icons/cuIconBrandDoc.svg)',
  };
  // На светло-салатовом фоне белый текст не читается.
  const DARK_INK_CATEGORIES = new Set(['softSkills']);

  // --- СОСТОЯНИЕ ---
  let enabled = false;
  let isDark = false;
  let isEditorMode = false;
  let objectFit = DEFAULT_FIT;
  let iconScale = DEFAULT_SCALE;
  let courseIcons = {};
  // Картинки приезжают отдельно от остальных настроек, и до их прихода пустой
  // `courseIcons` означает «ещё не знаем», а не «картинок нет».
  let iconsLoaded = false;
  let archivedKeys = new Set();
  /** name → { id, category }; ключ иконки/архива не должен зависеть от DOM. */
  let courseMetaByName = new Map();
  /** ключ курса → { id, name, category }; нужен для списка архива. */
  let courseMetaByKey = new Map();
  let courseMetaPromise = null;
  let metaLoaded = false;
  let observer = null;
  let currentUrl = location.href;

  const log = (...args) =>
    typeof window.cuLmsLog === 'function' ? window.cuLmsLog(...args) : undefined;

  // --- УТИЛИТЫ ---

  // Список актуальных курсов живёт на /view/actual, плюс вкладка фильтра
  // отдельным сегментом (/actual/all, /actual/required, ...). Страница отдельного
  // курса отличается тем, что этот сегмент — числовой id (/actual/1245).
  function isActualListPage() {
    return /^\/learn\/courses\/view\/actual(\/(?!\d+$)[^/]+)?\/?$/.test(location.pathname);
  }

  // Архивные курсы LMS показывает таблицей на /view/archived (без вкладок).
  function isArchivedPage() {
    return /^\/learn\/courses\/view\/archived(\/(?!\d+$)[^/]+)?\/?$/.test(location.pathname);
  }

  function isCourseListPage() {
    return isActualListPage() || isArchivedPage();
  }

  function readEditorMode() {
    const params = new URLSearchParams(location.search);
    return params.get(EDITOR_PARAM) === 'true' || params.get(LEGACY_EDITOR_PARAM) === 'true';
  }

  /** В режиме редактора рисуем обложки даже при выключенном тумблере — как раньше. */
  function isActive() {
    return enabled || isEditorMode;
  }

  function normalizeFit(value) {
    return ALLOWED_FITS.has(value) ? value : DEFAULT_FIT;
  }

  function normalizeScale(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return DEFAULT_SCALE;
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(num)));
  }

  function normalizeName(name) {
    return (name || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  /**
   * Ключ курса в хранилище иконок и архива.
   * Сначала пробуем id из API — тогда иконки, сохранённые старой версией плагина
   * (она хранила их как `{ "969": "data:..." }`), подхватываются как есть.
   * Если API недоступен — падаем на название курса.
   */
  function getCourseKey(name) {
    const meta = courseMetaByName.get(normalizeName(name));
    return meta ? String(meta.id) : `name:${normalizeName(name)}`;
  }

  /** Строит соответствия названий и id по списку курсов. */
  function applyCourseMeta(items) {
    const byName = new Map();
    const byKey = new Map();
    (items || []).forEach((item) => {
      if (!item || item.name == null || item.id == null) return;
      const entry = { id: item.id, name: item.name, category: item.category };
      byName.set(normalizeName(item.name), entry);
      byKey.set(String(item.id), entry);
    });
    courseMetaByName = byName;
    courseMetaByKey = byKey;
    return byKey.size > 0;
  }

  async function loadCourseMeta() {
    if (courseMetaPromise) return courseMetaPromise;

    courseMetaPromise = (async () => {
      try {
        const response = await fetch(COURSES_API, {
          credentials: 'same-origin',
          headers: { accept: 'application/json' },
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);

        const payload = await response.json();
        const items = Array.isArray(payload) ? payload : payload.items || [];
        applyCourseMeta(items);
        // Кладём в кеш, чтобы следующий заход не ждал сеть.
        browser.storage.local
          .set({
            [META_CACHE_KEY]: items.map((i) => ({ id: i.id, name: i.name, category: i.category })),
          })
          .catch(() => {});
      } catch (error) {
        // Не критично: без API работаем по названиям курсов.
        log('[course-cards] Не удалось получить список курсов:', error);
      } finally {
        metaLoaded = true;
      }
    })();

    return courseMetaPromise;
  }

  // --- РАБОТА С КАРТИНКОЙ ---

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Не удалось открыть изображение'));
      img.src = dataUrl;
    });
  }

  /** Размер картинки после вписывания в MAX_ICON_SIDE по длинной стороне. */
  function fitIconSize(image) {
    const scale = Math.min(1, MAX_ICON_SIDE / Math.max(image.width, image.height));
    return {
      width: Math.max(1, Math.round(image.width * scale)),
      height: Math.max(1, Math.round(image.height * scale)),
    };
  }

  /** Перерисовывает картинку в canvas и отдаёт data-URL; null — не получилось. */
  function encodeIcon(image, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, width, height);

    const webp = canvas.toDataURL('image/webp', ICON_QUALITY);
    if (webp.startsWith('data:image/webp')) return webp;
    return canvas.toDataURL('image/jpeg', ICON_QUALITY);
  }

  /** Ужимает картинку до MAX_ICON_SIDE по длинной стороне и возвращает data-URL. */
  async function prepareIcon(file) {
    const dataUrl = await readFileAsDataUrl(file);

    // Анимацию через canvas пропускать нельзя — останется первый кадр. Раньше
    // исключение делалось только для `image/gif` до 512 КБ, поэтому обычная
    // гифка потяжелее и любой анимированный webp молча становились статичными.
    // Детектор форматов живёт в gif_reencode.js — он же умеет их пережимать.
    // Модуль внедряется перед этим файлом; если его вдруг нет, анимацию просто
    // не распознаем и пойдём обычным путём через canvas.
    const formats = window.cuLmsGifReencode;
    if (formats && formats.isAnimated(new Uint8Array(await file.arrayBuffer()))) {
      if (file.size <= MAX_RAW_ANIMATED_BYTES) return dataUrl;

      // Тяжёлую анимацию не отвергаем и не сплющиваем, а пережимаем: кадры
      // уменьшаются и собираются обратно в GIF (см. gif_reencode.js). Так можно
      // взять любую гифку, а в хранилище всё равно ляжет меньше мегабайта.
      if (formats.supported()) {
        const megabytes = file.size / (1024 * 1024);
        const seconds = Math.max(2, Math.round(megabytes * SECONDS_PER_MB));
        const proceed =
          file.size < SLOW_REENCODE_BYTES ||
          confirm(
            `Гифка весит ${megabytes.toFixed(1)} МБ — её нужно пережать, иначе в хранилище ` +
              `она не поместится. Это займёт примерно ${seconds} с, и вкладка будет ` +
              `подтормаживать.\n\n` +
              `ОК — пережать, Отмена — быстро сохранить только первый кадр.`
          );

        if (proceed) {
          const result = await formats.run(file, {
            maxBytes: MAX_RAW_ANIMATED_BYTES,
            onProgress: showBusy,
          });
          hideBusy();
          if (result) return result.dataUrl;
        } else {
          // Пользователь выбрал быстрый путь — дальше обычная ветка с canvas.
          return canvasIcon(dataUrl);
        }
      }

      // Сюда попадаем, только если браузер без ImageDecoder или файл не разобрался.
      const size = (file.size / (1024 * 1024)).toFixed(1);
      const keepAnimation = confirm(
        `Анимированная картинка весит ${size} МБ, и пережать её не получилось.\n\n` +
          `ОК — сохранить как есть (займёт место и замедлит открытие списка), ` +
          `Отмена — сохранить только первый кадр.`
      );
      if (keepAnimation) return dataUrl;
    }

    return canvasIcon(dataUrl);
  }

  /** Обычный путь: перерисовать в canvas под размер обложки. */
  async function canvasIcon(dataUrl) {
    const image = await loadImage(dataUrl);
    const { width, height } = fitIconSize(image);
    return encodeIcon(image, width, height) || dataUrl;
  }

  /**
   * Уменьшает уже сохранённую картинку. null — она и так не больше лимита.
   * Перекодируем только то, что действительно велико: повторный проход по уже
   * ужатой картинке просто терял бы качество.
   */
  async function shrinkStoredIcon(dataUrl) {
    const image = await loadImage(dataUrl);
    if (Math.max(image.width, image.height) <= MAX_ICON_SIDE) return null;
    const { width, height } = fitIconSize(image);
    return encodeIcon(image, width, height);
  }

  /**
   * Разовая чистка хранилища: картинки, сохранённые прошлой версией плагина
   * (до 800 px), ужимаются до текущего лимита.
   *
   * Без этого уменьшение MAX_ICON_SIDE помогло бы только новым картинкам, а всё
   * уже сохранённое грузилось бы так же медленно. Условие «больше лимита»
   * делает проход самоограниченным: после одного раза он ничего не находит.
   */
  async function shrinkStoredIcons() {
    if (!iconsLoaded) return;

    const keys = Object.keys(courseIcons);
    if (!keys.length) return;

    const next = Object.assign({}, courseIcons);
    let changed = false;

    for (const key of keys) {
      const url = next[key];
      if (typeof url !== 'string') continue;
      // Анимацию не трогаем: перерисовка в canvas оставила бы первый кадр.
      // Гифки отсеиваем по типу (свои перекодировки — всегда webp или jpeg),
      // остальное — по сигнатуре в начале файла.
      if (url.startsWith('data:image/gif')) continue;
      const formats = window.cuLmsGifReencode;
      if (formats && formats.isAnimated(formats.bytesFromDataUrl(url, 4096))) continue;
      try {
        const smaller = await shrinkStoredIcon(url);
        if (smaller && smaller.length < url.length) {
          next[key] = smaller;
          changed = true;
        }
      } catch (error) {
        log('[course-cards] Не удалось ужать сохранённую картинку:', error);
      }
    }

    if (!changed) return;

    try {
      await browser.storage.local.set({ [ICONS_KEY]: next });
      courseIcons = next;
      log('[course-cards] Картинки курсов ужаты до', MAX_ICON_SIDE, 'px');
    } catch (error) {
      log('[course-cards] Не удалось сохранить ужатые картинки:', error);
    }
  }

  /**
   * Плашка «идёт работа»: пережатие большой гифки занимает секунды, и без неё
   * это выглядит как зависшая вкладка.
   */
  function showBusy(text) {
    let busy = document.getElementById(BUSY_ID);
    if (!busy) {
      busy = document.createElement('div');
      busy.id = BUSY_ID;
      document.body.appendChild(busy);
    }
    busy.textContent = text;
  }

  function hideBusy() {
    const busy = document.getElementById(BUSY_ID);
    if (busy) busy.remove();
  }

  function pickIconFile() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';
      document.body.appendChild(input);

      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        input.remove();
        resolve(file || null);
      });

      input.click();
    });
  }

  async function saveIcon(key, dataUrl) {
    const next = Object.assign({}, courseIcons);
    if (dataUrl) {
      next[key] = dataUrl;
    } else {
      delete next[key];
    }

    try {
      await browser.storage.local.set({ [ICONS_KEY]: next });
      courseIcons = next;
      iconsLoaded = true;
    } catch (error) {
      log('[course-cards] Не удалось сохранить иконку:', error);
      alert('Не удалось сохранить иконку — возможно, закончилось место в хранилище расширения.');
    }
  }

  /** Полный цикл «выбрать файл → ужать → сохранить → перерисовать». */
  async function chooseIconFor(holder) {
    const file = await pickIconFile();
    if (!file) return;

    if (file.size > MAX_SOURCE_BYTES) {
      alert(
        `Файл ${(file.size / (1024 * 1024)).toFixed(0)} МБ — это слишком даже для нас. ` +
          `Возьми что-нибудь до ${MAX_SOURCE_BYTES / (1024 * 1024)} МБ.`
      );
      return;
    }

    try {
      const prepared = await prepareIcon(file);
      await saveIcon(holder.dataset.culmsKey, prepared);
      renderCurrentPage();
    } catch (error) {
      log('[course-cards] Не удалось обработать картинку:', error);
      alert('Не удалось обработать картинку. Попробуй другой файл.');
    } finally {
      hideBusy();
    }
  }

  // --- АРХИВ ---

  async function setArchived(key, archived) {
    const next = new Set(archivedKeys);
    if (archived) next.add(key);
    else next.delete(key);

    try {
      await browser.storage.local.set({ [ARCHIVE_KEY]: Array.from(next) });
      archivedKeys = next;
      renderCurrentPage();
    } catch (error) {
      log('[course-cards] Не удалось сохранить архив:', error);
      alert('Не удалось сохранить архив курсов.');
    }
  }

  // --- ПОСТРОЕНИЕ КАРТОЧКИ ---

  function stopCardClick(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  /** Гасит всё, на чём LMS открывает курс и стартует cdkDrag. */
  function blockCardInteraction(element, onlyWhenEditing) {
    ['pointerdown', 'mousedown', 'touchstart', 'dragstart'].forEach((type) =>
      element.addEventListener(type, (event) => {
        if (onlyWhenEditing && !isEditorMode) return;
        stopCardClick(event);
      })
    );
  }

  function createCoverButton(label, title) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'culms-cover__btn';
    button.textContent = label;
    button.title = title;
    button.setAttribute('aria-label', title);
    blockCardInteraction(button, false);
    return button;
  }

  /** Создаёт (один раз) обложку внутри нативной карточки. */
  function ensureCover(card) {
    let cover = card.querySelector(':scope > .' + COVER_CLASS);
    if (cover) return cover;

    cover = document.createElement('div');
    cover.className = COVER_CLASS;
    // Критичная для раскладки часть — инлайном, страховка на случай, если
    // стиль плагина приедет позже скрипта: без позиционирования обложка
    // становится обычным блоком и растягивает карточку на всю строку.
    // В CSS те же свойства объявлены с `!important`, так что конфликта нет.
    cover.style.position = 'absolute';
    cover.style.inset = '0';
    cover.style.overflow = 'hidden';

    const placeholder = document.createElement('div');
    placeholder.className = 'culms-cover__placeholder';

    const icon = document.createElement('span');
    icon.className = 'culms-cover__cat-icon';
    placeholder.appendChild(icon);

    const catName = document.createElement('span');
    catName.className = 'culms-cover__cat-name';
    placeholder.appendChild(catName);

    cover.appendChild(placeholder);

    const image = document.createElement('img');
    image.className = 'culms-cover__img';
    image.alt = '';
    cover.appendChild(image);

    // В режиме редактора по самой обложке тоже можно кликнуть — как в старой
    // версии, где клик по иконке открывал выбор файла. Вне редактора клик
    // беспрепятственно всплывает к карточке, и LMS открывает курс.
    blockCardInteraction(cover, true);
    cover.addEventListener(
      'click',
      (event) => {
        if (!isEditorMode) return;
        // Кнопки обрабатывают себя сами — иначе диалог откроется дважды.
        if (event.target.closest('.culms-card-actions')) return;
        stopCardClick(event);
        void chooseIconFor(cover);
      },
      true
    );

    card.prepend(cover);
    return cover;
  }

  /**
   * Панель редактора живёт на самой `li`, а не на обложке: переименовывать и
   * архивировать курсы нужно и на родном дизайне LMS, когда обложек нет.
   */
  function ensureCardActions(item, key, originalName) {
    let actions = item.querySelector(':scope > .' + ACTIONS_CLASS);
    if (!actions) {
      actions = document.createElement('div');
      actions.className = ACTIONS_CLASS;

      const iconButton = createCoverButton('✎', 'Изменить картинку курса');
      iconButton.dataset.culmsAction = 'icon';
      iconButton.addEventListener('click', (event) => {
        stopCardClick(event);
        void chooseIconFor(actions);
      });
      actions.appendChild(iconButton);

      const resetIcon = createCoverButton('✕', 'Убрать свою картинку');
      resetIcon.dataset.culmsAction = 'reset-icon';
      resetIcon.addEventListener('click', async (event) => {
        stopCardClick(event);
        await saveIcon(actions.dataset.culmsKey, null);
        renderCurrentPage();
      });
      actions.appendChild(resetIcon);

      const renameButton = createCoverButton('✏', 'Переименовать курс');
      renameButton.dataset.culmsAction = 'rename';
      renameButton.addEventListener('click', (event) => {
        stopCardClick(event);
        void renameCourse(actions);
      });
      actions.appendChild(renameButton);

      const archiveButton = createCoverButton('⇩', 'Убрать курс в архив');
      archiveButton.dataset.culmsAction = 'archive';
      archiveButton.addEventListener('click', (event) => {
        stopCardClick(event);
        void setArchived(actions.dataset.culmsKey, true);
      });
      actions.appendChild(archiveButton);

      item.appendChild(actions);
    }

    actions.dataset.culmsKey = key;
    actions.dataset.culmsOriginal = originalName;
    actions.classList.toggle('culms-card-actions--custom-icon', !!courseIcons[key]);
    // Без id курса переименовать нечего: соответствие названий строится по нему.
    actions.classList.toggle('culms-card-actions--no-id', key.startsWith('name:'));
    return actions;
  }

  function removeCardActions(item) {
    item.querySelectorAll('.' + ACTIONS_CLASS).forEach((node) => node.remove());
  }

  /** Диалог переименования. Пустая строка возвращает родное название. */
  async function renameCourse(actions) {
    const names = window.cuLmsCourseNames;
    const key = actions.dataset.culmsKey;
    if (!names || key.startsWith('name:')) {
      alert('Не удалось определить курс — переименование недоступно.');
      return;
    }

    const original = actions.dataset.culmsOriginal || '';
    const current = names.getOverride(key) || original;
    const next = prompt(
      `Название курса

Оригинал: ${original}
Пустое поле вернёт его.`,
      current
    );
    if (next === null) return;

    await names.setOverride(key, next.trim() === original ? '' : next);
    renderCurrentPage();
  }

  /** Подпись под карточкой — как в старом дизайне LMS. */
  function ensureTitle(item, card, name) {
    let title = item.querySelector(':scope > .' + TITLE_CLASS);
    if (!title) {
      title = document.createElement('div');
      title.className = TITLE_CLASS;
      title.addEventListener('click', (event) => {
        // В редакторе не уводим со списка по случайному клику.
        if (isEditorMode) {
          stopCardClick(event);
          return;
        }
        card.click();
      });
      item.appendChild(title);
    }
    if (title.textContent !== name) title.textContent = name;
    // Карточка могла быть перерисована Angular — держим подпись последней.
    if (item.lastElementChild !== title) item.appendChild(title);
    return title;
  }

  function stripItem(item) {
    item.querySelectorAll('.' + COVER_CLASS).forEach((node) => node.remove());
    item.querySelectorAll('.' + TITLE_CLASS).forEach((node) => node.remove());
  }

  function syncItem(item, name, key, displayName) {
    const card = item.querySelector(':scope > cu-course-card');
    if (!card) return;

    const meta = courseMetaByName.get(normalizeName(name));
    const category = (meta && meta.category) || 'withoutCategory';
    const iconUrl = courseIcons[key];

    const cover = ensureCover(card);
    cover.dataset.culmsKey = key;
    cover.dataset.culmsCategory = category;
    cover.classList.toggle('culms-cover--custom', !!iconUrl);
    cover.classList.toggle('culms-cover--dark-ink', DARK_INK_CATEGORIES.has(category));

    const color = CATEGORY_COLORS[category];
    if (color) {
      cover.style.setProperty('--culms-cover-bg', color);
    } else {
      cover.style.removeProperty('--culms-cover-bg');
    }

    const image = cover.querySelector('.culms-cover__img');
    if (iconUrl) {
      if (image.getAttribute('src') !== iconUrl) image.setAttribute('src', iconUrl);
    } else if (image.hasAttribute('src')) {
      image.removeAttribute('src');
    }

    // Как вписывать картинку в обложку — общая настройка из попапа.
    image.style.setProperty('object-fit', objectFit, 'important');
    image.style.setProperty(
      'transform',
      iconScale === 100 ? 'none' : `scale(${iconScale / 100})`,
      'important'
    );

    // Плейсхолдер повторяет нативную «шапку» карточки: иконка категории + название.
    const sourceIcon = card.querySelector('.category-icon');
    const sourceName = card.querySelector('.category-name');
    const rawIcon = sourceIcon ? sourceIcon.style.getPropertyValue('--t-icon') : '';
    // `--t-icon` приходит как `url(assets/...)` — относительный путь, который на
    // вложенном роуте резолвится не туда, поэтому делаем его абсолютным.
    const absoluteIcon = rawIcon.replace(/url\(\s*(['"]?)assets\//, 'url($1/assets/');

    const coverIcon = cover.querySelector('.culms-cover__cat-icon');
    if (coverIcon.style.getPropertyValue('--culms-cover-icon') !== absoluteIcon) {
      coverIcon.style.setProperty('--culms-cover-icon', absoluteIcon);
    }

    const catText = (sourceName ? sourceName.textContent : CATEGORY_LABELS[category] || '').trim();
    const coverName = cover.querySelector('.culms-cover__cat-name');
    if (coverName.textContent !== catText) coverName.textContent = catText;

    ensureTitle(item, card, displayName || name);
  }

  // --- СПИСОК АКТУАЛЬНЫХ КУРСОВ ---

  function renderActualList() {
    const list = document.querySelector('ul.course-list');
    if (!list) return;

    // Обложки рисуем только по тумблеру: режим редактора сам по себе их больше
    // не включает — кнопки живут на карточке и работают на родном дизайне.
    //
    // Ждём и картинки: старый дизайн должен появляться целиком. Если включить
    // сетку раньше, родное содержимое карточки уже скрыто, а обложки ещё нет —
    // на медленном хранилище (Firefox) на месте курсов будут пустые прямоугольники.
    const showCovers = enabled && iconsLoaded;
    list.classList.toggle(ROOT_CLASS, showCovers);
    list.classList.toggle(DARK_CLASS, showCovers && isDark);
    list.classList.toggle(EDIT_CLASS, isEditorMode);

    // Ключ курса берётся из соответствия id→название, которое приходит из API.
    // Пока его нет, покарточную часть пропускаем — но сетка уже разложена.
    if (!metaLoaded) return;

    list.querySelectorAll(':scope > li.course-list__item').forEach((item) => {
      const nameNode = item.querySelector('cu-course-card .course-name');
      if (!nameNode) return;

      // Название на карточке может быть подменено course_names.js —
      // ключ иконки и архива всегда считаем по оригиналу.
      const shown = nameNode.textContent.trim();
      const name = window.cuLmsCourseNames
        ? window.cuLmsCourseNames.originalFor(nameNode, shown)
        : shown;
      const key = getCourseKey(name);

      // Заархивированный курс прячем независимо от того, включён ли старый дизайн.
      const archived = archivedKeys.has(key);
      item.classList.toggle(HIDDEN_CLASS, archived);

      if (archived) {
        stripItem(item);
        removeCardActions(item);
        return;
      }

      if (showCovers) syncItem(item, name, key, shown);
      else stripItem(item);

      // Редактор доступен и без обложек: переименование и архив от них не зависят.
      if (isEditorMode) ensureCardActions(item, key, name);
      else removeCardActions(item);
    });

    if (isEditorMode) ensureEditorBar();
    else removeEditorBar();
  }

  // --- СВОИ КУРСЫ В НАТИВНОЙ ТАБЛИЦЕ АРХИВА ---

  /**
   * Строку собираем клонированием нативной: так сохраняются `_ngcontent-*`,
   * без которых Angular-стили таблицы к нашей строке не применятся.
   */
  function buildArchivedRow(template, key, entry) {
    const row = template.cloneNode(true);
    row.classList.add(ARCHIVED_ROW_CLASS);
    row.dataset.culmsKey = key;

    const cells = row.querySelectorAll('td');
    const nameHost = cells[0]?.querySelector('.limited-lines-text') || cells[0];
    if (nameHost) nameHost.textContent = entry.name;

    // Категория: у бейджа класс иконки — это код категории, по нему LMS его и красит.
    const category = entry.category || 'withoutCategory';
    const badge = cells[2]?.querySelector('cu-category-badge');
    if (badge) {
      const icon = badge.querySelector('tui-icon');
      if (icon) {
        icon.className = category;
        const url = CATEGORY_ICONS[category];
        if (url) icon.style.setProperty('--t-icon', url);
        else icon.remove();
      }
      const label = badge.querySelector('span');
      if (label) label.textContent = CATEGORY_LABELS[category] || '—';
    }

    // Кнопку кладём в последнюю ячейку, завернув её содержимое во флекс:
    // менять `display` самой `td` нельзя — она перестанет быть ячейкой таблицы
    // и развалит колонки.
    const lastCell = cells[cells.length - 1];
    if (lastCell) {
      const wrap = document.createElement('div');
      wrap.className = 'culms-archived-row__cell';
      while (lastCell.firstChild) wrap.appendChild(lastCell.firstChild);

      const restore = document.createElement('button');
      restore.type = 'button';
      restore.className = 'culms-restore-btn';
      restore.textContent = 'Вернуть';
      restore.title = 'Вернуть курс в список актуальных';
      restore.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void setArchived(key, false);
      });
      wrap.appendChild(restore);
      lastCell.appendChild(wrap);
    }

    // Курс остаётся активным, поэтому открываем его как актуальный.
    if (entry.id != null) {
      row.addEventListener('click', (event) => {
        if (event.target.closest('.culms-restore-btn')) return;
        location.assign(COURSE_URL_PREFIX + entry.id);
      });
    }

    return row;
  }

  function removeArchivedRows() {
    document.querySelectorAll('tr.' + ARCHIVED_ROW_CLASS).forEach((node) => node.remove());
  }

  /**
   * Свои строки показываем только на первой странице таблицы.
   *
   * Они не входят в нативную пагинацию («1–20 из 31» их не считает), поэтому
   * без этой проверки один и тот же курс повторялся бы на каждой странице.
   * Признак первой страницы — отключённая кнопка «Предыдущая страница».
   */
  function isFirstArchivePage() {
    const pagination = document.querySelector('cu-pagination');
    if (!pagination) return true;

    const buttons = Array.from(pagination.querySelectorAll('button'));
    const prev = buttons.find((button) => /Предыдущ/i.test(button.textContent || '')) || buttons[0];
    return !prev || prev.disabled;
  }

  function renderArchivedRows() {
    const tbody = document.querySelector('cu-archive-courses tbody');
    if (!tbody) return;

    if (!isFirstArchivePage()) {
      removeArchivedRows();
      delete tbody.dataset.culmsSignature;
      return;
    }

    // Курсы, спрятанные пользователем, остаются активными, поэтому ищем их
    // в списке published, а не среди архивных у LMS.
    const entries = [];
    archivedKeys.forEach((key) => {
      const entry = courseMetaByKey.get(key);
      if (entry) entries.push([key, entry]);
      else if (key.startsWith('name:')) entries.push([key, { name: key.slice(5), category: null }]);
    });
    entries.sort((a, b) => a[1].name.localeCompare(b[1].name, 'ru'));

    const template = tbody.querySelector('tr:not(.' + ARCHIVED_ROW_CLASS + ')');
    if (!entries.length || !template) {
      removeArchivedRows();
      delete tbody.dataset.culmsSignature;
      return;
    }

    // Angular пересобирает таблицу при пагинации и поиске — тогда наши строки
    // исчезают вместе с подписью, и мы вставляем их заново.
    const signature = entries.map(([key]) => key).join('|');
    const present = tbody.querySelector('tr.' + ARCHIVED_ROW_CLASS);
    if (present && tbody.dataset.culmsSignature === signature) return;

    removeArchivedRows();
    const fragment = document.createDocumentFragment();
    entries.forEach(([key, entry]) => fragment.appendChild(buildArchivedRow(template, key, entry)));
    tbody.prepend(fragment);
    tbody.dataset.culmsSignature = signature;
  }

  // --- ПАНЕЛЬ РЕЖИМА РЕДАКТОРА ---

  function exitEditorMode() {
    const url = new URL(location.href);
    url.searchParams.delete(EDITOR_PARAM);
    url.searchParams.delete(LEGACY_EDITOR_PARAM);
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    currentUrl = location.href;
    isEditorMode = readEditorMode();
    void apply();
  }

  function ensureEditorBar() {
    let bar = document.getElementById(EDITOR_BAR_ID);
    if (bar) return bar;

    bar = document.createElement('div');
    bar.id = EDITOR_BAR_ID;

    const text = document.createElement('span');
    text.className = 'culms-editor-bar__text';
    text.textContent = 'Редактор курсов: ✎ картинка, ✏ название, ⇩ в архив';
    bar.appendChild(text);

    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'culms-editor-bar__btn';
    done.textContent = 'Готово';
    done.addEventListener('click', exitEditorMode);
    bar.appendChild(done);

    document.body.appendChild(bar);
    return bar;
  }

  function removeEditorBar() {
    const bar = document.getElementById(EDITOR_BAR_ID);
    if (bar) bar.remove();
  }

  // --- ОТРИСОВКА ---

  function renderCurrentPage() {
    // Список курсов раскладывается только классами, без данных из API, поэтому
    // его рисуем сразу. Блок архива без соответствия id→курс построить нельзя.
    if (isActualListPage()) renderActualList();
    else if (isArchivedPage() && metaLoaded) renderArchivedRows();
  }

  function cleanup() {
    document.querySelectorAll('.' + COVER_CLASS).forEach((node) => node.remove());
    document.querySelectorAll('.' + TITLE_CLASS).forEach((node) => node.remove());
    document.querySelectorAll('.' + ACTIONS_CLASS).forEach((node) => node.remove());
    document
      .querySelectorAll('li.' + HIDDEN_CLASS)
      .forEach((item) => item.classList.remove(HIDDEN_CLASS));
    document
      .querySelectorAll('ul.course-list.' + ROOT_CLASS)
      .forEach((list) => list.classList.remove(ROOT_CLASS, DARK_CLASS, EDIT_CLASS));
    removeEditorBar();
    removeArchivedRows();
  }

  // --- НАБЛЮДЕНИЕ ЗА СТРАНИЦЕЙ ---

  function startObserver() {
    if (observer) return;

    observer = new MutationObserver(() => {
      // Расширение могло быть перезагружено — тогда браузер убивает контекст.
      try {
        if (typeof browser !== 'undefined' && !(browser.runtime && browser.runtime.id)) {
          observer.disconnect();
          observer = null;
          return;
        }
      } catch (_e) {
        observer.disconnect();
        observer = null;
        return;
      }

      if (location.href !== currentUrl) {
        currentUrl = location.href;
        isEditorMode = readEditorMode();
        if (!isCourseListPage()) cleanup();
      }

      if (hasWorkToDo()) renderCurrentPage();
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  /** Есть ли вообще что делать на текущей странице. */
  function hasWorkToDo() {
    if (isArchivedPage()) return archivedKeys.size > 0;
    if (isActualListPage()) return isActive() || archivedKeys.size > 0;
    return false;
  }

  async function apply() {
    if (!hasWorkToDo()) {
      cleanup();
      return;
    }

    // Классы сетки ставим до сетевого запроса: иначе список успевает мигнуть
    // родной плотной раскладкой (gap 4px), а потом скачком разъезжается.
    renderCurrentPage();

    await loadCourseMeta();
    renderCurrentPage();
  }

  async function init() {
    // Картинки — самый тяжёлый ключ в хранилище (десятки килобайт на курс),
    // поэтому читаем их отдельным запросом и ничего на нём не держим: раскладка,
    // архив и подписи от картинок не зависят и появляются сразу. Раньше всё это
    // ждало один общий `get`, и в Firefox — где `storage.local` ходит в
    // IndexedDB через IPC — ожидание было заметно глазом.
    const iconsPromise = browser.storage.local.get(ICONS_KEY);
    iconsPromise
      .then((data) => {
        // Пользователь мог успеть сохранить картинку раньше, чем приехал
        // запрос, — тогда в памяти лежит более свежее состояние.
        if (iconsLoaded) return;
        courseIcons = data[ICONS_KEY] || {};
        iconsLoaded = true;
        renderCurrentPage();
      })
      .catch((error) => {
        // Иначе обложки не появились бы вовсе: они ждут этого флага.
        log('[course-cards] Не удалось прочитать картинки:', error);
        if (iconsLoaded) return;
        iconsLoaded = true;
        renderCurrentPage();
      });

    const [syncData, localData] = await Promise.all([
      browser.storage.sync.get([SETTING_KEY, 'themeEnabled', FIT_KEY, SCALE_KEY]),
      browser.storage.local.get([ARCHIVE_KEY, META_CACHE_KEY]),
    ]);

    enabled = !!syncData[SETTING_KEY];
    isDark = !!syncData.themeEnabled;
    objectFit = normalizeFit(syncData[FIT_KEY]);
    iconScale = normalizeScale(syncData[SCALE_KEY]);
    archivedKeys = new Set(localData[ARCHIVE_KEY] || []);
    isEditorMode = readEditorMode();

    // Кеш даёт полноценную первую отрисовку без ожидания сети; актуальные
    // данные придут следом и перерисуют список, если что-то изменилось.
    if (applyCourseMeta(localData[META_CACHE_KEY])) metaLoaded = true;

    startObserver();
    await apply();

    // Ужимать старые картинки начинаем, только когда страница уже отрисована и
    // браузеру нечем заняться: это декодирование и перекодирование картинок.
    if (isCourseListPage() && isActive()) {
      await iconsPromise.catch(() => {});
      const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 2000));
      idle(() => void shrinkStoredIcons());
    }
  }

  browser.storage.onChanged.addListener((changes, area) => {
    let dirty = false;

    if (area === 'sync') {
      if (SETTING_KEY in changes) {
        enabled = !!changes[SETTING_KEY].newValue;
        dirty = true;
      }
      if ('themeEnabled' in changes) {
        isDark = !!changes.themeEnabled.newValue;
        dirty = true;
      }
      if (FIT_KEY in changes) {
        objectFit = normalizeFit(changes[FIT_KEY].newValue);
        dirty = true;
      }
      if (SCALE_KEY in changes) {
        iconScale = normalizeScale(changes[SCALE_KEY].newValue);
        dirty = true;
      }
    }
    if (area === 'local') {
      if (ICONS_KEY in changes) {
        courseIcons = changes[ICONS_KEY].newValue || {};
        iconsLoaded = true;
        dirty = true;
      }
      if (ARCHIVE_KEY in changes) {
        archivedKeys = new Set(changes[ARCHIVE_KEY].newValue || []);
        dirty = true;
      }
    }

    if (dirty) void apply();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void init());
  } else {
    void init();
  }
}
