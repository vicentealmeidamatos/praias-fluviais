// ─── Pré-carregamento imediato (sem esperar pelo DOM) ───
// Tudo o que envolve rede é disparado já aqui em paralelo. A página de praia
// espera por todos estes promises e só depois faz um único render, evitando
// secções a aparecer em momentos diferentes.
const _beachId = new URLSearchParams(window.location.search).get('id');
const _currentYearBP = new Date().getFullYear();

const _beachesEarlyBP = _beachId ? getBeaches() : null;
const _settingsEarlyBP = _beachId ? loadData('settings') : null;
const _authEarlyBP = _beachId && window.AuthUtils ? AuthUtils.authGetUser() : null;
let _reviewsEarlyBP = _beachId && window.AuthUtils ? AuthUtils.reviewsGetForBeach(_beachId) : null;
const _waterQualityEarlyBP = _beachId
  ? (window.loadData ? window.loadData('waterQuality').catch(() => null) : Promise.resolve(null))
  : Promise.resolve(null);

// Profile + voto: dependem do utilizador autenticado. Resolvem-se a null se for visitante.
const _profileEarlyBP = (_beachId && _authEarlyBP)
  ? _authEarlyBP.then(u => u ? AuthUtils.profileGet(u.id) : null).catch(() => null)
  : Promise.resolve(null);
const _voteEarlyBP = (_beachId && _authEarlyBP)
  ? _authEarlyBP.then(u => u ? AuthUtils.voteGet(u.id, _currentYearBP) : null).catch(() => null)
  : Promise.resolve(null);

// Pre-start batched badge fetch as soon as reviews + beaches resolve.
// One call → 3 Supabase queries total, regardless of commenter count.
let _badgesEarlyBP = (_reviewsEarlyBP && _beachesEarlyBP)
  ? Promise.all([_reviewsEarlyBP, _beachesEarlyBP]).then(([reviews, beaches]) => {
      const uids = [...new Set((reviews || []).map(r => r.user_id).filter(Boolean))];
      if (!uids.length) return {};
      return AuthUtils.badgesGetForUsers(uids, beaches).catch(() => ({}));
    }).catch(() => ({}))
  : Promise.resolve({});

// Preload hero image o mais cedo possível
if (_beachId && _beachesEarlyBP) {
  _beachesEarlyBP.then(list => {
    const b = list.find(x => x.id === _beachId);
    if (b && b.photos && b.photos[0]) {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = b.photos[0];
      link.fetchPriority = 'high';
      document.head.appendChild(link);
    }
  }).catch(() => {});
}

// Injecta CSS das medalhas/glow logo ao carregar o módulo. Antes era inserido
// dentro de loadReviews(); com o render atómico passa a estar sempre disponível
// antes do primeiro pincel de comentários, garantindo que cartões míticos e
// diamante aparecem com o glow desde a primeira frame.
(function injectMedalStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('medal-anim-style')) return;
  const style = document.createElement('style');
  style.id = 'medal-anim-style';
  style.textContent = `
    @keyframes badgeCommentRainbow {
      from { filter: hue-rotate(0deg) brightness(1.1); }
      to   { filter: hue-rotate(360deg) brightness(1.1); }
    }
    .medal-badge-legendary {
      animation: badgeCommentRainbow 4s linear infinite;
    }
    @keyframes miticoBorder {
      0%   { border-color: #90E2F0; box-shadow: 0 4px 16px rgba(0,0,0,0.07), 0 0 18px rgba(144,226,240,0.5); }
      17%  { border-color: #9090F0; box-shadow: 0 4px 16px rgba(0,0,0,0.07), 0 0 18px rgba(144,144,240,0.5); }
      33%  { border-color: #F090E0; box-shadow: 0 4px 16px rgba(0,0,0,0.07), 0 0 18px rgba(240,144,224,0.5); }
      50%  { border-color: #F0A890; box-shadow: 0 4px 16px rgba(0,0,0,0.07), 0 0 18px rgba(240,168,144,0.5); }
      67%  { border-color: #E0F090; box-shadow: 0 4px 16px rgba(0,0,0,0.07), 0 0 18px rgba(224,240,144,0.5); }
      83%  { border-color: #90F0B4; box-shadow: 0 4px 16px rgba(0,0,0,0.07), 0 0 18px rgba(144,240,180,0.5); }
      100% { border-color: #90E2F0; box-shadow: 0 4px 16px rgba(0,0,0,0.07), 0 0 18px rgba(144,226,240,0.5); }
    }
    .mitico-card {
      border: 1.5px solid #90E2F0;
      animation: miticoBorder 4s linear infinite;
    }
    .diamante-card {
      border: 1.5px solid #B9F2FF80;
      box-shadow: 0 4px 16px rgba(0,0,0,0.07), 0 0 18px rgba(185,242,255,0.45);
    }`;
  (document.head || document.documentElement).appendChild(style);
})();

// ─── Qualidade da Água (APA) ──────────────────────────────────────────────
const WQ_CLASS_MAP = {
  'Excelente':   { mod: 'is-excelente', stars: 4 },
  'Boa':         { mod: 'is-boa',       stars: 3 },
  'Aceitável':   { mod: 'is-aceitavel', stars: 2 },
  'Aceitavel':   { mod: 'is-aceitavel', stars: 2 }, // tolerar variação sem acento
  'Má':          { mod: 'is-ma',        stars: 1 },
  'Ma':          { mod: 'is-ma',        stars: 1 },
};

function _wqStars(filled) {
  const total = 4;
  const star  = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>';
  const empty = '<svg viewBox="0 0 24 24" aria-hidden="true" class="empty"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>';
  return Array.from({ length: total }, (_, i) => (i < filled ? star : empty)).join('');
}

function _wqStateText(entry) {
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
    const [, m, d] = iso.split('-').map(Number);
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
  // Usa lastChanged (data efectiva da última alteração para esta praia),
  // com fallback ao lastUpdated global se a entrada ainda não tem o campo.
  const updated = _wqFormatUpdated(entry.lastChanged || waterQualityJson.lastUpdated);
  const sourceLine = `Fonte APA${updated ? ` · actualizado a ${updated}` : ''}`;

  const linkSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>';

  return `
      <section class="mb-12">
        <h2 class="font-display text-xs uppercase tracking-[0.2em] text-praia-teal-500 font-semibold mb-3">Qualidade da Água</h2>
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
          ${entry.snirhUrl ? `<a href="${entry.snirhUrl}" target="_blank" rel="noopener" class="wq-link" aria-label="Ver no SNIRH" title="Ver no SNIRH">${linkSvg}</a>` : ''}
        </div>
        <div class="wq-source">${sourceLine}</div>
      </section>`;
}

