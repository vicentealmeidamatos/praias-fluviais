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

// ─── Profile ──────────────────────────────────────────────────────────────────

async function profileGet(userId) {
  const { data } = await _sb
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return data || null;
}

async function profileUpsert(userId, fields) {
  const { error } = await _sb
    .from('profiles')
    .upsert({ id: userId, ...fields }, { onConflict: 'id' });
  if (error) throw error;
  return true;
}

async function profileUploadAvatar(userId, file) {
  const ext  = file.name.split('.').pop().toLowerCase();
  const path = `${userId}/avatar.${ext}`;
  const contentType = file.type || 'image/' + (ext === 'jpg' ? 'jpeg' : ext);
  const { error } = await _sb.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType });
  if (error) {
    console.error('[profileUploadAvatar] upload error:', error.message);
    return null;
  }
  const { data } = _sb.storage.from('avatars').getPublicUrl(path);
  // Bust browser cache with timestamp
  return data.publicUrl + '?t=' + Date.now();
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
  const available  = beaches.filter(b => b.passportStamp).length;

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
  const year = new Date().getFullYear();
  const [stamps, reviews, vote] = await Promise.all([
    stampsGetAll(userId),
    reviewsGetForUser(userId),
    voteGet(userId, year),
  ]);
  const computed = badgesCompute({ stamps, reviews, voted: !!vote, beaches });
  const result = badgesTopEarned(computed, 3);
  _badgesCache[userId] = result;
  return result;
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

function _injectMiticoStyles() {
  if (document.getElementById('mitico-badge-styles')) return;
  const style = document.createElement('style');
  style.id = 'mitico-badge-styles';
  style.textContent = `
    @keyframes mitico-rainbow-border {
      0%   { background-position: 0% 50%; }
      50%  { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    @keyframes mitico-icon-pulse {
      0%, 100% { transform: scale(1);    filter: brightness(1); }
      50%       { transform: scale(1.08); filter: brightness(1.2); }
    }
    @keyframes mitico-float {
      0%, 100% { transform: translateY(0px); }
      50%       { transform: translateY(-6px); }
    }
    @keyframes mitico-shimmer {
      0%   { transform: translateX(-100%) skewX(-15deg); }
      100% { transform: translateX(300%) skewX(-15deg); }
    }
    @keyframes mitico-sparkle {
      0%, 100% { opacity: 0; transform: scale(0) rotate(0deg); }
      50%       { opacity: 1; transform: scale(1) rotate(180deg); }
    }
    @keyframes mitico-title-glow {
      0%, 100% { text-shadow: 0 0 10px rgba(144,226,240,0.4), 0 0 30px rgba(144,226,240,0.2); }
      50%       { text-shadow: 0 0 20px rgba(144,226,240,0.8), 0 0 60px rgba(144,226,240,0.4), 0 0 100px rgba(144,226,240,0.2); }
    }
    .mitico-border-wrap {
      padding: 3px;
      border-radius: 28px;
      background: linear-gradient(270deg, #90E2F0, #ff79c6, #FFD700, #43A047, #90E2F0);
      background-size: 400% 400%;
      animation: mitico-rainbow-border 3s ease infinite;
      box-shadow: 0 0 30px rgba(144,226,240,0.5), 0 0 80px rgba(144,226,240,0.2), 0 30px 80px rgba(0,0,0,0.5);
    }
    .mitico-inner {
      border-radius: 26px;
      background: linear-gradient(145deg, #002A2E, #003A40, #004D3A);
      overflow: hidden;
      position: relative;
    }
    .mitico-shimmer-line {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: linear-gradient(105deg, transparent 40%, rgba(144,226,240,0.12) 50%, transparent 60%);
      animation: mitico-shimmer 2.5s ease-in-out infinite;
      pointer-events: none;
    }
    .mitico-icon-wrap {
      animation: mitico-float 3s ease-in-out infinite;
    }
    .mitico-icon-bg {
      animation: mitico-icon-pulse 2s ease-in-out infinite;
      background: linear-gradient(135deg, #90E2F0, #B9F2FF, #FFD700);
    }
    .mitico-title {
      animation: mitico-title-glow 2s ease-in-out infinite;
      background: linear-gradient(135deg, #ffffff, #90E2F0, #ffffff);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .mitico-sparkle {
      position: absolute;
      pointer-events: none;
      font-size: 14px;
    }
  `;
  document.head.appendChild(style);
}

