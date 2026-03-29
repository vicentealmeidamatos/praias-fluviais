// ─── Voting System ───
document.addEventListener('DOMContentLoaded', async () => {
  const grid = document.getElementById('voting-grid');
  const searchInput = document.getElementById('vote-search');
  const regionSelect = document.getElementById('vote-region');
  const nearMeBtn = document.getElementById('vote-near-me');
  const countEl = document.getElementById('vote-count');
  if (!grid) return;

  // Load settings
  let settings = {};
  try {
    const r = await fetch('data/settings.json');
    settings = await r.json();
  } catch {}

  // Countdown
  initCountdown(settings.votingDeadline || '2026-10-31T23:59:59');

  // Load beaches
  let beaches = [];
  try {
    const res = await fetch('data/beaches.json');
    beaches = await res.json();
  } catch {
    grid.innerHTML = '<p class="col-span-full text-center text-praia-sand-500 py-10">Erro ao carregar praias.</p>';
    return;
  }

  // Check if preselected
  const preselect = new URLSearchParams(window.location.search).get('preselect');

  // Check existing vote
  const existingVote = JSON.parse(localStorage.getItem('vote_2026') || 'null');

  let currentBeaches = [...beaches];

  function renderCards(list) {
    if (list.length === 0) {
      grid.innerHTML = '<p class="col-span-full text-center text-praia-sand-500 py-10">Nenhuma praia encontrada.</p>';
      return;
    }

    grid.innerHTML = list.map(b => {
      const isVoted = existingVote && existingVote.beachId === b.id;
      const badgesHtml = [];
      if (b.services.blueFlag) badgesHtml.push('<span class="badge badge-blue-flag text-[10px]">Bandeira Azul</span>');
      if (b.services.accessible) badgesHtml.push('<span class="badge badge-accessible text-[10px]">Acessível</span>');

      return `
        <div class="card-interactive rounded-2xl overflow-hidden bg-white shadow-layered group ${isVoted ? 'ring-2 ring-praia-yellow-400' : ''}">
          <div class="relative h-44 overflow-hidden">
            <img src="${b.photos[0]}" alt="${b.name}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" loading="lazy">
            <div class="absolute inset-0 bg-gradient-to-t from-praia-teal-800/60 via-transparent to-transparent"></div>
            ${badgesHtml.length ? `<div class="absolute top-3 left-3 flex gap-1.5">${badgesHtml.join('')}</div>` : ''}
            ${isVoted ? '<div class="absolute top-3 right-3 bg-praia-yellow-400 text-praia-teal-800 rounded-full p-1.5"><i data-lucide="check" class="w-4 h-4"></i></div>' : ''}
          </div>
          <div class="p-4">
            <h3 class="font-display text-sm font-bold text-praia-teal-800 leading-snug mb-1">${b.name}</h3>
            <p class="text-xs text-praia-sand-500 mb-4">${b.municipality} · ${b.river}</p>
            ${isVoted
              ? '<div class="text-center py-2 bg-praia-yellow-400/10 rounded-lg"><span class="font-display text-xs font-bold text-praia-yellow-700 uppercase tracking-wider">O Seu Voto</span></div>'
              : `<button onclick="openVoteModal('${b.id}', '${b.name.replace(/'/g, "\\'")}')" class="btn-primary w-full flex items-center justify-center gap-2 bg-praia-teal-800 text-praia-yellow-400 font-display text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded-xl">
                  <i data-lucide="heart" class="w-4 h-4"></i> Votar
                </button>`
            }
          </div>
        </div>
      `;
    }).join('');

    if (countEl) countEl.textContent = `${list.length} praias`;
    lucide.createIcons();
  }

  function filterBeaches() {
    const search = (searchInput?.value || '').toLowerCase().trim();
    const region = regionSelect?.value || '';

    currentBeaches = beaches.filter(b => {
      if (search && !b.name.toLowerCase().includes(search) && !b.municipality.toLowerCase().includes(search)) return false;
      if (region && b.region !== region) return false;
      return true;
    });

    renderCards(currentBeaches);
  }

  searchInput?.addEventListener('input', filterBeaches);
  regionSelect?.addEventListener('change', filterBeaches);

  nearMeBtn?.addEventListener('click', async () => {
    nearMeBtn.disabled = true;
    nearMeBtn.textContent = 'A localizar...';
    try {
      const pos = await getUserLocation();
      currentBeaches = sortByDistance(beaches, pos.lat, pos.lng);
      renderCards(currentBeaches);
    } catch (err) {
      alert(err.message);
    } finally {
      nearMeBtn.disabled = false;
      nearMeBtn.innerHTML = '<i data-lucide="navigation" class="w-4 h-4"></i> Perto de Mim';
      lucide.createIcons();
    }
  });

  // Initial render
  renderCards(beaches);

  // If preselected, open modal
  if (preselect && !existingVote) {
    const beach = beaches.find(b => b.id === preselect);
    if (beach) {
      setTimeout(() => openVoteModal(beach.id, beach.name), 500);
    }
  }
});

