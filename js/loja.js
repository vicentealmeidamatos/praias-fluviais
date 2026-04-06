// ─── Loja das Praias Fluviais ─────────────────────────────────────────────────

let _products = [];
let _activeCategory = 'todos';
let _cartCount = 0;

// ─── Inicialização ────────────────────────────────────────────────────────────

async function initLoja() {
  await loadProducts();
  renderCategories();
  renderProducts();
  await syncCartBadge();
  setupScrollReveal();
}

// ─── Produtos ─────────────────────────────────────────────────────────────────

async function loadProducts() {
  try {
    const res = await fetch('data/products.json');
    _products = await res.json();
  } catch (e) {
    _products = [];
  }
}

function getCategories() {
  const cats = [...new Set(_products.map(p => p.category))];
  return ['todos', ...cats];
}

function categoryLabel(cat) {
  const map = { todos: 'Todos', vestuario: 'Vestuário', publicacao: 'Publicações', acessorio: 'Acessórios' };
  return map[cat] || cat;
}

function renderCategories() {
  const container = document.getElementById('category-tabs');
  if (!container) return;
  const categories = getCategories();
  container.innerHTML = categories.map(cat => `
    <button
      onclick="filterCategory('${cat}')"
      id="tab-${cat}"
      class="category-tab font-display text-xs font-semibold uppercase tracking-wider px-4 py-2 rounded-full transition-all duration-200 ${cat === _activeCategory ? 'bg-praia-teal-800 text-white shadow-lg' : 'bg-white text-praia-teal-700 border border-praia-teal-200 hover:border-praia-teal-400'}"
    >${categoryLabel(cat)}</button>
  `).join('');
}

function filterCategory(cat) {
  _activeCategory = cat;
  renderCategories();
  renderProducts();
}

function formatPrice(priceInCents) {
  if (priceInCents === 0) return 'Grátis';
  return (priceInCents / 100).toFixed(2).replace('.', ',') + '€';
}

function renderProducts() {
  const container = document.getElementById('products-grid');
  if (!container) return;

  const filtered = _activeCategory === 'todos'
    ? _products
    : _products.filter(p => p.category === _activeCategory);

  if (!filtered.length) {
    container.innerHTML = `<div class="col-span-full text-center py-20 text-praia-sand-400 font-display">Sem produtos nesta categoria.</div>`;
    return;
  }

  container.innerHTML = filtered.map(product => renderProductCard(product)).join('');

  // Init lucide icons for newly rendered elements
  if (window.lucide) lucide.createIcons();

  // Scroll reveal
  container.querySelectorAll('.product-card').forEach((el, i) => {
    el.style.animationDelay = `${i * 60}ms`;
    el.classList.add('scroll-reveal-ready');
  });
  setTimeout(() => {
    container.querySelectorAll('.product-card').forEach(el => el.classList.add('visible'));
  }, 50);
}

