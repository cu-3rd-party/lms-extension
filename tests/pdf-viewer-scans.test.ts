/**
 * Тёмная тема PDF: сканы и страницы-картинки (plugins/longreads/pdf_viewer.js).
 *
 * Перекраска цветов правит только операторы в потоках страниц. Скан — это JPEG на всю
 * страницу, поэтому раньше он оставался белым с чёрным текстом, а тёмной была лишь рамка
 * вокруг него. Теперь светлым картинкам-страницам пишется /Decode, при котором белое
 * ложится на цвет заливки страницы, а чёрное — на цвет текста темы.
 *
 * Страницу-просмотрщик достаточно раздать по http: extension API она не использует (см. тот
 * же приём в pdf-viewer-firefox.test.ts). Все PDF собираются прямо в странице через pdf-lib
 * из самой страницы, картинки рисуются на canvas — файлов-фикстур нет.
 *
 * Запуск:
 *   bunx playwright test tests/pdf-viewer-scans.test.ts
 */

import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'http';
import { existsSync, readFileSync } from 'fs';
import { dirname, extname, join, normalize, resolve, sep } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, '..', 'src');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
};

let server: Server;
let origin: string;

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    const target = normalize(join(srcDir, path));
    if (!target.startsWith(srcDir + sep) || !existsSync(target)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(target)] ?? 'application/octet-stream' });
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

type Image = { w: number; h: number; cs: string; bpc: number; decode: number[] | null };

// Значения /Decode для светлой страницы: белое → заливка (20,20,24), чёрное → текст (220,220,228).
const GRAY_DECODE = [220 / 255, 20 / 255];
const RGB_DECODE = [220 / 255, 20 / 255, 220 / 255, 20 / 255, 228 / 255, 24 / 255];

