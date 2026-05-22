/**
 * Scroll Expand Hero — vanilla JS port of the React/Framer-Motion component.
 * Drives a scroll-progress (0..1) that expands a centred media frame and
 * pushes split title halves outward. Until progress reaches 1 the page is
 * scroll-locked at top; once fully expanded, normal scroll resumes. Scrolling
 * back up at the top of the page collapses it again (matches reference).
 */
(function () {
  'use strict';

  const section = document.getElementById('page-hero');
  if (!section || !section.classList.contains('seh-section')) return;

  const bgEl       = section.querySelector('[data-seh-bg]');
  const bgShadowEl = section.querySelector('[data-seh-bg-shadow]');
  const frameEl    = section.querySelector('[data-seh-frame]');
  const veilEl     = section.querySelector('[data-seh-media-veil]');
  const leftEls    = section.querySelectorAll('[data-seh-left]');
  const rightEls   = section.querySelectorAll('[data-seh-right]');
  const titleEl    = section.querySelector('[data-seh-title]');
  const videoEl    = section.querySelector('video.seh-media-el');
  const reduced    = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!frameEl) return;

  // ── Garantir que o vídeo do hero arranca em browsers que bloqueiam silenciosamente
  //    o autoplay (ex.: Safari, Chrome com baixo media-engagement-index). Tenta play()
  //    em vários momentos e cai num retry à primeira interacção do utilizador.
  if (videoEl) {
    const tryPlay = () => {
      const p = videoEl.play();
      if (p && typeof p.catch === 'function') p.catch(() => { /* ignored */ });
    };
    tryPlay();
    videoEl.addEventListener('loadeddata', tryPlay, { once: true });
    videoEl.addEventListener('canplay',     tryPlay, { once: true });
    const onceInteract = () => { tryPlay(); };
    window.addEventListener('pointerdown', onceInteract, { once: true });
    window.addEventListener('keydown',     onceInteract, { once: true });
    window.addEventListener('wheel',       onceInteract, { once: true, passive: true });
    window.addEventListener('touchstart',  onceInteract, { once: true, passive: true });
  }

  let progress = 0;
  let expanded = false;
  let showContent = false;
  let touchStartY = 0;
  let isMobile = window.innerWidth < 768;
  let rafPending = false;

  const apply = () => {
    rafPending = false;
    // Match React component math exactly.
    const w = 300 + progress * (isMobile ? 650 : 1250);
    const h = 400 + progress * (isMobile ? 200 : 400);
    const tx = progress * (isMobile ? 180 : 150);

    frameEl.style.width  = w + 'px';
    frameEl.style.height = h + 'px';

    // Imagem de fundo fica sempre 100% — só a camada de sombra cresce
    // (de ~10% a 55%) à medida que o utilizador faz scroll.
    if (bgShadowEl) bgShadowEl.style.opacity = String(0.10 + progress * 0.45);
    if (veilEl)     veilEl.style.opacity     = String(0.5 - progress * 0.3);

    leftEls.forEach((el)  => { el.style.transform = `translateX(-${tx}vw)`; });
    rightEls.forEach((el) => { el.style.transform = `translateX(${tx}vw)`; });
  };

  const schedule = () => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(apply);
  };

  // Quanto tempo manter o scroll-lock depois de expandir, para o utilizador
  // ter tempo de processar a sequência stagger (que termina aos ~1.4s).
  const POST_EXPAND_LOCK_MS = 1500;
  let unlockTimer = 0;

  const setExpanded = (v) => {
    if (expanded === v) return;
    expanded = v;
    section.classList.toggle('seh-expanded', v);
    if (v) {
      // Mantém o lock activo durante POST_EXPAND_LOCK_MS depois da expansão
      // total — só depois é que o body fica scrollável.
      clearTimeout(unlockTimer);
      unlockTimer = setTimeout(() => {
        if (expanded) document.body.classList.remove('seh-locked');
      }, POST_EXPAND_LOCK_MS);
      section.removeAttribute('aria-hidden');
    } else {
      clearTimeout(unlockTimer);
      document.body.classList.add('seh-locked');
    }
  };

  // ── Counter animation (corre quando os children fazem reveal) ────────
  let countersAnimated = false;

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  const animateCounter = (el, duration) => {
    const target = parseInt(el.dataset.counter, 10);
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const value = Math.round(easeOutCubic(t) * target);
      el.textContent = prefix + value.toLocaleString('pt-PT') + suffix;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const triggerCounters = () => {
    if (countersAnimated) return;
    countersAnimated = true;
    const stats = section.querySelectorAll('.seh-stat [data-counter]');
    // Delays alinhados com o stagger das stats (CSS: 0.40s/0.55s/0.70s) +
    // ~100ms para o número começar a contar logo após a stat aparecer.
    const delays = [500, 650, 800];
    stats.forEach((el, i) => {
      setTimeout(() => animateCounter(el, 800), delays[i] != null ? delays[i] : 800);
    });
  };

  const setShowContent = (v) => {
    if (showContent === v) return;
    showContent = v;
    section.classList.toggle('seh-show-content', v);
    if (v) triggerCounters();
  };

  const setProgress = (p) => {
    progress = Math.min(Math.max(p, 0), 1);
    schedule();
    if (progress >= 1) {
      if (!expanded) setExpanded(true);
      setShowContent(true);
    } else if (progress < 0.75) {
      setShowContent(false);
    }
  };

  // Reset to top on load (matches the useEffect resets in the React demo).
  const resetSection = () => {
    progress = 0;
    setExpanded(false);
    window.scrollTo(0, 0);
    apply();
  };

  // Reduced motion: skip the scroll-jacking entirely — show fully expanded.
  if (reduced) {
    progress = 1;
    expanded = true;
    showContent = true;
    section.classList.add('seh-expanded', 'seh-show-content');
    // Snap counters directly to final value (não animar com reduced motion).
    section.querySelectorAll('.seh-stat [data-counter]').forEach((el) => {
      const target = parseInt(el.dataset.counter, 10);
      const prefix = el.dataset.prefix || '';
      const suffix = el.dataset.suffix || '';
      el.textContent = prefix + target.toLocaleString('pt-PT') + suffix;
    });
    countersAnimated = true;
    apply();
    return;
  }

  // Initial lock + state.
  document.body.classList.add('seh-locked');
  resetSection();

  const isLocked = () => document.body.classList.contains('seh-locked');

  const onWheel = (e) => {
    if (expanded && e.deltaY < 0 && window.scrollY <= 5) {
      setExpanded(false);
      e.preventDefault();
      return;
    }
    if (!expanded) {
      e.preventDefault();
      setProgress(progress + e.deltaY * 0.0009);
      return;
    }
    // Já expandido mas ainda dentro da janela de pausa pós-expansão:
    // bloquear qualquer scroll até o lock ser libertado.
    if (isLocked()) e.preventDefault();
  };

  const onTouchStart = (e) => {
    touchStartY = e.touches[0].clientY;
  };

  const onTouchMove = (e) => {
    if (!touchStartY) return;
    const y = e.touches[0].clientY;
    const dy = touchStartY - y;

    if (expanded && dy < -20 && window.scrollY <= 5) {
      setExpanded(false);
      e.preventDefault();
      return;
    }
    if (!expanded) {
      e.preventDefault();
      const factor = dy < 0 ? 0.008 : 0.005;
      setProgress(progress + dy * factor);
      touchStartY = y;
      return;
    }
    // Janela de pausa pós-expansão: bloqueia também o swipe.
    if (isLocked()) e.preventDefault();
  };

  const onTouchEnd = () => { touchStartY = 0; };

  const onScroll = () => {
    // Mantém o topo enquanto não estiver totalmente expandido OU enquanto a
    // janela de pausa estiver activa.
    if (!expanded || isLocked()) window.scrollTo(0, 0);
  };

  const onResize = () => {
    const next = window.innerWidth < 768;
    if (next !== isMobile) {
      isMobile = next;
      apply();
    }
  };

  window.addEventListener('wheel',      onWheel,      { passive: false });
  window.addEventListener('touchstart', onTouchStart, { passive: false });
  window.addEventListener('touchmove',  onTouchMove,  { passive: false });
  window.addEventListener('touchend',   onTouchEnd);
  window.addEventListener('scroll',     onScroll);
  window.addEventListener('resize',     onResize);
  window.addEventListener('resetSection', resetSection);
})();
