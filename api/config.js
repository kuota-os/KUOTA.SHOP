import { getServerSupabase, json } from '../lib/supabase.js';
export default async function handler(req,res){
  if(req.method!=='GET') return json(res,405,{error:'METHOD_NOT_ALLOWED'});
  try{
    const sb=getServerSupabase();
    const {data:rows,error}=await sb.from('settings').select('key,value').in('key',['whatsapp_number','wompi_link','cash_transfer_pct','entities']);
    if(error) throw error;
    const out={}; for(const r of rows||[]) out[r.key]=r.value;
    out.whatsapp_number=out.whatsapp_number||process.env.WHATSAPP_NUMBER||'573052890679';
    return json(res,200,out);
  }catch(e){return json(res,500,{error:e.message});}
}
