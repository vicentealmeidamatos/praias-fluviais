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
    await handleCheckoutComplete(session, supabase, stripe);
  }

  return res.status(200).json({ received: true });
}

async function handleCheckoutComplete(session, supabase, stripe) {
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

    // Endereço de envio — tentar múltiplos caminhos do Stripe
    // O campo varia conforme a versão da API: shipping_details, shipping, ou customer_details.address
    let shippingDetails = session.shipping_details || session.shipping || {};
    console.log('[webhook] shipping_details do evento:', JSON.stringify(shippingDetails));
    console.log('[webhook] customer_details:', JSON.stringify(session.customer_details));

    // Se o endereço não veio no evento, fazer retrieve com expand
    if (!shippingDetails.address?.line1 && stripe) {
      try {
        const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ['shipping_details', 'customer_details'],
        });
        console.log('[webhook] retrieve shipping_details:', JSON.stringify(fullSession.shipping_details));
        console.log('[webhook] retrieve shipping:', JSON.stringify(fullSession.shipping));
        console.log('[webhook] retrieve customer_details.address:', JSON.stringify(fullSession.customer_details?.address));
        shippingDetails = fullSession.shipping_details || fullSession.shipping || shippingDetails;
      } catch (e) {
        console.warn('[webhook] Não foi possível obter shipping_details completos:', e.message);
      }
    }

    // Fallback: usar customer_details.address (billing) se shipping estiver vazio
    const addr = shippingDetails.address || {};
    const fallbackAddr = session.customer_details?.address || {};
    const shippingAddress = {
      name: shippingDetails.name || session.customer_details?.name || '',
      line1: addr.line1 || fallbackAddr.line1 || '',
      line2: addr.line2 || fallbackAddr.line2 || '',
      city: addr.city || fallbackAddr.city || '',
      postal_code: addr.postal_code || fallbackAddr.postal_code || '',
      country: addr.country || fallbackAddr.country || 'PT',
    };
    console.log('[webhook] shippingAddress final:', JSON.stringify(shippingAddress));

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

    // Notificar admin por email (Resend)
    if (process.env.RESEND_API_KEY && process.env.ORDER_NOTIFICATION_EMAIL) {
      try {
        await sendOrderNotificationEmail({
          email, items, shippingAddress, shippingZone, shippingPrice, subtotal, total,
          sessionId: session.id,
          customerName: shippingAddress.name || session.customer_details?.name || 'Cliente',
        });
      } catch (mailErr) {
        console.error('[webhook] Erro ao enviar email de notificação:', mailErr);
      }
    }

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
  console.log('[webhook] extractTaxId — customer_details.tax_ids:', JSON.stringify(session.customer_details?.tax_ids));
  console.log('[webhook] extractTaxId — custom_fields:', JSON.stringify(session.custom_fields));

  // 1. Tax ID oficial (quando o cliente marca "Estou comprando como empresa")
  const officialTaxId = session.customer_details?.tax_ids?.[0]?.value;
  if (officialTaxId) {
    const cleaned = officialTaxId.replace(/^PT/i, '').trim();
    console.log('[webhook] extractTaxId → usando tax_id de empresa:', cleaned);
    return cleaned;
  }

  // 2. Custom field NIF (particulares) — limpar espaços, prefixo PT, etc.
  const nifField = session.custom_fields?.find(f => f.key === 'nif');
  if (nifField?.text?.value) {
    const cleaned = nifField.text.value.replace(/[^0-9]/g, '').trim();
    if (cleaned) {
      console.log('[webhook] extractTaxId → usando custom_field NIF (particular):', cleaned);
      return cleaned;
    }
  }

  console.log('[webhook] extractTaxId → nenhum NIF fornecido, será consumidor final');
  return null;
}

// ISO country code → nome PT (InvoiceXpress aceita nomes)
const COUNTRY_NAMES = {
  PT: 'Portugal', ES: 'Espanha', FR: 'França', DE: 'Alemanha', IT: 'Itália',
  GB: 'Reino Unido', UK: 'Reino Unido', BE: 'Bélgica', NL: 'Holanda',
  LU: 'Luxemburgo', CH: 'Suíça', US: 'Estados Unidos', BR: 'Brasil',
  IE: 'Irlanda', AT: 'Áustria', SE: 'Suécia', DK: 'Dinamarca', NO: 'Noruega',
  FI: 'Finlândia', PL: 'Polónia', CZ: 'República Checa', AO: 'Angola',
  CV: 'Cabo Verde', MZ: 'Moçambique',
};

