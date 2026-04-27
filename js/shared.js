// ─── Scroll to top on every page load ─────────────────────────────────────────
if (!window.location.hash) window.scrollTo(0, 0);
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

// ─── Unified data loader (Supabase-first, JSON fallback) ─────────────────────
// Garante que TODAS as páginas leem os mesmos dados que o admin grava.
window._datasetFiles = {
  beaches: 'data/beaches.json', articles: 'data/articles.json',
  locationsGuia: 'data/locations-guia-passaporte.json',
  locationsCarimbo: 'data/locations-carimbos.json',
  descontos: 'data/descontos.json', products: 'data/products.json',
  settings: 'data/settings.json',
};
window.loadData = function (dataset) {
  var file = window._datasetFiles[dataset];
  return (
    window.DataLoader && window.DataLoader.loadDataset
      ? window.DataLoader.loadDataset(dataset).then(function (d) { return d || null; })
      : file ? fetch(file).then(function (r) { return r.json(); }) : Promise.resolve(null)
  ).catch(function () { return null; });
};

// ─── Global beaches cache (avoids redundant fetches) ─────────────────────────
window._beachesCache = window._beachesCache || null;
window._beachesCachePromise = window._beachesCachePromise || null;
window.getBeaches = function () {
  if (window._beachesCache) return Promise.resolve(window._beachesCache);
  if (!window._beachesCachePromise) {
    window._beachesCachePromise = window.loadData('beaches')
      .then(function (data) { window._beachesCache = data || []; return window._beachesCache; })
      .catch(function () { window._beachesCachePromise = null; return []; });
  }
  return window._beachesCachePromise;
};

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

// ─── Universal Share Sheet ─────────────────────────────────────────────────────
// Game-style share overlay used across all pages.
// Usage: openShareSheet({ type, title, subtitle, url, highlight })
//   type: 'vote' | 'beach' | 'article' (changes card style/text)
//   title: main heading on the card
//   subtitle: secondary line
//   url: link to share
//   highlight: optional platform to auto-open ('facebook','instagram')
window._shareSheetCardConfigs = function(type, title, subtitle, beachType) {
  var year = new Date().getFullYear();
  var tipoBadge = beachType === 'zona_balnear' ? 'ZONA BALNEAR DESCOBERTA' : 'PRAIA FLUVIAL DESCOBERTA';
  var configs = {
    vote: {
      badge: 'VOTO REGISTADO', badgeEmoji: '🏆',
      accentColor: '#FFEB3B', accentRgb: '255,235,59',
      label: 'A minha escolha para Praia do Ano ' + year,
      footer: 'praiasfluviais.pt/votar',
      bgStart: '#003A40', bgMid: '#004D54', bgEnd: '#003A40',
      canvasGradStart: '#002A2E', canvasGradEnd: '#005A62',
    },
    beach: {
      badge: tipoBadge, badgeEmoji: '🌊',
      accentColor: '#FFEB3B', accentRgb: '255,235,59',
      label: subtitle || 'Uma praia fluvial imperdível',
      footer: 'praiasfluviais.pt',
      bgStart: '#003A40', bgMid: '#00555E', bgEnd: '#003A40',
      canvasGradStart: '#002A2E', canvasGradEnd: '#006A72',
    },
    article: {
      badge: 'LEITURA RECOMENDADA', badgeEmoji: '📖',
      accentColor: '#81C784', accentRgb: '67,160,71',
      label: subtitle || 'Artigo do Guia das Praias Fluviais',
      footer: 'praiasfluviais.pt/artigos',
      bgStart: '#1a3a2a', bgMid: '#2d5a3e', bgEnd: '#1a3a2a',
      canvasGradStart: '#0f2a1a', canvasGradEnd: '#3d7a4e',
    },
    generic: {
      badge: 'PRAIAS FLUVIAIS', badgeEmoji: '🌿',
      accentColor: '#FFEB3B', accentRgb: '255,235,59',
      label: subtitle || '',
      footer: 'praiasfluviais.pt',
      bgStart: '#003A40', bgMid: '#004D54', bgEnd: '#003A40',
      canvasGradStart: '#002A2E', canvasGradEnd: '#005A62',
    },
  };
  return configs[type] || configs.generic;
};

window._shareSheetTexts = function(type, title, url, opts) {
  var year = new Date().getFullYear();
  var beachType = (opts && opts.beachType) || 'praia_fluvial';
  var tipoPt = beachType === 'zona_balnear' ? 'zona balnear' : 'praia fluvial';
  var texts = {
    vote: '🗳️ Eu votei na ' + title + ' para Praia Fluvial do Ano ' + year + '! Vota tamb\u00e9m! Que ganhe a melhor praia 🏆',
    beach: '⭐ Acabei de descobrir a ' + title + '! Uma ' + tipoPt + ' incr\u00edvel que tens de conhecer! 💧',
    article: 'Acabei de ler "' + title + '" - vale muito a pena!',
    generic: 'Descubra ' + title + ' no Guia das Praias Fluviais.',
  };
  return (texts[type] || texts.generic) + ' ' + url;
};

// ─── Canvas image generator for Instagram Stories ──────────────────────────────
// Polyfill roundRect for older browsers
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    if (typeof r === 'number') r = [r, r, r, r];
    var tl = r[0] || 0, tr = r[1] || r[0] || 0, br = r[2] || r[0] || 0, bl = r[3] || r[1] || r[0] || 0;
    this.moveTo(x + tl, y);
    this.lineTo(x + w - tr, y); this.quadraticCurveTo(x + w, y, x + w, y + tr);
    this.lineTo(x + w, y + h - br); this.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    this.lineTo(x + bl, y + h); this.quadraticCurveTo(x, y + h, x, y + h - bl);
    this.lineTo(x, y + tl); this.quadraticCurveTo(x, y, x + tl, y);
    this.closePath();
    return this;
  };
}

