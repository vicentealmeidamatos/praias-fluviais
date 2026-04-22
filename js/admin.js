// ─── Admin Panel — JSON Visual Editor ───
const _norm = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const SECTIONS = ['beaches', 'articles', 'locations-guia-passaporte', 'locations-carimbos', 'descontos', 'produtos', 'encomendas', 'utilizadores', 'comentarios', 'conteudo', 'settings'];

// ─── Auto-save: section → dataset name (Supabase via /api/save-data) ───
const SECTION_TO_DATASET = {
  'beaches':                    'beaches',
  'articles':                   'articles',
  'locations-guia-passaporte':  'locationsGuia',
  'locations-carimbos':         'locationsCarimbo',
  'descontos':                  'descontos',
  'produtos':                   'products',
  'settings':                   'settings',
  'conteudo':                   'content',
  'layout':                     'layout',
};

const _autoSave = {
  timers: Object.create(null),
  pending: new Set(),
  saving: new Set(),
  lastError: null,
};

function _autoSaveStatus(text, kind = 'info') {
  let el = document.getElementById('admin-autosave-status');
  if (!el) {
    el = document.createElement('div');
    el.id = 'admin-autosave-status';
    el.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:99999;padding:8px 14px;border-radius:10px;font:600 12px system-ui;box-shadow:0 6px 20px rgba(0,0,0,.18);transition:opacity .2s;';
    document.body.appendChild(el);
  }
  const colors = {
    info:    'background:#003A40;color:#fff;',
    saving:  'background:#0288D1;color:#fff;',
    saved:   'background:#43A047;color:#fff;',
    error:   'background:#C62828;color:#fff;',
  };
  el.style.cssText += colors[kind] || colors.info;
  el.textContent = text;
  el.style.opacity = '1';
  if (kind === 'saved') {
    setTimeout(() => { el.style.opacity = '0'; }, 1800);
  }
}

async function _autoSaveFlush(section) {
  const dataset = SECTION_TO_DATASET[section];
  if (!dataset) return;
  if (_autoSave.saving.has(section)) {
    // Already saving — re-mark to retry after current save finishes
    _autoSave.pending.add(section);
    return;
  }
  _autoSave.saving.add(section);
  _autoSave.pending.delete(section);
  _autoSaveStatus(`A guardar ${section}…`, 'saving');
  try {
    const data = state.data[section];
    if (typeof data === 'undefined') throw new Error('sem dados em memória');
    if (!window.DataLoader) throw new Error('data-loader não carregado');
    await window.DataLoader.saveDataset(dataset, data, { note: 'auto-save admin' });
    _autoSaveStatus(`✓ ${section} guardado`, 'saved');
    // Notificar listeners (vista Conteúdo, etc.) que o dataset mudou
    try { window.dispatchEvent(new CustomEvent('datasetChanged:' + dataset, { detail: { section, dataset, data } })); } catch {}
  } catch (e) {
    _autoSave.lastError = e;
    _autoSaveStatus(`✗ Erro a guardar ${section}: ${e.message}`, 'error');
    console.error('[autoSave]', section, e);
  } finally {
    _autoSave.saving.delete(section);
    if (_autoSave.pending.has(section)) {
      // Retry pending
      setTimeout(() => _autoSaveFlush(section), 200);
    }
  }
}

function markDirty(section) {
  if (!SECTION_TO_DATASET[section]) return;
  _autoSave.pending.add(section);
  _renderPublishBar();
}

function markClean(section) {
  _autoSave.pending.delete(section);
  _renderPublishBar();
}

// Botão "Gravar alterações" por secção — grava imediatamente no Supabase
// (sem precisar do botão global da publish bar nem de export manual).
function sectionHasRealChanges(section) {
  const dataKey = Object.keys(SECTION_TO_DATASET).includes(section) ? section : null;
  if (!dataKey) return false;
  const current = JSON.stringify(state.data[dataKey] ?? null);
  const original = state.serverSnapshot?.[dataKey] ?? 'null';
  return current !== original;
}

async function saveSectionNow(section) {
  if (!SECTION_TO_DATASET[section]) {
    toast('Secção desconhecida.', 'error'); return;
  }
  if (!sectionHasRealChanges(section)) {
    toast('Não existem alterações por gravar nesta secção.', 'info'); return;
  }
  if (!confirm('As alterações serão publicadas no site em produção. Deseja continuar?')) return;
  _autoSave.pending.add(section);
  _autoSave.lastError = null;
  await _autoSaveFlush(section);
  _renderPublishBar();
  if (_autoSave.lastError) {
    toast('Erro a gravar: ' + _autoSave.lastError.message, 'error');
  } else {
    // Atualizar snapshot após gravar com sucesso
    state.serverSnapshot[section] = JSON.stringify(state.data[section]);
    toast('Alterações gravadas e publicadas no site.', 'success');
  }
}

function _renderPublishBar() {
  // O aviso flutuante "X alterações por publicar" foi removido a pedido do
  // utilizador. As alterações pendentes são agora descartadas pelo botão
  // "Recarregar" no topo (discardAndReload). Mantemos este stub para que
  // chamadas existentes não falhem.
  const bar = document.getElementById('admin-publish-bar');
  if (bar) bar.remove();
}

// Recarregar APENAS o preview do Conteúdo — descarta as alterações não
// guardadas dessa sessão de edição visual sem mexer no resto do admin.
async function discardAndReload() {
  const hasPending = (_autoSave && _autoSave.pending && _autoSave.pending.size > 0) || (_content && _content.dirty);
  if (hasPending && !confirm('Recarregar o preview vai descartar todas as alterações não guardadas desta secção. Continuar?')) return;

  // 1) Limpar drafts em storage
  try {
    for (const ds of (_SNAPSHOT_DATASETS || [])) {
      localStorage.removeItem('_datasetDraft:' + ds);
      sessionStorage.removeItem('_datasetDraft:' + ds);
    }
    localStorage.removeItem('_contentDraft');
    sessionStorage.removeItem('_contentDraft');
  } catch {}

  // 2) Re-fetch fresh do servidor para os datasets editáveis e content
  try {
    const r = await fetch('data/content.json?_=' + Date.now(), { cache: 'no-store' });
    if (r.ok) {
      const fresh = await r.json();
      state.data['conteudo'] = fresh;
      state.editingContent = JSON.parse(JSON.stringify(fresh));
      _content.current = JSON.parse(JSON.stringify(fresh));
    }
  } catch {}
  if (window.DataLoader) {
    try { window.DataLoader.invalidate(); } catch {}
    try { state.data['layout'] = (await window.DataLoader.loadDataset('layout', { force: true })) || {}; } catch {}
    for (const ds of (_SNAPSHOT_DATASETS || [])) {
      try { state.data[ds] = (await window.DataLoader.loadDataset(ds, { force: true })) || state.data[ds]; } catch {}
    }
  }

  // 3) Reset histórico/dirty/pending
  _content.history = [];
  _content.redoStack = [];
  _autoSave.pending.clear();
  _contentSetBaseline();
  _clearUnsaved();

  // 4) Recarregar só o iframe (sem ?preview=draft já que acabámos de limpar)
  const iframe = document.getElementById('content-iframe');
  if (iframe) iframe.src = _contentIframeSrc();

  toast('Preview recarregado. Alterações não guardadas descartadas.', 'success');
}

async function publishPendingChanges() {
  if (_autoSave.pending.size === 0) return;
  const sections = Array.from(_autoSave.pending);
  const list = sections.map(s => `• ${s}`).join('\n');
  if (!confirm(`Vai publicar as seguintes alterações no site público:\n\n${list}\n\nConfirmar?`)) return;

  const bar = document.getElementById('admin-publish-bar');
  if (bar) bar.querySelector('button').disabled = true;

  let okCount = 0, failCount = 0;
  for (const section of sections) {
    try {
      await _autoSaveFlush(section);
      okCount++;
    } catch {
      failCount++;
    }
  }
  if (failCount === 0) {
    toast(`✓ ${okCount} alteraç${okCount === 1 ? 'ão' : 'ões'} publicada${okCount === 1 ? '' : 's'} no site`, 'success');
  } else {
    toast(`Publicadas ${okCount}; ${failCount} falharam`, 'error');
  }
  _renderPublishBar();
}

async function discardPendingChanges() {
  if (!confirm('Descartar todas as alterações por publicar?')) return;
  const sections = Array.from(_autoSave.pending);
  _autoSave.pending.clear();
  if (window.DataLoader) window.DataLoader.invalidate();

  // Re-fetch só dos datasets afectados, sem recarregar o painel inteiro
  const sectionToFile = {
    'beaches': 'data/beaches.json',
    'articles': 'data/articles.json',
    'locations-guia-passaporte': 'data/locations-guia-passaporte.json',
    'locations-carimbos': 'data/locations-carimbos.json',
    'descontos': 'data/descontos.json',
    'produtos': 'data/products.json',
    'settings': 'data/settings.json',
    'conteudo': 'data/content.json',
    'layout': null,
  };
  for (const section of sections) {
    const file = sectionToFile[section];
    if (file) {
      try {
        const r = await fetch(file + '?_=' + Date.now(), { cache: 'no-store' });
        if (r.ok) state.data[section] = await r.json();
      } catch {}
    } else if (section === 'layout' && window.DataLoader) {
      try { state.data['layout'] = (await window.DataLoader.loadDataset('layout', { force: true })) || {}; } catch {}
    }
    // Caso especial: conteudo também alimenta _content / state.editingContent
    if (section === 'conteudo') {
      state.editingContent = JSON.parse(JSON.stringify(state.data['conteudo'] || {}));
      _content.current = JSON.parse(JSON.stringify(state.editingContent));
      _content.history = [];
      _content.redoStack = [];
      _clearUnsaved();
    }
  }
  // Sempre que estamos no editor de Conteúdo, garantir que o estado em memória
  // do editor visual também é descartado (mesmo que 'conteudo' não estivesse
  // no autosave pending — texto/ícones só vivem em _content.current).
  if (state.currentSection === 'conteudo' || _content.dirty) {
    try {
      const r = await fetch('data/content.json?_=' + Date.now(), { cache: 'no-store' });
      if (r.ok) {
        const fresh = await r.json();
        state.data['conteudo'] = fresh;
        state.editingContent = JSON.parse(JSON.stringify(fresh));
        _content.current = JSON.parse(JSON.stringify(fresh));
      }
    } catch {}
    // Recarregar layout do servidor também
    try {
      if (window.DataLoader) state.data['layout'] = (await window.DataLoader.loadDataset('layout', { force: true })) || {};
    } catch {}
    _content.history = [];
    _content.redoStack = [];
    _contentSetBaseline();
    _clearUnsaved();
  }

  // Limpar drafts de datasets em storage
  try {
    for (const ds of (_SNAPSHOT_DATASETS || [])) {
      localStorage.removeItem('_datasetDraft:' + ds);
      sessionStorage.removeItem('_datasetDraft:' + ds);
    }
    localStorage.removeItem('_contentDraft');
    sessionStorage.removeItem('_contentDraft');
  } catch {}
  _contentSetBaseline();

  _renderPublishBar();

  // Re-render só a secção actual (sem location.reload). Se for Conteúdo,
  // recarregar o iframe para reflectir o estado restaurado.
  if (state.currentSection === 'conteudo') {
    _reloadContentIframe();
  } else {
    try { renderSection(); } catch {}
  }
  toast('Alterações descartadas.', 'success');
}

// Permite que outras vistas (Conteúdo) reescrevam um dataset e re-rendam tudo
function setDataset(section, data, { save = true } = {}) {
  state.data[section] = data;
  if (save) markDirty(section);
  // Re-render se a secção actual coincide
  if (state.currentSection === section) {
    try { renderSection(); } catch {}
  }
}

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
  editingPhotos: [],           // [{ src: string, name: string }]
  editingArticleImage: null,   // { src: string, name: string } | null
  editingProductImages: [],    // [{ src: string, name: string }]
  editingDescontoLogo: null,   // { src: string, name: string } | null
  editingContent: {},          // for content.json editor
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
  { key: 'accessible',  label: 'Acessibilidades' },
  { key: 'lifeguard',   label: 'Nadador-Salvador' },
  { key: 'bar',         label: 'Bar/Restaurante' },
  { key: 'picnicArea',  label: 'Parque de Merendas' },
  { key: 'petFriendly', label: 'Pet-friendly' },
  { key: 'playground',  label: 'Parque Infantil' },
  { key: 'boatRental',  label: 'Aluguer de Embarcações' },
  { key: 'camping',     label: 'Alojamento' },
  { key: 'wc',          label: 'Instal. Sanitárias' },
  { key: 'nacional2',   label: 'Estrada Nacional 2' },
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

function showLoadingScreen() {
  const app = document.getElementById('admin-app');
  if (!app) return;
  app.innerHTML = `
    <div id="admin-loader" style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#FAF8F5 0%,#F5F0E8 100%);z-index:9999;">
      <div style="text-align:center;animation:loaderFadeIn .4s ease;">
        <img src="brand_assets/logotipo.png" alt="Praias Fluviais" style="height:42px;margin:0 auto 28px;display:block;filter:brightness(0) saturate(100%) invert(14%) sepia(59%) saturate(2000%) hue-rotate(160deg);animation:loaderPulse 2s ease-in-out infinite;">
        <div style="position:relative;width:64px;height:64px;margin:0 auto 22px;">
          <svg viewBox="0 0 64 64" style="width:64px;height:64px;animation:loaderSpin 1.4s linear infinite;">
            <defs>
              <linearGradient id="lgrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#003A40"/>
                <stop offset="100%" stop-color="#0288D1"/>
              </linearGradient>
            </defs>
            <circle cx="32" cy="32" r="26" fill="none" stroke="#E2D9C6" stroke-width="5"/>
            <circle cx="32" cy="32" r="26" fill="none" stroke="url(#lgrad)" stroke-width="5" stroke-linecap="round" stroke-dasharray="60 200" />
          </svg>
        </div>
        <p style="font:700 14px 'Poppins',system-ui,sans-serif;color:#003A40;letter-spacing:.04em;margin:0 0 6px;">A carregar painel</p>
        <p id="admin-loader-msg" style="font:500 12px 'Open Sans',system-ui,sans-serif;color:#8A7D60;margin:0;min-height:18px;">A preparar o ambiente…</p>
      </div>
      <style>
        @keyframes loaderFadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
        @keyframes loaderPulse  { 0%,100% { opacity:1; } 50% { opacity:.55; } }
        @keyframes loaderSpin   { to { transform: rotate(360deg); } }
      </style>
    </div>`;
  // Mensagens cíclicas para sensação de progresso
  const msgs = [
    'A preparar o ambiente…',
    'A obter conteúdos do site…',
    'A sincronizar com a base de dados…',
    'A carregar praias e artigos…',
    'A organizar produtos e descontos…',
    'Quase pronto…',
  ];
  let i = 0;
  const el = document.getElementById('admin-loader-msg');
  const it = setInterval(() => {
    i = (i + 1) % msgs.length;
    if (el) {
      el.style.opacity = '0';
      setTimeout(() => { el.textContent = msgs[i]; el.style.opacity = '1'; }, 150);
    }
    if (!document.getElementById('admin-loader')) clearInterval(it);
  }, 1100);
}

async function simpleHash(str) {
  const data = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_LOCK_KEY = 'admin_login_lock';

function _getLoginAttempts() {
  return parseInt(localStorage.getItem('admin_login_attempts') || '0', 10);
}
function _setLoginAttempts(n) {
  localStorage.setItem('admin_login_attempts', String(n));
}
function _isLocked() {
  const until = parseInt(localStorage.getItem(LOGIN_LOCK_KEY) || '0', 10);
  return until && Date.now() < until;
}
function _lockMinutesLeft() {
  const until = parseInt(localStorage.getItem(LOGIN_LOCK_KEY) || '0', 10);
  return Math.ceil((until - Date.now()) / 60000);
}

async function loginAdmin() {
  if (_isLocked()) {
    const errEl = document.getElementById('login-error');
    if (errEl) {
      errEl.textContent = `Demasiadas tentativas. Tente novamente daqui a ${_lockMinutesLeft()} minuto(s).`;
      errEl.classList.remove('hidden');
    }
    return;
  }
  const pass = document.getElementById('login-pass').value;
  const inputHash   = await simpleHash(pass);
  const correctHash = await simpleHash('Johnny Bravo');
  if (inputHash === correctHash) {
    _setLoginAttempts(0);
    localStorage.removeItem(LOGIN_LOCK_KEY);
    sessionStorage.setItem('admin_authenticated', 'true');
    showLoadingScreen();
    initDashboard();
  } else {
    const attempts = _getLoginAttempts() + 1;
    _setLoginAttempts(attempts);
    const remaining = LOGIN_MAX_ATTEMPTS - attempts;
    const errEl = document.getElementById('login-error');
    if (errEl) {
      if (remaining <= 0) {
        // Bloquear por 15 minutos
        localStorage.setItem(LOGIN_LOCK_KEY, String(Date.now() + 15 * 60 * 1000));
        errEl.textContent = 'Limite de tentativas excedido. Bloqueado por 15 minutos.';
      } else {
        errEl.textContent = `Password incorreta. ${remaining} tentativa(s) restante(s).`;
      }
      errEl.classList.remove('hidden');
      errEl.style.animation = 'none';
      void errEl.offsetWidth;
      errEl.style.animation = 'shake 0.4s ease';
    }
  }
}

// ─── Dashboard ───
async function initDashboard() {
  const jsonSections = SECTIONS.filter(s => !['utilizadores','comentarios','encomendas','produtos','conteudo'].includes(s));
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
  // Content: load from data/content.json
  try {
    const res = await fetch('data/content.json');
    state.data['conteudo'] = await res.json();
    state.editingContent = JSON.parse(JSON.stringify(state.data['conteudo']));
  } catch {
    state.data['conteudo'] = {};
    state.editingContent = {};
  }
  // Layout overrides (carregado de Supabase via fetch interceptor que cai para vazio se não existir)
  try {
    if (window.DataLoader) state.data['layout'] = await window.DataLoader.loadDataset('layout') || {};
    else state.data['layout'] = {};
  } catch { state.data['layout'] = {}; }
  // Encomendas: loaded lazily from Supabase when tab is opened
  state.data['encomendas'] = null;
  state.data['utilizadores'] = null;
  state.data['comentarios'] = null;
  // Snapshot dos dados originais do servidor para detetar alterações reais
  state.serverSnapshot = {};
  for (const key of Object.keys(state.data)) {
    if (state.data[key] != null) state.serverSnapshot[key] = JSON.stringify(state.data[key]);
  }
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
    produtos:              { icon: '🛍️', label: 'Loja · Produtos' },
    encomendas:            { icon: '📦', label: 'Loja · Encomendas' },
    utilizadores:          { icon: '👥', label: 'Dados' },
    comentarios:           { icon: '💬', label: 'Comentários' },
    conteudo:              { icon: '✏️', label: 'Editor Visual' },
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
  state.editingThumbnail = '';
  state.editingArticleImage = null;
  state.editingProductImages = [];
  state.editingDescontoLogo = null;
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
    case 'conteudo':               renderConteudo(content); break;
    case 'settings':               renderSettings(content); break;
    case 'produtos':               renderProdutos(content); break;
    case 'encomendas':             renderEncomendas(content); break;
    case 'utilizadores':           renderUtilizadores(content); break;
    case 'comentarios':            renderComentarios(content); break;
  }
}

// ─── Image Upload ───
// Compress/resize image client-side before upload (max 1200px, JPEG 80%)
function compressImage(file, maxW = 1200, quality = 0.8) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => {
        resolve(blob || file);
      }, 'image/jpeg', quality);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

async function uploadImageFile(file, folder = 'misc') {
  const compressed = await compressImage(file);
  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', 'X-Filename': file.name.replace(/\.\w+$/, '.jpg'), 'X-Folder': folder },
      body: compressed,
    });
    if (!res.ok) throw new Error('Servidor não disponível');
    const json = await res.json();
    return { src: json.path, name: json.name };
  } catch {
    // Fallback: base64 data URL (works without server endpoint)
    const src = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.readAsDataURL(compressed);
    });
    return { src, name: file.name };
  }
}

