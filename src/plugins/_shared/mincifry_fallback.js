// mincifry_fallback.js — LMS без сертификатов Минцифры. Мир страницы (MAIN).
//
// Часть запросов LMS уходит на хосты Т-Банка, чьи сертификаты выпущены Russian
// Trusted Root CA — корнем Минцифры. Без этого корня в системе такие запросы
// падают ещё на TLS. Скрипт оборачивает `fetch` и `XMLHttpRequest` и, если
// запрос к одной из известных ручек упал, отдаёт вместо него правдоподобный
// ответ. Если запрос прошёл (сертификаты стоят), ответ не трогается.
//
// Известные ручки (как их нашли — _shared/README.md):
//   - Thermostat, флаги LMS. Без него провайдер флагов не поднимается
//     («Error provider initialization»), ошибка всплывает в каждой перерисовке
//     Angular: шапка без ссылок, сайдбар без подписей. Подмена — «все
//     запрошенные флаги выключены», флаги получают значения по умолчанию;
//   - cfg.tbank.ru, флаги видеоплеера. Плеер и сам падает в значение по
//     умолчанию, подмена лишь убирает ошибку из консоли;
//   - Statist, аналитика. Без ответа SDK бесконечно повторяет отправку и копит
//     события в localStorage. Подмена — «принято». Только при сетевой ошибке:
//     при 5xx у тех, у кого сертификаты стоят, события должны дождаться повтора.
//
// Отзыв к видео (`vp-feedback-api.tbank.ru/v1/claim`) не подменяется нарочно:
// пользователь увидел бы «отправлено», хотя жалоба никуда не ушла.
//
// Работает только при включённой галочке `mincifryFallbackEnabled`. Её значение
// приносит mincifry_flag.js из изолированного мира через атрибут
// `data-culms-mincifry-fallback` на <html>: сюда storage не дотягивается.

(() => {
  if (window.__culmsMincifryFallback) return;
  window.__culmsMincifryFallback = true;

  const FLAG_ATTR = 'data-culms-mincifry-fallback';
  // Сколько ждать значение галочки, если запрос упал раньше, чем его принесли.
  const FLAG_WAIT_MS = 3000;

  const json = (body) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  // `on5xx` — подменять и ответ сервера с ошибкой, а не только сетевой сбой.
  // `stub(body)` получает разобранное тело запроса (или null) и строит ответ.
  const ROUTES = [
    {
      name: 'Thermostat',
      host: 'public-thermostat-provider.tbank.ru',
      path: '/api/v2/resolve',
      on5xx: true,
      // Формат ответа /api/v2/resolve: со статусом `complete` и ключами в
      // `disabledParameters` SDK отдаёт по ним значение по умолчанию, без ошибки.
      stub: (body) =>
        json({
          version: 0,
          status: 'complete',
          lastUpdatedAt: new Date(0).toISOString(),
          resolvedAt: new Date().toISOString(),
          lastResolvedContextHash: 'unset',
          resolvedParameters: [],
          unknownParameters: [],
          disabledParameters: Array.isArray(body?.parameters)
            ? body.parameters.map((p) => p?.key).filter((key) => typeof key === 'string')
            : [],
        }),
    },
    {
      name: 'флаги видеоплеера',
      host: 'cfg.tbank.ru',
      path: '/api-gateway/v2/getToggles',
      on5xx: true,
      // Пустой список: плеер не находит свой флаг и берёт значение по умолчанию.
      stub: () => json({ response: { items: [] } }),
    },
    {
      name: 'Statist',
      host: 'api-statist.tinkoff.ru',
      path: '/gateway/v1/events',
      on5xx: false,
      // SDK считает отправку удачной при статусе 200–204 и тело не читает.
      stub: () => new Response(null, { status: 204 }),
    },
  ];

  function routeFor(method, url) {
    if (String(method || 'GET').toUpperCase() !== 'POST') return null;
    try {
      const parsed = new URL(url, location.href);
      return ROUTES.find((r) => parsed.hostname === r.host && parsed.pathname === r.path) ?? null;
    } catch (_error) {
      return null;
    }
  }

  function readFlag() {
    const value = document.documentElement?.getAttribute(FLAG_ATTR);
    return value === null || value === undefined ? null : value === 'on';
  }

  function isEnabled() {
    const now = readFlag();
    if (now !== null) return Promise.resolve(now);

    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const value = readFlag();
        if (value === null) return;
        observer.disconnect();
        clearTimeout(timer);
        resolve(value);
      });
      const timer = setTimeout(() => {
        observer.disconnect();
        resolve(false);
      }, FLAG_WAIT_MS);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: [FLAG_ATTR],
      });
    });
  }

  function parseBody(body) {
    if (typeof body !== 'string') return null;
    try {
      return JSON.parse(body);
    } catch (_error) {
      return null;
    }
  }

  function warn(route) {
    console.warn(
      `[CU LMS] ${route.name} недоступен (нет сертификатов Минцифры?), ответ подставлен плагином`
    );
  }

  // --- fetch ---

  const originalFetch = window.fetch;

  window.fetch = function (input, init) {
    const isRequest = input instanceof Request;
    const route = routeFor(
      init?.method ?? (isRequest ? input.method : 'GET'),
      isRequest ? input.url : String(input)
    );
    if (!route) return Reflect.apply(originalFetch, window, arguments);

    // Тело читаем до отправки: настоящий fetch его израсходует.
    const body =
      init && init.body !== undefined && init.body !== null
        ? Promise.resolve(parseBody(init.body))
        : isRequest
          ? input
              .clone()
              .text()
              .then(parseBody, () => null)
          : Promise.resolve(null);

    const fallback = async (failure) => {
      if (!(await isEnabled())) return failure();
      warn(route);
      return route.stub(await body);
    };

    return Reflect.apply(originalFetch, window, arguments).then(
      (response) => (route.on5xx && response.status >= 500 ? fallback(() => response) : response),
      (error) => {
        // Отмена — это таймаут самого SDK или уход со страницы, не сеть.
        if (error?.name === 'AbortError') throw error;
        return fallback(() => {
          throw error;
        });
      }
    );
  };

  // --- XMLHttpRequest ---
  //
  // Statist шлёт события через XHR и смотрит только на `status` в своих
  // onload/onerror/ontimeout (все три — одна функция). Обработчики он ставит до
  // send(), поэтому на сетевой ошибке подменяем onerror: при включённой
  // галочке отдаём экземпляру статус ответа-подмены и зовём onload вместо onerror.

  const xhrRoutes = new WeakMap();
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    const route = routeFor(method, url);
    if (route) xhrRoutes.set(this, route);
    else xhrRoutes.delete(this);
    return Reflect.apply(originalOpen, this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const route = xhrRoutes.get(this);
    if (!route) return Reflect.apply(originalSend, this, arguments);

    const xhr = this;
    const sdkOnError = xhr.onerror;
    xhr.onerror = function (event) {
      isEnabled().then(async (enabled) => {
        if (!enabled) return sdkOnError?.call(xhr, event);
        warn(route);
        const stub = route.stub(parseBody(body));
        const text = await stub.text();
        Object.defineProperty(xhr, 'status', { value: stub.status, configurable: true });
        Object.defineProperty(xhr, 'responseText', { value: text, configurable: true });
        (xhr.onload ?? sdkOnError)?.call(xhr, event);
      });
    };
    return Reflect.apply(originalSend, this, arguments);
  };
})();
