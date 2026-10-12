import crypto from 'node:crypto';
import { getServerSupabase, json, safeError } from '../../lib/supabase.js';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function n(value) {
  return Math.round(Number(value) || 0);
}

function clean(value) {
  return String(value || '').trim();
}

function isUuid(value) {
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const {
      variantId,
      color,
      shippingSelected = false,
      domesticSelected = false,
      shippingForm = null,
      domesticForm = null,
      customerEmail = null,
    } = req.body || {};

    if (!variantId || !color) {
      return json(res, 400, { error: 'VARIANT_AND_COLOR_REQUIRED' });
    }

    const variantIdValue = clean(variantId);

    if (!isUuid(variantIdValue)) {
      return json(res, 400, { error: 'INVALID_VARIANT_ID' });
    }

    if (shippingSelected && domesticSelected) {
      return json(res, 400, { error: 'CHOOSE_ONE_DELIVERY_OPTION' });
    }

    if (
      shippingSelected &&
      (!shippingForm ||
        ['name', 'phone', 'address', 'city', 'department'].some(
          (key) => !clean(shippingForm[key])
        ))
    ) {
      return json(res, 400, { error: 'INVALID_SHIPPING_DATA' });
    }

    if (
      domesticSelected &&
      (!domesticForm ||
        ['name', 'phone', 'address'].some((key) => !clean(domesticForm[key])))
    ) {
      return json(res, 400, { error: 'INVALID_DOMESTIC_DATA' });
    }

    const sb = getServerSupabase();

    const { data: v, error: ve } = await sb
      .from('variants')
      .select('id,product_id,storage,price,active')
      .eq('id', variantIdValue)
      .maybeSingle();

    if (ve) throw ve;
    if (!v) return json(res, 404, { error: 'VARIANT_NOT_FOUND' });
    if (!v.active) return json(res, 409, { error: 'VARIANT_INACTIVE' });

    const { data: p, error: pe } = await sb
      .from('products')
      .select('id,model,category,colors,active')
      .eq('id', v.product_id)
      .maybeSingle();

    if (pe) throw pe;
    if (!p) return json(res, 404, { error: 'PRODUCT_NOT_FOUND' });
    if (!p.active) return json(res, 409, { error: 'PRODUCT_INACTIVE' });

    if (
      !Array.isArray(p.colors) ||
      !p.colors.some((item) => Array.isArray(item) && item[0] === color)
    ) {
      return json(res, 400, { error: 'INVALID_COLOR' });
    }

    const { data: settings, error: se } = await sb
      .from('settings')
      .select('key,value')
      .in('key', ['cash_transfer_pct']);

    if (se) throw se;

    const pctRow = (settings || []).find((item) => item.key === 'cash_transfer_pct');
    const productPrice = n(v.price);
    const tax = n(
      productPrice * (pctRow?.value != null ? Number(pctRow.value) : 0.004)
    );

    const shippingPercentage = 0.05;
    const domesticPercentage = 0.007;

    const shippingFee = shippingSelected
      ? n(productPrice * shippingPercentage) + 50000
      : 0;

    const domesticFee = domesticSelected
      ? n(productPrice * domesticPercentage)
      : 0;

    const total = productPrice + tax + shippingFee + domesticFee;
    const reference = `KUOTA-${Date.now()}-${crypto
      .randomBytes(4)
      .toString('hex')
      .toUpperCase()}`;

    const amountInCents = total * 100;
    const currency = 'COP';

    const secret = process.env.WOMPI_INTEGRITY_SECRET;
    const publicKey = process.env.WOMPI_PUBLIC_KEY;

    if (!secret) throw new Error('CONFIG_FALTA_WOMPI_INTEGRITY');
    if (!publicKey) throw new Error('CONFIG_FALTA_WOMPI_PUBLIC_KEY');

    const signature = sha256(
      `${reference}${amountInCents}${currency}${secret}`
    );

    const { data: order, error: oe } = await sb
      .from('orders')
      .insert({
        product_id: p.id,
        variant_id: v.id,
        reference,
        product_model: p.model,
        storage: v.storage,
        color,
        category: p.category,
        product_price: productPrice,
        tax_4x1000: tax,
        shipping_selected: shippingSelected,
        shipping_percentage: shippingSelected ? shippingPercentage : 0,
        shipping_fee: shippingFee,
        domestic_delivery_selected: domesticSelected,
        domestic_delivery_percentage: domesticSelected ? domesticPercentage : 0,
        domestic_delivery_fee: domesticFee,
        total_amount: total,
        status: 'pending',
        wompi_transaction_id: null,
        paid_at: null,
        shipping_data: shippingSelected ? shippingForm : null,
        domestic_data: domesticSelected ? domesticForm : null,
        customer_email: customerEmail,
      })
      .select('id,reference,total_amount')
      .single();

    if (oe) throw oe;

    return json(res, 200, {
      orderId: order.id,
      reference,
      amountInCents,
      currency,
      publicKey,
      signature,
      checkoutUrl:
        process.env.WOMPI_CHECKOUT_URL || 'https://checkout.wompi.co/p/',
    });
  } catch (error) {
    return json(res, 500, { error: safeError(error) });
  }
}
