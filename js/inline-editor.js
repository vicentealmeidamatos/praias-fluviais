/**
 * inline-editor.js — Editor visual injetado em páginas com ?edit=1
 *
 * Responsável por:
 *   - Tornar elementos com data-content* clicáveis e editáveis
 *   - Toolbar flutuante para texto rico (B / I / link / listas)
 *   - Upload de imagens via /api/upload (folder content)
 *   - Picker de link (páginas internas + URL externo)
 *   - Reordenar / adicionar / eliminar itens em data-content-list
 *   - Reordenar secções marcadas com data-section-id
 *   - Suprime navegação e abertura de modais durante edição
 *   - Envia diffs ao parent (admin) via postMessage
 *
 * Mensagens emitidas para o parent:
 *   { type:'inline-editor-ready' }
 *   { type:'content-change', path, value }                  → texto/html/img/href
 *   { type:'content-list-change', path, value }             → lista completa após reorder/add/remove
 *   { type:'sections-order-change', value }                 → array sectionsOrder
 *   { type:'dirty' }                                        → houve alteração
 *   { type:'request-pages' }                                → pede dropdown de páginas internas
 *
 * Mensagens recebidas:
 *   { type:'pages-list', pages: [{label,href},...] }
 *   { type:'apply-content', content }                       → forçar refresh (undo/redo)
 *   { type:'set-device', width }                            → debug
 */
