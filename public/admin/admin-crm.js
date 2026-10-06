/* KUOTA Admin — Solicitudes tipo CRM (4 secciones). Usa los helpers que admin.js publica en window.KUOTA_ADMIN */
const { api, $, esc } = window.KUOTA_ADMIN;
const CRM = { meta: null, sec: 'reportados', tab: 'en_espera', counts: {}, rows: [], d: null, msg: '' };
const CRM_TABS = [['en_espera', 'En espera'], ['en_proceso', 'En proceso'], ['rechazada', 'Rechazadas'], ['final', 'Finalizadas']];
const crmDate = s => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim()); if (!m) return false; const d = new Date(+m[3], +m[2] - 1, +m[1]); return d.getFullYear() === +m[3] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[1]; };
const crmFmt = iso => iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const crmNum = n => { const d = String(n || '').replace(/\D/g, ''); return d.length === 10 ? '57' + d : d; };
const crmStageOf = (l, sec) => sec.doneStage === 'cartera' ? l.stage : ((l.stage === 'finalizada' || l.stage === 'cartera') ? 'final' : l.stage);
const crmTabs = sec => sec.doneStage === 'cartera' ? [['en_espera', 'En espera'], ['en_proceso', 'En proceso'], ['rechazada', 'Rechazadas'], ['cartera', sec.doneLabel], ['finalizada', 'Reportados / Sin vida crediticia finalizados']] : [['en_espera', 'En espera'], ['en_proceso', 'En proceso'], ['rechazada', 'Rechazadas'], ['final', sec.doneLabel]];
const crmName = l => l.customers?.full_name ? `${l.customers.full_name} ${l.customers.primer_apellido || ''}`.trim() : (l.payload?.full_name || l.payload?.nombre || 'Sin nombre');

