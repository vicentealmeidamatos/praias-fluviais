// ─── Passport Digital Logic ───
// State stored in localStorage key "passport_stamps"
// Format: { "beach-id": { stamped: true, date: "2026-01-15" }, ... }

const STORAGE_KEY = 'passport_stamps';

function getStamps() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function setStamps(stamps) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stamps));
}

function toggleStamp(beachId) {
  const stamps = getStamps();
  if (stamps[beachId]) {
    delete stamps[beachId];
  } else {
    stamps[beachId] = { stamped: true, date: new Date().toISOString().split('T')[0] };
  }
  setStamps(stamps);
  return stamps;
}

function isStamped(beachId) {
  const stamps = getStamps();
  return !!stamps[beachId];
}

function getTotalStamped() {
  return Object.keys(getStamps()).length;
}

// Badge definitions
const BADGES = [
  {
    id: 'explorador-norte',
    name: 'Explorador do Norte',
    description: 'Visite 3 praias na região Norte',
    icon: 'compass',
    region: 'norte',
    required: 3,
  },
  {
    id: 'explorador-centro',
    name: 'Explorador do Centro',
    description: 'Visite 3 praias na região Centro',
    icon: 'compass',
    region: 'centro',
    required: 3,
  },
  {
    id: 'explorador-sul',
    name: 'Explorador do Sul',
    description: 'Visite 2 praias no Alentejo ou Algarve',
    icon: 'sun',
    regions: ['alentejo', 'algarve'],
    required: 2,
  },
  {
    id: 'iniciante',
    name: 'Primeiro Mergulho',
    description: 'Carimbe a sua primeira praia',
    icon: 'droplets',
    total: 1,
  },
  {
    id: 'aventureiro',
    name: 'Aventureiro',
    description: 'Visite 5 praias fluviais',
    icon: 'mountain',
    total: 5,
  },
  {
    id: 'super-explorador',
    name: 'Super Explorador',
    description: 'Visite 10 praias fluviais',
    icon: 'trophy',
    total: 10,
  },
];

function checkBadges(beaches) {
  const stamps = getStamps();
  const stampedIds = Object.keys(stamps);
  const totalStamped = stampedIds.length;

  return BADGES.map(badge => {
    let earned = false;
    if (badge.total !== undefined) {
      earned = totalStamped >= badge.total;
    } else if (badge.region) {
      const regionCount = stampedIds.filter(id => {
        const beach = beaches.find(b => b.id === id);
        return beach && beach.region === badge.region;
      }).length;
      earned = regionCount >= badge.required;
    } else if (badge.regions) {
      const regionCount = stampedIds.filter(id => {
        const beach = beaches.find(b => b.id === id);
        return beach && badge.regions.includes(beach.region);
      }).length;
      earned = regionCount >= badge.required;
    }
    return { ...badge, earned };
  });
}

// Render stamp grid
function renderStampGrid(beaches, container) {
  const stamps = getStamps();
  const stampBeaches = beaches.filter(b => b.passportStamp);

  container.innerHTML = stampBeaches.map(beach => {
    const stamped = !!stamps[beach.id];
    return `
      <div class="stamp-slot ${stamped ? 'stamped' : 'unstamped'} relative group rounded-xl border-2 p-4 text-center cursor-pointer transition-transform duration-300 ${
        stamped
          ? 'bg-praia-yellow-50 border-praia-yellow-400 shadow-layered-yellow'
          : 'bg-praia-sand-100 border-praia-sand-200'
      }" data-beach-id="${beach.id}" style="transition-property: transform, opacity;">
        <div class="mb-2">
          ${stamped
            ? '<i data-lucide="check-circle-2" class="w-8 h-8 mx-auto text-praia-teal-700"></i>'
            : '<i data-lucide="lock" class="w-8 h-8 mx-auto text-praia-sand-300"></i>'
          }
        </div>
        <div class="font-display text-xs font-semibold ${stamped ? 'text-praia-teal-800' : 'text-praia-sand-400'} leading-tight truncate" title="${beach.name}">
          ${beach.name.replace('Praia Fluvial de ', '').replace('Praia Fluvial do ', '').replace('Praia Fluvial da ', '').replace('Zona de Fruição Ribeirinha da ', '')}
        </div>
        <div class="text-[10px] mt-1 ${stamped ? 'text-praia-sand-600' : 'text-praia-sand-300'}">
          ${beach.municipality}
        </div>
        ${stamped && stamps[beach.id]?.date ? `<div class="text-[10px] mt-1 text-praia-teal-500 font-semibold">${stamps[beach.id].date}</div>` : ''}
        <div class="absolute inset-0 rounded-xl bg-praia-teal-800/5 opacity-0 group-hover:opacity-100" style="transition: opacity 0.3s;"></div>
      </div>
    `;
  }).join('');

  // Add click handlers for demo toggling
  container.querySelectorAll('.stamp-slot').forEach(el => {
    el.addEventListener('click', () => {
      const beachId = el.dataset.beachId;
      toggleStamp(beachId);
      renderStampGrid(beaches, container);
      renderStats(beaches);
      renderBadges(beaches, document.getElementById('badges-grid'));
      lucide.createIcons();
    });
  });
}

// Render statistics
function renderStats(beaches) {
  const stampBeaches = beaches.filter(b => b.passportStamp);
  const total = stampBeaches.length;
  const collected = getTotalStamped();
  const pct = total > 0 ? Math.round((collected / total) * 100) : 0;

  document.getElementById('stat-collected').textContent = collected;
  document.getElementById('stat-available').textContent = total;
  document.getElementById('stat-percentage').textContent = pct + '%';

  const bar = document.getElementById('progress-bar');
  if (bar) {
    bar.style.width = pct + '%';
  }
}

// Render badges
function renderBadges(beaches, container) {
  const badgeStatus = checkBadges(beaches);
  container.innerHTML = badgeStatus.map(badge => `
    <div class="rounded-xl border-2 p-5 text-center ${
      badge.earned
        ? 'bg-praia-yellow-50 border-praia-yellow-400 shadow-layered-yellow'
        : 'bg-praia-sand-50 border-praia-sand-200 opacity-60'
    }">
      <div class="mb-3 inline-flex items-center justify-center w-12 h-12 rounded-full ${
        badge.earned ? 'bg-praia-teal-800' : 'bg-praia-sand-200'
      }">
        <i data-lucide="${badge.icon}" class="w-6 h-6 ${badge.earned ? 'text-praia-yellow-400' : 'text-praia-sand-400'}"></i>
      </div>
      <div class="font-display text-sm font-bold ${badge.earned ? 'text-praia-teal-800' : 'text-praia-sand-500'}">${badge.name}</div>
      <div class="text-xs mt-1 ${badge.earned ? 'text-praia-sand-600' : 'text-praia-sand-400'}">${badge.description}</div>
      ${badge.earned ? '<div class="mt-2"><span class="badge badge-gold"><i data-lucide="check" class="w-3 h-3"></i> Conquistado</span></div>' : ''}
    </div>
  `).join('');
}
