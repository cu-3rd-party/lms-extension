# E2E-тесты

Тесты запускаются через [Playwright](https://playwright.dev/) в реальном Chrome с загруженным расширением.

## Первый запуск

### 0. Установи Playwright и Chromium

```bash
bun add -d @playwright/test
bunx playwright install chromium
```

### 1. Собери расширение

```bash
bun run build:chrome
```

### 2. Создай `.env` с кредами LMS

```bash
cp .env.example .env
# заполни LMS_LOGIN и LMS_PASSWORD
```

### 3. Войди в аккаунт (один раз)

```bash
bun run test:login
```

Скрипт откроет браузер, введёт логин и пароль, попросит ввести код 2FA в терминале и сохранит сессионные куки в `tests/helpers/.cookies.json`. Повторять нужно только когда сессия истечёт (обычно раз в несколько дней).

### 4. Запусти тесты

```bash
bun run test
```

## Отдельные тесты

```bash
bun run test dark-theme        # только тесты тёмной темы
bun run test course-archive    # только тесты архивации курсов
```

## Структура

```
tests/
├── helpers/
│   ├── fixtures.ts              # общий контекст браузера + расширения, хелперы
│   ├── .cookies.json            # сессионные куки (в .gitignore)
│   └── .chrome-profile/         # сохранённый профиль Chrome (в .gitignore)
├── course-archive.test.ts       # архивация/разархивация курсов
├── course-card-simplifier.test.ts
├── dark-theme.test.ts           # переключение тёмной темы
├── future-exams.test.ts
└── tasks-fix.test.ts
```

## Как работает авторизация

`bun run test:login` логинится в обычном браузере (без расширения) и сохраняет сессионные куки в `tests/helpers/.cookies.json`. При запуске тестов Playwright поднимает Chrome с расширением из `dist/chrome/` и чистым профилем, затем инжектирует куки через `addCookies` — браузер сразу залогинен без хранения состояния в профиле.

## Написание новых тестов

Импортируй `test`, `expect`, `LMS_URL` и нужные хелперы из `./helpers/fixtures.js`:

```typescript
import { test, expect, LMS_URL, clearExtensionStorage } from './helpers/fixtures.js';

test.afterEach(async ({ context, extensionId }) => {
  // 'local' или 'sync' — зависит от того где расширение хранит данные
  await clearExtensionStorage(context, extensionId, 'local', 'someKey');
});
```

Доступные хелперы:

- `clearExtensionStorage(context, extensionId, area, key)` — удаляет ключ из `chrome.storage`
- `setExtensionStorage(context, extensionId, area, key, value)` — записывает значение в `chrome.storage`

Оба хелпера открывают popup-страницу расширения и вызывают `chrome.storage` оттуда.

> `chrome.storage` недоступен из `page.evaluate()` (контекст страницы). Service worker MV3 ненадёжен — Chrome завершает его в любой момент. Единственный стабильный способ — extension page (popup).
