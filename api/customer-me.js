import { json, requireCustomer } from '../lib/supabase.js';
import { recomputeFinancing } from '../lib/finance.js';
export default async function handler(req,res){
  if(req.method!=='GET') return json(res,405,{error:'METHOD_NOT_ALLOWED'});
  try{
    const {sb,customer}=await requireCustomer(req);
    const {data:before,error:be}=await sb.from('financiaciones').select('*').eq('customer_id',customer.id).order('created_at',{ascending:false});
    if(be) throw be;
    for(const f of before||[]) if(f.status!=='cancelada') await recomputeFinancing(sb,f.id);
    const {data:fin,error:fe}=await sb.from('financiaciones').select('*').eq('customer_id',customer.id).order('created_at',{ascending:false});
    if(fe) throw fe;
    const ids=(fin||[]).map(x=>x.id);
    const {data:cuotas,error:ce}=ids.length?await sb.from('cuotas').select('*').in('financiacion_id',ids).order('fecha_vencimiento',{ascending:true}).order('numero_cuota',{ascending:true}):{data:[],error:null};
    if(ce) throw ce;
    const {data:orders,error:oe}=await sb.from('orders').select('id,reference,product_model,storage,color,total_amount,status,paid_at,created_at,order_type,financiacion_id,cuota_id').eq('customer_id',customer.id).order('created_at',{ascending:false});
    if(oe) throw oe;
    return json(res,200,{customer,financiaciones:fin||[],cuotas:cuotas||[],orders:orders||[]});
  }catch(e){return json(res,e.message==='UNAUTHORIZED'?401:e.message==='CUSTOMER_NOT_LINKED'?403:500,{error:e.message});}
}
