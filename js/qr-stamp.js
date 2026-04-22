// ─── QR → Carimbar Praia ──────────────────────────────────────────────────────
// Lógica da página carimbar.html. Valida GPS (≤2km da praia), carimba no
// Supabase (ou localStorage para convidados) e celebra medalhas ganhas antes
// de mostrar o card de desbloqueio da praia.
// ─────────────────────────────────────────────────────────────────────────────

(() => {
  const MAX_DISTANCE_KM = 2;
  const GPS_TIMEOUT_MS  = 15000;
  const GUEST_STORAGE_KEY = 'passport_stamps';

  const root = () => document.getElementById('carimbar-state');

  // ── Utilities ──────────────────────────────────────────────────────────────
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);

  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  function formatDatePT(d) {
    const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
                    'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  function todayISO() {
    return new Date().toISOString().split('T')[0];
  }

  // ── GPS ────────────────────────────────────────────────────────────────────
  function getPosition() {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        return reject({ code: 'UNSUPPORTED' });
      }
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
        (err) => reject({ code: err.code, message: err.message }),
        { enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS, maximumAge: 30000 },
      );
    });
  }

  function gpsErrorState(err) {
    // err.code: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT
    if (err?.code === 'UNSUPPORTED') {
      return {
        eyebrow: 'SEM LOCALIZAÇÃO',
        title: 'Este dispositivo não suporta localização',
        body: 'Tente abrir este QR code num telemóvel com GPS.',
        primaryLabel: 'Voltar ao início',
        primaryHref: 'index.html',
      };
    }
    if (err?.code === 1) {
      return {
        eyebrow: 'PERMISSÃO NECESSÁRIA',
        title: 'Permita o acesso à localização',
        body: 'Precisamos de confirmar que está na praia para registar o carimbo. Toque em "Tentar de novo" e autorize o acesso à localização.',
        primaryLabel: 'Tentar de novo',
        primaryAction: 'reload',
      };
    }
    if (err?.code === 3) {
      return {
        eyebrow: 'SEM SINAL DE GPS',
        title: 'Não foi possível obter a sua localização',
        body: 'O sinal pode estar fraco no local. Saia da zona coberta e tente de novo.',
        primaryLabel: 'Tentar de novo',
        primaryAction: 'reload',
      };
    }
    return {
      eyebrow: 'LOCALIZAÇÃO INDISPONÍVEL',
      title: 'Não foi possível obter a sua localização',
      body: 'Verifique se o GPS está ativo e tente novamente.',
      primaryLabel: 'Tentar de novo',
      primaryAction: 'reload',
    };
  }

  // ── Render: States ─────────────────────────────────────────────────────────
  function renderLoading(title = 'A preparar o carimbo…', sub = 'Vamos confirmar a sua localização para registar a visita.') {
    root().innerHTML = `
      <div class="loading-card">
        <div class="loading-pulse" aria-hidden="true"></div>
        <h1 class="loading-title">${esc(title)}</h1>
        <p class="loading-sub">${esc(sub)}</p>
      </div>`;
  }

  function renderError({ eyebrow, title, body, primaryLabel, primaryAction, primaryHref, secondaryLabel, secondaryHref }) {
    const el = root();
    el.innerHTML = `
      <div class="error-card">
        <div class="error-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </div>
        <div class="error-eyebrow">${esc(eyebrow)}</div>
        <h1 class="error-title">${esc(title)}</h1>
        <p class="error-body">${esc(body)}</p>
        <div class="error-actions">
          ${primaryAction === 'reload'
            ? `<button class="btn btn-primary" id="err-primary">${esc(primaryLabel)}</button>`
            : `<a class="btn btn-primary" href="${esc(primaryHref || 'index.html')}">${esc(primaryLabel)}</a>`}
          ${secondaryLabel ? `<a class="btn btn-ghost" href="${esc(secondaryHref || 'index.html')}">${esc(secondaryLabel)}</a>` : ''}
        </div>
      </div>`;
    const reloadBtn = el.querySelector('#err-primary');
    if (reloadBtn) reloadBtn.addEventListener('click', () => location.reload());
  }

  function buildStampDiscHTML(dateStr, wasAlready) {
    const midLine = wasAlready ? 'REVISITA' : 'CARIMBADA';
    return `
      <div class="stamp-disc" aria-hidden="true">
        <span class="stamp-top">Passaporte</span>
        <span class="stamp-mid">${midLine}</span>
        <span class="stamp-bot">${esc(dateStr)}</span>
      </div>`;
  }

  function renderSuccess({ beach, stampsTotal, stampsAvailable, isGuest, wasAlready }) {
    const photo = beach.thumbnail || (beach.photos && beach.photos[0]) || '';
    const meta = [beach.municipality, beach.river].filter(Boolean);
    const pct = Math.max(3, Math.round((stampsTotal / Math.max(1, stampsAvailable)) * 100));
    const eyebrow = wasAlready ? 'VISITA REGISTADA' : 'PRAIA DESBLOQUEADA';

    const el = root();
    el.innerHTML = `
      <div class="hero">
        ${photo ? `<div class="hero-photo" style="background-image:url('${esc(photo)}')"></div>` : ''}
        <div class="hero-overlay"></div>
        <div class="hero-grain"></div>
        ${buildStampDiscHTML(formatDatePT(new Date()), wasAlready)}
        <div class="hero-eyebrow">${eyebrow}</div>
      </div>
      <div class="body-pad">
        <h1 class="beach-name">${esc(beach.name)}</h1>
        <div class="beach-meta">
          ${meta.map((m, i) => `${i > 0 ? '<span class="sep"></span>' : ''}<span>${esc(m)}</span>`).join('')}
        </div>

        <div class="progress-wrap">
          <div class="progress-label">
            <span>Progresso do passaporte</span>
            <strong>${stampsTotal} <span style="color:rgba(232,223,208,0.55);font-weight:600">/ ${stampsAvailable}</span></strong>
          </div>
          <div class="progress-track"><div class="progress-fill" id="progress-fill" style="width:0%"></div></div>
        </div>

        <div class="actions">
          <a class="btn btn-primary" href="passaporte.html">Ver o meu passaporte</a>
          <a class="btn btn-ghost" href="mapa.html">Explorar mais praias</a>
        </div>

        ${isGuest ? `
          <div class="guest-note">
            <strong>Guarde este carimbo na sua conta.</strong><br>
            O carimbo ficou gravado neste dispositivo. <a href="auth.html?redirect=passaporte.html" style="color:#FFEB3B;text-decoration:underline;font-weight:700">Crie uma conta ou inicie sessão</a> para o juntar ao seu passaporte digital.
          </div>` : ''}
      </div>`;

    // Animate progress bar after card settles
    requestAnimationFrame(() => {
      setTimeout(() => {
        const f = document.getElementById('progress-fill');
        if (f) f.style.width = `${pct}%`;
      }, 50);
    });

    // Confetti burst (subtle, matches yellow/teal palette)
    if (window.confetti && !wasAlready) {
      const colors = ['#FFEB3B', '#FFF176', '#26C4AB', '#ffffff'];
      setTimeout(() => {
        window.confetti({
          particleCount: 90,
          spread: 75,
          startVelocity: 42,
          origin: { x: 0.5, y: 0.35 },
          colors,
        });
      }, 550);
      setTimeout(() => {
        window.confetti({
          particleCount: 60, angle: 60, spread: 60,
          origin: { x: 0, y: 0.6 }, colors,
        });
      }, 850);
      setTimeout(() => {
        window.confetti({
          particleCount: 60, angle: 120, spread: 60,
          origin: { x: 1, y: 0.6 }, colors,
        });
      }, 1000);
    }
  }

  // ── Stamp writers ──────────────────────────────────────────────────────────
  async function stampForUser(userId, beachId) {
    return window.AuthUtils.stampAdd(userId, beachId);
  }

  function stampForGuest(beachId) {
    try {
      const raw = localStorage.getItem(GUEST_STORAGE_KEY);
      const current = raw ? JSON.parse(raw) : {};
      current[beachId] = { date: todayISO() };
      localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(current));
      return true;
    } catch (err) {
      console.error('[stampForGuest] localStorage write failed:', err);
      return false;
    }
  }

  function getGuestStamps() {
    try {
      const raw = localStorage.getItem(GUEST_STORAGE_KEY);
      if (!raw) return [];
      const obj = JSON.parse(raw) || {};
      return Object.entries(obj).map(([beach_id, v]) => ({
        beach_id,
        stamped_at: (v && v.date) || todayISO(),
      }));
    } catch {
      return [];
    }
  }

  // ── Side data for badge computation ────────────────────────────────────────
  async function loadReviewsAndVoted(user) {
    if (!user) return { reviews: [], voted: false };
    try {
      const [reviewsRes, votedRes] = await Promise.all([
        window.AuthUtils.supabase
          .from('reviews').select('images').eq('user_id', user.id)
          .then(r => r.data || []).catch(() => []),
        window.AuthUtils.voteGet(user.id, new Date().getFullYear())
          .then(v => !!v).catch(() => false),
      ]);
      return { reviews: reviewsRes, voted: votedRes };
    } catch {
      return { reviews: [], voted: false };
    }
  }

  async function getCurrentStamps(user) {
    if (user) {
      try { return await window.AuthUtils.stampsGetAll(user.id); }
      catch { return []; }
    }
    return getGuestStamps();
  }

  // ── Badge celebration sequencer ────────────────────────────────────────────
  // celebrateBadge cria um overlay fixed fullscreen que auto-dismiss em 4000ms
  // (7000ms para mitico) + 400ms de fade. Estratégia: dispara todas as medalhas
  // com stagger de 1800ms (cadência igual ao passaporte.js), aguarda um beat
  // curto para a primeira aterrar, e devolve o controlo. O card da praia é
  // depois renderizado por baixo dos overlays — à medida que estes fade out,
  // o card emerge naturalmente.
  async function celebrateBadgesSequentially(newBadges) {
    const { celebrateBadge } = window.AuthUtils || {};
    if (!celebrateBadge || !newBadges.length) return;
    const toCelebrate = newBadges.slice(0, 3);
    toCelebrate.forEach((badge, i) => {
      setTimeout(() => celebrateBadge(badge), i * 1800);
    });
    // Deixa a primeira medalha aterrar antes de pintar o card por baixo.
    await wait(500);
  }

  // ── Main flow ──────────────────────────────────────────────────────────────
  async function main() {
    // 1. Parse beach id
    const beachId = new URLSearchParams(location.search).get('id');
    if (!beachId) {
      return renderError({
        eyebrow: 'QR CODE INVÁLIDO',
        title: 'Código em falta',
        body: 'Este link não inclui a referência da praia. Tente scanear o QR code novamente.',
        primaryLabel: 'Voltar ao início',
        primaryHref: 'index.html',
      });
    }

    // 2. Load beaches + user in parallel
    let beaches = [];
    let user = null;
    try {
      [beaches, user] = await Promise.all([
        (window.loadData ? window.loadData('beaches') : Promise.resolve([])).catch(() => []),
        (window.AuthUtils ? window.AuthUtils.authGetUser() : Promise.resolve(null)).catch(() => null),
      ]);
    } catch (err) {
      console.error('[qr-stamp] bootstrap failed:', err);
    }
    beaches = (beaches || []).filter(b => !b.hidden);

    const beach = beaches.find(b => b.id === beachId);
    if (!beach) {
      return renderError({
        eyebrow: 'PRAIA NÃO ENCONTRADA',
        title: 'Não conseguimos identificar esta praia',
        body: 'O código pode estar desatualizado ou a praia pode ter sido removida do guia.',
        primaryLabel: 'Ver mapa de praias',
        primaryHref: 'mapa.html',
      });
    }
    if (!beach.coordinates || typeof beach.coordinates.lat !== 'number' || typeof beach.coordinates.lng !== 'number') {
      return renderError({
        eyebrow: 'PRAIA INCOMPLETA',
        title: 'Coordenadas da praia em falta',
        body: 'Não conseguimos validar a localização desta praia. Contacte-nos para corrigir.',
        primaryLabel: 'Voltar ao início',
        primaryHref: 'index.html',
      });
    }

    // 3. GPS
    renderLoading('A validar a sua localização…', 'Confirme a permissão de GPS no seu telemóvel, por favor.');
    let pos;
    try {
      pos = await getPosition();
    } catch (err) {
      return renderError(gpsErrorState(err));
    }

    // 4. Distance check (uses haversineDistance from shared.js)
    const distKm = haversineDistance(
      pos.lat, pos.lng,
      beach.coordinates.lat, beach.coordinates.lng,
    );
    if (distKm > MAX_DISTANCE_KM) {
      const distStr = distKm < 10
        ? `${distKm.toFixed(1)} km`
        : `${Math.round(distKm)} km`;
      return renderError({
        eyebrow: 'FORA DO ALCANCE',
        title: `Está a ${distStr} de ${beach.name}`,
        body: `Para registar a visita precisa de estar a menos de ${MAX_DISTANCE_KM} km da praia. Aproxime-se e tente novamente.`,
        primaryLabel: 'Tentar de novo',
        primaryAction: 'reload',
        secondaryLabel: 'Ver a praia no mapa',
        secondaryHref: `praia.html?id=${encodeURIComponent(beach.id)}`,
      });
    }

    // 5. Load side data for badge computation
    renderLoading('A registar o carimbo…', 'A gravar a sua visita no passaporte.');
    const [{ reviews, voted }, stampsBefore] = await Promise.all([
      loadReviewsAndVoted(user),
      getCurrentStamps(user),
    ]);

    const wasAlready = stampsBefore.some(s => s.beach_id === beachId);

    // 6. Snapshot badges BEFORE
    let prevEarnedIds = new Set();
    try {
      const before = window.AuthUtils.badgesCompute({ stamps: stampsBefore, reviews, voted, beaches });
      prevEarnedIds = new Set(before.filter(b => b.earned).map(b => b.id));
    } catch (err) {
      console.warn('[qr-stamp] badgesCompute before failed:', err);
    }

    // 7. Write the stamp
    const ok = user
      ? await stampForUser(user.id, beachId)
      : stampForGuest(beachId);

    if (!ok) {
      return renderError({
        eyebrow: 'ERRO A GRAVAR',
        title: 'Não foi possível guardar o carimbo',
        body: 'Verifique a sua ligação à internet e tente de novo. Se o erro persistir, contacte-nos.',
        primaryLabel: 'Tentar de novo',
        primaryAction: 'reload',
      });
    }

    // 8. Compute stamps AFTER (merge in the new one)
    const stampsAfter = [
      ...stampsBefore.filter(s => s.beach_id !== beachId),
      { beach_id: beachId, stamped_at: todayISO() },
    ];

    // 9. Badges AFTER + diff
    let newlyEarned = [];
    let afterEarnedIds = [];
    try {
      const after = window.AuthUtils.badgesCompute({ stamps: stampsAfter, reviews, voted, beaches });
      afterEarnedIds = after.filter(b => b.earned).map(b => b.id);
      newlyEarned = after.filter(b => b.earned && !prevEarnedIds.has(b.id));
    } catch (err) {
      console.warn('[qr-stamp] badgesCompute after failed:', err);
    }

    // 10. Persist badge state so passaporte.html não re-celebra
    try {
      const storageKey = user ? `badges_${user.id}` : 'badges_guest';
      localStorage.setItem(storageKey, JSON.stringify(afterEarnedIds));
    } catch {}

    // 11. Celebrate medals FIRST if any were earned (priority rule)
    if (newlyEarned.length > 0) {
      renderLoading('Desbloqueou uma nova medalha!', 'Aguarde um instante…');
      await celebrateBadgesSequentially(newlyEarned);
    }

    // 12. Show the beach unlock card
    const stampsAvailable = beaches.length;
    renderSuccess({
      beach,
      stampsTotal: stampsAfter.length,
      stampsAvailable,
      isGuest: !user,
      wasAlready,
    });
  }

  // Kickoff
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();
