// Base de datos en memoria con la API mínima de supabase-js que usa el backend (para pruebas)
export function fakeSb(seed = {}, { users = {}, failOn = null } = {}) {
  const db = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map(r => ({ ...r }))]));
  let n = 0;
  const from = t => {
    db[t] ||= [];
    let filt = [], op = 'select', payload, lim = Infinity, ord = null;
    const q = {
      select: () => q, order: (k, o) => (ord = [k, o?.ascending !== false], q), limit: x => (lim = x, q),
      eq: (k, v) => (filt.push(r => r[k] === v), q), is: (k, v) => (filt.push(r => (v === null ? r[k] == null : r[k] === v)), q),
      in: (k, v) => (filt.push(r => v.includes(r[k])), q), gte: (k, v) => (filt.push(r => r[k] >= v), q), lte: (k, v) => (filt.push(r => r[k] <= v), q),
      ilike: (k, v) => (filt.push(r => new RegExp('^' + String(v).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i').test(r[k] ?? '')), q),
      neq: (k, v) => (filt.push(r => r[k] !== v), q),
      insert: p => (op = 'insert', payload = p, q), upsert: p => (op = 'upsert', payload = p, q), update: p => (op = 'update', payload = p, q), delete: () => (op = 'delete', q),
      _run() {
        if (failOn === t) return { data: null, error: { message: 'relation "x" does not exist (detalle interno)' } };
        let m = db[t].filter(r => filt.every(f => f(r)));
        if (ord) m = [...m].sort((a, b) => (a[ord[0]] > b[ord[0]] ? 1 : -1) * (ord[1] ? 1 : -1));
        if (op === 'insert' || op === 'upsert') { const arr = (Array.isArray(payload) ? payload : [payload]).map(x => ({ id: 'id' + ++n, ...x })); db[t].push(...arr); return { data: arr, error: null }; }
        if (op === 'update') { m.forEach(r => Object.assign(r, payload)); return { data: m, error: null }; }
        if (op === 'delete') { db[t] = db[t].filter(r => !m.includes(r)); return { data: null, error: null }; }
        return { data: m.slice(0, lim), error: null };
      },
      single() { const r = q._run(); return Promise.resolve(r.error ? r : { data: r.data[0] ?? null, error: r.data[0] ? null : { message: 'no rows' } }); },
      maybeSingle() { const r = q._run(); return Promise.resolve(r.error ? r : { data: r.data[0] ?? null, error: null }); },
      then(f, g) { return Promise.resolve(q._run()).then(f, g); }
    };
    return q;
  };
  return { db, from, rpc: async () => ({ data: null, error: null }), storage: { from: () => ({ createSignedUrls: async () => ({ data: [] }), remove: async () => ({}), upload: async () => ({}) }) },
    auth: { getUser: async tok => (users[tok] ? { data: { user: users[tok] }, error: null } : { data: { user: null }, error: { message: 'invalid' } }) } };
}
export function mockRes() {
  const r = { code: 200, headers: {}, body: undefined, status(c) { r.code = c; return r; }, setHeader(k, v) { r.headers[k] = v; return r; }, json(b) { r.body = b; return r; }, end(b) { r.body = b; return r; }, send(b) { r.body = b; return r; } };
  return r;
}
