import { requireAdmin, json } from '../../lib/supabase.js';
export default async function handler(req,res){
 try{
  const {sb}=await requireAdmin(req);
  if(req.method==='GET'){
   const {data,error}=await sb.from('leads').select('id,customer_id,device_label,status,created_at,image_urls').eq('lead_type','plan_c').order('created_at',{ascending:false}).limit(200);
   if(error)throw error; return json(res,200,{data:data||[]});
  }
  if(req.method!=='POST')return json(res,405,{error:'METHOD_NOT_ALLOWED'});
  const {path}=req.body||{};
  if(!path||typeof path!=='string'||path.length>500||path.includes('..')||path.startsWith('/')||!path.startsWith('trade-in/'))return json(res,400,{error:'INVALID_PATH'});
  const {data:lead,error:le}=await sb.from('leads').select('id,image_urls').eq('lead_type','plan_c').contains('image_urls',[path]).maybeSingle();
  if(le)throw le;if(!lead)return json(res,404,{error:'PHOTO_NOT_FOUND'});
  const {data,error}=await sb.storage.from('trade-in-photos').createSignedUrl(path,300);if(error)throw error;
  return json(res,200,{url:data.signedUrl,expiresIn:300,leadId:lead.id});
 }catch(e){return json(res,e.message==='UNAUTHORIZED'?401:e.message==='FORBIDDEN'?403:e.message==='PHOTO_NOT_FOUND'?404:500,{error:e.message});}
}
