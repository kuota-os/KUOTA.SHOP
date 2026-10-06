/* KUOTA Admin — Cartera (Reportados): avance, pagos, bloqueo/desbloqueo, paz y salvo */
(() => {
  const { api, $, esc } = window.KUOTA_ADMIN;
  const cop = n => '$' + Math.round(n || 0).toLocaleString('es-CO');
  const fd = s => s ? new Date(s + (String(s).length === 10 ? 'T12:00:00' : '')).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const ERR = { FOTO_OBLIGATORIA: 'Sube la foto del cliente con el dispositivo, la cédula en mano y el rostro visible.', MOTIVO_INVALIDO: 'Selecciona un motivo.', NO_SE_PUEDE_BLOQUEAR: 'Este crédito no se puede bloquear.', NO_ESTA_BLOQUEADO: 'El dispositivo no está bloqueado.' };
  const S = { filter: 'todas', rows: [], msg: '' };
  const chip = f => `${f.status === 'mora' ? '<span class="chip" style="color:var(--danger)">Mora</span>' : f.status === 'pagada' ? '<span class="chip">Pagada</span>' : '<span class="chip" style="color:var(--lime)">Activa</span>'}${f.lock_state === 'bloqueado' ? ' <span class="chip" style="color:var(--danger)">Bloqueado</span>' : ''}`;
  const bar = f => `<div style="background:var(--line);border-radius:99px;height:8px;min-width:90px"><i style="display:block;height:100%;border-radius:99px;background:var(--lime);width:${f.total ? f.pagadas / f.total * 100 : 0}%"></i></div><small class="muted">${f.pagadas}/${f.total} cuotas</small>`;
  const name = f => f.customers ? `${f.customers.full_name} ${f.customers.primer_apellido || ''}`.trim() : '—';

  window.carteraView = async function () {
    S.rows = (await api('/api/admin/cartera')).data || [];
    const flt = { todas: () => true, activa: f => f.status === 'activa', mora: f => f.status === 'mora', bloqueadas: f => f.lock_state === 'bloqueado', pagada: f => f.status === 'pagada' }[S.filter];
    const rows = S.rows.filter(flt);
    $('#panel').innerHTML = `<div class="eyebrow">Cartera</div><h1>Créditos activos.</h1>
    <div class="actions">${[['todas', 'Todas'], ['activa', 'Activas'], ['mora', 'En mora'], ['bloqueadas', 'Bloqueadas'], ['pagada', 'Pagadas']].map(([k, t]) => `<button class="btn ${S.filter === k ? '' : 'ghost'}" data-f="${k}">${t}</button>`).join('')}</div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Cliente</th><th>Equipo</th><th>Avance</th><th>Saldo</th><th>Próxima cuota</th><th>Estado</th><th></th></tr></thead><tbody>${rows.length ? rows.map(f => `<tr><td>${esc(name(f))}</td><td>${esc(f.product_model)} ${esc(f.storage || '')}</td><td>${bar(f)}</td><td>${cop(f.saldo_pendiente)}</td><td>${f.proxima ? fd(f.proxima.fecha_vencimiento) + '<br><small class="muted">' + cop(f.proxima.valor) + '</small>' : '—'}</td><td>${chip(f)}</td><td><button class="btn" data-open="${esc(f.id)}">Abrir</button></td></tr>`).join('') : '<tr><td colspan="7" class="muted">Sin créditos en esta vista.</td></tr>'}</tbody></table></div>`;
    $('#panel').onclick = e => { const b = e.target.closest('[data-f],[data-open]'); if (!b) return; if (b.dataset.f) { S.filter = b.dataset.f; return carteraView(); } openDetail(b.dataset.open); };
  };

  async function openDetail(id) {
    const d = await api('/api/admin/cartera?id=' + id), f = d.data, bl = f.lock_state === 'bloqueado';
    const next = f.proxima;
    $('#panel').innerHTML = `<button class="btn ghost" data-back>← Cartera</button><div class="eyebrow" style="margin-top:14px">${esc(f.product_model)} ${esc(f.storage || '')}</div><h1>${esc(name(f))}</h1>
    <p class="muted">CC ${esc(f.customers?.cedula || '')} · ${esc(f.customers?.whatsapp || '')} · IMEI ${esc(f.imei || 'sin registrar')}</p>${S.msg ? `<p class="error">${esc(S.msg)}</p>` : ''}
    <div class="card"><div class="actions" style="justify-content:space-between"><div>${chip(f)}</div><div>Saldo <b>${cop(f.saldo_pendiente)}</b></div></div>${bar(f)}</div>
    <div class="actions">${f.lead_id ? '<button class="btn ghost" data-lead>Ver solicitud (solo lectura)</button>' : ''}${f.status === 'pagada' ? '<button class="btn" data-pys>Paz y salvo</button>' : (bl ? '<button class="btn" data-go="unlock">Desbloquear</button>' : '<button class="btn ghost" data-go="lock" style="color:var(--danger)">Bloquear</button>')}</div><div id="lockbox"></div>
    ${next && f.status !== 'pagada' ? `<div class="card"><h3>Registrar pago de la cuota ${next.numero_cuota} · ${cop(next.valor)}</h3><label>Método</label><select class="field" id="pm"><option>Efectivo</option><option>Transferencia</option></select><label>Referencia (opcional)</label><input class="field" id="pr"><button class="btn" id="pay" style="margin-top:12px">Registrar pago</button></div>` : ''}
    <h2>Plan de pagos</h2><div class="card">${f.cuotas.map(c => `<div class="summary-line"><span class="k">Cuota ${c.numero_cuota} · ${fd(c.fecha_vencimiento)}</span><span class="v">${cop(c.valor)} · ${c.estado === 'pagada' ? 'Pagada' : (c.fecha_vencimiento < new Date().toISOString().slice(0, 10) ? 'Vencida' : 'Pendiente')}</span></div>`).join('')}</div>
    <details class="card"><summary>Historial de bloqueos (${d.events.length})</summary>${d.events.map(e => `<div class="summary-line"><span class="k">${fd(e.created_at)} · ${e.action}</span><span class="v">${esc(e.reason)}${e.evidence_path && d.urls[e.evidence_path] ? ` · <a href="${esc(d.urls[e.evidence_path])}" target="_blank" rel="noopener">foto</a>` : ''}</span></div>`).join('')}</details>`;
    const P = $('#panel');
    const post = async body => { try { const r = await api('/api/admin/cartera', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) }); S.msg = ''; await openDetail(id); return r; } catch (e) { S.msg = ERR[e.message] || e.message; await openDetail(id); } };
    P.onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.back !== undefined) return carteraView();
      if (b.dataset.lead) { await crm(); return crmOpen(f.lead_id); }
      if (b.id === 'pay') { try { await api('/api/admin/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'register', cuotaId: next.id, metodo: $('#pm').value, referencia: $('#pr').value || null }) }); S.msg = ''; } catch (err) { S.msg = err.message; } return openDetail(id); }
      if (b.dataset.pys !== undefined) { const r = await fetch('/api/admin/paz-y-salvo?id=' + id, { headers: { Authorization: 'Bearer ' + (await window.KUOTA_ADMIN.token()) } }); window.open(URL.createObjectURL(await r.blob()), '_blank'); return; }
      if (b.dataset.go) return form(b.dataset.go);
    };
    function form(kind) {
      const un = kind === 'unlock', reasons = un ? d.reasons.unlock : d.reasons.lock;
      $('#lockbox').innerHTML = `<div class="card"><h3>${un ? 'Seleccionar motivo de desbloqueo' : 'Seleccionar motivo de bloqueo'}</h3><select class="field" id="rs"><option value="">Selecciona…</option>${reasons.map(r => `<option>${esc(r)}</option>`).join('')}</select>
      ${un ? '<label>Foto obligatoria: cliente con el dispositivo encendido, cédula en mano y rostro visible</label><input type="file" accept="image/*" id="ph">' : ''}<button class="btn" id="go" disabled style="margin-top:12px">${un ? 'Desbloquear' : 'Bloquear'}</button></div>`;
      const chk = () => { $('#go').disabled = !$('#rs').value || (un && !$('#ph').files.length); };
      $('#lockbox').oninput = chk; $('#lockbox').onchange = chk;
      $('#go').onclick = async () => {
        $('#go').disabled = true; let evidence_path;
        if (un) { try { const blob = await window.KUOTA_ADMIN.compress($('#ph').files[0]), fdt = new FormData(); fdt.append('id', id); fdt.append('file', blob, 'foto.jpg'); evidence_path = (await api('/api/admin/lock-evidence', { method: 'POST', body: fdt })).path; } catch (err) { S.msg = err.message; return openDetail(id); } }
        const r = await post({ action: un ? 'desbloquear' : 'bloquear', reason: $('#rs').value, evidence_path });
        if (r?.whatsapp_url) { $('#panel').insertAdjacentHTML('afterbegin', `<div class="card"><p>Listo. Envía el aviso al WhatsApp de KUOTA para ejecutar el ${un ? 'desbloqueo' : 'bloqueo'}:</p><a class="btn" target="_blank" rel="noopener" href="${esc(r.whatsapp_url)}">Enviar por WhatsApp</a></div>`); }
      };
    }
  };
})();
