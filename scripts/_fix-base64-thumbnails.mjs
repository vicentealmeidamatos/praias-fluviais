// One-off: extrai as thumbnails base64 inline de data/beaches.json,
// faz upload directo ao bucket "media" do Supabase Storage, substitui
// pelo URL público e faz upsert directo em site_beaches (bypassa o
// /api/save-data, que está a falhar por payload demasiado grande).
//
// Origem do problema: uploadImageFile() no admin tem fallback silencioso
// para data-URL base64 quando /api/upload falha (ver js/admin.js:692).
// Com várias thumbnails base64 acumuladas, beaches.json passou os 3 MB
// e o /api/save-data passou a falhar.
//
// Uso: node scripts/_fix-base64-thumbnails.mjs

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ─── .env loader ────────────────────────────────────────────────────────────
async function loadEnv() {
  const envPath = resolve(ROOT, '.env');
  try { await access(envPath); } catch { return; }
  const raw = await readFile(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
await loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('✗ Falta SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── 1. Ler beaches.json e detectar base64 ──────────────────────────────────
const beachesPath = resolve(ROOT, 'data/beaches.json');
const original = await readFile(beachesPath, 'utf8');
const data = JSON.parse(original);
const beaches = Array.isArray(data.beaches) ? data.beaches : data;
const isWrapped = Array.isArray(data.beaches);

const targets = [];
for (const b of beaches) {
  if (typeof b.thumbnail === 'string' && b.thumbnail.startsWith('data:image')) {
    targets.push(b);
  }
}

console.log(`Encontradas ${targets.length} thumbnail(s) em base64.`);
if (targets.length === 0) {
  console.log('Nada para fazer.');
  process.exit(0);
}

// ─── 2. Para cada uma: upload ao Storage e substituir o campo ───────────────
function parseDataUrl(dataUrl) {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { contentType: m[1], buffer: Buffer.from(m[2], 'base64') };
}

function extFor(contentType) {
  if (contentType === 'image/jpeg' || contentType === 'image/jpg') return 'jpg';
  if (contentType === 'image/png')  return 'png';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/gif')  return 'gif';
  return 'bin';
}

for (const b of targets) {
  const parsed = parseDataUrl(b.thumbnail);
  if (!parsed) {
    console.warn(`  ⚠ ${b.id}: não consegui parsear data URL — skip`);
    continue;
  }
  const ext = extFor(parsed.contentType);
  const sizeKB = (parsed.buffer.length / 1024).toFixed(0);
  const path = `beaches/${Date.now()}_${b.id}_thumb.${ext}`;

  const { error: upErr } = await sb.storage
    .from('media')
    .upload(path, parsed.buffer, { contentType: parsed.contentType, upsert: false });
  if (upErr) {
    console.error(`  ✗ ${b.id}: upload falhou — ${upErr.message}`);
    process.exit(1);
  }
  const { data: { publicUrl } } = sb.storage.from('media').getPublicUrl(path);
  b.thumbnail = publicUrl;
  console.log(`  ✓ ${b.id}: ${sizeKB} KB → ${publicUrl}`);
}

// ─── 3. Escrever beaches.json local ─────────────────────────────────────────
const updated = isWrapped ? { ...data, beaches } : beaches;
const updatedJson = JSON.stringify(updated, null, 2);
await writeFile(beachesPath, updatedJson, 'utf8');
const newSizeKB = (Buffer.byteLength(updatedJson, 'utf8') / 1024).toFixed(0);
console.log(`\ndata/beaches.json gravado: ${newSizeKB} KB (era ${(original.length/1024).toFixed(0)} KB).`);

// ─── 4. Upsert directo em site_beaches + history ────────────────────────────
const now = new Date().toISOString();
const { error: upsertErr } = await sb
  .from('site_beaches')
  .upsert({ id: 1, data: updated, updated_at: now });
if (upsertErr) {
  console.error('✗ Upsert site_beaches falhou:', upsertErr.message);
  process.exit(1);
}
console.log(`✓ site_beaches actualizado no Supabase (updated_at=${now})`);

const { error: histErr } = await sb
  .from('site_beaches_history')
  .insert({ data: updated, note: 'Migração: thumbnails base64 → storage (script _fix-base64-thumbnails)' });
if (histErr) {
  console.warn('⚠ Insert no history falhou (não crítico):', histErr.message);
} else {
  console.log('✓ Snapshot adicionado a site_beaches_history');
}

// ─── 5. Actualizar .sync-cache/ para o sync ficar coerente ──────────────────
const cacheDir = resolve(ROOT, '.sync-cache');
await mkdir(cacheDir, { recursive: true });
await writeFile(resolve(cacheDir, 'beaches.json'), updatedJson, 'utf8');
console.log('✓ .sync-cache/beaches.json actualizado');

console.log('\nConcluído. Recarrega o admin e testa o save.');
