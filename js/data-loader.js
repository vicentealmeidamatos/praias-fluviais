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
    descontos:        'data/descontos.json',
    products:         'data/products.json',
    settings:         'data/settings.json',
    layout:           null, // não há ficheiro: começa vazio
  };

  const isAdmin = /\/admin\.html?$/.test(location.pathname);
  const TTL_MS = isAdmin ? 60 * 1000 : 5 * 60 * 1000;
  const SS_PREFIX = '__dl_';

  const memCache = Object.create(null);

  function readSession(name) {
    try {
      const raw = sessionStorage.getItem(SS_PREFIX + name);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || !o.t || (Date.now() - o.t) > TTL_MS) return null;
      return o;
    } catch { return null; }
  }
  function writeSession(name, obj) {
    try { sessionStorage.setItem(SS_PREFIX + name, JSON.stringify(obj)); } catch {}
  }

  async function fetchFromApi(name) {
    try {
      const r = await fetch(`/api/save-data?dataset=${encodeURIComponent(name)}`, { cache: 'no-store' });
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
      const r = await fetch(file + '?_=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return null;
      const data = await r.json();
      return { data, fromFile: true };
    } catch { return null; }
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
      const m = memCache[name];
      if (m && (Date.now() - m.t) < TTL_MS) return m.data;
      const s = readSession(name);
      if (s) { memCache[name] = s; return s.data; }
    }

    // 1) API
    const api = await fetchFromApi(name);
    if (api && !api.empty && typeof api.data !== 'undefined') {
      const obj = { data: api.data, t: Date.now(), src: 'api' };
      memCache[name] = obj;
      writeSession(name, obj);
      return api.data;
    }

    // 2) Fallback ficheiro estático
    const file = await fetchFromFile(name);
    if (file && typeof file.data !== 'undefined') {
      const obj = { data: file.data, t: Date.now(), src: 'file' };
      memCache[name] = obj;
      writeSession(name, obj);
      return file.data;
    }

    // 3) Layout vazio é OK
    if (name === 'layout') {
      const obj = { data: {}, t: Date.now(), src: 'empty' };
      memCache[name] = obj;
      return {};
    }

    return null;
  }

  /**
   * saveDataset(name, data, { note }) → Promise<{ok}>
   * Grava no Supabase via /api/save-data. Invalida cache local.
   */
  async function saveDataset(name, data, opts = {}) {
    if (!FILES.hasOwnProperty(name)) throw new Error('dataset desconhecido: ' + name);
    const r = await fetch('/api/save-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataset: name, data, note: opts.note || '' }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Falha ao gravar');
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
    'descontos.json':                 'descontos',
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

  const _origFetch = global.fetch ? global.fetch.bind(global) : null;
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