window._shareSheetGenerateImage = function(opts) {
  var type = opts.type || 'generic';
  var title = opts.title || '';
  var subtitle = opts.subtitle || '';
  var municipality = opts.municipality || '';
  var river = opts.river || '';
  var photoUrl = opts.photo || '';
  var beachType = (opts && opts.beachType) || 'praia_fluvial';
  var card = window._shareSheetCardConfigs(type, title, subtitle, beachType);
  var year = new Date().getFullYear();
  var logoUrl = (window.location.origin || '') + '/brand_assets/logotipo.png';

  // Load images via fetch → blob → objectURL (avoids CORS canvas taint)
  function loadImg(src) {
    return new Promise(function(resolve) {
      if (!src) { resolve(null); return; }
      fetch(src).then(function(r) {
        if (!r.ok) throw new Error('fetch failed');
        return r.blob();
      }).then(function(blob) {
        var blobUrl = URL.createObjectURL(blob);
        var img = new Image();
        img.onload = function() { resolve(img); };
        img.onerror = function() { resolve(null); URL.revokeObjectURL(blobUrl); };
        img.src = blobUrl;
      }).catch(function() {
        // Fallback: try img tag directly (may taint canvas on cross-origin)
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function() { resolve(img); };
        img.onerror = function() { resolve(null); };
        img.src = src;
      });
    });
  }

  // Force-load specific font weights used on the canvas. Just waiting on document.fonts.ready
  // is not enough — Google Fonts only downloads a weight once something actually uses it,
  // and the first canvas render may fire before the glyphs are resolved.
  var fontPreload = (document.fonts && document.fonts.load) ? Promise.all([
    document.fonts.load('800 120px "Poppins"'),
    document.fonts.load('800 72px "Poppins"'),
    document.fonts.load('800 52px "Poppins"'),
    document.fonts.load('800 42px "Poppins"'),
    document.fonts.load('700 26px "Poppins"'),
    document.fonts.load('600 34px "Poppins"'),
    document.fonts.load('400 28px "Open Sans"'),
    document.fonts.load('400 26px "Open Sans"'),
  ]).catch(function(){}) : Promise.resolve();

  return Promise.all([loadImg(photoUrl), loadImg(logoUrl), fontPreload]).then(function(imgs) {
    var photoImg = imgs[0];
    var logoImg = imgs[1];

    var W = 1080, H = 1920;
    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    var cx = W / 2;

    // Helper: word-wrap
    function wrapText(text, maxW, font) {
      ctx.font = font;
      var words = text.split(' '), lines = [], cur = '';
      for (var i = 0; i < words.length; i++) {
        var test = cur ? cur + ' ' + words[i] : words[i];
        if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = words[i]; }
        else cur = test;
      }
      if (cur) lines.push(cur);
      return lines;
    }

    // ══════════════════════════════════════════════════════════════════════
    // BACKGROUND (solid gradient)
    // ══════════════════════════════════════════════════════════════════════
    var bg = ctx.createLinearGradient(0, 0, W * 0.3, H);
    bg.addColorStop(0, '#001A1E');
    bg.addColorStop(0.4, card.bgMid);
    bg.addColorStop(1, '#001A1E');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Ambient glow
    var amb = ctx.createRadialGradient(cx, H * 0.38, 0, cx, H * 0.38, 600);
    amb.addColorStop(0, 'rgba(' + card.accentRgb + ',0.1)');
    amb.addColorStop(1, 'rgba(' + card.accentRgb + ',0)');
    ctx.fillStyle = amb;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // ══════════════════════════════════════════════════════════════════════
    // TOP HEADLINE
    // ══════════════════════════════════════════════════════════════════════
    var topY = 200;
    var excitedLines = type === 'vote' ? ['EU VOTEI!'] : ['ACABEI DE', 'DESCOBRIR!'];

    // Text shadow for readability over photo
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 30;
    ctx.font = '800 120px Poppins, sans-serif';
    ctx.fillStyle = card.accentColor;
    for (var ei = 0; ei < excitedLines.length; ei++) {
      ctx.fillText(excitedLines[ei], cx, topY + ei * 130);
    }
    ctx.restore();

    // Decorative line
    var lineY = topY + excitedLines.length * 130 + 30;
    ctx.beginPath();
    ctx.roundRect(cx - 60, lineY, 120, 6, 3);
    ctx.fillStyle = card.accentColor;
    ctx.fill();

    // ══════════════════════════════════════════════════════════════════════
    // CENTRAL CARD (with photo thumbnail inside, below title)
    // ══════════════════════════════════════════════════════════════════════
    var cardY = lineY + 50;
    var cardX = 60, cardW = W - 120, cardR = 36;
    var tipoPt = beachType === 'zona_balnear' ? 'Zona Balnear' : 'Praia Fluvial';
    var badgeFont = '700 26px Poppins, sans-serif';
    var subtitleFont = '400 30px "Open Sans", sans-serif';
    var titleFont = '800 72px Poppins, sans-serif';
    var footerFont = '400 26px "Open Sans", sans-serif';

    var titleLines = wrapText(title, cardW - 100, titleFont);
    var titleBlockH = titleLines.length * 88;
    var subtitleText = type === 'vote'
      ? 'A minha escolha para ' + tipoPt + ' do Ano ' + year
      : (river || subtitle || '');

    // Photo thumbnail dimensions inside card (small to avoid pixelation)
    var thumbInCardH = 0;
    if (photoImg) {
      var tW = cardW - 160; // smaller, centered
      thumbInCardH = tW / 2.4 + 25; // height + margin
    }

    var pad = 50;
    var municipalityH = ((type === 'beach' || type === 'vote') && municipality) ? 60 : 30;
    var cardH = pad + 52 + 30 + (subtitleText ? 50 : 0) + titleBlockH + 20 + thumbInCardH + 6 + 40 + municipalityH + pad;

    // Card shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 80;
    ctx.shadowOffsetY = 20;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, cardR);
    ctx.fillStyle = 'rgba(0,58,64,0.7)';
    ctx.fill();
    ctx.restore();

    // Card glass bg
    var cardBg = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
    cardBg.addColorStop(0, 'rgba(255,255,255,0.14)');
    cardBg.addColorStop(1, 'rgba(255,255,255,0.05)');
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, cardR);
    ctx.fillStyle = cardBg;
    ctx.fill();

    // Card border
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, cardR);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Badge pill
    var badgeText = card.badge;
    ctx.font = badgeFont;
    var badgeW = ctx.measureText(badgeText).width + 48;
    var badgeH = 52;
    var bx = (W - badgeW) / 2;
    var by = cardY + pad;
    ctx.beginPath();
    ctx.roundRect(bx, by, badgeW, badgeH, badgeH / 2);
    ctx.fillStyle = 'rgba(' + card.accentRgb + ',0.2)';
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(bx, by, badgeW, badgeH, badgeH / 2);
    ctx.strokeStyle = 'rgba(' + card.accentRgb + ',0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = card.accentColor;
    ctx.fillText(badgeText, cx, by + badgeH / 2);

    // Subtitle (river / vote text) — smaller, secondary
    var contentY = by + badgeH + 30;
    if (subtitleText) {
      ctx.font = '400 28px "Open Sans", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText(subtitleText, cx, contentY + 15);
      contentY += 50;
    }

    // Title
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 10;
    ctx.font = titleFont;
    ctx.fillStyle = '#FFFFFF';
    for (var ti = 0; ti < titleLines.length; ti++) {
      ctx.fillText(titleLines[ti], cx, contentY + 40 + ti * 88);
    }
    ctx.restore();
    contentY += titleBlockH + 20;

    // Photo thumbnail inside card (below title, smaller to stay sharp)
    if (photoImg) {
      var tW = cardW - 160;
      var tH = tW / 2.4;
      var tX = cardX + 80; // centered
      var tY = contentY;
      var tR = 18;

      // Clip and draw photo
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(tX, tY, tW, tH, tR);
      ctx.clip();
      var piw = photoImg.naturalWidth, pih = photoImg.naturalHeight;
      var pscale = Math.max(tW / piw, tH / pih);
      var psw = piw * pscale, psh = pih * pscale;
      ctx.drawImage(photoImg, tX + (tW - psw) / 2, tY + (tH - psh) / 2, psw, psh);
      ctx.restore();

      // Photo border
      ctx.beginPath();
      ctx.roundRect(tX, tY, tW, tH, tR);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 2;
      ctx.stroke();

      contentY += tH + 30;
    }

    // Accent bar
    ctx.beginPath();
    ctx.roundRect(cx - 40, contentY, 80, 6, 3);
    ctx.fillStyle = card.accentColor;
    ctx.fill();
    contentY += 40;

    // Footer: municipality for beach/vote types (big & bold), URL for others
    var showMunicipality = (type === 'beach' || type === 'vote') && municipality;
    var footerText = showMunicipality ? municipality : card.footer;
    var footerColor = showMunicipality ? '#FFFFFF' : 'rgba(255,255,255,0.4)';
    var footerFontStyle = showMunicipality ? '800 42px Poppins, sans-serif' : footerFont;
    ctx.font = footerFontStyle;
    ctx.fillStyle = footerColor;
    ctx.fillText(footerText, cx, contentY + 10);

    // ══════════════════════════════════════════════════════════════════════
    // CTA BELOW CARD
    // ══════════════════════════════════════════════════════════════════════
    var ctaY = cardY + cardH + 70;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 16;
    ctx.font = '800 52px Poppins, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(type === 'vote' ? 'Vota também!' : 'Tens de conhecer!', cx, ctaY);
    ctx.restore();

    ctx.font = '600 34px Poppins, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(type === 'vote' ? 'praiasfluviais.pt/votar' : 'praiasfluviais.pt', cx, ctaY + 60);

    // ══════════════════════════════════════════════════════════════════════
    // BOTTOM: LOGO
    // ══════════════════════════════════════════════════════════════════════
    if (logoImg) {
      var logoMaxW = 480;
      var logoRatio = logoImg.naturalWidth / logoImg.naturalHeight;
      var logoDrawW = Math.min(logoMaxW, logoImg.naturalWidth);
      var logoDrawH = logoDrawW / logoRatio;
      var logoX = (W - logoDrawW) / 2;
      var logoY = H - 100 - logoDrawH;
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.drawImage(logoImg, logoX, logoY, logoDrawW, logoDrawH);
      ctx.restore();
    } else {
      // Text fallback if logo fails to load
      ctx.font = '600 30px Poppins, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillText('Guia das Praias Fluviais', cx, H - 140);
    }

    // Decorative dots (top corners)
    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.fillStyle = card.accentColor;
    for (var dx = 0; dx < 5; dx++) {
      for (var dy = 0; dy < 5; dy++) {
        ctx.beginPath();
        ctx.arc(80 + dx * 24, 80 + dy * 24, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(W - 80 - dx * 24, 80 + dy * 24, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    return new Promise(function(resolve) {
      canvas.toBlob(function(blob) { resolve(blob); }, 'image/png');
    });
  });
};

window.openShareSheet = function(opts) {
  var type = (opts && opts.type) || 'generic';
  var title = (opts && opts.title) || '';
  var subtitle = (opts && opts.subtitle) || '';
  var url = (opts && opts.url) || window.location.href;
  var highlight = (opts && opts.highlight) || null;

  var beachType = (opts && opts.beachType) || 'praia_fluvial';
  var card = window._shareSheetCardConfigs(type, title, subtitle, beachType);
  var fullText = window._shareSheetTexts(type, title, url, opts);

  var encodedUrl = encodeURIComponent(url);
  var encodedText = encodeURIComponent(fullText);

  // If highlight is a specific platform, open it directly
  if (highlight === 'facebook') {
    _shareSheetFacebook(opts, fullText, url);
    return;
  }
  if (highlight === 'instagram') {
    _shareSheetInstagram(opts);
    return;
  }

  // Remove existing overlay
  document.getElementById('share-sheet-overlay')?.remove();

  var overlay = document.createElement('div');
  overlay.id = 'share-sheet-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity 0.25s ease;';

  overlay.innerHTML = '<div id="share-sheet-inner" style="background:#FAF8F5;border-radius:24px;max-width:380px;width:100%;padding:0;box-shadow:0 24px 80px rgba(0,0,0,0.35),0 8px 24px rgba(0,0,0,0.15);transform:scale(0.9) translateY(20px);opacity:0;transition:transform 0.4s cubic-bezier(0.34,1.56,0.64,1),opacity 0.25s ease;overflow:hidden;">'
    // Platforms
    + '<div style="padding:24px 24px 8px;">'
    + '<p style="font-family:\'Poppins\',sans-serif;font-size:12px;font-weight:700;color:#003A40;margin:0 0 14px;text-align:center;text-transform:uppercase;letter-spacing:1px;">Partilhar em</p>'
    + '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:16px;">'
    // Facebook
    + '<button id="share-sheet-fb-btn" style="display:flex;flex-direction:column;align-items:center;gap:6px;background:none;border:none;cursor:pointer;padding:0;">'
    + '<div style="width:50px;height:50px;border-radius:16px;background:#1877F2;display:flex;align-items:center;justify-content:center;transition:transform 0.2s cubic-bezier(0.34,1.56,0.64,1),box-shadow 0.2s;" onmouseover="this.style.transform=\'scale(1.1)\';this.style.boxShadow=\'0 4px 16px rgba(24,119,242,0.4)\'" onmouseout="this.style.transform=\'scale(1)\';this.style.boxShadow=\'none\'">'
    + '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>'
    + '</div><span style="font-family:\'Poppins\',sans-serif;font-size:9px;font-weight:600;color:#003A40;">Facebook</span></button>'
    // X
    + '<button id="share-sheet-x-btn" style="display:flex;flex-direction:column;align-items:center;gap:6px;background:none;border:none;cursor:pointer;padding:0;">'
    + '<div style="width:50px;height:50px;border-radius:16px;background:#000;display:flex;align-items:center;justify-content:center;transition:transform 0.2s cubic-bezier(0.34,1.56,0.64,1),box-shadow 0.2s;" onmouseover="this.style.transform=\'scale(1.1)\';this.style.boxShadow=\'0 4px 16px rgba(0,0,0,0.3)\'" onmouseout="this.style.transform=\'scale(1)\';this.style.boxShadow=\'none\'">'
    + '<svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>'
    + '</div><span style="font-family:\'Poppins\',sans-serif;font-size:9px;font-weight:600;color:#003A40;">X</span></button>'
    // WhatsApp
    + '<a href="whatsapp://send?text=' + encodedText + '" style="display:flex;flex-direction:column;align-items:center;gap:6px;text-decoration:none;">'
    + '<div style="width:50px;height:50px;border-radius:16px;background:#25D366;display:flex;align-items:center;justify-content:center;transition:transform 0.2s cubic-bezier(0.34,1.56,0.64,1),box-shadow 0.2s;" onmouseover="this.style.transform=\'scale(1.1)\';this.style.boxShadow=\'0 4px 16px rgba(37,211,102,0.4)\'" onmouseout="this.style.transform=\'scale(1)\';this.style.boxShadow=\'none\'">'
    + '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>'
    + '</div><span style="font-family:\'Poppins\',sans-serif;font-size:9px;font-weight:600;color:#003A40;">WhatsApp</span></a>'
    // Instagram
    + '<button id="share-sheet-ig-btn" style="display:flex;flex-direction:column;align-items:center;gap:6px;background:none;border:none;cursor:pointer;padding:0;">'
    + '<div style="width:50px;height:50px;border-radius:16px;background:linear-gradient(135deg,#f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%);display:flex;align-items:center;justify-content:center;transition:transform 0.2s cubic-bezier(0.34,1.56,0.64,1),box-shadow 0.2s;" onmouseover="this.style.transform=\'scale(1.1)\';this.style.boxShadow=\'0 4px 16px rgba(220,39,67,0.4)\'" onmouseout="this.style.transform=\'scale(1)\';this.style.boxShadow=\'none\'">'
    + '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>'
    + '</div><span style="font-family:\'Poppins\',sans-serif;font-size:9px;font-weight:600;color:#003A40;">Instagram</span></button>'
    // Copy
    + '<button onclick="_shareSheetCopy()" style="display:flex;flex-direction:column;align-items:center;gap:6px;background:none;border:none;cursor:pointer;padding:0;" id="share-sheet-copy-btn">'
    + '<div style="width:50px;height:50px;border-radius:16px;background:linear-gradient(135deg,#003A40,#005A62);display:flex;align-items:center;justify-content:center;transition:transform 0.2s cubic-bezier(0.34,1.56,0.64,1),box-shadow 0.2s;" onmouseover="this.style.transform=\'scale(1.1)\';this.style.boxShadow=\'0 4px 16px rgba(0,58,64,0.4)\'" onmouseout="this.style.transform=\'scale(1)\';this.style.boxShadow=\'none\'">'
    + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFEB3B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
    + '</div><span style="font-family:\'Poppins\',sans-serif;font-size:9px;font-weight:600;color:#003A40;">Copiar</span></button>'
    + '</div></div>'
    // Close
    + '<div style="padding:0 24px 20px;">'
    + '<button onclick="document.getElementById(\'share-sheet-overlay\').remove()" style="width:100%;padding:12px;border:none;background:#f0ede8;border-radius:14px;font-family:\'Poppins\',sans-serif;font-size:13px;font-weight:600;color:#003A40;cursor:pointer;transition:background 0.2s;" onmouseover="this.style.background=\'#e6e2dc\'" onmouseout="this.style.background=\'#f0ede8\'">Fechar</button>'
    + '</div></div>';

  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

  // Store for copy button
  window._shareSheetFullText = fullText;

  // Bind platform buttons via JS
  var igBtn = document.getElementById('share-sheet-ig-btn');
  if (igBtn) igBtn.addEventListener('click', function() { window._shareSheetInstagram(opts); });

  var fbBtn = document.getElementById('share-sheet-fb-btn');
  if (fbBtn) fbBtn.addEventListener('click', function() { window._shareSheetFacebook(opts, fullText, url); });

  var xBtn = document.getElementById('share-sheet-x-btn');
  if (xBtn) xBtn.addEventListener('click', function() { window._shareSheetX(fullText); });

  // Animate in
  requestAnimationFrame(function() {
    overlay.style.opacity = '1';
    var inner = document.getElementById('share-sheet-inner');
    if (inner) { inner.style.transform = 'scale(1) translateY(0)'; inner.style.opacity = '1'; }
  });
};

// ─── Instagram: generate story image + open IG Stories ──────────────────────────
window._shareSheetInstagram = function(opts) {
  if (!opts) return;

  // Close the share sheet overlay
  var sheetOverlay = document.getElementById('share-sheet-overlay');
  if (sheetOverlay) sheetOverlay.remove();

  _shareSheetToast('A gerar a sua Story...');

  window._shareSheetGenerateImage(opts).then(function(blob) {
    var toast = document.getElementById('share-sheet-toast');
    if (toast) toast.remove();

    var file = new File([blob], 'partilha-praias-fluviais.png', { type: 'image/png' });
    var isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    // Mobile: native share (shows Instagram Stories as option)
    if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({
        files: [file],
        title: 'Praias Fluviais',
        text: window._shareSheetTexts(opts.type, opts.title, opts.url || window.location.href, opts),
      }).catch(function() {
        // Fallback if share cancelled — download + open IG
        _shareSheetDownloadAndOpenIG(blob);
      });
      return;
    }

    // Desktop: download image then open Instagram Stories
    _shareSheetDownloadAndOpenIG(blob);

  }).catch(function() {
    var toast = document.getElementById('share-sheet-toast');
    if (toast) toast.remove();
    _shareSheetToast('Erro ao gerar imagem. Tente novamente.');
  });
};

