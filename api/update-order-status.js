import { createClient } from '@supabase/supabase-js';

const VALID_STATUSES = ['pendente', 'processado', 'enviado', 'entregue'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Configuração do servidor em falta' });
  }

  let body = req.body;
  if (!body || typeof body === 'string') {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'JSON inválido' });
    }
  }

  const updates = body?.updates;
  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ error: 'Campo "updates" (array) em falta' });
  }

  // Validate all entries
  for (const u of updates) {
    if (!u.id || typeof u.id !== 'string') {
      return res.status(400).json({ error: `ID inválido: ${u.id}` });
    }
    if (!VALID_STATUSES.includes(u.status)) {
      return res.status(400).json({ error: `Estado inválido: ${u.status}` });
    }
  }

  const sb = createClient(supabaseUrl, serviceKey);

  const results = [];
  let errors = 0;

  for (const u of updates) {
    const { error } = await sb
      .from('orders')
      .update({ status: u.status })
      .eq('id', u.id);

    if (error) {
      errors++;
      results.push({ id: u.id, ok: false, error: error.message });
    } else {
      results.push({ id: u.id, ok: true });
    }
  }

  const status = errors === updates.length ? 500 : 200;
  return res.status(status).json({ ok: errors === 0, results, errors });
}
