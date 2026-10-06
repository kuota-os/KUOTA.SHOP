// Pruebas de endpoints con base simulada: autenticación, vínculo de clientes, errores públicos y webhook
import './support/loader.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fakeSb, mockRes } from './support/fake-sb.mjs';

process.env.SUPABASE_URL = 'https://x.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'srv'; process.env.SUPABASE_ANON_KEY = 'anon';
process.env.WOMPI_EVENTS_SECRET = 'evsecret'; process.env.WOMPI_INTEGRITY_SECRET = 'insecret'; process.env.WOMPI_PUBLIC_KEY = 'pub_test';
const load = async f => (await import(path.resolve(f))).default;
const call = async (h, { method = 'POST', headers = {}, body = {}, query = {} } = {}) => { const res = mockRes(); await h({ method, headers, body, query }, res); if (typeof res.body === 'string') { try { res.body = JSON.parse(res.body); } catch {} } return res; };

// 1) Todos los endpoints cargan (dependencias resueltas, sin errores de importación)
const files = [...fs.readdirSync('server/public').map(f => 'server/public/' + f), ...fs.readdirSync('server/admin').map(f => 'server/admin/' + f)];
const handlers = {};
// 0) Solo 2 funciones en api/ (límite de 12 de Vercel Hobby) y los rewrites llevan cada URL a su endpoint
assert.deepEqual(fs.readdirSync('api').sort(), ['admin.js', 'public.js']);
const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const route = urlPath => { for (const r of vercel.rewrites) { const m = urlPath.match(new RegExp('^' + r.source.replace(':fn', '([a-z0-9-]+)') + '$')); if (m) return new URL(r.destination.replace(':fn', m[1]), 'http://x'); } return null; };
const dispatch = { '/api/public': await load('api/public.js'), '/api/admin': await load('api/admin.js') };
assert.equal(route('/api/admin/pricing').pathname, '/api/admin'); assert.equal(route('/api/admin/pricing').searchParams.get('fn'), 'pricing');
assert.equal(route('/api/wompi-webhook').pathname, '/api/public'); assert.equal(route('/api/wompi-webhook').searchParams.get('fn'), 'wompi-webhook');
for (const f of files) { handlers[f] = await load(f); assert.equal(typeof handlers[f], 'function', f); }

// 2) Todo /api/admin exige sesión: sin token -> 401, con token de usuario NO admin -> 403
globalThis.__sb = fakeSb({ admin_users: [] }, { users: { tok_user: { id: 'u9', email: 'cliente@mail.com' } } });
for (const f of files.filter(f => f.startsWith('server/admin/'))) {
  const r1 = await call(handlers[f], { method: 'GET' }); assert.equal(r1.code, 401, `${f} sin token debe dar 401 (dio ${r1.code})`);
  const r2 = await call(handlers[f], { method: 'GET', headers: { authorization: 'Bearer tok_user' } }); assert.equal(r2.code, 403, `${f} con usuario no admin debe dar 403 (dio ${r2.code})`);
}
// 3) Endpoints de cliente sin sesión -> 401
for (const [f, m] of [['server/public/customer-me.js', 'GET'], ['server/public/customer-pay.js', 'POST'], ['server/public/customer-link.js', 'POST']]) { const r = await call(handlers[f], { method: m }); assert.equal(r.code, 401, f); }

// 4) Vínculo de clientes: el correo sale del token, no del cuerpo (ataque de apropiación de cuenta)
const seed = () => ({ customers: [{ id: 'C1', cedula: '1047000111', email: 'victima@mail.com', primer_apellido: 'Gómez', auth_user_id: null }, { id: 'C2', cedula: '2000', email: 'otra@mail.com', primer_apellido: 'Ruiz', auth_user_id: null }] });
const users = { atk: { id: 'A', email: 'atacante@mail.com' }, vic: { id: 'V', email: 'victima@mail.com' }, wild: { id: 'W', email: '%@%' } };
globalThis.__sb = fakeSb(seed(), { users });
const link = handlers['server/public/customer-link.js'];
let r = await call(link, { headers: { authorization: 'Bearer atk' }, body: { email: 'victima@mail.com', cedula: '1047000111', apellido: 'Gómez' } });
assert.equal(r.code, 404, 'el atacante NO debe poder vincular la cuenta de otro usando su cédula y apellido'); assert.equal(globalThis.__sb.db.customers[0].auth_user_id, null);
r = await call(link, { headers: { authorization: 'Bearer wild' }, body: { cedula: '1047000111', apellido: 'Gómez' } }); assert.equal(r.code, 404, 'comodines % no deben coincidir');
r = await call(link, { headers: { authorization: 'Bearer vic' }, body: { cedula: '1047000111', apellido: 'Otro' } }); assert.equal(r.code, 403);
r = await call(link, { headers: { authorization: 'Bearer vic' }, body: { cedula: '1047000111', apellido: 'gómez' } }); assert.equal(r.code, 200); assert.equal(globalThis.__sb.db.customers[0].auth_user_id, 'V');
users.vic2 = { id: 'V2', email: 'victima@mail.com' };
r = await call(link, { headers: { authorization: 'Bearer vic2' }, body: { cedula: '1047000111', apellido: 'Gómez' } }); assert.equal(r.code, 409, 'una cuenta ya vinculada no se puede reclamar con otro usuario');

