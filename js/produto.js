// ─── Página de Produto ────────────────────────────────────────────────────────

let _product = null;
let _productIdx = -1;
let _products = [];
let _beaches = [];
let _activeImage = 0;
let _settings = null;

// Pré-carregamento imediato (sem esperar pelo DOM)
const _prodEarly = loadData('products').then(d => d || []);
const _settingsEarly = loadData('settings');
const _beachesEarlyP = loadData('beaches').then(d => d || []);

async function initProduto() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) { window.location.href = 'loja.html'; return; }

  try {
    const [pData, sData, bData] = await Promise.all([_prodEarly, _settingsEarly, _beachesEarlyP]);
    _products = (pData || []).filter(p => !p.hidden);
    _settings = sData || null;
    _beaches = (bData || []).map(b => ({ id: b.id, name: b.name })).sort((a, b) => a.name.localeCompare(b.name, 'pt'));
  } catch {
    _products = []; _settings = null; _beaches = [];
  }

  _productIdx = _products.findIndex(p => p.id === id);
  _product = _productIdx >= 0 ? _products[_productIdx] : null;
  if (!_product) { window.location.href = 'loja.html'; return; }

  document.title = `${_product.name} | Guia das Praias Fluviais`;

  renderProduct();
  renderRelated();
  syncCartBadge(); // background
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderProduct() {
  const p = _product;
  const isFree = p.price === 0;
  const hasVariants = p.variants && p.variants.length > 0;
  const availableVariants = hasVariants ? p.variants.filter(v => v.available) : [];

  // Breadcrumb
  const bc = document.getElementById('breadcrumb-name');
  bc.textContent = p.name;
  bc.setAttribute('data-content-bind', `produtos:${_productIdx}.name`);

  // Gallery
  renderGallery();

  // Info — ligar campos editáveis ao dataset 'produtos' do admin
  const nameEl = document.getElementById('product-name');
  nameEl.textContent = p.name;
  nameEl.setAttribute('data-content-bind', `produtos:${_productIdx}.name`);

  document.getElementById('product-price').textContent = isFree ? 'Grátis + portes' : formatPrice(p.price);

  const descEl = document.getElementById('product-description');
  descEl.textContent = p.description;
  descEl.setAttribute('data-content-bind', `produtos:${_productIdx}.description`);

  // Category badge
  const catEl = document.getElementById('product-category');
  if (catEl) {
    const labels = { vestuario: 'Vestuário', publicacao: 'Publicação', acessorio: 'Acessório' };
    catEl.textContent = labels[p.category] || p.category;
  }

  // Beach dropdown (customizable products)
  const beachSection = document.getElementById('beach-section');
  const beachSelect = document.getElementById('beach-select');
  if (p.customizable && beachSection && beachSelect) {
    // Populate options from the already-loaded _beaches array (from beaches.json)
    beachSelect.innerHTML = `<option value="">Escolha a sua praia…</option>` +
      _beaches.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
    beachSection.classList.remove('hidden');
  } else if (beachSection) {
    beachSection.classList.add('hidden');
  }

  // Variants
  const variantsSection = document.getElementById('variants-section');
  if (hasVariants && variantsSection) {
    variantsSection.innerHTML = `
      <p class="font-display text-xs font-semibold uppercase tracking-wider text-praia-sand-400 mb-2">Tamanho</p>
      <div class="flex flex-wrap gap-2" id="variant-buttons">
        ${availableVariants.map((v, i) => `
          <button onclick="selectVariantProduto('${v.id}')"
            class="variant-btn font-display font-semibold text-sm px-4 py-2 rounded-xl border-2 transition-all duration-150 ${i === 0 ? 'border-praia-teal-700 bg-praia-teal-700 text-white' : 'border-praia-sand-200 text-praia-sand-600 hover:border-praia-teal-400'}"
            data-variant="${v.id}"
          >${v.label}</button>
        `).join('')}
      </div>`;
  } else if (variantsSection) {
    variantsSection.innerHTML = '';
  }

  // Available state
  const addBtn = document.getElementById('add-to-cart-btn');
  const buyBtn = document.getElementById('buy-now-btn');
  if (!p.available) {
    if (addBtn) { addBtn.disabled = true; addBtn.textContent = 'Esgotado'; addBtn.style.opacity = '0.5'; addBtn.style.cursor = 'not-allowed'; }
    if (buyBtn) { buyBtn.disabled = true; buyBtn.style.opacity = '0.5'; buyBtn.style.cursor = 'not-allowed'; }
  }

  // Shipping info
  const rates = _settings?.shop?.shipping ?? { mainland: 350, ilhas: 550 };
  const freeThreshold = _settings?.shop?.freeShippingThreshold ?? 3000;
  document.getElementById('shipping-mainland').textContent = formatPrice(rates.mainland);
  document.getElementById('shipping-ilhas').textContent = formatPrice(rates.ilhas);
  document.getElementById('shipping-free-threshold').textContent = formatPrice(freeThreshold);

  if (window.lucide) lucide.createIcons();
}