// ─── Countdown Timer ───
function initCountdown(deadline) {
  const els = {
    days: document.getElementById('cd-days'),
    hours: document.getElementById('cd-hours'),
    minutes: document.getElementById('cd-minutes'),
    seconds: document.getElementById('cd-seconds'),
  };

  function update() {
    const now = new Date();
    const target = new Date(deadline);
    const diff = target - now;

    if (diff <= 0) {
      Object.values(els).forEach(el => { if (el) el.textContent = '00'; });
      return;
    }

    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
    const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((diff % (1000 * 60)) / 1000);

    if (els.days) els.days.textContent = String(d).padStart(2, '0');
    if (els.hours) els.hours.textContent = String(h).padStart(2, '0');
    if (els.minutes) els.minutes.textContent = String(m).padStart(2, '0');
    if (els.seconds) els.seconds.textContent = String(s).padStart(2, '0');
  }

  update();
  setInterval(update, 1000);
}

// ─── Vote Modal ───
function openVoteModal(beachId, beachName) {
  const existing = document.getElementById('vote-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'vote-modal';
  modal.className = 'fixed inset-0 z-[2000] flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick="closeVoteModal()"></div>
    <div class="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 transform scale-95 opacity-0" style="transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease;" id="vote-modal-inner">
      <button onclick="closeVoteModal()" class="absolute top-4 right-4 text-praia-sand-400 hover:text-praia-sand-600 p-1"><i data-lucide="x" class="w-5 h-5"></i></button>

      <div class="text-center mb-6">
        <div class="w-14 h-14 bg-praia-yellow-400/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <i data-lucide="heart" class="w-7 h-7 text-praia-yellow-600"></i>
        </div>
        <h3 class="font-display text-xl font-bold text-praia-teal-800 mb-1">Confirme o seu voto</h3>
        <p class="text-praia-sand-500 text-sm">${beachName}</p>
      </div>

      <form id="vote-form" onsubmit="event.preventDefault(); submitVote('${beachId}', '${beachName.replace(/'/g, "\\'")}');">
        <div class="mb-4">
          <label class="font-display text-xs font-semibold uppercase tracking-wider text-praia-teal-700 block mb-2">Email</label>
          <input type="email" id="vote-email" required placeholder="O seu email" class="w-full px-4 py-3 rounded-xl bg-praia-sand-50 border border-praia-sand-200 text-sm focus:outline-none focus:border-praia-teal-400 transition-colors duration-300">
        </div>
        <label class="flex items-start gap-3 mb-6 cursor-pointer">
          <input type="checkbox" id="vote-terms" required class="mt-0.5 w-4 h-4 rounded border-praia-sand-300 text-praia-teal-600 focus:ring-praia-yellow-400">
          <span class="text-xs text-praia-sand-600 leading-relaxed">Aceito os termos e condições e quero receber o Guia Digital 2026.</span>
        </label>
        <button type="submit" class="btn-primary w-full bg-praia-yellow-400 text-praia-teal-800 font-display font-bold text-sm uppercase tracking-wider py-3.5 rounded-xl shadow-layered-yellow">
          Confirmar Voto
        </button>
      </form>
    </div>
  `;

  document.body.appendChild(modal);
  lucide.createIcons();

  // Animate in
  requestAnimationFrame(() => {
    const inner = document.getElementById('vote-modal-inner');
    if (inner) { inner.style.transform = 'scale(1)'; inner.style.opacity = '1'; }
  });
}

function closeVoteModal() {
  const modal = document.getElementById('vote-modal');
  if (modal) modal.remove();
}

function submitVote(beachId, beachName) {
  const email = document.getElementById('vote-email')?.value?.trim();
  if (!email) return;

  // Save vote
  localStorage.setItem('vote_2026', JSON.stringify({
    beachId, email,
    timestamp: new Date().toISOString(),
    confirmed: true,
  }));

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

        <div class="bg-praia-sand-50 rounded-xl p-4 mb-6">
          <p class="font-display text-xs uppercase tracking-wider text-praia-teal-500 font-semibold mb-2">Esta praia está no</p>
          <p class="font-display text-3xl font-bold text-praia-yellow-600">Top 10</p>
          <p class="text-xs text-praia-sand-500 mt-1">da sua região!</p>
        </div>

        <div class="flex gap-2 justify-center mb-6">
          <button onclick="shareVote('${beachName}')" class="btn-primary inline-flex items-center gap-2 bg-praia-teal-800 text-white font-display text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-full">
            <i data-lucide="share-2" class="w-4 h-4"></i> Partilhar
          </button>
        </div>

        <button onclick="closeVoteModal(); location.reload();" class="text-praia-sand-500 text-sm hover:text-praia-teal-700 transition-colors duration-300">Fechar</button>
      </div>
    `;
    lucide.createIcons();
  }
}

async function shareVote(beachName) {
  const text = `Acabei de votar na ${beachName} para Praia Fluvial do Ano 2026! Vota também: ${window.location.origin}/votar.html`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Voto Praia do Ano 2026', text }); } catch {}
  } else {
    await navigator.clipboard.writeText(text);
    alert('Texto copiado para partilhar!');
  }
}
