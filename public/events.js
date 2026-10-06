/* KUOTA — delegación de eventos compatible con CSP (sin inline handlers ni eval).
   Los atributos data-on-click / data-on-change contienen llamadas simples:
   fn(); fn('texto', 3); fn(this.files); document.getElementById('id').click() */
(function(){
  'use strict';
  function splitTop(str, sep){
    const out=[]; let cur='', q=null;
    for(let i=0;i<str.length;i++){
      const c=str[i];
      if(q){ cur+=c; if(c==='\\'){cur+=str[++i]||'';} else if(c===q){q=null;} continue; }
      if(c==="'"||c==='"'){ q=c; cur+=c; continue; }
      if(c===sep){ out.push(cur); cur=''; continue; }
      cur+=c;
    }
    if(cur.trim()!=='') out.push(cur);
    return out;
  }
  function parseArg(tok, el){
    const t=tok.trim();
    if(t==='this') return el;
    if(t==='this.files') return el.files;
    if(t==='this.value') return el.value;
    if(t==='this.checked') return el.checked;
    if(t==='true') return true;
    if(t==='false') return false;
    if(t==='null') return null;
    if(/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    const m=t.match(/^(['"])([\s\S]*)\1$/);
    if(m) return m[2].replace(/\\(.)/g,'$1');
    throw new Error('Argumento no soportado: '+t);
  }
  function runStatement(stmt, el){
    const s=stmt.trim(); if(!s) return;
    const dom=s.match(/^document\.getElementById\((['"])([\w-]+)\1\)\.click\(\)$/);
    if(dom){ const t=document.getElementById(dom[2]); if(t) t.click(); return; }
    const m=s.match(/^([A-Za-z_$][\w$]*)\(([\s\S]*)\)$/);
    if(!m) throw new Error('Expresión no soportada: '+s);
    const fn=window[m[1]];
    if(typeof fn!=='function') throw new Error('Función no encontrada: '+m[1]);
    const args=splitTop(m[2],',').map(a=>parseArg(a,el));
    fn.apply(el,args);
  }
  function dispatch(type, attr){
    document.addEventListener(type, function(ev){
      const el=ev.target.closest('['+attr+']');
      if(!el) return;
      try{ splitTop(el.getAttribute(attr),';').forEach(s=>runStatement(s,el)); }
      catch(e){ console.error('[KUOTA events]', e); }
    });
  }
  dispatch('click','data-on-click');
  dispatch('change','data-on-change');
})();
