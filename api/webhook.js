// api/webhook.js — Vercel Serverless Function
// Processa eventos do Stripe Checkout e guarda encomendas no Supabase.

// Desativar o bodyParser do Vercel para receber o body raw (necessário para verificar assinatura Stripe)
module.exports.config = {
  api: { bodyParser: false },
};

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Helper: ler body raw como Buffer
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  let event;

  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers['stripe-signature'];

    event = stripe.webhooks.constructEvent(rawBody, signature, WEBHOOK_SECRET);
  } catch (err) {
    console.error('[webhook] Assinatura inválida:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  // Processar evento
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    await handleCheckoutComplete(session);
  }

  return res.status(200).json({ received: true });
};

async function handleCheckoutComplete(session) {
  try {
    const metadata = session.metadata || {};
    const userId = metadata.user_id || null;
    const shippingZone = metadata.shipping_zone || 'mainland';
    const shippingPrice = parseInt(metadata.shipping_price || '0', 10);
    const subtotal = parseInt(metadata.subtotal || '0', 10);
    const total = session.amount_total || (subtotal + shippingPrice);

    // Parse items
    let items = [];
    try {
      items = JSON.parse(metadata.items_json || '[]');
    } catch {
      items = [];
    }

    // Endereço de envio
    const shippingDetails = session.shipping_details || {};
    const shippingAddress = {
      name: shippingDetails.name || session.customer_details?.name || '',
      line1: shippingDetails.address?.line1 || '',
      line2: shippingDetails.address?.line2 || '',
      city: shippingDetails.address?.city || '',
      postal_code: shippingDetails.address?.postal_code || '',
      country: shippingDetails.address?.country || 'PT',
    };

    const email = session.customer_details?.email || session.customer_email || '';

    // Verificar se já existe (idempotência)
    const { data: existing } = await supabase
      .from('orders')
      .select('id')
      .eq('stripe_session_id', session.id)
      .single();

    if (existing) {
      console.log('[webhook] Encomenda já existe:', session.id);
      return;
    }

    // Inserir encomenda
    const { error: insertError } = await supabase.from('orders').insert({
      user_id: userId || null,
      email,
      stripe_session_id: session.id,
      stripe_payment_intent_id: session.payment_intent || null,
      status: 'processado',
      items,
      shipping_address: shippingAddress,
      shipping_zone: shippingZone,
      shipping_price: shippingPrice,
      subtotal,
      total,
    });

    if (insertError) {
      console.error('[webhook] Erro ao inserir encomenda:', insertError);
      return;
    }

    console.log('[webhook] Encomenda guardada:', session.id);

    // Limpar carrinho do utilizador (se tiver sessão)
    if (userId) {
      const { error: deleteError } = await supabase
        .from('cart_items')
        .delete()
        .eq('user_id', userId);

      if (deleteError) {
        console.error('[webhook] Erro ao limpar carrinho:', deleteError);
      } else {
        console.log('[webhook] Carrinho limpo para user:', userId);
      }
    }
  } catch (err) {
    console.error('[webhook] Erro ao processar checkout.session.completed:', err);
  }
}
