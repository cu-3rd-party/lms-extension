import {
  test,
  expect,
  LMS_URL,
  setExtensionStorage,
  getExtensionStorage,
  clearExtensionStorage,
} from './helpers/fixtures.js';

// Список курсов открывается со вкладкой фильтра в пути: /view/actual/all.
const COURSES_PAGE = `${LMS_URL}/learn/courses/view/actual/all`;
const EDITOR_PAGE = `${COURSES_PAGE}?customCardEditor=true`;
const ARCHIVED_PAGE = `${LMS_URL}/learn/courses/view/archived`;

/** 1×1 PNG — хватает, чтобы проверить, что своя картинка подставляется. */
const TEST_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test.describe('Карточки курсов: дизайн, иконки и архив', () => {
  test.setTimeout(60_000);

  test.afterEach(async ({ context, extensionId }) => {
    await clearExtensionStorage(context, extensionId, 'sync', 'oldCoursesDesignToggle');
    await clearExtensionStorage(context, extensionId, 'local', 'courseIcons');
    await clearExtensionStorage(context, extensionId, 'local', 'archivedCourseIds');
  });

  test('по тумблеру карточки превращаются в обложки с подписью', async ({
    page,
    context,
    extensionId,
  }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'oldCoursesDesignToggle', true);

    await page.goto(COURSES_PAGE);
    await expect(page.locator('.culms-cover').first()).toBeAttached({ timeout: 15_000 });

    const items = await page.locator('ul.course-list > li.course-list__item').count();
    expect(items).toBeGreaterThan(0);

    // Ровно одна обложка и одна подпись на карточку — проверяем идемпотентность.
    await expect(page.locator('.culms-cover')).toHaveCount(items);
    await expect(page.locator('.culms-old-title')).toHaveCount(items);

    const title = await page.locator('.culms-old-title').first().textContent();
    expect(title?.trim().length).toBeGreaterThan(0);
  });

  test('карточка не анимирует размер при смене вкладки фильтра', async ({
    page,
    context,
    extensionId,
  }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'oldCoursesDesignToggle', true);

    await page.goto(COURSES_PAGE);
    await expect(page.locator('.culms-cover').first()).toBeAttached({ timeout: 15_000 });

    // У нативной карточки LMS стоит `transition: 0.3s ease-in-out` (то есть
    // `all`), и смена ширины нашим CSS анимировалась: блок появлялся заметно
    // крупнее и треть секунды ужимался до нужного размера.
    await expect(page.locator('ul.course-list.culms-old-design cu-course-card').first()).toHaveCSS(
      'transition',
      'none'
    );

    // Переключаем вкладку и следим, что ширина карточки не проходит через
    // промежуточные значения.
    const widths = await page.evaluate(async () => {
      const seen = new Set<number>();
      let running = true;
      const sample = () => {
        const card = document.querySelector('ul.course-list cu-course-card');
        if (card) {
          const width = Math.round(card.getBoundingClientRect().width);
          if (width > 0) seen.add(width);
        }
        if (running) requestAnimationFrame(sample);
      };
      sample();

      const tab = Array.from(document.querySelectorAll('button, a')).find(
        (el) => el.textContent?.trim() === 'Обязательные'
      );
      (tab as HTMLElement | undefined)?.click();

      await new Promise((resolve) => setTimeout(resolve, 1200));
      running = false;
      return Array.from(seen);
    });

    expect(widths.length).toBe(1);
  });

  test('без тумблера остаётся родной дизайн LMS', async ({ page }) => {
    await page.goto(COURSES_PAGE);
    await page.waitForSelector('ul.course-list > li.course-list__item', { timeout: 15_000 });
    await page.waitForTimeout(1_500);

    await expect(page.locator('.culms-cover')).toHaveCount(0);
    await expect(page.locator('ul.course-list.culms-old-design')).toHaveCount(0);
  });

  test('сохранённая иконка подставляется на обложку курса', async ({
    page,
    context,
    extensionId,
  }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'oldCoursesDesignToggle', true);

    await page.goto(COURSES_PAGE);
    await expect(page.locator('.culms-cover').first()).toBeAttached({ timeout: 15_000 });

    // Ключ хранилища — id курса из API LMS, его же плагин пишет в data-атрибут.
    const courseKey = await page.locator('.culms-cover').first().getAttribute('data-culms-key');
    expect(courseKey).toBeTruthy();

    await setExtensionStorage(context, extensionId, 'local', 'courseIcons', {
      [courseKey as string]: TEST_ICON,
    });

    const cover = page.locator(`.culms-cover[data-culms-key="${courseKey}"]`);
    await expect(cover).toHaveClass(/culms-cover--custom/, { timeout: 10_000 });
    await expect(cover.locator('.culms-cover__img')).toHaveAttribute('src', TEST_ICON);
    await expect(cover.locator('.culms-cover__placeholder')).toBeHidden();
  });

  test('выключение тумблера убирает всё, что добавил плагин', async ({
    page,
    context,
    extensionId,
  }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'oldCoursesDesignToggle', true);

    await page.goto(COURSES_PAGE);
    await expect(page.locator('.culms-cover').first()).toBeAttached({ timeout: 15_000 });

    await setExtensionStorage(context, extensionId, 'sync', 'oldCoursesDesignToggle', false);

    await expect(page.locator('.culms-cover')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator('.culms-old-title')).toHaveCount(0);
    await expect(page.locator('cu-course-card .card-header').first()).toBeVisible();
  });

  test('клик по карточке по-прежнему открывает курс', async ({ page, context, extensionId }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'oldCoursesDesignToggle', true);

    await page.goto(COURSES_PAGE);
    await expect(page.locator('.culms-cover').first()).toBeAttached({ timeout: 15_000 });

    await page.locator('.culms-old-title').first().click();

    await expect(page).toHaveURL(/\/learn\/courses\/view\/actual\/\d+/, { timeout: 15_000 });
    // На странице курса обложек быть не должно.
    await expect(page.locator('.culms-cover')).toHaveCount(0);
  });

  test('вне режима редактора кнопок на карточке нет', async ({ page, context, extensionId }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'oldCoursesDesignToggle', true);

    await page.goto(COURSES_PAGE);
    await expect(page.locator('.culms-cover').first()).toBeAttached({ timeout: 15_000 });

    await expect(page.locator('.culms-card-actions')).toHaveCount(0);
    await expect(page.locator('#culms-card-editor-bar')).toHaveCount(0);
    await expect(page.locator('ul.course-list.culms-old-design--editing')).toHaveCount(0);
  });

  test('редактор работает и без обложек, на родном дизайне', async ({
    page,
    context,
    extensionId,
  }) => {
    // Тумблер старого дизайна выключен: обложек быть не должно, а кнопки — должны.
    await page.goto(EDITOR_PAGE);
    await page.waitForSelector('ul.course-list > li.course-list__item', { timeout: 15_000 });

    await expect(page.locator('.culms-card-actions').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.culms-cover')).toHaveCount(0);
    await expect(page.locator('cu-course-card .card-header').first()).toBeVisible();

    // Переименование и архив доступны, смена картинки — тоже (применится к обложкам).
    const actions = page.locator('.culms-card-actions').first();
    await expect(actions.locator('[data-culms-action="rename"]')).toBeVisible();
    await expect(actions.locator('[data-culms-action="archive"]')).toBeVisible();
  });

  test('режим редактора включается по ?customCardEditor=true и выключается кнопкой', async ({
    page,
    context,
    extensionId,
  }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'oldCoursesDesignToggle', true);

    await page.goto(EDITOR_PAGE);
    await expect(page.locator('.culms-cover').first()).toBeAttached({ timeout: 15_000 });

    await expect(page.locator('ul.course-list.culms-old-design--editing')).toHaveCount(1);
    await expect(page.locator('#culms-card-editor-bar')).toBeVisible();
    await expect(page.locator('.culms-card-actions').first()).toBeVisible();

    await page.locator('.culms-editor-bar__btn').click();

    await expect(page.locator('#culms-card-editor-bar')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator('.culms-card-actions')).toHaveCount(0);
    // Параметр убирается из URL, но обложки остаются.
    await expect(page).not.toHaveURL(/customCardEditor/);
    await expect(page.locator('.culms-cover').first()).toBeAttached();
  });

  test('настройки вписывания и масштаба применяются к картинке', async ({
    page,
    context,
    extensionId,
  }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'oldCoursesDesignToggle', true);

    await page.goto(COURSES_PAGE);
    await expect(page.locator('.culms-cover').first()).toBeAttached({ timeout: 15_000 });

    const courseKey = await page.locator('.culms-cover').first().getAttribute('data-culms-key');
    await setExtensionStorage(context, extensionId, 'local', 'courseIcons', {
      [courseKey as string]: TEST_ICON,
    });

    const image = page.locator(`.culms-cover[data-culms-key="${courseKey}"] .culms-cover__img`);
    await expect(image).toBeVisible({ timeout: 10_000 });
    await expect(image).toHaveCSS('object-fit', 'cover');

    await setExtensionStorage(context, extensionId, 'sync', 'stickerObjectFit', 'contain');
    await expect(image).toHaveCSS('object-fit', 'contain', { timeout: 10_000 });

    await setExtensionStorage(context, extensionId, 'sync', 'stickerScale', 150);
    await expect
      .poll(() => image.evaluate((el) => (el as HTMLElement).style.transform), { timeout: 10_000 })
      .toBe('scale(1.5)');

    await clearExtensionStorage(context, extensionId, 'sync', 'stickerObjectFit');
    await clearExtensionStorage(context, extensionId, 'sync', 'stickerScale');
  });

  test('кнопка ⇩ убирает курс из списка актуальных', async ({ page, context, extensionId }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'oldCoursesDesignToggle', true);

    await page.goto(EDITOR_PAGE);
    await expect(page.locator('.culms-cover').first()).toBeAttached({ timeout: 15_000 });

    const before = await page.locator('li.course-list__item:visible').count();
    expect(before).toBeGreaterThan(0);

    const actions = page.locator('.culms-card-actions').first();
    const courseKey = await actions.getAttribute('data-culms-key');
    await actions.locator('[data-culms-action="archive"]').click();

    await expect(page.locator('li.course-list__item:visible')).toHaveCount(before - 1, {
      timeout: 10_000,
    });
    await expect(page.locator('li.culms-archived-item')).toHaveCount(1);

    // Скрытая карточка не должна оставлять дырку в сетке: правило старого
    // дизайна задаёт `display: flex` более специфичным селектором, и при
    // недостаточно точном селекторе скрытия карточка оставалась пустой ячейкой.
    const archived = page.locator('li.culms-archived-item').first();
    await expect(archived).toHaveCSS('display', 'none');

    // Первая видимая карточка стоит вплотную к левому краю списка.
    const gapless = await page.evaluate(() => {
      const list = document.querySelector('ul.course-list');
      if (!list) return false;
      const items = Array.from(list.querySelectorAll(':scope > li.course-list__item'));
      const visible = items.filter((item) => getComputedStyle(item).display !== 'none');
      const first = visible[0];
      if (!first) return false;
      return Math.abs(first.getBoundingClientRect().left - list.getBoundingClientRect().left) < 2;
    });
    expect(gapless).toBe(true);
  });

  test('архив продолжает действовать при выключенном старом дизайне', async ({
    page,
    context,
    extensionId,
  }) => {
    await page.goto(COURSES_PAGE);
    await page.waitForSelector('ul.course-list > li.course-list__item', { timeout: 15_000 });

    const total = await page.locator('li.course-list__item').count();
    const key = await page.evaluate(async () => {
      const response = await fetch(
        '/api/micro-lms/courses/student?limit=200&offset=0&state=published',
        { headers: { accept: 'application/json' } }
      );
      const payload = await response.json();
      return String((payload.items || [])[0].id);
    });

    await setExtensionStorage(context, extensionId, 'local', 'archivedCourseIds', [key]);

    // Обложек нет — тумблер выключен, но курс всё равно скрыт.
    await expect(page.locator('li.culms-archived-item')).toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator('li.course-list__item:visible')).toHaveCount(total - 1);
    await expect(page.locator('.culms-cover')).toHaveCount(0);
  });

  test('свой курс попадает в нативную таблицу архива и возвращается кнопкой', async ({
    page,
    context,
    extensionId,
  }) => {
    await page.goto(COURSES_PAGE);
    await page.waitForSelector('ul.course-list > li.course-list__item', { timeout: 15_000 });

    const course = await page.evaluate(async () => {
      const response = await fetch(
        '/api/micro-lms/courses/student?limit=200&offset=0&state=published',
        { headers: { accept: 'application/json' } }
      );
      const payload = await response.json();
      const first = (payload.items || [])[0];
      return { key: String(first.id), name: first.name as string };
    });

    await setExtensionStorage(context, extensionId, 'local', 'archivedCourseIds', [course.key]);

    await page.goto(ARCHIVED_PAGE);
    const row = page.locator(`tr.culms-archived-row[data-culms-key="${course.key}"]`);
    await expect(row).toBeVisible({ timeout: 15_000 });

    // Строка живёт прямо в нативной таблице и не ломает её колонки.
    await expect(page.locator('cu-archive-courses tbody tr.culms-archived-row')).toHaveCount(1);
    await expect(row.locator('td')).toHaveCount(3);
    await expect(row.locator('td').first()).toHaveText(course.name);

    const aligned = await page.evaluate(() => {
      const ours = document.querySelector('tr.culms-archived-row');
      const native = document.querySelector('cu-archive-courses tbody tr:not(.culms-archived-row)');
      if (!ours || !native) return false;
      const left = (row: Element) =>
        Array.from(row.querySelectorAll('td')).map((cell) =>
          Math.round(cell.getBoundingClientRect().left)
        );
      return JSON.stringify(left(ours)) === JSON.stringify(left(native));
    });
    expect(aligned).toBe(true);

    await row.locator('.culms-restore-btn').click();

    await expect(page.locator('tr.culms-archived-row')).toHaveCount(0, { timeout: 10_000 });

    await page.goto(COURSES_PAGE);
    await page.waitForSelector('ul.course-list > li.course-list__item', { timeout: 15_000 });
    await expect(page.locator('li.culms-archived-item')).toHaveCount(0);
  });

  test('картинка из прошлой версии один раз ужимается до 480 px', async ({
    page,
    context,
    extensionId,
  }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'oldCoursesDesignToggle', true);

    await page.goto(COURSES_PAGE);
    await expect(page.locator('.culms-cover').first()).toBeAttached({ timeout: 15_000 });
    const courseKey = await page.locator('.culms-cover').first().getAttribute('data-culms-key');

    // 900 px по длинной стороне — больше лимита, как сохраняла прошлая версия.
    const bigIcon = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 600;
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      for (let i = 0; i < 600; i += 10) {
        ctx.fillStyle = `hsl(${i % 360}, 70%, 50%)`;
        ctx.fillRect(0, i, 900, 10);
      }
      return canvas.toDataURL('image/webp', 0.85);
    });

    await setExtensionStorage(context, extensionId, 'local', 'courseIcons', {
      [courseKey as string]: bigIcon,
    });

    await page.goto(COURSES_PAGE);
    await expect(page.locator('.culms-cover--custom').first()).toBeAttached({ timeout: 15_000 });

    // Пережатие идёт в requestIdleCallback уже после первой отрисовки.
    await expect
      .poll(
        async () => {
          const icons = await getExtensionStorage<Record<string, string>>(
            context,
            extensionId,
            'local',
            'courseIcons'
          );
          return (icons?.[courseKey as string] || '').length;
        },
        { timeout: 20_000 }
      )
      .toBeLessThan(bigIcon.length);

    const icons = await getExtensionStorage<Record<string, string>>(
      context,
      extensionId,
      'local',
      'courseIcons'
    );
    const width = await page.evaluate(
      (url) =>
        new Promise<number>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img.naturalWidth);
          img.onerror = () => reject(new Error('битая картинка'));
          img.src = url;
        }),
      icons?.[courseKey as string] as string
    );
    expect(width).toBe(480);

    // Второй заход ничего не меняет: проход самоограниченный.
    const afterFirst = icons?.[courseKey as string];
    await page.goto(COURSES_PAGE);
    await expect(page.locator('.culms-cover--custom').first()).toBeAttached({ timeout: 15_000 });
    await page.waitForTimeout(3_000);
    const again = await getExtensionStorage<Record<string, string>>(
      context,
      extensionId,
      'local',
      'courseIcons'
    );
    expect(again?.[courseKey as string]).toBe(afterFirst);
  });

  test('при пустом архиве таблица остаётся нетронутой', async ({ page }) => {
    await page.goto(ARCHIVED_PAGE);
    await page.waitForSelector('cu-archive-courses tbody tr', { timeout: 15_000 });
    await page.waitForTimeout(1_500);

    await expect(page.locator('tr.culms-archived-row')).toHaveCount(0);
    await expect(page.locator('.culms-restore-btn')).toHaveCount(0);
  });
});
