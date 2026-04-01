// ─── Admin Panel — JSON Visual Editor ───
const SECTIONS = ['beaches', 'articles', 'locations-guia', 'locations-passaporte', 'descontos', 'settings', 'utilizadores'];

// ─── Supabase (read-only, for Utilizadores tab) ───
const ADMIN_SUPABASE_URL      = 'https://tjvhnbukzfyxtpkrhpsw.supabase.co';
const ADMIN_SUPABASE_ANON_KEY = 'sb_publishable_ke--Q7xNRNCxTjgxFCNFIQ_6zPD3zM3';
let _adminSb = null;
function getAdminSb() {
  if (!_adminSb && window.supabase && ADMIN_SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
    _adminSb = window.supabase.createClient(ADMIN_SUPABASE_URL, ADMIN_SUPABASE_ANON_KEY);
  }
  return _adminSb;
}

const state = {
  currentSection: 'beaches',
  data: {},
  editingId: null,
  editingPhotos: [],        // [{ src: string, name: string }]
  editingArticleImage: null // { src: string, name: string } | null
};

// ─── Constants ───
const DISTRICTS = [
  'Aveiro', 'Beja', 'Braga', 'Bragança', 'Castelo Branco', 'Coimbra',
  'Évora', 'Faro', 'Guarda', 'Leiria', 'Lisboa', 'Portalegre',
  'Porto', 'Santarém', 'Setúbal', 'Viana do Castelo', 'Vila Real', 'Viseu'
];

const ALL_SERVICES = [
  { key: 'blueFlag',    label: 'Bandeira Azul' },
  { key: 'goldQuality', label: 'Qualidade de Ouro' },
  { key: 'accessible',  label: 'Praia Acessível' },
  { key: 'lifeguard',   label: 'Nadador-Salvador' },
  { key: 'bar',         label: 'Bar/Restaurante' },
  { key: 'picnicArea',  label: 'Parque de Merendas' },
  { key: 'petFriendly', label: 'Pet-friendly' },
  { key: 'playground',  label: 'Parque Infantil' },
  { key: 'boatRental',  label: 'Aluguer de Embarcações' },
  { key: 'camping',     label: 'Alojamento' },
  { key: 'wc',          label: 'Instal. Sanitárias' },
  { key: 'nacional2',   label: 'Estrada Nacional 2' },
  { key: 'grills',      label: 'Grelhadores' },
  { key: 'parking',     label: 'Estacionamento' },
  { key: 'wc',          label: 'WC/Balneários' },
];

const DEFAULT_SERVICES = Object.fromEntries(ALL_SERVICES.map(s => [s.key, false]));

// ─── Auth ───
function checkAuth() {
  const hash = localStorage.getItem('admin_password_hash');
  if (!hash) { showSetupPassword(); return false; }
  if (sessionStorage.getItem('admin_authenticated') === 'true') return true;
  showLogin();
  return false;
}

function showSetupPassword() {
  document.getElementById('admin-app').innerHTML = `
    <div class="flex items-center justify-center min-h-screen bg-praia-sand-50">
      <div class="bg-white rounded-2xl shadow-layered-lg p-8 max-w-md w-full mx-4 admin-form">
        <div class="text-center mb-6">
          <img src="brand_assets/logotipo.png" alt="Praias Fluviais" class="h-10 mx-auto mb-4" style="filter: brightness(0) saturate(100%) invert(14%) sepia(59%) saturate(2000%) hue-rotate(160deg);">
          <h1 class="font-display text-xl font-bold text-praia-teal-800">Configurar Painel Admin</h1>
          <p class="text-sm text-praia-sand-500 mt-2">Defina uma password para aceder ao painel.</p>
        </div>
        <form onsubmit="event.preventDefault(); setupPassword();">
          <label>Password</label>
          <input type="password" id="setup-pass" required minlength="4" placeholder="Mínimo 4 caracteres">
          <div class="h-3"></div>
          <label>Confirmar Password</label>
          <input type="password" id="setup-pass-confirm" required placeholder="Repita a password">
          <div class="h-6"></div>
          <button type="submit" class="admin-btn admin-btn-primary w-full py-3">Criar Password</button>
        </form>
      </div>
    </div>`;
}

function showLogin() {
  document.getElementById('admin-app').innerHTML = `
    <div class="flex items-center justify-center min-h-screen bg-praia-sand-50">
      <div class="bg-white rounded-2xl shadow-layered-lg p-8 max-w-md w-full mx-4 admin-form">
        <div class="text-center mb-6">
          <img src="brand_assets/logotipo.png" alt="Praias Fluviais" class="h-10 mx-auto mb-4" style="filter: brightness(0) saturate(100%) invert(14%) sepia(59%) saturate(2000%) hue-rotate(160deg);">
          <h1 class="font-display text-xl font-bold text-praia-teal-800">Painel de Administração</h1>
        </div>
        <form onsubmit="event.preventDefault(); loginAdmin();">
          <label>Password</label>
          <input type="password" id="login-pass" required placeholder="Introduza a password">
          <div class="h-1"></div>
          <p id="login-error" class="text-sm text-red-500 hidden">Password incorreta.</p>
          <div class="h-4"></div>
          <button type="submit" class="admin-btn admin-btn-primary w-full py-3">Entrar</button>
        </form>
      </div>
    </div>`;
}

async function simpleHash(str) {
  const data = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function setupPassword() {
  const pass = document.getElementById('setup-pass').value;
  const confirm = document.getElementById('setup-pass-confirm').value;
  if (pass !== confirm) { toast('As passwords não coincidem.', 'error'); return; }
  const hash = await simpleHash(pass);
  localStorage.setItem('admin_password_hash', hash);
  sessionStorage.setItem('admin_authenticated', 'true');
  initDashboard();
}

async function loginAdmin() {
  const pass = document.getElementById('login-pass').value;
  const hash = await simpleHash(pass);
  if (hash === localStorage.getItem('admin_password_hash')) {
    sessionStorage.setItem('admin_authenticated', 'true');
    initDashboard();
  } else {
    document.getElementById('login-error')?.classList.remove('hidden');
  }
}

// ─── Dashboard ───
async function initDashboard() {
  for (const section of SECTIONS) {
    try {
      const res = await fetch(`data/${section}.json`);
      state.data[section] = await res.json();
    } catch {
      state.data[section] = section === 'settings' ? {} : [];
    }
  }
  renderDashboard();
}

// Keep backward compat: old 'locations' key maps to 'locations-guia'
function getLocationsKey(section) { return section; }

function renderDashboard() {
  const sectionMeta = {
    beaches:               { icon: '🏖️', label: 'Praias' },
    articles:              { icon: '📰', label: 'Artigos' },
    'locations-guia':      { icon: '📗', label: 'Guia & Passaporte' },
    'locations-passaporte':{ icon: '🔖', label: 'Carimbo Passaporte' },
    descontos:             { icon: '🏷️', label: 'Descontos' },
    settings:              { icon: '⚙️', label: 'Configurações' },
    utilizadores:          { icon: '👥', label: 'Utilizadores' },
  };

  document.getElementById('admin-app').innerHTML = `
    <div class="flex h-screen">
      <aside class="w-64 bg-praia-teal-800 flex flex-col admin-sidebar flex-shrink-0">
        <div class="p-5 border-b border-white/10">
          <img src="brand_assets/logotipo.png" alt="Praias Fluviais" class="h-8">
          <p class="text-white/40 text-xs mt-2 font-display uppercase tracking-wider">Painel Admin</p>
        </div>
        <nav class="flex-1 py-2">
          ${SECTIONS.map(s => `
            <button onclick="switchSection('${s}')" class="admin-tab ${state.currentSection === s ? 'active' : ''} w-full text-left px-5 py-3 text-sm text-white/70 hover:text-white hover:bg-white/5 flex items-center gap-3">
              <span>${sectionMeta[s].icon}</span> ${sectionMeta[s].label}
            </button>
          `).join('')}
        </nav>
        <div class="p-4 border-t border-white/10 space-y-2">
          <button onclick="exportAll()" class="admin-btn admin-btn-export w-full py-2.5 text-center">Exportar Tudo</button>
          <button onclick="importJSON()" class="admin-btn w-full py-2.5 text-center bg-white/10 text-white/70">Importar JSON</button>
          <input type="file" id="import-file" accept=".json" class="hidden" onchange="handleImport(event)">
          <button onclick="sessionStorage.removeItem('admin_authenticated'); location.reload();" class="w-full text-center text-xs text-white/30 hover:text-white/50 py-2">Sair</button>
        </div>
      </aside>
      <main class="flex-1 overflow-y-auto bg-praia-sand-50" id="admin-content"></main>
    </div>`;

  renderSection();
}

function switchSection(section) {
  state.currentSection = section;
  state.editingId = null;
  state.editingPhotos = [];
  state.editingArticleImage = null;
  renderDashboard();
}

function renderSection() {
  const content = document.getElementById('admin-content');
  switch (state.currentSection) {
    case 'beaches':                renderBeaches(content); break;
    case 'articles':               renderArticles(content); break;
    case 'locations-guia':         renderLocationsGuia(content); break;
    case 'locations-passaporte':   renderLocationsPassaporte(content); break;
    case 'descontos':              renderDescontos(content); break;
    case 'settings':               renderSettings(content); break;
    case 'utilizadores':           renderUtilizadores(content); break;
  }
}

// ─── Image Upload ───
async function uploadImageFile(file) {
  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': file.type, 'X-Filename': file.name },
      body: file,
    });
    if (!res.ok) throw new Error('Servidor não disponível');
    const json = await res.json();
    return { src: json.path, name: json.name };
  } catch {
    // Fallback: base64 data URL (works without server endpoint)
    const src = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.readAsDataURL(file);
    });
    return { src, name: file.name };
  }
}

