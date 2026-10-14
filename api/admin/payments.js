import { requireAdmin, json } from '../../lib/supabase.js';
export default async function handler(req,res){
  try{
    const {sb,user}=await requireAdmin(req);
    if(req.method==='GET'){const {data,error}=await sb.from('pagos').select('*').order('paid_at',{ascending:false}).limit(500);if(error)throw error;return json(res,200,{data:data||[]});}
    if(req.method!=='POST')return json(res,405,{error:'METHOD_NOT_ALLOWED'});
    const b=req.body||{}; if(b.action!=='register')return json(res,400,{error:'UNKNOWN_ACTION'});
    if(!b.cuotaId||!b.metodo)return json(res,400,{error:'CUOTA_AND_METHOD_REQUIRED'});
    const {data,error}=await sb.rpc('register_manual_payment',{p_cuota_id:b.cuotaId,p_metodo:String(b.metodo).trim(),p_referencia:b.referencia||null,p_admin_user_id:user.id});
    if(error)throw error; return json(res,201,{payment:data});
  }catch(e){const m=e.message||'';const code=m.includes('ALREADY_PAID')?409:m.includes('NOT_FOUND')||m.includes('REQUIRED')?400:(m==='UNAUTHORIZED'?401:m==='FORBIDDEN'?403:500);return json(res,code,{error:m});}
}
