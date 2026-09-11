import { requireAdmin, json } from '../../lib/supabase.js';
export default async function handler(req,res){
  try{
    const {sb,user}=await requireAdmin(req);
    if(req.method!=='GET') return json(res,405,{error:'METHOD_NOT_ALLOWED'});
    const [{data:orders,error:oe},{data:leads,error:le},{data:fin,error:fe},{data:cuotas,error:ce},{data:pagos,error:pe}]=await Promise.all([
      sb.from('orders').select('id,total_amount,status,order_type,created_at,paid_at').order('created_at',{ascending:false}).limit(500),
      sb.from('leads').select('id,lead_type,status,created_at').order('created_at',{ascending:false}).limit(500),
      sb.from('financiaciones').select('id,status,saldo_pendiente,created_at').limit(500),
      sb.from('cuotas').select('id,estado,valor,fecha_vencimiento').limit(1000),
      sb.from('pagos').select('id,monto,metodo,paid_at,created_at').order('paid_at',{ascending:false}).limit(1000)
    ]);
    if(oe||le||fe||ce||pe) throw oe||le||fe||ce||pe;
    const paidOrders=(orders||[]).filter(o=>o.status==='paid');
    const now=new Date(), day=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    const monthStart=new Date(now.getFullYear(),now.getMonth(),1);
    const isDate=(v,start)=>v&&new Date(v)>=start;
    const monthCollection=(pagos||[]).filter(p=>isDate(p.paid_at||p.created_at,monthStart)).reduce((a,p)=>a+Number(p.monto||0),0);
    const dayCollection=(pagos||[]).filter(p=>isDate(p.paid_at||p.created_at,day)).reduce((a,p)=>a+Number(p.monto||0),0);
    return json(res,200,{data:{orders:orders||[],leads:leads||[],financiaciones:fin||[],cuotas:cuotas||[],pagos:pagos||[],kpis:{orders_total:(orders||[]).length,orders_paid:paidOrders.length,cash_paid:paidOrders.reduce((a,o)=>a+Number(o.total_amount||0),0),leads_pending:(leads||[]).filter(x=>x.status==='pending').length,fin_active:(fin||[]).filter(x=>x.status==='activa'||x.status==='mora').length,portfolio_pending:(fin||[]).reduce((a,x)=>a+Number(x.saldo_pendiente||0),0),overdue_installments:(cuotas||[]).filter(x=>x.estado==='vencida').length,month_collection:monthCollection,day_collection:dayCollection}},user_id:user.id});
  }catch(e){return json(res,e.message==='UNAUTHORIZED'?401:e.message==='FORBIDDEN'?403:500,{error:e.message});}
}
