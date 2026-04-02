// ─── Supabase Auth & Platform Utilities ──────────────────────────────────────
// ⚠️  Substitua os valores abaixo pelas credenciais do seu projeto Supabase:
//     Dashboard → Settings → API → Project URL + anon public key
// ─────────────────────────────────────────────────────────────────────────────
const SUPABASE_URL      = 'https://tjvhnbukzfyxtpkrhpsw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ke--Q7xNRNCxTjgxFCNFIQ_6zPD3zM3';

const { createClient } = window.supabase;
const _sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Auth State ───────────────────────────────────────────────────────────────

async function authGetUser() {
  const { data: { user } } = await _sb.auth.getUser();
  return user;
}

async function authGetSession() {
  const { data: { session } } = await _sb.auth.getSession();
  return session;
}

async function authSignOut() {
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
  return !error;
}

async function profileUploadAvatar(userId, file) {
  const ext  = file.name.split('.').pop().toLowerCase();
  const path = `${userId}/avatar.${ext}`;
  const { error } = await _sb.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) return null;
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
    .select('*, profiles(id, username, avatar_url), parent_id')
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
  bronze:   { label: 'Bronze',   hex: '#CD7F32', glow: 'rgba(205,127,50,0.45)',  shimmer: false, rainbow: false },
  prata:    { label: 'Prata',    hex: '#A8B8C8', glow: 'rgba(168,184,200,0.4)',  shimmer: false, rainbow: false },
  ouro:     { label: 'Ouro',     hex: '#FFD700', glow: 'rgba(255,215,0,0.55)',   shimmer: false, rainbow: false },
  platina:  { label: 'Platina',  hex: '#B0C4DE', glow: 'rgba(176,196,222,0.6)',  shimmer: true,  rainbow: false },
  diamante: { label: 'Diamante', hex: '#B9F2FF', glow: 'rgba(185,242,255,0.7)',  shimmer: true,  rainbow: true  },
};

