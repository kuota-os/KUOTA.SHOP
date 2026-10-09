// KUOTA en Docker: servidor Node sin dependencias que imita a Vercel (rewrites, redirects, cabeceras de vercel.json,
// archivos estáticos de public/ y las 2 funciones api/public.js y api/admin.js con req.query / res.status().json()).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const PUBLIC = path.join(ROOT, CFG.outputDirectory || 'public');
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json', txt: 'text/plain; charset=utf-8', xml: 'application/xml', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', ico: 'image/x-icon', woff2: 'font/woff2' };
const FUNCTIONS = {
  '/api/public': (await import('../api/public.js')).default,
  '/api/admin': (await import('../api/admin.js')).default
};
const toRegex = src => new RegExp('^' + src.replace(/\(\.\*\)/g, '(.*)').replace(/:([a-zA-Z]+)/g, '(?<$1>[^/]+)') + '$');
const REDIRECTS = (CFG.redirects || []).map(r => ({ ...r, re: toRegex(r.source) }));
const REWRITES = (CFG.rewrites || []).map(r => ({ ...r, re: toRegex(r.source) }));
const HEADERS = (CFG.headers || []).map(h => ({ ...h, re: toRegex(h.source) }));

function readBody(req) {
  const type = req.headers['content-type'] || '';
  if (!/json|urlencoded|text\/plain/.test(type)) return Promise.resolve(undefined); // multipart: se deja el stream intacto (busboy)
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > 4.5 * 1024 * 1024) { reject(new Error('BODY_TOO_LARGE')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { const raw = Buffer.concat(chunks).toString('utf8'); try { resolve(/json/.test(type) ? (raw ? JSON.parse(raw) : {}) : /urlencoded/.test(type) ? Object.fromEntries(new URLSearchParams(raw)) : raw); } catch { resolve({}); } });
    req.on('error', reject);
  });
}
function decorate(res) {
  res.status = c => { res.statusCode = c; return res; };
  res.json = o => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); return res; };
  res.send = b => { res.end(typeof b === 'string' || Buffer.isBuffer(b) ? b : JSON.stringify(b)); return res; };
  return res;
}
function serveFile(res, file) {
  res.setHeader('Content-Type', TYPES[path.extname(file).slice(1)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}

http.createServer(async (req, res) => {
  decorate(res);
  try {
    const url = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    for (const h of HEADERS) if (h.re.test(pathname)) for (const x of h.headers) res.setHeader(x.key, x.value);
    const red = REDIRECTS.find(r => r.re.test(pathname));
    if (red) { res.statusCode = red.permanent ? 308 : 307; res.setHeader('Location', red.destination); return res.end(); }
    let query = Object.fromEntries(url.searchParams);
    const rw = REWRITES.find(r => r.re.test(pathname));
    if (rw) {
      const g = pathname.match(rw.re).groups || {}; const dest = new URL(rw.destination.replace(/:([a-zA-Z]+)/g, (_, k) => g[k]), 'http://localhost');
      pathname = dest.pathname; query = { ...query, ...Object.fromEntries(dest.searchParams) };
    }
    if (FUNCTIONS[pathname]) {
      req.query = query; req.body = await readBody(req);
      return await FUNCTIONS[pathname](req, res);
    }
    if (pathname.startsWith('/api/')) { res.statusCode = 404; return res.json({ error: 'NOT_FOUND' }); }
    // estático: nunca salir de public/
    const clean = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    let file = path.join(PUBLIC, clean);
    if (!file.startsWith(PUBLIC)) { res.statusCode = 403; return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    else if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return serveFile(res, file);
    res.statusCode = 404; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end('No encontrado');
  } catch (e) {
    console.error('[KUOTA]', e);
    if (!res.headersSent) res.statusCode = 500;
    res.end(JSON.stringify({ error: 'SERVER_ERROR' }));
  }
}).listen(Number(process.env.PORT) || 3000, '0.0.0.0', () => console.log('KUOTA escuchando en el puerto ' + (process.env.PORT || 3000)));
