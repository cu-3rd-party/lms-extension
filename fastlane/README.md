# macOS release pipeline

`mac release` последовательно выполняет:

1. сборку web-части через `bun` и архивацию macOS-проекта через `gym`;
2. создание и подпись `.dmg` через CLI [create-dmg](https://github.com/sindresorhus/create-dmg) сертификатом `Developer ID Application`;
3. переименование `CU LMS Enhancer.dmg` в `lms-extension-safari.dmg`: параметр `--dmg-title` задаёт название тома, а имя файла `create-dmg` берёт из имени приложения;
4. notarization и прикрепление ticket через Fastlane action `notarize`.

## Требования

- Xcode и Xcode Command Line Tools;
- сертификат `Developer ID Application` с private key в связке ключей;
- Ruby/Bundler и Bun;
- Apple ID, app-specific password и Team ID.

Для локального запуска создай `.env` в корне проекта:

```env
FASTLANE_USER=apple-id@example.com
FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=W88579NAWQ
```

Запуск:

```sh
bun install --frozen-lockfile
bundle install
bundle exec fastlane mac release
```

Результат:

```text
build/release/lms-extension-safari.dmg
```

## Идентификатор Safari-расширения

`extensionBundleIdentifier` в `safari/CU LMS Enhancer/CU LMS Enhancer/ViewController.swift` должен совпадать с `PRODUCT_BUNDLE_IDENTIFIER` target `CU LMS Enhancer Extension`: `com.ArsenyD.lmsEnhancerExtension`. Приложение использует его для получения состояния расширения и перехода к его настройкам в Safari по кнопке. При изменении идентификатора обновляй оба места. Для доставки исправления пользователям нужно пересобрать DMG.

## GitHub Actions

Workflow `Publish Release` запускает Safari-сборку на `macos-latest` при публикации GitHub Release. Safari job также можно запустить вручную через `Actions` → `Publish Release` → `Run workflow`. При ручном запуске jobs Chrome и Firefox пропускаются. В Environment `publish-safari` добавь secrets:

- `APPLE_ID` — Apple ID;
- `APPLE_APP_SPECIFIC_PASSWORD` — app-specific password;
- `APPLE_CERTIFICATE_BASE64` — `.p12` с сертификатом `Developer ID Application` и private key в base64;
- `APPLE_CERTIFICATE_PASSWORD` — пароль `.p12`.

В том же Environment добавь variable `APPLE_TEAM_ID`. Workflows `Publish Release` и `Build Safari` загружают `build/release/lms-extension-safari.dmg` в artifact с именем `lms-extension-safari.dmg`; отсутствие файла считается ошибкой. При скачивании через GitHub Actions artifact представляет собой ZIP-архив с DMG внутри. `Build Safari` запускается вручную через `workflow_dispatch`.
