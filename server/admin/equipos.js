import { requireAdmin, json } from '../../lib/supabase.js';
import { DEFAULT_CONFIG, rentabilidadRetoma } from '../../lib/reports.js';

async function cfg(sb) {
  const { data } = await sb.from('report_config').select('key,value');
  const c = { ...DEFAULT_CONFIG };
  for (const r of data || []) if (r.key in c && Number.isFinite(Number(r.value))) c[r.key] = Number(r.value);
  return c;
}
export default async function handler(req, res) {
  try {
    const { sb, user } = await requireAdmin(req);
    if (req.method === 'GET') {
      const [{ data, error }, c] = await Promise.all([
        sb.from('equipos_recibidos').select('*,leads(customers(full_name,primer_apellido))').order('created_at', { ascending: false }).limit(500), cfg(sb)
      ]);
      if (error) throw error;
      return json(res, 200, { data: data.map(e => ({ ...e, rentabilidad: rentabilidadRetoma({ recibido: e.valor_recibido, precioContado: e.precio_contado, valorCredito: e.valor_credito }, c) })) });
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    const { action, id } = req.body || {};
    if (action !== 'vender' || !id) return json(res, 400, { error: 'ACCION_DESCONOCIDA' });
    // Una sola vez: solo cambia si sigue en inventario (no se reactiva)
    const { data, error } = await sb.from('equipos_recibidos').update({ status: 'vendido', sold_at: new Date().toISOString(), sold_by: user.id }).eq('id', id).eq('status', 'en_inventario').select('*').maybeSingle();
    if (error) throw error;
    if (!data) return json(res, 409, { error: 'YA_VENDIDO_O_NO_EXISTE' });
    return json(res, 200, { data });
  } catch (e) {
    const code = String(e.message || '');
    return json(res, code === 'UNAUTHORIZED' ? 401 : code === 'FORBIDDEN' ? 403 : code === 'YA_VENDIDO_O_NO_EXISTE' ? 409 : 500, { error: code });
  }
}
