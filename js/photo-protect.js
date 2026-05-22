// ─── Photo Protection Layer ────────────────────────────────────────────────
// Defesa em profundidade contra cópia/transferência das fotos das praias.
// (As próprias imagens já têm marca de água permanente — esta camada
// adiciona atrito contra o roubo casual e dissuasores adicionais.)
(function () {
  'use strict';

  const SHIELD_SELECTOR = '.photo-protected, .photo-protected *';

  // 1. Right-click bloqueado em qualquer foto protegida
  document.addEventListener('contextmenu', function (e) {
    if (e.target.closest && e.target.closest('.photo-protected')) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, { capture: true });

  // 2. Drag-and-drop bloqueado em todo o documento (afeta <img> e divs com bg)
  document.addEventListener('dragstart', function (e) {
    if (e.target.closest && e.target.closest('.photo-protected, img')) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, { capture: true });

  document.addEventListener('drop', function (e) {
    e.preventDefault();
    return false;
  }, { capture: true });

  // 3. Bloquear seleção sobre fotos
  document.addEventListener('selectstart', function (e) {
    if (e.target.closest && e.target.closest('.photo-protected')) {
      e.preventDefault();
      return false;
    }
  }, { capture: true });

  // 4. Bloquear copy quando o foco está numa foto
  document.addEventListener('copy', function (e) {
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.photo-protected')) {
      e.preventDefault();
    }
  });

  // 5. Bloquear atalhos de teclado conhecidos
  //    Cmd+S / Ctrl+S  · Guardar página
  //    Cmd+P / Ctrl+P  · Imprimir
  //    Cmd+U / Ctrl+U  · Ver source
  //    F12             · DevTools
  //    Cmd+Opt+I / Ctrl+Shift+I  · Inspecionar
  //    Cmd+Opt+J / Ctrl+Shift+J  · Console
  //    Cmd+Opt+C / Ctrl+Shift+C  · Inspector
  //    Cmd+Opt+U / Ctrl+Shift+U  · View source (Firefox)
  //    PrintScreen      · Screenshot (limitado, browser-dependent)
  document.addEventListener('keydown', function (e) {
    const k = (e.key || '').toLowerCase();
    const meta = e.metaKey || e.ctrlKey;
    const shift = e.shiftKey;
    const alt = e.altKey;

    if (
      (meta && !shift && !alt && (k === 's' || k === 'p' || k === 'u')) ||
      (k === 'f12') ||
      (meta && shift && (k === 'i' || k === 'j' || k === 'c')) ||
      (meta && alt && (k === 'i' || k === 'j' || k === 'c' || k === 'u')) ||
      (k === 'printscreen')
    ) {
      e.preventDefault();
      return false;
    }
  }, { capture: true });

  // 6. Detetor de devtools — quando aberto, ocultar todas as fotos protegidas
  let _devtoolsOpen = false;
  function checkDevtools() {
    const widthDiff = window.outerWidth - window.innerWidth;
    const heightDiff = window.outerHeight - window.innerHeight;
    const threshold = 165;
    const wasOpen = _devtoolsOpen;
    _devtoolsOpen =
      (widthDiff > threshold && widthDiff < window.outerWidth) ||
      (heightDiff > threshold && heightDiff < window.outerHeight);
    if (_devtoolsOpen !== wasOpen) {
      document.documentElement.classList.toggle('devtools-open', _devtoolsOpen);
    }
  }
  setInterval(checkDevtools, 700);
  checkDevtools();

  // 8. Bloquear save-as via long-press em touch (iOS Safari)
  document.addEventListener('touchstart', function (e) {
    if (e.target.closest && e.target.closest('.photo-protected')) {
      // -webkit-touch-callout: none já trata disto em CSS,
      // mas reforçamos prevenindo gestos que disparem o menu de imagem.
      if (e.touches && e.touches.length === 1) {
        // permitimos toques normais (para carrossel), mas marcamos para impedir long-press
        e.target.setAttribute('data-touch-start', Date.now().toString());
      }
    }
  }, { passive: true });

  // 9. CSP via meta — também aplicado no HTML para reforço (defense in depth)
})();