function renderProductCard(product) {
  const isFree = product.price === 0;
  const hasVariants = product.variants && product.variants.length > 0;
  const mainImage = product.images && product.images[0] ? product.images[0] : null;
  const availableVariants = product.variants ? product.variants.filter(v => v.available) : [];

  return `
    <article class="product-card group bg-white rounded-2xl overflow-hidden shadow-layered hover:shadow-layered-hover transition-all duration-300 hover:-translate-y-1 flex flex-col" data-id="${product.id}">
      <!-- Image -->
      <a href="produto.html?id=${product.id}" class="relative overflow-hidden bg-praia-teal-50 aspect-[4/3] block">
        ${mainImage ? `
          <img src="${mainImage}" alt="${product.name}"
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onerror="this.parentElement.innerHTML='<div class=\'w-full h-full flex items-center justify-center text-praia-teal-200\'><i data-lucide=\'package\' class=\'w-16 h-16\'></i></div>';lucide.createIcons();"
          >
        ` : `
          <div class="w-full h-full flex items-center justify-center text-praia-teal-200">
            <i data-lucide="package" class="w-16 h-16"></i>
          </div>
        `}
        ${product.featured ? `
          <div class="absolute top-3 right-3">
            <span class="bg-praia-teal-800/80 backdrop-blur-sm text-praia-yellow-400 font-display font-bold text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full flex items-center gap-1">
              <i data-lucide="star" class="w-3 h-3 fill-current"></i> Destaque
            </span>
          </div>
        ` : ''}
        <!-- Multi-image indicator -->
        ${product.images && product.images.length > 1 ? `
          <div class="absolute bottom-2 right-2 flex gap-1">
            ${product.images.map((_, i) => `<button onclick="cycleImage(event, '${product.id}', ${i})" class="w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-white' : 'bg-white/40'} transition-colors" data-img-dot="${product.id}-${i}"></button>`).join('')}
          </div>
        ` : ''}
      </a>

      <!-- Content -->
      <div class="p-5 flex flex-col flex-1">
        <a href="produto.html?id=${product.id}" class="font-display font-bold text-praia-teal-800 text-base leading-snug mb-1 hover:text-praia-teal-600 transition-colors block">${product.name}</a>
        <p class="text-praia-sand-500 text-sm leading-relaxed mb-3 flex-1">${product.description.length > 100 ? product.description.substring(0, 100) + '…' : product.description}</p>
        <div class="mb-3">
          ${isFree
            ? `<span class="font-display font-bold text-2xl text-praia-green-500">Grátis</span>`
            : `<span class="font-display font-bold text-2xl text-praia-teal-800">${formatPrice(product.price)}</span>`
          }
        </div>

        ${hasVariants ? `
          <div class="mb-4">
            <p class="font-display text-[10px] font-semibold uppercase tracking-wider text-praia-sand-400 mb-2">Tamanho</p>
            <div class="flex flex-wrap gap-1.5" id="variants-${product.id}">
              ${availableVariants.map((v, i) => `
                <button onclick="selectVariant('${product.id}', '${v.id}')"
                  class="variant-btn font-display font-semibold text-xs px-3 py-1.5 rounded-lg border transition-all duration-150 ${i === 0 ? 'border-praia-teal-700 bg-praia-teal-700 text-white' : 'border-praia-sand-200 text-praia-sand-600 hover:border-praia-teal-400'}"
                  data-variant="${v.id}" data-product="${product.id}"
                >${v.label}</button>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <button
          onclick="handleAddToCart('${product.id}')"
          class="add-to-cart-btn w-full flex items-center justify-center gap-2 bg-praia-teal-800 text-white font-display font-bold text-sm uppercase tracking-wider px-4 py-3 rounded-xl hover:bg-praia-teal-700 active:scale-[0.98] transition-all duration-200 shadow-sm"
          data-product-id="${product.id}"
          ${!product.available ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}
        >
          <i data-lucide="shopping-cart" class="w-4 h-4"></i>
          ${!product.available ? 'Esgotado' : 'Adicionar ao carrinho'}
        </button>
      </div>
    </article>
  `;
}

// ─── Imagem Galeria ───────────────────────────────────────────────────────────

function cycleImage(e, productId, index) {
  e.stopPropagation();
  const card = e.target.closest('.product-card');
  if (!card) return;
  const product = _products.find(p => p.id === productId);
  if (!product || !product.images[index]) return;

  const img = card.querySelector('img');
  if (img) {
    img.style.opacity = '0';
    setTimeout(() => {
      img.src = product.images[index];
      img.style.opacity = '1';
    }, 150);
  }

  card.querySelectorAll('[data-img-dot]').forEach(dot => dot.classList.replace('bg-white', 'bg-white/40'));
  const activeDot = card.querySelector(`[data-img-dot="${productId}-${index}"]`);
  if (activeDot) activeDot.classList.replace('bg-white/40', 'bg-white');
}

// ─── Variantes ────────────────────────────────────────────────────────────────

function selectVariant(productId, variantId) {
  const container = document.getElementById(`variants-${productId}`);
  if (!container) return;
  container.querySelectorAll('.variant-btn').forEach(btn => {
    const isSelected = btn.dataset.variant === variantId;
    btn.classList.toggle('border-praia-teal-700', isSelected);
    btn.classList.toggle('bg-praia-teal-700', isSelected);
    btn.classList.toggle('text-white', isSelected);
    btn.classList.toggle('border-praia-sand-200', !isSelected);
    btn.classList.toggle('text-praia-sand-600', !isSelected);
  });
}

function getSelectedVariant(productId) {
  const container = document.getElementById(`variants-${productId}`);
  if (!container) return null;
  const selected = container.querySelector('.variant-btn.bg-praia-teal-700');
  return selected ? selected.dataset.variant : null;
}

// ─── Carrinho ─────────────────────────────────────────────────────────────────

async function handleAddToCart(productId) {
  const product = _products.find(p => p.id === productId);
  if (!product || !product.available) return;

  const user = await authGetUser();
  if (!user) {
    showLoginModal();
    return;
  }

  const variant = getSelectedVariant(productId);
  if (product.variants && product.variants.length > 0 && !variant) {
    showToast('Seleciona um tamanho primeiro.', 'warning');
    return;
  }

  const btn = document.querySelector(`[data-product-id="${productId}"]`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<div class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div> A adicionar…`;
  }

  try {
    // Check if item already in cart
    const variantKey = variant || 'sem-variante';
    const { data: existing } = await _sb
      .from('cart_items')
      .select('id, quantity')
      .eq('user_id', user.id)
      .eq('product_id', productId)
      .eq('variant', variantKey)
      .single();

    if (existing) {
      await _sb.from('cart_items').update({ quantity: existing.quantity + 1 }).eq('id', existing.id);
    } else {
      await _sb.from('cart_items').insert({
        user_id: user.id,
        product_id: productId,
        variant: variantKey,
        quantity: 1
      });
    }

    showToast(`"${product.name}" adicionado ao carrinho!`, 'success');
    await syncCartBadge();
  } catch (err) {
    console.error('Erro ao adicionar ao carrinho:', err);
    showToast('Erro ao adicionar ao carrinho. Tenta novamente.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      if (window.lucide) lucide.createIcons();
      btn.innerHTML = `<i data-lucide="shopping-cart" class="w-4 h-4"></i> Adicionar ao carrinho`;
      if (window.lucide) lucide.createIcons();
    }
  }
}

// ─── Badge do carrinho ────────────────────────────────────────────────────────

async function syncCartBadge() {
  const user = await authGetUser();
  if (!user) { updateCartBadgeUI(0); return; }

  const { data } = await _sb
    .from('cart_items')
    .select('quantity')
    .eq('user_id', user.id);

  const total = data ? data.reduce((sum, item) => sum + item.quantity, 0) : 0;
  updateCartBadgeUI(total);
}

function updateCartBadgeUI(count) {
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

// ─── Modal de Login ───────────────────────────────────────────────────────────

function showLoginModal() {
  let modal = document.getElementById('login-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'login-modal';
    modal.className = 'fixed inset-0 z-[2000] flex items-center justify-center px-4';
    modal.innerHTML = `
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick="closeLoginModal()"></div>
      <div class="relative bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center">
        <div class="w-14 h-14 bg-praia-teal-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <i data-lucide="shopping-cart" class="w-7 h-7 text-praia-teal-700"></i>
        </div>
        <h2 class="font-display font-bold text-xl text-praia-teal-800 mb-2">Inicia sessão para adicionar ao carrinho</h2>
        <p class="text-praia-sand-500 text-sm mb-6">O carrinho fica guardado na tua conta. Podes fazer a compra sem conta no checkout.</p>
        <a href="auth.html" class="block w-full bg-praia-teal-800 text-white font-display font-bold text-sm uppercase tracking-wider px-5 py-3 rounded-xl hover:bg-praia-teal-700 transition-colors mb-3">
          Entrar / Registar
        </a>
        <button onclick="closeLoginModal()" class="w-full text-praia-sand-400 font-display text-sm hover:text-praia-sand-600 transition-colors">
          Continuar sem conta
        </button>
      </div>
    `;
    document.body.appendChild(modal);
    if (window.lucide) lucide.createIcons();
  }
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeLoginModal() {
  const modal = document.getElementById('login-modal');
  if (modal) {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(message, type = 'success') {
  const colors = {
    success: 'bg-praia-green-500 text-white',
    error: 'bg-red-500 text-white',
    warning: 'bg-praia-yellow-400 text-praia-teal-800'
  };
  const toast = document.createElement('div');
  toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 z-[3000] px-5 py-3 rounded-xl font-display font-semibold text-sm shadow-xl flex items-center gap-2 transition-all duration-300 ${colors[type]}`;
  toast.style.transform = 'translateX(-50%) translateY(20px)';
  toast.style.opacity = '0';
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.transform = 'translateX(-50%) translateY(0)';
    toast.style.opacity = '1';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ─── Scroll Reveal ────────────────────────────────────────────────────────────

function setupScrollReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(el => {
      if (el.isIntersecting) {
        el.target.classList.add('visible');
        observer.unobserve(el.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.scroll-reveal').forEach(el => observer.observe(el));
}

// ─── Start ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', initLoja);
