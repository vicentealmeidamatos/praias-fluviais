// Verifica end-to-end os QR codes do admin (praias + passaporte físico):
//   1. Carrega as MESMAS libs CDN que o admin.html usa (qrcode + JSZip)
//   2. Reproduz a lógica das funções _generateQRSvg/_generateQRDataURL e
//      downloadAllBeachQRsZip / downloadAllPassportPhysicalQRsZip
//   3. Valida SVG bem-formado, ZIP válido
//   4. Decodifica os PNG resultantes com jsQR e confirma os URLs encoded

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const OUT = './qr-codes-passaporte/_verificacao';
mkdirSync(OUT, { recursive: true });

const BASE = 'https://www.praiasfluviais.pt';

const PASSPORT_QRS = [
  { slug: 'votar',                    filename: 'qr-votar' },
  { slug: 'passaporte',               filename: 'qr-passaporte' },
  { slug: 'onde-carimbar-passaporte', filename: 'qr-onde-carimbar' },
];

// 3 praias de amostra do dataset real
const beaches = JSON.parse(readFileSync('./data/beaches.json', 'utf8'));
const sampleBeaches = beaches.filter(b => b.id && !b.hidden).slice(0, 3);

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('console', msg => console.log('   [browser]', msg.text()));

// Mesma URL CDN que admin.html usa (linha 57 + 58)
await page.setContent(`<!DOCTYPE html><html><head>
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"></script>
</head><body></body></html>`, { waitUntil: 'networkidle2' });

await page.waitForFunction(() => window.QRCode && window.JSZip && window.jsQR);
console.log('✓ Libs CDN carregadas: qrcode@1.5.1, jszip@3.10.1, jsQR@1.4.0');

const verifyOne = async (url, label) => {
  const result = await page.evaluate(async (url) => {
    const opts = {
      margin: 2,
      errorCorrectionLevel: 'H',
      color: { dark: '#000000', light: '#FFFFFF' },
    };
    const svg = await QRCode.toString(url, { ...opts, type: 'svg' });
    const dataUrl = await QRCode.toDataURL(url, { ...opts, width: 1500 });

    // Render PNG into a canvas e decoda com jsQR para confirmar o URL embedded
    const img = new Image();
    img.src = dataUrl;
    await new Promise(r => { img.onload = r; });
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const decoded = jsQR(imgData.data, canvas.width, canvas.height);
    return { svg, png: dataUrl, decoded: decoded ? decoded.data : null };
  }, url);

  // 1. SVG bem-formado?
  const svgOk = /^<\?xml[^>]*\?>\s*<svg[^>]*>/.test(result.svg) || /^<svg[^>]*>/.test(result.svg);
  // 2. URL encoded == URL pedido?
  const decodedOk = result.decoded === url;

  console.log(`\n${label}`);
  console.log(`  URL pedido     : ${url}`);
  console.log(`  URL decoded    : ${result.decoded}`);
  console.log(`  SVG bem-formado: ${svgOk ? '✓' : '✗'}`);
  console.log(`  Round-trip URL : ${decodedOk ? '✓' : '✗ MISMATCH!'}`);

  // Guardar para inspecção visual
  writeFileSync(join(OUT, `${label}.svg`), result.svg);
  writeFileSync(join(OUT, `${label}.png`), Buffer.from(result.png.split(',')[1], 'base64'));

  return svgOk && decodedOk;
};

let allOk = true;

console.log('\n─── QR Codes do Passaporte Físico ───');
for (const q of PASSPORT_QRS) {
  const ok = await verifyOne(`${BASE}/${q.slug}`, q.filename);
  if (!ok) allOk = false;
}

console.log('\n─── QR Codes das Praias (amostra) ───');
for (const b of sampleBeaches) {
  const url = `${BASE}/carimbar?id=${encodeURIComponent(b.id)}`;
  const ok = await verifyOne(url, `praia-${b.id}`);
  if (!ok) allOk = false;
}

console.log('\n─── Teste do ZIP (mesma lógica que downloadAllBeachQRsZip) ───');
const zipResult = await page.evaluate(async (beaches, base) => {
  const opts = { margin: 2, errorCorrectionLevel: 'H', color: { dark: '#000000', light: '#FFFFFF' } };
  const zip = new JSZip();
  const filenames = [];
  for (const b of beaches) {
    const fname = `${b.id}.svg`;
    const svg = await QRCode.toString(`${base}/carimbar?id=${encodeURIComponent(b.id)}`, { ...opts, type: 'svg' });
    zip.file(fname, svg);
    filenames.push(fname);
  }
  const blob = await zip.generateAsync({ type: 'uint8array' });
  return { filenames, byteLength: blob.length, bytes: Array.from(blob) };
}, sampleBeaches.map(b => ({ id: b.id })), BASE);

const zipBuf = Buffer.from(zipResult.bytes);
writeFileSync(join(OUT, 'amostra-praias.zip'), zipBuf);
console.log(`  ZIP criado     : ${zipResult.byteLength} bytes`);
console.log(`  Ficheiros      : ${zipResult.filenames.join(', ')}`);
console.log(`  Magic bytes    : ${zipBuf.slice(0,4).toString('hex')} (esperado: 504b0304)`);
if (zipBuf.slice(0,4).toString('hex') !== '504b0304') allOk = false;

await browser.close();

console.log(`\n${allOk ? '✅ TUDO OK' : '❌ FALHAS DETECTADAS'} — ficheiros de inspecção em ${OUT}`);
process.exit(allOk ? 0 : 1);
