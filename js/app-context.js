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

    // Contactos é web-only — não existe no bundle da app. Defesa em
    // profundidade contra deep-link.
    if (path === '/contactos.html') {
      window.location.replace('/rede.html');
      return;
    }

    // CSS overrides aplicados quando is-app está presente.
    // (Footer e links para index/admin escondidos via shared.css com :where(.is-app …))

    // Haptic feedback nos toques do bottom nav — sensação nativa.
    setupHapticFeedback();
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

  // ─── Loader overlay com slide ───
  // O HTML do loader já está no <body> (injectado pelo build-app.mjs) com
  // inline <style> que o torna visível imediatamente (covering everything em
  // teal sólido com spinner amarelo no centro).
  //
  // Fluxo de slide entre páginas (MPA Capacitor):
  //   1. Click num link interno → adiciona class .gpf-app-loader-incoming
  //      (transform: translateX(100%) sem transição) e logo a seguir remove
  //      essa class para que o transform anime de translateX(100%) para
  //      translateX(0%) — entra pela direita.
  //   2. Navega para a nova página.
  //   3. Nova página carrega → loader está visível por defeito (HTML inline).
  //   4. Quando window.load + fetches a zero + min 400ms passam, adiciona
  //      class .gpf-app-loader-leaving → transform de translateX(0%) para
  //      translateX(-100%) — sai pela esquerda. Resultado: sensação de
  //      slide contínuo da direita para a esquerda.
  var LOADER_MIN_MS = 850;
  var loaderShownAt = Date.now();
  var navInProgress = false;
  // Duração da animação de slide-out. Mais lenta = mais fluida e percebida
  // como uma única transição contínua (em vez de flash + reaparecer).
  var SLIDE_OUT_MS = 550;
  var SLIDE_EASE = 'cubic-bezier(.4,.0,.2,1)'; // Material standard, suave

  function hideAppLoader() {
    if (navInProgress) return; // está a meio de uma navegação, não esconder
    var el = document.getElementById('gpf-app-loader');
    if (!el) return;
    var elapsed = Date.now() - loaderShownAt;
    var wait = Math.max(0, LOADER_MIN_MS - elapsed);
    setTimeout(function () {
      // Slide-out + fade simultâneos para que o loader saia suavemente sem
      // dar a sensação de "desaparecer e reaparecer". Inline tem precedência
      // sobre classes — garante que aplica em todos os WebViews.
      el.style.transition = 'transform ' + SLIDE_OUT_MS + 'ms ' + SLIDE_EASE + ', opacity ' + SLIDE_OUT_MS + 'ms ' + SLIDE_EASE;
      el.style.transform = 'translateX(-100%)';
      el.style.opacity = '0';
      el.classList.add('gpf-app-loader-leaving');
    }, wait);
  }
  function showAppLoader() {
    var el = document.getElementById('gpf-app-loader');
    if (!el) return;
    el.classList.remove('gpf-app-loader-leaving');
    loaderShownAt = Date.now();
  }

  // Lista de páginas já visitadas nesta sessão. Se o destino já está cá,
  // saltamos o loader — a página é instantânea (já em cache do WebView local).
  function getVisitedPages() {
    try { return JSON.parse(sessionStorage.getItem('gpf-visited-pages') || '[]'); }
    catch (e) { return []; }
  }
  function markPageVisited(path) {
    try {
      var v = getVisitedPages();
      if (v.indexOf(path) === -1) {
        v.push(path);
        sessionStorage.setItem('gpf-visited-pages', JSON.stringify(v));
      }
    } catch (e) {}
  }
  // Helper: cache key inclui pathname + search. praia.html?id=A e praia.html?id=B
  // são páginas DIFERENTES (mesma URL base, conteúdos distintos) e têm de ter
  // entradas separadas em cache. Sem isto, a 2ª praia mostra o DOM da 1ª.
  function pageKey(pathname, search) {
    return pathname + (search || '');
  }

  // Marcar a página actual IMEDIATAMENTE — não esperar por window.load porque
  // em páginas com mapa Leaflet o `load` pode demorar muito ou nunca disparar
  // (tiles a carregar indefinidamente), e queremos que a próxima visita salte
  // o loader mesmo que o utilizador navegue rapidamente.
  markPageVisited(pageKey(window.location.pathname, window.location.search));

  // ═══════════════════════════════════════════════════════════════════════
  // SPA com DOM KEEP-ALIVE
  // ═══════════════════════════════════════════════════════════════════════
  // Cada página visitada fica em memória como um <div class="gpf-page"> no
  // body. Quando se volta a essa página, restauramos a referência (toggle
  // display:none/block) — SEM fetch, SEM re-render, SEM scripts a correr de
  // novo, SEM re-fetch de dados Supabase. A página aparece EXACTAMENTE como
  // ficou quando saímos dela. Zero loading visível.
  //
  // Elementos partilhados (#gpf-app-loader, nav.bottom-nav, .more-sheet*)
  // vivem fora dos wrappers e são compartilhados entre páginas.
  // ═══════════════════════════════════════════════════════════════════════

  var pageCache = {};  // { '/path': { wrapper, scrollY, title, bodyClass } }
  var currentPagePath = null;

  function isSharedBodyChild(el) {
    if (!el || !el.matches) return false;
    return el.matches('#gpf-app-loader, nav.bottom-nav, .more-sheet, .more-sheet-backdrop, .gpf-page');
  }

  function ensureInitialPageWrapped() {
    // Já inicializado? (currentPagePath é set ao primeiro wrap)
    if (currentPagePath) return;
    currentPagePath = pageKey(window.location.pathname, window.location.search);

    var wrapper = document.createElement('div');
    wrapper.className = 'gpf-page gpf-page-active';
    wrapper.setAttribute('data-path', currentPagePath);

    // Mover todos os children do body para o wrapper, EXCEPTO shared
    var toMove = [];
    for (var i = 0; i < document.body.children.length; i++) {
      var c = document.body.children[i];
      if (!isSharedBodyChild(c)) toMove.push(c);
    }
    toMove.forEach(function (c) { wrapper.appendChild(c); });

    // Inserir wrapper no body (primeiro, antes de shared elements como nav)
    document.body.insertBefore(wrapper, document.body.firstChild);

    pageCache[currentPagePath] = {
      wrapper: wrapper,
      scrollY: 0,
      title: document.title,
      bodyClass: document.body.className,
    };
  }

  function saveCurrentPageState() {
    if (!currentPagePath) return;
    var entry = pageCache[currentPagePath];
    if (entry) {
      entry.scrollY = window.scrollY || window.pageYOffset || 0;
      entry.bodyClass = document.body.className;
    }
  }

  function hideCurrentPage() {
    if (!currentPagePath) return;
    var entry = pageCache[currentPagePath];
    if (entry && entry.wrapper && entry.wrapper.parentNode) {
      // DESANEXAR (não display:none) — mantemos a referência em entry.wrapper
      // mas tiramos o wrapper do DOM. Isto é CRÍTICO porque, com múltiplos
      // wrappers em DOM, há colisão de IDs: scripts de uma página actualizam
      // elementos da página antiga (ex.: 2 praias com #beach-name → script
      // de praia-B atualizava o #beach-name de praia-A, ficando praia-B vazia).
      entry.wrapper.parentNode.removeChild(entry.wrapper);
    }
  }

  function _insertWrapper(wrapper) {
    var loader = document.getElementById('gpf-app-loader');
    var bottomNav = document.querySelector('nav.bottom-nav');
    var anchor = bottomNav || loader || null;
    if (anchor && anchor.parentNode === document.body) {
      document.body.insertBefore(wrapper, anchor);
    } else {
      document.body.appendChild(wrapper);
    }
  }

  function showCachedPage(destPath, href) {
    var entry = pageCache[destPath];
    if (!entry || !entry.wrapper) return false;

    ensureInitialPageWrapped();
    saveCurrentPageState();
    hideCurrentPage();

    // Re-anexar o wrapper cached (que está desanexado) ao body
    _insertWrapper(entry.wrapper);
    entry.wrapper.style.display = '';
    entry.wrapper.classList.add('gpf-page-active');
    document.title = entry.title;
    document.body.className = entry.bodyClass;

    currentPagePath = destPath;
    try { history.pushState({ spa: true, path: destPath }, '', href); } catch (e) {}

    // Restaurar scroll
    window.scrollTo(0, entry.scrollY);

    // Atualizar estado activo do bottom-nav
    updateBottomNavActive(destPath);

    // NÃO disparar resize event nem invalidateSize:
    //   - O container do mapa NÃO mudou de dimensões (detach/reattach preserva
    //     o size). Forçar invalidateSize causaria re-render progressivo dos
    //     markers (visual lag de 200-500ms).
    //   - Os markers já estão DOM-rendered desde a 1ª visita; só queremos
    //     mostrá-los outra vez instantaneamente.

    return true;
  }

  function updateBottomNavActive(path) {
    var page = (path.split('/').pop() || '').replace(/\.html$/, '');
    var ACTIVE_MAP = {
      'rede': 'rede', 'passaporte': 'passaporte', 'loja': 'loja',
      'auth': 'auth', 'perfil': 'auth',
    };
    var activeKey = ACTIVE_MAP[page] || '';
    document.querySelectorAll('.bottom-nav a[data-page], .bottom-nav button[data-page]').forEach(function (el) {
      var key = el.getAttribute('data-page');
      if (key === activeKey) {
        el.classList.add('text-praia-yellow-400', 'active');
        el.classList.remove('text-white/60');
      } else {
        el.classList.remove('text-praia-yellow-400', 'active');
        if (!el.classList.contains('text-white/60')) el.classList.add('text-white/60');
      }
    });
  }

  function loadNewPage(href, destPath) {
    ensureInitialPageWrapped();
    // Mostrar loader instantâneo enquanto o body é construído e os scripts
    // correm — evita o utilizador ver a renderização progressiva dos markers
    // (ex.: na Rede, addLayers do cluster pinta 200 markers em ~200-500ms).
    var _loader = document.getElementById('gpf-app-loader');
    if (_loader) {
      _loader.classList.remove('gpf-app-loader-leaving');
      _loader.style.transition = 'none';
      _loader.style.transform = 'translateX(0)';
      _loader.style.opacity = '1';
      _loader.style.pointerEvents = 'auto';
      _loader.style.display = '';
      void _loader.offsetHeight; // force reflow
    }
    return fetch(href).then(function (res) {
      if (!res.ok) throw new Error('http ' + res.status);
      return res.text();
    }).then(function (html) {
      var parser = new DOMParser();
      var doc = parser.parseFromString(html, 'text/html');

      // 1. Acrescentar ao <head> scripts/CSS novos que esta página precise
      //    (ex.: html5-qrcode em passaporte, Leaflet em rede). Evita duplicados.
      //    CRITICAL: temos de ESPERAR que os scripts carreguem antes de executar
      //    os scripts do body — se Leaflet ainda não carregou, `L.map(...)` no
      //    body falha. Acumulamos promessas e aguardamos no fim.
      var existingUrls = new Set();
      document.head.querySelectorAll('script[src], link[rel="stylesheet"]').forEach(function (n) {
        var u = n.getAttribute('src') || n.getAttribute('href');
        if (u) existingUrls.add(u);
      });
      var scriptLoadPromises = [];
      doc.head.querySelectorAll('link[rel="stylesheet"]').forEach(function (n) {
        var u = n.getAttribute('href');
        if (u && !existingUrls.has(u)) {
          var clone = document.createElement('link');
          for (var i = 0; i < n.attributes.length; i++) {
            clone.setAttribute(n.attributes[i].name, n.attributes[i].value);
          }
          document.head.appendChild(clone);
        }
      });
      doc.head.querySelectorAll('script[src]').forEach(function (n) {
        var u = n.getAttribute('src');
        if (u && !existingUrls.has(u)) {
          scriptLoadPromises.push(new Promise(function (resolve) {
            var clone = document.createElement('script');
            for (var i = 0; i < n.attributes.length; i++) {
              clone.setAttribute(n.attributes[i].name, n.attributes[i].value);
            }
            clone.onload = function () { resolve(); };
            clone.onerror = function () { resolve(); }; // resolve mesmo em erro
            document.head.appendChild(clone);
          }));
        }
      });

      // 2. Acrescentar <style> inline do head que esta página tenha (ex.: rede
      //    tem estilos para #map-main e filter chips inline). Marcar para
      //    evitar duplicação em SPA navegações futuras.
      doc.head.querySelectorAll('style').forEach(function (s) {
        if (s.id === 'gpf-app-instant-bg') return; // global, já existe
        var marker = 'gpf-spa-style-' + destPath.replace(/[^a-z0-9]/gi, '_');
        if (document.getElementById(marker)) return;
        var clone = s.cloneNode(true);
        clone.id = marker;
        document.head.appendChild(clone);
      });

      // 3. Criar wrapper para a nova página
      var wrapper = document.createElement('div');
      wrapper.className = 'gpf-page gpf-page-active';
      wrapper.setAttribute('data-path', destPath);

      // Mover conteúdo do novo body para o wrapper, EXCEPTO shared
      var newBody = doc.body;
      // Remover do novo body os elementos que já existem partilhados
      newBody.querySelectorAll('#gpf-app-loader, nav.bottom-nav, .more-sheet, .more-sheet-backdrop').forEach(function (n) {
        n.remove();
      });
      var newChildren = Array.prototype.slice.call(newBody.childNodes);
      newChildren.forEach(function (n) { wrapper.appendChild(n); });

      saveCurrentPageState();
      hideCurrentPage();

      // Inserir wrapper novo no body (antes dos shared elements)
      _insertWrapper(wrapper);

      // Atualizar title, body class, URL — antes de scripts correrem
      document.title = doc.title;
      document.body.className = doc.body.className || '';
      currentPagePath = destPath;
      try { history.pushState({ spa: true, path: destPath }, '', href); } catch (e) {}

      pageCache[destPath] = {
        wrapper: wrapper,
        scrollY: 0,
        title: doc.title,
        bodyClass: doc.body.className || '',
      };
      markPageVisited(destPath);
      window.scrollTo(0, 0);
      updateBottomNavActive(destPath);

      // Interceptar document.addEventListener('DOMContentLoaded', fn) durante
      // a execução dos scripts da nova página. Sem isto, em SPA, cada visita
      // a uma página acumula listeners no document — quando dispatchEvent
      // dispara DOMContentLoaded, TODOS os listeners de TODAS as visitas
      // anteriores re-executam. Sintoma concreto: navegar de onde-encontrar
      // → onde-carimbar e ver o mapa errado (o listener da página antiga
      // re-cria o mapa com dados antigos sobre o container da página nova).
      //
      // Solução: capturar os listeners desta navegação especificamente e
      // disparar só esses manualmente no fim. Os listeners antigos NUNCA
      // chegam a ser registados (foram interceptados e descartados em vez
      // de propagados ao document) — não acumulam, não disparam.
      var _navDCLListeners = [];
      var _origDocAdd = document.addEventListener.bind(document);
      document.addEventListener = function (type, fn, opts) {
        if (type === 'DOMContentLoaded' && typeof fn === 'function') {
          _navDCLListeners.push(fn);
          return; // skip real registration — disparamos manualmente abaixo
        }
        return _origDocAdd(type, fn, opts);
      };

      // ESPERAR que todos os scripts novos do head carreguem antes de executar
      // os scripts do body. Sem isto, ex.: rede.html corre `L.map('map-main')`
      // antes de Leaflet ter carregado → erro silencioso, mapa não aparece.
      return Promise.all(scriptLoadPromises).then(function () {
        // Re-executar scripts dentro do wrapper SEQUENCIALMENTE (innerHTML
        // não os executa). HTML normal: cada <script src> bloqueia execução
        // dos seguintes até carregar (ordem garantida). Em SPA temos de
        // replicar esse comportamento — caso contrário, ex.: voting.js corre
        // antes de auth.js terminar de carregar e falha em `AuthUtils.xxx`.
        // Scripts inline correm imediatamente; externos esperam pelo onload.
        //
        // IMPORTANT: scripts com `src` que JÁ foram carregados antes (em
        // qualquer página) NÃO devem ser re-executados — ex.: auth.js tem
        // `const SUPABASE_URL = ...` no top-level. Re-executar daria erro
        // de "Identifier already declared", parando a execução e quebrando
        // tudo o que depende daquele script. O Set window.__gpfLoadedScripts
        // rastreia o que já foi carregado nesta sessão da WebView.
        // normalizeScriptSrc: converte um src de script (possivelmente relativo
        // ou com base about:blank do DOMParser) para URL absoluta usando a
        // localização atual da janela. Essencial para dedup correto: scripts
        // parseados via DOMParser têm s.src resolvido com base about:blank
        // (ex.: "about:js/auth.js"), enquanto scripts reais no DOM têm s.src
        // como URL absoluta (ex.: "capacitor://localhost/js/auth.js").
        function normalizeScriptSrc(src) {
          if (!src) return src;
          // Já é URL absoluta válida (http, https, capacitor, etc.)
          if (/^(https?:|capacitor:|file:)/.test(src)) return src;
          // Relativo ou com base errada (about:) — resolver com URL atual
          var raw = src.replace(/^about:/, '');
          try {
            return new URL(raw, window.location.href).href;
          } catch (e) {
            return raw;
          }
        }

        if (!window.__gpfLoadedScripts) {
          window.__gpfLoadedScripts = new Set();
          // Pré-popular com scripts já existentes (head + body) do load inicial
          document.querySelectorAll('script[src]').forEach(function (s) {
            window.__gpfLoadedScripts.add(normalizeScriptSrc(s.src));
          });
        }
        var loadedScripts = window.__gpfLoadedScripts;
        var scriptList = Array.prototype.slice.call(wrapper.querySelectorAll('script'));
        var sequentialChain = scriptList.reduce(function (chain, oldScript) {
          return chain.then(function () {
            return new Promise(function (resolve) {
              if (oldScript.src) {
                var normalizedSrc = normalizeScriptSrc(oldScript.src);
                // Dedup: se já foi carregado, NÃO re-executar — apenas remover
                // o placeholder do DOM e seguir. Os globals já estão activos.
                if (loadedScripts.has(normalizedSrc)) {
                  if (oldScript.parentNode) oldScript.parentNode.removeChild(oldScript);
                  resolve();
                  return;
                }
                var newScript = document.createElement('script');
                for (var i = 0; i < oldScript.attributes.length; i++) {
                  newScript.setAttribute(oldScript.attributes[i].name, oldScript.attributes[i].value);
                }
                newScript.onload = function () {
                  loadedScripts.add(normalizeScriptSrc(newScript.src));
                  resolve();
                };
                newScript.onerror = function () { resolve(); };
                oldScript.parentNode.replaceChild(newScript, oldScript);
              } else {
                // Inline — corre síncrono quando inserido. Inline scripts
                // tipicamente dependem do DOM da página actual (chamadas a
                // initX, lucide.createIcons, etc.) — sempre executar.
                var newScript = document.createElement('script');
                for (var i = 0; i < oldScript.attributes.length; i++) {
                  newScript.setAttribute(oldScript.attributes[i].name, oldScript.attributes[i].value);
                }
                newScript.textContent = oldScript.textContent;
                oldScript.parentNode.replaceChild(newScript, oldScript);
                resolve();
              }
            });
          });
        }, Promise.resolve());

        return sequentialChain.then(function () {
          // Restaurar addEventListener antes de disparar listeners — caso
          // algum listener queira registar novos listeners no futuro.
          document.addEventListener = _origDocAdd;
          // Disparar SÓ os listeners desta navegação (capturados em _navDCLListeners).
          // Listeners de páginas anteriores ficaram descartados (nunca registados
          // no document) — não disparam.
          _navDCLListeners.forEach(function (fn) {
            try { fn({ type: 'DOMContentLoaded' }); } catch (e) { console.error('[SPA] DCL listener err:', e); }
          });
          // Manter o dispatch defensivo para qualquer código que tenha registado
          // listener antes da SPA iniciar (ex.: scripts globais carregados na
          // initial page que esperam DOMContentLoaded em re-navegações).
          try {
            document.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true, cancelable: true }));
          } catch (e) {}
          setTimeout(function () {
            try { window.dispatchEvent(new Event('load')); } catch (e) {}
          }, 50);

          if (typeof window.applyAppContext === 'function') {
            window.applyAppContext();
          }

          // Esconder loader DEPOIS dos scripts completarem + dois frames de
          // margem para o browser pintar markers/conteúdo dinâmico. Slide-out
          // suave para a esquerda. Sem esta pausa, utilizador via markers a
          // aparecer progressivamente (ex.: Rede com 200 markers do cluster).
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              setTimeout(function () {
                var el = document.getElementById('gpf-app-loader');
                if (el) {
                  el.style.transition = 'transform ' + SLIDE_OUT_MS + 'ms ' + SLIDE_EASE + ', opacity ' + SLIDE_OUT_MS + 'ms ' + SLIDE_EASE;
                  el.style.transform = 'translateX(-100%)';
                  el.style.opacity = '0';
                }
              }, 100);
            });
          });
        });
      });
    });
  }

  // Back/forward usa o mesmo fluxo — se a página estiver em cache, restaura;
  // caso contrário, faz fetch + render.
  window.addEventListener('popstate', function () {
    if (!detectApp()) return;
    var destPath = pageKey(window.location.pathname, window.location.search);
    if (!showCachedPage(destPath, window.location.href)) {
      loadNewPage(window.location.href, destPath).catch(function () {
        window.location.reload();
      });
    }
  });

  function startNavigationSlide(href) {
    var destPath = href;
    try {
      var url = new URL(href, window.location.href);
      destPath = pageKey(url.pathname, url.search);
    } catch (e) {}

    // 1ª prioridade: se a página JÁ está em memória (wrapper existe), restaura.
    // Sem fetch, sem render, instantâneo, DOM preservado tal como ficou.
    if (showCachedPage(destPath, href)) return;

    // 2ª prioridade: fetch + render num novo wrapper. WebView NÃO é destruída
    // → não há flash da cor de fundo nativa. O loader não aparece (a transição
    // é tão rápida que não vale a pena mostrar — fetch local em <50ms).
    loadNewPage(href, destPath).catch(function (err) {
      // Fallback final: se SPA falhar (raríssimo), hard reload tradicional
      console.error('SPA load falhou, fallback:', err);
      var el = document.getElementById('gpf-app-loader');
      if (el) {
        el.style.transition = 'none';
        el.style.transform = 'translateX(0)';
        el.style.opacity = '1';
      }
      window.location.href = href;
    });
  }

  // Wrap inicial do body actual num .gpf-page assim que o DOM estiver pronto
  // (depois do shared.js já ter injectado a bottom-nav). Faz com que a página
  // de entrada também fique em memória para a próxima vez ser instantânea.
  if (detectApp()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        setTimeout(ensureInitialPageWrapped, 0);
      });
    } else {
      setTimeout(ensureInitialPageWrapped, 0);
    }
  }

  // Intercepta clicks em links internos e dispara o slide-in do loader
  document.addEventListener('click', function (ev) {
    if (!detectApp()) return;
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    if (ev.defaultPrevented) return;
    var a = ev.target && ev.target.closest && ev.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (a.target === '_blank' || a.hasAttribute('download')) return;
    if (/^(https?:|mailto:|tel:|sms:|javascript:|#)/.test(href)) return;
    ev.preventDefault();
    startNavigationSlide(href);
  }, { capture: true });

  if (detectApp()) {
    // ─── Fetch interceptor + carregamento controlado ───
    // O loader só esconde quando AMBOS são verdadeiros:
    //   1. window.load disparou (todas as imagens, scripts, CSS carregaram)
    //   2. activeFetches === 0 (nenhum pedido a Supabase/API em curso)
    // Isto garante que utilizador não vê elementos a renderizar faseados
    // (ex: lista do passaporte que carrega após Supabase responder).
    var activeFetches = 0;
    var pageLoaded = false;

    function maybeHideLoader() {
      if (pageLoaded && activeFetches === 0) hideAppLoader();
    }
    function fetchStart() {
      activeFetches++;
      showAppLoader();
    }
    function fetchEnd() {
      activeFetches = Math.max(0, activeFetches - 1);
      maybeHideLoader();
    }

    // Reescreve paths de imagens (img/, brand_assets/) para o CDN remoto.
    // Necessário porque o bundle da app não inclui img/ nem icones
    // (~170 MB total). Mas há código de páginas que faz fetch directo a
    // estes paths (ex.: rede.html paint dos icones dos filtros via canvas).
    // Aqui interceptamos esses pedidos e reescrevemos para o Vercel.
    function _rewriteAssetUrl(input) {
      if (typeof input !== 'string') return input;
      // Não tocar em URLs absolutas ou esquemas especiais
      if (/^(https?:|data:|blob:|capacitor:|file:)/i.test(input)) return input;
      // Apenas img/ e brand_assets/ (com ou sem barra inicial)
      if (!/^\/?(img|brand_assets)\//i.test(input)) return input;
      return window.APP_BASE_URL + '/' + input.replace(/^\//, '');
    }

    var origFetch = window.fetch;
    if (origFetch) {
      window.fetch = function (input, init) {
        // Reescrever URL se for asset que vive no CDN remoto
        if (typeof input === 'string') {
          input = _rewriteAssetUrl(input);
        } else if (input && typeof input === 'object' && input.url) {
          // Request object — não conseguimos mudar URL, mas log para debug
        }
        fetchStart();
        return origFetch.call(this, input, init).then(
          function (res) { fetchEnd(); return res; },
          function (err) { fetchEnd(); throw err; }
        );
      };
    }

    window.addEventListener('load', function () {
      pageLoaded = true;
      setTimeout(maybeHideLoader, 50);
      // Marcar a página actual como visitada — próxima visita salta o loader
      markPageVisited(window.location.pathname);
    });
    // Cap absoluto: 1.5s após página visivel, força esconder mesmo que
    // alguns fetches estejam pendentes (tiles, third-party). Garante que
    // o utilizador NUNCA vê o loader stuck.
    setTimeout(function () {
      pageLoaded = true;
      activeFetches = 0;
      var el = document.getElementById('gpf-app-loader');
      if (el) {
        el.style.transition = 'transform ' + SLIDE_OUT_MS + 'ms ' + SLIDE_EASE + ', opacity ' + SLIDE_OUT_MS + 'ms ' + SLIDE_EASE;
        el.style.transform = 'translateX(-100%)';
        el.style.opacity = '0';
        el.classList.add('gpf-app-loader-leaving');
      }
    }, 1800);

    // Garantir que lucide.createIcons() corre depois de tudo carregar — alguns
    // bottom-navs renderizados via JS podem perder o run inicial.
    function retryLucide() {
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        try { window.lucide.createIcons(); } catch (e) {}
      }
    }
    window.addEventListener('load', function () {
      setTimeout(retryLucide, 50);
      setTimeout(retryLucide, 500);
    });
  } else {
    // Site web: esconde imediatamente.
    var el = document.getElementById('gpf-app-loader');
    if (el) el.classList.add('gpf-app-loader-off');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.applyAppContext);
  } else {
    window.applyAppContext();
  }
})();
