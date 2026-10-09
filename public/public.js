// Dispatcher de endpoints PÚBLICOS: /api/<nombre>
// Vercel (plan Hobby) permite máximo 12 funciones por despliegue: por eso todos los endpoints viven en /server
// y estos dos archivos son las ÚNICAS funciones. vercel.json reescribe /api/<nombre> hacia aquí con ?fn=<nombre>.
import { json } from '../lib/supabase.js';
import catalog from '../server/public/catalog.js';
import config from '../server/public/config.js';
import createOrder from '../server/public/create-order.js';
import customerLink from '../server/public/customer-link.js';
import customerLogin from '../server/public/customer-login.js';
import customerMe from '../server/public/customer-me.js';
import customerPay from '../server/public/customer-pay.js';
import health from '../server/public/health.js';
import leadUpload from '../server/public/lead-upload.js';
import leads from '../server/public/leads.js';
import publicConfig from '../server/public/public-config.js';
import wompiWebhook from '../server/public/wompi-webhook.js';

const HANDLERS = {
  'health': health,
  'catalog': catalog,
  'config': config,
  'create-order': createOrder,
  'customer-link': customerLink,
  'customer-login': customerLogin,
  'customer-me': customerMe,
  'customer-pay': customerPay,
  'lead-upload': leadUpload,
  'leads': leads,
  'public-config': publicConfig,
  'wompi-webhook': wompiWebhook
};

export default async function handler(req, res) {
  const fn = String(req.query?.fn || '');
  const h = Object.prototype.hasOwnProperty.call(HANDLERS, fn) ? HANDLERS[fn] : null;
  if (!h) return json(res, 404, { error: 'FUNCTION_NOT_FOUND' });
  return h(req, res);
}
