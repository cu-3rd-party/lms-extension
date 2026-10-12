// Запрос к API LMS изнутри вкладки LMS (для офлайн-копии).
//
// Фон передаёт функцию в `scripting.executeScript({ func, args })`, и браузер
// переносит во вкладку только её текст, без замыкания: ссылаться на что-либо
// снаружи нельзя (подробнее — в шапке grades-export.ts). Зачем вкладка, а не
// fetch из фона: запрос со страницы LMS идёт на её домен и с её куками —
// одинаково в Chrome, Firefox и Safari. Из фона куки LMS отдаёт не каждый
// браузер; там это запасной путь, когда вкладки LMS нет.
//
// Результат — простой объект (executeScript отдаёт только сериализуемое):
//   status 200 и data — ответ JSON;
//   status 0 — сеть недоступна (LMS лежит или нет интернета);
//   status -1 — пришёл не JSON: обычно страница входа вместо ответа API.

export async function fetchLmsJsonInTab(path: string) {
  try {
    const response = await fetch(path, {
      credentials: 'include',
      headers: { accept: 'application/json, text/plain, */*' },
    });
    if (!response.ok) return { status: response.status, data: null };
    const text = await response.text();
    try {
      return { status: 200, data: JSON.parse(text) };
    } catch (_error) {
      return { status: -1, data: null };
    }
  } catch (_error) {
    return { status: 0, data: null };
  }
}
