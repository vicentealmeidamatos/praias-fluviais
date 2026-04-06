// api/create-checkout-session.js — Vercel Serverless Function

import Stripe from 'stripe';
import { readFileSync } from 'fs';
import { join } from 'path';

// Stripe Shipping Rate IDs (criados no Dashboard)
const SHIPPING_RATES = {
  mainland: 'shr_1TJJ8KFnlHn9HhlC5NJ5EqDY', // Portugal Continental — 3,90€
  ilhas:    'shr_1TJJ5oFnlHn9HhlCDKm1Wpwh', // Arquipélagos — 4,90€
};

// Acima deste valor (cêntimos) o envio é grátis
const FREE_SHIPPING_THRESHOLD = 3000; // 30,00€

// URL base do site
const BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'https://praiasfluviais.pt';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const { items, user_id } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Carrinho vazio.' });
    }

    // Ler produtos do ficheiro (server-authoritative)
    const products = JSON.parse(readFileSync(join(process.cwd(), 'data', 'products.json'), 'utf8'));

    const lineItems = [];
    let subtotal = 0;

    for (const item of items) {
      const product = products.find(p => p.id === item.product_id);
      if (!product || !product.available) {
        return res.status(400).json({ error: `Produto "${item.product_id}" indisponível.` });
      }

      // Validar variante
      if (product.variants && product.variants.length > 0) {
        const variant = product.variants.find(v => v.id === item.variant && v.available);
        if (!variant) {
          return res.status(400).json({ error: `Variante inválida para "${product.name}".` });
        }
      }

      const qty = Math.max(1, Math.min(99, parseInt(item.quantity) || 1));
      const unitPrice = product.price;
      const variantLabel = item.variant && item.variant !== 'sem-variante' ? ` (${item.variant})` : '';

      subtotal += unitPrice * qty;

      // Stripe não aceita unit_amount = 0; produtos grátis usam 1 cêntimo simbólico
      lineItems.push({
        price_data: {
          currency: 'eur',
          product_data: {
            name: `${product.name}${variantLabel}`,
            images: product.images?.[0] ? [`https://praiasfluviais.pt/${product.images[0]}`] : [],
          },
          unit_amount: unitPrice > 0 ? unitPrice : 1,
        },
        quantity: qty,
      });
    }

    // Metadata para o webhook
    const metadata = {
      user_id: user_id || '',
      subtotal: String(subtotal),
      items_json: JSON.stringify(items.map(item => {
        const p = products.find(pr => pr.id === item.product_id);
        return {
          product_id: item.product_id,
          variant: item.variant || 'sem-variante',
          quantity: item.quantity,
          price: p?.price ?? 0,
          name: p?.name ?? item.product_id,
        };
      })),
    };

    // Determinar opções de envio — grátis se subtotal >= 30€
    const shippingOptions = subtotal >= FREE_SHIPPING_THRESHOLD
      ? [
          {
            shipping_rate_data: {
              type: 'fixed_amount',
              fixed_amount: { amount: 0, currency: 'eur' },
              display_name: 'Envio grátis',
              delivery_estimate: {
                minimum: { unit: 'business_day', value: 2 },
                maximum: { unit: 'business_day', value: 5 },
              },
            },
          },
        ]
      : [
          { shipping_rate: SHIPPING_RATES.mainland },
          { shipping_rate: SHIPPING_RATES.ilhas },
        ];

    // Criar Checkout Session — Stripe gere o envio e códigos promocionais
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      shipping_address_collection: {
        allowed_countries: ['PT'],
      },
      shipping_options: shippingOptions,
      allow_promotion_codes: true,
      locale: 'pt',
      metadata,
      success_url: `${BASE_URL}/confirmacao-pedido.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/carrinho.html`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[create-checkout-session] Erro:', err);
    return res.status(500).json({ error: 'Erro interno. Tenta novamente.' });
  }
}