(function () {
  if (window.__inlineEditorLoaded) return;
  window.__inlineEditorLoaded = true;

  // Em modo edição, garantir que NENHUM perfil aparece como autenticado
  // dentro do iframe (mesmo que o utilizador tenha sessão Supabase noutro tab).
  // Limpamos chaves de auth do storage do iframe ANTES de qualquer script
  // de UI ler o estado e fazemos signOut do cliente Supabase quando criado.
  try {
    Object.keys(localStorage).forEach(k => { if (/^sb-.*-auth-token/.test(k)) localStorage.removeItem(k); });
    Object.keys(sessionStorage).forEach(k => { if (/^sb-.*-auth-token/.test(k)) sessionStorage.removeItem(k); });
  } catch {}
  // Hook para esconder qualquer UI "logged-in" (avatar, nome, botão "Sair", etc.)
  function hideAuthUi() {
    document.querySelectorAll('[data-auth="logged-in"], .js-auth-logged-in, #profile-button, #user-menu, [data-user-menu]')
      .forEach(el => { try { el.style.display = 'none'; } catch {} });
    document.querySelectorAll('[data-auth="logged-out"], .js-auth-logged-out')
      .forEach(el => { try { el.style.display = ''; } catch {} });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hideAuthUi);
  else hideAuthUi();
  setTimeout(hideAuthUi, 500);
  setTimeout(hideAuthUi, 1500);

  const PARENT = window.parent !== window ? window.parent : null;
  function send(msg) {
    if (PARENT) PARENT.postMessage(msg, '*');
  }

  // Tracker de "está realmente sujo?": guarda Set de elementos divergentes
  // do seu valor original. Quando o set fica vazio, envia 'clean' ao parent.
  const _dirtySet = new Set();
  function _refreshDirty() {
    if (_dirtySet.size > 0) send({ type: 'dirty' });
    else send({ type: 'clean' });
  }
  function setElementDirty(el, isDirty) {
    if (isDirty) _dirtySet.add(el);
    else _dirtySet.delete(el);
    _refreshDirty();
  }
  function markDirty() { send({ type: 'dirty' }); }

  // Sincroniza um elemento editado com um dataset do admin (settings, beaches,
  // articles, descontos, produtos, locations…). Retorna true se enviou um
  // dataset-change e o caller deve abortar (não criar override duplicado).
  function sendBindIfBound(el, newHtmlOrText) {
    if (!el || !el.closest) return false;
    const bindHost = el.closest('[data-content-bind]');
    if (bindHost) {
      const spec = bindHost.getAttribute('data-content-bind') || '';
      const i = spec.indexOf(':');
      if (i > 0) {
        const ds = spec.slice(0, i);
        const path = spec.slice(i + 1);
        // Para campos rich (data-content-html ou universal-edit) gravamos o
        // HTML; para texto simples gravamos o texto.
        const isHtml = el.hasAttribute('data-content-html') || (newHtmlOrText && /<\w/.test(newHtmlOrText));
        const value = isHtml ? (newHtmlOrText || el.innerHTML.trim()) : el.textContent.trim();
        send({ type: 'dataset-change', dataset: ds, path, value });
        return true;
      }
    }
    // Backward compat com data-content-settings
    const settingsHost = el.closest('[data-content-settings]');
    if (settingsHost) {
      send({
        type: 'dataset-change',
        dataset: 'settings',
        path: settingsHost.getAttribute('data-content-settings'),
        value: el.textContent.trim(),
      });
      return true;
    }
    return false;
  }

  // ────────────────────────────────────────────────────────────
  // STYLES
  // ────────────────────────────────────────────────────────────
  const css = `
    *[data-content], *[data-content-html], *[data-content-img], *[data-content-href] {
      cursor: text;
      transition: outline-color .12s ease, background-color .12s ease;
      outline: 2px solid transparent;
      outline-offset: 3px;
      border-radius: 3px;
      position: relative;
    }
    *[data-content]:hover, *[data-content-html]:hover, *[data-content-href]:hover {
      outline-color: #0288D1;
      background-color: rgba(2, 136, 209, 0.06);
    }
    *[data-content-img]:hover {
      outline-color: #0288D1;
      box-shadow: 0 0 0 3px rgba(2,136,209,.15);
    }
    .__ie-editing {
      outline: 2px solid #003A40 !important;
      background-color: rgba(255, 235, 59, 0.18) !important;
    }
    .__ie-toolbar {
      position: fixed;
      z-index: 2147483647;
      background: #003A40;
      color: white;
      border-radius: 10px;
      box-shadow: 0 12px 32px rgba(0,0,0,.35);
      padding: 6px;
      display: flex;
      gap: 4px;
      font-family: 'Poppins', system-ui, sans-serif;
      font-size: 12px;
      animation: __ie-pop .14s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .__ie-toolbar button {
      background: transparent;
      border: 0;
      color: white;
      cursor: pointer;
      padding: 6px 10px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 12px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .__ie-toolbar button:hover { background: rgba(255,255,255,.16); }
    .__ie-toolbar button.active { background: #FFEB3B; color: #003A40; }
    .__ie-toolbar .__ie-sep { width: 1px; background: rgba(255,255,255,.18); margin: 4px 2px; }
    @keyframes __ie-pop { from { opacity: 0; transform: translateY(4px) scale(.96); } to { opacity: 1; transform: none; } }

    .__ie-list-controls {
      position: absolute;
      top: -14px;
      right: -14px;
      z-index: 2147483646;
      display: none;
      gap: 4px;
      background: white;
      border: 1px solid #003A40;
      border-radius: 8px;
      padding: 2px;
      box-shadow: 0 6px 16px rgba(0,0,0,.18);
    }
    [data-content-item-index]:hover > .__ie-list-controls,
    [data-content-item-index].__ie-active > .__ie-list-controls {
      display: flex;
    }
    [data-content-item-index] {
      position: relative;
      outline: 1px dashed transparent;
      outline-offset: 3px;
      transition: outline-color .12s;
    }
    [data-content-item-index]:hover {
      outline-color: rgba(2,136,209,.4);
    }
    .__ie-list-controls button {
      background: white; border: 0; cursor: pointer;
      width: 24px; height: 24px; border-radius: 5px;
      font-size: 13px; display: inline-flex; align-items: center; justify-content: center;
      color: #003A40;
    }
    .__ie-list-controls button:hover { background: #FFEB3B; }
    .__ie-list-add {
      display: block;
      margin: 12px auto;
      background: #FFEB3B;
      color: #003A40;
      border: 0;
      padding: 8px 18px;
      border-radius: 999px;
      font-family: 'Poppins', sans-serif;
      font-weight: 700;
      font-size: 12px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,58,64,.2);
    }

    [data-section-id] { position: relative; }
    .__ie-section-handle {
      position: absolute;
      top: 12px; left: 12px;
      z-index: 2147483645;
      background: #003A40;
      color: #FFEB3B;
      border-radius: 8px;
      padding: 6px 12px;
      font: 600 11px 'Poppins', sans-serif;
      cursor: grab;
      box-shadow: 0 4px 12px rgba(0,0,0,.3);
      user-select: none;
      display: none;
    }
    body.__ie-show-handles .__ie-section-handle { display: inline-flex; align-items: center; gap: 6px; }
    [data-section-id].__ie-dragging { opacity: .4; }
    [data-section-id].__ie-drop-target { box-shadow: inset 0 4px 0 #FFEB3B; }

    .__ie-modal-backdrop {
      position: fixed; inset: 0;
      background: rgba(0,30,32,.5);
      z-index: 2147483646;
      display: flex; align-items: center; justify-content: center;
      animation: __ie-fade .15s;
    }
    .__ie-modal {
      background: white; border-radius: 16px; padding: 24px;
      max-width: 440px; width: 90%;
      box-shadow: 0 24px 60px rgba(0,0,0,.4);
      font-family: 'Open Sans', system-ui, sans-serif;
    }
    .__ie-modal h3 { font-family: 'Poppins', sans-serif; font-weight: 700; color: #003A40; margin: 0 0 14px; font-size: 16px; }
    .__ie-modal label { display: block; font-size: 11px; font-weight: 600; color: #5C5340; text-transform: uppercase; letter-spacing: .03em; margin-bottom: 4px; margin-top: 12px; }
    .__ie-modal input, .__ie-modal select {
      width: 100%; padding: 9px 12px; border: 1.5px solid #E2D9C6; border-radius: 8px;
      font-size: 14px; font-family: inherit; color: #003A40;
      transition: border-color .12s;
    }
    .__ie-modal input:focus, .__ie-modal select:focus { outline: none; border-color: #003A40; }
    .__ie-modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 18px; }
    .__ie-modal button {
      padding: 9px 16px; border-radius: 8px; border: 0; cursor: pointer;
      font-family: 'Poppins', sans-serif; font-weight: 600; font-size: 13px;
    }
    .__ie-btn-primary { background: #003A40; color: white; }
    .__ie-btn-primary:hover { background: #00252A; }
    .__ie-btn-ghost { background: #FAF8F5; color: #003A40; }
    @keyframes __ie-fade { from { opacity: 0; } to { opacity: 1; } }

    .__ie-image-library {
      max-height: 340px; overflow-y: auto;
      display: grid; grid-template-columns: repeat(4, 1fr);
      gap: 8px; margin-top: 8px; padding: 8px;
      background: #FAF8F5; border-radius: 8px;
    }
    .__ie-image-library img {
      width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 6px;
      cursor: pointer; transition: transform .12s, outline-color .12s;
      outline: 2px solid transparent;
    }
    .__ie-image-library img:hover { transform: scale(1.05); outline-color: #003A40; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // Quill (carregado a pedido se ainda não estiver presente)
  function ensureQuill() {
    return new Promise((resolve) => {
      if (window.Quill) return resolve(window.Quill);
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/quill@2/dist/quill.snow.css';
      document.head.appendChild(link);
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/quill@2/dist/quill.js';
      s.onload = () => resolve(window.Quill);
      document.head.appendChild(s);
    });
  }

  // ────────────────────────────────────────────────────────────
  // UTILS
  // ────────────────────────────────────────────────────────────
  function setByPath(obj, path, value) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      const next = parts[i + 1];
      const isIdx = /^\d+$/.test(next);
      if (cur[k] == null) cur[k] = isIdx ? [] : {};
      cur = cur[k];
    }
    cur[parts[parts.length - 1]] = value;
  }
  function getByPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }

  // Suprimir navegação e interações durante edição.
  // Filosofia: NADA na página deve disparar handlers do site (modais,
  // navegação, abertura de menus, etc). Apenas a edição é que deve funcionar.
  // Excepções pontuais: elementos com `data-edit-allow-nav` (raros).
  function isAllowedNavTarget(el) {
    if (!el) return false;
    return !!el.closest('[data-edit-allow-nav]');
  }
  // Selector dos elementos do PRÓPRIO editor — esses nunca devem ser bloqueados.
  // NOTA: __ie-icon-host NÃO entra aqui — é tratado separadamente, porque
  // queremos abrir o picker de ícones MAS continuar a impedir que o link/botão
  // pai navegue.
  const EDITOR_SAFE_SEL = '.__ie-toolbar, .__ie-modal, .__ie-modal-backdrop, .__ie-list-controls, .__ie-section-handle, .__lo-actionbar, .__lo-toolbar, .__lo-handle, .__lo-overlay';
  function isInsideEditorUI(el) {
    return !!(el && el.closest && el.closest(EDITOR_SAFE_SEL));
  }
  // Bloqueio universal: para clicks/pointer/mouse/touch/keydown que NÃO
  // estejam em UI do editor nem marcados como nav permitida, faz preventDefault
  // + stopImmediatePropagation. Excepção adicional: edição de texto inline
  // continua a funcionar porque os handlers de focus/blur são attach DIRECTAMENTE
  // nos elementos editáveis e os event types que deixamos passar (focus/input)
  // não são interceptados aqui.
  function blockSiteInteractions(e) {
    const t = e.target;
    if (!t || isInsideEditorUI(t)) return;
    if (isAllowedNavTarget(t)) return;

    // Em modo Layout, o layout-edit-mode.js precisa de receber os eventos
    // (click para selecionar, mousedown para drag, keydown para setas/delete).
    // Apenas bloqueamos a propagação final para que o site não navegue, mas
    // usamos só preventDefault (sem stopImmediatePropagation) para que os
    // listeners do layout editor recebam o evento.
    if (window.__layoutModeActive) {
      e.preventDefault();
      return;
    }

    // Contenteditable: permitimos mousedown/mouseup/pointer/touch para focus e
    // cursor, mas bloqueamos click para que o <a> pai não navegue.
    const editable = t.closest && (t.closest('[contenteditable], [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]') || t.closest('.__ie-editing'));
    if (editable && e.type !== 'click' && e.type !== 'auxclick' && e.type !== 'dblclick' && e.type !== 'submit') {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
  }

  function blockSiteInteractionsWithIcon(e) {
    const t = e.target;
    if (!t || isInsideEditorUI(t)) return;
    // Icon host: abrir picker (excepto em modo layout) e parar a propagação.
    if (e.type === 'click' && !window.__layoutModeActive && t.closest && t.closest('.__ie-icon-host')) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      try { openIconPicker(t.closest('.__ie-icon-host')); } catch {}
      return;
    }
    blockSiteInteractions(e);
  }
  const BLOCKED_EVENTS = ['click', 'auxclick', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'submit'];
  BLOCKED_EVENTS.forEach(ev => {
    document.addEventListener(ev, blockSiteInteractionsWithIcon, true);
  });
  // Suprimir Enter/Space em botões focados (também ativa onclick)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const t = e.target;
    if (!t || isInsideEditorUI(t) || isAllowedNavTarget(t)) return;
    if (t.closest && t.closest('[contenteditable="true"], .__ie-editing, input, textarea, select')) return;
    if (t.closest && t.closest('button, a, [role=button]')) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);
  // Bloquear navegação programática (window.open, location.assign/replace, location.href)
  try {
    const noop = function(){ return null; };
    window.open = noop;
    const _assign = location.assign.bind(location);
    const _replace = location.replace.bind(location);
    location.assign = function(){ /* bloqueado em modo edição */ };
    location.replace = function(){ /* bloqueado em modo edição */ };
    // Permitir setar location.href apenas pelo nosso código (postMessage do parent).
    // Tentativa best-effort; alguns browsers não permitem redefinir.
    Object.defineProperty(location, 'href', {
      configurable: true,
      get: () => location.toString(),
      set: function(v) { /* bloqueado em modo edição */ },
    });
  } catch {}

  // (icon picker tratado dentro de blockSiteInteractionsWithIcon acima)

  // ────────────────────────────────────────────────────────────
  // TEXTO SIMPLES (data-content)
  // ────────────────────────────────────────────────────────────
  document.querySelectorAll('[data-content]').forEach((el) => {
    if (el.closest('.__ie-toolbar, .__ie-modal')) return;
    el.setAttribute('contenteditable', 'plaintext-only');
    el.addEventListener('focus', () => {
      el.classList.add('__ie-editing');
      if (typeof el.__ieOriginalText === 'undefined') el.__ieOriginalText = el.textContent.trim();
    });
    el.addEventListener('blur', () => {
      el.classList.remove('__ie-editing');
      const newText = el.textContent.trim();
      if (newText === el.__ieOriginalText) { setElementDirty(el, false); return; }
      // Se o elemento (ou ancestral) estiver ligado a um dataset do admin
      // via data-content-bind="dataset:path", grava lá em vez de no content.
      if (sendBindIfBound(el, newText)) { setElementDirty(el, false); return; }
      const path = el.dataset.content;
      send({ type: 'content-change', path, value: newText });
    });
    el.addEventListener('input', () => {
      const isDiff = el.textContent.trim() !== el.__ieOriginalText;
      setElementDirty(el, isDiff);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    });
  });

  // ────────────────────────────────────────────────────────────
  // TEXTO RICO (data-content-html) — toolbar flutuante
  // ────────────────────────────────────────────────────────────
  let activeRich = null;
  let toolbarEl = null;

  function createToolbar() {
    if (toolbarEl) return toolbarEl;
    toolbarEl = document.createElement('div');
    toolbarEl.className = '__ie-toolbar';
    toolbarEl.innerHTML = `
      <button data-cmd="bold" title="Negrito"><b>B</b></button>
      <button data-cmd="italic" title="Itálico"><i>I</i></button>
      <button data-cmd="link" title="Inserir link">🔗</button>
      <div class="__ie-sep"></div>
      <button data-cmd="ul" title="Lista">•</button>
      <button data-cmd="ol" title="Lista numerada">1.</button>
      <div class="__ie-sep"></div>
      <button data-cmd="clear" title="Limpar formatação">✕</button>
    `;
    document.body.appendChild(toolbarEl);
    toolbarEl.addEventListener('mousedown', (e) => e.preventDefault());
    toolbarEl.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn || !activeRich) return;
      const cmd = btn.dataset.cmd;
      if (cmd === 'bold') document.execCommand('bold');
      else if (cmd === 'italic') document.execCommand('italic');
      else if (cmd === 'ul') document.execCommand('insertUnorderedList');
      else if (cmd === 'ol') document.execCommand('insertOrderedList');
      else if (cmd === 'clear') document.execCommand('removeFormat');
      else if (cmd === 'link') openLinkPicker((url, target) => {
        const sel = document.getSelection();
        if (!sel || sel.isCollapsed) {
          document.execCommand('insertHTML', false, `<a href="${url}"${target ? ' target="_blank" rel="noopener"' : ''}>${url}</a>`);
        } else {
          document.execCommand('createLink', false, url);
          // marcar target=_blank
          if (target) {
            const a = sel.anchorNode?.parentElement?.closest('a');
            if (a) { a.target = '_blank'; a.rel = 'noopener'; }
          }
        }
        markDirty();
        flushRich();
      });
      markDirty();
    });
    return toolbarEl;
  }

  function positionToolbar(el) {
    const tb = createToolbar();
    const rect = el.getBoundingClientRect();
    tb.style.display = 'flex';
    const tbRect = tb.getBoundingClientRect();
    let top = rect.top - tbRect.height - 10;
    if (top < 8) top = rect.bottom + 10;
    let left = rect.left + (rect.width / 2) - (tbRect.width / 2);
    if (left < 8) left = 8;
    if (left + tbRect.width > window.innerWidth - 8) left = window.innerWidth - tbRect.width - 8;
    tb.style.top = `${top}px`;
    tb.style.left = `${left}px`;
  }

  function flushRich() {
    if (!activeRich) return;
    const newHtml = activeRich.innerHTML.trim();
    if (newHtml === activeRich.__ieOriginalHtml) return; // sem alterações
    if (sendBindIfBound(activeRich, newHtml)) return;
    send({ type: 'content-change', path: activeRich.dataset.contentHtml, value: newHtml });
  }

  document.querySelectorAll('[data-content-html]').forEach((el) => {
    el.setAttribute('contenteditable', 'true');
    el.addEventListener('focus', () => {
      activeRich = el;
      el.classList.add('__ie-editing');
      if (typeof el.__ieOriginalHtml === 'undefined') el.__ieOriginalHtml = el.innerHTML.trim();
      positionToolbar(el);
    });
    el.addEventListener('blur', () => {
      setTimeout(() => {
        if (toolbarEl && !toolbarEl.matches(':hover')) {
          toolbarEl.style.display = 'none';
          el.classList.remove('__ie-editing');
          if (el.innerHTML.trim() === el.__ieOriginalHtml) setElementDirty(el, false);
          else flushRich();
          activeRich = null;
        }
      }, 200);
    });
    el.addEventListener('input', () => {
      const isDiff = el.innerHTML.trim() !== el.__ieOriginalHtml;
      setElementDirty(el, isDiff);
      positionToolbar(el);
    });
    el.addEventListener('scroll', () => activeRich === el && positionToolbar(el));
  });
  window.addEventListener('scroll', () => activeRich && positionToolbar(activeRich), true);
  window.addEventListener('resize', () => activeRich && positionToolbar(activeRich));

  // ────────────────────────────────────────────────────────────
  // IMAGENS (data-content-img)
  // ────────────────────────────────────────────────────────────
  document.querySelectorAll('[data-content-img]').forEach((img) => {
    img.style.cursor = 'pointer';
    img.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openImagePicker(img);
    });
  });

  function openImagePicker(img) {
    const path = img.dataset.contentImg;
    const altPath = img.dataset.contentAlt;
    const modal = createModal(`
      <h3>Substituir imagem</h3>
      <p style="font-size:12px;color:#5C5340;margin:0 0 6px;">A imagem será carregada para o servidor automaticamente.</p>
      <input type="file" id="__ie-file" accept="image/*" style="margin-top:8px;">
      ${altPath ? `<label>Texto alternativo (alt)</label><input type="text" id="__ie-alt" placeholder="Descrição da imagem para acessibilidade">` : ''}
      <label>Ou escolher de imagens já carregadas</label>
      <div class="__ie-image-library" id="__ie-lib"><div style="grid-column:1/-1;font-size:12px;color:#8B7B5D;">A carregar…</div></div>
      <div class="__ie-modal-actions">
        <button class="__ie-btn-ghost" id="__ie-cancel">Cancelar</button>
      </div>
    `);
    if (altPath) {
      const altInput = modal.querySelector('#__ie-alt');
      altInput.value = img.alt || '';
      altInput.addEventListener('input', () => {
        send({ type: 'content-change', path: altPath, value: altInput.value });
        img.alt = altInput.value;
        markDirty();
      });
    }
    modal.querySelector('#__ie-cancel').addEventListener('click', closeModal);
    modal.querySelector('#__ie-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const url = await uploadImage(file);
      if (url) {
        img.src = url;
        send({ type: 'content-change', path, value: url });
        markDirty();
        closeModal();
      }
    });
    loadImageLibrary(modal.querySelector('#__ie-lib'), (url) => {
      img.src = url;
      send({ type: 'content-change', path, value: url });
      markDirty();
      closeModal();
    });
  }

  async function uploadImage(file) {
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': file.type, 'X-Filename': file.name, 'X-Folder': 'content' },
        body: file,
      });
      if (!res.ok) throw new Error('upload falhou');
      const json = await res.json();
      return json.path || json.url;
    } catch (e) {
      alert('Erro ao carregar imagem: ' + e.message);
      return null;
    }
  }

  async function loadImageLibrary(container, onPick) {
    try {
      const SUPABASE_URL = 'https://tjvhnbukzfyxtpkrhpsw.supabase.co';
      const SUPABASE_ANON = 'sb_publishable_ke--Q7xNRNCxTjgxFCNFIQ_6zPD3zM3';
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
        body: JSON.stringify({ prefix: 'content', limit: 60, sortBy: { column: 'created_at', order: 'desc' } }),
      });
      if (!res.ok) throw new Error('list falhou');
      const items = await res.json();
      if (!items.length) {
        container.innerHTML = '<div style="grid-column:1/-1;font-size:12px;color:#8B7B5D;">Sem imagens carregadas ainda.</div>';
        return;
      }
      container.innerHTML = '';
      items.forEach((it) => {
        const url = `${SUPABASE_URL}/storage/v1/object/public/media/content/${it.name}`;
        const im = document.createElement('img');
        im.src = url;
        im.title = it.name;
        im.addEventListener('click', () => onPick(url));
        container.appendChild(im);
      });
    } catch (e) {
      container.innerHTML = `<div style="grid-column:1/-1;font-size:12px;color:#8B7B5D;">Não foi possível carregar a biblioteca: ${e.message}</div>`;
    }
  }

  // ────────────────────────────────────────────────────────────
  // LINKS (data-content-href)
  // ────────────────────────────────────────────────────────────
  document.querySelectorAll('[data-content-href]').forEach((el) => {
    if (el.hasAttribute('data-content') || el.hasAttribute('data-content-html')) return; // já edita texto
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openLinkPicker((url, target) => {
        el.href = url;
        if (target) { el.target = '_blank'; el.rel = 'noopener'; }
        send({ type: 'content-change', path: el.dataset.contentHref, value: url });
        markDirty();
      }, el.href);
    });
  });

  let _pages = null;
  function openLinkPicker(onSave, currentUrl = '') {
    const SOCIAL_PRESETS = [
      { label: 'Facebook',  url: 'https://www.facebook.com/' },
      { label: 'Instagram', url: 'https://www.instagram.com/' },
      { label: 'Twitter / X', url: 'https://x.com/' },
      { label: 'YouTube',   url: 'https://www.youtube.com/@' },
      { label: 'LinkedIn',  url: 'https://www.linkedin.com/in/' },
      { label: 'TikTok',    url: 'https://www.tiktok.com/@' },
      { label: 'WhatsApp',  url: 'https://wa.me/' },
      { label: 'Telegram',  url: 'https://t.me/' },
      { label: 'Email',     url: 'mailto:' },
      { label: 'Telefone',  url: 'tel:+351' },
    ];
    const modal = createModal(`
      <h3>Editar ligação</h3>
      <label>Página interna</label>
      <select id="__ie-page"><option value="">— escolher —</option></select>
      <label>Ou rede social / contacto</label>
      <select id="__ie-social"><option value="">— escolher —</option>${SOCIAL_PRESETS.map(s => `<option value="${s.url}">${s.label}</option>`).join('')}</select>
      <label>Ou URL externo</label>
      <input type="url" id="__ie-url" placeholder="https://..." value="${currentUrl || ''}">
      <label style="display:flex;align-items:center;gap:8px;text-transform:none;font-size:13px;font-weight:500;">
        <input type="checkbox" id="__ie-target" style="width:auto;"> Abrir em nova aba
      </label>
      <div class="__ie-modal-actions">
        <button class="__ie-btn-ghost" id="__ie-cancel">Cancelar</button>
        <button class="__ie-btn-primary" id="__ie-save">Aplicar</button>
      </div>
    `);
    const social = modal.querySelector('#__ie-social');
    social.addEventListener('change', () => { if (social.value) modal.querySelector('#__ie-url').value = social.value; });
    const sel = modal.querySelector('#__ie-page');
    const url = modal.querySelector('#__ie-url');
    const target = modal.querySelector('#__ie-target');
    const fillPages = (pages) => {
      pages.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.href; opt.textContent = p.label;
        sel.appendChild(opt);
      });
    };
    if (_pages) fillPages(_pages);
    else {
      // discover pages from current site (the inline editor knows the host)
      const defaultPages = [
        { label: 'Início', href: '/' },
        { label: 'Mapa', href: '/mapa.html' },
        { label: 'Rede de Praias', href: '/rede.html' },
        { label: 'Votar', href: '/votar.html' },
        { label: 'Passaporte', href: '/passaporte.html' },
        { label: 'Novidades', href: '/artigos.html' },
        { label: 'Loja', href: '/loja.html' },
        { label: 'Descontos', href: '/descontos.html' },
        { label: 'Onde Encontrar o Guia', href: '/onde-encontrar.html' },
        { label: 'Onde Carimbar', href: '/onde-carimbar-passaporte.html' },
        { label: 'Contactos', href: '/contactos.html' },
      ];
      _pages = defaultPages;
      fillPages(defaultPages);
    }
    sel.addEventListener('change', () => { if (sel.value) url.value = sel.value; });
    modal.querySelector('#__ie-cancel').addEventListener('click', closeModal);
    modal.querySelector('#__ie-save').addEventListener('click', () => {
      const v = url.value.trim();
      if (!v) return;
      onSave(v, target.checked);
      closeModal();
    });
  }
  // Expor para o layout-edit-mode poder reutilizar o picker.
  window.__ieOpenLinkPicker = openLinkPicker;

  // ────────────────────────────────────────────────────────────
  // MODAIS
  // ────────────────────────────────────────────────────────────
  let _modalEl = null;
  function createModal(innerHTML) {
    closeModal();
    const back = document.createElement('div');
    back.className = '__ie-modal-backdrop';
    back.innerHTML = `<div class="__ie-modal">${innerHTML}</div>`;
    back.addEventListener('click', (e) => { if (e.target === back) closeModal(); });
    document.body.appendChild(back);
    _modalEl = back;
    return back.querySelector('.__ie-modal');
  }
  function closeModal() {
    if (_modalEl) { _modalEl.remove(); _modalEl = null; }
  }

  // ────────────────────────────────────────────────────────────
  // LISTAS (data-content-list) — controles inline + DnD
  // ────────────────────────────────────────────────────────────
  document.querySelectorAll('[data-content-list]').forEach(setupList);

  function setupList(container) {
    const path = container.dataset.contentList;
    decorateAllItems(container, path);

    // Botão adicionar (apenas uma vez por container)
    if (!container.__ieAddBtn) {
      const addBtn = document.createElement('button');
      addBtn.className = '__ie-list-add';
      addBtn.textContent = '+ Adicionar item';
      addBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const arr = (getByPath(window._siteContent, path) || []).slice();
        const last = arr[arr.length - 1] || {};
        const blank = {};
        Object.keys(last).forEach((k) => {
          // valores por defeito sensatos
          if (k === 'id') blank[k] = 'item-' + Date.now();
          else if (k === 'label') blank[k] = 'Novo item';
          else if (k === 'href') blank[k] = '#';
          else blank[k] = '';
        });
        arr.push(blank);
        commitListChange(container, path, arr);
      });
      container.parentNode.insertBefore(addBtn, container.nextSibling);
      container.__ieAddBtn = addBtn;
    }
  }

  function decorateAllItems(container, path) {
    container.querySelectorAll('[data-content-item-index]').forEach((it) => {
      if (it.__ieDecorated) return;
      decorateListItem(container, it, path);
    });
  }

  function decorateListItem(container, item, path) {
    item.__ieDecorated = true;
    const ctrls = document.createElement('div');
    ctrls.className = '__ie-list-controls';
    ctrls.innerHTML = `
      <button type="button" data-act="up" title="Subir">↑</button>
      <button type="button" data-act="down" title="Descer">↓</button>
      <button type="button" data-act="dup" title="Duplicar">⎘</button>
      <button type="button" data-act="edit" title="Editar">✎</button>
      <button type="button" data-act="del" title="Eliminar">🗑</button>
    `;
    item.appendChild(ctrls);
    ctrls.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const idx = Number(item.dataset.contentItemIndex);
      const arr = (getByPath(window._siteContent, path) || []).slice();
      if (btn.dataset.act === 'up' && idx > 0) {
        [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      } else if (btn.dataset.act === 'down' && idx < arr.length - 1) {
        [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
      } else if (btn.dataset.act === 'dup') {
        arr.splice(idx + 1, 0, JSON.parse(JSON.stringify(arr[idx])));
      } else if (btn.dataset.act === 'del') {
        if (!confirm('Eliminar este item?')) return;
        arr.splice(idx, 1);
      } else if (btn.dataset.act === 'edit') {
        return openItemEditor(path, idx, arr[idx], (newItem) => {
          arr[idx] = newItem;
          commitListChange(container, path, arr);
        });
      } else return;
      commitListChange(container, path, arr);
    });
  }

  // Aplica a alteração: persiste no estado local, envia ao admin
  // E re-renderiza visualmente o container com o novo array.
  function commitListChange(container, path, value) {
    setByPath(window._siteContent, path, value);
    send({ type: 'content-list-change', path, value });
    markDirty();
    if (typeof window._cmsRebuild === 'function' && container.dataset.cmsRebuild) {
      window._cmsRebuild(container, value);
      // Re-decorar com novos handlers (os antigos foram removidos pelo innerHTML)
      decorateAllItems(container, path);
    } else {
      // Para data-content-list puros (sem cms-rebuild), recarregar é mais fiável
      // mas perderia trabalho — preferimos manter o utilizador no lugar e
      // mostrar um aviso de que precisa de gravar para ver a estrutura final.
      decorateAllItems(container, path);
    }
  }

  // Editor simples para um item de lista (label + href)
  function openItemEditor(path, idx, item, onSave) {
    const fields = Object.keys(item || {});
    const inputsHtml = fields.map(k => {
      if (k === 'id') return ''; // não editável
      const v = item[k] || '';
      return `<label>${k}</label><input type="text" data-k="${k}" value="${v.replace(/"/g,'&quot;')}">`;
    }).join('');
    const modal = createModal(`
      <h3>Editar item #${idx + 1}</h3>
      ${inputsHtml || '<p style="font-size:12px;color:#5C5340;">Sem campos editáveis.</p>'}
      <div class="__ie-modal-actions">
        <button class="__ie-btn-ghost" id="__ie-cancel">Cancelar</button>
        <button class="__ie-btn-primary" id="__ie-save">Guardar</button>
      </div>
    `);
    modal.querySelector('#__ie-cancel').addEventListener('click', closeModal);
    modal.querySelector('#__ie-save').addEventListener('click', () => {
      const out = { ...item };
      modal.querySelectorAll('input[data-k]').forEach(inp => { out[inp.dataset.k] = inp.value; });
      closeModal();
      onSave(out);
    });
  }

  // ────────────────────────────────────────────────────────────
  // SECÇÕES REORDENÁVEIS (data-section-id)
  // ────────────────────────────────────────────────────────────
  const sections = Array.from(document.querySelectorAll('[data-section-id]'));
  if (sections.length) {
    document.body.classList.add('__ie-show-handles');
    sections.forEach((s) => {
      const handle = document.createElement('div');
      handle.className = '__ie-section-handle';
      handle.draggable = true;
      handle.innerHTML = `⠿ ${s.dataset.sectionId}`;
      s.appendChild(handle);

      handle.addEventListener('dragstart', () => s.classList.add('__ie-dragging'));
      handle.addEventListener('dragend', () => {
        s.classList.remove('__ie-dragging');
        sections.forEach((x) => x.classList.remove('__ie-drop-target'));
        // Compor nova ordem
        const parent = sections[0].parentNode;
        const order = Array.from(parent.querySelectorAll('[data-section-id]')).map((el) => ({
          id: el.dataset.sectionId,
          visible: el.style.display !== 'none',
        }));
        send({ type: 'sections-order-change', value: order });
        markDirty();
      });
    });
    // Drop sobre secções
    sections.forEach((target) => {
      target.addEventListener('dragover', (e) => {
        const dragging = document.querySelector('[data-section-id].__ie-dragging');
        if (!dragging || dragging === target) return;
        e.preventDefault();
        target.classList.add('__ie-drop-target');
        const rect = target.getBoundingClientRect();
        const after = e.clientY > rect.top + rect.height / 2;
        target.parentNode.insertBefore(dragging, after ? target.nextSibling : target);
      });
      target.addEventListener('dragleave', () => target.classList.remove('__ie-drop-target'));
    });
  }

  // ────────────────────────────────────────────────────────────
  // EDITOR UNIVERSAL — torna TODOS os textos, imagens e links
  // editáveis, mesmo sem data-content*. As alterações vão como
  // "override-change" com um seletor CSS estável + página atual.
  // ────────────────────────────────────────────────────────────
  const PAGE_KEY = (location.pathname.split('/').pop() || 'index.html').replace('.html', '') || 'index';

  function genSelector(el) {
    if (!el || el === document.body) return 'body';
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.body) {
      let part = cur.tagName.toLowerCase();
      // Classes filtradas: ignorar utilities Tailwind voláteis e classes do editor
      const cls = (typeof cur.className === 'string' ? cur.className : '')
        .trim().split(/\s+/)
        .filter(c => c && !c.startsWith('__ie') && !c.includes(':') && !c.startsWith('hover') && c.length < 25)
        .slice(0, 2);
      if (cls.length) part += '.' + cls.map(c => CSS.escape(c)).join('.');
      const parent = cur.parentNode;
      if (parent && parent.children) {
        const sibs = Array.from(parent.children).filter(s => s.tagName === cur.tagName);
        if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(cur) + 1})`;
      }
      parts.unshift(part);
      cur = cur.parentNode;
      if (parts.length > 8) break;
    }
    return parts.join(' > ');
  }

  function sendOverride(el, payload) {
    const selector = genSelector(el);
    // Elementos dentro de header/nav/footer são partilhados entre todas as
    // páginas — gravar como overrides globais para que a edição se reflicta
    // automaticamente em todo o site.
    const inChrome = el && el.closest && el.closest('header, nav, footer');
    const page = inChrome ? '__global__' : PAGE_KEY;
    send({ type: 'override-change', page, selector, value: payload });
    markDirty();
  }

  // Critério: o elemento contém apenas texto + tags inline simples (sem outros editáveis dentro)
  const TEXT_TAGS = new Set(['H1','H2','H3','H4','H5','H6','P','SPAN','A','LI','BUTTON','STRONG','EM','SMALL','LABEL','TD','TH','BLOCKQUOTE','FIGCAPTION','SUMMARY','DT','DD','DIV','B','I','U','MARK','TIME','CITE','CODE','KBD','ABBR']);
  const SKIP_INSIDE = new Set(['SCRIPT','STYLE','SVG','IFRAME','NOSCRIPT','TEMPLATE','INPUT','TEXTAREA','SELECT','OPTION']);

  function isLeafTextElement(el) {
    if (!el || !TEXT_TAGS.has(el.tagName)) return false;
    if (!el.textContent || !el.textContent.trim()) return false;
    // Não pode ter descendentes que sejam outros TEXT_TAGS — só inline simples
    const childEls = el.querySelectorAll('*');
    for (const c of childEls) {
      if (TEXT_TAGS.has(c.tagName) && c !== el) {
        // exceções: span/strong/em/small dentro de h1/p são OK
        if (!['SPAN','STRONG','EM','SMALL','BR'].includes(c.tagName)) return false;
      }
    }
    return true;
  }

  function makeUniversallyEditable(root) {
    // Não marcar elementos como editáveis enquanto o modo Layout está activo —
    // nesse modo o utilizador apenas mexe em posição/tamanho.
    if (window.__layoutModeActive) return;
    // Texto: tornar editável qualquer leaf de texto que ainda não tenha data-content*
    root.querySelectorAll('*').forEach((el) => {
      if (SKIP_INSIDE.has(el.tagName)) return;
      if (el.closest('.__ie-toolbar, .__ie-modal')) return;
      if (el.hasAttribute('data-content') || el.hasAttribute('data-content-html')) return;
      if (!isLeafTextElement(el)) return;
      if (el.__ieUniversal) return;
      el.__ieUniversal = true;

      el.setAttribute('contenteditable', 'true');
      el.addEventListener('focus', () => {
        el.classList.add('__ie-editing');
        if (typeof el.__ieOriginalHtml === 'undefined') el.__ieOriginalHtml = el.innerHTML.trim();
      });
      el.addEventListener('blur', () => {
        el.classList.remove('__ie-editing');
        const newHtml = el.innerHTML.trim();
        if (newHtml === el.__ieOriginalHtml) { setElementDirty(el, false); return; }
        // Generic binding to any admin dataset (settings, beaches, articles,
        // descontos, produtos, locations…). Format:
        //   data-content-bind="<dataset>:<dot.path>"
        // e.g. data-content-bind="beaches:3.name" → state.data.beaches[3].name
        if (sendBindIfBound(el, newHtml)) { setElementDirty(el, false); return; }
        sendOverride(el, { html: newHtml, text: el.textContent.trim() });
      });
      el.addEventListener('input', () => {
        const isDiff = el.innerHTML.trim() !== el.__ieOriginalHtml;
        setElementDirty(el, isDiff);
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && el.tagName !== 'P' && el.tagName !== 'LI') {
          e.preventDefault(); el.blur();
        }
      });
    });

    // Imagens: tornar todas clicáveis (exceto header/footer logo já data-content-img)
    root.querySelectorAll('img').forEach((img) => {
      if (img.__ieUniversal) return;
      if (img.closest('.__ie-toolbar, .__ie-modal')) return;
      if (img.hasAttribute('data-content-img')) return;
      img.__ieUniversal = true;
      img.style.cursor = 'pointer';
      img.style.outline = '2px dashed transparent';
      img.style.outlineOffset = '3px';
      img.style.transition = 'outline-color .12s';
      img.addEventListener('mouseenter', () => img.style.outlineColor = '#0288D1');
      img.addEventListener('mouseleave', () => img.style.outlineColor = 'transparent');
      img.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        openUniversalImagePicker(img);
      });
    });

    // Ícones — clicar abre picker. Suporta:
    //  • [data-lucide] (Lucide cria SVG dentro)
    //  • <svg> standalone (qualquer SVG inline)
    //  • <i class="lucide-…">
    //  • Botões/links cujo único conteúdo visível é um SVG (ex: hambúrguer, carrinho)
    function findIconHosts() {
      const hosts = new Set();
      // 1) data-lucide
      root.querySelectorAll('[data-lucide]').forEach(el => hosts.add(el));
      // 2) SVG standalone — agarra o pai mais útil (button/a/span próximo)
      root.querySelectorAll('svg').forEach(svg => {
        if (svg.closest('.__ie-toolbar, .__ie-modal, .__ie-icon-host')) return;
        // Subir até botão/link/span pai com classes utilitárias
        const wrap = svg.closest('button, a, span, label, div');
        const host = wrap || svg;
        // Se o pai tem texto significativo, melhor marcar o próprio SVG
        const hasText = wrap && wrap.textContent && wrap.textContent.trim().length > 0;
        hosts.add(hasText ? svg : host);
      });
      return hosts;
    }
    // Marcar visualmente os hosts de ícone (estilo + classe). O click é
    // tratado por delegação única no body — assim qualquer host (mesmo
    // criado depois por lucide.createIcons após uma troca) responde a
    // novos cliques sem precisar de re-attach manual.
    findIconHosts().forEach((host) => {
      if (host.closest('.__ie-toolbar, .__ie-modal')) return;
      host.classList.add('__ie-icon-host');
      try {
        host.style.cursor = 'pointer';
        host.style.transition = 'outline-color .12s, background .12s';
        if (!host.style.outline) host.style.outline = '2px dashed transparent';
        host.style.outlineOffset = '3px';
      } catch {}
      if (host.__ieIconHover) return;
      host.__ieIconHover = true;
      host.addEventListener('mouseenter', () => { try { host.style.outlineColor = '#FFEB3B'; } catch {} });
      host.addEventListener('mouseleave', () => { try { host.style.outlineColor = 'transparent'; } catch {} });
    });

    // Links sem texto editável (ex: ícones sociais, botões com ícone) — ainda assim editar href
    root.querySelectorAll('a').forEach((a) => {
      if (a.__ieUniversal) return;
      if (a.closest('.__ie-toolbar, .__ie-modal')) return;
      if (a.hasAttribute('data-content-href')) return;
      // Se já é editável como texto, deixar a edição de texto + Alt+click muda href
      a.__ieUniversal = true;
      a.addEventListener('click', (e) => {
        if (e.altKey) {
          e.preventDefault(); e.stopPropagation();
          openLinkPicker((url, target) => {
            a.href = url;
            if (target) { a.target = '_blank'; a.rel = 'noopener'; }
            sendOverride(a, { href: url });
          }, a.href);
        }
      }, true);
    });
  }

  // BRAND ICONS — definidos em content-loader.js (window.__BRAND_ICONS) para
  // estarem disponíveis em todas as páginas.
  const BRAND_ICONS = window.__BRAND_ICONS || {};
  // Devolve um <svg> standalone para um brand name (string).
  function makeBrandSvg(brand) {
    const tpl = BRAND_ICONS[brand];
    if (!tpl) return null;
    const div = document.createElement('div');
    div.innerHTML = tpl;
    const svg = div.firstElementChild;
    if (svg) {
      svg.setAttribute('data-brand-icon', brand);
      svg.style.width = svg.style.width || '24px';
      svg.style.height = svg.style.height || '24px';
    }
    return svg;
  }

  function openIconPicker(host) {
    // Lista de ícones Lucide a partir do global `lucide.icons` (carregado por lucide.min.js)
    let names = [];
    try {
      if (window.lucide && window.lucide.icons) {
        names = Object.keys(window.lucide.icons);
      }
    } catch {}
    // Acrescentar marcas (redes sociais) — prefixadas com "brand:"
    const brandNames = Object.keys(BRAND_ICONS).map(b => 'brand:' + b);
    names = [...brandNames, ...names];
    if (!names.length) {
      // Fallback: lista mínima de ícones comuns
      names = ['map','navigation','tent','tree-pine','waves','sun','umbrella','car','utensils','home','heart','star','search','user','phone','mail','globe','camera','image','calendar','clock','info','check','x','arrow-right','arrow-left','arrow-up','arrow-down','menu','settings','shopping-cart','tag','gift','book','book-open','award','flag','compass','thermometer','droplets','wind','cloud','snowflake','flame','leaf','flower','fish'];
    }
    // Se o host é um SVG sem data-lucide, encontrar o ícone "actual" via class lucide-X
    let current = host.getAttribute && host.getAttribute('data-lucide');
    if (!current && host.tagName) {
      // <svg class="lucide lucide-menu …">
      const cls = host.className && (host.className.baseVal || host.className);
      if (typeof cls === 'string') {
        const m = cls.match(/lucide-([a-z0-9-]+)/);
        if (m) current = m[1];
      }
      // Procurar dentro do host
      if (!current) {
        const inner = host.querySelector && host.querySelector('[data-lucide]');
        if (inner) current = inner.getAttribute('data-lucide');
      }
    }
    current = current || '';

    const modal = createModal(`
      <h3>Escolher ícone</h3>
      <p style="font-size:12px;color:#5C5340;margin:0 0 6px;">Ícone actual: <strong>${current || '—'}</strong> · Seleccionado: <strong id="__ie-icon-sel">—</strong></p>
      <input type="text" id="__ie-icon-q" placeholder="Procurar ícone (ex: map, sun, leaf)…" style="width:100%;padding:8px 12px;border:1px solid #E2D9C6;border-radius:8px;font-size:13px;">
      <div id="__ie-icon-count" style="font-size:11px;color:#8A7D60;margin-top:6px;"></div>
      <div id="__ie-icon-grid" style="margin-top:10px;max-height:380px;overflow-y:auto;display:grid;grid-template-columns:repeat(8,1fr);gap:6px;background:#FAF8F5;padding:10px;border-radius:10px;border:1px solid #E2D9C6;"></div>
      <div class="__ie-modal-actions">
        <button class="__ie-btn-ghost" id="__ie-cancel">Cancelar</button>
        <button class="__ie-btn-primary" id="__ie-apply" disabled style="opacity:.5;cursor:not-allowed;">Aplicar</button>
      </div>
    `);
    const grid = modal.querySelector('#__ie-icon-grid');
    const input = modal.querySelector('#__ie-icon-q');
    const selLabel = modal.querySelector('#__ie-icon-sel');
    const applyBtn = modal.querySelector('#__ie-apply');
    const countLabel = modal.querySelector('#__ie-icon-count');
    let selected = '';
    modal.querySelector('#__ie-cancel').addEventListener('click', closeModal);
    applyBtn.addEventListener('click', () => {
      if (!selected) return;
      try { pickIcon(selected); }
      catch (err) { console.error('[icon-picker]', err); closeModal(); }
    });

    function pickIcon(name) {
          let target = host;
          // Caso brand: substituímos sempre o host por um <svg> inline.
          if (name && name.startsWith('brand:')) {
            const brand = name.slice(6);
            const newSvg = makeBrandSvg(brand);
            if (!newSvg) return;
            try {
              const r = host.getBoundingClientRect();
              if (r.width)  newSvg.style.width  = r.width + 'px';
              if (r.height) newSvg.style.height = r.height + 'px';
              newSvg.style.color = getComputedStyle(host).color || 'currentColor';
            } catch {}
            host.parentNode.replaceChild(newSvg, host);
            target = newSvg;
          } else if (host.tagName === 'svg' || host.tagName === 'SVG') {
            const i = document.createElement('i');
            i.setAttribute('data-lucide', name);
            try {
              const r = host.getBoundingClientRect();
              if (r.width)  i.style.width  = r.width + 'px';
              if (r.height) i.style.height = r.height + 'px';
              i.style.display = 'inline-block';
              i.style.color = getComputedStyle(host).color || '#003A40';
            } catch {}
            host.replaceWith(i);
            target = i;
          } else {
            host.setAttribute('data-lucide', name);
            host.innerHTML = '';
          }
          try {
            window.lucide && window.lucide.createIcons && window.lucide.createIcons({ nameAttr: 'data-lucide' });
          } catch {}
          sendOverride(target, { icon: name });
          closeModal();
          // Limpar marcações antigas dentro da área alterada para que a
          // re-aplicação volte a decorar o ícone novo (permite trocá-lo
          // múltiplas vezes seguidas).
          try {
            const scope = (target && target.parentElement) || document.body;
            scope.querySelectorAll('.__ie-icon-host').forEach(n => {
              n.classList.remove('__ie-icon-host');
              n.__ieIconReady = false;
            });
            if (target && target.classList) {
              target.classList.remove('__ie-icon-host');
              target.__ieIconReady = false;
            }
          } catch {}
          setTimeout(() => { try { window.__ieReinit && window.__ieReinit(); } catch {} }, 30);
          setTimeout(() => { try { window.__ieReinit && window.__ieReinit(); } catch {} }, 200);
    }

    function render(filter) {
      const f = (filter || '').toLowerCase().trim();
      // Sem limite — mostrar todos os ícones disponíveis (>1000 no Lucide).
      // Quando não há filtro mostramos os primeiros 600 e indicamos para
      // pesquisar para ver os restantes.
      const all = f ? names.filter(n => n.toLowerCase().includes(f)) : names;
      const matched = f ? all : all.slice(0, 600);
      countLabel.textContent = f
        ? `${all.length} ${all.length === 1 ? 'resultado' : 'resultados'}`
        : `A mostrar ${matched.length} de ${all.length} — pesquise para filtrar`;
      grid.innerHTML = matched.map(n => {
        const isBrand = n.startsWith('brand:');
        const label = isBrand ? n.slice(6) : n;
        const inner = isBrand
          ? `<span style="display:inline-block;width:20px;height:20px;color:#003A40;pointer-events:none;">${BRAND_ICONS[label] || ''}</span>`
          : `<i data-lucide="${n}" style="width:20px;height:20px;color:#003A40;pointer-events:none;"></i>`;
        return `<button type="button" data-icon="${n}" title="${label}" style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;background:white;border:1px solid #E2D9C6;border-radius:8px;cursor:pointer;padding:8px;${n===selected?'outline:2px solid #003A40;background:#FFF8C5;':(n===current?'outline:2px solid #003A40;':'')}">${inner}</button>`;
      }).join('');
      try { window.lucide && window.lucide.createIcons && window.lucide.createIcons({ attrs: {} }); } catch {}
      grid.querySelectorAll('svg').forEach(s => {
        s.style.pointerEvents = 'none';
        if (!s.getAttribute('width'))  s.setAttribute('width', '20');
        if (!s.getAttribute('height')) s.setAttribute('height', '20');
      });
    }
    function setSelected(name) {
      selected = name;
      selLabel.textContent = name || '—';
      applyBtn.disabled = !name;
      applyBtn.style.opacity = name ? '1' : '.5';
      applyBtn.style.cursor = name ? 'pointer' : 'not-allowed';
      // Re-render para destacar
      render(input.value);
    }
    // Click na grelha apenas SELECIONA (não aplica). Aplicar requer botão.
    grid.addEventListener('click', (ev) => {
      const btn = ev.target.closest && ev.target.closest('button[data-icon]');
      if (!btn) return;
      ev.preventDefault();
      ev.stopPropagation();
      setSelected(btn.getAttribute('data-icon'));
    });
    // Duplo-clique = seleccionar + aplicar (atalho)
    grid.addEventListener('dblclick', (ev) => {
      const btn = ev.target.closest && ev.target.closest('button[data-icon]');
      if (!btn) return;
      ev.preventDefault();
      ev.stopPropagation();
      try { pickIcon(btn.getAttribute('data-icon')); } catch {}
    });
    render('');
    input.addEventListener('input', () => render(input.value));
    setTimeout(() => input.focus(), 30);
  }

  function openUniversalImagePicker(img) {
    const modal = createModal(`
      <h3>Substituir imagem</h3>
      <p style="font-size:12px;color:#5C5340;margin:0 0 6px;">A imagem será carregada para o servidor automaticamente.</p>
      <input type="file" id="__ie-file" accept="image/*" style="margin-top:8px;">
      <label>Texto alternativo (alt)</label>
      <input type="text" id="__ie-alt" placeholder="Descrição da imagem">
      <label>Ou escolher de imagens já carregadas</label>
      <div class="__ie-image-library" id="__ie-lib"><div style="grid-column:1/-1;font-size:12px;color:#8B7B5D;">A carregar…</div></div>
      <div class="__ie-modal-actions">
        <button class="__ie-btn-ghost" id="__ie-cancel">Cancelar</button>
      </div>
    `);
    const altInput = modal.querySelector('#__ie-alt');
    altInput.value = img.alt || '';
    altInput.addEventListener('input', () => {
      img.alt = altInput.value;
      sendOverride(img, { alt: altInput.value });
    });
    modal.querySelector('#__ie-cancel').addEventListener('click', closeModal);
    modal.querySelector('#__ie-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const url = await uploadImage(file);
      if (url) {
        img.src = url;
        sendOverride(img, { src: url });
        closeModal();
      }
    });
    loadImageLibrary(modal.querySelector('#__ie-lib'), (url) => {
      img.src = url;
      sendOverride(img, { src: url });
      closeModal();
    });
  }

  // Aplicar agora e re-aplicar quando o DOM mudar (e.g., após cms-rebuild)
  function reapply() {
    try { makeUniversallyEditable(document.body); } catch {}
  }
  window.__ieReinit = reapply;
  reapply();
  // Garantia: re-aplicar depois do content-loader terminar
  document.addEventListener('contentLoaded', () => { setTimeout(reapply, 30); });
  // Garantia: re-aplicar quando o admin pede explicitamente
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 're-init-editor') reapply();
  });
  // Re-aplicar a cada 1s durante os primeiros 5s (defesa em profundidade contra
  // GSAP/scripts que rerenderizam DOM tarde)
  let _ri = 0;
  const _riT = setInterval(() => { reapply(); if (++_ri >= 5) clearInterval(_riT); }, 1000);
  const _mo = new MutationObserver(() => {
    clearTimeout(_mo._t);
    _mo._t = setTimeout(reapply, 80);
  });
  _mo.observe(document.body, { childList: true, subtree: true });

  // ────────────────────────────────────────────────────────────
  // BRIDGE
  // ────────────────────────────────────────────────────────────
  window.addEventListener('message', (e) => {
    const data = e.data || {};
    if (data.type === 'apply-content') {
      location.reload();
    }
    if (data.type === 'apply-state' && data.content) {
      // Aplicar snapshot SEM recarregar a página.
      try { localStorage.setItem('_contentDraft', JSON.stringify(data.content)); } catch {}
      try { sessionStorage.setItem('_contentDraft', JSON.stringify(data.content)); } catch {}
      // 1) Re-correr content-loader para texto/listas/overrides/sectionsOrder
      try { if (typeof window._applyContent === 'function') window._applyContent(data.content); } catch {}
      // 2) Aplicar datasets ligados via [data-content-bind="ds:path"]
      if (data.datasets) {
        try {
          const get = (obj, path) => path.split('.').reduce((o, k) => {
            if (o == null) return undefined;
            if (Array.isArray(o) && /^\d+$/.test(k)) return o[Number(k)];
            return o[k];
          }, obj);
          document.querySelectorAll('[data-content-bind]').forEach(el => {
            const spec = el.getAttribute('data-content-bind') || '';
            const i = spec.indexOf(':');
            if (i <= 0) return;
            const ds = spec.slice(0, i);
            const path = spec.slice(i + 1);
            const ds_data = data.datasets[ds];
            if (ds_data == null) return;
            const v = get(ds_data, path);
            if (v == null) return;
            // Heurística: se o elemento parece HTML (article-content) usar innerHTML
            if (el.matches('[data-content-html], .article-content')) {
              el.innerHTML = String(v);
            } else {
              el.textContent = String(v);
            }
          });
        } catch (err) { console.warn('[apply-state datasets]', err); }
      }
      // 3) Re-decorar
      setTimeout(() => { try { window.__ieReinit && window.__ieReinit(); } catch {} }, 50);
      return;
    }
    if (data.type === 'apply-snapshot' && data.content) {
      // Aplicar overrides de conteúdo (texto/html/img/icon) sem recarregar.
      try {
        const ov = data.content.overrides || {};
        const groups = [ov.__global__, ov[(location.pathname.split('/').pop()||'index.html').replace(/\.html?$/,'')||'index']];
        for (const g of groups) {
          if (!g) continue;
          for (const [sel, val] of Object.entries(g)) {
            if (!val) continue;
            let el = null;
            try { el = document.querySelector(sel); } catch {}
            if (!el) continue;
            if (val.text != null) el.textContent = val.text;
            if (val.html != null) el.innerHTML = val.html;
            if (val.src != null && 'src' in el) el.src = val.src;
            if (val.alt != null && 'alt' in el) el.alt = val.alt;
            if (val.href != null && 'href' in el) el.href = val.href;
          }
        }
      } catch {}
    }
  });

  send({ type: 'inline-editor-ready' });
})();
