import { createServer } from 'http';
import { readFile, stat, writeFile, mkdir } from 'fs/promises';
import { join, extname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

const ALLOWED_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']);

const server = createServer(async (req, res) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Filename',
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  let url = decodeURIComponent(req.url.split('?')[0]);

  // ─── Image Upload Endpoint ───
  if (req.method === 'POST' && url === '/api/upload') {
    try {
      const rawName = req.headers['x-filename'] || ('upload_' + Date.now());
      const safeName = basename(rawName).replace(/[^a-zA-Z0-9._\-]/g, '_');
      const ext = extname(safeName).toLowerCase();

      if (!ALLOWED_IMAGE_EXTS.has(ext)) {
        res.writeHead(400, { 'Content-Type': 'application/json', ...CORS });
        res.end(JSON.stringify({ error: 'Formato de ficheiro não permitido.' }));
        return;
      }

      const uploadDir = join(__dirname, 'img', 'uploads');
      await mkdir(uploadDir, { recursive: true });

      // Unique filename to avoid collisions
      const unique = Date.now() + '_' + safeName;
      const dest = join(uploadDir, unique);

      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      await writeFile(dest, Buffer.concat(chunks));

      res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
      res.end(JSON.stringify({ path: `img/uploads/${unique}`, name: unique }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json', ...CORS });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ─── Static File Server ───
  if (url === '/') url = '/index.html';
  const filePath = join(__dirname, url);

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      const indexPath = join(filePath, 'index.html');
      await stat(indexPath);
      const data = await readFile(indexPath);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...CORS });
      res.end(data);
      return;
    }

    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const data = await readFile(filePath);

    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache', ...CORS });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>404 - Ficheiro não encontrado</h1>');
  }
});

server.listen(PORT, () => {
  console.log(`Servidor ativo em http://localhost:${PORT}`);
  console.log(`Upload de imagens: POST http://localhost:${PORT}/api/upload`);
});
