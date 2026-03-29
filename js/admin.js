// ─── Admin Panel — JSON Visual Editor ───
const SECTIONS = ['beaches', 'articles', 'locations-guia', 'locations-passaporte', 'descontos', 'settings'];
const state = { currentSection: 'beaches', data: {}, editingId: null };

// ─── Auth ───
function checkAuth() {
  const hash = localStorage.getItem('admin_password_hash');
  if (!hash) {
    showSetupPassword();
    return false;
  }
  const session = sessionStorage.getItem('admin_authenticated');
  if (session === 'true') return true;
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
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
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
  // Load all data
  for (const section of SECTIONS) {
    try {
      const fileName = section === 'settings' ? 'settings' : section;
      const res = await fetch(`data/${fileName}.json`);
      state.data[section] = await res.json();
    } catch {
      state.data[section] = section === 'settings' ? {} : [];
    }
  }

  renderDashboard();
}

function renderDashboard() {
  const app = document.getElementById('admin-app');
  app.innerHTML = `
    <div class="flex h-screen">
      <!-- Sidebar -->
      <aside class="w-64 bg-praia-teal-800 flex flex-col admin-sidebar flex-shrink-0">
        <div class="p-5 border-b border-white/10">
          <img src="brand_assets/logotipo.png" alt="Praias Fluviais" class="h-8">
          <p class="text-white/40 text-xs mt-2 font-display uppercase tracking-wider">Painel Admin</p>
        </div>
        <nav class="flex-1 py-2">
          <button onclick="switchSection('beaches')" class="admin-tab ${state.currentSection === 'beaches' ? 'active' : ''} w-full text-left px-5 py-3 text-sm text-white/70 hover:text-white hover:bg-white/5 flex items-center gap-3">
            <span>🏖️</span> Praias
          </button>
          <button onclick="switchSection('articles')" class="admin-tab ${state.currentSection === 'articles' ? 'active' : ''} w-full text-left px-5 py-3 text-sm text-white/70 hover:text-white hover:bg-white/5 flex items-center gap-3">
            <span>📰</span> Artigos
          </button>
          <button onclick="switchSection('locations-guia')" class="admin-tab ${state.currentSection === 'locations-guia' ? 'active' : ''} w-full text-left px-5 py-3 text-sm text-white/70 hover:text-white hover:bg-white/5 flex items-center gap-3">
            <span>📍</span> Locais do Guia
          </button>
          <button onclick="switchSection('locations-passaporte')" class="admin-tab ${state.currentSection === 'locations-passaporte' ? 'active' : ''} w-full text-left px-5 py-3 text-sm text-white/70 hover:text-white hover:bg-white/5 flex items-center gap-3">
            <span>🗺️</span> Locais Passaporte
          </button>
          <button onclick="switchSection('descontos')" class="admin-tab ${state.currentSection === 'descontos' ? 'active' : ''} w-full text-left px-5 py-3 text-sm text-white/70 hover:text-white hover:bg-white/5 flex items-center gap-3">
            <span>🏷️</span> Descontos
          </button>
          <button onclick="switchSection('settings')" class="admin-tab ${state.currentSection === 'settings' ? 'active' : ''} w-full text-left px-5 py-3 text-sm text-white/70 hover:text-white hover:bg-white/5 flex items-center gap-3">
            <span>⚙️</span> Configurações
          </button>
        </nav>
        <div class="p-4 border-t border-white/10 space-y-2">
          <button onclick="exportAll()" class="admin-btn admin-btn-export w-full py-2.5 text-center">Exportar Tudo</button>
          <button onclick="importJSON()" class="admin-btn w-full py-2.5 text-center bg-white/10 text-white/70">Importar JSON</button>
          <input type="file" id="import-file" accept=".json" class="hidden" onchange="handleImport(event)">
          <button onclick="sessionStorage.removeItem('admin_authenticated'); location.reload();" class="w-full text-center text-xs text-white/30 hover:text-white/50 py-2">Sair</button>
        </div>
      </aside>

      <!-- Content -->
      <main class="flex-1 overflow-y-auto bg-praia-sand-50" id="admin-content">
      </main>
    </div>`;

  renderSection();
}

