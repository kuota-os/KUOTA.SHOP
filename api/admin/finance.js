import { requireAdmin, json } from '../../lib/supabase.js';

export default async function handler(req,res){
  try{
    const {sb,user}=await requireAdmin(req);
    if(req.method==='GET'){
      const {data,error}=await sb.from('financiaciones').select('*,customers(full_name,cedula,whatsapp,email)').order('created_at',{ascending:false});
      if(error) throw error;
      return json(res,200,{data});
    }
    if(req.method!=='POST') return json(res,405,{error:'METHOD_NOT_ALLOWED'});
    const b=req.body||{};
    if(b.action!=='approve_initial') return json(res,400,{error:'UNKNOWN_ACTION'});
    const {leadId,initialPaymentMethod,initialReference}=b;
    if(!leadId||!initialPaymentMethod) return json(res,400,{error:'LEAD_AND_INITIAL_METHOD_REQUIRED'});
    const {data:finId,error}=await sb.rpc('approve_plan_b',{
      p_lead_id:leadId,
      p_initial_payment_method:initialPaymentMethod,
      p_initial_reference:initialReference||null,
      p_admin_user_id:user.id
    });
    if(error) throw error;
    return json(res,201,{financiacion_id:finId,installments:14});
  }catch(e){
    const msg=e.message||'';
    const status=['UNAUTHORIZED'].includes(msg)?401:['FORBIDDEN'].includes(msg)?403:msg.includes('NOT_FOUND')||msg.includes('REQUIRED')||msg.includes('FAILED')||msg.includes('ALREADY_APPROVED')?400:500;
    return json(res,status,{error:msg});
  }
}
