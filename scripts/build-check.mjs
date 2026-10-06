// KUOTA check: estructura, sintaxis, seguridad estática y configuración de despliegue (sin red)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root = process.cwd();
const errors = [];
const fail = m => errors.push(m);
const exists = p => fs.existsSync(path.join(root, p));
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const walk = (dir, ext) => !exists(dir) ? [] : fs.readdirSync(path.join(root, dir), { recursive: true }).filter(f => ext.some(e => f.endsWith(e))).map(f => path.join(dir, f));

// 1) archivos imprescindibles
const required = ['vercel.json', 'package.json', '.env.example', 'README.md', 'DESPLIEGUE.md', 'docs/INFORMES.md', 'docs/AUTOANALISIS.md', '.vercelignore', '.gitignore',
  'public/index.html', 'public/app.js', 'public/events.js', 'public/styles.css', 'public/robots.txt', 'public/sitemap.xml',
  'public/admin/index.html', 'public/admin/admin.js', 'public/admin/admin.css', 'public/admin/admin-crm.js', 'public/admin/admin-reports.js', 'public/admin/admin-cartera.js', 'public/admin/admin-equipos.js',
  'api/public.js', 'api/admin.js', 'lib/supabase.js', 'lib/finance.js', 'lib/pricing.js', 'lib/crm.js', 'lib/reports.js', 'lib/cartera.js',
  'supabase/00_INSTALAR_TODO.sql', ...['01_base_catalogo', '02_ordenes', '03_login_clientes', '04_financiaciones', '05_seguridad_y_alineacion', '06_precios_admin', '07_solicitudes_crm', '08_informes', '09_retoma_cartera'].map(n => `supabase/${n}.sql`)];
for (const f of required) if (!exists(f)) fail(`Falta ${f}`);

// 2) sintaxis de todo el JavaScript
const js = [...walk('api', ['.js']), ...walk('server', ['.js']), ...walk('lib', ['.js']), ...walk('public', ['.js']), ...walk('scripts', ['.mjs'])];
for (const f of js) { try { execFileSync(process.execPath, ['--check', path.join(root, f)], { stdio: 'pipe' }); } catch { fail(`Error de sintaxis en ${f}`); } }

