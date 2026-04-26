// ─── Voting System ─────────────────────────────────────────────────────────────
// Votes stored in Supabase. Requires user account. One vote per user per year.
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const grid         = document.getElementById('voting-grid');
  const searchInput  = document.getElementById('vote-search');
  const districtSel  = document.getElementById('vote-district');
  const sortSel      = document.getElementById('vote-sort');
  const nearMeBtn    = document.getElementById('vote-near-me');
  const countEl      = document.getElementById('vote-count');
  if (!grid) return;

  // ── Countdown arranca imediatamente com valor por defeito ───────────────────
  initCountdown('2026-10-31T23:59:59');

  const { authGetUser, profileGet, voteGet, voteSubmit, celebrateBadge,
          badgesCompute, stampsGetAll, reviewsGetForUser, ALL_BADGES } = AuthUtils;

  // ── 1) Load beaches + settings (no auth needed) ───────────────────────────
  // Auth runs in parallel but we don't wait for it to render
  const beachesPromise = (window._beachesPrefetch || getBeaches()).then(d => d.length ? d : null);
  const settingsPromise = loadData('settings').then(d => d || {});
  const authPromise = authGetUser().catch(() => null);

  const [beachesRaw, settingsRaw] = await Promise.all([beachesPromise, settingsPromise]);

  if (!beachesRaw) {
    grid.innerHTML = '<p class="col-span-full text-center text-praia-sand-500 py-10">Erro ao carregar praias.</p>';
    return;
  }

  let beaches = beachesRaw.filter(b => !b.hidden);
  let settings = settingsRaw || {};
  let userVote = null;

  if (settings.votingDeadline && settings.votingDeadline !== '2026-10-31T23:59:59') {
    initCountdown(settings.votingDeadline);
  }

  // Populate district filter
  if (districtSel) {
    const districts = [...new Set(beaches.map(b => b.district).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'));
    districts.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d; opt.textContent = d;
      districtSel.appendChild(opt);
    });
  }

  // Check preselect param
  const preselect = new URLSearchParams(window.location.search).get('preselect');

  let currentBeaches = [...beaches];
  let sortMode = 'az-concelho';

  function applySort(list) {
    if (sortMode === 'az-nome')     return [...list].sort((a, b) => a.name.localeCompare(b.name, 'pt'));
    if (sortMode === 'az-concelho') return [...list].sort((a, b) => a.municipality.localeCompare(b.municipality, 'pt'));
    if (sortMode === 'distance')    return list; // already sorted by distance
    return list;
  }

  function renderCards(list) {
    const sorted = applySort(list);
    if (sorted.length === 0) {
      grid.innerHTML = '<p class="col-span-full text-center text-praia-sand-500 py-10">Nenhuma praia encontrada.</p>';
      if (countEl) countEl.textContent = '0 praias';
      return;
    }

    grid.innerHTML = sorted.map(b => {
      const isVoted  = userVote === b.id;
      const badgesHtml = [];
      if (b.services?.blueFlag)  badgesHtml.push('<span class="badge badge-blue-flag text-[10px]">Bandeira Azul</span>');
      if (b.services?.accessible) badgesHtml.push('<span class="badge badge-accessible text-[10px]">Acessibilidades</span>');

      return `
        <div class="card-interactive rounded-2xl overflow-hidden bg-white shadow-layered group flex flex-col h-full ${isVoted ? 'ring-2 ring-praia-yellow-400' : ''}">
          <a href="praia.html?id=${b.id}" class="block relative h-44 overflow-hidden shrink-0" aria-label="Ver página de ${b.name}">
            <img src="${b.thumbnail || b.photos?.[0] || ''}" alt="${b.name}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" loading="lazy">
            <div class="absolute inset-0 bg-gradient-to-t from-praia-teal-800/60 via-transparent to-transparent"></div>
            ${badgesHtml.length ? `<div class="absolute top-3 left-3 flex gap-1.5">${badgesHtml.join('')}</div>` : ''}
            ${isVoted ? '<div class="absolute top-3 right-3 bg-praia-yellow-400 text-praia-teal-800 rounded-full p-1.5"><i data-lucide="check" class="w-4 h-4"></i></div>' : ''}
          </a>
          <div class="p-4 flex flex-col flex-1">
            <a href="praia.html?id=${b.id}" class="block hover:text-praia-teal-600 transition-colors duration-300">
              <h3 class="font-display text-base font-bold text-praia-teal-800 leading-snug mb-1">${b.name}</h3>
            </a>
            <p class="text-xs text-praia-sand-500 mb-4 flex-1">${b.municipality} · ${b.river}</p>
            ${isVoted
              ? '<div class="text-center py-2 bg-praia-yellow-400/10 rounded-lg mt-auto"><span class="font-display text-xs font-bold text-praia-yellow-700 uppercase tracking-wider">O Seu Voto ✓</span></div>'
              : userVote
                ? '<div class="text-center py-2 bg-praia-sand-100 rounded-lg mt-auto"><span class="font-display text-xs text-praia-sand-400 uppercase tracking-wider">Já votou</span></div>'
                : `<button onclick="openVoteModal('${b.id}', '${b.name.replace(/'/g, "\\'")}')"
                          class="btn-primary w-full flex items-center justify-center gap-2 bg-praia-teal-800 text-praia-yellow-400
                                 font-display text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded-xl mt-auto">
                    <i data-lucide="heart" class="w-4 h-4"></i> Votar
                  </button>`
            }
          </div>
        </div>`;
    }).join('');

    if (countEl) countEl.textContent = `${sorted.length} praias`;
    lucide.createIcons();
  }

  const _norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  function filterBeaches() {
    const search   = _norm(searchInput?.value || '');
    const district = districtSel?.value || '';
    currentBeaches = beaches.filter(b => {
      if (search && !_norm(b.name).includes(search) && !_norm(b.municipality || '').includes(search)) return false;
      if (district && b.district !== district) return false;
      return true;
    });
    renderCards(currentBeaches);
  }

  searchInput?.addEventListener('input', filterBeaches);
  districtSel?.addEventListener('change', filterBeaches);
  sortSel?.addEventListener('change', () => { sortMode = sortSel.value; renderCards(currentBeaches); });

  nearMeBtn?.addEventListener('click', async () => {
    nearMeBtn.disabled = true;
    nearMeBtn.textContent = 'A localizar…';
    try {
      const pos = await getUserLocation();
      currentBeaches = sortByDistance(currentBeaches, pos.lat, pos.lng);
      sortMode = 'distance';
      if (sortSel) sortSel.value = 'distance';
      renderCards(currentBeaches);
    } catch (err) {
      alert(err.message);
    } finally {
      nearMeBtn.disabled = false;
      nearMeBtn.innerHTML = '<i data-lucide="navigation" class="w-4 h-4"></i> Perto de Mim';
      lucide.createIcons();
    }
  });

  // ── 2) Render grid IMMEDIATELY (all beaches with vote buttons) ──────────────
  renderCards(beaches);

  // ── 3) Resolve auth in background, then update vote state if needed ────────
  const currentYear = new Date().getFullYear();
  const user = await authPromise;
  if (user) {
    userVote = await voteGet(user.id, currentYear);
    if (userVote) {
      // Re-render to show "O Seu Voto" / "Já votou" states
      renderCards(currentBeaches.length === beaches.length ? beaches : currentBeaches);
    }
  }

  // Preselect (after auth resolved)
  if (preselect && !userVote) {
    const beach = beaches.find(b => b.id === preselect);
    if (beach) setTimeout(() => openVoteModal(beach.id, beach.name), 500);
  }
});

