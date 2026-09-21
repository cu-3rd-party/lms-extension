// Тест своей картинки на фоне: она ложится на слои-полотна,
// а панели и островки интерфейса остаются нетронутыми.
import {
  test,
  expect,
  LMS_URL,
  setExtensionStorage,
  clearExtensionStorage,
} from './helpers/fixtures.js';

const COURSES_PAGE = `${LMS_URL}/learn/courses/view/actual/all`;

/** Розовый квадрат — достаточно, чтобы отличить от обычной заливки. */
const TEST_BACKGROUND =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8">' +
      '<rect width="8" height="8" fill="#c44569"/></svg>'
  ).toString('base64');

async function backgroundState(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.culms-bg-canvas');
    const card = document.querySelector('cu-course-card');
    const menu = document.querySelector('cu-sidebar .content');
    const has = (el: Element | null) =>
      el ? getComputedStyle(el).backgroundImage.includes('data:image/svg+xml') : null;
    return {
      html: getComputedStyle(document.documentElement).backgroundImage,
      размерФона: getComputedStyle(document.documentElement).backgroundSize,
      полотен: document.querySelectorAll('.culms-bg-canvas').length,
      наПолотне: has(canvas),
      // Полотно должно остаться непрозрачным: прозрачность обнажает
      // спрятанные за ним слои (в узкой раскладке — раскрытое меню).
      полотноЗалито: canvas ? getComputedStyle(canvas).backgroundColor : null,
      наКарточке: has(card),
      наМеню: has(menu),
    };
  });
}

test.describe('Своя картинка на фоне', () => {
  test.setTimeout(60_000);

  test.afterEach(async ({ context, extensionId }) => {
    await clearExtensionStorage(context, extensionId, 'sync', 'customBackgroundToggle');
    await clearExtensionStorage(context, extensionId, 'sync', 'backgroundFit');
    await clearExtensionStorage(context, extensionId, 'sync', 'backgroundVeil');
    await clearExtensionStorage(context, extensionId, 'local', 'customBackground');
  });

  test('картинка ложится на полотно, панели и карточки не трогает', async ({
    page,
    context,
    extensionId,
  }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'customBackgroundToggle', true);
    await setExtensionStorage(context, extensionId, 'sync', 'backgroundVeil', 0);
    await setExtensionStorage(context, extensionId, 'local', 'customBackground', TEST_BACKGROUND);

    await page.goto(COURSES_PAGE);
    await page.waitForSelector('cu-course-card', { timeout: 15_000 });

    await expect
      .poll(async () => (await backgroundState(page)).полотен, { timeout: 10_000 })
      .toBeGreaterThan(0);

    const state = await backgroundState(page);
    expect(state.html).toContain('data:image/svg+xml');
    // Подложка выключена — слой градиента не добавляется.
    expect(state.html).not.toContain('linear-gradient');
    expect(state.размерФона).toBe('cover');
    expect(state.наПолотне).toBe(true);
    expect(state.полотноЗалито).not.toBe('rgba(0, 0, 0, 0)');
    // Островки и меню остаются читаемыми.
    expect(state.наКарточке).toBe(false);
    expect(state.наМеню).toBe(false);
  });

  test('затемнение и режим вставки доезжают без перезагрузки', async ({
    page,
    context,
    extensionId,
  }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'customBackgroundToggle', true);
    await setExtensionStorage(context, extensionId, 'local', 'customBackground', TEST_BACKGROUND);

    await page.goto(COURSES_PAGE);
    await page.waitForSelector('cu-course-card', { timeout: 15_000 });
    await expect
      .poll(async () => (await backgroundState(page)).полотен, { timeout: 10_000 })
      .toBeGreaterThan(0);

    await setExtensionStorage(context, extensionId, 'sync', 'backgroundFit', 'tile');
    await setExtensionStorage(context, extensionId, 'sync', 'backgroundVeil', 40);

    await expect
      .poll(async () => (await backgroundState(page)).размерФона, { timeout: 10_000 })
      .toContain('auto');
    // Подложка — отдельный слой градиента поверх картинки, цветом темы.
    expect((await backgroundState(page)).html).toContain('linear-gradient');
  });

  test('без тумблера фон остаётся обычным', async ({ page, context, extensionId }) => {
    await setExtensionStorage(context, extensionId, 'local', 'customBackground', TEST_BACKGROUND);

    await page.goto(COURSES_PAGE);
    await page.waitForSelector('cu-course-card', { timeout: 15_000 });
    await page.waitForTimeout(1_500);

    const state = await backgroundState(page);
    expect(state.html).toBe('none');
    expect(state.полотен).toBe(0);
  });
});
