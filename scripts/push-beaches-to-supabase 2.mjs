// Push the local data/beaches.json to Supabase via the /api/save-data endpoint.
// This is the canonical "save from admin" flow; we just reuse it from CLI.
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const SAVE_URL = process.env.SAVE_URL || 'http://localhost:3000/api/save-data';
const __dirname = dirname(fileURLToPath(import.meta.url));

const raw = await readFile(join(__dirname, '../data/beaches.json'), 'utf8');
const data = JSON.parse(raw);

const body = JSON.stringify({
  dataset: 'beaches',
  data,
  note: 'Reposicionamento focal-Y das fotos das praias (script)',
});

const r = await fetch(SAVE_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body,
});
const j = await r.json().catch(() => ({}));
console.log('status:', r.status, j);
process.exit(r.ok ? 0 : 1);