// ─── Beach Photo Gallery ───
function renderPhotoGallery() {
  const gallery = document.getElementById('photo-gallery');
  if (!gallery) return;

  if (state.editingPhotos.length === 0) {
    gallery.innerHTML = `<p class="text-praia-sand-400 text-sm italic">Nenhuma fotografia adicionada.</p>`;
    return;
  }

  gallery.innerHTML = state.editingPhotos.map((p, i) => `
    <div class="photo-thumb-item" style="position:relative;display:inline-block;margin:0 8px 8px 0;">
      <img src="${p.src}" alt="Foto ${i+1}" style="width:100px;height:75px;object-fit:cover;border-radius:8px;border:2px solid #E2D9C6;">
      <button onclick="removeBeachPhoto(${i})" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#D32F2F;color:white;border:none;cursor:pointer;font-size:12px;line-height:1;display:flex;align-items:center;justify-content:center;font-weight:bold;">×</button>
      <div style="font-size:9px;color:#8A7D60;text-align:center;margin-top:3px;max-width:100px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${p.name || ''}</div>
    </div>
  `).join('');
}

function removeBeachPhoto(index) {
  state.editingPhotos.splice(index, 1);
  renderPhotoGallery();
}

async function handleBeachPhotoFiles(files) {
  const uploadBtn = document.getElementById('photo-upload-btn');
  if (uploadBtn) { uploadBtn.disabled = true; uploadBtn.textContent = 'A carregar...'; }

  for (const file of Array.from(files)) {
    if (!file.type.startsWith('image/')) continue;
    const result = await uploadImageFile(file);
    state.editingPhotos.push(result);
  }

  if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.textContent = '+ Adicionar Fotos'; }
  renderPhotoGallery();
  toast(`${files.length} foto(s) adicionada(s).`, 'success');
}

function setupPhotoDragDrop(zoneId, inputId) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  if (!zone || !input) return;

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleBeachPhotoFiles(e.dataTransfer.files);
  });
  input.addEventListener('change', e => { if (e.target.files.length) handleBeachPhotoFiles(e.target.files); e.target.value = ''; });
}

// ─── Article Image ───
function renderArticleImagePreview() {
  const container = document.getElementById('article-img-preview');
  if (!container) return;
  if (!state.editingArticleImage) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = `
    <div style="position:relative;display:inline-block;margin-top:8px;">
      <img src="${state.editingArticleImage.src}" alt="Capa" style="max-width:240px;max-height:150px;object-fit:cover;border-radius:8px;border:2px solid #E2D9C6;">
      <button onclick="removeArticleImage()" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#D32F2F;color:white;border:none;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;font-weight:bold;">×</button>
    </div>`;
}

function removeArticleImage() {
  state.editingArticleImage = null;
  renderArticleImagePreview();
  const urlInput = document.getElementById('a-image');
  if (urlInput) urlInput.value = '';
}

async function handleArticleImageFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const result = await uploadImageFile(file);
  state.editingArticleImage = result;
  const urlInput = document.getElementById('a-image');
  if (urlInput) urlInput.value = result.src;
  renderArticleImagePreview();
  toast('Imagem de capa carregada.', 'success');
}

