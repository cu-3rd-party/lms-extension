import { chromium, type BrowserContext } from 'playwright';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const LMS_URL = 'https://my.centraluniversity.ru';
export const ISSUE_185_ACTIVITY_URL = `${LMS_URL}/learn/reports/student-performance/actual/889/activity`;

const COOKIES_FILES = [
  resolve(__dirname, '../.cookies.json'),
  resolve(__dirname, './.cookies.json'),
];
const EXTENSION_PATH = resolve(__dirname, '../../dist/chrome');
const EXTENSION_PROFILE_PREFIX = 'culms-playwright-';
const EXTENSION_SERVICE_WORKER_TIMEOUT_MS = 20_000;
const EXTENSION_POPUP_OPEN_ATTEMPTS = 3;
const EXTENSION_POPUP_RETRY_DELAY_MS = 500;

type StorageArea = 'local' | 'sync';

export function getCookiesFile(): string {
  const cookiesFile = COOKIES_FILES.find((file) => existsSync(file));
  if (cookiesFile) {
    return cookiesFile;
  }

  throw new Error(
    `Куки не найдены. Ожидался один из файлов: ${COOKIES_FILES.join(', ')}. Сохрани сессию: bun run test:login`
  );
}

export function getExtensionPopupUrl(extensionId: string): string {
  const normalizedId = extensionId.trim();
  if (!normalizedId) {
    throw new Error('Extension service worker is not available; extension id is missing');
  }

  return `chrome-extension://${normalizedId}/popup/popup.html`;
}

export async function resolveExtensionId(context: BrowserContext): Promise<string> {
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    try {
      serviceWorker = await context.waitForEvent('serviceworker', {
        timeout: EXTENSION_SERVICE_WORKER_TIMEOUT_MS,
      });
    } catch (error) {
      throw new Error(
        'Extension service worker is not available; Chrome did not load the extension',
        {
          cause: error,
        }
      );
    }
  }

  return new URL(serviceWorker.url()).hostname;
}

export async function launchAuthenticatedExtensionContext() {
  if (!existsSync(EXTENSION_PATH)) {
    throw new Error(
      `Сборка расширения не найдена: ${EXTENSION_PATH}. Сначала выполни bun run build:chrome`
    );
  }

  const cookies = JSON.parse(readFileSync(getCookiesFile(), 'utf-8'));
  const profileDir = mkdtempSync(join(tmpdir(), EXTENSION_PROFILE_PREFIX));
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  });

  try {
    await context.addCookies(cookies);
  } catch (error) {
    await context.close();
    rmSync(profileDir, { recursive: true, force: true });
    throw error;
  }

  return {
    context,
    profileDir,
    async cleanup() {
      await context.close().catch(() => {});
      rmSync(profileDir, { recursive: true, force: true });
    },
  };
}

async function openExtensionPopup(context: BrowserContext, extensionId: string) {
  const popupUrl = getExtensionPopupUrl(extensionId);
  let lastError: unknown;

  for (let attempt = 0; attempt < EXTENSION_POPUP_OPEN_ATTEMPTS; attempt += 1) {
    const page = await context.newPage();

    try {
      await page.goto(popupUrl, { waitUntil: 'domcontentloaded' });
      return page;
    } catch (error) {
      lastError = error;
      await page.close();

      if (attempt < EXTENSION_POPUP_OPEN_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, EXTENSION_POPUP_RETRY_DELAY_MS));
      }
    }
  }

  throw lastError ?? new Error(`Failed to open extension popup: ${popupUrl}`);
}

export async function setExtensionStorage(
  context: BrowserContext,
  extensionId: string,
  area: StorageArea,
  key: string,
  value: unknown
): Promise<void> {
  const page = await openExtensionPopup(context, extensionId);
  await page.evaluate(
    ({ area, key, value }) =>
      area === 'local'
        ? chrome.storage.local.set({ [key]: value })
        : chrome.storage.sync.set({ [key]: value }),
    { area, key, value }
  );
  await page.close();
}

export async function clearExtensionStorage(
  context: BrowserContext,
  extensionId: string,
  area: StorageArea,
  key: string
): Promise<void> {
  const page = await openExtensionPopup(context, extensionId);
  await page.evaluate(
    ({ area, key }) =>
      area === 'local' ? chrome.storage.local.remove(key) : chrome.storage.sync.remove(key),
    { area, key }
  );
  await page.close();
}

export async function clearAllExtensionStorage(
  context: BrowserContext,
  extensionId: string
): Promise<void> {
  const page = await openExtensionPopup(context, extensionId);
  await page.evaluate(async () => {
    await chrome.storage.local.clear();
    await chrome.storage.sync.clear();
  });
  await page.close();
}
