// background.ts
import browser from 'webextension-polyfill';
import type { PluginManifest } from './plugins/types';

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
  | { action: 'SEARCH_CONTACTS'; query: string }
  | { action: 'ANALYZE_SUBJECTS'; email: string }
  | { action: 'GET_WEEKLY_SCHEDULE'; email: string; date?: string }
  | { action: 'GET_CALENDAR_LINK'; email: string }
  | { action: string; [key: string]: unknown };

// --- PLUGIN AUTO-DISCOVERY ---
// All index.manifest.ts files are picked up automatically at build time.
// Adding a new plugin = creating a new plugins/<name>/index.manifest.ts file.
const pluginModules = import.meta.glob<{ default: PluginManifest }>(
  './plugins/*/index.manifest.ts',
  { eager: true }
);
const plugins = Object.values(pluginModules).map((m) => m.default);

// --- СПИСОК ПРЕДМЕТОВ ---
const SUBJECTS_LIST = [
  // Software Engineering
  'Алгоритмы и структуры данных 2',
  'Алгоритмы и структуры данных 2. Продвинутый уровень',
  'Архитектура компьютера и операционные системы 2',
  'Многопоточная синхронизация',
  'Дискретная математика',
  'Основы промышленной разработки',
  'Основы разработки на Go',
  'Информационная безопасность',
  'Методы дискретной оптимизации',
  'Web-разработка',
  'Разработка на С++',
  'Разработка на С++ Часть 2',
  'Разработка на Kotlin',
  'Rocq',

  // Business
  'Введение в экономику. Основной уровень',
  'Основы бизнес-аналитики. Основной уровень',
  'Введение в алгоритмы и структуры данных',
  'Макроэкономика I. Основной уровень',
  'Основы финансов',
  'Основы маркетинга',
  'Теория игр. Основной уровень',
  'Финансы. Основной уровень',
  'Эконометрика I. Основной уровень',
  'Математическая статистика. Основной уровень',
  'Введение в экономику. Продвинутый уровень',
  'Макроэкономика I. Продвинутый уровень',
  'Математическая статистика. Продвинутый уровень',
  'Основы бизнес-аналитики. Продвинутый уровень',
  'Теория игр. Продвинутый уровень',
  'Финансы. Продвинутый уровень',
  'Эконометрика I. Продвинутый уровень',

  // AI
  'Введение в искусственный интеллект. Основной уровень',
  'Введение в статистику. Основной уровень',
  'Базы данных',
  'Deep Learning',
  'Введение в статистику. Продвинутый уровень',
  'Введение в искусственный интеллект. Продвинутый уровень',

  // Математика
  'Основы математического анализа и линейной алгебры 2',
  'Математический анализ 2. Основной уровень',
  'Математический анализ 2. Пилотный поток',
  'Линейная алгебра и геометрия 2',
  'Линейная алгебра и геометрия 2. Пилотный поток',
  'Алгебра',
  'Дополнительные главы математического анализа',
  'Математический анализ 2. Продвинутый уровень',

  // STEM
  'Бизнес-студия',
  'Искусство и наука',
  'Научная студия. В поисках нейтронов',
  'Научная студия. Лечение на Гамма-ноже',
  'Научная студия. Переменные звезды',
  'Научная студия. Перколяция: от лесных пожаров до нефтегазовых резервуаров',
  'Научная студия. Поиск экспортных рынтов',
  'Научная студия. Стратегия управления кадровой динамикой учителей в РФ',
  'Научная студия. Умный дом',
  'Студия компьютерных наук',
  'Философия и наука',

  // SOFT
  'Алгоритмы принятия решений',
  'Командная работа по Agile',
  'Креативные техники решения задач',
  'Публичные выступления и основы презентации',
  'Системное и критическое мышление',
  'Стратегическое мышление',
  'Стресс-менеджмент и эмоциональный интеллект',
  'Работа в команде и коллаборация',
  'Управление ресурсами: личная эффективность',
  'Целеполагание, планирование и самоорганизация',
  'Ясность в текстах',

  // Образовательный стандарт
  'Физкультура и спорт',
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

  // Humanities (факультативы вне плана)
  'Этика. Право. ИИ',
  'Как понимать кино?',
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

        let end = new Date();
        let start = new Date();

        // Устанавливаем базовый диапазон: сегодня - 15 дней, сегодня + 15 дней
        start.setDate(start.getDate() - 15);
        end.setDate(end.getDate() + 15);

        // Граничная дата: 11 февраля 2026 года (месяц 1 = февраль)
        const limitDate = new Date(2026, 1, 9);

        // Если расчетный старт оказался раньше 11 февраля 2026
        if (start < limitDate) {
          // Устанавливаем жесткий период: 11.02.2026 — 26.02.2026
          start = new Date(2026, 1, 9);
          end = new Date(2026, 1, 26);
        }

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

          // ОБНОВЛЕННЫЙ РЕГУЛЯРКА ДЛЯ АНГЛИЙСКОГО (добавлено [a-z]?)
          const englishGroupMatch = cleanTitle.match(
            /^английский язык\s+([0-9]+s[0-9]+(?:-[0-9]+[a-z]?)?)/
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
            'Accept': 'application/json'
          },
          // Передаем токен в body, как требует API
          body: JSON.stringify({ refresh: refreshToken })
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
        'Accept': 'application/json',
        'Authorization': `Bearer ${tokens.access}`,
        'X-Requested-With': 'XMLHttpRequest'
      }
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
  }
};