const ALL_BADGES = [
  // ── Bronze ───────────────────────────────────────────────────────────────
  { id: 'primeira-gota',     name: 'Primeira Gota',        desc: 'Carimbou a sua primeira praia fluvial',          icon: 'droplets',       tier: 'bronze',   type: 'stamps',             threshold: 1  },
  { id: 'explorador',        name: 'Explorador',            desc: 'Visitou 5 praias fluviais',                      icon: 'compass',        tier: 'bronze',   type: 'stamps',             threshold: 5  },
  { id: 'eleitor',           name: 'Eleitor',               desc: 'Participou na votação Praia do Ano',             icon: 'vote',           tier: 'bronze',   type: 'voted'                             },
  { id: 'voz-comunidade',    name: 'Voz da Comunidade',     desc: 'Publicou 3 comentários numa praia',              icon: 'message-circle', tier: 'bronze',   type: 'reviews',            threshold: 3  },
  // ── Prata ────────────────────────────────────────────────────────────────
  { id: 'aventureiro',       name: 'Aventureiro',           desc: 'Visitou 10 praias fluviais',                     icon: 'mountain',       tier: 'prata',    type: 'stamps',             threshold: 10 },
  { id: 'filho-norte',       name: 'Filho do Norte',        desc: '3 praias na região Norte',                       icon: 'navigation',     tier: 'prata',    type: 'region',  region: 'norte',  threshold: 3  },
  { id: 'coracao-centro',    name: 'Coração do Centro',     desc: '3 praias na região Centro',                      icon: 'heart',          tier: 'prata',    type: 'region',  region: 'centro', threshold: 3  },
  { id: 'alma-sul',          name: 'Alma do Sul',           desc: '2 praias no Alentejo ou Algarve',                icon: 'sun',            tier: 'prata',    type: 'regions', regions: ['alentejo','algarve'], threshold: 2 },
  { id: 'velocista',         name: 'Velocista',             desc: '3 carimbos no mesmo mês',                        icon: 'zap',            tier: 'prata',    type: 'speed'                             },
  { id: 'critico-elite',     name: 'Crítico de Elite',      desc: '5 comentários com fotografias',                  icon: 'camera',         tier: 'prata',    type: 'reviews_photos',     threshold: 5  },
  // ── Ouro ─────────────────────────────────────────────────────────────────
  { id: 'desbravador',       name: 'Desbravador',           desc: 'Visitou 15 praias fluviais',                     icon: 'map',            tier: 'ouro',     type: 'stamps',             threshold: 15 },
  { id: 'rei-norte',         name: 'Rei do Norte',          desc: '5 praias na região Norte',                       icon: 'crown',          tier: 'ouro',     type: 'region',  region: 'norte',  threshold: 5  },
  { id: 'mestre-centro',     name: 'Mestre do Centro',      desc: '5 praias na região Centro',                      icon: 'star',           tier: 'ouro',     type: 'region',  region: 'centro', threshold: 5  },
  { id: 'rio-acima',         name: 'Rio Acima',             desc: '3 praias fluviais no mesmo rio',                 icon: 'waves',          tier: 'ouro',     type: 'river'                             },
  { id: 'cacador-praias',    name: 'Caçador de Praias',     desc: 'Votou e tem 10 ou mais carimbos',                icon: 'target',         tier: 'ouro',     type: 'combo_vote_stamps',  threshold: 10 },
  // ── Platina ──────────────────────────────────────────────────────────────
  { id: 'mestre-praias',     name: 'Mestre das Praias',     desc: 'Visitou 20 praias fluviais',                     icon: 'shield',         tier: 'platina',  type: 'stamps',             threshold: 20 },
  { id: 'elite-fluvial',     name: 'Elite Fluvial',         desc: 'Visitou 25 praias fluviais',                     icon: 'award',          tier: 'platina',  type: 'stamps',             threshold: 25 },
  { id: 'passaportista',     name: 'Passaportista Supremo', desc: '20 carimbos + 5 comentários + voto',             icon: 'bookmark',       tier: 'platina',  type: 'combo_all',          stampsMin: 20, reviewsMin: 5 },
  // ── Diamante ─────────────────────────────────────────────────────────────
  { id: 'lenda-aguas',       name: 'Lenda das Águas',       desc: 'Carimbou todas as praias disponíveis',           icon: 'trophy',         tier: 'diamante', type: 'all_stamps'                        },
  { id: 'lenda-fluvial',     name: 'Lenda Fluvial',         desc: 'Todas as praias + 10 comentários + voto',        icon: 'gem',            tier: 'diamante', type: 'combo_legend',       reviewsMin: 10 },
];

function badgesCompute({ stamps, reviews, voted, beaches }) {
  const stampIds   = stamps.map(s => s.beach_id);
  const total      = stampIds.length;
  const totalRev   = reviews.length;
  const revPhotos  = reviews.filter(r => r.images && r.images.length > 0).length;
  const available  = beaches.filter(b => b.passportStamp).length;

  function regionCount(reg) {
    return stampIds.filter(id => {
      const b = beaches.find(x => x.id === id);
      return b && b.region === reg;
    }).length;
  }
  function regionsCount(regs) {
    return stampIds.filter(id => {
      const b = beaches.find(x => x.id === id);
      return b && regs.includes(b.region);
    }).length;
  }
  function hasSpeed() {
    const byMonth = {};
    stamps.forEach(s => {
      const k = (s.stamped_at || '').substring(0, 7);
      if (k) byMonth[k] = (byMonth[k] || 0) + 1;
    });
    return Object.values(byMonth).some(c => c >= 3);
  }
  function hasRiver() {
    const byRiver = {};
    stampIds.forEach(id => {
      const b = beaches.find(x => x.id === id);
      if (b && b.river) byRiver[b.river] = (byRiver[b.river] || 0) + 1;
    });
    return Object.values(byRiver).some(c => c >= 3);
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
        earned = available > 0 && total >= available && totalRev >= badge.reviewsMin && voted;
        progress = (voted ? 1 : 0) + (total >= available ? 1 : 0) + (totalRev >= badge.reviewsMin ? 1 : 0);
        max = 3; break;
    }
    return { ...badge, earned, progress, max };
  });
}

