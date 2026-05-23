// ─── Supabase Auth & Platform Utilities ──────────────────────────────────────
// ⚠️  Substitua os valores abaixo pelas credenciais do seu projeto Supabase:
//     Dashboard → Settings → API → Project URL + anon public key
// ─────────────────────────────────────────────────────────────────────────────
const SUPABASE_URL      = 'https://tjvhnbukzfyxtpkrhpsw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ke--Q7xNRNCxTjgxFCNFIQ_6zPD3zM3';

const { createClient } = window.supabase;
const _sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Auth State ───────────────────────────────────────────────────────────────

let _authUserPromise = null;
async function authGetUser() {
  if (!_authUserPromise) {
    _authUserPromise = _sb.auth.getUser().then(({ data: { user } }) => user);
  }
  return _authUserPromise;
}

async function authGetSession() {
  const { data: { session } } = await _sb.auth.getSession();
  return session;
}

async function authSignOut() {
  _authUserPromise = null;
  await _sb.auth.signOut();
  window.location.href = 'index.html';
}

// ─── Modal de confirmação reutilizável (global) ───
// Devolve uma Promise<boolean>: true se o utilizador confirmou.
function _ensureConfirmModal() {
  let overlay = document.getElementById('confirm-modal');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'confirm-modal';
  overlay.className = 'confirm-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <div class="confirm-shell" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title" aria-describedby="confirm-modal-message">
      <div id="confirm-modal-icon" class="confirm-icon is-danger">
        <i data-lucide="alert-triangle" class="w-5 h-5"></i>
      </div>
      <h3 id="confirm-modal-title" class="confirm-title">Confirmar ação</h3>
      <p id="confirm-modal-message" class="confirm-message">Tem a certeza que pretende continuar?</p>
      <div class="confirm-actions">
        <button type="button" id="confirm-modal-cancel" class="confirm-btn-cancel">Cancelar</button>
        <button type="button" id="confirm-modal-ok" class="confirm-btn-confirm is-danger">Confirmar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

window.openConfirmModal = function ({
  title = 'Confirmar ação',
  message = 'Tem a certeza que pretende continuar?',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  icon = 'alert-triangle',
  danger = true,
} = {}) {
  return new Promise((resolve) => {
    const overlay   = _ensureConfirmModal();
    const titleEl   = document.getElementById('confirm-modal-title');
    const msgEl     = document.getElementById('confirm-modal-message');
    const okBtn     = document.getElementById('confirm-modal-ok');
    const cancelBtn = document.getElementById('confirm-modal-cancel');
    const iconWrap  = document.getElementById('confirm-modal-icon');

    if (!overlay || !okBtn || !cancelBtn) {
      resolve(window.confirm(message));
      return;
    }

    titleEl.textContent   = title;
    msgEl.textContent     = message;
    okBtn.textContent     = confirmLabel;
    cancelBtn.textContent = cancelLabel;
    okBtn.className       = 'confirm-btn-confirm' + (danger ? ' is-danger' : '');
    iconWrap.className    = 'confirm-icon ' + (danger ? 'is-danger' : 'is-warning');
    iconWrap.innerHTML    = `<i data-lucide="${icon}" class="w-5 h-5"></i>`;
    if (window.lucide) lucide.createIcons();

    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    function cleanup(result) {
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }
    function onOk()       { cleanup(true); }
    function onCancel()   { cleanup(false); }
    function onBackdrop(e){ if (e.target === overlay) cleanup(false); }
    function onKey(e)     {
      if (e.key === 'Escape') { e.preventDefault(); cleanup(false); }
      else if (e.key === 'Enter') { e.preventDefault(); cleanup(true); }
    }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
    setTimeout(() => okBtn.focus(), 60);
  });
};

// Sign-out com aviso de confirmação (usado pelo dropdown do header e perfil)
async function authSignOutConfirm() {
  const ok = await window.openConfirmModal({
    title: 'Terminar sessão?',
    message: 'Vai sair da sua conta neste dispositivo. Pode iniciar sessão novamente em qualquer altura.',
    confirmLabel: 'Terminar sessão',
    icon: 'log-out',
    danger: true,
  });
  if (!ok) return;
  await authSignOut();
}
window.authSignOutConfirm = authSignOutConfirm;

// ─── Profile ──────────────────────────────────────────────────────────────────

async function profileGet(userId) {
  const { data } = await _sb
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return data || null;
}

// Atualiza um perfil existente; se ainda não existir, cria-o com defaults
// derivados da sessão. Evita o erro NOT NULL em `username` quando se chama
// profileUpsert(id, { avatar_url }) num utilizador sem linha de profile.
async function profileUpsert(userId, fields) {
  const { data: updated, error: updateErr } = await _sb
    .from('profiles')
    .update(fields)
    .eq('id', userId)
    .select('id');
  if (updateErr) throw updateErr;
  if (updated && updated.length > 0) return true;

  const { data: { user } } = await _sb.auth.getUser();
  const fallbackUsername =
    user?.user_metadata?.username
    || user?.user_metadata?.full_name?.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_.-]/g, '').slice(0, 24)
    || user?.email?.split('@')[0]
    || `user_${userId.slice(0, 8)}`;

  const insertRow = {
    id: userId,
    username: fallbackUsername,
    email: user?.email || null,
    ...fields,
  };
  const { error: insertErr } = await _sb.from('profiles').insert(insertRow);
  if (insertErr) throw insertErr;
  return true;
}