function switchSection(section) {
  state.currentSection = section;
  state.editingId = null;
  renderDashboard();
}

// ─── Section Renderers ───
function renderSection() {
  const content = document.getElementById('admin-content');
  switch (state.currentSection) {
    case 'beaches': renderBeaches(content); break;
    case 'articles': renderArticles(content); break;
    case 'locations-guia': renderLocations(content, 'locations-guia', 'Locais do Guia'); break;
    case 'locations-passaporte': renderLocations(content, 'locations-passaporte', 'Locais do Passaporte'); break;
    case 'descontos': renderDescontos(content); break;
    case 'settings': renderSettings(content); break;
  }
}

// ─── Beaches ───
function renderBeaches(container) {
  const beaches = state.data.beaches || [];
  container.innerHTML = `
    <div class="p-6">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="font-display text-2xl font-bold text-praia-teal-800">Praias Fluviais</h1>
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
                <th class="px-4 py-3 font-display text-xs uppercase tracking-wider text-praia-teal-700">Região</th>
                <th class="px-4 py-3 font-display text-xs uppercase tracking-wider text-praia-teal-700">Serviços</th>
                <th class="px-4 py-3 font-display text-xs uppercase tracking-wider text-praia-teal-700 text-right">Ações</th>
              </tr>
            </thead>
            <tbody id="beaches-tbody">
              ${beaches.map((b, i) => `
                <tr class="border-t border-praia-sand-100 hover:bg-praia-sand-50 admin-table-row" data-search="${(b.name + ' ' + b.municipality + ' ' + b.region).toLowerCase()}">
                  <td class="px-4 py-3 font-semibold text-praia-teal-800">${b.name}</td>
                  <td class="px-4 py-3 text-praia-sand-600">${b.municipality}</td>
                  <td class="px-4 py-3"><span class="badge" style="background:rgba(0,58,64,0.1);color:#003A40;">${b.region}</span></td>
                  <td class="px-4 py-3 text-praia-sand-500 text-xs">${Object.entries(b.services).filter(([,v])=>v).map(([k])=>k).join(', ')}</td>
                  <td class="px-4 py-3 text-right">
                    <button onclick="editBeach(${i})" class="text-praia-teal-600 hover:text-praia-teal-800 text-xs font-semibold mr-2">Editar</button>
                    <button onclick="deleteItem('beaches', ${i})" class="text-red-400 hover:text-red-600 text-xs font-semibold">Eliminar</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

function editBeach(index) {
  const b = index !== null ? state.data.beaches[index] : {
    id: '', name: '', municipality: '', district: '', region: 'centro', river: '',
    coordinates: { lat: 39.5, lng: -8.0 }, description: '',
    photos: ['https://placehold.co/800x600/003A40/FFEB3B?text=Foto+1', 'https://placehold.co/800x600/005D56/FFEB3B?text=Foto+2', 'https://placehold.co/800x600/002A2E/FFEB3B?text=Foto+3'],
    video360: null,
    services: { bar: false, grills: false, lifeguard: false, blueFlag: false, goldQuality: false, accessible: false, parking: false, wc: false, picnicArea: false, camping: false },
    waterQuality: 'boa', featured: false, passportStamp: true
  };

  const container = document.getElementById('admin-content');
  container.innerHTML = `
    <div class="p-6 max-w-3xl admin-form">
      <button onclick="renderSection()" class="text-praia-teal-600 text-sm font-semibold mb-4 flex items-center gap-1">&larr; Voltar à lista</button>
      <h2 class="font-display text-xl font-bold text-praia-teal-800 mb-6">${index !== null ? 'Editar' : 'Adicionar'} Praia</h2>

      <div class="grid grid-cols-2 gap-4 mb-4">
        <div><label>Nome</label><input type="text" id="b-name" value="${b.name}"></div>
        <div><label>ID (slug)</label><input type="text" id="b-id" value="${b.id}" placeholder="auto-gerado se vazio"></div>
      </div>
      <div class="grid grid-cols-3 gap-4 mb-4">
        <div><label>Concelho</label><input type="text" id="b-municipality" value="${b.municipality}"></div>
        <div><label>Distrito</label><input type="text" id="b-district" value="${b.district}"></div>
        <div><label>Região</label>
          <select id="b-region">
            <option value="norte" ${b.region==='norte'?'selected':''}>Norte</option>
            <option value="centro" ${b.region==='centro'?'selected':''}>Centro</option>
            <option value="alentejo" ${b.region==='alentejo'?'selected':''}>Alentejo</option>
            <option value="algarve" ${b.region==='algarve'?'selected':''}>Algarve</option>
          </select>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div><label>Rio</label><input type="text" id="b-river" value="${b.river}"></div>
        <div><label>Qualidade Água</label>
          <select id="b-waterQuality">
            <option value="excelente" ${b.waterQuality==='excelente'?'selected':''}>Excelente</option>
            <option value="boa" ${b.waterQuality==='boa'?'selected':''}>Boa</option>
            <option value="aceitavel" ${b.waterQuality==='aceitavel'?'selected':''}>Aceitável</option>
          </select>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div><label>Latitude</label><input type="number" step="0.0001" id="b-lat" value="${b.coordinates.lat}"></div>
        <div><label>Longitude</label><input type="number" step="0.0001" id="b-lng" value="${b.coordinates.lng}"></div>
      </div>
      <div class="mb-4">
        <label>Descrição</label>
        <textarea id="b-description" rows="4">${b.description}</textarea>
      </div>
      <div class="mb-4">
        <label>Fotos (URLs, uma por linha)</label>
        <textarea id="b-photos" rows="3">${b.photos.join('\n')}</textarea>
      </div>

      <div class="mb-4">
        <label>Serviços</label>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
          ${Object.entries(b.services).map(([k, v]) => `
            <label class="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" class="b-service" data-key="${k}" ${v ? 'checked' : ''}> ${k}
            </label>
          `).join('')}
        </div>
      </div>

      <div class="flex items-center gap-6 mb-6">
        <label class="flex items-center gap-2 cursor-pointer text-sm">
          <input type="checkbox" id="b-featured" ${b.featured ? 'checked' : ''}> Destaque
        </label>
        <label class="flex items-center gap-2 cursor-pointer text-sm">
          <input type="checkbox" id="b-passportStamp" ${b.passportStamp ? 'checked' : ''}> Carimbo Passaporte
        </label>
      </div>

      <div class="flex gap-3">
        <button onclick="saveBeach(${index})" class="admin-btn admin-btn-success">Guardar</button>
        <button onclick="renderSection()" class="admin-btn bg-praia-sand-200 text-praia-sand-700">Cancelar</button>
      </div>
    </div>`;
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
    district: document.getElementById('b-district').value.trim(),
    region: document.getElementById('b-region').value,
    river: document.getElementById('b-river').value.trim(),
    coordinates: { lat: parseFloat(document.getElementById('b-lat').value) || 0, lng: parseFloat(document.getElementById('b-lng').value) || 0 },
    description: document.getElementById('b-description').value.trim(),
    photos: document.getElementById('b-photos').value.trim().split('\n').filter(Boolean),
    video360: null,
    services,
    waterQuality: document.getElementById('b-waterQuality').value,
    featured: document.getElementById('b-featured').checked,
    passportStamp: document.getElementById('b-passportStamp').checked,
  };

  if (index !== null) {
    state.data.beaches[index] = beach;
  } else {
    state.data.beaches.push(beach);
  }

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
            <img src="${a.image}" alt="" class="w-20 h-14 object-cover rounded-lg flex-shrink-0">
            <div class="flex-1 min-w-0">
              <h3 class="font-display text-sm font-bold text-praia-teal-800 truncate">${a.title}</h3>
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
    slug: '', title: '', excerpt: '', content: '', image: 'https://placehold.co/1200x600/003A40/FFEB3B?text=Artigo',
    date: new Date().toISOString().split('T')[0], category: 'roteiros', featured: false, status: 'draft'
  };

  const container = document.getElementById('admin-content');
  container.innerHTML = `
    <div class="p-6 max-w-3xl admin-form">
      <button onclick="renderSection()" class="text-praia-teal-600 text-sm font-semibold mb-4">&larr; Voltar</button>
      <h2 class="font-display text-xl font-bold text-praia-teal-800 mb-6">${index !== null ? 'Editar' : 'Novo'} Artigo</h2>
      <div class="mb-4"><label>Título</label><input type="text" id="a-title" value="${a.title}"></div>
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div><label>Slug</label><input type="text" id="a-slug" value="${a.slug}" placeholder="auto-gerado"></div>
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
      <div class="mb-4"><label>URL Imagem Capa</label><input type="url" id="a-image" value="${a.image}"></div>
      <div class="mb-4"><label>Excerto</label><textarea id="a-excerpt" rows="2">${a.excerpt}</textarea></div>
      <div class="mb-4"><label>Conteúdo (HTML)</label><textarea id="a-content" rows="10">${a.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea></div>
      <label class="flex items-center gap-2 cursor-pointer text-sm mb-6"><input type="checkbox" id="a-featured" ${a.featured ? 'checked' : ''}> Destaque na homepage</label>
      <div class="flex gap-3">
        <button onclick="saveArticle(${index})" class="admin-btn admin-btn-success">Guardar</button>
        <button onclick="renderSection()" class="admin-btn bg-praia-sand-200 text-praia-sand-700">Cancelar</button>
      </div>
    </div>`;
}

