// ─── Passaporte Digital ────────────────────────────────────────────────────────
// Stamps stored in Supabase. Falls back to localStorage for anonymous users.
// ─────────────────────────────────────────────────────────────────────────────

// ── Pré-carregamento imediato (sem esperar pelo DOM) ───
const _authEarlyPassport = window.AuthUtils ? AuthUtils.authGetUser() : null;
const _beachesEarlyPassport = window.getBeaches ? getBeaches().catch(() => null) : null;

document.addEventListener('DOMContentLoaded', async () => {
  const {
    authGetUser, profileGet, stampsGetAll, stampAdd, stampRemove,
    badgesCompute, badgesTopEarned, ALL_BADGES, BADGE_TIERS,
    badgeCardHTML, celebrateBadge, voteGet,
  } = AuthUtils;

  // ── Parallel: load beaches + auth (pre-started before DOM) ──────────────────
  const [beachesRaw, user] = await Promise.all([
    _beachesEarlyPassport || loadData('beaches').catch(() => null),
    _authEarlyPassport || authGetUser(),
  ]);

  let beaches = (beachesRaw || []).filter(b => !b.hidden);
  if (!beaches.length) { console.error('Failed to load beaches.json'); return; }

  // O álbum digital inclui todas as praias visíveis, mesmo as que não estão no
  // passaporte físico (`passportStamp: false`). O campo fica preservado para
  // efeitos editoriais do guia impresso, mas a experiência digital é universal.
  const stampBeaches   = beaches;
  const totalAvailable = stampBeaches.length;

  // Toast pós-migração de carimbos guest (fluxo QR). Disparado por auth.html
  // após _postAuthSync gravar a flag em sessionStorage.
  const _migratedRaw = sessionStorage.getItem('stamps_just_migrated');
  if (_migratedRaw && window._shareSheetToast) {
    const n = parseInt(_migratedRaw, 10) || 0;
    if (n > 0) {
      const plural = n === 1 ? 'carimbo guardado' : 'carimbos guardados';
      setTimeout(() => {
        window._shareSheetToast(`${n} ${plural} no seu passaporte!`);
      }, 600);
    }
    sessionStorage.removeItem('stamps_just_migrated');
  }

  // ── Parallel: profile + stamps + reviews + voted ────────────────────────────
  let stampMap = {};
  let reviews  = [];
  let voted    = false;
  let profile  = null;

  if (user) {
    const [profileRes, stampsRes, reviewsRes, votedRes] = await Promise.all([
      profileGet(user.id),
      stampsGetAll(user.id),
      AuthUtils.supabase.from('reviews').select('images').eq('user_id', user.id).then(r => r.data || []).catch(() => []),
      voteGet(user.id, new Date().getFullYear()).then(v => !!v).catch(() => false),
    ]);
    profile  = profileRes;
    stampMap  = Object.fromEntries(stampsRes.map(r => [r.beach_id, r.stamped_at]));
    reviews  = reviewsRes;
    voted    = votedRes;
  } else {
    // Fallback localStorage for guests
    try {
      const saved = JSON.parse(localStorage.getItem('passport_stamps') || '{}');
      stampMap = Object.fromEntries(
        Object.entries(saved).map(([k, v]) => [k, v.date || ''])
      );
    } catch { stampMap = {}; }
  }

  // ── Previous badge state (localStorage persists across sessions) ─────────────
  const storageKey  = user ? `badges_${user.id}` : 'badges_guest';
  const _storedRaw  = localStorage.getItem(storageKey);
  let   isFirstPageLoad = _storedRaw === null;
  let   prevEarned = new Set(JSON.parse(_storedRaw || '[]'));

  function getComputedBadges() {
    const stamps = Object.keys(stampMap).map(beach_id => ({
      beach_id,
      stamped_at: stampMap[beach_id] || new Date().toISOString().split('T')[0],
    }));
    return badgesCompute({ stamps, reviews, voted, beaches });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  function renderAll() {
    renderStats();
    renderGrid();
    renderBadges();
    lucide.createIcons();
  }

  function renderStats() {
    const validIds = new Set(stampBeaches.map(b => b.id));
    const count = Object.keys(stampMap).filter(id => validIds.has(id)).length;
    const pct   = totalAvailable > 0 ? Math.min(Math.round((count / totalAvailable) * 100), 100) : 0;

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('stat-collected',  count);
    setEl('stat-available',  totalAvailable);
    setEl('stat-percentage', pct + '%');

    const bar = document.getElementById('progress-bar');
    if (bar) setTimeout(() => { bar.style.width = pct + '%'; }, 150);
  }

  function renderGrid() {
    const container = document.getElementById('stamps-grid');
    if (!container) return;

    container.innerHTML = stampBeaches.map(beach => {
      const stamped   = !!stampMap[beach.id];
      const date      = stampMap[beach.id] || '';
      const shortName = beach.name
        .replace('Praia Fluvial de ', '')
        .replace('Praia Fluvial do ', '')
        .replace('Praia Fluvial da ', '')
        .replace('Zona de Fruição Ribeirinha da ', '');

      return `
        <div class="stamp-slot relative rounded-xl border-2 p-4 text-center cursor-pointer select-none group
             ${stamped
               ? 'bg-praia-yellow-50 border-praia-yellow-400 shadow-layered-yellow'
               : 'bg-praia-sand-100 border-praia-sand-200 hover:border-praia-sand-300'}"
             data-beach-id="${beach.id}"
             role="button" tabindex="0"
             aria-pressed="${stamped}">
          <div class="mb-2">
            ${stamped
              ? '<i data-lucide="check-circle-2" class="w-8 h-8 mx-auto text-praia-teal-700 transition-transform duration-300 group-hover:scale-110"></i>'
              : '<i data-lucide="lock" class="w-8 h-8 mx-auto text-praia-sand-300"></i>'}
          </div>
          <div class="font-display text-xs font-semibold leading-tight truncate
               ${stamped ? 'text-praia-teal-800' : 'text-praia-sand-400'}" title="${beach.name}">
            ${shortName}
          </div>
          <div class="text-[10px] mt-0.5 ${stamped ? 'text-praia-sand-500' : 'text-praia-sand-300'}">
            ${beach.municipality}
          </div>
          ${stamped && date ? `<div class="text-[10px] mt-1 text-praia-teal-500 font-display font-semibold">${date}</div>` : ''}
        </div>`;
    }).join('');

    // Interaction handlers
    container.querySelectorAll('.stamp-slot').forEach(el => {
      const go = () => toggleStamp(el.dataset.beachId);
      el.addEventListener('click', go);
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
    });
  }

  function renderBadges() {
    const grid = document.getElementById('badges-grid');
    if (!grid) return;

    const computed  = getComputedBadges();
    const tierOrder = ['bronze', 'prata', 'ouro', 'diamante', 'mitico'];
    const sorted    = [...computed].sort((a, b) => {
      if (a.earned !== b.earned) return a.earned ? -1 : 1;
      return tierOrder.indexOf(b.tier) - tierOrder.indexOf(a.tier);
    });

    grid.innerHTML = sorted.map(b => badgeCardHTML(b)).join('');

    // Badge unlock celebrations — only for genuinely new badges, never on first page load
    const earnedNow = new Set(computed.filter(b => b.earned).map(b => b.id));
    const newBadges = isFirstPageLoad
      ? []
      : computed.filter(b => b.earned && !prevEarned.has(b.id));

    if (newBadges.length > 0) {
      newBadges.slice(0, 3).forEach((badge, i) => {
        setTimeout(() => celebrateBadge(badge), i * 1800 + 600);
      });
    }

    // Persist to localStorage and update in-memory state for next call
    localStorage.setItem(storageKey, JSON.stringify([...earnedNow]));
    prevEarned = earnedNow;
    isFirstPageLoad = false;
  }

  // ── Toggle Stamp ─────────────────────────────────────────────────────────────

  let stampBusy = false;

  async function toggleStamp(beachId) {
    if (stampBusy) return;
    if (!user) {
      showAuthPrompt();
      return;
    }

    stampBusy = true;
    const wasStamped = !!stampMap[beachId];

    // Optimistic update
    if (wasStamped) {
      delete stampMap[beachId];
    } else {
      stampMap[beachId] = new Date().toISOString().split('T')[0];
    }
    renderAll();

    try {
      // Sync to Supabase
      const ok = wasStamped
        ? await stampRemove(user.id, beachId)
        : await stampAdd(user.id, beachId);

      if (!ok) {
        // Rollback
        if (wasStamped) stampMap[beachId] = new Date().toISOString().split('T')[0];
        else delete stampMap[beachId];
        renderAll();
      }
    } finally {
      stampBusy = false;
    }
  }

  // ── Auth Prompt ──────────────────────────────────────────────────────────────

  function showAuthPrompt() {
    const existing = document.getElementById('auth-prompt-overlay');
    if (existing) return;

    const el = document.createElement('div');
    el.id = 'auth-prompt-overlay';
    el.className = 'fixed inset-0 z-[2000] flex items-center justify-center p-4';
    el.style.cssText = 'background:rgba(0,0,0,0.65);backdrop-filter:blur(6px);';
    el.innerHTML = `
      <div class="relative rounded-3xl p-8 max-w-sm w-full text-center"
           style="background:linear-gradient(145deg,#003A40,#005D56);border:1px solid rgba(255,255,255,0.12);box-shadow:0 30px 80px rgba(0,0,0,0.5);">
        <button onclick="document.getElementById('auth-prompt-overlay').remove()"
                class="absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors">
          <i data-lucide="x" style="width:14px;height:14px;"></i>
        </button>
        <div class="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-praia-yellow-400/10">
          <i data-lucide="stamp" class="w-7 h-7 text-praia-yellow-400"></i>
        </div>
        <h3 class="font-display text-xl font-bold text-white mb-2">Guarde os seus carimbos</h3>
        <p class="text-white/50 text-sm mb-6">Crie uma conta gratuita para guardar o seu passaporte e ganhar badges.</p>
        <div class="flex flex-col gap-2">
          <a href="auth.html?redirect=passaporte.html"
             class="btn-primary block w-full bg-praia-yellow-400 text-praia-teal-800 font-display font-bold text-sm uppercase tracking-wider py-3 rounded-2xl shadow-layered-yellow">
            Criar Conta Grátis
          </a>
          <a href="auth.html?tab=login&redirect=passaporte.html"
             class="text-white/50 text-sm font-display font-semibold hover:text-white/80 transition-colors py-2">
            Já tenho conta? Entrar
          </a>
        </div>
      </div>`;
    document.body.appendChild(el);
    lucide.createIcons();
    el.addEventListener('click', e => { if (e.target === el) el.remove(); });
  }

  // ── Show/hide guest banner ────────────────────────────────────────────────
  if (!user) {
    const banner = document.getElementById('guest-banner');
    if (banner) banner.classList.remove('hidden');
  } else {
    const userNameEl = document.getElementById('passport-username');
    if (userNameEl) userNameEl.textContent = profile?.username || user.email?.split('@')[0] || '';
  }

  // ── Initial render ────────────────────────────────────────────────────────
  renderAll();
});
