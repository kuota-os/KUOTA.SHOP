// Dispatcher de endpoints del PANEL (todos exigen sesión de administrador): /api/admin/<nombre>
// Vercel (plan Hobby) permite máximo 12 funciones por despliegue: por eso todos los endpoints viven en /server
// y estos dos archivos son las ÚNICAS funciones. vercel.json reescribe /api/<nombre> hacia aquí con ?fn=<nombre>.
import { json } from '../lib/supabase.js';
import carteraAdmin from '../server/admin/cartera.js';
import catalogAdmin from '../server/admin/catalog.js';
import crmAdmin from '../server/admin/crm.js';
import crmEvidenceAdmin from '../server/admin/crm-evidence.js';
import customersAdmin from '../server/admin/customers.js';
import dashboardAdmin from '../server/admin/dashboard.js';
import equiposAdmin from '../server/admin/equipos.js';
import financeAdmin from '../server/admin/finance.js';
import leadsAdmin from '../server/admin/leads.js';
import lockEvidenceAdmin from '../server/admin/lock-evidence.js';
import ordersAdmin from '../server/admin/orders.js';
import paymentsAdmin from '../server/admin/payments.js';
import pazYSalvoAdmin from '../server/admin/paz-y-salvo.js';
import pricingAdmin from '../server/admin/pricing.js';
import reportsAdmin from '../server/admin/reports.js';
import salesAdmin from '../server/admin/sales.js';
import tradeInPhotosAdmin from '../server/admin/trade-in-photos.js';

const HANDLERS = {
  'cartera': carteraAdmin,
  'catalog': catalogAdmin,
  'crm': crmAdmin,
  'crm-evidence': crmEvidenceAdmin,
  'customers': customersAdmin,
  'dashboard': dashboardAdmin,
  'equipos': equiposAdmin,
  'finance': financeAdmin,
  'leads': leadsAdmin,
  'lock-evidence': lockEvidenceAdmin,
  'orders': ordersAdmin,
  'payments': paymentsAdmin,
  'paz-y-salvo': pazYSalvoAdmin,
  'pricing': pricingAdmin,
  'reports': reportsAdmin,
  'sales': salesAdmin,
  'trade-in-photos': tradeInPhotosAdmin
};

export default async function handler(req, res) {
  const fn = String(req.query?.fn || '');
  const h = Object.prototype.hasOwnProperty.call(HANDLERS, fn) ? HANDLERS[fn] : null;
  if (!h) return json(res, 404, { error: 'FUNCTION_NOT_FOUND' });
  return h(req, res);
}
