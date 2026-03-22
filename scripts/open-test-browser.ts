import {
  ISSUE_185_ACTIVITY_URL,
  launchAuthenticatedExtensionContext,
  resolveExtensionId,
  setExtensionStorage,
} from '../tests/helpers/extension.js';

const TARGET_URL = process.env.TEST_BROWSER_URL || ISSUE_185_ACTIVITY_URL;
const WAIT_FOR_STYLE_ID = 'culms-dark-theme-style-base';

const launch = await launchAuthenticatedExtensionContext();
const { context } = launch;

let cleanedUp = false;

async function cleanup(exitCode = 0) {
  if (cleanedUp) {
    return;
  }

  cleanedUp = true;
  await launch.cleanup();
  process.exit(exitCode);
}

process.on('SIGINT', () => {
  void cleanup(0);
});

process.on('SIGTERM', () => {
  void cleanup(0);
});

try {
  const extensionId = await resolveExtensionId(context);

  await setExtensionStorage(context, extensionId, 'sync', 'themeEnabled', true);
  await setExtensionStorage(context, extensionId, 'sync', 'advancedStatementsEnabled', true);
  await setExtensionStorage(context, extensionId, 'sync', 'endOfCourseCalcEnabled', true);

  const page = await context.newPage();
  await page.goto(TARGET_URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    (styleId) => !!document.getElementById(styleId),
    WAIT_FOR_STYLE_ID,
    { timeout: 15_000 }
  );

  console.log(`Тестовый браузер готов: ${TARGET_URL}`);
  console.log('Расширение загружено, тема включена, можно проверять страницу вручную.');

  context.on('close', () => {
    if (!cleanedUp) {
      cleanedUp = true;
    }
  });

  await new Promise<void>((resolve) => {
    context.once('close', () => resolve());
  });
  await launch.cleanup();
} catch (error) {
  console.error(error);
  await cleanup(1);
}