function renderGallery() {
  const p = _product;
  const images = p.images || [];

  const mainImg = document.getElementById('main-product-image');
  const thumbsContainer = document.getElementById('image-thumbs');

  if (images.length === 0) {
    if (mainImg) mainImg.parentElement.innerHTML = `
      <div class="w-full h-full flex items-center justify-center text-praia-teal-200">
        <i data-lucide="package" class="w-24 h-24"></i>
      </div>`;
    return;
  }

  if (mainImg) {
    mainImg.alt = p.name;
    mainImg.onload = () => mainImg.classList.remove('hidden');
    mainImg.onerror = () => {
      mainImg.parentElement.innerHTML = `<div class="w-full h-full flex items-center justify-center text-praia-teal-200"><i data-lucide="package" class="w-24 h-24"></i></div>`;
      if (window.lucide) lucide.createIcons();
    };
    mainImg.src = images[0];
  }

  if (thumbsContainer) {
    if (images.length <= 1) {
      thumbsContainer.classList.add('hidden');
    } else {
      thumbsContainer.innerHTML = images.map((img, i) => `
        <button onclick="setActiveImage(${i})"
          class="thumb-btn w-16 h-16 rounded-xl overflow-hidden border-2 transition-all duration-150 ${i === 0 ? 'border-praia-teal-700' : 'border-praia-sand-200 hover:border-praia-teal-300'}"
          data-thumb="${i}">
          <img src="${img}" alt="${p.name} ${i + 1}" class="w-full h-full object-cover">
        </button>
      `).join('');
    }
  }
}

function setActiveImage(index) {
  const images = _product.images || [];
  if (!images[index]) return;
  _activeImage = index;

  const mainImg = document.getElementById('main-product-image');
  if (mainImg) {
    mainImg.style.opacity = '0';
    setTimeout(() => {
      mainImg.src = images[index];
      mainImg.classList.remove('hidden');
      mainImg.style.opacity = '1';
    }, 150);
  }

  document.querySelectorAll('.thumb-btn').forEach(btn => {
    const isActive = parseInt(btn.dataset.thumb) === index;
    btn.classList.toggle('border-praia-teal-700', isActive);
    btn.classList.toggle('border-praia-sand-200', !isActive);
  });
}

function selectVariantProduto(variantId) {
  document.querySelectorAll('.variant-btn').forEach(btn => {
    const isSelected = btn.dataset.variant === variantId;
    btn.classList.toggle('border-praia-teal-700', isSelected);
    btn.classList.toggle('bg-praia-teal-700', isSelected);
    btn.classList.toggle('text-white', isSelected);
    btn.classList.toggle('border-praia-sand-200', !isSelected);
    btn.classList.toggle('text-praia-sand-600', !isSelected);
    btn.classList.toggle('bg-transparent', !isSelected);
  });
}

function getSelectedVariantProduto() {
  const selected = document.querySelector('.variant-btn.bg-praia-teal-700');
  return selected ? selected.dataset.variant : null;
}

