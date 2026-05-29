// Gera os 3 QR codes do passaporte físico (PNG + SVG) e grava em qr-codes-passaporte/.
// Usa puppeteer headless + qrcode@1.5.1 (CDN) — mesma lib que o admin usa.

import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const OUT_DIR = './qr-codes-passaporte';
const BASE = 'https://www.praiasfluviais.pt';

const QRS = [
  { slug: 'votar',                    label: 'Votar',              filename: 'qr-votar' },
  { slug: 'passaporte',               label: 'Passaporte Digital', filename: 'qr-passaporte' },
  { slug: 'onde-carimbar-passaporte', label: 'Onde Carimbar',      filename: 'qr-onde-carimbar' },
];

mkdirSync(OUT_DIR, { recursive: true });

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();

// Carrega a lib qrcode num blank page.
await page.setContent(`<!DOCTYPE html><html><head>
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js"></script>
</head><body></body></html>`, { waitUntil: 'networkidle2' });

await page.waitForFunction(() => window.QRCode && QRCode.toDataURL && QRCode.toString);

for (const q of QRS) {
  const url = `${BASE}/${q.slug}`;
  console.log(`→ ${q.label}: ${url}`);

  const { png, svg } = await page.evaluate(async (url) => {
    const opts = {
      margin: 2,
      errorCorrectionLevel: 'H',
      color: { dark: '#000000', light: '#FFFFFF' },
    };
    const png = await QRCode.toDataURL(url, { ...opts, width: 1500 });
    const svg = await QRCode.toString(url, { ...opts, type: 'svg' });
    return { png, svg };
  }, url);

  const pngBuf = Buffer.from(png.split(',')[1], 'base64');
  writeFileSync(join(OUT_DIR, `${q.filename}.png`), pngBuf);
  writeFileSync(join(OUT_DIR, `${q.filename}.svg`), svg);
  console.log(`   ✓ ${q.filename}.png + .svg`);
}

const readme = [
  'QR Codes do Passaporte Físico — Praias Fluviais',
  '',
  'Gerado em ' + new Date().toISOString(),
  '',
  'Cada par PNG + SVG codifica o URL indicado abaixo.',
  'Faça um scan de teste com o telemóvel antes de enviar para impressão.',
  '',
  ...QRS.map(q => `• ${q.label}: ${BASE}/${q.slug}`),
  '',
  'PNG: 1500×1500 px, correção de erro H (30% — robusto a desgaste).',
  'SVG: vectorial, escala infinita sem perda — recomendado para impressão a qualquer tamanho.',
].join('\n');
writeFileSync(join(OUT_DIR, 'README.txt'), readme);

await browser.close();
console.log(`\nFeito. Ficheiros em: ${OUT_DIR}/`);