// ─── Countdown Timer ──────────────────────────────────────────────────────────
let _countdownInterval = null;
function initCountdown(deadline) {
  if (_countdownInterval) { clearInterval(_countdownInterval); _countdownInterval = null; }

  const els = {
    days:    document.getElementById('cd-days'),
    hours:   document.getElementById('cd-hours'),
    minutes: document.getElementById('cd-minutes'),
    seconds: document.getElementById('cd-seconds'),
  };

  function update() {
    const diff = new Date(deadline) - new Date();
    if (diff <= 0) { Object.values(els).forEach(el => { if (el) el.textContent = '00'; }); return; }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    if (els.days)    els.days.textContent    = String(d).padStart(2, '0');
    if (els.hours)   els.hours.textContent   = String(h).padStart(2, '0');
    if (els.minutes) els.minutes.textContent = String(m).padStart(2, '0');
    if (els.seconds) els.seconds.textContent = String(s).padStart(2, '0');
  }
  update();
  _countdownInterval = setInterval(update, 1000);
}

// ─── Vote Modal ───────────────────────────────────────────────────────────────
async function openVoteModal(beachId, beachName) {
  const existing = document.getElementById('vote-modal');
  if (existing) existing.remove();

  // Check auth first
  const user = await AuthUtils.authGetUser();
  if (!user) {
    showVoteAuthPrompt(beachId, beachName);
    return;
  }

  // Check if already voted
  const existingVote = await AuthUtils.voteGet(user.id, new Date().getFullYear());
  if (existingVote) {
    alert('Já votou este ano. Cada utilizador pode votar apenas uma vez por ano.');
    return;
  }

  const modal = document.createElement('div');
  modal.id = 'vote-modal';
  modal.className = 'fixed inset-0 z-[2000] flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick="closeVoteModal()"></div>
    <div class="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 transform scale-95 opacity-0"
         style="transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease;" id="vote-modal-inner">
      <button onclick="closeVoteModal()" class="absolute top-4 right-4 text-praia-sand-400 hover:text-praia-sand-600 p-1">
        <i data-lucide="x" class="w-5 h-5"></i>
      </button>
      <div class="text-center mb-5">
        <div class="w-14 h-14 bg-praia-yellow-400/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <i data-lucide="heart" class="w-7 h-7 text-praia-yellow-600"></i>
        </div>
        <h3 class="font-display text-xl font-bold text-praia-teal-800 mb-1">Confirme o seu voto</h3>
        <p class="text-praia-sand-500 text-sm">${beachName}</p>
        <p class="text-praia-sand-400 text-xs mt-2">O voto é permanente e não pode ser alterado.</p>
      </div>

      <!-- Privacy choice -->
      <div class="mb-5 p-4 rounded-xl bg-praia-sand-50 border border-praia-sand-200">
        <p class="text-[11px] font-display font-semibold uppercase tracking-wider text-praia-sand-500 mb-3">Privacidade do voto</p>
        <div class="flex gap-2">
          <button id="privacy-public" onclick="setVotePrivacy(true)"
                  class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-display font-bold uppercase tracking-wider border-2 transition-all duration-200 bg-praia-teal-800 border-praia-teal-800 text-praia-yellow-400">
            <i data-lucide="globe" class="w-3.5 h-3.5"></i> Público
          </button>
          <button id="privacy-private" onclick="setVotePrivacy(false)"
                  class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-display font-bold uppercase tracking-wider border-2 transition-all duration-200 bg-white border-praia-sand-200 text-praia-sand-500 hover:border-praia-sand-400">
            <i data-lucide="lock" class="w-3.5 h-3.5"></i> Privado
          </button>
        </div>
        <p id="privacy-desc" class="text-[10px] text-praia-sand-400 mt-2">O seu voto será visível no seu perfil público.</p>
      </div>

      <button onclick="confirmVote('${beachId}', '${beachName.replace(/'/g, "\\'")}')"
              id="vote-confirm-btn"
              class="btn-primary w-full bg-praia-yellow-400 text-praia-teal-800 font-display font-bold text-sm uppercase tracking-wider py-3.5 rounded-xl shadow-layered-yellow">
        Confirmar Voto Definitivo
      </button>
      <p class="text-center text-xs text-praia-sand-400 mt-3">Esta ação não pode ser desfeita</p>
    </div>`;

  document.body.appendChild(modal);
  lucide.createIcons();
  requestAnimationFrame(() => {
    const inner = document.getElementById('vote-modal-inner');
    if (inner) { inner.style.transform = 'scale(1)'; inner.style.opacity = '1'; }
  });
}

function closeVoteModal() {
  document.getElementById('vote-modal')?.remove();
}

// Track privacy preference for vote modal
let _voteIsPublic = true;

function setVotePrivacy(isPublic) {
  _voteIsPublic = isPublic;
  const pubBtn  = document.getElementById('privacy-public');
  const privBtn = document.getElementById('privacy-private');
  const desc    = document.getElementById('privacy-desc');
  if (!pubBtn || !privBtn) return;

  const onStyle  = 'bg-praia-teal-800 border-praia-teal-800 text-praia-yellow-400';
  const offStyle = 'bg-white border-praia-sand-200 text-praia-sand-500 hover:border-praia-sand-400';

  if (isPublic) {
    pubBtn.className  = pubBtn.className.replace(offStyle, onStyle);
    privBtn.className = privBtn.className.replace(onStyle, offStyle);
    if (desc) desc.textContent = 'O seu voto será visível no seu perfil público.';
  } else {
    pubBtn.className  = pubBtn.className.replace(onStyle, offStyle);
    privBtn.className = privBtn.className.replace(offStyle, onStyle);
    if (desc) desc.textContent = 'O seu voto ficará oculto para outros utilizadores.';
  }
}

async function confirmVote(beachId, beachName) {
  const btn = document.getElementById('vote-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'A registar…'; }

  try {
    const user = await AuthUtils.authGetUser();
    if (!user) { closeVoteModal(); showVoteAuthPrompt(beachId, beachName); return; }

    const year = new Date().getFullYear();
    const ok   = await AuthUtils.voteSubmit(user.id, beachId, year, _voteIsPublic);

    if (!ok) {
      if (btn) { btn.disabled = false; btn.textContent = 'Confirmar Voto Definitivo'; }
      alert('Erro ao registar o voto. Pode já ter votado este ano.');
      return;
    }

    // Check if "Eleitor" badge was just earned + get beach details for share
    let voteBeachMunicipality = '';
    let voteBeachPhoto = '';
    try {
      const beaches = (await loadData('beaches')) || [];
      const vb = beaches.find(b => b.id === beachId);
      if (vb) {
        voteBeachMunicipality = vb.municipality || '';
        voteBeachPhoto = vb.thumbnail || (vb.photos && vb.photos[0]) || '';
      }
      const stamps  = await AuthUtils.stampsGetAll(user.id);
      const reviews = await AuthUtils.reviewsGetForUser(user.id);
      const badges  = AuthUtils.badgesCompute({ stamps, reviews, voted: true, beaches });
      const eleitor = badges.find(b => b.id === 'eleitor' && b.earned);
      if (eleitor) setTimeout(() => AuthUtils.celebrateBadge(eleitor), 2000);
    } catch {}

    // Store for shareVote
    window._lastVoteShare = { municipality: voteBeachMunicipality, photo: voteBeachPhoto };

    // Show success
    const inner = document.getElementById('vote-modal-inner');
    if (inner) {
      inner.innerHTML = `
        <div class="text-center py-4">
          <div class="w-16 h-16 bg-praia-green-400/10 rounded-full flex items-center justify-center mx-auto mb-5">
            <i data-lucide="check-circle" class="w-8 h-8 text-praia-green-500"></i>
          </div>
          <h3 class="font-display text-xl font-bold text-praia-teal-800 mb-2">Obrigado pelo seu voto!</h3>
          <p class="text-praia-sand-500 text-sm mb-6">Votou em <strong>${beachName}</strong></p>
          <div class="flex gap-2 justify-center mb-6">
            <button onclick="shareVote('${beachName}','${beachId}')" class="btn-primary inline-flex items-center gap-2 bg-praia-teal-800 text-white font-display text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-full">
              <i data-lucide="share-2" class="w-4 h-4"></i> Partilhar
            </button>
          </div>
          <button onclick="closeVoteModal(); location.reload();" class="text-praia-sand-500 text-sm hover:text-praia-teal-700 transition-colors duration-300">Fechar</button>
        </div>`;
      lucide.createIcons();
    }
  } catch (err) {
    console.error('[confirmVote]', err);
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar Voto Definitivo'; }
    alert('Erro de ligação. Verifique a sua internet e tente novamente.');
  }
}

function showVoteAuthPrompt(beachId, beachName) {
  // Determine redirect: if on beach page, redirect back here; else to votar.html
  const isBeachPage = window.location.pathname.includes('praia.html');
  const redirectUrl = isBeachPage
    ? encodeURIComponent(window.location.href)
    : `votar.html%3Fpreselect%3D${beachId}`;

  const el = document.createElement('div');
  el.id = 'vote-auth-prompt';
  el.className = 'fixed inset-0 z-[2000] flex items-center justify-center p-4';
  el.style.cssText = 'background:rgba(0,0,0,0.65);backdrop-filter:blur(6px);';
  el.innerHTML = `
    <div class="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center">
      <button onclick="document.getElementById('vote-auth-prompt').remove()" class="absolute top-4 right-4 text-praia-sand-400 hover:text-praia-sand-600 p-1">
        <i data-lucide="x" class="w-5 h-5"></i>
      </button>
      <div class="w-14 h-14 bg-praia-teal-800/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <i data-lucide="vote" class="w-7 h-7 text-praia-teal-700"></i>
      </div>
      <h3 class="font-display text-xl font-bold text-praia-teal-800 mb-2">Conta necessária para votar</h3>
      <p class="text-praia-sand-500 text-sm mb-6">Crie uma conta gratuita para votar em <strong>${beachName}</strong>.</p>
      <div class="flex flex-col gap-2">
        <a href="auth.html?redirect=${redirectUrl}"
           class="btn-primary block w-full bg-praia-yellow-400 text-praia-teal-800 font-display font-bold text-sm uppercase tracking-wider py-3 rounded-xl shadow-layered-yellow">
          Criar Conta e Votar
        </a>
        <a href="auth.html?tab=login&redirect=${redirectUrl}"
           class="text-praia-sand-500 text-sm font-display font-semibold hover:text-praia-teal-700 transition-colors py-2">
          Já tenho conta? Entrar
        </a>
      </div>
    </div>`;
  document.body.appendChild(el);
  lucide.createIcons();
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });
}

async function shareVote(beachName, beachId) {
  // Use cached data from confirmVote if available, otherwise re-fetch
  var cached = window._lastVoteShare || {};
  var photo = cached.photo || '';
  var municipality = cached.municipality || '';
  if (beachId && !municipality) {
    try {
      var beaches = await window.getBeaches();
      var b = beaches.find(function(x) { return x.id === beachId; });
      if (b) {
        photo = photo || b.thumbnail || (b.photos && b.photos[0]) || '';
        municipality = b.municipality || '';
      }
    } catch(e) {}
  }
  openShareSheet({
    type: 'vote',
    title: beachName,
    municipality: municipality,
    photo: photo,
    url: `${window.location.origin}/votar.html`,
  });
}