// ─── Quill WYSIWYG Helpers ───
const _quillInstances = {};

function initQuillEditor(elementId, existingHtml = '', opts = {}) {
  if (_quillInstances[elementId]) {
    try { _quillInstances[elementId] = null; } catch(e) {}
  }
  const el = document.getElementById(elementId);
  if (!el) return null;
  const toolbar = opts.minimal
    ? [['bold', 'italic'], ['link'], [{ list: 'ordered' }, { list: 'bullet' }]]
    : [[{ header: [2, 3, false] }], ['bold', 'italic', 'underline'],
       [{ list: 'ordered' }, { list: 'bullet' }], ['link', 'blockquote'], ['clean']];
  try {
    const q = new Quill(`#${elementId}`, { theme: 'snow', modules: { toolbar } });
    if (existingHtml) {
      const delta = q.clipboard.convert({ html: existingHtml });
      q.setContents(delta, 'silent');
    }
    _quillInstances[elementId] = q;
    return q;
  } catch(e) {
    console.warn('[Quill]', e);
    return null;
  }
}

function getQuillHTML(elementId) {
  const q = _quillInstances[elementId];
  if (!q) return '';
  return q.getSemanticHTML() || '';
}

// ─── Geocodificação (Nominatim / OpenStreetMap) ───
async function geocodeAddress(address) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=pt`;
  const res = await fetch(url, {
    headers: { 'Accept-Language': 'pt', 'User-Agent': 'GuiaPraiasFluviais/1.0' }
  });
  const results = await res.json();
  if (!results.length) throw new Error('Endereço não encontrado em Portugal');
  return {
    lat: parseFloat(results[0].lat),
    lng: parseFloat(results[0].lon),
    display: results[0].display_name
  };
}

async function geocodeCurrentLocation(latFieldId, lngFieldId, addressFieldId, btnEl) {
  const address = document.getElementById(addressFieldId)?.value.trim();
  if (!address) { toast('Introduza uma morada primeiro.', 'error'); return; }
  const btn = btnEl || document.querySelector('[data-geocode-btn]');
  const origText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'A localizar…'; }
  try {
    const { lat, lng, display } = await geocodeAddress(address);
    const latEl = document.getElementById(latFieldId);
    const lngEl = document.getElementById(lngFieldId);
    if (latEl) latEl.value = lat.toFixed(6);
    if (lngEl) lngEl.value = lng.toFixed(6);
    toast(`Localizado: ${display.split(',').slice(0, 3).join(', ')}`, 'success');
  } catch(e) {
    toast(e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = origText; }
  }
}

// ─── Drag-and-drop reorder helper ───
function makeDraggableList(containerId, onReorder) {
  const container = document.getElementById(containerId);
  if (!container) return;
  let dragging = null;
  container.addEventListener('dragstart', e => {
    dragging = e.target.closest('[draggable="true"]');
    if (dragging) dragging.classList.add('opacity-50');
  });
  container.addEventListener('dragend', () => {
    if (dragging) dragging.classList.remove('opacity-50');
    dragging = null;
  });
  container.addEventListener('dragover', e => {
    e.preventDefault();
    const over = e.target.closest('[draggable="true"]');
    if (over && over !== dragging && dragging) {
      const rect = over.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      over.parentNode.insertBefore(dragging, e.clientY < mid ? over : over.nextSibling);
    }
    if (over) over.classList.add('drag-over');
  });
  container.addEventListener('dragleave', e => {
    const over = e.target.closest('[draggable="true"]');
    if (over) over.classList.remove('drag-over');
  });
  container.addEventListener('drop', e => {
    e.preventDefault();
    const over = e.target.closest('[draggable="true"]');
    if (over) over.classList.remove('drag-over');
    const ids = [...container.querySelectorAll('[draggable="true"]')].map(el => el.dataset.id);
    onReorder(ids);
  });
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
    <div class="photo-thumb-item draggable-item" draggable="true" data-id="${i}" style="position:relative;display:inline-block;margin:0 8px 8px 0;vertical-align:top;">
      <img src="${p.src}" alt="Foto ${i+1}" style="width:100px;height:75px;object-fit:cover;border-radius:8px;border:2px solid #E2D9C6;display:block;">
      <button onclick="removeBeachPhoto(${i})" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#D32F2F;color:white;border:none;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;font-weight:bold;">×</button>
      <div style="display:flex;gap:2px;justify-content:center;margin-top:4px;">
        ${i > 0 ? `<button onclick="moveBeachPhoto(${i},-1)" style="background:#E2D9C6;border:none;border-radius:4px;padding:1px 5px;font-size:11px;cursor:pointer;" title="Mover para esquerda">←</button>` : '<span style="width:22px;"></span>'}
        ${i < state.editingPhotos.length-1 ? `<button onclick="moveBeachPhoto(${i},1)" style="background:#E2D9C6;border:none;border-radius:4px;padding:1px 5px;font-size:11px;cursor:pointer;" title="Mover para direita">→</button>` : '<span style="width:22px;"></span>'}
      </div>
      <div style="font-size:9px;color:#8A7D60;text-align:center;margin-top:2px;max-width:100px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${p.name || ''}</div>
    </div>
  `).join('');
}

function moveBeachPhoto(i, dir) {
  const arr = state.editingPhotos;
  const n = i + dir;
  if (n < 0 || n >= arr.length) return;
  [arr[i], arr[n]] = [arr[n], arr[i]];
  renderPhotoGallery();
}

function removeBeachPhoto(index) {
  state.editingPhotos.splice(index, 1);
  renderPhotoGallery();
}

async function handleBeachPhotoFiles(files) {
  const uploadBtn = document.getElementById('photo-upload-btn');
  const fileList = Array.from(files).filter(f => f.type.startsWith('image/'));
  if (!fileList.length) return;

  if (uploadBtn) { uploadBtn.disabled = true; uploadBtn.textContent = 'A carregar...'; }

  for (const file of fileList) {
    const result = await uploadImageFile(file, 'beaches');
    state.editingPhotos.push(result);
  }

  if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.textContent = '+ Adicionar Fotos'; }
  renderPhotoGallery();
  toast(`${fileList.length} foto(s) adicionada(s).`, 'success');
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

// ─── Thumbnail Upload ───
function renderThumbnailPreview() {
  const container = document.getElementById('thumbnail-preview');
  if (!container) return;
  if (!state.editingThumbnail) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = `
    <div style="position:relative;display:inline-block;">
      <img src="${state.editingThumbnail}" style="max-height:80px;border-radius:8px;border:1px solid #E8DFD0;display:block;">
      <button onclick="removeThumbnail()" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#D32F2F;color:white;border:none;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;font-weight:bold;">×</button>
    </div>`;
}

function removeThumbnail() {
  state.editingThumbnail = '';
  renderThumbnailPreview();
}

async function handleThumbnailFile(files) {
  const file = Array.from(files).find(f => f.type.startsWith('image/'));
  if (!file) return;
  if (state.editingThumbnail) {
    if (!confirm('Esta secção apenas permite uma imagem. Deseja substituir a miniatura atual?')) return;
  }
  const result = await uploadImageFile(file, 'beaches');
  state.editingThumbnail = result.src;
  renderThumbnailPreview();
}

