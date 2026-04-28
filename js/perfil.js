// ─── Pré-carregamento imediato (sem esperar pelo DOM) ───
const _authEarlyPerfil = window.AuthUtils ? AuthUtils.authGetUser() : null;
const _beachesEarlyPerfil = window.getBeaches ? getBeaches().catch(() => []) : null;

// ─── Página de Perfil ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const { authGetUser, profileGet, profileUpsert, profileUploadAvatar, profileRemoveAvatar,
          stampsGetAll, voteGetFull, voteGet, reviewsGetForUser,
          badgesCompute, ALL_BADGES, BADGE_TIERS,
          avatarHTML, badgeCardHTML, celebrateBadge } = AuthUtils;

  // ── Determine if viewing own profile or another user's ─────────────────────
  const searchParams  = new URLSearchParams(window.location.search);
  const viewUserId    = searchParams.get('user'); // null = own profile
  const isOwnProfile  = !viewUserId;

  // ── Auth + beaches in parallel (pre-started before DOM) ────────────────────
  const beachesPromise = _beachesEarlyPerfil || getBeaches().catch(() => []);
  const currentUser = await (_authEarlyPerfil || authGetUser());
  if (isOwnProfile && !currentUser) {
    window.location.href = 'auth.html?redirect=perfil.html';
    return;
  }

  const targetUserId = viewUserId || currentUser?.id;
  if (!targetUserId) { window.location.href = 'index.html'; return; }

  // ── Load ALL data in parallel ──────────────────────────────────────────────
  const currentYear = new Date().getFullYear();
  const [beachesRaw, profile, stamps, reviews, voteData] = await Promise.all([
    beachesPromise,
    profileGet(targetUserId),
    stampsGetAll(targetUserId),
    reviewsGetForUser(targetUserId),
    voteGetFull ? voteGetFull(targetUserId, currentYear) : voteGet(targetUserId, currentYear).then(v => v ? { beach_id: v, is_public: true } : null),
  ]);

  const beaches = beachesRaw;
  const votedBeachId = voteData?.beach_id || null;
  const voteIsPublic = voteData?.is_public !== false; // default true
  let _currentVotePublic = voteIsPublic;

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
  const profileWithName = { ...profile, username };
  document.getElementById('profile-avatar-wrap').innerHTML = avatarHTML(profileWithName, 96);
  document.getElementById('profile-name').textContent      = username;
  document.getElementById('profile-email').textContent     = isOwnProfile ? (currentUser?.email || '') : '';
  document.getElementById('profile-since').textContent     = 'Membro desde ' + new Date(profile?.created_at || currentUser?.created_at || Date.now()).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });

  document.getElementById('stat-stamps').textContent  = stamps.length;
  document.getElementById('stat-medals').textContent  = earnedBadges.length;
  document.getElementById('stat-reviews').textContent = reviews.length;
  document.getElementById('stat-voted').textContent   = votedBeachId ? '✓' : '-';

  // Badge tier breakdown in hero
  const tierCounts = {};
  earnedBadges.forEach(b => { tierCounts[b.tier] = (tierCounts[b.tier] || 0) + 1; });
  const tierBar = document.getElementById('tier-bar');
  if (tierBar) {
    tierBar.innerHTML = Object.entries(BADGE_TIERS).map(([key, t]) => {
      const c = tierCounts[key] || 0;
      if (!c) return '';
      const isMitico = key === 'mitico';
      const cls = 'tier-pill' + (isMitico ? ' badge-rainbow' : '');
      const bg = isMitico ? '#003A4080' : `${t.hex}20`;
      const border = isMitico ? `${t.hex}80` : `${t.hex}55`;
      return `<span class="${cls}" style="--tier-color:${t.hex};background:${bg};color:${t.hex};border:1px solid ${border};">${c}× ${t.label}</span>`;
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
  }
  renderBadges();

  // ── Render: Stamps ────────────────────────────────────────────────────────
  function renderStamps() {
    const container = document.getElementById('stamps-list');
    if (!container) return;

    const stampedIds = stamps.map(s => s.beach_id);
    const stampMap   = Object.fromEntries(stamps.map(s => [s.beach_id, s.stamped_at]));
    const stamped    = beaches
      .filter(b => stampedIds.includes(b.id))
      .sort((a, b) => {
        const muni = (a.municipality || '').localeCompare(b.municipality || '', 'pt');
        return muni !== 0 ? muni : (a.name || '').localeCompare(b.name || '', 'pt');
      });

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
      return;
    }

    container.innerHTML = stamped.map(b => `
      <a href="praia.html?id=${b.id}" class="card-interactive block rounded-xl overflow-hidden bg-white shadow-layered group">
        <div class="relative h-32 overflow-hidden">
          <img src="${b.thumbnail || b.photos?.[0] || ''}" alt="${b.name}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy">
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
            <span class="font-display text-xs font-bold text-praia-yellow-700 uppercase tracking-wider">Voto confirmado, obrigado!</span>
          </div>
          ${isOwnProfile ? `
            <div class="mt-4">
              <button onclick="shareProfileVote('${(beach?.name || votedBeachId).replace(/'/g, "\\'")}','${votedBeachId}')" class="inline-flex items-center gap-2 btn-primary bg-praia-teal-800 text-white font-display text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-full">
                <i data-lucide="share-2" class="w-4 h-4"></i> Partilhar Voto
              </button>
            </div>
          ` : ''}
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
  }
  renderVote();

  // ── Hero vote privacy indicator ────────────────────────────────────────────
  function renderHeroVotePrivacy(isPublic) {
    const el = document.getElementById('stat-vote-privacy');
    if (!el || !isOwnProfile || !votedBeachId) return;
    el.innerHTML = `
      <button id="hero-vote-privacy-btn"
              class="inline-flex items-center justify-center gap-0.5 text-[9px] font-display font-semibold uppercase tracking-wider transition-all duration-200 ${isPublic ? 'text-white/25 hover:text-white/50' : 'text-praia-yellow-400/60 hover:text-praia-yellow-400'}"
              title="${isPublic ? 'Voto público: clique para tornar privado' : 'Voto privado: clique para tornar público'}">
        <i data-lucide="${isPublic ? 'globe' : 'lock'}" class="w-2.5 h-2.5"></i>
        <span>${isPublic ? 'Público' : 'Privado'}</span>
      </button>`;
    document.getElementById('hero-vote-privacy-btn')?.addEventListener('click', async () => {
      _currentVotePublic = !_currentVotePublic;
      await AuthUtils.voteUpdatePublic(currentUser.id, currentYear, _currentVotePublic);
      renderHeroVotePrivacy(_currentVotePublic);
      // Sync vote panel buttons if visible
      const pubBtn  = document.getElementById('vote-public-btn');
      const privBtn = document.getElementById('vote-private-btn');
      if (pubBtn && privBtn) {
        const onCls  = 'bg-praia-teal-800 text-praia-yellow-400';
        const offCls = 'bg-white border border-praia-sand-200 text-praia-sand-500 hover:border-praia-teal-400';
        pubBtn.className  = pubBtn.className.replace(_currentVotePublic ? offCls : onCls, _currentVotePublic ? onCls : offCls);
        privBtn.className = privBtn.className.replace(!_currentVotePublic ? offCls : onCls, !_currentVotePublic ? onCls : offCls);
      }
      lucide.createIcons();
    });
  }
  renderHeroVotePrivacy(_currentVotePublic);

  // ── Set vote public/private ───────────────────────────────────────────────
  window.setVotePublic = async function(isPublic) {
    if (!currentUser) return;
    _currentVotePublic = isPublic;
    const ok = await AuthUtils.voteUpdatePublic(currentUser.id, currentYear, isPublic);
    if (ok) {
      // Update vote panel buttons
      const pubBtn  = document.getElementById('vote-public-btn');
      const privBtn = document.getElementById('vote-private-btn');
      if (pubBtn && privBtn) {
        const onCls  = 'bg-praia-teal-800 text-praia-yellow-400';
        const offCls = 'bg-white border border-praia-sand-200 text-praia-sand-500 hover:border-praia-teal-400';
        pubBtn.className  = pubBtn.className.replace(isPublic ? offCls : onCls, isPublic ? onCls : offCls);
        privBtn.className = privBtn.className.replace(!isPublic ? offCls : onCls, !isPublic ? onCls : offCls);
      }
      // Sync hero indicator
      renderHeroVotePrivacy(isPublic);
    }
  };

  // ── Tab Configurações (apenas perfil próprio) ──────────────────────────
  if (isOwnProfile) {
    // Mostrar tab e fazer prefill dos campos com os valores actuais
    const tabSettings = document.getElementById('tab-settings');
    if (tabSettings) tabSettings.classList.remove('hidden');

    // Preencher avatar e nome de utilizador
    const avatarWrap = document.getElementById('edit-avatar-preview');
    if (avatarWrap) avatarWrap.innerHTML = avatarHTML(profileWithName, 80);
    const usernameInput = document.getElementById('edit-username');
    if (usernameInput) usernameInput.value = profile?.username || '';

    // Bloco de palavra-passe: sempre visível. Para utilizadores OAuth-only
    // (sem provider 'email'), a "palavra-passe atual" é escondida e o título/botão
    // mudam para "Definir palavra-passe".
    const pwWrap = document.getElementById('edit-password-wrap');
    if (pwWrap) pwWrap.classList.remove('hidden');

    // Determinar se o utilizador já tem palavra-passe definida:
    //  • signup com email → providers inclui 'email'
    //  • signup com Google e depois definiu palavra-passe → flag user_metadata.has_password
    //  • identidade local com provider 'email' (algumas instalações do Supabase)
    const providers = currentUser?.app_metadata?.providers || [currentUser?.app_metadata?.provider].filter(Boolean);
    const hasEmailIdentity = Array.isArray(currentUser?.identities)
      && currentUser.identities.some(i => i?.provider === 'email');
    const hasPassword = providers.includes('email')
      || hasEmailIdentity
      || currentUser?.user_metadata?.has_password === true;
    if (!hasPassword) {
      const currentPwLabel = pwWrap?.querySelector('label.settings-label');
      const currentPwWrap  = document.getElementById('edit-current-password')?.closest('.pw-wrap');
      if (currentPwLabel && currentPwLabel.textContent.toLowerCase().includes('atual')) {
        currentPwLabel.classList.add('hidden');
      }
      if (currentPwWrap) currentPwWrap.classList.add('hidden');
      const pwTitle = pwWrap?.querySelector('.settings-card-subtitle');
      const pwDesc  = pwWrap?.querySelector('.settings-card-subtitle-desc');
      const pwBtn   = document.getElementById('edit-password-btn');
      if (pwTitle) pwTitle.textContent = 'Definir palavra-passe';
      if (pwDesc)  pwDesc.textContent  = 'Defina uma palavra-passe para também poder iniciar sessão por email.';
      if (pwBtn)   pwBtn.textContent   = 'Definir Palavra-passe';
    }

    // Botão "Editar Perfil" no hero → abre a tab Configurações com scroll suave
    document.getElementById('edit-profile-btn')?.addEventListener('click', () => {
      switchTab('settings');
      const tabBar = document.querySelector('.profile-tab')?.closest('.border-t');
      if (tabBar) tabBar.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Botão Remover foto (no cartão Foto de Perfil)
    const removeFotoBtn = document.getElementById('edit-photo-remove-btn');
    if (removeFotoBtn) {
      removeFotoBtn.disabled = !profile?.avatar_url;
      removeFotoBtn.addEventListener('click', () => {
        if (removeFotoBtn.disabled) return;
        window.removeProfilePhoto();
      });
    }

    // Botão Terminar Sessão (com aviso de confirmação)
    document.getElementById('sign-out-btn')?.addEventListener('click', async () => {
      const ok = await openConfirmModal({
        title: 'Terminar sessão?',
        message: 'Vai sair da sua conta neste dispositivo. Pode iniciar sessão novamente em qualquer altura.',
        confirmLabel: 'Terminar sessão',
        icon: 'log-out',
        danger: true,
      });
      if (!ok) return;

      const btn = document.getElementById('sign-out-btn');
      btn.disabled = true;
      const label = btn.querySelector('span');
      if (label) label.textContent = 'A terminar…';
      try {
        await AuthUtils.authSignOut(); // já redirecciona para index.html
      } catch (err) {
        console.error('[signOut]', err);
        btn.disabled = false;
        if (label) label.textContent = 'Terminar Sessão';
        alert('Não foi possível terminar a sessão. Tente novamente.');
      }
    });

  }

  // Save ONLY photo (usa o blob recortado pelo cropper, ou o ficheiro original
  // se o utilizador saltou o ajuste — ex.: imagem já quadrada)
  window.saveProfilePhoto = async function () {
    const fileInput = document.getElementById('edit-avatar');
    const blob = _croppedBlob || fileInput.files[0];
    if (!blob) {
      alert('Por favor selecione uma foto.');
      return;
    }
    if (blob.size > 8 * 1024 * 1024) {
      alert('A imagem deve ter menos de 8MB.');
      return;
    }
    const btn = document.getElementById('edit-photo-btn');
    const origLabel = btn.textContent;
    btn.textContent = 'A guardar foto…';
    btn.disabled = true;

    try {
      const url = await profileUploadAvatar(currentUser.id, blob, 'avatar.jpg');
      if (!url) {
        btn.textContent = origLabel;
        btn.disabled = false;
        alert('Erro ao carregar a foto. Verifique o formato (JPEG, PNG, WebP) e tente novamente.');
        return;
      }
      await profileUpsert(currentUser.id, { avatar_url: url });
      try {
        const cache = JSON.parse(localStorage.getItem('gpf_nav_v1') || 'null');
        if (cache) { cache.avatar = url; cache.avatar_url = url; localStorage.setItem('gpf_nav_v1', JSON.stringify(cache)); }
      } catch {}
      window.location.reload();
    } catch (err) {
      console.error('[saveProfilePhoto]', err);
      btn.textContent = origLabel;
      btn.disabled = false;
      alert('Erro ao guardar a foto. Tente novamente.');
    }
  };

  // Remover foto (volta ao avatar gerado a partir da inicial)
  window.removeProfilePhoto = async function () {
    if (!profile?.avatar_url) {
      if (typeof closeAvatarMenu === 'function') closeAvatarMenu();
      return;
    }
    const ok = await openConfirmModal({
      title: 'Remover foto de perfil?',
      message: 'Tem a certeza que pretende remover a foto de perfil? Esta ação não pode ser anulada.',
      confirmLabel: 'Remover',
      icon: 'image-off',
      danger: true,
    });
    if (!ok) return;
    try {
      await profileRemoveAvatar(currentUser.id);
      try {
        const cache = JSON.parse(localStorage.getItem('gpf_nav_v1') || 'null');
        if (cache) { cache.avatar = null; cache.avatar_url = null; localStorage.setItem('gpf_nav_v1', JSON.stringify(cache)); }
      } catch {}
      window.location.reload();
    } catch (err) {
      console.error('[removeProfilePhoto]', err);
      alert('Não foi possível remover a foto. Tente novamente.');
    }
  };

  // Save ONLY username (com confirmação)
  window.saveProfileUsername = async function () {
    const newUsername     = document.getElementById('edit-username').value.trim();
    const confirmUsername = document.getElementById('edit-username-confirm').value.trim();
    const msgEl           = document.getElementById('edit-username-msg');
    const currentUsername = (profile?.username || '').trim();

    function showErr(text) {
      if (msgEl) {
        msgEl.textContent = text;
        msgEl.className = 'text-[11px] text-red-500 mb-3';
        msgEl.classList.remove('hidden');
      } else {
        alert(text);
      }
    }
    if (msgEl) msgEl.classList.add('hidden');

    if (newUsername.length < 3) {
      showErr('O nome deve ter pelo menos 3 caracteres.');
      return;
    }
    if (!/^[a-z0-9_.-]+$/i.test(newUsername)) {
      showErr('O nome só pode conter letras, números, pontos, hifens e underscores.');
      return;
    }
    if (newUsername === currentUsername) {
      showErr('Indique um nome diferente do atual para fazer a alteração.');
      return;
    }
    if (!confirmUsername) {
      showErr('Volte a inserir o novo nome no campo de confirmação.');
      return;
    }
    if (newUsername !== confirmUsername) {
      showErr('Os nomes não coincidem. Confirme o mesmo nome nos dois campos.');
      return;
    }

    const btn = document.getElementById('edit-username-btn');
    btn.textContent = 'A guardar…';
    btn.disabled = true;

    try {
      await profileUpsert(currentUser.id, { username: newUsername });
      // Invalidate nav cache so header shows new username immediately
      try {
        const cache = JSON.parse(localStorage.getItem('gpf_nav_v1') || 'null');
        if (cache) {
          cache.username = newUsername;
          localStorage.setItem('gpf_nav_v1', JSON.stringify(cache));
        }
      } catch {}
      window.location.reload();
    } catch (err) {
      btn.textContent = 'Guardar Nome';
      btn.disabled = false;
      const msg = err?.message || '';
      if (msg.includes('unique') || msg.includes('duplicate') || msg.includes('profiles_username_key')) {
        showErr('Este nome de utilizador já está em uso. Escolha outro.');
      } else {
        showErr('Erro ao guardar o nome. Tente novamente.');
      }
    }
  };

  // Email change countdown
  let _emailResendInterval = null;
  let _pendingNewEmail = '';

  function startEmailResendCountdown(seconds = 60) {
    const btn   = document.getElementById('edit-email-resend-btn');
    const label = document.getElementById('edit-email-resend-label');
    if (!btn || !label) return;
    btn.disabled = true;
    let remaining = seconds;
    label.textContent = `Reenviar em ${remaining}s`;
    clearInterval(_emailResendInterval);
    _emailResendInterval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(_emailResendInterval);
        btn.disabled = false;
        label.textContent = 'Reenviar email';
      } else {
        label.textContent = `Reenviar em ${remaining}s`;
      }
    }, 1000);
  }

  window.resendEmailChange = async function () {
    if (!_pendingNewEmail) return;
    const btn   = document.getElementById('edit-email-resend-btn');
    const label = document.getElementById('edit-email-resend-label');
    if (btn) btn.disabled = true;
    if (label) label.textContent = 'A enviar…';
    await _sb.auth.updateUser({ email: _pendingNewEmail, options: { emailRedirectTo: `${location.origin}/perfil.html` } });
    startEmailResendCountdown(60);
    lucide.createIcons();
  };

  window.cancelEmailChange = function () {
    clearInterval(_emailResendInterval);
    _pendingNewEmail = '';
    document.getElementById('edit-email-success').classList.add('hidden');
    document.getElementById('edit-email-form').classList.remove('hidden');
    document.getElementById('edit-new-email').value = '';
  };

  // Save email
  window.saveProfileEmail = async function () {
    const newEmail = document.getElementById('edit-new-email').value.trim();
    const errEl = document.getElementById('edit-email-error');
    const btn = document.getElementById('edit-email-btn');
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      errEl.textContent = 'Introduza um email válido.';
      errEl.classList.remove('hidden');
      return;
    }
    if (newEmail.toLowerCase() === (currentUser?.email || '').toLowerCase()) {
      errEl.textContent = 'O novo email não pode ser igual ao email atual.';
      errEl.classList.remove('hidden');
      return;
    }
    errEl.classList.add('hidden');
    btn.textContent = 'A enviar…';
    btn.disabled = true;
    try {
      const { error } = await _sb.auth.updateUser({
        email: newEmail,
        options: { emailRedirectTo: `${location.origin}/perfil.html` },
      });
      btn.textContent = 'Alterar Email';
      btn.disabled = false;
      if (error) {
        errEl.textContent = 'Erro: ' + (error.message || 'Tente novamente.');
        errEl.classList.remove('hidden');
      } else {
        _pendingNewEmail = newEmail;
        localStorage.setItem('gpf_email_change_to', newEmail);
        localStorage.setItem('gpf_email_change_ts', Date.now().toString());
        document.getElementById('edit-email-form').classList.add('hidden');
        document.getElementById('edit-email-sent-to').textContent = newEmail;
        document.getElementById('edit-email-success').classList.remove('hidden');
        startEmailResendCountdown(60);
        lucide.createIcons();
      }
    } catch (err) {
      console.error('[saveProfileEmail]', err);
      btn.textContent = 'Alterar Email';
      btn.disabled = false;
      errEl.textContent = 'Erro de ligação. Verifique a sua internet e tente novamente.';
      errEl.classList.remove('hidden');
    }
  };

  // Save password
  window.saveProfilePassword = async function () {
    const currentPwInput = document.getElementById('edit-current-password');
    const skipCurrentPw  = currentPwInput?.closest('.pw-wrap')?.classList.contains('hidden');
    const currentPw = currentPwInput?.value || '';
    const newPw     = document.getElementById('edit-new-password').value;
    const confPw    = document.getElementById('edit-confirm-password').value;
    const msg = document.getElementById('edit-password-msg');
    const btn = document.getElementById('edit-password-btn');
    const defaultBtnLabel = skipCurrentPw ? 'Definir Palavra-passe' : 'Alterar Palavra-passe';
    if (!skipCurrentPw && !currentPw) {
      msg.textContent = 'Introduza a sua palavra-passe atual.';
      msg.className = 'text-[11px] text-red-400 mt-2';
      msg.classList.remove('hidden');
      return;
    }
    if (newPw.length < 6) {
      msg.textContent = 'A nova palavra-passe deve ter pelo menos 6 caracteres.';
      msg.className = 'text-[11px] text-red-400 mt-2';
      msg.classList.remove('hidden');
      return;
    }
    if (!skipCurrentPw && currentPw === newPw) {
      msg.textContent = 'A nova palavra-passe não pode ser igual à atual.';
      msg.className = 'text-[11px] text-red-400 mt-2';
      msg.classList.remove('hidden');
      return;
    }
    if (newPw !== confPw) {
      msg.textContent = 'As palavras-passe não coincidem.';
      msg.className = 'text-[11px] text-red-400 mt-2';
      msg.classList.remove('hidden');
      return;
    }
    btn.textContent = skipCurrentPw ? 'A definir…' : 'A alterar…';
    btn.disabled = true;
    try {
      if (!skipCurrentPw) {
        // Verify current password by re-authenticating
        const { error: signInErr } = await _sb.auth.signInWithPassword({
          email: currentUser.email,
          password: currentPw,
        });
        if (signInErr) {
          btn.textContent = defaultBtnLabel;
          btn.disabled = false;
          msg.textContent = 'Palavra-passe atual incorreta.';
          msg.className = 'text-[11px] text-red-400 mt-2';
          msg.classList.remove('hidden');
          return;
        }
      }
      const { error } = await _sb.auth.updateUser({
        password: newPw,
        data: { ...(currentUser?.user_metadata || {}), has_password: true },
      });
      btn.textContent = defaultBtnLabel;
      btn.disabled = false;
      if (error) {
        msg.textContent = 'Erro: ' + (error.message || 'Tente novamente.');
        msg.className = 'text-[11px] text-red-400 mt-2';
      } else {
        msg.textContent = skipCurrentPw ? 'Palavra-passe definida com sucesso.' : 'Palavra-passe alterada com sucesso.';
        msg.className = 'text-[11px] text-green-400 mt-2';
        if (currentPwInput) currentPwInput.value = '';
        document.getElementById('edit-new-password').value = '';
        document.getElementById('edit-confirm-password').value = '';
      }
      msg.classList.remove('hidden');
    } catch (err) {
      console.error('[saveProfilePassword]', err);
      btn.textContent = defaultBtnLabel;
      btn.disabled = false;
      msg.textContent = 'Erro de ligação. Verifique a sua internet e tente novamente.';
      msg.className = 'text-[11px] text-red-400 mt-2';
      msg.classList.remove('hidden');
    }
  };

  // ── Avatar cropper + edit/remove menu ─────────────────────────────────────
  // _croppedBlob é o JPEG 512×512 que sai do cropper; saveProfilePhoto usa-o.
  // _directUpload=true (vindo do "Alterar foto" do hover) salta o modal de
  // Editar Perfil e faz upload imediato após o crop.
  let _croppedBlob = null;
  let _cropObjectUrl = null;
  let _directUpload = false;

  document.getElementById('edit-avatar')?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    _croppedBlob = null;
    openCropper(file);
  });

  // Pequeno cropper circular: pan + zoom; output JPEG 512×512.
  function openCropper(file) {
    const overlay = document.getElementById('crop-overlay');
    const stage   = document.getElementById('crop-stage');
    const img     = document.getElementById('crop-img');
    const zoom    = document.getElementById('crop-zoom');

    if (_cropObjectUrl) URL.revokeObjectURL(_cropObjectUrl);
    _cropObjectUrl = URL.createObjectURL(file);
    img.src = _cropObjectUrl;
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    lucide.createIcons();

    const state = { tx: 0, ty: 0, scale: 1, baseScale: 1, natW: 0, natH: 0, dragging: false, lastX: 0, lastY: 0, pinch: null };

    function applyTransform() {
      const s = state.scale * state.baseScale;
      img.style.transform = `translate(calc(-50% + ${state.tx}px), calc(-50% + ${state.ty}px)) scale(${s})`;
      const pct = ((state.scale - 1) / 3) * 100;
      zoom.style.setProperty('--val', pct + '%');
    }

    function clamp() {
      // Mantém o círculo coberto pela imagem em todas as posições.
      const stageSize = stage.clientWidth;
      const sw = state.natW * state.baseScale * state.scale;
      const sh = state.natH * state.baseScale * state.scale;
      const maxX = Math.max(0, (sw - stageSize) / 2);
      const maxY = Math.max(0, (sh - stageSize) / 2);
      state.tx = Math.max(-maxX, Math.min(maxX, state.tx));
      state.ty = Math.max(-maxY, Math.min(maxY, state.ty));
    }

    function init() {
      state.natW = img.naturalWidth;
      state.natH = img.naturalHeight;
      const stageSize = stage.clientWidth;
      // baseScale = preencher o círculo (lado mais curto encosta no diâmetro)
      state.baseScale = stageSize / Math.min(state.natW, state.natH);
      state.scale = 1;
      state.tx = 0; state.ty = 0;
      zoom.value = '1';
      applyTransform();
    }

    if (img.complete && img.naturalWidth) init();
    else img.onload = init;

    // Browsers não renderizam HEIC/HEIF: fallback para upload directo do
    // ficheiro original (o servidor guarda; mantém-se como está).
    img.onerror = () => {
      _croppedBlob = null;
      close();
      const previewUrl = '';
      // Como não conseguimos pré-visualizar, usamos a inicial até guardar
      const wrap = document.getElementById('edit-avatar-preview');
      if (wrap) {
        wrap.innerHTML = `<div class="w-20 h-20 rounded-full bg-praia-teal-700 border-2 border-praia-yellow-400 flex items-center justify-center"><span class="font-display font-bold text-praia-yellow-400 text-2xl">${(profile?.username || '?').charAt(0).toUpperCase()}</span></div>`;
      }
      alert('Este formato de imagem (HEIC/HEIF) não é suportado para pré-visualização. Pode guardar na mesma, mas para resultados mais fiáveis exporte como JPEG ou PNG no telemóvel.');
      // Mantém o ficheiro original para upload directo
    };

    // ── Pan ──
    function onDown(e) {
      e.preventDefault();
      state.dragging = true;
      const p = pointFromEvent(e);
      state.lastX = p.x; state.lastY = p.y;
    }
    function onMove(e) {
      if (e.touches && e.touches.length === 2) { onPinch(e); return; }
      if (!state.dragging) return;
      e.preventDefault();
      const p = pointFromEvent(e);
      state.tx += p.x - state.lastX;
      state.ty += p.y - state.lastY;
      state.lastX = p.x; state.lastY = p.y;
      clamp(); applyTransform();
    }
    function onUp() {
      state.dragging = false;
      state.pinch = null;
    }
    function pointFromEvent(e) {
      if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    }

    function onWheel(e) {
      e.preventDefault();
      const delta = -e.deltaY / 400;
      state.scale = Math.max(1, Math.min(4, state.scale + delta));
      zoom.value = String(state.scale);
      clamp(); applyTransform();
    }

    function onPinch(e) {
      e.preventDefault();
      const [a, b] = e.touches;
      const dx = a.clientX - b.clientX, dy = a.clientY - b.clientY;
      const d  = Math.hypot(dx, dy);
      if (state.pinch === null) { state.pinch = { d, scale: state.scale }; return; }
      state.scale = Math.max(1, Math.min(4, state.pinch.scale * (d / state.pinch.d)));
      zoom.value = String(state.scale);
      clamp(); applyTransform();
    }

    function onZoomInput() {
      state.scale = parseFloat(zoom.value);
      clamp(); applyTransform();
    }

    stage.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    stage.addEventListener('touchstart', onDown, { passive: false });
    stage.addEventListener('touchmove', onMove, { passive: false });
    stage.addEventListener('touchend', onUp);
    stage.addEventListener('wheel', onWheel, { passive: false });
    zoom.addEventListener('input', onZoomInput);

    function cleanup() {
      stage.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      stage.removeEventListener('touchstart', onDown);
      stage.removeEventListener('touchmove', onMove);
      stage.removeEventListener('touchend', onUp);
      stage.removeEventListener('wheel', onWheel);
      zoom.removeEventListener('input', onZoomInput);
      document.getElementById('crop-cancel').onclick = null;
      document.getElementById('crop-confirm').onclick = null;
    }

    function close() {
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      cleanup();
    }

    document.getElementById('crop-cancel').onclick = () => {
      // Limpa a selecção para que o utilizador possa escolher outra
      document.getElementById('edit-avatar').value = '';
      close();
    };
    document.getElementById('crop-confirm').onclick = async () => {
      const blob = await renderCrop(img, stage.clientWidth, state);
      if (!blob) { alert('Não foi possível processar a imagem.'); return; }
      _croppedBlob = blob;
      const previewUrl = URL.createObjectURL(blob);
      document.getElementById('edit-avatar-preview').innerHTML =
        `<img src="${previewUrl}" alt="Preview" class="w-20 h-20 rounded-full object-cover border-2 border-praia-yellow-400">`;
      close();
      // Fluxo directo (a partir do lápis no hover): upload imediato,
      // sem passar pelo modal de Editar Perfil.
      if (_directUpload) {
        _directUpload = false;
        window.saveProfilePhoto();
      }
    };
  }

  function renderCrop(img, stageSize, state) {
    return new Promise(resolve => {
      const out = 512;
      const canvas = document.createElement('canvas');
      canvas.width = out; canvas.height = out;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';

      const s = state.scale * state.baseScale;
      const drawW = state.natW * s;
      const drawH = state.natH * s;
      // Origem do canvas representa o canto superior-esquerdo do círculo (stage).
      // A imagem no DOM aparece centrada com translate(-50% + tx, -50% + ty), em px do stage.
      const cx = stageSize / 2 + state.tx;
      const cy = stageSize / 2 + state.ty;
      const left = cx - drawW / 2;
      const top  = cy - drawH / 2;
      const ratio = out / stageSize;
      ctx.drawImage(img, left * ratio, top * ratio, drawW * ratio, drawH * ratio);
      canvas.toBlob(b => resolve(b), 'image/jpeg', 0.92);
    });
  }

  // ── Hover/click no avatar para abrir menu de acções ───────────────────────
  if (isOwnProfile) {
    const trigger    = document.getElementById('avatar-edit-trigger');
    const pop        = document.getElementById('avatar-actions-pop');
    const btnChange  = document.getElementById('avatar-action-change');
    const btnRemove  = document.getElementById('avatar-action-remove');

    function openAvatarMenu() {
      trigger.classList.add('is-open');
      pop.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      // Desactiva remover quando ainda não há foto
      btnRemove.disabled = !profile?.avatar_url;
    }
    window.closeAvatarMenu = function closeAvatarMenu() {
      trigger.classList.remove('is-open');
      pop.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
    };

    trigger?.addEventListener('click', e => {
      e.stopPropagation();
      pop.classList.contains('is-open') ? window.closeAvatarMenu() : openAvatarMenu();
    });
    trigger?.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAvatarMenu(); }
      if (e.key === 'Escape') window.closeAvatarMenu();
    });
    document.addEventListener('click', e => {
      if (!pop.classList.contains('is-open')) return;
      if (pop.contains(e.target) || trigger.contains(e.target)) return;
      window.closeAvatarMenu();
    });

    btnChange?.addEventListener('click', () => {
      window.closeAvatarMenu();
      _directUpload = true;
      _croppedBlob = null;
      const input = document.getElementById('edit-avatar');
      if (input) { input.value = ''; input.click(); }
    });
    btnRemove?.addEventListener('click', () => {
      window.closeAvatarMenu();
      window.removeProfilePhoto();
    });
  } else {
    // Em perfis de outros utilizadores, desactiva o trigger por completo
    const trigger = document.getElementById('avatar-edit-trigger');
    if (trigger) {
      trigger.removeAttribute('role');
      trigger.removeAttribute('tabindex');
      trigger.removeAttribute('aria-haspopup');
      trigger.style.cursor = 'default';
      trigger.classList.remove('avatar-edit-trigger');
      const overlay = trigger.querySelector('.avatar-edit-overlay');
      if (overlay) overlay.remove();
    }
  }

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

  // ── Encomendas (apenas perfil próprio) ────────────────────────────────────
  if (isOwnProfile && currentUser) {
    // Mostrar tab de encomendas
    const tabEncomendas = document.getElementById('tab-encomendas');
    if (tabEncomendas) tabEncomendas.classList.remove('hidden');

    // Carregar e renderizar encomendas
    async function renderOrders() {
      const container = document.getElementById('orders-list');
      if (!container) return;

      container.innerHTML = `
        <div class="flex items-center justify-center py-10">
          <div class="w-8 h-8 border-2 border-praia-teal-200 border-t-praia-teal-600 rounded-full animate-spin"></div>
        </div>`;

      try {
        const { data: orders, error } = await _sb
          .from('orders')
          .select('*')
          .eq('user_id', currentUser.id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        if (!orders || orders.length === 0) {
          container.innerHTML = `
            <div class="flex flex-col items-center justify-center text-center py-14 px-6">
              <div class="relative w-20 h-20 mb-5">
                <div class="absolute inset-0 rounded-full bg-praia-yellow-400/20 blur-xl"></div>
                <div class="relative w-20 h-20 rounded-full bg-praia-teal-800 flex items-center justify-center shadow-layered">
                  <i data-lucide="shopping-bag" class="w-9 h-9 text-praia-yellow-400"></i>
                </div>
              </div>
              <h3 class="font-display text-lg font-bold text-praia-teal-800 mb-1.5">Ainda não fez nenhuma encomenda</h3>
              <p class="text-sm text-praia-sand-500 max-w-xs mb-6">Descubra a loja oficial e leve consigo um pedacinho das praias fluviais.</p>
              <a href="loja.html" class="inline-flex items-center gap-2 bg-praia-teal-800 text-praia-yellow-400 font-display font-bold text-sm uppercase tracking-wider px-7 py-3.5 rounded-full shadow-layered hover:bg-praia-teal-700 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0">
                <i data-lucide="store" class="w-4 h-4"></i> Visitar Loja
              </a>
            </div>`;
          lucide.createIcons();
          return;
        }

        const statusColors = {
          pendente:    'bg-praia-sand-100 text-praia-sand-600',
          processado:  'bg-praia-teal-50 text-praia-teal-700',
          enviado:     'bg-blue-50 text-blue-700',
          entregue:    'bg-praia-green-500/10 text-praia-green-600',
          cancelado:   'bg-red-50 text-red-600',
        };
        const statusLabels = {
          pendente:   'Pendente',
          processado: 'Em processamento',
          enviado:    'Enviado',
          entregue:   'Entregue',
          cancelado:  'Cancelado',
        };

        function fmtPrice(cents) {
          return (cents / 100).toFixed(2).replace('.', ',') + '€';
        }

        container.innerHTML = orders.map(order => {
          const items = Array.isArray(order.items) ? order.items : [];
          const date  = new Date(order.created_at).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' });
          const statusCls = statusColors[order.status] || statusColors.pendente;
          const statusLbl = statusLabels[order.status] || order.status;
          const shortId   = order.id.slice(0, 8).toUpperCase();

          return `
            <div class="bg-white rounded-2xl border border-praia-sand-100 shadow-sm overflow-hidden">
              <div class="flex items-center justify-between px-5 py-4 border-b border-praia-sand-100">
                <div>
                  <p class="font-display font-bold text-praia-teal-800 text-sm">#${shortId}</p>
                  <p class="font-display text-xs text-praia-sand-400 mt-0.5">${date}</p>
                </div>
                <div class="flex items-center gap-3">
                  <span class="inline-flex items-center gap-1.5 font-display font-semibold text-xs px-3 py-1 rounded-full ${statusCls}">
                    ${statusLbl}
                  </span>
                  <span class="font-display font-bold text-praia-teal-800">${fmtPrice(order.total)}</span>
                </div>
              </div>
              ${items.length ? `
                <div class="px-5 py-3 space-y-1.5">
                  ${items.map(item => {
                    const details = [];
                    if (item.variant && item.variant !== 'sem-variante') details.push(`Tamanho: ${item.variant}`);
                    if (item.beach) details.push(`Praia: ${item.beach}`);
                    return `
                    <div class="flex justify-between text-sm items-start gap-4">
                      <div>
                        <span class="text-praia-sand-600 font-display">${item.name} × ${item.quantity}</span>
                        ${details.length ? `<div class="text-[11px] text-praia-teal-600 font-display mt-0.5">${details.join(' · ')}</div>` : ''}
                      </div>
                      <span class="font-display font-semibold text-praia-teal-800 flex-shrink-0">${item.price === 0 ? 'Grátis' : fmtPrice(item.price * item.quantity)}</span>
                    </div>`;
                  }).join('')}
                </div>
              ` : ''}
              <div class="px-5 py-3 bg-praia-sand-50 flex items-center gap-2 text-xs text-praia-sand-400 font-display">
                <i data-lucide="truck" class="w-3.5 h-3.5"></i>
                ${order.shipping_zone === 'ilhas' ? 'Açores / Madeira' : 'Portugal Continental'},
                ${order.shipping_price === 0 ? 'Envio grátis' : `Envio ${fmtPrice(order.shipping_price)}`}
              </div>
            </div>`;
        }).join('');

        lucide.createIcons();
      } catch (err) {
        console.error('Erro ao carregar encomendas:', err);
        container.innerHTML = `
          <div class="text-center py-12 text-praia-sand-400">
            <i data-lucide="alert-circle" class="w-8 h-8 mx-auto mb-2"></i>
            <p class="text-sm font-display">Erro ao carregar encomendas.</p>
          </div>`;
        lucide.createIcons();
      }
    }

    // Carregar quando tab for clicado (lazy)
    let _ordersLoaded = false;
    document.querySelector('[data-tab="orders"]')?.addEventListener('click', () => {
      if (!_ordersLoaded) { _ordersLoaded = true; renderOrders(); }
    });

    // Hash-based: abrir tab encomendas se URL tiver #orders
    if (window.location.hash === '#orders') {
      switchTab('orders');
      if (!_ordersLoaded) { _ordersLoaded = true; renderOrders(); }
    }
  }

  // ── Hash-based tab switch para outros tabs ─────────────────────────────
  const hashTab = window.location.hash.replace('#', '');
  if (hashTab && hashTab !== 'orders' && document.querySelector(`[data-tab="${hashTab}"]`)) {
    switchTab(hashTab);
  }

  // Reagir a mudanças de hash (ex: dropdown do header já estando em perfil.html)
  window.addEventListener('hashchange', () => {
    const h = window.location.hash.replace('#', '');
    if (!h) return;
    const tabBtn = document.querySelector(`[data-tab="${h}"]`);
    if (!tabBtn) return;
    if (h === 'orders') tabBtn.click(); else switchTab(h);
  });

  // ── Single lucide pass after all renders ────────────────────────────────────
  lucide.createIcons();

  // ── Show hidden sections ───────────────────────────────────────────────────
  document.getElementById('profile-loading')?.classList.add('hidden');
  document.getElementById('profile-content')?.classList.remove('hidden');

  // ── Email change success toast (localStorage, persists across tabs) ──────────
  const _pendingTo = localStorage.getItem('gpf_email_change_to');
  const _pendingTs = parseInt(localStorage.getItem('gpf_email_change_ts') || '0', 10);
  const _tsValid   = Date.now() - _pendingTs < 10 * 60 * 1000; // 10 min window
  if (_pendingTo && _tsValid && currentUser?.email?.toLowerCase() === _pendingTo.toLowerCase()) {
    localStorage.removeItem('gpf_email_change_to');
    localStorage.removeItem('gpf_email_change_ts');
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;background:#003A40;color:#FFEB3B;font-family:\'Poppins\',sans-serif;font-size:14px;font-weight:600;padding:14px 24px;border-radius:12px;box-shadow:0 8px 32px rgba(0,58,64,0.4);max-width:90vw;text-align:center;';
    t.textContent = `✓ Email alterado para ${_pendingTo} com sucesso`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 5000);
  }
});

// ── Share vote ───────────────────────────────────────────────────────────────
window.shareProfileVote = async function(beachName, beachId) {
  var photo = '';
  var municipality = '';
  if (beachId) {
    try {
      var beaches = await window.getBeaches();
      var b = beaches.find(function(x) { return x.id === beachId; });
      if (b) {
        photo = b.thumbnail || (b.photos && b.photos[0]) || '';
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
};

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
