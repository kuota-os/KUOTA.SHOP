import { createClient } from '@supabase/supabase-js';

export function getServerSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('CONFIG_FALTA_SUPABASE_SERVICE_KEY');
  return createClient(url, key, { auth: { autoRefreshToken:false, persistSession:false } });
}

export function getAnonSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('CONFIG_FALTA_SUPABASE_ANON_KEY');
  return createClient(url, key);
}

export async function requireAdmin(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('UNAUTHORIZED');
  const sb = getServerSupabase();
  const { data:{ user }, error } = await sb.auth.getUser(token);
  if (error || !user) throw new Error('UNAUTHORIZED');
  const { data: admin, error: aerr } = await sb.from('admin_users').select('id,active').eq('auth_user_id', user.id).maybeSingle();
  if (aerr || !admin?.active) throw new Error('FORBIDDEN');
  return { sb, user, admin };
}

export async function requireCustomer(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('UNAUTHORIZED');
  const sb = getServerSupabase();
  const { data:{ user }, error } = await sb.auth.getUser(token);
  if (error || !user) throw new Error('UNAUTHORIZED');
  const { data: customer, error: cerr } = await sb.from('customers').select('*').eq('auth_user_id', user.id).maybeSingle();
  if (cerr || !customer) throw new Error('CUSTOMER_NOT_LINKED');
  return { sb, user, customer };
}

export function json(res, status, body, headers={}) {
  res.status(status).setHeader('Content-Type','application/json; charset=utf-8').setHeader('Cache-Control','no-store');
  Object.entries(headers).forEach(([k,v])=>res.setHeader(k,v));
  return res.end(JSON.stringify(body));
}

// Respuestas de error para endpoints PÚBLICOS: solo códigos (nunca texto interno ni datos). El detalle completo queda en los logs de Vercel.
// Códigos de Supabase: base de datos -> DB_<código> (ej. DB_42P01 = tabla inexistente); autenticación -> AUTH_<CÓDIGO> (ej. AUTH_OVER_EMAIL_SEND_RATE_LIMIT).
export function safeError(e) {
  const m = String(e?.message || '');
  if (/^[A-Z0-9_]{3,40}$/.test(m)) return m;
  console.error('[KUOTA]', e?.code || '', m.slice(0, 300));
  const c = String(e?.code || '');
  if (/^[A-Za-z0-9_]{3,60}$/.test(c)) return (/^[a-z][a-z0-9_]*$/.test(c) ? 'AUTH_' : 'DB_') + c.toUpperCase();
  if (e?.status === 401 || /invalid api key/i.test(m)) return 'CONFIG_CLAVE_SUPABASE_INVALIDA';
  return 'SERVER_ERROR';
}
