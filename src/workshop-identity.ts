// Кто ты в LMS — для 3rd-theme workshop. Отдельно от workshop-background.ts,
// чтобы логику можно было проверить без браузера (tests/source/workshop-identity.test.ts).
//
// Обычно `student_id` достаёт сам background: у него есть куки LMS. Safari их
// к запросам background не прикладывает (защита от межсайтового отслеживания),
// и LMS отвечает 401 даже вошедшему студенту. Тогда спрашиваем из открытой
// вкладки LMS — там запрос свой, а не межсайтовый, и куки уходят.

/** Ответ `/students/me`: статус и, если повезло, id. Больше ничего не берём. */
export interface StudentIdAnswer {
  status: number;
  id?: unknown;
}

export const LOGIN_REQUIRED = 'Войди в LMS — 3rd-theme workshop узнаёт тебя по аккаунту LMS';
export const LMS_TAB_REQUIRED =
  'Открой LMS в соседней вкладке и войди в аккаунт — 3rd-theme workshop узнаёт тебя по нему';

/**
 * Выполняется во вкладке LMS через `scripting.executeScript({ func })`: туда
 * уезжает только текст функции, поэтому ссылаться ни на что снаружи нельзя.
 * Адрес относительный — запрос уходит на домен вкладки с её куками.
 * `/students/me` отдаёт ещё ИНН, СНИЛС и телефон — из вкладки выходит только id.
 */
export async function readStudentIdInPage(): Promise<StudentIdAnswer> {
  const response = await fetch('/api/student-hub/students/me', {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) return { status: response.status };
  const data = await response.json().catch(() => null);
  return { status: response.status, id: data && data.id };
}

const isAuthError = (status: number) => status === 401 || status === 403;

/**
 * `fromLmsTab` возвращает null, если открытой вкладки LMS нет или в неё не
 * получилось попасть.
 */
export async function resolveStudentId(sources: {
  fromBackground: () => Promise<StudentIdAnswer>;
  fromLmsTab: () => Promise<StudentIdAnswer | null>;
}): Promise<string> {
  let answer = await sources.fromBackground();
  if (isAuthError(answer.status)) {
    const fromTab = await sources.fromLmsTab();
    if (!fromTab) throw new Error(LMS_TAB_REQUIRED);
    answer = fromTab;
  }
  if (isAuthError(answer.status)) throw new Error(LOGIN_REQUIRED);
  if (answer.status < 200 || answer.status >= 300) throw new Error(`LMS: HTTP ${answer.status}`);
  if (typeof answer.id !== 'string' || !answer.id) throw new Error('LMS не отдала id студента');
  return answer.id;
}
