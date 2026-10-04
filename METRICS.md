# Анонимная статистика

Расширение отправляет в [Яндекс Метрику](https://metrika.yandex.ru/) (счётчик `113341269`, «cu lms ext») анонимную статистику: сколько людей им пользуется, в каких браузерах и какими функциями. Код — [src/metrics.ts](src/metrics.ts) (отправка и согласие) и [src/metrics-hit.ts](src/metrics-hit.ts) (формат запроса, списки целей и функций).

## Что уходит

**Раз в сутки — снимок.** Просмотр страницы `https://ext.cu3rd.ru/daily` с параметрами визита:

```json
{
  "version": "1.9.0",
  "build": "chrome",
  "features": { "themeEnabled": "on", "friendsEnabled": "on", "oledEnabled": "off", "…": "…" }
}
```

- `build` — сборка расширения: `chrome`, `firefox` или `safari`. Сам браузер (Chrome, Яндекс Браузер, Edge, Opera…) и ОС Метрика определяет по User-Agent.
- `features` — все тумблеры функций из [реестра настроек](src/plugins/_shared/settings_registry.js) (группы «Оформление», «Своя тема», «Функции», «Интеграции»). Список в `FEATURE_TOGGLES`; совпадение с реестром проверяет `tests/source/metrics.test.ts`.

Снимок отправляется на первой странице LMS за день (по местному времени). Адрес `ext.cu3rd.ru` условный: сайта там нет, путь нужен Метрике.

**Цели — на действия.** Включённая функция ещё не значит, что ею пользуются, поэтому у заметных действий своя цель:

| Цель                      | Когда                                                    | Где отправляется                         |
| ------------------------- | -------------------------------------------------------- | ---------------------------------------- |
| `install`                 | расширение установлено                                   | `background.ts`, `onInstalled`           |
| `update`                  | расширение обновилось (параметр `from` — прошлая версия) | `background.ts`, `onInstalled`           |
| `grades_export`           | «Скачать Excel с оценками»                               | `background.ts`, `GRADES_EXPORT_EXECUTE` |
| `grades_export_archived`  | то же по архивным курсам                                 | `background.ts`, `GRADES_EXPORT_EXECUTE` |
| `pdf_viewer_open`         | открыт тёмный просмотрщик PDF                            | `background.ts`, `OPEN_PDF_VIEWER`       |
| `theme_editor_open`       | открыт редактор тем                                      | `background.ts`, `OPEN_THEME_EDITOR`     |
| `swap_order_create`       | создана заявка на обмен пары                             | `background.ts`, `SWAP_API`              |
| `swap_order_cancel`       | заявка на обмен отменена                                 | `background.ts`, `SWAP_API`              |
| `friends_search`          | поиск человека во вкладке «Друзья»                       | `background.ts`, `SEARCH_CONTACTS`       |
| `friends_schedule`        | открыто расписание друга                                 | `background.ts`, `GET_WEEKLY_SCHEDULE`   |
| `gradebook_open`          | открыта вкладка «Сводная таблица» в ведомостях           | `statements/gradebook.js`                |
| `attendance_summary_open` | открыта вкладка «Сводная» в посещаемости                 | `attendance/attendance_summary.js`       |
| `course_export`           | выгрузка курса (ZIP или PDF)                             | `course-view/course_exporter.js`         |
| `settings_export`         | настройки сохранены в файл                               | `popup.js`                               |
| `settings_import`         | настройки загружены из файла                             | `popup.js`                               |
| `settings_reset`          | «Сбросить все настройки»                                 | `popup.js`                               |
| `workshop_open`           | открыта 3rd-theme workshop                               | `background.ts`, `OPEN_WORKSHOP`         |
| `workshop_theme_install`  | тему из мастерской оставили после примерки (установка)   | `workshop-background.ts`, `endTryOn`     |
| `file_download`           | «Скачать» у файла в лонгриде                             | `background.ts`, `DOWNLOAD_URL`          |

Каждую цель нужно один раз завести в интерфейсе Метрики: «Цели» → «Добавить цель» → «Целевое событие • ex JS-событие», идентификатор цели — **«Совпадает»** с идентификатором из таблицы. По умолчанию там стоит «Содержит» — с ним `grades_export` засчитывалась бы и на `grades_export_archived`. Без цели запросы приходят, но в отчётах её не видно; засчитывается она только с момента создания.

**Чего не уходит.** Ничего из LMS: почты, имени, id студента, названий курсов, адресов страниц. Cookie не передаются.

## Как устроено

- **Без `tag.js`.** Manifest V3 запрещает исполнять скрипты с чужих серверов, Chrome Web Store за такое отклоняет расширение. Поэтому запросы собираются вручную в том же формате, что шлёт `tag.js`; формат описан в [конфиге Метрики для AMP](https://github.com/ampproject/amphtml/blob/main/extensions/amp-analytics/0.1/vendors/metrika.json). Формат официально не документирован — если Метрика его поменяет, данные перестанут засчитываться.
- **Без новых разрешений.** Запрос уходит из фона с `mode: 'no-cors'`: ответ не нужен, а без `mc.yandex.ru` в `host_permissions` Chrome не отключает расширение при обновлении до подтверждения нового разрешения.
- **Пользователь** — анонимный id установки `metricsClientId` в формате `_ym_uid` (поле `u` в `browser-info`). Cookie Метрики у запросов из фона не работают. Id переживает сброс настроек, иначе после сброса человек посчитается новым.
- **Страницы LMS** шлют цель через `window.cuLmsTrack('цель')` (`_shared/debug_utils.js`), попап — сообщением `METRICS_GOAL`. Background принимает только цели из списка `GOALS`.

## Отключение

- Попап → «Настройки» → «Анонимная статистика». По умолчанию включено (`metricsEnabled` в `storage.sync`, нет ключа — включено). Выключатель переживает сброс настроек и не входит в файл настроек.
- **Firefox 140+**: у браузера своё согласие на сбор данных. В манифесте объявлено необязательное `technicalAndInteraction` — Firefox показывает его галочкой при установке, снять можно в `about:addons` → расширение → «Разрешения и данные». Без него ничего не отправляется; включение в попапе просит это разрешение.

## Добавить цель

1. Дописать идентификатор в `GOALS` ([src/metrics-hit.ts](src/metrics-hit.ts)) — `a-z` и `_`.
2. Вызвать: в background — `trackGoal('цель')`, на странице LMS — `window.cuLmsTrack?.('цель')`, в попапе — `trackGoal('цель')`.
3. Добавить строку в таблицу выше и завести цель в Метрике.

`tests/source/metrics.test.ts` проверяет, что цели, которые шлют background, мастерская, попап, ведомости и выгрузка курса, есть в списке.

## Тесты

- `bun test tests/source/metrics.test.ts` — формат запроса, снимок, список целей и функций.
- `bun run test metrics` — собранное расширение: снимок раз в сутки, цели, выключатель. `fetch` в service worker подменён, наружу ничего не идёт.
- Хелпер e2e-тестов (`tests/helpers/extension.ts`) закрывает `mc.yandex.ru` для всех тестов: иначе каждый прогон отправлял бы в счётчик `install` и снимок.
