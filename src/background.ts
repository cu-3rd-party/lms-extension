// background.ts
import browser from 'webextension-polyfill';
import type { PluginManifest } from './plugins/types';
import { DEFAULT_LMS_ORIGIN, isLmsUrl, lmsOriginOf } from './plugins/lms-hosts';
import { fetchAllGradesForExport } from './grades-export';

// У LMS два домена с раздельными сессиями, поэтому фоновые запросы идут на тот,
// где пользователь сейчас работает: cookie другого домена нам недоступны и
// запрос вернул бы 401. Origin запоминается при каждой навигации и переживает
// перезапуск service worker через storage.
const LMS_ORIGIN_KEY = 'lmsOrigin';
let lmsOrigin = DEFAULT_LMS_ORIGIN;

const lmsApi = (path: string) => lmsOrigin + path;

function rememberLmsOrigin(url: string): void {
  const origin = lmsOriginOf(url);
  if (!origin || origin === lmsOrigin) return;

  lmsOrigin = origin;
  void browser.storage.local.set({ [LMS_ORIGIN_KEY]: origin });
}

void browser.storage.local.get(LMS_ORIGIN_KEY).then((data) => {
  const saved = data?.[LMS_ORIGIN_KEY];
  if (typeof saved === 'string' && isLmsUrl(saved + '/')) lmsOrigin = saved;
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CalendarSessionConfig {
  ckey: string;
  uid: string;
  timezone: string;
}

interface MailSessionConfig {
  ckey: string;
  uid: string;
}

interface CalendarEvent {
  start: string;
  end: string;
  name?: string;
  subject?: string;
  decision?: string;
  availability?: string;
  hidden?: boolean;
}

interface Contact {
  name: string;
  email: string;
  avatar: string;
}

/** Raw contact shape returned by Yandex Mail abook API */
interface RawApiContact {
  email: Array<{ value: string }>;
  name: { full?: string; first?: string; last?: string };
  monogram?: string;
}

interface TimeBlock {
  start: Date;
  end: Date;
}

type ScheduleResult =
  | { success: true; schedule: Record<string, string>; weekStart: string }
  | { success: false; error: string };

type IncomingMessage =
  | { action: 'fetchGistContent'; url: string }
  | { action: 'FETCH_JSON'; url: string }
  | {
      action: 'SWAP_API';
      method: string;
      url: string;
      body?: unknown;
      headers?: Record<string, string>;
    }
  | { action: 'SEARCH_CONTACTS'; query: string }
  | { action: 'ANALYZE_SUBJECTS'; email: string }
  | { action: 'GET_WEEKLY_SCHEDULE'; email: string; date?: string }
  | { action: 'GET_CALENDAR_LINK'; email: string }
  | { action: 'TABS_QUERY'; options: browser.Tabs.QueryQueryInfoType }
  | { action: 'TABS_UPDATE'; tabId: number; options: browser.Tabs.UpdateUpdatePropertiesType }
  | { action: 'TABS_RELOAD'; tabId: number; options: browser.Tabs.ReloadReloadPropertiesType }
  | { action: 'TABS_SEND_MESSAGE'; tabId: number; message: unknown }
  | { action: 'OPEN_PDF_VIEWER'; url: string; filename: string }
  | { action: 'OPEN_THEME_EDITOR' }
  | { action: 'GRADES_EXPORT_EXECUTE'; tabId?: number; archived?: boolean }
  | { action: 'SAFARI_NAVIGATION'; url: string }
  | { action: string; [key: string]: unknown };

// Единственный внешний хост, куда background пускает запросы биржи обмена
// парами. https://github.com/cu-3rd-party/lms-swap-backend
const SWAP_BACKEND_ORIGIN = 'https://lms.swap.cu3rd.ru';

// --- PLUGIN AUTO-DISCOVERY ---
// All index.manifest.ts files are picked up automatically at build time.
// Adding a new plugin = creating a new plugins/<name>/index.manifest.ts file.
const pluginModules = import.meta.glob<{ default: PluginManifest }>(
  './plugins/*/index.manifest.ts',
  { eager: true }
);
const plugins = Object.values(pluginModules).map((m) => m.default);

// --- СПИСОК ПРЕДМЕТОВ (2024–2026, все направления) ---
const SUBJECTS_LIST = [
  // === Разработка (2024–2026) ===
  'Алгоритмы и структуры данных 2',
  'Алгоритмы и структуры данных 2. Продвинутый уровень',
  'Алгоритмы и структуры данных',
  'Архитектура компьютера и операционные системы 2',
  'Архитектура компьютера и операционные системы',
  'Архитектура операционных систем',
  'Архитектура виртуальных машин',
  'Архитектура ПО',
  'Архитектура СУБД',
  'АКОС I',
  'АКОС II',
  'Многопоточная синхронизация',
  'Дискретная математика',
  'Основы промышленной разработки',
  'Основы разработки на Go',
  'Информационная безопасность',
  'Безопасность веб-приложений',
  'Безопасность WEB приложений',
  'Безопасность компьютерных сетей',
  'Методы дискретной оптимизации',
  'Web-разработка',
  'Разработка на С++',
  'Разработка на С++ Часть 2',
  'Разработка на C++',
  'Разработка на Java',
  'Разработка на RUST',
  'Разработка на Python',
  'Разработка на Kotlin',
  'Программирование C++',
  'Программирование RUST',
  'Программирование Java',
  'Rocq',
  'Основы фронтенд-разработки',
  'Промышленная фронтенд-разработка',
  'Технологии фронтенд-разработки',
  'Бэкенд-разработка',
  'Язык программирования Python. Базовый',
  'Язык программирования Java 1',
  'Язык программирования С++ 1',
  'Язык программирования Go',
  'Java Spring',
  'SRE и облачные технологии',
  'SRE',
  'Мобильная разработка для iOS',
  'Мобильная разработка для Android',
  'Мобильная разработка на Android',
  'Мобильная разработка Flutter',
  'Мобильная разработка React Native',
  'Компьютерные сети',
  'Основы компьютерных сетей',
  'Распределенные системы',
  'Системы обработки больших данных',
  'Дизайн компиляторов',
  'Теория формальных языков',
  'Прикладная криптография',
  'Криптография',

  // === Бизнес и аналитика (2024–2026) ===
  'Введение в экономику. Основной уровень',
  'Введение в экономику. Продвинутый уровень',
  'Введение в экономику. Продвинутый',
  'Введение в экономику',
  'Introduction to Economics. Advanced',
  'Introduction to Economics',
  'Основы бизнес-аналитики. Основной уровень',
  'Основы бизнес-аналитики. Продвинутый уровень',
  'Основы бизнес-аналитики. Продвинутый',
  'Основы бизнес-аналитики',
  'Fundamentals of Business Analytics. Advanced',
  'Fundamentals of Business Analytics',
  'Введение в алгоритмы и структуры данных',
  'Макроэкономика I. Основной уровень',
  'Макроэкономика I. Продвинутый уровень',
  'Макроэкономика. Продвинутый уровень',
  'Макроэкономика',
  'Микроэкономика. Продвинутый уровень',
  'Микроэкономика',
  'Основы финансов. Продвинутый уровень',
  'Основы финансов',
  'Fundamentals of Finance',
  'Основы маркетинга',
  'Теория игр. Основной уровень',
  'Теория игр. Продвинутый уровень',
  'Теория игр',
  'Финансы. Основной уровень',
  'Финансы. Продвинутый уровень',
  'Эконометрика I. Основной уровень',
  'Эконометрика I. Продвинутый уровень',
  'Эконометрика. Продвинутый уровень',
  'Эконометрика',
  'Математическая статистика. Основной уровень',
  'Математическая статистика. Продвинутый уровень',
  'Математическая статистика',
  'SQL и базы данных',
  'Инвестиционный анализ. Продвинутый уровень',
  'Инвестиционный анализ',
  'Теория вероятностей и математическая статистика',
  'Теория вероятностей. Основной уровень',
  'Теория вероятностей. Базовый уровень',
  'Математика для экономистов',
  'Институциональная экономика',
  'Временные ряды и панельные данные. Продвинутый уровень',
  'Временные ряды и панельные данные',
  'Поведенческая экономика и финансы',
  'Сетевой анализ',
  'Теория отраслевой организации',
  'Продвинутое макроэкономическое моделирование',
  'Основы финансовой и управленческой отчётности',
  'Оценка стоимости бизнеса',
  'Портфельные инвестиции',
  'Риск-менеджмент',
  'Количественные финансы',
  'Прямые инвестиции и венчурный капитал (PE&VC)',
  'Прямые инвестиции и венчурный капитал',
  'Продуктовая аналитика',
  'Визуализация',
  'А/Б тестирование',
  'Машинное обучение в бизнесе',
  'Машинное обучение (ML)',
  'ИИ для аналитиков',
  'Продуктовый менеджмент',
  'Проектный менеджмент',
  'Системный анализ',
  'Стратегический менеджмент',
  'Продуктовый дизайн',
  'Продвинутый маркетинг',
  'Growth-менеджмент и управление ML-продуктами',
  'Кейс-вечера',
  'Экономическое моделирование',

  // === Искусственный интеллект (2024–2026) ===
  'Введение в искусственный интеллект. Основной уровень',
  'Введение в искусственный интеллект. Продвинутый уровень',
  'Введение в искусственный интеллект',
  'Введение в статистику. Основной уровень',
  'Введение в статистику. Продвинутый уровень',
  'Введение в статистику',
  'Базы данных',
  'Deep Learning',
  'Python для машинного обучения',
  'Машинное обучение',
  'Глубокое обучение',
  'Теория вероятностей',
  'Методы непрерывной оптимизации',
  'Методы выпуклой оптимизации',
  'Анализ графов',
  'Безопасность систем ИИ',
  'Введение в низкоуровневое программирование',
  'Временные ряды',
  'Генеративные модели',
  'Дифференциальные уравнения',
  'Инженерия данных 1',
  'Инженерия данных 2',
  'Инженерия данных',
  'Компьютерное зрение',
  'Обработка естественного языка',
  'Обучение с подкреплением',
  'Платформы данных',
  'Проектирование систем машинного обучения',
  'Продвинутая статистика',
  'Разработка интеллектуальных агентов',
  'Рекомендательные системы',
  'Робототехника и физическое машинное обучение',
  'Сигналы и звук',
  'Современные методы статистики',
  'Соревновательный анализ данных',
  'Теория управления',
  'Эксплуатация и внедрение моделей машинного обучения',
  'Эффективное машинное обучение',

  // === Математика ===
  'Основы математического анализа и линейной алгебры 2',
  'Основы математического анализа и линейной алгебры',
  'Математический анализ 2. Основной уровень',
  'Математический анализ 2. Пилотный поток',
  'Математический анализ 2. Продвинутый уровень',
  'Математический анализ. Основной уровень',
  'Математический анализ. Пилотный поток',
  'Линейная алгебра и геометрия 2. Основной уровень',
  'Линейная алгебра и геометрия 2. Пилотный поток',
  'Линейная алгебра и геометрия 2',
  'Линейная алгебра и геометрия. Пилотный поток',
  'Линейная алгебра и геометрия',
  'Алгебра',
  'Дополнительные главы математического анализа',

  // === STEM ===
  'Бизнес-студия',
  'Business Studio',
  'Искусство и наука',
  'Научная студия. Вычислительная онкология',
  'Научная студия. В поисках нейтронов',
  'Научная студия. Лечение на Гамма-ноже',
  'Научная студия. Переменные звезды',
  'Научная студия. Перколяция: от лесных пожаров до нефтегазовых резервуаров',
  'Научная студия. Поиск экспортных рынков',
  'Научная студия. Поиск экспортных рынтов',
  'Научная студия. Стратегия управления кадровой динамикой учителей в РФ',
  'Научная студия. Умный дом',
  'Научная студия: Термоядерные реакции и неуловимые нейтроны',
  'Научная студия: Стратегия управления кадровой динамикой',
  'Научная студия: Поиск экспортных рынков',
  'Научная студия: Переменные звезды',
  'Научная студия: Умный дом',
  'Научная студия',
  'Нейронауки и нейроинтерфейсы',
  'Квантовые технологии в действии',
  'Квантовые алгоритмы',
  'Проблемы атомной и пищевой индустрии',
  'Атомные технологии в пищевой и энергетической промышленности',
  'ТАКТ - Теория и архитектура компьютерных технологий',
  'Теория и архитектура компьютерных технологий',
  'Прикладные социальные науки',
  'Инновации: от идеи к решению',
  'Теоретические компьютерные науки',
  'Нейробиология выбора',
  'Медицинская биофизика',
  'Прототипирование устройств для биофотоники',
  'Управление на основе данных в реальных отраслях',
  'Транспортное моделирование',
  'Биотехнологии: от ДНК до готового продукта',
  'Цифровизация производства: данные, модели процессов и надежность',
  'Студия компьютерных наук',
  'Философия и наука',

  // === Soft skills ===
  'Выбор: Алгоритмы принятия решений',
  'Алгоритмы принятия решений',
  'Командная работа по Agile',
  'Креативные методики решения задач',
  'Креативные техники решения задач',
  'Публичные выступления и основы презентации',
  'Системное и критическое мышление',
  'Развитие мышления: от критического к системному',
  'Стратегическое мышление',
  'Стресс-менеджмент и эмоциональный интеллект',
  'Работа в команде и коллаборация',
  'Управление ресурсами: личная эффективность',
  'Управление личными ресурсами',
  'Целеполагание, планирование и самоорганизация',
  'Ясность в текстах',
  'Победа в переговорах',
  'Лидерство и внедрение изменений',
  'Интенсив по софтам от топов ЦУ',

  // === Образовательный стандарт ===
  'Физкультура и спорт',
  'Физическая культура',
  'Безопасность жизнедеятельности',
  'Основы российской государственности',
  'Философия',
  'Иностранный язык (английский)',
  'Английский язык 101S2',
  'Английский язык 102S2',
  'Английский язык 103S2',
  'Английский язык 103S2B',
  'Английский язык 104S2',
  'Английский язык 104S2B',
  'Английский язык 105S2',
  'Английский язык 105S2B',
  'Английский язык 202S4',
  'Английский язык 203S4',
  'Английский язык 204S4',
  'Английский язык 204S4B',
  'История России',

  // === Humanities ===
  'Этика. Право. ИИ',
  'Как понимать кино?',
  'Чёрные ящики и цифровые агенты: социология искусственного интеллекта на практике',
];

const YandexServices = {
  // --- CALENDAR SERVICE ---
  Calendar: {
    async getEvents(email: string, daysAhead = 30): Promise<CalendarEvent[]> {
      if (!email) throw new Error('Email обязателен');
      const session = await this._getSessionConfig();
      const now = new Date();
      const future = new Date();
      future.setDate(now.getDate() + daysAhead);
      return await this._fetchEvents(email, session, now, future);
    },

    async getPublicLink(email: string): Promise<string> {
      // Мы убрали try-catch и fallback-ссылку.
      // Если сессии нет, _getSessionConfig выбросит ошибку, и фронтенд покажет просьбу войти.
      const session = await YandexServices.Mail._getSessionConfig();
      const url = `https://mail.yandex.ru/web-api/models/liza1?_m=get-public-id`;
      const payload = {
        models: [{ name: 'get-public-id', params: { email: email }, meta: { requestAttempt: 1 } }],
        _ckey: session.ckey,
        _uid: session.uid,
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include', // <--- ДОБАВИТЬ ЭТУ СТРОКУ
      });
      const json = await response.json();
      const data = json.models?.[0]?.data;

      if (data && data.public_id) {
        return `https://calendar.yandex.ru/schedule/public/${data.public_id}?uid=${session.uid}`;
      }

      // Если публичного ID нет, выбрасываем ошибку, чтобы на фронте открылось сообщение
      throw new Error('Не удалось получить публичную ссылку или нет доступа');
    },

    // === ФУНКЦИЯ АНАЛИЗА РАСПИСАНИЯ ===
    // === ФУНКЦИЯ АНАЛИЗА РАСПИСАНИЯ ===
    // Добавили аргумент targetDate
    async analyzeSchedule(
      email: string,
      targetDate: string | null = null
    ): Promise<ScheduleResult> {
      try {
        const session = await this._getSessionConfig();

        // 1. УСТАНАВЛИВАЕМ ДАТУ
        // Если дата передана с фронта — используем её, иначе берем текущую
        const datePoint = targetDate ? new Date(targetDate) : new Date();

        // УБРАЛИ СТРОКУ: datePoint.setDate(datePoint.getDate() - 35);
        // Теперь мы смотрим ровно ту дату, которую запросили (текущую)

        // Находим понедельник этой недели
        const day = datePoint.getDay() || 7;
        datePoint.setDate(datePoint.getDate() - (day - 1));
        datePoint.setHours(0, 0, 0, 0);

        const startOfWeek = new Date(datePoint);
        const endOfWeek = new Date(datePoint);
        endOfWeek.setDate(endOfWeek.getDate() + 7);

        // 2. ПОЛУЧАЕМ СОБЫТИЯ
        const eventsRaw = await this._fetchEvents(email, session, startOfWeek, endOfWeek);

        // 3. ФИЛЬТРАЦИЯ И ПАРСИНГ
        const events = (eventsRaw || []).filter(
          (e) =>
            //!e.hidden && // ну типа скрытые меро. но политика вуза пока непонятна, оставим так
            e.decision !== 'no' && e.availability !== 'free'
        );

        const schedule: Record<string, string> = {};
        const daysMap = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

        for (let i = 0; i < 6; i++) {
          const currentDay = new Date(startOfWeek);
          currentDay.setDate(startOfWeek.getDate() + i);

          const dayEvents = events.filter((e) => {
            const eStart = new Date(e.start);
            return (
              eStart.getDate() === currentDay.getDate() &&
              eStart.getMonth() === currentDay.getMonth()
            );
          });

          if (dayEvents.length === 0) {
            schedule[daysMap[currentDay.getDay()]!] = 'Свободен';
            continue;
          }

          // Сортируем
          dayEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

          // Склеиваем
          const merged: TimeBlock[] = [];
          if (dayEvents.length > 0) {
            let current: TimeBlock = {
              start: new Date(dayEvents[0]!.start),
              end: new Date(dayEvents[0]!.end),
            };

            for (let k = 1; k < dayEvents.length; k++) {
              const nextEv: TimeBlock = {
                start: new Date(dayEvents[k]!.start),
                end: new Date(dayEvents[k]!.end),
              };

              const gap = (nextEv.start.getTime() - current.end.getTime()) / (1000 * 60);

              if (nextEv.start.getTime() <= current.end.getTime() || gap < 15) {
                if (nextEv.end.getTime() > current.end.getTime()) current.end = nextEv.end;
              } else {
                merged.push(current);
                current = nextEv;
              }
            }
            merged.push(current);
          }

          // Форматируем
          const totalStart = merged[0]!.start.toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
          });
          const totalEnd = merged[merged.length - 1]!.end.toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
          });

          let resultString = `${totalStart} - ${totalEnd}`;

          const breaks = [];
          for (let m = 0; m < merged.length - 1; m++) {
            const breakStart = merged[m]!.end;
            const breakEnd = merged[m + 1]!.start;
            const diffMins = (breakEnd.getTime() - breakStart.getTime()) / (1000 * 60);

            if (diffMins >= 20) {
              const bs = breakStart.toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit',
              });
              const be = breakEnd.toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit',
              });
              breaks.push(`${bs}-${be}`);
            }
          }

          if (breaks.length > 0) {
            resultString += ` (окна: ${breaks.join(', ')})`;
          }

          schedule[daysMap[currentDay.getDay()]!] = resultString;
        }

        return {
          success: true,
          schedule: schedule,
          weekStart: startOfWeek.toLocaleDateString('ru-RU'),
        };
      } catch (e) {
        console.error('Schedule error:', e);
        return { success: false, error: (e as Error).message };
      }
    },

    async analyzeSubjects(email: string): Promise<string[] | null> {
      try {
        const session = await this._getSessionConfig();

        const end = new Date();
        const start = new Date();

        start.setDate(start.getDate() - 30);
        end.setDate(end.getDate() + 30);

        const events = await this._fetchEvents(email, session, start, end);
        const foundSubjects = new Set<string>();

        if (!events || events.length === 0) return [];

        const sortedSubjects = [...SUBJECTS_LIST].sort((a, b) => b.length - a.length);

        events.forEach((event) => {
          const rawTitle = (event.name || event.subject || '').trim();
          if (!rawTitle) return;

          let cleanTitle = rawTitle;

          cleanTitle = cleanTitle.replace(/^[^a-zA-Zа-яА-ЯёЁ0-9]+/, '');
          cleanTitle = cleanTitle.replace(/^Зачет\.?\s*/i, '');
          cleanTitle = cleanTitle.replace(/[—–−]/g, '-');
          cleanTitle = cleanTitle.replace(/\s+/g, ' ');
          cleanTitle = cleanTitle.toLowerCase().trim();

          if (!cleanTitle) return;

          const englishGroupMatch = cleanTitle.match(
            /^английский язык\s+([a-z]*[0-9]+s[0-9]+(?:[a-z])?(?:-[0-9]+[a-z]?)?)/
          );

          if (englishGroupMatch) {
            const group = englishGroupMatch[1]!.toUpperCase();
            foundSubjects.add(`Английский язык ${group}`);
            return;
          }

          for (const subject of sortedSubjects) {
            let normalizedSubject = subject
              .toLowerCase()
              .replace(/[—–−]/g, '-')
              .replace(/\s+/g, ' ')
              .trim();

            if (cleanTitle.startsWith(normalizedSubject)) {
              foundSubjects.add(subject);
              break;
            }
          }
        });

        const hasSpecificEnglish = Array.from(foundSubjects).some(
          (s) => s.startsWith('Английский язык') && s.length > 'Английский язык'.length
        );

        if (hasSpecificEnglish) {
          foundSubjects.delete('Английский язык');
        }

        return Array.from(foundSubjects).sort();
      } catch (e) {
        console.error('Subject analysis error:', e);
        // ВАЖНО: Возвращаем null при ошибке, чтобы фронтенд понял, что это сбой сети/auth
        return null;
      }
    },

    async _getSessionConfig(): Promise<CalendarSessionConfig> {
      const uid = await YandexServices._getCookie('yandexuid', 'https://calendar.yandex.ru');
      if (!uid) throw new Error('Нет авторизации в Яндекс Календаре');

      const response = await fetch(`https://calendar.yandex.ru/?uid=${uid}`, {
        credentials: 'include', // <--- ДОБАВИТЬ ЭТУ СТРОКУ
      });
      const text = await response.text();

      const matchCkey = text.match(/"ckey"\s*:\s*"([^"]+)"/);
      if (!matchCkey) throw new Error('Не удалось получить ключ API Календаря (ckey)');

      return { ckey: matchCkey[1]!, uid: uid, timezone: 'Europe/Moscow' };
    },

    async _fetchEvents(
      email: string,
      session: CalendarSessionConfig,
      start: Date,
      end: Date
    ): Promise<CalendarEvent[]> {
      const dateFormat = (d: Date): string => d.toISOString().split('T')[0]!;
      const url = `https://calendar.yandex.ru/api/models?_models=get-events-by-login`;
      const cid = `MAYA-${Math.floor(Math.random() * 100000000)}-${Date.now()}`;

      const payload = {
        models: [
          {
            name: 'get-events-by-login',
            params: {
              limitAttendees: true,
              login: email,
              opaqueOnly: true,
              email: email,
              from: dateFormat(start),
              to: dateFormat(end),
            },
          },
        ],
      };

      const headers = {
        'Content-Type': 'application/json',
        'x-requested-with': 'XMLHttpRequest',
        'x-yandex-maya-ckey': session.ckey,
        'x-yandex-maya-uid': session.uid,
        'x-yandex-maya-cid': cid,
        'x-yandex-maya-user-agent': 'maya-frontend',
        'x-yandex-maya-locale': 'ru',
        'x-yandex-maya-timezone': session.timezone,
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
        credentials: 'include', // <--- ДОБАВИТЬ ЭТУ СТРОКУ
      });

      if (!response.ok) throw new Error(`Network error: ${response.status}`);

      const json = await response.json();
      const model = json.models?.[0];

      if (model?.status === 'error') {
        if (model.error === 'ckey')
          throw new Error('Ключ ckey недействителен. Обновите календарь.');
        console.error('API Error details:', model.error);
        throw new Error(`API Error: ${JSON.stringify(model.error)}`);
      }

      return model?.data?.events || [];
    },
  },

  // --- MAIL SERVICE ---
  // --- MAIL SERVICE ---
  Mail: {
    async searchContacts(query: string): Promise<Contact[]> {
      if (!query || query.length < 3) return [];

      // Попробуем выполнить запрос до 2 раз
      const maxRetries = 2;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // Каждый раз получаем свежий конфиг, чтобы ckey был актуальным
          const session = await this._getSessionConfig();
          return await this._fetchContacts(query, session);
        } catch (e) {
          // Если ошибка именно в невалидном ключе (ckey), пробуем снова
          if ((e as Error).message === 'INVALID_CKEY') {
            console.warn(`[Mail] Ckey устарел. Попытка ${attempt} из ${maxRetries}...`);
            if (attempt === maxRetries) return []; // Если попытки кончились, возвращаем пустоту
            // Иначе цикл продолжится, получит новый session и повторит запрос
            continue;
          }

          // Если другая ошибка — выводим в консоль и выходим
          console.error('Search contacts error:', e);
          return [];
        }
      }
      return [];
    },

    async _getSessionConfig(): Promise<MailSessionConfig> {
      const uid = await YandexServices._getCookie('yandexuid', 'https://mail.yandex.ru');
      if (!uid) throw new Error('Нет авторизации в Яндекс Почте');

      // Запрос страницы для получения актуального ckey
      const response = await fetch(`https://mail.yandex.ru/?uid=${uid}`);
      const text = await response.text();

      const matchCkey = text.match(/"ckey":\s*"([^"]+)"/);
      if (!matchCkey) throw new Error('Не удалось получить ключ API Почты');

      return { ckey: matchCkey[1]!, uid: uid };
    },

    async _fetchContacts(query: string, session: MailSessionConfig): Promise<Contact[]> {
      const url = `https://mail.yandex.ru/web-api/models/liza1?_m=abook-contacts`;
      const payload = {
        models: [
          {
            name: 'abook-contacts',
            params: { pagesize: '10', q: query, type: 'normal' },
            meta: { requestAttempt: 1 },
          },
        ],
        _ckey: session.ckey,
        _uid: session.uid,
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include', // <--- ДОБАВИТЬ ЭТУ СТРОКУ
      });

      if (!response.ok) throw new Error(`Network error: ${response.status}`);

      const json = await response.json();
      const model = json.models?.[0];

      // --- ДОБАВЛЕНА ОБРАБОТКА ОШИБОК CKEY ---
      if (model && model.status === 'error') {
        if (model.error === 'ckey') {
          throw new Error('INVALID_CKEY'); // Сигнал для searchContacts, что надо повторить
        }
        // Другие ошибки API игнорируем или логируем, но возвращаем пустой список
        console.error('Mail API Error:', model.error);
        return [];
      }
      // ----------------------------------------

      const contacts: RawApiContact[] = model?.data?.contact ?? [];

      return contacts
        .filter((c) => c.email && c.email.length > 0)
        .map((c) => ({
          name: c.name.full ?? `${c.name.first ?? ''} ${c.name.last ?? ''}`.trim(),
          email: c.email[0]!.value,
          avatar: c.monogram ?? '',
        }));
    },
  },

  async _getCookie(name: string, url: string): Promise<string | null> {
    try {
      const cookie = await browser.cookies.get({ url, name });
      return cookie ? cookie.value : null;
    } catch (e) {
      return null;
    }
  },
};

