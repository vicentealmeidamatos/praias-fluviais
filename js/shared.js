// Tailwind configuration — must load after Tailwind CDN script
tailwind.config = {
  theme: {
    extend: {
      colors: {
        'praia': {
          'yellow': {
            50:  '#FFFDE7',
            100: '#FFF9C4',
            200: '#FFF176',
            300: '#FFEE58',
            400: '#FFEB3B',
            500: '#FDD835',
            600: '#F9C916',
            700: '#F5B800',
            800: '#E6A800',
            900: '#C49000',
          },
          'teal': {
            50:  '#E0F7F5',
            100: '#B2EBE3',
            200: '#80DED0',
            300: '#4DD1BC',
            400: '#26C4AB',
            500: '#00897B',
            600: '#006D62',
            700: '#005D56',
            800: '#003A40',
            900: '#002A2E',
          },
          'blue': {
            400: '#4FC3F7',
            500: '#29B6F6',
            600: '#0288D1',
          },
          'green': {
            400: '#81C784',
            500: '#43A047',
            600: '#2E7D32',
          },
          'sand': {
            50:  '#FAF8F5',
            100: '#F5F0E8',
            200: '#E8DFD0',
            300: '#D6CCAD',
            400: '#C4B898',
            500: '#A89A78',
            600: '#8A7D60',
            700: '#6B6048',
            800: '#4A4332',
            900: '#2D2820',
          },
        },
      },
      fontFamily: {
        'display': ['Poppins', 'system-ui', 'sans-serif'],
        'body': ['Open Sans', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        'tightest': '-0.03em',
      },
      lineHeight: {
        'relaxed-plus': '1.7',
      },
    },
  },
};

// ─── Mobile Navigation ───
document.addEventListener('DOMContentLoaded', () => {
  const hamburger = document.getElementById('nav-hamburger');
  const mobileMenu = document.getElementById('mobile-menu');
  const menuOverlay = document.getElementById('menu-overlay');

  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.contains('translate-x-0');
      if (isOpen) {
        mobileMenu.classList.remove('translate-x-0');
        mobileMenu.classList.add('translate-x-full');
        menuOverlay?.classList.add('opacity-0', 'pointer-events-none');
        menuOverlay?.classList.remove('opacity-100');
        document.body.style.overflow = '';
      } else {
        mobileMenu.classList.remove('translate-x-full');
        mobileMenu.classList.add('translate-x-0');
        menuOverlay?.classList.remove('opacity-0', 'pointer-events-none');
        menuOverlay?.classList.add('opacity-100');
        document.body.style.overflow = 'hidden';
      }
    });

    menuOverlay?.addEventListener('click', () => {
      mobileMenu.classList.remove('translate-x-0');
      mobileMenu.classList.add('translate-x-full');
      menuOverlay.classList.add('opacity-0', 'pointer-events-none');
      menuOverlay.classList.remove('opacity-100');
      document.body.style.overflow = '';
    });
  }

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // Sticky header shadow on scroll
  const header = document.getElementById('main-header');
  if (header) {
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          if (window.scrollY > 10) {
            header.classList.add('header-scrolled');
          } else {
            header.classList.remove('header-scrolled');
          }
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  // Scroll reveal animations
  const revealElements = document.querySelectorAll('.reveal-on-scroll');
  if (revealElements.length > 0) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          const delay = entry.target.dataset.revealDelay || (index * 80);
          setTimeout(() => {
            entry.target.classList.add('revealed');
          }, delay);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    revealElements.forEach(el => observer.observe(el));
  }
});

// ─── Utility Functions ───
function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function slugify(text) {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
