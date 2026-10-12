import { requireAdmin, json } from '../../lib/supabase.js';
export default async function handler(req,res){
  try{const {sb,user}=await requireAdmin(req); if(req.method!=='GET')return json(res,405,{error:'METHOD_NOT_ALLOWED'});
    const {data,error}=await sb.from('leads').select('*').limit(500).order('created_at',{ascending:false}); if(error)throw error; return json(res,200,{data:data||[],user_id:user.id});
  }catch(e){return json(res,e.message==='UNAUTHORIZED'?401:e.message==='FORBIDDEN'?403:500,{error:e.message});}
}
