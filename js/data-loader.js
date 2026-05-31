/**
 * data-loader.js — Loader unificado de datasets para o público e o admin.
 *
 * Estratégia:
 *  1. Tenta `GET /api/save-data?dataset=<name>` (Supabase, sempre fresco).
 *  2. Se falhar (404 sem dados, rede off, dev local sem env), faz fallback para `data/<file>.json`.
 *  3. Cache em memória + sessionStorage com TTL (60s no admin, 5min no público).
 *
 * Garantia: o site público comporta-se exactamente como antes enquanto não houver
 * dados gravados via admin — o fallback devolve o JSON estático tal qual.
 */
(function (global) {
  'use strict';

  // Mapeamento dataset → ficheiro estático de fallback
  const FILES = {
    content:          'data/content.json',
    beaches:          'data/beaches.json',
    articles:         'data/articles.json',
    locationsGuia:    'data/locations-guia-passaporte.json',
    locationsCarimbo: 'data/locations-carimbos.json',
    products:         'data/products.json',
    settings:         'data/settings.json',
    waterQuality:     'data/water-quality.json',
    layout:           null, // não há ficheiro: começa vazio
  };

  const isAdmin = /\/admin\.html?$/.test(location.pathname);
  // Stale-while-revalidate:
  //  - FRESH: dentro deste tempo, devolve sem refetch
  //  - STALE: depois de FRESH e antes de MAX, devolve já e refetch em background
  //  - > MAX: tratado como inexistente (refetch síncrono)
  // Admin precisa dados quase em tempo real; público pode ser muito mais relaxado
  // (visibilitychange + admin save invalidam explicitamente).
  const TTL_FRESH_MS = isAdmin ? 10 * 1000 : 60 * 1000;
  const TTL_MAX_MS   = isAdmin ? 5 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const SS_PREFIX = '__dl_';

  const memCache = Object.create(null);
  const _inflight = Object.create(null);
  // Capturar fetch original imediatamente, antes do interceptor ser instalado
  const _rawFetch = global.fetch ? global.fetch.bind(global) : null;

  function readSession(name) {
    try {
      const raw = sessionStorage.getItem(SS_PREFIX + name);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || !o.t) return null;
      const age = Date.now() - o.t;
      if (age > TTL_MAX_MS) return null;
      return o;
    } catch { return null; }
  }
  function writeSession(name, obj) {
    try { sessionStorage.setItem(SS_PREFIX + name, JSON.stringify(obj)); } catch {}
  }

  async function fetchFromApi(name) {
    try {
      const r = await _rawFetch(`/api/save-data?dataset=${encodeURIComponent(name)}`, { cache: 'no-store' });
      if (r.status === 404) return { empty: true };
      if (!r.ok) return null;
      const j = await r.json();
      return j && typeof j === 'object' ? { data: j.data, updated_at: j.updated_at } : null;
    } catch { return null; }
  }

  async function fetchFromFile(name) {
    const file = FILES[name];
    if (!file) return null;
    try {
      const r = await _rawFetch(file + '?_=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return null;
      const data = await r.json();
      return { data, fromFile: true };
    } catch { return null; }
  }

  // Carimbo updated_at de cada dataset trazido da API. Usado para optimistic
  // concurrency check em saveDataset.
  const lastUpdatedAt = Object.create(null);

  // Refetch real (API → ficheiro). Partilhado entre stale-revalidate e síncrono.
  async function refetchDataset(name) {
    const api = await fetchFromApi(name);
    if (api && !api.empty && typeof api.data !== 'undefined') {
      const obj = { data: api.data, t: Date.now(), src: 'api' };
      memCache[name] = obj;
      writeSession(name, obj);
      if (api.updated_at) lastUpdatedAt[name] = api.updated_at;
      return api.data;
    }
    const file = await fetchFromFile(name);
    if (file && typeof file.data !== 'undefined') {
      const obj = { data: file.data, t: Date.now(), src: 'file' };
      memCache[name] = obj;
      writeSession(name, obj);
      return file.data;
    }
    if (name === 'layout') {
      const obj = { data: {}, t: Date.now(), src: 'empty' };
      memCache[name] = obj;
      return {};
    }
    return null;
  }

  // Garante que só há uma refetch em curso por dataset (deduplica chamadas paralelas).
  function refetchOnce(name) {
    if (_inflight[name]) return _inflight[name];
    _inflight[name] = refetchDataset(name).finally(() => { delete _inflight[name]; });
    return _inflight[name];
  }

  /**
   * loadDataset(name, { force }) → Promise<any>
   * Devolve a data crua (array, object, etc.) ou null se nada disponível.
   */
  async function loadDataset(name, opts = {}) {
    if (!FILES.hasOwnProperty(name)) {
      console.warn('[data-loader] dataset desconhecido:', name);
      return null;
    }
    if (!opts.force) {
      // Hit em memória ou sessionStorage: devolve já. Se já estiver stale
      // (> TTL_FRESH), refetch em background para a próxima leitura.
      let cached = memCache[name];
      if (!cached) {
        const s = readSession(name);
        if (s) { memCache[name] = s; cached = s; }
      }
      if (cached) {
        const age = Date.now() - cached.t;
        if (age > TTL_FRESH_MS) {
          // Stale: serve já e revalida em background (sem await).
          refetchOnce(name).catch(() => {});
        }
        return cached.data;
      }
    }

    return refetchOnce(name);
  }

  /**
   * saveDataset(name, data, { note, force }) → Promise<{ok}>
   * Grava no Supabase via /api/save-data. Invalida cache local.
   *
   * Por defeito envia `baseUpdatedAt` (o updated_at observado no último load)
   * para que a API recuse o save se a Supabase tiver versão mais recente.
   * Passar `{ force: true }` para sobrescrever sem verificação.
   *
   * Em caso de conflito (HTTP 409) lança um Error com `code = 'conflict'` e
   * propriedades `expectedUpdatedAt` / `currentUpdatedAt`.
   */
  async function saveDataset(name, data, opts = {}) {
    if (!FILES.hasOwnProperty(name)) throw new Error('dataset desconhecido: ' + name);
    const payload = { dataset: name, data, note: opts.note || '' };
    if (!opts.force && lastUpdatedAt[name]) payload.baseUpdatedAt = lastUpdatedAt[name];
    const r = await _rawFetch('/api/save-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 409) {
      const err = new Error('Conflito: a versão na Supabase mudou desde que carregou.');
      err.code = 'conflict';
      err.expectedUpdatedAt = j.expectedUpdatedAt;
      err.currentUpdatedAt  = j.currentUpdatedAt;
      throw err;
    }
    if (!r.ok) {
      // Traduzir o erro técnico do servidor para algo que o utilizador
      // perceba e saiba como resolver. O auto-cleanup do admin geralmente
      // previne este caso, mas pode chegar aqui se o upload falhar.
      if (j.error === 'inline_base64_image') {
        const err = new Error('Há uma imagem dentro do editor de texto que não chegou ao servidor. Verifique a ligação à internet e tente guardar outra vez.');
        err.code = 'inline_base64_image';
        throw err;
      }
      throw new Error(j.message || j.error || 'Não foi possível guardar. Tente outra vez.');
    }
    if (j.updated_at) lastUpdatedAt[name] = j.updated_at;
    delete memCache[name];
    try { sessionStorage.removeItem(SS_PREFIX + name); } catch {}
    return j;
  }

  function invalidate(name) {
    if (name) {
      delete memCache[name];
      try { sessionStorage.removeItem(SS_PREFIX + name); } catch {}
    } else {
      for (const k in memCache) delete memCache[k];
      try {
        for (const k of Object.keys(sessionStorage)) {
          if (k.startsWith(SS_PREFIX)) sessionStorage.removeItem(k);
        }
      } catch {}
    }
  }

  global.DataLoader = { loadDataset, saveDataset, invalidate, FILES };
  // Compat: expor também loadDataset top-level
  global.loadDataset = loadDataset;
  global.saveDataset = saveDataset;

  // ─── Revalidação ao voltar ao separador ───
  // Em vez de apagar tudo (que forçava um refetch síncrono e lento na próxima
  // leitura), marcamos cada dataset cacheado para refetch em background. A
  // leitura seguinte devolve os dados imediatamente (sem bloquear) e a versão
  // fresca chega a tempo da navegação seguinte.
  function _markAllStale() {
    Object.keys(memCache).forEach(name => { refetchOnce(name).catch(() => {}); });
    try {
      for (const k of Object.keys(sessionStorage)) {
        if (!k.startsWith(SS_PREFIX)) continue;
        const name = k.slice(SS_PREFIX.length);
        if (!memCache[name]) refetchOnce(name).catch(() => {});
      }
    } catch {}
  }
  function _onRevalidate() {
    _markAllStale();
    try { global.dispatchEvent(new CustomEvent('datasets:revalidate')); } catch {}
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') _onRevalidate();
    });
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pageshow', (ev) => {
      if (ev.persisted) _onRevalidate();
    });
  }

  // ─── Fetch interceptor ───
  // Intercepta `fetch('data/<name>.json')` (e variantes com `/data/`, `./data/`,
  // querystring, etc.) e redirecciona para o loader unificado. Devolve um objecto
  // Response sintético com .json()/.text() para manter compatibilidade total
  // com o código existente, sem ter de tocar em cada fetch call.
  //
  // Mapeamento ficheiro → dataset
  const FILE_TO_DATASET = {
    'content.json':                   'content',
    'beaches.json':                   'beaches',
    'articles.json':                  'articles',
    'locations-guia-passaporte.json': 'locationsGuia',
    'locations-carimbos.json':        'locationsCarimbo',
    'products.json':                  'products',
    'settings.json':                  'settings',
  };

  function matchDataset(url) {
    if (typeof url !== 'string') {
      try { url = url && url.url ? url.url : String(url); } catch { return null; }
    }
    // remove querystring + hash
    const clean = url.split('?')[0].split('#')[0];
    const m = clean.match(/(?:^|\/)data\/([^\/]+\.json)$/);
    if (!m) return null;
    return FILE_TO_DATASET[m[1]] || null;
  }

  function makeResponse(data) {
    const text = JSON.stringify(data);
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      url: '',
      type: 'basic',
      redirected: false,
      bodyUsed: false,
      clone() { return makeResponse(data); },
      json: async () => data,
      text: async () => text,
      arrayBuffer: async () => new TextEncoder().encode(text).buffer,
      blob: async () => new Blob([text], { type: 'application/json' }),
    };
  }

  const _origFetch = _rawFetch;
  if (_origFetch && !global.__dlFetchPatched) {
    global.__dlFetchPatched = true;
    global.fetch = function (input, init) {
      try {
        const ds = matchDataset(input);
        if (ds) {
          return loadDataset(ds).then((data) => {
            if (data == null) {
              // Fallback final: deixar o fetch original tentar
              return _origFetch(input, init);
            }
            return makeResponse(data);
          }).catch(() => _origFetch(input, init));
        }
      } catch {}
      return _origFetch(input, init);
    };
  }
})(window);
