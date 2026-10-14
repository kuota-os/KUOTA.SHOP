import { json, getServerSupabase } from '../lib/supabase.js';
import { normalizeCedula } from '../lib/finance.js';
export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{error:'METHOD_NOT_ALLOWED'});
  try{
    const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,''); if(!token)return json(res,401,{error:'UNAUTHORIZED'});
    const sb=getServerSupabase(); const {data:{user},error:ue}=await sb.auth.getUser(token); if(ue||!user)return json(res,401,{error:'UNAUTHORIZED'});
    const {email,cedula,apellido}=req.body||{}; const normalizedEmail=String(email||'').trim().toLowerCase(); const surname=String(apellido||'').trim().toLowerCase();
    if(!normalizedEmail||!cedula||!surname)return json(res,400,{error:'EMAIL_CEDULA_APELLIDO_REQUIRED'});
    const {data:customer,error}=await sb.from('customers').select('*').eq('cedula',normalizeCedula(cedula)).ilike('email',normalizedEmail).maybeSingle();
    if(error)throw error; if(!customer)return json(res,404,{error:'CUSTOMER_NOT_FOUND'});
    const expected=String(customer.primer_apellido||'').trim().toLowerCase();
    if(!expected||expected!==surname)return json(res,403,{error:'IDENTITY_MISMATCH'});
    if(customer.auth_user_id&&customer.auth_user_id!==user.id)return json(res,409,{error:'CUSTOMER_ALREADY_LINKED'});
    if(customer.auth_user_id===user.id)return json(res,200,{ok:true});
    const {error:ue2}=await sb.from('customers').update({auth_user_id:user.id}).eq('id',customer.id).is('auth_user_id',null); if(ue2)throw ue2;
    return json(res,200,{ok:true});
  }catch(e){return json(res,500,{error:e.message});}
}