function setupThumbDragDrop() {
  const zone = document.getElementById('thumb-drop-zone');
  const input = document.getElementById('thumb-file-input');
  if (!zone || !input) return;

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = '#003A40'; zone.style.background = '#EEF5F5'; });
  zone.addEventListener('dragleave', () => { zone.style.borderColor = '#C4B898'; zone.style.background = '#FAF8F5'; });
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.style.borderColor = '#C4B898'; zone.style.background = '#FAF8F5';
    if (e.dataTransfer.files.length) handleThumbnailFile(e.dataTransfer.files);
  });
  input.addEventListener('change', e => { if (e.target.files.length) handleThumbnailFile(e.target.files); e.target.value = ''; });
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
  const result = await uploadImageFile(file, 'articles');
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
          <p class="text-sm text-praia-sand-500">${beaches.length} praias registadas${beaches.filter(b => b.hidden).length ? ` · <span style="color:#C62828;font-weight:600;">${beaches.filter(b => b.hidden).length} oculta(s)</span>` : ''}</p>
        </div>
        <div class="flex gap-2">
          <button onclick="downloadAllBeachQRsZip()" class="admin-btn admin-btn-secondary" title="Baixar todos os QR codes das praias num único ficheiro ZIP">QR codes (ZIP)</button>
          <button onclick="saveSectionNow('beaches')" class="admin-btn admin-btn-export">Gravar alterações</button>
          <button onclick="editBeach(null)" class="admin-btn admin-btn-primary">+ Adicionar Praia</button>
        </div>
      </div>
      <div class="bg-white rounded-xl shadow-layered overflow-hidden">
        <div class="p-4 border-b border-praia-sand-100 flex gap-3 items-center">
          <input type="text" placeholder="Pesquisar praias..." oninput="filterAdminTable(this.value)" class="flex-1 px-4 py-2 rounded-lg bg-praia-sand-50 border border-praia-sand-200 text-sm">
          <select id="beaches-visibility-filter" onchange="filterAdminTable(document.querySelector('input[placeholder*=Pesquisar]').value)" style="padding:6px 10px;border-radius:8px;border:1px solid #E2D9C6;background:#FAF8F5;font-size:13px;font-weight:600;color:#003A40;cursor:pointer;">
            <option value="all">Todas</option>
            <option value="visible">Visíveis</option>
            <option value="hidden">Ocultas</option>
          </select>
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
                const activeServices = ALL_SERVICES.filter(s => b.services?.[s.key]).map(s => s.label).join(', ') || '-';
                return `
                <tr class="border-t border-praia-sand-100 hover:bg-praia-sand-50 admin-table-row${b.hidden ? ' opacity-50' : ''}" data-search="${_norm(b.name + ' ' + b.municipality + ' ' + (b.freguesia||'') + ' ' + (b.district||''))}" data-hidden="${b.hidden ? '1' : '0'}" style="${b.hidden ? 'background:repeating-linear-gradient(135deg,transparent,transparent 10px,rgba(0,0,0,.02) 10px,rgba(0,0,0,.02) 20px);' : ''}">
                  <td class="px-4 py-3 font-semibold text-praia-teal-800" style="display:flex;align-items:center;gap:8px;">
                    ${b.hidden ? '<span style="display:inline-flex;align-items:center;padding:1px 6px;border-radius:6px;font-size:9px;font-weight:700;background:#f1f1f1;color:#999;border:1px solid #ddd;margin-right:2px;">OCULTO</span>' : ''}
                    ${b.thumbnail ? `<img src="${escHtml(b.thumbnail)}" style="width:36px;height:24px;object-fit:cover;border-radius:4px;flex-shrink:0;">` : ''}
                    ${b.name}
                  </td>
                  <td class="px-4 py-3 text-praia-sand-600">${b.municipality}</td>
                  <td class="px-4 py-3 text-praia-sand-600">${b.district || '-'}</td>
                  <td class="px-4 py-3">
                    <span class="badge" style="background:${isBalnear ? 'rgba(2,136,209,0.1)' : 'rgba(67,160,71,0.1)'};color:${isBalnear ? '#0288D1' : '#43A047'};">
                      ${isBalnear ? 'Balnear' : 'Fluvial'}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-praia-sand-500 text-xs" style="max-width:200px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${activeServices}</td>
                  <td class="px-4 py-3 text-right">
                    ${b.id ? `<button onclick="downloadBeachQR(${i})" class="text-praia-yellow-600 hover:text-praia-yellow-700 text-xs font-semibold mr-2" title="Baixar QR code para carimbar esta praia">QR</button>` : ''}
                    <button onclick="toggleItemVisibility('beaches', ${i})" class="text-praia-sand-400 hover:text-praia-sand-600 text-xs font-semibold mr-2" title="${b.hidden ? 'Tornar visível' : 'Ocultar do site'}">${b.hidden ? 'Mostrar' : 'Ocultar'}</button>
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
    thumbnail: '',
    photos: [],
    video360: null,
    services: { ...DEFAULT_SERVICES },
    waterQuality: 'boa', featured: false, passportStamp: true
  };

  // Merge any missing service keys
  const services = { ...DEFAULT_SERVICES, ...(b.services || {}) };

  // Load photos and thumbnail into state
  state.editingPhotos = (b.photos || []).map(src => ({ src, name: '' }));
  state.editingThumbnail = b.thumbnail || '';

  const districtOptions = DISTRICTS.map(d =>
    `<option value="${d}" ${b.district === d ? 'selected' : ''}>${d}</option>`
  ).join('');

  const allServices = ALL_SERVICES;

  const container = document.getElementById('admin-content');
  container.innerHTML = `
    <div class="p-6 max-w-3xl admin-form">
      <button onclick="renderSection()" class="text-praia-teal-600 text-sm font-semibold mb-4 flex items-center gap-1">← Voltar à lista</button>
      <h2 class="font-display text-xl font-bold text-praia-teal-800 mb-6">${index !== null ? 'Editar' : 'Adicionar'} Praia</h2>

      <!-- Identificação -->
      <div class="bg-white rounded-xl p-5 mb-4 shadow-sm border border-praia-sand-100">
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-4">Identificação</h3>
        <div class="mb-4">
          <div><label>Nome</label><input type="text" id="b-name" value="${escHtml(b.name)}"></div>
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
              <option value="">- selecionar -</option>
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
        <div id="b-description-editor" style="min-height:100px;"></div>
      </div>

      <!-- Miniatura (Thumbnail) -->
      <div class="bg-white rounded-xl p-5 mb-4 shadow-sm border border-praia-sand-100">
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-3">Miniatura</h3>
        <p style="font-size:12px;color:#A89A78;margin-bottom:8px;">Imagem pequena usada nas listagens, mapa e votação. Separada da galeria de fotos.</p>
        <div id="thumbnail-preview" style="margin-bottom:8px;"></div>
        <div id="thumb-drop-zone" style="border:2px dashed #C4B898;border-radius:12px;padding:16px;text-align:center;cursor:pointer;transition:all 0.2s;background:#FAF8F5;" onclick="document.getElementById('thumb-file-input').click()">
          <div style="font-family:'Poppins',sans-serif;font-size:13px;color:#8A7D60;font-weight:600;">Arraste a miniatura aqui</div>
          <div style="font-size:12px;color:#C4B898;margin-top:4px;">ou clique para selecionar do disco</div>
          <div style="font-size:11px;color:#C4B898;margin-top:4px;">JPG, PNG, WEBP</div>
        </div>
        <input type="file" id="thumb-file-input" accept="image/*" style="display:none;">
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
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-3">Serviços</h3>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          ${allServices.map(s => `
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
          <label class="flex items-center gap-2 cursor-pointer text-sm" title="Marca se esta praia aparece no passaporte impresso do guia. No passaporte digital, todas as praias visíveis aparecem sempre.">
            <input type="checkbox" id="b-passportStamp" ${b.passportStamp ? 'checked' : ''} style="accent-color:#003A40;">
            No passaporte impresso
          </label>
        </div>
      </div>

      <div class="flex gap-3 pb-8">
        <button onclick="saveBeach(${index})" class="admin-btn admin-btn-success">Guardar Alterações</button>
        <button onclick="cancelBeachEdit()" class="admin-btn bg-praia-sand-200 text-praia-sand-700">Cancelar</button>
        ${index !== null ? `<button onclick="deleteItem('beaches', ${index}); renderSection();" class="admin-btn admin-btn-danger ml-auto">Eliminar</button>` : ''}
      </div>
    </div>`;

  renderPhotoGallery();
  renderThumbnailPreview();
  setupPhotoDragDrop('photo-drop-zone', 'photo-file-input');
  setupThumbDragDrop();
  setTimeout(() => {
    initQuillEditor('b-description-editor', b.description || '', { minimal: true });
    state.beachFormSnapshot = getBeachFormSnapshot();
  }, 50);

  // Drop zone hover style
  const zone = document.getElementById('photo-drop-zone');
  if (zone) {
    zone.addEventListener('dragover', () => { zone.style.borderColor = '#003A40'; zone.style.background = '#EEF5F5'; });
    zone.addEventListener('dragleave', () => { zone.style.borderColor = '#C4B898'; zone.style.background = '#FAF8F5'; });
    zone.addEventListener('drop', () => { zone.style.borderColor = '#C4B898'; zone.style.background = '#FAF8F5'; });
  }
}

function getBeachFormSnapshot() {
  const inputIds = ['b-name', 'b-id', 'b-municipality', 'b-freguesia', 'b-district', 'b-type', 'b-river', 'b-waterQuality', 'b-lat', 'b-lng'];
  const values = inputIds.map(id => document.getElementById(id)?.value || '');
  const checks = [document.getElementById('b-featured')?.checked, document.getElementById('b-passportStamp')?.checked];
  const services = [];
  document.querySelectorAll('.b-service').forEach(cb => services.push(cb.checked));
  return JSON.stringify({ values, checks, services, thumb: state.editingThumbnail || '', photos: state.editingPhotos.map(p => p.src), desc: getQuillHTML('b-description-editor') || '' });
}

function hasBeachChanges() {
  if (!state.beachFormSnapshot) return false;
  return getBeachFormSnapshot() !== state.beachFormSnapshot;
}

function cancelBeachEdit() {
  if (hasBeachChanges()) {
    if (!confirm('Existem alterações por guardar. Deseja sair sem guardar?')) return;
  }
  renderSection();
}

function saveBeach(index) {
  const name = document.getElementById('b-name').value.trim();
  if (!name) { toast('O nome é obrigatório.', 'error'); return; }

  const services = {};
  document.querySelectorAll('.b-service').forEach(cb => { services[cb.dataset.key] = cb.checked; });

  const type = document.getElementById('b-type').value;
  const existingId = index !== null ? state.data.beaches[index].id : null;
  const beach = {
    id: existingId || generateBeachId(type, name),
    type,
    name,
    municipality: document.getElementById('b-municipality').value.trim(),
    freguesia: document.getElementById('b-freguesia').value.trim(),
    district: document.getElementById('b-district').value,
    river: document.getElementById('b-river').value.trim(),
    coordinates: {
      lat: parseFloat(document.getElementById('b-lat').value) || 0,
      lng: parseFloat(document.getElementById('b-lng').value) || 0,
    },
    description: getQuillHTML('b-description-editor') || '',
    thumbnail: state.editingThumbnail || '',
    photos: state.editingPhotos.map(p => p.src),
    video360: null,
    services,
    waterQuality: document.getElementById('b-waterQuality').value,
    featured: document.getElementById('b-featured').checked,
    passportStamp: document.getElementById('b-passportStamp').checked,
  };

  if (index !== null) state.data.beaches[index] = beach;
  else state.data.beaches.push(beach);

  // Sincronizar com settings.featuredBeaches
  syncBeachFeatured(beach.id, beach.featured);

  state.editingPhotos = [];
  state.editingThumbnail = '';
  markDirty('beaches');
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
          <button onclick="saveSectionNow('articles')" class="admin-btn admin-btn-export">Gravar alterações</button>
          <button onclick="editArticle(null)" class="admin-btn admin-btn-primary">+ Novo Artigo</button>
        </div>
      </div>
      <div class="grid gap-4">
        ${articles.map((a, i) => `
          <div class="bg-white rounded-xl shadow-layered p-4 flex items-center gap-4${a.hidden ? ' opacity-50' : ''}" style="${a.hidden ? 'background:repeating-linear-gradient(135deg,transparent,transparent 10px,rgba(0,0,0,.02) 10px,rgba(0,0,0,.02) 20px);' : ''}">
            ${a.hidden ? '<span style="display:inline-flex;align-items:center;padding:1px 6px;border-radius:6px;font-size:9px;font-weight:700;background:#f1f1f1;color:#999;border:1px solid #ddd;flex-shrink:0;">OCULTO</span>' : ''}
            <img src="${a.image}" alt="" class="w-20 h-14 object-cover rounded-lg flex-shrink-0" onerror="this.style.display='none'">
            <div class="flex-1 min-w-0">
              <h3 class="font-display text-sm font-bold text-praia-teal-800 truncate">${escHtml(a.title)}</h3>
              <p class="text-xs text-praia-sand-500">${a.date} · ${a.category} · ${a.status}</p>
            </div>
            <div class="flex gap-2 flex-shrink-0">
              <button onclick="toggleItemVisibility('articles', ${i})" class="text-praia-sand-400 hover:text-praia-sand-600 text-xs font-semibold" title="${a.hidden ? 'Tornar visível' : 'Ocultar do site'}">${a.hidden ? 'Mostrar' : 'Ocultar'}</button>
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
        <div class="mb-2"><label>Conteúdo do Artigo</label><div id="a-content-editor" style="min-height:240px;"></div></div>
      </div>

      <div class="bg-white rounded-xl p-5 mb-4 shadow-sm border border-praia-sand-100">
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-3">Imagem de Capa</h3>
        <div id="article-img-preview"></div>
        <div id="article-img-drop" style="margin-top:10px;border:2px dashed #C4B898;border-radius:12px;padding:16px;text-align:center;cursor:pointer;transition:all 0.2s;background:#FAF8F5;" onclick="document.getElementById('article-img-file').click()">
          <div style="font-family:'Poppins',sans-serif;font-size:12px;color:#8A7D60;font-weight:600;">Arraste ou clique para carregar imagem de capa</div>
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
  setTimeout(() => initQuillEditor('a-content-editor', a.content || ''), 0);
  // Setup article image drop zone
  setTimeout(() => {
    const dz = document.getElementById('article-img-drop');
    if (dz) {
      dz.addEventListener('dragover', e => { e.preventDefault(); dz.style.borderColor = '#003A40'; dz.style.background = '#EEF5F5'; });
      dz.addEventListener('dragleave', () => { dz.style.borderColor = '#C4B898'; dz.style.background = '#FAF8F5'; });
      dz.addEventListener('drop', e => { e.preventDefault(); dz.style.borderColor = '#C4B898'; dz.style.background = '#FAF8F5'; if (e.dataTransfer.files[0]) handleArticleImageFile(e.dataTransfer.files[0]); });
    }
  }, 0);
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
    content: getQuillHTML('a-content-editor') || '',
    image: state.editingArticleImage?.src || '',
    date: document.getElementById('a-date').value,
    category: document.getElementById('a-category').value,
    featured: document.getElementById('a-featured').checked,
    status: document.getElementById('a-status').value,
  };

  if (index !== null) state.data.articles[index] = article;
  else state.data.articles.push(article);

  // Sincronizar com settings.featuredArticles
  syncArticleFeatured(article.slug, article.featured);

  state.editingArticleImage = null;
  markDirty('articles');
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
        <h1 class="font-display text-2xl font-bold text-praia-teal-800">Pontos: Guia &amp; Passaporte (${items.length})</h1>
        <div class="flex gap-2">
          <a href="../onde-encontrar.html" target="_blank" class="admin-btn bg-praia-sand-200 text-praia-teal-700 text-xs">Ver no site ↗</a>
          <button onclick="saveSectionNow('locations-guia-passaporte')" class="admin-btn admin-btn-export">Gravar alterações</button>
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
              <tr class="border-t border-praia-sand-100 hover:bg-praia-sand-50${l.hidden ? ' opacity-50' : ''}" data-name="${escHtml(_norm(l.name))}" data-municipality="${escHtml(_norm(l.municipality))}" data-type="${l.type}" style="${l.hidden ? 'background:repeating-linear-gradient(135deg,transparent,transparent 10px,rgba(0,0,0,.02) 10px,rgba(0,0,0,.02) 20px);' : ''}">
                <td class="px-4 py-3 font-semibold text-praia-teal-800">${l.hidden ? '<span style="display:inline-flex;align-items:center;padding:1px 6px;border-radius:6px;font-size:9px;font-weight:700;background:#f1f1f1;color:#999;border:1px solid #ddd;margin-right:4px;">OCULTO</span>' : ''}${escHtml(l.name)}</td>
                <td class="px-4 py-3 text-praia-sand-600">${escHtml(l.municipality)}</td>
                <td class="px-4 py-3">${badge}</td>
                <td class="px-4 py-3 text-xs">${l.seasonal ? '<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold text-[10px] border border-amber-300">Só época</span>' : '<span class="text-praia-sand-300">Todo o ano</span>'}</td>
                <td class="px-4 py-3 text-right">
                  <button onclick="toggleItemVisibility('locations-guia-passaporte', ${i})" class="text-praia-sand-400 hover:text-praia-sand-600 text-xs font-semibold mr-2" title="${l.hidden ? 'Tornar visível' : 'Ocultar do site'}">${l.hidden ? 'Mostrar' : 'Ocultar'}</button>
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
  const q     = _norm(document.getElementById('guia-search')?.value || '');
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
      <h2 class="font-display text-xl font-bold text-praia-teal-800 mb-6">${index !== null ? 'Editar' : 'Adicionar'} Ponto: Guia &amp; Passaporte</h2>
      <div class="bg-white rounded-xl p-5 mb-4 shadow-sm border border-praia-sand-100 admin-form">
        <div class="mb-4"><label>Nome</label><input type="text" id="l-name" value="${escHtml(l.name)}"></div>
        <div class="mb-4"><label>Concelho</label><input type="text" id="l-municipality" value="${escHtml(l.municipality)}"></div>
        <div class="mb-4">
          <label>Morada</label>
          <div style="display:flex;gap:8px;align-items:flex-end;">
            <input type="text" id="l-address" value="${escHtml(l.address || '')}" style="flex:1;">
            <button onclick="geocodeCurrentLocation('l-lat','l-lng','l-address',this)" style="white-space:nowrap;flex-shrink:0;" class="admin-btn admin-btn-secondary">📍 Localizar</button>
          </div>
        </div>
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
        <p class="text-xs text-praia-sand-400">Escreva a morada e clique em "📍 Localizar" para preencher as coordenadas automaticamente.</p>
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
  markDirty('locations-guia-passaporte');
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
          <button onclick="saveSectionNow('locations-carimbos')" class="admin-btn admin-btn-export">Gravar alterações</button>
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
              const beachesStr = _norm((l.beaches || []).join(' '));
              return `
              <tr class="border-t border-praia-sand-100 hover:bg-praia-sand-50${l.hidden ? ' opacity-50' : ''}"
                data-name="${escHtml(_norm(l.name))}"
                data-municipality="${escHtml(_norm(l.municipality))}"
                data-beaches="${escHtml(beachesStr)}"
                style="${l.hidden ? 'background:repeating-linear-gradient(135deg,transparent,transparent 10px,rgba(0,0,0,.02) 10px,rgba(0,0,0,.02) 20px);' : ''}">
                <td class="px-4 py-3 font-semibold text-praia-teal-800">${l.hidden ? '<span style="display:inline-flex;align-items:center;padding:1px 6px;border-radius:6px;font-size:9px;font-weight:700;background:#f1f1f1;color:#999;border:1px solid #ddd;margin-right:4px;">OCULTO</span>' : ''}${escHtml(l.name)}</td>
                <td class="px-4 py-3 text-praia-sand-600">${escHtml(l.municipality)}</td>
                <td class="px-4 py-3 text-praia-sand-500 text-xs">${(l.beaches || []).length > 0 ? `${(l.beaches||[]).length} praia${(l.beaches||[]).length > 1 ? 's' : ''}` : '<span class="text-praia-sand-300">-</span>'}</td>
                <td class="px-4 py-3 text-xs">${l.seasonal ? '<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold text-[10px] border border-amber-300">Só época</span>' : '<span class="text-praia-sand-300">Todo o ano</span>'}</td>
                <td class="px-4 py-3 text-right">
                  <button onclick="toggleItemVisibility('locations-carimbos', ${i})" class="text-praia-sand-400 hover:text-praia-sand-600 text-xs font-semibold mr-2" title="${l.hidden ? 'Tornar visível' : 'Ocultar do site'}">${l.hidden ? 'Mostrar' : 'Ocultar'}</button>
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
  const q    = _norm(document.getElementById('passaporte-search')?.value || '');
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
        <div class="mb-4">
          <label>Morada</label>
          <div style="display:flex;gap:8px;align-items:flex-end;">
            <input type="text" id="l-address" value="${escHtml(l.address || '')}" style="flex:1;">
            <button onclick="geocodeCurrentLocation('l-lat','l-lng','l-address',this)" style="white-space:nowrap;flex-shrink:0;" class="admin-btn admin-btn-secondary">📍 Localizar</button>
          </div>
        </div>
        <div class="mb-4"><label>Telefone</label><input type="text" id="l-phone" value="${escHtml(l.phone || '')}"></div>
        <div class="mb-4">
          <label>Praias que se pode carimbar <span class="font-normal text-praia-sand-400">(uma por linha)</span></label>
          <textarea id="l-beaches" rows="5" style="resize:vertical;">${escHtml(beachesStr)}</textarea>
        </div>
        <div class="mb-4 flex items-center gap-3">
          <input type="checkbox" id="l-seasonal" class="w-4 h-4 accent-amber-500" ${l.seasonal ? 'checked' : ''}
            onchange="document.getElementById('seasonal-note-row').style.display=this.checked?'':'none'">
          <label for="l-seasonal" class="cursor-pointer select-none">Só aberto durante a época balnear <span class="font-normal text-amber-600 text-xs">(mostra aviso no site)</span></label>
        </div>
        <div id="seasonal-note-row" class="mb-4" style="display:${l.seasonal ? '' : 'none'}">
          <label>Nota de época <span class="font-normal text-praia-sand-400">(opcional, ex: "1 Jun–15 Set, 10h–19h")</span></label>
          <input type="text" id="l-seasonal-note" value="${escHtml(l.seasonal_note || '')}" placeholder="Deixar vazio para mostrar 'Só época balnear'">
        </div>
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div><label>Latitude</label><input type="number" step="0.00001" id="l-lat" value="${l.coordinates?.lat || 39.5}"></div>
          <div><label>Longitude</label><input type="number" step="0.00001" id="l-lng" value="${l.coordinates?.lng || -8.0}"></div>
        </div>
        <p class="text-xs text-praia-sand-400">Escreva a morada e clique em "📍 Localizar" para preencher as coordenadas automaticamente.</p>
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
  const seasonal = document.getElementById('l-seasonal')?.checked || false;
  const seasonalNote = (document.getElementById('l-seasonal-note')?.value || '').trim();
  const loc = {
    name: document.getElementById('l-name').value.trim(),
    municipality: document.getElementById('l-municipality').value.trim(),
    address: document.getElementById('l-address').value.trim(),
    phone: document.getElementById('l-phone').value.trim(),
    beaches,
    seasonal,
    ...(seasonal && seasonalNote ? { seasonal_note: seasonalNote } : {}),
    coordinates: {
      lat: parseFloat(document.getElementById('l-lat').value) || 0,
      lng: parseFloat(document.getElementById('l-lng').value) || 0,
    },
  };
  if (!state.data[section]) state.data[section] = [];
  if (index !== null) state.data[section][index] = loc;
  else state.data[section].push(loc);
  markDirty('locations-carimbos');
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
          <button onclick="saveSectionNow('descontos')" class="admin-btn admin-btn-export">Gravar alterações</button>
          <button onclick="editDesconto(null)" class="admin-btn admin-btn-primary">+ Adicionar</button>
        </div>
      </div>
      <div class="grid gap-4">
        ${items.map((d, i) => `
          <div class="bg-white rounded-xl shadow-layered p-4 flex items-center justify-between${d.hidden ? ' opacity-50' : ''}" style="${d.hidden ? 'background:repeating-linear-gradient(135deg,transparent,transparent 10px,rgba(0,0,0,.02) 10px,rgba(0,0,0,.02) 20px);' : ''}">
            <div class="flex items-center gap-2">
              ${d.hidden ? '<span style="display:inline-flex;align-items:center;padding:1px 6px;border-radius:6px;font-size:9px;font-weight:700;background:#f1f1f1;color:#999;border:1px solid #ddd;flex-shrink:0;">OCULTO</span>' : ''}
              <div>
                <h3 class="font-display text-sm font-bold text-praia-teal-800">${escHtml(d.name)}</h3>
                <p class="text-xs text-praia-sand-500">${escHtml(d.description)}</p>
              </div>
            </div>
            <div class="flex gap-2 flex-shrink-0">
              <button onclick="toggleItemVisibility('descontos', ${i})" class="text-praia-sand-400 hover:text-praia-sand-600 text-xs font-semibold" title="${d.hidden ? 'Tornar visível' : 'Ocultar do site'}">${d.hidden ? 'Mostrar' : 'Ocultar'}</button>
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
    name: '', description: '', conditions: '', region: 'centro', category: 'alojamento', municipality: '', logo: ''
  };
  state.editingDescontoLogo = d.logo ? { src: d.logo, name: '' } : null;

  const container = document.getElementById('admin-content');
  container.innerHTML = `
    <div class="p-6 max-w-2xl admin-form">
      <button onclick="renderSection()" class="text-praia-teal-600 text-sm font-semibold mb-4">← Voltar</button>
      <h2 class="font-display text-xl font-bold text-praia-teal-800 mb-6">${index !== null ? 'Editar' : 'Adicionar'} Desconto</h2>
      <div class="bg-white rounded-xl p-5 mb-4 shadow-sm border border-praia-sand-100">
        <div class="mb-4"><label>Nome do Parceiro</label><input type="text" id="d-name" value="${escHtml(d.name)}"></div>
        <div class="mb-4">
          <label>Logo do Parceiro</label>
          <div id="desconto-logo-preview"></div>
          <div id="desconto-logo-drop" style="margin-top:8px;border:2px dashed #C4B898;border-radius:10px;padding:14px;text-align:center;cursor:pointer;background:#FAF8F5;" onclick="document.getElementById('desconto-logo-file').click()">
            <span style="font-size:12px;color:#8A7D60;font-family:'Poppins',sans-serif;font-weight:600;">Clique ou arraste para carregar logo</span>
          </div>
          <input type="file" id="desconto-logo-file" accept="image/*" style="display:none;" onchange="handleDescontoLogoFile(this.files[0]); this.value='';">
        </div>
        <div class="mb-4"><label>Descrição do Desconto</label><div id="d-description-editor" style="min-height:80px;"></div></div>
        <div class="mb-4"><label>Condições</label><div id="d-conditions-editor" style="min-height:80px;"></div></div>
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

  renderDescontoLogoPreview();
  setTimeout(() => {
    initQuillEditor('d-description-editor', d.description || '', { minimal: true });
    initQuillEditor('d-conditions-editor', d.conditions || '', { minimal: true });
    const dz = document.getElementById('desconto-logo-drop');
    if (dz) {
      dz.addEventListener('dragover', e => { e.preventDefault(); dz.style.borderColor = '#003A40'; });
      dz.addEventListener('dragleave', () => { dz.style.borderColor = '#C4B898'; });
      dz.addEventListener('drop', e => { e.preventDefault(); dz.style.borderColor = '#C4B898'; if (e.dataTransfer.files[0]) handleDescontoLogoFile(e.dataTransfer.files[0]); });
    }
  }, 0);
}

function renderDescontoLogoPreview() {
  const container = document.getElementById('desconto-logo-preview');
  if (!container) return;
  if (!state.editingDescontoLogo) { container.innerHTML = ''; return; }
  container.innerHTML = `
    <div style="position:relative;display:inline-block;margin-top:6px;">
      <img src="${state.editingDescontoLogo.src}" alt="Logo" style="max-width:160px;max-height:80px;object-fit:contain;border-radius:8px;border:2px solid #E2D9C6;background:#fff;padding:4px;">
      <button onclick="state.editingDescontoLogo=null;renderDescontoLogoPreview();" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#D32F2F;color:white;border:none;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;font-weight:bold;">×</button>
    </div>`;
}

async function handleDescontoLogoFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const result = await uploadImageFile(file, 'discounts');
  state.editingDescontoLogo = result;
  renderDescontoLogoPreview();
  toast('Logo carregado.', 'success');
}

function saveDesconto(index) {
  const d = {
    name: document.getElementById('d-name').value.trim(),
    description: getQuillHTML('d-description-editor') || '',
    conditions: getQuillHTML('d-conditions-editor') || '',
    region: document.getElementById('d-region').value,
    category: document.getElementById('d-category').value,
    municipality: document.getElementById('d-municipality').value.trim(),
    logo: state.editingDescontoLogo?.src || '',
  };
  if (index !== null) state.data.descontos[index] = d;
  else state.data.descontos.push(d);
  markDirty('descontos');
  toast('Desconto guardado!', 'success');
  renderSection();
}

// ─── Settings ───
function renderSettings(container) {
  const s = state.data.settings || {};
  const beaches = state.data.beaches || [];
  const articles = state.data.articles || [];
  const featuredBeaches = s.featuredBeaches || [];
  const featuredArticles = s.featuredArticles || [];
  const prevWinners = s.previousWinners || [];
  const announcement = s.announcement || { enabled: false, text: '' };

  container.innerHTML = `
    <div class="p-6 max-w-3xl admin-form">
      <h1 class="font-display text-2xl font-bold text-praia-teal-800 mb-6">Configurações do Site</h1>

      <!-- Votação -->
      <div class="bg-white rounded-xl p-5 mb-4 shadow-sm border border-praia-sand-100">
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-4">Votação</h3>
        <div class="grid grid-cols-2 gap-4">
          <div><label>Data Limite Votação</label><input type="datetime-local" id="s-deadline" value="${(s.votingDeadline || '').slice(0, 16)}"></div>
          <div><label>Ano Corrente</label><input type="number" id="s-year" value="${s.currentYear || 2026}"></div>
        </div>
      </div>

      <!-- Anúncio -->
      <div class="bg-white rounded-xl p-5 mb-4 shadow-sm border border-praia-sand-100">
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-4">Anúncio do Site</h3>
        <label class="flex items-center gap-2 cursor-pointer text-sm mb-3">
          <input type="checkbox" id="s-announcement-enabled" ${announcement.enabled ? 'checked' : ''} style="accent-color:#003A40;">
          Mostrar banner de anúncio no topo do site
        </label>
        <div><label>Texto do Anúncio</label><textarea id="s-announcement-text" rows="2">${escHtml(announcement.text || '')}</textarea></div>
      </div>

      <!-- Loja -->
      <div class="bg-white rounded-xl p-5 mb-4 shadow-sm border border-praia-sand-100">
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-4">Loja · Portes de Envio</h3>
        <div class="grid grid-cols-3 gap-4">
          <div><label>Portes Continental (€)</label><input type="number" step="0.01" id="s-shipping-cont" value="${((s.shippingPriceContinent || 350) / 100).toFixed(2)}"></div>
          <div><label>Portes Ilhas (€)</label><input type="number" step="0.01" id="s-shipping-ilhas" value="${((s.shippingPriceIslands || 600) / 100).toFixed(2)}"></div>
          <div><label>Grátis a partir de (€)</label><input type="number" step="0.01" id="s-shipping-free" value="${((s.freeShippingThreshold || 3000) / 100).toFixed(2)}"></div>
        </div>
      </div>

      <!-- Praias em Destaque -->
      <div class="bg-white rounded-xl p-5 mb-4 shadow-sm border border-praia-sand-100">
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-3">Praias em Destaque (Homepage)</h3>
        <p class="text-xs text-praia-sand-400 mb-3">Arraste para reordenar. Clique × para remover.</p>
        <div id="featured-beaches-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
          ${featuredBeaches.map(id => {
            const beach = beaches.find(b => b.id === id);
            return `<div draggable="true" data-id="${id}" class="draggable-item" style="display:flex;align-items:center;justify-content:space-between;background:#FAF8F5;border-radius:10px;padding:10px 14px;border:1px solid #E2D9C6;cursor:grab;">
              <span style="font-family:'Poppins',sans-serif;font-size:13px;color:#003A40;font-weight:600;">⠿ ${escHtml(beach?.name || id)}</span>
              <button onclick="removeFeaturedBeach('${id}')" style="color:#EF4444;font-size:13px;font-weight:700;background:none;border:none;cursor:pointer;font-family:'Poppins',sans-serif;">×</button>
            </div>`;
          }).join('')}
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <select id="s-add-beach" class="flex-1 px-3 py-2 text-sm border border-praia-sand-200 rounded-lg bg-white">
            <option value="">- Adicionar praia -</option>
            ${beaches.filter(b => !featuredBeaches.includes(b.id)).map(b => `<option value="${b.id}">${escHtml(b.name)}</option>`).join('')}
          </select>
          <button onclick="addFeaturedBeach()" class="admin-btn admin-btn-primary" style="white-space:nowrap;">+ Adicionar</button>
        </div>
      </div>

      <!-- Artigos em Destaque -->
      <div class="bg-white rounded-xl p-5 mb-4 shadow-sm border border-praia-sand-100">
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-3">Artigos em Destaque (Homepage)</h3>
        <p class="text-xs text-praia-sand-400 mb-3">Arraste para reordenar. Clique × para remover.</p>
        <div id="featured-articles-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
          ${featuredArticles.map(slug => {
            const article = articles.find(a => a.slug === slug);
            return `<div draggable="true" data-id="${slug}" class="draggable-item" style="display:flex;align-items:center;justify-content:space-between;background:#FAF8F5;border-radius:10px;padding:10px 14px;border:1px solid #E2D9C6;cursor:grab;">
              <span style="font-family:'Poppins',sans-serif;font-size:13px;color:#003A40;font-weight:600;">⠿ ${escHtml(article?.title || slug)}</span>
              <button onclick="removeFeaturedArticle('${slug}')" style="color:#EF4444;font-size:13px;font-weight:700;background:none;border:none;cursor:pointer;font-family:'Poppins',sans-serif;">×</button>
            </div>`;
          }).join('')}
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <select id="s-add-article" class="flex-1 px-3 py-2 text-sm border border-praia-sand-200 rounded-lg bg-white">
            <option value="">- Adicionar artigo -</option>
            ${articles.filter(a => !featuredArticles.includes(a.slug)).map(a => `<option value="${a.slug}">${escHtml(a.title)}</option>`).join('')}
          </select>
          <button onclick="addFeaturedArticle()" class="admin-btn admin-btn-primary" style="white-space:nowrap;">+ Adicionar</button>
        </div>
      </div>

      <!-- Vencedores Anteriores -->
      <div class="bg-white rounded-xl p-5 mb-4 shadow-sm border border-praia-sand-100">
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-1">Vencedores Anteriores</h3>
        <p style="font-size:12px;color:#8A7D60;margin-bottom:14px;">Pode adicionar múltiplas Praias Revelação. Use o campo "Label" para indicar zona (Norte, Centro, Sul) ou posição (1.º, 2.º) ou deixar em branco.</p>
        <div id="winners-list" style="display:flex;flex-direction:column;gap:12px;margin-bottom:12px;">
          ${prevWinners.map((w, i) => {
            const revs = w.revelations || [];
            return `
            <div style="background:#FAF8F5;border-radius:12px;border:1px solid #E2D9C6;overflow:hidden;">
              <!-- Header: ano + remover -->
              <div style="display:flex;align-items:center;justify-content:space-between;background:#003A40;padding:10px 14px;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-family:'Poppins',sans-serif;font-size:11px;font-weight:700;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:.05em;">Ano</span>
                  <input type="text" value="${w.year}" id="w-year-${i}" placeholder="ex: 2024 ou 2021-2022"
                    style="width:100px;padding:4px 8px;font-size:14px;font-weight:700;border:1px solid rgba(255,255,255,0.2);border-radius:6px;background:rgba(255,255,255,0.1);color:white;font-family:'Poppins',sans-serif;text-align:center;">
                </div>
                <button onclick="removeWinner(${i})" style="color:rgba(255,100,100,0.8);font-size:11px;font-weight:700;background:none;border:none;cursor:pointer;font-family:'Poppins',sans-serif;letter-spacing:.05em;text-transform:uppercase;">× Remover</button>
              </div>
              <!-- Pódio -->
              <div style="padding:14px;display:flex;flex-direction:column;gap:8px;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-family:'Poppins',sans-serif;font-size:12px;font-weight:700;color:#FFEB3B;min-width:26px;">🏆</span>
                  <input type="text" value="${escHtml(w.winner || '')}" placeholder="1.º Praia Fluvial do Ano" id="w-winner-${i}"
                    style="flex:1;padding:7px 10px;font-size:13px;border:1px solid #E2D9C6;border-radius:8px;background:white;font-family:'Open Sans',sans-serif;color:#2D2820;">
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-family:'Poppins',sans-serif;font-size:12px;font-weight:700;color:#C0C0C0;min-width:26px;">🥈</span>
                  <input type="text" value="${escHtml(w.second || '')}" placeholder="2.º Lugar (opcional)" id="w-second-${i}"
                    style="flex:1;padding:7px 10px;font-size:13px;border:1px solid #E2D9C6;border-radius:8px;background:white;font-family:'Open Sans',sans-serif;color:#2D2820;">
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-family:'Poppins',sans-serif;font-size:12px;font-weight:700;color:#CD7F32;min-width:26px;">🥉</span>
                  <input type="text" value="${escHtml(w.third || '')}" placeholder="3.º Lugar (opcional)" id="w-third-${i}"
                    style="flex:1;padding:7px 10px;font-size:13px;border:1px solid #E2D9C6;border-radius:8px;background:white;font-family:'Open Sans',sans-serif;color:#2D2820;">
                </div>
                <!-- Revelações -->
                <div style="margin-top:4px;padding-top:10px;border-top:1px solid #E2D9C6;">
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                    <span style="font-family:'Poppins',sans-serif;font-size:11px;font-weight:700;color:#0288D1;text-transform:uppercase;letter-spacing:.05em;">✨ Praias Revelação</span>
                    <button onclick="addRevelation(${i})" style="font-family:'Poppins',sans-serif;font-size:11px;font-weight:700;color:#0288D1;background:rgba(2,136,209,0.08);border:1px solid rgba(2,136,209,0.3);border-radius:6px;padding:3px 10px;cursor:pointer;">+ Adicionar</button>
                  </div>
                  ${revs.length === 0 ? `<p style="font-size:12px;color:#C4B898;font-family:'Open Sans',sans-serif;">Sem praias revelação registadas.</p>` : ''}
                  ${revs.map((r, j) => `
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                      <input type="text" value="${escHtml(r.label || '')}" placeholder="Label (Norte / 1.º / …)" id="w-rev-label-${i}-${j}"
                        style="width:110px;padding:6px 8px;font-size:12px;border:1px solid #E2D9C6;border-radius:7px;background:white;font-family:'Open Sans',sans-serif;color:#2D2820;flex-shrink:0;">
                      <input type="text" value="${escHtml(r.name || '')}" placeholder="Nome da praia" id="w-rev-name-${i}-${j}"
                        style="flex:1;padding:6px 8px;font-size:12px;border:1px solid #E2D9C6;border-radius:7px;background:white;font-family:'Open Sans',sans-serif;color:#2D2820;">
                      <button onclick="removeRevelation(${i},${j})" style="color:#EF4444;font-size:16px;font-weight:700;background:none;border:none;cursor:pointer;line-height:1;flex-shrink:0;">×</button>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
        <button onclick="addWinner()" class="admin-btn admin-btn-secondary text-sm">+ Adicionar Vencedor</button>
      </div>

      <div class="flex gap-2">
        <button onclick="saveSettings()" class="admin-btn admin-btn-success">Guardar Configurações</button>
        <button onclick="saveSectionNow('settings')" class="admin-btn admin-btn-export">Gravar alterações</button>
      </div>
    </div>`;

  // Setup drag-and-drop for featured lists
  makeDraggableList('featured-beaches-list', ids => {
    state.data.settings = state.data.settings || {};
    state.data.settings.featuredBeaches = ids;
  });
  makeDraggableList('featured-articles-list', ids => {
    state.data.settings = state.data.settings || {};
    state.data.settings.featuredArticles = ids;
  });
}

// ─── Sincronização Destaques ↔ Settings ───
function syncBeachFeatured(id, featured) {
  const s = state.data.settings = state.data.settings || {};
  s.featuredBeaches = s.featuredBeaches || [];
  const inList = s.featuredBeaches.includes(id);
  if (featured && !inList) s.featuredBeaches.push(id);
  if (!featured && inList) s.featuredBeaches = s.featuredBeaches.filter(b => b !== id);
  markDirty('settings');
}

function syncArticleFeatured(slug, featured) {
  const s = state.data.settings = state.data.settings || {};
  s.featuredArticles = s.featuredArticles || [];
  const inList = s.featuredArticles.includes(slug);
  if (featured && !inList) s.featuredArticles.push(slug);
  if (!featured && inList) s.featuredArticles = s.featuredArticles.filter(a => a !== slug);
  markDirty('settings');
}

function addFeaturedBeach() {
  const sel = document.getElementById('s-add-beach');
  const id = sel?.value;
  if (!id) return;
  const s = state.data.settings || {};
  s.featuredBeaches = [...(s.featuredBeaches || []), id];
  state.data.settings = s;
  // Sincronizar flag na praia
  const beach = (state.data.beaches || []).find(b => b.id === id);
  if (beach) { beach.featured = true; markDirty('beaches'); }
  markDirty('settings');
  renderSettings(document.getElementById('admin-content'));
}

function removeFeaturedBeach(id) {
  const s = state.data.settings || {};
  s.featuredBeaches = (s.featuredBeaches || []).filter(b => b !== id);
  state.data.settings = s;
  // Sincronizar flag na praia
  const beach = (state.data.beaches || []).find(b => b.id === id);
  if (beach) { beach.featured = false; markDirty('beaches'); }
  markDirty('settings');
  renderSettings(document.getElementById('admin-content'));
}

function addFeaturedArticle() {
  const sel = document.getElementById('s-add-article');
  const slug = sel?.value;
  if (!slug) return;
  const s = state.data.settings || {};
  s.featuredArticles = [...(s.featuredArticles || []), slug];
  state.data.settings = s;
  // Sincronizar flag no artigo
  const article = (state.data.articles || []).find(a => a.slug === slug);
  if (article) { article.featured = true; markDirty('articles'); }
  markDirty('settings');
  renderSettings(document.getElementById('admin-content'));
}

function removeFeaturedArticle(slug) {
  const s = state.data.settings || {};
  s.featuredArticles = (s.featuredArticles || []).filter(a => a !== slug);
  state.data.settings = s;
  // Sincronizar flag no artigo
  const article = (state.data.articles || []).find(a => a.slug === slug);
  if (article) { article.featured = false; markDirty('articles'); }
  markDirty('settings');
  renderSettings(document.getElementById('admin-content'));
}

function addWinner() {
  _flushWinnersFromDOM();
  const s = state.data.settings || {};
  s.previousWinners = [{ year: new Date().getFullYear() - 1, winner: '', second: '', third: '', revelations: [] }, ...(s.previousWinners || [])];
  state.data.settings = s;
  renderSettings(document.getElementById('admin-content'));
}

function removeWinner(i) {
  _flushWinnersFromDOM();
  const s = state.data.settings || {};
  s.previousWinners = (s.previousWinners || []).filter((_, idx) => idx !== i);
  state.data.settings = s;
  renderSettings(document.getElementById('admin-content'));
}

function addRevelation(winnerIdx) {
  _flushWinnersFromDOM();
  const s = state.data.settings || {};
  const w = s.previousWinners?.[winnerIdx];
  if (!w) return;
  w.revelations = [...(w.revelations || []), { label: '', name: '' }];
  state.data.settings = s;
  renderSettings(document.getElementById('admin-content'));
}

function removeRevelation(winnerIdx, revIdx) {
  _flushWinnersFromDOM();
  const s = state.data.settings || {};
  const w = s.previousWinners?.[winnerIdx];
  if (!w) return;
  w.revelations = (w.revelations || []).filter((_, idx) => idx !== revIdx);
  state.data.settings = s;
  renderSettings(document.getElementById('admin-content'));
}

// Read all winner fields from DOM into state (before any re-render)
function _flushWinnersFromDOM() {
  const s = state.data.settings || {};
  const winners = s.previousWinners || [];
  winners.forEach((w, i) => {
    const yearEl = document.getElementById(`w-year-${i}`);
    const winnerEl = document.getElementById(`w-winner-${i}`);
    const secondEl = document.getElementById(`w-second-${i}`);
    const thirdEl = document.getElementById(`w-third-${i}`);
    if (yearEl) { const v = yearEl.value.trim(); w.year = /^\d+$/.test(v) ? parseInt(v) : (v || w.year); }
    if (winnerEl) w.winner = winnerEl.value.trim();
    if (secondEl) w.second = secondEl.value.trim();
    if (thirdEl) w.third = thirdEl.value.trim();
    (w.revelations || []).forEach((r, j) => {
      const labelEl = document.getElementById(`w-rev-label-${i}-${j}`);
      const nameEl = document.getElementById(`w-rev-name-${i}-${j}`);
      if (labelEl) r.label = labelEl.value.trim();
      if (nameEl) r.name = nameEl.value.trim();
    });
  });
  state.data.settings = s;
}

function saveSettings() {
  // Flush all winner DOM fields into state first
  _flushWinnersFromDOM();

  state.data.settings = {
    ...state.data.settings,
    votingDeadline: (document.getElementById('s-deadline').value || '') + ':00',
    currentYear: parseInt(document.getElementById('s-year').value) || 2026,
    announcement: {
      enabled: document.getElementById('s-announcement-enabled')?.checked || false,
      text: document.getElementById('s-announcement-text')?.value.trim() || '',
    },
    shippingPriceContinent: Math.round(parseFloat(document.getElementById('s-shipping-cont')?.value || '3.50') * 100),
    shippingPriceIslands: Math.round(parseFloat(document.getElementById('s-shipping-ilhas')?.value || '6.00') * 100),
    freeShippingThreshold: Math.round(parseFloat(document.getElementById('s-shipping-free')?.value || '30.00') * 100),
    // previousWinners already flushed into state by _flushWinnersFromDOM()
  };
  markDirty('settings');
  toast('Configurações guardadas!', 'success');
}

// ─── Shared ───
function deleteItem(section, index) {
  if (!confirm('Tem a certeza que deseja eliminar?')) return;
  state.data[section].splice(index, 1);
  markDirty(section);
  toast('Item eliminado.', 'success');
  renderSection();
}

function toggleItemVisibility(section, index) {
  const item = state.data[section]?.[index];
  if (!item) return;
  if (!item.hidden) {
    if (!confirm('Este item será ocultado do site público e deixará de ser visível para os visitantes. Os dados não serão apagados.\n\nDeseja continuar?')) return;
    item.hidden = true;
  } else {
    // Remover o campo em vez de definir false — evita diferenças fantasma no sync
    delete item.hidden;
  }
  markDirty(section);
  toast(item.hidden ? 'Item ocultado do site público.' : 'Item visível novamente no site público.', 'success');
  renderSection();
}

function filterAdminTable(query) {
  const q = _norm(query);
  const visFilter = document.getElementById('beaches-visibility-filter')?.value || 'all';
  document.querySelectorAll('.admin-table-row').forEach(row => {
    const matchesSearch = !q || row.dataset.search?.includes(q);
    let matchesVisibility = true;
    if (visFilter === 'hidden') matchesVisibility = row.dataset.hidden === '1';
    else if (visFilter === 'visible') matchesVisibility = row.dataset.hidden !== '1';
    row.style.display = matchesSearch && matchesVisibility ? '' : 'none';
  });
}

// ─── Export / Import ───
function exportSection(section) {
  if (['encomendas','utilizadores','comentarios'].includes(section)) return; // Supabase-managed
  if (section === 'conteudo') { exportContentJSON(); return; }
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
  SECTIONS.forEach((section, i) => setTimeout(() => exportSection(section), 300 * i));
  // Also export content.json
  setTimeout(() => exportContentJSON(), 300 * SECTIONS.length);
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
      if (name === 'content') {
        state.data['conteudo'] = data;
        state.editingContent = JSON.parse(JSON.stringify(data));
        toast('content.json importado!', 'success');
        renderSection();
      } else if (SECTIONS.includes(name)) {
        state.data[name] = data;
        if (name === 'conteudo') state.editingContent = JSON.parse(JSON.stringify(data));
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

function generateBeachId(type, name) {
  const prefixMap = { praia_fluvial: 'praia-fluvial', zona_balnear: 'zona-balnear' };
  const prefix = prefixMap[type] || 'praia-fluvial';
  // Strip common name prefixes to avoid duplication (e.g. "Praia Fluvial da Lenta" → "Lenta")
  const stripped = name
    .replace(/^(praia\s+fluvial|zona\s+balnear|praia|areal|parque\s+fluvial|zona\s+de\s+lazer)\s+(d[aoe]s?|)\s*/i, '')
    .trim();
  const slug = slugify(stripped || name);
  return `${prefix}-de-${slug}`;
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
          { label: 'Utilizadores', value: totalUsers ?? '-', icon: '👤' },
          { label: `Votos ${year}`, value: totalVotes ?? '-', icon: '🗳️' },
          { label: 'Comentários', value: totalReviews ?? '-', icon: '💬' },
          { label: 'Carimbos', value: totalStamps ?? '-', icon: '🔖' },
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
        <p class="text-sm text-praia-sand-600 mb-5">O comentário ficará visível na comunidade como <em>"Este comentário foi removido por um administrador."</em></p>
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
  const query   = _norm(document.getElementById('com-search')?.value || '');
  const beach   = document.getElementById('com-filter-beach')?.value || '';
  const estado  = document.getElementById('com-filter-estado')?.value || 'todos';

  let filtered = reviews;
  if (estado === 'visiveis') filtered = filtered.filter(r => !r.deleted_by_admin);
  if (estado === 'apagados') filtered = filtered.filter(r => !!r.deleted_by_admin);
  if (beach) filtered = filtered.filter(r => r.beach_id === beach);
  if (query) filtered = filtered.filter(r => {
    const beachName = _norm(beaches.find(b => b.id === r.beach_id)?.name || beaches.find(b => b.id === r.beach_id)?.nome || r.beach_id || '');
    return _norm(r.text || '').includes(query) ||
      _norm(r.profiles?.username || '').includes(query) ||
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
            const username = r.profiles?.username || '-';
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
              <td class="px-4 py-3 text-praia-sand-500 text-xs">${escHtml(beach?.name || beach?.nome || r.beach_id || '-')}</td>
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
        <div class="flex gap-2">
          <button onclick="saveSectionNow('produtos')" class="admin-btn admin-btn-export">Gravar alterações</button>
          <button onclick="addNewProduct()" class="admin-btn admin-btn-primary px-5 py-2.5">+ Novo Produto</button>
        </div>
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
              <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-praia-sand-50'} border-b border-praia-sand-100${p.hidden ? ' opacity-50' : ''}" style="${p.hidden ? 'background:repeating-linear-gradient(135deg,transparent,transparent 10px,rgba(0,0,0,.02) 10px,rgba(0,0,0,.02) 20px);' : ''}">
                <td class="px-4 py-3">
                  <div class="flex items-center gap-3">
                    ${p.hidden ? '<span style="display:inline-flex;align-items:center;padding:1px 6px;border-radius:6px;font-size:9px;font-weight:700;background:#f1f1f1;color:#999;border:1px solid #ddd;flex-shrink:0;">OCULTO</span>' : ''}
                    ${p.images && p.images[0] ? `<img src="${p.images[0]}" class="w-10 h-10 rounded-lg object-cover border border-praia-sand-100" onerror="this.style.display='none'">` : '<div class="w-10 h-10 rounded-lg bg-praia-sand-100 flex items-center justify-center text-praia-sand-400 text-lg">📦</div>'}
                    <div>
                      <div class="font-display font-semibold text-praia-teal-800">${p.name}</div>
                      <div class="text-praia-sand-400 text-xs">${p.id}</div>
                    </div>
                  </div>
                </td>
                <td class="px-4 py-3 font-display text-praia-sand-600 capitalize">${p.category || '-'}</td>
                <td class="px-4 py-3 font-display font-semibold text-praia-teal-800">${fmtPrice(p.price)}</td>
                <td class="px-4 py-3">
                  <span class="inline-flex items-center gap-1 font-display text-xs font-semibold px-2 py-0.5 rounded-full ${p.available ? 'bg-praia-green-500/10 text-praia-green-600' : 'bg-red-50 text-red-500'}">
                    ${p.available ? '● Disponível' : '○ Esgotado'}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <div class="flex gap-2">
                    <button onclick="editProduct('${p.id}')" class="admin-btn py-1 px-3 text-xs">Editar</button>
                    <button onclick="toggleProductVisibility('${p.id}')" class="admin-btn py-1 px-3 text-xs ${p.hidden ? 'bg-praia-green-500/10 text-praia-green-600' : 'bg-praia-sand-100 text-praia-sand-600'}" title="${p.hidden ? 'Tornar visível' : 'Ocultar do site'}">${p.hidden ? 'Mostrar' : 'Ocultar'}</button>
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
        <p class="text-praia-teal-600">Edite os produtos e clique em <strong>Gravar alterações</strong> para publicar imediatamente na loja.</p>
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
    <div class="admin-form space-y-5">

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label>ID (slug único)</label>
          <input id="p-id" type="text" value="${p.id || ''}" placeholder="ex: tshirt-2026">
        </div>
        <div>
          <label>Categoria</label>
          <select id="p-category">
            <option value="vestuario"  ${p.category === 'vestuario'  ? 'selected' : ''}>Vestuário</option>
            <option value="publicacao" ${p.category === 'publicacao' ? 'selected' : ''}>Publicação</option>
            <option value="acessorio"  ${p.category === 'acessorio'  ? 'selected' : ''}>Acessório</option>
          </select>
        </div>
      </div>

      <div>
        <label>Nome</label>
        <input id="p-name" type="text" value="${p.name || ''}" placeholder="Nome do produto">
      </div>

      <div>
        <label>Descrição</label>
        <div id="p-description-editor" style="min-height:80px;"></div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label>Preço (cêntimos, 0 = Grátis)</label>
          <input id="p-price" type="number" min="0" value="${p.price ?? 0}" placeholder="2500">
        </div>
        <div class="flex flex-col justify-center gap-2.5 pt-1">
          <label class="flex items-center gap-2 cursor-pointer normal-case tracking-normal text-sm font-semibold text-praia-sand-700" style="text-transform:none;letter-spacing:0;">
            <input id="p-available" type="checkbox" class="w-4 h-4 accent-praia-teal-700" ${p.available ? 'checked' : ''}> Disponível
          </label>
          <label class="flex items-center gap-2 cursor-pointer" style="text-transform:none;letter-spacing:0;">
            <input id="p-shipping" type="checkbox" class="w-4 h-4 accent-praia-teal-700" ${p.shippingRequired ? 'checked' : ''}> Requer envio
          </label>
          <label class="flex items-center gap-2 cursor-pointer" style="text-transform:none;letter-spacing:0;">
            <input id="p-customizable" type="checkbox" class="w-4 h-4 accent-praia-teal-700" ${p.customizable ? 'checked' : ''}> Praia personalizável
          </label>
        </div>
      </div>

      <div>
        <label>Imagens do Produto</label>
        <div id="product-img-gallery" style="margin-bottom:8px;min-height:20px;"></div>
        <div id="product-img-drop" style="border:2px dashed #C4B898;border-radius:10px;padding:16px;text-align:center;cursor:pointer;background:#FAF8F5;" onclick="document.getElementById('product-img-file').click()">
          <span style="font-size:12px;color:#8A7D60;font-family:'Poppins',sans-serif;font-weight:600;">Arraste ou clique para adicionar imagens</span>
        </div>
        <input type="file" id="product-img-file" accept="image/*" multiple style="display:none;" onchange="handleProductImageFiles(this.files); this.value='';">
      </div>

      <div>
        <label>Tamanhos, separados por vírgula (vazio = sem variantes)</label>
        <input id="p-variants" type="text" value="${variants.map(v => v.id).join(',')}" placeholder="XS,S,M,L,XL,XXL">
      </div>

    </div>`;
}

function renderProductImageGallery() {
  const gallery = document.getElementById('product-img-gallery');
  if (!gallery) return;
  if (state.editingProductImages.length === 0) {
    gallery.innerHTML = '';
    return;
  }
  gallery.innerHTML = state.editingProductImages.map((p, i) => `
    <div style="position:relative;display:inline-block;margin:0 6px 6px 0;vertical-align:top;">
      <img src="${p.src}" alt="" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:2px solid #E2D9C6;display:block;">
      <button onclick="removeProductImage(${i})" style="position:absolute;top:-5px;right:-5px;width:18px;height:18px;border-radius:50%;background:#D32F2F;color:white;border:none;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center;font-weight:bold;">×</button>
      <div style="display:flex;gap:2px;justify-content:center;margin-top:3px;">
        ${i > 0 ? `<button onclick="moveProductImage(${i},-1)" style="background:#E2D9C6;border:none;border-radius:4px;padding:1px 4px;font-size:11px;cursor:pointer;">←</button>` : ''}
        ${i < state.editingProductImages.length-1 ? `<button onclick="moveProductImage(${i},1)" style="background:#E2D9C6;border:none;border-radius:4px;padding:1px 4px;font-size:11px;cursor:pointer;">→</button>` : ''}
      </div>
    </div>
  `).join('');
}

function removeProductImage(i) {
  state.editingProductImages.splice(i, 1);
  renderProductImageGallery();
}

function moveProductImage(i, dir) {
  const arr = state.editingProductImages;
  const n = i + dir;
  if (n < 0 || n >= arr.length) return;
  [arr[i], arr[n]] = [arr[n], arr[i]];
  renderProductImageGallery();
}

async function handleProductImageFiles(files) {
  for (const file of Array.from(files)) {
    if (!file.type.startsWith('image/')) continue;
    const result = await uploadImageFile(file, 'products');
    state.editingProductImages.push(result);
  }
  renderProductImageGallery();
  toast(`${files.length} imagem(ns) adicionada(s).`, 'success');
}

function setupProductImageDrop() {
  const dz = document.getElementById('product-img-drop');
  if (!dz) return;
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.style.borderColor = '#003A40'; dz.style.background = '#EEF5F5'; });
  dz.addEventListener('dragleave', () => { dz.style.borderColor = '#C4B898'; dz.style.background = '#FAF8F5'; });
  dz.addEventListener('drop', e => { e.preventDefault(); dz.style.borderColor = '#C4B898'; dz.style.background = '#FAF8F5'; if (e.dataTransfer.files.length) handleProductImageFiles(e.dataTransfer.files); });
}

