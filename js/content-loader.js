/**
 * content-loader.js — Injetor universal de conteúdo CMS
 *
 * Fonte de verdade:
 *   1) Tabela `site_content` no Supabase (editado pelo painel admin)
 *   2) Fallback: data/content.json (para deploys sem Supabase configurado)
 *
 * Atributos suportados:
 *   data-content="path"           → textContent
 *   data-content-html="path"      → innerHTML (rich text)
 *   data-content-img="path"       → src
 *   data-content-href="path"      → href
 *   data-content-placeholder="p"  → placeholder
 *   data-content-visible="path"   → display:none se false
 *   data-content-list="path"      → renderiza lista (clona <template> ou primeiro filho)
 *   data-section-id="id"          → marca secção reordenável (ver homepage.sectionsOrder)
 *
 * Modo edição:
 *   ?edit=1 na URL → injeta js/inline-editor.js após preencher conteúdo.
 */
// Brand/social icons (inline SVG) — partilhados entre content-loader (apply
// de overrides para visitantes) e inline-editor (picker no modo de edição).
window.__BRAND_ICONS = {
  facebook:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.51 1.49-3.9 3.78-3.9 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>',
  twitter:   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"/></svg>',
  x:         '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  youtube:   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.6 3.6 12 3.6 12 3.6s-7.6 0-9.4.5A3 3 0 0 0 .5 6.2C0 8 0 12 0 12s0 4 .5 5.8a3 3 0 0 0 2.1 2.1c1.8.5 9.4.5 9.4.5s7.6 0 9.4-.5a3 3 0 0 0 2.1-2.1c.5-1.8.5-5.8.5-5.8s0-4-.5-5.8zM9.6 15.6V8.4l6.3 3.6z"/></svg>',
  linkedin:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.66H9.35V9h3.41v1.56h.05a3.74 3.74 0 0 1 3.37-1.85c3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.23 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.21 0 22.23 0z"/></svg>',
  whatsapp:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413"/></svg>',
  tiktok:    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.93a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.36z"/></svg>',
  telegram:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>',
  threads:   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.78 3.631 2.695 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L9.06 8.534c.978-1.45 2.566-2.247 4.473-2.247h.044c3.187.02 5.087 1.969 5.275 5.388.108.046.214.094.318.143 1.469.69 2.544 1.736 3.108 3.025.787 1.795.86 4.726-1.527 7.059-1.824 1.781-4.038 2.583-7.045 2.604zm1.062-7.025c.535-.027 1.022-.156 1.45-.385 1.073-.572 1.736-1.66 1.84-3.012a13.18 13.18 0 0 0-3.135-.182c-1.044.06-2.014.376-2.66.93-.499.428-.787 1.008-.756 1.59.031.578.376 1.103.949 1.443.566.337 1.286.508 2.04.508l.272-.004z"/></svg>',
  pinterest: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0a12 12 0 0 0-4.373 23.178c-.1-.937-.19-2.376.04-3.4.207-.92 1.34-5.866 1.34-5.866s-.34-.685-.34-1.7c0-1.591.923-2.78 2.073-2.78.978 0 1.45.733 1.45 1.612 0 .982-.625 2.451-.948 3.812-.27 1.139.572 2.067 1.694 2.067 2.034 0 3.598-2.144 3.598-5.241 0-2.741-1.97-4.657-4.78-4.657-3.255 0-5.165 2.441-5.165 4.965 0 .983.378 2.038.852 2.611.094.115.107.215.08.331-.087.36-.282 1.139-.32 1.297-.05.21-.166.255-.385.154-1.428-.665-2.32-2.752-2.32-4.43 0-3.604 2.62-6.917 7.55-6.917 3.96 0 7.045 2.823 7.045 6.601 0 3.94-2.484 7.108-5.928 7.108-1.157 0-2.246-.601-2.617-1.31l-.713 2.717c-.258.992-.954 2.235-1.42 2.991A12 12 0 1 0 12 0z"/></svg>',
  github:    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>',
};

