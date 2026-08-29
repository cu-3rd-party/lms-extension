/**
 * Регрессия на Firefox для plugins/longreads/pdf_viewer.html.
 *
 * История: раньше тёмный PDF показывался из content-скрипта через
 * window.open('', '_blank') + document.write + <embed> с blob-URL. В Firefox
 * вкладка навсегда оставалась на about:blank — без спиннера и без ошибки.
 * Поэтому весь тяжёлый путь переехал на страницу расширения.
 *
 * Тест гоняет эту страницу в настоящем Gecko. Расширение и логин в ЛМС не
 * нужны: pdf_viewer.js намеренно не использует extension API — входные данные
 * приходят из query-строки, пути относительные. Поэтому страницу достаточно
 * раздать по http.
 *
 * Запуск:
 *   bunx playwright test tests/pdf-viewer-firefox.test.ts
 */

import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'http';
import { existsSync, readFileSync } from 'fs';
import { dirname, extname, join, normalize, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, '..', 'src');

// Цвета из COLOR_MAP, которые проверяем в обработанных потоках
const DARK_PAGE_FILL = '0.078 0.078 0.094 rg'; // заливка, добавляемая на каждую страницу
const REMAPPED_TEXT = '0.86275 0.86275 0.89412 rg'; // 0,0,0 → 220,220,228

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

/** Нарочно светлый PDF: белый фон, чёрный текст, цветные плашки, серая шкала. */
async function buildSamplePdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: rgb(1, 1, 1) });
  page.drawText('CU LMS PDF dark theme fixture', {
    x: 50,
    y: 770,
    size: 20,
    font: bold,
    color: rgb(0, 0, 0),
  });
  page.drawText('White ground, black text — must come out dark.', {
    x: 50,
    y: 742,
    size: 12,
    font,
    color: rgb(0, 0, 0),
  });

  const swatches: Array<[number, number, number]> = [
    [119, 90, 255], // Expert Blue
    [0, 166, 81], // Base Green
    [255, 102, 44], // Brand Orange
    [200, 200, 200], // Grey
  ];
  swatches.forEach(([r, g, b], i) => {
    page.drawRectangle({
      x: 50,
      y: 640 - i * 70,
      width: 220,
      height: 50,
      color: rgb(r / 255, g / 255, b / 255),
    });
  });

  for (let i = 0; i < 8; i++) {
    const v = i / 7;
    page.drawRectangle({ x: 50 + i * 60, y: 260, width: 55, height: 55, color: rgb(v, v, v) });
  }

  return Buffer.from(await pdf.save());
}

let server: Server;
let origin: string;

test.beforeAll(async () => {
  const samplePdf = await buildSamplePdf();

  server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;

    if (path === '/sample.pdf') {
      res.writeHead(200, { 'Content-Type': 'application/pdf' });
      res.end(samplePdf);
      return;
    }

    // Раздаём только из src/, без выхода наружу
    const target = normalize(join(srcDir, path));
    if (!target.startsWith(srcDir + sep) || !existsSync(target)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': MIME[extname(target)] ?? 'application/octet-stream',
    });
    res.end(readFileSync(target));
  });

  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('сервер не поднялся');
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
});

test.describe('pdf_viewer.html в Firefox', () => {
  test('экран загрузки лежит в статической разметке', async ({ page, request }) => {
    // Тест имеет смысл только в Gecko: в Chromium старый код работал.
    const ua = await page.evaluate(() => navigator.userAgent);
    expect(ua).toContain('Firefox');

    // Ничего не дорисовывается снаружи через document.write — спиннер и строка
    // статуса приезжают прямо в HTML. Именно этого не хватало старой версии.
    const res = await request.get(`${origin}/plugins/longreads/pdf_viewer.html`);
    const html = await res.text();
    expect(html).toContain('id="pdf-loader"');
    expect(html).toContain('id="pdf-status"');
    expect(html).not.toContain('document.write');
  });

  test('рендерит перекрашенный PDF во встроенной смотрелке', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

    const url =
      `${origin}/plugins/longreads/pdf_viewer.html` +
      `?src=${encodeURIComponent('/sample.pdf')}&name=${encodeURIComponent('sample.pdf')}`;
    await page.goto(url);

    const embed = page.locator('iframe.pdf-embed');
    await expect(embed).toBeAttached({ timeout: 30_000 });

    // blob создан в контексте самой страницы — иначе смотрелка его не загрузит
    expect(await embed.getAttribute('src')).toMatch(/^blob:/);

    await expect(page.locator('#pdf-loader')).toBeHidden();
    await expect(page).toHaveTitle('sample.pdf');
    expect(consoleErrors).toEqual([]);
  });

  test('перекрашивает операторы цвета в потоках', async ({ page }) => {
    await page.goto(
      `${origin}/plugins/longreads/pdf_viewer.html?src=${encodeURIComponent('/sample.pdf')}`
    );
    await expect(page.locator('iframe.pdf-embed')).toBeAttached({ timeout: 30_000 });

    // Прогоняем обработку ещё раз прямо в странице и смотрим на байты
    const streams = await page.evaluate(async () => {
      const res = await fetch('/sample.pdf');
      const bytes = new Uint8Array(await res.arrayBuffer());
      const dark = await (
        globalThis as never as { processPdfBytes: (b: Uint8Array) => Promise<Uint8Array> }
      ).processPdfBytes(bytes);

      const lib = (globalThis as never as { PDFLib: typeof import('pdf-lib') }).PDFLib;
      const inflate = (
        globalThis as never as { fflate: { unzlibSync: (b: Uint8Array) => Uint8Array } }
      ).fflate;

      const doc = await lib.PDFDocument.load(dark, { ignoreEncryption: true });
      let text = '';
      for (const [, obj] of doc.context.enumerateIndirectObjects()) {
        const contents = (obj as { getContents?: () => Uint8Array }).getContents?.();
        if (!contents) continue;
        try {
          text += new TextDecoder('latin1').decode(inflate.unzlibSync(contents));
        } catch {
          text += new TextDecoder('latin1').decode(contents);
        }
      }
      return text;
    });

    expect(streams).toContain(DARK_PAGE_FILL);
    expect(streams).toContain(REMAPPED_TEXT);
    expect(streams).not.toMatch(/\b1 1 1 rg\b/); // белый фон не пережил обработку
  });
});