function editProduct(productId) {
  const products = state.data['produtos'] || [];
  const p = products.find(p => p.id === productId) || {};
  state.editingProductImages = (p.images || []).map(src => ({ src, name: '' }));
  document.getElementById('product-modal-title').textContent = 'Editar Produto';
  document.getElementById('product-modal-body').innerHTML = productFormHTML(p);
  document.getElementById('product-modal').dataset.editId = productId;
  document.getElementById('product-modal').classList.remove('hidden');
  setTimeout(() => {
    renderProductImageGallery();
    setupProductImageDrop();
    initQuillEditor('p-description-editor', p.description || '', { minimal: true });
  }, 0);
}

function addNewProduct() {
  state.editingProductImages = [];
  document.getElementById('product-modal-title').textContent = 'Novo Produto';
  document.getElementById('product-modal-body').innerHTML = productFormHTML({});
  document.getElementById('product-modal').dataset.editId = '';
  document.getElementById('product-modal').classList.remove('hidden');
  setTimeout(() => {
    renderProductImageGallery();
    setupProductImageDrop();
    initQuillEditor('p-description-editor', '', { minimal: true });
  }, 0);
}

function saveProduct() {
  const editId = document.getElementById('product-modal').dataset.editId;
  const products = state.data['produtos'] || [];

  const id          = document.getElementById('p-id').value.trim();
  const name        = document.getElementById('p-name').value.trim();
  const description = getQuillHTML('p-description-editor') || '';
  const category    = document.getElementById('p-category').value;
  const price       = parseInt(document.getElementById('p-price').value || '0', 10);
  const available      = document.getElementById('p-available').checked;
  const shippingRequired = document.getElementById('p-shipping').checked;
  const customizable   = document.getElementById('p-customizable').checked;
  const images         = state.editingProductImages.map(p => p.src);
  const variantStr     = document.getElementById('p-variants').value.trim();
  const variants       = variantStr
    ? variantStr.split(',').map(s => s.trim()).filter(Boolean).map(v => ({ id: v, label: v, available: true }))
    : [];

  if (!id || !name) { toast('ID e Nome são obrigatórios.', 'error'); return; }

  const product = { id, name, description, category, price, images, variants, shippingRequired, available, ...(customizable ? { customizable: true } : {}) };

  if (editId) {
    const idx = products.findIndex(p => p.id === editId);
    if (idx >= 0) products[idx] = product;
    else products.push(product);
  } else {
    if (products.some(p => p.id === id)) { toast('Já existe um produto com este ID.', 'error'); return; }
    products.push(product);
  }

  state.data['produtos'] = products;
  markDirty('produtos');
  document.getElementById('product-modal').classList.add('hidden');
  renderDashboard();
  toast('Produto guardado.', 'success');
}