window._shareSheetDownloadAndOpenIG = function(blob) {
  // Trigger download
  var blobUrl = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = blobUrl;
  a.download = 'partilha-praias-fluviais.png';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  setTimeout(function() {
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  }, 2000);

  setTimeout(function() {
    var isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) window.location.href = 'instagram://library';
    _shareSheetPlatformModal({
      icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
      iconBg: 'linear-gradient(135deg,#f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)',
      title: 'Imagem guardada!',
      text: 'Abra o Instagram e crie uma publica\u00e7\u00e3o com ela.',
    });
  }, 500);
};

// ─── Facebook: generate image + download + open FB create post ───────────────
window._shareSheetFacebook = function(opts, fullText, url) {
  // Close share sheet
  var sheetOverlay = document.getElementById('share-sheet-overlay');
  if (sheetOverlay) sheetOverlay.remove();

  _shareSheetToast('A gerar imagem...');

  window._shareSheetGenerateImage(opts).then(function(blob) {
    var toast = document.getElementById('share-sheet-toast');
    if (toast) toast.remove();

    // Download image
    var blobUrl = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = blobUrl;
    a.download = 'partilha-praias-fluviais.png';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(blobUrl); }, 2000);

    // Copy text to clipboard for easy paste
    _shareSheetCopyText(fullText);

    // Open Facebook create post
    setTimeout(function() {
      window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url) + '&quote=' + encodeURIComponent(fullText), '_blank');

      // Show confirmation modal
      _shareSheetPlatformModal({
        icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>',
        iconBg: '#1877F2',
        title: 'Imagem guardada!',
        text: 'A imagem foi guardada e o texto copiado. Cole a imagem na sua publica\u00e7\u00e3o do Facebook.',
      });
    }, 400);

  }).catch(function() {
    var toast = document.getElementById('share-sheet-toast');
    if (toast) toast.remove();
    // Fallback: just open sharer
    window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url) + '&quote=' + encodeURIComponent(fullText), '_blank');
  });
};

