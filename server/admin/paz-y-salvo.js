import { requireAdmin } from '../../lib/supabase.js';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export default async function handler(req, res) {
  try {
    const { sb } = await requireAdmin(req);
    const { data: f } = await sb.from('financiaciones').select('*,customers(full_name,primer_apellido,cedula)').eq('id', req.query?.id).maybeSingle();
    const send = (code, body) => res.status(code).setHeader('Content-Type', 'text/html; charset=utf-8').setHeader('Cache-Control', 'no-store').end(body);
    if (!f) return send(404, '<p>No encontrado</p>');
    if (f.status !== 'pagada') return send(409, '<p>La financiación aún no está pagada.</p>');
    const c = f.customers || {}, fecha = new Date(f.paz_y_salvo_at || Date.now()).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric' });
    return send(200, `<!doctype html><html lang="es"><meta charset="utf-8"><title>Paz y salvo KUOTA</title><style>body{font:16px/1.6 Georgia,serif;max-width:680px;margin:60px auto;padding:0 24px;color:#111}h1{font:700 28px Arial,sans-serif;letter-spacing:.04em}.k{color:#6a8a00}hr{border:0;border-top:2px solid #111;margin:24px 0}.f{margin-top:80px}</style>
<h1>KUOTA <span class="k">PAZ Y SALVO</span></h1><hr>
<p>KUOTA hace constar que <b>${esc(c.full_name)} ${esc(c.primer_apellido)}</b>, identificado(a) con cédula <b>${esc(c.cedula)}</b>, canceló la totalidad de su financiación del dispositivo <b>${esc(f.product_model)} ${esc(f.storage || '')}</b>${f.imei ? ` (IMEI ${esc(f.imei)})` : ''}, y se encuentra a paz y salvo por todo concepto con KUOTA.</p>
<p>Expedido en Cartagena de Indias, el ${esc(fecha)}.</p><p class="f">______________________________<br>KUOTA</p><p style="color:#777;font-size:13px">Referencia: ${esc(f.id)}</p></html>`);
  } catch (e) { return res.status(e.message === 'UNAUTHORIZED' ? 401 : e.message === 'FORBIDDEN' ? 403 : 500).end(String(e.message)); }
}
