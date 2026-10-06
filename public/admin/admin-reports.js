/* KUOTA Admin — Informes (contado, buena vida por aliado, reportados, retoma) */
(() => {
  const { api, $, esc } = window.KUOTA_ADMIN;
  const cop = n => '$' + Math.round(n || 0).toLocaleString('es-CO');
  const pc = n => (Math.round(n * 1000) / 10) + '%';
  const iso = d => d.toISOString().slice(0, 10);
  const lineRow = (l, cols) => `<tr><td>${esc(l.fecha || '')}</td><td>${esc(l.equipo)}${l.cliente ? `<br><small class="muted">${esc(l.cliente)}</small>` : ''}${l.sin_costo ? ' <span class="chip">sin costo</span>' : ''}</td>${cols.map(c => `<td>${esc(c(l))}</td>`).join('')}<td><b>${cop(l.utilidad)}</b></td></tr>`;
  const block = (title, sub, lines, totals, heads, cols) => `<details class="card"><summary><b>${esc(title)}</b> <span class="muted">${esc(sub)}</span><br>${totals.cantidad} ventas · Costo ${cop(totals.costo)} · Utilidad bruta <b style="color:var(--lime)">${cop(totals.utilidad)}</b></summary>
    ${lines.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Equipo</th>${heads.map(h => `<th>${h}</th>`).join('')}<th>Utilidad</th></tr></thead><tbody>${lines.map(l => lineRow(l, cols)).join('')}</tbody></table></div>` : '<p class="muted">Sin ventas en el periodo.</p>'}</details>`;

  window.reportsView = async function reportsView(from, to) {
    const now = new Date(Date.now() - 5 * 3600e3), f = from || iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), t = to || iso(now);
    let d;
    try { d = (await api(`/api/admin/reports?from=${f}&to=${t}`)).data; } catch (e) { $('#panel').innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
    const cfg = d.config, bvTot = d.buena_vida.reduce((a, b) => a + b.totals.utilidad, 0);
    $('#panel').innerHTML = `<div class="eyebrow">Informes</div><h1>Utilidad bruta.</h1>
    <div class="actions"><input class="field" type="date" id="rf" value="${d.period.from}"><input class="field" type="date" id="rt" value="${d.period.to}"><button class="btn" id="rgo">Actualizar</button></div>
    <div class="card"><div class="eyebrow">Utilidad bruta total</div><h1 style="color:var(--lime)">${cop(d.total.utilidad)}</h1><p class="muted">${d.total.cantidad} ventas en el periodo · Costo proveedor ${cop(d.total.costo)}</p>
    ${d.total.sin_costo ? `<p class="error">${d.total.sin_costo} ventas no tienen precio de proveedor: su utilidad está inflada. Cárgalo en Precios.</p>` : ''}
    ${d.sin_cierre ? `<p class="muted">${d.sin_cierre} solicitudes finalizadas sin dispositivo de cierre no se cuentan.</p>` : ''}
    <p class="muted">Envíos nacionales finalizados: ${d.envios_finalizados} (su venta ya está en Contado).</p></div>
    ${block('1. Contado', 'precio venta − precio proveedor', d.contado.lines, d.contado.totals, ['Venta', 'Proveedor'], [l => cop(l.venta), l => cop(l.costo)])}
    <h2>2. Buena vida crediticia · ${cop(bvTot)}</h2>
    ${d.buena_vida.map(b => block(b.entidad, `cliente paga +${pc(b.pct)} · a KUOTA: precio +${pc(cfg.credit_net_pct)} − proveedor`, b.lines, b.totals, ['Cliente paga', 'Ingreso KUOTA', 'Proveedor'], [l => cop(l.venta_cliente), l => cop(l.ingreso), l => cop(l.costo)])).join('')}
    <h2>3. Reportados / Sin vida crediticia</h2>
    ${block('Reportados', `valor crédito − ${pc(cfg.reportados_discount_pct)} − proveedor`, d.reportados.lines, d.reportados.totals, ['Crédito', 'Ingreso', 'Proveedor'], [l => cop(l.valor_credito), l => cop(l.ingreso), l => cop(l.costo)])}
    <h2>4. Plan Retoma</h2>
    ${block('Retoma', 'equipo recibido + restante según método − proveedor', d.retoma.lines, d.retoma.totals, ['Recibido', 'Método', 'Restante cobrado', 'Proveedor'], [l => cop(l.valor_recibido), l => l.metodo + (l.entidad ? ' · ' + l.entidad : ''), l => cop(l.restante_cobrado), l => cop(l.costo)])}
    <h2>Parámetros</h2><div class="card"><label>A KUOTA le queda sobre el precio con aliados (%)</label><input class="field" id="pn" type="number" step="0.5" min="0" max="90" value="${cfg.credit_net_pct * 100}"><label>Descuento en Reportados (%)</label><input class="field" id="pd" type="number" step="0.5" min="0" max="90" value="${cfg.reportados_discount_pct * 100}"><button class="btn" id="psave" style="margin-top:12px">Guardar parámetros</button><p id="pmsg" class="muted"></p></div>`;
    $('#rgo').onclick = () => reportsView($('#rf').value, $('#rt').value);
    $('#psave').onclick = async () => {
      try { await api('/api/admin/reports', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credit_net_pct: $('#pn').value / 100, reportados_discount_pct: $('#pd').value / 100 }) }); await reportsView($('#rf').value, $('#rt').value); }
      catch (e) { $('#pmsg').textContent = 'No se pudo guardar: ' + e.message; }
    };
  };
})();
