import assert from 'node:assert/strict';
import { applyAction, stepsState, missingInStep, SECTIONS, parseDate, canAddFiles } from '../lib/crm.js';
const mk = (type, extra = {}) => ({ lead_type: type, stage: 'en_espera', steps: {}, ...extra });
const err = (fn, code) => assert.throws(fn, e => e.message.startsWith(code), code);
const run = (lead, a, i) => { const r = applyAction(lead, a, i); return { ...lead, ...r.patch }; };
assert.equal(parseDate('31/02/2026'), null); assert.equal(parseDate('05/10/2026'), '2026-10-05'); assert.equal(parseDate('2026-10-05'), null);
// aprobar / rechazar / reabrir
let l = mk('plan_b');
err(() => applyAction(l, 'approve', { by: 'Ana', date: '05/10/2026' }), 'NOMBRE_Y_APELLIDO');
err(() => applyAction(l, 'approve', { by: 'Ana Ruiz', date: '99/10/2026' }), 'FECHA_INVALIDA');
err(() => applyAction(l, 'reject', { by: 'Ana Ruiz', date: '05/10/2026', reason: 'no' }), 'MOTIVO');
const rej = run(l, 'reject', { by: 'Ana Ruiz', date: '05/10/2026', reason: 'Documentos ilegibles' });
assert.equal(rej.stage, 'rechazada'); err(() => applyAction(rej, 'approve', { by: 'Ana Ruiz', date: '05/10/2026' }), 'ETAPA_INVALIDA');
const re = run(rej, 'reopen'); assert.equal(re.stage, 'en_espera');
// pasos con bloqueo secuencial (reportados: 3 pasos)
let p = run(re, 'approve', { by: 'Ana Ruiz', date: '05/10/2026' }); assert.equal(p.stage, 'en_proceso');
err(() => applyAction(p, 'save_step', { step: 'producto', fields: {} }), 'PASO_BLOQUEADO');
err(() => applyAction(p, 'mark_done', { step: 'credito' }), 'FALTAN_DATOS:foto');
p = { ...p, steps: { credito: { files: ['a.jpg'] } } }; p = run(p, 'mark_done', { step: 'credito' });
assert.deepEqual(stepsState(p).map(s => [s.unlocked, s.done]), [[true, true], [true, false], [false, false]]);
err(() => applyAction(p, 'save_step', { step: 'credito', fields: {} }), 'PASO_YA_COMPLETADO');
err(() => applyAction(p, 'finish', { closing: {} }), 'PASOS_INCOMPLETOS');
p = { ...p, steps: { ...p.steps, producto: { files: ['b.jpg'], fields: { imei: '35' } }, entregado: { files: ['c.jpg'] } } };
p = run(p, 'mark_done', { step: 'producto' }); p = run(p, 'mark_done', { step: 'entregado' });
err(() => applyAction(p, 'finish', { closing: { variant_id: 'v1', valor_credito: '3000000' } }), 'FALTAN_DATOS:cuota_inicial');
const fin = run(p, 'finish', { closing: { variant_id: 'v1', valor_credito: '3000000', cuota_inicial: '1000000' } });
assert.equal(fin.stage, 'cartera'); err(() => applyAction(fin, 'save_step', { step: 'producto' }), 'SOLO_LECTURA'); err(() => applyAction(fin, 'reopen'), 'SOLO_LECTURA');
// buena vida: requiere entidad antes del primer paso
let b = run(mk('plan_a'), 'approve', { by: 'Ana Ruiz', date: '05/10/2026' });
assert.equal(stepsState(b)[0].unlocked, false); err(() => applyAction(b, 'set_entity', { entity: 'Otra' }), 'ENTIDAD_INVALIDA');
b = run(b, 'set_entity', { entity: 'Addi' }); assert.equal(stepsState(b)[0].unlocked, true);
// retoma: restante y entidad condicionales; efectivo sin comprobante
const r3 = SECTIONS.retoma.steps[2];
assert.deepEqual(missingInStep(r3, { files: ['x'], fields: { metodo: 'buena_vida' } }).sort(), ['entidad', 'restante']);
assert.deepEqual(missingInStep(r3, { files: ['x'], fields: { metodo: 'reportados' } }), ['restante']);
assert.ok(SECTIONS.buena_vida.closing && SECTIONS.retoma.closing);
assert.deepEqual(missingInStep(r3, { files: [], fields: { metodo: 'contado', valor_efectivo: '500000' } }), ['foto']);
assert.deepEqual(missingInStep(r3, { files: ['x'], fields: { metodo: 'contado', valor_efectivo: '500000' } }), []);
assert.deepEqual(missingInStep(r3, { files: ['x'], fields: { metodo: 'contado' } }), ['comprobante']);
assert.deepEqual(missingInStep(r3, { files: ['x', 'y'], fields: { metodo: 'contado' } }), []);
assert.deepEqual(missingInStep(r3, { files: ['x'], fields: { metodo: 'otro' } }), ['metodo']);
// límite de fotos
err(() => canAddFiles({ ...b, steps: { credito: { files: Array(12).fill('a') } } }, 'credito', 1), 'DEMASIADAS_FOTOS');
// todos los tipos de solicitud tienen sección
for (const s of Object.values(SECTIONS)) assert.ok(s.steps.length >= 3);
console.log('crm tests OK');
