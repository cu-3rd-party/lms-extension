# Safari: сборка и обновления

## Подготовка Xcode

Настройки проекта выполняются вручную в Xcode. Основной target — `CU LMS Enhancer`, target расширения — `CU LMS Enhancer Extension`.

1. Добавь пакет `https://github.com/sparkle-project/Sparkle` версии 2.x к **основному target**. Код использует `SPUStandardUpdaterController`; в target расширения Sparkle не нужен.
2. В основном target → Build Settings → **Code Signing Entitlements** для **Debug и Release** укажи `CU LMS Enhancer/CU LMS Enhancer.entitlements`. Файл уже находится в репозитории; он содержит sandbox, исходящие соединения и разрешения для установщика Sparkle.
3. В `safari/CU LMS Enhancer/CU LMS Enhancer/Info.plist` добавь:

| Ключ                               | Тип     | Значение                                                                             |
| ---------------------------------- | ------- | ------------------------------------------------------------------------------------ |
| `SUFeedURL`                        | String  | `https://github.com/cu-3rd-party/lms-extension/releases/latest/download/appcast.xml` |
| `SUPublicEDKey`                    | String  | Публичный ключ, выданный `generate_keys`                                             |
| `SUEnableInstallerLauncherService` | Boolean | `YES`                                                                                |

Исходящие соединения уже разрешены, поэтому `SUEnableDownloaderService` включать не нужно. `SUEnableAutomaticChecks` можно оставить отсутствующим: Sparkle предложит пользователю включить автоматические проверки. Без запущенного приложения они не выполняются.

