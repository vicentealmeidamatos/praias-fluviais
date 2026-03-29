// ─── Magazine Page-Turn Effect ───
// Uses GSAP ScrollTrigger for 3D page-flip animation
// Falls back to crossfade + translateX on mobile

document.addEventListener('DOMContentLoaded', () => {
  gsap.registerPlugin(ScrollTrigger);

  const pages = document.querySelectorAll('.magazine-page');
  const container = document.querySelector('.magazine-container');
  const dots = document.querySelectorAll('.page-dot');
  const progressBar = document.querySelector('.scroll-progress');
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!pages.length || !container) return;

  // Update scroll progress bar
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

  // Activate page dot
  function setActiveDot(index) {
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === index);
    });
  }

  // Click on dots to navigate
  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => {
      const target = pages[i];
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  if (prefersReducedMotion) {
    // No animations, just snap
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

  // ─── 3D Page Turn (Desktop) ───
  if (!isMobile) {
    pages.forEach((page, i) => {
      if (i === 0) {
        // First page — just set it visible
        setActiveDot(0);
        return;
      }

      // Set initial state: page is "closed" (rotated away)
      gsap.set(page, {
        opacity: 0,
        rotateY: 90,
        transformOrigin: 'left center',
        transformPerspective: 1200,
      });

      // Create the page-turn timeline
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: page,
          start: 'top 80%',
          end: 'top 20%',
          scrub: 0.8,
          onEnter: () => setActiveDot(i),
          onEnterBack: () => setActiveDot(i),
          onLeaveBack: () => setActiveDot(Math.max(0, i - 1)),
        }
      });

      // Previous page flips away
      if (pages[i - 1]) {
        tl.to(pages[i - 1], {
          rotateY: -45,
          opacity: 0.3,
          transformOrigin: 'left center',
          transformPerspective: 1200,
          duration: 0.5,
          ease: 'power2.inOut',
        }, 0);
      }

      // Current page flips in
      tl.to(page, {
        rotateY: 0,
        opacity: 1,
        duration: 0.5,
        ease: 'power2.inOut',
      }, 0);
    });

  } else {
    // ─── Mobile: Crossfade + Slide ───
    pages.forEach((page, i) => {
      if (i === 0) {
        setActiveDot(0);
        return;
      }

      gsap.set(page, {
        opacity: 0,
        x: 60,
      });

      gsap.to(page, {
        opacity: 1,
        x: 0,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: page,
          start: 'top 85%',
          end: 'top 35%',
          scrub: 0.5,
          onEnter: () => setActiveDot(i),
          onEnterBack: () => setActiveDot(i),
          onLeaveBack: () => setActiveDot(Math.max(0, i - 1)),
        }
      });
    });
  }
});
