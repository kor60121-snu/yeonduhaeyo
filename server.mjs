import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
try { process.loadEnvFile('.env.local'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const { default: scoresHandler } = await import('./api/scores.js');
const publicDir = resolve('public');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2' };

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/api/scores') {
    res.status = code => { res.statusCode = code; return res; };
    res.json = body => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(body)); };
    if (req.method === 'POST') {
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 2048) return res.status(413).json({ error: '요청이 너무 커요.' });
        chunks.push(chunk);
      }
      req.body = Buffer.concat(chunks).toString('utf8');
    }
    return scoresHandler(req, res);
  }
  const filename = resolve(publicDir, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!filename.startsWith(publicDir + sep)) { res.writeHead(403); res.end(); return; }
  try {
    const content = await readFile(filename);
    res.writeHead(200, { 'Content-Type': mime[extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(content);
  } catch { res.writeHead(404); res.end('Not found'); }
});
const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log(`연두해요 · Local: http://localhost:${port}`));
