# Qualidade da Água (APA) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar a cada página de praia (`praia.html`) uma secção "Qualidade da Água" entre "Sobre esta Praia" e "Tempo Atual", automaticamente sincronizada com `infoagua.apambiente.pt` via GitHub Action diária. Apenas as praias com correspondência APA mostram a secção; as restantes nada exibem.

**Architecture:** Cron diário (GitHub Actions) → Node script faz scraping da página da APA, extrai a variável `DATA_Beaches` embutida, faz match contra `data/beaches.json` (override manual `apaCode` → proximidade ≤800m → nome+proximidade ≤5km), e gera `data/water-quality.json` (committado se houver diff → Vercel re-deploy automático). Frontend faz lookup O(1) por `beach.id` e renderiza um card horizontal com cores oficiais APA (azul/verde/amarelo/vermelho/cinza/contorno) + estrelas correspondentes (4/3/2/1).

**Tech Stack:** Node 20 (built-in `fetch` + `node:test`), GitHub Actions cron, JSON estático em `data/`, vanilla JS no frontend (sem build step), Tailwind CDN.

**Spec:** [`docs/superpowers/specs/2026-04-29-qualidade-agua-apa-design.md`](../specs/2026-04-29-qualidade-agua-apa-design.md)

---

## File Structure

**Criados:**
- `scripts/lib/water-quality-matcher.mjs` — funções puras: `normalizeBeachName`, `haversineMeters`, `findApaMatch`. Exportadas para uso no scraper e em testes.
- `scripts/fetch-water-quality.mjs` — orquestrador: HTTP GET, parse `DATA_Beaches`, sanity checks, match contra `beaches.json`, escrita atómica de `data/water-quality.json`.
- `scripts/test-water-quality-matcher.mjs` — testes Node de `findApaMatch` (cobre os 4 sinais e os edge cases).
- `.github/workflows/water-quality.yml` — workflow cron + commit no-op-safe.
- `data/water-quality.json` — gerado (committado pelo workflow).

**Modificados:**
- `package.json` — adiciona `"test": "node --test scripts/test-water-quality-matcher.mjs"`.
- `css/shared.css` — append: classes `.water-quality-section`, `.wq-drop`, `.wq-stars`, `.wq-card`, `.wq-meta`, `.wq-source` + modificadores `.is-excelente|boa|aceitavel|ma|sem-classificacao|nova-epoca`.
- `js/beach-page.js` — adiciona render da `<section>` entre Description (linha ~163) e Weather (linha ~165), usando helper local que monta o HTML a partir do registo do JSON.
- `js/admin.js` — em `editBeach()`: substitui o `<select id="b-waterQuality">` por bloco read-only "Qualidade da Água (APA)" + input `b-apaCode`; em `saveBeach()`: persiste `apaCode` em vez de `waterQuality`; remove `b-waterQuality` de `getBeachFormSnapshot()` e do array `inputIds`.
- `data/beaches.json` — sem migração obrigatória; o campo `apaCode` é opcional. Praias existentes ficam sem o campo (matcher fallback para sinais 2/3).

---

## Task 1: Test infrastructure & matcher API stub

**Files:**
- Modify: `package.json` (add test script)
- Create: `scripts/lib/water-quality-matcher.mjs` (stub vazio)
- Create: `scripts/test-water-quality-matcher.mjs` (testes a falhar)

- [ ] **Step 1: Adicionar script de teste em `package.json`**

Edit `package.json`:

```json
{
  "name": "guia-praias-fluviais",
  "version": "1.0.0",
  "description": "Guia das Praias Fluviais - Portal interativo de praias fluviais de Portugal",
  "type": "module",
  "scripts": {
    "start": "node serve.mjs",
    "screenshot": "node screenshot.mjs",
    "test": "node --test scripts/test-water-quality-matcher.mjs"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.101.1",
    "puppeteer": "^24.40.0",
    "stripe": "^22.0.0"
  }
}
```

- [ ] **Step 2: Criar stub `scripts/lib/water-quality-matcher.mjs`**

```js
// scripts/lib/water-quality-matcher.mjs
// Funções puras de matching APA ↔ site. Usadas pelo scraper e por testes.

export function normalizeBeachName(name) {
  throw new Error('not implemented');
}

export function haversineMeters(lat1, lng1, lat2, lng2) {
  throw new Error('not implemented');
}

export function findApaMatch(siteBeach, apaBeaches) {
  throw new Error('not implemented');
}
```

- [ ] **Step 3: Escrever testes que falham**

