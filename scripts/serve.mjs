// Local preview of the published site. Serves public/ exactly as Netlify would: static files only,
// unknown paths fall back to index.html, no API routes. If a page works here it works published.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = Number(process.env.PORT || 4321);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

http
  .createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    // Resolve inside ROOT, then confirm it stayed there: a path like /../.env must not escape.
    let file = path.resolve(ROOT, `.${url}`);
    if (!file.startsWith(ROOT)) file = path.join(ROOT, 'index.html');
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) file = path.join(ROOT, 'index.html'); // Netlify's SPA fallback

    const body = fs.readFileSync(file);
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Content-Length': body.length,
      'X-Content-Type-Options': 'nosniff',
      // Preview only: never cache, so an edit is visible on the next reload without a hard refresh.
      'Cache-Control': 'no-store',
    });
    res.end(body);
  })
  .listen(PORT, () => {
    console.log(`\n  Preview:  http://localhost:${PORT}\n  Serving:  ${ROOT}\n  Stop:     Ctrl+C\n`);
  });
