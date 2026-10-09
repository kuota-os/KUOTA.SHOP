// Diagnóstico de configuración: kuota.shop/api/health. Solo dice "ok / falta / revisar" y códigos; nunca muestra valores ni secretos.
import { createClient } from '@supabase/supabase-js';
import { json } from '../../lib/supabase.js';

const ENV = {
  SUPABASE_URL: v => /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(v) || 'REVISAR: debe ser https://TU-PROYECTO.supabase.co (sin / al final ni /rest/v1)',
  SUPABASE_ANON_KEY: v => /^(sb_publishable_|eyJ)/.test(v) || 'REVISAR: debe ser la clave pública (publishable / anon)',
  SUPABASE_SERVICE_ROLE_KEY: v => /^sb_publishable_/.test(v) ? 'REVISAR: pusiste la clave pública; aquí va la secreta (service_role / secret)' : (/^(sb_secret_|eyJ)/.test(v) || 'REVISAR: debe ser la clave secreta (service_role / secret)'),
  WOMPI_PUBLIC_KEY: v => /^pub_(test|prod)_/.test(v) || 'REVISAR: debe empezar por pub_test_ o pub_prod_',
  WOMPI_INTEGRITY_SECRET: v => /^(test|prod)_integrity_/.test(v) || 'REVISAR: debe empezar por test_integrity_ o prod_integrity_',
  WOMPI_EVENTS_SECRET: v => /^(test|prod)_events_/.test(v) || 'REVISAR: debe empezar por test_events_ o prod_events_',
  WOMPI_CHECKOUT_URL: v => /^https:\/\//.test(v) || 'REVISAR: debe empezar por https://',
  KUOTA_BASE_URL: v => (/^https:\/\/[^/]+$/.test(v) || 'REVISAR: ejemplo https://www.kuota.shop (sin / al final)'),
  WHATSAPP_NUMBER: v => /^\d{10,15}$/.test(v) || 'REVISAR: solo números con indicativo, ej. 573246613532'
};
const TABLES = ['products', 'variants', 'planb_plans', 'settings', 'customers', 'leads', 'orders', 'financiaciones', 'cuotas', 'pagos', 'sales', 'admin_users', 'variant_costs', 'price_changes', 'lead_events', 'report_config', 'equipos_recibidos', 'lock_events'];
const code = e => (e?.status === 401 ? 'CLAVE_INVALIDA' : e?.code ? `DB_${String(e.code).toUpperCase()}` : 'ERROR');

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  const problemas = [], env = {};
  for (const [k, check] of Object.entries(ENV)) {
    const v = process.env[k];
    if (!v) { env[k] = 'FALTA'; problemas.push(`Falta la variable ${k} en Vercel.`); continue; }
    const r = check(v); env[k] = r === true ? 'ok' : r; if (r !== true) problemas.push(`${k}: ${r}`);
  }
  const mode = k => (process.env[k] || '').match(/^(pub_|test_|prod_)?(test|prod)/)?.[2];
  const modes = ['WOMPI_PUBLIC_KEY', 'WOMPI_INTEGRITY_SECRET', 'WOMPI_EVENTS_SECRET'].map(mode).filter(Boolean);
  if (new Set(modes).size > 1) problemas.push('Wompi: mezclaste llaves de pruebas (test) con llaves de producción (prod). Todas deben ser del mismo tipo.');
  const out = { env, wompi_modo: modes.length ? (new Set(modes).size > 1 ? 'MEZCLADO' : modes[0] === 'test' ? 'PRUEBAS' : 'PRODUCCION') : 'DESCONOCIDO', supabase: {} };

  const url = process.env.SUPABASE_URL;
  if (url && process.env.SUPABASE_ANON_KEY) {
    try { const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: process.env.SUPABASE_ANON_KEY } }); out.supabase.clave_publica = r.ok ? 'ok' : `RECHAZADA_${r.status}`; if (!r.ok) problemas.push('Supabase rechazó SUPABASE_ANON_KEY: revisa que sea de este proyecto.');
      else { const j = await r.json().catch(() => ({})); out.supabase.login_por_correo = j?.external?.email === false ? 'DESACTIVADO' : 'activado'; if (j?.external?.email === false) problemas.push('Supabase: el ingreso por correo está desactivado (Authentication > Sign In / Providers > Email).'); } }
    catch { out.supabase.clave_publica = 'SIN_CONEXION'; problemas.push('No se pudo conectar con Supabase: revisa SUPABASE_URL.'); }
  }
  if (url && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const sb = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const tablas = {};
    await Promise.all(TABLES.map(async t => { try { const { error } = await sb.from(t).select('*', { head: true, count: 'exact' }).limit(1); tablas[t] = error ? code(error) : 'ok'; } catch { tablas[t] = 'ERROR'; } }));
    out.supabase.tablas = tablas;
    const mal = Object.entries(tablas).filter(([, v]) => v !== 'ok');
    if (mal.some(([, v]) => v === 'CLAVE_INVALIDA')) problemas.push('Supabase rechazó SUPABASE_SERVICE_ROLE_KEY: revisa que sea la clave secreta de este proyecto.');
    else if (mal.length) problemas.push(`Faltan o fallan tablas (${mal.map(([k, v]) => `${k}: ${v}`).join(', ')}). Ejecuta los archivos SQL 01 al 09 en orden.`);
    try { const { data } = await sb.storage.listBuckets(); const b = Object.fromEntries((data || []).map(x => [x.name, x.public ? 'PUBLICO' : 'privado']));
      out.supabase.buckets = { 'device-images': b['device-images'] ?? 'FALTA', 'trade-in-photos': b['trade-in-photos'] ?? 'FALTA', 'crm-evidence': b['crm-evidence'] ?? 'FALTA' };
      for (const n of ['trade-in-photos', 'crm-evidence']) { if (!b[n]) problemas.push(`Falta el almacenamiento "${n}" (SQL 01 y 07).`); else if (b[n] === 'PUBLICO') problemas.push(`El almacenamiento "${n}" es PÚBLICO y debe ser privado.`); } } catch { out.supabase.buckets = 'ERROR'; }
    if (tablas.admin_users === 'ok') { const { count, data } = await sb.from('admin_users').select('id', { count: 'exact', head: true }).eq('active', true); out.supabase.administradores_activos = count ?? data?.length ?? 0; if (!out.supabase.administradores_activos) problemas.push('No hay ningún administrador activo: ejecuta el SQL 10 con tu correo.'); }
  }
  out.ok = problemas.length === 0; out.problemas = problemas;
  return json(res, 200, out);
}