function toggleProductAvailability(productId) {
  const products = state.data['produtos'] || [];
  const p = products.find(p => p.id === productId);
  if (p) { p.available = !p.available; markDirty('produtos'); renderDashboard(); }
}

function toggleProductVisibility(productId) {
  const products = state.data['produtos'] || [];
  const p = products.find(p => p.id === productId);
  if (!p) return;
  if (!p.hidden) {
    if (!confirm('Este produto será ocultado do site público e deixará de ser visível para os visitantes. Os dados não serão apagados.\n\nDeseja continuar?')) return;
  }
  p.hidden = !p.hidden;
  markDirty('produtos');
  toast(p.hidden ? 'Produto ocultado do site público.' : 'Produto visível novamente no site público.', 'success');
  renderDashboard();
}

function deleteProduct(productId) {
  if (!confirm('Remover este produto?')) return;
  state.data['produtos'] = (state.data['produtos'] || []).filter(p => p.id !== productId);
  markDirty('produtos');
  renderDashboard();
  toast('Produto removido.', 'success');
}

// ─── Encomendas (leitura do Supabase) ────────────────────────────────────────

// Pending status changes: { orderId: newStatus }
window._ordersPendingChanges = {};
window._ordersOriginalStatus = {};
window._ordersFilterStatus = 'all';
window._ordersSortOrder = 'newest';

