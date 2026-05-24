/** @type {import('tailwindcss').Config} */
// Extraído de js/shared.js (linhas 37-102). Source-of-truth única para Tailwind
// no site web e no build da app Capacitor. Mudanças aqui têm de manter visual
// idêntico ao CDN JIT antigo — usar `npm run build:css` e comparar.
module.exports = {
  content: [
    './*.html',
    './js/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        praia: {
          yellow: {
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
          teal: {
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
          blue: {
            400: '#4FC3F7',
            500: '#29B6F6',
            600: '#0288D1',
          },
          green: {
            400: '#81C784',
            500: '#43A047',
            600: '#2E7D32',
          },
          sand: {
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
        display: ['Poppins', 'system-ui', 'sans-serif'],
        body: ['Open Sans', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        tightest: '-0.03em',
      },
      lineHeight: {
        'relaxed-plus': '1.7',
      },
    },
  },
  // Safelist começa vazia. O scanner Tailwind v3 deteta classes literais em
  // *.html e js/**/*.js. Para classes construídas dinamicamente em innerHTML,
  // adicionar entradas específicas aqui após detecção via regressão visual.
  safelist: [],
};