async function createInvoiceXpressInvoice({ email, customerName, taxId, billingAddress, items, shippingPrice, sessionId }) {
  const account = process.env.INVOICEXPRESS_ACCOUNT;
  const apiKey = process.env.INVOICEXPRESS_API_KEY;
  const baseUrl = `https://${account}.app.invoicexpress.com`;

  const effectiveFiscalId = taxId || '999999990'; // 999999990 = consumidor final
  const countryName = COUNTRY_NAMES[(billingAddress.country || 'PT').toUpperCase()] || 'Portugal';
  // Usamos o email como código do cliente — estável, único e deixa o
  // campo "NIF" do IX (fiscal_id) livre para o NIF real.
  const clientCode = (email || `cliente-${Date.now()}`).toLowerCase();

  const clientPayload = {
    client: {
      name: customerName,
      code: clientCode,
      email: email || '',
      address: [billingAddress.line1, billingAddress.line2].filter(Boolean).join(', '),
      city: billingAddress.city || '',
      postal_code: billingAddress.postal_code || '',
      country: countryName,
      fiscal_id: effectiveFiscalId,
      language: 'pt',
      send_options: 2,
    },
  };

  let clientId;

  // 1. Procurar cliente existente pelo email (clientCode)
  try {
    const findRes = await fetch(
      `${baseUrl}/clients/find-by-code.json?api_key=${apiKey}&client_code=${encodeURIComponent(clientCode)}`,
      { headers: { Accept: 'application/json' } }
    );
    if (findRes.ok) {
      const data = await findRes.json();
      clientId = data.client?.id;
      if (clientId) console.log('[webhook] Cliente InvoiceXpress encontrado por email:', clientId);
    }
  } catch (e) {
    console.log('[webhook] find-by-code(email) falhou (ignorado):', e.message);
  }

  // 2. Fallback: procurar por nome (compatibilidade com clientes antigos)
  if (!clientId) {
    try {
      const findRes = await fetch(
        `${baseUrl}/clients/find-by-name.json?api_key=${apiKey}&client_name=${encodeURIComponent(customerName)}`,
        { headers: { Accept: 'application/json' } }
      );
      if (findRes.ok) {
        const data = await findRes.json();
        clientId = data.client?.id;
        if (clientId) console.log('[webhook] Cliente InvoiceXpress encontrado por nome:', clientId);
      }
    } catch (e) {
      console.log('[webhook] find-by-name falhou (ignorado):', e.message);
    }
  }

  // 3. Criar se não existe
  if (!clientId) {
    let clientRes = await fetch(`${baseUrl}/clients.json?api_key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(clientPayload),
    });
    let clientBody = await clientRes.text();
    console.log('[webhook] POST /clients.json →', clientRes.status, clientBody.slice(0, 300));

    // Fallback: NIF inválido → tentar como consumidor final
    if (!clientRes.ok && /Contribuinte não é válido|fiscal_id/i.test(clientBody) && clientPayload.client.fiscal_id !== '999999990') {
      console.log('[webhook] NIF inválido, refazendo como consumidor final');
      clientPayload.client.fiscal_id = '999999990';
      clientRes = await fetch(`${baseUrl}/clients.json?api_key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(clientPayload),
      });
      clientBody = await clientRes.text();
      console.log('[webhook] POST /clients.json (retry) →', clientRes.status, clientBody.slice(0, 300));
    }

    if (clientRes.ok) {
      try { clientId = JSON.parse(clientBody).client?.id; } catch {}
    }
  } else {
    // 4. Sempre PUT para garantir email, NIF, morada e país actualizados
    try {
      const updateRes = await fetch(
        `${baseUrl}/clients/${clientId}.json?api_key=${apiKey}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(clientPayload),
        }
      );
      const updateBody = await updateRes.text();
      console.log('[webhook] PUT /clients/' + clientId + ' →', updateRes.status, updateBody.slice(0, 200));
    } catch (e) {
      console.log('[webhook] PUT cliente falhou (ignorado):', e.message);
    }
  }

  if (!clientId) {
    throw new Error(`Não foi possível criar/encontrar cliente no InvoiceXpress (account=${account}, name=${customerName}, code=${clientCode}). Verifica os logs POST/PUT acima e o limite de documentos da conta IX.`);
  }

  // 2. Criar fatura-recibo — preços do site já incluem IVA, dividir por 1.23
  const VAT = 1.23;
  const invoiceItems = items.map(item => ({
    name: `${item.name}${item.variant && item.variant !== 'sem-variante' ? ` (${item.variant})` : ''}`,
    unit_price: ((item.price > 0 ? item.price : 0) / 100 / VAT).toFixed(4),
    quantity: item.quantity,
    tax: { name: 'IVA23', value: 23 },
  }));

  if (shippingPrice > 0) {
    invoiceItems.push({
      name: 'Portes de envio',
      unit_price: (shippingPrice / 100 / VAT).toFixed(4),
      quantity: 1,
      tax: { name: 'IVA23', value: 23 },
    });
  }

  const today = new Date().toISOString().split('T')[0];
  const invoicePayload = {
    invoice_receipt: {
      date: today,
      due_date: today,
      client: { name: customerName, code: clientCode },
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

  // Modo teste: deixar como draft (sem valor fiscal, sem envio de email, pode apagar-se)
  if (process.env.INVOICEXPRESS_TEST_MODE === 'true') {
    console.log('[webhook] INVOICEXPRESS_TEST_MODE=true → fatura fica como rascunho (não finalizada, não enviada)');
    return;
  }

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

// ─── Notificação de nova encomenda por email (Resend) ────────────────────────

async function sendOrderNotificationEmail({ email, items, shippingAddress, shippingZone, shippingPrice, subtotal, total, sessionId, customerName }) {
  function fmtPrice(cents) { return (cents / 100).toFixed(2).replace('.', ',') + '€'; }

  const addr = shippingAddress || {};
  const addrParts = [addr.line1, addr.line2, [addr.postal_code, addr.city].filter(Boolean).join(' ')].filter(Boolean);
  const zone = shippingZone === 'ilhas' ? 'Açores / Madeira' : 'Portugal Continental';
  const date = new Date().toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const totalItems = (items || []).reduce((s, i) => s + i.quantity, 0);

  const itemsHtml = (items || []).map(i =>
    `<tr>
      <td style="padding:14px 16px;border-bottom:1px solid #E8E4DE;font-family:'Open Sans',Helvetica,Arial,sans-serif;font-size:14px;color:#2D2820;">
        ${i.name}${i.variant && i.variant !== 'sem-variante' ? `<br><span style="font-size:12px;color:#8B8578;">${i.variant}</span>` : ''}
      </td>
      <td style="padding:14px 16px;border-bottom:1px solid #E8E4DE;text-align:center;font-family:'Open Sans',Helvetica,Arial,sans-serif;font-size:14px;color:#2D2820;font-weight:600;">${i.quantity}</td>
      <td style="padding:14px 16px;border-bottom:1px solid #E8E4DE;text-align:right;font-family:'Open Sans',Helvetica,Arial,sans-serif;font-size:14px;color:#003A40;font-weight:700;">${i.price === 0 ? 'Grátis' : fmtPrice(i.price * i.quantity)}</td>
    </tr>`
  ).join('');

  const html = `
<!DOCTYPE html>
<html lang="pt-PT">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#F0EDE8;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#F0EDE8;">
    <tr><td style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:580px;margin:0 auto;">

        <!-- Header -->
        <tr><td style="background:#003A40;padding:32px 36px;border-radius:16px 16px 0 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td>
                <p style="margin:0;font-family:'Poppins',Helvetica,Arial,sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:2px;color:rgba(255,255,255,0.5);">Nova encomenda</p>
                <h1 style="margin:6px 0 0;font-family:'Poppins',Helvetica,Arial,sans-serif;font-size:26px;font-weight:800;color:#FFEB3B;line-height:1.2;">
                  ${fmtPrice(total)}
                </h1>
                <p style="margin:8px 0 0;font-family:'Open Sans',Helvetica,Arial,sans-serif;font-size:13px;color:rgba(255,255,255,0.6);">${date}</p>
              </td>
              <td style="text-align:right;vertical-align:top;">
                <div style="display:inline-block;background:#FFEB3B;color:#003A40;font-family:'Poppins',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:6px 14px;border-radius:20px;">
                  ${totalItems} ${totalItems === 1 ? 'item' : 'itens'}
                </div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#FFFFFF;padding:0;">

          <!-- Customer & Address -->
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-bottom:1px solid #E8E4DE;">
            <tr>
              <!-- Cliente -->
              <td style="padding:28px 36px;width:50%;vertical-align:top;border-right:1px solid #E8E4DE;">
                <p style="margin:0 0 6px;font-family:'Poppins',Helvetica,Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#8B8578;">Cliente</p>
                <p style="margin:0;font-family:'Poppins',Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#003A40;">${customerName}</p>
                <p style="margin:4px 0 0;font-family:'Open Sans',Helvetica,Arial,sans-serif;font-size:13px;color:#5A5548;">
                  <a href="mailto:${email}" style="color:#0288D1;text-decoration:none;">${email}</a>
                </p>
              </td>
              <!-- Morada -->
              <td style="padding:28px 36px;width:50%;vertical-align:top;">
                <p style="margin:0 0 6px;font-family:'Poppins',Helvetica,Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#8B8578;">Envio</p>
                <p style="margin:0;font-family:'Open Sans',Helvetica,Arial,sans-serif;font-size:13px;color:#2D2820;line-height:1.6;">
                  ${addr.name ? `<strong>${addr.name}</strong><br>` : ''}${addrParts.join('<br>')}${addr.country ? `<br>${addr.country}` : ''}
                </p>
                <p style="margin:8px 0 0;">
                  <span style="display:inline-block;background:${shippingZone === 'ilhas' ? '#E3F2FD' : '#E8F5E9'};color:${shippingZone === 'ilhas' ? '#0288D1' : '#43A047'};font-family:'Poppins',Helvetica,Arial,sans-serif;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;padding:3px 10px;border-radius:10px;">
                    ${zone}
                  </span>
                </p>
              </td>
            </tr>
          </table>

          <!-- Items -->
          <div style="padding:0 36px 28px;">
            <p style="margin:28px 0 14px;font-family:'Poppins',Helvetica,Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#8B8578;">Detalhes da encomenda</p>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
              <thead>
                <tr>
                  <th style="padding:10px 16px;text-align:left;font-family:'Poppins',Helvetica,Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#8B8578;background:#FAF8F5;border-radius:8px 0 0 8px;">Produto</th>
                  <th style="padding:10px 16px;text-align:center;font-family:'Poppins',Helvetica,Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#8B8578;background:#FAF8F5;">Qtd</th>
                  <th style="padding:10px 16px;text-align:right;font-family:'Poppins',Helvetica,Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#8B8578;background:#FAF8F5;border-radius:0 8px 8px 0;">Preço</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>
          </div>

          <!-- Totals -->
          <div style="margin:0 36px 28px;background:#FAF8F5;border-radius:12px;padding:20px 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-family:'Open Sans',Helvetica,Arial,sans-serif;font-size:14px;">
              <tr>
                <td style="padding:4px 0;color:#5A5548;">Subtotal</td>
                <td style="padding:4px 0;text-align:right;color:#2D2820;font-weight:600;">${fmtPrice(subtotal)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#5A5548;">Envio</td>
                <td style="padding:4px 0;text-align:right;color:#2D2820;font-weight:600;">${shippingPrice === 0 ? '<span style="color:#43A047;">Grátis</span>' : fmtPrice(shippingPrice)}</td>
              </tr>
              <tr>
                <td colspan="2" style="padding:12px 0 0;">
                  <div style="border-top:2px solid #003A40;padding-top:12px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="font-family:'Poppins',Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:#003A40;">Total</td>
                        <td style="text-align:right;font-family:'Poppins',Helvetica,Arial,sans-serif;font-size:22px;font-weight:800;color:#003A40;">${fmtPrice(total)}</td>
                      </tr>
                    </table>
                  </div>
                </td>
              </tr>
            </table>
          </div>

          <!-- CTA -->
          <div style="padding:0 36px 32px;text-align:center;">
            <a href="https://praiasfluviais.pt/admin.html" style="display:inline-block;background:#003A40;color:#FFFFFF;font-family:'Poppins',Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;text-decoration:none;padding:14px 32px;border-radius:12px;">
              Gerir no painel admin →
            </a>
          </div>

        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#003A40;padding:20px 36px;border-radius:0 0 16px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="font-family:'Open Sans',Helvetica,Arial,sans-serif;font-size:11px;color:rgba(255,255,255,0.4);">
                Guia das Praias Fluviais — praiasfluviais.pt
              </td>
              <td style="text-align:right;font-family:'Open Sans',Helvetica,Arial,sans-serif;font-size:10px;color:rgba(255,255,255,0.25);">
                ${sessionId ? sessionId.slice(0, 24) + '…' : ''}
              </td>
            </tr>
          </table>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Praias Fluviais <noreply@praiasfluviais.pt>',
      to: [process.env.ORDER_NOTIFICATION_EMAIL],
      subject: `Nova encomenda — ${fmtPrice(total)} — ${customerName}`,
      html,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Resend ${resp.status}: ${err}`);
  }

  console.log('[webhook] Email de notificação enviado para:', process.env.ORDER_NOTIFICATION_EMAIL);
}
