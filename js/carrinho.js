// ─── Carrinho das Praias Fluviais ─────────────────────────────────────────────

let _cartItems = [];
let _products = [];

// ─── Inicialização ────────────────────────────────────────────────────────────

async function initCarrinho() {
  await loadProducts();

  const user = await authGetUser();
  if (!user) {
    renderEmptyCart(true);
    return;
  }

  await loadCartItems(user.id);
  renderCart();
  updateCartBadge();
}

// ─── Dados ────────────────────────────────────────────────────────────────────

async function loadProducts() {
  try {
    const res = await fetch('data/products.json');
    _products = await res.json();
  } catch { _products = []; }
}

async function loadCartItems(userId) {
  const { data, error } = await _sb
    .from('cart_items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) { _cartItems = []; return; }

  _cartItems = (data || []).map(item => {
    const product = _products.find(p => p.id === item.product_id);
    return { ...item, product };
  }).filter(item => item.product);
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderEmptyCart(notLoggedIn = false) {
  const container = document.getElementById('cart-content');
  if (!container) return;

  if (notLoggedIn) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-24 text-center">
        <div class="w-20 h-20 bg-praia-teal-50 rounded-full flex items-center justify-center mb-6">
          <i data-lucide="lock" class="w-9 h-9 text-praia-teal-400"></i>
        </div>
        <h2 class="font-display font-bold text-2xl text-praia-teal-800 mb-3">Inicia sessão para ver o teu carrinho</h2>
        <p class="text-praia-sand-500 max-w-sm mb-8">O carrinho fica guardado na tua conta. Para comprar basta ter um email — não precisas de criar conta.</p>
        <a href="auth.html" class="inline-flex items-center gap-2 bg-praia-teal-800 text-white font-display font-bold text-sm uppercase tracking-wider px-6 py-3 rounded-xl hover:bg-praia-teal-700 transition-colors">
          <i data-lucide="log-in" class="w-4 h-4"></i> Entrar / Registar
        </a>
        <a href="loja.html" class="mt-4 text-praia-sand-400 font-display text-sm hover:text-praia-sand-600 transition-colors">← Ver produtos</a>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-24 text-center">
        <div class="w-20 h-20 bg-praia-teal-50 rounded-full flex items-center justify-center mb-6">
          <i data-lucide="shopping-cart" class="w-9 h-9 text-praia-teal-300"></i>
        </div>
        <h2 class="font-display font-bold text-2xl text-praia-teal-800 mb-3">O carrinho está vazio</h2>
        <p class="text-praia-sand-500 max-w-sm mb-8">Ainda não adicionaste nenhum produto ao carrinho.</p>
        <a href="loja.html" class="inline-flex items-center gap-2 bg-praia-teal-800 text-white font-display font-bold text-sm uppercase tracking-wider px-6 py-3 rounded-xl hover:bg-praia-teal-700 transition-colors">
          <i data-lucide="shopping-bag" class="w-4 h-4"></i> Ver produtos
        </a>
      </div>
    `;
  }

  document.getElementById('cart-summary')?.classList.add('hidden');
  if (window.lucide) lucide.createIcons();
}

function renderCart() {
  if (!_cartItems.length) { renderEmptyCart(false); return; }

  const container = document.getElementById('cart-content');
  if (!container) return;

  container.innerHTML = `
    <div class="space-y-4">
      ${_cartItems.map(item => renderCartItem(item)).join('')}
    </div>
  `;

  renderSummary();
  document.getElementById('cart-summary')?.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function renderCartItem(item) {
  const product = item.product;
  const isFree = product.price === 0;
  const image = product.images && product.images[0];
  const variantDisplay = item.variant && item.variant !== 'sem-variante' ? item.variant : null;

  return `
    <div class="flex gap-4 bg-white rounded-2xl p-4 shadow-sm border border-praia-sand-100" data-cart-item="${item.id}">
      <div class="w-20 h-20 rounded-xl overflow-hidden bg-praia-teal-50 flex-shrink-0">
        ${image
          ? `<img src="${image}" alt="${product.name}" class="w-full h-full object-cover" onerror="this.parentElement.innerHTML='<div class=\'w-full h-full flex items-center justify-center text-praia-teal-200\'><i data-lucide=\'package\' class=\'w-8 h-8\'></i></div>';lucide.createIcons();">`
          : `<div class="w-full h-full flex items-center justify-center text-praia-teal-200"><i data-lucide="package" class="w-8 h-8"></i></div>`
        }
      </div>
      <div class="flex-1 min-w-0">
        <h3 class="font-display font-bold text-praia-teal-800 text-sm leading-snug">${product.name}</h3>
        ${variantDisplay ? `<p class="text-praia-sand-400 text-xs font-display mt-0.5">Tamanho: <span class="font-semibold">${variantDisplay}</span></p>` : ''}
        <div class="flex items-center justify-between mt-3">
          <div class="flex items-center gap-2">
            <button onclick="changeQty('${item.id}', -1)" class="w-7 h-7 rounded-lg bg-praia-sand-100 hover:bg-praia-sand-200 flex items-center justify-center text-praia-sand-600 font-bold text-sm transition-colors">−</button>
            <span class="font-display font-semibold text-praia-teal-800 text-sm w-6 text-center" id="qty-${item.id}">${item.quantity}</span>
            <button onclick="changeQty('${item.id}', 1)" class="w-7 h-7 rounded-lg bg-praia-sand-100 hover:bg-praia-sand-200 flex items-center justify-center text-praia-sand-600 font-bold text-sm transition-colors">+</button>
          </div>
          <div class="flex items-center gap-3">
            <span class="font-display font-bold text-praia-teal-800 text-sm">
              ${isFree ? '<span class="text-praia-green-600">Grátis</span>' : formatPrice(product.price * item.quantity)}
            </span>
            <button onclick="removeItem('${item.id}')" class="text-praia-sand-300 hover:text-red-400 transition-colors" aria-label="Remover">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderSummary() {
  const subtotal = calcSubtotal();
  const summaryEl = document.getElementById('cart-summary');
  if (!summaryEl) return;

  summaryEl.innerHTML = `
    <div class="bg-white rounded-2xl p-6 shadow-sm border border-praia-sand-100 sticky top-24">
      <h2 class="font-display font-bold text-xl text-praia-teal-800 mb-5">Resumo</h2>

      <div class="space-y-3 mb-5">
        <div class="flex justify-between text-sm">
          <span class="text-praia-sand-500 font-display">Subtotal</span>
          <span class="font-display font-semibold text-praia-teal-800">${subtotal === 0 ? 'Grátis' : formatPrice(subtotal)}</span>
        </div>
        <div class="flex justify-between text-sm">
          <span class="text-praia-sand-500 font-display">Portes</span>
          <span class="font-display text-praia-sand-400 text-xs italic">calculados no pagamento</span>
        </div>
        <div class="border-t border-praia-sand-100 pt-3 flex justify-between">
          <span class="font-display font-bold text-praia-teal-800">Total</span>
          <span class="font-display font-bold text-xl text-praia-teal-800">${subtotal === 0 ? 'Grátis' : formatPrice(subtotal)}</span>
        </div>
      </div>

      <button
        onclick="proceedToCheckout()"
        id="checkout-btn"
        class="w-full flex items-center justify-center gap-2 bg-praia-teal-800 text-white font-display font-bold text-sm uppercase tracking-wider px-5 py-4 rounded-xl hover:bg-praia-teal-700 active:scale-[0.98] transition-all duration-200 shadow-sm mb-3"
      >
        <i data-lucide="credit-card" class="w-4 h-4"></i>
        Finalizar Compra
      </button>

      <a href="loja.html" class="flex items-center justify-center gap-1.5 text-praia-sand-400 font-display text-sm hover:text-praia-teal-600 transition-colors">
        <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i> Continuar a comprar
      </a>

      <div class="mt-5 pt-4 border-t border-praia-sand-100 flex items-center justify-center gap-4">
        <div class="flex items-center gap-1.5 text-praia-sand-400 text-xs font-display">
          <i data-lucide="shield-check" class="w-3.5 h-3.5 text-praia-green-500"></i> Pagamento seguro
        </div>
        <div class="flex items-center gap-1.5 text-praia-sand-400 text-xs font-display">
          <i data-lucide="lock" class="w-3.5 h-3.5 text-praia-green-500"></i> SSL encriptado
        </div>
      </div>

      <div class="mt-3 flex items-center justify-center">
        <img src="https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg" alt="Powered by Stripe" class="h-5 opacity-40">
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

// ─── Cálculos ─────────────────────────────────────────────────────────────────

function calcSubtotal() {
  return _cartItems.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
}

function formatPrice(cents) {
  return (cents / 100).toFixed(2).replace('.', ',') + '€';
}

// ─── Acções ───────────────────────────────────────────────────────────────────

async function changeQty(itemId, delta) {
  const item = _cartItems.find(i => i.id === itemId);
  if (!item) return;

  const newQty = item.quantity + delta;
  if (newQty <= 0) { await removeItem(itemId); return; }

  const { error } = await _sb.from('cart_items').update({ quantity: newQty }).eq('id', itemId);
  if (!error) {
    item.quantity = newQty;
    const qtyEl = document.getElementById(`qty-${itemId}`);
    if (qtyEl) qtyEl.textContent = newQty;
    renderSummary();
    updateCartBadge();
  }
}

async function removeItem(itemId) {
  const { error } = await _sb.from('cart_items').delete().eq('id', itemId);
  if (!error) {
    _cartItems = _cartItems.filter(i => i.id !== itemId);
    const el = document.querySelector(`[data-cart-item="${itemId}"]`);
    if (el) {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-10px)';
      setTimeout(() => { el.remove(); renderSummary(); updateCartBadge(); }, 250);
    }
    if (!_cartItems.length) renderEmptyCart(false);
  }
}

async function proceedToCheckout() {
  if (!_cartItems.length) return;

  const btn = document.getElementById('checkout-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<div class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div> A processar…`;
  }

  try {
    const user = await authGetUser();
    const payload = {
      items: _cartItems.map(item => ({
        product_id: item.product_id,
        variant: item.variant,
        quantity: item.quantity,
      })),
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
    console.error('Checkout error:', err);
    showToastCart(err.message || 'Erro ao iniciar o pagamento. Tenta novamente.', 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="credit-card" class="w-4 h-4"></i> Finalizar Compra`;
      if (window.lucide) lucide.createIcons();
    }
  }
}

// ─── Cart Badge ───────────────────────────────────────────────────────────────

function updateCartBadge() {
  const total = _cartItems.reduce((sum, item) => sum + item.quantity, 0);
  ['cart-badge', 'mobile-cart-badge'].forEach(id => {
    const badge = document.getElementById(id);
    if (!badge) return;
    if (total > 0) {
      badge.textContent = total > 99 ? '99+' : total;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  });
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToastCart(message, type = 'success') {
  const colors = { success: 'bg-praia-green-500 text-white', error: 'bg-red-500 text-white', warning: 'bg-praia-yellow-400 text-praia-teal-800' };
  const toast = document.createElement('div');
  toast.className = `fixed bottom-6 left-1/2 z-[3000] px-5 py-3 rounded-xl font-display font-semibold text-sm shadow-xl flex items-center gap-2 transition-all duration-300 ${colors[type]}`;
  toast.style.cssText = 'transform: translateX(-50%) translateY(20px); opacity: 0;';
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.style.transform = 'translateX(-50%) translateY(0)'; toast.style.opacity = '1'; });
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(-50%) translateY(20px)'; setTimeout(() => toast.remove(), 300); }, 3500);
}

// ─── Start ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', initCarrinho);
