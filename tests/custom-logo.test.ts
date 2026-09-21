// Тест своего логотипа: подменяется маска в шапке, тумблер возвращает родной.
import {
  test,
  expect,
  LMS_URL,
  setExtensionStorage,
  getExtensionStorage,
  clearExtensionStorage,
  getExtensionPopupUrl,
} from './helpers/fixtures.js';

const ANY_PAGE = `${LMS_URL}/learn/courses/view/actual/all`;
const LOGO_LINK = 'cu-navigation-link.header__logo-link a';

/** Анимированный gif 8×8 из трёх кадров — им проверяем, что анимация доживает до хранилища. */
const ANIMATED_GIF =
  'R0lGODlhCAAIAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQACgAAACwAAAAACAAIAAAIDwABCBxIsKDBgwgTKkwYEAAh+QQBCgABACwAAAAACAAIAIEAgAAAAAAAAAAAAAAIDwABCBxIsKDBgwgTKkwYEAAh+QQBCgABACwAAAAACAAIAIEAAP8AAAAAAAAAAAAIDwABCBxIsKDBgwgTKkwYEAA7';

/** Розовый прямоугольник 180×32 — достаточно, чтобы отличить от родного логотипа. */
const TEST_LOGO =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 32">' +
      '<rect width="180" height="32" fill="#e91e63"/></svg>'
  ).toString('base64');

/** Стили псевдоэлемента, на котором LMS рисует логотип маской. */
async function logoStyles(page: import('@playwright/test').Page) {
  return page.evaluate((selector) => {
    const style = getComputedStyle(document.querySelector(selector) as Element, '::before');
    return {
      mask: style.maskImage || style.webkitMaskImage,
      background: style.backgroundImage,
      size: style.backgroundSize,
      transform: style.transform,
    };
  }, LOGO_LINK);
}

test.describe('Свой логотип в шапке', () => {
  test.setTimeout(60_000);

  test.afterEach(async ({ context, extensionId }) => {
    await clearExtensionStorage(context, extensionId, 'sync', 'customLogoToggle');
    await clearExtensionStorage(context, extensionId, 'local', 'customLogo');
  });

  test('по тумблеру логотип подменяется своей картинкой', async ({
    page,
    context,
    extensionId,
  }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'customLogoToggle', true);
    await setExtensionStorage(context, extensionId, 'local', 'customLogo', TEST_LOGO);

    await page.goto(ANY_PAGE);
    await page.waitForSelector(LOGO_LINK, { timeout: 15_000 });

    await expect
      .poll(async () => (await logoStyles(page)).background, { timeout: 10_000 })
      .toContain('data:image/svg+xml;base64,');

    // Пока маска на месте, поверх картинки виден закрашенный родной силуэт.
    expect((await logoStyles(page)).mask).toBe('none');
  });

  test('без тумблера остаётся родной логотип', async ({ page, context, extensionId }) => {
    await setExtensionStorage(context, extensionId, 'local', 'customLogo', TEST_LOGO);

    await page.goto(ANY_PAGE);
    await page.waitForSelector(LOGO_LINK, { timeout: 15_000 });
    await page.waitForTimeout(1_500);

    const styles = await logoStyles(page);
    expect(styles.background).toBe('none');
    expect(styles.mask).toContain('cuIconLogo');
  });

  test('режим вставки и масштаб доезжают до логотипа', async ({ page, context, extensionId }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'customLogoToggle', true);
    await setExtensionStorage(context, extensionId, 'local', 'customLogo', TEST_LOGO);

    await page.goto(ANY_PAGE);
    await page.waitForSelector(LOGO_LINK, { timeout: 15_000 });
    await expect
      .poll(async () => (await logoStyles(page)).background, { timeout: 10_000 })
      .toContain('data:image/svg+xml;base64,');

    // По умолчанию картинка вписывается целиком и не масштабируется.
    const initial = await logoStyles(page);
    expect(initial.size).toBe('contain');
    expect(initial.transform).toBe('none');

    await setExtensionStorage(context, extensionId, 'sync', 'logoObjectFit', 'cover');
    await setExtensionStorage(context, extensionId, 'sync', 'logoScale', 200);

    // Настройки применяются по storage.onChanged, без перезагрузки страницы.
    await expect.poll(async () => (await logoStyles(page)).size, { timeout: 10_000 }).toBe('cover');
    expect((await logoStyles(page)).transform).toBe('matrix(2, 0, 0, 2, 0, 0)');

    await clearExtensionStorage(context, extensionId, 'sync', 'logoObjectFit');
    await clearExtensionStorage(context, extensionId, 'sync', 'logoScale');
  });

  test('выбранная в попапе гифка остаётся анимированной', async ({ context, extensionId }) => {
    const popup = await context.newPage();
    await popup.goto(getExtensionPopupUrl(extensionId));
    await popup.waitForSelector('#custom-logo-file', { state: 'attached', timeout: 15_000 });

    // Поле спрятано за кнопкой, но Playwright умеет класть файл прямо в него.
    await popup.setInputFiles('#custom-logo-file', {
      name: 'logo.gif',
      mimeType: 'image/gif',
      buffer: Buffer.from(ANIMATED_GIF, 'base64'),
    });

    // Перекодировка в canvas сменила бы тип на webp и оставила один кадр.
    await expect
      .poll(
        async () =>
          (await getExtensionStorage<string>(context, extensionId, 'local', 'customLogo')) || '',
        { timeout: 10_000 }
      )
      .toBe(`data:image/gif;base64,${ANIMATED_GIF}`);

    await popup.close();
  });

  test('сброс логотипа возвращает родной без перезагрузки', async ({
    page,
    context,
    extensionId,
  }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'customLogoToggle', true);
    await setExtensionStorage(context, extensionId, 'local', 'customLogo', TEST_LOGO);

    await page.goto(ANY_PAGE);
    await page.waitForSelector(LOGO_LINK, { timeout: 15_000 });
    await expect
      .poll(async () => (await logoStyles(page)).background, { timeout: 10_000 })
      .toContain('data:image/svg+xml;base64,');

    await clearExtensionStorage(context, extensionId, 'local', 'customLogo');

    await expect
      .poll(async () => (await logoStyles(page)).mask, { timeout: 10_000 })
      .toContain('cuIconLogo');
  });
});