(async function () {
  const SUPABASE_URL = 'https://tjvhnbukzfyxtpkrhpsw.supabase.co';
  const SUPABASE_ANON = 'sb_publishable_ke--Q7xNRNCxTjgxFCNFIQ_6zPD3zM3';

  const params = new URLSearchParams(location.search);
  const editMode = params.get('edit') === '1';
  const previewDraft = params.get('preview') === 'draft';

  // Em modo preview de draft, intercepta fetch para data/<dataset>.json e
  // devolve o draft em localStorage (escrito pelo admin durante undo/redo).
  // Permite que páginas como praia.html / artigo.html / produto.html /
  // descontos.html / onde-encontrar.html reflictam edições não-gravadas.
  if (previewDraft && !window.__draftFetchInstalled) {
    window.__draftFetchInstalled = true;
    const FILE_TO_DATASET = {
      'data/beaches.json':                         'beaches',
      'data/articles.json':                        'articles',
      'data/locations-guia-passaporte.json':       'locations-guia-passaporte',
      'data/locations-carimbos.json':              'locations-carimbos',
      'data/descontos.json':                       'descontos',
      'data/products.json':                        'produtos',
      'data/settings.json':                        'settings',
    };
    const _origFetch = window.fetch.bind(window);
    window.fetch = function(input, init) {
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const cleaned = url.replace(/^\.?\//, '').split('?')[0];
        const ds = FILE_TO_DATASET[cleaned];
        if (ds) {
          const draft = localStorage.getItem('_datasetDraft:' + ds) || sessionStorage.getItem('_datasetDraft:' + ds);
          if (draft) {
            return Promise.resolve(new Response(draft, { status: 200, headers: { 'Content-Type': 'application/json' } }));
          }
        }
      } catch {}
      return _origFetch(input, init);
    };
  }

  async function fetchContent() {
    // 1) Draft em localStorage (modo preview entre abas)
    if (previewDraft) {
      try {
        const draft = localStorage.getItem('_contentDraft') || sessionStorage.getItem('_contentDraft');
        if (draft) return JSON.parse(draft);
      } catch {}
    }
    // 2) Supabase
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/site_content?id=eq.1&select=data`,
        { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
      );
      if (res.ok) {
        const arr = await res.json();
        if (arr && arr[0] && arr[0].data) return arr[0].data;
      }
    } catch (e) {
      console.warn('[content-loader] Supabase falhou, fallback JSON:', e.message);
    }
    // 3) JSON estático
    const res = await fetch('/data/content.json');
    if (!res.ok) throw new Error('content.json indisponível');
    return await res.json();
  }

  function resolve(content, dotPath) {
    if (!dotPath) return undefined;
    return dotPath.split('.').reduce((o, k) => {
      if (o == null) return undefined;
      // suporte a índices numéricos
      if (Array.isArray(o) && /^\d+$/.test(k)) return o[Number(k)];
      return o[k];
    }, content);
  }

  window._applyContent = function(c) { try { applyContent(c); } catch (e) { console.warn('[content-loader] apply:', e); } };
  function applyContent(content) {
    window._siteContent = content;

    // 0) Rebuild de blocos a partir de arrays do CMS.
    //    Aceita qualquer path: data-cms-rebuild="global.nav" / "global.social" /
    //    "global.footer.col1Links". Usa o primeiro filho existente como template
    //    (preserva todas as classes Tailwind) e expõe o container como
    //    data-content-list para o editor inline.
    //    Aliases: "nav"→"global.nav", "social"→"global.social".
    const currentPage = (location.pathname.split('/').pop() || 'index.html');

    // Helper exposto globalmente para o inline-editor poder re-renderizar
    // uma lista in-place após add/reorder/delete.
    window._cmsRebuild = function (container, arr) {
      if (!container) return;
      let path = container.dataset.cmsRebuild || container.dataset.contentList;
      if (path === 'nav') path = 'global.nav';
      else if (path === 'social') path = 'global.social';
      if (!Array.isArray(arr)) return;
      // Cachear template no primeiro rebuild
      if (!container.__cmsTpl) {
        const tpl = container.firstElementChild;
        if (!tpl) return;
        container.__cmsTpl = tpl.outerHTML;
      }
      const tplOuter = container.__cmsTpl;
      container.innerHTML = '';
      arr.forEach((item, idx) => {
        const wrap = document.createElement('div');
        wrap.innerHTML = tplOuter.trim();
        const node = wrap.firstElementChild;
        if (!node) return;

        const anchor = node.matches && node.matches('a') ? node : node.querySelector('a');
        if (anchor && item.href != null) anchor.href = item.href || '#';

        if (item.icon) {
          const iconEl = (anchor || node).querySelector('[data-lucide]');
          if (iconEl) iconEl.setAttribute('data-lucide', item.icon);
        }

        const labelTarget = anchor || node;
        let textNode = null;
        for (const child of labelTarget.childNodes) {
          if (child.nodeType === 3 && child.textContent.trim()) textNode = child;
        }
        if (textNode) {
          textNode.textContent = ' ' + (item.label || '') + ' ';
        } else {
          const span = Array.from(labelTarget.children).find(
            c => c.tagName === 'SPAN' && !c.querySelector('[data-lucide]')
          );
          if (span) span.textContent = item.label || '';
          else if (!labelTarget.querySelector('[data-lucide]')) {
            labelTarget.textContent = item.label || '';
          } else {
            labelTarget.appendChild(document.createTextNode(' ' + (item.label || '')));
          }
        }

        if (path && (path.endsWith('.nav') || path === 'global.nav')) {
          if (anchor) {
            anchor.classList.remove('active');
            const itemFile = (item.href || '').split('/').pop();
            if (itemFile === currentPage) {
              anchor.classList.add('active');
              anchor.classList.remove('text-white/80');
              anchor.classList.add('text-white');
            }
          }
        }

        node.setAttribute('data-content-item-index', String(idx));
        container.appendChild(node);
      });
      // Re-renderizar ícones Lucide
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        try { window.lucide.createIcons(); } catch {}
      }
      // Disparar evento para o inline editor re-decorar
      container.dispatchEvent(new CustomEvent('cms-rebuilt', { bubbles: true, detail: { path } }));
    };

    document.querySelectorAll('[data-cms-rebuild]').forEach((container) => {
      let path = container.dataset.cmsRebuild;
      if (path === 'nav') path = 'global.nav';
      else if (path === 'social') path = 'global.social';
      const arr = resolve(content, path);
      if (!Array.isArray(arr) || !arr.length) return;
      window._cmsRebuild(container, arr);
      container.setAttribute('data-content-list', path);
    });

    // Re-renderizar ícones Lucide se a lib estiver carregada
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try { window.lucide.createIcons(); } catch {}
    }

    // 1) Listas (renderizar primeiro porque criam novos nós com data-content)
    //    NOTA: ignorar containers que já foram tratados por data-cms-rebuild
    document.querySelectorAll('[data-content-list]:not([data-cms-rebuild])').forEach((container) => {
      const path = container.dataset.contentList;
      const arr = resolve(content, path);
      if (!Array.isArray(arr)) return;

      // Template: <template data-content-item> ... </template>  ou primeiro filho real
      let tplEl = container.querySelector('template[data-content-item]');
      let tplHTML;
      if (tplEl) {
        tplHTML = tplEl.innerHTML;
      } else if (container.firstElementChild) {
        tplHTML = container.firstElementChild.outerHTML;
      } else {
        return;
      }

      // Limpar
      container.innerHTML = '';
      arr.forEach((item, idx) => {
        const wrap = document.createElement('div');
        wrap.innerHTML = tplHTML.trim();
        const node = wrap.firstElementChild;
        if (!node) return;
        node.setAttribute('data-content-item-index', String(idx));

        // Substituir tokens {{field}} no HTML do item
        node.innerHTML = node.innerHTML.replace(/\{\{(\w+)\}\}/g, (_, k) =>
          item[k] != null ? String(item[k]) : ''
        );
        // Atributos especiais ao próprio nó
        if (node.hasAttribute('data-item-href') && item.href) {
          node.setAttribute('href', item.href);
        }
        // Reescrever data-content="." nos descendentes para path absoluto path.idx.field
        node.querySelectorAll('[data-content], [data-content-html], [data-content-img], [data-content-href]').forEach((el) => {
          ['data-content','data-content-html','data-content-img','data-content-href'].forEach((attr) => {
            const v = el.getAttribute(attr);
            if (v && v.startsWith('.')) {
              el.setAttribute(attr, `${path}.${idx}${v}`);
            }
          });
        });
        container.appendChild(node);
      });
    });

    // 2) Texto simples
    document.querySelectorAll('[data-content]').forEach((el) => {
      const val = resolve(content, el.dataset.content);
      if (val != null && val !== '') el.textContent = val;
    });

    // 3) HTML rico
    document.querySelectorAll('[data-content-html]').forEach((el) => {
      const val = resolve(content, el.dataset.contentHtml);
      if (val != null && val !== '') el.innerHTML = val;
    });

    // 4) Imagens
    document.querySelectorAll('[data-content-img]').forEach((el) => {
      const val = resolve(content, el.dataset.contentImg);
      if (val) el.src = val;
      const altPath = el.dataset.contentAlt;
      if (altPath) {
        const altVal = resolve(content, altPath);
        if (altVal) el.alt = altVal;
      }
    });

    // 5) Links
    document.querySelectorAll('[data-content-href]').forEach((el) => {
      const val = resolve(content, el.dataset.contentHref);
      if (val) el.href = val;
    });

    // 6) Placeholders
    document.querySelectorAll('[data-content-placeholder]').forEach((el) => {
      const val = resolve(content, el.dataset.contentPlaceholder);
      if (val) el.placeholder = val;
    });

    // 7) Visibilidade
    document.querySelectorAll('[data-content-visible]').forEach((el) => {
      const val = resolve(content, el.dataset.contentVisible);
      if (val === false) el.style.display = 'none';
    });

    // 7.5) Overrides universais por seletor CSS, agrupados por página.
    //      Cada chave é um seletor; o valor é { text | html | src | href | alt | icon }.
    //      Aplica primeiro overrides globais (header/nav/footer — partilhados
    //      entre todas as páginas) e depois os específicos da página actual.
    function applyOverridesGroup(group) {
      if (!group) return;
      Object.entries(group).forEach(([sel, val]) => {
        if (!sel || !val) return;
        let el;
        try { el = document.querySelector(sel); } catch { return; }
        if (!el) return;
        if (val.text != null) el.textContent = val.text;
        if (val.html != null) el.innerHTML = val.html;
        if (val.src != null && 'src' in el) el.src = val.src;
        if (val.href != null && 'href' in el) el.href = val.href;
        if (val.alt != null && 'alt' in el) el.alt = val.alt;
        if (val.icon != null) {
          const iconName = val.icon;
          if (typeof iconName === 'string' && iconName.startsWith('brand:')) {
            // Brand icons (redes sociais) — SVG inline mantido em window.__BRAND_ICONS
            const brand = iconName.slice(6);
            const tpl = (window.__BRAND_ICONS && window.__BRAND_ICONS[brand]);
            if (tpl) {
              const div = document.createElement('div');
              div.innerHTML = tpl;
              const newSvg = div.firstElementChild;
              if (newSvg) {
                newSvg.setAttribute('data-brand-icon', brand);
                try {
                  const r = el.getBoundingClientRect();
                  if (r.width)  newSvg.style.width  = r.width + 'px';
                  if (r.height) newSvg.style.height = r.height + 'px';
                  newSvg.style.color = getComputedStyle(el).color || 'currentColor';
                } catch {}
                el.parentNode.replaceChild(newSvg, el);
              }
            }
          } else if (el.tagName && el.tagName.toLowerCase() === 'svg') {
            const i = document.createElement('i');
            i.setAttribute('data-lucide', iconName);
            try {
              const r = el.getBoundingClientRect();
              if (r.width)  i.style.width  = r.width + 'px';
              if (r.height) i.style.height = r.height + 'px';
              i.style.display = 'inline-block';
              i.style.color = getComputedStyle(el).color || 'currentColor';
            } catch {}
            el.parentNode.replaceChild(i, el);
          } else {
            el.setAttribute('data-lucide', iconName);
            el.innerHTML = '';
          }
          try { window.lucide && window.lucide.createIcons && window.lucide.createIcons({ nameAttr: 'data-lucide' }); } catch {}
        }
      });
    }
    try {
      const pageKey = (location.pathname.split('/').pop() || 'index.html').replace('.html', '') || 'index';
      applyOverridesGroup(content.overrides && content.overrides.__global__);
      applyOverridesGroup(content.overrides && content.overrides[pageKey]);
      // Limpar duplicações anteriores e re-aplicar a partir do estado actual
      // (necessário para que undo/redo as remova/adicione correctamente).
      document.querySelectorAll('[data-dup-key]').forEach(n => n.remove());
      applyDuplicates(content.overrides && content.overrides.__global__);
      applyDuplicates(content.overrides && content.overrides[pageKey]);
    } catch (e) { console.warn('[content-loader] overrides:', e.message); }

    function applyDuplicates(group) {
      if (!group || !Array.isArray(group.__duplicates)) return;
      group.__duplicates.forEach(d => {
        if (!d || !d.afterSelector || !d.html) return;
        let anchor = null;
        try { anchor = document.querySelector(d.afterSelector); } catch {}
        if (!anchor || !anchor.parentNode) return;
        // Evitar duplicar várias vezes em re-applies: marcar com chave
        const key = '__dup:' + (d.afterSelector || '') + ':' + (d.html.length || 0);
        if (anchor.parentNode.querySelector(`[data-dup-key="${CSS && CSS.escape ? CSS.escape(key) : key}"]`)) return;
        const tpl = document.createElement('template');
        tpl.innerHTML = d.html.trim();
        const node = tpl.content.firstElementChild;
        if (!node) return;
        node.setAttribute('data-dup-key', key);
        anchor.parentNode.insertBefore(node, anchor.nextSibling);
      });
    }

    // 8) Reordenar secções da homepage com base em homepage.sectionsOrder
    const order = resolve(content, 'homepage.sectionsOrder');
    if (Array.isArray(order)) {
      const sections = document.querySelectorAll('[data-section-id]');
      if (sections.length) {
        const map = new Map();
        sections.forEach((s) => map.set(s.dataset.sectionId, s));
        const parent = sections[0].parentNode;
        order.forEach(({ id, visible }) => {
          const node = map.get(id);
          if (!node) return;
          if (visible === false) node.style.display = 'none';
          else node.style.display = '';
          parent.appendChild(node);
        });
      }
    }
  }

  try {
    const content = await fetchContent();
    if (document.readyState === 'loading') {
      await new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }));
    }
    applyContent(content);
    document.dispatchEvent(new CustomEvent('contentLoaded', { detail: content }));

    if (editMode) {
      const s = document.createElement('script');
      s.src = '/js/inline-editor.js';
      s.defer = true;
      document.body.appendChild(s);
      const s2 = document.createElement('script');
      s2.src = '/js/layout-edit-mode.js';
      s2.defer = true;
      document.body.appendChild(s2);
    }
  } catch (e) {
    console.warn('[content-loader] erro:', e.message);
    window._siteContent = null;
    document.dispatchEvent(new CustomEvent('contentLoaded', { detail: null }));
  }
})();