function getSelectedBeachProduto() {
  const select = document.getElementById('beach-select');
  return select ? select.value : null;
}

function renderRelated() {
  const container = document.getElementById('related-products');
  if (!container) return;

  const related = _products
    .filter(p => p.id !== _product.id && p.category === _product.category)
    .slice(0, 3);

  if (!related.length) {
    container.parentElement?.classList.add('hidden');
    return;
  }

  container.innerHTML = related.map(p => `
    <a href="produto.html?id=${p.id}" class="group bg-white rounded-2xl overflow-hidden shadow-sm border border-praia-sand-100 hover:shadow-layered hover:-translate-y-0.5 transition-all duration-200 flex flex-col">
      <div class="relative aspect-[4/3] overflow-hidden bg-praia-teal-50">
        ${p.images && p.images[0]
          ? `<img src="${p.images[0]}" alt="${p.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">`
          : `<div class="w-full h-full flex items-center justify-center text-praia-teal-200"><i data-lucide="package" class="w-12 h-12"></i></div>`
        }
        <div class="absolute top-2 left-2">
          ${p.price === 0
            ? `<span class="bg-praia-green-500 text-white font-display font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full">Grátis + portes</span>`
            : `<span class="bg-praia-yellow-400 text-praia-teal-800 font-display font-bold text-xs px-2 py-0.5 rounded-full">${formatPrice(p.price)}</span>`
          }
        </div>
      </div>
      <div class="p-4 flex-1">
        <h3 class="font-display font-bold text-praia-teal-800 text-sm leading-snug">${p.name}</h3>
        <p class="text-praia-sand-500 text-xs mt-1 leading-relaxed">${p.description.substring(0, 70)}…</p>
      </div>
    </a>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

// ─── Carrinho ─────────────────────────────────────────────────────────────────

async function handleAddToCartProduto() {
  if (!_product || !_product.available) return;

  const user = await authGetUser();
  if (!user) {
    showLoginModalProduto();
    return;
  }

  const variant = getSelectedVariantProduto();
  if (_product.variants && _product.variants.length > 0 && !variant) {
    showToastProduto('Seleciona um tamanho primeiro.', 'warning');
    return;
  }

  const beach = getSelectedBeachProduto();
  if (_product.customizable && !beach) {
    showToastProduto('Seleciona a praia que queres na t-shirt.', 'warning');
    return;
  }

  const btn = document.getElementById('add-to-cart-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<div class="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin"></div> A adicionar…`;
  }

  try {
    const variantKey = variant || 'sem-variante';
    const beachKey = beach || null;
    const { data: existing } = await _sb
      .from('cart_items')
      .select('id, quantity')
      .eq('user_id', user.id)
      .eq('product_id', _product.id)
      .eq('variant', variantKey)
      .single();

    if (existing) {
      await _sb.from('cart_items').update({ quantity: existing.quantity + 1 }).eq('id', existing.id);
    } else {
      await _sb.from('cart_items').insert({
        user_id: user.id,
        product_id: _product.id,
        variant: variantKey,
        beach: beachKey,
        quantity: 1
      });
    }

    showToastProduto(`"${_product.name}" adicionado ao carrinho!`, 'success');
    await syncCartBadge();
  } catch (err) {
    console.error('Erro ao adicionar ao carrinho:', err);
    showToastProduto('Erro ao adicionar. Tenta novamente.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="shopping-cart" class="w-5 h-5"></i> Adicionar ao carrinho`;
      if (window.lucide) lucide.createIcons();
    }
  }
}

// ─── Comprar agora ────────────────────────────────────────────────────────────

