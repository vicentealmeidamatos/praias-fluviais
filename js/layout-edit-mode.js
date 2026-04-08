/**
 * layout-edit-mode.js — Editor visual de layout (drag/resize estilo Webflow).
 *
 * Activado quando a página é carregada com ?edit=1 E o parent envia
 *   { type: 'layout-mode', on: true }
 *
 * Comportamento:
 *  - Clique num elemento → selecciona-o, mostra caixa de selecção com handles
 *  - Drag dentro da caixa → move (transform: translate)
 *  - Drag nos handles dos cantos/lados → resize (width/height)
 *  - Snap a 8px (Shift = livre)
 *  - Esc → desselecciona
 *  - Cada alteração emite postMessage para o parent:
 *      { type:'layout-change', page, selector, value: { x, y, w, h, hidden } }
 *  - O parent acumula em state.data.layout[page][selector] e envia para o
 *    dataset "layout" via /api/save-data.
 *
 * As alterações são aplicadas em runtime no site público por js/layout-overrides.js
 * (que carrega o dataset "layout" e injecta um <style> com os overrides).
 */
(function () {
  if (window.__layoutEditModeLoaded) return;
  window.__layoutEditModeLoaded = true;

  const PARENT = window.parent !== window ? window.parent : null;
  function send(m) { if (PARENT) PARENT.postMessage(m, '*'); }

  const PAGE_KEY = (function () {
    const p = location.pathname.split('/').pop() || 'index.html';
    return p.replace(/\.html?$/, '') || 'index';
  })();

  let active = false;
  let selected = null;
  let overlay = null;
  let handlesEl = null;
  let actionBar = null;

  const css = `
    .__lo-mode-on, .__lo-mode-on * { user-select: none !important; }
    .__lo-mode-on [data-lo-hover] { outline: 2px dashed #FFEB3B !important; outline-offset: 2px !important; }
    .__lo-selected { outline: 3px solid #FFEB3B !important; outline-offset: 2px !important; box-shadow: 0 0 0 6px rgba(255,235,59,.18) !important; }
    .__lo-overlay {
      position: fixed; inset: 0; pointer-events: none; z-index: 2147483646;
    }
    .__lo-handle {
      position: absolute; width: 14px; height: 14px; background: #FFEB3B;
      border: 2px solid #003A40; border-radius: 50%; pointer-events: auto;
      cursor: nwse-resize; box-shadow: 0 2px 8px rgba(0,0,0,.3);
    }
    .__lo-toolbar {
      position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
      z-index: 2147483647; background: #003A40; color: #fff; padding: 8px 14px;
      border-radius: 12px; font: 600 12px Poppins,system-ui,sans-serif;
      box-shadow: 0 12px 40px rgba(0,0,0,.4); display: flex; gap: 10px; align-items: center;
    }
    .__lo-toolbar button { background: rgba(255,255,255,.1); color: #fff; border: 0; padding: 6px 10px; border-radius: 8px; cursor: pointer; font: 600 11px Poppins,system-ui,sans-serif; }
    .__lo-toolbar button.primary { background: #FFEB3B; color: #003A40; }
    .__lo-actionbar {
      position: fixed; z-index: 2147483647; background: #003A40; color: #fff;
      padding: 6px 8px; border-radius: 10px; display: flex; gap: 6px;
      box-shadow: 0 10px 30px rgba(0,0,0,.35);
      font: 600 11px Poppins,system-ui,sans-serif;
    }
    .__lo-actionbar button {
      background: rgba(255,255,255,.12); color: #fff; border: 0;
      padding: 6px 10px; border-radius: 7px; cursor: pointer;
      font: 600 11px Poppins,system-ui,sans-serif;
      display: inline-flex; align-items: center; gap: 5px;
    }
    .__lo-actionbar button:hover { background: rgba(255,235,59,.25); color: #FFEB3B; }
    .__lo-actionbar button.danger:hover { background: rgba(220,38,38,.4); color: #fff; }
  `;

  function injectCss() {
    if (document.getElementById('__lo-mode-css')) return;
    const s = document.createElement('style');
    s.id = '__lo-mode-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // Selector estável (id > classe + tag + nth-of-type)
  function genSelector(el) {
    if (!el || el === document.body) return 'body';
    if (el.id) return '#' + el.id;
    const parts = [];
    let cur = el;
    while (cur && cur !== document.body && parts.length < 6) {
      let p = cur.tagName.toLowerCase();
      if (cur.classList.length) p += '.' + Array.from(cur.classList).slice(0, 2).join('.');
      const parent = cur.parentNode;
      if (parent) {
        const same = Array.from(parent.children).filter(c => c.tagName === cur.tagName);
        if (same.length > 1) p += `:nth-of-type(${same.indexOf(cur) + 1})`;
      }
      parts.unshift(p);
      cur = cur.parentNode;
    }
    return parts.join('>');
  }

  function snap(v, ev) {
    if (ev && ev.shiftKey) return Math.round(v);
    return Math.round(v / 8) * 8;
  }

  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = '__lo-overlay';
    document.body.appendChild(overlay);
  }

  function removeHandles() {
    if (handlesEl) { handlesEl.remove(); handlesEl = null; }
    if (actionBar) { actionBar.remove(); actionBar = null; }
  }

  function drawActionBar() {
    if (actionBar) { actionBar.remove(); actionBar = null; }
    if (!selected) return;
    const r = selected.getBoundingClientRect();
    actionBar = document.createElement('div');
    actionBar.className = '__lo-actionbar';
    actionBar.innerHTML = `
      <button data-act="dup" title="Duplicar elemento (Ctrl+D)">⧉ Duplicar</button>
      <button data-act="link" title="Editar ligação">🔗 Ligação</button>
      <button data-act="close" class="danger" title="Fechar opções">✕ Fechar</button>
    `;
    // Posição: por cima do elemento se houver espaço; senão por baixo
    const barH = 36;
    let top = r.top - barH - 8;
    if (top < 8) top = r.bottom + 8;
    let left = r.left;
    if (left + 260 > window.innerWidth) left = window.innerWidth - 268;
    if (left < 8) left = 8;
    actionBar.style.top = top + 'px';
    actionBar.style.left = left + 'px';
    document.body.appendChild(actionBar);
    actionBar.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-act]');
      if (!btn) return;
      ev.preventDefault(); ev.stopPropagation();
      const act = btn.dataset.act;
      if (act === 'dup') duplicateSelected();
      else if (act === 'link') editLinkOfSelected();
      else if (act === 'close') {
        if (selected) selected.classList.remove('__lo-selected');
        selected = null;
        removeHandles();
      }
    });
  }

  function duplicateSelected() {
    if (!selected || !selected.parentNode) return;
    const clone = selected.cloneNode(true);
    // Limpar marcações de selecção/handles no clone
    clone.classList.remove('__lo-selected');
    clone.removeAttribute('data-lo-applied');
    selected.parentNode.insertBefore(clone, selected.nextSibling);
    // Persistir no parent: enviar HTML + selector do "âncora" (selected)
    try {
      send({
        type: 'duplicate-element',
        page: PAGE_KEY,
        afterSelector: genSelector(selected),
        html: clone.outerHTML,
      });
    } catch {}
    // Selecionar o clone
    if (selected) selected.classList.remove('__lo-selected');
    selected = clone;
    selected.classList.add('__lo-selected');
    drawHandles();
  }

  function findLinkAncestor(el) {
    let cur = el;
    while (cur && cur !== document.body) {
      if (cur.tagName === 'A') return cur;
      cur = cur.parentNode;
    }
    return null;
  }

  function editLinkOfSelected() {
    if (!selected) return;
    let a = findLinkAncestor(selected);
    // Se não há <a>, podemos envolver o elemento num <a> novo
    const wrapWithAnchor = !a;
    const opener = window.parent && window.parent !== window
      ? null // o iframe partilha origin, basta usar o do próprio inline-editor
      : null;
    if (typeof window.__ieOpenLinkPicker !== 'function') {
      // fallback simples
      const v = prompt('URL da ligação:', a ? a.getAttribute('href') || '' : '');
      if (v == null) return;
      applyLinkChange(a, v, false, wrapWithAnchor);
      return;
    }
    window.__ieOpenLinkPicker((url, openInNew) => {
      applyLinkChange(a, url, openInNew, wrapWithAnchor);
    }, a ? (a.getAttribute('href') || '') : '');
  }

  function applyLinkChange(a, url, openInNew, wrapWithAnchor) {
    let target = a;
    if (!target && wrapWithAnchor && selected) {
      target = document.createElement('a');
      selected.parentNode.insertBefore(target, selected);
      target.appendChild(selected);
    }
    if (!target) return;
    target.setAttribute('href', url);
    if (openInNew) {
      target.setAttribute('target', '_blank');
      target.setAttribute('rel', 'noopener');
    } else {
      target.removeAttribute('target');
      target.removeAttribute('rel');
    }
    // Persistir como override de href no content (mesmo formato que inline-editor usa)
    try {
      const inChrome = target.closest && target.closest('header, nav, footer');
      send({
        type: 'override-change',
        page: inChrome ? '__global__' : PAGE_KEY,
        selector: genSelector(target),
        value: { href: url },
      });
    } catch {}
    drawHandles();
  }

  function drawHandles() {
    removeHandles();
    if (!selected) return;
    const r = selected.getBoundingClientRect();
    handlesEl = document.createElement('div');
    handlesEl.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;pointer-events:none;z-index:2147483646;`;
    const positions = [
      { k: 'nw', x: -7, y: -7, cur: 'nwse-resize' },
      { k: 'ne', x: r.width - 7, y: -7, cur: 'nesw-resize' },
      { k: 'sw', x: -7, y: r.height - 7, cur: 'nesw-resize' },
      { k: 'se', x: r.width - 7, y: r.height - 7, cur: 'nwse-resize' },
    ];
    for (const p of positions) {
      const h = document.createElement('div');
      h.className = '__lo-handle';
      h.style.left = p.x + 'px';
      h.style.top = p.y + 'px';
      h.style.cursor = p.cur;
      h.dataset.handle = p.k;
      handlesEl.appendChild(h);
      h.addEventListener('mousedown', startResize);
    }
    document.body.appendChild(handlesEl);
    drawActionBar();
  }

  let dragState = null;

  function getCurrentTranslate(el) {
    const t = el.style.transform || '';
    const m = t.match(/translate\(\s*(-?\d+(?:\.\d+)?)px\s*,\s*(-?\d+(?:\.\d+)?)px\s*\)/);
    return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 };
  }

  function applyOverride(el, patch) {
    if (typeof patch.x === 'number' || typeof patch.y === 'number') {
      const cur = getCurrentTranslate(el);
      const x = typeof patch.x === 'number' ? patch.x : cur.x;
      const y = typeof patch.y === 'number' ? patch.y : cur.y;
      el.style.position = el.style.position || 'relative';
      el.style.transform = `translate(${x}px, ${y}px)`;
      patch.x = x; patch.y = y;
    }
    if (typeof patch.w === 'number') el.style.width = patch.w + 'px';
    if (typeof patch.h === 'number') el.style.height = patch.h + 'px';
    if (typeof patch.hidden === 'boolean') el.style.display = patch.hidden ? 'none' : '';
    el.setAttribute('data-lo-applied', '1');
    drawHandles();
    send({ type: 'layout-change', page: PAGE_KEY, selector: genSelector(el), value: patch });
  }

  function onClickSelect(ev) {
    if (!active) return;
    const el = ev.target;
    if (!el || el === document.body || el.closest('.__lo-toolbar, .__lo-handle, .__lo-overlay, .__lo-actionbar, .__ie-modal-backdrop, .__ie-modal')) return;
    ev.preventDefault(); ev.stopPropagation();
    if (selected) selected.classList.remove('__lo-selected');
    selected = el;
    selected.classList.add('__lo-selected');
    drawHandles();
  }

  function startMove(ev) {
    if (!active || !selected || ev.target !== selected) return;
    if (ev.target.closest('.__lo-handle')) return;
    ev.preventDefault();
    const cur = getCurrentTranslate(selected);
    dragState = { mode: 'move', sx: ev.clientX, sy: ev.clientY, x0: cur.x, y0: cur.y };
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', endDrag);
  }

  function startResize(ev) {
    ev.preventDefault(); ev.stopPropagation();
    if (!selected) return;
    const r = selected.getBoundingClientRect();
    dragState = { mode: 'resize', handle: ev.currentTarget.dataset.handle, sx: ev.clientX, sy: ev.clientY, w0: r.width, h0: r.height };
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', endDrag);
  }

  function onDragMove(ev) {
    if (!dragState || !selected) return;
    if (dragState.mode === 'move') {
      const dx = snap(dragState.x0 + (ev.clientX - dragState.sx), ev);
      const dy = snap(dragState.y0 + (ev.clientY - dragState.sy), ev);
      applyOverride(selected, { x: dx, y: dy });
    } else if (dragState.mode === 'resize') {
      let nw = dragState.w0;
      let nh = dragState.h0;
      const dx = ev.clientX - dragState.sx;
      const dy = ev.clientY - dragState.sy;
      if (dragState.handle.includes('e')) nw = snap(dragState.w0 + dx, ev);
      if (dragState.handle.includes('w')) nw = snap(dragState.w0 - dx, ev);
      if (dragState.handle.includes('s')) nh = snap(dragState.h0 + dy, ev);
      if (dragState.handle.includes('n')) nh = snap(dragState.h0 - dy, ev);
      nw = Math.max(20, nw); nh = Math.max(20, nh);
      applyOverride(selected, { w: nw, h: nh });
    }
  }

  function endDrag() {
    dragState = null;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', endDrag);
  }

  function onKey(ev) {
    if (!active) return;
    if (ev.key === 'Escape') {
      if (selected) { selected.classList.remove('__lo-selected'); selected = null; removeHandles(); }
    } else if (selected && (ev.ctrlKey || ev.metaKey) && (ev.key === 'd' || ev.key === 'D')) {
      ev.preventDefault();
      duplicateSelected();
    } else if (selected && (ev.key === 'Delete' || ev.key === 'Backspace')) {
      ev.preventDefault();
      applyOverride(selected, { hidden: true });
    } else if (selected && ev.key.startsWith('Arrow')) {
      ev.preventDefault();
      const cur = getCurrentTranslate(selected);
      const step = ev.shiftKey ? 1 : 8;
      const d = { ArrowUp: [0,-step], ArrowDown: [0,step], ArrowLeft: [-step,0], ArrowRight: [step,0] }[ev.key];
      applyOverride(selected, { x: cur.x + d[0], y: cur.y + d[1] });
    }
  }

  function setActive(on) {
    active = on;
    document.body.classList.toggle('__lo-mode-on', on);
    if (on) {
      injectCss();
      ensureOverlay();
      document.addEventListener('click', onClickSelect, true);
      document.addEventListener('mousedown', startMove, true);
      document.addEventListener('keydown', onKey);
      // Suspender edição de texto enquanto o modo Layout está ativo: guardar
      // o estado original de contenteditable em cada elemento e desligá-lo.
      document.querySelectorAll('[contenteditable]').forEach(el => {
        if (el.__loCePrev == null) el.__loCePrev = el.getAttribute('contenteditable');
        el.setAttribute('contenteditable', 'false');
      });
      window.__layoutModeActive = true;
    } else {
      document.removeEventListener('click', onClickSelect, true);
      document.removeEventListener('mousedown', startMove, true);
      document.removeEventListener('keydown', onKey);
      if (selected) selected.classList.remove('__lo-selected');
      selected = null;
      removeHandles();
      // Restaurar contenteditable
      document.querySelectorAll('[contenteditable]').forEach(el => {
        if (el.__loCePrev != null) {
          el.setAttribute('contenteditable', el.__loCePrev);
          el.__loCePrev = null;
        }
      });
      window.__layoutModeActive = false;
    }
  }

  window.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.type === 'layout-mode') setActive(!!m.on);
    if (m.type === 'apply-snapshot' && m.layout) {
      // Reaplicar overrides de layout para a página actual a partir do snapshot
      try {
        const pageOverrides = m.layout[PAGE_KEY] || {};
        // Limpar todos os elementos previamente alterados (best-effort)
        document.querySelectorAll('[data-lo-applied]').forEach(el => {
          el.style.transform = '';
          el.style.width = '';
          el.style.height = '';
          el.style.display = '';
          el.removeAttribute('data-lo-applied');
        });
        // Aplicar do snapshot
        for (const [sel, cfg] of Object.entries(pageOverrides)) {
          const v = (cfg && cfg.desktop) || cfg;
          if (!v) continue;
          // sel pode ser um selector CSS gerado por genSelector
          let el = null;
          try { el = document.querySelector(sel); } catch {}
          if (!el) continue;
          if (typeof v.x === 'number' || typeof v.y === 'number') {
            el.style.position = 'relative';
            el.style.transform = `translate(${v.x || 0}px, ${v.y || 0}px)`;
          }
          if (typeof v.w === 'number') el.style.width = v.w + 'px';
          if (typeof v.h === 'number') el.style.height = v.h + 'px';
          if (v.hidden) el.style.display = 'none';
          el.setAttribute('data-lo-applied', '1');
        }
        if (selected) drawHandles();
      } catch {}
    }
  });

  // Re-desenhar handles em scroll/resize
  window.addEventListener('scroll', () => { if (active && selected) drawHandles(); }, true);
  window.addEventListener('resize', () => { if (active && selected) drawHandles(); });

  send({ type: 'layout-edit-ready' });
})();
