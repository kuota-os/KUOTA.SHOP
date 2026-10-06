// KUOTA cartera: crea la financiación de un crédito Reportados al cerrarlo y cierra el ciclo (paz y salvo)
import { bogotaDate, nextBiweeklyDueDate, addBiweekly, recomputeFinancing } from './finance.js';

export async function findPlan(sb, closing) {
  const { data } = await sb.from('planb_plans').select('id,inicial,cuota,valor_credito').eq('category', closing.category).eq('model', closing.model).eq('storage', closing.storage).eq('active', true).limit(1);
  const plan = data?.[0];
  if (!plan || !(Number(plan.cuota) > 0)) throw new Error('PLAN_NO_ENCONTRADO');
  return plan;
}

// Crea financiación + inicial recibida + 14 cuotas quincenales (días 2 y 17, zona America/Bogota). Idempotente por lead_id.
export async function createFinanciacion(sb, lead, closing, plan, adminId) {
  if (!lead.customer_id) throw new Error('CLIENTE_REQUERIDO');
  const { data: dup } = await sb.from('financiaciones').select('id').eq('lead_id', lead.id).maybeSingle();
  if (dup) return dup.id;
  const start = bogotaDate(), inicial = Number(closing.cuota_inicial), cuota = Number(plan.cuota), price = Number(closing.precio_venta);
  const { data: fin, error } = await sb.from('financiaciones').insert({
    customer_id: lead.customer_id, lead_id: lead.id, product_model: closing.model, storage: closing.storage, category: closing.category, channel: 'plan_b',
    variant_id: closing.variant_id, list_price: price, financed_amount: Math.max(0, price - inicial), total_cuotas: 14, cuota_value: cuota, saldo_pendiente: cuota * 14,
    status: 'activa', start_date: start, initial_amount: inicial, initial_status: 'recibida', initial_payment_method: 'registrada en solicitud', initial_received_at: new Date().toISOString(),
    fecha_activacion: start, created_by: adminId, updated_at: new Date().toISOString(), imei: lead.steps?.producto?.fields?.imei || null
  }).select('*').single();
  if (error) throw error;
  try {
    await sb.from('pagos').insert({ financiacion_id: fin.id, cuota_id: null, monto: inicial, metodo: 'inicial', paid_at: new Date().toISOString() });
    let due = nextBiweeklyDueDate(start); const rows = [];
    for (let i = 1; i <= 14; i++) { rows.push({ financiacion_id: fin.id, numero_cuota: i, fecha_vencimiento: due, valor: cuota, estado: 'pendiente' }); due = addBiweekly(due); }
    const { error: ce } = await sb.from('cuotas').insert(rows);
    if (ce) throw ce;
    await recomputeFinancing(sb, fin.id);
  } catch (e) { await sb.from('financiaciones').delete().eq('id', fin.id); throw e; }
  return fin.id;
}

// Tras cualquier pago: recalcula y, si quedó pagada, genera el paz y salvo y pasa la solicitud a "finalizados"
export async function afterPayment(sb, financiacionId) {
  const r = await recomputeFinancing(sb, financiacionId);
  if (r.status !== 'pagada') return r;
  const { data: f } = await sb.from('financiaciones').select('id,lead_id,paz_y_salvo_at').eq('id', financiacionId).single();
  if (f && !f.paz_y_salvo_at) {
    await sb.from('financiaciones').update({ paz_y_salvo_at: new Date().toISOString() }).eq('id', f.id).is('paz_y_salvo_at', null);
    if (f.lead_id) {
      await sb.from('leads').update({ stage: 'finalizada', updated_at: new Date().toISOString() }).eq('id', f.lead_id).eq('stage', 'cartera');
      await sb.from('lead_events').insert({ lead_id: f.lead_id, action: 'paz_y_salvo', data: { financiacion_id: f.id } });
    }
  }
  return r;
}
