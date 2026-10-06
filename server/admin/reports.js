import { requireAdmin, json } from '../../lib/supabase.js';
import { DEFAULT_CONFIG, ENTITY_DEFAULT_PCT, entityPct, contadoLine, buenaVidaLine, reportadosLine, retomaLine, summarize, periodRange } from '../../lib/reports.js';

async function loadConfig(sb) {
  const { data } = await sb.from('report_config').select('key,value'); // si falta 004, usa los valores por defecto
  const cfg = { ...DEFAULT_CONFIG };
  for (const r of data || []) if (r.key in cfg && Number.isFinite(Number(r.value))) cfg[r.key] = Number(r.value);
  return cfg;
}
const name = c => (c?.full_name ? `${c.full_name} ${c.primer_apellido || ''}`.trim() : '');

export default async function handler(req, res) {
  try {
    const { sb } = await requireAdmin(req);
    if (req.method === 'PATCH') {
      const out = {};
      for (const k of Object.keys(DEFAULT_CONFIG)) {
        if (!(k in (req.body || {}))) continue;
        const v = Number(req.body[k]);
        if (!Number.isFinite(v) || v < 0 || v > 0.9) return json(res, 400, { error: 'PORCENTAJE_INVALIDO' });
        const { error } = await sb.from('report_config').upsert({ key: k, value: v, updated_at: new Date().toISOString() });
        if (error) throw error;
        out[k] = v;
      }
      return json(res, 200, { data: out });
    }
    if (req.method !== 'GET') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });

    const { from, to, fromTs, toTs } = periodRange(req.query?.from, req.query?.to);
    const cfg = await loadConfig(sb);
    const [s, l, st] = await Promise.all([
      sb.from('sales').select('id,sold_at,product_model,storage,sale_price,cost_price,customers(full_name,primer_apellido)').gte('sold_at', from).lte('sold_at', to).limit(2000),
      sb.from('leads').select('id,lead_type,entity,steps,closing,finalized_at,device_label,stage,customers(full_name,primer_apellido)').in('stage', ['finalizada', 'cartera']).gte('finalized_at', fromTs).lte('finalized_at', toTs).limit(2000),
      sb.from('settings').select('value').eq('key', 'entities').maybeSingle()
    ]);
    if (s.error) throw s.error; if (l.error) throw l.error;
    const entities = Array.isArray(st.data?.value) ? st.data.value : [];

    const contado = (s.data || []).map(x => contadoLine({ id: x.id, fecha: x.sold_at, equipo: `${x.product_model} ${x.storage || ''}`.trim(), cliente: name(x.customers), venta: x.sale_price, costo: x.cost_price }));
    const bv = {}; for (const e of Object.keys(ENTITY_DEFAULT_PCT)) bv[e] = [];
    const reportados = [], retoma = []; let sinCierre = 0, envios = 0;
    for (const x of l.data || []) {
      const c = x.closing || {}, o = { id: x.id, fecha: (x.finalized_at || '').slice(0, 10), equipo: c.model ? `${c.model} ${c.storage || ''}`.trim() : (x.device_label || ''), cliente: name(x.customers), costo: c.costo };
      if (x.lead_type === 'envio_nacional') { envios++; continue; } // la venta ya está en "sales" (Wompi)
      if (c.precio_venta == null && x.lead_type !== 'plan_b') { sinCierre++; continue; }
      if (x.lead_type === 'plan_a') (bv[x.entity] ||= []).push(buenaVidaLine({ ...o, entidad: x.entity, precio: c.precio_venta }, cfg, entities));
      else if (x.lead_type === 'plan_b') reportados.push(reportadosLine({ ...o, valor_credito: c.valor_credito, cuota_inicial: c.cuota_inicial }, cfg));
      else if (x.lead_type === 'plan_c') retoma.push(retomaLine({ ...o, precio: c.precio_venta, valor_recibido: x.steps?.recibido?.fields?.valor_recibido, metodo: x.steps?.entregado?.fields?.metodo, entidad: x.steps?.entregado?.fields?.entidad, restante: x.steps?.entregado?.fields?.restante }, cfg, entities));
    }
    const buena_vida = Object.entries(bv).map(([entidad, lines]) => ({ entidad, pct: entityPct(entidad, entities), lines, totals: summarize(lines) }));
    const all = [...contado, ...buena_vida.flatMap(b => b.lines), ...reportados, ...retoma];
    return json(res, 200, { data: {
      period: { from, to }, config: cfg,
      contado: { lines: contado, totals: summarize(contado) },
      buena_vida, reportados: { lines: reportados, totals: summarize(reportados) }, retoma: { lines: retoma, totals: summarize(retoma) },
      total: summarize(all), sin_cierre: sinCierre, envios_finalizados: envios
    } });
  } catch (e) {
    const code = String(e.message || '');
    return json(res, code === 'UNAUTHORIZED' ? 401 : code === 'FORBIDDEN' ? 403 : code === 'RANGO_INVALIDO' ? 400 : 500, { error: code });
  }
}
