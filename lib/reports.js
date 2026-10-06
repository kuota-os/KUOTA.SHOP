// KUOTA informes: fórmulas de utilidad bruta (puras, sin base de datos). Configurables vía report_config.
export const DEFAULT_CONFIG = { credit_net_pct: 0.05, reportados_discount_pct: 0.10 };
// Recargo que paga el cliente por entidad (referencia; en producción se usa settings.entities si existe)
export const ENTITY_DEFAULT_PCT = { 'Addi': 0.25, 'Sistecrédito': 0.30, 'Banco de Bogotá': 0.15, 'Brilla': 0.30, 'Su+ Pay': 0.10, 'Nequi Créditos': 0.10, 'Bancolombia Créditos': 0.10, 'Tarjeta de Crédito': 0.10 };
const ENTITY_KEY = { 'Addi': 'addi', 'Sistecrédito': 'sistecredito', 'Banco de Bogotá': 'bancobogota', 'Brilla': 'brilla', 'Su+ Pay': 'supay', 'Nequi Créditos': 'nequi', 'Bancolombia Créditos': 'bancolombia', 'Tarjeta de Crédito': 'tarjeta' };
const r = n => Math.round(Number(n) || 0);

export function entityPct(name, settingsEntities = []) {
  const found = (settingsEntities || []).find(e => e.key === ENTITY_KEY[name]);
  return found && found.pct != null ? Number(found.pct) : (ENTITY_DEFAULT_PCT[name] ?? 0);
}
const base = (o, extra) => ({ id: o.id, fecha: o.fecha, equipo: o.equipo, cliente: o.cliente || '', sin_costo: !(Number(o.costo) > 0), ...extra });

// 1) CONTADO: precio venta - precio proveedor
export function contadoLine(o) {
  const venta = r(o.venta), costo = r(o.costo);
  return base(o, { venta, costo, utilidad: venta - costo });
}
// 2) BUENA VIDA CREDITICIA: el cliente paga precio + %entidad; a KUOTA le queda precio + 5% - proveedor
export function buenaVidaLine(o, cfg = DEFAULT_CONFIG, entities = []) {
  const pct = entityPct(o.entidad, entities), precio = Number(o.precio), costo = r(o.costo);
  const ventaCliente = r(precio * (1 + pct)), ingreso = r(precio * (1 + cfg.credit_net_pct));
  return base(o, { entidad: o.entidad, pct, precio: r(precio), venta_cliente: ventaCliente, ingreso, retencion_aliado: ventaCliente - ingreso, costo, utilidad: ingreso - costo });
}
// 3) REPORTADOS / SIN VIDA CREDITICIA: valor crédito - 10% - proveedor
export function reportadosLine(o, cfg = DEFAULT_CONFIG) {
  const credito = r(o.valor_credito), costo = r(o.costo), ingreso = r(credito * (1 - cfg.reportados_discount_pct));
  return base(o, { valor_credito: credito, cuota_inicial: r(o.cuota_inicial), descuento: credito - ingreso, ingreso, costo, utilidad: ingreso - costo });
}
// 4) PLAN RETOMA: equipo recibido en parte de pago + restante según método (supuestos documentados en LEEME-INFORMES)
export function retomaLine(o, cfg = DEFAULT_CONFIG, entities = []) {
  const recibido = r(o.valor_recibido), precio = r(o.precio), costo = r(o.costo), metodo = o.metodo || 'contado';
  const restante = o.restante != null && o.restante !== '' ? r(o.restante) : Math.max(0, precio - recibido);
  let cobrado;
  if (metodo === 'buena_vida') cobrado = r(restante * (1 + cfg.credit_net_pct));
  else if (metodo === 'reportados') cobrado = r(restante * (1 - cfg.reportados_discount_pct));
  else cobrado = restante;
  const ingreso = recibido + cobrado;
  return base(o, { metodo, entidad: o.entidad || '', valor_recibido: recibido, restante, restante_cobrado: cobrado, ingreso, costo, utilidad: ingreso - costo });
}
export function summarize(lines) {
  return { cantidad: lines.length, ingreso: lines.reduce((a, l) => a + (l.ingreso ?? l.venta ?? 0), 0), costo: lines.reduce((a, l) => a + l.costo, 0), utilidad: lines.reduce((a, l) => a + l.utilidad, 0), sin_costo: lines.filter(l => l.sin_costo).length };
}
export function periodRange(from, to) {
  const ok = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(s));
  const now = new Date(Date.now() - 5 * 3600e3); // Bogotá (UTC-5)
  const f = ok(from) ? from : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const t = ok(to) ? to : now.toISOString().slice(0, 10);
  if (f > t) throw new Error('RANGO_INVALIDO');
  return { from: f, to: t, fromTs: `${f}T00:00:00-05:00`, toTs: `${t}T23:59:59.999-05:00` };
}

// Retoma: rentabilidad esperada al vender el equipo RECIBIDO, según tus precios de venta (valor recibido = lo que se pagó por él)
export function rentabilidadRetoma({ recibido, precioContado, valorCredito }, cfg = DEFAULT_CONFIG) {
  const rec = r(recibido);
  return {
    contado: r(precioContado) - rec,                                          // precio contado - valor recibido
    buena_vida: r(Number(precioContado) * (1 + cfg.credit_net_pct)) - rec,    // precio +5% - valor recibido
    reportados: Number(valorCredito) > 0 ? r(Number(valorCredito) * (1 - cfg.reportados_discount_pct)) - rec : null // crédito -10% - valor recibido
  };
}