const AkhCheckServices = {
  _cachedToken: null as string | null,
  _cachedRefresh: null as string | null,

  // Обещание (Promise) рефреша, чтобы параллельные запросы ждали один общий ответ,
  // а не спамили сервер кучей попыток обновить токен одновременно
  _refreshPromise: null as Promise<string | null> | null,

  async getTokens(): Promise<{ access: string | null; refresh: string | null }> {
    if (this._cachedToken) return { access: this._cachedToken, refresh: this._cachedRefresh };

    const res = await browser.storage.local.get(['akh_token', 'akh_refresh_token']);
    this._cachedToken = res.akh_token || null;
    this._cachedRefresh = res.akh_refresh_token || null;

    return { access: this._cachedToken, refresh: this._cachedRefresh };
  },

  async saveTokens(access: string, refresh: string | null) {
    this._cachedToken = access;
    if (refresh) this._cachedRefresh = refresh;

    const dataToSave: Record<string, string> = { akh_token: access };
    if (refresh) dataToSave.akh_refresh_token = refresh;

    await browser.storage.local.set(dataToSave);
  },

  async clearTokens() {
    this._cachedToken = null;
    this._cachedRefresh = null;
    await browser.storage.local.remove(['akh_token', 'akh_refresh_token']);
  },

  async refreshToken(refreshToken: string): Promise<string | null> {
    // Если уже идет процесс обновления, ждем его завершения
    if (this._refreshPromise) return this._refreshPromise;

    this._refreshPromise = (async () => {
      try {
        console.log('[AKH] Attempting to refresh token...');
        const response = await fetch('https://back.akhcheck.ru/api/accounts/update-token/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          // Передаем токен в body, как требует API
          body: JSON.stringify({ refresh: refreshToken }),
        });

        if (!response.ok) throw new Error('Refresh token is invalid or expired');

        const data = await response.json();
        const newAccess = data.access;
        // Некоторые API возвращают и новый refresh токен. Если его нет — оставляем старый
        const newRefresh = data.refresh || refreshToken;

        await this.saveTokens(newAccess, newRefresh);
        console.log('[AKH] Token successfully refreshed');

        return newAccess;
      } catch (error) {
        console.error('[AKH] Token refresh error:', error);
        await this.clearTokens(); // Если рефреш не удался — сбрасываем всё
        return null;
      } finally {
        this._refreshPromise = null; // Очищаем статус "в процессе"
      }
    })();

    return this._refreshPromise;
  },

  // Добавлен флаг isRetry, чтобы избежать бесконечного цикла, если новый токен тоже сломан
  async fetch(url: string, isRetry = false): Promise<any> {
    const tokens = await this.getTokens();

    if (!tokens.access) {
      throw new Error('AUTH_REQUIRED_AKH');
    }

    console.log(`[AKH-DEBUG] Fetching with token: ${url}`);

    const res = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${tokens.access}`,
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    if (res.status === 401 || res.status === 403) {
      // Если запрос упал с 401/403, это не повторная попытка и есть рефреш-токен:
      if (!isRetry && tokens.refresh) {
        console.log('[AKH] Token expired (401/403), initiating refresh flow...');
        const newAccess = await this.refreshToken(tokens.refresh);

        if (newAccess) {
          // Если обновление прошло успешно, повторяем оригинальный запрос с новым токеном!
          return this.fetch(url, true);
        }
      }

      // Если рефреш не помог или его не было — разлогиниваем окончательно
      await this.clearTokens();
      throw new Error('AUTH_EXPIRED_AKH');
    }

    if (!res.ok) throw new Error(`Status ${res.status}`);
    return await res.json();
  },

  async fetchAllProgress() {
    return this.fetch('https://back.akhcheck.ru/api/teaching/progress/');
  },
};

/**
 * Интеграция с Яндекс.Контестом.
 *
 * Задачи LMS с внешним заданием хранят ссылку в exercise.exerciseUrl. Ссылка может
 * вести куда угодно (git.culab.ru, self-service.culab.ru, ...), контестными считаются
 * только ссылки на contest.yandex.ru.
 *
 * Прогресс берётся со страницы /contest/<id>/problems/ — она серверная и содержит
 * статус по КАЖДОЙ задаче контеста, поэтому одного запроса хватает на весь контест.
 * В service worker нет DOMParser, поэтому разбор regex-ом по BEM-разметке.
 *
 * Бюджет запросов (это самая дорогая часть, отсюда трёхуровневый кеш):
 *   - список задач студента            — 1 запрос, кеш 60 c;
 *   - exerciseUrl для каждой задачи    — 1 запрос на упражнение, кеш 7 дней
 *                                        (включая отрицательный результат);
 *   - страница контеста                — 1 запрос на контест, кеш 5 минут.
 * На повторных открытиях /learn/tasks сеть не трогается вообще, пока кеши живы.
 */
const YandexContestServices = {
  TASKS_PATH:
    '/api/micro-lms/tasks/student?state=inProgress&state=backlog&state=submitted&state=review&state=reworking',
  EXERCISE_TTL: 7 * 24 * 60 * 60 * 1000,
  // «Ссылки нет» кешируем на час, а не на неделю: преподаватель нередко публикует
  // задачу раньше, чем вписывает ссылку на контест, и недельный отрицательный кеш
  // прятал бы её до следующей недели
  EXERCISE_MISS_TTL: 60 * 60 * 1000,
  CONTEST_TTL: 5 * 60 * 1000,
  // Неуспешные состояния (нет входа, ошибка) кешируем куда короче: пользователь
  // логинится и сразу обновляет страницу, ждать пять минут он не станет
  CONTEST_FAIL_TTL: 60 * 1000,
  AUTH_TTL: 60 * 1000,
  // Демоконтест — публичная страница с обычной шапкой Яндекса, по ней и проверяем
  // авторизацию: отдельной лёгкой страницы с шапкой у contest.yandex.ru нет
  // (главная весит больше мегабайта, /contests/ и /my/ отдают 404)
  AUTH_PROBE_URL: 'https://contest.yandex.ru/contest/90118/enter/',
  TASKS_TTL: 60 * 1000,
  /** Сколько карточек задач тянем параллельно, чтобы не устраивать burst из 20+ запросов */
  DETAIL_CONCURRENCY: 3,
  STORAGE_KEY: 'contest_exercise_urls',
  // Поднимается при смене схемы или правил кеширования: несовместимые записи
  // (например, старые «ссылки нет» с недельным сроком) отбрасываются при загрузке
  CACHE_VERSION: 2,

  _exerciseUrls: null as Record<string, { url: string | null; ts: number }> | null,
  _tasksCache: null as { ts: number; data: any[] } | null,
  _contestCache: new Map<string, { ts: number; ttl: number; data: any }>(),
  _authCache: null as { ts: number; data: any } | null,
  _authInflight: null as Promise<any> | null,
  _contestInflight: new Map<string, Promise<any>>(),
  _progressInflight: null as Promise<any[]> | null,

  async _loadExerciseUrls(): Promise<Record<string, { url: string | null; ts: number }>> {
    if (this._exerciseUrls) return this._exerciseUrls;

    const res = await browser.storage.local.get(this.STORAGE_KEY);
    const stored = res[this.STORAGE_KEY] as { version?: number; items?: Record<string, any> };
    // Записи предыдущих версий выбрасываем целиком: иначе «ссылки нет», записанное
    // со старым недельным сроком, продолжало бы прятать задачу и после обновления
    this._exerciseUrls = stored?.version === this.CACHE_VERSION ? stored.items || {} : {};

    return this._exerciseUrls;
  },

  async _saveExerciseUrls() {
    await browser.storage.local.set({
      [this.STORAGE_KEY]: { version: this.CACHE_VERSION, items: this._exerciseUrls || {} },
    });
  },

  /** Список актуальных задач студента (тот же запрос, что делает сама LMS) */
  async fetchTasks(): Promise<any[]> {
    if (this._tasksCache && Date.now() - this._tasksCache.ts < this.TASKS_TTL) {
      return this._tasksCache.data;
    }
    const res = await fetch(lmsApi(this.TASKS_PATH), {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`LMS tasks: HTTP ${res.status}`);
    const data = await res.json();
    const list = Array.isArray(data) ? data : [];
    this._tasksCache = { ts: Date.now(), data: list };
    return list;
  },

  /**
   * exerciseUrl для задачи. Кешируется по exercise.id, а не по taskId:
   * упражнение одно на всю группу, а ссылка в нём практически неизменна.
   */
  async fetchExerciseUrl(task: any): Promise<string | null> {
    const exerciseId = task?.exercise?.id;
    if (!exerciseId) return null;

    const cache = await this._loadExerciseUrls();
    const hit = cache[exerciseId];
    const ttl = hit?.url ? this.EXERCISE_TTL : this.EXERCISE_MISS_TTL;
    if (hit && Date.now() - hit.ts < ttl) return hit.url;

    try {
      const res = await fetch(lmsApi(`/api/micro-lms/tasks/${task.id}`), {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const detail = await res.json();
      const url = detail?.exercise?.exerciseUrl || null;
      // Отрицательный результат тоже кешируем, иначе задачи без ссылки
      // перезапрашивались бы при каждом открытии страницы, но ненадолго (EXERCISE_MISS_TTL)
      cache[exerciseId] = { url, ts: Date.now() };
      return url;
    } catch (e) {
      return null;
    }
  },

  /** https://contest.yandex.ru/contest/98127 -> "98127" */
  parseContestId(url: string | null): string | null {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== 'contest.yandex.ru') return null;
      return parsed.pathname.match(/\/contest\/(\d+)/)?.[1] ?? null;
    } catch (e) {
      return null;
    }
  },

  _decodeEntities(text: string): string {
    return text
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&');
  },

  /**
   * Разбор /contest/<id>/problems/. У каждой вкладки задачи лежит div.solution-status,
   * модификатор _color_green которого означает полное решение.
   */
  parseProblems(html: string, contestId: string): Array<Record<string, any>> {
    const problems = new Map<string, Record<string, any>>();
    const liRe = /<li\s+class="tabs-menu__tab[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
    const hrefRe = new RegExp(`href="/contest/${contestId}/problems/([^/"]+)/"`);

    let match: RegExpExecArray | null;
    while ((match = liRe.exec(html)) !== null) {
      const inner = match[1] ?? '';
      // Вкладки «Задачи»/«Посылки» ведут на /problems/ без алиаса и сюда не попадают
      const alias = inner.match(hrefRe)?.[1];
      if (!alias || problems.has(alias)) continue;

      const name = inner.match(/tabs-menu__tab-content-text"[^>]*>([\s\S]*?)</)?.[1];
      const color = inner.match(/solution-status_color_([a-z]+)/)?.[1] ?? null;
      problems.set(alias, {
        alias,
        name: this._decodeEntities(name ? name.trim() : alias),
        color,
        solved: color === 'green',
      });
    }
    return [...problems.values()];
  },

  /**
   * Авторизован ли пользователь на contest.yandex.ru.
   *
   * Проверяем по ПОЛОЖИТЕЛЬНОМУ признаку: в шапке авторизованного есть блок
   * `user-menu`, а в ссылке на поддержку — его логин. Отсутствия признака
   * достаточно, чтобы считать пользователя анонимным; ловить маркеры формы
   * входа ненадёжно, они отличаются от страницы к странице.
   */
  isAuthenticatedHtml(html: string): boolean {
    return /class="user-menu[\s"]/.test(html) || /cntst_login=[^&"\s]/.test(html);
  },

  parseLogin(html: string): string | null {
    const match = html.match(/cntst_login=([^&"]*)/);
    if (!match?.[1]) return null;
    try {
      return decodeURIComponent(match[1]) || null;
    } catch (e) {
      return match[1];
    }
  },

  /**
   * Состояние авторизации для попапа: 'authorized' | 'anonymous' | 'unknown'.
   * Нужна отдельно от прогресса, потому что предупредить надо сразу при включении
   * интеграции, когда курсы ещё не выбраны и запрашивать нечего.
   */
  async checkAuth(): Promise<any> {
    if (this._authCache && Date.now() - this._authCache.ts < this.AUTH_TTL) {
      return this._authCache.data;
    }
    if (this._authInflight) return this._authInflight;

    this._authInflight = (async () => {
      let data;
      try {
        const res = await fetch(this.AUTH_PROBE_URL, { credentials: 'include' });
        if (!res.ok) {
          data = { state: 'unknown', error: `HTTP ${res.status}` };
        } else {
          const html = await res.text();
          data = this.isAuthenticatedHtml(html)
            ? { state: 'authorized', login: this.parseLogin(html) }
            : { state: 'anonymous' };
        }
      } catch (e: any) {
        data = { state: 'unknown', error: e?.message || 'fetch failed' };
      } finally {
        this._authInflight = null;
      }

      this._authCache = { ts: Date.now(), data };
      return data;
    })();

    return this._authInflight;
  },

  async fetchContest(contestId: string): Promise<any> {
    const cached = this._contestCache.get(contestId);
    if (cached && Date.now() - cached.ts < cached.ttl) return cached.data;

    const inflight = this._contestInflight.get(contestId);
    if (inflight) return inflight;

    const request = (async () => {
      let data;
      try {
        const res = await fetch(`https://contest.yandex.ru/contest/${contestId}/problems/`, {
          credentials: 'include',
        });
        const finalUrl = res.url || '';

        if (!res.ok) {
          data = { state: 'error', error: `HTTP ${res.status}` };
        } else if (/\/enter\b/.test(finalUrl)) {
          // На /enter/ Яндекс уводит ОБА случая — и не вошедшего в контест,
          // и вообще неавторизованного, — поэтому различаем их по шапке страницы
          data = this.isAuthenticatedHtml(await res.text())
            ? { state: 'not_entered' }
            : { state: 'auth_required' };
        } else {
          const problems = this.parseProblems(await res.text(), contestId);
          data = problems.length
            ? {
                state: 'ok',
                total: problems.length,
                solved: problems.filter((p) => p.solved).length,
                problems,
              }
            : { state: 'error', error: 'EMPTY_PROBLEM_LIST' };
        }
      } catch (e: any) {
        data = { state: 'error', error: e?.message || 'fetch failed' };
      } finally {
        this._contestInflight.delete(contestId);
      }

      // Ошибки тоже кешируем: иначе упавший контест будет перезапрашиваться каждый тик.
      // Но держим их недолго, чтобы после входа результат обновился быстро
      const ttl = data.state === 'ok' ? this.CONTEST_TTL : this.CONTEST_FAIL_TTL;
      this._contestCache.set(contestId, { ts: Date.now(), ttl, data });
      return data;
    })();

    this._contestInflight.set(contestId, request);
    return request;
  },

  /**
   * Курсы, выбранные пользователем в попапе. Пустой список означает «не выбрано»,
   * то есть сканировать нечего — именно за счёт этого фильтра и экономятся запросы
   * за карточками задач.
   */
  async getSelectedCourseIds(): Promise<Set<number>> {
    const res = await browser.storage.sync.get('contestCourseFilter');
    const filter = Array.isArray(res.contestCourseFilter) ? res.contestCourseFilter : [];
    return new Set(filter.map((c: any) => c?.id).filter((id: any) => id != null));
  },

  /**
   * Полный прогресс по контестным задачам выбранных курсов.
   * Возвращает записи, которые контент-скрипт сопоставляет со строками таблицы по названию.
   */
  async fetchProgress(): Promise<any[]> {
    if (this._progressInflight) return this._progressInflight;

    this._progressInflight = (async () => {
      try {
        const selectedCourses = await this.getSelectedCourseIds();
        if (selectedCourses.size === 0) return [];

        // Фильтруем ДО запроса карточек: это единственный запрос, растущий линейно
        // с числом задач, и курсовой фильтр режет его в разы
        const tasks = (await this.fetchTasks()).filter((t: any) =>
          selectedCourses.has(t?.course?.id)
        );

        const queue = [...tasks];
        const contestTasks: Array<{ task: any; contestId: string }> = [];
        await Promise.all(
          Array.from({ length: this.DETAIL_CONCURRENCY }, async () => {
            while (queue.length) {
              const task = queue.shift();
              if (!task) break;
              const contestId = this.parseContestId(await this.fetchExerciseUrl(task));
              if (contestId) contestTasks.push({ task, contestId });
            }
          })
        );
        await this._saveExerciseUrls();

        const contestIds = [...new Set(contestTasks.map((t) => t.contestId))];
        const contests = new Map<string, any>();
        for (const id of contestIds) contests.set(id, await this.fetchContest(id));

        return contestTasks.map(({ task, contestId }) => ({
          taskId: task.id,
          taskName: task.exercise?.name || '',
          courseName: task.course?.name || '',
          contestId,
          contestUrl: `https://contest.yandex.ru/contest/${contestId}/problems/`,
          ...contests.get(contestId),
        }));
      } finally {
        this._progressInflight = null;
      }
    })();

    return this._progressInflight;
  },
};

/**
 * Центральный обработчик навигации.
 * Запускает все плагины, чей matches(url) вернул true.
 */
/**
 * Внедряет один плагин: сперва стили, затем скрипты.
 *
 * Порядок важен. Раньше `insertCSS` и `executeScript` запускались двумя
 * независимыми промисами, и скрипт нередко успевал отработать раньше, чем
 * приезжал стиль: плагин карточек создавал обложки, у которых ещё не было
 * `position: absolute`, — они становились обычными блоками и растягивались на
 * всю строку, а через мгновение вставали на место. Выглядело как анимация.
 *
 * Плагины между собой по-прежнему внедряются параллельно.
 */
async function injectPlugin(tabId: number, plugin: (typeof plugins)[number]): Promise<void> {
  if (plugin.cssFiles?.length) {
    try {
      await browser.scripting.insertCSS({ target: { tabId }, files: plugin.cssFiles as string[] });
    } catch (err) {
      console.log(`[BG] CSS error (${plugin.id}):`, err);
    }
  }

  if (plugin.scripts?.length) {
    try {
      await browser.scripting.executeScript({
        target: { tabId },
        files: plugin.scripts as string[],
      });
    } catch (err) {
      console.error(`[BG] Script error (${plugin.id}):`, err);
    }
  }
}

function handleNavigation(tabId: number, url: string): void {
  if (!isLmsUrl(url)) return;
  rememberLmsOrigin(url);

  for (const plugin of plugins) {
    if (!plugin.matches(url)) continue;
    void injectPlugin(tabId, plugin);
  }
}

// --- СЛУШАТЕЛИ НАВИГАЦИИ ---
const navFilter = {
  url: [{ hostSuffix: 'centraluniversity.ru' }, { hostSuffix: 'cu.ru' }],
};

// Chrome + Firefox:
// оставляем существующий механизм SPA-навигации.
if (browser.webNavigation.onHistoryStateUpdated) {
  browser.webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (details.frameId === 0) {
      handleNavigation(details.tabId, details.url);
    }
  }, navFilter);
}

