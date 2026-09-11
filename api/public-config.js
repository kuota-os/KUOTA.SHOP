import { json } from '../lib/supabase.js';
export default async function handler(req,res){if(req.method!=='GET')return json(res,405,{error:'METHOD_NOT_ALLOWED'});return json(res,200,{supabaseUrl:process.env.SUPABASE_URL||'',supabaseAnonKey:process.env.SUPABASE_ANON_KEY||'',whatsappNumber:process.env.WHATSAPP_NUMBER||'573052890679'});}