// ─── Beaches ───
function renderBeaches(container) {
  const beaches = state.data.beaches || [];
  container.innerHTML = `
    <div class="p-6">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="font-display text-2xl font-bold text-praia-teal-800">Praias</h1>
          <p class="text-sm text-praia-sand-500">${beaches.length} praias registadas</p>
        </div>
        <div class="flex gap-2">
          <button onclick="exportSection('beaches')" class="admin-btn admin-btn-export">Exportar JSON</button>
          <button onclick="editBeach(null)" class="admin-btn admin-btn-primary">+ Adicionar Praia</button>
        </div>
      </div>
      <div class="bg-white rounded-xl shadow-layered overflow-hidden">
        <div class="p-4 border-b border-praia-sand-100">
          <input type="text" placeholder="Pesquisar praias..." oninput="filterAdminTable(this.value)" class="w-full px-4 py-2 rounded-lg bg-praia-sand-50 border border-praia-sand-200 text-sm">
        </div>
        <div class="overflow-x-auto">
          <table class="admin-table w-full text-sm">
            <thead>
              <tr class="text-left">
                <th class="px-4 py-3 font-display text-xs uppercase tracking-wider text-praia-teal-700">Nome</th>
                <th class="px-4 py-3 font-display text-xs uppercase tracking-wider text-praia-teal-700">Concelho</th>
                <th class="px-4 py-3 font-display text-xs uppercase tracking-wider text-praia-teal-700">Distrito</th>
                <th class="px-4 py-3 font-display text-xs uppercase tracking-wider text-praia-teal-700">Tipo</th>
                <th class="px-4 py-3 font-display text-xs uppercase tracking-wider text-praia-teal-700">Serviços</th>
                <th class="px-4 py-3 font-display text-xs uppercase tracking-wider text-praia-teal-700 text-right">Ações</th>
              </tr>
            </thead>
            <tbody id="beaches-tbody">
              ${beaches.map((b, i) => {
                const isBalnear = b.type === 'zona_balnear';
                const activeServices = ALL_SERVICES.filter(s => b.services?.[s.key]).map(s => s.label).join(', ') || '—';
                return `
                <tr class="border-t border-praia-sand-100 hover:bg-praia-sand-50 admin-table-row" data-search="${(b.name + ' ' + b.municipality + ' ' + (b.freguesia||'') + ' ' + (b.district||'')).toLowerCase()}">
                  <td class="px-4 py-3 font-semibold text-praia-teal-800">${b.name}</td>
                  <td class="px-4 py-3 text-praia-sand-600">${b.municipality}</td>
                  <td class="px-4 py-3 text-praia-sand-600">${b.district || '—'}</td>
                  <td class="px-4 py-3">
                    <span class="badge" style="background:${isBalnear ? 'rgba(2,136,209,0.1)' : 'rgba(67,160,71,0.1)'};color:${isBalnear ? '#0288D1' : '#43A047'};">
                      ${isBalnear ? 'Balnear' : 'Fluvial'}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-praia-sand-500 text-xs" style="max-width:200px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${activeServices}</td>
                  <td class="px-4 py-3 text-right">
                    <button onclick="editBeach(${i})" class="text-praia-teal-600 hover:text-praia-teal-800 text-xs font-semibold mr-2">Editar</button>
                    <button onclick="deleteItem('beaches', ${i})" class="text-red-400 hover:text-red-600 text-xs font-semibold">Eliminar</button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

function editBeach(index) {
  const b = index !== null ? state.data.beaches[index] : {
    id: '', name: '', municipality: '', freguesia: '', district: '', type: 'praia_fluvial', river: '',
    coordinates: { lat: 39.5, lng: -8.0 }, description: '',
    photos: [],
    video360: null,
    services: { ...DEFAULT_SERVICES },
    waterQuality: 'boa', featured: false, passportStamp: true
  };

  // Merge any missing service keys
  const services = { ...DEFAULT_SERVICES, ...(b.services || {}) };

  // Load photos into state
  state.editingPhotos = (b.photos || []).map(src => ({ src, name: '' }));

  const districtOptions = DISTRICTS.map(d =>
    `<option value="${d}" ${b.district === d ? 'selected' : ''}>${d}</option>`
  ).join('');

  const mainServices = ALL_SERVICES.slice(0, 10);
  const extraServices = ALL_SERVICES.slice(10);

  const container = document.getElementById('admin-content');
  container.innerHTML = `
    <div class="p-6 max-w-3xl admin-form">
      <button onclick="renderSection()" class="text-praia-teal-600 text-sm font-semibold mb-4 flex items-center gap-1">← Voltar à lista</button>
      <h2 class="font-display text-xl font-bold text-praia-teal-800 mb-6">${index !== null ? 'Editar' : 'Adicionar'} Praia</h2>

      <!-- Identificação -->
      <div class="bg-white rounded-xl p-5 mb-4 shadow-sm border border-praia-sand-100">
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-4">Identificação</h3>
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div><label>Nome</label><input type="text" id="b-name" value="${escHtml(b.name)}"></div>
          <div><label>ID (slug)</label><input type="text" id="b-id" value="${escHtml(b.id)}" placeholder="auto-gerado se vazio"></div>
        </div>
        <div class="grid grid-cols-4 gap-4 mb-4">
          <div>
            <label>Tipo</label>
            <select id="b-type">
              <option value="praia_fluvial" ${(b.type||'praia_fluvial')==='praia_fluvial'?'selected':''}>Praia Fluvial</option>
              <option value="zona_balnear" ${b.type==='zona_balnear'?'selected':''}>Zona Balnear</option>
            </select>
          </div>
          <div><label>Concelho</label><input type="text" id="b-municipality" value="${escHtml(b.municipality)}"></div>
          <div><label>Freguesia</label><input type="text" id="b-freguesia" value="${escHtml(b.freguesia||'')}"></div>
          <div>
            <label>Distrito</label>
            <select id="b-district">
              <option value="">— selecionar —</option>
              ${districtOptions}
            </select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div><label>Rio / Albufeira</label><input type="text" id="b-river" value="${escHtml(b.river)}"></div>
          <div>
            <label>Qualidade da Água</label>
            <select id="b-waterQuality">
              <option value="excelente" ${b.waterQuality==='excelente'?'selected':''}>Excelente</option>
              <option value="boa" ${b.waterQuality==='boa'?'selected':''}>Boa</option>
              <option value="aceitavel" ${b.waterQuality==='aceitavel'?'selected':''}>Aceitável</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Localização -->
      <div class="bg-white rounded-xl p-5 mb-4 shadow-sm border border-praia-sand-100">
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-4">Localização GPS</h3>
        <div class="grid grid-cols-2 gap-4">
          <div><label>Latitude</label><input type="number" step="0.00001" id="b-lat" value="${b.coordinates?.lat || 39.5}"></div>
          <div><label>Longitude</label><input type="number" step="0.00001" id="b-lng" value="${b.coordinates?.lng || -8.0}"></div>
        </div>
      </div>

      <!-- Descrição -->
      <div class="bg-white rounded-xl p-5 mb-4 shadow-sm border border-praia-sand-100">
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-4">Descrição</h3>
        <textarea id="b-description" rows="4">${escHtml(b.description)}</textarea>
      </div>

      <!-- Fotografias -->
      <div class="bg-white rounded-xl p-5 mb-4 shadow-sm border border-praia-sand-100">
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-3">Fotografias</h3>
        <div id="photo-gallery" class="mb-3" style="min-height:24px;"></div>
        <div id="photo-drop-zone" style="border:2px dashed #C4B898;border-radius:12px;padding:20px;text-align:center;cursor:pointer;transition:all 0.2s;background:#FAF8F5;" onclick="document.getElementById('photo-file-input').click()">
          <div style="font-family:'Poppins',sans-serif;font-size:13px;color:#8A7D60;font-weight:600;">Arraste fotos aqui</div>
          <div style="font-size:12px;color:#C4B898;margin-top:4px;">ou clique para selecionar do disco</div>
          <div style="font-size:11px;color:#C4B898;margin-top:4px;">JPG, PNG, WEBP · Múltiplos ficheiros aceites</div>
        </div>
        <input type="file" id="photo-file-input" accept="image/*" multiple style="display:none;">
        <div style="margin-top:8px;display:flex;align-items:center;gap:8px;">
          <button id="photo-upload-btn" onclick="document.getElementById('photo-file-input').click()" class="admin-btn admin-btn-primary" style="font-size:11px;padding:6px 14px;">+ Adicionar Fotos</button>
          <span style="font-size:11px;color:#C4B898;">As imagens são guardadas em <code>img/uploads/</code></span>
        </div>
      </div>

      <!-- Serviços -->
      <div class="bg-white rounded-xl p-5 mb-4 shadow-sm border border-praia-sand-100">
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-3">Serviços Principais</h3>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
          ${mainServices.map(s => `
            <label class="flex items-center gap-2 cursor-pointer text-sm py-1.5 px-3 rounded-lg border border-praia-sand-100 hover:bg-praia-sand-50">
              <input type="checkbox" class="b-service" data-key="${s.key}" ${services[s.key] ? 'checked' : ''} style="accent-color:#003A40;">
              <span class="font-body">${s.label}</span>
            </label>
          `).join('')}
        </div>
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-3">Infraestruturas</h3>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          ${extraServices.map(s => `
            <label class="flex items-center gap-2 cursor-pointer text-sm py-1.5 px-3 rounded-lg border border-praia-sand-100 hover:bg-praia-sand-50">
              <input type="checkbox" class="b-service" data-key="${s.key}" ${services[s.key] ? 'checked' : ''} style="accent-color:#003A40;">
              <span class="font-body">${s.label}</span>
            </label>
          `).join('')}
        </div>
      </div>

      <!-- Opções -->
      <div class="bg-white rounded-xl p-5 mb-6 shadow-sm border border-praia-sand-100">
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-3">Opções</h3>
        <div class="flex items-center gap-6">
          <label class="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" id="b-featured" ${b.featured ? 'checked' : ''} style="accent-color:#003A40;">
            Destaque na Homepage
          </label>
          <label class="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" id="b-passportStamp" ${b.passportStamp ? 'checked' : ''} style="accent-color:#003A40;">
            Carimbo no Passaporte
          </label>
        </div>
      </div>

      <div class="flex gap-3 pb-8">
        <button onclick="saveBeach(${index})" class="admin-btn admin-btn-success">Guardar Praia</button>
        <button onclick="renderSection()" class="admin-btn bg-praia-sand-200 text-praia-sand-700">Cancelar</button>
        ${index !== null ? `<button onclick="deleteItem('beaches', ${index}); renderSection();" class="admin-btn admin-btn-danger ml-auto">Eliminar</button>` : ''}
      </div>
    </div>`;

  renderPhotoGallery();
  setupPhotoDragDrop('photo-drop-zone', 'photo-file-input');

  // Drop zone hover style
  const zone = document.getElementById('photo-drop-zone');
  if (zone) {
    zone.addEventListener('dragover', () => { zone.style.borderColor = '#003A40'; zone.style.background = '#EEF5F5'; });
    zone.addEventListener('dragleave', () => { zone.style.borderColor = '#C4B898'; zone.style.background = '#FAF8F5'; });
    zone.addEventListener('drop', () => { zone.style.borderColor = '#C4B898'; zone.style.background = '#FAF8F5'; });
  }
}

function saveBeach(index) {
  const name = document.getElementById('b-name').value.trim();
  if (!name) { toast('O nome é obrigatório.', 'error'); return; }

  const services = {};
  document.querySelectorAll('.b-service').forEach(cb => { services[cb.dataset.key] = cb.checked; });

  const beach = {
    id: document.getElementById('b-id').value.trim() || slugify(name),
    name,
    municipality: document.getElementById('b-municipality').value.trim(),
    freguesia: document.getElementById('b-freguesia').value.trim(),
    district: document.getElementById('b-district').value,
    type: document.getElementById('b-type').value,
    river: document.getElementById('b-river').value.trim(),
    coordinates: {
      lat: parseFloat(document.getElementById('b-lat').value) || 0,
      lng: parseFloat(document.getElementById('b-lng').value) || 0,
    },
    description: document.getElementById('b-description').value.trim(),
    photos: state.editingPhotos.map(p => p.src),
    video360: null,
    services,
    waterQuality: document.getElementById('b-waterQuality').value,
    featured: document.getElementById('b-featured').checked,
    passportStamp: document.getElementById('b-passportStamp').checked,
  };

  if (index !== null) state.data.beaches[index] = beach;
  else state.data.beaches.push(beach);

  state.editingPhotos = [];
  toast('Praia guardada com sucesso!', 'success');
  renderSection();
}

// ─── Articles ───
function renderArticles(container) {
  const articles = state.data.articles || [];
  container.innerHTML = `
    <div class="p-6">
      <div class="flex items-center justify-between mb-6">
        <h1 class="font-display text-2xl font-bold text-praia-teal-800">Artigos (${articles.length})</h1>
        <div class="flex gap-2">
          <button onclick="exportSection('articles')" class="admin-btn admin-btn-export">Exportar</button>
          <button onclick="editArticle(null)" class="admin-btn admin-btn-primary">+ Novo Artigo</button>
        </div>
      </div>
      <div class="grid gap-4">
        ${articles.map((a, i) => `
          <div class="bg-white rounded-xl shadow-layered p-4 flex items-center gap-4">
            <img src="${a.image}" alt="" class="w-20 h-14 object-cover rounded-lg flex-shrink-0" onerror="this.style.display='none'">
            <div class="flex-1 min-w-0">
              <h3 class="font-display text-sm font-bold text-praia-teal-800 truncate">${escHtml(a.title)}</h3>
              <p class="text-xs text-praia-sand-500">${a.date} · ${a.category} · ${a.status}</p>
            </div>
            <div class="flex gap-2 flex-shrink-0">
              <button onclick="editArticle(${i})" class="text-praia-teal-600 text-xs font-semibold">Editar</button>
              <button onclick="deleteItem('articles', ${i})" class="text-red-400 text-xs font-semibold">Eliminar</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

function editArticle(index) {
  const a = index !== null ? state.data.articles[index] : {
    slug: '', title: '', excerpt: '', content: '',
    image: '',
    date: new Date().toISOString().split('T')[0],
    category: 'roteiros', featured: false, status: 'draft'
  };

  state.editingArticleImage = a.image ? { src: a.image, name: '' } : null;

  const container = document.getElementById('admin-content');
  container.innerHTML = `
    <div class="p-6 max-w-3xl admin-form">
      <button onclick="renderSection()" class="text-praia-teal-600 text-sm font-semibold mb-4">← Voltar</button>
      <h2 class="font-display text-xl font-bold text-praia-teal-800 mb-6">${index !== null ? 'Editar' : 'Novo'} Artigo</h2>

      <div class="bg-white rounded-xl p-5 mb-4 shadow-sm border border-praia-sand-100">
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-4">Conteúdo</h3>
        <div class="mb-4"><label>Título</label><input type="text" id="a-title" value="${escHtml(a.title)}"></div>
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div><label>Slug</label><input type="text" id="a-slug" value="${escHtml(a.slug)}" placeholder="auto-gerado"></div>
          <div><label>Data</label><input type="date" id="a-date" value="${a.date}"></div>
        </div>
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div><label>Categoria</label>
            <select id="a-category">
              <option value="roteiros" ${a.category==='roteiros'?'selected':''}>Roteiros</option>
              <option value="natureza" ${a.category==='natureza'?'selected':''}>Natureza</option>
              <option value="descobertas" ${a.category==='descobertas'?'selected':''}>Descobertas</option>
              <option value="informacao" ${a.category==='informacao'?'selected':''}>Informação</option>
            </select>
          </div>
          <div><label>Estado</label>
            <select id="a-status">
              <option value="published" ${a.status==='published'?'selected':''}>Publicado</option>
              <option value="draft" ${a.status==='draft'?'selected':''}>Rascunho</option>
            </select>
          </div>
        </div>
        <div class="mb-4"><label>Excerto</label><textarea id="a-excerpt" rows="2">${escHtml(a.excerpt)}</textarea></div>
        <div class="mb-2"><label>Conteúdo (HTML)</label><textarea id="a-content" rows="12" style="font-family:monospace;font-size:12px;">${escHtml(a.content)}</textarea></div>
      </div>

      <div class="bg-white rounded-xl p-5 mb-4 shadow-sm border border-praia-sand-100">
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-3">Imagem de Capa</h3>
        <div id="article-img-preview"></div>
        <div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button onclick="document.getElementById('article-img-file').click()" class="admin-btn admin-btn-primary" style="font-size:11px;padding:6px 14px;">📁 Carregar do Disco</button>
          <span style="color:#C4B898;font-size:12px;">ou</span>
          <input type="url" id="a-image" value="${escHtml(a.image)}" placeholder="URL da imagem..." style="flex:1;min-width:200px;" oninput="onArticleImageUrlInput(this.value)">
        </div>
        <input type="file" id="article-img-file" accept="image/*" style="display:none;" onchange="handleArticleImageFile(this.files[0]); this.value='';">
      </div>

      <div class="bg-white rounded-xl p-5 mb-6 shadow-sm border border-praia-sand-100">
        <label class="flex items-center gap-2 cursor-pointer text-sm">
          <input type="checkbox" id="a-featured" ${a.featured ? 'checked' : ''} style="accent-color:#003A40;">
          Destaque na Homepage
        </label>
      </div>

      <div class="flex gap-3 pb-8">
        <button onclick="saveArticle(${index})" class="admin-btn admin-btn-success">Guardar Artigo</button>
        <button onclick="renderSection()" class="admin-btn bg-praia-sand-200 text-praia-sand-700">Cancelar</button>
      </div>
    </div>`;

  renderArticleImagePreview();
}

function onArticleImageUrlInput(value) {
  if (value) {
    state.editingArticleImage = { src: value, name: '' };
    renderArticleImagePreview();
  } else {
    state.editingArticleImage = null;
    renderArticleImagePreview();
  }
}

function saveArticle(index) {
  const title = document.getElementById('a-title').value.trim();
  if (!title) { toast('O título é obrigatório.', 'error'); return; }

  const article = {
    slug: document.getElementById('a-slug').value.trim() || slugify(title),
    title,
    excerpt: document.getElementById('a-excerpt').value.trim(),
    content: document.getElementById('a-content').value,
    image: state.editingArticleImage?.src || document.getElementById('a-image').value.trim() || '',
    date: document.getElementById('a-date').value,
    category: document.getElementById('a-category').value,
    featured: document.getElementById('a-featured').checked,
    status: document.getElementById('a-status').value,
  };

  if (index !== null) state.data.articles[index] = article;
  else state.data.articles.push(article);

  state.editingArticleImage = null;
  toast('Artigo guardado!', 'success');
  renderSection();
}

// ─── Locations — Guia & Passaporte ───
const GUIA_TYPE_COLORS = { guia: '#F59E0B', guia_passaporte: '#43A047' };
const GUIA_TYPE_LABELS = { guia: 'Só Guia', guia_passaporte: 'Guia + Passaporte' };

function renderLocationsGuia(container) {
  const section = 'locations-guia';
  const items = state.data[section] || [];
  const guiaCount = items.filter(l => l.type === 'guia').length;
  const gpCount   = items.filter(l => l.type === 'guia_passaporte').length;

  container.innerHTML = `
    <div class="p-6">
      <div class="flex items-center justify-between mb-2">
        <h1 class="font-display text-2xl font-bold text-praia-teal-800">Pontos — Guia &amp; Passaporte (${items.length})</h1>
        <div class="flex gap-2">
          <a href="../onde-encontrar.html" target="_blank" class="admin-btn bg-praia-sand-200 text-praia-teal-700 text-xs">Ver no site ↗</a>
          <button onclick="exportSection('locations-guia')" class="admin-btn admin-btn-export">Exportar</button>
          <button onclick="editLocationGuia(null)" class="admin-btn admin-btn-primary">+ Adicionar</button>
        </div>
      </div>
      <p class="text-xs text-praia-sand-500 mt-1 mb-4">Locais onde se pode encontrar o Guia (com ou sem Passaporte). Página: <a href="../onde-encontrar.html" target="_blank" class="text-praia-teal-600 underline">Onde Encontrar</a>.</p>
      <div class="flex gap-3 mb-4">
        <input type="text" id="guia-search" placeholder="Pesquisar por nome ou concelho…"
          class="flex-1 px-4 py-2 text-sm border border-praia-sand-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-praia-teal-300"
          oninput="filterLocationsGuia()">
        <select id="guia-type-filter" onchange="filterLocationsGuia()"
          class="px-3 py-2 text-sm border border-praia-sand-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-praia-teal-300">
          <option value="">Todos os tipos (${items.length})</option>
          <option value="guia_passaporte">Guia + Passaporte (${gpCount})</option>
          <option value="guia">Só Guia (${guiaCount})</option>
        </select>
      </div>
      <div class="bg-white rounded-xl shadow-layered overflow-hidden">
        <table class="admin-table w-full text-sm">
          <thead><tr class="text-left">
            <th class="px-4 py-3 font-display text-xs uppercase tracking-wider text-praia-teal-700">Nome</th>
            <th class="px-4 py-3 font-display text-xs uppercase tracking-wider text-praia-teal-700">Concelho</th>
            <th class="px-4 py-3 font-display text-xs uppercase tracking-wider text-praia-teal-700">Tipo</th>
            <th class="px-4 py-3 font-display text-xs uppercase tracking-wider text-praia-teal-700">Época</th>
            <th class="px-4 py-3 font-display text-xs uppercase tracking-wider text-praia-teal-700 text-right">Ações</th>
          </tr></thead>
          <tbody id="guia-tbody">
            ${items.map((l, i) => {
              const color = GUIA_TYPE_COLORS[l.type] || '#F59E0B';
              const label = GUIA_TYPE_LABELS[l.type] || l.type;
              const badge = `<span style="display:inline-block;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:700;font-family:'Poppins',sans-serif;background:${color}22;color:${color};border:1px solid ${color}44;">${label}</span>`;
              return `
              <tr class="border-t border-praia-sand-100 hover:bg-praia-sand-50" data-name="${escHtml(l.name.toLowerCase())}" data-municipality="${escHtml(l.municipality.toLowerCase())}" data-type="${l.type}">
                <td class="px-4 py-3 font-semibold text-praia-teal-800">${escHtml(l.name)}</td>
                <td class="px-4 py-3 text-praia-sand-600">${escHtml(l.municipality)}</td>
                <td class="px-4 py-3">${badge}</td>
                <td class="px-4 py-3 text-xs">${l.seasonal ? '<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold text-[10px] border border-amber-300">Só época</span>' : '<span class="text-praia-sand-300">Todo o ano</span>'}</td>
                <td class="px-4 py-3 text-right">
                  <button onclick="editLocationGuia(${i})" class="text-praia-teal-600 text-xs font-semibold mr-2">Editar</button>
                  <button onclick="deleteItem('locations-guia', ${i})" class="text-red-400 text-xs font-semibold">Eliminar</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        <div id="guia-empty" class="hidden text-center py-10 text-praia-sand-400 text-sm">Nenhum resultado encontrado.</div>
      </div>
    </div>`;
}

function filterLocationsGuia() {
  const q     = (document.getElementById('guia-search')?.value || '').toLowerCase();
  const type  = document.getElementById('guia-type-filter')?.value || '';
  const rows  = document.querySelectorAll('#guia-tbody tr');
  let visible = 0;
  rows.forEach(row => {
    const nameMatch  = row.dataset.name?.includes(q);
    const munMatch   = row.dataset.municipality?.includes(q);
    const typeMatch  = !type || row.dataset.type === type;
    const show = (nameMatch || munMatch) && typeMatch;
    row.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  const empty = document.getElementById('guia-empty');
  if (empty) empty.classList.toggle('hidden', visible > 0);
}

function editLocationGuia(index) {
  const section = 'locations-guia';
  const l = index !== null ? state.data[section][index] : {
    name: '', municipality: '', address: '', phone: '',
    type: 'guia', seasonal: false, coordinates: { lat: 39.5, lng: -8.0 }
  };

  const typeOptions = Object.entries(GUIA_TYPE_LABELS).map(([k, v]) =>
    `<option value="${k}" ${l.type === k ? 'selected' : ''}>${v}</option>`
  ).join('');

  const container = document.getElementById('admin-content');
  container.innerHTML = `
    <div class="p-6 max-w-2xl admin-form">
      <button onclick="renderSection()" class="text-praia-teal-600 text-sm font-semibold mb-4">← Voltar</button>
      <h2 class="font-display text-xl font-bold text-praia-teal-800 mb-6">${index !== null ? 'Editar' : 'Adicionar'} Ponto — Guia &amp; Passaporte</h2>
      <div class="bg-white rounded-xl p-5 mb-4 shadow-sm border border-praia-sand-100 admin-form">
        <div class="mb-4"><label>Nome</label><input type="text" id="l-name" value="${escHtml(l.name)}"></div>
        <div class="mb-4"><label>Concelho</label><input type="text" id="l-municipality" value="${escHtml(l.municipality)}"></div>
        <div class="mb-4"><label>Morada</label><input type="text" id="l-address" value="${escHtml(l.address || '')}"></div>
        <div class="mb-4"><label>Telefone</label><input type="text" id="l-phone" value="${escHtml(l.phone || '')}"></div>
        <div class="mb-4"><label>Tipo</label>
          <select id="l-type">${typeOptions}</select>
        </div>
        <div class="mb-4 flex items-center gap-3">
          <input type="checkbox" id="l-seasonal" class="w-4 h-4 accent-amber-500" ${l.seasonal ? 'checked' : ''}>
          <label for="l-seasonal" class="cursor-pointer select-none">Só aberto durante a época balnear <span class="font-normal text-amber-600 text-xs">(mostra aviso no site)</span></label>
        </div>
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div><label>Latitude</label><input type="number" step="0.00001" id="l-lat" value="${l.coordinates?.lat || 39.5}"></div>
          <div><label>Longitude</label><input type="number" step="0.00001" id="l-lng" value="${l.coordinates?.lng || -8.0}"></div>
        </div>
      </div>
      <div class="flex gap-3">
        <button onclick="saveLocationGuia(${index})" class="admin-btn admin-btn-success">Guardar</button>
        <button onclick="renderSection()" class="admin-btn bg-praia-sand-200 text-praia-sand-700">Cancelar</button>
      </div>
    </div>`;
}

function saveLocationGuia(index) {
  const section = 'locations-guia';
  const loc = {
    name: document.getElementById('l-name').value.trim(),
    municipality: document.getElementById('l-municipality').value.trim(),
    address: document.getElementById('l-address').value.trim(),
    phone: document.getElementById('l-phone').value.trim(),
    type: document.getElementById('l-type').value,
    seasonal: document.getElementById('l-seasonal')?.checked || false,
    coordinates: {
      lat: parseFloat(document.getElementById('l-lat').value) || 0,
      lng: parseFloat(document.getElementById('l-lng').value) || 0,
    },
  };
  if (!state.data[section]) state.data[section] = [];
  if (index !== null) state.data[section][index] = loc;
  else state.data[section].push(loc);
  toast('Local guardado!', 'success');
  renderSection();
}

// ─── Locations — Carimbo Passaporte ───
function renderLocationsPassaporte(container) {
  const section = 'locations-passaporte';
  const items = state.data[section] || [];

  container.innerHTML = `
    <div class="p-6">
      <div class="flex items-center justify-between mb-2">
        <h1 class="font-display text-2xl font-bold text-praia-teal-800">Postos de Carimbo (${items.length})</h1>
        <div class="flex gap-2">
          <a href="../onde-carimbar-passaporte.html" target="_blank" class="admin-btn bg-praia-sand-200 text-praia-teal-700 text-xs">Ver no site ↗</a>
          <button onclick="exportSection('locations-passaporte')" class="admin-btn admin-btn-export">Exportar</button>
          <button onclick="editLocationPassaporte(null)" class="admin-btn admin-btn-primary">+ Adicionar</button>
        </div>
      </div>
      <p class="text-xs text-praia-sand-500 mt-1 mb-4">Locais onde se pode carimbar o Passaporte. Página: <a href="../onde-carimbar-passaporte.html" target="_blank" class="text-praia-teal-600 underline">Onde Carimbar</a>.</p>
      <div class="mb-4">
        <input type="text" id="passaporte-search" placeholder="Pesquisar por nome, concelho ou praia…"
          class="w-full px-4 py-2 text-sm border border-praia-sand-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-praia-teal-300"
          oninput="filterLocationsPassaporte()">
      </div>
      <div class="bg-white rounded-xl shadow-layered overflow-hidden">
        <table class="admin-table w-full text-sm">
          <thead><tr class="text-left">
            <th class="px-4 py-3 font-display text-xs uppercase tracking-wider text-praia-teal-700">Nome</th>
            <th class="px-4 py-3 font-display text-xs uppercase tracking-wider text-praia-teal-700">Concelho</th>
            <th class="px-4 py-3 font-display text-xs uppercase tracking-wider text-praia-teal-700">Praias</th>
            <th class="px-4 py-3 font-display text-xs uppercase tracking-wider text-praia-teal-700">Época</th>
            <th class="px-4 py-3 font-display text-xs uppercase tracking-wider text-praia-teal-700 text-right">Ações</th>
          </tr></thead>
          <tbody id="passaporte-tbody">
            ${items.map((l, i) => {
              const beachesStr = (l.beaches || []).join(' ').toLowerCase();
              return `
              <tr class="border-t border-praia-sand-100 hover:bg-praia-sand-50"
                data-name="${escHtml(l.name.toLowerCase())}"
                data-municipality="${escHtml(l.municipality.toLowerCase())}"
                data-beaches="${escHtml(beachesStr)}">
                <td class="px-4 py-3 font-semibold text-praia-teal-800">${escHtml(l.name)}</td>
                <td class="px-4 py-3 text-praia-sand-600">${escHtml(l.municipality)}</td>
                <td class="px-4 py-3 text-praia-sand-500 text-xs">${(l.beaches || []).length > 0 ? `${(l.beaches||[]).length} praia${(l.beaches||[]).length > 1 ? 's' : ''}` : '<span class="text-praia-sand-300">—</span>'}</td>
                <td class="px-4 py-3 text-xs">${l.seasonal ? '<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold text-[10px] border border-amber-300">Só época</span>' : '<span class="text-praia-sand-300">Todo o ano</span>'}</td>
                <td class="px-4 py-3 text-right">
                  <button onclick="editLocationPassaporte(${i})" class="text-praia-teal-600 text-xs font-semibold mr-2">Editar</button>
                  <button onclick="deleteItem('locations-passaporte', ${i})" class="text-red-400 text-xs font-semibold">Eliminar</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        <div id="passaporte-empty" class="hidden text-center py-10 text-praia-sand-400 text-sm">Nenhum resultado encontrado.</div>
      </div>
    </div>`;
}

function filterLocationsPassaporte() {
  const q    = (document.getElementById('passaporte-search')?.value || '').toLowerCase();
  const rows = document.querySelectorAll('#passaporte-tbody tr');
  let visible = 0;
  rows.forEach(row => {
    const show = !q
      || row.dataset.name?.includes(q)
      || row.dataset.municipality?.includes(q)
      || row.dataset.beaches?.includes(q);
    row.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  const empty = document.getElementById('passaporte-empty');
  if (empty) empty.classList.toggle('hidden', visible > 0);
}

function editLocationPassaporte(index) {
  const section = 'locations-passaporte';
  const l = index !== null ? state.data[section][index] : {
    name: '', municipality: '', address: '', phone: '', beaches: [], seasonal: false,
    coordinates: { lat: 39.5, lng: -8.0 }
  };
  const beachesStr = (l.beaches || []).join('\n');

  const container = document.getElementById('admin-content');
  container.innerHTML = `
    <div class="p-6 max-w-2xl admin-form">
      <button onclick="renderSection()" class="text-praia-teal-600 text-sm font-semibold mb-4">← Voltar</button>
      <h2 class="font-display text-xl font-bold text-praia-teal-800 mb-6">${index !== null ? 'Editar' : 'Adicionar'} Posto de Carimbo</h2>
      <div class="bg-white rounded-xl p-5 mb-4 shadow-sm border border-praia-sand-100 admin-form">
        <div class="mb-4"><label>Nome</label><input type="text" id="l-name" value="${escHtml(l.name)}"></div>
        <div class="mb-4"><label>Concelho</label><input type="text" id="l-municipality" value="${escHtml(l.municipality)}"></div>
        <div class="mb-4"><label>Morada</label><input type="text" id="l-address" value="${escHtml(l.address || '')}"></div>
        <div class="mb-4"><label>Telefone</label><input type="text" id="l-phone" value="${escHtml(l.phone || '')}"></div>
        <div class="mb-4">
          <label>Praias que se pode carimbar <span class="font-normal text-praia-sand-400">(uma por linha)</span></label>
          <textarea id="l-beaches" rows="5" style="resize:vertical;">${escHtml(beachesStr)}</textarea>
        </div>
        <div class="mb-4 flex items-center gap-3">
          <input type="checkbox" id="l-seasonal" class="w-4 h-4 accent-amber-500" ${l.seasonal ? 'checked' : ''}>
          <label for="l-seasonal" class="cursor-pointer select-none">Só aberto durante a época balnear <span class="font-normal text-amber-600 text-xs">(mostra aviso no site)</span></label>
        </div>
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div><label>Latitude</label><input type="number" step="0.00001" id="l-lat" value="${l.coordinates?.lat || 39.5}"></div>
          <div><label>Longitude</label><input type="number" step="0.00001" id="l-lng" value="${l.coordinates?.lng || -8.0}"></div>
        </div>
      </div>
      <div class="flex gap-3">
        <button onclick="saveLocationPassaporte(${index})" class="admin-btn admin-btn-success">Guardar</button>
        <button onclick="renderSection()" class="admin-btn bg-praia-sand-200 text-praia-sand-700">Cancelar</button>
      </div>
    </div>`;
}

function saveLocationPassaporte(index) {
  const section = 'locations-passaporte';
  const beachesRaw = document.getElementById('l-beaches').value;
  const beaches = beachesRaw.split('\n').map(s => s.trim()).filter(Boolean);
  const loc = {
    name: document.getElementById('l-name').value.trim(),
    municipality: document.getElementById('l-municipality').value.trim(),
    address: document.getElementById('l-address').value.trim(),
    phone: document.getElementById('l-phone').value.trim(),
    beaches,
    seasonal: document.getElementById('l-seasonal')?.checked || false,
    coordinates: {
      lat: parseFloat(document.getElementById('l-lat').value) || 0,
      lng: parseFloat(document.getElementById('l-lng').value) || 0,
    },
  };
  if (!state.data[section]) state.data[section] = [];
  if (index !== null) state.data[section][index] = loc;
  else state.data[section].push(loc);
  toast('Posto de carimbo guardado!', 'success');
  renderSection();
}

// ─── Descontos ───
function renderDescontos(container) {
  const items = state.data.descontos || [];
  container.innerHTML = `
    <div class="p-6">
      <div class="flex items-center justify-between mb-6">
        <h1 class="font-display text-2xl font-bold text-praia-teal-800">Descontos (${items.length})</h1>
        <div class="flex gap-2">
          <button onclick="exportSection('descontos')" class="admin-btn admin-btn-export">Exportar</button>
          <button onclick="editDesconto(null)" class="admin-btn admin-btn-primary">+ Adicionar</button>
        </div>
      </div>
      <div class="grid gap-4">
        ${items.map((d, i) => `
          <div class="bg-white rounded-xl shadow-layered p-4 flex items-center justify-between">
            <div>
              <h3 class="font-display text-sm font-bold text-praia-teal-800">${escHtml(d.name)}</h3>
              <p class="text-xs text-praia-sand-500">${escHtml(d.description)}</p>
            </div>
            <div class="flex gap-2 flex-shrink-0">
              <button onclick="editDesconto(${i})" class="text-praia-teal-600 text-xs font-semibold">Editar</button>
              <button onclick="deleteItem('descontos', ${i})" class="text-red-400 text-xs font-semibold">Eliminar</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

function editDesconto(index) {
  const d = index !== null ? state.data.descontos[index] : {
    name: '', description: '', conditions: '', region: 'centro', category: 'alojamento', municipality: ''
  };
  const container = document.getElementById('admin-content');
  container.innerHTML = `
    <div class="p-6 max-w-2xl admin-form">
      <button onclick="renderSection()" class="text-praia-teal-600 text-sm font-semibold mb-4">← Voltar</button>
      <h2 class="font-display text-xl font-bold text-praia-teal-800 mb-6">${index !== null ? 'Editar' : 'Adicionar'} Desconto</h2>
      <div class="bg-white rounded-xl p-5 mb-4 shadow-sm border border-praia-sand-100">
        <div class="mb-4"><label>Nome do Parceiro</label><input type="text" id="d-name" value="${escHtml(d.name)}"></div>
        <div class="mb-4"><label>Descrição do Desconto</label><textarea id="d-description" rows="2">${escHtml(d.description)}</textarea></div>
        <div class="mb-4"><label>Condições</label><textarea id="d-conditions" rows="2">${escHtml(d.conditions)}</textarea></div>
        <div class="grid grid-cols-3 gap-4">
          <div><label>Região</label>
            <select id="d-region">
              <option value="norte" ${d.region==='norte'?'selected':''}>Norte</option>
              <option value="centro" ${d.region==='centro'?'selected':''}>Centro</option>
              <option value="alentejo" ${d.region==='alentejo'?'selected':''}>Alentejo</option>
              <option value="algarve" ${d.region==='algarve'?'selected':''}>Algarve</option>
            </select>
          </div>
          <div><label>Categoria</label>
            <select id="d-category">
              <option value="alojamento" ${d.category==='alojamento'?'selected':''}>Alojamento</option>
              <option value="restauracao" ${d.category==='restauracao'?'selected':''}>Restauração</option>
              <option value="atividades" ${d.category==='atividades'?'selected':''}>Atividades</option>
              <option value="comercio" ${d.category==='comercio'?'selected':''}>Comércio</option>
            </select>
          </div>
          <div><label>Concelho</label><input type="text" id="d-municipality" value="${escHtml(d.municipality)}"></div>
        </div>
      </div>
      <div class="flex gap-3">
        <button onclick="saveDesconto(${index})" class="admin-btn admin-btn-success">Guardar</button>
        <button onclick="renderSection()" class="admin-btn bg-praia-sand-200 text-praia-sand-700">Cancelar</button>
      </div>
    </div>`;
}

function saveDesconto(index) {
  const d = {
    name: document.getElementById('d-name').value.trim(),
    description: document.getElementById('d-description').value.trim(),
    conditions: document.getElementById('d-conditions').value.trim(),
    region: document.getElementById('d-region').value,
    category: document.getElementById('d-category').value,
    municipality: document.getElementById('d-municipality').value.trim(),
  };
  if (index !== null) state.data.descontos[index] = d;
  else state.data.descontos.push(d);
  toast('Desconto guardado!', 'success');
  renderSection();
}

// ─── Settings ───
function renderSettings(container) {
  const s = state.data.settings || {};
  container.innerHTML = `
    <div class="p-6 max-w-2xl admin-form">
      <h1 class="font-display text-2xl font-bold text-praia-teal-800 mb-6">Configurações</h1>
      <div class="bg-white rounded-xl p-5 mb-4 shadow-sm border border-praia-sand-100">
        <div class="mb-4"><label>Data Limite Votação</label><input type="datetime-local" id="s-deadline" value="${(s.votingDeadline || '').slice(0, 16)}"></div>
        <div class="mb-4"><label>Ano Corrente</label><input type="number" id="s-year" value="${s.currentYear || 2026}"></div>
        <div class="mb-4"><label>Praias em Destaque (IDs, um por linha)</label><textarea id="s-featured" rows="4">${(s.featuredBeaches || []).join('\n')}</textarea></div>
      </div>
      <div class="flex gap-2">
        <button onclick="saveSettings()" class="admin-btn admin-btn-success">Guardar Configurações</button>
        <button onclick="exportSection('settings')" class="admin-btn admin-btn-export">Exportar JSON</button>
      </div>
    </div>`;
}

function saveSettings() {
  state.data.settings = {
    ...state.data.settings,
    votingDeadline: (document.getElementById('s-deadline').value || '') + ':00',
    currentYear: parseInt(document.getElementById('s-year').value) || 2026,
    featuredBeaches: document.getElementById('s-featured').value.trim().split('\n').filter(Boolean),
  };
  toast('Configurações guardadas!', 'success');
}

// ─── Shared ───
function deleteItem(section, index) {
  if (!confirm('Tem a certeza que deseja eliminar?')) return;
  state.data[section].splice(index, 1);
  toast('Item eliminado.', 'success');
  renderSection();
}

function filterAdminTable(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('.admin-table-row').forEach(row => {
    row.style.display = row.dataset.search?.includes(q) ? '' : 'none';
  });
}

// ─── Export / Import ───
function exportSection(section) {
  const data = state.data[section];
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${section}.json`; a.click();
  URL.revokeObjectURL(url);
  toast(`${section}.json exportado!`, 'success');
}

function exportAll() {
  SECTIONS.forEach((section, i) => setTimeout(() => exportSection(section), 250 * i));
}

function importJSON() { document.getElementById('import-file')?.click(); }

function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      const name = file.name.replace('.json', '');
      if (SECTIONS.includes(name)) {
        state.data[name] = data;
        toast(`${file.name} importado com sucesso!`, 'success');
        renderSection();
      } else {
        toast('Nome de ficheiro não reconhecido.', 'error');
      }
    } catch { toast('Erro ao ler o ficheiro JSON.', 'error'); }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ─── Toast ───
function toast(message, type = 'success') {
  document.querySelector('.admin-toast')?.remove();
  const el = document.createElement('div');
  el.className = `admin-toast ${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 3000);
}

// ─── Helpers ───
function slugify(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim().replace(/\s+/g, '-');
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Utilizadores (Supabase) ───
async function renderUtilizadores(content) {
  const sb = getAdminSb();
  if (!sb) {
    content.innerHTML = `
      <div class="p-8 max-w-xl">
        <h2 class="font-display text-xl font-bold text-praia-teal-800 mb-2">Utilizadores</h2>
        <div class="bg-praia-yellow-100 border border-praia-yellow-300 rounded-xl p-4 text-sm text-praia-teal-800">
          <strong>Configuração necessária:</strong> Substitua <code>ADMIN_SUPABASE_URL</code> e <code>ADMIN_SUPABASE_ANON_KEY</code>
          no topo de <code>js/admin.js</code> com as credenciais do projeto Supabase.
        </div>
      </div>`;
    return;
  }

  content.innerHTML = `
    <div class="p-8">
      <h2 class="font-display text-xl font-bold text-praia-teal-800 mb-6">Utilizadores</h2>
      <div id="util-loading" class="flex items-center gap-3 text-praia-sand-400">
        <div class="w-5 h-5 border-2 border-praia-teal-400 border-t-transparent rounded-full animate-spin"></div>
        A carregar dados do Supabase…
      </div>
      <div id="util-content" class="hidden space-y-8"></div>
    </div>`;

  try {
    const year = new Date().getFullYear();
    const beaches = state.data['beaches'] || [];

    const [
      { count: totalUsers },
      { count: totalVotes },
      { count: totalReviews },
      { count: totalStamps },
      { data: votesData },
      { data: recentReviews },
    ] = await Promise.all([
      sb.from('profiles').select('*', { count: 'exact', head: true }),
      sb.from('votes').select('*', { count: 'exact', head: true }),
      sb.from('reviews').select('*', { count: 'exact', head: true }),
      sb.from('stamps').select('*', { count: 'exact', head: true }),
      sb.from('votes').select('beach_id').eq('year', year),
      sb.from('reviews').select('text, beach_id, created_at, profiles(username, avatar_url)').order('created_at', { ascending: false }).limit(10),
    ]);

    // Votes per beach this year
    const voteCounts = {};
    (votesData || []).forEach(v => { voteCounts[v.beach_id] = (voteCounts[v.beach_id] || 0) + 1; });
    const voteRanking = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const utilContent = document.getElementById('util-content');
    utilContent.innerHTML = `
      <!-- Stats Grid -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        ${[
          { label: 'Utilizadores', value: totalUsers ?? '—', icon: '👤' },
          { label: `Votos ${year}`, value: totalVotes ?? '—', icon: '🗳️' },
          { label: 'Comentários', value: totalReviews ?? '—', icon: '💬' },
          { label: 'Carimbos', value: totalStamps ?? '—', icon: '🔖' },
        ].map(s => `
          <div class="bg-white rounded-xl p-5 shadow-sm border border-praia-sand-200">
            <div class="text-2xl mb-2">${s.icon}</div>
            <div class="font-display text-3xl font-bold text-praia-teal-800">${s.value}</div>
            <div class="text-xs text-praia-sand-400 font-display uppercase tracking-wider mt-1">${s.label}</div>
          </div>
        `).join('')}
      </div>

      <!-- Vote ranking -->
      <div>
        <h3 class="font-display font-semibold text-praia-teal-800 mb-3">Ranking de Votos ${year}</h3>
        ${voteRanking.length === 0
          ? `<p class="text-sm text-praia-sand-400">Sem votos registados este ano.</p>`
          : `<div class="bg-white rounded-xl overflow-hidden border border-praia-sand-200">
              <table class="w-full text-sm">
                <thead class="bg-praia-sand-100 text-praia-sand-500 text-xs uppercase tracking-wider font-display">
                  <tr>
                    <th class="text-left px-4 py-2.5">#</th>
                    <th class="text-left px-4 py-2.5">Praia</th>
                    <th class="text-right px-4 py-2.5">Votos</th>
                  </tr>
                </thead>
                <tbody>
                  ${voteRanking.map(([beachId, count], i) => {
                    const beach = beaches.find(b => b.id === beachId);
                    return `<tr class="border-t border-praia-sand-100 hover:bg-praia-sand-50">
                      <td class="px-4 py-2.5 text-praia-sand-400 font-display font-semibold">${i + 1}</td>
                      <td class="px-4 py-2.5 font-medium text-praia-teal-800">${escHtml(beach?.nome || beachId)}</td>
                      <td class="px-4 py-2.5 text-right font-display font-bold text-praia-teal-600">${count}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>`
        }
      </div>

      <!-- Recent reviews -->
      <div>
        <h3 class="font-display font-semibold text-praia-teal-800 mb-3">Comentários Recentes</h3>
        ${(recentReviews || []).length === 0
          ? `<p class="text-sm text-praia-sand-400">Sem comentários ainda.</p>`
          : `<div class="space-y-3">
              ${(recentReviews || []).map(r => {
                const beach = beaches.find(b => b.id === r.beach_id);
                const username = r.profiles?.username || 'utilizador';
                const avatar = r.profiles?.avatar_url;
                const date = r.created_at ? new Date(r.created_at).toLocaleDateString('pt-PT') : '';
                return `<div class="bg-white rounded-xl p-4 border border-praia-sand-200 flex gap-3 items-start">
                  <div class="w-9 h-9 rounded-full bg-praia-teal-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    ${avatar ? `<img src="${escHtml(avatar)}" alt="" class="w-full h-full object-cover">` : `<span class="text-white font-display font-bold text-sm">${escHtml(username[0]?.toUpperCase() || '?')}</span>`}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <span class="font-display font-semibold text-sm text-praia-teal-800">${escHtml(username)}</span>
                      <span class="text-xs text-praia-sand-400">${escHtml(beach?.nome || r.beach_id)}</span>
                      <span class="text-xs text-praia-sand-300 ml-auto">${date}</span>
                    </div>
                    <p class="text-sm text-praia-sand-600 line-clamp-2">${escHtml(r.text)}</p>
                  </div>
                </div>`;
              }).join('')}
            </div>`
        }
      </div>`;

    document.getElementById('util-loading').classList.add('hidden');
    utilContent.classList.remove('hidden');
  } catch (err) {
    document.getElementById('util-loading').innerHTML = `<span class="text-red-500 text-sm">Erro ao carregar dados: ${escHtml(err.message)}</span>`;
  }
}

// ─── Init ───
document.addEventListener('DOMContentLoaded', () => {
  if (checkAuth()) initDashboard();
});
