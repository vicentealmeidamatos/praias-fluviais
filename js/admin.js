// ─── Admin Panel — JSON Visual Editor ───
const SECTIONS = ['beaches', 'articles', 'locations-guia-passaporte', 'locations-carimbos', 'descontos', 'produtos', 'encomendas', 'utilizadores', 'comentarios', 'settings'];

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

// ─── Auth ─── Password is fixed: "Johnny Bravo" ───────────────────────────────
function checkAuth() {
  if (sessionStorage.getItem('admin_authenticated') === 'true') return true;
  showLogin();
  return false;
}

function showLogin() {
  document.getElementById('admin-app').innerHTML = `
    <div class="flex items-center justify-center min-h-screen bg-praia-sand-50">
      <div class="bg-white rounded-2xl shadow-layered-lg p-8 max-w-md w-full mx-4 admin-form">
        <div class="text-center mb-6">
          <img src="brand_assets/logotipo.png" alt="Praias Fluviais" class="h-10 mx-auto mb-4" style="filter: brightness(0) saturate(100%) invert(14%) sepia(59%) saturate(2000%) hue-rotate(160deg);">
          <h1 class="font-display text-xl font-bold text-praia-teal-800">Painel de Administração</h1>
          <p class="text-sm text-praia-sand-500 mt-2">Acesso restrito.</p>
        </div>
        <form onsubmit="event.preventDefault(); loginAdmin();">
          <label>Password</label>
          <input type="password" id="login-pass" required placeholder="Introduza a password">
          <div class="h-1"></div>
          <p id="login-error" class="text-sm text-red-500 hidden font-semibold">Password incorreta. Tente novamente.</p>
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

async function loginAdmin() {
  const pass = document.getElementById('login-pass').value;
  const inputHash   = await simpleHash(pass);
  const correctHash = await simpleHash('Johnny Bravo');
  if (inputHash === correctHash) {
    sessionStorage.setItem('admin_authenticated', 'true');
    initDashboard();
  } else {
    const errEl = document.getElementById('login-error');
    if (errEl) {
      errEl.classList.remove('hidden');
      errEl.style.animation = 'none';
      void errEl.offsetWidth;
      errEl.style.animation = 'shake 0.4s ease';
    }
  }
}

// ─── Dashboard ───
async function initDashboard() {
  const jsonSections = SECTIONS.filter(s => s !== 'utilizadores' && s !== 'comentarios' && s !== 'encomendas' && s !== 'produtos');
  for (const section of jsonSections) {
    try {
      const res = await fetch(`data/${section}.json`);
      state.data[section] = await res.json();
    } catch {
      state.data[section] = section === 'settings' ? {} : [];
    }
  }
  // Products: load from data/products.json
  try {
    const res = await fetch('data/products.json');
    state.data['produtos'] = await res.json();
  } catch {
    state.data['produtos'] = [];
  }
  // Encomendas: loaded lazily from Supabase when tab is opened
  state.data['encomendas'] = null;
  state.data['utilizadores'] = null;
  state.data['comentarios'] = null;
  renderDashboard();
}

// Keep backward compat: old 'locations' key maps to 'locations-guia-passaporte'
function getLocationsKey(section) { return section; }

function renderDashboard() {
  const sectionMeta = {
    beaches:               { icon: '🏖️', label: 'Praias Fluviais' },
    articles:              { icon: '📰', label: 'Novidades' },
    'locations-guia-passaporte': { icon: '📗', label: 'Guia & Passaporte' },
    'locations-carimbos':        { icon: '🔖', label: 'Carimbo' },
    descontos:             { icon: '🏷️', label: 'Descontos' },
    produtos:              { icon: '🛍️', label: 'Loja — Produtos' },
    encomendas:            { icon: '📦', label: 'Loja — Encomendas' },
    utilizadores:          { icon: '👥', label: 'Dados' },
    comentarios:           { icon: '💬', label: 'Comentários' },
    settings:              { icon: '⚙️', label: 'Configurações' },
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
    case 'locations-guia-passaporte': renderLocationsGuia(content); break;
    case 'locations-carimbos':        renderLocationsPassaporte(content); break;
    case 'descontos':              renderDescontos(content); break;
    case 'settings':               renderSettings(content); break;
    case 'produtos':               renderProdutos(content); break;
    case 'encomendas':             renderEncomendas(content); break;
    case 'utilizadores':           renderUtilizadores(content); break;
    case 'comentarios':            renderComentarios(content); break;
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
  const section = 'locations-guia-passaporte';
  const items = state.data[section] || [];
  const guiaCount = items.filter(l => l.type === 'guia').length;
  const gpCount   = items.filter(l => l.type === 'guia_passaporte').length;

  container.innerHTML = `
    <div class="p-6">
      <div class="flex items-center justify-between mb-2">
        <h1 class="font-display text-2xl font-bold text-praia-teal-800">Pontos — Guia &amp; Passaporte (${items.length})</h1>
        <div class="flex gap-2">
          <a href="../onde-encontrar.html" target="_blank" class="admin-btn bg-praia-sand-200 text-praia-teal-700 text-xs">Ver no site ↗</a>
          <button onclick="exportSection('locations-guia-passaporte')" class="admin-btn admin-btn-export">Exportar</button>
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
                  <button onclick="deleteItem('locations-guia-passaporte', ${i})" class="text-red-400 text-xs font-semibold">Eliminar</button>
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
  const section = 'locations-guia-passaporte';
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
  const section = 'locations-guia-passaporte';
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
  const section = 'locations-carimbos';
  const items = state.data[section] || [];

  container.innerHTML = `
    <div class="p-6">
      <div class="flex items-center justify-between mb-2">
        <h1 class="font-display text-2xl font-bold text-praia-teal-800">Postos de Carimbo (${items.length})</h1>
        <div class="flex gap-2">
          <a href="../onde-carimbar-passaporte.html" target="_blank" class="admin-btn bg-praia-sand-200 text-praia-teal-700 text-xs">Ver no site ↗</a>
          <button onclick="exportSection('locations-carimbos')" class="admin-btn admin-btn-export">Exportar</button>
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
                  <button onclick="deleteItem('locations-carimbos', ${i})" class="text-red-400 text-xs font-semibold">Eliminar</button>
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
  const section = 'locations-carimbos';
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
  const section = 'locations-carimbos';
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
  if (section === 'encomendas' || section === 'utilizadores' || section === 'comentarios') return; // Supabase-managed, não exportar
  const data = state.data[section];
  if (data === null || data === undefined) return;
  // produtos → ficheiro chama-se products.json
  const filename = section === 'produtos' ? 'products.json' : `${section}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  toast(`${filename} exportado!`, 'success');
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

// ─── Comentários (moderation) ───
async function renderComentarios(content) {
  const sb = getAdminSb();
  if (!sb) {
    content.innerHTML = `
      <div class="p-8 max-w-xl">
        <h2 class="font-display text-xl font-bold text-praia-teal-800 mb-2">Comentários</h2>
        <div class="bg-praia-yellow-100 border border-praia-yellow-300 rounded-xl p-4 text-sm text-praia-teal-800">
          <strong>Configuração necessária:</strong> Substitua <code>ADMIN_SUPABASE_URL</code> e <code>ADMIN_SUPABASE_ANON_KEY</code>
          no topo de <code>js/admin.js</code> com as credenciais do projeto Supabase.
        </div>
      </div>`;
    return;
  }

  const beaches = state.data['beaches'] || [];
  const beachOptions = beaches.map(b =>
    `<option value="${escHtml(b.id)}">${escHtml(b.name || b.nome || b.id)}</option>`
  ).join('');

  content.innerHTML = `
    <div class="p-8">
      <div class="flex items-start justify-between mb-5">
        <h2 class="font-display text-xl font-bold text-praia-teal-800">Comentários da Comunidade</h2>
      </div>

      <!-- Filtros -->
      <div class="bg-white border border-praia-sand-200 rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-end">
        <!-- Pesquisa texto -->
        <div class="flex-1 min-w-[180px]">
          <label class="block text-xs font-display font-semibold text-praia-sand-500 uppercase tracking-wider mb-1">Pesquisar</label>
          <div class="relative">
            <input type="text" id="com-search" oninput="renderComentariosContent()" placeholder="Texto, utilizador…"
                   class="pl-8 pr-3 py-2 text-sm rounded-lg border border-praia-sand-200 bg-praia-sand-50 focus:outline-none focus:border-praia-teal-400 w-full">
            <svg class="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-praia-sand-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </div>
        </div>
        <!-- Praia -->
        <div class="min-w-[180px]">
          <label class="block text-xs font-display font-semibold text-praia-sand-500 uppercase tracking-wider mb-1">Praia</label>
          <select id="com-filter-beach" onchange="renderComentariosContent()"
                  class="w-full py-2 px-3 text-sm rounded-lg border border-praia-sand-200 bg-praia-sand-50 focus:outline-none focus:border-praia-teal-400">
            <option value="">Todas as praias</option>
            ${beachOptions}
          </select>
        </div>
        <!-- Estado -->
        <div class="min-w-[140px]">
          <label class="block text-xs font-display font-semibold text-praia-sand-500 uppercase tracking-wider mb-1">Estado</label>
          <select id="com-filter-estado" onchange="renderComentariosContent()"
                  class="w-full py-2 px-3 text-sm rounded-lg border border-praia-sand-200 bg-praia-sand-50 focus:outline-none focus:border-praia-teal-400">
            <option value="todos">Todos</option>
            <option value="visiveis">Visíveis</option>
            <option value="apagados">Apagados</option>
          </select>
        </div>
        <!-- Limpar -->
        <button onclick="comClearFilters()" class="py-2 px-4 text-xs font-display font-semibold text-praia-sand-500 hover:text-praia-teal-700 border border-praia-sand-200 rounded-lg transition-colors whitespace-nowrap">
          Limpar filtros
        </button>
      </div>

      <div id="com-loading" class="flex items-center gap-3 text-praia-sand-400">
        <div class="w-5 h-5 border-2 border-praia-teal-400 border-t-transparent rounded-full animate-spin"></div>
        A carregar comentários…
      </div>
      <div id="com-content" class="hidden"></div>
    </div>

    <!-- Modal de confirmação de remoção -->
    <div id="com-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4" style="background:rgba(0,0,0,0.45);">
      <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-[slideIn_0.2s_ease]">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <svg class="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
          </div>
          <div>
            <h3 class="font-display font-bold text-praia-teal-800">Remover comentário?</h3>
            <p class="text-xs text-praia-sand-400 mt-0.5">Esta ação pode ser revertida mais tarde.</p>
          </div>
        </div>
        <div class="bg-praia-sand-50 rounded-xl p-3 mb-5 border border-praia-sand-200">
          <p class="text-xs text-praia-sand-500 font-display font-semibold uppercase tracking-wider mb-1">Comentário</p>
          <p id="com-modal-text" class="text-sm text-praia-sand-700 leading-relaxed"></p>
          <p id="com-modal-meta" class="text-xs text-praia-sand-400 mt-1"></p>
        </div>
        <p class="text-sm text-praia-sand-600 mb-5">O comentário ficará visível na comunidade como <em>"Este comentário foi removido pelo administrador."</em></p>
        <div class="flex gap-3 justify-end">
          <button onclick="comModalClose()" class="px-4 py-2 text-sm font-display font-semibold text-praia-sand-500 hover:text-praia-teal-800 border border-praia-sand-200 rounded-xl transition-colors">
            Cancelar
          </button>
          <button id="com-modal-confirm" class="px-5 py-2 text-sm font-display font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors">
            Remover
          </button>
        </div>
      </div>
    </div>`;

  try {
    const { data: reviews, error } = await sb
      .from('reviews')
      .select('id, text, images, created_at, beach_id, deleted_by_admin, profiles(username, avatar_url)')
      .order('created_at', { ascending: false })
      .limit(300);

    if (error) throw error;

    window._adminReviews = reviews || [];
    window._adminBeaches = beaches;

    document.getElementById('com-loading').classList.add('hidden');
    document.getElementById('com-content').classList.remove('hidden');
    renderComentariosContent();
  } catch (err) {
    document.getElementById('com-loading').innerHTML =
      `<span class="text-red-500 text-sm">Erro ao carregar comentários: ${escHtml(err.message)}</span>`;
  }
}

function comClearFilters() {
  const s = document.getElementById('com-search');
  const b = document.getElementById('com-filter-beach');
  const e = document.getElementById('com-filter-estado');
  if (s) s.value = '';
  if (b) b.value = '';
  if (e) e.value = 'todos';
  renderComentariosContent();
}

function comToggleExpand(id) {
  const el = document.getElementById(`com-text-${id}`);
  const btn = document.getElementById(`com-expand-${id}`);
  if (!el || !btn) return;
  const expanded = el.dataset.expanded === 'true';
  el.dataset.expanded = expanded ? 'false' : 'true';
  el.style.webkitLineClamp = expanded ? '3' : 'unset';
  el.style.display = expanded ? '-webkit-box' : 'block';
  btn.textContent = expanded ? 'Ver mais' : 'Ver menos';
}

function comModalClose() {
  document.getElementById('com-modal')?.classList.add('hidden');
}

function renderComentariosContent() {
  const container = document.getElementById('com-content');
  if (!container) return;

  const reviews = window._adminReviews || [];
  const beaches = window._adminBeaches || [];
  const query   = (document.getElementById('com-search')?.value || '').toLowerCase().trim();
  const beach   = document.getElementById('com-filter-beach')?.value || '';
  const estado  = document.getElementById('com-filter-estado')?.value || 'todos';

  let filtered = reviews;
  if (estado === 'visiveis') filtered = filtered.filter(r => !r.deleted_by_admin);
  if (estado === 'apagados') filtered = filtered.filter(r => !!r.deleted_by_admin);
  if (beach) filtered = filtered.filter(r => r.beach_id === beach);
  if (query) filtered = filtered.filter(r => {
    const beachName = (beaches.find(b => b.id === r.beach_id)?.name || beaches.find(b => b.id === r.beach_id)?.nome || r.beach_id || '').toLowerCase();
    return (r.text || '').toLowerCase().includes(query) ||
      (r.profiles?.username || '').toLowerCase().includes(query) ||
      beachName.includes(query);
  });

  const total    = reviews.length;
  const visiveis = reviews.filter(r => !r.deleted_by_admin).length;
  const apagados = reviews.filter(r => !!r.deleted_by_admin).length;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="flex items-center gap-4 text-xs text-praia-sand-400 mb-4">
        <span>${total} total</span><span>·</span><span class="text-green-600">${visiveis} visíveis</span><span>·</span><span class="text-red-500">${apagados} apagados</span>
      </div>
      <p class="text-sm text-praia-sand-400 py-4">Nenhum comentário encontrado com estes filtros.</p>`;
    return;
  }

  container.innerHTML = `
    <div class="flex items-center gap-4 text-xs text-praia-sand-400 mb-4">
      <span>${total} total</span><span>·</span><span class="text-green-600">${visiveis} visíveis</span><span>·</span><span class="text-red-500">${apagados} apagados</span>
      ${filtered.length !== total ? `<span>·</span><span class="font-semibold text-praia-teal-600">${filtered.length} com filtro ativo</span>` : ''}
    </div>
    <div class="bg-white rounded-xl overflow-hidden border border-praia-sand-200">
      <table class="w-full text-sm">
        <thead class="bg-praia-sand-100 text-praia-sand-500 text-xs uppercase tracking-wider font-display">
          <tr>
            <th class="text-left px-4 py-3 w-36">Utilizador</th>
            <th class="text-left px-4 py-3 w-36">Praia</th>
            <th class="text-left px-4 py-3">Comentário</th>
            <th class="text-left px-4 py-3 w-24">Data</th>
            <th class="text-left px-4 py-3 w-24">Estado</th>
            <th class="px-4 py-3 w-28"></th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(r => {
            const beach    = beaches.find(b => b.id === r.beach_id);
            const username = r.profiles?.username || '—';
            const avatar   = r.profiles?.avatar_url;
            const date     = r.created_at ? new Date(r.created_at).toLocaleDateString('pt-PT') : '';
            const isDeleted = !!r.deleted_by_admin;
            const text     = r.text || '';
            const isLong   = text.length > 120;
            const rowBg    = isDeleted ? 'bg-red-50' : 'hover:bg-praia-sand-50';
            return `<tr class="border-t border-praia-sand-100 ${rowBg}" id="com-row-${r.id}">
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <div class="w-7 h-7 rounded-full bg-praia-teal-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    ${avatar
                      ? `<img src="${escHtml(avatar)}" alt="" class="w-full h-full object-cover">`
                      : `<span class="text-white font-display font-bold text-xs">${escHtml(username[0]?.toUpperCase() || '?')}</span>`}
                  </div>
                  <span class="font-medium text-praia-teal-800 text-xs">${escHtml(username)}</span>
                </div>
              </td>
              <td class="px-4 py-3 text-praia-sand-500 text-xs">${escHtml(beach?.name || beach?.nome || r.beach_id || '—')}</td>
              <td class="px-4 py-3">
                ${isDeleted
                  ? `<span class="italic text-praia-sand-400 text-xs">Removido pelo administrador</span>`
                  : `<div>
                       <p id="com-text-${r.id}" data-expanded="false"
                          style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;"
                          class="text-praia-sand-700 text-xs leading-relaxed">${escHtml(text)}</p>
                       ${isLong ? `<button id="com-expand-${r.id}" onclick="comToggleExpand('${r.id}')"
                                           class="text-[10px] font-display font-semibold text-praia-teal-500 hover:text-praia-teal-700 mt-1 transition-colors">Ver mais</button>` : ''}
                       ${r.images?.length ? `<span class="text-[10px] text-praia-sand-400 mt-0.5 block">${r.images.length} foto${r.images.length > 1 ? 's' : ''}</span>` : ''}
                     </div>`}
              </td>
              <td class="px-4 py-3 text-praia-sand-400 text-xs whitespace-nowrap">${date}</td>
              <td class="px-4 py-3">
                ${isDeleted
                  ? `<span class="inline-flex text-[10px] font-display font-semibold uppercase tracking-wider text-red-500 bg-red-100 px-2 py-1 rounded-full whitespace-nowrap">Apagado</span>`
                  : `<span class="inline-flex text-[10px] font-display font-semibold uppercase tracking-wider text-green-600 bg-green-100 px-2 py-1 rounded-full whitespace-nowrap">Visível</span>`}
              </td>
              <td class="px-4 py-3 text-right whitespace-nowrap">
                ${isDeleted
                  ? `<button onclick="adminRestoreReview('${r.id}')"
                             class="text-xs font-display font-semibold text-praia-teal-600 hover:text-praia-teal-800 border border-praia-teal-300 hover:border-praia-teal-500 px-3 py-1.5 rounded-lg transition-colors">
                       Restaurar
                     </button>`
                  : `<button onclick="adminDeleteReview('${r.id}', '${escHtml(username)}', '${escHtml(beach?.name || beach?.nome || '')}', \`${escHtml(text.slice(0, 120))}\`)"
                             class="text-xs font-display font-semibold text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors">
                       Remover
                     </button>`}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

function adminDeleteReview(reviewId, username, beachName, previewText) {
  const modal = document.getElementById('com-modal');
  if (!modal) return;

  document.getElementById('com-modal-text').textContent = previewText + (previewText.length >= 120 ? '…' : '');
  document.getElementById('com-modal-meta').textContent = `por ${username}${beachName ? ' · ' + beachName : ''}`;

  const btn = document.getElementById('com-modal-confirm');
  // Remove previous listener clone
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  newBtn.addEventListener('click', async () => {
    newBtn.disabled = true;
    newBtn.textContent = 'A remover…';
    const sb = getAdminSb();
    const { error } = await sb.from('reviews').update({ deleted_by_admin: true }).eq('id', reviewId);
    comModalClose();
    if (error) {
      toast('Erro ao remover comentário: ' + error.message, 'error');
      newBtn.disabled = false;
      newBtn.textContent = 'Remover';
      return;
    }
    const r = (window._adminReviews || []).find(r => r.id === reviewId);
    if (r) r.deleted_by_admin = true;
    renderComentariosContent();
    toast('Comentário removido.', 'success');
  });

  modal.classList.remove('hidden');
}

async function adminRestoreReview(reviewId) {
  const sb = getAdminSb();
  if (!sb) return;

  const { error } = await sb.from('reviews').update({ deleted_by_admin: false }).eq('id', reviewId);
  if (error) { toast('Erro ao restaurar: ' + error.message, 'error'); return; }

  const r = (window._adminReviews || []).find(r => r.id === reviewId);
  if (r) r.deleted_by_admin = false;
  renderComentariosContent();
  toast('Comentário restaurado.', 'success');
}

// ─── Produtos (CRUD sobre data/products.json) ────────────────────────────────

function renderProdutos(container) {
  const products = state.data['produtos'] || [];

  function fmtPrice(cents) {
    if (cents === 0) return 'Grátis';
    return (cents / 100).toFixed(2).replace('.', ',') + '€';
  }

  container.innerHTML = `
    <div class="p-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="font-display text-xl font-bold text-praia-teal-800">Produtos da Loja</h2>
        <button onclick="addNewProduct()" class="admin-btn admin-btn-primary px-5 py-2.5">+ Novo Produto</button>
      </div>

      <div class="bg-white rounded-2xl shadow-sm overflow-hidden border border-praia-sand-100">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-praia-teal-800 text-white">
              <th class="text-left px-4 py-3 font-display text-xs uppercase tracking-wider font-semibold">Produto</th>
              <th class="text-left px-4 py-3 font-display text-xs uppercase tracking-wider font-semibold">Categoria</th>
              <th class="text-left px-4 py-3 font-display text-xs uppercase tracking-wider font-semibold">Preço</th>
              <th class="text-left px-4 py-3 font-display text-xs uppercase tracking-wider font-semibold">Estado</th>
              <th class="text-left px-4 py-3 font-display text-xs uppercase tracking-wider font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody id="products-tbody">
            ${products.map((p, i) => `
              <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-praia-sand-50'} border-b border-praia-sand-100">
                <td class="px-4 py-3">
                  <div class="flex items-center gap-3">
                    ${p.images && p.images[0] ? `<img src="${p.images[0]}" class="w-10 h-10 rounded-lg object-cover border border-praia-sand-100" onerror="this.style.display='none'">` : '<div class="w-10 h-10 rounded-lg bg-praia-sand-100 flex items-center justify-center text-praia-sand-400 text-lg">📦</div>'}
                    <div>
                      <div class="font-display font-semibold text-praia-teal-800">${p.name}</div>
                      <div class="text-praia-sand-400 text-xs">${p.id}</div>
                    </div>
                  </div>
                </td>
                <td class="px-4 py-3 font-display text-praia-sand-600 capitalize">${p.category || '—'}</td>
                <td class="px-4 py-3 font-display font-semibold text-praia-teal-800">${fmtPrice(p.price)}</td>
                <td class="px-4 py-3">
                  <span class="inline-flex items-center gap-1 font-display text-xs font-semibold px-2 py-0.5 rounded-full ${p.available ? 'bg-praia-green-500/10 text-praia-green-600' : 'bg-red-50 text-red-500'}">
                    ${p.available ? '● Disponível' : '○ Esgotado'}
                  </span>
                  ${p.featured ? '<span class="ml-1 inline-flex items-center gap-1 font-display text-xs font-semibold px-2 py-0.5 rounded-full bg-praia-yellow-400/20 text-praia-teal-800">⭐ Destaque</span>' : ''}
                </td>
                <td class="px-4 py-3">
                  <div class="flex gap-2">
                    <button onclick="editProduct('${p.id}')" class="admin-btn py-1 px-3 text-xs">Editar</button>
                    <button onclick="toggleProductAvailability('${p.id}')" class="admin-btn py-1 px-3 text-xs ${p.available ? 'bg-praia-sand-100 text-praia-sand-600' : 'bg-praia-green-500/10 text-praia-green-600'}">${p.available ? 'Esgotar' : 'Disponibilizar'}</button>
                    <button onclick="deleteProduct('${p.id}')" class="admin-btn admin-btn-danger py-1 px-3 text-xs">Remover</button>
                  </div>
                </td>
              </tr>
            `).join('')}
            ${!products.length ? `<tr><td colspan="5" class="text-center py-12 text-praia-sand-400 font-display">Sem produtos. Cria o primeiro!</td></tr>` : ''}
          </tbody>
        </table>
      </div>

      <div class="mt-6 bg-praia-teal-50 border border-praia-teal-100 rounded-xl p-4 text-sm text-praia-teal-700 font-display">
        <p class="font-semibold mb-1">Como funciona</p>
        <p class="text-praia-teal-600">As alterações são guardadas em <strong>data/products.json</strong> e refletem-se imediatamente na loja. Usa "Exportar Tudo" na barra lateral para fazer download do ficheiro atualizado.</p>
      </div>

      <!-- Edit modal -->
      <div id="product-modal" class="hidden fixed inset-0 z-[3000] flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm">
        <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
          <h3 class="font-display font-bold text-lg text-praia-teal-800 mb-5" id="product-modal-title">Editar Produto</h3>
          <div id="product-modal-body"></div>
          <div class="flex gap-3 mt-6 pt-5 border-t border-praia-sand-100">
            <button onclick="saveProduct()" class="admin-btn admin-btn-primary flex-1 py-3">Guardar</button>
            <button onclick="document.getElementById('product-modal').classList.add('hidden')" class="admin-btn flex-1 py-3">Cancelar</button>
          </div>
        </div>
      </div>
    </div>`;
}

function productFormHTML(p) {
  const variants = p.variants || [];
  return `
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="admin-label">ID (slug único)</label>
          <input id="p-id" class="admin-input" value="${p.id || ''}" placeholder="ex: tshirt-2026">
        </div>
        <div>
          <label class="admin-label">Categoria</label>
          <select id="p-category" class="admin-input">
            <option value="vestuario" ${p.category === 'vestuario' ? 'selected' : ''}>Vestuário</option>
            <option value="publicacao" ${p.category === 'publicacao' ? 'selected' : ''}>Publicação</option>
            <option value="acessorio" ${p.category === 'acessorio' ? 'selected' : ''}>Acessório</option>
          </select>
        </div>
      </div>
      <div>
        <label class="admin-label">Nome</label>
        <input id="p-name" class="admin-input" value="${p.name || ''}" placeholder="Nome do produto">
      </div>
      <div>
        <label class="admin-label">Descrição</label>
        <textarea id="p-description" class="admin-input" rows="3">${p.description || ''}</textarea>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="admin-label">Preço (cêntimos — 0 = Grátis)</label>
          <input id="p-price" type="number" min="0" class="admin-input" value="${p.price ?? 0}" placeholder="2500">
        </div>
        <div class="flex flex-col gap-2 pt-5">
          <label class="flex items-center gap-2 cursor-pointer">
            <input id="p-available" type="checkbox" class="w-4 h-4" ${p.available ? 'checked' : ''}> <span class="text-sm font-display text-praia-sand-700">Disponível</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input id="p-featured" type="checkbox" class="w-4 h-4" ${p.featured ? 'checked' : ''}> <span class="text-sm font-display text-praia-sand-700">Destaque</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input id="p-shipping" type="checkbox" class="w-4 h-4" ${p.shippingRequired ? 'checked' : ''}> <span class="text-sm font-display text-praia-sand-700">Requer envio</span>
          </label>
        </div>
      </div>
      <div>
        <label class="admin-label">Imagens (uma por linha)</label>
        <textarea id="p-images" class="admin-input font-mono text-xs" rows="4" placeholder="brand_assets/itens_loja/imagem.jpg">${(p.images || []).join('\n')}</textarea>
      </div>
      <div>
        <label class="admin-label">Variantes (tamanhos) — formato: XS,S,M,L,XL,XXL (separados por vírgula, vazio = sem variantes)</label>
        <input id="p-variants" class="admin-input" value="${variants.map(v => v.id).join(',')}" placeholder="XS,S,M,L,XL,XXL">
      </div>
    </div>`;
}

function editProduct(productId) {
  const products = state.data['produtos'] || [];
  const p = products.find(p => p.id === productId) || {};
  document.getElementById('product-modal-title').textContent = 'Editar Produto';
  document.getElementById('product-modal-body').innerHTML = productFormHTML(p);
  document.getElementById('product-modal').dataset.editId = productId;
  document.getElementById('product-modal').classList.remove('hidden');
}

function addNewProduct() {
  document.getElementById('product-modal-title').textContent = 'Novo Produto';
  document.getElementById('product-modal-body').innerHTML = productFormHTML({});
  document.getElementById('product-modal').dataset.editId = '';
  document.getElementById('product-modal').classList.remove('hidden');
}

function saveProduct() {
  const editId = document.getElementById('product-modal').dataset.editId;
  const products = state.data['produtos'] || [];

  const id          = document.getElementById('p-id').value.trim();
  const name        = document.getElementById('p-name').value.trim();
  const description = document.getElementById('p-description').value.trim();
  const category    = document.getElementById('p-category').value;
  const price       = parseInt(document.getElementById('p-price').value || '0', 10);
  const available   = document.getElementById('p-available').checked;
  const featured    = document.getElementById('p-featured').checked;
  const shippingRequired = document.getElementById('p-shipping').checked;
  const images      = document.getElementById('p-images').value.split('\n').map(s => s.trim()).filter(Boolean);
  const variantStr  = document.getElementById('p-variants').value.trim();
  const variants    = variantStr
    ? variantStr.split(',').map(s => s.trim()).filter(Boolean).map(v => ({ id: v, label: v, available: true }))
    : [];

  if (!id || !name) { toast('ID e Nome são obrigatórios.', 'error'); return; }

  const product = { id, name, description, category, price, images, variants, shippingRequired, available, featured };

  if (editId) {
    const idx = products.findIndex(p => p.id === editId);
    if (idx >= 0) products[idx] = product;
    else products.push(product);
  } else {
    if (products.some(p => p.id === id)) { toast('Já existe um produto com este ID.', 'error'); return; }
    products.push(product);
  }

  state.data['produtos'] = products;
  document.getElementById('product-modal').classList.add('hidden');
  renderDashboard();
  toast('Produto guardado. Usa "Exportar Tudo" para guardar as alterações.', 'success');
}

function toggleProductAvailability(productId) {
  const products = state.data['produtos'] || [];
  const p = products.find(p => p.id === productId);
  if (p) { p.available = !p.available; renderDashboard(); }
}

function deleteProduct(productId) {
  if (!confirm('Remover este produto?')) return;
  state.data['produtos'] = (state.data['produtos'] || []).filter(p => p.id !== productId);
  renderDashboard();
  toast('Produto removido. Usa "Exportar Tudo" para guardar.', 'success');
}

// ─── Encomendas (leitura do Supabase) ────────────────────────────────────────

async function renderEncomendas(container) {
  container.innerHTML = `
    <div class="p-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="font-display text-xl font-bold text-praia-teal-800">Encomendas</h2>
        <button onclick="renderEncomendas(document.getElementById('admin-content'))" class="admin-btn px-4 py-2">↺ Atualizar</button>
      </div>
      <div id="orders-admin-content">
        <div class="flex items-center justify-center py-20">
          <div class="w-10 h-10 border-2 border-praia-teal-200 border-t-praia-teal-600 rounded-full animate-spin"></div>
        </div>
      </div>
    </div>`;

  const sb = getAdminSb();
  if (!sb) {
    document.getElementById('orders-admin-content').innerHTML = `<p class="text-red-500 font-display text-sm">Supabase não configurado.</p>`;
    return;
  }

  const { data: orders, error } = await sb
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    document.getElementById('orders-admin-content').innerHTML = `<p class="text-red-500 font-display text-sm">Erro: ${error.message}</p>`;
    return;
  }

  window._adminOrders = orders || [];
  renderEncomendasContent();
}

function renderEncomendasContent() {
  const orders = window._adminOrders || [];
  const container = document.getElementById('orders-admin-content');
  if (!container) return;

  const statusColors = {
    pendente:   'bg-praia-sand-100 text-praia-sand-700',
    processado: 'bg-praia-teal-50 text-praia-teal-700',
    enviado:    'bg-blue-50 text-blue-700',
    entregue:   'bg-praia-green-500/10 text-praia-green-600',
  };

  function fmtPrice(cents) {
    return (cents / 100).toFixed(2).replace('.', ',') + '€';
  }
  function fmtDate(dt) {
    return new Date(dt).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  if (!orders.length) {
    container.innerHTML = `<div class="text-center py-20 text-praia-sand-400 font-display">Ainda não há encomendas.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="bg-white rounded-2xl shadow-sm overflow-hidden border border-praia-sand-100">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-praia-teal-800 text-white">
            <th class="text-left px-4 py-3 font-display text-xs uppercase tracking-wider font-semibold">ID</th>
            <th class="text-left px-4 py-3 font-display text-xs uppercase tracking-wider font-semibold">Email</th>
            <th class="text-left px-4 py-3 font-display text-xs uppercase tracking-wider font-semibold">Data</th>
            <th class="text-left px-4 py-3 font-display text-xs uppercase tracking-wider font-semibold">Total</th>
            <th class="text-left px-4 py-3 font-display text-xs uppercase tracking-wider font-semibold">Estado</th>
            <th class="text-left px-4 py-3 font-display text-xs uppercase tracking-wider font-semibold">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${orders.map((o, i) => `
            <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-praia-sand-50'} border-b border-praia-sand-100" id="order-row-${o.id}">
              <td class="px-4 py-3">
                <span class="font-display font-bold text-praia-teal-800 text-xs">#${o.id.slice(0, 8).toUpperCase()}</span>
              </td>
              <td class="px-4 py-3 text-praia-sand-600 font-display text-xs">${o.email || '—'}</td>
              <td class="px-4 py-3 text-praia-sand-500 font-display text-xs">${fmtDate(o.created_at)}</td>
              <td class="px-4 py-3 font-display font-bold text-praia-teal-800">${fmtPrice(o.total)}</td>
              <td class="px-4 py-3">
                <select onchange="updateOrderStatus('${o.id}', this.value)"
                  class="font-display text-xs px-2 py-1 rounded-lg border border-praia-sand-200 ${statusColors[o.status] || ''}">
                  <option value="pendente" ${o.status === 'pendente' ? 'selected' : ''}>Pendente</option>
                  <option value="processado" ${o.status === 'processado' ? 'selected' : ''}>Em processamento</option>
                  <option value="enviado" ${o.status === 'enviado' ? 'selected' : ''}>Enviado</option>
                  <option value="entregue" ${o.status === 'entregue' ? 'selected' : ''}>Entregue</option>
                </select>
              </td>
              <td class="px-4 py-3">
                <button onclick="viewOrderDetails('${o.id}')" class="admin-btn py-1 px-3 text-xs">Ver detalhes</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <!-- Order detail modal -->
    <div id="order-detail-modal" class="hidden fixed inset-0 z-[3000] flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm">
      <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-display font-bold text-lg text-praia-teal-800" id="order-detail-title">Detalhes</h3>
          <button onclick="document.getElementById('order-detail-modal').classList.add('hidden')" class="text-praia-sand-400 hover:text-praia-sand-600 text-xl font-bold">×</button>
        </div>
        <div id="order-detail-body"></div>
      </div>
    </div>`;
}

async function updateOrderStatus(orderId, newStatus) {
  const sb = getAdminSb();
  if (!sb) return;
  const { error } = await sb.from('orders').update({ status: newStatus }).eq('id', orderId);
  if (error) { toast('Erro ao atualizar: ' + error.message, 'error'); return; }
  const order = (window._adminOrders || []).find(o => o.id === orderId);
  if (order) order.status = newStatus;
  toast('Estado atualizado.', 'success');
}

function viewOrderDetails(orderId) {
  const order = (window._adminOrders || []).find(o => o.id === orderId);
  if (!order) return;

  function fmtPrice(cents) { return (cents / 100).toFixed(2).replace('.', ',') + '€'; }
  const items = Array.isArray(order.items) ? order.items : [];
  const addr  = order.shipping_address || {};

  document.getElementById('order-detail-title').textContent = `#${order.id.slice(0, 8).toUpperCase()}`;
  document.getElementById('order-detail-body').innerHTML = `
    <div class="space-y-4 text-sm font-display">
      <div>
        <p class="text-[10px] uppercase tracking-wider text-praia-sand-400 mb-1">Email</p>
        <p class="text-praia-teal-800 font-semibold">${order.email}</p>
      </div>
      <div>
        <p class="text-[10px] uppercase tracking-wider text-praia-sand-400 mb-1">Morada</p>
        <p class="text-praia-teal-800">${addr.name || ''}<br>${addr.line1 || ''}${addr.line2 ? ', ' + addr.line2 : ''}<br>${addr.postal_code || ''} ${addr.city || ''}<br>${addr.country || 'PT'}</p>
      </div>
      <div>
        <p class="text-[10px] uppercase tracking-wider text-praia-sand-400 mb-2">Itens</p>
        <div class="space-y-1">
          ${items.map(item => `
            <div class="flex justify-between">
              <span class="text-praia-sand-600">${item.name}${item.variant && item.variant !== 'sem-variante' ? ` (${item.variant})` : ''} × ${item.quantity}</span>
              <span class="font-semibold text-praia-teal-800">${item.price === 0 ? 'Grátis' : fmtPrice(item.price * item.quantity)}</span>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="border-t border-praia-sand-100 pt-3 space-y-1">
        <div class="flex justify-between text-praia-sand-500">
          <span>Subtotal</span><span>${fmtPrice(order.subtotal)}</span>
        </div>
        <div class="flex justify-between text-praia-sand-500">
          <span>Envio (${order.shipping_zone === 'ilhas' ? 'Açores/Madeira' : 'Continental'})</span>
          <span>${order.shipping_price === 0 ? 'Grátis' : fmtPrice(order.shipping_price)}</span>
        </div>
        <div class="flex justify-between font-bold text-praia-teal-800 text-base">
          <span>Total</span><span>${fmtPrice(order.total)}</span>
        </div>
      </div>
      <div>
        <p class="text-[10px] uppercase tracking-wider text-praia-sand-400 mb-1">Stripe Session</p>
        <p class="text-praia-sand-500 text-xs break-all">${order.stripe_session_id}</p>
      </div>
    </div>`;

  document.getElementById('order-detail-modal').classList.remove('hidden');
}

// ─── Init ───
document.addEventListener('DOMContentLoaded', () => {
  if (checkAuth()) initDashboard();
});
