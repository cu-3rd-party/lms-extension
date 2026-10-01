// workshop_api.js — клиент сервера мастерской тем для страницы workshop.html.
//
// Страница — часть расширения, поэтому ходит на сервер напрямую, без прокси
// через background (как делают контент-скрипты биржи пар). Авторизация — та
// же схема, что у биржи: случайный ключ устройства в `storage.local` плюс
// `student_id` из LMS, его достаёт background (у него есть куки LMS).
//
// Картинки в профиле темы сервер хранит отдельными файлами, а в самом
// профиле оставляет ссылки `workshop-asset:<sha256>`. `resolveProfile`
// скачивает их и превращает обратно в `data:`-URL — в том виде, в каком их
// хранят плагины.
//
// Сервер: https://github.com/cu-3rd-party/lms-workshop-backend

// Polyfill to handle browser namespace differences (Chrome uses 'chrome', Firefox uses 'browser')
if (typeof browser === 'undefined') {
  var browser = chrome;
}

(() => {
  'use strict';

  // Тот же адрес зашит в workshop-background.ts и в host_permissions манифеста.
  const DEFAULT_BACKEND = 'https://lms.workshop.cu3rd.ru';
  const ASSET_PREFIX = 'workshop-asset:';

  let base = DEFAULT_BACKEND;
  let auth = null;

  class WorkshopError extends Error {
    constructor(message, status = 0) {
      super(message);
      this.status = status;
    }
  }

  function randomKey() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function send(method, path, body, { form = false, withAuth = true } = {}) {
    const headers = {};
    if (withAuth && auth) {
      headers.Authorization = `Bearer ${auth.deviceKey}`;
      headers['X-Student-Id'] = auth.studentId;
    }
    let payload;
    if (form) {
      payload = body;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(base + path, { method, headers, body: payload });
    } catch (_error) {
      throw new WorkshopError('Сервер мастерской недоступен. Проверь интернет и попробуй ещё раз.');
    }
    if (response.status === 204) return null;
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      let detail = data && data.detail;
      // Ошибки валидации FastAPI приходят списком.
      if (Array.isArray(detail)) detail = detail.map((d) => d.msg).join('; ');
      throw new WorkshopError(detail || `HTTP ${response.status}`, response.status);
    }
    return data;
  }

  async function register() {
    return send(
      'POST',
      '/api/v1/register',
      { student_id: auth.studentId, device_key: auth.deviceKey },
      { withAuth: false }
    );
  }

  /**
   * Регистрирует устройство и возвращает профиль студента ({ id, nickname }).
   * Регистрация идемпотентна, поэтому зовём её на каждом открытии страницы:
   * так переживаем и переустановку расширения, и чистку базы на сервере.
   */
  async function init() {
    const stored = await browser.storage.local.get(['workshopBackendUrl', 'workshopDeviceKey']);
    if (
      typeof stored.workshopBackendUrl === 'string' &&
      /^https?:\/\//.test(stored.workshopBackendUrl)
    ) {
      base = stored.workshopBackendUrl.replace(/\/+$/, '');
    }
    let deviceKey = stored.workshopDeviceKey;
    if (typeof deviceKey !== 'string' || deviceKey.length < 32) {
      deviceKey = randomKey();
      await browser.storage.local.set({ workshopDeviceKey: deviceKey });
    }

    const identity = await browser.runtime.sendMessage({ action: 'WORKSHOP_IDENTITY' });
    if (!identity || !identity.success) {
      throw new WorkshopError((identity && identity.error) || 'Не удалось узнать, кто ты в LMS');
    }
    auth = { deviceKey, studentId: identity.studentId };
    return register();
  }

  async function request(method, path, body, options) {
    try {
      return await send(method, path, body, options);
    } catch (error) {
      // Сервер забыл устройство (например, вытеснил старый ключ) — привязываем
      // заново и повторяем один раз.
      if (error.status === 401 && auth) {
        await register();
        return send(method, path, body, options);
      }
      throw error;
    }
  }

  /** Полный адрес картинки по относительному пути из ответа сервера. */
  function assetUrl(relative) {
    if (!relative) return '';
    return /^https?:/.test(relative) ? relative : base + relative;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Профиль версии, готовый для реестра настроек: ссылки на картинки
   * заменены их содержимым.
   */
  async function resolveProfile(themeId, versionId) {
    const { profile, assets } = await request(
      'GET',
      `/api/v1/themes/${themeId}/versions/${versionId}/payload`
    );
    const cache = new Map();
    const load = async (sha) => {
      if (!cache.has(sha)) {
        cache.set(
          sha,
          (async () => {
            const response = await fetch(`${base}/api/v1/assets/${sha}`);
            if (!response.ok) throw new WorkshopError('Не скачалась картинка темы');
            const blob = await response.blob();
            // Тип берём из ответа API, а не из заголовка: так надёжнее.
            const typed = assets[sha] ? new Blob([blob], { type: assets[sha] }) : blob;
            return blobToDataUrl(typed);
          })()
        );
      }
      return cache.get(sha);
    };
    const walk = async (value) => {
      if (typeof value === 'string' && value.startsWith(ASSET_PREFIX)) {
        return load(value.slice(ASSET_PREFIX.length));
      }
      if (Array.isArray(value)) return Promise.all(value.map(walk));
      if (value && typeof value === 'object') {
        const entries = await Promise.all(
          Object.entries(value).map(async ([key, item]) => [key, await walk(item)])
        );
        return Object.fromEntries(entries);
      }
      return value;
    };
    profile.values = await walk(profile.values || {});
    return profile;
  }

  window.cuLmsWorkshopApi = {
    WorkshopError,
    init,
    assetUrl,
    resolveProfile,
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body ?? {}),
    put: (path, body) => request('PUT', path, body ?? {}),
    patch: (path, body) => request('PATCH', path, body ?? {}),
    del: (path) => request('DELETE', path),
    upload: (path, form) => request('POST', path, form, { form: true }),
    studentId: () => (auth ? auth.studentId : null),
  };
})();