async function renderEncomendas(container) {
  container.innerHTML = `
    <div class="p-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="font-display text-xl font-bold text-praia-teal-800">Encomendas</h2>
        <div class="flex items-center gap-2">
          <button id="orders-save-btn" onclick="saveOrderChanges()" class="hidden admin-btn px-4 py-2 !bg-praia-green-500 !text-white hover:!bg-praia-green-600" style="background:#43A047;color:#fff;">
            Gravar alterações <span id="orders-pending-count"></span>
          </button>
          <button onclick="discardOrderChanges()" id="orders-discard-btn" class="hidden admin-btn px-4 py-2 !text-red-600 !border-red-200 hover:!bg-red-50" style="color:#dc2626;border-color:#fecaca;">
            Descartar
          </button>
          <button onclick="renderEncomendas(document.getElementById('admin-content'))" class="admin-btn px-4 py-2">↺ Atualizar</button>
        </div>
      </div>
      <!-- Filters -->
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <div class="flex items-center gap-2">
          <label class="font-display text-xs font-semibold text-praia-sand-500 uppercase tracking-wider">Estado:</label>
          <select id="orders-filter-status" onchange="window._ordersFilterStatus=this.value;renderEncomendasContent()"
            class="font-display text-xs px-3 py-1.5 rounded-lg border border-praia-sand-200 bg-white">
            <option value="all">Todos</option>
            <option value="pendente">Pendente</option>
            <option value="processado">Em processamento</option>
            <option value="enviado">Enviado</option>
            <option value="entregue">Entregue</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
        <div class="flex items-center gap-2">
          <label class="font-display text-xs font-semibold text-praia-sand-500 uppercase tracking-wider">Ordenar:</label>
          <select id="orders-sort-order" onchange="window._ordersSortOrder=this.value;renderEncomendasContent()"
            class="font-display text-xs px-3 py-1.5 rounded-lg border border-praia-sand-200 bg-white">
            <option value="newest">Mais recentes</option>
            <option value="oldest">Mais antigas</option>
          </select>
        </div>
        <span id="orders-count-label" class="font-display text-xs text-praia-sand-400 ml-auto"></span>
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
  window._ordersPendingChanges = {};
  window._ordersOriginalStatus = {};
  (orders || []).forEach(o => { window._ordersOriginalStatus[o.id] = o.status; });

  // Restore filter state
  const filterEl = document.getElementById('orders-filter-status');
  const sortEl = document.getElementById('orders-sort-order');
  if (filterEl) filterEl.value = window._ordersFilterStatus;
  if (sortEl) sortEl.value = window._ordersSortOrder;

  renderEncomendasContent();
}

function _getFilteredOrders() {
  let orders = [...(window._adminOrders || [])];
  // Apply status filter
  if (window._ordersFilterStatus !== 'all') {
    orders = orders.filter(o => {
      const currentStatus = window._ordersPendingChanges[o.id] ?? o.status;
      return currentStatus === window._ordersFilterStatus;
    });
  }
  // Apply sort
  orders.sort((a, b) => {
    const da = new Date(a.created_at).getTime();
    const db = new Date(b.created_at).getTime();
    return window._ordersSortOrder === 'oldest' ? da - db : db - da;
  });
  return orders;
}

function _updateOrderButtons() {
  const pending = Object.keys(window._ordersPendingChanges).length;
  const saveBtn = document.getElementById('orders-save-btn');
  const discardBtn = document.getElementById('orders-discard-btn');
  const countEl = document.getElementById('orders-pending-count');
  if (saveBtn) saveBtn.classList.toggle('hidden', pending === 0);
  if (discardBtn) discardBtn.classList.toggle('hidden', pending === 0);
  if (countEl) countEl.textContent = pending > 0 ? `(${pending})` : '';
}

function renderEncomendasContent() {
  const orders = _getFilteredOrders();
  const allOrders = window._adminOrders || [];
  const container = document.getElementById('orders-admin-content');
  if (!container) return;

  const countLabel = document.getElementById('orders-count-label');
  if (countLabel) countLabel.textContent = `${orders.length} de ${allOrders.length} encomenda${allOrders.length !== 1 ? 's' : ''}`;

  const statusColors = {
    pendente:   'bg-praia-sand-100 text-praia-sand-700',
    processado: 'bg-praia-teal-50 text-praia-teal-700',
    enviado:    'bg-blue-50 text-blue-700',
    entregue:   'bg-praia-green-500/10 text-praia-green-600',
    cancelado:  'bg-red-50 text-red-600',
  };

  function fmtPrice(cents) {
    return (cents / 100).toFixed(2).replace('.', ',') + '€';
  }
  function fmtDate(dt) {
    return new Date(dt).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  if (!allOrders.length) {
    container.innerHTML = `<div class="text-center py-20 text-praia-sand-400 font-display">Ainda não há encomendas.</div>`;
    return;
  }

  if (!orders.length) {
    container.innerHTML = `<div class="text-center py-12 text-praia-sand-400 font-display text-sm">Nenhuma encomenda corresponde aos filtros selecionados.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="space-y-3">
      ${orders.map(o => {
        const currentStatus = window._ordersPendingChanges[o.id] ?? o.status;
        const isPending = o.id in window._ordersPendingChanges;
        const items = Array.isArray(o.items) ? o.items : [];
        const addr = o.shipping_address || {};
        const addrParts = [addr.name, addr.line1, addr.line2, [addr.postal_code, addr.city].filter(Boolean).join(' '), addr.country || 'PT'].filter(Boolean);

        return `
          <div class="bg-white rounded-2xl border ${isPending ? 'border-praia-green-500 ring-2 ring-praia-green-500/20' : 'border-praia-sand-100'} shadow-sm overflow-hidden" id="order-card-${o.id}">
            <!-- Header -->
            <div class="flex items-center justify-between px-5 py-4 border-b border-praia-sand-100 bg-praia-sand-50/50">
              <div class="flex items-center gap-4">
                <div>
                  <span class="font-display font-bold text-praia-teal-800 text-sm">#${o.id.slice(0, 8).toUpperCase()}</span>
                  <p class="font-display text-xs text-praia-sand-400 mt-0.5">${fmtDate(o.created_at)}</p>
                </div>
                <span class="font-display font-bold text-praia-teal-800 text-base">${fmtPrice(o.total)}</span>
              </div>
              <div class="flex items-center gap-3">
                ${isPending ? '<span class="font-display text-[10px] uppercase tracking-wider font-bold text-praia-green-600">alterado</span>' : ''}
                <select onchange="updateOrderStatus('${o.id}', this.value)"
                  class="font-display text-xs px-3 py-1.5 rounded-lg border border-praia-sand-200 ${statusColors[currentStatus] || ''}">
                  <option value="pendente" ${currentStatus === 'pendente' ? 'selected' : ''}>Pendente</option>
                  <option value="processado" ${currentStatus === 'processado' ? 'selected' : ''}>Em processamento</option>
                  <option value="enviado" ${currentStatus === 'enviado' ? 'selected' : ''}>Enviado</option>
                  <option value="entregue" ${currentStatus === 'entregue' ? 'selected' : ''}>Entregue</option>
                  <option value="cancelado" ${currentStatus === 'cancelado' ? 'selected' : ''}>Cancelado</option>
                </select>
                <button onclick="toggleOrderExpand('${o.id}')" class="admin-btn py-1 px-3 text-xs" id="order-toggle-${o.id}">▼ Detalhes</button>
              </div>
            </div>
            <!-- Quick info row -->
            <div class="px-5 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs font-display border-b border-praia-sand-50">
              <span class="text-praia-sand-500"><strong class="text-praia-teal-800">Email:</strong> ${o.email || '-'}</span>
              <span class="text-praia-sand-500"><strong class="text-praia-teal-800">Envio:</strong> ${o.shipping_zone === 'ilhas' ? 'Açores/Madeira' : 'Continental'} ${o.shipping_price === 0 ? '(grátis)' : fmtPrice(o.shipping_price)}</span>
              <span class="text-praia-sand-500"><strong class="text-praia-teal-800">Itens:</strong> ${items.reduce((s, i) => s + i.quantity, 0)}</span>
            </div>
            <!-- Expandable details -->
            <div id="order-expand-${o.id}" class="hidden">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4 px-5 py-4">
                <!-- Morada de envio -->
                <div>
                  <p class="text-[10px] uppercase tracking-wider text-praia-sand-400 mb-1.5 font-display font-semibold">Morada de envio</p>
                  <div class="text-sm text-praia-teal-800 font-display space-y-0.5">
                    ${addrParts.map(p => `<p>${p}</p>`).join('')}
                  </div>
                </div>
                <!-- Itens -->
                <div>
                  <p class="text-[10px] uppercase tracking-wider text-praia-sand-400 mb-1.5 font-display font-semibold">Itens</p>
                  <div class="space-y-1">
                    ${items.map(item => {
                      const details = [];
                      if (item.variant && item.variant !== 'sem-variante') details.push(`Tamanho: ${item.variant}`);
                      if (item.beach) details.push(`Praia: ${item.beach}`);
                      return `
                      <div class="flex justify-between text-sm font-display items-start gap-4">
                        <div>
                          <span class="text-praia-sand-600">${item.name} × ${item.quantity}</span>
                          ${details.length ? `<div class="text-[11px] text-praia-teal-600 mt-0.5">${details.join(' · ')}</div>` : ''}
                        </div>
                        <span class="font-semibold text-praia-teal-800 flex-shrink-0">${item.price === 0 ? 'Grátis' : fmtPrice(item.price * item.quantity)}</span>
                      </div>`;
                    }).join('')}
                  </div>
                </div>
              </div>
              <!-- Totals -->
              <div class="px-5 py-3 bg-praia-sand-50 border-t border-praia-sand-100">
                <div class="flex flex-wrap gap-x-6 gap-y-1 text-xs font-display">
                  <span class="text-praia-sand-500">Subtotal: <strong class="text-praia-teal-800">${fmtPrice(o.subtotal)}</strong></span>
                  <span class="text-praia-sand-500">Envio: <strong class="text-praia-teal-800">${o.shipping_price === 0 ? 'Grátis' : fmtPrice(o.shipping_price)}</strong></span>
                  <span class="text-praia-sand-500">Total: <strong class="text-praia-teal-800 text-sm">${fmtPrice(o.total)}</strong></span>
                  <span class="text-praia-sand-400 ml-auto">Stripe: ${o.stripe_session_id ? o.stripe_session_id.slice(0, 20) + '…' : '-'}</span>
                </div>
              </div>
            </div>
          </div>`;
      }).join('')}
    </div>`;

  _updateOrderButtons();
}

function toggleOrderExpand(orderId) {
  const el = document.getElementById('order-expand-' + orderId);
  const btn = document.getElementById('order-toggle-' + orderId);
  if (!el) return;
  const isHidden = el.classList.contains('hidden');
  el.classList.toggle('hidden');
  if (btn) btn.textContent = isHidden ? '▲ Fechar' : '▼ Detalhes';
}

function updateOrderStatus(orderId, newStatus) {
  const original = window._ordersOriginalStatus[orderId];
  if (newStatus === original) {
    delete window._ordersPendingChanges[orderId];
  } else {
    window._ordersPendingChanges[orderId] = newStatus;
  }
  // Update local data too
  const order = (window._adminOrders || []).find(o => o.id === orderId);
  if (order) order.status = newStatus;
  // Re-render to update card border + buttons
  renderEncomendasContent();
}

async function saveOrderChanges() {
  const changes = window._ordersPendingChanges;
  const ids = Object.keys(changes);
  if (!ids.length) { toast('Não existem alterações por gravar.', 'info'); return; }
  if (!confirm(`Gravar ${ids.length} alteraç${ids.length === 1 ? 'ão' : 'ões'} de estado? As alterações serão visíveis para os utilizadores.`)) return;

  const updates = ids.map(id => ({ id, status: changes[id] }));

  try {
    const resp = await fetch('/api/update-order-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    });
    const result = await resp.json();

    if (!resp.ok || result.errors > 0) {
      const failCount = result.errors || ids.length;
      toast(`${failCount} erro(s) ao gravar. Verifique a consola.`, 'error');
      console.error('Erros ao gravar encomendas:', result.results);
    } else {
      ids.forEach(id => { window._ordersOriginalStatus[id] = changes[id]; });
      window._ordersPendingChanges = {};
      _updateOrderButtons();
      renderEncomendasContent();
      toast(`${ids.length} encomenda${ids.length !== 1 ? 's' : ''} atualizada${ids.length !== 1 ? 's' : ''} com sucesso.`, 'success');
    }
  } catch (err) {
    toast('Erro de rede ao gravar: ' + err.message, 'error');
    console.error(err);
  }
}

function discardOrderChanges() {
  const ids = Object.keys(window._ordersPendingChanges);
  if (!ids.length) return;
  // Revert local data
  ids.forEach(id => {
    const order = (window._adminOrders || []).find(o => o.id === id);
    if (order) order.status = window._ordersOriginalStatus[id];
  });
  window._ordersPendingChanges = {};
  renderEncomendasContent();
  toast('Alterações descartadas.', 'info');
}

// ─── Editor Visual — Editor Visual Inline ───
const CONTENT_PAGES = [
  { id: 'index',           label: 'Início',                file: 'index.html' },
  { id: 'votar',           label: 'Votar',                 file: 'votar.html' },
  { id: 'rede',            label: 'Rede de Praias',        file: 'rede.html' },
  { id: 'passaporte',      label: 'Passaporte',            file: 'passaporte.html' },
  { id: 'artigos',         label: 'Novidades',             file: 'artigos.html' },
  { id: 'loja',            label: 'Loja',                  file: 'loja.html' },
  { id: 'carrinho',        label: 'Carrinho',              file: 'carrinho.html' },
  { id: 'descontos',       label: 'Descontos',             file: 'descontos.html' },
  { id: 'onde-encontrar',  label: 'Onde Encontrar Guia',   file: 'onde-encontrar.html' },
  { id: 'onde-carimbar',   label: 'Onde Carimbar',         file: 'onde-carimbar-passaporte.html' },
  { id: 'contactos',       label: 'Contactos',             file: 'contactos.html' },
];
const PAGE_SETTINGS_FIELDS = {
  index: [
    { path: 'seo.homepageTitle',       label: 'Título SEO',           hint: 'Aparece nos resultados Google. Ideal: até 60 caracteres.', max: 60 },
    { path: 'seo.homepageDescription', label: 'Descrição SEO',        hint: 'Resumo nos resultados Google. Ideal: até 160 caracteres.', max: 160, type: 'textarea' },
    { path: 'global.ogImage',          label: 'Imagem partilha redes sociais', type: 'image' },
    { path: 'global.logoUrl',          label: 'Logotipo principal',   type: 'image' },
    { path: 'global.logoWhiteUrl',     label: 'Logotipo branco (rodapé)', type: 'image' },
  ],
};

const _content = {
  current: null,            // estado atual em memória (objeto content)
  history: [],              // stack de snapshots para undo
  redoStack: [],
  dirty: false,
  baseline: null,           // JSON do estado gravado, para comparar e calcular dirty real
  page: 'index',
  device: 'desktop',
  unsavedListeners: false,
};

function _baselinePayload() {
  const datasets = {};
  for (const ds of _SNAPSHOT_DATASETS || []) {
    if (state.data[ds] != null) datasets[ds] = state.data[ds];
  }
  return {
    content: _content.current || state.editingContent || {},
    layout:  state.data.layout || {},
    datasets,
  };
}
function _contentSetBaseline() {
  try { _content.baseline = JSON.stringify(_baselinePayload()); }
  catch { _content.baseline = null; }
}
function _recomputeDirty() {
  if (_content.baseline == null) { _markUnsaved(); return; }
  let cur;
  try { cur = JSON.stringify(_baselinePayload()); } catch { cur = null; }
  if (cur === _content.baseline) {
    _clearUnsaved();
    // Limpar também o publish-bar para esta sessão de edição visual
    _autoSave.pending.delete('layout');
    _autoSave.pending.delete('conteudo');
    try { _renderPublishBar(); } catch {}
  } else {
    _markUnsaved();
  }
}

// Datasets que entram no snapshot do undo/redo do editor visual.
const _SNAPSHOT_DATASETS = ['beaches','articles','locations-guia-passaporte','locations-carimbos','descontos','produtos','settings'];

function _contentSnapshot() {
  // Captura estado de tudo o que pode ser revertido por undo/redo:
  // content (textos/overrides), layout, e todos os datasets do admin que
  // podem ser editados via data-content-bind no preview.
  const datasets = {};
  for (const ds of _SNAPSHOT_DATASETS) {
    if (state.data[ds] != null) {
      try { datasets[ds] = JSON.parse(JSON.stringify(state.data[ds])); } catch {}
    }
  }
  return {
    content:  JSON.parse(JSON.stringify(_content.current)),
    layout:   JSON.parse(JSON.stringify(state.data.layout || {})),
    datasets,
  };
}
function _contentPushHistory() {
  _content.history.push(_contentSnapshot());
  if (_content.history.length > 50) _content.history.shift();
  _content.redoStack = [];
}
function _writeContentDraft() {
  // Mantém o draft em localStorage sincronizado com o estado em memória, para
  // que o content-loader o possa servir após qualquer reload do iframe (p.ex.
  // undo/redo, mudança de página).
  try { localStorage.setItem('_contentDraft', JSON.stringify(_content.current || {})); } catch {}
  try { sessionStorage.setItem('_contentDraft', JSON.stringify(_content.current || {})); } catch {}
}
function _restoreSnapshot(snap) {
  if (!snap) return;
  // Aceita formato antigo (sem .content) e novo
  const c = snap.content || snap;
  const l = snap.layout  || {};
  _content.current = JSON.parse(JSON.stringify(c));
  state.data['conteudo'] = _content.current;
  state.data.layout = JSON.parse(JSON.stringify(l));
  state.data['layout'] = state.data.layout;
  // Restaurar datasets capturados (beaches/articles/produtos/...).
  if (snap.datasets) {
    for (const ds of _SNAPSHOT_DATASETS) {
      if (snap.datasets[ds] != null) {
        try { state.data[ds] = JSON.parse(JSON.stringify(snap.datasets[ds])); } catch {}
      }
    }
  }
  // Re-render se a secção actual coincide
  try {
    if (state.currentSection && _SNAPSHOT_DATASETS.includes(state.currentSection)) {
      renderSection();
    }
  } catch {}
  // Reflectir undo/redo recarregando o iframe com ?preview=draft. É o caminho
  // mais seguro para garantir que mutações estruturais (duplicações, wraps em
  // <a>, remoções de overrides) são totalmente revertidas — apply-state via
  // postMessage não consegue desfazer alterações que já tinham sido aplicadas
  // ao DOM, só reaplicar overrides existentes.
  _writeContentDraft();
  _writeDatasetDrafts();
  const iframe = document.getElementById('content-iframe');
  if (iframe) {
    iframe.src = _contentIframeSrc({ draft: true });
  }
}

function _writeDatasetDrafts() {
  for (const ds of _SNAPSHOT_DATASETS) {
    if (state.data[ds] == null) continue;
    try { localStorage.setItem('_datasetDraft:' + ds, JSON.stringify(state.data[ds])); } catch {}
    try { sessionStorage.setItem('_datasetDraft:' + ds, JSON.stringify(state.data[ds])); } catch {}
  }
}
function _setByPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i], next = parts[i + 1];
    if (cur[k] == null) cur[k] = /^\d+$/.test(next) ? [] : {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}
function _getByPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function _updateSaveBtn() {
  const localBtn = document.getElementById('content-save-local-btn');
  const pubBtn   = document.getElementById('content-save-btn');
  const dirty    = _content.dirty;

  // Estilo partilhado para estado desativado
  const disabledStyle = (b) => {
    b.disabled = true;
    b.style.background = '#C4B898';
    b.style.cursor = 'not-allowed';
    b.style.opacity = '.45';
    b.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,.06)';
    b.style.filter = 'grayscale(.3)';
    b.onmouseover = null;
    b.onmouseout = null;
  };

  if (localBtn) {
    if (dirty) {
      localBtn.disabled = false;
      localBtn.style.background = '#0288D1';
      localBtn.style.cursor = 'pointer';
      localBtn.style.opacity = '1';
      localBtn.style.boxShadow = '0 6px 18px rgba(2,136,209,.28)';
      localBtn.style.filter = '';
      localBtn.onmouseover = () => { localBtn.style.transform = 'translateY(-1px)'; localBtn.style.boxShadow = '0 10px 24px rgba(2,136,209,.38)'; };
      localBtn.onmouseout  = () => { localBtn.style.transform = ''; localBtn.style.boxShadow = '0 6px 18px rgba(2,136,209,.28)'; };
    } else {
      disabledStyle(localBtn);
    }
  }

  if (pubBtn) {
    if (dirty) {
      pubBtn.disabled = false;
      pubBtn.style.background = '#43A047';
      pubBtn.style.cursor = 'pointer';
      pubBtn.style.opacity = '1';
      pubBtn.style.boxShadow = '0 6px 18px rgba(67,160,71,.32)';
      pubBtn.style.filter = '';
      pubBtn.onmouseover = () => { pubBtn.style.transform = 'translateY(-1px)'; pubBtn.style.boxShadow = '0 10px 24px rgba(67,160,71,.42)'; };
      pubBtn.onmouseout  = () => { pubBtn.style.transform = ''; pubBtn.style.boxShadow = '0 6px 18px rgba(67,160,71,.32)'; };
    } else {
      disabledStyle(pubBtn);
    }
  }
}
function _markUnsaved() {
  _content.dirty = true;
  const badge = document.getElementById('content-dirty-badge');
  if (badge) badge.style.display = 'inline-flex';
  _updateSaveBtn();
  if (!_content.unsavedListeners) {
    window.addEventListener('beforeunload', _beforeUnloadGuard);
    _content.unsavedListeners = true;
  }
}
function _clearUnsaved() {
  _content.dirty = false;
  const badge = document.getElementById('content-dirty-badge');
  if (badge) badge.style.display = 'none';
  _updateSaveBtn();
  window.removeEventListener('beforeunload', _beforeUnloadGuard);
  _content.unsavedListeners = false;
}
function _beforeUnloadGuard(e) { e.preventDefault(); e.returnValue = ''; }

function renderConteudo(container) {
  // Inicializar estado a partir de state.editingContent (já carregado em initDashboard)
  if (!_content.current) _content.current = JSON.parse(JSON.stringify(state.editingContent || {}));
  if (_content.baseline == null) _contentSetBaseline();

  const deviceWidths = { desktop: '100%', tablet: '768px', mobile: '375px' };
  const w = deviceWidths[_content.device];

  const fs = _content.fullscreen;
  const wrapStyle = fs
    ? 'position:fixed;inset:0;z-index:9999;background:#FAF8F5;display:flex;flex-direction:column;'
    : 'height:100vh;display:flex;flex-direction:column;';
  // Estilos partilhados dos botões topbar — cápsulas elegantes com hover lift
  const tbBtn   = "display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 14px;border-radius:10px;border:1px solid #E2D9C6;background:#fff;color:#003A40;font:600 12.5px 'Poppins',system-ui,sans-serif;letter-spacing:.01em;cursor:pointer;transition:transform .15s cubic-bezier(.34,1.56,.64,1),box-shadow .15s,border-color .15s,background .15s;box-shadow:0 1px 0 rgba(0,58,64,.04);";
  const tbBtnH  = "onmouseover=\"this.style.borderColor='#003A40';this.style.transform='translateY(-1px)';this.style.boxShadow='0 6px 16px rgba(0,58,64,.12)'\" onmouseout=\"this.style.borderColor='#E2D9C6';this.style.transform='';this.style.boxShadow='0 1px 0 rgba(0,58,64,.04)'\"";
  container.innerHTML = `
    <div class="flex flex-col" id="content-wrap" style="${wrapStyle}">
      <!-- Topbar -->
      <div class="flex items-center gap-2.5 px-5 py-3 bg-white border-b border-praia-sand-200 flex-wrap" style="box-shadow:0 1px 0 rgba(0,58,64,.04);">
        <div>
          <h1 class="font-display text-lg font-bold text-praia-teal-800">Editor Visual</h1>
          <p class="text-[11px] text-praia-sand-500">Clique em qualquer texto ou imagem do site para editar.</p>
        </div>
        <select id="content-page-sel" onchange="contentSwitchPage(this.value)"
                style="${tbBtn}padding-right:32px;background-image:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23003A40%22 stroke-width=%223%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><polyline points=%226 9 12 15 18 9%22/></svg>');background-repeat:no-repeat;background-position:right 12px center;-webkit-appearance:none;appearance:none;" ${tbBtnH}>
          <optgroup label="Páginas estáticas">
            ${CONTENT_PAGES.map(p => `<option value="${p.id}" ${_content.page===p.id?'selected':''}>${p.label}</option>`).join('')}
          </optgroup>
          <optgroup label="Páginas dinâmicas">
            <option value="__dyn:praia"   ${_content.page==='__dyn:praia'?'selected':''}>Praia individual…</option>
            <option value="__dyn:artigo"  ${_content.page==='__dyn:artigo'?'selected':''}>Artigo individual…</option>
            <option value="__dyn:produto" ${_content.page==='__dyn:produto'?'selected':''}>Produto individual…</option>
          </optgroup>
        </select>
        <select id="content-dyn-sel" onchange="contentSwitchDynItem(this.value)"
                style="${tbBtn}padding-right:32px;background-image:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23003A40%22 stroke-width=%223%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><polyline points=%226 9 12 15 18 9%22/></svg>');background-repeat:no-repeat;background-position:right 12px center;-webkit-appearance:none;appearance:none;display:${(_content.page||'').startsWith('__dyn:') || (_content.dynKind?true:false) ? 'inline-flex':'none'};" ${tbBtnH}>
          ${_renderDynOptions()}
        </select>

        <div class="flex items-center" style="background:#F5F0E8;border:1px solid #E2D9C6;border-radius:10px;padding:3px;gap:2px;">
          ${['desktop','tablet','mobile'].map(d => {
            const active = _content.device===d;
            const ico = d==='desktop'
              ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>'
              : d==='tablet'
              ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>'
              : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>';
            return `<button onclick="contentSetDevice('${d}')" title="${d}"
              style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:30px;border-radius:7px;border:0;cursor:pointer;${active?'background:#fff;color:#003A40;box-shadow:0 2px 6px rgba(0,58,64,.12);':'background:transparent;color:#8A7D60;'}transition:all .15s;">${ico}</button>`;
          }).join('')}
        </div>

        <div class="flex items-center" style="gap:4px;">
          <button onclick="contentUndo()" title="Anular (Ctrl+Z)"
            style="${tbBtn}width:38px;padding:0;justify-content:center;" ${tbBtnH}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/></svg>
          </button>
          <button onclick="contentRedo()" title="Refazer (Ctrl+Shift+Z)"
            style="${tbBtn}width:38px;padding:0;justify-content:center;" ${tbBtnH}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 15-6.7L21 13"/></svg>
          </button>
        </div>

        <button onclick="contentOpenPageSettings()" style="${tbBtn}" ${tbBtnH}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Definições
        </button>

        <button onclick="contentPreviewVisitor()" style="${tbBtn}" ${tbBtnH}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          Pré-visualizar
        </button>

        <button onclick="contentToggleLayoutMode()" id="content-layout-btn" title="Modo Layout (drag/resize)"
          style="${tbBtn}${_content.layoutMode?'background:#FFEB3B;border-color:#FDD835;color:#003A40;box-shadow:0 6px 16px rgba(253,216,53,.4);':''}" ${tbBtnH}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
          Layout
        </button>

        <button onclick="contentToggleFullscreen()" title="${fs?'Sair de ecrã inteiro (Esc)':'Ecrã inteiro (F)'}"
          style="${tbBtn}" ${tbBtnH}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
          ${fs ? 'Sair' : 'Ecrã inteiro'}
        </button>

        <span id="content-dirty-badge"
          class="ml-auto items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
          style="display:none;background:#FFF3CD;color:#8A6D00;border:1px solid #FFE69C;">● alterações por publicar</span>

        <button onclick="discardAndReload()" title="Recarregar página e descartar alterações não guardadas"
          style="${tbBtn}" ${tbBtnH}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-7"/><path d="M3 3v6h6"/></svg>
          Recarregar
        </button>

        <button onclick="contentOpenHistory()" style="${tbBtn}" ${tbBtnH}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
          Histórico
        </button>

        <button onclick="contentSaveLocal()" id="content-save-local-btn" disabled
          style="display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 16px;border-radius:10px;border:0;background:#C4B898;color:#fff;font:700 12.5px 'Poppins',system-ui,sans-serif;letter-spacing:.02em;cursor:not-allowed;opacity:.45;transition:transform .15s cubic-bezier(.34,1.56,.64,1),box-shadow .15s,background .15s,opacity .15s;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          GUARDAR RASCUNHO
        </button>
        <button onclick="contentSave()" id="content-save-btn" disabled
          style="display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 16px;border-radius:10px;border:0;background:#C4B898;color:#fff;font:700 12.5px 'Poppins',system-ui,sans-serif;letter-spacing:.02em;cursor:not-allowed;opacity:.45;transition:transform .15s cubic-bezier(.34,1.56,.64,1),box-shadow .15s,background .15s,opacity .15s;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>
          PUBLICAR
        </button>
      </div>

      <!-- Iframe canvas -->
      <div class="flex-1 bg-praia-sand-100 flex justify-center items-stretch p-4" style="min-height:0;">
        <iframe id="content-iframe"
          src="${_contentIframeSrc()}"
          style="width:${w};max-width:100%;height:100%;border:0;border-radius:14px;background:white;box-shadow:0 12px 40px rgba(0,0,0,.12);transition:width .25s;">
        </iframe>
      </div>
    </div>
  `;

  // Bridge postMessage
  if (!window.__contentBridgeInit) {
    window.__contentBridgeInit = true;
    window.addEventListener('message', _contentOnMessage);
  }
  // Sincronizar estado inicial do botão Gravar
  _updateSaveBtn();

  // Re-baselinar quando o iframe acaba de carregar — garante que os datasets
  // assíncronos (layout, etc.) estão todos no estado antes de comparar.
  // Sem isto, o carregamento tardio do layout marca falsamente como "sujo".
  const ifr = document.getElementById('content-iframe');
  if (ifr) {
    ifr.addEventListener('load', () => {
      // Pequeno delay para deixar data-loader/content-loader/layout-overrides
      // do iframe correrem e popularem state.data.layout no admin via DataLoader.
      setTimeout(async () => {
        try {
          if (window.DataLoader) {
            // Recarregar layout fresco do servidor para incluir no baseline
            state.data['layout'] = (await window.DataLoader.loadDataset('layout')) || {};
          }
        } catch {}
        if (!_content.dirty && _autoSave.pending.size === 0) {
          _contentSetBaseline();
        }
      }, 400);
    });
  }
}

function _contentIframeSrc(opts) {
  const draft = opts && opts.draft ? '&preview=draft' : '';
  // Suporta páginas dinâmicas: _content.page = 'praia:<id>' | 'artigo:<slug>' | 'produto:<id>'
  if (_content.dynKind && _content.dynItem) {
    if (_content.dynKind === 'praia')   return `praia.html?id=${encodeURIComponent(_content.dynItem)}&edit=1${draft}&_=${Date.now()}`;
    if (_content.dynKind === 'artigo')  return `artigo.html?slug=${encodeURIComponent(_content.dynItem)}&edit=1${draft}&_=${Date.now()}`;
    if (_content.dynKind === 'produto') return `produto.html?id=${encodeURIComponent(_content.dynItem)}&edit=1${draft}&_=${Date.now()}`;
  }
  const page = CONTENT_PAGES.find(p => p.id === _content.page) || CONTENT_PAGES[0];
  return `${page.file}?edit=1${draft}&_=${Date.now()}`;
}

function _renderDynOptions() {
  const kind = _content.dynKind;
  if (!kind) return '<option value="">- escolher -</option>';
  let items = [];
  if (kind === 'praia') {
    items = (state.data['beaches'] || []).map(b => ({ id: b.id, label: b.name }));
  } else if (kind === 'artigo') {
    items = (state.data['articles'] || []).map(a => ({ id: a.slug, label: a.title }));
  } else if (kind === 'produto') {
    items = (state.data['produtos'] || []).map(p => ({ id: p.id, label: p.name }));
  }
  return ['<option value="">- escolher -</option>']
    .concat(items.map(it => `<option value="${escHtml(it.id)}" ${_content.dynItem===it.id?'selected':''}>${escHtml(it.label)}</option>`))
    .join('');
}

function contentSwitchDynItem(itemId) {
  if (!itemId) return;
  _content.dynItem = itemId;
  _reloadContentIframe();
}

function _contentOnMessage(e) {
  const m = e.data || {};
  if (!m.type) return;
  if (m.type === 'inline-editor-ready') return;
  // 'dirty'/'clean' do inline-editor são heurísticas sobre contenteditable;
  // ignoramos completamente — só consideramos sujo quando chega uma mensagem
  // de mutação real (content-change, override-change, layout-change, etc.).
  if (m.type === 'dirty' || m.type === 'clean') return;
  if (m.type === 'content-change') {
    _contentPushHistory();
    _setByPath(_content.current, m.path, m.value);
    state.data['conteudo'] = _content.current;
    _writeContentDraft();
    markDirty('conteudo');
    _recomputeDirty();
  } else if (m.type === 'content-list-change') {
    _contentPushHistory();
    _setByPath(_content.current, m.path, m.value);
    state.data['conteudo'] = _content.current;
    _writeContentDraft();
    markDirty('conteudo');
    _recomputeDirty();
  } else if (m.type === 'sections-order-change') {
    _contentPushHistory();
    _setByPath(_content.current, 'homepage.sectionsOrder', m.value);
    state.data['conteudo'] = _content.current;
    _writeContentDraft();
    markDirty('conteudo');
    _recomputeDirty();
  } else if (m.type === 'settings-change') {
    // Backward compat: trata como dataset-change para 'settings'.
    m = { type: 'dataset-change', dataset: 'settings', path: m.path, value: m.value };
  }
  if (m.type === 'dataset-change') {
    // Edit feita no editor visual sobre um campo ligado a um dataset do
    // admin (settings, beaches, articles, descontos, produtos, locations…).
    // Atualiza state.data[<section>], marca como pendente, e re-renderiza
    // a secção correspondente se estiver aberta — sincronizando os dois
    // sentidos (Conteúdo ↔ secção dedicada do admin).
    const ds = m.dataset;
    if (!SECTION_TO_DATASET[ds]) {
      console.warn('[dataset-change] dataset desconhecido:', ds);
      return;
    }
    _contentPushHistory();
    if (state.data[ds] == null) {
      // Inicializa como array se o primeiro segmento for um índice numérico
      const firstSeg = (m.path || '').split('.')[0];
      state.data[ds] = /^\d+$/.test(firstSeg) ? [] : {};
    }
    _setByPath(state.data[ds], m.path, m.value);
    _writeDatasetDrafts();
    markDirty(ds);
    if (state.currentSection === ds) {
      try { renderSection(); } catch {}
    }
    _recomputeDirty();
    return;
  }
  if (m.type === 'duplicate-element') {
    // Persistir clones criados no modo Layout. Guardamos uma lista por
    // página em content.overrides[page].__duplicates: [{ afterSelector, html }]
    _contentPushHistory();
    if (!_content.current.overrides) _content.current.overrides = {};
    if (!_content.current.overrides[m.page]) _content.current.overrides[m.page] = {};
    const ov = _content.current.overrides[m.page];
    if (!Array.isArray(ov.__duplicates)) ov.__duplicates = [];
    ov.__duplicates.push({ afterSelector: m.afterSelector, html: m.html });
    state.data['conteudo'] = _content.current;
    _writeContentDraft();
    markDirty('conteudo');
    _recomputeDirty();
    return;
  }
  if (m.type === 'override-change') {
    _contentPushHistory();
    if (!_content.current.overrides) _content.current.overrides = {};
    if (!_content.current.overrides[m.page]) _content.current.overrides[m.page] = {};
    const existing = _content.current.overrides[m.page][m.selector] || {};
    _content.current.overrides[m.page][m.selector] = { ...existing, ...m.value };
    state.data['conteudo'] = _content.current;
    _writeContentDraft();
    markDirty('conteudo');
    _recomputeDirty();
  } else if (m.type === 'layout-change') {
    // Push history ANTES de mutar para podermos fazer undo
    _contentPushHistory();
    if (!state.data.layout) state.data.layout = {};
    if (!state.data.layout[m.page]) state.data.layout[m.page] = {};
    const existing = state.data.layout[m.page][m.selector] || {};
    const merged = { ...(existing.desktop || {}), ...m.value };
    state.data.layout[m.page][m.selector] = { ...existing, desktop: merged };
    if (!SECTION_TO_DATASET['layout']) SECTION_TO_DATASET['layout'] = 'layout';
    state.data['layout'] = state.data.layout;
    markDirty('layout');
    _recomputeDirty();
  }
}

function contentToggleLayoutMode() {
  _content.layoutMode = !_content.layoutMode;
  const iframe = document.getElementById('content-iframe');
  if (iframe && iframe.contentWindow) {
    try { iframe.contentWindow.postMessage({ type: 'layout-mode', on: _content.layoutMode }, '*'); } catch {}
  }
  const btn = document.getElementById('content-layout-btn');
  if (btn) {
    if (_content.layoutMode) {
      btn.style.background = '#FFEB3B';
      btn.style.borderColor = '#FDD835';
      btn.style.color = '#003A40';
      btn.style.boxShadow = '0 6px 18px rgba(253,216,53,.45)';
    } else {
      btn.style.background = '#fff';
      btn.style.borderColor = '#E2D9C6';
      btn.style.color = '#003A40';
      btn.style.boxShadow = '0 1px 0 rgba(0,58,64,.04)';
    }
  }
}

function contentSwitchPage(pageId) {
  if (_content.dirty && !confirm('Há alterações por gravar. Mudar de página vai recarregar o preview mas as alterações em memória mantêm-se. Continuar?')) {
    document.getElementById('content-page-sel').value = _content.page;
    return;
  }
  // Páginas dinâmicas: __dyn:praia | __dyn:artigo | __dyn:produto
  if (typeof pageId === 'string' && pageId.startsWith('__dyn:')) {
    _content.dynKind = pageId.split(':')[1];
    _content.dynItem = null;
    _content.page = pageId;
    // Re-render para mostrar o segundo dropdown
    renderConteudo(document.getElementById('admin-content'));
    return;
  }
  _content.dynKind = null;
  _content.dynItem = null;
  _content.page = pageId;
  _reloadContentIframe();
}

function _reloadContentIframe() {
  const iframe = document.getElementById('content-iframe');
  if (!iframe) {
    renderConteudo(document.getElementById('admin-content'));
    return;
  }
  // Listener de load para garantir re-init do editor inline depois do DOM ficar pronto
  const onLoad = () => {
    iframe.removeEventListener('load', onLoad);
    // Pequeno delay para deixar content-loader correr
    setTimeout(() => {
      try { iframe.contentWindow.postMessage({ type: 're-init-editor' }, '*'); } catch {}
    }, 200);
    // Repetições defensivas (GSAP/scripts tardios)
    setTimeout(() => { try { iframe.contentWindow.postMessage({ type: 're-init-editor' }, '*'); } catch {} }, 800);
    setTimeout(() => { try { iframe.contentWindow.postMessage({ type: 're-init-editor' }, '*'); } catch {} }, 2000);
  };
  iframe.addEventListener('load', onLoad);
  iframe.src = _contentIframeSrc();
}

function contentSetDevice(d) {
  _content.device = d;
  renderConteudo(document.getElementById('admin-content'));
}

function contentToggleFullscreen() {
  _content.fullscreen = !_content.fullscreen;
  renderConteudo(document.getElementById('admin-content'));
}

function contentUndo() {
  if (!_content.history.length) { toast('Nada para anular.', 'info'); return; }
  _content.redoStack.push(_contentSnapshot());
  _restoreSnapshot(_content.history.pop());
  _recomputeDirty();
}
function contentRedo() {
  if (!_content.redoStack.length) { toast('Nada para refazer.', 'info'); return; }
  _content.history.push(_contentSnapshot());
  _restoreSnapshot(_content.redoStack.pop());
  _recomputeDirty();
}

function contentSaveLocal() {
  if (!_content.dirty) { toast('Não existem alterações por guardar.', 'info'); return; }
  _writeContentDraft();
  // Guardar também snapshots dos datasets editáveis
  for (const ds of _SNAPSHOT_DATASETS) {
    if (state.data[ds] != null) {
      try { localStorage.setItem('_datasetDraft:' + ds, JSON.stringify(state.data[ds])); } catch {}
      try { sessionStorage.setItem('_datasetDraft:' + ds, JSON.stringify(state.data[ds])); } catch {}
    }
  }
  toast('Rascunho guardado localmente. As alterações serão preservadas se mudar de página no editor.', 'success');
}

async function contentSave() {
  if (!_content.dirty) { toast('Não existem alterações por publicar.', 'info'); return; }

  // Confirmação antes de publicar (semelhante às outras secções)
  if (!confirm('As alterações serão publicadas no site em produção e ficarão imediatamente visíveis para todos os visitantes.\n\nDeseja continuar?')) return;

  // Validações soft
  const warnings = [];
  const seoTitle = _getByPath(_content.current, 'seo.homepageTitle') || '';
  if (seoTitle.length > 60) warnings.push(`Título SEO tem ${seoTitle.length} caracteres (recomendado ≤ 60).`);
  const seoDesc = _getByPath(_content.current, 'seo.homepageDescription') || '';
  if (seoDesc.length > 160) warnings.push(`Descrição SEO tem ${seoDesc.length} caracteres (recomendado ≤ 160).`);
  if (warnings.length && !confirm('Avisos:\n\n' + warnings.join('\n') + '\n\nPublicar mesmo assim?')) return;

  try {
    const res = await fetch('/api/save-content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: _content.current }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'erro');
    state.editingContent = JSON.parse(JSON.stringify(_content.current));
    _contentSetBaseline();
    _clearUnsaved();
    try { localStorage.removeItem('_contentDraft'); } catch {}
    try { sessionStorage.removeItem('_contentDraft'); } catch {}
    // Limpar do publish-bar
    _autoSave.pending.delete('conteudo');
    try { _renderPublishBar(); } catch {}
    toast('Conteúdo publicado com sucesso! O site público já reflete as alterações.', 'success');
    document.getElementById('content-iframe').src = _contentIframeSrc();
  } catch (e) {
    toast('Erro ao publicar: ' + e.message, 'error');
  }
}

async function contentOpenHistory() {
  // Mostrar modal IMEDIATAMENTE com loader; carregar histórico em background
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/40 z-50 flex items-center justify-center';
  modal.style.animation = 'loaderFadeIn .15s ease';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `
    <div class="bg-white rounded-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] flex flex-col" style="box-shadow:0 30px 80px rgba(0,0,0,.3);">
      <h2 class="font-display text-xl font-bold text-praia-teal-800 mb-1">Histórico de versões</h2>
      <p class="text-sm text-praia-sand-500 mb-4">Restaure uma versão anterior do conteúdo.</p>
      <div id="hist-body" class="overflow-y-auto -mx-2 px-2 min-h-[200px] flex items-center justify-center">
        <div style="text-align:center;">
          <svg width="36" height="36" viewBox="0 0 36 36" style="animation:loaderSpin 1.2s linear infinite;">
            <circle cx="18" cy="18" r="14" fill="none" stroke="#E2D9C6" stroke-width="3.5"/>
            <circle cx="18" cy="18" r="14" fill="none" stroke="#003A40" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="35 100"/>
          </svg>
          <p style="font:600 12px 'Poppins',system-ui,sans-serif;color:#8A7D60;margin:10px 0 0;">A carregar histórico…</p>
        </div>
      </div>
      <div class="mt-4 flex justify-end">
        <button onclick="this.closest('.fixed').remove()" class="admin-btn admin-btn-ghost" style="margin:0;">Fechar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  // Fetch em background
  let history = [];
  try {
    const res = await fetch('/api/save-content', { cache: 'no-store' });
    const json = await res.json();
    history = json.history || [];
  } catch {}

  // Verifica se o modal ainda está montado (utilizador pode ter fechado)
  if (!modal.isConnected) return;
  const body = modal.querySelector('#hist-body');
  body.classList.remove('flex','items-center','justify-center');
  body.innerHTML = history.length
    ? history.map(h => `
        <div class="flex items-center justify-between py-3 border-b border-praia-sand-100">
          <div>
            <div class="font-display text-sm font-semibold text-praia-teal-800">${new Date(h.created_at).toLocaleString('pt-PT')}</div>
            ${h.note ? `<div class="text-xs text-praia-sand-500">${h.note}</div>` : ''}
          </div>
          <button onclick="contentRestoreVersion(${h.id})" class="admin-btn admin-btn-primary" style="margin:0;padding:6px 14px;font-size:12px;">Restaurar</button>
        </div>
      `).join('')
    : '<p class="text-sm text-praia-sand-500 text-center py-8">Sem versões anteriores.</p>';
}

