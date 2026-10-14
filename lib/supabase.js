import { createClient } from '@supabase/supabase-js';

export function getServerSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { autoRefreshToken:false, persistSession:false } });
}

export function getAnonSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_ANON_KEY');
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