// ─── X (Twitter): open tweet compose with text + copy text ───────────────────
window._shareSheetX = function(fullText) {
  var sheetOverlay = document.getElementById('share-sheet-overlay');
  if (sheetOverlay) sheetOverlay.remove();

  // Copy text to clipboard
  _shareSheetCopyText(fullText);

  // Open tweet compose
  window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(fullText), '_blank');

  // Show confirmation
  _shareSheetPlatformModal({
    icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
    iconBg: '#000000',
    title: 'Texto copiado!',
    text: 'O texto foi copiado e o X aberto. Cole o texto no seu post.',
  });
};

// ─── Generic platform confirmation modal ─────────────────────────────────────
window._shareSheetPlatformModal = function(cfg) {
  document.getElementById('ig-confirm-modal')?.remove();
  var modal = document.createElement('div');
  modal.id = 'ig-confirm-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.8);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:24px;opacity:0;transition:opacity 0.3s ease;';
  modal.innerHTML = ''
    + '<div style="background:#FAF8F5;border-radius:24px;max-width:360px;width:100%;padding:40px 28px;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,0.4);transform:scale(0.9);transition:transform 0.4s cubic-bezier(0.34,1.56,0.64,1);" id="ig-confirm-inner">'
    + '<div style="width:64px;height:64px;border-radius:50%;background:' + cfg.iconBg + ';display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">'
    + cfg.icon
    + '</div>'
    + '<h3 style="font-family:\'Poppins\',sans-serif;font-size:20px;font-weight:800;color:#003A40;margin:0 0 10px;line-height:1.3;">' + cfg.title + '</h3>'
    + '<p style="font-family:\'Open Sans\',sans-serif;font-size:14px;color:#5a6b6e;margin:0 0 24px;line-height:1.5;">' + cfg.text + '</p>'
    + '<button onclick="document.getElementById(\'ig-confirm-modal\').remove()" style="width:100%;padding:14px;border:none;background:#003A40;color:#FFEB3B;font-family:\'Poppins\',sans-serif;font-size:14px;font-weight:700;border-radius:14px;cursor:pointer;transition:transform 0.2s,box-shadow 0.2s;" onmouseover="this.style.transform=\'scale(1.02)\';this.style.boxShadow=\'0 8px 24px rgba(0,58,64,0.3)\'" onmouseout="this.style.transform=\'scale(1)\';this.style.boxShadow=\'none\'">Entendido</button>'
    + '</div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  requestAnimationFrame(function() {
    modal.style.opacity = '1';
    var inner = document.getElementById('ig-confirm-inner');
    if (inner) inner.style.transform = 'scale(1)';
  });
};

