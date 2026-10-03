// Revisión estática de los SQL: orden de ejecución, dependencias entre tablas, bloques balanceados y archivo combinado al día
import fs from 'node:fs';
const order = ['01_base_catalogo', '02_ordenes', '03_login_clientes', '04_financiaciones', '05_seguridad_y_alineacion', '06_precios_admin', '07_solicitudes_crm', '08_informes', '09_retoma_cartera'];
const errors = [];
const known = new Set(['auth.users', 'storage.objects', 'storage.buckets']);
let combined = '';
for (const name of order) {
  const file = `supabase/${name}.sql`;
  const raw = fs.readFileSync(file, 'utf8');
  const sql = raw.replace(/--[^\n]*/g, '');
  combined += `\n-- ======================= ${name}.sql =======================\n${raw.trim()}\n`;
  if ((sql.match(/\$\$/g) || []).length % 2) errors.push(`${file}: bloque $$ sin cerrar`);
  let depth = 0; for (const ch of sql.replace(/'[^']*'/g, "''")) { if (ch === '(') depth++; if (ch === ')') depth--; if (depth < 0) break; }
  if (depth !== 0) errors.push(`${file}: paréntesis desbalanceados`);
  // tablas creadas hasta aquí (incluye este archivo, en orden de aparición)
  for (const m of sql.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)/gi)) known.add(m[1]);
  for (const m of sql.matchAll(/references\s+(?:public\.)?([\w.]+)\s*\(/gi)) if (!known.has(m[1]) && !known.has(m[1].replace('public.', ''))) errors.push(`${file}: referencia a "${m[1]}" que aún no existe en ese punto del orden`);
  for (const m of sql.matchAll(/alter table (?:if exists )?(?:only )?(?:public\.)?(\w+)/gi)) if (!known.has(m[1])) errors.push(`${file}: ALTER sobre "${m[1]}" antes de crearla`);
  for (const m of sql.matchAll(/insert into (?:public\.)?(\w+)\s*(?:\(|values|select)/gi)) if (!known.has(m[1]) && !known.has('storage.' + m[1])) errors.push(`${file}: INSERT en "${m[1]}" antes de crearla`);
  if (!/\bunsafe\b/.test(sql) && /drop table|truncate/i.test(sql)) errors.push(`${file}: contiene DROP TABLE/TRUNCATE (peligroso en una base con datos)`);
}
// toda tabla del esquema debe tener RLS activado
const all = order.map(n => fs.readFileSync(`supabase/${n}.sql`, 'utf8').replace(/--[^\n]*/g, '')).join('\n');
for (const m of all.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)/gi)) if (!new RegExp(`alter table (?:public\\.)?${m[1]}\\s+enable row level security`, 'i').test(all)) errors.push(`Tabla ${m[1]} sin RLS activado`);
// archivo combinado
const header = '-- KUOTA: instalación COMPLETA desde cero (generado automáticamente a partir de los 9 archivos, en orden).\n-- Úsalo SOLO en una base nueva. Para actualizar una base que ya tiene datos, ejecuta únicamente el archivo nuevo que corresponda.\n';
const target = 'supabase/00_INSTALAR_TODO.sql';
if (process.argv.includes('--write')) fs.writeFileSync(target, header + combined);
else if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== header + combined) errors.push('00_INSTALAR_TODO.sql no coincide con los 9 archivos (ejecuta: node scripts/sql-check.mjs --write)');
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`sql-check: ${order.length} archivos en orden, dependencias y RLS correctos`);
