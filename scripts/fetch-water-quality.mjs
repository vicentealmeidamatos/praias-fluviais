#!/usr/bin/env node
// scripts/fetch-water-quality.mjs
// Faz GET ao portal infoagua.apambiente.pt, extrai DATA_Beaches,
// faz match contra data/beaches.json e escreve data/water-quality.json.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { findApaMatch } from './lib/water-quality-matcher.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const APA_URL = 'https://infoagua.apambiente.pt/pt/praias/praias-pesquisa-avancada';
const USER_AGENT = 'praiasfluviais.pt water-quality bot · contact: vicentealmeidamatos@gmail.com';
const BEACHES_PATH = resolve(ROOT, 'data/beaches.json');
const OUTPUT_PATH = resolve(ROOT, 'data/water-quality.json');
const MIN_TOTAL = 100; // sanity floor

function fail(message) {
  console.error('[fetch-water-quality]', message);
  process.exit(1);
}

async function fetchApaPage() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(APA_URL, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      signal: ctrl.signal,
    });
    if (!r.ok) fail(`HTTP ${r.status} ao obter ${APA_URL}`);
    return await r.text();
  } catch (err) {
    fail(`Falha de rede: ${err.message}`);
  } finally {
    clearTimeout(t);
  }
}

function extractDataBeaches(html) {
  const start = html.indexOf('var DATA_Beaches');
  if (start < 0) fail('Variável DATA_Beaches não encontrada — APA mudou estrutura?');
  const arrStart = html.indexOf('[', start);
  if (arrStart < 0) fail('Início do array DATA_Beaches não encontrado');
  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;
  for (let i = arrStart; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) fail('Não foi possível fechar o array DATA_Beaches (HTML truncado?)');
  let parsed;
  try {
    parsed = JSON.parse(html.slice(arrStart, end));
  } catch (err) {
    fail(`JSON inválido em DATA_Beaches: ${err.message}`);
  }
  if (!Array.isArray(parsed)) fail('DATA_Beaches não é um array');
  if (parsed.length < MIN_TOTAL) fail(`Apenas ${parsed.length} praias (mínimo ${MIN_TOTAL}) — APA degradada?`);
  // Sanity de campo
  const sample = parsed[0];
  if (!sample?.profile?.codigo_agua_balnear || !sample?.quality) {
    fail('Estrutura inesperada: faltam campos profile.codigo_agua_balnear ou quality');
  }
  if (!('classificacao_ano_anterior_dsc' in sample.quality)) {
    fail('Campo quality.classificacao_ano_anterior_dsc ausente — APA mudou schema');
  }
  return parsed;
}

function tsToIsoDate(ms) {
  if (ms == null) return null;
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function buildEntry(siteBeach, match) {
  const q = match.matched.quality;
  const p = match.matched.profile;
  return {
    apaCode: p.codigo_agua_balnear,
    apaName: p.praia,
    apaConcelho: q.concelho || null,
    previousYearDsc: q.classificacao_ano_anterior_dsc || null,
    previousYearValue: q.classificacao_ano_anterior ?? null,
    currentSeasonStatus: q.ultima_classificacao_desc || null,
    currentSeasonValue: q.ultima_classificacao ?? null,
    lastAnalysisDate: tsToIsoDate(q.data_ultima_analise),
    interdictionReason: q.motivo_desc || null,
    seasonStart: tsToIsoDate(q.data_inicio_epoca_balnear),
    seasonEnd: tsToIsoDate(q.data_fim_epoca_balnear),
    snirhUrl: p.url || null,
    matchMethod: match.matchMethod,
    matchPool: match.matchPool,
    matchDistance: match.matchDistance,
  };
}

// Campos cujo valor implica "houve actualização visível para o utilizador".
// Mudanças em apaCode / apaName / matchMethod NÃO contam (são metadados internos).
const USER_FACING_FIELDS = [
  'previousYearDsc',
  'previousYearValue',
  'currentSeasonStatus',
  'currentSeasonValue',
  'lastAnalysisDate',
  'interdictionReason',
  'seasonStart',
  'seasonEnd',
];

function entrySignature(entry) {
  if (!entry) return null;
  return JSON.stringify(USER_FACING_FIELDS.map((f) => entry[f] ?? null));
}

async function loadExistingOutput() {
  try {
    const raw = await readFile(OUTPUT_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function main() {
  console.log(`[fetch-water-quality] A obter ${APA_URL}`);
  const html = await fetchApaPage();
  const apaBeaches = extractDataBeaches(html);
  const interiorCount = apaBeaches.filter((b) => b.profile.interior === 1).length;
  console.log(`[fetch-water-quality] APA: ${apaBeaches.length} praias (${interiorCount} interiores)`);

  const siteRaw = await readFile(BEACHES_PATH, 'utf8');
  const siteBeaches = JSON.parse(siteRaw);
  console.log(`[fetch-water-quality] Site: ${siteBeaches.length} praias`);

  const existing = await loadExistingOutput();
  const nowIso = new Date().toISOString();

  const beachesOut = {};
  let matched = 0;
  let changedCount = 0;
  for (const sb of siteBeaches) {
    if (!sb.id) continue;
    const m = findApaMatch(sb, apaBeaches);
    if (!m) continue;
    const entry = buildEntry(sb, m);
    const oldEntry = existing?.beaches?.[sb.id];
    const sigOld = entrySignature(oldEntry);
    const sigNew = entrySignature(entry);
    if (oldEntry && sigOld === sigNew) {
      // Nada mudou para o utilizador: preserva a data anterior
      entry.lastChanged = oldEntry.lastChanged || existing?.lastUpdated || nowIso;
    } else {
      entry.lastChanged = nowIso;
      if (oldEntry) changedCount++;
    }
    beachesOut[sb.id] = entry;
    matched++;
  }

  const out = {
    lastUpdated: nowIso,
    sourceUrl: APA_URL,
    stats: {
      siteBeaches: siteBeaches.length,
      matched,
      unmatched: siteBeaches.length - matched,
    },
    beaches: beachesOut,
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`[fetch-water-quality] Match: ${matched}/${siteBeaches.length} · ${changedCount} entradas com alterações reais → ${OUTPUT_PATH}`);
}

main().catch((err) => fail(err.stack || err.message));