// ─── Individual Beach Page ───
document.addEventListener('DOMContentLoaded', async () => {
  const beachId = _beachId;
  const mainContent = document.getElementById('beach-content');
  if (!beachId || !mainContent) return;

  // ── Espera por TODOS os dados em paralelo ──────────────────────────────────
  // Render atómico: nenhuma secção pode aparecer antes das outras. O esqueleto
  // já está no HTML inicial; substituímo-lo apenas quando tudo está pronto.
  let beaches, settings, waterQualityJson, currentUser, allReviews,
      currentProfile, votedBeachId, badgeMap;
  try {
    [beaches, settings, waterQualityJson, currentUser, allReviews,
     currentProfile, votedBeachId, badgeMap] = await Promise.all([
      (_beachesEarlyBP || getBeaches()).catch(() => []),
      (_settingsEarlyBP || loadData('settings')).then(s => s || {}).catch(() => ({})),
      _waterQualityEarlyBP,
      _authEarlyBP || (window.AuthUtils ? AuthUtils.authGetUser() : Promise.resolve(null)),
      (_reviewsEarlyBP || (window.AuthUtils ? AuthUtils.reviewsGetForBeach(beachId) : Promise.resolve([]))).catch(() => []),
      _profileEarlyBP,
      _voteEarlyBP,
      _badgesEarlyBP || Promise.resolve({}),
    ]);
    // Consumir o cache do reviews/badges pré-buscado para que rerenders após
    // submissão/eliminação obtenham dados frescos.
    _reviewsEarlyBP = null;
    _badgesEarlyBP = null;
  } catch {}

  beaches = beaches || [];
  if (!beaches.length) {
    mainContent.innerHTML = '<div class="text-center py-20"><p class="text-praia-sand-500">Erro ao carregar dados.</p></div>';
    return;
  }

  // Índice na lista original — necessário para ligar campos editáveis ao
  // dataset 'beaches' do admin via data-content-bind="beaches:<idx>.<campo>"
  const beachIdx = beaches.findIndex(b => b.id === beachId);
  const beach = beachIdx >= 0 ? beaches[beachIdx] : null;
  if (!beach || beach.hidden) {
    mainContent.innerHTML = '<div class="text-center py-20"><h2 class="font-display text-2xl font-bold text-praia-teal-800 mb-4">Praia não encontrada</h2><a href="rede.html" class="btn-primary inline-flex items-center gap-2 bg-praia-teal-800 text-praia-yellow-400 px-6 py-3 rounded-full font-display font-bold text-sm uppercase tracking-wider">Ver Mapa</a></div>';
    return;
  }

  const mapsUrl = `https://www.google.com/maps?q=${beach.coordinates.lat},${beach.coordinates.lng}`;
  const wazeUrl = `https://waze.com/ul?ll=${beach.coordinates.lat},${beach.coordinates.lng}&navigate=yes`;

  const serviceIcons = {
    blueFlag:    { img: 'brand_assets/icones/bandeiraazul.png',     label: 'Bandeira Azul' },
    goldQuality: { img: 'brand_assets/icones/qualidadeouro.png',    label: 'Qualidade de Ouro' },
    accessible:  { img: 'brand_assets/icones/acessibilidades.png',  label: 'Acessibilidades' },
    lifeguard:   { img: 'brand_assets/icones/socorrista.png',       label: 'Nadador-Salvador' },
    bar:         { img: 'brand_assets/icones/bar.png',              label: 'Bar/Restaurante' },
    picnicArea:  { img: 'brand_assets/icones/parquedemerendas.png', label: 'Parque Merendas' },
    petFriendly: { img: 'brand_assets/icones/cao.png',              label: 'Pet-friendly' },
    playground:  { img: 'brand_assets/icones/bola.png',             label: 'Parque Infantil' },
    boatRental:  { img: 'brand_assets/icones/embarcacoes.png',      label: 'Embarcações' },
    camping:     { img: 'brand_assets/icones/alojamento.png',       label: 'Alojamento' },
    wc:          { img: 'brand_assets/icones/wc.png',               label: 'Instal. Sanitárias' },
    nacional2:   { img: 'brand_assets/icones/EN2.png',              label: 'Estrada Nacional 2' },
  };

  const servicesHtml = Object.entries(beach.services)
    .filter(([k, v]) => v && serviceIcons[k])
    .map(([k]) => {
      const s = serviceIcons[k];
      return `<div class="flex flex-col items-center gap-1.5 group" title="${s.label}">
        <div class="w-12 h-12 rounded-xl bg-praia-teal-800/5 flex items-center justify-center group-hover:bg-praia-yellow-400/20 transition-colors duration-300">
          <img src="${s.img}" alt="${s.label}" class="w-7 h-7 object-contain" loading="lazy" decoding="async">
        </div>
        <span class="text-[10px] font-display font-semibold uppercase tracking-wider text-praia-sand-500 text-center leading-tight">${s.label}</span>
      </div>`;
    }).join('');

  const nearby = beaches
    .filter(b => b.id !== beach.id)
    .map(b => ({ ...b, _dist: haversineDistance(beach.coordinates.lat, beach.coordinates.lng, b.coordinates.lat, b.coordinates.lng) }))
    .sort((a, b) => a._dist - b._dist)
    .slice(0, 3);

  const nearbyHtml = nearby.map(b => `
    <a href="praia.html?id=${b.id}" class="card-interactive rounded-xl overflow-hidden bg-white shadow-layered group">
      <div class="relative h-36 overflow-hidden">
        <img src="${b.thumbnail || b.photos[0]}" alt="${b.name}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" loading="lazy">
        <div class="absolute inset-0 bg-gradient-to-t from-praia-teal-800/60 via-transparent to-transparent"></div>
      </div>
      <div class="p-4">
        <h4 class="font-display text-sm font-bold text-praia-teal-800 leading-snug">${b.name}</h4>
        <p class="text-xs text-praia-sand-500 mt-1">${b.municipality} · ${formatDistance(b._dist)}</p>
      </div>
    </a>
  `).join('');

  const photoCount = beach.photos.length;
  const focals = Array.isArray(beach.photoFocals) ? beach.photoFocals : [];
  // Anchor preferencial: fundo. Para fotos com assunto bem ao centro/topo
  // (focal_Y < 50), respeita-se o focal_Y. Caso contrário, mostra-se o fundo
  // da foto com um pequeno empurrão extra (a praia/água está quase sempre
  // na metade inferior).
  const biasFocal = (f) => (f < 50 ? f : Math.min(100, f + 12));
  // Cada slide tem:
  //   - .slide-bg-blur : sempre cover + blur (preenche os lados em letterbox)
  //   - .slide-photo   : cover por defeito; comuta para contain se a foto for
  //     significativamente mais estreita que o hero (detecção async no JS).
  const carouselSlides = beach.photos.map((p, i) => {
    const focalY = biasFocal(Number.isFinite(focals[i]) ? focals[i] : 100);
    return `
    <div class="carousel-slide photo-protected absolute inset-0 transition-opacity duration-500 ease-in-out ${i === 0 ? 'opacity-100' : 'opacity-0'}"
         role="img" aria-label="${beach.name} - foto ${i + 1}"
         data-photo-src="${p}" data-focal-y="${focalY}">
      <div class="slide-bg-blur absolute inset-0"
           style="background-image:url('${p}');background-size:cover;background-position:50% 50%;filter:blur(28px) brightness(0.45);transform:scale(1.1);"></div>
      <div class="slide-photo absolute inset-0"
           style="background-image:url('${p}');background-size:cover;background-position:50% ${focalY}%;background-repeat:no-repeat;"></div>
      <div class="photo-shield" aria-hidden="true"></div>
    </div>
  `;
  }).join('');

  const carouselControls = photoCount > 1 ? `
    <button id="carousel-prev" class="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/35 hover:bg-black/55 backdrop-blur-sm flex items-center justify-center text-white transition-all duration-200 active:scale-95" aria-label="Foto anterior">
      <i data-lucide="chevron-left" class="w-5 h-5"></i>
    </button>
    <button id="carousel-next" class="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/35 hover:bg-black/55 backdrop-blur-sm flex items-center justify-center text-white transition-all duration-200 active:scale-95" aria-label="Próxima foto">
      <i data-lucide="chevron-right" class="w-5 h-5"></i>
    </button>
  ` : '';

  const carouselDots = photoCount > 1 ? `
    <div class="flex gap-1.5 mb-3 md:mb-4">
      ${beach.photos.map((_, i) => `<button class="carousel-dot rounded-full transition-all duration-300 ${i === 0 ? 'bg-white h-1.5 w-4' : 'bg-white/40 h-1.5 w-1.5'}" data-index="${i}" aria-label="Foto ${i + 1}"></button>`).join('')}
    </div>
  ` : '';

  const locationLine = beach.freguesia
    ? `${beach.municipality}, ${beach.freguesia} · ${beach.river}`
    : `${beach.municipality}, ${beach.district} · ${beach.river}`;

  // ── Pré-computar TODAS as secções dinâmicas antes do render único ──────────
  // Galardões (vencedores anteriores)
  let winnerMedalsHtml = '';
  try {
    const winnerAwards = [];
    const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const beachNorm = norm(beach.name);
    function matchesBeach(name) {
      if (!name) return false;
      const n = norm(name);
      const nBase = norm(name.split(' - ')[0]);
      return n.includes(beachNorm) || beachNorm.includes(nBase) || nBase.includes(beachNorm);
    }
    ((settings && settings.previousWinners) || []).forEach(w => {
      const year = w.year;
      if (matchesBeach(w.winner)) {
        winnerAwards.push({ rank: 1, position: '1.º Lugar', year, icon: 'trophy', iconColor: '#C8960A', labelColor: '#A67C00', bg: 'linear-gradient(135deg, #FFFDE7 0%, #FFF59D 100%)', bgFlat: '#FFF9C4', border: '#F5C518', textColor: '#7A6200' });
      }
      if (matchesBeach(w.second)) {
        winnerAwards.push({ rank: 2, position: '2.º Lugar', year, icon: 'medal', iconColor: '#8A8A8A', labelColor: '#6B6B6B', bg: 'rgba(192,192,192,0.08)', border: 'rgba(192,192,192,0.3)', textColor: '#003A40' });
      }
      if (matchesBeach(w.third)) {
        winnerAwards.push({ rank: 3, position: '3.º Lugar', year, icon: 'award', iconColor: '#A0612B', labelColor: '#7A4A1E', bg: 'rgba(205,127,50,0.08)', border: 'rgba(205,127,50,0.3)', textColor: '#003A40' });
      }
      (w.revelations || []).forEach(rv => {
        if (matchesBeach(rv.name)) {
          winnerAwards.push({ rank: 4, position: `Revelação${rv.label ? ' ' + rv.label : ''}`, year, icon: 'sparkles', iconColor: '#0270AD', labelColor: '#025E8F', bg: 'rgba(2,136,209,0.08)', border: 'rgba(2,136,209,0.3)', textColor: '#003A40' });
        }
      });
    });
    winnerAwards.sort((a, b) => a.rank !== b.rank ? a.rank - b.rank : String(b.year).localeCompare(String(a.year), undefined, { numeric: true }));
    if (winnerAwards.length > 0) {
      winnerMedalsHtml = `
      <section class="mb-12">
        <h2 class="font-display text-xs uppercase tracking-[0.2em] text-praia-teal-500 font-semibold mb-5">Galardões</h2>
        <div class="flex flex-wrap gap-3">
          ${winnerAwards.map(a => `
            <a href="votar.html?ano=${a.year}#vencedores" style="text-decoration:none;display:inline-flex;align-items:center;gap:10px;padding:12px 18px;border-radius:14px;background:${a.bg};border:1px solid ${a.border};transition:transform 0.2s,box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
              <div style="width:40px;height:40px;border-radius:10px;background:${a.rank === 1 ? 'rgba(245,197,24,0.15)' : a.bgFlat || a.bg};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i data-lucide="${a.icon}" style="width:20px;height:20px;color:${a.rank === 1 ? '#D4A800' : a.iconColor};"></i>
              </div>
              <div>
                <span style="font-family:'Poppins',sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:${a.rank === 1 ? '#A67C00' : a.labelColor};font-weight:600;display:block;">Praia Fluvial do Ano</span>
                <span style="font-family:'Poppins',sans-serif;font-size:14px;font-weight:700;color:${a.textColor};">${a.position} ${a.year}</span>
              </div>
            </a>
          `).join('')}
        </div>
      </section>`;
    }
  } catch (e) {
    console.warn('[beach-page] winner medals error:', e);
  }

  // Qualidade da água (APA) — string vazia se não houver dados (omite secção)
  const waterQualityHtml = renderWaterQualitySection(beach.id, waterQualityJson) || '';

  // CTA de voto — mostra se utilizador ainda não votou neste ano (visitantes vêem CTA também)
  const showVoteCta = !currentUser || !votedBeachId;
  const voteSectionHtml = `
      <section class="mb-12 bg-praia-teal-800 rounded-2xl p-8 md:p-10 text-center noise-overlay relative overflow-hidden${showVoteCta ? '' : ' hidden'}" id="beach-vote-section">
        <div class="relative z-10">
          <i data-lucide="trophy" class="w-10 h-10 text-praia-yellow-400 mx-auto mb-4"></i>
          <h2 class="font-display text-xl md:text-2xl font-bold text-white mb-3">Vote nesta praia fluvial para Praia do Ano 2026</h2>
          <p class="text-white/50 text-sm mb-6">Ajude ${beach.name} a ganhar o galardão Praia Fluvial do Ano!</p>
          <button onclick="openVoteModal('${beach.id}', '${beach.name.replace(/'/g, "\\'")}')" class="btn-primary inline-flex items-center gap-2 bg-praia-yellow-400 text-praia-teal-800 font-display font-bold text-sm uppercase tracking-wider px-8 py-4 rounded-full shadow-layered-yellow">
            <i data-lucide="vote" class="w-5 h-5"></i> Votar Agora
          </button>
        </div>
      </section>`;

  // Comentários — render imediato já com medalhas (badgeMap pré-buscado)
  const reviewsInnerHtml = buildReviewsHtml(allReviews || [], currentUser, badgeMap || {}, beach.id);
  // Formulário de comentário
  const reviewFormHtml = buildReviewFormHtml(beach.id, currentUser, currentProfile);

  mainContent.innerHTML = `
    <!-- Hero Carousel -->
    <div class="relative" id="hero-carousel">
      <div class="relative overflow-hidden h-[440px] md:h-[560px] lg:h-[680px]">
        ${carouselSlides}
        <div class="hero-watermark" aria-hidden="true">
          <img src="brand_assets/logotipo.png" alt="">
        </div>
      </div>
      ${carouselControls}
      <!-- Gradiente mais contido no fundo (não invade a metade superior) -->
      <div class="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-praia-teal-900/85 via-praia-teal-900/35 to-transparent pointer-events-none z-10"></div>
      <div class="absolute bottom-0 left-0 right-0 p-4 md:p-8 lg:p-10 z-20">
        ${carouselDots}
        <span class="kicker-yellow block mb-1.5 md:mb-2">${beach.type === 'zona_balnear' ? 'Zona Balnear' : 'Praia Fluvial'}</span>
        <h1 data-content-bind="beaches:${beachIdx}.name" class="font-display text-xl sm:text-2xl md:text-4xl lg:text-5xl font-bold text-white tracking-tightest mb-1 md:mb-2 leading-tight">${beach.name}</h1>
        <p class="text-white/70 font-body text-xs sm:text-sm md:text-base"><span data-content-bind="beaches:${beachIdx}.municipality">${beach.municipality}</span>${beach.freguesia ? `, <span data-content-bind="beaches:${beachIdx}.freguesia">${beach.freguesia}</span>` : `, <span data-content-bind="beaches:${beachIdx}.district">${beach.district}</span>`} · <span data-content-bind="beaches:${beachIdx}.river">${beach.river}</span></p>
      </div>
    </div>

    <div class="max-w-5xl mx-auto px-6 py-10 md:py-16">
      <!-- Services -->
      <section class="mb-12">
        <h2 class="font-display text-xs uppercase tracking-[0.2em] text-praia-teal-500 font-semibold mb-5">Serviços</h2>
        <div class="grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));">${servicesHtml}</div>
      </section>

      ${winnerMedalsHtml}

      <!-- Description -->
      <section class="mb-12">
        <h2 class="font-display text-xs uppercase tracking-[0.2em] text-praia-teal-500 font-semibold mb-4">Sobre esta Praia</h2>
        <p data-content-bind="beaches:${beachIdx}.description" class="text-praia-sand-700 leading-relaxed-plus text-base md:text-lg">${beach.description}</p>
      </section>

      ${waterQualityHtml}

      <!-- Weather -->
      <section class="mb-12">
        <h2 class="font-display text-xs uppercase tracking-[0.2em] text-praia-teal-500 font-semibold mb-5">Tempo Atual</h2>
        <div id="weather-widget">
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div class="skeleton h-28 rounded-xl"></div>
            <div class="skeleton h-28 rounded-xl"></div>
            <div class="skeleton h-28 rounded-xl"></div>
            <div class="skeleton h-28 rounded-xl"></div>
          </div>
        </div>
      </section>

      <!-- Directions -->
      <section class="mb-12">
        <h2 class="font-display text-xs uppercase tracking-[0.2em] text-praia-teal-500 font-semibold mb-5">Como Chegar</h2>
        <div class="flex flex-wrap gap-3">
          <a href="${mapsUrl}" target="_blank" rel="noopener" class="btn-primary inline-flex items-center gap-2 bg-praia-teal-800 text-white font-display font-bold text-xs uppercase tracking-wider px-6 py-3 rounded-full">
            <i data-lucide="map-pin" class="w-4 h-4"></i> Google Maps
          </a>
          <a href="${wazeUrl}" target="_blank" rel="noopener" class="btn-primary inline-flex items-center gap-2 bg-praia-blue-600 text-white font-display font-bold text-xs uppercase tracking-wider px-6 py-3 rounded-full">
            <i data-lucide="navigation" class="w-4 h-4"></i> Waze
          </a>
        </div>
      </section>

      ${voteSectionHtml}

      <!-- Share -->
      <section class="mb-12">
        <h2 class="font-display text-xs uppercase tracking-[0.2em] text-praia-teal-500 font-semibold mb-5">Partilhar</h2>
        <div class="flex flex-wrap gap-3">
          <button onclick="shareBeach()" class="btn-primary inline-flex items-center gap-2 bg-praia-sand-100 text-praia-teal-700 font-display font-bold text-xs uppercase tracking-wider px-5 py-2.5 rounded-full border border-praia-sand-200">
            <i data-lucide="share-2" class="w-4 h-4"></i> Partilhar
          </button>
          <button onclick="shareBeach('facebook')" class="btn-primary inline-flex items-center gap-2 font-display font-bold text-xs uppercase tracking-wider px-5 py-2.5 rounded-full text-white" style="background:#1877F2;">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg> Facebook
          </button>
          <button onclick="shareBeach('instagram')" class="btn-primary inline-flex items-center gap-2 font-display font-bold text-xs uppercase tracking-wider px-5 py-2.5 rounded-full text-white" style="background:linear-gradient(135deg,#f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%);">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg> Instagram
          </button>
        </div>
      </section>

      <!-- Community Reviews -->
      <section class="mb-12">
        <h2 class="font-display text-xs uppercase tracking-[0.2em] text-praia-teal-500 font-semibold mb-5">Comunidade</h2>
        <div id="reviews-container" class="space-y-4 mb-6">${reviewsInnerHtml}</div>
        <div id="review-form-area">${reviewFormHtml}</div>
      </section>

      <!-- Nearby Beaches -->
      <section>
        <h2 class="font-display text-xs uppercase tracking-[0.2em] text-praia-teal-500 font-semibold mb-5">Praias Próximas</h2>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-5">${nearbyHtml}</div>
      </section>
    </div>
  `;

  window._currentBeachName = beach.name;
  window._currentBeachSubtitle = `${beach.municipality} · ${beach.river}`;
  window._currentBeachMunicipality = beach.municipality || '';
  window._currentBeachRiver = beach.river || '';
  window._currentBeachType = beach.type || 'praia_fluvial';
  window._currentBeachPhoto = beach.thumbnail || (beach.photos && beach.photos[0]) || '';
  document.title = `${beach.name} | Praias Fluviais`;
  // Update OG meta tags
  const ogTitle = document.querySelector('meta[property="og:title"]');
  const ogDesc  = document.querySelector('meta[property="og:description"]');
  const ogImg   = document.querySelector('meta[property="og:image"]');
  const metaDesc = document.querySelector('meta[name="description"]');
  if (ogTitle) ogTitle.content = `${beach.name} | Praias Fluviais`;
  if (ogDesc)  ogDesc.content = beach.description || `Descubra ${beach.name}: ${beach.municipality}, ${beach.river}.`;
  if (ogImg)   ogImg.content = beach.thumbnail || beach.photos[0];
  if (metaDesc) metaDesc.content = beach.description || `Descubra ${beach.name}: ${beach.municipality}, ${beach.river}.`;

  lucide.createIcons();
  initCarousel(photoCount);
  initSlideAspectFit();

  // ── Fire weather independently (never blocks anything) ──────────────────────
  const weatherWidget = document.getElementById('weather-widget');
  if (weatherWidget) {
    fetchWeather(beach.coordinates.lat, beach.coordinates.lng)
      .then(w => { renderWeatherWidget(weatherWidget, w); lucide.createIcons(); });
  }

  // ── Qualidade da água (APA) — não bloqueia ──────────────────────────────
  const wqSlot = document.getElementById('water-quality-slot');
  if (wqSlot && _waterQualityEarlyBP) {
    _waterQualityEarlyBP.then((wq) => {
      const html = renderWaterQualitySection(beach.id, wq);
      if (html) wqSlot.outerHTML = html;
      else wqSlot.remove();
    }).catch(() => { wqSlot.remove(); });
  } else if (wqSlot) {
    wqSlot.remove();
  }

  // ── Settings + auth + reviews all in parallel ─────────────────────────────
  const [settings, currentUser] = await Promise.all([
    (_settingsEarlyBP || loadData('settings')).then(s => s || {}).catch(() => ({})),
    _authEarlyBP || AuthUtils.authGetUser(),
  ]);

  // ── Winner medals (sync) ──────────────────────────────────────────────────
  try {
    const winnerAwards = [];
    const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const beachNorm = norm(beach.name);

    function matchesBeach(name) {
      if (!name) return false;
      const n = norm(name);
      const nBase = norm(name.split(' - ')[0]);
      return n.includes(beachNorm) || beachNorm.includes(nBase) || nBase.includes(beachNorm);
    }

    (settings.previousWinners || []).forEach(w => {
      const year = w.year;
      if (matchesBeach(w.winner)) {
        winnerAwards.push({ rank: 1, position: '1.º Lugar', year, icon: 'trophy', iconColor: '#C8960A', labelColor: '#A67C00', bg: 'linear-gradient(135deg, #FFFDE7 0%, #FFF59D 100%)', bgFlat: '#FFF9C4', border: '#F5C518', textColor: '#7A6200' });
      }
      if (matchesBeach(w.second)) {
        winnerAwards.push({ rank: 2, position: '2.º Lugar', year, icon: 'medal', iconColor: '#8A8A8A', labelColor: '#6B6B6B', bg: 'rgba(192,192,192,0.08)', border: 'rgba(192,192,192,0.3)', textColor: '#003A40' });
      }
      if (matchesBeach(w.third)) {
        winnerAwards.push({ rank: 3, position: '3.º Lugar', year, icon: 'award', iconColor: '#A0612B', labelColor: '#7A4A1E', bg: 'rgba(205,127,50,0.08)', border: 'rgba(205,127,50,0.3)', textColor: '#003A40' });
      }
      (w.revelations || []).forEach(rv => {
        if (matchesBeach(rv.name)) {
          winnerAwards.push({ rank: 4, position: `Revelação${rv.label ? ' ' + rv.label : ''}`, year, icon: 'sparkles', iconColor: '#0270AD', labelColor: '#025E8F', bg: 'rgba(2,136,209,0.08)', border: 'rgba(2,136,209,0.3)', textColor: '#003A40' });
        }
      });
    });

    winnerAwards.sort((a, b) => a.rank !== b.rank ? a.rank - b.rank : String(b.year).localeCompare(String(a.year), undefined, { numeric: true }));

    if (winnerAwards.length > 0) {
      const badgesSection = document.querySelector('#beach-content .max-w-5xl');
      if (badgesSection) {
        const medalContainer = document.createElement('section');
        medalContainer.className = 'mb-12';
        medalContainer.innerHTML = `
          <h2 class="font-display text-xs uppercase tracking-[0.2em] text-praia-teal-500 font-semibold mb-5">Galardões</h2>
          <div class="flex flex-wrap gap-3">
            ${winnerAwards.map(a => `
              <a href="votar.html?ano=${a.year}#vencedores" style="text-decoration:none;display:inline-flex;align-items:center;gap:10px;padding:12px 18px;border-radius:14px;background:${a.bg};border:1px solid ${a.border};transition:transform 0.2s,box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
                <div style="width:40px;height:40px;border-radius:10px;background:${a.rank === 1 ? 'rgba(245,197,24,0.15)' : a.bgFlat || a.bg};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                  <i data-lucide="${a.icon}" style="width:20px;height:20px;color:${a.rank === 1 ? '#D4A800' : a.iconColor};"></i>
                </div>
                <div>
                  <span style="font-family:'Poppins',sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:${a.rank === 1 ? '#A67C00' : a.labelColor};font-weight:600;display:block;">Praia Fluvial do Ano</span>
                  <span style="font-family:'Poppins',sans-serif;font-size:14px;font-weight:700;color:${a.textColor};">${a.position} ${a.year}</span>
                </div>
              </a>
            `).join('')}
          </div>`;
        const firstSection = badgesSection.querySelector('section');
        if (firstSection) {
          firstSection.parentNode.insertBefore(medalContainer, firstSection.nextSibling);
        }
        lucide.createIcons();
      }
    }
  } catch (e) {
    console.warn('[beach-page] winner medals error:', e);
  }

  // ── Show vote CTA only if user hasn't voted yet ────────────────────────────
  const voteSection = document.getElementById('beach-vote-section');
  if (voteSection) {
    const currentYear = new Date().getFullYear();
    if (!currentUser) {
      // Guest — show CTA (will redirect to auth on click)
      voteSection.classList.remove('hidden');
    } else {
      AuthUtils.voteGet(currentUser.id, currentYear).then(votedId => {
        if (!votedId) voteSection.classList.remove('hidden');
      }).catch(() => { voteSection.classList.remove('hidden'); });
    }
  }

  // ── Reviews + profile in parallel (reviews fetch pre-started) ─────────────
  const [currentProfile] = await Promise.all([
    currentUser ? AuthUtils.profileGet(currentUser.id) : Promise.resolve(null),
    loadReviews(beach.id, currentUser, beaches),
  ]);
  renderReviewForm(beach.id, currentUser, currentProfile, beaches);

  // Inject JSON-LD structured data
  const jsonLd = document.createElement('script');
  jsonLd.type = 'application/ld+json';
  jsonLd.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Beach",
    "name": beach.name,
    "description": beach.description,
    "address": { "@type": "PostalAddress", "addressLocality": beach.municipality, "addressRegion": beach.district, "addressCountry": "PT" },
    "geo": { "@type": "GeoCoordinates", "latitude": beach.coordinates.lat, "longitude": beach.coordinates.lng },
    "image": beach.thumbnail || beach.photos[0],
    "isAccessibleForFree": true,
    "publicAccess": true
  });
  document.head.appendChild(jsonLd);

  const setMeta = (prop, content) => {
    let el = document.querySelector(`meta[property="${prop}"]`);
    if (el) el.setAttribute('content', content);
  };
  setMeta('og:title', `${beach.name} | Praias Fluviais`);
  setMeta('og:description', beach.description);
});

