import crypto from 'node:crypto';
import Busboy from 'busboy';
import { getServerSupabase, json } from '../lib/supabase.js';
import { normalizeCedula, normalizePhone } from '../lib/finance.js';

const MAX=8*1024*1024;
const MAX_FILES=8;
const MIME=new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif']);
function parse(req){return new Promise((resolve,reject)=>{const bb=Busboy({headers:req.headers,limits:{fileSize:MAX,files:MAX_FILES,fields:40}});const fields={},files=[];bb.on('field',(n,v)=>{if(n.length<80)fields[n]=String(v).slice(0,2000)});bb.on('file',(name,file,info)=>{const chunks=[];let size=0;file.on('data',d=>{size+=d.length;if(size<=MAX)chunks.push(d)});file.on('limit',()=>reject(new Error('FILE_TOO_LARGE')));file.on('end',()=>files.push({name,filename:info.filename,mime:info.mimeType,buffer:Buffer.concat(chunks),size}))});bb.on('error',reject);bb.on('finish',()=>resolve({fields,files}));req.pipe(bb)})}
function validMagic(f){const b=f.buffer;if(f.mime==='image/jpeg')return b.length>3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff;if(f.mime==='image/png')return b.length>8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));if(f.mime==='image/webp')return b.length>12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP';return true;}
export default async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{error:'METHOD_NOT_ALLOWED'});
 try{
  const {fields,files}=await parse(req);if(fields.consent!=='true')return json(res,400,{error:'CONSENT_REQUIRED'});if(!fields.full_name||!fields.cedula||!fields.whatsapp||!fields.trade_in_device)return json(res,400,{error:'REQUIRED_FIELDS'});if(!files.length)return json(res,400,{error:'PHOTOS_REQUIRED'});
  for(const f of files)if(!MIME.has(f.mime)||!validMagic(f))return json(res,400,{error:'INVALID_FILE'});
  const sb=getServerSupabase(),cedula=normalizeCedula(fields.cedula),whatsapp=normalizePhone(fields.whatsapp);let customer=null;
  if(cedula){const r=await sb.from('customers').select('*').eq('cedula',cedula).maybeSingle();if(r.error)throw r.error;customer=r.data}
  if(!customer){const r=await sb.from('customers').insert({full_name:fields.full_name,primer_apellido:fields.primer_apellido||null,cedula,whatsapp,email:fields.email||null,birth_date:fields.birth_date||null,source:'plan_c'}).select().single();if(r.error)throw r.error;customer=r.data}
  const paths=[];try{
   for(const f of files){const ext=(f.filename.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';const path=`trade-in/${customer.id}/${crypto.randomUUID()}.${ext}`;const up=await sb.storage.from('trade-in-photos').upload(path,f.buffer,{contentType:f.mime,upsert:false});if(up.error)throw up.error;paths.push(path)}
   const payload={trade_in_device:fields.trade_in_device,notes:fields.notes||null,device_label:fields.device_label||null,email:fields.email||null,whatsapp,consent:true};
   const r=await sb.from('leads').insert({lead_type:'plan_c',customer_id:customer.id,device_label:fields.device_label||null,payload,image_urls:paths}).select('id').single();if(r.error)throw r.error;
   return json(res,201,{id:r.data.id,customer_id:customer.id,file_count:paths.length});
  }catch(e){if(paths.length)await sb.storage.from('trade-in-photos').remove(paths);throw e}
 }catch(e){const code=e.message==='FILE_TOO_LARGE'?413:e.message==='REQUIRED_FIELDS'||e.message==='PHOTOS_REQUIRED'||e.message==='INVALID_FILE'||e.message==='CONSENT_REQUIRED'?400:500;return json(res,code,{error:e.message});}
}