Create `scripts/test-water-quality-matcher.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBeachName,
  haversineMeters,
  findApaMatch,
} from './lib/water-quality-matcher.mjs';

// ── normalizeBeachName ────────────────────────────────────────────────────
test('normalizeBeachName remove acentos e baixa caixa', () => {
  assert.equal(normalizeBeachName('Praia Fluvial de Alqueva'), 'alqueva');
  assert.equal(normalizeBeachName('Açude do Pinto'), 'acude pinto');
});

test('normalizeBeachName remove prefixos "Praia Fluvial", "Zona Balnear", "Parque Fluvial", "Areal"', () => {
  assert.equal(normalizeBeachName('Praia Fluvial das Rocas'), 'rocas');
  assert.equal(normalizeBeachName('Zona Balnear de Melres'), 'melres');
  assert.equal(normalizeBeachName('Parque Fluvial do Alfusqueiro'), 'alfusqueiro');
  assert.equal(normalizeBeachName('Areal de Zebreiros'), 'zebreiros');
});

test('normalizeBeachName remove "Albufeira da/de/do"', () => {
  assert.equal(normalizeBeachName('Albufeira do Caldeirão'), 'caldeirao');
  assert.equal(normalizeBeachName('Praia Fluvial da Albufeira da Queimadela'), 'queimadela');
});

test('normalizeBeachName colapsa espaços e remove pontuação', () => {
  assert.equal(normalizeBeachName('  Pego   Fundo!! '), 'pego fundo');
  assert.equal(normalizeBeachName("Azenhas d'El Rei"), 'azenhas d el rei');
});

// ── haversineMeters ────────────────────────────────────────────────────────
test('haversineMeters retorna 0 para o mesmo ponto', () => {
  assert.equal(haversineMeters(38.21, -7.52, 38.21, -7.52), 0);
});

test('haversineMeters dá distância plausível entre Lisboa e Porto', () => {
  const d = haversineMeters(38.7223, -9.1393, 41.1579, -8.6291);
  // ~273 km
  assert.ok(d > 270000 && d < 280000, `esperado ~273000m, recebido ${d}`);
});

// ── findApaMatch ───────────────────────────────────────────────────────────
const apaSample = [
  {
    profile: { codigo_agua_balnear: 'PTCD9W', praia: 'Praia Fluvial de Alqueva', latitude: 38.21112, longitude: -7.5222, interior: 1, costeira: 0 },
    quality: {},
  },
  {
    profile: { codigo_agua_balnear: 'PTCQ7M', praia: 'Praia Fluvial de Monsaraz', latitude: 38.434643, longitude: -7.350832, interior: 1, costeira: 0 },
    quality: {},
  },
  {
    profile: { codigo_agua_balnear: 'PTCQ4X', praia: 'Pedras Ruivas', latitude: 41.85, longitude: -8.85, interior: 0, costeira: 1 },
    quality: {},
  },
  {
    profile: { codigo_agua_balnear: 'PTCV2A', praia: 'Vau', latitude: 37.10, longitude: -8.55, interior: 0, costeira: 1 },
    quality: {},
  },
];

test('findApaMatch sinal 1: override manual via apaCode', () => {
  const site = { name: 'Coisa qualquer', apaCode: 'PTCQ7M', coordinates: { lat: 0, lng: 0 } };
  const m = findApaMatch(site, apaSample);
  assert.equal(m.matched.profile.codigo_agua_balnear, 'PTCQ7M');
  assert.equal(m.matchMethod, 'manual');
});

test('findApaMatch sinal 1: apaCode inválido devolve sem match', () => {
  const site = { name: 'X', apaCode: 'PT-INEXISTENTE', coordinates: { lat: 0, lng: 0 } };
  const m = findApaMatch(site, apaSample);
  assert.equal(m, null);
});

test('findApaMatch sinal 2: proximidade ≤ 800m sem nome igual', () => {
  // ~50m de Alqueva (38.21112, -7.5222), nome muito diferente
  const site = { name: 'Areal Junto', coordinates: { lat: 38.21157, lng: -7.5222 } };
  const m = findApaMatch(site, apaSample);
  assert.equal(m.matched.profile.codigo_agua_balnear, 'PTCD9W');
  assert.equal(m.matchMethod, 'proximity');
  assert.ok(m.matchDistance < 800);
});

test('findApaMatch sinal 3: nome igual + proximidade ≤ 5km (catch costeira river-mouth)', () => {
  // "Pedras Ruivas" do site a 750m da APA costeira "Pedras Ruivas"
  const site = { name: 'Praia Fluvial das Pedras Ruivas', coordinates: { lat: 41.8567, lng: -8.85 } };
  const m = findApaMatch(site, apaSample);
  assert.equal(m.matched.profile.codigo_agua_balnear, 'PTCQ4X');
  assert.equal(m.matchMethod, 'name+proximity');
  assert.equal(m.matchPool, 'costeira');
});

test('findApaMatch rejeita falso positivo: mesmo nome a > 5km', () => {
  // Vau (Algarve) tem o mesmo nome mas está a centenas de km
  const site = { name: 'Zona Balnear de Vau', coordinates: { lat: 41.0, lng: -8.5 } };
  const m = findApaMatch(site, apaSample);
  assert.equal(m, null);
});

test('findApaMatch sem qualquer sinal devolve null', () => {
  const site = { name: 'Praia Inventada', coordinates: { lat: 50.0, lng: 5.0 } };
  const m = findApaMatch(site, apaSample);
  assert.equal(m, null);
});

test('findApaMatch retorna matchPool correctamente para interior', () => {
  const site = { name: 'Praia Fluvial de Alqueva', coordinates: { lat: 38.21112, lng: -7.5222 } };
  const m = findApaMatch(site, apaSample);
  assert.equal(m.matchPool, 'interior');
});
```

- [ ] **Step 4: Correr testes para confirmar que falham**

Run: `npm test`
Expected: ALL FAIL com `Error: not implemented`.

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/lib/water-quality-matcher.mjs scripts/test-water-quality-matcher.mjs
git commit -m "test(qualidade-agua): scaffold matcher + testes a falhar"
```

---

## Task 2: Implementar `normalizeBeachName` e `haversineMeters`

**Files:**
- Modify: `scripts/lib/water-quality-matcher.mjs`

- [ ] **Step 1: Implementar as duas funções puras**

Replace the stub bodies in `scripts/lib/water-quality-matcher.mjs`:

```js
// scripts/lib/water-quality-matcher.mjs
// Funções puras de matching APA ↔ site.

const PREFIX_RE = /\b(praia\s+fluvial|zona\s+balnear|parque\s+fluvial|areal|albufeira(?:\s+d[aeo])?)\s+(?:de\s+|do\s+|da\s+|dos\s+|das\s+)?/g;

export function normalizeBeachName(name) {
  if (!name) return '';
  let s = String(name).toLowerCase();
  s = s.normalize('NFD').replace(/\p{M}/gu, '');     // remove acentos
  s = s.replace(PREFIX_RE, '');                       // remove prefixos genéricos
  s = s.replace(/[^a-z0-9 ]/g, ' ');                  // tira pontuação
  s = s.replace(/\s+/g, ' ').trim();                  // colapsa espaços
  return s;
}

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function findApaMatch(siteBeach, apaBeaches) {
  throw new Error('not implemented');
}
```

- [ ] **Step 2: Correr testes**

Run: `npm test`
Expected: testes de `normalizeBeachName` e `haversineMeters` PASSAM; os de `findApaMatch` continuam a FALHAR.

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/water-quality-matcher.mjs
git commit -m "feat(qualidade-agua): normalizeBeachName + haversineMeters"
```