// ─── Medal display HTML for comments ─────────────────────────────────────────

function medalDisplayHTML(topBadges) {
  if (!topBadges || topBadges.length === 0) return '';
  const TIER_META = AuthUtils.BADGE_TIERS;

  // Sort highest tier first
  const tierRank = { mitico: 5, diamante: 4, ouro: 3, prata: 2, bronze: 1 };
  const sorted = [...topBadges].sort((a, b) => (tierRank[b.tier] || 0) - (tierRank[a.tier] || 0));

  // Cores de texto/borda por tier (igual à legenda de raridades)
  const tierColors = {
    bronze:   { bg: '#CD7F3222', color: '#CD7F32', border: '#CD7F3244' },
    prata:    { bg: '#A8B8C822', color: '#A8B8C8', border: '#A8B8C844' },
    ouro:     { bg: '#FFD70022', color: '#FFD700', border: '#FFD70044' },
    diamante: { bg: '#B9F2FF33', color: '#2E9BB5', border: '#2E9BB560' },
    mitico:   { bg: '#90E2F033', color: '#1E8FAA', border: '#1E8FAA60' },
  };

  return `<div class="flex items-center gap-1.5 flex-wrap mt-1.5">
    ${sorted.map(b => {
      const tc = tierColors[b.tier] || tierColors.bronze;
      const isMitico = b.tier === 'mitico';

      return `<span class="${isMitico ? 'medal-badge-legendary ' : ''}inline-flex items-center gap-1.5 rounded-full font-display font-bold cursor-default whitespace-nowrap"
        title="${b.name}: ${b.desc}"
        style="font-size:10px;padding:3px 9px 3px 7px;background:${tc.bg};color:${tc.color};border:1.5px solid ${tc.border};">
        <i data-lucide="${b.icon}" style="width:13px;height:13px;flex-shrink:0;color:${tc.color};"></i>
        ${b.name}
      </span>`;
    }).join('')}
  </div>`;
}

