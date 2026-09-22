// theme_tokens.js — каталог цветовых переменных LMS с человеческими подписями.
//
// Зачем каталог. Палитра сайта живёт в CSS-переменных, но их там сотни, имена
// вроде `--tui-background-neutral-1-pressed` ничего не говорят, а часть из них
// вообще не про цвет. Наша тёмная тема переопределяет свой набор — он был
// размазан по 16 тысячам строк `dark-theme.css`, и чтобы узнать, что именно мы
// красим, приходилось читать CSS.
//
// Здесь этот набор собран в одном месте и подписан: что за переменная, где
// видна и какое значение ей даёт наша тёмная тема. Из каталога строится
// редактор тем (список «что можно покрасить») и подсказка «какая переменная
// красит вот этот элемент» в пипетке.
//
// Поле `dark` — ровно то значение, что стоит в `dark-theme.css`. Совпадение
// проверяется тестом `tests/source/theme-tokens.test.ts`: если значение в CSS
// поменяют, а здесь забудут — тест упадёт. Каталог не применяет эти значения,
// он только рассказывает о них.
//
// Наружу отдаётся `window.cuLmsThemeTokens`. Файл подключают и страница
// редактора, и контент-скрипт темы — правила сборки CSS должны быть одни.

if (typeof window.cuLmsThemeTokens === 'undefined') {
  ('use strict');

  const VERSION = 1;

  const GROUPS = [
    {
      id: 'lms',
      title: 'Палитра LMS',
      hint: 'Собственные переменные сайта: фоны, акцент, текст, рамки. Работают и без тёмной темы.',
    },
    {
      id: 'taiga',
      title: 'Компоненты Taiga UI',
      hint: 'Библиотека, на которой собран интерфейс: кнопки, поля, чипы, всплывашки.',
    },
    {
      id: 'dark',
      title: 'Тёмная тема расширения',
      hint: 'Наши переменные. Видны, только когда включена тёмная тема плагина.',
    },
  ];

  // label — что это; hint — где увидеть. dark — значение из dark-theme.css.
  const TOKENS = [
    // --- палитра LMS ---
    {
      name: '--background',
      label: 'Фон шапки',
      hint: 'Верхняя панель сайта',
      group: 'lms',
      dark: 'rgb(32, 33, 36)',
    },
    {
      name: '--background-alt',
      label: 'Запасной фон',
      hint: 'Второй фон шапки и выпадающих панелей',
      group: 'lms',
      dark: 'rgb(32, 33, 36)',
    },
    {
      name: '--background-accent',
      label: 'Акцентный фон',
      hint: 'Подсветка выбранного пункта меню',
      group: 'lms',
      dark: '#477df91f',
    },
    {
      name: '--elevation-01',
      label: 'Фон левого меню',
      hint: 'Боковая панель навигации',
      group: 'lms',
      dark: 'rgb(32, 33, 36)',
    },
    {
      name: '--elevation-02',
      label: 'Фон карточек',
      hint: 'Островки поверх полотна: карточки, панели',
      group: 'lms',
      dark: '#fcfcfd',
    },
    {
      name: '--elevation-03',
      label: 'Фон приподнятых блоков',
      hint: 'Меню поверх карточек, подсказки',
      group: 'lms',
      dark: '#344054',
    },
    {
      name: '--sidebar-layout-content-background-color',
      label: 'Фон полотна',
      hint: 'Заливка страницы под карточками',
      group: 'lms',
      dark: 'var(--culms-dark-bg-primary)',
    },
    {
      name: '--accent',
      label: 'Акцент',
      hint: 'Основные кнопки, активные вкладки',
      group: 'lms',
      dark: '#477df9',
    },
    {
      name: '--accent-hover',
      label: 'Акцент под курсором',
      hint: 'Кнопка при наведении',
      group: 'lms',
      dark: '#6894fa',
    },
    {
      name: '--accent-pressed',
      label: 'Акцент нажатый',
      hint: 'Кнопка в момент клика',
      group: 'lms',
      dark: '#2766f8',
    },
    {
      name: '--neutral',
      label: 'Нейтральный фон',
      hint: 'Второстепенные кнопки и плашки',
      group: 'lms',
      dark: 'var(--culms-dark-bg-secondary)',
    },
    {
      name: '--neutral-hover',
      label: 'Нейтральный под курсором',
      hint: 'Второстепенная кнопка при наведении',
      group: 'lms',
      dark: '#244a7f14',
    },
    {
      name: '--positive',
      label: 'Успех',
      hint: 'Сдано, зачтено',
      group: 'lms',
      dark: '#009b40',
    },
    {
      name: '--negative',
      label: 'Ошибка',
      hint: 'Просрочено, не сдано',
      group: 'lms',
      dark: '#e63f07',
    },
    {
      name: '--warning',
      label: 'Предупреждение',
      hint: 'На доработке, дедлайн близко',
      group: 'lms',
      dark: '#ffca2d',
    },
    {
      name: '--text-primary',
      label: 'Основной текст',
      hint: 'Заголовки и тело страницы',
      group: 'lms',
      dark: '#ffffff',
    },
    {
      name: '--text-secondary',
      label: 'Второстепенный текст',
      hint: 'Подписи, иконки шапки',
      group: 'lms',
      dark: '#ffffff',
    },
    {
      name: '--text-tertiary',
      label: 'Приглушённый текст',
      hint: 'Служебные пометки',
      group: 'lms',
      dark: '#ffffff',
    },
    {
      name: '--text-link',
      label: 'Ссылка',
      hint: 'Ссылки в тексте и таблицах',
      group: 'lms',
      dark: '#526ed3',
    },
    {
      name: '--text-link-hover',
      label: 'Ссылка под курсором',
      hint: 'Ссылка при наведении',
      group: 'lms',
      dark: '#6c86e2',
    },
    {
      name: '--border',
      label: 'Рамка',
      hint: 'Границы карточек, полей, таблиц',
      group: 'lms',
      dark: 'rgb(85, 86, 90)',
    },
    {
      name: '--border-hover',
      label: 'Рамка под курсором',
      hint: 'Поле или карточка при наведении',
      group: 'lms',
      dark: '#00102438',
    },
    {
      name: '--border-focus',
      label: 'Рамка в фокусе',
      hint: 'Поле, в котором стоит курсор',
      group: 'lms',
      dark: '#00102470',
    },
    {
      name: '--lightbox',
      label: 'Затемнение под диалогом',
      hint: 'Подложка модальных окон',
      group: 'lms',
      dark: '#14141440',
    },

    // --- Taiga UI ---
    {
      name: '--tui-background-base',
      label: 'Базовый фон',
      hint: 'Фон компонентов Taiga',
      group: 'taiga',
      dark: '#222',
    },
    {
      name: '--tui-background-base-alt',
      label: 'Базовый фон, вариант',
      hint: 'Чередующиеся строки, подложки',
      group: 'taiga',
      dark: '#333',
    },
    {
      name: '--tui-background-elevation-1',
      label: 'Приподнятый фон 1',
      hint: 'Карточки Taiga',
      group: 'taiga',
      dark: '#292929',
    },
    {
      name: '--tui-background-elevation-2',
      label: 'Приподнятый фон 2',
      hint: 'Выпадающие списки',
      group: 'taiga',
      dark: '#2f2f2f',
    },
    {
      name: '--tui-background-elevation-3',
      label: 'Приподнятый фон 3',
      hint: 'Подсказки поверх всего',
      group: 'taiga',
      dark: '#373737',
    },
    {
      name: '--tui-background-accent-1',
      label: 'Акцентный фон',
      hint: 'Главные кнопки Taiga',
      group: 'taiga',
      dark: '#526ed3',
    },
    {
      name: '--tui-background-neutral-1',
      label: 'Нейтральный фон 1',
      hint: 'Вторичные кнопки, чипы',
      group: 'taiga',
      dark: 'rgba(255, 255, 255, 0.08)',
    },
    {
      name: '--tui-background-neutral-2',
      label: 'Нейтральный фон 2',
      hint: 'Более заметные плашки',
      group: 'taiga',
      dark: 'rgba(255, 255, 255, 0.24)',
    },
    {
      name: '--tui-text-primary',
      label: 'Текст компонентов',
      hint: 'Основной текст Taiga',
      group: 'taiga',
      dark: '#ffffff',
    },
    {
      name: '--tui-text-secondary',
      label: 'Второстепенный текст',
      hint: 'Подписи полей',
      group: 'taiga',
      dark: 'rgba(255, 255, 255, 0.72)',
    },
    {
      name: '--tui-text-tertiary',
      label: 'Приглушённый текст',
      hint: 'Плейсхолдеры',
      group: 'taiga',
      dark: 'rgba(255, 255, 255, 0.6)',
    },
    {
      name: '--tui-text-action',
      label: 'Текст-действие',
      hint: 'Ссылки и текстовые кнопки',
      group: 'taiga',
      dark: '#6788ff',
    },
    {
      name: '--tui-text-positive',
      label: 'Текст успеха',
      hint: 'Зелёные подписи',
      group: 'taiga',
      dark: '#44c596',
    },
    {
      name: '--tui-text-negative',
      label: 'Текст ошибки',
      hint: 'Красные подписи',
      group: 'taiga',
      dark: '#ff8c67',
    },
    {
      name: '--tui-status-positive',
      label: 'Статус «успех»',
      hint: 'Зелёные чипы и иконки',
      group: 'taiga',
      dark: '#4ac99b',
    },
    {
      name: '--tui-status-negative',
      label: 'Статус «ошибка»',
      hint: 'Красные чипы',
      group: 'taiga',
      dark: '#ff8c67',
    },
    {
      name: '--tui-status-warning',
      label: 'Статус «внимание»',
      hint: 'Жёлтые чипы',
      group: 'taiga',
      dark: '#ffc700',
    },
    {
      name: '--tui-status-info',
      label: 'Статус «информация»',
      hint: 'Синие чипы',
      group: 'taiga',
      dark: '#70b6f6',
    },
    {
      name: '--tui-border-normal',
      label: 'Рамка компонентов',
      hint: 'Границы полей Taiga',
      group: 'taiga',
      dark: 'rgba(255, 255, 255, 0.14)',
    },
    {
      name: '--tui-border-hover',
      label: 'Рамка под курсором',
      hint: 'Поле при наведении',
      group: 'taiga',
      dark: 'rgba(255, 255, 255, 0.6)',
    },
    {
      name: '--tui-border-focus',
      label: 'Рамка в фокусе',
      hint: 'Поле с курсором',
      group: 'taiga',
      dark: 'rgba(255, 255, 255, 0.64)',
    },

    // --- наша тёмная тема ---
    {
      name: '--culms-dark-bg-primary',
      label: 'Основной фон',
      hint: 'Полотно страницы, шапка, левое меню',
      group: 'dark',
      dark: 'rgb(32, 33, 36)',
    },
    {
      name: '--culms-dark-bg-secondary',
      label: 'Фон карточек',
      hint: 'Карточки курсов, таблицы, диалоги',
      group: 'dark',
      dark: 'rgb(40, 41, 44)',
    },
    {
      name: '--culms-dark-bg-hover',
      label: 'Фон под курсором',
      hint: 'Строка таблицы или пункт меню при наведении',
      group: 'dark',
      dark: 'rgb(50, 51, 54)',
    },
    {
      name: '--culms-dark-bg-hover-light',
      label: 'Фон под курсором, светлее',
      hint: 'Второй уровень подсветки',
      group: 'dark',
      dark: 'rgb(55, 56, 60)',
    },
    {
      name: '--culms-dark-text-primary',
      label: 'Основной текст',
      hint: 'Заголовки и тело страницы',
      group: 'dark',
      dark: 'rgb(255, 255, 255)',
    },
    {
      name: '--culms-dark-text-secondary',
      label: 'Второстепенный текст',
      hint: 'Подписи, пункты меню',
      group: 'dark',
      dark: '#e8eaed',
    },
    {
      name: '--culms-dark-text-tertiary',
      label: 'Приглушённый текст',
      hint: 'Даты, служебные пометки',
      group: 'dark',
      dark: '#bdc1c6',
    },
    {
      name: '--culms-dark-text-link-hover',
      label: 'Ссылка под курсором',
      hint: 'Ссылки в меню и лонгридах',
      group: 'dark',
      dark: '#8ab4f8',
    },
    {
      name: '--culms-dark-border-primary',
      label: 'Рамка',
      hint: 'Границы карточек и таблиц',
      group: 'dark',
      dark: 'rgb(55, 56, 60)',
    },
    {
      name: '--culms-dark-border-secondary',
      label: 'Рамка, заметнее',
      hint: 'Разделители внутри карточек',
      group: 'dark',
      dark: 'rgb(70, 71, 74)',
    },
    {
      name: '--culms-dark-border-hover',
      label: 'Рамка под курсором',
      hint: 'Карточка при наведении',
      group: 'dark',
      dark: 'rgb(85, 86, 90)',
    },
    {
      name: '--culms-dark-border-hover-light',
      label: 'Рамка под курсором, светлее',
      hint: 'Поля ввода при наведении',
      group: 'dark',
      dark: 'rgb(138, 142, 147)',
    },
    {
      name: '--culms-dark-status-positive',
      label: 'Статус «сдано»',
      hint: 'Зелёные плашки заданий',
      group: 'dark',
      dark: '#1e8e3e',
    },
    {
      name: '--culms-dark-status-negative',
      label: 'Статус «просрочено»',
      hint: 'Красные плашки заданий',
      group: 'dark',
      dark: '#d93025',
    },
    {
      name: '--culms-dark-status-in-progress',
      label: 'Статус «в работе»',
      hint: 'Жёлтые плашки заданий',
      group: 'dark',
      dark: '#f9ab00',
    },
    {
      name: '--culms-dark-status-neutral',
      label: 'Статус «нейтральный»',
      hint: 'Синие плашки',
      group: 'dark',
      dark: '#4285f4',
    },
    {
      name: '--culms-dark-status-backlog',
      label: 'Статус «не начато»',
      hint: 'Серые плашки',
      group: 'dark',
      dark: '#3c4043',
    },
    {
      name: '--culms-dark-status-chip-bg',
      label: 'Фон плашки статуса',
      hint: 'Подложка чипов в ведомостях',
      group: 'dark',
      dark: 'rgb(50, 51, 54)',
    },
    {
      name: '--culms-status-solved',
      label: 'Статус «решено»',
      hint: 'Отметка решённой задачи в контесте',
      group: 'dark',
      dark: '#4caf50',
    },
    {
      name: '--culms-dark-bg-seminar',
      label: 'Фон семинара',
      hint: 'Занятия в расписании',
      group: 'dark',
      dark: 'rgb(20, 20, 20)',
    },
    {
      name: '--culms-dark-scrollbar-thumb',
      label: 'Ползунок прокрутки',
      hint: 'Полоса прокрутки страницы',
      group: 'dark',
      dark: 'rgb(80, 81, 84)',
    },
    {
      name: '--culms-dark-scrollbar-track',
      label: 'Дорожка прокрутки',
      hint: 'Подложка полосы прокрутки',
      group: 'dark',
      dark: 'rgb(50, 51, 54)',
    },
  ];

  const BY_NAME = new Map(TOKENS.map((token) => [token.name, token]));

  // Свой CSS человек пишет сам, но в хранилище он попадает целиком, а оттуда —
  // в профиль темы, которым делятся. Ограничение держит файл вменяемого
  // размера и отсекает случайную вставку чего-то огромного.
  const CSS_MAX = 200 * 1024;

  /**
   * Приводит значение переменной к тому, что можно безопасно подставить в
   * объявление. `;` и `}` закрыли бы правило раньше времени и сломали весь
   * блок, `!important` мы дописываем сами.
   */
  function normalizeValue(raw) {
    if (typeof raw !== 'string') return null;
    const value = raw
      .replace(/[;{}]/g, ' ')
      .replace(/!\s*important/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!value || value.length > 120) return null;
    return value;
  }

  /** Отбрасывает незнакомые переменные и кривые значения. */
  function normalizeVars(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const result = {};
    Object.entries(raw).forEach(([name, value]) => {
      if (!BY_NAME.has(name)) return;
      const normalized = normalizeValue(value);
      if (normalized) result[name] = normalized;
    });
    return result;
  }

  function normalizeCss(raw) {
    if (typeof raw !== 'string') return '';
    return raw.length > CSS_MAX ? raw.slice(0, CSS_MAX) : raw;
  }

  /**
   * Собирает стиль темы. Селектор широкий не для красоты: Taiga объявляет свои
   * переменные и на `:root`, и на `[tuiTheme]`, и объявление на вложенном
   * элементе перебило бы унаследованное с корня.
   */
  function buildCss(vars, extraCss) {
    const entries = Object.entries(normalizeVars(vars));
    let out = '';

    if (entries.length) {
      const declarations = entries.map(([name, value]) => `  ${name}: ${value} !important;`);
      out += ':root,\n:host,\n[tuiTheme] {\n' + declarations.join('\n') + '\n}\n';
    }

    const css = normalizeCss(extraCss).trim();
    if (css) out += (out ? '\n' : '') + '/* свои правила */\n' + css + '\n';

    return out;
  }

  window.cuLmsThemeTokens = {
    VERSION,
    GROUPS,
    TOKENS,
    CSS_MAX,
    byName: (name) => BY_NAME.get(name) || null,
    isKnown: (name) => BY_NAME.has(name),
    normalizeValue,
    normalizeVars,
    normalizeCss,
    buildCss,
  };
}
