// ─── Watermark (espelho de scripts/process-beach-photos.py) ────────────────
// Aplica a marca de água do Guia das Praias Fluviais a uma imagem via canvas.
// O posicionamento e parâmetros DEVEM ficar em sincronia com a versão Python.
// Sempre que se editar uma constante aqui, alterar também process-beach-photos.py
// (e vice-versa) — assim novas fotos via admin ficam idênticas às da revista.
(function (global) {
  'use strict';

  // ┌──────────────────────── Spec da marca de água ──────────────────────┐
  // Apenas logo discreto no canto superior direito. Em sincronia com Python.
  const SPEC = {
    MAX_W: 1600,
    JPEG_QUALITY: 0.82,
    LOGO_PATH: 'brand_assets/logotipo.png',

    LOGO_WIDTH_PCT: 0.10,
    LOGO_ALPHA_FACTOR: 0.50,
    LOGO_PAD_RIGHT_PCT: 0.018,
    LOGO_PAD_TOP_PCT: 0.022,      // posição fixa no topo

    BACKDROP_PAD_PCT: 0.020,
    BACKDROP_ALPHA: 45,           // 0-255
  };

  let _logoPromise = null;
  function loadLogo() {
    if (_logoPromise) return _logoPromise;
    _logoPromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('logo'));
      img.src = SPEC.LOGO_PATH;
    });
    return _logoPromise;
  }

  function loadFile(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('imagem inválida'));
      const reader = new FileReader();
      reader.onload = e => { img.src = e.target.result; };
      reader.onerror = () => reject(new Error('leitura falhou'));
      reader.readAsDataURL(file);
    });
  }

  function alphaToRgba(rgb, alpha255) {
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(alpha255 / 255).toFixed(3)})`;
  }

  function downscaleToMaxW(img) {
    let w = img.width, h = img.height;
    if (w > SPEC.MAX_W) {
      h = Math.round(h * SPEC.MAX_W / w);
      w = SPEC.MAX_W;
    }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return canvas;
  }

  function drawWatermarkOnCanvas(canvas, logo) {
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');

    // Posição FIXA — canto superior direito
    const logoW = Math.round(w * SPEC.LOGO_WIDTH_PCT);
    const logoH = Math.round(logo.height * (logoW / logo.width));
    const padR = Math.round(w * SPEC.LOGO_PAD_RIGHT_PCT);
    const logoY = Math.round(w * SPEC.LOGO_PAD_TOP_PCT);
    const logoX = w - logoW - padR;

    // Backdrop arredondado escuro, suavizado, atrás do logo
    const bp = Math.round(w * SPEC.BACKDROP_PAD_PCT);
    const bdX = logoX - bp, bdY = logoY - bp;
    const bdW = logoW + bp * 2, bdH = logoH + bp * 2;

    // Canvas auxiliar para aplicar blur ao backdrop
    const bd = document.createElement('canvas');
    bd.width = w; bd.height = h;
    const bdctx = bd.getContext('2d');
    bdctx.fillStyle = alphaToRgba([0, 0, 0], SPEC.BACKDROP_ALPHA);
    const radius = Math.round(logoH * 0.5);
    if (typeof bdctx.roundRect === 'function') {
      bdctx.beginPath();
      bdctx.roundRect(bdX, bdY, bdW, bdH, radius);
      bdctx.fill();
    } else {
      // Fallback rounded rect
      bdctx.beginPath();
      bdctx.moveTo(bdX + radius, bdY);
      bdctx.lineTo(bdX + bdW - radius, bdY);
      bdctx.quadraticCurveTo(bdX + bdW, bdY, bdX + bdW, bdY + radius);
      bdctx.lineTo(bdX + bdW, bdY + bdH - radius);
      bdctx.quadraticCurveTo(bdX + bdW, bdY + bdH, bdX + bdW - radius, bdY + bdH);
      bdctx.lineTo(bdX + radius, bdY + bdH);
      bdctx.quadraticCurveTo(bdX, bdY + bdH, bdX, bdY + bdH - radius);
      bdctx.lineTo(bdX, bdY + radius);
      bdctx.quadraticCurveTo(bdX, bdY, bdX + radius, bdY);
      bdctx.closePath();
      bdctx.fill();
    }
    ctx.filter = `blur(${Math.round(logoH * 0.25)}px)`;
    ctx.drawImage(bd, 0, 0);
    ctx.filter = 'none';

    // Logo tingido a branco
    const lc = document.createElement('canvas');
    lc.width = logoW; lc.height = logoH;
    const lctx = lc.getContext('2d');
    lctx.drawImage(logo, 0, 0, logoW, logoH);
    lctx.globalCompositeOperation = 'source-in';
    lctx.fillStyle = '#ffffff';
    lctx.fillRect(0, 0, logoW, logoH);
    ctx.globalAlpha = SPEC.LOGO_ALPHA_FACTOR;
    ctx.drawImage(lc, logoX, logoY);
    ctx.globalAlpha = 1;
  }

  // Calcula o ponto focal vertical (25–80). Espelha process-beach-photos.py.
  function computeFocalY(canvas) {
    const W = canvas.width, H = canvas.height;
    const sampleW = Math.min(220, W);
    const sampleH = Math.max(1, Math.round(H * sampleW / W));
    const tmp = document.createElement('canvas');
    tmp.width = sampleW; tmp.height = sampleH;
    tmp.getContext('2d').drawImage(canvas, 0, 0, sampleW, sampleH);
    const data = tmp.getContext('2d').getImageData(0, 0, sampleW, sampleH).data;

    // Grayscale por linha
    const gray = new Float32Array(sampleW * sampleH);
    for (let i = 0; i < sampleW * sampleH; i++) {
      const off = i * 4;
      gray[i] = 0.299 * data[off] + 0.587 * data[off + 1] + 0.114 * data[off + 2];
    }

    // Edge score por linha (Sobel-like vertical) + variância
    const rowScore = new Float32Array(sampleH);
    for (let y = 0; y < sampleH; y++) {
      let edgeSum = 0, lumSum = 0;
      for (let x = 0; x < sampleW; x++) {
        const v = gray[y * sampleW + x];
        lumSum += v;
        const up = y > 0 ? gray[(y - 1) * sampleW + x] : v;
        const left = x > 0 ? gray[y * sampleW + (x - 1)] : v;
        edgeSum += Math.abs(v - up) + Math.abs(v - left);
      }
      const mean = lumSum / sampleW;
      let varSum = 0;
      for (let x = 0; x < sampleW; x++) {
        const d = gray[y * sampleW + x] - mean;
        varSum += d * d;
      }
      const variance = varSum / sampleW;
      rowScore[y] = edgeSum + 0.4 * Math.sqrt(variance) * sampleW;
    }

    if (sampleH === 0) return 50;
    const maxS = Math.max(...rowScore);
    if (maxS === 0) return 50;

    // 1) Centróide com power weighting ^1.6
    let totalP = 0, accP = 0;
    for (let y = 0; y < sampleH; y++) {
      const p = Math.pow(rowScore[y], 1.6);
      totalP += p;
      accP += y * p;
    }
    const centroidPct = (accP / Math.max(totalP, 1)) / sampleH * 100;

    // 2) Mediana cumulativa
    let total = 0;
    for (let y = 0; y < sampleH; y++) total += rowScore[y];
    const target = total * 0.5;
    let cum = 0, medianRow = Math.floor(sampleH / 2);
    for (let y = 0; y < sampleH; y++) {
      cum += rowScore[y];
      if (cum >= target) { medianRow = y; break; }
    }
    const medianPct = medianRow / sampleH * 100;

    // 3) Sky-band detection
    const sorted = Array.from(rowScore).sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    const skyThr = med * 0.30;
    let skyEnd = 0;
    for (let y = 0; y < sampleH; y++) {
      if (rowScore[y] > skyThr) { skyEnd = y; break; }
      skyEnd = y + 1;
    }
    const skyPct = skyEnd / sampleH * 100;

    let focal = Math.max(centroidPct, medianPct);
    if (skyPct >= 8) {
      const skyAware = (skyPct + 100) / 2;
      focal = Math.max(focal, skyAware * 0.85 + 50 * 0.15);
    }
    return Math.max(25, Math.min(80, Math.round(focal)));
  }

  // API pública unificada — usada pelo admin para preparar uma foto antes do upload.
  // Devolve { blob, focalY } onde focalY é a percentagem vertical (0–100) onde se
  // concentra o conteúdo "interessante" da imagem.
  async function preparePhoto(file, opts = {}) {
    const logo = await loadLogo();
    const img = await loadFile(file);
    const canvas = downscaleToMaxW(img);
    const focalY = computeFocalY(canvas);
    if (opts.watermark !== false) {
      drawWatermarkOnCanvas(canvas, logo);
    }
    const blob = await new Promise(resolve =>
      canvas.toBlob(b => resolve(b), 'image/jpeg', opts.quality ?? SPEC.JPEG_QUALITY)
    );
    return { blob, focalY };
  }

  // Compatibilidade com chamadas anteriores
  async function applyWatermark(file, opts = {}) {
    return (await preparePhoto(file, opts)).blob;
  }

  global.GpfWatermark = { applyWatermark, preparePhoto, computeFocalY, SPEC };
})(window);
