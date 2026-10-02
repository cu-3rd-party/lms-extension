# Contributing

Спасибо, что хочешь помочь! Это руководство поможет разобраться с устройством проекта и добавить что-то своё.

## Требования

- [Bun](https://bun.sh/) ≥ 1.0
- Node.js ≥ 18 (для совместимости типов)
- Chrome или Firefox для ручного тестирования

## Быстрый старт

```bash
git clone https://github.com/cu-3rd-party/lms-extension.git
cd lms-extension
bun install
```

### Сборка и разработка

| Команда                   | Описание                                           |
| ------------------------- | -------------------------------------------------- |
| `bun run build:chrome`    | Собрать для Chrome → `dist/chrome/`                |
| `bun run build:firefox`   | Собрать для Firefox → `dist/firefox/`              |
| `bun run dev:chrome`      | Режим watch для Chrome (пересборка при изменениях) |
| `bun run dev:firefox`     | Режим watch для Firefox                            |
| `bun run lint`            | Проверить код ESLint'ом                            |
| `bun run lint:fix`        | Автоисправление ESLint                             |
| `bun run format`          | Форматирование через Prettier                      |
| `bun run release:chrome`  | Собрать и упаковать `.zip` для Chrome Web Store    |
| `bun run release:firefox` | Собрать и упаковать `.xpi` для Firefox Add-ons     |

Джоб **Publish Chrome** в workflow **Publish Release** прикрепляет к GitHub Release `lms-extension-chrome.zip` и отправляет его в Chrome Web Store.

Джоб **Publish Firefox** прикрепляет к GitHub Release неподписанный `lms-extension-firefox.xpi` и отправляет версию в AMO через `web-ext sign --approval-timeout 0`. Ревью он не ждёт: оно идёт дольше, чем живёт раннер. Подписанный XPI после одобрения скачивается из кабинета AMO.

Chrome и Firefox публикуются при публикации GitHub Release. Ручной запуск **Publish Release** публикует их, только если указан `tag` уже созданного релиза (`vX.Y.Z`): из тега берётся версия, к этому релизу прикрепляются файлы. Без `tag` ручной запуск собирает только Safari.

### Загрузить расширение в браузер

**Chrome:**

1. `bun run build:chrome`
2. Открой `chrome://extensions`
3. Включи «Режим разработчика» (правый верхний угол)
4. «Загрузить распакованное» → выбери папку `dist/chrome/`

**Firefox:**

1. `bun run build:firefox`
2. Открой `about:debugging#/runtime/this-firefox`
3. «Load Temporary Add-on...» → выбери любой файл внутри `dist/firefox/`

## Структура проекта

```
src/
├── background.ts          # Service worker: роутер навигации, авто-инжекция плагинов
├── grades-export.ts       # Сбор оценок для Excel: выполняется во вкладке LMS, без замыканий
├── popup/                 # UI попапа расширения: вкладки слева, настройки справа
│   ├── popup.html         # разметка вкладок (.tab-panel) и стили
│   ├── popup.js           # логика настроек; кнопки вкладок строит из .tab-panel
│   ├── popup_frame.js     # помечает меню в iframe панели на странице (html.in-frame)
│   ├── popup_loader.js
│   └── popup_dark.css
├── manifests/             # Манифесты расширения
│   ├── manifest.json      # Chrome MV3
│   └── manifest_firefox.json  # Firefox MV3
├── icons/                 # Иконки расширения (SVG, PNG)
├── preload.css            # CSS, вставляемый до загрузки страницы (content_scripts)
├── plugins/               # Все плагины — см. plugins/README.md
│   ├── _shared/           # Базовые утилиты, загружаются на каждой странице
│   └── ...
└── utils/
    └── dom.js             # Общие DOM-утилиты (insertCss, waitForElement)

scripts/
└── pack.js                # Скрипт упаковки для релиза

vite.config.js             # Конфиг сборки (Vite + crxjs)
eslint.config.js           # ESLint flat config
```

## Как добавить новый плагин

Подробная инструкция — в [`src/plugins/README.md`](src/plugins/README.md).

Хочешь сгенерировать плагин с помощью ИИ? Используй готовый промпт из [`src/plugins/AI-GUIDE.md`](src/plugins/AI-GUIDE.md) — скопируй его в ChatGPT/Claude и допиши что нужно реализовать.

Кратко:

1. Создай папку `src/plugins/my-plugin/`
2. Добавь `index.manifest.ts` с `id`, `matches`, `scripts`/`cssFiles`
3. Положи туда JS/CSS файлы плагина
4. Зарегистрируй новые файлы в `src/manifests/manifest.json` → `web_accessible_resources`
5. Собери и проверь в браузере

## Код-стиль

Проект использует ESLint + Prettier. Pre-commit хук автоматически проверяет и форматирует staged-файлы через lint-staged.

Коммиты должны следовать формату [Conventional Commits](https://www.conventionalcommits.org/), например:
`feat: add dark theme`, `fix(popup): correct alignment`, `chore: update deps`. Commit-msg хук проверяет это автоматически.

- JS-файлы в `src/` для браузерного окружения, глобалы `webextensions` доступны
- Файлы в `scripts/` и `vite.config.js` для Node.js окружения
- Постепенный переход на TypeScript: новый код в `.ts`, старые скрипты остаются в `.js`

## Типичные ошибки

**Функция из одного скрипта не видна в другом** — убедись, что оба скрипта подключаются как обычные пути (не через `?script`). В `vite.config.js` должен быть `treeshake: false`.

**Плагин не срабатывает** — проверь, что `matches(url)` возвращает `true` для нужного URL, и что файлы из `scripts` указаны в `web_accessible_resources` манифеста.
