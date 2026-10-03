import { afterPayment } from '../lib/cartera.js';
import crypto from 'node:crypto';
import { getServerSupabase, json, safeError } from '../lib/supabase.js';
function getPath(obj,path){return path.split('.').reduce((a,k)=>a?.[k],obj)}
function secureEqual(a,b){const x=Buffer.from(String(a||''));const y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y)}
function verify(event,headerChecksum){const props=event?.signature?.properties,ts=event?.timestamp,secret=process.env.WOMPI_EVENTS_SECRET;if(!Array.isArray(props)||ts==null||!secret||!event?.signature?.checksum)return false;const concat=props.map(p=>getPath(event.data,p)).map(v=>v==null?'':String(v)).join('')+String(ts)+secret;const expected=crypto.createHash('sha256').update(concat).digest('hex');return secureEqual(expected,event.signature.checksum)||secureEqual(expected,headerChecksum)}
export default async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{error:'METHOD_NOT_ALLOWED'});
 try{
  const event=req.body||{};if(!verify(event,req.headers['x-event-checksum']))return json(res,401,{error:'INVALID_SIGNATURE'});
  if(event.event!=='transaction.updated')return json(res,200,{received:true,ignored:true});
  const tx=event.data?.transaction;if(!tx?.reference||!tx?.id)return json(res,400,{error:'MISSING_TRANSACTION'});
  const sb=getServerSupabase();const {data:order,error:oe}=await sb.from('orders').select('*').eq('reference',tx.reference).maybeSingle();if(oe)throw oe;if(!order)return json(res,200,{received:true,ignored:true});
  if(Number(tx.amount_in_cents)!==Math.round(Number(order.total_amount)*100)||tx.currency!=='COP')return json(res,400,{error:'AMOUNT_OR_CURRENCY_MISMATCH'});
  if(tx.status!=='APPROVED'){
    const mapped=['DECLINED','VOIDED','ERROR','FAILED'].includes(String(tx.status||'').toUpperCase())?'expired':'pending';
    if(order.status!=='paid')await sb.from('orders').update({status:mapped,wompi_transaction_id:tx.id,updated_at:new Date().toISOString()}).eq('id',order.id);
    return json(res,200,{received:true,status:mapped});
  }
  const paidAt=new Date().toISOString();
  const {data:result,error:re}=await sb.rpc('settle_wompi_order',{p_order_id:order.id,p_transaction_id:String(tx.id),p_reference:String(tx.reference),p_paid_at:paidAt});
  if(re)throw re;
  if(order.cuota_id){try{const {data:cu}=await sb.from('cuotas').select('financiacion_id').eq('id',order.cuota_id).maybeSingle();if(cu)await afterPayment(sb,cu.financiacion_id);}catch(_){/* el pago ya quedó registrado */}}
  if(order.shipping_data&&!order.cuota_id&&!result?.idempotent){
   // Solicitud de Envío nacional para el CRM (idempotente por order_id). Nunca debe romper la respuesta a Wompi.
   try{
    const {data:dup}=await sb.from('leads').select('id').eq('lead_type','envio_nacional').eq('payload->>order_id',order.id).limit(1);
    if(!dup?.length)await sb.from('leads').insert({lead_type:'envio_nacional',customer_id:order.customer_id||null,device_label:`${order.product_model||''} ${order.storage||''}`.trim(),payload:{order_id:order.id,reference:order.reference,color:order.color||null,...order.shipping_data,total_pagado:order.total_amount,producto:order.product_price},image_urls:[]});
   }catch(_){/* la venta ya quedó registrada; la solicitud puede crearse luego */}
  }
  return json(res,200,{received:true,settled:true,result});
 }catch(e){return json(res,500,{error:safeError(e)});}
}