/**
 * Центральный обработчик навигации.
 * Запускает все плагины, чей matches(url) вернул true.
 */
function handleNavigation(tabId: number, url: string): void {
  if (!url?.startsWith('https://my.centraluniversity.ru/')) return;

  for (const plugin of plugins) {
    if (!plugin.matches(url)) continue;

    if (plugin.cssFiles?.length) {
      browser.scripting
        .insertCSS({ target: { tabId }, files: plugin.cssFiles as string[] })
        .catch((err) => console.log(`[BG] CSS error (${plugin.id}):`, err));
    }

    if (plugin.scripts?.length) {
      browser.scripting
        .executeScript({ target: { tabId }, files: plugin.scripts as string[] })
        .catch((err) => console.error(`[BG] Script error (${plugin.id}):`, err));
    }
  }
}

// --- СЛУШАТЕЛИ НАВИГАЦИИ ---
const navFilter = {
  url: [{ hostSuffix: 'centraluniversity.ru' }],
};

browser.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId === 0) handleNavigation(details.tabId, details.url);
}, navFilter);

browser.webNavigation.onCompleted.addListener((details) => {
  if (details.frameId === 0) handleNavigation(details.tabId, details.url);
}, navFilter);

// --- ОБРАБОТЧИК СООБЩЕНИЙ (ЕДИНЫЙ ДЛЯ ВСЕГО) ---
browser.runtime.onMessage.addListener(((
  rawRequest: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void
) => {
  const request = rawRequest as IncomingMessage;
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
  if (request.action === 'AKH_FETCH_COURSE_DETAILS') {
  const { courseId } = request as any;
  // Добавляем / в конце: .../course/98/
  AkhCheckServices.fetch(`https://back.akhcheck.ru/api/teaching/course/${courseId}`)
    .then(data => sendResponse({ success: true, data }))
    .catch(err => sendResponse({ success: false, error: err.message }));
  return true;
}

if (request.action === 'AKH_FETCH_PROGRESS') {
  const { taskId } = request as any;
  // Здесь слэш уже есть: .../progress/924/
  AkhCheckServices.fetch(`https://back.akhcheck.ru/api/teaching/progress/${taskId}`)
    .then(data => sendResponse({ success: true, data }))
    .catch(err => sendResponse({ success: false, error: err.message }));
  return true;
}
if (request.action === 'AKH_FETCH_ALL_PROGRESS') {
  AkhCheckServices.fetchAllProgress()
    .then(data => sendResponse({ success: true, data }))
    .catch(err => sendResponse({ success: false, error: err.message }));
  return true;
}

if (request.action === 'AKH_SAVE_TOKENS' || request.action === 'AKH_SAVE_TOKEN') {
  const { token, access, refresh } = request as any;
  // Поддержка и старого ключа token, и нового access
  const actualAccess = access || token; 
  
  if (actualAccess) {
    AkhCheckServices.saveTokens(actualAccess, refresh || null).then(() => {
      console.log('[AKH] Tokens updated from tab (Access & Refresh)');
    });
  }
  return true;
}

}) as Parameters<typeof browser.runtime.onMessage.addListener>[0]);

