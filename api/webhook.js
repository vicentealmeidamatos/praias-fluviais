// api/webhook.js — Vercel Serverless Function
// Processa eventos do Stripe Checkout e guarda encomendas no Supabase.

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const config = {
  api: { bodyParser: false },
};

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

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
    await handleCheckoutComplete(session, supabase);
  }

  return res.status(200).json({ received: true });
}

async function handleCheckoutComplete(session, supabase) {
  try {
    const metadata = session.metadata || {};
    const userId = metadata.user_id || null;
    const subtotal = parseInt(metadata.subtotal || '0', 10);
    const shippingPrice = session.shipping_cost?.amount_total ?? 0;
    const total = session.amount_total ?? (subtotal + shippingPrice);

    // Determinar zona pelo shipping rate ID
    const shippingRateId = session.shipping_cost?.shipping_rate;
    const shippingZone = shippingRateId === 'shr_1TJJ5oFnlHn9HhlCDKm1Wpwh' ? 'ilhas' : 'mainland';

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

    // Criar fatura no InvoiceXpress (se configurado)
    if (process.env.INVOICEXPRESS_ACCOUNT && process.env.INVOICEXPRESS_API_KEY) {
      try {
        await createInvoiceXpressInvoice({
          email,
          customerName: session.customer_details?.name || shippingAddress.name || 'Cliente',
          taxId: extractTaxId(session),
          billingAddress: session.customer_details?.address || shippingAddress,
          items,
          shippingPrice,
          sessionId: session.id,
        });
      } catch (invErr) {
        console.error('[webhook] Erro ao criar fatura InvoiceXpress:', invErr);
      }
    }

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

// ─── InvoiceXpress ────────────────────────────────────────────────────────────

function extractTaxId(session) {
  // 1. Tax ID oficial (quando o cliente marca "Estou comprando como empresa")
  const officialTaxId = session.customer_details?.tax_ids?.[0]?.value;
  if (officialTaxId) return officialTaxId.replace(/^PT/i, '').trim();

  // 2. Custom field NIF (particulares)
  const nifField = session.custom_fields?.find(f => f.key === 'nif');
  if (nifField?.text?.value) return nifField.text.value.trim();

  return null;
}

async function createInvoiceXpressInvoice({ email, customerName, taxId, billingAddress, items, shippingPrice, sessionId }) {
  const account = process.env.INVOICEXPRESS_ACCOUNT;
  const apiKey = process.env.INVOICEXPRESS_API_KEY;
  const baseUrl = `https://${account}.app.invoicexpress.com`;

  // 1. Criar/atualizar cliente
  const clientPayload = {
    client: {
      name: customerName,
      email,
      address: [billingAddress.line1, billingAddress.line2].filter(Boolean).join(', '),
      city: billingAddress.city || '',
      postal_code: billingAddress.postal_code || '',
      country: 'Portugal',
      fiscal_id: taxId || '999999990', // 999999990 = consumidor final
      language: 'pt',
      send_options: 'email',
    },
  };

  const clientRes = await fetch(`${baseUrl}/clients.json?api_key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(clientPayload),
  });

  // Se já existe (422), procurar por nome ou continuar
  let clientId;
  if (clientRes.ok) {
    const data = await clientRes.json();
    clientId = data.client?.id;
  } else if (clientRes.status === 422) {
    // Procurar cliente existente por nome
    const findRes = await fetch(`${baseUrl}/clients/find-by-name.json?api_key=${apiKey}&client_name=${encodeURIComponent(customerName)}`);
    if (findRes.ok) {
      const data = await findRes.json();
      clientId = data.client?.id;
    }
  }

  if (!clientId) {
    throw new Error('Não foi possível criar/encontrar cliente no InvoiceXpress');
  }

  // 2. Criar fatura-recibo
  const invoiceItems = items.map(item => ({
    name: `${item.name}${item.variant && item.variant !== 'sem-variante' ? ` (${item.variant})` : ''}`,
    unit_price: ((item.price > 0 ? item.price : 0) / 100).toFixed(2),
    quantity: item.quantity,
    tax: { name: 'IVA23', value: 23 },
  }));

  // Adicionar portes como item se houver
  if (shippingPrice > 0) {
    invoiceItems.push({
      name: 'Portes de envio',
      unit_price: (shippingPrice / 100).toFixed(2),
      quantity: 1,
      tax: { name: 'IVA23', value: 23 },
    });
  }

  const today = new Date().toISOString().split('T')[0];
  const invoicePayload = {
    invoice_receipt: {
      date: today,
      due_date: today,
      client: { id: clientId },
      items: invoiceItems,
      observations: `Pedido Stripe: ${sessionId}`,
    },
  };

  const invoiceRes = await fetch(`${baseUrl}/invoice_receipts.json?api_key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(invoicePayload),
  });

  if (!invoiceRes.ok) {
    const errText = await invoiceRes.text();
    throw new Error(`InvoiceXpress create failed (${invoiceRes.status}): ${errText}`);
  }

  const invoiceData = await invoiceRes.json();
  const invoiceId = invoiceData.invoice_receipt?.id;
  console.log('[webhook] Fatura InvoiceXpress criada:', invoiceId);

  // 3. Finalizar (state: finalized) e enviar por email
  if (invoiceId) {
    await fetch(`${baseUrl}/invoice_receipts/${invoiceId}/change-state.json?api_key=${apiKey}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ invoice_receipt: { state: 'finalized' } }),
    });

    await fetch(`${baseUrl}/invoice_receipts/${invoiceId}/email-document.json?api_key=${apiKey}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        message: {
          client: { email, save: '0' },
          subject: 'A sua fatura — Guia das Praias Fluviais',
          body: 'Obrigado pela sua encomenda! Em anexo segue a fatura.',
        },
      }),
    });
  }
}
