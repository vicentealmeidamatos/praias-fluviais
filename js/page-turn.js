// ─── Dynamic Scroll Animations ───
// Parallax, clip-path reveals, staggered entrances, 3D tilt,
// velocity blur, counter animations, geometric shapes, timeline draw

document.addEventListener('DOMContentLoaded', () => {
  gsap.registerPlugin(ScrollTrigger);

  const pages = document.querySelectorAll('.magazine-page');
  const container = document.querySelector('.magazine-container');
  const dots = document.querySelectorAll('.page-dot');
  const progressBar = document.querySelector('.scroll-progress');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!pages.length || !container) return;

  // ─── Scroll Progress Bar ───
  if (progressBar) {
    ScrollTrigger.create({
      trigger: container,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        gsap.set(progressBar, { scaleX: self.progress });
      }
    });
  }

  // ─── Page Dot Navigation ───
  function setActiveDot(index) {
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === index);
    });
  }

  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => {
      const target = pages[i];
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  if (prefersReducedMotion) {
    setActiveDot(0);
    pages.forEach((page, i) => {
      ScrollTrigger.create({
        trigger: page,
        start: 'top center',
        end: 'bottom center',
        onEnter: () => setActiveDot(i),
        onEnterBack: () => setActiveDot(i),
      });
    });
    return;
  }

  // ═══════════════════════════════════════
  // ANIMATION SYSTEM
  // ═══════════════════════════════════════

  // ─── 1. Hero Entrance Sequence ───
  const heroPage = document.getElementById('page-hero');
  if (heroPage) {
    const heroContent = heroPage.querySelector('.relative.z-10');
    const heroLogo = heroPage.querySelector('img[alt="Praias Fluviais"]');
    const heroTaglines = heroPage.querySelectorAll('.reveal-on-scroll.font-display');
    const heroStats = heroPage.querySelectorAll('.flex-wrap .text-center');
    const heroCTAs = heroPage.querySelector('.flex.flex-col.sm\\:flex-row');
    const scrollIndicator = heroPage.querySelector('.scroll-indicator');
    const particles = heroPage.querySelectorAll('.particle');
    const geoShapes = heroPage.querySelectorAll('.geo-shape');

    // Build entrance timeline
    const heroTL = gsap.timeline({ delay: 0.3 });

    // Logo drops in with elastic bounce
    if (heroLogo) {
      gsap.set(heroLogo, { opacity: 0, y: -60, scale: 0.8 });
      heroTL.to(heroLogo, {
        opacity: 1, y: 0, scale: 1,
        duration: 1.2, ease: 'elastic.out(1, 0.5)',
      }, 0);
    }

    // Taglines slide up staggered
    heroTaglines.forEach((el, i) => {
      gsap.set(el, { opacity: 0, y: 30 });
      heroTL.to(el, {
        opacity: 1, y: 0,
        duration: 0.7, ease: 'power3.out',
      }, 0.4 + i * 0.15);
    });

    // Stats pop in from different directions
    heroStats.forEach((stat, i) => {
      const directions = [{ x: -40, rotate: -5 }, { y: 40, rotate: 0 }, { x: 40, rotate: 5 }];
      const dir = directions[i] || directions[0];
      gsap.set(stat, { opacity: 0, ...dir });
      heroTL.to(stat, {
        opacity: 1, x: 0, y: 0, rotate: 0,
        duration: 0.8, ease: 'back.out(1.7)',
      }, 0.7 + i * 0.12);
    });

    // CTAs scale up
    if (heroCTAs) {
      gsap.set(heroCTAs, { opacity: 0, scale: 0.85, y: 20 });
      heroTL.to(heroCTAs, {
        opacity: 1, scale: 1, y: 0,
        duration: 0.7, ease: 'back.out(1.4)',
      }, 1.1);
    }

    // Scroll indicator fades in last
    if (scrollIndicator) {
      gsap.set(scrollIndicator, { opacity: 0 });
      heroTL.to(scrollIndicator, {
        opacity: 1, duration: 0.5,
      }, 1.6);
    }

    // Geo shapes drift in slowly
    geoShapes.forEach((shape, i) => {
      gsap.set(shape, { opacity: 0, scale: 0.5 });
      heroTL.to(shape, {
        opacity: 1, scale: 1,
        duration: 1.5, ease: 'power2.out',
      }, 0.2 + i * 0.2);
    });

    // ─── Hero Parallax on Scroll ───
    // Content rises and fades
    gsap.to(heroContent, {
      y: -100, opacity: 0.2, scale: 0.95,
      ease: 'none',
      scrollTrigger: {
        trigger: heroPage,
        start: 'top top',
        end: 'bottom top',
        scrub: 0.2,
      }
    });

    // Particles drift at different rates
    particles.forEach((p, i) => {
      gsap.to(p, {
        y: -(60 + i * 35),
        x: (i % 2 === 0 ? 1 : -1) * 20,
        ease: 'none',
        scrollTrigger: {
          trigger: heroPage,
          start: 'top top',
          end: 'bottom top',
          scrub: 0.1 + i * 0.05,
        }
      });
    });

    // Geo shapes parallax (slow, dreamy)
    geoShapes.forEach((shape, i) => {
      gsap.to(shape, {
        y: -(30 + i * 20),
        rotation: (i % 2 === 0 ? 15 : -15),
        ease: 'none',
        scrollTrigger: {
          trigger: heroPage,
          start: 'top top',
          end: 'bottom top',
          scrub: 0.4,
        }
      });
    });
  }

  // ─── 2. Section Clip-Path Reveals ───
  pages.forEach((page, i) => {
    if (i === 0) {
      setActiveDot(0);
      return;
    }

    page.classList.add('section-reveal-clip');

    gsap.to(page, {
      scrollTrigger: {
        trigger: page,
        start: 'top 90%',
        end: 'top 20%',
        scrub: 0.6,
        onEnter: () => setActiveDot(i),
        onEnterBack: () => setActiveDot(i),
        onLeaveBack: () => setActiveDot(Math.max(0, i - 1)),
      },
      clipPath: 'inset(0% 0% 0% 0% round 0px)',
      ease: 'none',
    });

    gsap.set(page, {
      clipPath: 'inset(8% 4% 8% 4% round 24px)',
    });
  });

  // ─── 3. Section Divider Lines ───
  const sectionLines = document.querySelectorAll('.section-line');
  sectionLines.forEach((line) => {
    ScrollTrigger.create({
      trigger: line,
      start: 'top 85%',
      once: true,
      onEnter: () => {
        gsap.to(line, {
          width: 120,
          opacity: 1,
          duration: 1,
          ease: 'power3.out',
        });
      }
    });
  });

  // ─── 4. Section Labels Slide-In ───
  const sectionLabels = document.querySelectorAll('.section-label');
  sectionLabels.forEach((label) => {
    label.classList.remove('reveal-on-scroll');
    gsap.set(label, { opacity: 0, x: -30, letterSpacing: '0.4em' });
    ScrollTrigger.create({
      trigger: label,
      start: 'top 88%',
      once: true,
      onEnter: () => {
        gsap.to(label, {
          opacity: 1, x: 0, letterSpacing: '0.2em',
          duration: 0.8, ease: 'power3.out',
        });
      }
    });
  });

  // ─── 5. Section Headers — Skew Text Reveal ───
  const sectionHeaders = document.querySelectorAll('.magazine-page h2');
  sectionHeaders.forEach((h2) => {
    if (h2.closest('#page-hero')) return;

    h2.classList.remove('reveal-on-scroll');
    gsap.set(h2, { opacity: 0, y: 40 });
    ScrollTrigger.create({
      trigger: h2,
      start: 'top 85%',
      once: true,
      onEnter: () => {
        gsap.to(h2, {
          opacity: 1, y: 0,
          duration: 0.9, ease: 'power3.out',
        });
      }
    });
  });

  // ─── 6. Parallax Depth Layers ───
  pages.forEach((page) => {
    // Headings float slightly upward
    const headings = page.querySelectorAll('h2');
    headings.forEach((el) => {
      if (el.closest('#page-hero')) return;
      gsap.to(el, {
        y: -30, ease: 'none',
        scrollTrigger: {
          trigger: page,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 0.3,
        },
      });
    });

    // Section images subtle scale on scroll
    const images = page.querySelectorAll('img');
    images.forEach((el) => {
      if (el.closest('.cards-scroll') || el.closest('header') || el.closest('footer') || el.closest('nav') || el.closest('#page-hero')) return;
      gsap.fromTo(el,
        { scale: 1.08 },
        {
          scale: 1, ease: 'none',
          scrollTrigger: {
            trigger: el,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 0.4,
          },
        }
      );
    });

    // Geo shapes in each section float on scroll
    const shapes = page.querySelectorAll('.geo-shape');
    shapes.forEach((shape, i) => {
      if (page.id === 'page-hero') return;
      gsap.fromTo(shape,
        { y: 40, opacity: 0, scale: 0.7 },
        {
          y: -(20 + i * 15), opacity: 1, scale: 1,
          rotation: (i % 2 === 0 ? 10 : -10),
          ease: 'none',
          scrollTrigger: {
            trigger: page,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 0.5 + i * 0.1,
          },
        }
      );
    });
  });

  // ─── 7. Hero Stats Counter Animation ───
  const statNumbers = document.querySelectorAll('#page-hero .font-display.text-4xl, #page-hero .font-display.text-5xl');
  statNumbers.forEach((el) => {
    const text = el.textContent.trim();
    const match = text.match(/^([\d,.]+)(k?\+?)$/);
    if (!match) return;

    const numStr = match[1].replace(/,/g, '');
    const suffix = match[2] || '';
    const target = parseFloat(numStr);
    const obj = { val: 0 };

    el.classList.add('counter-value');

    ScrollTrigger.create({
      trigger: el,
      start: 'top 85%',
      once: true,
      onEnter: () => {
        gsap.to(obj, {
          val: target,
          duration: 2,
          ease: 'power2.out',
          onUpdate: () => {
            const current = Math.round(obj.val);
            el.textContent = (target >= 100 ? current.toLocaleString('pt-PT') : current) + suffix;
          },
          onComplete: () => {
            el.textContent = text;
          }
        });
      }
    });
  });

  // ─── 8. Staggered Card Entrances with 3D Tilt ───
  const cardContainers = document.querySelectorAll('.cards-scroll');
  cardContainers.forEach((scroll) => {
    const cards = scroll.querySelectorAll('.card-interactive, > a');
    if (!cards.length) return;

    gsap.set(cards, { opacity: 0, y: 60, rotateZ: 2 });

    ScrollTrigger.create({
      trigger: scroll,
      start: 'top 80%',
      once: true,
      onEnter: () => {
        gsap.to(cards, {
          opacity: 1, y: 0, rotateZ: 0,
          duration: 0.8, stagger: 0.12,
          ease: 'back.out(1.4)',
        });
      }
    });

    // 3D tilt on hover for each card
    cards.forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;

        gsap.to(card, {
          rotateY: x * 12,
          rotateX: -y * 8,
          scale: 1.03,
          duration: 0.3,
          ease: 'power2.out',
          transformPerspective: 800,
        });
      });

      card.addEventListener('mouseleave', () => {
        gsap.to(card, {
          rotateY: 0, rotateX: 0, scale: 1,
          duration: 0.5,
          ease: 'elastic.out(1, 0.5)',
        });
      });
    });
  });

  // ─── 9. Scroll Hint for Cards ───
  const scrollHint = document.querySelector('.scroll-hint');
  if (scrollHint) {
    ScrollTrigger.create({
      trigger: scrollHint,
      start: 'top 90%',
      once: true,
      onEnter: () => {
        gsap.to(scrollHint, {
          opacity: 1, duration: 0.6, delay: 0.8,
        });
        // Auto-hide after 3s
        gsap.to(scrollHint, {
          opacity: 0, duration: 0.4, delay: 4,
        });
      }
    });
  }

  // ─── 10. Quick Links Grid Stagger ───
  const quickLinksGrid = document.querySelector('#page-descubra .grid');
  if (quickLinksGrid) {
    const links = quickLinksGrid.querySelectorAll('.quick-link');
    gsap.set(links, { opacity: 0, scale: 0.8, y: 40 });

    ScrollTrigger.create({
      trigger: quickLinksGrid,
      start: 'top 75%',
      once: true,
      onEnter: () => {
        gsap.to(links, {
          opacity: 1, scale: 1, y: 0,
          duration: 0.7,
          stagger: { amount: 0.5, from: 'center' },
          ease: 'back.out(1.7)',
        });
      }
    });
  }

  // ─── 11. Magnetic Hover on Quick Links ───
  const magneticElements = document.querySelectorAll('.quick-link');
  magneticElements.forEach((el) => {
    el.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;

      gsap.to(el, {
        x: x * 0.1, y: y * 0.1,
        rotateX: -y * 0.08, rotateY: x * 0.08,
        duration: 0.4, ease: 'power2.out',
      });
    });

    el.addEventListener('mouseleave', () => {
      gsap.to(el, {
        x: 0, y: 0, rotateX: 0, rotateY: 0,
        duration: 0.6, ease: 'elastic.out(1, 0.4)',
      });
    });
  });

  // ─── 12. Timeline Line Draw + Items Cascade ───
  const timelineLine = document.querySelector('#page-praia-ano .timeline-line');
  if (timelineLine) {
    gsap.set(timelineLine, { scaleY: 0, transformOrigin: 'top' });

    gsap.to(timelineLine, {
      scaleY: 1,
      ease: 'none',
      scrollTrigger: {
        trigger: timelineLine,
        start: 'top 80%',
        end: 'bottom 40%',
        scrub: 0.5,
      }
    });
  }

  const timelineItems = document.querySelectorAll('#page-praia-ano .relative.pl-16');
  if (timelineItems.length) {
    gsap.set(timelineItems, { opacity: 0, x: -50 });

    timelineItems.forEach((item, i) => {
      ScrollTrigger.create({
        trigger: item,
        start: 'top 85%',
        once: true,
        onEnter: () => {
          gsap.to(item, {
            opacity: 1, x: 0,
            duration: 0.8, delay: i * 0.15,
            ease: 'power3.out',
          });

          const dot = item.querySelector('.rounded-full');
          if (dot) {
            gsap.fromTo(dot,
              { scale: 0, rotation: -180 },
              { scale: 1, rotation: 0, duration: 0.6, delay: i * 0.15 + 0.2, ease: 'back.out(3)' }
            );
          }
        }
      });
    });
  }

  // ─── 13. Praia do Ano Badge Entrance ───
  const praiaAnoBadge = document.querySelector('#page-praia-ano .inline-flex');
  if (praiaAnoBadge) {
    gsap.set(praiaAnoBadge, { opacity: 0, scale: 0, rotation: -20 });
    ScrollTrigger.create({
      trigger: praiaAnoBadge,
      start: 'top 85%',
      once: true,
      onEnter: () => {
        gsap.to(praiaAnoBadge, {
          opacity: 1, scale: 1, rotation: 0,
          duration: 0.8, ease: 'elastic.out(1, 0.4)',
        });
      }
    });
  }

  // ─── 14. Feature List Slide-In with Icon Spin ───
  const featureItems = document.querySelectorAll('#page-mapa .space-y-4 > div');
  featureItems.forEach((item, i) => {
    gsap.set(item, { opacity: 0, x: -50, skewX: -3 });
    ScrollTrigger.create({
      trigger: item,
      start: 'top 90%',
      once: true,
      onEnter: () => {
        gsap.to(item, {
          opacity: 1, x: 0, skewX: 0,
          duration: 0.7, delay: i * 0.15,
          ease: 'power3.out',
        });

        const icon = item.querySelector('.w-10');
        if (icon) {
          gsap.fromTo(icon,
            { scale: 0, rotation: -180 },
            { scale: 1, rotation: 0, duration: 0.7, delay: i * 0.15 + 0.1, ease: 'back.out(2.5)' }
          );
        }
      }
    });
  });

  // ─── 15. Mini Map Reveal with Scale Bounce ───
  const miniMap = document.getElementById('mini-map');
  if (miniMap) {
    const mapWrapper = miniMap.closest('.relative');
    gsap.set(mapWrapper, { opacity: 0, scale: 0.85, y: 40, rotateX: 5 });

    ScrollTrigger.create({
      trigger: mapWrapper,
      start: 'top 80%',
      once: true,
      onEnter: () => {
        gsap.to(mapWrapper, {
          opacity: 1, scale: 1, y: 0, rotateX: 0,
          duration: 1.2, ease: 'elastic.out(1, 0.6)',
          transformPerspective: 800,
        });
      }
    });
  }

  // ─── 16. CTA Buttons Glow Pulse ───
  const ctaButtons = document.querySelectorAll('.btn-primary.shadow-layered-yellow');
  ctaButtons.forEach((btn) => {
    btn.classList.add('cta-glow');
    ScrollTrigger.create({
      trigger: btn,
      start: 'top 85%',
      once: true,
      onEnter: () => {
        btn.classList.add('pulsing');
        // Stop pulsing after a few cycles
        setTimeout(() => btn.classList.remove('pulsing'), 6000);
      }
    });
  });

  // ─── 17. Velocity-Based Scroll Blur ───
  let lastScrollY = window.scrollY;
  let velocityBlurRAF = null;

  function updateVelocityBlur() {
    const currentY = window.scrollY;
    const velocity = Math.abs(currentY - lastScrollY);
    const blur = Math.min(velocity * 0.03, 2.5);

    pages.forEach((page) => {
      page.style.filter = blur > 0.3 ? `blur(${blur}px)` : 'none';
    });

    lastScrollY = currentY;
    velocityBlurRAF = null;
  }

  window.addEventListener('scroll', () => {
    if (!velocityBlurRAF) {
      velocityBlurRAF = requestAnimationFrame(updateVelocityBlur);
    }
  }, { passive: true });

  let scrollTimeout;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      pages.forEach((page) => {
        gsap.to(page, { filter: 'blur(0px)', duration: 0.3 });
      });
    }, 100);
  }, { passive: true });

  // ─── 18. Footer Columns Stagger ───
  const footerCols = document.querySelectorAll('footer .grid > div');
  if (footerCols.length) {
    gsap.set(footerCols, { opacity: 0, y: 30 });

    ScrollTrigger.create({
      trigger: footerCols[0],
      start: 'top 92%',
      once: true,
      onEnter: () => {
        gsap.to(footerCols, {
          opacity: 1, y: 0,
          duration: 0.6, stagger: 0.1,
          ease: 'power3.out',
        });
      }
    });
  }

  // ─── 19. Social Icons Bounce In ───
  const socialIcons = document.querySelectorAll('footer .flex.gap-3 a');
  if (socialIcons.length) {
    gsap.set(socialIcons, { opacity: 0, scale: 0, rotation: -90 });

    ScrollTrigger.create({
      trigger: socialIcons[0],
      start: 'top 92%',
      once: true,
      onEnter: () => {
        gsap.to(socialIcons, {
          opacity: 1, scale: 1, rotation: 0,
          duration: 0.6, stagger: 0.12,
          ease: 'back.out(3)',
        });
      }
    });
  }

  // ─── 20. Newsletter Section Reveal ───
  const newsletter = document.querySelector('footer .max-w-2xl');
  if (newsletter) {
    const nlHeading = newsletter.querySelector('h2');
    const nlText = newsletter.querySelector('p');
    const nlForm = newsletter.querySelector('form');

    if (nlHeading) gsap.set(nlHeading, { opacity: 0, y: 30 });
    if (nlText) gsap.set(nlText, { opacity: 0, y: 20 });
    if (nlForm) gsap.set(nlForm, { opacity: 0, y: 20, scale: 0.95 });

    ScrollTrigger.create({
      trigger: newsletter,
      start: 'top 88%',
      once: true,
      onEnter: () => {
        const tl = gsap.timeline();
        if (nlHeading) tl.to(nlHeading, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, 0);
        if (nlText) tl.to(nlText, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 0.15);
        if (nlForm) tl.to(nlForm, { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'back.out(1.4)' }, 0.3);
      }
    });
  }

  // ─── 21. Article Card Badge Flip ───
  const cardBadges = document.querySelectorAll('.cards-scroll .badge');
  cardBadges.forEach((badge) => {
    gsap.set(badge, { opacity: 0, rotateY: 90, scale: 0.5 });
    ScrollTrigger.create({
      trigger: badge,
      start: 'top 85%',
      once: true,
      onEnter: () => {
        gsap.to(badge, {
          opacity: 1, rotateY: 0, scale: 1,
          duration: 0.7, delay: 0.5,
          ease: 'back.out(2)',
          transformPerspective: 600,
        });
      }
    });
  });

  // ─── 22. Paragraph Text Fade-Slide ───
  const sectionParagraphs = document.querySelectorAll('.magazine-page p.text-white\\/60, .magazine-page p.text-sm');
  sectionParagraphs.forEach((p) => {
    if (p.closest('#page-hero') || p.closest('.cards-scroll') || p.closest('footer')) return;
    p.classList.remove('reveal-on-scroll');
    gsap.set(p, { opacity: 0, y: 20 });
    ScrollTrigger.create({
      trigger: p,
      start: 'top 90%',
      once: true,
      onEnter: () => {
        gsap.to(p, {
          opacity: 1, y: 0,
          duration: 0.7, ease: 'power2.out',
        });
      }
    });
  });

  // ─── 23. "Ver Todos" Link Arrow Nudge ───
  const verTodosLinks = document.querySelectorAll('a[href="artigos.html"]');
  verTodosLinks.forEach((link) => {
    const arrow = link.querySelector('[data-lucide="arrow-right"]');
    if (!arrow) return;

    link.addEventListener('mouseenter', () => {
      gsap.to(arrow, { x: 6, duration: 0.3, ease: 'power2.out' });
    });
    link.addEventListener('mouseleave', () => {
      gsap.to(arrow, { x: 0, duration: 0.4, ease: 'elastic.out(1, 0.5)' });
    });
  });

  // ─── 24. Background Gradient Shift on Scroll ───
  const heroBg = document.querySelector('.hero-bg');
  if (heroBg) {
    gsap.to(heroBg, {
      backgroundImage: 'linear-gradient(135deg, #002A2E 0%, #003A40 50%, #004D47 100%)',
      ease: 'none',
      scrollTrigger: {
        trigger: heroBg,
        start: 'top top',
        end: 'bottom top',
        scrub: 1,
      }
    });
  }
});
