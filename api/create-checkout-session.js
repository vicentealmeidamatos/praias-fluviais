// api/create-checkout-session.js — Vercel Serverless Function

import Stripe from 'stripe';
import { readFileSync } from 'fs';
import { join } from 'path';

// Acima deste valor (cêntimos) o envio é grátis
const FREE_SHIPPING_THRESHOLD = 3000; // 30,00€

// URL base do site — SITE_URL tem prioridade, depois produção Vercel, depois fallback
const BASE_URL = process.env.SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null)
  || 'https://praiasfluviais.pt';

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

    // Ler produtos e praias do ficheiro (server-authoritative)
    const products = JSON.parse(readFileSync(join(process.cwd(), 'data', 'products.json'), 'utf8'));
    let beaches = [];
    try { beaches = JSON.parse(readFileSync(join(process.cwd(), 'data', 'beaches.json'), 'utf8')); } catch {}
    const getBeachName = (id) => { const b = beaches.find(b => b.id === id); return b ? b.name : id; };

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
      const beachLabel = item.beach ? ` — ${getBeachName(item.beach)}` : '';

      subtotal += unitPrice * qty;

      // Stripe não aceita unit_amount = 0; produtos grátis usam 1 cêntimo simbólico
      lineItems.push({
        price_data: {
          currency: 'eur',
          product_data: {
            name: `${product.name}${beachLabel}${variantLabel}`,
            images: (() => {
              const img = product.images?.[0];
              if (!img) return [];
              if (img.startsWith('http://') || img.startsWith('https://')) return [img];
              return [`https://praiasfluviais.pt/${img}`];
            })(),
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
        const beachName = item.beach ? getBeachName(item.beach) : null;
        return {
          product_id: item.product_id,
          variant: item.variant || 'sem-variante',
          quantity: item.quantity,
          price: p?.price ?? 0,
          name: beachName ? `${p?.name ?? item.product_id} — ${beachName}` : (p?.name ?? item.product_id),
          beach: item.beach || null,
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
          {
            shipping_rate_data: {
              type: 'fixed_amount',
              fixed_amount: { amount: 390, currency: 'eur' },
              display_name: 'Portugal Continental',
              delivery_estimate: {
                minimum: { unit: 'business_day', value: 2 },
                maximum: { unit: 'business_day', value: 5 },
              },
            },
          },
          {
            shipping_rate_data: {
              type: 'fixed_amount',
              fixed_amount: { amount: 490, currency: 'eur' },
              display_name: 'Açores e Madeira',
              delivery_estimate: {
                minimum: { unit: 'business_day', value: 3 },
                maximum: { unit: 'business_day', value: 7 },
              },
            },
          },
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
      billing_address_collection: 'required',
      tax_id_collection: { enabled: true },
      customer_creation: 'always',
      custom_fields: [
        {
          key: 'nif',
          label: { type: 'custom', custom: 'NIF (opcional)' },
          type: 'text',
          optional: true,
          text: { minimum_length: 1, maximum_length: 20 },
        },
      ],
      locale: 'auto',
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
