// Dark theme plugin loader
// CSS assets are bundled inline at build time — no runtime fetch() needed.
import browser from 'webextension-polyfill';
import { insertCss } from '../../utils/dom.js';
import darkThemeCss from './dark-theme.css?inline';
import darkThemeOledCss from './dark-theme-oled.css?inline';
import shadowDomDarkCss from './shadow-dom-dark.css?inline';
import shadowDomOledCss from './shadow-dom-oled.css?inline';

if (typeof window.darkThemeInitialized === 'undefined') {
  window.darkThemeInitialized = true;

  const STYLE_ID_BASE = 'culms-dark-theme-style-base';
  const STYLE_ID_OLED = 'culms-dark-theme-style-oled';
  const SHADOW_STYLE_ID = 'culms-shadow-theme-fix';

  let themeToggleButton = null;

  // ---------------------------------------------------------------------------
  // Course card icon color fix
  // ---------------------------------------------------------------------------

  function fixCourseCardColors(isEnabled) {
    const icons = document.querySelectorAll(
      'cu-course-card .skill-level .level-icon-item tui-icon'
    );
    icons.forEach((icon) => {
      if (isEnabled) {
        if (!icon.dataset.originalStyle) {
          icon.dataset.originalStyle = icon.getAttribute('style') || '';
        }
        const colorMatch = icon.dataset.originalStyle.match(/color:\s*([^;]+)/);
        if (colorMatch && colorMatch[1]?.trim() !== 'inherit') {
          icon.style.setProperty('color', colorMatch[1].trim(), 'important');
        }
      } else {
        if (typeof icon.dataset.originalStyle !== 'undefined') {
          icon.setAttribute('style', icon.dataset.originalStyle);
          delete icon.dataset.originalStyle;
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Theme application
  // ---------------------------------------------------------------------------

  async function applyTheme(isEnabled) {
    if (!isEnabled) {
      document.getElementById(STYLE_ID_BASE)?.remove();
      document.getElementById(STYLE_ID_OLED)?.remove();
      fixCourseCardColors(false);
      return;
    }

    // Inject base dark theme CSS (bundled inline — no fetch needed)
    insertCss({ css: darkThemeCss, id: STYLE_ID_BASE });

    // Inject or remove OLED overrides
    const { oledEnabled } = await browser.storage.sync.get('oledEnabled');
    if (oledEnabled) {
      insertCss({ css: darkThemeOledCss, id: STYLE_ID_OLED });
    } else {
      document.getElementById(STYLE_ID_OLED)?.remove();
    }

    setTimeout(() => fixCourseCardColors(true), 100);
  }

  // ---------------------------------------------------------------------------
  // Toggle button
  // ---------------------------------------------------------------------------

  async function updateButtonState() {
    if (!themeToggleButton) return;
    const { themeEnabled } = await browser.storage.sync.get('themeEnabled');
    const iconUrl = themeEnabled ? 'icons/sun.svg' : 'icons/moon.svg';
    themeToggleButton.style.setProperty(
      '--t-icon-start',
      `url(${browser.runtime.getURL(iconUrl)})`
    );
    themeToggleButton.title = themeEnabled
      ? 'Переключить на светлую тему'
      : 'Переключить на темную тему';
  }

  function createThemeToggleButton() {
    const listItem = document.createElement('li');
    listItem.setAttribute('automation-id', 'header-action-theme-toggle');
    listItem.classList.add('theme-toggle-container');
    listItem.style.cssText = 'display:flex;align-items:center';

    const button = document.createElement('button');
    button.setAttribute('tuiappearance', '');
    button.setAttribute('tuiicons', '');
    button.setAttribute('tuiiconbutton', '');
    button.type = 'button';
    button.setAttribute('data-appearance', 'tertiary-no-padding');
    button.setAttribute('data-size', 'm');
    button.classList.add('button-action');

    button.addEventListener('click', async () => {
      const { themeEnabled } = await browser.storage.sync.get('themeEnabled');
      await browser.storage.sync.set({ themeEnabled: !themeEnabled });
    });

    listItem.appendChild(button);
    themeToggleButton = button;
    updateButtonState();
    return listItem;
  }

  function addButtonToHeader() {
    if (document.querySelector('.theme-toggle-container')) return;
    const headerActionsList = document.querySelector('ul.header__actions-list');
    const userProfileMenu = document.querySelector('cu-user-profile-menu');
    if (headerActionsList && userProfileMenu) {
      headerActionsList.insertBefore(createThemeToggleButton(), userProfileMenu.parentElement);
    }
  }

  function waitForHeaderAndAddButton() {
    const observer = new MutationObserver((_mutations, obs) => {
      if (document.querySelector('ul.header__actions-list')) {
        addButtonToHeader();
        obs.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ---------------------------------------------------------------------------
  // Shadow DOM theming
  // ---------------------------------------------------------------------------

  function toggleShadowDomTheme(isEnabled, isOled) {
    const hosts = document.querySelectorAll('informer-widget-element, informer-case-list-element');
    hosts.forEach((host) => {
      if (!host.shadowRoot) return;
      const existing = host.shadowRoot.getElementById(SHADOW_STYLE_ID);
      if (isEnabled && !existing) {
        const style = document.createElement('style');
        style.id = SHADOW_STYLE_ID;
        style.textContent = isOled ? shadowDomOledCss : shadowDomDarkCss;
        host.shadowRoot.appendChild(style);
      } else if (!isEnabled && existing) {
        existing.remove();
      } else if (isEnabled && existing) {
        existing.textContent = isOled ? shadowDomOledCss : shadowDomDarkCss;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------------

  browser.storage.onChanged.addListener(async (changes) => {
    if (!('themeEnabled' in changes) && !('oledEnabled' in changes)) return;
    const data = await browser.storage.sync.get(['themeEnabled', 'oledEnabled']);
    await applyTheme(!!data.themeEnabled);
    updateButtonState();
    toggleShadowDomTheme(!!data.themeEnabled, !!data.oledEnabled);
  });

  browser.storage.sync.get(['themeEnabled', 'oledEnabled']).then((data) => {
    if (data.themeEnabled) {
      applyTheme(true);
      toggleShadowDomTheme(true, !!data.oledEnabled);
    }
  });

  addButtonToHeader();
  waitForHeaderAndAddButton();

  // Watch for new shadow-DOM widgets appearing on the page
  new MutationObserver(async () => {
    const { themeEnabled, oledEnabled } = await browser.storage.sync.get([
      'themeEnabled',
      'oledEnabled',
    ]);
    if (themeEnabled) {
      toggleShadowDomTheme(true, !!oledEnabled);
      fixCourseCardColors(true);
    }
  }).observe(document.body, { childList: true, subtree: true });
}
