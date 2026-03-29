// ─── Individual Beach Page ───
document.addEventListener('DOMContentLoaded', async () => {
  const beachId = new URLSearchParams(window.location.search).get('id');
  const mainContent = document.getElementById('beach-content');
  if (!beachId || !mainContent) return;

  // Show skeleton
  mainContent.innerHTML = `<div class="max-w-5xl mx-auto px-6 py-20"><div class="skeleton h-72 w-full mb-6"></div><div class="skeleton h-8 w-2/3 mb-4"></div><div class="skeleton h-4 w-1/2 mb-8"></div><div class="skeleton h-32 w-full"></div></div>`;

  let beaches = [];
  try {
    const res = await fetch('data/beaches.json');
    beaches = await res.json();
  } catch {
    mainContent.innerHTML = '<div class="text-center py-20"><p class="text-praia-sand-500">Erro ao carregar dados.</p></div>';
    return;
  }

  const beach = beaches.find(b => b.id === beachId);
  if (!beach) {
    mainContent.innerHTML = '<div class="text-center py-20"><h2 class="font-display text-2xl font-bold text-praia-teal-800 mb-4">Praia não encontrada</h2><a href="mapa.html" class="btn-primary inline-flex items-center gap-2 bg-praia-teal-800 text-praia-yellow-400 px-6 py-3 rounded-full font-display font-bold text-sm uppercase tracking-wider">Ver Mapa</a></div>';
    return;
  }

  const mapsUrl = `https://www.google.com/maps?q=${beach.coordinates.lat},${beach.coordinates.lng}`;
  const wazeUrl = `https://waze.com/ul?ll=${beach.coordinates.lat},${beach.coordinates.lng}&navigate=yes`;

  const serviceIcons = {
    bar: { icon: 'coffee', label: 'Bar' },
    grills: { icon: 'flame', label: 'Grelhadores' },
    lifeguard: { icon: 'life-buoy', label: 'Nadador-salvador' },
    blueFlag: { icon: 'flag', label: 'Bandeira Azul' },
    goldQuality: { icon: 'award', label: 'Qualidade Ouro' },
    accessible: { icon: 'accessibility', label: 'Acessível' },
    parking: { icon: 'car', label: 'Estacionamento' },
    wc: { icon: 'bath', label: 'WC' },
    picnicArea: { icon: 'trees', label: 'Piquenique' },
    camping: { icon: 'tent', label: 'Campismo' },
  };

  const servicesHtml = Object.entries(beach.services)
    .filter(([, v]) => v)
    .map(([k]) => {
      const s = serviceIcons[k];
      return `<div class="flex flex-col items-center gap-1.5 group" title="${s.label}">
        <div class="w-12 h-12 rounded-xl bg-praia-teal-800/5 flex items-center justify-center group-hover:bg-praia-yellow-400/20 transition-colors duration-300">
          <i data-lucide="${s.icon}" class="w-5 h-5 text-praia-teal-700"></i>
        </div>
        <span class="text-[10px] font-display font-semibold uppercase tracking-wider text-praia-sand-500">${s.label}</span>
      </div>`;
    }).join('');

  const badges = [];
  if (beach.services.blueFlag) badges.push('<span class="badge badge-blue-flag"><i data-lucide="flag" class="w-3 h-3"></i> Bandeira Azul</span>');
  if (beach.services.goldQuality) badges.push('<span class="badge badge-gold"><i data-lucide="sparkles" class="w-3 h-3"></i> Qualidade Ouro</span>');
  if (beach.services.accessible) badges.push('<span class="badge badge-accessible"><i data-lucide="accessibility" class="w-3 h-3"></i> Acessível</span>');

  // Find nearby beaches
  const nearby = beaches
    .filter(b => b.id !== beach.id)
    .map(b => ({ ...b, _dist: haversineDistance(beach.coordinates.lat, beach.coordinates.lng, b.coordinates.lat, b.coordinates.lng) }))
    .sort((a, b) => a._dist - b._dist)
    .slice(0, 3);

  const nearbyHtml = nearby.map(b => `
    <a href="praia.html?id=${b.id}" class="card-interactive rounded-xl overflow-hidden bg-white shadow-layered group">
      <div class="relative h-36 overflow-hidden">
        <img src="${b.photos[0]}" alt="${b.name}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" loading="lazy">
        <div class="absolute inset-0 bg-gradient-to-t from-praia-teal-800/60 via-transparent to-transparent"></div>
      </div>
      <div class="p-4">
        <h4 class="font-display text-sm font-bold text-praia-teal-800 leading-snug">${b.name}</h4>
        <p class="text-xs text-praia-sand-500 mt-1">${b.municipality} · ${formatDistance(b._dist)}</p>
      </div>
    </a>
  `).join('');

  mainContent.innerHTML = `
    <!-- Hero Gallery -->
    <div class="relative">
      <div class="flex overflow-x-auto snap-x snap-mandatory" style="scroll-snap-type:x mandatory;scrollbar-width:none;">
        ${beach.photos.map((p, i) => `
          <div class="flex-shrink-0 w-full snap-center relative" style="scroll-snap-align:center;">
            <img src="${p}" alt="${beach.name} - foto ${i + 1}" class="w-full h-72 md:h-96 lg:h-[500px] object-cover" loading="lazy">
          </div>
        `).join('')}
      </div>
      <div class="absolute inset-0 bg-gradient-to-t from-praia-teal-800/80 via-transparent to-transparent pointer-events-none"></div>
      <div class="absolute bottom-0 left-0 right-0 p-6 md:p-10 z-10">
        <div class="flex flex-wrap gap-2 mb-3">${badges.join('')}</div>
        <h1 class="font-display text-2xl md:text-4xl lg:text-5xl font-bold text-white tracking-tightest mb-2">${beach.name}</h1>
        <p class="text-white/60 font-body text-sm md:text-base">${beach.municipality}, ${beach.district} · ${beach.river}</p>
      </div>
    </div>

    <div class="max-w-5xl mx-auto px-6 py-10 md:py-16">
      <!-- Services -->
      <section class="mb-12">
        <h2 class="font-display text-xs uppercase tracking-[0.2em] text-praia-teal-500 font-semibold mb-5">Serviços e Infraestruturas</h2>
        <div class="flex flex-wrap gap-4 md:gap-6">${servicesHtml}</div>
      </section>

      <!-- Description -->
      <section class="mb-12">
        <h2 class="font-display text-xs uppercase tracking-[0.2em] text-praia-teal-500 font-semibold mb-4">Sobre esta Praia</h2>
        <p class="text-praia-sand-700 leading-relaxed-plus text-base md:text-lg">${beach.description}</p>
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
      <section class="mb-12 bg-praia-teal-800 rounded-2xl p-8 md:p-10 text-center noise-overlay relative overflow-hidden">
        <div class="relative z-10">
          <i data-lucide="trophy" class="w-10 h-10 text-praia-yellow-400 mx-auto mb-4"></i>
          <h2 class="font-display text-xl md:text-2xl font-bold text-white mb-3">Vote nesta praia para Praia do Ano 2026</h2>
          <p class="text-white/50 text-sm mb-6">Ajude ${beach.name} a ganhar o galardão Praia Fluvial do Ano!</p>
          <a href="votar.html?preselect=${beach.id}" class="btn-primary inline-flex items-center gap-2 bg-praia-yellow-400 text-praia-teal-800 font-display font-bold text-sm uppercase tracking-wider px-8 py-4 rounded-full shadow-layered-yellow">
            <i data-lucide="vote" class="w-5 h-5"></i> Votar Agora
          </a>
        </div>
      </section>

      <!-- Share -->
      <section class="mb-12">
        <h2 class="font-display text-xs uppercase tracking-[0.2em] text-praia-teal-500 font-semibold mb-5">Partilhar</h2>
        <div class="flex gap-3">
          <button onclick="shareBeach()" class="btn-primary inline-flex items-center gap-2 bg-praia-sand-100 text-praia-teal-700 font-display font-bold text-xs uppercase tracking-wider px-5 py-2.5 rounded-full border border-praia-sand-200">
            <i data-lucide="share-2" class="w-4 h-4"></i> Partilhar
          </button>
          <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}" target="_blank" class="btn-primary w-10 h-10 rounded-full bg-praia-sand-100 border border-praia-sand-200 flex items-center justify-center text-praia-teal-700">
            <i data-lucide="facebook" class="w-4 h-4"></i>
          </a>
        </div>
      </section>

      <!-- Community Reviews -->
      <section class="mb-12">
        <h2 class="font-display text-xs uppercase tracking-[0.2em] text-praia-teal-500 font-semibold mb-5">Comunidade</h2>
        <div id="reviews-container" class="space-y-4 mb-6"></div>
        <div class="bg-praia-sand-50 rounded-xl p-5 border border-praia-sand-200">
          <h3 class="font-display text-sm font-bold text-praia-teal-800 mb-3">Deixe o seu comentário</h3>
          <textarea id="review-text" rows="3" placeholder="Partilhe a sua experiência..." class="w-full p-3 rounded-lg bg-white border border-praia-sand-200 text-sm resize-none focus:outline-none focus:border-praia-teal-400 mb-3"></textarea>
          <button onclick="submitReview('${beach.id}')" class="btn-primary bg-praia-teal-800 text-praia-yellow-400 font-display font-bold text-xs uppercase tracking-wider px-5 py-2.5 rounded-full">
            Publicar
          </button>
        </div>
      </section>

      <!-- Nearby Beaches -->
      <section>
        <h2 class="font-display text-xs uppercase tracking-[0.2em] text-praia-teal-500 font-semibold mb-5">Praias Próximas</h2>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-5">${nearbyHtml}</div>
      </section>
    </div>
  `;

  // Initialize icons
  lucide.createIcons();

  // Load weather
  const weatherWidget = document.getElementById('weather-widget');
  if (weatherWidget) {
    const weather = await fetchWeather(beach.coordinates.lat, beach.coordinates.lng);
    renderWeatherWidget(weatherWidget, weather);
  }

  // Load reviews from localStorage
  loadReviews(beach.id);

  // Update page title
  document.title = `${beach.name} | Praias Fluviais`;

  // Inject JSON-LD structured data
  const jsonLd = document.createElement('script');
  jsonLd.type = 'application/ld+json';
  jsonLd.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Beach",
    "name": beach.name,
    "description": beach.description,
    "address": {
      "@type": "PostalAddress",
      "addressLocality": beach.municipality,
      "addressRegion": beach.district,
      "addressCountry": "PT"
    },
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": beach.coordinates.lat,
      "longitude": beach.coordinates.lng
    },
    "image": beach.photos[0],
    "isAccessibleForFree": true,
    "publicAccess": true
  });
  document.head.appendChild(jsonLd);

  // Update OG meta dynamically
  const setMeta = (prop, content) => {
    let el = document.querySelector(`meta[property="${prop}"]`);
    if (el) el.setAttribute('content', content);
  };
  setMeta('og:title', `${beach.name} | Praias Fluviais`);
  setMeta('og:description', beach.description);
});

