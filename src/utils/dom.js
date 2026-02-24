/**
 * Инжектирует CSS строку как <style> тег в document.head.
 * Идемпотентен: повторный вызов с тем же id ничего не делает.
 *
 * @param {{ css: string, id: string }} options
 * @returns {() => void} Функция для удаления стиля
 */
export function insertCss({ css, id }) {
  const removeStyle = () => document.getElementById(id)?.remove();

  if (document.getElementById(id)) return removeStyle;

  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);

  return removeStyle;
}

/**
 * Ожидает появления DOM-элемента, соответствующего селектору.
 *
 * @param {string | (() => Element | null)} selector — CSS-селектор или функция-поисковик
 * @param {{ timeout?: number, interval?: number }} [options]
 * @returns {Promise<Element | null>}
 */
export function waitForElement(selector, { timeout = 5000, interval = 100 } = {}) {
  return new Promise((resolve) => {
    const find = () =>
      typeof selector === 'string' ? document.querySelector(selector) : selector();

    const found = find();
    if (found) {
      resolve(found);
      return;
    }

    const intervalId = setInterval(() => {
      const el = find();
      if (el) {
        clearInterval(intervalId);
        clearTimeout(timeoutId);
        resolve(el);
      }
    }, interval);

    const timeoutId = setTimeout(() => {
      clearInterval(intervalId);
      resolve(null);
    }, timeout);
  });
}
