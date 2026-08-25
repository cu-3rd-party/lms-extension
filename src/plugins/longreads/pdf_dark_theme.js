// pdf_dark_theme.js — Dark theme for PDF files in longreads
// Ported from 3rd-pdf project (pdf.cu3rd.ru)
// Uses pdf-lib + pako to recolor PDF streams client-side,
// then replaces the original download link with the dark version.

if (typeof window.__culmsPdfDarkThemeInitialized === 'undefined') {
  window.__culmsPdfDarkThemeInitialized = true;

  ('use strict');

  const LOG_PREFIX = '[CU LMS PDF Dark]';

  // =========================================================================
  // Storage key
  // =========================================================================
  const SETTING_KEY = 'darkPdfEnabled';

  // =========================================================================
  // Color map (from 3rd-pdf DEFAULT_COLOR_MAP)
  // =========================================================================
  const COLOR_MAP = [
    // White backgrounds → dark
    { light: [255, 255, 255], dark: [20, 20, 24], tolerance: 8 },
    { light: [246, 246, 246], dark: [26, 26, 32], tolerance: 6 },
    { light: [242, 242, 242], dark: [30, 30, 38], tolerance: 6 },
    { light: [230, 230, 230], dark: [36, 36, 44], tolerance: 6 },
    { light: [247, 247, 249], dark: [28, 28, 34], tolerance: 6 },
    { light: [255, 249, 229], dark: [30, 28, 20], tolerance: 8 },
    { light: [255, 228, 150], dark: [60, 55, 20], tolerance: 15 },
    { light: [255, 255, 0], dark: [80, 80, 0], tolerance: 20 },
    // Text
    { light: [0, 0, 0], dark: [220, 220, 228], tolerance: 5 },
    // Stars
    { light: [20, 20, 20], dark: [60, 60, 68], tolerance: 10 },
    { light: [185, 185, 185], dark: [170, 170, 175], tolerance: 6 },
    // Greyscale
    { light: [209, 209, 209], dark: [50, 50, 58], tolerance: 6 },
    { light: [199, 199, 199], dark: [56, 56, 64], tolerance: 6 },
    { light: [200, 200, 200], dark: [55, 55, 65], tolerance: 6 },
    { light: [176, 176, 176], dark: [64, 64, 72], tolerance: 6 },
    { light: [150, 150, 150], dark: [140, 140, 155], tolerance: 6 },
    { light: [136, 136, 136], dark: [110, 110, 125], tolerance: 6 },
    { light: [109, 109, 109], dark: [130, 130, 145], tolerance: 6 },
    { light: [93, 93, 93], dark: [150, 150, 165], tolerance: 6 },
    { light: [79, 79, 79], dark: [160, 160, 175], tolerance: 6 },
    { light: [69, 69, 69], dark: [170, 170, 185], tolerance: 6 },
    { light: [61, 61, 61], dark: [180, 180, 195], tolerance: 6 },
    { light: [221, 221, 221], dark: [45, 45, 55], tolerance: 6 },
    // Expert Blue
    { light: [119, 90, 255], dark: [45, 35, 95], tolerance: 10 },
    { light: [48, 68, 255], dark: [60, 80, 150], tolerance: 10 },
    { light: [33, 11, 106], dark: [160, 140, 255], tolerance: 8 },
    { light: [95, 48, 247], dark: [120, 80, 255], tolerance: 8 },
    { light: [82, 30, 227], dark: [130, 90, 255], tolerance: 8 },
    { light: [67, 24, 191], dark: [140, 100, 255], tolerance: 8 },
    { light: [57, 22, 156], dark: [150, 120, 255], tolerance: 8 },
    { light: [148, 133, 255], dark: [148, 133, 255], tolerance: 8 },
    { light: [184, 177, 255], dark: [100, 90, 180], tolerance: 8 },
    { light: [213, 212, 255], dark: [55, 52, 100], tolerance: 8 },
    { light: [233, 232, 255], dark: [40, 38, 75], tolerance: 8 },
    { light: [243, 242, 255], dark: [30, 28, 55], tolerance: 8 },
    // Base Green
    { light: [0, 166, 81], dark: [0, 200, 100], tolerance: 10 },
    { light: [2, 229, 112], dark: [2, 229, 112], tolerance: 8 },
    { light: [0, 191, 89], dark: [0, 210, 100], tolerance: 8 },
    { light: [6, 117, 61], dark: [30, 180, 90], tolerance: 8 },
    // Star colors
    { light: [48, 69, 255], dark: [80, 100, 255], tolerance: 10 },
    { light: [230, 63, 7], dark: [255, 90, 50], tolerance: 10 },
    { light: [229, 64, 8], dark: [255, 90, 50], tolerance: 10 },
    // Categorical
    { light: [136, 119, 251], dark: [150, 135, 255], tolerance: 10 },
    { light: [78, 166, 151], dark: [90, 190, 175], tolerance: 10 },
    { light: [235, 116, 115], dark: [255, 130, 130], tolerance: 10 },
    { light: [229, 119, 238], dark: [240, 140, 250], tolerance: 10 },
    { light: [116, 194, 112], dark: [130, 210, 130], tolerance: 10 },
    // Brand Accents
    { light: [255, 102, 44], dark: [255, 120, 70], tolerance: 10 },
    { light: [255, 221, 45], dark: [255, 230, 80], tolerance: 12 },
    { light: [254, 104, 185], dark: [255, 120, 195], tolerance: 10 },
    { light: [44, 185, 255], dark: [60, 200, 255], tolerance: 10 },
    { light: [217, 184, 254], dark: [200, 170, 255], tolerance: 10 },
    { light: [113, 195, 203], dark: [130, 210, 220], tolerance: 10 },
    { light: [227, 255, 124], dark: [200, 230, 100], tolerance: 12 },
    // Insight / Link
    { light: [228, 198, 230], dark: [60, 45, 65], tolerance: 10 },
    { light: [96, 135, 220], dark: [110, 150, 240], tolerance: 10 },
    // Misc
    { light: [56, 140, 70], dark: [70, 170, 90], tolerance: 10 },
    { light: [45, 112, 179], dark: [70, 140, 210], tolerance: 10 },
    { light: [180, 3, 180], dark: [210, 50, 210], tolerance: 10 },
  ];

  // =========================================================================
  // Color math utilities
  // =========================================================================
  function rgbDistance(c1, c2) {
    return Math.sqrt((c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2 + (c1[2] - c2[2]) ** 2);
  }

  function invertLuminance(r, g, b) {
    const rf = r / 255,
      gf = g / 255,
      bf = b / 255;
    const max = Math.max(rf, gf, bf),
      min = Math.min(rf, gf, bf);
    let h,
      s,
      l = (max + min) / 2;
    if (max === min) {
      h = 0;
      s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === rf) h = ((gf - bf) / d + (gf < bf ? 6 : 0)) / 6;
      else if (max === gf) h = ((bf - rf) / d + 2) / 6;
      else h = ((rf - gf) / d + 4) / 6;
    }
    l = 1 - l;
    s = Math.min(1, s * 1.1);
    function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    let rr, gg, bb;
    if (s === 0) {
      rr = gg = bb = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      rr = hue2rgb(p, q, h + 1 / 3);
      gg = hue2rgb(p, q, h);
      bb = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(rr * 255), Math.round(gg * 255), Math.round(bb * 255)];
  }

  function mapColor(r, g, b) {
    let best = null,
      bestDist = Infinity;
    for (const entry of COLOR_MAP) {
      const d = rgbDistance([r, g, b], entry.light);
      if (d <= entry.tolerance && d < bestDist) {
        bestDist = d;
        best = entry.dark;
      }
    }
    return best || invertLuminance(r, g, b);
  }

  function cmykToRgb(c, m, y, k) {
    return [
      Math.round(255 * (1 - c) * (1 - k)),
      Math.round(255 * (1 - m) * (1 - k)),
      Math.round(255 * (1 - y) * (1 - k)),
    ];
  }

  // =========================================================================
  // Stream color replacement
  // =========================================================================
  const CMYK_PAT =
    /(^|\s)(?<![\d.]\s)([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(k|K|sc|SC|scn|SCN)\b/g;
  const RGB_PAT = /(^|\s)(?<![\d.]\s)([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(rg|RG|sc|SC|scn|SCN)\b/g;
  const GREY_PAT = /(^|\s)(?<![\d.]\s)([\d.]+)\s+(g|G|sc|SC|scn|SCN)\b/g;

  function replaceColorsInStream(text) {
    let out = text;

    out = out.replace(CMYK_PAT, (_, pfx, p1, p2, p3, p4, op) => {
      const [r, g, b] = cmykToRgb(parseFloat(p1), parseFloat(p2), parseFloat(p3), parseFloat(p4));
      const m = mapColor(r, g, b);
      const rgbOp = op === op.toUpperCase() ? 'RG' : 'rg';
      return `${pfx}${(m[0] / 255).toFixed(5)} ${(m[1] / 255).toFixed(5)} ${(m[2] / 255).toFixed(5)} ${rgbOp}`;
    });

    out = out.replace(RGB_PAT, (_, pfx, p1, p2, p3, op) => {
      const r = Math.round(parseFloat(p1) * 255),
        g = Math.round(parseFloat(p2) * 255),
        b = Math.round(parseFloat(p3) * 255);
      const m = mapColor(r, g, b);
      const rgbOp = op === op.toUpperCase() ? 'RG' : 'rg';
      return `${pfx}${(m[0] / 255).toFixed(5)} ${(m[1] / 255).toFixed(5)} ${(m[2] / 255).toFixed(5)} ${rgbOp}`;
    });

    out = out.replace(GREY_PAT, (match, pfx, p1, op) => {
      const val = parseFloat(p1);
      if (val < 0 || val > 1) return match;
      const grey = Math.round(val * 255);
      const m = mapColor(grey, grey, grey);
      const isUpper = op === op.toUpperCase();
      if (m[0] === m[1] && m[1] === m[2]) {
        return `${pfx}${(m[0] / 255).toFixed(5)} ${isUpper ? 'G' : 'g'}`;
      }
      return `${pfx}${(m[0] / 255).toFixed(5)} ${(m[1] / 255).toFixed(5)} ${(m[2] / 255).toFixed(5)} ${isUpper ? 'RG' : 'rg'}`;
    });

    return out;
  }

  // =========================================================================
  // PDF processing (using pdf-lib + pako loaded from extension bundles)
  // =========================================================================

  let pdfLib = null;
  let fflate = null;

  async function loadDeps() {
    if (pdfLib && fflate) return;

    // pdf-lib is already bundled in the extension (used by course_exporter)
    // We load it dynamically from the global scope or import
    if (typeof window.PDFLib !== 'undefined') {
      pdfLib = window.PDFLib;
    } else {
      // Try to load from the bundled pdf-lib.min.js
      const script = document.createElement('script');
      script.src = browser.runtime.getURL('plugins/_shared/pdf-lib.min.js');
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
      pdfLib = window.PDFLib;
    }

    // Load fflate
    if (typeof window.fflate !== 'undefined') {
      fflate = window.fflate;
    } else {
      const script = document.createElement('script');
      script.src = browser.runtime.getURL('plugins/_shared/fflate.umd.min.js');
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
      fflate = window.fflate;
    }

    if (!pdfLib || !fflate) throw new Error('Failed to load pdf-lib or fflate');
  }

  async function processPdfBytes(originalBytes) {
    await loadDeps();

    const { PDFDocument, PDFName, PDFRef } = pdfLib;
    const pdfDoc = await PDFDocument.load(originalBytes, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    const context = pdfDoc.context;

    const streamsToProcess = new Set();

    // 1. Collect page content streams
    const totalPages = pdfDoc.getPageCount();
    for (let i = 0; i < totalPages; i++) {
      const page = pdfDoc.getPage(i);
      const contentsObj = page.node.get(PDFName.of('Contents'));
      if (!contentsObj) continue;
      if (typeof contentsObj.size === 'function') {
        for (let j = 0; j < contentsObj.size(); j++) streamsToProcess.add(contentsObj.get(j));
      } else {
        streamsToProcess.add(contentsObj);
      }
    }

    // 2. Collect Form XObjects
    const allObjects = context.enumerateIndirectObjects();
    for (const [ref, obj] of allObjects) {
      if (obj && typeof obj.get === 'function') {
        const subtype = obj.get(PDFName.of('Subtype'));
        if (subtype && subtype.toString() === '/Form') streamsToProcess.add(ref);
      }
    }

    // 3. Process streams
    for (const ref of streamsToProcess) {
      if (!ref) continue;
      const streamObj = ref instanceof PDFRef ? context.lookup(ref) : ref;
      if (!streamObj || (!streamObj.getContents && !streamObj.contents)) continue;

      try {
        const streamBytes =
          typeof streamObj.getContents === 'function'
            ? streamObj.getContents()
            : streamObj.contents;
        const filterName = streamObj.dict?.get(PDFName.of('Filter'))?.toString() || '';
        let text;

        if (filterName.includes('FlateDecode')) {
          try {
            text = new TextDecoder('latin1').decode(fflate.unzlibSync(streamBytes));
          } catch {
            text = new TextDecoder('latin1').decode(streamBytes);
          }
        } else {
          text = new TextDecoder('latin1').decode(streamBytes);
        }

        const newText = replaceColorsInStream(text);

        if (newText !== text) {
          const latin1Bytes = new Uint8Array(newText.length);
          for (let c = 0; c < newText.length; c++) latin1Bytes[c] = newText.charCodeAt(c) & 0xff;
          const compressed = fflate.zlibSync(latin1Bytes);
          const newStream = context.stream(compressed, {
            Filter: PDFName.of('FlateDecode'),
            Length: compressed.length,
            ...streamObj.dict?.dict,
          });
          if (ref instanceof PDFRef) context.assign(ref, newStream);
        }
      } catch (e) {
        console.warn(`${LOG_PREFIX} Stream error:`, e);
      }
    }

    // 4. Add dark background to all pages
    const bgBytes = new TextEncoder().encode('q 0.078 0.078 0.094 rg 0 0 5000 5000 re f Q\n');
    for (const page of pdfDoc.getPages()) {
      const bgStream = context.stream(bgBytes, { Length: bgBytes.length });
      const bgRef = context.register(bgStream);
      let contents = page.node.get(PDFName.of('Contents'));
      if (!contents) continue;
      if (typeof contents.push === 'function') {
        const arr = context.obj([bgRef]);
        for (let i = 0; i < contents.size(); i++) arr.push(contents.get(i));
        page.node.set(PDFName.of('Contents'), arr);
      } else {
        page.node.set(PDFName.of('Contents'), context.obj([bgRef, contents]));
      }
    }

    return await pdfDoc.save();
  }

  // =========================================================================
  // Cache for processed PDFs (blob URLs keyed by original URL)
  // =========================================================================
  const darkPdfCache = new Map();

  function getDarkPdfUrl(originalUrl) {
    if (darkPdfCache.has(originalUrl)) return darkPdfCache.get(originalUrl);

    const promise = (async () => {
      console.log(`${LOG_PREFIX} Fetching PDF:`, originalUrl.substring(0, 100) + '...');
      const response = await fetch(originalUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const originalBytes = new Uint8Array(await response.arrayBuffer());

      console.log(`${LOG_PREFIX} Processing ${(originalBytes.length / 1024).toFixed(0)} KB PDF...`);
      const darkBytes = await processPdfBytes(originalBytes);

      const blob = new Blob([darkBytes], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      console.log(`${LOG_PREFIX} Dark PDF ready`);
      return blobUrl;
    })();

    darkPdfCache.set(originalUrl, promise);
    return promise;
  }

  // =========================================================================
  // DOM integration — intercept PDF file links in longreads
  // =========================================================================

  function isPdfFile(fileElement) {
    const typeDiv = fileElement.querySelector('.t-type');
    return typeDiv && typeDiv.textContent.trim().toLowerCase() === '.pdf';
  }

  let isDarkPdfStateEnabled = false;
  browser.storage.sync.get([SETTING_KEY]).then((data) => {
    isDarkPdfStateEnabled = !!data[SETTING_KEY];
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[SETTING_KEY]) {
      isDarkPdfStateEnabled = changes[SETTING_KEY].newValue;
    }
  });

  // Get the download URL for a PDF file element via the LMS API
  async function getPdfDownloadUrl(fileElement) {
    const nameDiv = fileElement.querySelector('.t-name');
    const typeDiv = fileElement.querySelector('.t-type');
    if (!nameDiv || !typeDiv) return null;

    const displayName = nameDiv.textContent.trim() + typeDiv.textContent.trim();
    const match = window.location.pathname.match(/longreads\/(\d+)/);
    if (!match) return null;

    // Use the shared materials API if available
    let materialsData;
    if (window.__culmsLmsApi?.fetchMaterials) {
      materialsData = await window.__culmsLmsApi.fetchMaterials(match[1]);
    } else {
      const resp = await fetch(
        `https://my.centraluniversity.ru/api/micro-lms/longreads/${match[1]}/materials?limit=10000`,
        { credentials: 'include' }
      );
      materialsData = await resp.json();
    }

    if (!materialsData?.items) return null;

    let foundFilename = null,
      foundVersion = null;
    for (const item of materialsData.items) {
      if (item.content?.name === displayName && item.content?.filename) {
        foundFilename = item.content.filename;
        foundVersion = item.content.version || item.version;
        break;
      }
      const attachments = item.attachments || item.content?.attachments || [];
      const found = attachments.find((att) => att.name === displayName);
      if (found) {
        foundFilename = found.filename;
        foundVersion = found.version;
        break;
      }
    }

    if (!foundFilename) return null;

    const linkResp = await fetch(
      `https://my.centraluniversity.ru/api/micro-lms/content/download-link?filename=${encodeURIComponent(foundFilename)}&version=${foundVersion}`,
      { credentials: 'include' }
    );
    const linkData = await linkResp.json();
    return linkData?.url || null;
  }

  // Bind a global click listener for PDF file elements
  document.addEventListener(
    'click',
    async (e) => {
      const fileElement = e.target.closest('a.file');
      if (!fileElement) return;

      // Don't intercept download button clicks
      if (e.target.closest('button[tuiiconbutton]') || e.target.closest('button[tuibutton]'))
        return;

      // Allow fallback clicks to pass through to Angular natively
      if (fileElement.dataset.cuPdfDarkIgnore === 'true') {
        delete fileElement.dataset.cuPdfDarkIgnore;
        return;
      }

      if (!isPdfFile(fileElement)) return;
      if (!isDarkPdfStateEnabled) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const originalOpacity = fileElement.style.opacity;
      const originalCursor = fileElement.style.cursor;
      fileElement.style.opacity = '0.5';
      fileElement.style.cursor = 'wait';

      try {
        await loadDeps();
        const pdfUrl = await getPdfDownloadUrl(fileElement);
        if (!pdfUrl) {
          // This is likely a student solution or something not in the materials API.
          // We already stopped propagation, so we must manually re-trigger a click
          // to let the native Angular handler download it.
          fileElement.dataset.cuPdfDarkIgnore = 'true';
          fileElement.click();
          return;
        }

        const darkUrl = await getDarkPdfUrl(pdfUrl);
        window.open(darkUrl, '_blank');
      } catch (err) {
        console.error(`${LOG_PREFIX} Error processing PDF:`, err);
      } finally {
        fileElement.style.opacity = originalOpacity;
        fileElement.style.cursor = originalCursor;
      }
    },
    { capture: true }
  );

  // =========================================================================
  // Silent Background Preloading
  // =========================================================================

  async function preloadPdf(fileElement) {
    if (fileElement.dataset.cuPdfDarkPreloaded) return;
    fileElement.dataset.cuPdfDarkPreloaded = 'true';

    try {
      if (!isDarkPdfStateEnabled) return;
      await loadDeps();
      const pdfUrl = await getPdfDownloadUrl(fileElement);
      if (pdfUrl) {
        // We do NOT await getDarkPdfUrl here so it processes in background without blocking the loop
        getDarkPdfUrl(pdfUrl).catch((e) => console.warn(`${LOG_PREFIX} Preload error:`, e));
      }
    } catch (e) {
      // ignore
    }
  }

  function scanAndPreload() {
    if (!isDarkPdfStateEnabled) return;
    const pdfFiles = document.querySelectorAll('a.file:not([data-cu-pdf-dark-preloaded])');
    for (const el of pdfFiles) {
      if (isPdfFile(el)) preloadPdf(el);
    }
  }

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((m) => m.addedNodes.length > 0)) {
      clearTimeout(observer._timeout);
      observer._timeout = setTimeout(scanAndPreload, 500);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  scanAndPreload();
}