// Returns the top N rarest earned badges (for showing in comments)
function badgesTopEarned(computedBadges, n = 3) {
  const tierOrder = ['diamante', 'platina', 'ouro', 'prata', 'bronze'];
  return computedBadges
    .filter(b => b.earned)
    .sort((a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier))
    .slice(0, n);
}

// Fetches all needed data for a user and returns their top N earned badges
async function badgesGetForUser(userId, beaches) {
  const year = new Date().getFullYear();
  const [stamps, reviews, vote] = await Promise.all([
    stampsGetAll(userId),
    reviewsGetForUser(userId),
    voteGet(userId, year),
  ]);
  const computed = badgesCompute({ stamps, reviews, voted: !!vote, beaches });
  return badgesTopEarned(computed, 3);
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
  const isRare = badge.tier === 'diamante' || badge.tier === 'platina';
  const shimmerStyle = isRare
    ? `animation: shimmerMove 2s linear infinite; background-image: linear-gradient(105deg, ${tier.hex}22 40%, ${tier.hex}55 50%, ${tier.hex}22 60%); background-size: 200% 100%;`
    : '';
  const glowStyle = isRare ? `box-shadow: 0 0 8px ${tier.glow};` : '';
  return `<span class="medal-chip inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-display font-bold whitespace-nowrap"
    title="${badge.name} — ${badge.desc}"
    style="background:${tier.hex}22;color:${tier.hex};border:1.5px solid ${tier.hex}55;${glowStyle}${shimmerStyle}">
    <i data-lucide="${badge.icon}" style="width:11px;height:11px;flex-shrink:0;"></i>
    ${badge.name}
  </span>`;
}

// ─── Badge Card HTML (for passaporte/perfil) ──────────────────────────────────

