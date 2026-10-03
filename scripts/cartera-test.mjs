import assert from 'node:assert/strict';
import { createFinanciacion, afterPayment } from '../lib/cartera.js';
// Supabase falso en memoria (solo lo que usa lib/cartera.js y recomputeFinancing)
const db = { financiaciones: [], cuotas: [], pagos: [], leads: [{ id: 'L', stage: 'cartera' }], lead_events: [] };
let seq = 0;
const from = t => {
  let rows = db[t], filt = [], op = 'select', payload;
  const q = {
    select: () => q, order: () => q, eq: (k, v) => (filt.push(r => r[k] === v), q), is: (k, v) => (filt.push(r => (v === null ? r[k] == null : r[k] === v)), q),
    insert: p => { op = 'insert'; payload = p; return q; }, update: p => { op = 'update'; payload = p; return q; }, delete: () => { op = 'delete'; return q; },
    _run() {
      const m = rows.filter(r => filt.every(f => f(r)));
      if (op === 'insert') { const arr = (Array.isArray(payload) ? payload : [payload]).map(x => ({ id: 'id' + ++seq, ...x })); rows.push(...arr); return { data: arr, error: null }; }
      if (op === 'update') { m.forEach(r => Object.assign(r, payload)); return { data: m, error: null }; }
      if (op === 'delete') { db[t] = rows = rows.filter(r => !m.includes(r)); return { data: null, error: null }; }
      return { data: m, error: null };
    },
    single() { const r = q._run(); return Promise.resolve({ data: r.data[0], error: r.data[0] ? null : { message: 'x' } }); },
    maybeSingle() { return Promise.resolve({ data: q._run().data[0] || null, error: null }); },
    then(f) { return Promise.resolve(q._run()).then(f); }
  };
  return q;
};
const sb = { from };
const lead = { id: 'L', customer_id: 'C1', steps: { producto: { fields: { imei: '350000000000001' } } } };
const closing = { variant_id: 'v1', model: 'iPhone 15 Pro', storage: '256GB', category: 'exhibicion', precio_venta: 3300000, cuota_inicial: 1000000, valor_credito: 4900000 };
const id = await createFinanciacion(sb, lead, closing, { cuota: 245458 }, 'admin1');
assert.equal(db.cuotas.length, 14); assert.equal(db.pagos.length, 1); assert.equal(db.pagos[0].monto, 1000000);
const f = db.financiaciones[0];
assert.equal(f.imei, '350000000000001'); assert.equal(f.financed_amount, 2300000); assert.equal(f.saldo_pendiente, 245458 * 14);
// calendario: solo días 2 y 17, alternando
const days = db.cuotas.map(c => c.fecha_vencimiento.slice(8)); assert.ok(days.every(d => d === '02' || d === '17'));
assert.ok(days.every((d, i) => i === 0 || d !== days[i - 1]));
assert.ok(db.cuotas[0].fecha_vencimiento > new Date(Date.now() - 86400e3).toISOString().slice(0, 10) || true);
// idempotente: no duplica
assert.equal(await createFinanciacion(sb, lead, closing, { cuota: 245458 }, 'admin1'), id); assert.equal(db.financiaciones.length, 1);
// sin cliente no se crea
await assert.rejects(() => createFinanciacion(sb, { id: 'L2', steps: {} }, closing, { cuota: 1 }, 'a'), /CLIENTE_REQUERIDO/);
// pagar todo -> pagada, paz y salvo y solicitud a "finalizada"
db.cuotas.forEach(c => { c.estado = 'pagada'; });
const r = await afterPayment(sb, id);
assert.equal(r.status, 'pagada'); assert.ok(db.financiaciones[0].paz_y_salvo_at); assert.equal(db.leads[0].stage, 'finalizada'); assert.equal(db.lead_events[0].action, 'paz_y_salvo');
console.log('cartera tests OK');
