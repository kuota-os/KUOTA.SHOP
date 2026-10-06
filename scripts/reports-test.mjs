import assert from 'node:assert/strict';
import { rentabilidadRetoma, contadoLine, buenaVidaLine, reportadosLine, retomaLine, summarize, entityPct, periodRange, ENTITY_DEFAULT_PCT } from '../lib/reports.js';
// Contado: venta - proveedor
assert.equal(contadoLine({ venta: 3300000, costo: 2700000 }).utilidad, 600000);
// Buena vida: Addi +15% al cliente; a KUOTA: precio +5% - proveedor
const a = buenaVidaLine({ entidad: 'Addi', precio: 3300000, costo: 2700000 });
assert.equal(a.venta_cliente, 4125000); assert.equal(a.ingreso, 3465000); assert.equal(a.utilidad, 765000); assert.equal(a.retencion_aliado, 660000);
const s = buenaVidaLine({ entidad: 'Sistecrédito', precio: 2000000, costo: 1800000 });
assert.equal(s.venta_cliente, 2600000); assert.equal(s.utilidad, 2100000 - 1800000);
// porcentajes por entidad: los 8 de tu lista, y settings tiene prioridad
assert.deepEqual(Object.values(ENTITY_DEFAULT_PCT), [0.25, 0.30, 0.15, 0.30, 0.10, 0.10, 0.10, 0.10]);
assert.equal(entityPct('Addi', [{ key: 'addi', pct: 0.2 }]), 0.2);
// Reportados: valor crédito - 10% - proveedor
const rp = reportadosLine({ valor_credito: 4000000, costo: 2700000, cuota_inicial: 1000000 });
assert.equal(rp.ingreso, 3600000); assert.equal(rp.utilidad, 900000);
// Ejemplo del dueño: iPhone 17 Pro 256GB exhibición, crédito 4.900.000 - 10% = 4.410.000 - proveedor 3.300.000 = 1.110.000
assert.equal(reportadosLine({ valor_credito: 4900000, costo: 3300000 }).utilidad, 1110000);
// Retoma
assert.equal(retomaLine({ precio: 3300000, valor_recibido: 1000000, costo: 2700000, metodo: 'contado' }).utilidad, 600000);
assert.equal(retomaLine({ precio: 3300000, valor_recibido: 1000000, restante: 2300000, costo: 2700000, metodo: 'buena_vida', entidad: 'Addi' }).utilidad, 1000000 + 2415000 - 2700000);
assert.equal(retomaLine({ precio: 3300000, valor_recibido: 1000000, restante: 2300000, costo: 2700000, metodo: 'reportados' }).utilidad, 1000000 + 2070000 - 2700000);
// costo faltante se marca
assert.equal(contadoLine({ venta: 100, costo: 0 }).sin_costo, true);
assert.deepEqual(summarize([contadoLine({ venta: 100, costo: 60 }), contadoLine({ venta: 50, costo: 0 })]), { cantidad: 2, ingreso: 150, costo: 60, utilidad: 90, sin_costo: 1 });
assert.throws(() => periodRange('2026-10-10', '2026-10-01'), /RANGO_INVALIDO/);
assert.equal(periodRange('2026-09-01', '2026-09-30').fromTs, '2026-09-01T00:00:00-05:00');
const rr = rentabilidadRetoma({ recibido: 1800000, precioContado: 2500000, valorCredito: 3000000 });
assert.deepEqual(rr, { contado: 700000, buena_vida: 825000, reportados: 900000 });
assert.equal(rentabilidadRetoma({ recibido: 1800000, precioContado: 2500000 }).reportados, null);
console.log('reports tests OK');