function saveArticle(index) {
  const title = document.getElementById('a-title').value.trim();
  if (!title) { toast('O título é obrigatório.', 'error'); return; }

  const article = {
    slug: document.getElementById('a-slug').value.trim() || slugify(title),
    title,
    excerpt: document.getElementById('a-excerpt').value.trim(),
    content: document.getElementById('a-content').value.replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
    image: document.getElementById('a-image').value.trim(),
    date: document.getElementById('a-date').value,
    category: document.getElementById('a-category').value,
    featured: document.getElementById('a-featured').checked,
    status: document.getElementById('a-status').value,
  };

  if (index !== null) state.data.articles[index] = article;
  else state.data.articles.push(article);

  toast('Artigo guardado!', 'success');
  renderSection();
}

// ─── Locations (shared for guia + passaporte) ───
function renderLocations(container, key, title) {
  const items = state.data[key] || [];
  container.innerHTML = `
    <div class="p-6">
      <div class="flex items-center justify-between mb-6">
        <h1 class="font-display text-2xl font-bold text-praia-teal-800">${title} (${items.length})</h1>
        <div class="flex gap-2">
          <button onclick="exportSection('${key}')" class="admin-btn admin-btn-export">Exportar</button>
          <button onclick="editLocation('${key}', null)" class="admin-btn admin-btn-primary">+ Adicionar</button>
        </div>
      </div>
      <div class="bg-white rounded-xl shadow-layered overflow-hidden">
        <table class="admin-table w-full text-sm">
          <thead><tr class="text-left">
            <th class="px-4 py-3 font-display text-xs uppercase tracking-wider text-praia-teal-700">Nome</th>
            <th class="px-4 py-3 font-display text-xs uppercase tracking-wider text-praia-teal-700">Concelho</th>
            <th class="px-4 py-3 font-display text-xs uppercase tracking-wider text-praia-teal-700">Distrito</th>
            <th class="px-4 py-3 font-display text-xs uppercase tracking-wider text-praia-teal-700 text-right">Ações</th>
          </tr></thead>
          <tbody>
            ${items.map((l, i) => `
              <tr class="border-t border-praia-sand-100 hover:bg-praia-sand-50">
                <td class="px-4 py-3 font-semibold text-praia-teal-800">${l.name}</td>
                <td class="px-4 py-3 text-praia-sand-600">${l.municipality}</td>
                <td class="px-4 py-3 text-praia-sand-600">${l.district}</td>
                <td class="px-4 py-3 text-right">
                  <button onclick="editLocation('${key}', ${i})" class="text-praia-teal-600 text-xs font-semibold mr-2">Editar</button>
                  <button onclick="deleteItem('${key}', ${i})" class="text-red-400 text-xs font-semibold">Eliminar</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function editLocation(key, index) {
  const l = index !== null ? state.data[key][index] : { name: '', municipality: '', district: '', address: '', phone: '', coordinates: { lat: 39.5, lng: -8.0 } };
  const container = document.getElementById('admin-content');
  container.innerHTML = `
    <div class="p-6 max-w-2xl admin-form">
      <button onclick="renderSection()" class="text-praia-teal-600 text-sm font-semibold mb-4">&larr; Voltar</button>
      <h2 class="font-display text-xl font-bold text-praia-teal-800 mb-6">${index !== null ? 'Editar' : 'Adicionar'} Local</h2>
      <div class="mb-4"><label>Nome</label><input type="text" id="l-name" value="${l.name}"></div>
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div><label>Concelho</label><input type="text" id="l-municipality" value="${l.municipality}"></div>
        <div><label>Distrito</label><input type="text" id="l-district" value="${l.district}"></div>
      </div>
      <div class="mb-4"><label>Morada</label><input type="text" id="l-address" value="${l.address || ''}"></div>
      <div class="mb-4"><label>Telefone</label><input type="text" id="l-phone" value="${l.phone || ''}"></div>
      <div class="grid grid-cols-2 gap-4 mb-6">
        <div><label>Latitude</label><input type="number" step="0.0001" id="l-lat" value="${l.coordinates.lat}"></div>
        <div><label>Longitude</label><input type="number" step="0.0001" id="l-lng" value="${l.coordinates.lng}"></div>
      </div>
      ${key === 'locations-passaporte' ? `<div class="mb-6"><label>Tipo</label><select id="l-type"><option value="carimbo" ${l.type==='carimbo'?'selected':''}>Carimbo</option><option value="venda_carimbo" ${l.type==='venda_carimbo'?'selected':''}>Venda + Carimbo</option></select></div>` : ''}
      <div class="flex gap-3">
        <button onclick="saveLocation('${key}', ${index})" class="admin-btn admin-btn-success">Guardar</button>
        <button onclick="renderSection()" class="admin-btn bg-praia-sand-200 text-praia-sand-700">Cancelar</button>
      </div>
    </div>`;
}

function saveLocation(key, index) {
  const loc = {
    name: document.getElementById('l-name').value.trim(),
    municipality: document.getElementById('l-municipality').value.trim(),
    district: document.getElementById('l-district').value.trim(),
    address: document.getElementById('l-address').value.trim(),
    phone: document.getElementById('l-phone').value.trim(),
    coordinates: { lat: parseFloat(document.getElementById('l-lat').value) || 0, lng: parseFloat(document.getElementById('l-lng').value) || 0 },
  };
  if (key === 'locations-passaporte') loc.type = document.getElementById('l-type')?.value || 'carimbo';
  if (index !== null) state.data[key][index] = loc;
  else state.data[key].push(loc);
  toast('Local guardado!', 'success');
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
              <h3 class="font-display text-sm font-bold text-praia-teal-800">${d.name}</h3>
              <p class="text-xs text-praia-sand-500">${d.description}</p>
            </div>
            <div class="flex gap-2">
              <button onclick="editDesconto(${i})" class="text-praia-teal-600 text-xs font-semibold">Editar</button>
              <button onclick="deleteItem('descontos', ${i})" class="text-red-400 text-xs font-semibold">Eliminar</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

function editDesconto(index) {
  const d = index !== null ? state.data.descontos[index] : { name: '', description: '', conditions: '', region: 'centro', category: 'alojamento', municipality: '' };
  const container = document.getElementById('admin-content');
  container.innerHTML = `
    <div class="p-6 max-w-2xl admin-form">
      <button onclick="renderSection()" class="text-praia-teal-600 text-sm font-semibold mb-4">&larr; Voltar</button>
      <h2 class="font-display text-xl font-bold text-praia-teal-800 mb-6">${index !== null ? 'Editar' : 'Adicionar'} Desconto</h2>
      <div class="mb-4"><label>Nome do Parceiro</label><input type="text" id="d-name" value="${d.name}"></div>
      <div class="mb-4"><label>Descrição do Desconto</label><textarea id="d-description" rows="2">${d.description}</textarea></div>
      <div class="mb-4"><label>Condições</label><textarea id="d-conditions" rows="2">${d.conditions}</textarea></div>
      <div class="grid grid-cols-3 gap-4 mb-6">
        <div><label>Região</label><select id="d-region"><option value="norte" ${d.region==='norte'?'selected':''}>Norte</option><option value="centro" ${d.region==='centro'?'selected':''}>Centro</option><option value="alentejo" ${d.region==='alentejo'?'selected':''}>Alentejo</option><option value="algarve" ${d.region==='algarve'?'selected':''}>Algarve</option></select></div>
        <div><label>Categoria</label><select id="d-category"><option value="alojamento" ${d.category==='alojamento'?'selected':''}>Alojamento</option><option value="restauracao" ${d.category==='restauracao'?'selected':''}>Restauração</option><option value="atividades" ${d.category==='atividades'?'selected':''}>Atividades</option><option value="comercio" ${d.category==='comercio'?'selected':''}>Comércio</option></select></div>
        <div><label>Concelho</label><input type="text" id="d-municipality" value="${d.municipality}"></div>
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
      <div class="mb-4"><label>Data Limite Votação</label><input type="datetime-local" id="s-deadline" value="${(s.votingDeadline || '').replace('T', 'T').slice(0, 16)}"></div>
      <div class="mb-4"><label>Ano Corrente</label><input type="number" id="s-year" value="${s.currentYear || 2026}"></div>
      <div class="mb-6"><label>Praias em Destaque (IDs, uma por linha)</label><textarea id="s-featured" rows="4">${(s.featuredBeaches || []).join('\n')}</textarea></div>
      <button onclick="saveSettings()" class="admin-btn admin-btn-success">Guardar Configurações</button>
      <button onclick="exportSection('settings')" class="admin-btn admin-btn-export ml-2">Exportar</button>
    </div>`;
}

function saveSettings() {
  state.data.settings = {
    ...state.data.settings,
    votingDeadline: document.getElementById('s-deadline').value + ':00',
    currentYear: parseInt(document.getElementById('s-year').value),
    featuredBeaches: document.getElementById('s-featured').value.trim().split('\n').filter(Boolean),
  };
  toast('Configurações guardadas!', 'success');
}

// ─── Shared Actions ───
function deleteItem(section, index) {
  if (!confirm('Tem a certeza que deseja eliminar?')) return;
  state.data[section].splice(index, 1);
  toast('Item eliminado.', 'success');
  renderSection();
}

function filterAdminTable(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('.admin-table-row').forEach(row => {
    row.style.display = row.dataset.search.includes(q) ? '' : 'none';
  });
}

// ─── Export / Import ───
function exportSection(section) {
  const data = state.data[section];
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${section}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`${section}.json exportado!`, 'success');
}

function exportAll() {
  SECTIONS.forEach(section => {
    setTimeout(() => exportSection(section), 200 * SECTIONS.indexOf(section));
  });
}

function importJSON() {
  document.getElementById('import-file')?.click();
}

function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
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
    } catch {
      toast('Erro ao ler o ficheiro JSON.', 'error');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ─── Toast ───
function toast(message, type = 'success') {
  const existing = document.querySelector('.admin-toast');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = `admin-toast ${type}`;
  el.textContent = message;
  document.body.appendChild(el);

  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 3000);
}

// ─── Init ───
document.addEventListener('DOMContentLoaded', () => {
  if (checkAuth()) initDashboard();
});