async function handleBuyNowProduto() {
  if (!_product || !_product.available) return;

  const user = await authGetUser();
  if (!user) {
    showLoginModalProduto();
    return;
  }

  const variant = getSelectedVariantProduto();
  if (_product.variants && _product.variants.length > 0 && !variant) {
    showToastProduto('Seleciona um tamanho primeiro.', 'warning');
    return;
  }

  const beach = getSelectedBeachProduto();
  if (_product.customizable && !beach) {
    showToastProduto('Seleciona a praia que queres na t-shirt.', 'warning');
    return;
  }

  const btn = document.getElementById('buy-now-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<div class="w-5 h-5 border-2 border-praia-teal-800/30 border-t-praia-teal-800 rounded-full animate-spin"></div> A processar…`;
  }

  try {
    const payload = {
      items: [{
        product_id: _product.id,
        variant: variant || 'sem-variante',
        beach: beach || null,
        quantity: 1,
      }],
      user_id: user?.id ?? null,
    };

    const res = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao criar sessão de pagamento.');
    }

    const { url } = await res.json();
    if (url) window.location.href = url;
  } catch (err) {
    console.error('Buy now error:', err);
    showToastProduto(err.message || 'Erro ao iniciar o pagamento. Tenta novamente.', 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="zap" class="w-5 h-5"></i> Comprar agora`;
      if (window.lucide) lucide.createIcons();
    }
  }
}

// ─── Badge ────────────────────────────────────────────────────────────────────

async function syncCartBadge() {
  const user = await authGetUser();
  if (!user) { updateCartBadgeUI(0); return; }
  const { data } = await _sb.from('cart_items').select('quantity').eq('user_id', user.id);
  const total = data ? data.reduce((sum, i) => sum + i.quantity, 0) : 0;
  updateCartBadgeUI(total);
}

function updateCartBadgeUI(count) {
  ['cart-badge', 'mobile-cart-badge'].forEach(id => {
    const badge = document.getElementById(id);
    if (!badge) return;
    if (count > 0) { badge.textContent = count > 99 ? '99+' : count; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');
  });
}

// ─── Login Modal ──────────────────────────────────────────────────────────────

function showLoginModalProduto() {
  let modal = document.getElementById('login-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'login-modal';
    modal.className = 'fixed inset-0 z-[2000] flex items-center justify-center px-4';
    modal.innerHTML = `
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick="this.parentElement.classList.add('hidden');document.body.style.overflow=''"></div>
      <div class="relative bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center">
        <div class="w-14 h-14 bg-praia-teal-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <i data-lucide="shopping-cart" class="w-7 h-7 text-praia-teal-700"></i>
        </div>
        <h2 class="font-display font-bold text-xl text-praia-teal-800 mb-2">Inicia sessão para adicionar ao carrinho</h2>
        <p class="text-praia-sand-500 text-sm mb-6">O carrinho fica guardado na sua conta.</p>
        <a href="auth.html" class="block w-full bg-praia-teal-800 text-white font-display font-bold text-sm uppercase tracking-wider px-5 py-3 rounded-xl hover:bg-praia-teal-700 transition-colors mb-3">
          Entrar / Registar
        </a>
        <button onclick="this.closest('#login-modal').classList.add('hidden');document.body.style.overflow=''" class="w-full text-praia-sand-400 font-display text-sm hover:text-praia-sand-600 transition-colors">
          Fechar
        </button>
      </div>`;
    document.body.appendChild(modal);
    if (window.lucide) lucide.createIcons();
  }
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToastProduto(message, type = 'success') {
  const colors = {
    success: 'bg-praia-green-500 text-white',
    error: 'bg-red-500 text-white',
    warning: 'bg-praia-yellow-400 text-praia-teal-800'
  };
  const toast = document.createElement('div');
  toast.className = `fixed bottom-6 left-1/2 z-[3000] px-5 py-3 rounded-xl font-display font-semibold text-sm shadow-xl flex items-center gap-2 transition-all duration-300 ${colors[type]}`;
  toast.style.cssText = 'transform: translateX(-50%) translateY(20px); opacity: 0;';
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.style.transform = 'translateX(-50%) translateY(0)'; toast.style.opacity = '1'; });
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(-50%) translateY(20px)'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function formatPrice(cents) {
  if (cents === 0) return 'Grátis';
  return (cents / 100).toFixed(2).replace('.', ',') + '€';
}

// ─── Start ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', initProduto);
