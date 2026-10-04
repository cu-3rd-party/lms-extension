// slot_view_main.js — главный мир страницы LMS, до запуска Angular.
//
// Выбор пар на «Мои пары» — колонка действий и drawer со всеми вариантами
// строки (другие преподаватели семинара, другие потоки лекции). LMS
// показывает её, только пока открыта запись: окно задаёт сервер в
// `GET /api/micro-lms/calendar-events/slot-management/config`
// (`openDate ≤ сейчас ≤ closeDate`, см. getRegistrationState$ в бандле), а
// состояние запрашивается один раз при старте приложения (shareReplay) —
// поэтому скрипт должен встать раньше Angular.
//
// Если запись закрыта, в ответе подставляется открытое окно — drawer
// появляется, а на <html> ставится `data-culms-slot-view="peek"`: по нему
// timetable_join.js убирает из drawer кнопку «Выбрать время» и дописывает
// ссылки на трансляции. Пока режим «peek», пересадка на сервер не уходит
// вообще: POST `students/me/timetables/{курс}/{тип}/{номер}` и PUT конфига
// обрываются ошибкой до отправки — на случай, если кнопка где-то осталась.
//
// Если запись открыта по-настоящему, скрипт ничего не трогает: студент
// записывается как обычно.
//
// Подключён в manifest.config.js content script'ом с `world: 'MAIN'` на
// document_start — синхронно, раньше любого скрипта LMS (через <script src>
// проигрывал гонку модулям страницы).

(() => {
  if (window.__culmsSlotViewMain) return;
  window.__culmsSlotViewMain = true;

  const CONFIG_RE = /\/api\/micro-lms\/calendar-events\/slot-management\/config(?:[?#]|$)/;
  const ASSIGN_RE = /\/api\/micro-lms\/students\/me\/timetables\/\d+\/[a-z]+\/\d+(?:[?#]|$)/i;
  const ATTR = 'data-culms-slot-view';
  const DAY_MS = 24 * 60 * 60 * 1000;

  let peek = false;

  function isOpen(cfg) {
    const now = Date.now();
    const open = cfg && cfg.openDate ? Date.parse(cfg.openDate) : NaN;
    const close = cfg && cfg.closeDate ? Date.parse(cfg.closeDate) : NaN;
    return open <= now && close >= now;
  }

  /** Ответ конфига → с открытым окном, если запись закрыта. */
  function patchConfig(cfg) {
    if (!cfg || typeof cfg !== 'object' || isOpen(cfg)) return cfg;
    peek = true;
    document.documentElement.setAttribute(ATTR, 'peek');
    const now = Date.now();
    return {
      ...cfg,
      openDate: new Date(now - DAY_MS).toISOString(),
      closeDate: new Date(now + 365 * DAY_MS).toISOString(),
    };
  }

  function patchText(text) {
    if (typeof text !== 'string' || !text) return text;
    try {
      return JSON.stringify(patchConfig(JSON.parse(text)));
    } catch (_e) {
      return text;
    }
  }

  const proto = XMLHttpRequest.prototype;
  const nativeOpen = proto.open;
  const nativeSend = proto.send;
  const responseGetter = Object.getOwnPropertyDescriptor(proto, 'response').get;
  const responseTextGetter = Object.getOwnPropertyDescriptor(proto, 'responseText').get;

  proto.open = function (method, url, ...rest) {
    this.__culmsSlotView = { method: String(method || '').toUpperCase(), url: String(url || '') };
    return nativeOpen.call(this, method, url, ...rest);
  };

  proto.send = function (body) {
    const info = this.__culmsSlotView;
    if (info && peek) {
      const assign = info.method === 'POST' && ASSIGN_RE.test(info.url);
      const configWrite = info.method !== 'GET' && CONFIG_RE.test(info.url);
      if (assign || configWrite) {
        throw new DOMException(
          'Запись на пары закрыта: расширение показывает группы только для просмотра',
          'NotAllowedError'
        );
      }
    }
    if (info && info.method === 'GET' && CONFIG_RE.test(info.url)) {
      // Подмена — на самом объекте запроса: Angular читает responseText
      // (для JSON он просит text) или response, когда запрос уже готов.
      const done = (xhr) => xhr.readyState === 4 && xhr.status >= 200 && xhr.status < 300;
      Object.defineProperty(this, 'responseText', {
        configurable: true,
        get() {
          const text = responseTextGetter.call(this);
          return done(this) ? patchText(text) : text;
        },
      });
      Object.defineProperty(this, 'response', {
        configurable: true,
        get() {
          const value = responseGetter.call(this);
          if (!done(this)) return value;
          if (typeof value === 'string') return patchText(value);
          return value && typeof value === 'object' ? patchConfig(value) : value;
        },
      });
    }
    return nativeSend.call(this, body);
  };
})();
