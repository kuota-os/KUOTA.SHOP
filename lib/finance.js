const TZ = 'America/Bogota';

export const money = v => Math.round(Number(v) || 0);
export const normalizeCedula = v => String(v || '').replace(/\D/g, '');
export const normalizePhone = v => String(v || '').replace(/\D/g, '');

export function bogotaDate(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input);

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function nextBiweeklyDueDate(input) {
  const s = String(input || bogotaDate()).slice(0, 10);
  const [y, m, day] = s.split('-').map(Number);

  if (day < 2) {
    return `${y}-${String(m).padStart(2, '0')}-02`;
  }

  if (day < 17) {
    return `${y}-${String(m).padStart(2, '0')}-17`;
  }

  const d = new Date(Date.UTC(y, m - 1, 2));
  d.setUTCMonth(d.getUTCMonth() + 1);

  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-02`;
}

export function addBiweekly(date) {
  const [y, m, d] = String(date).slice(0, 10).split('-').map(Number);

  if (d === 2) {
    return `${y}-${String(m).padStart(2, '0')}-17`;
  }

  const x = new Date(Date.UTC(y, m - 1, 2));
  x.setUTCMonth(x.getUTCMonth() + 1);

  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-02`;
}

export async function recomputeFinancing(sb, id) {
  const { error: financingError } = await sb
    .from('financiaciones')
    .select('id')
    .eq('id', id)
    .single();

  if (financingError) throw financingError;

  const { data: installments, error: installmentsError } = await sb
    .from('cuotas')
    .select('id, numero_cuota, fecha_vencimiento, valor, estado')
    .eq('financiacion_id', id)
    .order('fecha_vencimiento', { ascending: true })
    .order('numero_cuota', { ascending: true });

  if (installmentsError) throw installmentsError;

  const allInstallments = installments || [];
  const pending = allInstallments.filter(item => item.estado !== 'pagada');
  const balance = pending.reduce((sum, item) => sum + money(item.valor), 0);
  const today = bogotaDate();
  const overdue = pending.some(
    item => String(item.fecha_vencimiento) < today
  );

  const status = balance === 0
    ? 'pagada'
    : overdue
      ? 'mora'
      : 'activa';

  const next = pending[0] || null;

  const { error: updateError } = await sb
    .from('financiaciones')
    .update({
      saldo_pendiente: balance,
      status,
      proxima_cuota_id: next?.id || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) throw updateError;

  const paid = allInstallments
    .filter(item => item.estado === 'pagada')
    .reduce((sum, item) => sum + money(item.valor), 0);

  return { balance, status, next, paid };
}
