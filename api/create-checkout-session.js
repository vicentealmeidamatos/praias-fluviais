// api/create-checkout-session.js — Vercel Serverless Function
// Cria uma Stripe Checkout Session com os itens do carrinho.

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Shipping rates (cêntimos) — em sync com data/settings.json
const SHIPPING = { mainland: 350, ilhas: 550 };
const FREE_SHIPPING_THRESHOLD = 3000;

// URL base do site
const BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'https://praiasfluviais.pt';

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  try {
    const { items, shipping_zone, user_id } = req.body;

    // Validações básicas
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Carrinho vazio.' });
    }
    if (!['mainland', 'ilhas'].includes(shipping_zone)) {
      return res.status(400).json({ error: 'Zona de envio inválida.' });
    }

    // Carregar produtos do Supabase storage/API não existe — lemos products.json via fetch
    // (em Vercel, podemos ler ficheiros estáticos com fs)
    const fs = require('fs');
    const path = require('path');
    const productsPath = path.join(process.cwd(), 'data', 'products.json');
    const products = JSON.parse(fs.readFileSync(productsPath, 'utf8'));

    // Validar cada item e calcular preços do servidor (nunca confiar no cliente)
    const lineItems = [];
    let subtotal = 0;

    for (const item of items) {
      const product = products.find(p => p.id === item.product_id);
      if (!product || !product.available) {
        return res.status(400).json({ error: `Produto "${item.product_id}" indisponível.` });
      }

      const qty = Math.max(1, Math.min(99, parseInt(item.quantity) || 1));
      const unitPrice = product.price; // cêntimos (server-authoritative)

      // Validar variante se o produto tem variantes
      if (product.variants && product.variants.length > 0) {
        const variantId = item.variant;
        const variant = product.variants.find(v => v.id === variantId && v.available);
        if (!variant) {
          return res.status(400).json({ error: `Variante inválida para "${product.name}".` });
        }
      }

      const variantLabel = item.variant && item.variant !== 'sem-variante' ? ` (${item.variant})` : '';
      subtotal += unitPrice * qty;

      if (unitPrice > 0) {
        lineItems.push({
          price_data: {
            currency: 'eur',
            product_data: {
              name: `${product.name}${variantLabel}`,
              images: product.images && product.images[0]
                ? [`https://praiasfluviais.pt/${product.images[0]}`]
                : [],
            },
            unit_amount: unitPrice,
          },
          quantity: qty,
        });
      } else {
        // Produto grátis — adicionar como line item a 0 não funciona no Stripe
        // Incluir no nome do envio ou ignorar (shipping cobre o custo)
        lineItems.push({
          price_data: {
            currency: 'eur',
            product_data: {
              name: `${product.name}${variantLabel} (Grátis — pagas apenas portes)`,
              images: product.images && product.images[0]
                ? [`https://praiasfluviais.pt/${product.images[0]}`]
                : [],
            },
            unit_amount: 1, // Stripe não aceita 0 — cobrar 1 cêntimo simbólico e ajustar no shipping
          },
          quantity: qty,
        });
        subtotal += qty; // adicionar 1 cêntimo por item grátis ao subtotal real
      }
    }

    // Calcular envio (server-side)
    let shippingPrice = 0;
    const hasPhysical = items.some(item => {
      const p = products.find(pr => pr.id === item.product_id);
      return p && p.shippingRequired;
    });

    if (hasPhysical) {
      shippingPrice = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : (SHIPPING[shipping_zone] || SHIPPING.mainland);
    }

    // Line item de envio (se houver custo)
    if (shippingPrice > 0) {
      lineItems.push({
        price_data: {
          currency: 'eur',
          product_data: {
            name: `Envio — ${shipping_zone === 'ilhas' ? 'Açores / Madeira' : 'Portugal Continental'}`,
          },
          unit_amount: shippingPrice,
        },
        quantity: 1,
      });
    }

    // Metadata para o webhook
    const metadata = {
      user_id: user_id || '',
      shipping_zone,
      shipping_price: String(shippingPrice),
      subtotal: String(subtotal),
      items_json: JSON.stringify(items.map(item => {
        const p = products.find(pr => pr.id === item.product_id);
        return {
          product_id: item.product_id,
          variant: item.variant || 'sem-variante',
          quantity: item.quantity,
          price: p?.price ?? 0,
          name: p?.name ?? item.product_id
        };
      }))
    };

    // Criar Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      currency: 'eur',
      billing_address_collection: 'required',
      shipping_address_collection: {
        allowed_countries: ['PT'], // Apenas Portugal
      },
      customer_email: user_id ? undefined : undefined, // Stripe pede email se não houver customer
      locale: 'pt',
      metadata,
      success_url: `${BASE_URL}/confirmacao-pedido.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/carrinho.html`,
      payment_method_types: ['card', 'mbway', 'multibanco'],
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[create-checkout-session] Erro:', err);
    return res.status(500).json({ error: 'Erro interno. Tenta novamente.' });
  }
};
