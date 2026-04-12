// ─── Individual Beach Page ───
document.addEventListener('DOMContentLoaded', async () => {
  const beachId = new URLSearchParams(window.location.search).get('id');
  const mainContent = document.getElementById('beach-content');
  if (!beachId || !mainContent) return;

  // Show skeleton
  mainContent.innerHTML = `<div class="max-w-5xl mx-auto px-6 py-20"><div class="skeleton h-72 w-full mb-6"></div><div class="skeleton h-8 w-2/3 mb-4"></div><div class="skeleton h-4 w-1/2 mb-8"></div><div class="skeleton h-32 w-full"></div></div>`;

  let beaches = [];
  try {
    beaches = await getBeaches();
  } catch {}
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
    blueFlag:    { icon: 'flag',          label: 'Bandeira Azul' },
    goldQuality: { icon: 'award',         label: 'Qualidade de Ouro' },
    accessible:  { icon: 'accessibility', label: 'Praia Acessível' },
    lifeguard:   { icon: 'life-buoy',     label: 'Nadador-Salvador' },
    bar:         { icon: 'utensils',      label: 'Bar/Restaurante' },
    picnicArea:  { icon: 'trees',         label: 'Parque Merendas' },
    petFriendly: { icon: 'paw-print',     label: 'Pet-friendly' },
    playground:  { icon: 'baby',          label: 'Parque Infantil' },
    boatRental:  { icon: 'sailboat',      label: 'Embarcações' },
    camping:     { icon: 'tent',          label: 'Alojamento' },
    wc:          { icon: 'bath',          label: 'Instal. Sanitárias' },
    nacional2:   { icon: 'signpost',      label: 'Estrada Nacional 2' },
  };

  const servicesHtml = Object.entries(beach.services)
    .filter(([k, v]) => v && serviceIcons[k])
    .map(([k]) => {
      const s = serviceIcons[k];
      return `<div class="flex flex-col items-center gap-1.5 group" title="${s.label}">
        <div class="w-12 h-12 rounded-xl bg-praia-teal-800/5 flex items-center justify-center group-hover:bg-praia-yellow-400/20 transition-colors duration-300">
          <i data-lucide="${s.icon}" class="w-5 h-5 text-praia-teal-700"></i>
        </div>
        <span class="text-[10px] font-display font-semibold uppercase tracking-wider text-praia-sand-500 text-center leading-tight">${s.label}</span>
      </div>`;
    }).join('');

  const badges = [];
  if (beach.services.blueFlag) badges.push('<span class="badge badge-blue-flag"><i data-lucide="flag" class="w-3 h-3"></i> Bandeira Azul</span>');
  if (beach.services.goldQuality) badges.push('<span class="badge badge-gold"><i data-lucide="sparkles" class="w-3 h-3"></i> Qualidade Ouro</span>');
  if (beach.services.accessible) badges.push('<span class="badge badge-accessible"><i data-lucide="accessibility" class="w-3 h-3"></i> Acessível</span>');

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
  const carouselSlides = beach.photos.map((p, i) => `
    <div class="carousel-slide absolute inset-0 transition-opacity duration-500 ease-in-out ${i === 0 ? 'opacity-100' : 'opacity-0'}">
      <img src="${p}" alt="${beach.name} - foto ${i + 1}" class="w-full h-full object-cover" loading="${i === 0 ? 'eager' : 'lazy'}">
    </div>
  `).join('');

  const carouselControls = photoCount > 1 ? `
    <button id="carousel-prev" class="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/35 hover:bg-black/55 backdrop-blur-sm flex items-center justify-center text-white transition-all duration-200 active:scale-95" aria-label="Foto anterior">
      <i data-lucide="chevron-left" class="w-5 h-5"></i>
    </button>
    <button id="carousel-next" class="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/35 hover:bg-black/55 backdrop-blur-sm flex items-center justify-center text-white transition-all duration-200 active:scale-95" aria-label="Próxima foto">
      <i data-lucide="chevron-right" class="w-5 h-5"></i>
    </button>
    <div class="absolute bottom-20 md:bottom-24 left-0 right-0 flex justify-center gap-1.5 z-20 pointer-events-none">
      ${beach.photos.map((_, i) => `<button class="carousel-dot pointer-events-auto rounded-full transition-all duration-300 ${i === 0 ? 'bg-white h-1.5 w-4' : 'bg-white/40 h-1.5 w-1.5'}" data-index="${i}" aria-label="Foto ${i + 1}"></button>`).join('')}
    </div>
  ` : '';

  const locationLine = beach.freguesia
    ? `${beach.municipality}, ${beach.freguesia} · ${beach.river}`
    : `${beach.municipality}, ${beach.district} · ${beach.river}`;

  mainContent.innerHTML = `
    <!-- Hero Carousel -->
    <div class="relative" id="hero-carousel">
      <div class="relative overflow-hidden h-72 md:h-96 lg:h-[500px]">
        ${carouselSlides}
      </div>
      ${carouselControls}
      <div class="absolute inset-0 bg-gradient-to-t from-praia-teal-800/80 via-transparent to-transparent pointer-events-none z-10"></div>
      <div class="absolute bottom-0 left-0 right-0 p-6 md:p-10 z-20">
        <div class="flex flex-wrap gap-2 mb-3">${badges.join('')}</div>
        <h1 data-content-bind="beaches:${beachIdx}.name" class="font-display text-2xl md:text-4xl lg:text-5xl font-bold text-white tracking-tightest mb-2">${beach.name}</h1>
        <p class="text-white/60 font-body text-sm md:text-base"><span data-content-bind="beaches:${beachIdx}.municipality">${beach.municipality}</span>${beach.freguesia ? `, <span data-content-bind="beaches:${beachIdx}.freguesia">${beach.freguesia}</span>` : `, <span data-content-bind="beaches:${beachIdx}.district">${beach.district}</span>`} · <span data-content-bind="beaches:${beachIdx}.river">${beach.river}</span></p>
      </div>
    </div>

    <div class="max-w-5xl mx-auto px-6 py-10 md:py-16">
      <!-- Services -->
      <section class="mb-12">
        <h2 class="font-display text-xs uppercase tracking-[0.2em] text-praia-teal-500 font-semibold mb-5">Serviços e Infraestruturas</h2>
        <div class="grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));">${servicesHtml}</div>
      </section>

      <!-- Description -->
      <section class="mb-12">
        <h2 class="font-display text-xs uppercase tracking-[0.2em] text-praia-teal-500 font-semibold mb-4">Sobre esta Praia</h2>
        <p data-content-bind="beaches:${beachIdx}.description" class="text-praia-sand-700 leading-relaxed-plus text-base md:text-lg">${beach.description}</p>
      </section>

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

      <!-- Vote -->
      <section class="mb-12 bg-praia-teal-800 rounded-2xl p-8 md:p-10 text-center noise-overlay relative overflow-hidden" id="beach-vote-section">
        <div class="relative z-10">
          <i data-lucide="trophy" class="w-10 h-10 text-praia-yellow-400 mx-auto mb-4"></i>
          <h2 class="font-display text-xl md:text-2xl font-bold text-white mb-3">Vote nesta praia fluvial para Praia do Ano 2026</h2>
          <p class="text-white/50 text-sm mb-6">Ajude ${beach.name} a ganhar o galardão Praia Fluvial do Ano!</p>
          <button onclick="openVoteModal('${beach.id}', '${beach.name.replace(/'/g, "\\'")}')" class="btn-primary inline-flex items-center gap-2 bg-praia-yellow-400 text-praia-teal-800 font-display font-bold text-sm uppercase tracking-wider px-8 py-4 rounded-full shadow-layered-yellow">
            <i data-lucide="vote" class="w-5 h-5"></i> Votar Agora
          </button>
        </div>
      </section>

      <!-- Share -->
      <section class="mb-12">
        <h2 class="font-display text-xs uppercase tracking-[0.2em] text-praia-teal-500 font-semibold mb-5">Partilhar</h2>
        <div class="flex flex-wrap gap-3">
          <button onclick="shareBeach()" class="btn-primary inline-flex items-center gap-2 bg-praia-sand-100 text-praia-teal-700 font-display font-bold text-xs uppercase tracking-wider px-5 py-2.5 rounded-full border border-praia-sand-200">
            <i data-lucide="share-2" class="w-4 h-4"></i> Partilhar
          </button>
          <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}" target="_blank" rel="noopener" class="btn-primary inline-flex items-center gap-2 font-display font-bold text-xs uppercase tracking-wider px-5 py-2.5 rounded-full text-white" style="background:#1877F2;">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg> Facebook
          </a>
          <button onclick="shareInstagram()" class="btn-primary inline-flex items-center gap-2 font-display font-bold text-xs uppercase tracking-wider px-5 py-2.5 rounded-full text-white" style="background:linear-gradient(135deg,#f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%);">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg> Instagram
          </button>
        </div>
      </section>

      <!-- Community Reviews -->
      <section class="mb-12">
        <h2 class="font-display text-xs uppercase tracking-[0.2em] text-praia-teal-500 font-semibold mb-5">Comunidade</h2>
        <div id="reviews-container" class="space-y-4 mb-6">
          <div class="skeleton h-24 rounded-xl"></div>
          <div class="skeleton h-24 rounded-xl"></div>
        </div>
        <div id="review-form-area"></div>
      </section>

      <!-- Nearby Beaches -->
      <section>
        <h2 class="font-display text-xs uppercase tracking-[0.2em] text-praia-teal-500 font-semibold mb-5">Praias Próximas</h2>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-5">${nearbyHtml}</div>
      </section>
    </div>
  `;

  lucide.createIcons();
  initCarousel(photoCount);

  // ── Winner medals from settings.json ──────────────────────────────────────
  try {
    const settingsRes = await fetch('data/settings.json');
    const settings = await settingsRes.json();
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

    // Sort: highest position first (1st > 2nd > 3rd > revelação), then by year desc
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
        // Insert after services section (first section)
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

  // Load weather
  const weatherWidget = document.getElementById('weather-widget');
  if (weatherWidget) {
    const weather = await fetchWeather(beach.coordinates.lat, beach.coordinates.lng);
    renderWeatherWidget(weatherWidget, weather);
  }

  // Auth state + reviews
  const currentUser    = await AuthUtils.authGetUser();
  const currentProfile = currentUser ? await AuthUtils.profileGet(currentUser.id) : null;
  await loadReviews(beach.id, currentUser, beaches);
  renderReviewForm(beach.id, currentUser, currentProfile, beaches);

  document.title = `${beach.name} | Praias Fluviais`;

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

  return `<div class="flex items-center gap-1.5 flex-wrap mt-1.5">
    ${sorted.map(b => {
      const tier = TIER_META[b.tier] || {};
      const isMitico  = b.tier === 'mitico';
      const isDiamond = b.tier === 'diamante';

      if (isMitico) {
        // Mítico — bg pastel claro + hue-rotate cicla em tons pastéis (nunca escuro)
        return `<span class="medal-badge-legendary inline-flex items-center gap-1.5 rounded-full font-display font-bold cursor-default whitespace-nowrap"
          title="${b.name} — ${b.desc}"
          style="font-size:10px;padding:3px 9px 3px 7px;background:${tier.hex}70;color:#003A40;border:2px solid ${tier.hex};">
          <i data-lucide="${b.icon}" style="width:13px;height:13px;flex-shrink:0;color:#003A40;"></i>
          ${b.name}
        </span>`;
      }

      if (isDiamond) {
        // Diamante — ice blue claro com texto escuro, glow sutil
        return `<span class="inline-flex items-center gap-1.5 rounded-full font-display font-bold cursor-default whitespace-nowrap"
          title="${b.name} — ${b.desc}"
          style="font-size:10px;padding:3px 9px 3px 7px;background:${tier.hex}70;color:#003A40;border:2px solid ${tier.hex};box-shadow:0 0 8px ${tier.glow};">
          <i data-lucide="${b.icon}" style="width:13px;height:13px;flex-shrink:0;color:#003A40;"></i>
          ${b.name}
        </span>`;
      }

      // Bronze / Prata / Ouro — dark teal base, tier color accent (brand rule: light colors on dark bg)
      return `<span class="inline-flex items-center gap-1.5 rounded-full font-display font-bold cursor-default whitespace-nowrap"
        title="${b.name} — ${b.desc}"
        style="font-size:10px;padding:3px 9px 3px 7px;background:#003A40;color:${tier.hex};border:1.5px solid ${tier.hex}70;">
        <i data-lucide="${b.icon}" style="width:13px;height:13px;flex-shrink:0;color:${tier.hex};"></i>
        ${b.name}
      </span>`;
    }).join('')}
  </div>`;
}

// ─── Load Reviews ─────────────────────────────────────────────────────────────

async function loadReviews(beachId, currentUser, beaches) {
  const container = document.getElementById('reviews-container');
  if (!container) return;

  const allReviews = await AuthUtils.reviewsGetForBeach(beachId);

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

  // Fetch medals for all unique reviewers in parallel
  const uniqueUserIds = [...new Set(allReviews.map(r => r.user_id).filter(Boolean))];
  const medalMap = {};
  await Promise.all(uniqueUserIds.map(async uid => {
    try { medalMap[uid] = await AuthUtils.badgesGetForUser(uid, beaches); } catch { medalMap[uid] = []; }
  }));

  function reviewCardHTML(r, isReply = false) {
    // Tombstone for admin-deleted comments
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

    // Build medal display
    const medalHtml = hasMedals ? medalDisplayHTML(topMedals) : '';

    // Card border: animated rainbow for Mítico, static diamond glow for Diamante
    const miticoCardClass   = hasMitico   && !isReply ? 'mitico-card'   : '';
    const diamanteCardClass = hasDiamante && !isReply ? 'diamante-card' : '';

    const replyButtonHtml = currentUser && !isReply
      ? `<button onclick="toggleReplyForm('${r.id}', '${beachId}')"
                 class="inline-flex items-center gap-1 text-[10px] font-display font-semibold text-praia-teal-500 hover:text-praia-teal-700 transition-colors mt-2">
           <i data-lucide="corner-down-right" style="width:11px;height:11px;"></i> Responder
         </button>`
      : '';

    // Replies for this comment
    const commentReplies = replies.filter(reply => reply.parent_id === r.id);
    const repliesHtml = commentReplies.length > 0
      ? `<div class="mt-3 space-y-2 border-l-2 border-praia-sand-200 pl-4">
           ${commentReplies.map(reply => reviewCardHTML(reply, true)).join('')}
         </div>`
      : '';

    return `
      <div class="bg-white rounded-xl p-4 shadow-layered ${miticoCardClass} ${diamanteCardClass} ${isReply ? 'shadow-none border border-praia-sand-100 rounded-lg' : ''}" data-review-id="${r.id}">
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

  container.innerHTML = topLevel.map(r => reviewCardHTML(r, false)).join('');
  lucide.createIcons();

  // Inject medal CSS animations once
  if (!document.getElementById('medal-anim-style')) {
    const style = document.createElement('style');
    style.id = 'medal-anim-style';
    style.textContent = `
      /* ── Mítico badge chip — hue-rotate idêntico ao passaporte ── */
      @keyframes badgeCommentRainbow {
        from { filter: hue-rotate(0deg) brightness(1.1); }
        to   { filter: hue-rotate(360deg) brightness(1.1); }
      }
      .medal-badge-legendary {
        animation: badgeCommentRainbow 4s linear infinite;
      }

      /* ── Mítico card border — cicla pelas mesmas cores hue-rotated ── */
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

function previewReplyImages(parentId) {
  const input   = document.getElementById(`reply-images-${parentId}`);
  const preview = document.getElementById(`reply-preview-${parentId}`);
  if (!input || !preview) return;
  preview.innerHTML = '';
  Array.from(input.files).forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = document.createElement('img');
      img.src = e.target.result;
      img.className = 'w-14 h-14 object-cover rounded-lg border border-praia-sand-200 cursor-pointer';
      img.onclick = () => openImageViewer(img.src);
      preview.appendChild(img);
    };
    reader.readAsDataURL(file);
  });
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
  try { beaches = await (await fetch('data/beaches.json')).json(); } catch {}
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
    if (!preview) return;
    preview.innerHTML = '';
    Array.from(this.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = document.createElement('img');
        img.src = e.target.result;
        img.className = 'w-16 h-16 object-cover rounded-lg border border-praia-sand-200 cursor-pointer';
        img.onclick = () => openImageViewer(img.src);
        preview.appendChild(img);
      };
      reader.readAsDataURL(file);
    });
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
  try { beaches = await (await fetch('data/beaches.json')).json(); } catch {}
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
    try { beaches = await (await fetch('data/beaches.json')).json(); } catch {}
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

