import { createClient } from '@supabase/supabase-js';

// Whitelist of datasets and their Supabase table names.
// Each dataset maps to a `site_<name>` table + `site_<name>_history` table,
// matching the existing site_content / site_content_history pattern.
const DATASETS = {
  content:           { table: 'site_content',           history: 'site_content_history' },
  beaches:           { table: 'site_beaches',           history: 'site_beaches_history' },
  articles:          { table: 'site_articles',          history: 'site_articles_history' },
  locationsGuia:     { table: 'site_locations_guia',    history: 'site_locations_guia_history' },
  locationsCarimbo:  { table: 'site_locations_carimbo', history: 'site_locations_carimbo_history' },
  descontos:         { table: 'site_descontos',         history: 'site_descontos_history' },
  products:          { table: 'site_products',          history: 'site_products_history' },
  settings:          { table: 'site_settings',          history: 'site_settings_history' },
  layout:            { table: 'site_layout',            history: 'site_layout_history' },
};

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

  // Resolve dataset from query (GET) or body (POST)
  const dataset = (req.method === 'GET' ? req.query?.dataset : null);

  // ============ GET ============
  if (req.method === 'GET') {
    if (!dataset || !DATASETS[dataset]) {
      return res.status(400).json({ error: 'dataset inválido', allowed: Object.keys(DATASETS) });
    }
    const cfg = DATASETS[dataset];

    // History listing
    if (req.query?.history === '1') {
      const { data, error } = await sb
        .from(cfg.history)
        .select('id, note, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ history: data });
    }

    // Snapshot
    const { data, error } = await sb
      .from(cfg.table)
      .select('data, updated_at')
      .eq('id', 1)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'sem dados', empty: true });
    return res.status(200).json({ data: data.data, updated_at: data.updated_at });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  // ============ POST ============
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

  const ds = body?.dataset;
  if (!ds || !DATASETS[ds]) {
    return res.status(400).json({ error: 'dataset inválido', allowed: Object.keys(DATASETS) });
  }
  const cfg = DATASETS[ds];

  // Restore from history
  if (body.restoreId) {
    const { data: snap, error: snapErr } = await sb
      .from(cfg.history)
      .select('data')
      .eq('id', body.restoreId)
      .single();
    if (snapErr || !snap) return res.status(404).json({ error: 'Versão não encontrada' });
    const { error: upErr } = await sb
      .from(cfg.table)
      .upsert({ id: 1, data: snap.data, updated_at: new Date().toISOString() });
    if (upErr) return res.status(500).json({ error: upErr.message });
    await sb.from(cfg.history).insert({ data: snap.data, note: `Restauro da versão #${body.restoreId}` });
    return res.status(200).json({ ok: true, restored: true, data: snap.data });
  }

  // Save
  const data = body.data;
  if (typeof data === 'undefined') {
    return res.status(400).json({ error: 'Payload "data" em falta' });
  }
  const note = (body.note || '').toString().slice(0, 200);

  const { error: upErr } = await sb
    .from(cfg.table)
    .upsert({ id: 1, data, updated_at: new Date().toISOString() });
  if (upErr) return res.status(500).json({ error: upErr.message });

  await sb.from(cfg.history).insert({ data, note: note || null });

  return res.status(200).json({ ok: true });
}
