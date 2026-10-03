import { requireAdmin, json } from '../../lib/supabase.js';
import { findPlan, createFinanciacion } from '../../lib/cartera.js';
import { DEFAULT_CONFIG } from '../../lib/reports.js';
import { SECTIONS, SECTION_BY_LEAD_TYPE, ENTITIES, applyAction } from '../../lib/crm.js';

const SELECT = '*,customers(full_name,primer_apellido,cedula,whatsapp,email)';
const ACTIONS = ['approve', 'reject', 'reopen', 'set_entity', 'save_step', 'mark_done', 'finish', 'remove_file'];

async function signed(sb, bucket, paths) {
  const list = (paths || []).filter(Boolean);
  if (!list.length) return {};
  const { data } = await sb.storage.from(bucket).createSignedUrls(list, 3600);
  return Object.fromEntries((data || []).filter(x => x.signedUrl).map(x => [x.path, x.signedUrl]));
}
const meta = (config) => ({
  entities: ENTITIES, config,
  sections: Object.fromEntries(Object.entries(SECTIONS).map(([k, s]) => [k, {
    label: s.label, doneLabel: s.doneLabel, finishLabel: s.finishLabel, doneStage: s.doneStage, needsEntity: !!s.needsEntity,
    closing: s.closing || null,
    steps: s.steps.map(t => ({ key: t.key, title: t.title, hint: t.hint || '', minPhotos: t.minPhotos, fields: t.fields.map(f => ({ key: f.key, label: f.label, options: f.options || null, money: !!f.money, catalog: !!f.catalog, required: typeof f.required === 'function' ? 'conditional' : !!f.required })) }))
  }]))
});

export default async function handler(req, res) {
  try {
    const { sb, user } = await requireAdmin(req);
    if (req.method === 'GET') {
      const { id, section, meta: m } = req.query || {};
      if (m) {
        const { data: rc } = await sb.from('report_config').select('key,value'); const config = { ...DEFAULT_CONFIG };
        for (const r of rc || []) if (r.key in config && Number.isFinite(Number(r.value))) config[r.key] = Number(r.value);
        return json(res, 200, meta(config));
      }
      if (id) {
        const { data: lead, error } = await sb.from('leads').select(SELECT).eq('id', id).maybeSingle();
        if (error) throw error;
        if (!lead) return json(res, 404, { error: 'NOT_FOUND' });
        const ev = await sb.from('lead_events').select('action,actor,data,created_at').eq('lead_id', id).order('created_at', { ascending: true });
        const evidence = Object.values(lead.steps || {}).flatMap(s => s.files || []);
        const urls = { ...(await signed(sb, 'crm-evidence', evidence)), ...(await signed(sb, 'trade-in-photos', lead.image_urls)) };
        return json(res, 200, { lead, events: ev.data || [], urls });
      }
      if (section) {
        const s = SECTIONS[section];
        if (!s) return json(res, 400, { error: 'SECCION_DESCONOCIDA' });
        const { data, error } = await sb.from('leads').select(SELECT).eq('lead_type', s.lead_type).order('created_at', { ascending: false }).limit(500);
        if (error) throw error;
        return json(res, 200, { data });
      }
      const { data, error } = await sb.from('leads').select('lead_type,stage').limit(5000);
      if (error) throw error;
      const counts = {};
      for (const r of data) { const k = SECTION_BY_LEAD_TYPE[r.lead_type]; if (!k) continue; counts[k] ||= {}; counts[k][r.stage] = (counts[k][r.stage] || 0) + 1; }
      return json(res, 200, { counts });
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });

    const { action, id, ...input } = req.body || {};
    if (!ACTIONS.includes(action)) return json(res, 400, { error: 'ACCION_DESCONOCIDA' });
    const { data: lead, error } = await sb.from('leads').select(SELECT).eq('id', id).maybeSingle();
    if (error) throw error;
    if (!lead) return json(res, 404, { error: 'NOT_FOUND' });

    const { patch, event } = applyAction(lead, action, input);
    if (action === 'finish' && patch.closing?.variant_id) {
      // Foto fija del precio y costo al cerrar: los informes no cambian si luego editas precios
      const vid = patch.closing.variant_id;
      const [v, c] = await Promise.all([
        sb.from('variants').select('id,storage,price,products!inner(category,model)').eq('id', vid).maybeSingle(),
        sb.from('variant_costs').select('cost').eq('variant_id', vid).maybeSingle()
      ]);
      if (v.error || !v.data) throw new Error('DISPOSITIVO_INVALIDO');
      patch.closing = { ...patch.closing, model: v.data.products.model, storage: v.data.storage, category: v.data.products.category, precio_venta: Number(v.data.price), costo: Number(c.data?.cost ?? 0), snapshot_at: new Date().toISOString() };
      event.data.closing = patch.closing;
    }
    let plan = null;
    if (action === 'finish' && lead.lead_type === 'plan_b') plan = await findPlan(sb, patch.closing); // sin plan de pago no se cierra
    const { data: upd, error: ue } = await sb.from('leads').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).eq('stage', lead.stage).select(SELECT).maybeSingle();
    if (ue) throw ue;
    if (!upd) return json(res, 409, { error: 'CONFLICTO_ACTUALIZA_Y_REINTENTA' });
    if (plan) {
      try { await createFinanciacion(sb, upd, patch.closing, plan, user.id); }
      catch (e) { await sb.from('leads').update({ stage: 'en_proceso', finalized_at: null, closing: null }).eq('id', id); throw e; }
    }
    if (action === 'mark_done' && lead.lead_type === 'plan_c' && input.step === 'recibido') {
      // El equipo recibido entra al inventario de Retoma con foto fija de precios
      const f = upd.steps?.recibido?.fields || {};
      const { data: v } = await sb.from('variants').select('id,storage,price,products!inner(category,model)').eq('id', f.variant_id).maybeSingle();
      if (v) {
        const { data: pl } = await sb.from('planb_plans').select('valor_credito').eq('category', v.products.category).eq('model', v.products.model).eq('storage', v.storage).maybeSingle();
        await sb.from('equipos_recibidos').upsert({ lead_id: id, variant_id: v.id, model: v.products.model, storage: v.storage, category: v.products.category, imei: f.imei_recibido || null, valor_recibido: Number(f.valor_recibido), precio_contado: Number(v.price), valor_credito: pl?.valor_credito ?? null }, { onConflict: 'lead_id' });
      }
    }
    if (action === 'remove_file') await sb.storage.from('crm-evidence').remove([input.path]);
    await sb.from('lead_events').insert({ lead_id: id, action: event.action, actor: user.id, data: event.data });
    return json(res, 200, { lead: upd });
  } catch (e) {
    const code = String(e.message || '');
    const status = code === 'UNAUTHORIZED' ? 401 : code === 'FORBIDDEN' ? 403 : code === 'PASO_BLOQUEADO' || code === 'SOLO_LECTURA' ? 409
      : /^(PLAN|CLIENTE|DISPOSITIVO|NOMBRE|FECHA|MOTIVO|FALTAN|ETAPA|ENTIDAD|PASO|ACCION|SECCION|ARCHIVO|DEMASIADAS)/.test(code) ? 400 : 500;
    return json(res, status, { error: code });
  }
}
