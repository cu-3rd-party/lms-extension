// gif_reencode.js — пережимает анимацию в компактный GIF, сохраняя движение.
//
// Зачем это в расширении. Тяжёлую гифку нельзя ни сохранить как есть (хранилище
// одно на все курсы, а в Firefox большие значения ещё и читаются медленно), ни
// пропустить через canvas — оттуда выходит один кадр. Поэтому анимацию
// разбираем на кадры, уменьшаем и собираем обратно.
//
// Готового кодировщика анимации в браузере нет: `canvas.toDataURL` умеет только
// статичную картинку, а WebCodecs кодирует видео, но не анимированные GIF/WebP.
// Отсюда свой сборщик GIF — палитра медианным сечением плюс LZW.
//
// Наружу отдаётся `window.cuLmsGifReencode`, им пользуется course_cards.js.

if (typeof window.cuLmsGifReencode === 'undefined') {
  ('use strict');

  // Перебор от «почти без потерь» к «лишь бы влезло»: на каждом шаге режем
  // сторону, число цветов и частоту кадров.
  const PRESETS = [
    { side: 480, colors: 256, step: 1 },
    { side: 480, colors: 128, step: 1 },
    { side: 420, colors: 128, step: 2 },
    { side: 360, colors: 128, step: 2 },
    { side: 320, colors: 64, step: 2 },
    { side: 280, colors: 64, step: 3 },
    { side: 240, colors: 32, step: 3 },
    { side: 200, colors: 32, step: 4 },
  ];

  const supported = () => typeof ImageDecoder !== 'undefined';

  // --- РАСПОЗНАВАНИЕ ФОРМАТОВ ---

  /** Сырые байты из data-URL; `limit` ограничивает разбор началом файла. */
  function bytesFromDataUrl(dataUrl, limit) {
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    // 4 символа base64 = 3 байта; режем по границе четвёрки, иначе atob упадёт.
    const chunk = limit ? base64.slice(0, Math.ceil(limit / 3) * 4) : base64;

    try {
      const binary = atob(chunk);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    } catch (_error) {
      return null;
    }
  }

  function hasMarker(bytes, marker, searchLimit) {
    const end = Math.min(bytes.length, searchLimit || bytes.length) - marker.length;
    for (let i = 0; i <= end; i++) {
      let matched = true;
      for (let j = 0; j < marker.length; j++) {
        if (bytes[i + j] !== marker.charCodeAt(j)) {
          matched = false;
          break;
        }
      }
      if (matched) return true;
    }
    return false;
  }

  /**
   * Анимированная ли картинка — по сигнатурам в самом файле, а не по MIME-типу.
   *
   * По типу определить нельзя: `image/webp` и `image/png` бывают и статичными,
   * и анимированными, а именно анимированный webp сейчас отдаёт большинство
   * конвертеров «gif → webp».
   */
  function isAnimated(bytes) {
    if (!bytes || bytes.length < 12) return false;

    // GIF: каждый кадр предваряется блоком Graphic Control Extension (21 F9).
    if (hasMarker(bytes, 'GIF8', 4)) {
      let frames = 0;
      for (let i = 0; i + 1 < bytes.length; i++) {
        if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && ++frames > 1) return true;
      }
      return false;
    }

    // WebP: анимация объявляется чанком ANIM сразу за расширенным заголовком VP8X.
    if (hasMarker(bytes, 'WEBP', 16)) return hasMarker(bytes, 'ANIM', 256);

    // APNG: чанк acTL обязан идти до первого IDAT, то есть в начале файла.
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return hasMarker(bytes, 'acTL', 4096);

    return false;
  }

  // --- РАЗБОР НА КАДРЫ ---

  /**
   * ImageDecoder отдаёт уже собранные кадры анимации, поэтому возиться с
   * disposal-методами GIF и прозрачностью предыдущих кадров не нужно.
   */
  async function decodeFrames(file) {
    const type = file.type || 'image/gif';
    if (!(await ImageDecoder.isTypeSupported(type))) {
      throw new Error('Браузер не умеет разбирать ' + type);
    }

    const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type });
    // Сначала tracks.ready: до него список дорожек пуст и selectedTrack === null,
    // то есть любой файл выглядел бы как одиночный кадр.
    await decoder.tracks.ready;
    await decoder.completed;

    const track = decoder.tracks.selectedTrack;
    const count = track ? track.frameCount : 1;
    if (count < 2) throw new Error('В файле один кадр');

    const frames = [];
    for (let i = 0; i < count; i++) {
      const { image } = await decoder.decode({ frameIndex: i });
      frames.push({
        image,
        // duration приходит в микросекундах; 100 мс — дефолт для кадра без задержки.
        durationMs: image.duration ? image.duration / 1000 : 100,
      });
    }
    return frames;
  }

  /** Кадры → пиксели нужного размера. Задержка выброшенного кадра уходит предыдущему. */
  function rasterize(frames, maxSide, step) {
    const first = frames[0].image;
    const scale = Math.min(1, maxSide / Math.max(first.displayWidth, first.displayHeight));
    const width = Math.max(1, Math.round(first.displayWidth * scale));
    const height = Math.max(1, Math.round(first.displayHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const out = [];
    let carried = 0;
    frames.forEach((frame, index) => {
      if (index % step !== 0) {
        // Иначе анимация ускорится ровно во столько раз, сколько кадров выкинули.
        if (out.length) out[out.length - 1].delayMs += frame.durationMs;
        else carried += frame.durationMs;
        return;
      }
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(frame.image, 0, 0, width, height);
      out.push({
        data: ctx.getImageData(0, 0, width, height).data,
        delayMs: frame.durationMs + carried,
      });
      carried = 0;
    });

    return { width, height, frames: out };
  }

  // --- ПАЛИТРА ---

  function hasTransparency(rasterized) {
    for (const frame of rasterized.frames) {
      const data = frame.data;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 128) return true;
      }
    }
    return false;
  }

  /**
   * Медианное сечение по выборке пикселей всех кадров: палитра в GIF одна на
   * весь файл, поэтому и считать её надо сразу по всей анимации.
   */
  function buildPalette(rasterized, maxColors, alpha) {
    const limit = alpha ? maxColors - 1 : maxColors;
    const samples = [];
    const total = rasterized.frames.length * rasterized.width * rasterized.height;
    const stride = Math.max(1, Math.floor(total / 18000)) * 4;

    for (const frame of rasterized.frames) {
      const data = frame.data;
      for (let i = 0; i < data.length; i += stride) {
        if (data[i + 3] < 128) continue;
        samples.push([data[i], data[i + 1], data[i + 2]]);
      }
    }
    if (!samples.length) samples.push([0, 0, 0]);

    let boxes = [samples];
    while (boxes.length < limit) {
      let target = -1;
      let targetChannel = 0;
      let widest = 0;

      boxes.forEach((box, index) => {
        if (box.length < 2) return;
        for (let c = 0; c < 3; c++) {
          let min = 255;
          let max = 0;
          for (const px of box) {
            if (px[c] < min) min = px[c];
            if (px[c] > max) max = px[c];
          }
          if (max - min > widest) {
            widest = max - min;
            target = index;
            targetChannel = c;
          }
        }
      });

      if (target < 0 || widest === 0) break;

      const box = boxes[target];
      box.sort((a, b) => a[targetChannel] - b[targetChannel]);
      const half = box.length >> 1;
      boxes.splice(target, 1, box.slice(0, half), box.slice(half));
    }

    const palette = boxes.map((box) => {
      let r = 0;
      let g = 0;
      let b = 0;
      for (const px of box) {
        r += px[0];
        g += px[1];
        b += px[2];
      }
      return [Math.round(r / box.length), Math.round(g / box.length), Math.round(b / box.length)];
    });

    // Индекс 0 резервируем под прозрачность, если она в файле есть.
    if (alpha) palette.unshift([0, 0, 0]);
    while (palette.length < 2) palette.push([0, 0, 0]);
    return palette;
  }

  /** RGBA → индексы палитры. Без кэша по огрублённому цвету это непозволительно долго. */
  function mapToPalette(data, palette, transparentIndex) {
    const indices = new Uint8Array(data.length / 4);
    const cache = new Map();
    const from = transparentIndex >= 0 ? 1 : 0;

    for (let p = 0, i = 0; i < data.length; i += 4, p++) {
      if (transparentIndex >= 0 && data[i + 3] < 128) {
        indices[p] = transparentIndex;
        continue;
      }
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);

      let found = cache.get(key);
      if (found === undefined) {
        let best = from;
        let bestDistance = Infinity;
        for (let c = from; c < palette.length; c++) {
          const dr = r - palette[c][0];
          const dg = g - palette[c][1];
          const db = b - palette[c][2];
          const distance = dr * dr + dg * dg + db * db;
          if (distance < bestDistance) {
            bestDistance = distance;
            best = c;
          }
        }
        found = best;
        cache.set(key, found);
      }
      indices[p] = found;
    }
    return indices;
  }

  // --- СБОРКА GIF ---

  function lzwEncode(indices, minCodeSize, out) {
    const clearCode = 1 << minCodeSize;
    const endCode = clearCode + 1;

    let codeSize = minCodeSize + 1;
    let nextCode = endCode + 1;
    let dictionary = new Map();

    const bytes = [];
    let bitBuffer = 0;
    let bitCount = 0;

    const emit = (code) => {
      bitBuffer |= code << bitCount;
      bitCount += codeSize;
      while (bitCount >= 8) {
        bytes.push(bitBuffer & 0xff);
        bitBuffer >>= 8;
        bitCount -= 8;
      }
    };

    emit(clearCode);
    let prefix = indices[0];

    for (let i = 1; i < indices.length; i++) {
      const k = indices[i];
      const key = (prefix << 8) | k;
      const known = dictionary.get(key);
      if (known !== undefined) {
        prefix = known;
        continue;
      }

      emit(prefix);
      if (nextCode < 4096) {
        dictionary.set(key, nextCode++);
        if (nextCode > 1 << codeSize && codeSize < 12) codeSize++;
      } else {
        emit(clearCode);
        dictionary = new Map();
        nextCode = endCode + 1;
        codeSize = minCodeSize + 1;
      }
      prefix = k;
    }

    emit(prefix);
    emit(endCode);
    if (bitCount > 0) bytes.push(bitBuffer & 0xff);

    // Данные пишутся блоками не длиннее 255 байт.
    for (let i = 0; i < bytes.length; i += 255) {
      const block = bytes.slice(i, i + 255);
      out.push(block.length);
      for (const byte of block) out.push(byte);
    }
    out.push(0);
  }

  function encodeGif(rasterized, palette, transparentIndex) {
    const { width, height } = rasterized;
    let bits = 1;
    while (1 << bits < palette.length) bits++;
    const tableSize = 1 << bits;

    const out = [];
    const pushShort = (value) => out.push(value & 0xff, (value >> 8) & 0xff);
    const pushAscii = (text) => {
      for (const ch of text) out.push(ch.charCodeAt(0));
    };

    pushAscii('GIF89a');
    pushShort(width);
    pushShort(height);
    out.push(0xf0 | (bits - 1), 0, 0);

    for (let i = 0; i < tableSize; i++) {
      const color = palette[i] || [0, 0, 0];
      out.push(color[0], color[1], color[2]);
    }

    // NETSCAPE2.0 — бесконечный цикл.
    out.push(0x21, 0xff, 0x0b);
    pushAscii('NETSCAPE2.0');
    out.push(0x03, 0x01, 0x00, 0x00, 0x00);

    const minCodeSize = Math.max(2, bits);

    for (const frame of rasterized.frames) {
      const delay = Math.max(2, Math.round(frame.delayMs / 10));
      out.push(0x21, 0xf9, 0x04);
      // disposal = 2 (очистить перед следующим кадром) + флаг прозрачности.
      out.push((2 << 2) | (transparentIndex >= 0 ? 1 : 0));
      pushShort(delay);
      out.push(transparentIndex >= 0 ? transparentIndex : 0, 0);

      out.push(0x2c);
      pushShort(0);
      pushShort(0);
      pushShort(width);
      pushShort(height);
      out.push(0);

      out.push(minCodeSize);
      lzwEncode(mapToPalette(frame.data, palette, transparentIndex), minCodeSize, out);
    }

    out.push(0x3b);
    return new Uint8Array(out);
  }

  function toDataUrl(bytes) {
    let binary = '';
    // По кускам: apply на массив в сотни тысяч элементов переполняет стек.
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return 'data:image/gif;base64,' + btoa(binary);
  }

  function buildOnce(frames, options) {
    const rasterized = rasterize(frames, options.side, options.step);
    const alpha = hasTransparency(rasterized);
    const palette = buildPalette(rasterized, options.colors, alpha);
    return { bytes: encodeGif(rasterized, palette, alpha ? 0 : -1), rasterized };
  }

  /**
   * Ужимает анимацию до `maxBytes`, перебирая пресеты сверху вниз.
   * Возвращает `null`, если разобрать файл не удалось (в том числе если
   * анимации в нём нет) — вызывающий сам решает, что делать дальше.
   *
   * `onProgress(текст)` зовётся перед каждой попыткой: перекодирование большой
   * гифки занимает секунды, и без обратной связи это выглядит как зависание.
   */
  async function run(file, { maxBytes, onProgress } = {}) {
    if (!supported()) return null;

    let frames = null;
    try {
      if (onProgress) onProgress('Разбираю анимацию на кадры…');
      frames = await decodeFrames(file);

      let best = null;
      for (let i = 0; i < PRESETS.length; ) {
        const options = PRESETS[i];
        if (onProgress) {
          onProgress(
            `Сжимаю: ${options.side} px, ${options.colors} цветов, ${frames.length} кадров…`
          );
        }
        // Пауза на кадр, иначе страница замирает на всё время перебора.
        await new Promise((resolve) => setTimeout(resolve, 0));

        best = buildOnce(frames, options);
        if (!maxBytes || best.bytes.length <= maxBytes) break;
        if (i === PRESETS.length - 1) break;

        // Промах в разы — перепрыгиваем через пресеты: каждая попытка это
        // полное перекодирование всех кадров, и на тяжёлой гифке они секундные.
        const overshoot = best.bytes.length / maxBytes;
        const jump = overshoot > 3 ? 3 : overshoot > 1.8 ? 2 : 1;
        i = Math.min(i + jump, PRESETS.length - 1);
      }

      return {
        dataUrl: toDataUrl(best.bytes),
        bytes: best.bytes.length,
        width: best.rasterized.width,
        height: best.rasterized.height,
        frames: best.rasterized.frames.length,
      };
    } catch (error) {
      if (typeof window.cuLmsLog === 'function') {
        window.cuLmsLog('[gif-reencode] Не удалось пережать анимацию:', error);
      }
      return null;
    } finally {
      if (frames) frames.forEach((frame) => frame.image.close());
    }
  }

  window.cuLmsGifReencode = { supported, run, isAnimated, bytesFromDataUrl };
}
