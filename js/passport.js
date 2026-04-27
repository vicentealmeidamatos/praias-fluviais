// ─── Passaporte Digital ────────────────────────────────────────────────────────
// Stamps stored in Supabase. Falls back to localStorage for anonymous users.
//
// Render strategy (perf):
//  1. Pre-start beaches + auth fetches before DOM is ready.
//  2. As soon as beaches resolve, render the album/badges/progress instantly
//     using cached data from localStorage (per-user cache for logged-in users,
//     `passport_stamps` for guests).
//  3. Fetch fresh data from Supabase in background; re-render on arrival and
//     refresh the localStorage cache so next visit is again instant.
//  4. Stamp slots use inline SVGs (lucide.createIcons() on 200+ icons was
//     dominating render time).
// ─────────────────────────────────────────────────────────────────────────────

// ── Pré-carregamento imediato (sem esperar pelo DOM) ───
const _authEarlyPassport = window.AuthUtils ? AuthUtils.authGetUser() : null;
const _beachesEarlyPassport = window.getBeaches ? getBeaches().catch(() => null) : null;

// ── Inline SVGs: evitam a chamada cara ao lucide.createIcons() para 200+ slots
const SVG_CHECK_CIRCLE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8 mx-auto text-praia-teal-700 transition-transform duration-300 group-hover:scale-110"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>';
const SVG_LOCK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8 mx-auto text-praia-sand-300"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

