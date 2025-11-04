# Неофициальный аддон на LMS ЦУ

Мы как обычные студенты ЦУ заметили несколько недоработок со стороны LMSки и решили сделать ее удобнее для себя. Выпускаем в открытый доступ что по итогу сделали, чтоб всем было удобнее.

<img width="1056" height="665" alt="image" src="https://github.com/user-attachments/assets/61c71428-6720-435c-8a70-e105d750fe9d" />
<img width="414" height="201" alt="image" src="https://github.com/user-attachments/assets/da2b3e7b-fff0-4f24-a464-faafa6e3f547" />
<img width="349" height="245" alt="image" src="https://github.com/user-attachments/assets/52258788-a134-4338-a773-c8b716ea26a9" />


## Если вы обычный пользователь
Мы залили наше расширение в официальные магазины браузеров, вот ссылки:
<div align="center">

**[Установить для Chrome](https://chromewebstore.google.com/detail/cu-lms-enhancer/cbkadnkphiaalgjpgilbkphoecacfjop?authuser=7&hl=en)**  
**[Установить для Firefox](https://addons.mozilla.org/en-US/firefox/addon/cu-lms-enhancer/)**

</div>

## Если вы разработчик

1. Склонируйте к себе репозиторий с помощью `git clone https://github.com/cu-3rd-party/lms-extension.git`

### Для Chrome:
2. Запустите скрипт `build-chrome.sh`
3. Откройте страницу `chrome://extensions`
4. В правом верхнем углу включите режим разработчика.
5. Нажмите "Загрузить распакованное расширение" и выберите директорию `build/chrome-debug/`

### Для Firefox:
2. Запустите скрипт `build-firefox.sh`
3. Откройте страницу `about:debugging#/runtime/this-firefox`
4. Нажмите "Load temporary Add-on..." и выберите `build/lms-extension-firefox.xpi`
