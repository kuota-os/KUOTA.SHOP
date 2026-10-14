import { getAnonSupabase, json } from '../lib/supabase.js';
export default async function handler(req,res){
 if(req.method!=='POST') return json(res,405,{error:'METHOD_NOT_ALLOWED'});
 try{
  const {email}=req.body||{}; if(!email) return json(res,400,{error:'EMAIL_REQUIRED'});
  const sb=getAnonSupabase(); const {error}=await sb.auth.signInWithOtp({email:String(email).trim().toLowerCase(),options:{emailRedirectTo:process.env.KUOTA_BASE_URL?`${process.env.KUOTA_BASE_URL}/soy-cliente`:undefined}});
  if(error) throw error; return json(res,200,{ok:true});
 }catch(e){return json(res,400,{error:e.message});}
}
