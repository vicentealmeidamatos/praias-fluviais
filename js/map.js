// ─── Interactive Map ───
document.addEventListener('DOMContentLoaded', async () => {
  const mapEl = document.getElementById('map-main');
  if (!mapEl) return;

  // Load beach data
  let beaches = [];
  try {
    const res = await fetch('data/beaches.json');
    beaches = await res.json();
  } catch {
    mapEl.innerHTML = '<p class="p-8 text-center text-praia-sand-500">Erro ao carregar dados das praias.</p>';
    return;
  }

  // Initialize map — bounded to continental Portugal
  const PT_BOUNDS = [[36.8, -9.6], [42.2, -6.1]];
  const map = L.map('map-main', {
    center: [39.5, -8.0],
    zoom: 7,
    minZoom: 6,
    maxZoom: 18,
    maxBounds: PT_BOUNDS,
    maxBoundsViscosity: 1.0,
    zoomControl: false,
    attributionControl: false,
  });

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);

  // Marker cluster group
  const markers = L.markerClusterGroup({
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    iconCreateFunction: (cluster) => {
      const count = cluster.getChildCount();
      return L.divIcon({
        html: `<div style="background:#003A40;color:#FFEB3B;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-family:Poppins,sans-serif;font-weight:700;font-size:14px;border:3px solid #FFEB3B;box-shadow:0 4px 12px rgba(0,58,64,0.3);">${count}</div>`,
        className: '',
        iconSize: [40, 40],
      });
    },
  });

  // Service icons for popups
  const serviceLabels = {
    bar: 'Bar', grills: 'Grelhadores', lifeguard: 'Nadador-salvador',
    blueFlag: 'Bandeira Azul', goldQuality: 'Qualidade Ouro',
    accessible: 'Acessível', parking: 'Estacionamento',
    wc: 'WC', picnicArea: 'Piquenique', camping: 'Campismo',
  };

  // Create markers
  const allMarkers = [];
  beaches.forEach(beach => {
    let color = '#003A40';
    if (beach.services.blueFlag) color = '#0288D1';
    if (beach.services.goldQuality) color = '#F5B800';

    const icon = L.divIcon({
      className: '',
      html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    const activeServices = Object.entries(beach.services)
      .filter(([, v]) => v)
      .map(([k]) => serviceLabels[k])
      .join(' · ');

    const marker = L.marker([beach.coordinates.lat, beach.coordinates.lng], { icon });

    marker.bindPopup(`
      <div style="min-width:220px;font-family:'Open Sans',sans-serif;">
        <img src="${beach.photos[0]}" alt="${beach.name}" style="width:100%;height:120px;object-fit:cover;border-radius:8px 8px 0 0;" loading="lazy">
        <div style="padding:12px;">
          <h3 style="font-family:Poppins,sans-serif;font-weight:700;font-size:14px;color:#003A40;margin:0 0 4px;">${beach.name}</h3>
          <p style="font-size:12px;color:#8A7D60;margin:0 0 8px;">${beach.municipality} · ${beach.river}</p>
          <p style="font-size:11px;color:#A89A78;margin:0 0 10px;">${activeServices}</p>
          <a href="praia.html?id=${beach.id}" style="display:inline-flex;align-items:center;gap:6px;background:#003A40;color:#FFEB3B;padding:6px 14px;border-radius:20px;font-family:Poppins,sans-serif;font-size:11px;font-weight:600;text-decoration:none;text-transform:uppercase;letter-spacing:0.05em;">Ver Praia →</a>
        </div>
      </div>
    `, { maxWidth: 280, className: 'custom-popup' });

    marker._beachData = beach;
    markers.addLayer(marker);
    allMarkers.push(marker);
  });

  map.addLayer(markers);

  // ─── Filters ───
  const searchInput = document.getElementById('filter-search');
  const regionSelect = document.getElementById('filter-region');
  const serviceCheckboxes = document.querySelectorAll('.filter-service');
  const nearMeBtn = document.getElementById('btn-near-me');
  const resultCount = document.getElementById('result-count');

  function applyFilters() {
    const search = (searchInput?.value || '').toLowerCase().trim();
    const region = regionSelect?.value || '';
    const activeServices = [];
    serviceCheckboxes.forEach(cb => { if (cb.checked) activeServices.push(cb.value); });

    markers.clearLayers();
    let count = 0;

    allMarkers.forEach(marker => {
      const b = marker._beachData;
      if (search && !b.name.toLowerCase().includes(search) && !b.municipality.toLowerCase().includes(search) && !b.river.toLowerCase().includes(search)) return;
      if (region && b.region !== region) return;
      if (activeServices.length > 0 && !activeServices.every(s => b.services[s])) return;

      markers.addLayer(marker);
      count++;
    });

    if (resultCount) resultCount.textContent = `${count} praia${count !== 1 ? 's' : ''} encontrada${count !== 1 ? 's' : ''}`;
  }

  searchInput?.addEventListener('input', applyFilters);
  regionSelect?.addEventListener('change', applyFilters);
  serviceCheckboxes.forEach(cb => cb.addEventListener('change', applyFilters));

  // Near Me
  nearMeBtn?.addEventListener('click', async () => {
    nearMeBtn.disabled = true;
    nearMeBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> A localizar...';

    try {
      const pos = await getUserLocation();
      map.flyTo([pos.lat, pos.lng], 10, { duration: 1.5 });

      // Sort markers by distance
      const sorted = sortByDistance(beaches, pos.lat, pos.lng);
      if (sorted.length > 0) {
        const nearest = sorted[0];
        const nearestMarker = allMarkers.find(m => m._beachData.id === nearest.id);
        if (nearestMarker) {
          nearestMarker.openPopup();
        }
      }
    } catch (err) {
      alert(err.message);
    } finally {
      nearMeBtn.disabled = false;
      nearMeBtn.innerHTML = '<i data-lucide="navigation" class="w-4 h-4"></i> Perto de Mim';
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  });

  // Mobile filter drawer toggle
  const filterToggle = document.getElementById('filter-toggle');
  const filterDrawer = document.getElementById('filter-drawer');
  filterToggle?.addEventListener('click', () => {
    filterDrawer?.classList.toggle('translate-x-full');
    filterDrawer?.classList.toggle('translate-x-0');
  });

  // Initial count
  applyFilters();
});