// 3) HTML: sin handlers inline (la CSP los bloquea) y scripts/estilos que sí existen
for (const f of ['public/index.html', 'public/admin/index.html']) {
  if (!exists(f)) continue;
  const html = read(f);
  if (/\son(click|change|input|submit|keyup|load)\s*=/.test(html)) fail(`${f}: handlers inline (la CSP los bloquea)`);
  if (/<script(?![^>]*\bsrc=)[^>]*>[^<]/i.test(html)) fail(`${f}: script inline (la CSP los bloquea)`);
  for (const m of html.matchAll(/(?:src|href)="(\/[^"#?]+\.(?:js|css))"/g)) if (!exists('public' + m[1])) fail(`${f}: referencia rota ${m[1]}`);
}
if (exists('public/admin/index.html') && !/noindex/.test(read('public/admin/index.html'))) fail('El admin debe tener noindex');
if (exists('public/index.html') && /href="\/admin/.test(read('public/index.html'))) fail('El sitio público no debe enlazar al admin');

// 4) vercel.json
try {
  const v = JSON.parse(read('vercel.json'));
  if (v.outputDirectory !== 'public') fail('vercel.json: outputDirectory debe ser "public"');
  if (!exists(v.outputDirectory)) fail('No existe la carpeta de salida');
  const rw = new Map((v.rewrites || []).map(r => [r.source, r.destination]));
  for (const s of ['/inicio', '/catalogo', '/contacto', '/soy-cliente']) if (rw.get(s) !== '/index.html') fail(`Falta rewrite de ${s}`);
  if (rw.get('/admin') !== '/admin/index.html') fail('Falta rewrite de /admin');
  if (!(v.redirects || []).some(r => r.source === '/' && r.destination === '/inicio')) fail('Falta redirección / -> /inicio');
  const hdr = JSON.stringify(v.headers || []);
  for (const k of ['Content-Security-Policy', 'Strict-Transport-Security', 'X-Robots-Tag']) if (!hdr.includes(k)) fail(`Falta cabecera ${k}`);
} catch (e) { fail('vercel.json inválido: ' + e.message); }

// 5) package.json: dependencias que usa el backend
const pkg = JSON.parse(read('package.json'));
for (const f of [...walk('api', ['.js']), ...walk('server', ['.js']), ...walk('lib', ['.js'])]) {
  for (const m of read(f).matchAll(/from\s+'([^'.][^']*)'/g)) {
    const name = m[1].startsWith('@') ? m[1].split('/').slice(0, 2).join('/') : m[1].split('/')[0];
    if (!name.startsWith('node:') && !(pkg.dependencies || {})[name]) fail(`${f}: dependencia "${name}" no está en package.json`);
  }
}
if (pkg.scripts?.build) fail('package.json no debe tener script "build" (haría que Vercel busque otra carpeta)');

// 5b) Límite de Vercel Hobby: máximo 12 funciones por despliegue (cada archivo dentro de api/ cuenta como una)
const fnFiles = walk('api', ['.js', '.mjs', '.ts']);
if (fnFiles.length > 12) fail(`api/ tiene ${fnFiles.length} funciones; Vercel Hobby permite máximo 12`);
if (fnFiles.some(f => f.split(path.sep).length > 2)) fail('api/ no debe tener subcarpetas: cada archivo sería una función más');
// 5c) cada ruta /api/... que usa el navegador debe llegar a un endpoint real (vía los rewrites)
{
  const v = JSON.parse(read('vercel.json'));
  const rules = (v.rewrites || []).filter(r => r.source.includes(':fn')).map(r => ({ re: new RegExp('^' + r.source.replace(':fn', '([a-z0-9-]+)') + '$'), dest: r.destination }));
  const used = new Set();
  for (const f of walk('public', ['.js', '.html'])) { const t = read(f); for (const m of t.matchAll(/\/api\/((?:admin\/)?[a-z0-9-]+)(?!['"]?\s*\+)/g)) if (m[1] !== 'admin') used.add('/api/' + m[1]); for (const m of t.matchAll(/simple\('([a-z-]+)'/g)) used.add('/api/admin/' + m[1]); }
  for (const route of used) {
    let hit = null; for (const r of rules) { const m = route.match(r.re); if (m) { hit = r.dest.replace(':fn', m[1]); break; } }
    const fnName = hit && new URL(hit, 'http://x').searchParams.get('fn'), dir = hit && hit.startsWith('/api/admin') ? 'admin' : 'public';
    if (!hit || !exists(`server/${dir}/${fnName}.js`)) fail(`El navegador llama a ${route} y no existe su endpoint (server/${dir}/${fnName}.js)`);
  }
  if (used.size < 10) fail('No se detectaron las rutas /api usadas por el navegador (revisar el verificador)');
}

// 6) secretos: nada sensible en public/
for (const f of walk('public', ['.js', '.html'])) {
  const t = read(f);
  if (/SERVICE_ROLE|INTEGRITY_SECRET|EVENTS_SECRET|sb_secret_|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}/.test(t)) fail(`${f}: parece contener un secreto`);
}

// 7) Datos privados: el público nunca debe pedir planb_plans con "*" (incluiría valor_credito)
for (const f of ['public/app.js', 'server/public/catalog.js']) if (/planb_plans['"]\)\.select\(['"]\*['"]\)/.test(read(f))) fail(`${f}: pide planb_plans con select("*") y expondría valor_credito`);

if (errors.length) { console.error('KUOTA check FALLÓ:\n - ' + errors.join('\n - ')); process.exit(1); }
console.log(`KUOTA check OK — ${required.length} archivos requeridos, ${js.length} archivos JS válidos, configuración de despliegue y seguridad estática correctas.`);
