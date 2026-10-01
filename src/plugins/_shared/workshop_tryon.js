// workshop_tryon.js — плашка «Примеряешь тему» на страницах LMS.
//
// Примерку начинает страница мастерской (plugins/workshop): она пишет тему в
// хранилище, а снимок прежних настроек — в `workshopTryOn`. Пока снимок там,
// здесь висит плашка: тема уже видна на настоящей LMS, и прямо отсюда её
// можно оставить или откатить. Сам откат делает background
// (WORKSHOP_TRYON_END в workshop-background.ts) — туда же шлёт и мастерская.
//
// Плашка в shadow DOM: иначе её перекрашивали бы и тёмная тема, и сама
// примеряемая тема со своим CSS.

// Polyfill to handle browser namespace differences (Chrome uses 'chrome', Firefox uses 'browser')
if (typeof browser === 'undefined') {
  var browser = chrome;
}

if (typeof window.__culmsWorkshopTryOn === 'undefined') {
  window.__culmsWorkshopTryOn = true;

  (() => {
    'use strict';

    const KEY = 'workshopTryOn';
    let host = null;

    const STYLE = `
      :host { all: initial; }
      .bar {
        position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%);
        z-index: 2147483000; display: flex; align-items: center; gap: 10px;
        max-width: calc(100vw - 32px); padding: 10px 12px 10px 16px;
        border-radius: 12px; background: #1f2226; color: #f1f2f4;
        box-shadow: 0 10px 30px rgba(0,0,0,.35);
        font: 14px/1.4 -apple-system, system-ui, 'Segoe UI', Roboto, sans-serif;
      }
      .title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      button {
        font: inherit; cursor: pointer; border-radius: 8px; padding: 6px 12px;
        border: 1px solid rgba(255,255,255,.35); background: transparent; color: inherit;
        white-space: nowrap;
      }
      button.keep { background: #4c8dff; border-color: #4c8dff; color: #0e1116; }
      button:disabled { opacity: .5; cursor: default; }
      .link { border: none; padding: 6px 4px; color: #9aa0a6; }
    `;

    function remove() {
      if (host) host.remove();
      host = null;
    }

    function render(tryOn) {
      remove();
      if (!tryOn) return;

      host = document.createElement('div');
      host.id = 'culms-workshop-tryon';
      const root = host.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = STYLE;

      const bar = document.createElement('div');
      bar.className = 'bar';
      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = `Примерка: «${tryOn.title}» v${tryOn.number}`;

      const button = (text, cls, onClick) => {
        const el = document.createElement('button');
        el.textContent = text;
        if (cls) el.className = cls;
        el.addEventListener('click', async () => {
          bar.querySelectorAll('button').forEach((b) => (b.disabled = true));
          try {
            await onClick();
          } finally {
            bar.querySelectorAll('button').forEach((b) => (b.disabled = false));
          }
        });
        return el;
      };
      const end = (keep) => () =>
        browser.runtime.sendMessage({ action: 'WORKSHOP_TRYON_END', keep });

      bar.append(
        title,
        button('Мастерская', 'link', () =>
          browser.runtime.sendMessage({ action: 'OPEN_WORKSHOP' })
        ),
        button('Вернуть как было', '', end(false)),
        button('Оставить', 'keep', end(true))
      );
      root.append(style, bar);
      document.documentElement.append(host);
    }

    browser.storage.local.get(KEY).then((data) => render(data[KEY] || null));
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && KEY in changes) render(changes[KEY].newValue || null);
    });
  })();
}
