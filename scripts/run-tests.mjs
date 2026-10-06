// Ejecuta todas las pruebas automáticas en orden y resume el resultado
import { spawnSync } from 'node:child_process';
const tests = ['finance-test', 'pricing-test', 'crm-test', 'reports-test', 'cartera-test', 'events-test', 'sql-check', 'api-test'];
let failed = 0;
for (const t of tests) {
  const r = spawnSync(process.execPath, [`scripts/${t}.mjs`], { encoding: 'utf8' });
  const last = (r.stdout || '').trim().split('\n').filter(Boolean).pop() || '';
  if (r.status === 0) console.log(`  OK   ${t.padEnd(14)} ${last}`);
  else { failed++; console.log(`  FALLA ${t}\n${(r.stdout || '') + (r.stderr || '')}`); }
}
console.log(failed ? `\n${failed} grupo(s) de pruebas con fallos` : `\nTodas las pruebas pasaron (${tests.length} grupos).`);
process.exit(failed ? 1 : 0);
