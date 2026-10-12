import { getServerSupabase, json } from '../lib/supabase.js';
export default async function handler(req,res){
  if(req.method!=='GET') return json(res,405,{error:'METHOD_NOT_ALLOWED'});
  try{
    const sb=getServerSupabase();
    const [{data:products,error:pErr},{data:variants,error:vErr},{data:plans,error:planErr}]=await Promise.all([
      sb.from('products').select('*').eq('active',true).order('sort_order'),
      sb.from('variants').select('*').eq('active',true),
      sb.from('planb_plans').select('*').eq('active',true).order('model')
    ]);
    if(pErr||vErr||planErr) throw pErr||vErr||planErr;
    const catalog=(products||[]).map(p=>({...p,variants:(variants||[]).filter(v=>v.product_id===p.id)})).filter(p=>p.variants.length);
    return json(res,200,{products:catalog,planb_plans:plans||[]});
  }catch(e){return json(res,500,{error:e.message});}
}