function _createMiticoToastHTML(badge) {
  const sparkles = [
    { top: '8%',  left: '10%', delay: '0s',    dur: '2s'   },
    { top: '15%', left: '85%', delay: '0.4s',  dur: '2.3s' },
    { top: '75%', left: '8%',  delay: '0.8s',  dur: '1.8s' },
    { top: '80%', left: '88%', delay: '0.2s',  dur: '2.1s' },
    { top: '45%', left: '5%',  delay: '1.1s',  dur: '2.4s' },
    { top: '40%', left: '92%', delay: '0.6s',  dur: '1.9s' },
    { top: '5%',  left: '50%', delay: '1.4s',  dur: '2.2s' },
    { top: '90%', left: '50%', delay: '0.9s',  dur: '2s'   },
  ];
  return `
    <div class="mitico-border-wrap">
      <div class="mitico-inner px-8 py-9 text-center relative" style="min-width:280px;max-width:320px;">
        <div class="mitico-shimmer-line"></div>
        ${sparkles.map(s => `<span class="mitico-sparkle" style="top:${s.top};left:${s.left};animation:mitico-sparkle ${s.dur} ease-in-out infinite;animation-delay:${s.delay};">✦</span>`).join('')}
        <div class="text-xs font-display font-bold uppercase tracking-widest mb-4 relative z-10" style="color:#90E2F0;letter-spacing:0.2em;">✦ Medalha Mítica Desbloqueada! ✦</div>
        <div class="mitico-icon-wrap relative z-10 mb-5">
          <div class="mitico-icon-bg w-24 h-24 rounded-2xl flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(144,226,240,0.6)]">
            <i data-lucide="${badge.icon}" class="w-12 h-12" style="color:#003A40;stroke-width:1.5;"></i>
          </div>
        </div>
        <div class="mitico-title font-display text-2xl font-bold mb-2 relative z-10">${badge.name}</div>
        <div class="text-sm mb-5 relative z-10" style="color:rgba(144,226,240,0.7);">${badge.desc}</div>
        <div class="relative z-10 inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs font-display font-bold" style="background:linear-gradient(135deg,#90E2F0,#B9F2FF);color:#003A40;box-shadow:0 0 20px rgba(144,226,240,0.4);">
          ✦ Mítico
        </div>
        <button onclick="this.closest('.badge-toast-overlay').remove()" class="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center transition-colors z-20" style="color:rgba(144,226,240,0.5);" onmouseover="this.style.color='rgba(144,226,240,1)';this.style.background='rgba(144,226,240,0.1)'" onmouseout="this.style.color='rgba(144,226,240,0.5)';this.style.background='transparent'">
          <i data-lucide="x" style="width:14px;height:14px;"></i>
        </button>
      </div>
    </div>`;
}

