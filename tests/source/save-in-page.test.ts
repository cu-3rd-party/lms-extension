import { expect, test } from 'bun:test';
import vm from 'node:vm';
import { saveBlobInPage } from '../../src/save-in-page.ts';

// Функцию background отправляет во вкладку LMS через scripting.executeScript, и туда
// уезжает только её текст. Здесь она запускается так же: из текста, в пустом контексте,
// где снаружи есть лишь то, что даёт страница (atob, Blob, URL, document, setTimeout).
// Сошлись функция на что-то из модуля, тест упадёт с ReferenceError — как это было с
// fetchAllGradesForExport (см. grades-export.test.ts).

test('файл собирается из base64 и сохраняется ссылкой с download', () => {
  const clicked: { href: string; download: string }[] = [];
  const blobs: { size: number; type: string }[] = [];
  const revoked: string[] = [];
  const appended: unknown[] = [];

  const link = {
    href: '',
    download: '',
    style: { display: '' },
    click() {
      clicked.push({ href: this.href, download: this.download });
    },
    remove() {},
  };

  const context = vm.createContext({
    atob: (text: string) => Buffer.from(text, 'base64').toString('binary'),
    Uint8Array,
    Blob: class {
      size: number;
      type: string;
      constructor(parts: Uint8Array[], options: { type: string }) {
        this.size = parts[0]!.length;
        this.type = options.type;
        blobs.push({ size: this.size, type: this.type });
      }
    },
    URL: {
      createObjectURL: () => 'blob:test/1',
      revokeObjectURL: (url: string) => revoked.push(url),
    },
    document: {
      createElement: () => link,
      body: { appendChild: (node: unknown) => appended.push(node) },
    },
    setTimeout: () => 0,
  });
  const run = vm.runInContext(`(${saveBlobInPage.toString()})`, context);

  const bytes = Buffer.from([1, 2, 3, 250, 251, 252, 0, 255]);
  expect(run(bytes.toString('base64'), 'grades.xlsx', 'application/test')).toBe(true);

  expect(blobs).toEqual([{ size: 8, type: 'application/test' }]);
  expect(clicked).toEqual([{ href: 'blob:test/1', download: 'grades.xlsx' }]);
  expect(appended).toHaveLength(1);
  // Освобождается отложенно, а не сразу: браузер читает blob не мгновенно.
  expect(revoked).toEqual([]);
});
