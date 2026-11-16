// save_file.js — страница расширения, которая сохраняет файл (save_file.html).
//
// Зачем. В Safari нет API загрузок (`downloads`), а ссылка на blob, созданный в
// попапе, не открывается: «Safari не может открыть страницу blob:safari-web-extension://…
// (WebKitBlobResource, ошибка 1)». Запуск сохранения во вкладке самой LMS Safari тоже
// не любит — страница перезагружается («this webpage was reloaded because a problem
// occurred»). Работает вот что: blob и `<a download>`, созданные на странице
// расширения, открытой отдельной вкладкой, и сохранение по клику пользователя — так
// уже скачивается zip офлайн-копии (offline/offline_export.js).
//
// Файл приходит от попапа через storage.local под ключом `pendingSave:<id>`:
// `{ base64, filename, mime, at }`. Страница забирает запись сразу и стирает её, так
// что файл не лежит в хранилище дольше нужного.

(function () {
  'use strict';

  const api = typeof browser !== 'undefined' ? browser : chrome;
  const PREFIX = 'pendingSave:';
  // Записи, которые никто не забрал (вкладка не открылась), чистятся при следующем открытии.
  const STALE_MS = 60 * 60 * 1000;

  const title = document.getElementById('title');
  const note = document.getElementById('note');
  const button = document.getElementById('save');

  function fail(text) {
    title.textContent = 'Не получилось сохранить';
    note.textContent = text;
  }

  function bytesFrom(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    // Браузер мог ещё не начать читать blob — отпускаем с запасом.
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
  }

  async function purgeStale() {
    try {
      const all = await api.storage.local.get(null);
      const dead = Object.keys(all).filter(
        (key) => key.startsWith(PREFIX) && Date.now() - (all[key]?.at || 0) > STALE_MS
      );
      if (dead.length) await api.storage.local.remove(dead);
    } catch (_error) {
      // Не вышло — не страшно, уберётся в следующий раз.
    }
  }

  async function main() {
    const id = new URLSearchParams(location.search).get('id');
    if (!id) return fail('В адресе нет номера файла.');
    const key = PREFIX + id;

    const stored = (await api.storage.local.get(key))[key];
    if (!stored || typeof stored.base64 !== 'string') {
      return fail('Файла уже нет: возможно, он сохранён. Выгрузите его из меню ещё раз.');
    }
    await api.storage.local.remove(key);
    void purgeStale();

    const blob = new Blob([bytesFrom(stored.base64)], {
      type: stored.mime || 'application/octet-stream',
    });
    document.title = stored.filename;
    title.textContent = 'Файл готов';
    note.textContent = '';
    const name = document.createElement('span');
    name.id = 'name';
    name.textContent = stored.filename;
    note.append(name);
    // Сохранение — по клику: так его принимает Safari, как и zip офлайн-копии.
    button.hidden = false;
    button.addEventListener('click', () => saveBlob(blob, stored.filename));
  }

  main().catch((error) => fail(String((error && error.message) || error)));
})();
