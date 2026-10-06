import crypto from 'node:crypto';
import Busboy from 'busboy';
import { requireAdmin, json } from '../../lib/supabase.js';

const MAX = 4 * 1024 * 1024; // Vercel limita el cuerpo de la petición a ~4.5 MB: el panel comprime y sube 1 foto por petición
const MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
function parse(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { fileSize: MAX, files: 1, fields: 5 } });
    const fields = {}; let file = null;
    bb.on('field', (n, v) => { if (n.length < 40) fields[n] = String(v).slice(0, 200); });
    bb.on('file', (name, f, info) => { const chunks = []; f.on('data', d => chunks.push(d)); f.on('limit', () => reject(new Error('ARCHIVO_MUY_GRANDE'))); f.on('end', () => { file = { mime: info.mimeType, buffer: Buffer.concat(chunks) }; }); });
    bb.on('error', reject); bb.on('finish', () => resolve({ fields, file })); req.pipe(bb);
  });
}
function magicOk(f) {
  const b = f.buffer;
  if (f.mime === 'image/jpeg') return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (f.mime === 'image/png') return b.length > 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
}
export default async function handler(req, res) {
  try {
    const { sb } = await requireAdmin(req);
    if (req.method !== 'POST') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    const { fields, file } = await parse(req);
    if (!file || !MIME.has(file.mime) || !magicOk(file)) return json(res, 400, { error: 'ARCHIVO_INVALIDO' });
    const { data: f } = await sb.from('financiaciones').select('id,lock_state').eq('id', fields.id).maybeSingle();
    if (!f) return json(res, 404, { error: 'NOT_FOUND' });
    if (f.lock_state !== 'bloqueado') return json(res, 409, { error: 'NO_ESTA_BLOQUEADO' });
    const ext = file.mime === 'image/png' ? 'png' : file.mime === 'image/webp' ? 'webp' : 'jpg';
    const path = `locks/${f.id}/${crypto.randomUUID()}.${ext}`;
    const up = await sb.storage.from('crm-evidence').upload(path, file.buffer, { contentType: file.mime, upsert: false });
    if (up.error) throw up.error;
    return json(res, 201, { path });
  } catch (e) {
    const code = String(e.message || '');
    return json(res, code === 'UNAUTHORIZED' ? 401 : code === 'FORBIDDEN' ? 403 : /^(NO_|ARCHIVO)/.test(code) ? 400 : 500, { error: code });
  }
}