async function shareBeach() {
  const url = window.location.href;
  const title = document.title;

  if (navigator.share) {
    try { await navigator.share({ title, url }); return; } catch {}
  }

  // Fallback: show share menu
  const existing = document.getElementById('share-menu-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'share-menu-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);display:flex;align-items:flex-end;justify-content:center;padding:16px;';

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  overlay.innerHTML = `
    <div style="background:white;border-radius:20px 20px 16px 16px;max-width:400px;width:100%;padding:24px 20px 16px;box-shadow:0 -8px 40px rgba(0,0,0,0.2);transform:translateY(20px);opacity:0;transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1),opacity 0.2s;" id="share-menu-inner">
      <p style="font-family:'Poppins',sans-serif;font-size:14px;font-weight:700;color:#003A40;margin:0 0 16px;text-align:center;">Partilhar</p>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;">
        <a href="https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}" target="_blank" rel="noopener" style="display:flex;flex-direction:column;align-items:center;gap:6px;text-decoration:none;">
          <div style="width:48px;height:48px;border-radius:14px;background:#1877F2;display:flex;align-items:center;justify-content:center;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
          </div>
          <span style="font-family:'Poppins',sans-serif;font-size:10px;font-weight:600;color:#003A40;">Facebook</span>
        </a>
        <a href="https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}" target="_blank" rel="noopener" style="display:flex;flex-direction:column;align-items:center;gap:6px;text-decoration:none;">
          <div style="width:48px;height:48px;border-radius:14px;background:#000;display:flex;align-items:center;justify-content:center;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          </div>
          <span style="font-family:'Poppins',sans-serif;font-size:10px;font-weight:600;color:#003A40;">X</span>
        </a>
        <a href="https://wa.me/?text=${encodedTitle}%20${encodedUrl}" target="_blank" rel="noopener" style="display:flex;flex-direction:column;align-items:center;gap:6px;text-decoration:none;">
          <div style="width:48px;height:48px;border-radius:14px;background:#25D366;display:flex;align-items:center;justify-content:center;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          </div>
          <span style="font-family:'Poppins',sans-serif;font-size:10px;font-weight:600;color:#003A40;">WhatsApp</span>
        </a>
        <button onclick="copyShareLink()" style="display:flex;flex-direction:column;align-items:center;gap:6px;background:none;border:none;cursor:pointer;padding:0;">
          <div style="width:48px;height:48px;border-radius:14px;background:#003A40;display:flex;align-items:center;justify-content:center;">
            <i data-lucide="link" style="width:20px;height:20px;color:#FFEB3B;"></i>
          </div>
          <span style="font-family:'Poppins',sans-serif;font-size:10px;font-weight:600;color:#003A40;">Copiar Link</span>
        </button>
      </div>
      <button onclick="document.getElementById('share-menu-overlay').remove()" style="width:100%;padding:12px;border:none;background:#f5f3ef;border-radius:12px;font-family:'Poppins',sans-serif;font-size:13px;font-weight:600;color:#003A40;cursor:pointer;">Cancelar</button>
    </div>`;

  document.body.appendChild(overlay);
  lucide.createIcons();
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  requestAnimationFrame(() => {
    const inner = document.getElementById('share-menu-inner');
    if (inner) { inner.style.transform = 'translateY(0)'; inner.style.opacity = '1'; }
  });
}

async function copyShareLink() {
  try {
    await navigator.clipboard.writeText(window.location.href);
  } catch {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = window.location.href;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  document.getElementById('share-menu-overlay')?.remove();
  showToast('Link copiado!');
}

async function shareInstagram() {
  try {
    await navigator.clipboard.writeText(window.location.href);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = window.location.href;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  showToast('Link copiado! Cole-o numa publicação ou story do Instagram.');
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
