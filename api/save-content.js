import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Configuração do servidor em falta' });
  }
  const sb = createClient(supabaseUrl, serviceKey);

  // GET — list history
  if (req.method === 'GET') {
    const { data, error } = await sb
      .from('site_content_history')
      .select('id, note, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ history: data });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  // Body parse
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

  // Restore from history: { restoreId: <id> }
  if (body && body.restoreId) {
    const { data: snap, error: snapErr } = await sb
      .from('site_content_history')
      .select('data')
      .eq('id', body.restoreId)
      .single();
    if (snapErr || !snap) return res.status(404).json({ error: 'Versão não encontrada' });
    const { error: upErr } = await sb
      .from('site_content')
      .upsert({ id: 1, data: snap.data, updated_at: new Date().toISOString() });
    if (upErr) return res.status(500).json({ error: upErr.message });
    await sb.from('site_content_history').insert({ data: snap.data, note: `Restauro da versão #${body.restoreId}` });
    return res.status(200).json({ ok: true, restored: true, data: snap.data });
  }

  // Save new content
  const data = body && body.data;
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Payload "data" em falta' });
  }
  const note = (body.note || '').toString().slice(0, 200);

  const { error: upErr } = await sb
    .from('site_content')
    .upsert({ id: 1, data, updated_at: new Date().toISOString() });
  if (upErr) return res.status(500).json({ error: upErr.message });

  // Snapshot
  await sb.from('site_content_history').insert({ data, note: note || null });

  return res.status(200).json({ ok: true });
}
