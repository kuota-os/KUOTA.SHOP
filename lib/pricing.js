// Validación pura de cambios de precios (usada por api/admin/pricing.js y probada en scripts/pricing-test.mjs)
export function parseMoney(v, { allowNull = false } = {}) {
  if (v === null || v === undefined || v === '') {
    if (allowNull) return null;
    throw new Error('VALOR_REQUERIDO');
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100000000) throw new Error('VALOR_INVALIDO');
  return Math.round(n);
}

export function buildPricingPatch(body = {}) {
  const out = { variant_id: String(body.variant_id || '') };
  if (!out.variant_id) throw new Error('VARIANT_REQUIRED');
  if ('price' in body) {
    out.price = parseMoney(body.price);
    if (out.price <= 0) throw new Error('PRECIO_INVALIDO');
  }
  if ('cost' in body) out.cost = parseMoney(body.cost);
  if ('active' in body) out.active = Boolean(body.active);
  if (body.planb) {
    const inicial = parseMoney(body.planb.inicial, { allowNull: true });
    const cuota = parseMoney(body.planb.cuota, { allowNull: true });
    if ((inicial === null) !== (cuota === null)) throw new Error('INICIAL_Y_CUOTA_JUNTAS');
    if (inicial !== null) {
      if (inicial <= 0 || cuota <= 0) throw new Error('PLAN_INVALIDO');
      out.planb = { inicial, cuota };
      const vc = parseMoney(body.planb.valor_credito, { allowNull: true });
      if (vc !== null) { if (vc <= 0) throw new Error('PLAN_INVALIDO'); out.planb.valor_credito = vc; }
      else out.planb.valor_credito = null;
    }
  }
  return out;
}