document.addEventListener('DOMContentLoaded', async () => {
  const {
    authGetUser, profileGet, stampsGetAll,
    badgesCompute, badgesTopEarned, ALL_BADGES, BADGE_TIERS,
    badgeCardHTML, celebrateBadge, voteGet,
  } = AuthUtils;

  // ── Wait only for beaches: that's the only blocking dependency for the
  // initial paint. Auth + Supabase queries run in background afterwards.
  const beachesRaw = await (_beachesEarlyPassport || loadData('beaches').catch(() => null));
  let beaches = (beachesRaw || []).filter(b => !b.hidden);
  if (!beaches.length) { console.error('Failed to load beaches.json'); return; }

  // O álbum digital inclui todas as praias visíveis, mesmo as que não estão no
  // passaporte físico (`passportStamp: false`). O campo fica preservado para
  // efeitos editoriais do guia impresso, mas a experiência digital é universal.
  const stampBeaches = [...beaches].sort((a, b) => {
    const muni = (a.municipality || '').localeCompare(b.municipality || '', 'pt');
    return muni !== 0 ? muni : (a.name || '').localeCompare(b.name || '', 'pt');
  });
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

  // ── Resolve user (already pre-fetched) ──────────────────────────────────────
  const user = await (_authEarlyPassport || authGetUser());

  // ── Cache helpers ───────────────────────────────────────────────────────────
  const cacheKey = user ? `passport_cache_${user.id}` : null;

  function readCachedState() {
    if (!cacheKey) return null;
    try { return JSON.parse(localStorage.getItem(cacheKey) || 'null'); }
    catch { return null; }
  }
  function writeCachedState(state) {
    if (!cacheKey) return;
    try { localStorage.setItem(cacheKey, JSON.stringify(state)); } catch {}
  }

  // ── Initial state from cache (for instant first paint) ──────────────────────
  let stampMap = {};
  let reviews  = [];
  let voted    = false;
  let profile  = null;

  if (user) {
    const cached = readCachedState();
    if (cached) {
      stampMap = cached.stampMap || {};
      reviews  = cached.reviews  || [];
      voted    = !!cached.voted;
    }
  } else {
    try {
      const saved = JSON.parse(localStorage.getItem('passport_stamps') || '{}');
      stampMap = Object.fromEntries(
        Object.entries(saved).map(([k, v]) => [k, v.date || ''])
      );
    } catch { stampMap = {}; }
  }

  // ── Visit history ────────────────────────────────────────────────────────
  // Devolve a lista de datas (ISO, mais recente primeiro) para uma praia.
  // Para utilizadores autenticados consulta `stamp_visits`; para guests lê
  // do localStorage. Se não houver histórico mas existir carimbo (legado),
  // devolve essa data como entrada única.
  async function getVisitHistory(beach) {
    if (!beach) return [];
    if (user) {
      try {
        const rows = await AuthUtils.visitsGetForBeach(user.id, beach.id);
        const list = (rows || []).map(r => r.visited_at).filter(Boolean);
        if (list.length) return list;
      } catch (err) {
        console.warn('[getVisitHistory] supabase error:', err);
      }
      const fallback = stampMap[beach.id];
      return fallback ? [fallback] : [];
    }
    try {
      const saved = JSON.parse(localStorage.getItem('passport_stamps') || '{}');
      const entry = saved[beach.id];
      if (!entry) return [];
      const list = Array.isArray(entry.visits) && entry.visits.length
        ? entry.visits
        : (entry.date ? [entry.date] : []);
      return [...list].sort((a, b) => b.localeCompare(a));
    } catch {
      return [];
    }
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

  function renderAll(opts = {}) {
    renderStats();
    renderGrid();
    renderBadges(opts);
    if (window.lucide) lucide.createIcons();
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
    if (bar) bar.style.width = pct + '%';
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
             aria-label="${beach.name}${stamped ? ' — visitada' : ' — por visitar'}">
          <div class="mb-2">
            ${stamped ? SVG_CHECK_CIRCLE : SVG_LOCK}
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

    // Click → mostrar data de visita ou hint para carimbar via QR
    container.querySelectorAll('.stamp-slot').forEach(el => {
      const beachId = el.dataset.beachId;
      const beach = stampBeaches.find(b => b.id === beachId);
      const go = () => showVisitInfo(beach);
      el.addEventListener('click', go);
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
    });
  }

  function renderBadges({ persist = true } = {}) {
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

    // Persist to localStorage and update in-memory state. Skipped for the
    // initial cached render to avoid overwriting the authoritative state
    // written by qr-stamp.js (would otherwise cause double-celebrations).
    if (persist) {
      localStorage.setItem(storageKey, JSON.stringify([...earnedNow]));
      prevEarned = earnedNow;
      isFirstPageLoad = false;
    }
  }

  // ── Visit Info Modal ────────────────────────────────────────────────────────
  // O carimbo ocorre apenas via QR Code na praia. Aqui só mostramos a
  // informação de visita: data registada, ou um lembrete de como carimbar.

  function formatStampDate(iso) {
    if (!iso) return '';
    const months = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
  }

  function formatStampDateShort(iso) {
    if (!iso) return '';
    const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  function visitHistoryHTML(visits) {
    if (!visits.length) return '';

    if (visits.length === 1) {
      return `
        <div class="mt-5 pt-5 border-t border-praia-sand-200">
          <p class="font-display text-[10px] uppercase tracking-[0.14em] text-praia-sand-400 mb-1">Data da visita</p>
          <p class="font-display text-base font-bold text-praia-teal-800">${formatStampDate(visits[0])}</p>
        </div>`;
    }

    const [latest, ...older] = visits;
    const olderHtml = older.map((d, i) => {
      const ordinal = visits.length - 1 - i;
      return `
        <li class="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-praia-sand-50 transition-colors">
          <span class="font-display text-sm font-semibold text-praia-teal-800">${formatStampDateShort(d)}</span>
          <span class="font-display text-[10px] uppercase tracking-wider text-praia-sand-400">${ordinal}.ª visita</span>
        </li>`;
    }).join('');

    return `
      <div class="mt-5 pt-5 border-t border-praia-sand-200 text-left">
        <div class="flex items-center justify-between mb-3">
          <p class="font-display text-[10px] uppercase tracking-[0.14em] text-praia-sand-400">Histórico de visitas</p>
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-praia-teal-800 text-praia-yellow-400 font-display text-[10px] font-bold uppercase tracking-wider">
            ${visits.length} visitas
          </span>
        </div>
        <div class="rounded-xl bg-praia-yellow-50 border border-praia-yellow-200 p-3 mb-2">
          <p class="font-display text-[10px] uppercase tracking-[0.14em] text-praia-teal-600 mb-0.5">Última visita</p>
          <p class="font-display text-base font-bold text-praia-teal-800">${formatStampDate(latest)}</p>
        </div>
        <ul class="space-y-0.5">${olderHtml}</ul>
      </div>`;
  }

  async function showVisitInfo(beach) {
    if (!beach) return;
    const stamped = !!stampMap[beach.id];
    const photo = beach.thumbnail || (beach.photos && beach.photos[0]) || '';
    const existing = document.getElementById('visit-info-overlay');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.id = 'visit-info-overlay';
    el.className = 'fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-0 sm:p-4';
    el.style.cssText = 'background:rgba(0,20,24,0.65);backdrop-filter:blur(6px);';

    const close = () => el.remove();

    if (stamped) {
      const initialDate = stampMap[beach.id] || '';
      const initialHistory = initialDate ? visitHistoryHTML([initialDate]) : '';
      el.innerHTML = `
        <div class="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"
             style="box-shadow:0 30px 80px rgba(0,0,0,0.45);">
          <button id="visit-info-close" class="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/45 text-white flex items-center justify-center hover:bg-black/60 transition-colors" aria-label="Fechar">
            <i data-lucide="x" style="width:14px;height:14px;"></i>
          </button>
          ${photo ? `<div class="h-32 sm:h-40 bg-cover bg-center" style="background-image:url('${photo}')"></div>` : ''}
          <div class="p-5 text-center">
            <div class="inline-flex items-center gap-1.5 mb-3 px-3 py-1 rounded-full bg-praia-teal-800 text-praia-yellow-400 font-display text-[10px] font-bold uppercase tracking-wider">
              <i data-lucide="check-circle-2" style="width:13px;height:13px;"></i> Visita registada
            </div>
            <h3 class="font-display text-xl font-bold text-praia-teal-800 leading-tight">${beach.name}</h3>
            <p class="text-xs text-praia-sand-500 mt-1">${beach.municipality || ''} ${beach.river ? '· ' + beach.river : ''}</p>
            <div id="visit-history-slot">${initialHistory}</div>
            <a href="praia.html?id=${beach.id}" class="mt-5 inline-flex items-center justify-center gap-1.5 w-full bg-praia-teal-800 text-praia-yellow-400 font-display font-bold text-xs uppercase tracking-wider px-4 py-3 rounded-full hover:opacity-90 active:scale-[0.98] transition-all">
              Ver página da praia <i data-lucide="arrow-right" style="width:14px;height:14px;"></i>
            </a>
          </div>
        </div>`;
      // Carregar histórico completo (pode trazer mais visitas que o stampMap)
      getVisitHistory(beach).then(visits => {
        const slot = el.querySelector('#visit-history-slot');
        if (!slot) return;
        if (visits.length) {
          slot.innerHTML = visitHistoryHTML(visits);
          lucide.createIcons();
        }
      }).catch(() => {});
    } else {
      el.innerHTML = `
        <div class="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"
             style="box-shadow:0 30px 80px rgba(0,0,0,0.45);">
          <button id="visit-info-close" class="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/40 text-white/90 flex items-center justify-center hover:bg-black/60 transition-colors" aria-label="Fechar">
            <i data-lucide="x" style="width:14px;height:14px;"></i>
          </button>
          ${photo ? `<div class="h-32 sm:h-40 bg-cover bg-center" style="background-image:url('${photo}');filter:grayscale(0.4) brightness(0.85)"></div>` : ''}
          <div class="p-5 text-center">
            <div class="w-12 h-12 mx-auto rounded-2xl bg-praia-sand-100 flex items-center justify-center mb-3">
              <i data-lucide="qr-code" class="w-6 h-6 text-praia-teal-700"></i>
            </div>
            <h3 class="font-display text-lg font-bold text-praia-teal-800 leading-tight">${beach.name}</h3>
            <p class="text-xs text-praia-sand-500 mt-1">${beach.municipality || ''} ${beach.river ? '· ' + beach.river : ''}</p>
            <p class="text-sm text-praia-sand-600 mt-4 leading-relaxed">
              Ainda não tem este carimbo. Visite a praia e digitalize o <strong>QR Code</strong> no local para carimbar.
            </p>
            <a href="praia.html?id=${beach.id}" class="mt-5 inline-flex items-center justify-center gap-1.5 w-full bg-praia-teal-800 text-praia-yellow-400 font-display font-bold text-xs uppercase tracking-wider px-4 py-3 rounded-full hover:opacity-90 active:scale-[0.98] transition-all">
              Ver página da praia <i data-lucide="arrow-right" style="width:14px;height:14px;"></i>
            </a>
          </div>
        </div>`;
    }

    document.body.appendChild(el);
    lucide.createIcons();
    el.addEventListener('click', e => { if (e.target === el) close(); });
    el.querySelector('#visit-info-close')?.addEventListener('click', close);
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); }
    });
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
  }

  // ── Initial render — instant from cache (or empty state) ────────────────────
  // Persist=false on the badges render so we don't overwrite the authoritative
  // badge state (e.g. set by qr-stamp.js after a fresh stamp) with stale cache.
  renderAll({ persist: !user });

  // ── Background: fetch fresh data and re-render once it arrives ──────────────
  if (user) {
    Promise.all([
      profileGet(user.id),
      stampsGetAll(user.id),
      AuthUtils.supabase.from('reviews').select('images').eq('user_id', user.id).then(r => r.data || []).catch(() => []),
      voteGet(user.id, new Date().getFullYear()).then(v => !!v).catch(() => false),
    ]).then(([profileRes, stampsRes, reviewsRes, votedRes]) => {
      profile  = profileRes;
      stampMap = Object.fromEntries(stampsRes.map(r => [r.beach_id, r.stamped_at]));
      reviews  = reviewsRes;
      voted    = votedRes;

      // Refresh cache for next visit
      writeCachedState({ stampMap, reviews, voted });

      // Re-render with fresh data; persist badges cache now (authoritative).
      renderAll({ persist: true });

      const userNameEl = document.getElementById('passport-username');
      if (userNameEl) userNameEl.textContent = profile?.username || user.email?.split('@')[0] || '';
    }).catch(err => console.warn('[passport] fresh data fetch failed:', err));
  }
});