window._shareSheetCopyText = function(text) {
  try { navigator.clipboard.writeText(text); } catch(e) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
};

window._shareSheetCopy = function() {
  _shareSheetCopyText(window._shareSheetFullText || '');
  var btn = document.getElementById('share-sheet-copy-btn');
  if (btn) {
    var label = btn.querySelector('span');
    var icon = btn.querySelector('div');
    if (label) { label.textContent = 'Copiado!'; label.style.color = '#43A047'; }
    if (icon) { icon.style.background = 'linear-gradient(135deg,#43A047,#66BB6A)'; }
    setTimeout(function() {
      if (label) { label.textContent = 'Copiar'; label.style.color = '#003A40'; }
      if (icon) { icon.style.background = 'linear-gradient(135deg,#003A40,#005A62)'; }
    }, 2000);
  }
};

window._shareSheetToast = function(msg) {
  var existing = document.getElementById('share-sheet-toast');
  if (existing) existing.remove();
  var t = document.createElement('div');
  t.id = 'share-sheet-toast';
  t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;background:#003A40;color:#FFEB3B;font-family:\'Poppins\',sans-serif;font-size:13px;font-weight:600;padding:12px 24px;border-radius:12px;box-shadow:0 8px 32px rgba(0,58,64,0.4);max-width:90vw;text-align:center;';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function() { t.remove(); }, 3500);
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

// ─── Cart Badge (global) ─────────────────────────────────────────────────────
// Lê o total de itens do carrinho do Supabase e atualiza os badges no header.
// Chamado por auth.js após confirmar sessão, ou por qualquer página que queira o badge.
async function initCartBadge() {
  try {
    // _sb é inicializado em auth.js antes desta função ser chamada
    if (typeof _sb === 'undefined' || typeof authGetUser === 'undefined') return;

    const user = await authGetUser();
    if (!user) { _updateCartBadge(0); return; }

    const { data } = await _sb
      .from('cart_items')
      .select('quantity')
      .eq('user_id', user.id);

    const total = data ? data.reduce((sum, item) => sum + item.quantity, 0) : 0;
    _updateCartBadge(total);
  } catch { /* silencioso */ }
}

function _updateCartBadge(count) {
  ['cart-badge', 'mobile-cart-badge'].forEach(id => {
    const badge = document.getElementById(id);
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  });
}

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

// ─── Mobile App Experience ───────────────────────────────────────────────────
// Injeta meta-tags PWA, bottom-nav unificada, back-button em páginas de detalhe,
// e robustez no menu lateral. Segue a regra: markup mínimo nas páginas HTML;
// tudo o que é "shell" mobile é renderizado aqui.

(function () {
  // Páginas onde a bottom-nav não deve aparecer (ex.: admin, carimbar)
  var NO_BOTTOM_NAV = ['admin.html', 'carimbar.html'];

  // Mapa: página → item ativo na bottom-nav
  var ACTIVE_MAP = {
    'index.html': '',
    '': '',
    '/': '',
    'rede.html': 'rede',
    'passaporte.html': 'passaporte',
    'loja.html': 'loja',
    'carrinho.html': 'loja',
    'produto.html': 'loja',
    'confirmacao-pedido.html': 'loja',
    'perfil.html': 'auth',
    'auth.html': 'auth',
  };

  // Mapa: páginas de detalhe → destino do back-button
  var DETAIL_BACK = {
    'praia.html': 'rede.html',
    'artigo.html': 'artigos.html',
    'produto.html': 'loja.html',
    'confirmacao-pedido.html': 'index.html',
  };

  function currentPage() {
    var path = window.location.pathname.split('/').pop();
    return path || 'index.html';
  }

  // ─── 1. PWA meta tags + favicons ──────────────────────────────────────────
  function injectPwaMeta() {
    var head = document.head;
    if (!head) return;

    var v = '?v=3';
    var tags = [
      { tag: 'link', attrs: { rel: 'manifest', href: '/manifest.json' } },
      { tag: 'meta', attrs: { name: 'theme-color', content: '#003A40' } },
      { tag: 'meta', attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' } },
      { tag: 'meta', attrs: { name: 'mobile-web-app-capable', content: 'yes' } },
      { tag: 'meta', attrs: { name: 'apple-mobile-web-app-title', content: 'Praias Fluviais' } },
      { tag: 'meta', attrs: { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' } },
      { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/brand_assets/apple-touch-icon.png' + v } },
      { tag: 'link', attrs: { rel: 'icon', type: 'image/png', sizes: '64x64', href: '/brand_assets/favicon-64.png' + v } },
      { tag: 'link', attrs: { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/brand_assets/favicon-32.png' + v } },
      { tag: 'link', attrs: { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/brand_assets/favicon-16.png' + v } },
    ];

    tags.forEach(function (t) {
      var selectorAttr = t.attrs.rel ? 'rel' : 'name';
      var selectorVal = t.attrs[selectorAttr];
      var selector = t.tag + '[' + selectorAttr + '="' + selectorVal + '"]';
      if (t.attrs.sizes) selector += '[sizes="' + t.attrs.sizes + '"]';
      if (document.querySelector(selector)) return;
      var el = document.createElement(t.tag);
      Object.keys(t.attrs).forEach(function (k) { el.setAttribute(k, t.attrs[k]); });
      head.appendChild(el);
    });

    // Viewport: só garantir viewport-fit=cover em PWA standalone.
    // Em browser, viewport-fit=cover faz env(safe-area-inset-bottom) reportar
    // a altura da toolbar do Safari, criando faixa teal "vazia" debaixo da
    // bottom-nav. Sem viewport-fit=cover, env() = 0 no browser (comportamento
    // pretendido).
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
      var vp = document.querySelector('meta[name="viewport"]');
      if (vp) {
        var content = vp.getAttribute('content') || '';
        if (content.indexOf('viewport-fit') === -1) {
          vp.setAttribute('content', content.replace(/\s*$/, '') + ', viewport-fit=cover');
        }
      }
    }
  }

  // ─── 2. Bottom-nav unificada ──────────────────────────────────────────────
  function bottomNavHTML(activeKey, cartCount) {
    function item(key, href, icon, label) {
      var activeClass = key === activeKey ? 'active' : '';
      var colorClass = key === activeKey ? 'text-praia-yellow-400' : 'text-white/60';
      return (
        '<a href="' + href + '" data-page="' + key + '" class="flex-1 flex flex-col items-center justify-center ' + colorClass + ' ' + activeClass + '" aria-label="' + label + '">' +
          '<i data-lucide="' + icon + '"></i>' +
          '<span class="font-display uppercase tracking-wider font-semibold">' + label + '</span>' +
        '</a>'
      );
    }

    var lojaBadge = cartCount > 0
      ? '<span id="bottom-nav-cart-count" class="absolute top-1 right-4 bg-praia-yellow-400 text-praia-teal-800 text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">' + (cartCount > 99 ? '99+' : cartCount) + '</span>'
      : '';

    // Slot de Auth (Entrar quando deslogado, Perfil + avatar quando logado).
    // O default é "Entrar" — auth.js (initBottomNavProfile) sobrescreve para
    // Perfil quando há sessão.
    var authActive = activeKey === 'auth';
    var authColor = authActive ? 'text-praia-yellow-400 active' : 'text-white/60';
    var authItem =
      '<a href="auth.html" data-page="auth" id="bottom-nav-auth" class="flex-1 flex flex-col items-center justify-center ' + authColor + '" aria-label="Entrar">' +
        '<i data-lucide="log-in"></i>' +
        '<span class="font-display uppercase tracking-wider font-semibold">Entrar</span>' +
      '</a>';

    return (
      '<div class="bottom-nav-inner flex items-stretch relative">' +
        item('rede', 'rede.html', 'map-pinned', 'Rede') +
        item('passaporte', 'passaporte.html', 'stamp', 'Passaporte') +
        '<a href="loja.html" data-page="loja" class="flex-1 flex flex-col items-center justify-center ' + (activeKey === 'loja' ? 'text-praia-yellow-400 active' : 'text-white/60') + ' relative" aria-label="Loja">' +
          '<i data-lucide="shopping-bag"></i>' +
          '<span class="font-display uppercase tracking-wider font-semibold">Loja</span>' +
          lojaBadge +
        '</a>' +
        authItem +
        '<button type="button" id="bottom-nav-more-btn" data-page="mais" class="flex-1 flex flex-col items-center justify-center text-white/60" aria-label="Mais opções" aria-haspopup="dialog">' +
          '<i data-lucide="menu"></i>' +
          '<span class="font-display uppercase tracking-wider font-semibold">Mais</span>' +
        '</button>' +
      '</div>'
    );
  }

  // Marker para o item de conta — atualizado dinamicamente conforme auth state
  function accountLinkHTML(isLoggedIn) {
    if (isLoggedIn) {
      return (
        '<a href="perfil.html" data-account-item="1">' +
          '<i data-lucide="user"></i>' +
          '<span>A minha conta</span>' +
        '</a>'
      );
    }
    return (
      '<a href="auth.html" data-account-item="1">' +
        '<i data-lucide="log-in"></i>' +
        '<span>Iniciar sessão</span>' +
      '</a>'
    );
  }

  function moreSheetHTML() {
    var links = [
      { href: 'index.html', icon: 'home', label: 'Início' },
      { href: 'votar.html', icon: 'vote', label: 'Votar Praia do Ano' },
      { href: 'artigos.html', icon: 'newspaper', label: 'Novidades' },
      { href: 'onde-encontrar.html', icon: 'book-open', label: 'Onde Encontrar o Guia' },
      { href: 'onde-carimbar-passaporte.html', icon: 'stamp', label: 'Onde Carimbar' },
      { href: 'descontos.html', icon: 'tag', label: 'Descontos' },
      { href: 'carrinho.html', icon: 'shopping-cart', label: 'Carrinho' },
      { href: 'contactos.html', icon: 'mail', label: 'Contactos' },
    ];
    var items = links.map(function (l) {
      return (
        '<a href="' + l.href + '">' +
          '<i data-lucide="' + l.icon + '"></i>' +
          '<span>' + l.label + '</span>' +
        '</a>'
      );
    }).join('');
    // Conta dedicada agora vive na bolinha de perfil da bottom-nav. Não duplicamos aqui.
    return (
      '<div class="more-sheet-handle"></div>' +
      '<p class="font-display text-[11px] uppercase tracking-wider text-white/50 px-2 mb-2">Mais opções</p>' +
      '<div class="grid gap-1" id="more-sheet-items">' + items + '</div>'
    );
  }

  // No-op: a conta vive agora na bolinha de perfil; este hook é mantido para retrocompatibilidade
  function updateMoreSheetAuth() { /* deprecated */ }

  function renderSiteBottomNav() {
    var page = currentPage();
    if (NO_BOTTOM_NAV.indexOf(page) !== -1) return;

    // Remover bottom-navs inline existentes para evitar duplicação
    document.querySelectorAll('nav.bottom-nav').forEach(function (n) { n.remove(); });

    var activeKey = ACTIVE_MAP[page] !== undefined ? ACTIVE_MAP[page] : '';

    var nav = document.createElement('nav');
    nav.className = 'bottom-nav lg:hidden bg-praia-teal-800/95 backdrop-blur-md border-t border-white/10';
    nav.setAttribute('aria-label', 'Navegação principal');
    nav.innerHTML = bottomNavHTML(activeKey, 0);
    document.body.appendChild(nav);

    document.body.classList.add('has-bottom-nav');

    // Anchor da bottom-nav ao bottom da visual viewport. Em iOS Safari, quando
    // a barra de URL encolhe ao fazer scroll, o layout viewport mantém-se mas
    // o visual viewport fica MAIOR. Isso pode deixar a nav (fixed bottom: 0)
    // ancorada num "bottom" antigo e a flutuar a meio do ecrã com um vão por
    // baixo. Aqui calculamos a diferença e ajustamos `bottom` em tempo real.
    if (window.visualViewport) {
      var vv = window.visualViewport;
      var raf = 0;
      function syncNavBottom() {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function () {
          // Posição vertical do bottom da visual viewport relativa ao top do
          // layout viewport. Se for INFERIOR a layoutH, há área visível abaixo
          // dela (URL bar a desaparecer): subimos a nav por essa diferença.
          var layoutH = document.documentElement.clientHeight || window.innerHeight;
          var visualBottom = vv.height + vv.offsetTop;
          var gap = Math.max(0, layoutH - visualBottom);
          // Limitar para evitar saltos exagerados se algo estiver corrompido
          if (gap > layoutH * 0.5) gap = 0;
          if (gap > 0) {
            nav.style.setProperty('bottom', gap + 'px', 'important');
          } else {
            nav.style.removeProperty('bottom');
          }
        });
      }
      vv.addEventListener('resize', syncNavBottom);
      vv.addEventListener('scroll', syncNavBottom);
      window.addEventListener('orientationchange', syncNavBottom);
      // Sync inicial após próximo paint
      requestAnimationFrame(syncNavBottom);
    }

    // "Mais" sheet
    var backdrop = document.createElement('div');
    backdrop.className = 'more-sheet-backdrop';
    document.body.appendChild(backdrop);

    var sheet = document.createElement('div');
    sheet.className = 'more-sheet lg:hidden';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', 'Mais opções');
    sheet.innerHTML = moreSheetHTML();
    document.body.appendChild(sheet);

    function openSheet() {
      // Atualizar item de conta antes de mostrar (pode ter mudado entretanto)
      updateMoreSheetAuth();
      // Retirar foco de qualquer elemento para evitar :focus persistente em iOS
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
      backdrop.classList.add('open');
      sheet.classList.add('open');
      sheet.scrollTop = 0;
      document.body.style.overflow = 'hidden';
    }
    function closeSheet() {
      backdrop.classList.remove('open');
      sheet.classList.remove('open');
      document.body.style.overflow = '';
    }
    var moreBtn = document.getElementById('bottom-nav-more-btn');
    if (moreBtn) moreBtn.addEventListener('click', openSheet);
    backdrop.addEventListener('click', closeSheet);
    // Fechar ao clicar num link do sheet (para o link navegar sem deixar o sheet aberto)
    sheet.addEventListener('click', function (e) {
      var a = e.target.closest('a[href]');
      if (a) closeSheet();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && sheet.classList.contains('open')) closeSheet();
    });

    // Bolinha de perfil — assim que AuthUtils estiver disponível
    function pollProfileInit(retries) {
      if (window.AuthUtils && typeof window.AuthUtils.initBottomNavProfile === 'function') {
        window.AuthUtils.initBottomNavProfile();
      } else if (retries > 0) {
        setTimeout(function () { pollProfileInit(retries - 1); }, 200);
      }
    }
    pollProfileInit(20);

    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  // ─── 3. Back-button em páginas de detalhe ─────────────────────────────────
  function renderBackButton() {
    var page = currentPage();
    var explicit = document.body.getAttribute('data-back-to');
    var back = explicit || DETAIL_BACK[page];
    if (!back) return;

    var header = document.getElementById('main-header');
    if (!header) return;
    var inner = header.querySelector('.max-w-\\[1440px\\], .max-w-\\[1440px\\].mx-auto, div.max-w-\\[1440px\\]') || header.querySelector('div');
    if (!inner) return;
    var flexRow = inner.querySelector('.flex.items-center') || inner.firstElementChild;
    if (!flexRow) return;
    if (flexRow.querySelector('.site-back-btn')) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'site-back-btn lg:hidden mr-2 flex-shrink-0';
    btn.setAttribute('aria-label', 'Voltar');
    btn.innerHTML = '<i data-lucide="chevron-left" class="w-5 h-5"></i>';
    btn.addEventListener('click', function () {
      if (document.referrer && document.referrer.indexOf(location.host) !== -1) {
        history.back();
      } else {
        window.location.href = back;
      }
    });
    flexRow.insertBefore(btn, flexRow.firstChild);
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  // ─── 4. Robustez do menu lateral ──────────────────────────────────────────
  // Garante: abrir/fechar fiável (open binding global em vez de cada página
  // ligar à mão), tecla Esc fecha, click num link fecha, e substituição do
  // logo no header do drawer por um botão "Início" (já que o logo aparece
  // no header principal, evitamos duplicação).
  function hardenSideMenu() {
    var menu = document.getElementById('mobile-menu');
    if (!menu) return;
    var overlay = document.getElementById('menu-overlay');

    function open() {
      // Fechar overlay/sheet de Mais se estiver aberto
      var moreSheet = document.querySelector('.more-sheet.open');
      if (moreSheet) moreSheet.classList.remove('open');
      var moreBackdrop = document.querySelector('.more-sheet-backdrop.open');
      if (moreBackdrop) moreBackdrop.classList.remove('open');

      menu.classList.remove('translate-x-full');
      menu.classList.add('translate-x-0');
      if (overlay) {
        overlay.classList.remove('opacity-0', 'pointer-events-none');
        overlay.classList.add('opacity-100');
      }
      document.body.style.overflow = 'hidden';
    }
    function close() {
      menu.classList.remove('translate-x-0');
      menu.classList.add('translate-x-full');
      if (overlay) {
        overlay.classList.add('opacity-0', 'pointer-events-none');
        overlay.classList.remove('opacity-100');
      }
      document.body.style.overflow = '';
    }

    // Substituir conteúdo do header do drawer: ícones sociais (FB+IG) + close X.
    // O selector é defensivo: encontra o primeiro div header do drawer.
    var drawerHeader = menu.firstElementChild;
    if (drawerHeader && !drawerHeader.dataset.replaced) {
      drawerHeader.dataset.replaced = '1';
      drawerHeader.className = 'flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0';
      drawerHeader.innerHTML =
        '<div class="flex items-center gap-2">' +
          '<a href="https://www.facebook.com/praiasfluviais" target="_blank" rel="noopener noreferrer" class="w-10 h-10 rounded-full bg-white/8 flex items-center justify-center text-white/75 hover:bg-praia-yellow-400 hover:text-praia-teal-800 transition-colors" aria-label="Facebook">' +
            '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>' +
          '</a>' +
          '<a href="https://www.instagram.com/guiadaspraiasfluviais" target="_blank" rel="noopener noreferrer" class="w-10 h-10 rounded-full bg-white/8 flex items-center justify-center text-white/75 hover:bg-praia-yellow-400 hover:text-praia-teal-800 transition-colors" aria-label="Instagram">' +
            '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>' +
          '</a>' +
        '</div>' +
        '<button type="button" class="text-white/70 hover:text-white p-1" aria-label="Fechar menu"><i data-lucide="x" class="w-6 h-6"></i></button>';
    }

    // Mover #mobile-auth-slot para imediatamente após o header (topo do menu)
    var authSlot = document.getElementById('mobile-auth-slot');
    if (authSlot && drawerHeader && authSlot.parentElement !== menu) {
      drawerHeader.insertAdjacentElement('afterend', authSlot);
    }

    // Reorganizar lista de páginas: prepender Início; mover Carrinho do
    // footer para a lista (antes de Contactos) — assim o carrinho deixa de
    // ter destaque dedicado e fica como mais um link.
    var navList = menu.querySelector('div.flex-1');
    if (navList && !navList.dataset.augmented) {
      navList.dataset.augmented = '1';
      var page = currentPage();

      // Helper: cria um <a> com o estilo dos restantes itens
      function buildNavLink(href, icon, label, isActive) {
        var classes = 'flex items-center gap-3 px-6 py-3.5 font-display font-semibold text-sm uppercase tracking-wider' +
          (isActive ? ' text-praia-yellow-400' : ' text-white/80 hover:text-white');
        return '<a href="' + href + '" class="' + classes + '">' +
                 '<i data-lucide="' + icon + '" class="w-5 h-5"></i> ' + label +
               '</a>';
      }

      // 1. Prepender "Início" no topo
      var inicioActive = page === 'index.html' || page === '' || page === '/';
      navList.insertAdjacentHTML('afterbegin', buildNavLink('index.html', 'home', 'Início', inicioActive));

      // 2. Mover/adicionar "Carrinho" antes do "Contactos"
      // Remover Carrinho existente (se estiver no footer ou na lista)
      menu.querySelectorAll('a[href*="carrinho"]').forEach(function (a) {
        if (a.id === 'mobile-cart-badge') return; // ignorar elementos não-link
        a.remove();
      });
      var carrinhoActive = page === 'carrinho.html';
      var contactosLink = navList.querySelector('a[href*="contactos"]');
      var carrinhoHTML = buildNavLink('carrinho.html', 'shopping-cart', 'Carrinho', carrinhoActive);
      if (contactosLink) {
        contactosLink.insertAdjacentHTML('beforebegin', carrinhoHTML);
      } else {
        navList.insertAdjacentHTML('beforeend', carrinhoHTML);
      }
    }

    // Bind global do botão hamburger (selector robusto: aria-label + lg:hidden no header)
    document.querySelectorAll('header button[aria-label="Abrir menu"], header button[aria-label="Menu"]').forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', function (e) { e.preventDefault(); open(); });
    });

    // Fechar ao clicar em qualquer link do menu (evita o menu ficar aberto em history.back)
    menu.querySelectorAll('a[href]').forEach(function (a) {
      a.addEventListener('click', function () { close(); });
    });

    // Bind do X de fechar dentro do drawer (cobre legacy id="nav-hamburger" duplicado)
    menu.querySelectorAll('button[aria-label="Fechar menu"]').forEach(function (btn) {
      btn.addEventListener('click', close);
    });

    // Bind do overlay (clique fora = fechar)
    if (overlay) {
      overlay.addEventListener('click', close);
    }

    // Esc fecha
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('translate-x-0')) close();
    });

    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  // ─── 5. Atualizar badge do carrinho na bottom-nav ─────────────────────────
  var originalUpdateCart = window._updateCartBadge;
  window._updateCartBadge = function (count) {
    if (typeof originalUpdateCart === 'function') originalUpdateCart(count);
    // Também atualizar o novo ícone da bottom-nav
    var lojaItem = document.querySelector('.bottom-nav a[data-page="loja"]');
    if (!lojaItem) return;
    var existing = lojaItem.querySelector('#bottom-nav-cart-count');
    if (count > 0) {
      if (existing) {
        existing.textContent = count > 99 ? '99+' : count;
      } else {
        var badge = document.createElement('span');
        badge.id = 'bottom-nav-cart-count';
        badge.className = 'absolute -top-1 right-3 bg-praia-yellow-400 text-praia-teal-800 text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center';
        badge.textContent = count > 99 ? '99+' : count;
        lojaItem.appendChild(badge);
      }
    } else if (existing) {
      existing.remove();
    }
  };

  // ─── Bootstrap ────────────────────────────────────────────────────────────
  injectPwaMeta();

  document.addEventListener('DOMContentLoaded', function () {
    renderSiteBottomNav();
    renderBackButton();
    hardenSideMenu();
    boostHeroBubbles();
  });
})();

// ─── Hero Bubble Density Booster ──────────────────────────────────────────────
// Injeta bolinhas extra (tamanhos, posições e ritmos aleatórios) em qualquer
// hero que já use .bubble / .bubble-sideways, para ter densidade contínua e
// movimento mais fluido sem editar cada página.
function boostHeroBubbles() {
  const existing = document.querySelectorAll('.bubble, .bubble-sideways');
  if (!existing.length) return;

  const parents = new Set();
  existing.forEach(b => { if (b.parentElement) parents.add(b.parentElement); });

  const rand = (min, max) => Math.random() * (max - min) + min;
  // Distribuição enviesada para tamanhos pequenos (evitar bolinhas gigantes)
  const SIZE_POOL = [
    'w-1 h-1', 'w-1 h-1', 'w-1 h-1', 'w-1 h-1',
    'w-1.5 h-1.5', 'w-1.5 h-1.5', 'w-1.5 h-1.5',
    'w-2 h-2', 'w-2 h-2',
    'w-2.5 h-2.5'
  ];

  parents.forEach(parent => {
    const baseCount = parent.querySelectorAll('.bubble, .bubble-sideways').length;
    // Acrescentar ~12% da densidade original — só um bocadinho mais que antes
    const extra = Math.max(5, Math.round(baseCount * 0.12));

    const frag = document.createDocumentFragment();
    for (let i = 0; i < extra; i++) {
      const sideways = Math.random() < 0.25;
      const sizeCls = SIZE_POOL[Math.floor(Math.random() * SIZE_POOL.length)];
      const b = document.createElement('div');
      b.className = (sideways ? 'bubble-sideways ' : 'bubble ') + sizeCls;
      b.style.left = rand(0, 100).toFixed(2) + '%';
      b.style.top = rand(0, 100).toFixed(2) + '%';
      // Delay negativo distribui o início dentro da primeira volta → sem "esperar"
      b.style.setProperty('--delay', '-' + rand(0, 20).toFixed(2) + 's');
      if (sideways) {
        b.style.setProperty('--dur', rand(18, 26).toFixed(1) + 's');
        b.style.setProperty('--dx', (rand(-60, 60)).toFixed(1) + 'px');
        b.style.setProperty('--dy', (rand(-35, 15)).toFixed(1) + 'px');
      } else {
        b.style.setProperty('--dur', rand(16, 24).toFixed(1) + 's');
        b.style.setProperty('--drift', (rand(-16, 16)).toFixed(1) + 'px');
      }
      frag.appendChild(b);
    }
    parent.appendChild(frag);
  });

  // Abranda as bolinhas originais (multiplica o seu --dur inline por ~2.2x)
  // e redistribui delays para evitar "comboios" sincronizados.
  existing.forEach(b => {
    const inlineDur = b.style.getPropertyValue('--dur').trim();
    const m = inlineDur.match(/^([\d.]+)s$/);
    if (m) {
      const slower = (parseFloat(m[1]) * 2.2).toFixed(1) + 's';
      b.style.setProperty('--dur', slower);
    }
    b.style.setProperty('--delay', '-' + (Math.random() * 20).toFixed(2) + 's');
  });
}
