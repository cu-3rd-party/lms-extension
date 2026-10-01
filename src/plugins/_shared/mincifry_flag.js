// mincifry_flag.js — передаёт галочку «LMS без сертификатов Минцифры» в мир
// страницы, где её ждёт mincifry_fallback.js. Туда storage не дотягивается,
// поэтому значение кладём в атрибут <html>, общий для обоих миров.

(() => {
  const extApi = typeof browser !== 'undefined' ? browser : chrome;
  const FLAG_ATTR = 'data-culms-mincifry-fallback';

  const apply = (enabled) => {
    document.documentElement?.setAttribute(FLAG_ATTR, enabled ? 'on' : 'off');
  };

  extApi.storage.sync
    .get('mincifryFallbackEnabled')
    .then((data) => apply(!!data.mincifryFallbackEnabled))
    .catch(() => apply(false));

  extApi.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.mincifryFallbackEnabled) {
      apply(!!changes.mincifryFallbackEnabled.newValue);
    }
  });
})();
