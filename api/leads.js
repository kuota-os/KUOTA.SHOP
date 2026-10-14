import { getServerSupabase, json } from '../lib/supabase.js';
import { normalizeCedula, normalizePhone } from '../lib/finance.js';
export default async function handler(req,res){
 if(req.method!=='POST') return json(res,405,{error:'METHOD_NOT_ALLOWED'});
 try{
  const b=req.body||{}; if(!b.lead_type||!b.consent) return json(res,400,{error:'CONSENT_AND_TYPE_REQUIRED'});
  const sb=getServerSupabase(); const cedula=normalizeCedula(b.cedula); const whatsapp=normalizePhone(b.whatsapp);
  let customer=null;
  if(cedula){ const {data}=await sb.from('customers').select('*').eq('cedula',cedula).maybeSingle(); customer=data; }
  if(!customer && b.full_name){ const {data,error}=await sb.from('customers').insert({full_name:b.full_name,primer_apellido:b.primer_apellido||null,cedula:cedula||null,whatsapp:whatsapp||null,email:b.email||null,birth_date:b.birth_date||null,source:b.lead_type}).select().single(); if(error) throw error; customer=data; }
  const {data:lead,error}=await sb.from('leads').insert({lead_type:b.lead_type,customer_id:customer?.id||null,device_label:b.device_label||null,payload:{...b,cedula,whatsapp,consent:undefined},image_urls:Array.isArray(b.image_urls)?b.image_urls:[]}).select().single();
  if(error) throw error; return json(res,201,{id:lead.id,customer_id:customer?.id||null});
 }catch(e){return json(res,500,{error:e.message});}
}