const CRM_ERR = { foto: 'falta subir al menos una foto', comprobante: 'sube el comprobante como 2.ª foto o escribe el valor en efectivo', imei: 'falta el IMEI', guia: 'falta el número de guía', metodo: 'elige el método de pago', entidad: 'elige la entidad', restante: 'escribe el restante a financiar', valor_recibido: 'escribe el valor recibido', imei_recibido: 'falta el IMEI del equipo recibido', device: 'elige el dispositivo', valor_credito: 'escribe el valor del crédito', cuota_inicial: 'escribe la cuota inicial recibida' };
function crmErr(c) {
  if (c.startsWith('FALTAN_DATOS:')) return 'Completa antes de continuar: ' + c.slice(13).split(',').map(k => CRM_ERR[k] || k).join('; ') + '.';
  return ({ PASO_BLOQUEADO: 'Completa primero el paso anterior.', SOLO_LECTURA: 'Esta solicitud ya está finalizada y no se puede editar.', PASOS_INCOMPLETOS: 'Faltan pasos por completar.', ETAPA_INVALIDA: 'La solicitud cambió de etapa; vuelve a abrirla.', CONFLICTO_ACTUALIZA_Y_REINTENTA: 'Otra persona la modificó; recarga e intenta de nuevo.', DEMASIADAS_FOTOS: 'Máximo 12 fotos por paso.', PASO_YA_COMPLETADO: 'Ese paso ya está marcado como listo.' })[c] || c;
}
async function crm() {
  if (!CRM.meta) CRM.meta = await api('/api/admin/crm?meta=1');
  CRM.counts = (await api('/api/admin/crm')).counts || {};
  CRM.d = null; await crmList();
}
async function crmList() {
  CRM.rows = (await api('/api/admin/crm?section=' + CRM.sec)).data || [];
  const M = CRM.meta.sections;
  const cnt = (k, st) => { const c = CRM.counts[k] || {}; return st ? (c[st] || 0) : 0; };
  const sec = M[CRM.sec], list = CRM.rows.filter(l => crmStageOf(l, sec) === CRM.tab);
  $('#panel').innerHTML = `<div class="eyebrow">Solicitudes</div><h1>Seguimiento.</h1>
  <div class="actions">${Object.entries(M).map(([k, s]) => `<button class="btn ${k === CRM.sec ? '' : 'ghost'}" data-sec="${k}">${esc(s.label)}${cnt(k, 'en_espera') ? ` (${cnt(k, 'en_espera')})` : ''}</button>`).join('')}</div>
  <div class="actions">${crmTabs(sec).map(([k, t]) => `<button class="btn ${k === CRM.tab ? '' : 'ghost'}" data-tab="${k}">${esc(t)}</button>`).join('')}</div>
  <div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Cliente</th><th>Equipo</th><th>Estado</th><th></th></tr></thead><tbody>${list.length ? list.map(l => `<tr><td>${crmFmt(l.created_at)}</td><td>${esc(crmName(l))}</td><td>${esc(l.device_label || '')}</td><td>${esc(l.stage.replace('_', ' '))}</td><td><button class="btn" data-open="${esc(l.id)}">Abrir</button></td></tr>`).join('') : '<tr><td colspan="5" class="muted">No hay solicitudes en esta etapa.</td></tr>'}</tbody></table></div>`;
  $('#panel').onclick = async e => {
    const b = e.target.closest('[data-sec],[data-tab],[data-open]'); if (!b) return;
    if (b.dataset.sec) { CRM.sec = b.dataset.sec; CRM.tab = 'en_espera'; return crmList(); }
    if (b.dataset.tab) { CRM.tab = b.dataset.tab; return crmList(); }
    await crmOpen(b.dataset.open);
  };
}
async function crmOpen(id) { if (!CRM.catalog) CRM.catalog = (await api('/api/admin/pricing')).data || []; CRM.d = await api('/api/admin/crm?id=' + id); CRM.msg = ''; crmDetail(); }
async function crmPost(body) {
  try { const r = await api('/api/admin/crm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: CRM.d.lead.id, ...body }) }); CRM.msg = ''; await crmOpen(r.lead.id); }
  catch (e) { CRM.msg = crmErr(e.message); crmDetail(); }
}
async function crmCompress(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { if (file.size < 4e6) return file; throw new Error('Formato no soportado: usa JPG, PNG o WebP'); }
  try {
    const bmp = await createImageBitmap(file), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(res => c.toBlob(b => res(b || file), 'image/jpeg', 0.82));
  } catch (_) { if (file.size < 4e6) return file; throw new Error('No se pudo comprimir la imagen'); }
}
function crmDetail() {
  const { lead: l, urls, events } = CRM.d, M = CRM.meta.sections;
  const key = Object.keys(M).find(k => ({ envio_nacional: 'envio_nacional', buena_vida: 'plan_a', reportados: 'plan_b', retoma: 'plan_c' })[k] === l.lead_type), sec = M[key];
  const ro = l.stage === 'finalizada' || l.stage === 'cartera', c = l.customers || {};
  const skip = new Set(['consent', 'image_urls']);
  const data = Object.entries(l.payload || {}).filter(([k, v]) => !skip.has(k) && v !== null && v !== '' && typeof v !== 'object').map(([k, v]) => `<div class="summary-line"><span class="k">${esc(k.replace(/_/g, ' '))}</span><span class="v">${esc(v)}</span></div>`).join('');
  const orig = (l.image_urls || []).map(p => urls[p] ? `<a href="${esc(urls[p])}" target="_blank" rel="noopener"><img src="${esc(urls[p])}" alt="Foto enviada por el cliente" style="width:88px;height:88px;object-fit:cover;border-radius:12px;margin:0 6px 6px 0"></a>` : '').join('');
  let body = '';
  if (l.stage === 'en_espera') body = `<div class="actions"><button class="btn" data-go="approve">Aprobar</button><button class="btn ghost" data-go="reject">Rechazar</button></div><div id="decide"></div>`;
  if (l.stage === 'rechazada') body = `<p class="muted">Rechazada por ${esc(l.decision?.by)} el ${esc(l.decision?.date?.split('-').reverse().join('/'))}. Motivo: ${esc(l.decision?.reason)}</p><button class="btn" data-act="reopen">Abrir nuevamente</button>`;
  if (l.stage === 'en_proceso' || ro) {
    const st = {}; let prev = !sec.needsEntity || !!l.entity;
    sec.steps.forEach(s => { const d = l.steps?.[s.key] || {}; st[s.key] = { done: !!d.done, open: prev }; prev = prev && !!d.done; });
    const allDone = sec.steps.every(s => st[s.key].done);
    body = (l.decision ? `<p class="muted">Aprobada por ${esc(l.decision.by)} el ${esc((l.decision.date || '').split('-').reverse().join('/'))}</p>` : '')
      + (sec.needsEntity ? `<div class="card"><label>Entidad</label><select class="field" id="ent" ${ro || Object.values(l.steps || {}).some(x => x.done) ? 'disabled' : ''}><option value="">Selecciona…</option>${CRM.meta.entities.map(e => `<option ${l.entity === e ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select></div>` : '')
      + sec.steps.map((s, i) => { const d = l.steps?.[s.key] || {}, S = st[s.key], locked = !S.open, edit = !ro && S.open && !S.done;
        return `<div class="card" style="${locked ? 'opacity:.45' : ''}" data-step="${s.key}"><h3>${i + 1}. ${esc(s.title)} ${S.done ? '✓' : ''}${locked ? ' · Bloqueado' : ''}</h3>${s.hint ? `<p class="muted">${esc(s.hint)}</p>` : ''}
        <div>${(d.files || []).map(p => `<span style="display:inline-block;position:relative">${urls[p] ? `<a href="${esc(urls[p])}" target="_blank" rel="noopener"><img src="${esc(urls[p])}" alt="Evidencia" style="width:88px;height:88px;object-fit:cover;border-radius:12px;margin:0 6px 6px 0"></a>` : ''}${edit ? `<button class="btn ghost" data-rm="${esc(p)}" style="position:absolute;top:2px;right:8px;padding:2px 8px">x</button>` : ''}</span>`).join('')}</div>
        ${s.fields.map(f => { const v = d.fields?.[f.key] || ''; return `<label>${esc(f.label)}</label>${f.catalog ? `<select class="field" data-f="${f.key}" data-catalog ${edit ? '' : 'disabled'}><option value="">Selecciona…</option>${CRM.catalog.map(x => `<option value="${esc(x.variant_id)}" ${v === x.variant_id ? 'selected' : ''}>${esc(x.model)} ${esc(x.storage)} · ${x.category === 'nuevo' ? 'Nuevo' : 'Exhibición'}</option>`).join('')}</select>` : f.options ? `<select class="field" data-f="${f.key}" ${edit ? '' : 'disabled'}><option value="">Selecciona…</option>${f.options.map(o => `<option ${v === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>` : `<input class="field" data-f="${f.key}" value="${esc(v)}" ${f.money ? 'inputmode="numeric"' : ''} ${edit ? '' : 'disabled'}>`}`; }).join('')}
        ${s.fields.some(f => f.key === 'variant_id' && f.catalog) ? '<div class="card" data-rent><p class="muted" style="margin:0">Elige el dispositivo y escribe el valor recibido para ver la rentabilidad esperada.</p></div>' : ''}${edit ? `<div class="actions"><label class="btn ghost" style="cursor:pointer">Subir fotos<input type="file" accept="image/*" multiple data-up hidden></label><button class="btn" data-done="${s.key}">✓ Listo</button></div>` : ''}</div>`; }).join('')
      + (l.stage === 'en_proceso' && allDone ? `<div class="card"><h3>${esc(sec.finishLabel)}</h3>${(sec.closing || []).map(f => f.catalog ? `<label>${esc(f.label)}</label><select class="field" data-c="${f.key}" id="cat"><option value="">Selecciona…</option>${CRM.catalog.filter(v => v.active).map(v => `<option value="${esc(v.variant_id)}">${esc(v.model)} ${esc(v.storage)} · ${v.category === 'nuevo' ? 'Nuevo' : 'Exhibición'} · $${Math.round(v.price).toLocaleString('es-CO')}</option>`).join('')}</select><p class="muted" id="planinfo"></p>` : `<label>${esc(f.label)}</label><input class="field" data-c="${f.key}" ${f.money ? 'inputmode="numeric"' : ''}>`).join('')}<button class="btn" data-fin style="margin-top:12px">${esc(sec.finishLabel)}</button></div>` : '')
      + (ro && l.closing ? `<div class="card"><h3>Cierre</h3>${Object.entries(l.closing).map(([k, v]) => `<div class="summary-line"><span class="k">${esc(k.replace(/_/g, ' '))}</span><span class="v">${esc(v)}</span></div>`).join('')}</div>` : '')
      + (ro && l.stage === 'finalizada' && l.lead_type !== 'plan_b' && c.whatsapp ? `<a class="btn" target="_blank" rel="noopener" href="https://wa.me/${crmNum(c.whatsapp)}?text=${encodeURIComponent('Has terminado el proceso de llevarte tu dispositivo ' + (l.device_label || '') + '. Bienvenido a la familia KUOTA 💚')}">Enviar bienvenida por WhatsApp</a>` : '');
  }
  $('#panel').innerHTML = `<button class="btn ghost" data-back>← ${esc(sec.label)}</button><div class="eyebrow" style="margin-top:14px">${esc(sec.label)}${ro ? ' · Solo lectura' : ''}</div><h1>${esc(crmName(l))}</h1><p class="muted">${esc(l.device_label || '')} ${c.cedula ? '· CC ' + esc(c.cedula) : ''} ${c.whatsapp ? '· ' + esc(c.whatsapp) : ''}</p>
  ${CRM.msg ? `<p class="error">${esc(CRM.msg)}</p>` : ''}<div class="card">${data || '<p class="muted">Sin datos adicionales.</p>'}<div>${orig}</div></div>${body}
  <details class="card"><summary>Historial (${events.length})</summary>${events.map(e => `<div class="summary-line"><span class="k">${crmFmt(e.created_at)}</span><span class="v">${esc(e.action)}</span></div>`).join('')}</details>`;
  const P = $('#panel'), stepData = el => { const box = el.closest('[data-step]'); const fields = {}; box.querySelectorAll('[data-f]').forEach(i => fields[i.dataset.f] = i.value); return { step: box.dataset.step, fields }; };
  P.onclick = async e => {
    const t = e.target.closest('button,[data-back]'); if (!t) return;
    if (t.dataset.back !== undefined) return crm();
    if (t.dataset.act === 'reopen') return crmPost({ action: 'reopen' });
    if (t.dataset.go) return crmDecide(t.dataset.go);
    if (t.dataset.done) { const s = stepData(t); await crmPost({ action: 'save_step', ...s }); if (!CRM.msg) await crmPost({ action: 'mark_done', step: s.step }); return; }
    if (t.dataset.rm) return crmPost({ action: 'remove_file', step: stepData(t).step, path: t.dataset.rm });
    if (t.dataset.fin !== undefined) { const closing = {}; P.querySelectorAll('[data-c]').forEach(i => closing[i.dataset.c] = i.value); return crmPost({ action: 'finish', closing }); }
  };
  P.querySelectorAll('[data-step]').forEach(crmRent);
  P.oninput = e => { const bx = e.target.closest('[data-step]'); if (bx) crmRent(bx); };
  P.onchange = async e => {
    if (e.target.matches('[data-catalog]')) { const bx = e.target.closest('[data-step]'); if (bx) crmRent(bx); return; }
    if (e.target.id === 'cat') { const v = CRM.catalog.find(x => x.variant_id === e.target.value), el = $('#planinfo'); el.textContent = v && v.inicial ? `Plan Reportados: inicial $${Math.round(v.inicial).toLocaleString('es-CO')} y 14 cuotas quincenales de $${Math.round(v.cuota).toLocaleString('es-CO')}` : (v ? 'Este equipo no tiene plan de Reportados cargado (Precios).' : ''); return; }
    if (e.target.id === 'ent') return crmPost({ action: 'set_entity', entity: e.target.value });
    if (e.target.matches('[data-up]')) {
      const step = stepData(e.target).step; CRM.msg = 'Subiendo…'; crmDetail();
      try { for (const f of e.target.files) { const blob = await crmCompress(f), fd = new FormData(); fd.append('id', l.id); fd.append('step', step); fd.append('file', blob, 'foto.jpg'); await api('/api/admin/crm-evidence', { method: 'POST', body: fd }); } CRM.msg = ''; } catch (err) { CRM.msg = err.message; }
      await crmOpen(l.id); if (CRM.msg) crmDetail();
    }
  };
}
function crmRent(box) {
  const out = box.querySelector('[data-rent]'); if (!out) return;
  const v = CRM.catalog.find(x => x.variant_id === box.querySelector('[data-f="variant_id"]')?.value), rec = Number(box.querySelector('[data-f="valor_recibido"]')?.value || 0);
  if (!v || !(rec > 0)) return;
  const n = CRM.meta.config, m = x => '$' + Math.round(x).toLocaleString('es-CO');
  out.innerHTML = `<h3>Rentabilidad esperada · ${esc(v.model)} ${esc(v.storage)}</h3><div class="summary-line"><span class="k">De contado (precio ${m(v.price)} − recibido)</span><span class="v">${m(v.price - rec)}</span></div><div class="summary-line"><span class="k">A crédito, buena vida (precio +${n.credit_net_pct * 100}% − recibido)</span><span class="v">${m(v.price * (1 + n.credit_net_pct) - rec)}</span></div><div class="summary-line"><span class="k">A crédito, reportados (valor crédito −${n.reportados_discount_pct * 100}% − recibido)</span><span class="v">${v.valor_credito ? m(v.valor_credito * (1 - n.reportados_discount_pct) - rec) : 'Carga el valor crédito en Precios'}</span></div>`;
}
function crmDecide(kind) {
  const box = $('#decide'), rej = kind === 'reject';
  box.innerHTML = `<div class="card"><h3>${rej ? '¿Quién rechaza?' : '¿Quién aprueba?'}</h3><label>Nombre y apellido</label><input class="field" id="dBy"><label>Fecha (DD/MM/AAAA)</label><input class="field" id="dDate" placeholder="DD/MM/AAAA" inputmode="numeric">${rej ? '<label>¿Por qué rechaza?</label><textarea class="field" id="dWhy" rows="3"></textarea>' : ''}<button class="btn" id="dGo" disabled style="margin-top:12px">${rej ? 'Rechazar' : 'Continuar'}</button></div>`;
  const chk = () => { $('#dGo').disabled = !($('#dBy').value.trim().includes(' ') && $('#dBy').value.trim().length >= 5 && crmDate($('#dDate').value) && (!rej || $('#dWhy').value.trim().length >= 5)); };
  box.oninput = chk;
  $('#dGo').onclick = () => crmPost({ action: kind, by: $('#dBy').value, date: $('#dDate').value, ...(rej ? { reason: $('#dWhy').value } : {}) });
}
