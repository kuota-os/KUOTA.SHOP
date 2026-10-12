import { json, requireCustomer, safeError } from '../../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const { sb, customer } = await requireCustomer(req);

    const { data: financiaciones, error: financiacionesError } = await sb
      .from('financiaciones')
      .select('*')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false });

    if (financiacionesError) throw financiacionesError;

    const ids = (financiaciones || []).map(item => item.id);

    const { data: cuotas, error: cuotasError } = ids.length
      ? await sb
          .from('cuotas')
          .select('*')
          .in('financiacion_id', ids)
          .order('fecha_vencimiento', { ascending: true })
          .order('numero_cuota', { ascending: true })
      : { data: [], error: null };

    if (cuotasError) throw cuotasError;

    const { data: orders, error: ordersError } = await sb
      .from('orders')
      .select(
        'id,reference,product_model,storage,color,total_amount,status,paid_at,created_at,order_type,financiacion_id,cuota_id'
      )
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false });

    if (ordersError) throw ordersError;

    return json(res, 200, {
      customer,
      financiaciones: financiaciones || [],
      cuotas: cuotas || [],
      orders: orders || [],
    });
  } catch (e) {
    return json(
      res,
      e.message === 'UNAUTHORIZED'
        ? 401
        : e.message === 'CUSTOMER_NOT_LINKED'
          ? 403
          : 500,
      { error: safeError(e) }
    );
  }
}