function badgeCardHTML(badge) {
  const tier    = BADGE_TIERS[badge.tier];
  const pct     = badge.max > 0 ? Math.round((badge.progress / badge.max) * 100) : 0;
  const tierMap = { bronze: 1, prata: 2, ouro: 3, platina: 4, diamante: 5 };
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

function celebrateBadge(badge) {
  const tier = BADGE_TIERS[badge.tier];

  // Vibration (mobile)
  if (navigator.vibrate) {
    const pattern = badge.tier === 'diamante' ? [100, 50, 100, 50, 200, 50, 200]
                  : badge.tier === 'platina'  ? [80, 40, 80, 40, 160]
                  : [60, 30, 120];
    navigator.vibrate(pattern);
  }

  // Confetti burst
  if (window.confetti) {
    const colors = [tier.hex, '#FFEB3B', '#ffffff', '#003A40'];
    window.confetti({
      particleCount: badge.tier === 'diamante' ? 200 : badge.tier === 'platina' ? 140 : 80,
      spread: 80,
      startVelocity: 45,
      colors,
      origin: { x: 0.5, y: 0.5 },
    });
    if (badge.tier === 'diamante' || badge.tier === 'platina') {
      setTimeout(() => window.confetti({ particleCount: 60, angle: 60, spread: 55, origin: { x: 0 }, colors }), 250);
      setTimeout(() => window.confetti({ particleCount: 60, angle: 120, spread: 55, origin: { x: 1 }, colors }), 400);
    }
  }

  // Overlay toast
  const toast = document.createElement('div');
  toast.className = 'fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none';
  toast.innerHTML = `
    <div class="badge-toast pointer-events-auto relative rounded-3xl p-8 text-center max-w-xs mx-4 shadow-2xl"
         style="background: linear-gradient(135deg, #003A40, #005D56); border: 2px solid ${tier.hex}; box-shadow: 0 0 40px ${tier.glow}, 0 20px 60px rgba(0,0,0,0.4);">
      <div class="text-xs font-display font-bold uppercase tracking-widest mb-3 opacity-70" style="color:${tier.hex};">✦ Medalha Desbloqueada!</div>
      <div class="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4" style="background:${tier.hex};">
        <i data-lucide="${badge.icon}" class="w-10 h-10" style="color:#003A40;"></i>
      </div>
      <div class="font-display text-xl font-bold text-white mb-1">${badge.name}</div>
      <div class="text-sm text-white/60 mb-4">${badge.desc}</div>
      <div class="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-display font-bold" style="background:${tier.hex};color:#003A40;">
        ${tier.label}
      </div>
      <button onclick="this.closest('.badge-toast').parentElement.remove()" class="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors">
        <i data-lucide="x" style="width:14px;height:14px;"></i>
      </button>
    </div>
  `;
  document.body.appendChild(toast);
  lucide.createIcons();

  // Animate in
  const inner = toast.querySelector('.badge-toast');
  inner.style.transform = 'scale(0.7) translateY(40px)';
  inner.style.opacity = '0';
  inner.style.transition = 'transform 0.5s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    inner.style.transform = 'scale(1) translateY(0)';
    inner.style.opacity = '1';
  }));

  // Auto-dismiss after 4s
  setTimeout(() => {
    inner.style.transform = 'scale(0.9) translateY(-20px)';
    inner.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

// ─── Header Auth Injection ────────────────────────────────────────────────────

async function initHeaderAuth() {
  const slot = document.getElementById('header-auth-slot');
  if (!slot) return;

  const user = await authGetUser();

  if (!user) {
    slot.innerHTML = `
      <a href="auth.html" id="header-register-btn"
         class="inline-flex items-center gap-1.5 border border-white/40 text-white hover:bg-white/10 active:scale-95
                font-display font-bold text-[11px] uppercase tracking-wider px-3.5 py-1.5 rounded-full transition-all duration-200 whitespace-nowrap">
        <i data-lucide="user-plus" class="w-3.5 h-3.5"></i>
        Registar-se
      </a>`;
    lucide.createIcons();
    return;
  }

  const profile = await profileGet(user.id);
  const name    = profile?.username || user.email?.split('@')[0] || 'U';
  const initial = name.charAt(0).toUpperCase();

  slot.innerHTML = `
    <div class="relative flex-shrink-0" id="header-user-wrap">
      <button id="header-avatar-btn"
              class="w-9 h-9 rounded-full overflow-hidden border-2 border-white/25 hover:border-praia-yellow-400
                     transition-all duration-200 focus:outline-none focus:border-praia-yellow-400 flex items-center
                     justify-center bg-praia-teal-700 flex-shrink-0"
              aria-label="Menu de perfil" aria-haspopup="true">
        ${profile?.avatar_url
          ? `<img src="${profile.avatar_url}" alt="${name}" class="w-full h-full object-cover">`
          : `<span class="font-display font-bold text-sm text-praia-yellow-400">${initial}</span>`}
      </button>
      <div id="header-dropdown"
           class="hidden absolute right-0 top-11 w-48 bg-praia-teal-800 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50"
           style="box-shadow: 0 20px 60px rgba(0,0,0,0.4);">
        <div class="px-4 py-3 border-b border-white/10">
          <div class="font-display text-xs font-bold text-white truncate">${name}</div>
          <div class="text-[10px] text-white/40 truncate mt-0.5">${user.email || ''}</div>
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

  lucide.createIcons();

  const btn      = document.getElementById('header-avatar-btn');
  const dropdown = document.getElementById('header-dropdown');

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const isHidden = dropdown.classList.contains('hidden');
    dropdown.classList.toggle('hidden', !isHidden);
    dropdown.style.animation = isHidden ? 'dropdownIn 0.2s cubic-bezier(0.34,1.56,0.64,1) forwards' : '';
  });
  document.addEventListener('click', () => dropdown.classList.add('hidden'));
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
      to { filter: hue-rotate(360deg) brightness(1.1); }
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
