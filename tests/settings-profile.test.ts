// Тест профиля настроек: что выгружается, что отвергается при загрузке.
// Реестр живёт в попапе, поэтому и гоняем его в контексте попапа.
import {
  test,
  expect,
  setExtensionStorage,
  getExtensionStorage,
  clearExtensionStorage,
  getExtensionPopupUrl,
} from './helpers/fixtures.js';

const FORMAT = 'cu-lms-extension/profile';

async function openPopup(context: import('@playwright/test').BrowserContext, extensionId: string) {
  const page = await context.newPage();
  await page.goto(getExtensionPopupUrl(extensionId));
  await page.waitForFunction(() => !!(window as any).cuLmsSettings, undefined, {
    timeout: 15_000,
  });
  return page;
}

test.describe('Профиль настроек', () => {
  test.setTimeout(60_000);

  test.afterEach(async ({ context, extensionId }) => {
    await clearExtensionStorage(context, extensionId, 'sync', 'stickerScale');
    await clearExtensionStorage(context, extensionId, 'sync', 'logoScale');
    await clearExtensionStorage(context, extensionId, 'sync', 'themeEnabled');
  });

  test('выгрузка не выносит токены и кеши', async ({ context, extensionId }) => {
    // Кладём и настройку, и «секрет» рядом.
    await setExtensionStorage(context, extensionId, 'sync', 'themeEnabled', true);
    await setExtensionStorage(context, extensionId, 'local', 'akh_token', 'СЕКРЕТ');
    await setExtensionStorage(context, extensionId, 'local', 'lmsOrigin', 'https://my.cu.ru');

    const page = await openPopup(context, extensionId);
    const profiles = await page.evaluate(async () => {
      const registry = (window as any).cuLmsSettings;
      return {
        settings: await registry.collect('settings'),
        visual: await registry.collect('visual'),
        full: await registry.collect('full'),
      };
    });

    for (const profile of Object.values(profiles) as any[]) {
      expect(profile.format).toBe(FORMAT);
      expect(profile.version).toBe(1);
      // Ни в одном наборе не должно быть приватных ключей.
      expect(Object.keys(profile.values)).not.toContain('akh_token');
      expect(Object.keys(profile.values)).not.toContain('lmsOrigin');
      expect(Object.keys(profile.values)).not.toContain('courseMetaCache');
    }

    // Набор «настройки» не тащит картинки, «визуал» — не тащит функции.
    expect(Object.keys((profiles as any).settings.values)).not.toContain('customLogo');
    expect(Object.keys((profiles as any).visual.values)).not.toContain('futureExamsDisplayFormat');

    await page.close();
    await clearExtensionStorage(context, extensionId, 'local', 'akh_token');
    await clearExtensionStorage(context, extensionId, 'local', 'lmsOrigin');
  });

  test('вкладка друзей включена по умолчанию, и галочка это показывает', async ({
    context,
    extensionId,
  }) => {
    // Свежая установка: ключа в хранилище нет вовсе.
    await clearExtensionStorage(context, extensionId, 'sync', 'friendsEnabled');

    const page = await openPopup(context, extensionId);
    const state = await page.evaluate(() => ({
      галка: (document.getElementById('friends-toggle') as HTMLInputElement).checked,
      изРеестра: (window as any).cuLmsSettings.defaultFor('friendsEnabled'),
    }));

    // Плагины считают вкладку включённой, пока её явно не выключили
    // (`data.friendsEnabled !== false`), и галочка обязана говорить то же самое.
    expect(state.изРеестра).toBe(true);
    expect(state.галка).toBe(true);

    await page.close();
  });

  test('загрузка отвергает мусор и не трогает приватное', async ({ context, extensionId }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'stickerScale', 150);
    await setExtensionStorage(context, extensionId, 'local', 'akh_token', 'СЕКРЕТ');

    const page = await openPopup(context, extensionId);
    const result = await page.evaluate(async (format) => {
      const registry = (window as any).cuLmsSettings;
      const dirty = {
        format,
        version: 1,
        kind: 'settings',
        values: {
          themeEnabled: true, // норм
          logoScale: 125, // норм
          stickerScale: 9000, // вне диапазона
          backgroundFit: 'нет-такого', // не из списка
          oledEnabled: 'да', // не boolean
          akh_token: 'УКРАЛ', // приватное
          ключИзБудущего: 1, // неизвестное
        },
      };
      return registry.apply(JSON.stringify(dirty));
    }, FORMAT);

    expect(result.ok).toBe(true);
    expect(result.applied.sort()).toEqual(['logoScale', 'themeEnabled']);
    expect(result.rejected.map((r: { key: string }) => r.key).sort()).toEqual(
      ['akh_token', 'backgroundFit', 'oledEnabled', 'stickerScale', 'ключИзБудущего'].sort()
    );

    // Кривое значение не перезаписало настоящее, токен на месте.
    expect(await getExtensionStorage(context, extensionId, 'sync', 'stickerScale')).toBe(150);
    expect(await getExtensionStorage(context, extensionId, 'local', 'akh_token')).toBe('СЕКРЕТ');

    await page.close();
    await clearExtensionStorage(context, extensionId, 'local', 'akh_token');
  });

  test('чужой формат и версия из будущего не принимаются', async ({ context, extensionId }) => {
    const page = await openPopup(context, extensionId);
    const checks = await page.evaluate((format) => {
      const registry = (window as any).cuLmsSettings;
      return {
        чужой: registry.inspect(JSON.stringify({ format: 'other', version: 1, values: {} })),
        будущее: registry.inspect(JSON.stringify({ format, version: 99, values: {} })),
        неJson: registry.inspect('просто текст'),
      };
    }, FORMAT);

    expect(checks.чужой.ok).toBe(false);
    expect(checks.будущее.ok).toBe(false);
    expect(checks.неJson.ok).toBe(false);

    await page.close();
  });

  test('выгрузка и загрузка возвращают то же значение', async ({ context, extensionId }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'logoScale', 200);

    const page = await openPopup(context, extensionId);
    const roundTrip = await page.evaluate(async () => {
      const registry = (window as any).cuLmsSettings;
      const profile = await registry.collect('settings');
      const text = JSON.stringify(profile);
      // Портим текущее значение и восстанавливаем его из файла.
      await (window as any).browser.storage.sync.set({ logoScale: 50 });
      const result = await registry.apply(text);
      return { applied: result.applied.includes('logoScale') };
    });

    expect(roundTrip.applied).toBe(true);
    expect(await getExtensionStorage(context, extensionId, 'sync', 'logoScale')).toBe(200);

    await page.close();
  });
});