async function contentRestoreVersion(id) {
  if (!confirm('Restaurar esta versão? As alterações por gravar serão perdidas.')) return;
  try {
    const res = await fetch('/api/save-content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restoreId: id }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'erro');
    _content.current = json.data;
    state.editingContent = JSON.parse(JSON.stringify(json.data));
    _clearUnsaved();
    document.querySelector('.fixed.inset-0')?.remove();
    document.getElementById('content-iframe').src = _contentIframeSrc();
    toast('Versão restaurada.', 'success');
  } catch (e) {
    toast('Erro: ' + e.message, 'error');
  }
}

function contentPreviewVisitor() {
  // Guardar draft em localStorage (acessível por outras abas) e abrir página com ?preview=draft
  try {
    localStorage.setItem('_contentDraft', JSON.stringify(_content.current));
    sessionStorage.setItem('_contentDraft', JSON.stringify(_content.current));
  } catch {}
  const page = CONTENT_PAGES.find(p => p.id === _content.page) || CONTENT_PAGES[0];
  window.open(`${page.file}?preview=draft&_=${Date.now()}`, '_blank');
}

function contentOpenPageSettings() {
  const fields = PAGE_SETTINGS_FIELDS[_content.page] || PAGE_SETTINGS_FIELDS.index;
  const fieldHtml = fields.map(f => {
    const val = _getByPath(_content.current, f.path) || '';
    if (f.type === 'image') {
      const id = f.path.replace(/\./g,'_');
      return `
        <label class="block text-xs uppercase tracking-wider font-semibold text-praia-teal-700 mt-4 mb-2">${f.label}</label>
        <div class="flex items-center gap-3">
          <img id="ps-img-${id}" src="${escHtml(val)}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;background:#FAF8F5;border:1px solid #E2D9C6;${val?'':'display:none;'}">
          <button onclick="document.getElementById('ps-file-${id}').click()" class="admin-btn admin-btn-primary" style="margin:0;">Carregar imagem</button>
          <input type="file" id="ps-file-${id}" accept="image/*" class="hidden" onchange="contentPageSettingsUploadImg('${f.path}','${id}',this.files[0])">
        </div>`;
    }
    if (f.type === 'textarea') {
      const len = val.length;
      const over = f.max && len > f.max;
      return `
        <label class="block text-xs uppercase tracking-wider font-semibold text-praia-teal-700 mt-4 mb-2">${f.label}</label>
        <textarea rows="3" oninput="contentPageSettingsSet('${f.path}',this.value); document.getElementById('ps-count-${f.path.replace(/\./g,'_')}').textContent = this.value.length + (${f.max||0} ? '/${f.max||0}' : '');"
          class="w-full p-2.5 border border-praia-sand-200 rounded-lg text-sm">${escHtml(val)}</textarea>
        <div class="text-[10px] text-${over?'amber-600':'praia-sand-400'} mt-1">${f.hint||''} <span id="ps-count-${f.path.replace(/\./g,'_')}">${len}${f.max?'/'+f.max:''}</span></div>`;
    }
    const len = val.length;
    const over = f.max && len > f.max;
    return `
      <label class="block text-xs uppercase tracking-wider font-semibold text-praia-teal-700 mt-4 mb-2">${f.label}</label>
      <input type="text" value="${escHtml(val)}" oninput="contentPageSettingsSet('${f.path}',this.value); document.getElementById('ps-count-${f.path.replace(/\./g,'_')}').textContent = this.value.length + (${f.max||0} ? '/${f.max||0}' : '');"
        class="w-full p-2.5 border border-praia-sand-200 rounded-lg text-sm">
      <div class="text-[10px] text-${over?'amber-600':'praia-sand-400'} mt-1">${f.hint||''} <span id="ps-count-${f.path.replace(/\./g,'_')}">${len}${f.max?'/'+f.max:''}</span></div>`;
  }).join('');

  const html = `
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onclick="if(event.target===this)this.remove()">
      <div class="bg-white rounded-2xl p-6 max-w-md w-full mx-4 max-h-[85vh] overflow-y-auto">
        <h2 class="font-display text-xl font-bold text-praia-teal-800 mb-1">Definições da página</h2>
        <p class="text-sm text-praia-sand-500 mb-4">SEO, partilhas e imagens globais. Lembre-se de publicar.</p>
        ${fieldHtml}
        <div class="mt-6 flex justify-end">
          <button onclick="this.closest('.fixed').remove()" class="admin-btn admin-btn-primary" style="margin:0;">Fechar</button>
        </div>
      </div>
    </div>
  `;
  const div = document.createElement('div');
  div.innerHTML = html;
  document.body.appendChild(div.firstElementChild);
}

function contentPageSettingsSet(path, value) {
  _contentPushHistory();
  _setByPath(_content.current, path, value);
  _markUnsaved();
}

async function contentPageSettingsUploadImg(path, id, file) {
  if (!file) return;
  try {
    const result = await uploadImageFile(file, 'content');
    contentPageSettingsSet(path, result.src);
    const img = document.getElementById('ps-img-' + id);
    if (img) { img.src = result.src; img.style.display = ''; }
    toast('Imagem carregada.', 'success');
  } catch {
    toast('Erro ao carregar imagem.', 'error');
  }
}

// Atalhos de teclado
document.addEventListener('keydown', (e) => {
  if (state.currentSection !== 'conteudo') return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); contentUndo(); }
  else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); contentRedo(); }
  else if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); contentSaveLocal(); }
  else if (e.key === 'F' && !e.ctrlKey && !e.metaKey && !e.target.matches('input,textarea,select')) {
    e.preventDefault(); contentToggleFullscreen();
  }
  else if (e.key === 'Escape' && _content.fullscreen) {
    _content.fullscreen = false; renderConteudo(document.getElementById('admin-content'));
  }
});

