// app-context.js — Helper universal para distinguir contexto web vs app.
// Carregado no topo de cada página (injetado pelo scripts/build-app.mjs apenas
// no bundle da app; no site web este ficheiro existe mas é inofensivo).
//
// API exposta:
//   window.isApp()          -> bool: true se estiver dentro do Capacitor nativo
//   window.APP_BASE_URL     -> 'https://praiasfluviais.pt' (origem das imagens
//                              quando estamos a correr na app)
//   window.applyAppContext() -> aplica CSS overrides app-only ao DOM
//                              (esconder footer, esconder admin, etc.)
//
// Em web: window.isApp() === false, applyAppContext() é noop.

(function () {
  'use strict';

  // Capacitor injeta window.Capacitor quando a app nativa está em execução.
  // Fallback defensivo: também aceita a hint ?gpf_app=1 (útil para debug local).
  function detectApp() {
    if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function') {
      return window.Capacitor.isNativePlatform();
    }
    return new URLSearchParams(window.location.search).get('gpf_app') === '1';
  }

  window.isApp = detectApp;
  // CDN remoto que serve /img/, /brand_assets/, /data/* à app.
  // Hoje aponta para o deploy Vercel (site novo). Quando o cutover de DNS
  // mudar praiasfluviais.pt para o site novo (e sair do WordPress), basta
  // trocar aqui e fazer rebuild. Também tem de ser atualizado em
  // scripts/build-app.mjs (REMOTE_BASE) e capacitor.config.json (allowNavigation).
  window.APP_BASE_URL = 'https://praias-fluviais.vercel.app';

  // Helper para prepender APP_BASE_URL a paths de imagem usados em JS dinâmico
  // (innerHTML, template literals). Idempotente: ignora URLs já absolutas.
  window.gpfImgSrc = function (path) {
    if (!path) return path;
    if (/^(https?:|data:|capacitor:)/i.test(path)) return path;
    if (!/^\/?(img|brand_assets)\//i.test(path)) return path;
    if (!detectApp()) return path;
    return window.APP_BASE_URL + '/' + path.replace(/^\//, '');
  };

  // Esconde elementos web-only (footer, links para admin/index) e bloqueia
  // navegação para páginas que não fazem sentido em app.
  window.applyAppContext = function applyAppContext() {
    if (!detectApp()) return;

    document.documentElement.classList.add('is-app');

    // Bloqueia tentativa de navegar para admin (defesa em profundidade — o
    // bundle da app já não inclui admin.html, mas previne acesso via URL).
    var path = window.location.pathname.toLowerCase();
    if (path.indexOf('/admin') === 0 || path === '/admin.html') {
      window.location.replace('/rede.html');
      return;
    }

    // Index.html é a homepage de marketing — substituída pela Rede na app.
    if (path === '/' || path === '/index.html') {
      window.location.replace('/rede.html');
      return;
    }

    // CSS overrides aplicados quando is-app está presente.
    // (Footer e links para index/admin escondidos via shared.css com :where(.is-app …))

    // Haptic feedback nos toques do bottom nav — sensação nativa.
    setupHapticFeedback();

    // Page transitions slide entre páginas internas.
    setupPageTransitions();
  };

  function setupHapticFeedback() {
    if (!window.Capacitor?.Plugins?.Haptics) return;
    var Haptics = window.Capacitor.Plugins.Haptics;
    document.addEventListener('click', function (ev) {
      var target = ev.target;
      if (!target || !target.closest) return;
      var navLink = target.closest('.bottom-nav a, .bottom-nav button');
      if (!navLink) return;
      try { Haptics.impact({ style: 'LIGHT' }); } catch (e) { /* silently ignore */ }
    }, { passive: true, capture: true });
  }

  function setupPageTransitions() {
    // Intercepta cliques em links internos para fazer slide-out antes de navegar.
    document.addEventListener('click', function (ev) {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      if (ev.defaultPrevented) return;

      var target = ev.target;
      if (!target || !target.closest) return;
      var a = target.closest('a[href]');
      if (!a) return;

      var href = a.getAttribute('href');
      if (!href) return;

      if (a.target === '_blank') return;
      if (a.hasAttribute('download')) return;
      if (href.startsWith('http://') || href.startsWith('https://')) return;
      if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('sms:')) return;
      if (href === '#' || href.startsWith('#')) return;
      if (href.startsWith('javascript:')) return;

      // Link interno — animar saída antes de navegar
      ev.preventDefault();
      document.body.classList.add('gpf-app-navigating');
      setTimeout(function () { window.location.href = href; }, 170);
    }, { capture: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.applyAppContext);
  } else {
    window.applyAppContext();
  }
})();