function loadReviews(beachId) {
  const container = document.getElementById('reviews-container');
  if (!container) return;
  const reviews = JSON.parse(localStorage.getItem(`reviews_${beachId}`) || '[]');

  // Add some seed reviews if none exist
  const displayReviews = reviews.length > 0 ? reviews : [
    { text: 'Água cristalina e ambiente muito tranquilo. Recomendo!', date: '2026-03-15', author: 'Visitante' },
    { text: 'Fomos lá com a família no verão passado. As crianças adoraram!', date: '2025-08-20', author: 'Maria S.' },
  ];

  container.innerHTML = displayReviews.map(r => `
    <div class="bg-white rounded-xl p-4 shadow-layered">
      <div class="flex items-center gap-2 mb-2">
        <div class="w-8 h-8 rounded-full bg-praia-teal-800/10 flex items-center justify-center">
          <i data-lucide="user" class="w-4 h-4 text-praia-teal-600"></i>
        </div>
        <div>
          <span class="font-display text-xs font-semibold text-praia-teal-800">${r.author || 'Visitante'}</span>
          <span class="text-xs text-praia-sand-400 ml-2">${r.date}</span>
        </div>
      </div>
      <p class="text-sm text-praia-sand-700 leading-relaxed">${r.text}</p>
    </div>
  `).join('');

  lucide.createIcons();
}

function submitReview(beachId) {
  const textarea = document.getElementById('review-text');
  const text = textarea?.value?.trim();
  if (!text) return;

  const reviews = JSON.parse(localStorage.getItem(`reviews_${beachId}`) || '[]');
  reviews.unshift({
    text,
    date: new Date().toISOString().split('T')[0],
    author: 'Visitante',
  });
  localStorage.setItem(`reviews_${beachId}`, JSON.stringify(reviews));
  textarea.value = '';
  loadReviews(beachId);
}

async function shareBeach() {
  if (navigator.share) {
    try {
      await navigator.share({ title: document.title, url: window.location.href });
    } catch {}
  } else {
    await navigator.clipboard.writeText(window.location.href);
    alert('Link copiado!');
  }
}
