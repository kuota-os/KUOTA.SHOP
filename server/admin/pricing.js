import { requireAdmin, json } from '../../lib/supabase.js';
import { buildPricingPatch } from '../../lib/pricing.js';

async function loadRows(sb) {
  const [v, c, p] = await Promise.all([
    sb.from('variants').select('id,storage,price,active,products!inner(id,category,family,model,sort_order,active)'),
    sb.from('variant_costs').select('variant_id,cost'),
    sb.from('planb_plans').select('id,category,model,storage,inicial,cuota,valor_credito,active')
  ]);
  for (const r of [v, c, p]) if (r.error) throw r.error;
  const cost = new Map(c.data.map(x => [x.variant_id, Number(x.cost)]));
  const plan = new Map(p.data.map(x => [`${x.category}|${x.model}|${x.storage}`, x]));
  return v.data.map(x => {
    const pr = x.products, pl = plan.get(`${pr.category}|${pr.model}|${x.storage}`);
    return {
      variant_id: x.id, category: pr.category, family: pr.family, model: pr.model, storage: x.storage,
      sort_order: pr.sort_order, price: Number(x.price), active: x.active, product_active: pr.active,
      cost: cost.get(x.id) ?? 0, planb_id: pl?.id ?? null,
      inicial: pl ? Number(pl.inicial) : null, cuota: pl ? Number(pl.cuota) : null, valor_credito: pl?.valor_credito != null ? Number(pl.valor_credito) : null
    };
  }).sort((a, b) => a.category.localeCompare(b.category) || a.sort_order - b.sort_order || a.model.localeCompare(b.model) || parseInt(a.storage) - parseInt(b.storage));
}

export default async function handler(req, res) {
  try {
    const { sb, user } = await requireAdmin(req);
    if (req.method === 'GET') return json(res, 200, { data: await loadRows(sb) });
    if (req.method !== 'PATCH') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });

    const patch = buildPricingPatch(req.body);
    const rows = await loadRows(sb);
    const cur = rows.find(r => r.variant_id === patch.variant_id);
    if (!cur) return json(res, 404, { error: 'VARIANT_NOT_FOUND' });

    const vUpd = {};
    if ('price' in patch) vUpd.price = patch.price;
    if ('active' in patch) vUpd.active = patch.active;
    if (Object.keys(vUpd).length) {
      const { error } = await sb.from('variants').update(vUpd).eq('id', patch.variant_id);
      if (error) throw error;
    }
    if ('cost' in patch) {
      const { error } = await sb.from('variant_costs').upsert({ variant_id: patch.variant_id, cost: patch.cost, updated_at: new Date().toISOString() });
      if (error) throw error;
    }
    if (patch.planb) {
      const q = cur.planb_id
        ? sb.from('planb_plans').update(patch.planb).eq('id', cur.planb_id)
        : sb.from('planb_plans').insert({ category: cur.category, model: cur.model, storage: cur.storage, ...patch.planb });
      const { error } = await q;
      if (error) throw error;
    }
    // Historial de cambios (best-effort: no bloquea si aún no se ejecutó 002_precios_admin.sql)
    try {
      await sb.from('price_changes').insert({ variant_id: patch.variant_id, changed_by: user.id, before: cur, after: patch });
    } catch (_) { /* tabla opcional */ }

    const fresh = (await loadRows(sb)).find(r => r.variant_id === patch.variant_id);
    return json(res, 200, { data: fresh });
  } catch (e) {
    const known = ['VARIANT_REQUIRED', 'VALOR_INVALIDO', 'VALOR_REQUERIDO', 'PRECIO_INVALIDO', 'INICIAL_Y_CUOTA_JUNTAS', 'PLAN_INVALIDO'];
    const status = e.message === 'UNAUTHORIZED' ? 401 : e.message === 'FORBIDDEN' ? 403 : known.includes(e.message) ? 400 : 500;
    return json(res, status, { error: e.message });
  }
}
