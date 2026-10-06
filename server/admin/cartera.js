import { requireAdmin, json } from '../../lib/supabase.js';
import { recomputeFinancing } from '../../lib/finance.js';

const LOCK_REASONS = ['Falta de pago', 'Pérdida', 'Robo'];
const UNLOCK_REASONS = ['Ya pagó', 'Ya encontró el dispositivo', 'Se hizo justicia con el robo'];
const SEL = '*,customers(full_name,primer_apellido,cedula,whatsapp,email),cuotas(id,numero_cuota,fecha_vencimiento,valor,estado)';

async function kuotaNumber(sb) {
  const { data } = await sb.from('settings').select('value').eq('key', 'whatsapp_number').maybeSingle();
  return String(data?.value ?? process.env.WHATSAPP_NUMBER ?? '573246613532').replace(/\D/g, '');
}
const summary = f => {
  const cu = [...(f.cuotas || [])].sort((a, b) => a.numero_cuota - b.numero_cuota), paid = cu.filter(c => c.estado === 'pagada').length, next = cu.find(c => c.estado !== 'pagada') || null;
  return { ...f, cuotas: cu, pagadas: paid, total: cu.length, proxima: next };
};
export default async function handler(req, res) {
  try {
    const { sb, user } = await requireAdmin(req);
    if (req.method === 'GET') {
      const { id } = req.query || {};
      if (!id) {
        const { data, error } = await sb.from('financiaciones').select(SEL).neq('status', 'cancelada').order('created_at', { ascending: false }).limit(500);
        if (error) throw error;
        return json(res, 200, { data: data.map(summary) });
      }
      const { data: f, error } = await sb.from('financiaciones').select(SEL).eq('id', id).maybeSingle();
      if (error) throw error;
      if (!f) return json(res, 404, { error: 'NOT_FOUND' });
      const { data: ev } = await sb.from('lock_events').select('action,reason,evidence_path,created_at').eq('financiacion_id', id).order('created_at', { ascending: false });
      const paths = (ev || []).map(e => e.evidence_path).filter(Boolean);
      const urls = {};
      if (paths.length) { const { data: s } = await sb.storage.from('crm-evidence').createSignedUrls(paths, 3600); for (const x of s || []) if (x.signedUrl) urls[x.path] = x.signedUrl; }
      return json(res, 200, { data: summary(f), events: ev || [], urls, reasons: { lock: LOCK_REASONS, unlock: UNLOCK_REASONS } });
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    const { action, id, reason, evidence_path } = req.body || {};
    const { data: f, error } = await sb.from('financiaciones').select(SEL).eq('id', id).maybeSingle();
    if (error) throw error;
    if (!f) return json(res, 404, { error: 'NOT_FOUND' });
    const equipo = `${f.product_model} ${f.storage || ''}`.trim(), c = f.customers || {};
    let text, state;
    if (action === 'bloquear') {
      if (!LOCK_REASONS.includes(reason)) return json(res, 400, { error: 'MOTIVO_INVALIDO' });
      if (f.lock_state !== 'activo' || f.status === 'pagada') return json(res, 409, { error: 'NO_SE_PUEDE_BLOQUEAR' });
      state = 'bloqueado';
      text = `El dispositivo ${equipo} se debe bloquear por ${reason}. IMEI: ${f.imei || 'sin registrar'}. Cédula: ${c.cedula || 'sin registrar'}.`;
    } else if (action === 'desbloquear') {
      if (!UNLOCK_REASONS.includes(reason)) return json(res, 400, { error: 'MOTIVO_INVALIDO' });
      if (f.lock_state !== 'bloqueado') return json(res, 409, { error: 'NO_ESTA_BLOQUEADO' });
      if (!evidence_path || !String(evidence_path).startsWith(`locks/${id}/`)) return json(res, 400, { error: 'FOTO_OBLIGATORIA' });
      const { data: ok } = await sb.storage.from('crm-evidence').list(`locks/${id}`, { search: String(evidence_path).split('/').pop() });
      if (!ok?.length) return json(res, 400, { error: 'FOTO_NO_ENCONTRADA' });
      const { data: s } = await sb.storage.from('crm-evidence').createSignedUrl(evidence_path, 7 * 24 * 3600);
      state = 'activo';
      text = `El dispositivo ${equipo} se debe desbloquear por ${reason}. IMEI: ${f.imei || 'sin registrar'}. Cédula: ${c.cedula || 'sin registrar'}. Foto del cliente con el dispositivo y la cédula (enlace válido 7 días): ${s?.signedUrl || ''}`;
    } else return json(res, 400, { error: 'ACCION_DESCONOCIDA' });

    const { data: upd, error: ue } = await sb.from('financiaciones').update({ lock_state: state, updated_at: new Date().toISOString() }).eq('id', id).eq('lock_state', f.lock_state).select('id').maybeSingle();
    if (ue) throw ue;
    if (!upd) return json(res, 409, { error: 'CONFLICTO_ACTUALIZA_Y_REINTENTA' });
    await sb.from('lock_events').insert({ financiacion_id: id, action, reason, evidence_path: action === 'desbloquear' ? evidence_path : null, actor: user.id });
    const num = await kuotaNumber(sb);
    return json(res, 200, { ok: true, lock_state: state, whatsapp_url: `https://wa.me/${num}?text=${encodeURIComponent(text)}`, text });
  } catch (e) {
    const code = String(e.message || '');
    return json(res, code === 'UNAUTHORIZED' ? 401 : code === 'FORBIDDEN' ? 403 : /^(MOTIVO|NO_|FOTO|ACCION|CONFLICTO)/.test(code) ? (code.startsWith('NO_') || code.startsWith('CONFLICTO') ? 409 : 400) : 500, { error: code });
  }
}
