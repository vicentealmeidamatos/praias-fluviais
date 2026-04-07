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
(async function () {
  const SUPABASE_URL = 'https://tjvhnbukzfyxtpkrhpsw.supabase.co';
  const SUPABASE_ANON = 'sb_publishable_ke--Q7xNRNCxTjgxFCNFIQ_6zPD3zM3';

  const params = new URLSearchParams(location.search);
  const editMode = params.get('edit') === '1';
  const previewDraft = params.get('preview') === 'draft';

  async function fetchContent() {
    // 1) Draft em sessionStorage (modo preview)
    if (previewDraft) {
      try {
        const draft = sessionStorage.getItem('_contentDraft');
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

  function applyContent(content) {
    window._siteContent = content;

    // 0) Rebuild de blocos a partir de arrays do CMS.
    //    Aceita qualquer path: data-cms-rebuild="global.nav" / "global.social" /
    //    "global.footer.col1Links". Usa o primeiro filho existente como template
    //    (preserva todas as classes Tailwind) e expõe o container como
    //    data-content-list para o editor inline.
    //    Aliases: "nav"→"global.nav", "social"→"global.social".
    const currentPage = (location.pathname.split('/').pop() || 'index.html');
    document.querySelectorAll('[data-cms-rebuild]').forEach((container) => {
      let path = container.dataset.cmsRebuild;
      if (path === 'nav') path = 'global.nav';
      else if (path === 'social') path = 'global.social';
      const arr = resolve(content, path);
      if (!Array.isArray(arr) || !arr.length) return;
      const tpl = container.firstElementChild;
      if (!tpl) return;
      const tplOuter = tpl.outerHTML;
      container.innerHTML = '';
      arr.forEach((item, idx) => {
        const wrap = document.createElement('div');
        wrap.innerHTML = tplOuter.trim();
        const node = wrap.firstElementChild;
        if (!node) return;

        // Encontrar a âncora real (pode ser o próprio nó ou um descendente)
        const anchor = node.matches && node.matches('a') ? node : node.querySelector('a');
        if (anchor && item.href != null) anchor.href = item.href || '#';

        // Substituir o ícone Lucide se item.icon existir
        if (item.icon) {
          const iconEl = (anchor || node).querySelector('[data-lucide]');
          if (iconEl) iconEl.setAttribute('data-lucide', item.icon);
        }

        // Atualizar o label de texto preservando ícones inline
        const labelTarget = anchor || node;
        // Estratégia: encontrar o último text-node não vazio direto OU o span sem ícone
        let textNode = null;
        for (const child of labelTarget.childNodes) {
          if (child.nodeType === 3 && child.textContent.trim()) textNode = child;
        }
        if (textNode) {
          textNode.textContent = ' ' + (item.label || '') + ' ';
        } else {
          // procurar span filho direto
          const span = Array.from(labelTarget.children).find(
            c => c.tagName === 'SPAN' && !c.querySelector('[data-lucide]')
          );
          if (span) span.textContent = item.label || '';
          else if (!labelTarget.querySelector('[data-lucide]')) {
            labelTarget.textContent = item.label || '';
          } else {
            // appendar text node
            labelTarget.appendChild(document.createTextNode(' ' + (item.label || '')));
          }
        }

        // Estado active na navegação (por pathname)
        if (path.endsWith('.nav') || path === 'global.nav') {
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
      // Tornar editável pelo inline editor
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
    }
  } catch (e) {
    console.warn('[content-loader] erro:', e.message);
    window._siteContent = null;
    document.dispatchEvent(new CustomEvent('contentLoaded', { detail: null }));
  }
})();