// Первоначальная загрузка страницы.
// Это оставляем для всех браузеров.
browser.webNavigation.onCompleted.addListener((details) => {
  if (details.frameId === 0) {
    handleNavigation(details.tabId, details.url);
  }
}, navFilter);

// --- ОБРАБОТЧИК СООБЩЕНИЙ (ЕДИНЫЙ ДЛЯ ВСЕГО) ---
browser.runtime.onMessage.addListener(((
  rawRequest: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void
) => {
  const request = rawRequest as IncomingMessage;

  // Safari does not reliably emit webNavigation.onHistoryStateUpdated for
  // client-side routing. The Safari content script reports the URL instead.
  if (request.action === 'SAFARI_NAVIGATION') {
    const navigationRequest = request as { action: 'SAFARI_NAVIGATION'; url: string };
    const messageSender = sender as browser.Runtime.MessageSender;
    if (messageSender.frameId === 0 && messageSender.tab?.id != null) {
      handleNavigation(messageSender.tab.id, navigationRequest.url);
      sendResponse({ success: true });
    }
    return false;
  }

  // 1. ЛОГИКА ОБРАБОТКИ GIST
  if (request.action === 'fetchGistContent') {
    fetch((request as { action: 'fetchGistContent'; url: string }).url)
      .then((response) => response.text())
      .then((text) => {
        let processedText = text.trim();
        const prefix = "document.write('";
        const suffix = "')";
        const separatorRegex = /'\)\s*document\.write\('/g;
        if (processedText.startsWith(prefix) && processedText.endsWith(suffix)) {
          processedText = processedText.substring(
            prefix.length,
            processedText.length - suffix.length
          );
          let rawHtml = processedText.replace(separatorRegex, '');
          rawHtml = rawHtml
            .replace(/\\'/g, "'")
            .replace(/\\"/g, '"')
            .replace(/\\n/g, '\n')
            .replace(/\\\//g, '/')
            .replace(/\\\\/g, '\\');
          const cssMatch = rawHtml.match(/<link.*?href="(.*?)"/);
          const cssUrl = cssMatch ? cssMatch[1] : null;
          sendResponse({ success: true, html: rawHtml, cssUrl: cssUrl });
        } else {
          sendResponse({ success: false, error: 'Ответ от Gist имеет неожиданный формат.' });
        }
      })
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Прокси для обычного JSON GET на внешний хост: content-скрипты в Firefox
  // не получают CORS-обход из host_permissions (в отличие от Chrome), поэтому
  // кросс-доменный fetch с их стороны падает с "CORS request did not succeed"
  // даже если сервер шлёт Access-Control-Allow-Origin. У background-скрипта
  // такого ограничения нет.
  if (request.action === 'FETCH_JSON') {
    fetch((request as { action: 'FETCH_JSON'; url: string }).url)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        sendResponse({ success: true, data: await response.json() });
      })
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Прокси для биржи обмена парами (см. plugins/timetable/swap_api.js).
  // В отличие от FETCH_JSON умеет POST/PUT/DELETE и заголовки авторизации.
  // Хост зафиксирован здесь, а не приходит из страницы: скомпрометированный
  // content-скрипт иначе гонял бы через background запросы куда угодно.
  if (request.action === 'SWAP_API') {
    const swapRequest = request as {
      action: 'SWAP_API';
      method: string;
      url: string;
      body?: unknown;
      headers?: Record<string, string>;
    };

    if (!swapRequest.url.startsWith(`${SWAP_BACKEND_ORIGIN}/`)) {
      sendResponse({ success: false, error: 'запрещённый адрес' });
      return true;
    }

    fetch(swapRequest.url, {
      method: swapRequest.method,
      headers: {
        ...(swapRequest.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(swapRequest.headers ?? {}),
      },
      body: swapRequest.body === undefined ? undefined : JSON.stringify(swapRequest.body),
    })
      .then(async (response) => {
        // 204 отдают отмена заказа и закрытие совпадения — тела там нет.
        const data = response.status === 204 ? null : await response.json().catch(() => null);

        if (!response.ok) {
          const detail =
            data && typeof data === 'object' && 'detail' in data
              ? String((data as { detail: unknown }).detail)
              : `HTTP ${response.status}`;
          sendResponse({ success: false, error: detail, status: response.status });
          return;
        }

        sendResponse({ success: true, data, status: response.status });
      })
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // 2. ЛОГИКА YANDEX MAIL (Поиск контактов по имени)
  if (request.action === 'SEARCH_CONTACTS') {
    YandexServices.Mail.searchContacts(
      (request as { action: 'SEARCH_CONTACTS'; query: string }).query
    )
      .then((c) => sendResponse({ success: true, contacts: c }))
      .catch((e) => sendResponse({ success: false }));
    return true;
  }
  if (request.action === 'ANALYZE_SUBJECTS') {
    YandexServices.Calendar.analyzeSubjects(
      (request as { action: 'ANALYZE_SUBJECTS'; email: string }).email
    )
      .then((s) => sendResponse({ success: true, subjects: s }))
      .catch((e) => sendResponse({ success: false }));
    return true;
  }
  if (request.action === 'GET_WEEKLY_SCHEDULE') {
    const r = request as { action: 'GET_WEEKLY_SCHEDULE'; email: string; date?: string };
    // Передаем request.date вторым аргументом
    YandexServices.Calendar.analyzeSchedule(r.email, r.date ?? null)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (request.action === 'GET_CALENDAR_LINK') {
    YandexServices.Calendar.getPublicLink(
      (request as { action: 'GET_CALENDAR_LINK'; email: string }).email
    )
      .then((l) => sendResponse({ success: true, link: l }))
      .catch((e) => sendResponse({ success: false }));
    return true;
  }
  if (
    request.action === 'AKH_FETCH_COURSE_DETAILS' ||
    request.action === 'AKH_FETCH_PROGRESS' ||
    request.action === 'AKH_FETCH_ALL_PROGRESS' ||
    request.action === 'AKH_SAVE_TOKENS' ||
    request.action === 'AKH_SAVE_TOKEN'
  ) {
    browser.storage.sync.get('akhIntegrationEnabled').then((settings) => {
      if (!settings.akhIntegrationEnabled) {
        sendResponse({ success: false, error: 'AKH_DISABLED' });
        return;
      }

      if (request.action === 'AKH_FETCH_COURSE_DETAILS') {
        const { courseId } = request as any;
        AkhCheckServices.fetch(`https://back.akhcheck.ru/api/teaching/course/${courseId}`)
          .then((data) => sendResponse({ success: true, data }))
          .catch((err) => sendResponse({ success: false, error: err.message }));
      } else if (request.action === 'AKH_FETCH_PROGRESS') {
        const { taskId } = request as any;
        AkhCheckServices.fetch(`https://back.akhcheck.ru/api/teaching/progress/${taskId}`)
          .then((data) => sendResponse({ success: true, data }))
          .catch((err) => sendResponse({ success: false, error: err.message }));
      } else if (request.action === 'AKH_FETCH_ALL_PROGRESS') {
        AkhCheckServices.fetchAllProgress()
          .then((data) => sendResponse({ success: true, data }))
          .catch((err) => sendResponse({ success: false, error: err.message }));
      } else {
        const { token, access, refresh } = request as any;
        const actualAccess = access || token;
        if (actualAccess) {
          AkhCheckServices.saveTokens(actualAccess, refresh || null).then(() => {
            console.log('[AKH] Tokens updated from tab (Access & Refresh)');
          });
        }
        sendResponse({ success: true });
      }
    });
    return true;
  }

  // Список активных курсов для селекторов фильтра в попапе.
  // URL зафиксирован здесь, а не приходит из страницы — как и в SWAP_API.
  if (request.action === 'LMS_FETCH_COURSES') {
    fetch(lmsApi('/api/micro-lms/performance/student?isArchived=false'), {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const raw = Array.isArray(data?.courses)
          ? data.courses
          : Array.isArray(data?.items)
            ? data.items
            : [];
        const courses = raw
          .filter((c: any) => c?.id && c?.name)
          .map((c: any) => ({ id: c.id, name: c.name }))
          .sort((a: any, b: any) => a.name.localeCompare(b.name, 'ru'));
        sendResponse({ success: true, data: courses });
      })
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Проверка авторизации на contest.yandex.ru для попапа.
  // Намеренно НЕ спрятана за contestIntegrationEnabled: попап спрашивает её сразу
  // при включении тумблера, когда внутри iframe изменение ещё не дошло до storage.
  if (request.action === 'CONTEST_CHECK_AUTH') {
    YandexContestServices.checkAuth()
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'CONTEST_FETCH_PROGRESS') {
    browser.storage.sync.get('contestIntegrationEnabled').then((settings) => {
      if (!settings.contestIntegrationEnabled) {
        sendResponse({ success: false, error: 'CONTEST_DISABLED' });
        return;
      }
      YandexContestServices.fetchProgress()
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
    });
    return true;
  }

  // 3. ПРОКСИ ДЛЯ TABS И SCRIPTING (Для Firefox iframes)
  if (request.action === 'TABS_QUERY') {
    browser.tabs
      .query(request.options as browser.Tabs.QueryQueryInfoType)
      .then((tabs) => sendResponse(tabs))
      .catch((err) => sendResponse([]));
    return true;
  }
  if (request.action === 'TABS_UPDATE') {
    browser.tabs
      .update(request.tabId as number, request.options as browser.Tabs.UpdateUpdatePropertiesType)
      .then((tab) => sendResponse(tab))
      .catch((err) => sendResponse(null));
    return true;
  }
  if (request.action === 'TABS_RELOAD') {
    browser.tabs
      .reload(request.tabId as number, request.options as browser.Tabs.ReloadReloadPropertiesType)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (request.action === 'TABS_SEND_MESSAGE') {
    browser.tabs
      .sendMessage(request.tabId as number, request.message)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse(null));
    return true;
  }
  // Открывает страницу расширения с тёмным PDF.
  // Именно background, а не window.open из content-скрипта: tabs.create не
  // трогает блокировщик всплывающих окон, а страница расширения умеет то,
  // чего не может дорисованный руками about:blank (см. pdf_viewer.js).
  if (request.action === 'OPEN_PDF_VIEWER') {
    const viewerUrl =
      browser.runtime.getURL('plugins/longreads/pdf_viewer.html') +
      `?src=${encodeURIComponent(request.url as string)}` +
      `&name=${encodeURIComponent(request.filename as string)}`;
    browser.tabs
      .create({ url: viewerUrl })
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Редактор тем — такая же страница расширения, как просмотрщик PDF, и
  // открывается так же: из content-скрипта `tabs.create` недоступен, а
  // `window.open` на `chrome-extension://` браузер не пустит.
  if (request.action === 'OPEN_THEME_EDITOR') {
    const editorUrl = browser.runtime.getURL('plugins/theme-editor/theme-editor.html');

    // Вторая вкладка редактора не нужна и вредна: обе пишут одни и те же
    // ключи и перетирали бы правки друг друга. Поэтому запоминаем свою.
    // Именно id, а не `tabs.query({url})`: фильтр по URL требует разрешения
    // `tabs`, которого у расширения нет и ради одной кнопки заводить не стоит.
    void (async () => {
      try {
        const stored = await browser.storage.local.get('themeEditorTabId');
        const knownId = stored.themeEditorTabId;

        if (typeof knownId === 'number') {
          try {
            const tab = await browser.tabs.get(knownId);
            // URL виден не всегда (то же разрешение `tabs`); если видно —
            // проверяем, что вкладку не увели на другой сайт.
            if (tab && (!tab.url || tab.url.startsWith(editorUrl))) {
              await browser.tabs.update(knownId, { active: true });
              if (tab.windowId != null) {
                await browser.windows.update(tab.windowId, { focused: true });
              }
              sendResponse({ success: true });
              return;
            }
          } catch (_error) {
            // Вкладку закрыли — просто откроем новую.
          }
        }

        const created = await browser.tabs.create({ url: editorUrl });
        await browser.storage.local.set({ themeEditorTabId: created.id ?? null });
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: (error as Error).message });
      }
    })();
    return true;
  }

  // Сбор оценок для Excel. Идёт через background, а не из попапа, — так
  // завели ради меню-iframe в Firefox (см. browserApi в popup.js).
  if (request.action === 'GRADES_EXPORT_EXECUTE') {
    const exportRequest = request as { tabId?: number; archived?: boolean };
    (async () => {
      try {
        // Вкладку LMS называет попап — он её уже проверил.
        let tabId = exportRequest.tabId;
        if (typeof tabId !== 'number') {
          const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
          tabId = tab?.id;
        }
        if (typeof tabId !== 'number') {
          sendResponse({ success: false, error: 'Активная вкладка не найдена.' });
          return;
        }

        // Функция уезжает во вкладку одним текстом — см. grades-export.ts.
        const results = await browser.scripting.executeScript({
          target: { tabId },
          func: fetchAllGradesForExport,
          args: [exportRequest.archived === true],
        });
        sendResponse({ success: true, result: results[0]?.result });
      } catch (err: any) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
}) as Parameters<typeof browser.runtime.onMessage.addListener>[0]);
