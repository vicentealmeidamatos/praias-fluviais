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
