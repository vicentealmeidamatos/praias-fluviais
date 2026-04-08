/**
 * layout-overrides.js — Aplica overrides de posição/tamanho/visibilidade
 * gravados via admin (dataset "layout") em todas as páginas públicas.
 *
 * Estrutura do dataset layout:
 * {
 *   "<pageId>": {
 *     "<elementSelector>": {
 *       desktop: { x, y, w, h, hidden },
 *       tablet:  { x, y, w, h, hidden },
 *       mobile:  { x, y, w, h, hidden }
 *     }
 *   }
 * }
 *
 * Comportamento: começa vazio. Se não houver overrides para a página actual,
 * NÃO injecta nada — o site público fica pixel-idêntico ao que era antes.
 */
(function () {
  'use strict';
  if (window.__layoutOverridesInit) return;
  window.__layoutOverridesInit = true;

  // Identificador da página actual (filename sem .html)
  function currentPageId() {
    const p = location.pathname.split('/').pop() || 'index.html';
    return p.replace(/\.html?$/, '') || 'index';
  }

  // Breakpoint actual
  function currentBreakpoint() {
    const w = window.innerWidth;
    if (w < 768) return 'mobile';
    if (w < 1024) return 'tablet';
    return 'desktop';
  }

  // Escapa selector CSS para id
  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function buildCss(pageOverrides) {
    if (!pageOverrides || typeof pageOverrides !== 'object') return '';
    const lines = [];
    const bp = currentBreakpoint();
    for (const sel of Object.keys(pageOverrides)) {
      const o = pageOverrides[sel];
      if (!o) continue;
      const v = o[bp] || o.desktop || null;
      if (!v) continue;
      // sel pode ser um id (#xxx), classe (.xxx), ou selector arbitrário.
      // Por convenção do editor, gravamos como `[data-lo="<id>"]`.
      const selector = `[data-lo="${cssEscape(sel)}"]`;
      const decls = [];
      if (v.hidden) {
        decls.push('display:none !important');
      } else {
        if (typeof v.x === 'number' || typeof v.y === 'number') {
          const x = (v.x || 0) + 'px';
          const y = (v.y || 0) + 'px';
          decls.push(`transform: translate(${x}, ${y})`);
          decls.push('position: relative');
        }
        if (typeof v.w === 'number') decls.push(`width: ${v.w}px`);
        if (typeof v.h === 'number') decls.push(`height: ${v.h}px`);
      }
      if (decls.length) lines.push(`${selector} { ${decls.join('; ')}; }`);
    }
    return lines.join('\n');
  }

  function inject(css) {
    let el = document.getElementById('layout-overrides');
    if (!css) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('style');
      el.id = 'layout-overrides';
      document.head.appendChild(el);
    }
    el.textContent = css;
  }

  async function apply() {
    if (!window.DataLoader || !window.DataLoader.loadDataset) return;
    try {
      const layout = await window.DataLoader.loadDataset('layout');
      if (!layout || typeof layout !== 'object') return;
      const pageOverrides = layout[currentPageId()];
      if (!pageOverrides) return; // nada a fazer → site fica idêntico
      inject(buildCss(pageOverrides));
    } catch (e) {
      // silencioso — não pode quebrar o site público
    }
  }

  // Re-aplica em resize (mudança de breakpoint)
  let rt = null;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(apply, 150);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