function celebrateBadge(badge) {
  const tier = BADGE_TIERS[badge.tier];
  const isMitico = badge.tier === 'mitico';

  // Vibration (mobile)
  if (navigator.vibrate) {
    const pattern = isMitico                   ? [100, 50, 100, 50, 200, 50, 200]
                  : badge.tier === 'diamante'  ? [80, 40, 80, 40, 160]
                  : [60, 30, 120];
    navigator.vibrate(pattern);
  }

  // Confetti burst
  if (window.confetti) {
    const colors = isMitico
      ? ['#90E2F0', '#ff79c6', '#FFD700', '#43A047', '#ffffff', '#B9F2FF']
      : [tier.hex, '#FFEB3B', '#ffffff', '#003A40'];
    window.confetti({
      particleCount: isMitico ? 300 : badge.tier === 'diamante' ? 140 : 80,
      spread: isMitico ? 100 : 80,
      startVelocity: isMitico ? 55 : 45,
      colors,
      origin: { x: 0.5, y: 0.4 },
    });
    if (isMitico || badge.tier === 'diamante') {
      setTimeout(() => window.confetti({ particleCount: 80, angle: 60,  spread: 65, origin: { x: 0 }, colors }), 200);
      setTimeout(() => window.confetti({ particleCount: 80, angle: 120, spread: 65, origin: { x: 1 }, colors }), 350);
      if (isMitico) {
        setTimeout(() => window.confetti({ particleCount: 60, angle: 90, spread: 120, startVelocity: 30, origin: { x: 0.5, y: 0.6 }, colors }), 600);
      }
    }
  }

  // Inject mythic CSS if needed
  if (isMitico) _injectMiticoStyles();

  // Overlay toast
  const toast = document.createElement('div');
  toast.className = 'badge-toast-overlay fixed inset-0 z-[9999] flex items-center justify-center px-4';
  toast.style.background = isMitico ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.5)';

  if (isMitico) {
    toast.innerHTML = `<div class="badge-toast">${_createMiticoToastHTML(badge)}</div>`;
  } else {
    toast.innerHTML = `
      <div class="badge-toast relative rounded-3xl p-8 text-center max-w-xs mx-4 shadow-2xl"
           style="background: linear-gradient(135deg, #003A40, #005D56); border: 2px solid ${tier.hex}; box-shadow: 0 0 40px ${tier.glow}, 0 20px 60px rgba(0,0,0,0.4);">
        <div class="text-xs font-display font-bold uppercase tracking-widest mb-3 opacity-70" style="color:${tier.hex};">✦ Medalha Desbloqueada!</div>
        <div class="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4" style="background:${tier.gradient || tier.hex};box-shadow:0 4px 20px ${tier.glow};">
          <i data-lucide="${badge.icon}" class="w-10 h-10" style="color:#003A40;"></i>
        </div>
        <div class="font-display text-xl font-bold text-white mb-1">${badge.name}</div>
        <div class="text-sm text-white/60 mb-4">${badge.desc}</div>
        <div class="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-display font-bold" style="background:${tier.gradient || tier.hex};color:#003A40;">
          ${tier.label}
        </div>
        <button onclick="this.closest('.badge-toast-overlay').remove()" class="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors">
          <i data-lucide="x" style="width:14px;height:14px;"></i>
        </button>
      </div>`;
  }

  document.body.appendChild(toast);
  lucide.createIcons();

  // Click outside to dismiss
  toast.addEventListener('click', e => { if (e.target === toast) toast.remove(); });

  // Animate in
  const inner = toast.querySelector('.badge-toast');
  inner.style.transform = isMitico ? 'scale(0.6) translateY(60px) rotate(-3deg)' : 'scale(0.7) translateY(40px)';
  inner.style.opacity = '0';
  inner.style.transition = `transform 0.6s cubic-bezier(0.34,1.56,0.64,1), opacity 0.4s ease`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    inner.style.transform = 'scale(1) translateY(0) rotate(0deg)';
    inner.style.opacity = '1';
  }));

  // Auto-dismiss
  const dismissDelay = isMitico ? 7000 : 4000;
  setTimeout(() => {
    inner.style.transform = 'scale(0.9) translateY(-20px)';
    inner.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, dismissDelay);
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
        <a href="passaporte.html" class="flex items-center gap-2.5 px-4 py-2.5 text-xs text-white/75 hover:bg-white/8 hover:text-white transition-colors">
          <i data-lucide="stamp" class="w-3.5 h-3.5 flex-shrink-0"></i> Passaporte
        </a>
        <a href="votar.html" class="flex items-center gap-2.5 px-4 py-2.5 text-xs text-white/75 hover:bg-white/8 hover:text-white transition-colors">
          <i data-lucide="vote" class="w-3.5 h-3.5 flex-shrink-0"></i> Votar 2026
        </a>
        <div class="border-t border-white/10 mt-1"></div>
        <button onclick="authSignOut()" class="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors">
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
    slot.innerHTML = `
      <a href="auth.html"
         class="flex items-center justify-center gap-2 border border-white/30 text-white font-display font-bold text-sm uppercase tracking-wider py-3 rounded-full w-full mt-2 transition-colors hover:bg-white/10">
        <i data-lucide="user-plus" class="w-4 h-4"></i> Registar-se
      </a>`;
    lucide.createIcons();
    return;
  }

  const profile = await profileGet(user.id);
  const name    = profile?.username || user.email?.split('@')[0] || 'U';

  slot.innerHTML = `
    <a href="perfil.html" class="flex items-center gap-3 border border-white/30 text-white font-display font-bold text-sm uppercase tracking-wider px-4 py-3 rounded-full w-full mt-2 transition-colors hover:bg-white/10">
      ${avatarHTML(profile, 28)}
      <span class="truncate">${name}</span>
    </a>
    <button onclick="authSignOut()" class="text-red-400 text-xs font-display font-semibold mt-2 w-full text-center py-1.5 hover:text-red-300 transition-colors">
      Terminar Sessão
    </button>`;
  lucide.createIcons();
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
  profileGet,
  profileUpsert,
  profileUploadAvatar,
  getEmailByUsername,
  checkEmailExists,
  checkUsernameExists,
  stampsGetAll,
  stampAdd,
  stampRemove,
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
  ALL_BADGES,
  BADGE_TIERS,
  avatarHTML,
  badgePillHTML,
  badgeCardHTML,
  celebrateBadge,
  initHeaderAuth,
  initMobileMenuAuth,
};
