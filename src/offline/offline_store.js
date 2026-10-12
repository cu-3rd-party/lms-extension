// offline_store.js — хранилище офлайн-копии LMS (IndexedDB расширения).
//
// Один файл на двоих: фон импортирует его в свой бандл и пишет сюда то, что
// выгрузил, а страница offline LMS подключает тегом <script> и читает. Origin
// у них общий (chrome-extension:// / moz-extension:// / safari-web-extension://),
// поэтому и база одна. IndexedDB, а не storage.local: файлы лонгридов —
// мегабайты бинарных данных, storage.local хранит только JSON, и в Safari у
// него жёсткая квота.
//
// Три таблицы:
//   records — ответы API: { key, data, fetchedAt, fp?, error?, failedAt? }.
//             Ключ — вид записи и id: `courses`, `overview:969`, `longread:16899`…
//   files   — файлы: { key, name, size, mime, blob, savedAt }. Ключ —
//             `filename@version`: LMS меняет version при замене файла, так что
//             один ключ — всегда одно и то же содержимое.
//   meta    — состояние выгрузки (`state`) и прочие служебные мелочи.
//
// Наружу — `globalThis.cuLmsOfflineStore`.

(function (root) {
  'use strict';

  if (root.cuLmsOfflineStore) return;

  const DB_NAME = 'culms-offline';
  const DB_VERSION = 1;
  const STORES = ['records', 'files', 'meta'];

  let opening = null;

  function open() {
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of STORES) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        // Другая вкладка обновила схему — отпускаем базу, следующий вызов
        // откроет её заново.
        db.onversionchange = () => {
          db.close();
          opening = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        opening = null;
        reject(request.error);
      };
    });
    return opening;
  }

  async function tx(store, mode, work) {
    const db = await open();
    const transaction = db.transaction(store, mode);
    const result = work(transaction.objectStore(store));
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    return result instanceof IDBRequest ? result.result : result;
  }

  const get = (store, key) => tx(store, 'readonly', (s) => s.get(key));
  const getAll = (store) => tx(store, 'readonly', (s) => s.getAll());
  const getAllKeys = (store) => tx(store, 'readonly', (s) => s.getAllKeys());
  const put = (store, value) => tx(store, 'readwrite', (s) => s.put(value));
  const remove = (store, key) => tx(store, 'readwrite', (s) => s.delete(key));

  /** Все записи одной таблицей: Map<key, запись>. */
  async function recordsMap() {
    const map = new Map();
    for (const record of await getAll('records')) map.set(record.key, record);
    return map;
  }

  /** Файлы без содержимого: только ключ, имя и размер. */
  async function fileIndex() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const index = new Map();
      const request = db.transaction('files', 'readonly').objectStore('files').openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return resolve(index);
        const { key, name, size, mime, savedAt } = cursor.value;
        index.set(key, { key, name, size, mime, savedAt });
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function clearAll() {
    for (const store of STORES) await tx(store, 'readwrite', (s) => s.clear());
  }

  root.cuLmsOfflineStore = {
    open,
    get,
    getAll,
    getAllKeys,
    put,
    remove,
    recordsMap,
    fileIndex,
    clearAll,
    getRecord: (key) => get('records', key),
    putRecord: (record) => put('records', record),
    getFile: (key) => get('files', key),
    putFile: (file) => put('files', file),
    getMeta: (key) => get('meta', key).then((entry) => entry?.value),
    setMeta: (key, value) => put('meta', { key, value }),
  };
})(globalThis);