---

## Task 3: Implementar `findApaMatch` com os 4 sinais

**Files:**
- Modify: `scripts/lib/water-quality-matcher.mjs`

- [ ] **Step 1: Implementar `findApaMatch`**

Replace the stub of `findApaMatch` in `scripts/lib/water-quality-matcher.mjs`:

```js
const STRONG_PROXIMITY_M = 800;
const NAME_PROXIMITY_M = 5000;

export function findApaMatch(siteBeach, apaBeaches) {
  const lat = siteBeach.coordinates?.lat;
  const lng = siteBeach.coordinates?.lng;
  const siteNorm = normalizeBeachName(siteBeach.name);

  // Sinal 1: override manual
  if (siteBeach.apaCode) {
    const found = apaBeaches.find(
      (a) => a.profile.codigo_agua_balnear === siteBeach.apaCode
    );
    if (found) {
      const d =
        Number.isFinite(lat) && Number.isFinite(lng)
          ? haversineMeters(lat, lng, found.profile.latitude, found.profile.longitude)
          : null;
      return {
        matched: found,
        matchMethod: 'manual',
        matchPool: found.profile.interior === 1 ? 'interior' : 'costeira',
        matchDistance: d == null ? null : Math.round(d),
      };
    }
    // apaCode inválido → cai sem match (o utilizador errou; melhor não mascarar)
    return null;
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  // Calcular distâncias e candidatos para sinais 2 e 3
  let bestStrong = null;
  let bestStrongD = Infinity;
  let bestNamed = null;
  let bestNamedD = Infinity;

  for (const apa of apaBeaches) {
    const d = haversineMeters(lat, lng, apa.profile.latitude, apa.profile.longitude);
    // Sinal 2: proximidade forte (qualquer pool)
    if (d <= STRONG_PROXIMITY_M && d < bestStrongD) {
      bestStrong = apa;
      bestStrongD = d;
    }
    // Sinal 3: nome igual + ≤ 5km
    if (d <= NAME_PROXIMITY_M && normalizeBeachName(apa.profile.praia) === siteNorm) {
      if (d < bestNamedD) {
        bestNamed = apa;
        bestNamedD = d;
      }
    }
  }

  if (bestStrong) {
    return {
      matched: bestStrong,
      matchMethod: 'proximity',
      matchPool: bestStrong.profile.interior === 1 ? 'interior' : 'costeira',
      matchDistance: Math.round(bestStrongD),
    };
  }
  if (bestNamed) {
    return {
      matched: bestNamed,
      matchMethod: 'name+proximity',
      matchPool: bestNamed.profile.interior === 1 ? 'interior' : 'costeira',
      matchDistance: Math.round(bestNamedD),
    };
  }
  return null;
}
```

- [ ] **Step 2: Correr todos os testes**

Run: `npm test`
Expected: TODOS os 11 testes PASSAM.

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/water-quality-matcher.mjs
git commit -m "feat(qualidade-agua): findApaMatch com 4 sinais (manual/proximity/name+proximity)"
```

---

## Task 4: Scraper APA — fetch + parse + sanity checks

**Files:**
- Create: `scripts/fetch-water-quality.mjs`

- [ ] **Step 1: Criar o scraper completo**

Create `scripts/fetch-water-quality.mjs`:

```js
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

async function main() {
  console.log(`[fetch-water-quality] A obter ${APA_URL}`);
  const html = await fetchApaPage();
  const apaBeaches = extractDataBeaches(html);
  console.log(`[fetch-water-quality] APA: ${apaBeaches.length} praias (${apaBeaches.filter(b => b.profile.interior === 1).length} interiores)`);

  const siteRaw = await readFile(BEACHES_PATH, 'utf8');
  const siteBeaches = JSON.parse(siteRaw);
  console.log(`[fetch-water-quality] Site: ${siteBeaches.length} praias`);

  const beachesOut = {};
  let matched = 0;
  for (const sb of siteBeaches) {
    if (!sb.id) continue;
    const m = findApaMatch(sb, apaBeaches);
    if (!m) continue;
    beachesOut[sb.id] = buildEntry(sb, m);
    matched++;
  }

  const out = {
    lastUpdated: new Date().toISOString(),
    sourceUrl: APA_URL,
    stats: {
      siteBeaches: siteBeaches.length,
      matched,
      unmatched: siteBeaches.length - matched,
    },
    beaches: beachesOut,
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`[fetch-water-quality] Match: ${matched}/${siteBeaches.length} → ${OUTPUT_PATH}`);
}

main().catch((err) => fail(err.stack || err.message));
```

- [ ] **Step 2: Tornar executável**

```bash
chmod +x scripts/fetch-water-quality.mjs
```

- [ ] **Step 3: Correr o scraper localmente**

```bash
node scripts/fetch-water-quality.mjs
```

Expected output (roughly):
```
[fetch-water-quality] A obter https://infoagua.apambiente.pt/...
[fetch-water-quality] APA: 760 praias (159 interiores)
[fetch-water-quality] Site: 228 praias
[fetch-water-quality] Match: ~165/228 → /.../data/water-quality.json
```

Confirm `data/water-quality.json` foi criado com `~165` entradas no campo `beaches`. Inspecionar uma:

```bash
node -e "const j=require('./data/water-quality.json'); console.log(JSON.stringify(j.stats)); console.log(Object.keys(j.beaches).slice(0,3)); console.log(j.beaches['praia-fluvial-de-alqueva']);"
```

Deve mostrar:
- `stats.matched` ≥ 150
- algumas IDs como `praia-fluvial-de-alqueva`, etc.
- entrada com `apaCode`, `previousYearDsc`, etc.

- [ ] **Step 4: Commit (incluir o JSON gerado pela primeira vez)**

```bash
git add scripts/fetch-water-quality.mjs data/water-quality.json
git commit -m "feat(qualidade-agua): scraper APA + dataset inicial"
```

---

## Task 5: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/water-quality.yml`

- [ ] **Step 1: Criar o workflow**

Create `.github/workflows/water-quality.yml`:

