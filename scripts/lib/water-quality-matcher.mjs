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

const STRONG_PROXIMITY_M = 800;
const NAME_PROXIMITY_M = 5000;

export function findApaMatch(siteBeach, apaBeaches) {
  const lat = siteBeach.coordinates?.lat;
  const lng = siteBeach.coordinates?.lng;
  const siteNorm = normalizeBeachName(siteBeach.name);

  // Sinal 1: override manual via apaCode
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
