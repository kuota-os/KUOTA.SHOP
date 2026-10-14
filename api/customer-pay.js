import crypto from 'node:crypto';
import { json, requireCustomer } from '../lib/supabase.js';

export default async function handler(req,res){
  if(req.method!=='POST') return json(res,405,{error:'METHOD_NOT_ALLOWED'});
  try{
    const {sb,customer}=await requireCustomer(req);
    const {cuotaId}=req.body||{};
    if(!cuotaId) return json(res,400,{error:'CUOTA_REQUIRED'});
    const {data:c,error:ce}=await sb.from('cuotas').select('*,financiaciones(*)').eq('id',cuotaId).single();
    if(ce||!c) throw ce||new Error('INSTALLMENT_NOT_FOUND');
    if(c.financiaciones?.customer_id!==customer.id) return json(res,403,{error:'FORBIDDEN'});
    if(c.estado==='pagada') return json(res,409,{error:'INSTALLMENT_ALREADY_PAID'});
    if(c.financiaciones?.status==='cancelada') return json(res,409,{error:'FINANCING_CANCELLED'});
    const amount=Math.round(Number(c.valor));
    const {data:pending}=await sb.from('orders').select('id,reference,total_amount').eq('cuota_id',c.id).eq('order_type','financiacion').eq('status','pending').order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(pending){
      const cents=Math.round(Number(pending.total_amount)*100), currency='COP';
      const secret=process.env.WOMPI_INTEGRITY_SECRET; if(!secret) throw new Error('WOMPI_INTEGRITY_SECRET_NOT_CONFIGURED');
      const signature=crypto.createHash('sha256').update(`${pending.reference}${cents}${currency}${secret}`).digest('hex');
      return json(res,200,{orderId:pending.id,reference:pending.reference,amountInCents:cents,currency,publicKey:process.env.WOMPI_PUBLIC_KEY,signature,checkoutUrl:process.env.WOMPI_CHECKOUT_URL||'https://checkout.wompi.co/p/',reused:true});
    }
    const reference=`KUOTA-CUOTA-${c.id}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const cents=amount*100, currency='COP';
    const secret=process.env.WOMPI_INTEGRITY_SECRET;
    if(!secret) throw new Error('WOMPI_INTEGRITY_SECRET_NOT_CONFIGURED');
    const signature=crypto.createHash('sha256').update(`${reference}${cents}${currency}${secret}`).digest('hex');
    const f=c.financiaciones;
    const {data:order,error:oe}=await sb.from('orders').insert({
      customer_id:customer.id,financiacion_id:c.financiacion_id,cuota_id:c.id,reference,
      product_model:f.product_model,storage:f.storage,color:f.color,category:f.category,product_price:amount,
      tax_4x1000:0,shipping_selected:false,shipping_percentage:0,shipping_fee:0,domestic_delivery_selected:false,
      domestic_delivery_percentage:0,domestic_delivery_fee:0,total_amount:amount,status:'pending',order_type:'financiacion'
    }).select('id').single();
    if(oe) throw oe;
    return json(res,200,{orderId:order.id,reference,amountInCents:cents,currency,publicKey:process.env.WOMPI_PUBLIC_KEY,signature,checkoutUrl:process.env.WOMPI_CHECKOUT_URL||'https://checkout.wompi.co/p/'});
  }catch(e){return json(res,e.message==='UNAUTHORIZED'?401:e.message==='CUSTOMER_NOT_LINKED'?403:500,{error:e.message});}
}
