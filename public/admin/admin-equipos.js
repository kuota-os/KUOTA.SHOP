/* KUOTA Admin — Retoma: equipos recibidos, rentabilidad esperada y botón Vender (un solo uso) */
(() => {
  const { api, $, esc } = window.KUOTA_ADMIN;
  const cop = n => n == null ? 'Carga el valor crédito en Precios' : '$' + Math.round(n).toLocaleString('es-CO');
  window.equiposView = async function () {
    const rows = (await api('/api/admin/equipos')).data || [];
    $('#panel').innerHTML = `<div class="eyebrow">Retoma</div><h1>Equipos recibidos.</h1><p class="muted">Rentabilidad esperada según tus precios de venta menos el valor recibido. "Vender" marca el equipo como Vendido y no se puede revertir.</p><p id="emsg" class="error"></p>
    <div class="table-wrap"><table class="table"><thead><tr><th>Equipo</th><th>Recibido</th><th>Rentab. contado</th><th>Rentab. buena vida</th><th>Rentab. reportados</th><th></th></tr></thead><tbody>${rows.length ? rows.map(e => `<tr><td><b>${esc(e.model)} ${esc(e.storage || '')}</b><br><small class="muted">${e.category === 'nuevo' ? 'Nuevo' : 'Exhibición'} · IMEI ${esc(e.imei || '—')}<br>${esc(e.leads?.customers?.full_name || '')}</small></td><td>${cop(e.valor_recibido)}</td><td>${cop(e.rentabilidad.contado)}</td><td>${cop(e.rentabilidad.buena_vida)}</td><td>${cop(e.rentabilidad.reportados)}</td><td>${e.status === 'vendido' ? '<button class="btn" disabled>Vendido</button>' : `<button class="btn" data-sell="${esc(e.id)}">Vender</button>`}</td></tr>`).join('') : '<tr><td colspan="6" class="muted">Aún no hay equipos recibidos.</td></tr>'}</tbody></table></div>`;
    $('#panel').onclick = async ev => {
      const b = ev.target.closest('[data-sell]'); if (!b || !confirm('¿Marcar este equipo como Vendido? No se puede revertir.')) return;
      try { await api('/api/admin/equipos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'vender', id: b.dataset.sell }) }); await equiposView(); } catch (e) { $('#emsg').textContent = e.message; }
    };
  };
})();
