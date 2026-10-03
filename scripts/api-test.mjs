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
const files = [...fs.readdirSync('api').filter(f => f.endsWith('.js')).map(f => 'api/' + f), ...fs.readdirSync('api/admin').map(f => 'api/admin/' + f)];
const handlers = {};
for (const f of files) { handlers[f] = await load(f); assert.equal(typeof handlers[f], 'function', f); }

// 2) Todo /api/admin exige sesión: sin token -> 401, con token de usuario NO admin -> 403
globalThis.__sb = fakeSb({ admin_users: [] }, { users: { tok_user: { id: 'u9', email: 'cliente@mail.com' } } });
for (const f of files.filter(f => f.startsWith('api/admin/'))) {
  const r1 = await call(handlers[f], { method: 'GET' }); assert.equal(r1.code, 401, `${f} sin token debe dar 401 (dio ${r1.code})`);
  const r2 = await call(handlers[f], { method: 'GET', headers: { authorization: 'Bearer tok_user' } }); assert.equal(r2.code, 403, `${f} con usuario no admin debe dar 403 (dio ${r2.code})`);
}
// 3) Endpoints de cliente sin sesión -> 401
for (const [f, m] of [['api/customer-me.js', 'GET'], ['api/customer-pay.js', 'POST'], ['api/customer-link.js', 'POST']]) { const r = await call(handlers[f], { method: m }); assert.equal(r.code, 401, f); }

// 4) Vínculo de clientes: el correo sale del token, no del cuerpo (ataque de apropiación de cuenta)
const seed = () => ({ customers: [{ id: 'C1', cedula: '1047000111', email: 'victima@mail.com', primer_apellido: 'Gómez', auth_user_id: null }, { id: 'C2', cedula: '2000', email: 'otra@mail.com', primer_apellido: 'Ruiz', auth_user_id: null }] });
const users = { atk: { id: 'A', email: 'atacante@mail.com' }, vic: { id: 'V', email: 'victima@mail.com' }, wild: { id: 'W', email: '%@%' } };
globalThis.__sb = fakeSb(seed(), { users });
const link = handlers['api/customer-link.js'];
let r = await call(link, { headers: { authorization: 'Bearer atk' }, body: { email: 'victima@mail.com', cedula: '1047000111', apellido: 'Gómez' } });
assert.equal(r.code, 404, 'el atacante NO debe poder vincular la cuenta de otro usando su cédula y apellido'); assert.equal(globalThis.__sb.db.customers[0].auth_user_id, null);
r = await call(link, { headers: { authorization: 'Bearer wild' }, body: { cedula: '1047000111', apellido: 'Gómez' } }); assert.equal(r.code, 404, 'comodines % no deben coincidir');
r = await call(link, { headers: { authorization: 'Bearer vic' }, body: { cedula: '1047000111', apellido: 'Otro' } }); assert.equal(r.code, 403);
r = await call(link, { headers: { authorization: 'Bearer vic' }, body: { cedula: '1047000111', apellido: 'gómez' } }); assert.equal(r.code, 200); assert.equal(globalThis.__sb.db.customers[0].auth_user_id, 'V');
users.vic2 = { id: 'V2', email: 'victima@mail.com' };
r = await call(link, { headers: { authorization: 'Bearer vic2' }, body: { cedula: '1047000111', apellido: 'Gómez' } }); assert.equal(r.code, 409, 'una cuenta ya vinculada no se puede reclamar con otro usuario');

// 5) Errores públicos: nunca filtran detalles internos de la base de datos
for (const [f, req] of [['api/catalog.js', { method: 'GET' }], ['api/leads.js', { body: { lead_type: 'plan_b', consent: true, full_name: 'A B', cedula: '123456' } }]]) {
  globalThis.__sb = fakeSb({}, { failOn: f.includes('catalog') ? 'products' : 'customers' });
  const res = await call(handlers[f], req); assert.equal(res.code, 500, f); assert.equal(res.body.error, 'SERVER_ERROR', `${f} filtró un error interno`); assert.ok(!JSON.stringify(res.body).includes('relation'), f);
}

// 6) Leads públicos: solo planes de crédito/retoma; 'envio_nacional' lo crea el servidor
globalThis.__sb = fakeSb({ customers: [], leads: [] });
const leads = handlers['api/leads.js'];
r = await call(leads, { body: { lead_type: 'envio_nacional', consent: true, full_name: 'X Y', cedula: '99999' } }); assert.equal(r.code, 400);
r = await call(leads, { body: { lead_type: 'plan_b', consent: true, full_name: 'Ana Ruiz', primer_apellido: 'Ruiz', cedula: '1.047.000.222', whatsapp: '3001112233', image_urls: ['trade-in/ajeno/foto.jpg'] } });
assert.equal(r.code, 201); assert.deepEqual(globalThis.__sb.db.leads[0].image_urls, [], 'el público no puede inyectar rutas de fotos');
r = await call(leads, { body: { lead_type: 'plan_b', consent: true, full_name: 'Z', cedula: '1', notes: 'x'.repeat(30000) } }); assert.equal(r.code, 413);
r = await call(leads, { body: { lead_type: 'plan_b' } }); assert.equal(r.code, 400);

// 7) Webhook de Wompi: firma inválida o ausente se rechaza
const wh = handlers['api/wompi-webhook.js'];
r = await call(wh, { body: { event: 'transaction.updated', data: { transaction: { reference: 'R1', id: 't', status: 'APPROVED' } }, signature: { properties: ['transaction.id'], checksum: 'malo' }, timestamp: 1 }, headers: { 'x-event-checksum': 'malo' } });
assert.equal(r.code, 401); r = await call(wh, { body: { event: 'transaction.updated' } }); assert.equal(r.code, 401);
r = await call(wh, { method: 'GET' }); assert.equal(r.code, 405);

// 8) Métodos no permitidos
for (const f of ['api/create-order.js', 'api/customer-login.js']) { r = await call(handlers[f], { method: 'GET' }); assert.ok([405, 400].includes(r.code), f); }
console.log(`api tests OK (${files.length} endpoints cargados; ${files.filter(f => f.startsWith('api/admin/')).length} admin protegidos con 401/403)`);