async function profileUploadAvatar(userId, fileOrBlob, fileName) {
  // Aceita File (do <input>) ou Blob (do cropper). Quando é Blob,
  // forçamos JPEG por ser o output do canvas no fluxo de crop.
  const isBlob = fileOrBlob instanceof Blob && !(fileOrBlob instanceof File);
  const name = fileName || fileOrBlob.name || 'avatar.jpg';
  const ext = isBlob ? 'jpg' : (name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${userId}/avatar.${ext}`;
  const contentType = fileOrBlob.type || 'image/' + (ext === 'jpg' ? 'jpeg' : ext);
  const { error } = await _sb.storage
    .from('avatars')
    .upload(path, fileOrBlob, { upsert: true, contentType });
  if (error) {
    console.error('[profileUploadAvatar] upload error:', error.message);
    return null;
  }
  const { data } = _sb.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl + '?t=' + Date.now();
}

// Remove a foto de perfil: limpa avatar_url e apaga ficheiros conhecidos
// no bucket. As remoções no storage são best-effort — o que importa para a
// UI é o avatar_url ficar null para o helper voltar à inicial do nome.
async function profileRemoveAvatar(userId) {
  const { error } = await _sb
    .from('profiles')
    .update({ avatar_url: null })
    .eq('id', userId);
  if (error) throw error;
  const candidates = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif']
    .map(ext => `${userId}/avatar.${ext}`);
  try { await _sb.storage.from('avatars').remove(candidates); } catch {}
  return true;
}

// ─── Stamps ───────────────────────────────────────────────────────────────────

async function stampsGetAll(userId) {
  const { data } = await _sb
    .from('stamps')
    .select('beach_id, stamped_at')
    .eq('user_id', userId);
  return data || [];
}

async function stampAdd(userId, beachId) {
  const { error } = await _sb.from('stamps').upsert(
    { user_id: userId, beach_id: beachId, stamped_at: new Date().toISOString().split('T')[0] },
    { onConflict: 'user_id,beach_id' }
  );
  if (error) console.error('[stampAdd] Supabase error:', error);
  return !error;
}

async function stampRemove(userId, beachId) {
  const { error } = await _sb
    .from('stamps')
    .delete()
    .eq('user_id', userId)
    .eq('beach_id', beachId);
  if (error) console.error('[stampRemove] Supabase error:', error);
  return !error;
}

// ─── Visit history (append-only) ─────────────────────────────────────────────
// Cada digitalização de QR insere uma linha em `stamp_visits`, mesmo que a
// praia já tenha sido carimbada. A tabela `stamps` permanece como "praia
// desbloqueada" (uma linha por user/praia) para badges e contagens.

async function visitAdd(userId, beachId, visitedAt) {
  if (!userId || !beachId) return false;
  const row = { user_id: userId, beach_id: beachId };
  if (visitedAt) row.visited_at = visitedAt;
  const { error } = await _sb.from('stamp_visits').insert(row);
  if (error) console.error('[visitAdd] Supabase error:', error);
  return !error;
}

async function visitsGetForBeach(userId, beachId) {
  if (!userId || !beachId) return [];
  const { data } = await _sb
    .from('stamp_visits')
    .select('visited_at, created_at')
    .eq('user_id', userId)
    .eq('beach_id', beachId)
    .order('visited_at', { ascending: false })
    .order('created_at', { ascending: false });
  return data || [];
}

// Migra carimbos guardados em localStorage (fluxo guest do QR) para a conta Supabase.
// Chamado após qualquer login/registo bem-sucedido em auth.html.
//
// Shape do localStorage (`passport_stamps[beachId]`):
//   { date: "2025-07-12", visits: ["2025-07-12", "2025-08-03"] }
// `visits` pode estar ausente (entradas antigas) — nesse caso, usa `[date]`.
async function stampsSyncFromLocal(userId) {
  if (!userId) return { migrated: 0, total: 0 };

  // Migrar estado das medalhas (guest → user). Independente da migração de
  // carimbos: garante que a celebração diferida (gravada em
  // `badges_pending_guest` pelo qr-stamp.js) seja emitida na passaporte.html
  // depois do registo/login. Sem isto, o utilizador acabado de se registar
  // perdia o overlay da medalha conquistada antes de criar conta.
  try {
    const guestPending = JSON.parse(localStorage.getItem('badges_pending_guest') || '[]') || [];
    if (guestPending.length) {
      const userPendingKey = `badges_pending_${userId}`;
      const userPending = JSON.parse(localStorage.getItem(userPendingKey) || '[]') || [];
      const merged = Array.from(new Set([...userPending, ...guestPending]));
      localStorage.setItem(userPendingKey, JSON.stringify(merged));
      localStorage.removeItem('badges_pending_guest');
    }
    // O snapshot guest deixa de ser relevante e poderia induzir em erro caso
    // o utilizador fizesse logout depois.
    localStorage.removeItem('badges_guest');
  } catch (err) {
    console.warn('[stampsSyncFromLocal] badge migration failed:', err);
  }

  let local;
  try {
    local = JSON.parse(localStorage.getItem('passport_stamps') || '{}');
  } catch {
    localStorage.removeItem('passport_stamps');
    return { migrated: 0, total: 0 };
  }
  const ids = Object.keys(local || {});
  if (!ids.length) return { migrated: 0, total: 0 };

  const stampResults = await Promise.all(ids.map(id => stampAdd(userId, id)));
  const migrated = stampResults.filter(Boolean).length;

  // Migrar histórico de visitas (uma linha por data por praia).
  const visitRows = [];
  ids.forEach(id => {
    const entry = local[id] || {};
    const list = Array.isArray(entry.visits) && entry.visits.length
      ? entry.visits
      : (entry.date ? [entry.date] : []);
    list.forEach(d => {
      if (typeof d === 'string' && d) visitRows.push({ user_id: userId, beach_id: id, visited_at: d });
    });
  });
  if (visitRows.length) {
    const { error } = await _sb.from('stamp_visits').insert(visitRows);
    if (error) console.error('[stampsSyncFromLocal] visit insert error:', error);
  }

  if (migrated === ids.length) localStorage.removeItem('passport_stamps');
  return { migrated, total: ids.length };
}

// ─── Votes ────────────────────────────────────────────────────────────────────

async function voteGet(userId, year) {
  const { data } = await _sb
    .from('votes')
    .select('beach_id')
    .eq('user_id', userId)
    .eq('year', year)
    .maybeSingle();
  return data?.beach_id || null;
}

// Returns full vote row: { beach_id, is_public } or null
async function voteGetFull(userId, year) {
  const { data } = await _sb
    .from('votes')
    .select('beach_id, is_public')
    .eq('user_id', userId)
    .eq('year', year)
    .maybeSingle();
  return data || null;
}

async function voteSubmit(userId, beachId, year, isPublic = true) {
  const { error } = await _sb
    .from('votes')
    .insert({ user_id: userId, beach_id: beachId, year, is_public: isPublic });
  return !error;
}

async function voteUpdatePublic(userId, year, isPublic) {
  const { error } = await _sb
    .from('votes')
    .update({ is_public: isPublic })
    .eq('user_id', userId)
    .eq('year', year);
  return !error;
}

// ─── Reviews ──────────────────────────────────────────────────────────────────

async function reviewsGetForBeach(beachId) {
  const { data } = await _sb
    .from('reviews')
    .select('*, profiles(id, username, avatar_url), parent_id, deleted_by_admin')
    .eq('beach_id', beachId)
    .order('created_at', { ascending: true });
  return data || [];
}

async function reviewSubmitReply(userId, beachId, text, parentId, images = []) {
  const { error } = await _sb
    .from('reviews')
    .insert({ user_id: userId, beach_id: beachId, text, images, parent_id: parentId });
  return !error;
}

async function reviewsGetForUser(userId) {
  const { data } = await _sb
    .from('reviews')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return data || [];
}

async function reviewSubmit(userId, beachId, text, images = []) {
  const { error } = await _sb
    .from('reviews')
    .insert({ user_id: userId, beach_id: beachId, text, images });
  return !error;
}

async function reviewDelete(reviewId, userId) {
  const { error } = await _sb
    .from('reviews')
    .delete()
    .eq('id', reviewId)
    .eq('user_id', userId);
  return !error;
}

// ─── Badge System ─────────────────────────────────────────────────────────────

const BADGE_TIERS = {
  bronze:   { label: 'Bronze',   hex: '#CD7F32', glow: 'rgba(205,127,50,0.6)',   shimmer: false, rainbow: false, gradient: 'linear-gradient(135deg,#F5DEB3 0%,#E09040 30%,#CD7F32 60%,#A05A20 100%)' },
  prata:    { label: 'Prata',    hex: '#C8D6DF', glow: 'rgba(200,214,223,0.7)',  shimmer: true,  rainbow: false, gradient: 'linear-gradient(135deg,#FFFFFF 0%,#E8EEF2 25%,#C0D0D8 55%,#8FA8B8 100%)' },
  ouro:     { label: 'Ouro',     hex: '#FFD700', glow: 'rgba(255,215,0,0.85)',   shimmer: true,  rainbow: false, gradient: 'linear-gradient(135deg,#FFFFFF 0%,#FFE44D 20%,#FFD700 45%,#E6A800 75%,#B87800 100%)' },
  diamante: { label: 'Diamante', hex: '#B9F2FF', glow: 'rgba(185,242,255,0.7)',  shimmer: true,  rainbow: false },
  mitico:   { label: 'Mítico',   hex: '#90E2F0', glow: 'rgba(144,226,240,0.75)', shimmer: true,  rainbow: true  },
};

const ALL_BADGES = [
  // ── Bronze ───────────────────────────────────────────────────────────────
  { id: 'primeira-gota',     name: 'Primeira Gota',        desc: 'Carimbou a sua primeira praia fluvial',          icon: 'droplets',       tier: 'bronze',   type: 'stamps',             threshold: 1  },
  { id: 'explorador',        name: 'Explorador',            desc: 'Visitou 5 praias fluviais',                      icon: 'compass',        tier: 'bronze',   type: 'stamps',             threshold: 5  },
  { id: 'eleitor',           name: 'Eleitor',               desc: 'Participou na votação Praia do Ano',             icon: 'vote',           tier: 'bronze',   type: 'voted'                             },
  { id: 'voz-comunidade',    name: 'Voz da Comunidade',     desc: 'Publicou 3 comentários numa praia',              icon: 'message-circle', tier: 'bronze',   type: 'reviews',            threshold: 3  },
  // ── Prata ────────────────────────────────────────────────────────────────
  { id: 'aventureiro',       name: 'Aventureiro',           desc: 'Visitou 15 praias fluviais',                     icon: 'mountain',       tier: 'prata',    type: 'stamps',             threshold: 15 },
  { id: 'filho-norte',       name: 'Filho do Norte',        desc: '5 praias na região Norte',                       icon: 'navigation',     tier: 'prata',    type: 'region',  region: 'norte',  threshold: 5  },
  { id: 'coracao-centro',    name: 'Coração do Centro',     desc: '5 praias na região Centro',                      icon: 'heart',          tier: 'prata',    type: 'region',  region: 'centro', threshold: 5  },
  { id: 'alma-sul',          name: 'Alma do Sul',           desc: '3 praias na região Sul',                         icon: 'sun',            tier: 'prata',    type: 'region',  region: 'sul',    threshold: 3 },
  { id: 'velocista',         name: 'Velocista',             desc: '5 carimbos no mesmo mês',                        icon: 'zap',            tier: 'prata',    type: 'speed'                             },
  { id: 'critico-elite',     name: 'Crítico de Elite',      desc: '5 comentários com fotografias',                  icon: 'camera',         tier: 'prata',    type: 'reviews_photos',     threshold: 5  },
  // ── Ouro ─────────────────────────────────────────────────────────────────
  { id: 'desbravador',       name: 'Desbravador',           desc: 'Visitou 30 praias fluviais',                     icon: 'map',            tier: 'ouro',     type: 'stamps',             threshold: 30 },
  { id: 'rei-norte',         name: 'Rei do Norte',          desc: '10 praias na região Norte',                      icon: 'crown',          tier: 'ouro',     type: 'region',  region: 'norte',  threshold: 10 },
  { id: 'mestre-centro',     name: 'Mestre do Centro',      desc: '10 praias na região Centro',                     icon: 'star',           tier: 'ouro',     type: 'region',  region: 'centro', threshold: 10 },
  { id: 'rio-acima',         name: 'Rio Acima',             desc: '5 praias fluviais no mesmo rio',                 icon: 'waves',          tier: 'ouro',     type: 'river'                             },
  { id: 'cacador-praias',    name: 'Caçador de Praias',     desc: 'Votou e tem 25 ou mais carimbos',                icon: 'target',         tier: 'ouro',     type: 'combo_vote_stamps',  threshold: 25 },
  // ── Diamante ─────────────────────────────────────────────────────────────
  { id: 'mestre-praias',     name: 'Mestre das Praias',     desc: 'Visitou 50 praias fluviais',                     icon: 'shield',         tier: 'diamante', type: 'stamps',             threshold: 50 },
  { id: 'elite-fluvial',     name: 'Elite Fluvial',         desc: 'Visitou 75 praias fluviais',                     icon: 'award',          tier: 'diamante', type: 'stamps',             threshold: 75 },
  { id: 'passaportista',     name: 'Passaportista Supremo', desc: '50 carimbos + 10 comentários + voto',            icon: 'badge-check',    tier: 'diamante', type: 'combo_all',          stampsMin: 50, reviewsMin: 10 },
  // ── Mítico ───────────────────────────────────────────────────────────────
  { id: 'lenda-aguas',       name: 'Lenda das Águas',       desc: 'Carimbou 100 praias fluviais',                   icon: 'trophy',         tier: 'mitico',   type: 'stamps',             threshold: 100 },
  { id: 'lenda-fluvial',     name: 'Lenda Fluvial',         desc: '100 carimbos + 15 comentários + voto',           icon: 'gem',            tier: 'mitico',   type: 'combo_legend',       stampsMin: 100, reviewsMin: 15 },
];

function badgesCompute({ stamps, reviews, voted, beaches }) {
  const stampIds   = stamps.map(s => s.beach_id);
  const total      = stampIds.length;
  const totalRev   = reviews.length;
  const revPhotos  = reviews.filter(r => r.images && r.images.length > 0).length;
  // Passaporte digital inclui todas as praias visíveis (o campo `passportStamp`
  // refere apenas à versão física do guia).
  const available  = beaches.length;

  // Map district → region (NUTS II)
  const districtToRegion = {
    'Viana do Castelo': 'norte', 'Braga': 'norte', 'Porto': 'norte',
    'Vila Real': 'norte', 'Bragança': 'norte',
    'Aveiro': 'centro', 'Viseu': 'centro', 'Guarda': 'centro',
    'Coimbra': 'centro', 'Castelo Branco': 'centro', 'Leiria': 'centro',
    'Santarém': 'centro',
    'Lisboa': 'centro', 'Setúbal': 'sul',
    'Portalegre': 'sul', 'Évora': 'sul', 'Beja': 'sul',
    'Faro': 'sul',
  };
  function getRegion(beach) {
    return beach.region || districtToRegion[beach.district] || '';
  }

  function regionCount(reg) {
    return stampIds.filter(id => {
      const b = beaches.find(x => x.id === id);
      return b && getRegion(b) === reg;
    }).length;
  }
  function regionsCount(regs) {
    return stampIds.filter(id => {
      const b = beaches.find(x => x.id === id);
      return b && regs.includes(getRegion(b));
    }).length;
  }
  function hasSpeed() {
    const byMonth = {};
    stamps.forEach(s => {
      const k = (s.stamped_at || '').substring(0, 7);
      if (k) byMonth[k] = (byMonth[k] || 0) + 1;
    });
    return Object.values(byMonth).some(c => c >= 5);
  }
  function hasRiver() {
    const byRiver = {};
    stampIds.forEach(id => {
      const b = beaches.find(x => x.id === id);
      if (b && b.river) byRiver[b.river] = (byRiver[b.river] || 0) + 1;
    });
    return Object.values(byRiver).some(c => c >= 5);
  }

  return ALL_BADGES.map(badge => {
    let earned = false, progress = 0, max = 1;

    switch (badge.type) {
      case 'stamps':
        earned = total >= badge.threshold; progress = Math.min(total, badge.threshold); max = badge.threshold; break;
      case 'voted':
        earned = !!voted; progress = voted ? 1 : 0; break;
      case 'reviews':
        earned = totalRev >= badge.threshold; progress = Math.min(totalRev, badge.threshold); max = badge.threshold; break;
      case 'reviews_photos':
        earned = revPhotos >= badge.threshold; progress = Math.min(revPhotos, badge.threshold); max = badge.threshold; break;
      case 'region': {
        const rc = regionCount(badge.region);
        earned = rc >= badge.threshold; progress = Math.min(rc, badge.threshold); max = badge.threshold; break;
      }
      case 'regions': {
        const rsc = regionsCount(badge.regions);
        earned = rsc >= badge.threshold; progress = Math.min(rsc, badge.threshold); max = badge.threshold; break;
      }
      case 'speed':
        earned = hasSpeed(); progress = earned ? 1 : 0; break;
      case 'river':
        earned = hasRiver(); progress = earned ? 1 : 0; break;
      case 'combo_vote_stamps':
        earned = voted && total >= badge.threshold; progress = Math.min(total, badge.threshold); max = badge.threshold; break;
      case 'combo_all':
        earned = total >= badge.stampsMin && totalRev >= badge.reviewsMin && voted;
        progress = (voted ? 1 : 0) + (total >= badge.stampsMin ? 1 : 0) + (totalRev >= badge.reviewsMin ? 1 : 0);
        max = 3; break;
      case 'all_stamps':
        earned = available > 0 && total >= available; progress = Math.min(total, available); max = available; break;
      case 'combo_legend':
        earned = total >= badge.stampsMin && totalRev >= badge.reviewsMin && voted;
        progress = (voted ? 1 : 0) + (total >= badge.stampsMin ? 1 : 0) + (totalRev >= badge.reviewsMin ? 1 : 0);
        max = 3; break;
    }
    return { ...badge, earned, progress, max };
  });
}

// Returns the top N rarest earned badges (for showing in comments)
function badgesTopEarned(computedBadges, n = 3) {
  const tierOrder = ['mitico', 'diamante', 'ouro', 'prata', 'bronze'];
  return computedBadges
    .filter(b => b.earned)
    .sort((a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier))
    .slice(0, n);
}

// Fetches all needed data for a user and returns their top N earned badges (cached per session)
const _badgesCache = {};
async function badgesGetForUser(userId, beaches) {
  if (_badgesCache[userId]) return _badgesCache[userId];
  const map = await badgesGetForUsers([userId], beaches);
  return map[userId] || [];
}

// Batched version: fetches stamps/reviews/votes for many users in 3 queries total
// instead of 3 queries × N users. Used by beach page comments to avoid N×3 round-trips.
async function badgesGetForUsers(userIds, beaches) {
  const out = {};
  if (!userIds || !userIds.length) return out;

  const missing = [];
  userIds.forEach(uid => {
    if (_badgesCache[uid]) out[uid] = _badgesCache[uid];
    else missing.push(uid);
  });
  if (!missing.length) return out;

  const year = new Date().getFullYear();
  const [stampsRes, reviewsRes, votesRes] = await Promise.all([
    _sb.from('stamps').select('user_id, beach_id, stamped_at').in('user_id', missing),
    _sb.from('reviews').select('user_id, images, beach_id').in('user_id', missing),
    _sb.from('votes').select('user_id').in('user_id', missing).eq('year', year),
  ]);
  const allStamps = stampsRes.data || [];
  const allReviews = reviewsRes.data || [];
  const votedSet = new Set((votesRes.data || []).map(v => v.user_id));

  const stampsByUser = {};
  allStamps.forEach(s => { (stampsByUser[s.user_id] = stampsByUser[s.user_id] || []).push(s); });
  const reviewsByUser = {};
  allReviews.forEach(r => { (reviewsByUser[r.user_id] = reviewsByUser[r.user_id] || []).push(r); });

  missing.forEach(uid => {
    const computed = badgesCompute({
      stamps: stampsByUser[uid] || [],
      reviews: reviewsByUser[uid] || [],
      voted: votedSet.has(uid),
      beaches,
    });
    const top = badgesTopEarned(computed, 3);
    _badgesCache[uid] = top;
    out[uid] = top;
  });
  return out;
}

// ─── Username → Email Lookup (requires email column in profiles table) ────────

async function getEmailByUsername(username) {
  const { data } = await _sb
    .from('profiles')
    .select('email')
    .eq('username', username)
    .single();
  return data?.email || null;
}

async function checkEmailExists(email) {
  const { data } = await _sb
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  return !!data;
}

async function checkUsernameExists(username) {
  const { data } = await _sb
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();
  return !!data;
}

// ─── Avatar Helper ────────────────────────────────────────────────────────────

function avatarHTML(profile, sizePx = 32) {
  const name = profile?.username || 'U';
  const cls  = `border-2 border-white/20 object-cover`;
  if (profile?.avatar_url) {
    return `<img src="${profile.avatar_url}" alt="${name}" class="${cls} rounded-full" style="width:${sizePx}px;height:${sizePx}px;">`;
  }
  const fontSize = Math.max(10, Math.round(sizePx * 0.38));
  return `<div class="rounded-full bg-praia-teal-700 border-2 border-white/20 flex items-center justify-center flex-shrink-0" style="width:${sizePx}px;height:${sizePx}px;">
    <span class="font-display font-bold text-praia-yellow-400" style="font-size:${fontSize}px;">${name.charAt(0).toUpperCase()}</span>
  </div>`;
}

// ─── Badge Pill HTML (for comment cards) ─────────────────────────────────────

function badgePillHTML(badge) {
  const tier = BADGE_TIERS[badge.tier];
  const isRare = badge.tier === 'mitico' || badge.tier === 'diamante';
  const shimmerStyle = isRare
    ? `animation: shimmerMove 2s linear infinite; background-image: linear-gradient(105deg, ${tier.hex}22 40%, ${tier.hex}55 50%, ${tier.hex}22 60%); background-size: 200% 100%;`
    : '';
  const glowStyle = isRare ? `box-shadow: 0 0 8px ${tier.glow};` : '';
  return `<span class="medal-chip inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-display font-bold whitespace-nowrap"
    title="${badge.name}: ${badge.desc}"
    style="background:${tier.hex}22;color:${tier.hex};border:1.5px solid ${tier.hex}55;${glowStyle}${shimmerStyle}">
    <i data-lucide="${badge.icon}" style="width:11px;height:11px;flex-shrink:0;"></i>
    ${badge.name}
  </span>`;
}

// ─── Badge Card HTML (for passaporte/perfil) ──────────────────────────────────

function badgeCardHTML(badge) {
  const tier    = BADGE_TIERS[badge.tier];
  const pct     = badge.max > 0 ? Math.round((badge.progress / badge.max) * 100) : 0;
  const tierMap = { bronze: 1, prata: 2, ouro: 3, diamante: 4, mitico: 5 };
  const tierNum = tierMap[badge.tier];

  const glowStyle = badge.earned
    ? `box-shadow: 0 0 20px ${tier.glow}, 0 4px 12px rgba(0,0,0,0.15);`
    : '';
  const borderStyle = badge.earned
    ? `border-color: ${tier.hex};`
    : 'border-color: rgba(0,0,0,0.08);';
  const shimmerClass = badge.earned && tier.shimmer ? 'badge-shimmer' : '';
  const rainbowClass = badge.earned && tier.rainbow ? 'badge-rainbow' : '';

  return `
    <div class="badge-card relative rounded-2xl border-2 p-5 text-center flex flex-col items-center gap-3 transition-all duration-500 ${shimmerClass} ${rainbowClass} ${badge.earned ? '' : 'opacity-60'}"
         style="${borderStyle}${glowStyle}background:${badge.earned ? tier.hex + '12' : 'rgba(0,0,0,0.02)'};"
         data-badge-id="${badge.id}" data-earned="${badge.earned}">

      <!-- Tier label -->
      <div class="absolute top-3 right-3 flex gap-px">
        ${Array.from({length: 5}, (_, i) => `<div class="w-1.5 h-1.5 rounded-full ${i < tierNum ? '' : 'opacity-20'}" style="background:${i < tierNum ? tier.hex : '#aaa'};"></div>`).join('')}
      </div>

      <!-- Icon -->
      <div class="relative w-14 h-14 rounded-2xl flex items-center justify-center"
           style="background:${badge.earned ? tier.hex : 'rgba(0,0,0,0.08)'};">
        <i data-lucide="${badge.icon}" class="w-7 h-7" style="color:${badge.earned ? '#003A40' : '#aaa'};"></i>
        ${badge.earned ? `<div class="absolute inset-0 rounded-2xl opacity-40" style="background:radial-gradient(circle at 30% 30%, white, transparent 60%);"></div>` : ''}
      </div>

      <!-- Name -->
      <div>
        <div class="font-display text-sm font-bold leading-tight" style="color:${badge.earned ? tier.hex : '#aaa'};">${badge.name}</div>
        <div class="text-[11px] mt-0.5 text-praia-sand-500 leading-snug">${badge.desc}</div>
        <div class="text-[10px] mt-1 font-display font-semibold uppercase tracking-wider" style="color:${tier.hex}88;">${tier.label}</div>
      </div>

      <!-- Progress / Earned -->
      ${badge.earned
        ? `<div class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-display font-bold" style="background:${tier.hex};color:#003A40;">
            <i data-lucide="check" style="width:10px;height:10px;"></i> Conquistada
           </div>`
        : badge.max > 1
          ? `<div class="w-full">
               <div class="flex justify-between text-[10px] text-praia-sand-400 mb-1">
                 <span>${badge.progress}/${badge.max}</span><span>${pct}%</span>
               </div>
               <div class="h-1.5 rounded-full bg-black/10 overflow-hidden">
                 <div class="h-full rounded-full transition-all duration-700" style="width:${pct}%;background:${tier.hex};"></div>
               </div>
             </div>`
          : `<div class="text-[10px] text-praia-sand-400 font-display">Por conquistar</div>`
      }
    </div>
  `;
}

// ─── Badge Unlock Celebration ─────────────────────────────────────────────────

function _injectBadgeStyles() {
  if (document.getElementById('badge-celebrate-styles')) return;
  const style = document.createElement('style');
  style.id = 'badge-celebrate-styles';
  style.textContent = `
    @keyframes badge-overlay-in  { from { opacity: 0; } to { opacity: 1; } }
    @keyframes badge-overlay-out { from { opacity: 1; } to { opacity: 0; } }
    @keyframes badge-card-in {
      from { opacity: 0; transform: translateY(10px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0)    scale(1); }
    }
    @keyframes badge-card-out {
      to { opacity: 0; transform: translateY(-6px) scale(0.985); }
    }
    @keyframes badge-medal-in {
      from { opacity: 0; transform: scale(0.84); }
      to   { opacity: 1; transform: scale(1); }
    }
    .badge-overlay {
      animation: badge-overlay-in 0.28s ease forwards;
      -webkit-backdrop-filter: blur(4px);
              backdrop-filter: blur(4px);
    }
    .badge-overlay.is-leaving                { animation: badge-overlay-out 0.24s ease forwards; }
    .badge-overlay.is-leaving .badge-toast,
    .badge-overlay.is-leaving .mitico-border-wrap {
      animation: badge-card-out 0.24s ease forwards;
    }
    .badge-toast { animation: badge-card-in 0.42s cubic-bezier(0.22,1,0.36,1) forwards; }
    .badge-medal { animation: badge-medal-in 0.5s cubic-bezier(0.22,1,0.36,1) 0.10s both; }
    .badge-ok-btn {
      transition: transform 0.15s ease, filter 0.15s ease, box-shadow 0.15s ease;
      outline: none;
    }
    .badge-ok-btn:hover  { filter: brightness(1.06); }
    .badge-ok-btn:active { transform: scale(0.985); }
    .badge-ok-btn:focus-visible {
      box-shadow: 0 0 0 2px rgba(250,248,245,0.9), 0 0 0 4px rgba(0,58,64,0.55);
    }
    .badge-x-btn { transition: color 0.15s ease, background 0.15s ease; outline: none; }
    .badge-x-btn:hover { color: #003A40; background: rgba(0,58,64,0.06); }
    .mitico-inner .badge-x-btn:hover { color: #B9F2FF; background: rgba(144,226,240,0.12); }

    /* ─── Mítico variant ──────────────────────────────────────────────────── */
    @keyframes mitico-rainbow-border {
      0%   { background-position: 0% 50%; }
      50%  { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    .mitico-border-wrap {
      padding: 2px;
      border-radius: 26px;
      background: linear-gradient(270deg, #90E2F0, #ff79c6, #FFD700, #43A047, #90E2F0);
      background-size: 400% 400%;
      animation: mitico-rainbow-border 5.5s ease infinite,
                 badge-card-in 0.42s cubic-bezier(0.22,1,0.36,1) forwards;
      box-shadow: 0 24px 60px rgba(0,0,0,0.5);
    }
    .mitico-inner {
      border-radius: 24px;
      background: #001E22;
      position: relative;
    }
  `;
  document.head.appendChild(style);
}

function _badgeEyebrow(color, label) {
  return `<div class="text-[10px] font-display font-bold uppercase tracking-[0.22em]" style="color:${color};">${label}</div>`;
}

function _badgeQueueChip(remaining, color) {
  if (!remaining) return '';
  return `<div class="absolute top-3 left-4 text-[10px] font-display font-bold tracking-[0.10em]"
               style="color:${color};">+${remaining}</div>`;
}

function _normalBadgeHTML(badge, remaining) {
  const tier = BADGE_TIERS[badge.tier];
  return `
    <div class="badge-toast relative w-[320px] max-w-[92vw] text-center"
         style="background:#FAF8F5;
                border:1px solid rgba(0,58,64,0.08);
                border-radius:24px;
                box-shadow:0 28px 60px rgba(0,0,0,0.22), 0 8px 22px rgba(0,0,0,0.10);">

      ${_badgeQueueChip(remaining, 'rgba(0,58,64,0.40)')}

      <button data-badge-close class="badge-x-btn absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center"
              style="color:rgba(0,58,64,0.40);" aria-label="Fechar">
        <i data-lucide="x" style="width:14px;height:14px;"></i>
      </button>

      <div class="px-7 pt-8 pb-7">
        ${_badgeEyebrow('rgba(0,58,64,0.55)', 'Medalha conquistada')}

        <div class="badge-medal mx-auto mt-6 mb-6 rounded-full flex items-center justify-center"
             style="width:104px;height:104px;
                    background:${tier.gradient || tier.hex};
                    box-shadow: inset 0 -6px 12px rgba(0,0,0,0.14),
                                inset 0 6px 10px rgba(255,255,255,0.28),
                                0 8px 20px rgba(0,58,64,0.18);">
          <i data-lucide="${badge.icon}" style="width:48px;height:48px;color:#003A40;stroke-width:1.6;"></i>
        </div>

        <div class="font-display text-[22px] leading-tight font-bold" style="color:#003A40;">${badge.name}</div>
        <div class="text-[13px] mt-1.5 leading-snug" style="color:rgba(0,58,64,0.62);">${badge.desc}</div>

        <div class="inline-flex items-center mt-5 px-3.5 py-1 rounded-full text-[10px] font-display font-bold uppercase tracking-[0.14em]"
             style="background:rgba(0,58,64,0.06); color:#003A40;">
          ${tier.label}
        </div>

        <div class="mt-7 mb-1" style="height:1px;background:rgba(0,58,64,0.10);"></div>

        <button data-badge-ok class="badge-ok-btn block w-full mt-5 font-display font-bold text-[13px] uppercase tracking-[0.16em] py-3 rounded-full"
                style="background:#003A40;color:#FAF8F5;">
          OK
        </button>
      </div>
    </div>`;
}

function _miticoBadgeHTML(badge, remaining) {
  return `
    <div class="mitico-border-wrap w-[340px] max-w-[92vw]">
      <div class="mitico-inner px-7 pt-8 pb-7 text-center">
        ${_badgeQueueChip(remaining, 'rgba(144,226,240,0.55)')}

        <button data-badge-close class="badge-x-btn absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center z-20"
                style="color:rgba(144,226,240,0.45);" aria-label="Fechar">
          <i data-lucide="x" style="width:14px;height:14px;"></i>
        </button>

        ${_badgeEyebrow('#90E2F0', 'Medalha mítica')}

        <div class="badge-medal mx-auto mt-6 mb-6 rounded-full flex items-center justify-center"
             style="width:112px;height:112px;
                    background: linear-gradient(135deg,#B9F2FF,#90E2F0 55%,#FFD700);
                    box-shadow: inset 0 -6px 12px rgba(0,0,0,0.15),
                                inset 0 6px 10px rgba(255,255,255,0.32),
                                0 10px 24px rgba(144,226,240,0.35);">
          <i data-lucide="${badge.icon}" style="width:52px;height:52px;color:#003A40;stroke-width:1.5;"></i>
        </div>

        <div class="font-display text-[22px] leading-tight font-bold text-white">${badge.name}</div>
        <div class="text-[13px] mt-1.5 leading-snug" style="color:rgba(144,226,240,0.70);">${badge.desc}</div>

        <div class="inline-flex items-center mt-5 px-3.5 py-1 rounded-full text-[10px] font-display font-bold uppercase tracking-[0.14em]"
             style="background:rgba(144,226,240,0.14); color:#90E2F0;">
          Mítico
        </div>

        <div class="mt-7 mb-1" style="height:1px;background:rgba(144,226,240,0.18);"></div>

        <button data-badge-ok class="badge-ok-btn block w-full mt-5 font-display font-bold text-[13px] uppercase tracking-[0.16em] py-3 rounded-full"
                style="background:linear-gradient(135deg,#B9F2FF,#90E2F0);color:#003A40;">
          OK
        </button>
      </div>
    </div>`;
}

// Queue so multiple unlocks show one-at-a-time and never overlap.
const _badgeQueue = [];
let _badgeShowing = false;
let _badgeStartScheduled = false;

function celebrateBadge(badge) {
  if (!badge) return;
  _badgeQueue.push(badge);
  if (_badgeShowing || _badgeStartScheduled) return;
  // Defer one microtask so synchronous bursts populate the queue
  // before the first toast reads its remaining count.
  _badgeStartScheduled = true;
  Promise.resolve().then(() => {
    _badgeStartScheduled = false;
    _processBadgeQueue();
  });
}

function _processBadgeQueue() {
  if (!_badgeQueue.length) { _badgeShowing = false; return; }
  _badgeShowing = true;
  _showBadgeToast(_badgeQueue.shift(), _badgeQueue.length);
}

function _showBadgeToast(badge, remaining) {
  const tier = BADGE_TIERS[badge.tier];
  const isMitico = badge.tier === 'mitico';

  _injectBadgeStyles();

  // Haptics (mobile)
  if (navigator.vibrate) {
    const pattern = isMitico                  ? [80, 40, 80, 40, 160]
                  : badge.tier === 'diamante' ? [60, 30, 120]
                  : [50, 30];
    navigator.vibrate(pattern);
  }

  // Confetti — restrained, scales with tier
  if (window.confetti) {
    const colors = isMitico
      ? ['#90E2F0', '#FFD700', '#FAF8F5', '#B9F2FF']
      : [tier.hex, '#FAF8F5'];
    const particleCount = isMitico ? 140
                         : badge.tier === 'diamante' ? 90
                         : badge.tier === 'ouro'     ? 60
                         : 35;
    window.confetti({
      particleCount, spread: 70, startVelocity: 40, ticks: 160,
      colors, origin: { x: 0.5, y: 0.42 },
    });
    if (isMitico) {
      setTimeout(() => window.confetti({ particleCount: 60, angle: 60,  spread: 60, origin: { x: 0 }, colors }), 220);
      setTimeout(() => window.confetti({ particleCount: 60, angle: 120, spread: 60, origin: { x: 1 }, colors }), 360);
    }
  }

  const overlay = document.createElement('div');
  overlay.className = 'badge-toast-overlay badge-overlay fixed inset-0 z-[9999] flex items-center justify-center px-4';
  overlay.style.background = isMitico ? 'rgba(0,20,24,0.62)' : 'rgba(0,20,24,0.48)';
  overlay.innerHTML = isMitico ? _miticoBadgeHTML(badge, remaining) : _normalBadgeHTML(badge, remaining);

  document.body.appendChild(overlay);
  if (window.lucide) lucide.createIcons();

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    document.removeEventListener('keydown', onKey);
    overlay.classList.add('is-leaving');
    setTimeout(() => {
      overlay.remove();
      setTimeout(_processBadgeQueue, 180);
    }, 260);
  };
  const onKey = e => {
    if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') {
      e.preventDefault();
      dismiss();
    }
  };

  overlay.querySelector('[data-badge-ok]')?.addEventListener('click', dismiss);
  overlay.querySelector('[data-badge-close]')?.addEventListener('click', dismiss);
  overlay.addEventListener('click', e => { if (e.target === overlay) dismiss(); });
  document.addEventListener('keydown', onKey);

  // Autofocus OK after the entry settles (no flash on keyboards)
  setTimeout(() => overlay.querySelector('[data-badge-ok]')?.focus({ preventScroll: true }), 550);
}

// ─── Header Auth Injection ────────────────────────────────────────────────────

const _NAV_CACHE_KEY = 'gpf_nav_v1';

function _buildHeaderUserHTML(name, email, avatarUrl) {
  const initial = name.charAt(0).toUpperCase();
  return `
    <div class="relative flex-shrink-0" id="header-user-wrap">
      <button id="header-avatar-btn"
              class="w-9 h-9 rounded-full overflow-hidden border-2 border-white/25 hover:border-praia-yellow-400
                     transition-all duration-200 focus:outline-none focus:border-praia-yellow-400 flex items-center
                     justify-center bg-praia-teal-700 flex-shrink-0"
              aria-label="Menu de perfil" aria-haspopup="true">
        ${avatarUrl
          ? `<img src="${avatarUrl}" alt="${name}" class="w-full h-full object-cover">`
          : `<span class="font-display font-bold text-sm text-praia-yellow-400">${initial}</span>`}
      </button>
      <div id="header-dropdown"
           class="hidden absolute right-0 top-11 w-48 bg-praia-teal-800 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50"
           style="box-shadow: 0 20px 60px rgba(0,0,0,0.4);">
        <div class="px-4 py-3 border-b border-white/10">
          <div class="font-display text-xs font-bold text-white truncate">${name}</div>
          <div class="text-[10px] text-white/40 truncate mt-0.5">${email || ''}</div>
        </div>
        <a href="perfil.html" class="flex items-center gap-2.5 px-4 py-2.5 text-xs text-white/75 hover:bg-white/8 hover:text-white transition-colors">
          <i data-lucide="user-circle" class="w-3.5 h-3.5 flex-shrink-0"></i> O meu Perfil
        </a>
        <a href="perfil.html#stamps" class="flex items-center gap-2.5 px-4 py-2.5 text-xs text-white/75 hover:bg-white/8 hover:text-white transition-colors">
          <i data-lucide="stamp" class="w-3.5 h-3.5 flex-shrink-0"></i> Passaporte
        </a>
        <a href="perfil.html#settings" class="flex items-center gap-2.5 px-4 py-2.5 text-xs text-white/75 hover:bg-white/8 hover:text-white transition-colors">
          <i data-lucide="settings" class="w-3.5 h-3.5 flex-shrink-0"></i> Configurações
        </a>
        <div class="border-t border-white/10 mt-1"></div>
        <button onclick="authSignOutConfirm()" class="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors">
          <i data-lucide="log-out" class="w-3.5 h-3.5 flex-shrink-0"></i> Terminar Sessão
        </button>
      </div>
    </div>`;
}

function _bindHeaderDropdown() {
  const btn      = document.getElementById('header-avatar-btn');
  const dropdown = document.getElementById('header-dropdown');
  if (!btn || !dropdown) return;
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const isHidden = dropdown.classList.contains('hidden');
    dropdown.classList.toggle('hidden', !isHidden);
    dropdown.style.animation = isHidden ? 'dropdownIn 0.2s cubic-bezier(0.34,1.56,0.64,1) forwards' : '';
  });
  document.addEventListener('click', () => dropdown.classList.add('hidden'));
}

async function initHeaderAuth() {
  const slot = document.getElementById('header-auth-slot');
  if (!slot) return;

  // Capture pre-existing cache BEFORE any async calls or writes
  const oldCache = (() => { try { return JSON.parse(localStorage.getItem(_NAV_CACHE_KEY)); } catch { return null; } })();
  const hadCache = !!oldCache;

  const { data: { session } } = await _sb.auth.getSession();

  if (!session) {
    localStorage.removeItem(_NAV_CACHE_KEY);
    slot.innerHTML = `
      <a href="auth.html" id="header-register-btn"
         class="inline-flex items-center gap-1.5 border border-white/40 text-white hover:bg-white/10 active:scale-95
                font-display font-bold text-[11px] uppercase tracking-wider px-2.5 py-1.5 rounded-full transition-all duration-200 whitespace-nowrap">
        <i data-lucide="user-plus" class="w-3.5 h-3.5"></i>
        Registar-se
      </a>`;
    lucide.createIcons();
    return;
  }

  // If IIFE already rendered from cache, bind the dropdown now
  if (hadCache) _bindHeaderDropdown();

  // Verify token + refresh profile
  const [user, profile] = await Promise.all([authGetUser(), profileGet(session.user.id)]);

  if (!user) {
    localStorage.removeItem(_NAV_CACHE_KEY);
    slot.innerHTML = `
      <a href="auth.html" id="header-register-btn"
         class="inline-flex items-center gap-1.5 border border-white/40 text-white hover:bg-white/10 active:scale-95
                font-display font-bold text-[11px] uppercase tracking-wider px-2.5 py-1.5 rounded-full transition-all duration-200 whitespace-nowrap">
        <i data-lucide="user-plus" class="w-3.5 h-3.5"></i>
        Registar-se
      </a>`;
    lucide.createIcons();
    return;
  }

  const name = profile?.username || user.email?.split('@')[0] || 'U';
  localStorage.setItem(_NAV_CACHE_KEY, JSON.stringify({
    username: name, email: user.email || '', avatar_url: profile?.avatar_url || null,
  }));

  // Render if: no prior cache (new session/registration), or data changed
  const dataChanged = !hadCache
    || oldCache.avatar_url !== (profile?.avatar_url || null)
    || oldCache.username   !== name
    || oldCache.email      !== (user.email || '');
  if (dataChanged) {
    slot.innerHTML = _buildHeaderUserHTML(name, user.email, profile?.avatar_url);
    lucide.createIcons();
    _bindHeaderDropdown();
  }
}

// ─── Mobile Menu Auth (injected into mobile menu footer) ─────────────────────

async function initMobileMenuAuth() {
  const slot = document.getElementById('mobile-auth-slot');
  if (!slot) return;

  const user = await authGetUser();

  if (!user) {
    // Apenas "Criar conta". O acesso a "Iniciar sessão" vive na bolinha
    // "Entrar" da bottom-nav e nas tabs internas da página de auth.
    slot.innerHTML = `
      <a href="auth.html"
         class="flex items-center justify-center gap-2 bg-praia-yellow-400 text-praia-teal-800 font-display font-bold text-xs uppercase tracking-wider py-3 rounded-full transition-transform active:scale-[0.98]">
        <i data-lucide="user-plus" class="w-4 h-4"></i> Criar conta
      </a>`;
    lucide.createIcons();
    return;
  }

  const profile = await profileGet(user.id);
  const name    = profile?.username || user.email?.split('@')[0] || 'U';
  const email   = user.email || '';

  // Chip de perfil (sem botão de Terminar Sessão — esse vive dentro de perfil.html)
  slot.innerHTML = `
    <a href="perfil.html"
       class="flex items-center gap-3 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded-2xl px-3 py-2.5">
      ${avatarHTML(profile, 36)}
      <span class="flex-1 min-w-0">
        <span class="block font-display text-sm font-bold text-white truncate">${name}</span>
        <span class="block text-[11px] text-white/45 truncate">${email}</span>
      </span>
      <i data-lucide="chevron-right" class="w-4 h-4 text-white/40 flex-shrink-0"></i>
    </a>`;
  lucide.createIcons();
}

// ─── Bottom-nav auth/perfil bubble ────────────────────────────────────────────
// Default vem com "Entrar" (icone log-in). Quando há sessão, substitui pelo
// avatar do utilizador e passa o link/etiqueta para "Perfil" → perfil.html.
async function initBottomNavProfile() {
  const link = document.getElementById('bottom-nav-auth');
  if (!link) return;

  function renderGuest() {
    link.setAttribute('href', 'auth.html');
    link.setAttribute('aria-label', 'Entrar');
    link.innerHTML =
      '<i data-lucide="log-in"></i>' +
      '<span class="font-display uppercase tracking-wider font-semibold">Entrar</span>';
    if (window.lucide) lucide.createIcons();
  }

  function renderUser({ avatar_url, username }) {
    link.setAttribute('href', 'perfil.html');
    link.setAttribute('aria-label', 'Perfil');
    link.innerHTML =
      _bottomNavAvatarHTML({ avatar_url, username }) +
      '<span class="font-display uppercase tracking-wider font-semibold">Perfil</span>';
    if (window.lucide) lucide.createIcons();
  }

  // Render imediato a partir da cache (sem await, sem rede)
  let hadCache = false;
  try {
    const cache = JSON.parse(localStorage.getItem(_NAV_CACHE_KEY) || 'null');
    if (cache && cache.username) {
      hadCache = true;
      renderUser({ avatar_url: cache.avatar_url, username: cache.username });
    }
  } catch {}

  // Verificação real
  const user = await authGetUser();
  if (!user) {
    // Só voltar a "Entrar" se não havia cache de sessão. Caso a cache existisse
    // e a verificação falhar (rede lenta, JWT a expirar), mantemos o link como
    // "Perfil" para evitar que o utilizador clique no botão e seja levado a
    // auth.html — provoca o flash da página de registo antes de regressar a
    // perfil.html. A próxima visita ou o initHeaderAuth() reconcilia o estado.
    if (!hadCache) renderGuest();
    return;
  }
  const profile = await profileGet(user.id);
  renderUser({
    avatar_url: profile?.avatar_url || null,
    username: profile?.username || user.email?.split('@')[0] || 'U',
  });
}

function _bottomNavAvatarHTML({ avatar_url, username }) {
  const initial = (username || 'U').charAt(0).toUpperCase();
  if (avatar_url) {
    return `<span class="bottom-nav-avatar"><img src="${avatar_url}" alt="${username}"></span>`;
  }
  return `<span class="bottom-nav-avatar"><span class="initial">${initial}</span></span>`;
}

// ─── Render static icons + instant avatar from cache (zero network, zero await) ─
(function renderStaticIcons() {
  if (window.lucide) lucide.createIcons();

  // Inject avatar from localStorage cache synchronously — appears with the header,
  // same moment as all other static icons. No await, no network.
  try {
    const cache = JSON.parse(localStorage.getItem('gpf_nav_v1') || 'null');
    const slot  = document.getElementById('header-auth-slot');
    if (slot && cache?.username) {
      slot.innerHTML = _buildHeaderUserHTML(cache.username, cache.email, cache.avatar_url);
      lucide.createIcons();
      // Dropdown binding deferred to initHeaderAuth() to avoid duplicate listeners
    }
  } catch {}
})();

// ─── CSS animations (injected once) ──────────────────────────────────────────
(function injectAuthStyles() {
  if (document.getElementById('auth-styles')) return;
  const style = document.createElement('style');
  style.id = 'auth-styles';
  style.textContent = `
    @keyframes dropdownIn {
      from { opacity: 0; transform: translateY(-8px) scale(0.95); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes badgeGlow {
      0%, 100% { filter: brightness(1); }
      50%       { filter: brightness(1.25); }
    }
    @keyframes shimmerMove {
      0%   { background-position: -200% center; }
      100% { background-position:  200% center; }
    }
    @keyframes rainbowSpin {
      from { filter: hue-rotate(0deg) brightness(1.1); }
      to   { filter: hue-rotate(360deg) brightness(1.1); }
    }
    .badge-shimmer:not([data-earned="false"]) {
      animation: shimmerMove 2.5s linear infinite;
      background-image: linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.3) 50%, transparent 60%) !important;
      background-size: 200% 100%;
    }
    .badge-rainbow:not([data-earned="false"]) {
      animation: rainbowSpin 4s linear infinite;
    }
    .badge-card:not([data-earned="false"]):hover {
      transform: translateY(-4px) scale(1.02);
    }
    .badge-card { transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.3s ease; }
  `;
  document.head.appendChild(style);
})();

// ─── Export ───────────────────────────────────────────────────────────────────
window.AuthUtils = {
  supabase: _sb,
  authGetUser,
  authGetSession,
  authSignOut,
  authSignOutConfirm,
  profileGet,
  profileUpsert,
  profileUploadAvatar,
  profileRemoveAvatar,
  getEmailByUsername,
  checkEmailExists,
  checkUsernameExists,
  stampsGetAll,
  stampAdd,
  stampRemove,
  stampsSyncFromLocal,
  visitAdd,
  visitsGetForBeach,
  voteGet,
  voteGetFull,
  voteSubmit,
  voteUpdatePublic,
  reviewsGetForBeach,
  reviewsGetForUser,
  reviewSubmit,
  reviewSubmitReply,
  reviewDelete,
  badgesCompute,
  badgesTopEarned,
  badgesGetForUser,
  badgesGetForUsers,
  ALL_BADGES,
  BADGE_TIERS,
  avatarHTML,
  badgePillHTML,
  badgeCardHTML,
  celebrateBadge,
  initHeaderAuth,
  initMobileMenuAuth,
  initBottomNavProfile,
};
