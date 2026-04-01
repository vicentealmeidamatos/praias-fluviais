// ─── Página de Perfil ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const { authGetUser, profileGet, profileUpsert, profileUploadAvatar,
          stampsGetAll, voteGet, reviewsGetForUser,
          badgesCompute, badgesTopEarned, ALL_BADGES, BADGE_TIERS,
          avatarHTML, badgeCardHTML, celebrateBadge } = AuthUtils;

  // ── Auth guard ──────────────────────────────────────────────────────────────
  const user = await authGetUser();
  if (!user) {
    window.location.href = 'auth.html?redirect=perfil.html';
    return;
  }

  // ── Load data in parallel ───────────────────────────────────────────────────
  let beaches = [];
  try {
    const r = await fetch('data/beaches.json');
    beaches = await r.json();
  } catch {}

  const [profile, stamps, reviews] = await Promise.all([
    profileGet(user.id),
    stampsGetAll(user.id),
    reviewsGetForUser(user.id),
  ]);

  const currentYear = new Date().getFullYear();
  const votedBeachId = await voteGet(user.id, currentYear);

  // ── Compute badges ──────────────────────────────────────────────────────────
  const computedBadges = badgesCompute({
    stamps,
    reviews,
    voted: !!votedBeachId,
    beaches,
  });

  const earnedBadges = computedBadges.filter(b => b.earned);
  const username     = profile?.username || user.email?.split('@')[0] || 'Utilizador';

  // ── Render hero ─────────────────────────────────────────────────────────────
  document.getElementById('profile-avatar-wrap').innerHTML = avatarHTML(profile, 96);
  document.getElementById('profile-name').textContent      = username;
  document.getElementById('profile-email').textContent     = user.email || '';
  document.getElementById('profile-since').textContent     = 'Membro desde ' + new Date(user.created_at || Date.now()).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });

  document.getElementById('stat-stamps').textContent  = stamps.length;
  document.getElementById('stat-badges').textContent  = earnedBadges.length;
  document.getElementById('stat-reviews').textContent = reviews.length;
  document.getElementById('stat-voted').textContent   = votedBeachId ? '✓' : '—';

  // Badge tier breakdown in hero
  const tierCounts = {};
  earnedBadges.forEach(b => { tierCounts[b.tier] = (tierCounts[b.tier] || 0) + 1; });
  const tierBar = document.getElementById('tier-bar');
  if (tierBar) {
    tierBar.innerHTML = Object.entries(BADGE_TIERS).map(([key, t]) => {
      const c = tierCounts[key] || 0;
      if (!c) return '';
      return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-display font-bold" style="background:${t.hex}22;color:${t.hex};border:1px solid ${t.hex}44;">
        ${c}× ${t.label}
      </span>`;
    }).join('');
  }

  // ── Tabs ─────────────────────────────────────────────────────────────────────
  const tabs = document.querySelectorAll('.profile-tab');
  const panels = document.querySelectorAll('.profile-panel');

  function switchTab(tabId) {
    tabs.forEach(t => {
      const active = t.dataset.tab === tabId;
      t.classList.toggle('tab-active', active);
      t.classList.toggle('tab-inactive', !active);
    });
    panels.forEach(p => p.classList.toggle('hidden', p.id !== `panel-${tabId}`));
  }

  tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

  // ── Render: Badges ────────────────────────────────────────────────────────
  function renderBadges() {
    const grid = document.getElementById('badges-grid');
    if (!grid) return;

    const tierOrder = ['bronze', 'prata', 'ouro', 'platina', 'diamante'];
    const sorted = [...computedBadges].sort((a, b) => {
      if (a.earned !== b.earned) return a.earned ? -1 : 1;
      return tierOrder.indexOf(b.tier) - tierOrder.indexOf(a.tier);
    });

    grid.innerHTML = sorted.map(b => badgeCardHTML(b)).join('');
    lucide.createIcons();
  }
  renderBadges();

  // ── Render: Stamps ────────────────────────────────────────────────────────
  function renderStamps() {
    const container = document.getElementById('stamps-list');
    if (!container) return;

    const stampedIds = stamps.map(s => s.beach_id);
    const stampMap   = Object.fromEntries(stamps.map(s => [s.beach_id, s.stamped_at]));
    const stamped    = beaches.filter(b => stampedIds.includes(b.id));

    if (stamped.length === 0) {
      container.innerHTML = `
        <div class="col-span-full text-center py-12">
          <i data-lucide="stamp" class="w-12 h-12 mx-auto text-praia-sand-300 mb-3"></i>
          <p class="font-display text-sm font-semibold text-praia-sand-400">Ainda sem carimbos</p>
          <p class="text-xs text-praia-sand-300 mt-1">Visite uma praia e carimbámos!</p>
          <a href="rede.html" class="inline-flex items-center gap-2 mt-4 btn-primary bg-praia-teal-800 text-praia-yellow-400 font-display font-bold text-xs uppercase tracking-wider px-5 py-2.5 rounded-full">
            <i data-lucide="map" class="w-4 h-4"></i> Ver Rede de Praias
          </a>
        </div>`;
      lucide.createIcons();
      return;
    }

    container.innerHTML = stamped.map(b => `
      <a href="praia.html?id=${b.id}" class="card-interactive block rounded-xl overflow-hidden bg-white shadow-layered group">
        <div class="relative h-32 overflow-hidden">
          <img src="${b.photos?.[0] || ''}" alt="${b.name}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy">
          <div class="absolute inset-0 bg-gradient-to-t from-praia-teal-800/70 via-transparent to-transparent"></div>
          <div class="absolute top-2.5 right-2.5 bg-praia-yellow-400 rounded-full p-1">
            <i data-lucide="check" class="w-3 h-3 text-praia-teal-800"></i>
          </div>
        </div>
        <div class="p-3">
          <div class="font-display text-xs font-bold text-praia-teal-800 leading-snug truncate">${b.name.replace('Praia Fluvial de ','').replace('Praia Fluvial do ','').replace('Praia Fluvial da ','')}</div>
          <div class="text-[10px] text-praia-sand-400 mt-0.5">${b.municipality}</div>
          <div class="text-[10px] text-praia-teal-500 font-display font-semibold mt-1">${stampMap[b.id] || ''}</div>
        </div>
      </a>`).join('');

    lucide.createIcons();
  }
  renderStamps();

  // ── Render: Reviews ────────────────────────────────────────────────────────
  async function renderReviews() {
    const container = document.getElementById('reviews-list');
    if (!container) return;

    if (reviews.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12">
          <i data-lucide="message-circle" class="w-12 h-12 mx-auto text-praia-sand-300 mb-3"></i>
          <p class="font-display text-sm font-semibold text-praia-sand-400">Ainda sem comentários</p>
          <p class="text-xs text-praia-sand-300 mt-1">Visite uma praia e partilhe a sua experiência!</p>
        </div>`;
      lucide.createIcons();
      return;
    }

    container.innerHTML = reviews.map(r => {
      const beach = beaches.find(b => b.id === r.beach_id);
      const date  = new Date(r.created_at).toLocaleDateString('pt-PT');
      return `
        <div class="bg-white rounded-2xl p-4 shadow-layered">
          <div class="flex items-start justify-between gap-3 mb-2">
            <a href="praia.html?id=${r.beach_id}" class="font-display text-xs font-bold text-praia-teal-700 hover:text-praia-teal-500 transition-colors flex items-center gap-1">
              <i data-lucide="map-pin" class="w-3 h-3"></i>
              ${beach?.name || r.beach_id}
            </a>
            <span class="text-[10px] text-praia-sand-400 whitespace-nowrap">${date}</span>
          </div>
          <p class="text-sm text-praia-sand-700 leading-relaxed">${r.text}</p>
          ${r.images?.length ? `<div class="flex gap-2 mt-3 flex-wrap">${r.images.map(img => `<img src="${img}" class="w-16 h-16 object-cover rounded-lg border border-praia-sand-100">`).join('')}</div>` : ''}
        </div>`;
    }).join('');
    lucide.createIcons();
  }
  renderReviews();

  // ── Render: Vote ──────────────────────────────────────────────────────────
  function renderVote() {
    const container = document.getElementById('vote-panel');
    if (!container) return;

    if (votedBeachId) {
      const beach = beaches.find(b => b.id === votedBeachId);
      container.innerHTML = `
        <div class="max-w-sm mx-auto text-center py-8">
          <div class="w-16 h-16 bg-praia-yellow-400/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <i data-lucide="check-circle" class="w-8 h-8 text-praia-yellow-600"></i>
          </div>
          <p class="font-display text-sm font-semibold text-praia-sand-500 mb-1">O seu voto ${currentYear}:</p>
          <h3 class="font-display text-xl font-bold text-praia-teal-800 mb-1">${beach?.name || votedBeachId}</h3>
          <p class="text-xs text-praia-sand-400">${beach?.municipality || ''}</p>
          <div class="mt-6 px-4 py-2.5 rounded-xl inline-block" style="background:rgba(255,235,59,0.1);">
            <span class="font-display text-xs font-bold text-praia-yellow-700 uppercase tracking-wider">Voto confirmado — obrigado!</span>
          </div>
        </div>`;
    } else {
      container.innerHTML = `
        <div class="text-center py-12">
          <i data-lucide="vote" class="w-12 h-12 mx-auto text-praia-sand-300 mb-3"></i>
          <p class="font-display text-sm font-semibold text-praia-sand-400">Ainda não votou em ${currentYear}</p>
          <a href="votar.html" class="inline-flex items-center gap-2 mt-4 btn-primary bg-praia-yellow-400 text-praia-teal-800 font-display font-bold text-xs uppercase tracking-wider px-5 py-2.5 rounded-full shadow-layered-yellow">
            <i data-lucide="heart" class="w-4 h-4"></i> Votar Agora
          </a>
        </div>`;
    }
    lucide.createIcons();
  }
  renderVote();

  // ── Edit Profile Modal ─────────────────────────────────────────────────────
  document.getElementById('edit-profile-btn')?.addEventListener('click', openEditModal);

  function openEditModal() {
    const modal = document.getElementById('edit-modal');
    modal.classList.remove('hidden');
    document.getElementById('edit-username').value = profile?.username || '';
    lucide.createIcons();
    requestAnimationFrame(() => {
      const inner = document.getElementById('edit-modal-inner');
      inner.style.transform = 'scale(1) translateY(0)';
      inner.style.opacity = '1';
    });
  }

  window.closeEditModal = function () {
    document.getElementById('edit-modal').classList.add('hidden');
  };

  window.saveEditProfile = async function () {
    const newUsername = document.getElementById('edit-username').value.trim();
    const avatarFile  = document.getElementById('edit-avatar').files[0];

    if (newUsername.length < 3) {
      alert('O nome deve ter pelo menos 3 caracteres.');
      return;
    }

    const btn = document.getElementById('edit-save-btn');
    btn.textContent = 'A guardar...';
    btn.disabled = true;

    const updates = { username: newUsername };

    if (avatarFile) {
      const url = await profileUploadAvatar(user.id, avatarFile);
      if (url) updates.avatar_url = url;
    }

    await profileUpsert(user.id, updates);
    window.location.reload();
  };

  let _editPreviewFile = null;
  document.getElementById('edit-avatar')?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    _editPreviewFile = file;
    const url = URL.createObjectURL(file);
    document.getElementById('edit-avatar-preview').innerHTML = `<img src="${url}" alt="Preview" class="w-20 h-20 rounded-full object-cover border-2 border-praia-yellow-400">`;
  });

  // ── Progressive badge unlock check ────────────────────────────────────────
  // Compare with previously saved badges in sessionStorage
  const storageKey = `badges_${user.id}`;
  const prevEarned = new Set(JSON.parse(sessionStorage.getItem(storageKey) || '[]'));
  const newEarned  = earnedBadges.filter(b => !prevEarned.has(b.id));

  if (newEarned.length > 0) {
    sessionStorage.setItem(storageKey, JSON.stringify(earnedBadges.map(b => b.id)));
    // Stagger celebrations
    newEarned.slice(0, 3).forEach((badge, i) => {
      setTimeout(() => celebrateBadge(badge), i * 1800);
    });
  } else {
    sessionStorage.setItem(storageKey, JSON.stringify(earnedBadges.map(b => b.id)));
  }

  // ── Show hidden sections ───────────────────────────────────────────────────
  document.getElementById('profile-loading')?.classList.add('hidden');
  document.getElementById('profile-content')?.classList.remove('hidden');
});
