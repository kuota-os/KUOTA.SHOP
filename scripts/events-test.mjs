// Verifica que cada handler data-on-* de index.html/app.js se resuelve a funciones reales de app.js
import fs from 'node:fs';
const html=fs.readFileSync('public/index.html','utf8'), app=fs.readFileSync('public/app.js','utf8');
const flat=(html+app).replace(/\$\{[^}]*\}/g,'1'); // plantillas ${...} -> valor de prueba
const exprs=[...flat.matchAll(/data-on-(?:click|change)="([^"]+)"/g)].map(m=>m[1]);
const declared=new Set([...app.matchAll(/(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)].map(m=>m[1]));
const calls=[];
const listeners={};
globalThis.window=globalThis;
globalThis.document={addEventListener:(t,fn)=>{listeners[t]=fn}, getElementById:id=>({click:()=>calls.push('click#'+id)})};
for(const name of declared) globalThis[name]=(...a)=>calls.push(name+'('+a.map(x=>typeof x==='object'?'obj':JSON.stringify(x)).join(',')+')');
await import('../public/events.js');
let fail=0;
for(const raw of exprs){
  const expr=raw;
  const el={files:{length:1},value:'v',checked:true,getAttribute:()=>expr,closest:function(){return this}};
  const before=calls.length, origErr=console.error; let err=null; console.error=(...a)=>{err=a};
  listeners[/change/.test(raw)&&false?'change':'click']({target:el});
  console.error=origErr;
  if(err||calls.length===before){fail++;console.log('FALLA:',raw,err?.[1]?.message||'sin efecto')}
}
console.log(`events-test: ${exprs.length} handlers revisados, ${fail} fallas`);
if(fail) process.exit(1);
