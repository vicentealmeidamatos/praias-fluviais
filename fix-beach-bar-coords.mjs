/**
 * fix-beach-bar-coords.mjs
 * Fixes coordinates for beach bar entries in locations-carimbos.json
 * and locations-guia-passaporte.json by geocoding the beach name via
 * Nominatim instead of the simplified address.
 *
 * Usage: node fix-beach-bar-coords.mjs
 */

import { readFileSync, writeFileSync } from 'fs';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const DELAY_MS  = 1100; // Nominatim: max 1 req/sec

// Simplified address patterns — these were geocoded unreliably
const SIMPLIFIED_ADDRESS_RE = /^(Praia Fluvial|Zona Balnear|Zona de Lazer|Zona de Fruição|Albufeira)/i;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Extract beach name from a location entry */
function extractBeachName(loc) {
  // Prefer explicit beaches array
  if (loc.beaches && loc.beaches.length > 0) return loc.beaches[0];

  // Try to extract from name: "Bar da Praia Fluvial X" → "Praia Fluvial X"
  const nameMatch = loc.name.match(/(?:Bar(?:\s+d[ao])?\s+)(Praia Fluvial.*|Zona Balnear.*|Albufeira.*)/i);
  if (nameMatch) return nameMatch[1].trim();

  // Fallback: first part of the address before comma
  if (loc.address) {
    const addrPart = loc.address.split(',')[0].trim();
    if (SIMPLIFIED_ADDRESS_RE.test(addrPart)) return addrPart;
  }

  return null;
}

/** Query Nominatim for a beach name in Portugal */
async function geocode(beachName) {
  const url = `${NOMINATIM}?q=${encodeURIComponent(beachName + ', Portugal')}&format=json&limit=3&countrycodes=pt`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'GuiaPraiasFluviais/1.0 (geocode-fix-script)' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  if (!data || data.length === 0) return null;

  // Prefer results with type=leisure or natural (actual beaches/recreational areas)
  // over city/town results
  const beachResult = data.find(d =>
    d.type === 'beach' || d.type === 'leisure' || d.type === 'water' ||
    d.class === 'leisure' || d.class === 'natural' || d.class === 'waterway' ||
    d.class === 'amenity'
  );

  const best = beachResult || data[0];
  return { lat: parseFloat(best.lat), lng: parseFloat(best.lon), displayName: best.display_name };
}

/** Process a JSON file and fix simplified-address entries */
async function fixFile(path, label) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  let fixed = 0, skipped = 0, notFound = 0;

  for (let i = 0; i < data.length; i++) {
    const loc = data[i];
    const isSimplified = loc.address && SIMPLIFIED_ADDRESS_RE.test(loc.address.trim());
    if (!isSimplified) continue;

    const beachName = extractBeachName(loc);
    if (!beachName) {
      console.log(`  [SKIP] ${loc.name} — could not extract beach name`);
      skipped++;
      continue;
    }

    await sleep(DELAY_MS);
    try {
      const coords = await geocode(beachName);
      if (!coords) {
        console.log(`  [NOT FOUND] ${loc.name} — "${beachName}"`);
        notFound++;
        continue;
      }

      const oldLat = loc.coordinates?.lat?.toFixed(4);
      const oldLng = loc.coordinates?.lng?.toFixed(4);
      data[i].coordinates = { lat: coords.lat, lng: coords.lng };

      console.log(`  [OK] ${loc.name}`);
      console.log(`       Beach: "${beachName}"`);
      console.log(`       Old:   ${oldLat}, ${oldLng}`);
      console.log(`       New:   ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
      console.log(`       (${coords.displayName.substring(0, 80)})`);
      fixed++;
    } catch (err) {
      console.log(`  [ERROR] ${loc.name} — ${err.message}`);
      skipped++;
    }
  }

  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
  console.log(`\n${label}: fixed=${fixed}, notFound=${notFound}, skipped=${skipped}\n`);
}

async function main() {
  console.log('=== Fixing beach bar coordinates ===\n');

  console.log('--- locations-carimbos.json ---');
  await fixFile('data/locations-carimbos.json', 'carimbos');

  console.log('--- locations-guia-passaporte.json ---');
  await fixFile('data/locations-guia-passaporte.json', 'guia-passaporte');

  console.log('Done.');
}

main().catch(console.error);