// Stub para preservar API antiga (caso seja chamada de algum sítio)
function _legacyRenderConteudo_unused(container) {
  const c = state.editingContent || {};
  const tabs = [
    { id: 'global', label: 'Global' },
    { id: 'homepage', label: 'Homepage' },
    { id: 'votar', label: 'Votação' },
    { id: 'artigos', label: 'Artigos' },
    { id: 'loja', label: 'Loja' },
    { id: 'descontos', label: 'Descontos' },
    { id: 'passaporte', label: 'Passaporte' },
    { id: 'rede', label: 'Rede' },
    { id: 'onde_guia', label: 'Onde Encontrar' },
    { id: 'onde_passaporte', label: 'Onde Carimbar' },
  ];
  const activeTab = state._conteudoTab || 'global';

  container.innerHTML = `
    <div class="p-6 max-w-3xl">
      <div class="flex items-center justify-between mb-4">
        <h1 class="font-display text-2xl font-bold text-praia-teal-800">Editor Visual</h1>
        <button onclick="exportContentJSON()" class="admin-btn admin-btn-export">Exportar content.json</button>
      </div>
      <p class="text-sm text-praia-sand-500 mb-5">Edite todos os textos e imagens do site. Após guardar, clique em "Exportar content.json" e substitua o ficheiro em <code>data/content.json</code>.</p>

      <!-- Tabs -->
      <div class="flex flex-wrap gap-2 mb-6">
        ${tabs.map(t => `
          <button onclick="switchConteudoTab('${t.id}')" class="px-4 py-2 rounded-xl text-sm font-display font-semibold transition-colors ${activeTab === t.id ? 'bg-praia-teal-800 text-white' : 'bg-white border border-praia-sand-200 text-praia-teal-700 hover:border-praia-teal-400'}">
            ${t.label}
          </button>
        `).join('')}
      </div>

      <!-- Tab Content -->
      <div id="conteudo-tab-body"></div>
    </div>`;

  renderConteudoTab(activeTab);
}

function switchConteudoTab(tabId) {
  // Save current tab values silently before switching (no toast)
  saveConteudoTabValues(state._conteudoTab || 'global', true);
  state._conteudoTab = tabId;
  renderConteudo(document.getElementById('admin-content'));
}

function renderConteudoTab(tabId) {
  const body = document.getElementById('conteudo-tab-body');
  if (!body) return;
  const c = state.editingContent || {};

  const field = (key, label, value, type = 'text') => `
    <div class="mb-4">
      <label>${label}</label>
      <input type="${type}" data-content-key="${key}" value="${escHtml(String(value || ''))}">
    </div>`;

  const textarea = (key, label, value, rows = 2) => `
    <div class="mb-4">
      <label>${label}</label>
      <textarea data-content-key="${key}" rows="${rows}">${escHtml(String(value || ''))}</textarea>
    </div>`;

  const imgField = (key, label, value) => {
    const id = key.replace(/\./g,'_');
    return `
    <div class="mb-4">
      <label>${label}</label>
      <input type="hidden" data-content-key="${key}" id="content-img-input-${id}" value="${escHtml(String(value || ''))}">
      <div id="img-preview-${id}" style="margin-bottom:8px;">${value ? `
        <div style="display:inline-flex;align-items:center;gap:10px;padding:8px;border:1px solid #E2D9C6;border-radius:10px;background:#FAF8F5;">
          <img src="${escHtml(value)}" style="height:56px;width:56px;object-fit:cover;border-radius:6px;">
          <button type="button" onclick="removeContentImg('${key}','${id}')" class="admin-btn admin-btn-danger" style="padding:4px 10px;font-size:11px;">Remover</button>
        </div>` : ''}</div>
      <label id="content-img-drop-${id}" for="content-img-file-${id}"
           ondragover="event.preventDefault();this.style.background='#EEF5F5';this.style.borderColor='#003A40';"
           ondragleave="this.style.background='';this.style.borderColor='#E2D9C6';"
           ondrop="event.preventDefault();this.style.background='';this.style.borderColor='#E2D9C6';handleContentImgFile(event.dataTransfer.files[0],'${key}','${id}');"
           style="display:block;cursor:pointer;border:2px dashed #E2D9C6;border-radius:10px;padding:18px;text-align:center;background:white;transition:all .15s;">
        <div style="font-size:22px;margin-bottom:4px;">📁</div>
        <div style="font-family:'Poppins',sans-serif;font-size:12px;font-weight:600;color:#005D56;">Clique ou arraste uma imagem</div>
        <div style="font-size:10px;color:#8B7B5D;margin-top:2px;">PNG, JPG, WebP, SVG (máx 10MB)</div>
      </label>
      <input type="file" id="content-img-file-${id}" accept="image/*" style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;" onchange="handleContentImgFile(this.files[0],'${key}','${id}');this.value='';">
    </div>`;
  };

  const g = c.global || {};
  const h = c.homepage || {};
  const v = c.votar || {};
  const a = c.artigos || {};
  const l = c.loja || {};
  const d = c.descontos || {};
  const p = c.passaporte || {};
  const r = c.rede || {};
  const og = c.onde_guia || {};
  const op = c.onde_passaporte || {};

  const tabContents = {
    global: `
      <div class="bg-white rounded-xl p-5 shadow-sm border border-praia-sand-100 admin-form">
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-4">Imagens Globais</h3>
        ${imgField('global.logoUrl', 'Logo Principal', g.logoUrl)}
        ${imgField('global.logoFooterUrl', 'Logo Rodapé (branca)', g.logoFooterUrl)}
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-4 mt-6">Nome e Footer</h3>
        ${field('global.siteName', 'Nome do Site', g.siteName)}
        ${textarea('global.footer.tagline', 'Tagline / Slogan', g.footer?.tagline)}
        ${textarea('global.footer.newsletterTitle', 'Título Newsletter', g.footer?.newsletterTitle)}
        ${textarea('global.footer.newsletterDesc', 'Descrição Newsletter', g.footer?.newsletterDesc)}
        ${field('global.footer.copyright', 'Copyright', g.footer?.copyright)}
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-4 mt-6">Redes Sociais</h3>
        ${field('global.social.facebook', 'Facebook URL', g.social?.facebook)}
        ${field('global.social.instagram', 'Instagram URL', g.social?.instagram)}
        ${field('global.social.youtube', 'YouTube URL', g.social?.youtube)}
        ${field('global.social.tiktok', 'TikTok URL', g.social?.tiktok)}
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-4 mt-6">Navegação · Labels do Menu</h3>
        ${field('global.nav.rede', 'Rede de Praias', g.nav?.rede)}
        ${field('global.nav.votar', 'Votar', g.nav?.votar)}
        ${field('global.nav.passaporte', 'Passaporte', g.nav?.passaporte)}
        ${field('global.nav.novidades', 'Novidades / Blog', g.nav?.novidades)}
        ${field('global.nav.onde_encontrar', 'Onde Encontrar', g.nav?.onde_encontrar)}
        ${field('global.nav.onde_carimbar', 'Onde Carimbar', g.nav?.onde_carimbar)}
        ${field('global.nav.descontos', 'Descontos', g.nav?.descontos)}
        ${field('global.nav.loja', 'Loja', g.nav?.loja)}
      </div>`,
    homepage: `
      <div class="bg-white rounded-xl p-5 shadow-sm border border-praia-sand-100 admin-form">
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-4">Estatísticas Hero</h3>
        <div class="grid grid-cols-2 gap-4">
          ${field('homepage.stat1Label', 'Estatística 1 · Label', h.stat1Label)}
          ${field('homepage.stat1Value', 'Estatística 1 · Valor', h.stat1Value)}
          ${field('homepage.stat2Label', 'Estatística 2 · Label', h.stat2Label)}
          ${field('homepage.stat2Value', 'Estatística 2 · Valor', h.stat2Value)}
          ${field('homepage.stat3Label', 'Estatística 3 · Label', h.stat3Label)}
          ${field('homepage.stat3Value', 'Estatística 3 · Valor', h.stat3Value)}
        </div>
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-4 mt-6">CTAs</h3>
        ${field('homepage.heroCtaPrimary', 'CTA Primário', h.heroCtaPrimary)}
        ${field('homepage.heroCtaSecondary', 'CTA Secundário', h.heroCtaSecondary)}
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-4 mt-6">Secções</h3>
        ${field('homepage.destaquesSectionTitle', 'Título Secção Destaques', h.destaquesSectionTitle)}
        ${field('homepage.yearSectionLabel', 'Label Secção Votação', h.yearSectionLabel)}
        ${field('homepage.yearSectionTitle', 'Título Secção Votação', h.yearSectionTitle)}
        ${textarea('homepage.yearSectionDesc', 'Descrição Secção Votação', h.yearSectionDesc, 3)}
      </div>`,
    votar: `
      <div class="bg-white rounded-xl p-5 shadow-sm border border-praia-sand-100 admin-form">
        ${field('votar.label', 'Label (badge)', v.label)}
        ${field('votar.title', 'Título da Página', v.title)}
        ${textarea('votar.description', 'Descrição', v.description, 3)}
        ${field('votar.hallOfFameLabel', 'Label Hall da Fama', v.hallOfFameLabel)}
        ${field('votar.hallOfFameTitle', 'Título Hall da Fama', v.hallOfFameTitle)}
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-4 mt-4">Cards Informativos</h3>
        ${field('votar.card1Title', 'Card 1 · Título', v.card1Title)}
        ${textarea('votar.card1Text', 'Card 1 · Texto', v.card1Text, 3)}
        ${field('votar.card2Title', 'Card 2 · Título', v.card2Title)}
        ${textarea('votar.card2Text', 'Card 2 · Texto', v.card2Text, 3)}
      </div>`,
    artigos: `
      <div class="bg-white rounded-xl p-5 shadow-sm border border-praia-sand-100 admin-form">
        ${field('artigos.label', 'Label (badge)', a.label)}
        ${field('artigos.title', 'Título da Página', a.title)}
        ${textarea('artigos.description', 'Descrição', a.description, 3)}
      </div>`,
    loja: `
      <div class="bg-white rounded-xl p-5 shadow-sm border border-praia-sand-100 admin-form">
        ${field('loja.label', 'Label (badge)', l.label)}
        ${field('loja.title', 'Título da Página', l.title)}
        ${textarea('loja.description', 'Descrição', l.description, 3)}
        ${field('loja.shippingNote', 'Nota de Envio 1', l.shippingNote)}
        ${field('loja.shippingNote2', 'Nota de Envio 2', l.shippingNote2)}
      </div>`,
    descontos: `
      <div class="bg-white rounded-xl p-5 shadow-sm border border-praia-sand-100 admin-form">
        ${field('descontos.label', 'Label (badge)', d.label)}
        ${field('descontos.title', 'Título da Página', d.title)}
        ${textarea('descontos.description', 'Descrição', d.description, 3)}
      </div>`,
    passaporte: `
      <div class="bg-white rounded-xl p-5 shadow-sm border border-praia-sand-100 admin-form">
        ${field('passaporte.label', 'Label (badge)', p.label)}
        ${field('passaporte.title', 'Título da Página', p.title)}
        ${textarea('passaporte.description', 'Descrição', p.description, 3)}
      </div>`,
    rede: `
      <div class="bg-white rounded-xl p-5 shadow-sm border border-praia-sand-100 admin-form">
        ${field('rede.heading', 'Heading Principal', r.heading)}
        ${field('rede.subheading', 'Subheading', r.subheading)}
      </div>`,
    onde_guia: `
      <div class="bg-white rounded-xl p-5 shadow-sm border border-praia-sand-100 admin-form">
        ${field('onde_guia.label', 'Label (badge)', og.label)}
        ${field('onde_guia.title', 'Título da Página', og.title)}
        ${textarea('onde_guia.description', 'Descrição', og.description, 3)}
      </div>`,
    onde_passaporte: `
      <div class="bg-white rounded-xl p-5 shadow-sm border border-praia-sand-100 admin-form">
        ${field('onde_passaporte.label', 'Label (badge)', op.label)}
        ${field('onde_passaporte.title', 'Título da Página', op.title)}
        ${textarea('onde_passaporte.description', 'Descrição', op.description, 3)}
      </div>`,
  };

  body.innerHTML = (tabContents[tabId] || '') + `
    <div class="mt-4 flex gap-3">
      <button onclick="saveConteudoTabValues('${tabId}')" class="admin-btn admin-btn-success">Guardar Alterações</button>
      <button onclick="exportContentJSON()" class="admin-btn admin-btn-export">Exportar content.json</button>
    </div>`;
}

function saveConteudoTabValues(tabId, silent = false) {
  const body = document.getElementById('conteudo-tab-body');
  if (!body) return;

  body.querySelectorAll('[data-content-key]').forEach(el => {
    const key = el.dataset.contentKey;
    const value = el.value;
    const parts = key.split('.');
    let obj = state.editingContent;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!obj[parts[i]] || typeof obj[parts[i]] !== 'object') obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
  });

  if (!silent) toast('Conteúdo guardado (clique em Exportar para descarregar o ficheiro).', 'success');
}

function updateImgPreview(keyId, url, key) {
  const preview = document.getElementById(`img-preview-${keyId}`);
  if (!preview) return;
  preview.innerHTML = url ? `
    <div style="display:inline-flex;align-items:center;gap:10px;padding:8px;border:1px solid #E2D9C6;border-radius:10px;background:#FAF8F5;">
      <img src="${escHtml(url)}" style="height:56px;width:56px;object-fit:cover;border-radius:6px;">
      <button type="button" onclick="removeContentImg('${key}','${keyId}')" class="admin-btn admin-btn-danger" style="padding:4px 10px;font-size:11px;">Remover</button>
    </div>` : '';
}

function triggerContentImgUpload(key, keyId) {
  document.getElementById(`content-img-file-${keyId}`)?.click();
}

async function handleContentImgFile(file, key, keyId) {
  if (!file || !file.type.startsWith('image/')) return;
  const drop = document.getElementById(`content-img-drop-${keyId}`);
  if (drop) { drop.style.opacity = '0.6'; drop.style.pointerEvents = 'none'; }
  try {
    const result = await uploadImageFile(file, 'content');
    const input = document.getElementById(`content-img-input-${keyId}`);
    if (input) input.value = result.src;
    updateImgPreview(keyId, result.src, key);
    toast('Imagem carregada.', 'success');
  } catch {
    toast('Erro a carregar imagem.', 'error');
  } finally {
    if (drop) { drop.style.opacity = ''; drop.style.pointerEvents = ''; }
  }
}

function removeContentImg(key, keyId) {
  const input = document.getElementById(`content-img-input-${keyId}`);
  if (input) input.value = '';
  updateImgPreview(keyId, '', key);
}

function exportContentJSON() {
  saveConteudoTabValues(state._conteudoTab || 'global');
  const data = state.editingContent;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'content.json'; a.click();
  URL.revokeObjectURL(url);
  toast('content.json exportado! Substitua o ficheiro em data/content.json', 'success');
}

// ─── QR Codes das praias ───
// Gera QR codes apontando para carimbar.html, um por praia. O scan numa praia
// valida GPS (≤2km) e carimba o passaporte digital do utilizador.
//
// Produção: altere QR_PUBLIC_BASE para o domínio final quando for lançado.
const QR_PUBLIC_BASE = 'https://praias-fluviais.vercel.app';

function _beachQRUrl(beach) {
  return `${QR_PUBLIC_BASE}/carimbar.html?id=${encodeURIComponent(beach.id)}`;
}

// "Praia Fluvial de Loriga" → "Praia-Fluvial-de-Loriga"
function _sanitizeFilename(name) {
  return String(name || 'praia')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim().replace(/\s+/g, '-')
    .slice(0, 80) || 'praia';
}

async function _generateQRDataURL(url, size = 1024) {
  if (!window.QRCode || !QRCode.toDataURL) {
    toast('Biblioteca de QR não carregou. Atualize a página.', 'error');
    throw new Error('QRCode library not available');
  }
  return QRCode.toDataURL(url, {
    width: size,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#FFFFFF' },
  });
}

async function downloadBeachQR(index) {
  const beach = state.data.beaches?.[index];
  if (!beach) return toast('Praia não encontrada.', 'error');
  if (!beach.id) return toast('Esta praia não tem id — grave primeiro.', 'error');
  try {
    const dataUrl = await _generateQRDataURL(_beachQRUrl(beach));
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${_sanitizeFilename(beach.name)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast(`QR de "${beach.name}" baixado.`, 'success');
  } catch (err) {
    console.error('[downloadBeachQR]', err);
    toast('Falha ao gerar QR code.', 'error');
  }
}

async function downloadAllBeachQRsZip() {
  const beaches = (state.data.beaches || []).filter(b => b.id && !b.hidden);
  if (!beaches.length) return toast('Nenhuma praia elegível para carimbagem.', 'error');
  if (!window.JSZip) return toast('Biblioteca ZIP não carregou. Atualize a página.', 'error');

  toast(`A gerar ${beaches.length} QR codes…`, 'info');
  try {
    const zip = new JSZip();
    // Evita colisões de nome (ex: duas praias com mesmo nome).
    const seen = new Map();
    for (const b of beaches) {
      const base = _sanitizeFilename(b.name);
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      const fname = n === 1 ? `${base}.png` : `${base}-${n}.png`;

      const dataUrl = await _generateQRDataURL(_beachQRUrl(b));
      const base64 = dataUrl.split(',')[1];
      zip.file(fname, base64, { base64: true });
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr-codes-praias-${new Date().toISOString().split('T')[0]}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast(`${beaches.length} QR codes exportados.`, 'success');
  } catch (err) {
    console.error('[downloadAllBeachQRsZip]', err);
    toast('Falha ao gerar ZIP de QR codes.', 'error');
  }
}

// ─── Init ───
document.addEventListener('DOMContentLoaded', () => {
  if (checkAuth()) { showLoadingScreen(); initDashboard(); }
});