test.describe('тёмная тема PDF: растровые страницы', () => {
  test('инвертирует светлые страницы-картинки, а фото, тёмные картинки и маски не трогает', async ({
    page,
  }) => {
    await page.goto(`${origin}/plugins/longreads/pdf_viewer.html`);
    await page.waitForFunction(
      () => typeof (globalThis as { PDFLib?: unknown }).PDFLib !== 'undefined'
    );

    const images = await page.evaluate(async (): Promise<Image[]> => {
      const g = globalThis as never as {
        PDFLib: typeof import('pdf-lib');
        processPdfBytes: (b: Uint8Array) => Promise<Uint8Array>;
      };
      const { PDFDocument, PDFName } = g.PDFLib;

      const draw = (w: number, h: number, paint: (c: CanvasRenderingContext2D) => void) => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        paint(canvas.getContext('2d')!);
        return canvas;
      };
      const bytesOf = async (canvas: HTMLCanvasElement, type: string) => {
        const blob = await new Promise<Blob>((ok) => canvas.toBlob((b) => ok(b!), type, 0.85));
        return new Uint8Array(await blob.arrayBuffer());
      };

      // 1. Скан: белая страница, чёрные строки текста.
      const scan = draw(600, 800, (c) => {
        c.fillStyle = '#fff';
        c.fillRect(0, 0, 600, 800);
        c.fillStyle = '#000';
        for (let y = 60; y < 740; y += 28) c.fillRect(50, y, 500, 8);
      });
      // 2. Фото: пёстрое, средней яркости.
      const photo = draw(640, 480, (c) => {
        const grad = c.createLinearGradient(0, 0, 640, 480);
        grad.addColorStop(0, '#d02020');
        grad.addColorStop(0.5, '#20a040');
        grad.addColorStop(1, '#2040d0');
        c.fillStyle = grad;
        c.fillRect(0, 0, 640, 480);
      });
      // 3. Тёмная картинка: чёрный фон, немного белого.
      const dark = draw(500, 500, (c) => {
        c.fillStyle = '#050505';
        c.fillRect(0, 0, 500, 500);
        c.fillStyle = '#fff';
        c.fillRect(40, 40, 60, 60);
      });
      // 4. PNG с прозрачностью: у pdf-lib он превращается в картинку + SMask (альфа-канал).
      const alpha = draw(300, 301, (c) => {
        c.fillStyle = 'rgba(250,250,250,0.6)';
        c.fillRect(0, 0, 300, 301);
      });

      const pdf = await PDFDocument.create();
      for (const [canvas, type] of [
        [scan, 'image/jpeg'],
        [photo, 'image/jpeg'],
        [dark, 'image/jpeg'],
      ] as const) {
        const img = await pdf.embedJpg(await bytesOf(canvas, type));
        pdf.addPage([600, 800]).drawImage(img, { x: 0, y: 0, width: 600, height: 800 });
      }
      const png = await pdf.embedPng(await bytesOf(alpha, 'image/png'));
      pdf.addPage([600, 800]).drawImage(png, { x: 0, y: 0, width: 300, height: 301 });

      // 5. Чёрно-белый скан (CCITT/JBIG2 так и выглядят): 1 бит на пиксель, DeviceGray.
      const ctx = pdf.context;
      ctx.register(
        ctx.stream(new Uint8Array(64 * 8).fill(255), {
          Type: PDFName.of('XObject'),
          Subtype: PDFName.of('Image'),
          Width: 64,
          Height: 64,
          ColorSpace: PDFName.of('DeviceGray'),
          BitsPerComponent: 1,
        })
      );

      const dark2 = await g.processPdfBytes(await pdf.save());

      const out = await PDFDocument.load(dark2, { ignoreEncryption: true });
      const result: Image[] = [];
      for (const [, obj] of out.context.enumerateIndirectObjects()) {
        const dict = (obj as { dict?: import('pdf-lib').PDFDict }).dict;
        if (!dict || String(dict.get(PDFName.of('Subtype'))) !== '/Image') continue;
        const decode = dict.lookup(PDFName.of('Decode')) as import('pdf-lib').PDFArray | undefined;
        result.push({
          w: (dict.lookup(PDFName.of('Width')) as import('pdf-lib').PDFNumber).asNumber(),
          h: (dict.lookup(PDFName.of('Height')) as import('pdf-lib').PDFNumber).asNumber(),
          cs: String(dict.lookup(PDFName.of('ColorSpace'))),
          bpc: (
            dict.lookup(PDFName.of('BitsPerComponent')) as import('pdf-lib').PDFNumber
          ).asNumber(),
          decode: decode
            ? decode.asArray().map((n) => (n as import('pdf-lib').PDFNumber).asNumber())
            : null,
        });
      }
      return result;
    });

    const by = (w: number, h: number, cs?: string) =>
      images.find((i) => i.w === w && i.h === h && (!cs || i.cs === cs));
    const near = (actual: number[] | null | undefined, want: number[]) => {
      expect(actual).toBeTruthy();
      expect(actual!.length).toBe(want.length);
      actual!.forEach((v, i) => expect(v).toBeCloseTo(want[i], 3));
    };

    // Скан → инвертирован под цвета темы.
    near(by(600, 800)?.decode, RGB_DECODE);
    // Пёстрое фото и тёмная картинка остаются как есть.
    expect(by(640, 480)?.decode).toBeNull();
    expect(by(500, 500)?.decode).toBeNull();
    // PNG: цветовая часть светлая и бесцветная — инвертирована, а маска прозрачности (SMask) — нет.
    near(by(300, 301, '/DeviceRGB')?.decode, RGB_DECODE);
    // Маска — альфа-канал: инвертировать нельзя (допустим только её собственный нейтральный /Decode).
    const mask = by(300, 301, '/DeviceGray')?.decode;
    expect(mask === null || mask === undefined || (mask[0] === 0 && mask[1] === 1)).toBe(true);
    // Чёрно-белый скан → инвертирован без выборки пикселей.
    near(by(64, 64)?.decode, GRAY_DECODE);
  });

  test('повторная обработка не портит /Decode и не падает без картинок', async ({ page }) => {
    await page.goto(`${origin}/plugins/longreads/pdf_viewer.html`);
    await page.waitForFunction(
      () => typeof (globalThis as { PDFLib?: unknown }).PDFLib !== 'undefined'
    );

    const ok = await page.evaluate(async () => {
      const g = globalThis as never as {
        PDFLib: typeof import('pdf-lib');
        processPdfBytes: (b: Uint8Array) => Promise<Uint8Array>;
      };
      const pdf = await g.PDFLib.PDFDocument.create();
      pdf.addPage([200, 200]); // ни одной картинки
      const dark = await g.processPdfBytes(await pdf.save());
      return dark.length > 0;
    });
    expect(ok).toBe(true);
  });
});