Ключи добавляются в **Info.plist приложения**, не расширения. Сохрани bundle identifiers и имя приложения между релизами. Документация Sparkle: [интеграция](https://sparkle-project.org/documentation/), [sandbox](https://sparkle-project.org/documentation/sandboxing/).

## Ключ подписи обновлений

В Xcode открой пакет Sparkle через **Show in Finder**. Утилиты находятся в `SourcePackages/artifacts/sparkle/Sparkle/bin/` внутри DerivedData; после Fastlane-сборки — в `build/SourcePackages/artifacts/sparkle/Sparkle/bin/`.

Из каталога `bin` выполни:

```sh
./generate_keys
./generate_keys -x /tmp/sparkle-private-key
```

Первая команда создаёт ключ в Keychain и выводит **публичный** ключ для `SUPublicEDKey`. Повторный запуск показывает существующий ключ. Вторая экспортирует **приватный** ключ. Содержимое экспортированного файла добавь в repository secrets как **`SPARKLE_PRIVATE_KEY`**. Это текст из файла, без кавычек и дополнительного base64-кодирования. После переноса удали экспортированный файл и сохрани резервную копию ключа в безопасном месте. Приватный ключ не коммить.

Оба ключа должны происходить из одной пары: используй `generate_keys -p` и `generate_keys -x` из одного Keychain и с одинаковым `--account`, если он задан. Не создавай новую пару для каждого релиза.

Developer ID подписывает приложение, EdDSA-ключ Sparkle подписывает DMG для обновления. Оба нужны; один другой не заменяет.

## Локальная сборка

Требования: Xcode и Command Line Tools, Bun, Ruby/Bundler, сертификат `Developer ID Application` с private key в Keychain, Apple ID, app-specific password и Team ID.

В корне проекта создай `.env`:

```env
FASTLANE_USER=apple-id@example.com
FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=W88579NAWQ
```

```sh
bun install --frozen-lockfile
bundle install
# Выбери каталог вне проекта для результатов локальной сборки.
export SAFARI_RELEASE_DIR="$HOME/Downloads/lms-safari-release"
bundle exec fastlane mac release
```

Lane `release`:

1. Берёт версию из `SAFARI_RELEASE_TAG` либо `package.json` и синхронизирует web-часть с ней.
2. Собирает web-часть через Bun, архивирует и экспортирует `.app` через `gym` с Developer ID.
3. Передаёт `MARKETING_VERSION` и `CURRENT_PROJECT_VERSION` через аргументы `xcodebuild` **для обоих targets**, без изменения `project.pbxproj`.
4. Сохраняет SwiftPM-зависимости в `build/SourcePackages`, создаёт и подписывает DMG через `bunx create-dmg`. CI сохраняет Node.js для совместимости нативных зависимостей упаковщика; установка пакетов выполняется через Bun.
5. Переименовывает DMG в `lms-extension-safari.dmg`, выполняет notarization и staple.

Результат: `$SAFARI_RELEASE_DIR/lms-extension-safari.dmg`.

Fastlane требует явно заданный `SAFARI_RELEASE_DIR` для lanes `release` и `appcast`. В обоих Safari workflows он равен `${{ runner.temp }}/safari-release`: `.app`, DMG и appcast хранятся в каталоге текущей CI-джобы до загрузки в GitHub Release и Actions artifacts. Папка `build/release` больше не создаётся. Для локальной сборки выбери собственный каталог; автоматического переноса в системный временный каталог нет.

Версия должна иметь вид `2.6.6` либо тег `v2.6.6`; название GitHub Release не используется. Ограничения `CFBundleVersion`: major 1–9999, minor и patch 0–99, без ведущих нулей. Для каждого обновления увеличивай версию: повторная сборка с тем же тегом не будет предлагаться как новая версия. Prerelease-теги не поддерживаются этой схемой.

## Подписанный appcast

После успешной notarization:

```sh
export SAFARI_RELEASE_TAG=v2.6.6
export GITHUB_REPOSITORY=cu-3rd-party/lms-extension
# SPARKLE_PRIVATE_KEY должен быть задан в окружении безопасным способом.
bundle exec fastlane mac appcast
```

Lane `appcast` использует тот же `SAFARI_RELEASE_DIR`, что и lane `release`. Сначала он проверяет формат приватного ключа и его соответствие `SUPublicEDKey` в **экспортированном** `$SAFARI_RELEASE_DIR/CU-LMS-Enhancer.app/Contents/Info.plist`, включая бинарные plist. Поддерживаются оба формата экспорта Sparkle: 32-байтный seed и прежний 96-байтный ключ. Для seed публичный ключ вычисляется через Ruby OpenSSL; для старого формата берётся из экспортированной пары.

Затем lane запускает **утилиту Sparkle из зависимостей собранного приложения**, передавая приватный ключ через stdin. `fastlane/safari_release.rb` изолирует один DMG во временной папке и проверяет XML: версия, ссылка на конкретный тег, размер файла и наличие EdDSA-подписи. Неподписанный appcast не проходит проверку. Sparkle может завершиться с кодом 0, но пропустить подпись при несовпадении ключей; его предупреждение о несовпадении `SUPublicEDKey` внутри DMG превращается в отдельную ошибку. Произвольный вывод инструмента и значения ключей не печатаются.

Для проверки пары до сборки задай `SPARKLE_PRIVATE_KEY` безопасным способом и выполни `bundle exec fastlane mac check_signing_key`. Этот lane сравнивает секрет с исходным plist основного приложения. Ошибка `does not match SUPublicEDKey` означает другую пару ключей; `missing or unreadable` указывает на отсутствие ключа в проверяемом plist. Наличие ключа в исходном файле само по себе не доказывает наличие в ранее собранном DMG.

Результат: `$SAFARI_RELEASE_DIR/appcast.xml`. Он содержит один полный DMG без delta-обновлений. Минимальную версию macOS и архитектуры утилита Sparkle получает из приложения. Публикуй **тот же DMG**, после которого генерировался appcast; последующее изменение файла сделает подпись недействительной.

Локально DMG из предыдущей сборки должен соответствовать `SAFARI_RELEASE_TAG`. Lane проверяет это по версии внутри сгенерированного appcast.

## GitHub Actions

В Environment **`publish-safari`** нужны secrets:

- `APPLE_ID` — Apple ID;
- `APPLE_APP_SPECIFIC_PASSWORD` — app-specific password;
- `APPLE_CERTIFICATE_BASE64` — `.p12` с Developer ID и private key в base64;
- `APPLE_CERTIFICATE_PASSWORD` — пароль `.p12`;

В repository secrets нужен `SPARKLE_PRIVATE_KEY` — экспортированный приватный ключ Sparkle. Его также можно хранить в Environment `publish-safari`.

Variable: **`APPLE_TEAM_ID`**.

Workflow **Publish Release** при публикации стабильного GitHub Release:

1. Проверяет release tooling и соответствие секрета исходному `SUPublicEDKey` до импорта сертификата; собирает и notarizes DMG с версией из тега.
2. Генерирует и проверяет appcast.
3. Загружает DMG в **Release assets**, затем загружает `appcast.xml`. Право `contents: write` есть только у Safari job. Повторный запуск заменяет assets того же тега.
4. Сохраняет DMG и appcast также в Actions artifacts.

Feed URL `releases/latest/download/appcast.xml` перенаправляет на asset последнего стабильного релиза. Все стабильные релизы должны содержать Safari assets. Пока Safari job нового релиза не завершился, feed может временно возвращать 404; после успешной загрузки он снова доступен. Если Safari job упал, исправь причину и перезапусти его. GitHub Pages не требуется.

Drafts и prereleases не публикуют Safari-обновления. Ручной запуск **Publish Release** или **Build Safari** создаёт только DMG artifact, без изменения публичного feed и без требования приватного ключа Sparkle. Actions artifact скачивается как ZIP с DMG внутри.

Safari job запускается независимо от Chrome и Firefox: `needs` не задан. Его условие явно разрешает ручной запуск или событие `release` с `prerelease == false`; отдельная проверка `draft` не нужна для триггера `release.published`. Шаг **Log release trigger** в Chrome job выводит только имя события, action, тег и флаги prerelease/draft. Секреты и полный payload не выводятся. Изменение workflow применяется к новому запуску с коммитом, содержащим исправление; повтор старого запуска не подхватывает новый workflow.

Chrome и Firefox публикуются только при ручном запуске **Publish Release** с полем `tag` существующего релиза; ZIP и неподписанный XPI прикрепляются к этому релизу. Firefox отправляется в AMO без ожидания ревью. Подробности — в [CONTRIBUTING.md](../CONTRIBUTING.md). Поэтому шаг **Log release trigger** в Chrome job также выполняется только при ручном запуске; при событии `release` Chrome job пропускается.

## Интерфейс и проверка

`AppDelegate.swift` хранит updater и наблюдает `canCheckForUpdates`. `ViewController.swift` передаёт состояние и версию в локальный `WKWebView`; кнопка **Check for Updates…** в `Main.html` вызывает проверку через `Script.js`. Пока updater недоступен, кнопка отключена. Приложение завершается при закрытии последнего окна.

Проверка release tooling без сертификатов и сети:

```sh
bundle exec ruby fastlane/tests/safari_release_test.rb
```

Тесты выполняются на macOS (`plutil`) и проверяют оба формата ключей, вычисление публичного ключа по тестовому вектору Ed25519, несовпадение пары, XML и бинарные plist, версии, XML appcast, отклонение неподписанного feed, передачу секрета через stdin и отказ публикации при ошибке генератора. Для полной проверки установи подписанную старую версию **со Sparkle** в Applications, выпусти следующую версию и нажми **Check for Updates…**. Проверь замену приложения и работу расширения после установки; при необходимости перезапусти Safari. Старые версии без Sparkle требуют одного ручного обновления через DMG.

## Идентификатор Safari-расширения

`extensionBundleIdentifier` в `ViewController.swift` должен совпадать с `PRODUCT_BUNDLE_IDENTIFIER` target расширения: `com.ArsenyD.lmsEnhancerExtension`. Приложение использует его для получения состояния и открытия настроек Safari. При изменении идентификатора обновляй оба места.
