// ─── Página de Perfil ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const { authGetUser, profileGet, profileUpsert, profileUploadAvatar,
          stampsGetAll, voteGetFull, voteGet, reviewsGetForUser,
          badgesCompute, ALL_BADGES, BADGE_TIERS,
          avatarHTML, badgeCardHTML, celebrateBadge } = AuthUtils;

  // ── Determine if viewing own profile or another user's ─────────────────────
  const searchParams  = new URLSearchParams(window.location.search);
  const viewUserId    = searchParams.get('user'); // null = own profile
  const isOwnProfile  = !viewUserId;

  // ── Auth guard (only for own profile) ──────────────────────────────────────
  const currentUser = await authGetUser();
  if (isOwnProfile && !currentUser) {
    window.location.href = 'auth.html?redirect=perfil.html';
    return;
  }

  const targetUserId = viewUserId || currentUser?.id;
  if (!targetUserId) { window.location.href = 'index.html'; return; }

  // ── Load data in parallel ───────────────────────────────────────────────────
  let beaches = [];
  try {
    const r = await fetch('data/beaches.json');
    beaches = await r.json();
  } catch {}

  const [profile, stamps, reviews] = await Promise.all([
    profileGet(targetUserId),
    stampsGetAll(targetUserId),
    reviewsGetForUser(targetUserId),
  ]);

  const currentYear = new Date().getFullYear();
  const voteData    = await (voteGetFull ? voteGetFull(targetUserId, currentYear) : voteGet(targetUserId, currentYear).then(v => v ? { beach_id: v, is_public: true } : null));
  const votedBeachId = voteData?.beach_id || null;
  const voteIsPublic = voteData?.is_public !== false; // default true

  // ── Compute badges ──────────────────────────────────────────────────────────
  const computedBadges = badgesCompute({
    stamps,
    reviews,
    voted: !!votedBeachId,
    beaches,
  });

  const earnedBadges = computedBadges.filter(b => b.earned);
  const username     = profile?.username || (isOwnProfile ? currentUser?.email?.split('@')[0] : 'Utilizador') || 'Utilizador';

  // ── Render hero ─────────────────────────────────────────────────────────────
  document.getElementById('profile-avatar-wrap').innerHTML = avatarHTML(profile, 96);
  document.getElementById('profile-name').textContent      = username;
  document.getElementById('profile-email').textContent     = isOwnProfile ? (currentUser?.email || '') : '';
  document.getElementById('profile-since').textContent     = 'Membro desde ' + new Date(profile?.created_at || currentUser?.created_at || Date.now()).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });

  document.getElementById('stat-stamps').textContent  = stamps.length;
  document.getElementById('stat-medals').textContent  = earnedBadges.length;
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

  // Hide edit button if viewing another user's profile
  const editBtn = document.getElementById('edit-profile-btn');
  if (editBtn && !isOwnProfile) editBtn.style.display = 'none';

  // ── Tabs ─────────────────────────────────────────────────────────────────────
  const tabs   = document.querySelectorAll('.profile-tab');
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

  // ── Render: Medalhas ────────────────────────────────────────────────────────
  function renderBadges() {
    const grid = document.getElementById('badges-grid');
    if (!grid) return;

    const tierOrder = ['bronze', 'prata', 'ouro', 'diamante', 'mitico'];
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
          <p class="text-xs text-praia-sand-300 mt-1">${isOwnProfile ? 'Visite uma praia e carimbámos!' : 'Este utilizador ainda não tem carimbos.'}</p>
          ${isOwnProfile ? `<a href="rede.html" class="inline-flex items-center gap-2 mt-4 btn-primary bg-praia-teal-800 text-praia-yellow-400 font-display font-bold text-xs uppercase tracking-wider px-5 py-2.5 rounded-full">
            <i data-lucide="map" class="w-4 h-4"></i> Ver Rede de Praias
          </a>` : ''}
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
          <p class="text-xs text-praia-sand-300 mt-1">${isOwnProfile ? 'Visite uma praia e partilhe a sua experiência!' : 'Este utilizador ainda não comentou.'}</p>
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
          ${r.images?.length ? `<div class="flex gap-2 mt-3 flex-wrap">${r.images.map(img => `<img src="${img}" class="w-16 h-16 object-cover rounded-lg border border-praia-sand-100 cursor-pointer hover:opacity-90 transition-opacity" onclick="openImageViewer(this.src)">`).join('')}</div>` : ''}
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

      // If viewing other user's profile and vote is private
      if (!isOwnProfile && !voteIsPublic) {
        container.innerHTML = `
          <div class="max-w-sm mx-auto text-center py-8">
            <div class="w-16 h-16 bg-praia-sand-200 rounded-full flex items-center justify-center mx-auto mb-4">
              <i data-lucide="lock" class="w-8 h-8 text-praia-sand-400"></i>
            </div>
            <p class="font-display text-sm font-semibold text-praia-sand-400">Voto privado</p>
            <p class="text-xs text-praia-sand-300 mt-1">Este utilizador mantém o seu voto privado.</p>
          </div>`;
        lucide.createIcons();
        return;
      }

      container.innerHTML = `
        <div class="max-w-sm mx-auto text-center py-8">
          <div class="w-16 h-16 bg-praia-yellow-400/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <i data-lucide="check-circle" class="w-8 h-8 text-praia-yellow-600"></i>
          </div>
          <p class="font-display text-sm font-semibold text-praia-sand-500 mb-1">${isOwnProfile ? 'O seu' : 'O'} voto ${currentYear}:</p>
          <h3 class="font-display text-xl font-bold text-praia-teal-800 mb-1">${beach?.name || votedBeachId}</h3>
          <p class="text-xs text-praia-sand-400">${beach?.municipality || ''}</p>
          <div class="mt-6 px-4 py-2.5 rounded-xl inline-block" style="background:rgba(255,235,59,0.1);">
            <span class="font-display text-xs font-bold text-praia-yellow-700 uppercase tracking-wider">Voto confirmado — obrigado!</span>
          </div>
          ${isOwnProfile ? `
            <div class="mt-6 p-4 rounded-xl bg-praia-sand-100 border border-praia-sand-200 text-left">
              <p class="text-xs font-display font-semibold text-praia-sand-500 uppercase tracking-wider mb-3">Privacidade do voto</p>
              <div class="flex gap-2">
                <button id="vote-public-btn" onclick="setVotePublic(true)"
                        class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-display font-bold uppercase tracking-wider transition-all duration-200
                               ${voteIsPublic ? 'bg-praia-teal-800 text-praia-yellow-400' : 'bg-white border border-praia-sand-200 text-praia-sand-500 hover:border-praia-teal-400'}">
                  <i data-lucide="globe" class="w-3.5 h-3.5"></i> Público
                </button>
                <button id="vote-private-btn" onclick="setVotePublic(false)"
                        class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-display font-bold uppercase tracking-wider transition-all duration-200
                               ${!voteIsPublic ? 'bg-praia-teal-800 text-praia-yellow-400' : 'bg-white border border-praia-sand-200 text-praia-sand-500 hover:border-praia-teal-400'}">
                  <i data-lucide="lock" class="w-3.5 h-3.5"></i> Privado
                </button>
              </div>
            </div>
          ` : ''}
        </div>`;
    } else {
      container.innerHTML = `
        <div class="text-center py-12">
          <i data-lucide="vote" class="w-12 h-12 mx-auto text-praia-sand-300 mb-3"></i>
          <p class="font-display text-sm font-semibold text-praia-sand-400">${isOwnProfile ? `Ainda não votou em ${currentYear}` : `Ainda não votou em ${currentYear}`}</p>
          ${isOwnProfile ? `<a href="votar.html" class="inline-flex items-center gap-2 mt-4 btn-primary bg-praia-yellow-400 text-praia-teal-800 font-display font-bold text-xs uppercase tracking-wider px-5 py-2.5 rounded-full shadow-layered-yellow">
            <i data-lucide="heart" class="w-4 h-4"></i> Votar Agora
          </a>` : ''}
        </div>`;
    }
    lucide.createIcons();
  }
  renderVote();

  // ── Set vote public/private ───────────────────────────────────────────────
  window.setVotePublic = async function(isPublic) {
    if (!currentUser) return;
    const ok = await AuthUtils.voteUpdatePublic(currentUser.id, currentYear, isPublic);
    if (ok) {
      // Update button states
      const pubBtn  = document.getElementById('vote-public-btn');
      const privBtn = document.getElementById('vote-private-btn');
      if (pubBtn && privBtn) {
        const onCls  = 'bg-praia-teal-800 text-praia-yellow-400';
        const offCls = 'bg-white border border-praia-sand-200 text-praia-sand-500 hover:border-praia-teal-400';
        pubBtn.className  = pubBtn.className.replace(isPublic ? offCls : onCls, isPublic ? onCls : offCls);
        privBtn.className = privBtn.className.replace(!isPublic ? offCls : onCls, !isPublic ? onCls : offCls);
      }
    }
  };

  // ── Edit Profile Modal ─────────────────────────────────────────────────────
  if (isOwnProfile) {
    document.getElementById('edit-profile-btn')?.addEventListener('click', openEditModal);
  }

  function openEditModal() {
    const modal = document.getElementById('edit-modal');
    modal.classList.remove('hidden');
    // Prefill current values
    document.getElementById('edit-username').value = profile?.username || '';
    // Show current avatar
    const avatarWrap = document.getElementById('edit-avatar-preview');
    if (avatarWrap && profile?.avatar_url) {
      avatarWrap.innerHTML = `<img src="${profile.avatar_url}" alt="Avatar" class="w-20 h-20 rounded-full object-cover border-2 border-praia-yellow-400">`;
    }
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

  // Save ONLY photo
  window.saveProfilePhoto = async function () {
    const avatarFile = document.getElementById('edit-avatar').files[0];
    if (!avatarFile) {
      alert('Por favor selecione uma foto.');
      return;
    }
    const btn = document.getElementById('edit-photo-btn');
    btn.textContent = 'A guardar…';
    btn.disabled = true;

    const url = await profileUploadAvatar(currentUser.id, avatarFile);
    if (url) {
      await profileUpsert(currentUser.id, { avatar_url: url });
      window.location.reload();
    } else {
      btn.textContent = 'Guardar Foto';
      btn.disabled = false;
      alert('Erro ao guardar a foto. Tente novamente.');
    }
  };

  // Save ONLY username
  window.saveProfileUsername = async function () {
    const newUsername = document.getElementById('edit-username').value.trim();
    if (newUsername.length < 3) {
      alert('O nome deve ter pelo menos 3 caracteres.');
      return;
    }
    if (!/^[a-z0-9_.-]+$/i.test(newUsername)) {
      alert('O nome só pode conter letras, números, pontos, hifens e underscores.');
      return;
    }
    const btn = document.getElementById('edit-username-btn');
    btn.textContent = 'A guardar…';
    btn.disabled = true;

    await profileUpsert(currentUser.id, { username: newUsername });
    window.location.reload();
  };

  let _editPreviewFile = null;
  document.getElementById('edit-avatar')?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    _editPreviewFile = file;
    const url = URL.createObjectURL(file);
    document.getElementById('edit-avatar-preview').innerHTML =
      `<img src="${url}" alt="Preview" class="w-20 h-20 rounded-full object-cover border-2 border-praia-yellow-400">`;
  });

  // ── Progressive badge unlock check ─────────────────────────────────────────
  // Only check/celebrate for own profile and use localStorage
  if (isOwnProfile && currentUser) {
    const storageKey   = `badges_${currentUser.id}`;
    const storedRaw    = localStorage.getItem(storageKey);
    const isFirstLoad  = storedRaw === null;
    const prevEarned   = new Set(JSON.parse(storedRaw || '[]'));
    const newEarned    = isFirstLoad ? [] : earnedBadges.filter(b => !prevEarned.has(b.id));

    // Always update localStorage
    localStorage.setItem(storageKey, JSON.stringify(earnedBadges.map(b => b.id)));

    if (newEarned.length > 0) {
      newEarned.slice(0, 3).forEach((badge, i) => {
        setTimeout(() => celebrateBadge(badge), i * 1800);
      });
    }
  }

  // ── Show hidden sections ───────────────────────────────────────────────────
  document.getElementById('profile-loading')?.classList.add('hidden');
  document.getElementById('profile-content')?.classList.remove('hidden');
});

// ── Image viewer ──────────────────────────────────────────────────────────────
window.openImageViewer = function(src) {
  const existing = document.getElementById('image-viewer-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'image-viewer-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.9);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:16px;';
  overlay.innerHTML = `
    <button onclick="document.getElementById('image-viewer-overlay').remove()"
            style="position:absolute;top:16px;right:16px;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,0.12);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:white;font-size:20px;z-index:10;" aria-label="Fechar">
      ✕
    </button>
    <img src="${src}" alt="Imagem" style="max-width:min(100%,900px);max-height:90vh;object-fit:contain;border-radius:8px;">
  `;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  document.addEventListener('keydown', function handler(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', handler); }
  });
};