// ─── Load Reviews ─────────────────────────────────────────────────────────────

async function loadReviews(beachId, currentUser, beaches) {
  const container = document.getElementById('reviews-container');
  if (!container) return;

  // Use pre-fetched reviews + badges when available (first load only — consume once)
  const useEarlyReviews = beachId === _beachId && _reviewsEarlyBP;
  const useEarlyBadges  = beachId === _beachId && _badgesEarlyBP;
  const reviewsPromise = useEarlyReviews ? _reviewsEarlyBP : AuthUtils.reviewsGetForBeach(beachId);
  let badgesPromise    = useEarlyBadges  ? _badgesEarlyBP  : null;
  if (useEarlyReviews) _reviewsEarlyBP = null;
  if (useEarlyBadges)  _badgesEarlyBP  = null;

  const allReviews = await reviewsPromise;

  if (allReviews.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-praia-sand-400">
        <i data-lucide="message-circle" class="w-10 h-10 mx-auto mb-2 opacity-40"></i>
        <p class="text-sm font-display font-semibold">Ainda sem comentários</p>
        <p class="text-xs mt-1">Seja o primeiro a partilhar a sua experiência!</p>
      </div>`;
    lucide.createIcons();
    return;
  }

  // Separate top-level and replies
  const topLevel = allReviews.filter(r => !r.parent_id);
  const replies  = allReviews.filter(r => !!r.parent_id);

  // Medals are an enhancement: render comments now, fill medals when ready.
  let medalMap = {};

  function reviewCardHTML(r, isReply = false) {
    if (r.deleted_by_admin) {
      const commentReplies = replies.filter(reply => reply.parent_id === r.id);
      const repliesHtml = commentReplies.length > 0
        ? `<div class="mt-3 space-y-2 border-l-2 border-praia-sand-200 pl-4">
             ${commentReplies.map(reply => reviewCardHTML(reply, true)).join('')}
           </div>`
        : '';
      return `
        <div class="bg-praia-sand-50 rounded-xl p-4 border border-praia-sand-200 ${isReply ? 'shadow-none rounded-lg' : ''}" data-review-id="${r.id}">
          <div class="flex items-center gap-2 text-praia-sand-400">
            <i data-lucide="shield-off" class="w-3.5 h-3.5 flex-shrink-0"></i>
            <span class="text-xs italic">Este comentário foi removido por um administrador.</span>
          </div>
          ${repliesHtml}
        </div>`;
    }

    const profile    = r.profiles;
    const name       = profile?.username || 'Visitante';
    const userId     = r.user_id;
    const date       = new Date(r.created_at).toLocaleDateString('pt-PT');
    const isOwn      = currentUser && userId === currentUser.id;
    const topMedals  = medalMap[userId] || [];
    const profileUrl = `perfil.html?user=${userId}`;

    const avatarSrc  = profile?.avatar_url;
    const avatarHtml = avatarSrc
      ? `<a href="${profileUrl}" class="flex-shrink-0"><img src="${avatarSrc}" alt="${name}" class="w-9 h-9 rounded-full object-cover border-2 border-praia-sand-100 hover:opacity-80 transition-opacity"></a>`
      : `<a href="${profileUrl}" class="flex-shrink-0">
           <div class="w-9 h-9 rounded-full bg-praia-teal-800 flex items-center justify-center border-2 border-praia-sand-100 hover:opacity-80 transition-opacity">
             <span class="font-display font-bold text-sm text-praia-yellow-400">${name.charAt(0).toUpperCase()}</span>
           </div>
         </a>`;

    const hasMedals   = topMedals.length > 0;
    const hasMitico   = topMedals.some(b => b.tier === 'mitico');
    const hasDiamante = !hasMitico && topMedals.some(b => b.tier === 'diamante');

    const medalHtml = hasMedals ? medalDisplayHTML(topMedals) : '';

    const miticoCardClass   = hasMitico   && !isReply ? 'mitico-card'   : '';
    const diamanteCardClass = hasDiamante && !isReply ? 'diamante-card' : '';

    const replyButtonHtml = currentUser && !isReply
      ? `<button onclick="toggleReplyForm('${r.id}', '${beachId}')"
                 class="inline-flex items-center gap-1 text-[10px] font-display font-semibold text-praia-teal-500 hover:text-praia-teal-700 transition-colors mt-2">
           <i data-lucide="corner-down-right" style="width:11px;height:11px;"></i> Responder
         </button>`
      : '';

    const commentReplies = replies.filter(reply => reply.parent_id === r.id);
    const repliesHtml = commentReplies.length > 0
      ? `<div class="mt-3 space-y-2 border-l-2 border-praia-sand-200 pl-4">
           ${commentReplies.map(reply => reviewCardHTML(reply, true)).join('')}
         </div>`
      : '';

    return `
      <div class="bg-white rounded-xl p-4 shadow-layered ${miticoCardClass} ${diamanteCardClass} ${isReply ? 'shadow-none border border-praia-sand-100 rounded-lg' : ''}" data-review-id="${r.id}" data-user-id="${userId}">
        <div class="flex items-start gap-3">
          ${avatarHtml}
          <div class="flex-1 min-w-0">
            <div class="flex items-center flex-wrap gap-1.5">
              <a href="${profileUrl}" class="font-display text-xs font-bold text-praia-teal-800 hover:text-praia-teal-600 transition-colors">${name}</a>
              <span class="text-[10px] text-praia-sand-400">${date}</span>
            </div>
            ${medalHtml}
            <p class="text-sm text-praia-sand-700 leading-relaxed mt-2">${r.text}</p>
            ${r.images?.length ? `<div class="flex flex-wrap gap-2 mt-3">${r.images.map(img => `<img src="${img}" alt="Anexo" class="max-h-32 max-w-[160px] object-contain rounded-lg border border-praia-sand-100 cursor-pointer hover:opacity-90 transition-opacity" onclick="openImageViewer(this.src)">`).join('')}</div>` : ''}
            <div class="flex items-center gap-3 mt-1">
              ${replyButtonHtml}
            </div>
            <div id="reply-form-${r.id}" class="hidden mt-3"></div>
          </div>
          ${isOwn ? `<button onclick="deleteReview('${r.id}', '${beachId}')" class="flex-shrink-0 text-praia-sand-300 hover:text-red-400 transition-colors p-1" title="Apagar comentário">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>` : ''}
        </div>
        ${repliesHtml}
      </div>`;
  }

  function renderAll() {
    container.innerHTML = topLevel.map(r => reviewCardHTML(r, false)).join('');
    lucide.createIcons();
  }

  renderAll();

  // Enhance with medals once batched fetch resolves (non-blocking).
  const medalsReady = badgesPromise || (
    allReviews.length
      ? AuthUtils.badgesGetForUsers(
          [...new Set(allReviews.map(r => r.user_id).filter(Boolean))],
          beaches
        ).catch(() => ({}))
      : Promise.resolve({})
  );
  medalsReady.then(map => {
    if (!map || !Object.keys(map).length) return;
    medalMap = map;
    renderAll();
  });

  // Inject medal CSS animations once
  if (!document.getElementById('medal-anim-style')) {
    const style = document.createElement('style');
    style.id = 'medal-anim-style';
    style.textContent = `
      @keyframes badgeCommentRainbow {
        from { filter: hue-rotate(0deg) brightness(1.1); }
        to   { filter: hue-rotate(360deg) brightness(1.1); }
      }
      .medal-badge-legendary {
        animation: badgeCommentRainbow 4s linear infinite;
      }
      @keyframes miticoBorder {
        0%   { border-color: #90E2F0; box-shadow: 0 4px 16px rgba(0,0,0,0.07), 0 0 18px rgba(144,226,240,0.5); }
        17%  { border-color: #9090F0; box-shadow: 0 4px 16px rgba(0,0,0,0.07), 0 0 18px rgba(144,144,240,0.5); }
        33%  { border-color: #F090E0; box-shadow: 0 4px 16px rgba(0,0,0,0.07), 0 0 18px rgba(240,144,224,0.5); }
        50%  { border-color: #F0A890; box-shadow: 0 4px 16px rgba(0,0,0,0.07), 0 0 18px rgba(240,168,144,0.5); }
        67%  { border-color: #E0F090; box-shadow: 0 4px 16px rgba(0,0,0,0.07), 0 0 18px rgba(224,240,144,0.5); }
        83%  { border-color: #90F0B4; box-shadow: 0 4px 16px rgba(0,0,0,0.07), 0 0 18px rgba(144,240,180,0.5); }
        100% { border-color: #90E2F0; box-shadow: 0 4px 16px rgba(0,0,0,0.07), 0 0 18px rgba(144,226,240,0.5); }
      }
      .mitico-card {
        border: 1.5px solid #90E2F0;
        animation: miticoBorder 4s linear infinite;
      }
      .diamante-card {
        border: 1.5px solid #B9F2FF80;
        box-shadow: 0 4px 16px rgba(0,0,0,0.07), 0 0 18px rgba(185,242,255,0.45);
      }
    `;
    document.head.appendChild(style);
  }
}

// ─── Toggle Reply Form ────────────────────────────────────────────────────────

async function toggleReplyForm(parentId, beachId) {
  const container = document.getElementById(`reply-form-${parentId}`);
  if (!container) return;

  if (!container.classList.contains('hidden')) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  const user    = await AuthUtils.authGetUser();
  const profile = user ? await AuthUtils.profileGet(user.id) : null;
  const name    = profile?.username || user?.email?.split('@')[0] || 'U';
  const avatarHtml = profile?.avatar_url
    ? `<img src="${profile.avatar_url}" alt="${name}" class="w-7 h-7 rounded-full object-cover border border-praia-sand-200 flex-shrink-0">`
    : `<div class="w-7 h-7 rounded-full bg-praia-teal-800 flex items-center justify-center flex-shrink-0"><span class="font-display font-bold text-xs text-praia-yellow-400">${name.charAt(0).toUpperCase()}</span></div>`;

  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="flex items-start gap-2">
      ${avatarHtml}
      <div class="flex-1">
        <textarea id="reply-text-${parentId}" rows="2" placeholder="Responder a este comentário…"
                  class="w-full p-2.5 rounded-lg bg-praia-sand-50 border border-praia-sand-200 text-sm resize-none focus:outline-none focus:border-praia-teal-400"></textarea>
        <div class="flex items-center justify-between mt-2 gap-2">
          <div>
            <input type="file" id="reply-images-${parentId}" accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/heic,image/heif" multiple class="hidden"
                   onchange="previewReplyImages('${parentId}')">
            <label for="reply-images-${parentId}" class="inline-flex items-center gap-1.5 cursor-pointer text-xs font-display font-semibold text-praia-teal-600 border border-praia-sand-200 bg-white px-3 py-1.5 rounded-full hover:border-praia-teal-400 transition-colors">
              <i data-lucide="image" class="w-3 h-3"></i> Foto
            </label>
          </div>
          <div class="flex gap-2">
            <button onclick="toggleReplyForm('${parentId}', '${beachId}')"
                    class="text-xs font-display font-semibold text-praia-sand-400 hover:text-praia-sand-600 transition-colors px-3 py-1.5 rounded-lg">
              Cancelar
            </button>
            <button onclick="submitReply('${parentId}', '${beachId}')"
                    class="btn-primary bg-praia-teal-800 text-praia-yellow-400 font-display font-bold text-xs uppercase tracking-wider px-4 py-1.5 rounded-lg">
              Publicar
            </button>
          </div>
        </div>
        <div id="reply-preview-${parentId}" class="flex gap-2 mt-2 flex-wrap"></div>
      </div>
    </div>`;
  lucide.createIcons();
  document.getElementById(`reply-text-${parentId}`)?.focus();
}

function _renderImagePreview(input, preview, thumbClass) {
  if (!input || !preview) return;
  preview.innerHTML = '';
  Array.from(input.files).forEach((file, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'relative';

    const img = document.createElement('img');
    img.className = `${thumbClass} object-cover rounded-lg border border-praia-sand-200 cursor-pointer`;
    img.onclick = () => openImageViewer(img.src);
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; };
    reader.readAsDataURL(file);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.title = 'Remover anexo';
    removeBtn.setAttribute('aria-label', 'Remover anexo');
    removeBtn.style.cssText = 'position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:9999px;background:#003A40;color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1;border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,0.15);cursor:pointer;padding:0;';
    removeBtn.innerHTML = '&times;';
    removeBtn.onmouseenter = () => { removeBtn.style.background = '#dc2626'; };
    removeBtn.onmouseleave = () => { removeBtn.style.background = '#003A40'; };
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      const dt = new DataTransfer();
      Array.from(input.files).forEach((f, i) => { if (i !== index) dt.items.add(f); });
      input.files = dt.files;
      _renderImagePreview(input, preview, thumbClass);
    };

    wrapper.appendChild(img);
    wrapper.appendChild(removeBtn);
    preview.appendChild(wrapper);
  });
}

function previewReplyImages(parentId) {
  const input   = document.getElementById(`reply-images-${parentId}`);
  const preview = document.getElementById(`reply-preview-${parentId}`);
  _renderImagePreview(input, preview, 'w-14 h-14');
}

async function submitReply(parentId, beachId) {
  const user = await AuthUtils.authGetUser();
  if (!user) return;

  const textarea = document.getElementById(`reply-text-${parentId}`);
  const text = textarea?.value?.trim();
  if (!text) { textarea?.focus(); return; }

  const fileInput = document.getElementById(`reply-images-${parentId}`);
  const imageUrls = [];
  if (fileInput?.files?.length) {
    for (const file of fileInput.files) {
      const dataUrl = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.readAsDataURL(file);
      });
      imageUrls.push(dataUrl);
    }
  }

  const ok = await AuthUtils.reviewSubmitReply(user.id, beachId, text, parentId, imageUrls);
  if (!ok) { alert('Erro ao publicar resposta. Tente novamente.'); return; }

  let beaches = [];
  try { beaches = (await loadData('beaches')) || []; } catch {}
  await loadReviews(beachId, user, beaches);
  renderReviewForm(beachId, user, await AuthUtils.profileGet(user.id), beaches);
}

// ─── Render Review Form ────────────────────────────────────────────────────────

function renderReviewForm(beachId, user, profile, beaches) {
  const area = document.getElementById('review-form-area');
  if (!area) return;

  if (!user) {
    area.innerHTML = `
      <div class="rounded-2xl p-6 text-center" style="background:linear-gradient(135deg,#003A40,#005D56);border:1px solid rgba(255,255,255,0.1);">
        <i data-lucide="message-circle" class="w-8 h-8 mx-auto text-praia-yellow-400 mb-3"></i>
        <p class="font-display text-sm font-bold text-white mb-1">Partilhe a sua experiência</p>
        <p class="text-white/50 text-xs mb-4">Precisa de conta para comentar nesta praia.</p>
        <div class="flex flex-col sm:flex-row gap-2 justify-center">
          <a href="auth.html?redirect=${encodeURIComponent('praia.html?id=' + beachId)}"
             class="btn-primary bg-praia-yellow-400 text-praia-teal-800 font-display font-bold text-xs uppercase tracking-wider px-5 py-2.5 rounded-full shadow-layered-yellow">
            Criar Conta
          </a>
          <a href="auth.html?tab=login&redirect=${encodeURIComponent('praia.html?id=' + beachId)}"
             class="border border-white/25 text-white/70 hover:text-white font-display font-semibold text-xs uppercase tracking-wider px-5 py-2.5 rounded-full transition-colors">
            Iniciar Sessão
          </a>
        </div>
      </div>`;
    lucide.createIcons();
    return;
  }

  const name       = profile?.username || user.email?.split('@')[0] || 'U';
  const avatarHtml = profile?.avatar_url
    ? `<img src="${profile.avatar_url}" alt="${name}" class="w-9 h-9 rounded-full object-cover border-2 border-praia-sand-200 flex-shrink-0">`
    : `<div class="w-9 h-9 rounded-full bg-praia-teal-800 flex items-center justify-center flex-shrink-0"><span class="font-display font-bold text-sm text-praia-yellow-400">${name.charAt(0).toUpperCase()}</span></div>`;

  area.innerHTML = `
    <div class="bg-praia-sand-50 rounded-xl p-5 border border-praia-sand-200">
      <div class="flex items-center gap-3 mb-3">
        ${avatarHtml}
        <h3 class="font-display text-sm font-bold text-praia-teal-800">O seu comentário</h3>
      </div>
      <textarea id="review-text" rows="3" placeholder="Partilhe a sua experiência nesta praia…"
                class="w-full p-3 rounded-lg bg-white border border-praia-sand-200 text-sm resize-none focus:outline-none focus:border-praia-teal-400 mb-3"></textarea>
      <div class="flex items-center justify-between gap-3">
        <div>
          <input type="file" id="review-images" accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/heic,image/heif" multiple class="hidden">
          <label for="review-images" class="inline-flex items-center gap-2 cursor-pointer text-xs font-display font-semibold text-praia-teal-600 border border-praia-sand-200 bg-white px-4 py-2 rounded-full hover:border-praia-teal-400 transition-colors">
            <i data-lucide="image" class="w-3.5 h-3.5"></i> Fotos/Vídeos
          </label>
        </div>
        <button id="review-submit-btn" onclick="submitReview('${beachId}')"
                class="btn-primary bg-praia-teal-800 text-praia-yellow-400 font-display font-bold text-xs uppercase tracking-wider px-5 py-2.5 rounded-full">
          Publicar
        </button>
      </div>
      <div id="review-image-preview" class="flex gap-2 mt-2 flex-wrap"></div>
    </div>`;

  document.getElementById('review-images')?.addEventListener('change', function () {
    const preview = document.getElementById('review-image-preview');
    _renderImagePreview(this, preview, 'w-16 h-16');
  });

  lucide.createIcons();
}

// ─── Submit Review ────────────────────────────────────────────────────────────

async function submitReview(beachId) {
  const user = await AuthUtils.authGetUser();
  if (!user) return;

  const textarea = document.getElementById('review-text');
  const text = textarea?.value?.trim();
  if (!text) { textarea?.focus(); return; }

  const btn = document.getElementById('review-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'A publicar…'; }

  const fileInput = document.getElementById('review-images');
  const imageUrls = [];
  if (fileInput?.files?.length) {
    for (const file of fileInput.files) {
      const dataUrl = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.readAsDataURL(file);
      });
      imageUrls.push(dataUrl);
    }
  }

  const ok = await AuthUtils.reviewSubmit(user.id, beachId, text, imageUrls);

  if (btn) { btn.disabled = false; btn.textContent = 'Publicar'; }

  if (!ok) { alert('Erro ao publicar comentário. Tente novamente.'); return; }

  if (textarea) textarea.value = '';
  if (fileInput) fileInput.value = '';
  const preview = document.getElementById('review-image-preview');
  if (preview) preview.innerHTML = '';

  const profile = await AuthUtils.profileGet(user.id);
  let beaches = [];
  try { beaches = (await loadData('beaches')) || []; } catch {}
  await loadReviews(beachId, user, beaches);

  // Badge check with localStorage fix
  try {
    const stamps  = await AuthUtils.stampsGetAll(user.id);
    const reviews = await AuthUtils.reviewsGetForUser(user.id);
    const voted   = !!(await AuthUtils.voteGet(user.id, new Date().getFullYear()));
    const badges  = AuthUtils.badgesCompute({ stamps, reviews, voted, beaches });
    const storageKey = `badges_${user.id}`;
    const prevEarned = new Set(JSON.parse(localStorage.getItem(storageKey) || '[]'));
    const newBadges  = badges.filter(b => b.earned && !prevEarned.has(b.id));
    newBadges.slice(0, 2).forEach((badge, i) => setTimeout(() => AuthUtils.celebrateBadge(badge), i * 1800 + 500));
    localStorage.setItem(storageKey, JSON.stringify(badges.filter(b => b.earned).map(b => b.id)));
  } catch {}
}

// ─── Delete Review ────────────────────────────────────────────────────────────

async function deleteReview(reviewId, beachId) {
  if (!confirm('Tem a certeza que quer apagar este comentário?')) return;
  const user = await AuthUtils.authGetUser();
  if (!user) return;
  const ok = await AuthUtils.reviewDelete(reviewId, user.id);
  if (ok) {
    let beaches = [];
    try { beaches = (await loadData('beaches')) || []; } catch {}
    await loadReviews(beachId, user, beaches);
  }
}

// ─── Image Viewer ─────────────────────────────────────────────────────────────

function openImageViewer(src) {
  const existing = document.getElementById('image-viewer-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'image-viewer-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0,0,0,0.92); backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center; padding: 16px;
  `;
  overlay.innerHTML = `
    <button id="img-viewer-close"
            style="position:absolute;top:16px;right:16px;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);cursor:pointer;display:flex;align-items:center;justify-content:center;color:white;z-index:10;font-size:18px;line-height:1;"
            aria-label="Fechar">
      ✕
    </button>
    <img src="${src}" alt="Imagem em tamanho real"
         style="max-width:min(100%,900px);max-height:90vh;object-fit:contain;border-radius:8px;"
         onclick="event.stopPropagation()">
  `;

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#img-viewer-close').addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);

  document.addEventListener('keydown', function handler(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', handler); }
  });
}

// ─── Share ────────────────────────────────────────────────────────────────────

async function shareBeach(platform) {
  openShareSheet({
    type: 'beach',
    title: window._currentBeachName || document.title,
    subtitle: window._currentBeachSubtitle || '',
    municipality: window._currentBeachMunicipality || '',
    river: window._currentBeachRiver || '',
    beachType: window._currentBeachType || 'praia_fluvial',
    photo: window._currentBeachPhoto || '',
    url: window.location.href,
    highlight: platform || null,
  });
}

function showToast(msg) {
  const existing = document.getElementById('gpf-toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.id = 'gpf-toast';
  t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;background:#003A40;color:#FFEB3B;font-family:\'Poppins\',sans-serif;font-size:13px;font-weight:600;padding:12px 24px;border-radius:12px;box-shadow:0 8px 32px rgba(0,58,64,0.4);max-width:90vw;text-align:center;';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ─── Slide aspect fit ────────────────────────────────────────────────────────
// Para cada slide, detecta o aspect ratio natural da foto. Se for
// significativamente mais estreita que o hero (e.g. portrait), comuta de
// `cover` (que faria zoom excessivo) para `contain` (mostra a foto inteira à
// altura do hero, na largura original) — o fundo blurred preenche os lados.
function initSlideAspectFit() {
  const slides = document.querySelectorAll('.carousel-slide[data-photo-src]');
  if (!slides.length) return;
  // Pré-carregar dimensões naturais das fotos (cache local)
  const naturals = new Map();
  function applyOne(slide) {
    const src = slide.dataset.photoSrc;
    const photo = slide.querySelector('.slide-photo');
    if (!src || !photo) return;
    const heroW = slide.clientWidth;
    const heroH = slide.clientHeight;
    if (!heroW || !heroH) return false;
    const nat = naturals.get(src);
    if (!nat) return false;
    const photoA = nat.w / nat.h;
    // Apenas fotos verticais ou quase-quadradas recebem letterbox.
    // Fotos landscape (4:3, 3:2, 16:9, etc.) ficam sempre em `cover`.
    const shouldContain = photoA < 1.05;
    const focalY = slide.dataset.focalY || '50';
    if (shouldContain) {
      photo.style.backgroundSize = 'contain';
      photo.style.backgroundPosition = '50% 50%';
    } else {
      photo.style.backgroundSize = 'cover';
      photo.style.backgroundPosition = `50% ${focalY}%`;
    }
    return true;
  }
  function loadAndApply(slide) {
    const src = slide.dataset.photoSrc;
    if (!src) return;
    if (naturals.has(src)) { applyOne(slide); return; }
    const im = new Image();
    im.onload = () => {
      naturals.set(src, { w: im.naturalWidth, h: im.naturalHeight });
      applyOne(slide);
    };
    im.src = src;
  }
  // Esperar o layout do hero ficar pronto antes da primeira aplicação
  // (Tailwind CDN injecta CSS async; sem isto, clientHeight=0).
  function waitForLayoutAndApply() {
    const first = slides[0];
    if (first && first.clientHeight > 0) {
      slides.forEach(loadAndApply);
      return;
    }
    // Polling curto até o hero ter altura
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      if (first && first.clientHeight > 0) {
        clearInterval(t);
        slides.forEach(loadAndApply);
      } else if (tries > 40) { // ~2s
        clearInterval(t);
        slides.forEach(loadAndApply);
      }
    }, 50);
  }
  waitForLayoutAndApply();
  // Re-avaliar em resize (mudança de viewport pode alterar o hero aspect)
  let rT;
  window.addEventListener('resize', () => {
    clearTimeout(rT);
    rT = setTimeout(() => slides.forEach(applyOne), 150);
  });
}

// ─── Carousel ─────────────────────────────────────────────────────────────────

function initCarousel(count) {
  if (count <= 1) return;

  const slides = document.querySelectorAll('.carousel-slide');
  const dots   = document.querySelectorAll('.carousel-dot');
  let current  = 0;
  let timer;

  function goTo(idx) {
    slides[current].classList.remove('opacity-100');
    slides[current].classList.add('opacity-0');
    if (dots[current]) { dots[current].classList.remove('bg-white', 'w-4'); dots[current].classList.add('bg-white/40', 'w-1.5'); }
    current = ((idx % count) + count) % count;
    slides[current].classList.remove('opacity-0');
    slides[current].classList.add('opacity-100');
    if (dots[current]) { dots[current].classList.remove('bg-white/40', 'w-1.5'); dots[current].classList.add('bg-white', 'w-4'); }
  }

  function startTimer() {
    clearInterval(timer);
    timer = setInterval(() => goTo(current + 1), 3000);
  }

  document.getElementById('carousel-prev')?.addEventListener('click', () => { goTo(current - 1); startTimer(); });
  document.getElementById('carousel-next')?.addEventListener('click', () => { goTo(current + 1); startTimer(); });
  dots.forEach(d => d.addEventListener('click', () => { goTo(parseInt(d.dataset.index)); startTimer(); }));

  startTimer();
}
