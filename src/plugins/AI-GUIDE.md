# Промпт для ИИ: новый плагин lms-extension

> Скопируй всё ниже в ChatGPT/Claude, допиши в конце что нужно сделать.

---

Ты помогаешь писать плагин для браузерного расширения **lms-extension** (LMS ЦУ, `my.centraluniversity.ru`, MV3).

## Структура плагина

```
src/plugins/my-plugin/
├── index.manifest.ts   # точка входа
├── my_script.js
└── my_style.css        # опционально
```

**`index.manifest.ts`:**

```typescript
import type { PluginManifest } from '../types';

const manifest = {
  id: 'myPlugin',
  matches: (url: string) => url.includes('/some/path'),
  scripts: ['plugins/my-plugin/my_script.js'],
  cssFiles: ['plugins/my-plugin/my_style.css'], // опционально
} satisfies PluginManifest;

export default manifest;
```

**URL-паттерны для `matches`:**

| Где            | matches                                                     |
| -------------- | ----------------------------------------------------------- |
| Весь LMS       | `url.startsWith('https://my.centraluniversity.ru/')`        |
| Список курсов  | `url.includes('/learn/courses') && !url.includes('/view/')` |
| Страница курса | `url.includes('/learn/courses/view/')`                      |
| Задания        | `url.includes('/longreads/')`                               |
| Ведомости      | `url.includes('/learn/statements/')`                        |

## JS-скрипт

Скрипты выполняются в глобальном контексте страницы. Гвардия от двойного запуска обязательна (LMS — SPA):

```javascript
if (typeof window.__myPluginInitialized === 'undefined') {
  window.__myPluginInitialized = true;

  async function init() {
    const el = await waitForElement('.target', { timeout: 5000 });
    if (!el) return;
    // делаем что нужно
  }

  init();
}
```

**Доступные глобалы** (объявлены в `_shared`, доступны в обычных JS-скриптах):

- `window.cuLmsLog(...args)` — логирование в DEBUG-режиме
- `waitForElement(selector, { timeout })` — ждёт появления элемента, возвращает Promise
- `browser.*` — WebExtension API (полифил для Chrome и Firefox)

## Важно

- Используй префикс `culms-` для id элементов и атрибутов
- Не использовать `eval`, `innerHTML` с пользовательскими данными
- После генерации: добавь файлы плагина в `manifest.config.js` → `web_accessible_resources[0].resources`

---

## Задача

<!-- Опиши здесь что должен делать плагин -->

Напиши плагин для lms-extension со следующей функциональностью:

<!-- Опиши сюда что должен делать плагин. Например: -->
<!-- - На странице /learn/courses/view/* добавить кнопку "Экспорт" рядом с заголовком курса -->
<!-- - При клике скачивать список заданий в CSV -->
