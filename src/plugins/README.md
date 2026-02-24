# Плагины

Каждый плагин — отдельная папка. `background.ts` автоматически подхватывает все плагины через `import.meta.glob('./plugins/*/index.manifest.ts')`.

## Структура плагина

```
src/plugins/my-plugin/
├── index.manifest.ts   # обязательно — описывает плагин
├── my_script.js        # контент-скрипт(ы)
└── my_style.css        # CSS-файлы (опционально)
```

### `index.manifest.ts`

Каждый плагин экспортирует объект, соответствующий интерфейсу [`PluginManifest`](./types.ts):

```typescript
import type { PluginManifest } from '../types';

const manifest = {
  id: 'my-plugin',
  matches: (url: string) => url.includes('/some/path'),
  scripts: ['plugins/my-plugin/my_script.js'],
  cssFiles: ['plugins/my-plugin/my_style.css'],
} satisfies PluginManifest;

export default manifest;
```

| Поле       | Тип                        | Описание                                                           |
| ---------- | -------------------------- | ------------------------------------------------------------------ |
| `id`       | `string`                   | Уникальный идентификатор плагина                                   |
| `matches`  | `(url: string) => boolean` | Функция, определяющая, должен ли плагин запускаться на текущем URL |
| `scripts`  | `string[]`                 | Пути JS-файлов относительно корня расширения для `executeScript`   |
| `cssFiles` | `string[]`                 | Пути CSS-файлов относительно корня расширения для `insertCSS`      |

## Два способа добавить скрипт

### 1. Обычный JS-скрипт (рекомендуется для большинства плагинов)

Укажи путь строкой — Vite скопирует файл как есть, скрипт будет выполнен в глобальном контексте страницы:

```typescript
scripts: ['plugins/my-plugin/my_script.js'],
```

Файл может свободно использовать глобальные переменные из других скриптов (например, `cuLmsLog`, `waitForElement`).

### 2. ES-модуль с импортами (как `dark-theme`)

Если плагин использует `import` (например, `?inline` CSS, `webextension-polyfill`), создай отдельный `index.loader.js` и добавь его через `?script`:

```typescript
import loaderUrl from './index.loader.js?script';

const manifest = {
  id: 'my-plugin',
  matches: ...,
  scripts: [loaderUrl],
} satisfies PluginManifest;
```

В этом случае Vite соберёт `index.loader.js` как изолированный ES-модуль бандл.  
⚠️ Такой скрипт **не видит** глобальные переменные из других скриптов.

## Существующие плагины

| Папка         | URL-паттерн                         | Описание                                               |
| ------------- | ----------------------------------- | ------------------------------------------------------ |
| `_shared`     | `my.centraluniversity.ru/*`         | Базовые утилиты, полифил, виджеты (загружается первым) |
| `dark-theme`  | `my.centraluniversity.ru/*`         | Тёмная тема, включая OLED и Shadow DOM фикс            |
| `login`       | `id.centraluniversity.ru/*`         | Фикс автодополнения email на странице входа            |
| `emoji-swap`  | `my.centraluniversity.ru/*`         | Замена эмодзи на консистентные                         |
| `courses`     | `.../learn/courses` (список курсов) | Фиксы страницы со списком курсов                       |
| `course-view` | `.../learn/courses/view/*`          | Страница курса: автоскролл, друзья, экспорт и др.      |
| `longreads`   | `.../learn/longreads/*`             | Страница задания: веса, переименование, адаптация      |
| `statements`  | `.../learn/statements/*`            | Расширенные ведомости и архив                          |
