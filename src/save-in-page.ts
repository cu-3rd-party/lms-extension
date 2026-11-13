// Сохранение файла из вкладки LMS (выгрузка оценок в Excel, файл настроек).
//
// Зачем. В Safari нет API загрузок (`downloads`), а blob-ссылка, созданная в
// попапе, там не работает: ссылка с `download` открывается в новой вкладке и падает
// с «Safari не может открыть страницу blob:safari-web-extension://…
// (WebKitBlobResource, ошибка 1)» — у каждой страницы расширения свой реестр
// blob'ов, а попап ещё и закрывается, едва Safari что-то показывает. Поэтому файл
// отдаётся вкладке LMS: там blob живёт на обычной странице, и `<a download>`
// сохраняет его под нужным именем — так же, как «Скачать» у файлов лонгрида
// (plugins/longreads/file_download.js).
//
// Функция уезжает во вкладку одним текстом (`scripting.executeScript({ func,
// args })`), поэтому, как `fetchAllGradesForExport`, не должна ссылаться ни на что
// снаружи — только на глобалы страницы. Данные приходят base64-строкой в `args`.
// Сторожит это tests/source/save-in-page.test.ts.

/**
 * @param base64 содержимое файла
 * @param filename имя, под которым сохранить
 * @param mime тип содержимого
 */
export function saveBlobInPage(base64: string, filename: string, mime: string): boolean {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Браузер читает blob не мгновенно — держим ссылку живой с запасом.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}
