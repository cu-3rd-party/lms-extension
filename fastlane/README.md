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

Первая команда создаёт ключ в Keychain и выводит **публичный** ключ для `SUPublicEDKey`. Повторный запуск показывает существующий ключ. Вторая экспортирует **приватный** ключ. Содержимое экспортированного файла добавь в GitHub Environment `publish-safari` как secret **`SPARKLE_PRIVATE_KEY`**. Это текст из файла, без дополнительного base64-кодирования. После переноса удали экспортированный файл и сохрани резервную копию ключа в безопасном месте. Приватный ключ не коммить.

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
bundle exec fastlane mac release
```

Lane `release`:

1. Берёт версию из `SAFARI_RELEASE_TAG` либо `package.json` и синхронизирует web-часть с ней.
2. Собирает web-часть через Bun, архивирует и экспортирует `.app` через `gym` с Developer ID.
3. Передаёт `MARKETING_VERSION` и `CURRENT_PROJECT_VERSION` через аргументы `xcodebuild` **для обоих targets**, без изменения `project.pbxproj`.
4. Сохраняет SwiftPM-зависимости в `build/SourcePackages`, создаёт и подписывает DMG через `bunx create-dmg`. CI сохраняет Node.js для совместимости нативных зависимостей упаковщика; установка пакетов выполняется через Bun.
5. Переименовывает DMG в `lms-extension-safari.dmg`, выполняет notarization и staple.

Результат: `build/release/lms-extension-safari.dmg`.

Версия должна иметь вид `2.6.6` либо тег `v2.6.6`; название GitHub Release не используется. Ограничения `CFBundleVersion`: major 1–9999, minor и patch 0–99, без ведущих нулей. Для каждого обновления увеличивай версию: повторная сборка с тем же тегом не будет предлагаться как новая версия. Prerelease-теги не поддерживаются этой схемой.

## Подписанный appcast

После успешной notarization:

```sh
export SAFARI_RELEASE_TAG=v2.6.6
export GITHUB_REPOSITORY=cu-3rd-party/lms-extension
# SPARKLE_PRIVATE_KEY должен быть задан в окружении безопасным способом.
bundle exec fastlane mac appcast
```

Lane `appcast` запускает **утилиту Sparkle из зависимостей собранного приложения**, передавая приватный ключ через stdin. `fastlane/safari_release.rb` изолирует один DMG во временной папке и проверяет XML: версия, ссылка на конкретный тег, размер файла и наличие EdDSA-подписи. Неподписанный appcast, в том числе при несовпадении ключа с `SUPublicEDKey`, не проходит проверку. Вывод инструмента не печатается, чтобы исключить попадание ключа в логи.

Результат: `build/release/appcast.xml`. Он содержит один полный DMG без delta-обновлений. Минимальную версию macOS и архитектуры утилита Sparkle получает из приложения. Публикуй **тот же DMG**, после которого генерировался appcast; последующее изменение файла сделает подпись недействительной.

Локально DMG из предыдущей сборки должен соответствовать `SAFARI_RELEASE_TAG`. Lane проверяет это по версии внутри сгенерированного appcast.

## GitHub Actions

В Environment **`publish-safari`** нужны secrets:

- `APPLE_ID` — Apple ID;
- `APPLE_APP_SPECIFIC_PASSWORD` — app-specific password;
- `APPLE_CERTIFICATE_BASE64` — `.p12` с Developer ID и private key в base64;
- `APPLE_CERTIFICATE_PASSWORD` — пароль `.p12`;
- `SPARKLE_PRIVATE_KEY` — экспортированный приватный ключ Sparkle.

Variable: **`APPLE_TEAM_ID`**.

Workflow **Publish Release** при публикации стабильного GitHub Release:

1. Проверяет release tooling, собирает и notarizes DMG с версией из тега.
2. Генерирует и проверяет appcast.
3. Загружает DMG в **Release assets**, затем загружает `appcast.xml`. Право `contents: write` есть только у Safari job. Повторный запуск заменяет assets того же тега.
4. Сохраняет DMG и appcast также в Actions artifacts.

Feed URL `releases/latest/download/appcast.xml` перенаправляет на asset последнего стабильного релиза. Все стабильные релизы должны содержать Safari assets. Пока Safari job нового релиза не завершился, feed может временно возвращать 404; после успешной загрузки он снова доступен. Если Safari job упал, исправь причину и перезапусти его. GitHub Pages не требуется.

Drafts и prereleases не публикуют Safari-обновления. Ручной запуск **Publish Release** или **Build Safari** создаёт только DMG artifact, без изменения публичного feed и без требования приватного ключа Sparkle. Actions artifact скачивается как ZIP с DMG внутри.

## Интерфейс и проверка

`AppDelegate.swift` хранит updater и наблюдает `canCheckForUpdates`. `ViewController.swift` передаёт состояние и версию в локальный `WKWebView`; кнопка **Check for Updates…** в `Main.html` вызывает проверку через `Script.js`. Пока updater недоступен, кнопка отключена. Приложение завершается при закрытии последнего окна.

Проверка release tooling без сертификатов и сети:

```sh
bundle exec ruby fastlane/tests/safari_release_test.rb
```

Тесты проверяют версии, XML, отклонение неподписанного feed, передачу секрета через stdin и отказ публикации при ошибке генератора. Для полной проверки установи подписанную старую версию **со Sparkle** в Applications, выпусти следующую версию и нажми **Check for Updates…**. Проверь замену приложения и работу расширения после установки; при необходимости перезапусти Safari. Старые версии без Sparkle требуют одного ручного обновления через DMG.

## Идентификатор Safari-расширения

`extensionBundleIdentifier` в `ViewController.swift` должен совпадать с `PRODUCT_BUNDLE_IDENTIFIER` target расширения: `com.ArsenyD.lmsEnhancerExtension`. Приложение использует его для получения состояния и открытия настроек Safari. При изменении идентификатора обновляй оба места.