// 5) Errores públicos: nunca filtran detalles internos de la base de datos
for (const [f, req] of [['server/public/catalog.js', { method: 'GET' }], ['server/public/leads.js', { body: { lead_type: 'plan_b', consent: true, full_name: 'A B', cedula: '123456' } }]]) {
  globalThis.__sb = fakeSb({}, { failOn: f.includes('catalog') ? 'products' : 'customers' });
  const res = await call(handlers[f], req); assert.equal(res.code, 500, f); assert.equal(res.body.error, 'SERVER_ERROR', `${f} filtró un error interno`); assert.ok(!JSON.stringify(res.body).includes('relation'), f);
}

// 6) Leads públicos: solo planes de crédito/retoma; 'envio_nacional' lo crea el servidor
globalThis.__sb = fakeSb({ customers: [], leads: [] });
const leads = handlers['server/public/leads.js'];
r = await call(leads, { body: { lead_type: 'envio_nacional', consent: true, full_name: 'X Y', cedula: '99999' } }); assert.equal(r.code, 400);
r = await call(leads, { body: { lead_type: 'plan_b', consent: true, full_name: 'Ana Ruiz', primer_apellido: 'Ruiz', cedula: '1.047.000.222', whatsapp: '3001112233', image_urls: ['trade-in/ajeno/foto.jpg'] } });
assert.equal(r.code, 201); assert.deepEqual(globalThis.__sb.db.leads[0].image_urls, [], 'el público no puede inyectar rutas de fotos');
r = await call(leads, { body: { lead_type: 'plan_b', consent: true, full_name: 'Z', cedula: '1', notes: 'x'.repeat(30000) } }); assert.equal(r.code, 413);
r = await call(leads, { body: { lead_type: 'plan_b' } }); assert.equal(r.code, 400);

// 7) Webhook de Wompi: firma inválida o ausente se rechaza
const wh = handlers['server/public/wompi-webhook.js'];
r = await call(wh, { body: { event: 'transaction.updated', data: { transaction: { reference: 'R1', id: 't', status: 'APPROVED' } }, signature: { properties: ['transaction.id'], checksum: 'malo' }, timestamp: 1 }, headers: { 'x-event-checksum': 'malo' } });
assert.equal(r.code, 401); r = await call(wh, { body: { event: 'transaction.updated' } }); assert.equal(r.code, 401);
r = await call(wh, { method: 'GET' }); assert.equal(r.code, 405);

// 8) Métodos no permitidos
for (const f of ['server/public/create-order.js', 'server/public/customer-login.js']) { r = await call(handlers[f], { method: 'GET' }); assert.ok([405, 400].includes(r.code), f); }
// 9) El despachador entrega cada ruta real a su endpoint y rechaza nombres desconocidos o maliciosos
{
  globalThis.__sb = fakeSb({ admin_users: [] }, { users: {} });
  const viaDispatcher = async (urlPath, extra = {}) => { const u = route(urlPath); return call(dispatch[u.pathname], { method: 'GET', query: { fn: u.searchParams.get('fn') }, ...extra }); };
  for (const f of files) { const dir = f.includes('/admin/') ? 'admin' : 'public', name = path.basename(f, '.js'); const res = await viaDispatcher(dir === 'admin' ? `/api/admin/${name}` : `/api/${name}`); assert.notEqual(res.body?.error, 'FUNCTION_NOT_FOUND', `${name} no llega a su endpoint`); }
  for (const bad of ['nope', '__proto__', 'constructor', 'toString', '../admin']) { const res = await call(dispatch['/api/public'], { method: 'GET', query: { fn: bad } }); assert.equal(res.body.error, 'FUNCTION_NOT_FOUND', bad); }
  assert.equal((await viaDispatcher('/api/admin/pricing')).code, 401, 'el admin sigue exigiendo sesión a través del despachador');
}
console.log(`api tests OK (2 funciones en api/, ${files.length} endpoints alcanzables; ${files.filter(f => f.startsWith('server/admin/')).length} admin protegidos con 401/403)`);