```yaml
name: Atualizar Qualidade da Água (APA)

on:
  schedule:
    - cron: '17 6 * * *'        # Diário 06:17 UTC (≈07:17/08:17 PT)
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: water-quality
  cancel-in-progress: false

jobs:
  fetch:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Fetch APA & generate water-quality.json
        run: node scripts/fetch-water-quality.mjs

      - name: Commit if changed
        run: |
          if [[ -n "$(git status --porcelain data/water-quality.json)" ]]; then
            git config user.name "github-actions[bot]"
            git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
            git add data/water-quality.json
            git commit -m "data(qualidade-agua): atualização automática APA"
            git push
          else
            echo "Sem alterações em water-quality.json."
          fi
```

- [ ] **Step 2: Verificar sintaxe YAML**

```bash
node -e "import('yaml').catch(()=>require('child_process').execSync('node -e \"console.log(`yaml syntax OK if no error above`)\"')); console.log('yaml file readable')" 2>&1 || true
cat .github/workflows/water-quality.yml | head -3
```

(Validação real só com `act` ou após push — aceitar como suficiente desde que estrutura YAML pareça correcta.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/water-quality.yml
git commit -m "ci(qualidade-agua): GitHub Action cron diário 06:17 UTC"
```

---

## Task 6: CSS da secção Qualidade da Água

**Files:**
- Modify: `css/shared.css` (append)

- [ ] **Step 1: Adicionar bloco no fim de `css/shared.css`**

Append to `css/shared.css`:

```css
/* ─── Qualidade da Água (APA) ──────────────────────────────────────────── */
.wq-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 20px;
  border-radius: 14px;
  background: #FAF8F5;
  border: 1px solid #E5DED1;
}
@media (max-width: 640px) {
  .wq-card { flex-wrap: wrap; gap: 12px; padding: 16px; }
}

.wq-drop {
  width: 54px;
  height: 54px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #fff;
  box-shadow: 0 6px 14px -6px rgba(0, 0, 0, 0.18);
}
.wq-drop svg { width: 26px; height: 26px; fill: currentColor; }

.wq-headline { display: flex; flex-direction: column; gap: 6px; }
.wq-class {
  font-family: 'Poppins', sans-serif;
  font-weight: 700;
  font-size: 20px;
  line-height: 1;
  color: #003A40;
}
.wq-stars {
  display: flex;
  gap: 2px;
  font-size: 14px;
}
.wq-stars svg { width: 1em; height: 1em; fill: currentColor; }
.wq-stars .empty { opacity: 0.18; }

.wq-meta {
  flex: 1;
  font-size: 13px;
  color: #003A40;
  line-height: 1.55;
  min-width: 0;
}
.wq-meta-row { display: block; }
.wq-meta-label {
  font-family: 'Poppins', sans-serif;
  font-weight: 600;
  color: #928066;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-right: 6px;
  display: inline-block;
  min-width: 100px;
}

