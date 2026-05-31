import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Filename, X-Folder');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  const contentType = req.headers['content-type'] || '';
  if (!contentType.startsWith('image/')) {
    return res.status(400).json({ error: 'Este ficheiro não é uma imagem.' });
  }

  const rawName  = req.headers['x-filename'] || `upload_${Date.now()}.jpg`;
  const folder   = req.headers['x-folder']   || 'misc';

  // Sanitize filename — keep alphanumeric, dots, dashes, underscores
  const safeName = rawName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 120);

  const storagePath = `${folder}/${Date.now()}_${safeName}`;

  // Read raw body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);

  if (buffer.length === 0) return res.status(400).json({ error: 'O ficheiro chegou vazio.' });
  if (buffer.length > 10 * 1024 * 1024) {
    return res.status(413).json({ error: 'Imagem demasiado grande. Reduza a resolução e tente outra vez.' });
  }

  // Upload to Supabase Storage
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Não foi possível guardar a imagem agora. Tente novamente em alguns segundos.' });
  }

  const sb = createClient(supabaseUrl, serviceKey);

  const { error: uploadError } = await sb.storage
    .from('media')
    .upload(storagePath, buffer, { contentType, upsert: false });

  if (uploadError) {
    console.error('[upload] Supabase error:', uploadError);
    return res.status(500).json({ error: 'Não foi possível guardar a imagem agora. Tente novamente em alguns segundos.' });
  }

  const { data: { publicUrl } } = sb.storage.from('media').getPublicUrl(storagePath);

  // Return shape matches what uploadImageFile() in admin.js expects:
  // json.path → used as src, json.name → display name
  return res.status(200).json({
    path: publicUrl,
    url:  publicUrl,
    name: safeName,
  });
}