.wq-link {
  font-family: 'Poppins', sans-serif;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #054C52;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.wq-link:hover { color: #003A40; }

.wq-source {
  font-size: 11px;
  color: #928066;
  margin-top: 8px;
}
.wq-source strong { color: #003A40; font-weight: 600; }

/* ── Modificadores por classificação (cores oficiais APA) ── */
.wq-card.is-excelente .wq-drop,
.wq-card.is-excelente .wq-stars { background: #1976D2; color: #1976D2; }
.wq-card.is-excelente .wq-drop { color: #fff; }

.wq-card.is-boa .wq-drop,
.wq-card.is-boa .wq-stars { background: #43A047; color: #43A047; }
.wq-card.is-boa .wq-drop { color: #fff; }

.wq-card.is-aceitavel .wq-drop {
  background: #FFEB3B;
  color: #003A40;
  box-shadow: 0 6px 14px -6px rgba(0, 58, 64, 0.25), inset 0 0 0 2px rgba(0, 58, 64, 0.12);
}
.wq-card.is-aceitavel .wq-stars { color: #FFEB3B; }
.wq-card.is-aceitavel .wq-stars svg { stroke: #003A40; stroke-width: 1.5; paint-order: stroke fill; }

.wq-card.is-ma .wq-drop,
.wq-card.is-ma .wq-stars { background: #E53935; color: #E53935; }
.wq-card.is-ma .wq-drop { color: #fff; }

.wq-card.is-sem-classificacao .wq-drop { background: #9E9E9E; color: #fff; }
.wq-card.is-sem-classificacao .wq-class { color: #6E5E48; }
.wq-card.is-sem-classificacao .wq-stars { color: #9E9E9E; opacity: 0.4; }

.wq-card.is-nova-epoca .wq-drop {
  background: #fff;
  color: #9E9E9E;
  box-shadow: inset 0 0 0 2px #BDBDBD;
}
.wq-card.is-nova-epoca .wq-class { color: #6E5E48; font-size: 16px; line-height: 1.2; }
.wq-card.is-nova-epoca .wq-stars svg { fill: none; stroke: #BDBDBD; stroke-width: 2; }
```

- [ ] **Step 2: Verificação visual rápida (sintaxe)**

Abrir `css/shared.css` e confirmar que o bloco foi adicionado no fim sem partir o ficheiro. (Se houver chaves desbalanceadas, o navegador vai ignorar tudo a seguir — verificar com `node -e "const fs=require('fs'); const s=fs.readFileSync('css/shared.css','utf8'); let n=0; for(const c of s){if(c==='{')n++;if(c==='}')n--;} console.log('balance', n);"`. Esperado: `0`.)

- [ ] **Step 3: Commit**

```bash
git add css/shared.css
git commit -m "feat(qualidade-agua): estilos do card (cores oficiais APA + 6 estados)"
```

---

## Task 7: Render da secção em `js/beach-page.js`

**Files:**
- Modify: `js/beach-page.js`

- [ ] **Step 1: Adicionar helper de render no topo do ficheiro**

Edit `js/beach-page.js`. Logo ANTES da linha `// ─── Individual Beach Page ───` (perto da linha 32), inserir:

```js
// ─── Qualidade da Água (APA) ──────────────────────────────────────────────
const WQ_CLASS_MAP = {
  'Excelente':   { mod: 'is-excelente',          stars: 4 },
  'Boa':         { mod: 'is-boa',                stars: 3 },
  'Aceitável':   { mod: 'is-aceitavel',          stars: 2 },
  'Aceitavel':   { mod: 'is-aceitavel',          stars: 2 }, // tolerar variação sem acento
  'Má':          { mod: 'is-ma',                 stars: 1 },
  'Ma':          { mod: 'is-ma',                 stars: 1 },
};

function _wqStars(filled) {
  const total = 4;
  const star = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>';
  const empty = '<svg viewBox="0 0 24 24" aria-hidden="true" class="empty"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>';
  return Array.from({ length: total }, (_, i) => (i < filled ? star : empty)).join('');
}

function _wqStateText(entry) {
  // Sem classificação anterior + estado de "primeira época" tem prioridade
  if (entry.previousYearDsc == null) return 'Primeira época monitorizada';
  const now = Date.now();
  const start = entry.seasonStart ? Date.parse(entry.seasonStart + 'T00:00:00Z') : null;
  const end   = entry.seasonEnd   ? Date.parse(entry.seasonEnd   + 'T23:59:59Z') : null;
  if (start && now < start) return 'Aguardando início da época balnear';
  if (end && now > end)     return 'Época balnear terminada';
  if (entry.interdictionReason) return `Banhos desaconselhados · ${entry.interdictionReason}`;
  return 'Sem alertas activos';
}

function _wqFormatRange(start, end) {
  if (!start || !end) return '—';
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const fmt = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return `${d} ${months[m-1]}`;
  };
  const yEnd = end.split('-')[0];
  return `${fmt(start)} · ${fmt(end)} ${yEnd}`;
}

function _wqFormatUpdated(iso) {
  if (!iso) return '';
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function renderWaterQualitySection(beachId, waterQualityJson) {
  if (!waterQualityJson || !waterQualityJson.beaches) return '';
  const entry = waterQualityJson.beaches[beachId];
  if (!entry) return '';

  const dsc = entry.previousYearDsc;
  let mod, stars;
  if (dsc == null && entry.currentSeasonStatus) {
    // praia identificada apenas nesta época balnear
    mod = 'is-nova-epoca'; stars = 4;
  } else if (dsc == null) {
    mod = 'is-sem-classificacao'; stars = 4;
  } else {
    const m = WQ_CLASS_MAP[dsc];
    if (!m) { mod = 'is-sem-classificacao'; stars = 4; }
    else    { mod = m.mod; stars = m.stars; }
  }

  const title =
    mod === 'is-nova-epoca' ? 'Identificada apenas<br>nesta época balnear'
    : mod === 'is-sem-classificacao' ? 'Sem Classificação'
    : dsc;

  const dropSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5C8.5 7 5 11 5 14.5a7 7 0 1014 0C19 11 15.5 7 12 2.5z"/></svg>';
  const ariaLabel =
    mod === 'is-nova-epoca' || mod === 'is-sem-classificacao'
      ? `Qualidade da água: ${(title || '').replace('<br>', ' ')}`
      : `Qualidade da água: ${dsc}, ${stars} em 4 estrelas`;

  const stateText = _wqStateText(entry);
  const seasonRange = _wqFormatRange(entry.seasonStart, entry.seasonEnd);
  const updated = _wqFormatUpdated(waterQualityJson.lastUpdated);
  const sourceLine = `Fonte · <strong>APA</strong> · ${entry.apaCode}${updated ? ` · actualizado a ${updated}` : ''}`;

  return `
      <section class="mb-12">
        <h2 class="font-display text-xs uppercase tracking-[0.2em] text-praia-teal-500 font-semibold mb-5">Qualidade da Água</h2>
        <div class="wq-card ${mod}" role="group" aria-label="${ariaLabel}">
          <div class="wq-drop">${dropSvg}</div>
          <div class="wq-headline">
            <div class="wq-class">${title}</div>
            <div class="wq-stars" role="img" aria-hidden="true">${_wqStars(stars)}</div>
          </div>
          <div class="wq-meta">
            <div class="wq-meta-row"><span class="wq-meta-label">Estado</span>${stateText}</div>
            <div class="wq-meta-row"><span class="wq-meta-label">Época Balnear</span>${seasonRange}</div>
          </div>
          ${entry.snirhUrl ? `<a href="${entry.snirhUrl}" target="_blank" rel="noopener" class="wq-link">SNIRH ↗</a>` : ''}
        </div>
        <div class="wq-source">${sourceLine}</div>
      </section>`;
}
```

- [ ] **Step 2: Pré-carregar `water-quality.json` no topo do ficheiro**

Edit `js/beach-page.js`. Imediatamente DEPOIS da linha `let _reviewsEarlyBP = ...` (perto da linha 6), adicionar:

```js
const _waterQualityEarlyBP = _beachId
  ? (window.loadData ? window.loadData('waterQuality').catch(() => null) : null)
  : null;
```

- [ ] **Step 3: Inserir a secção entre Description e Weather**

Edit `js/beach-page.js`. Localizar o template literal `mainContent.innerHTML = \`...\`` que começa por volta da linha 136. Encontrar o fim da `<!-- Description -->` (depois do `</section>` que fecha a Description, perto da linha 163) e inserir o placeholder ANTES de `<!-- Weather -->`:

Replace:
```html
      <!-- Description -->
      <section class="mb-12">
        <h2 class="font-display text-xs uppercase tracking-[0.2em] text-praia-teal-500 font-semibold mb-4">Sobre esta Praia</h2>
        <p data-content-bind="beaches:${beachIdx}.description" class="text-praia-sand-700 leading-relaxed-plus text-base md:text-lg">${beach.description}</p>
      </section>

      <!-- Weather -->
```

With:
```html
      <!-- Description -->
      <section class="mb-12">
        <h2 class="font-display text-xs uppercase tracking-[0.2em] text-praia-teal-500 font-semibold mb-4">Sobre esta Praia</h2>
        <p data-content-bind="beaches:${beachIdx}.description" class="text-praia-sand-700 leading-relaxed-plus text-base md:text-lg">${beach.description}</p>
      </section>

      <!-- Water Quality (APA) — populated async (omitida se sem dados) -->
      <div id="water-quality-slot"></div>

      <!-- Weather -->
```

- [ ] **Step 4: Hidratar o slot depois da meteo**

Edit `js/beach-page.js`. Logo a seguir ao bloco `// ── Fire weather independently...` (perto das linhas 257-262), adicionar:

```js
  // ── Qualidade da água (APA) — não bloqueia ──────────────────────────────
  const wqSlot = document.getElementById('water-quality-slot');
  if (wqSlot && _waterQualityEarlyBP) {
    _waterQualityEarlyBP.then((wq) => {
      const html = renderWaterQualitySection(beach.id, wq);
      if (html) {
        wqSlot.outerHTML = html;
      } else {
        wqSlot.remove();
      }
    }).catch(() => { wqSlot.remove(); });
  } else if (wqSlot) {
    wqSlot.remove();
  }
```

- [ ] **Step 5: Adicionar `waterQuality` ao FILES map de `data-loader.js`**

Edit `js/data-loader.js`. No objecto `FILES` (linhas 16-26), adicionar uma entrada:

Replace:
```js
  const FILES = {
    content:          'data/content.json',
    beaches:          'data/beaches.json',
    articles:         'data/articles.json',
    locationsGuia:    'data/locations-guia-passaporte.json',
    locationsCarimbo: 'data/locations-carimbos.json',
    descontos:        'data/descontos.json',
    products:         'data/products.json',
    settings:         'data/settings.json',
    layout:           null, // não há ficheiro: começa vazio
  };
```

With:
```js
  const FILES = {
    content:          'data/content.json',
    beaches:          'data/beaches.json',
    articles:         'data/articles.json',
    locationsGuia:    'data/locations-guia-passaporte.json',
    locationsCarimbo: 'data/locations-carimbos.json',
    descontos:        'data/descontos.json',
    products:         'data/products.json',
    settings:         'data/settings.json',
    waterQuality:     'data/water-quality.json',
    layout:           null, // não há ficheiro: começa vazio
  };
```

- [ ] **Step 6: Commit**

```bash
git add js/beach-page.js js/data-loader.js
git commit -m "feat(qualidade-agua): render do card na página da praia"
```

---

## Task 8: Verificação visual em browser

**Files:** N/A (manual verification only)

- [ ] **Step 1: Garantir que o servidor local está a correr na porta 3000**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 && echo " ✓ servidor up" || (echo "✗ servidor down — iniciar com: node serve.mjs" && exit 1)
```

Se o servidor estiver down, abrir um terminal separado e correr `node serve.mjs` (segundo a regra do projecto, **nunca matar este processo**).

- [ ] **Step 2: Abrir 4 páginas — uma de cada classificação cobertas — e tirar screenshots**

Identificar 4 IDs em `data/water-quality.json` que tenham diferentes classificações:

```bash
node -e "
const j = require('./data/water-quality.json');
const buckets = {};
for (const [id, e] of Object.entries(j.beaches)) {
  const k = e.previousYearDsc || 'sem-class';
  if (!buckets[k]) buckets[k] = [];
  buckets[k].push(id);
}
console.log('Buckets:');
for (const k of Object.keys(buckets)) console.log(' ', k, '→', buckets[k].slice(0,3).join(', '));
"
```

Escolher 1 ID de cada classificação disponível (Excelente/Boa/Aceitável/Má/Sem). Para cada, correr:

```bash
node screenshot.mjs http://localhost:3000/praia.html?id=<beach-id>
```

- [ ] **Step 3: Inspeccionar visualmente cada screenshot (`temporary screenshots/screenshot-N.png`)**

Usar a ferramenta Read em cada PNG. Verificar:
- A secção "Qualidade da Água" aparece **entre** "Sobre esta Praia" e "Tempo Atual".
- A cor da gota e estrelas correspondem ao esquema oficial APA (azul/verde/amarelo/vermelho/cinza).
- Estrelas: 4/3/2/1 cheias para Excelente/Boa/Aceitável/Má.
- Texto: "Estado", "Época Balnear", link "SNIRH ↗" presentes.
- Fonte rodapé com `apaCode` e data formatada.
- Layout não quebra em mobile width (repetir um dos screenshots com `node shot-mobile.mjs http://localhost:3000/praia.html?id=<beach-id>`).

- [ ] **Step 4: Verificar que praias SEM match não mostram a secção**

Identificar uma praia sem match:

```bash
node -e "
const all = require('./data/beaches.json');
const wq = require('./data/water-quality.json');
const orphan = all.find(b => !wq.beaches[b.id]);
console.log('Beach sem match para teste:', orphan?.id, '|', orphan?.name);
"
```

Tirar screenshot dessa praia:

```bash
node screenshot.mjs http://localhost:3000/praia.html?id=<orphan-id>
```

Confirmar que entre "Sobre esta Praia" e "Tempo Atual" **não há nada** (sem secção, sem título, sem espaço extra anormal). Se houver um espaço grande, verificar se o slot `<div id="water-quality-slot"></div>` foi removido correctamente.

- [ ] **Step 5: Se algo estiver visualmente errado, corrigir e re-screenshot**

Iterar até estar correcto (mínimo 2 rounds segundo CLAUDE.md). Commit incremental se houver fix:

```bash
git add -A && git commit -m "fix(qualidade-agua): ajustes visuais após screenshot"
```

- [ ] **Step 6: Commit final do round visual**

(Se nada foi alterado, saltar.)

---

## Task 9: Admin — bloco read-only + campo `apaCode`

**Files:**
- Modify: `js/admin.js`

- [ ] **Step 1: Pré-carregar `water-quality.json` no `initDashboard`**

Edit `js/admin.js`. Localizar a função `initDashboard` (linha ~484) — o local onde se carrega `data/products.json` e `data/content.json` (linhas ~494-509). Imediatamente DEPOIS do bloco de `content.json` e ANTES do bloco `Layout overrides` (linha ~510), adicionar:

```js
  // Water Quality (APA) — read-only, gerado automaticamente pela GH Action
  try {
    const res = await fetch('data/water-quality.json');
    state.data.waterQuality = await res.json();
  } catch {
    state.data.waterQuality = null;
  }
```

- [ ] **Step 2: Substituir o `<select id="b-waterQuality">` pelo bloco APA**

Edit `js/admin.js`. Localizar (linhas ~1014-1024 — usar `grep -n "b-waterQuality" js/admin.js`):

Replace:
```js
        <div class="grid grid-cols-2 gap-4">
          <div><label>Rio / Albufeira</label><input type="text" id="b-river" value="${escHtml(b.river)}"></div>
          <div>
            <label>Qualidade da Água</label>
            <select id="b-waterQuality">
              <option value="excelente" ${b.waterQuality==='excelente'?'selected':''}>Excelente</option>
              <option value="boa" ${b.waterQuality==='boa'?'selected':''}>Boa</option>
              <option value="aceitavel" ${b.waterQuality==='aceitavel'?'selected':''}>Aceitável</option>
            </select>
          </div>
        </div>
      </div>
```

With (note: `b.id` é o slug usado para lookup; o bloco lê do `state.data.waterQuality?.beaches?.[b.id]`):

```js
        <div class="grid grid-cols-1 gap-4">
          <div><label>Rio / Albufeira</label><input type="text" id="b-river" value="${escHtml(b.river)}"></div>
        </div>
      </div>

      <!-- Qualidade da Água (APA) — read-only + override -->
      <div class="bg-white rounded-xl p-5 mb-4 shadow-sm border border-praia-sand-100">
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-3">Qualidade da Água (APA)</h3>
        ${(() => {
          const wq = state.data.waterQuality?.beaches?.[b.id];
          if (wq) {
            return `
            <div style="font-size:13px;color:#003A40;line-height:1.6;margin-bottom:12px;">
              <div><strong style="font-family:'Poppins';font-weight:600;color:#928066;font-size:11px;letter-spacing:.06em;text-transform:uppercase;display:inline-block;min-width:140px;">Classificação</strong> ${escHtml(wq.previousYearDsc || 'Sem classificação')}</div>
              <div><strong style="font-family:'Poppins';font-weight:600;color:#928066;font-size:11px;letter-spacing:.06em;text-transform:uppercase;display:inline-block;min-width:140px;">Código APA</strong> <code>${escHtml(wq.apaCode)}</code></div>
              <div><strong style="font-family:'Poppins';font-weight:600;color:#928066;font-size:11px;letter-spacing:.06em;text-transform:uppercase;display:inline-block;min-width:140px;">Nome APA</strong> ${escHtml(wq.apaName)}</div>
              <div><strong style="font-family:'Poppins';font-weight:600;color:#928066;font-size:11px;letter-spacing:.06em;text-transform:uppercase;display:inline-block;min-width:140px;">Concelho APA</strong> ${escHtml(wq.apaConcelho || '—')}</div>
              <div><strong style="font-family:'Poppins';font-weight:600;color:#928066;font-size:11px;letter-spacing:.06em;text-transform:uppercase;display:inline-block;min-width:140px;">Método de match</strong> ${escHtml(wq.matchMethod)}${wq.matchDistance != null ? ` (${wq.matchDistance} m)` : ''}</div>
              <div><strong style="font-family:'Poppins';font-weight:600;color:#928066;font-size:11px;letter-spacing:.06em;text-transform:uppercase;display:inline-block;min-width:140px;">Última atualização</strong> ${escHtml(state.data.waterQuality.lastUpdated || '')}</div>
            </div>`;
          }
          return `<p style="font-size:13px;color:#928066;margin-bottom:12px;">Esta praia não foi encontrada na APA. Se a APA tem um registo com nome muito diferente, adicione abaixo o código manual.</p>`;
        })()}
        <div>
          <label>Override manual (apaCode, ex.: PTCQ7M)</label>
          <input type="text" id="b-apaCode" value="${escHtml(b.apaCode || '')}" placeholder="(deixar vazio para matching automático)">
          <p style="font-size:11px;color:#928066;margin-top:4px;">A próxima execução do GitHub Action vai usar este código se preenchido. <a href="https://github.com/vicentealmeidamatos/praias-fluviais/actions/workflows/water-quality.yml" target="_blank" rel="noopener" style="color:#054C52;text-decoration:underline;">Forçar atualização agora ↗</a></p>
        </div>
      </div>
```

- [ ] **Step 3: Remover `b-waterQuality` de `getBeachFormSnapshot` e adicionar `b-apaCode`**

Edit `js/admin.js`. Localizar a função `getBeachFormSnapshot` (linhas ~1124-1131):

Replace:
```js
function getBeachFormSnapshot() {
  const inputIds = ['b-name', 'b-id', 'b-municipality', 'b-freguesia', 'b-district', 'b-type', 'b-river', 'b-waterQuality', 'b-lat', 'b-lng'];
  const values = inputIds.map(id => document.getElementById(id)?.value || '');
```

With:
```js
function getBeachFormSnapshot() {
  const inputIds = ['b-name', 'b-id', 'b-municipality', 'b-freguesia', 'b-district', 'b-type', 'b-river', 'b-apaCode', 'b-lat', 'b-lng'];
  const values = inputIds.map(id => document.getElementById(id)?.value || '');
```

- [ ] **Step 4: Em `saveBeach`, persistir `apaCode` em vez de `waterQuality`**

Edit `js/admin.js`. Localizar a função `saveBeach` (linhas ~1145+) e o objecto `beach`:

Replace:
```js
    services,
    waterQuality: document.getElementById('b-waterQuality').value,
    featured: document.getElementById('b-featured').checked,
```

With:
```js
    services,
    apaCode: document.getElementById('b-apaCode').value.trim() || undefined,
    featured: document.getElementById('b-featured').checked,
```

- [ ] **Step 5: Atualizar o objecto `b` default em `editBeach` (linha 968)**

Edit `js/admin.js`. Linha 968:

Replace:
```js
    services: { ...DEFAULT_SERVICES },
    waterQuality: 'boa', featured: false, passportStamp: true
  };
```

With:
```js
    services: { ...DEFAULT_SERVICES },
    apaCode: '', featured: false, passportStamp: true
  };
```

- [ ] **Step 6: Verificação manual no admin**

1. Abrir `http://localhost:3000/admin.html`, autenticar.
2. Ir a Praias → editar "Praia Fluvial de Alqueva".
3. Verificar que aparece o bloco "Qualidade da Água (APA)" com:
   - Classificação: Excelente
   - Código APA: PTCD9W
   - Nome APA, concelho, método de match, última atualização
   - Campo input "Override manual" vazio
4. Editar uma praia que NÃO está em `water-quality.json` (usar a `<orphan-id>` da Task 8).
5. Verificar que aparece a mensagem "Esta praia não foi encontrada na APA…" e o campo de input vazio.
6. Confirmar que o select antigo "Qualidade da Água" desapareceu e que o `<input id="b-apaCode">` está presente.
7. Adicionar um `apaCode` à orphan, guardar, recarregar a página de edição e confirmar que o valor persiste.

- [ ] **Step 7: Commit**

```bash
git add js/admin.js
git commit -m "feat(qualidade-agua): admin — bloco read-only APA + override apaCode"
```

---

## Task 10: Verificação end-to-end — override manual surte efeito

**Files:** N/A (verification + a possible no-op commit of beaches.json)

- [ ] **Step 1: Escolher uma praia sem match e adicionar `apaCode` manual em `data/beaches.json`**

Encontrar uma praia que claramente devia ter match mas não tem (ex.: nome muito diferente). Procurar nas estatísticas APA via:

```bash
node -e "
const apa = require('./data/water-quality.json');
const all = require('./data/beaches.json');
const orphan = all.filter(b => !apa.beaches[b.id]).slice(0, 10);
console.log('10 orphans:'); orphan.forEach(b => console.log(' ', b.id, '|', b.name, '|', b.municipality));
"
```

Para uma orphan que se sabe ter equivalente APA (consultar `infoagua.apambiente.pt` no browser para encontrar o `codigo_agua_balnear` correcto), editar `data/beaches.json` adicionando o campo `"apaCode": "PT…"` à entrada respectiva.

(Se nenhuma orphan tem equivalente APA conhecido, **saltar este passo** e confirmar apenas que o pipeline aceita `apaCode` quando definido — testando com uma praia que já tem match e forçando um código alternativo.)

- [ ] **Step 2: Re-correr o scraper localmente**

```bash
node scripts/fetch-water-quality.mjs
```

- [ ] **Step 3: Confirmar que a praia agora aparece no JSON com `matchMethod: "manual"`**

```bash
node -e "
const j = require('./data/water-quality.json');
const e = j.beaches['<beach-id-modificada>'];
console.log(e ? JSON.stringify(e, null, 2) : 'NÃO MATCHED');
"
```

Esperado: `matchMethod: "manual"` e o `apaCode` correspondente.

- [ ] **Step 4: Recarregar `praia.html?id=<beach-id-modificada>` no browser**

Confirmar visualmente que a secção "Qualidade da Água" agora aparece para esta praia.

- [ ] **Step 5: Reverter o teste se foi um override fictício, ou commitar se for real**

Se o override foi feito numa praia real e deve persistir → `git add data/beaches.json data/water-quality.json` + commit. Caso contrário → `git checkout data/beaches.json data/water-quality.json` (cuidado, este é destrutivo — só usar se foi um teste e quer descartar).

```bash
# Se for para manter:
git add data/beaches.json data/water-quality.json
git commit -m "data(qualidade-agua): override manual apaCode para <praia>"
# Se for só teste descartável:
git checkout data/beaches.json data/water-quality.json
```

---

## Task 11: Verificação final — campo `waterQuality` legado não quebra nada

**Files:** N/A (verification)

- [ ] **Step 1: Confirmar que o frontend ignora `waterQuality` no `beaches.json`**

```bash
grep -rn "waterQuality" js/ --include="*.js" | grep -v "water-quality\|waterQuality:\s*'data" | grep -v "WQ_\|wq-\|water-quality-\|renderWaterQualitySection\|_wq"
```

Esperado: zero resultados (já não há leitura/escrita de `b.waterQuality` no frontend ou no admin).

- [ ] **Step 2: Confirmar que o admin não tem mais o select legado**

```bash
grep -n "b-waterQuality" js/admin.js
```

Esperado: zero resultados.

- [ ] **Step 3: Correr os testes uma última vez**

```bash
npm test
```

Esperado: 11/11 testes passam.

- [ ] **Step 4: Round visual final — 1 screenshot de cada das 4 classificações principais + 1 sem-secção**

(Re-correr os screenshots da Task 8 se já não estavam frescos.)

- [ ] **Step 5: Commit de fim de feature (se necessário)**

```bash
git status
# Se houver pendentes:
git add -A
git commit -m "chore(qualidade-agua): cleanup final"
```

---

## Self-Review Checklist (já corrida pelo plan author)

- ✅ Spec coverage: cada secção do design tem tarefa associada (matching → 1-3, scraper → 4, automação → 5, CSS → 6, frontend → 7-8, admin → 9, testes manuais → 10-11).
- ✅ Sem placeholders: cada step tem código completo (não "implementar X" sem mostrar como).
- ✅ Type/name consistency: `findApaMatch`, `normalizeBeachName`, `haversineMeters` usadas com mesma assinatura em todas as tarefas. `WQ_CLASS_MAP`, `_wqStars`, `renderWaterQualitySection` consistentes entre Task 7. CSS classes (`wq-card`, `is-excelente` etc.) idênticas entre Task 6 e Task 7.
- ✅ Edge cases tratados: praia sem match (Task 8 step 4), override inválido (Task 1 test), falha de rede (Task 4 try/catch), `previousYearDsc==null` (Task 7 step 1).
