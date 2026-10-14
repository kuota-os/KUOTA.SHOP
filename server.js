// server.js — Servidor único para Hyperlift (reemplaza las funciones serverless de Vercel).
// Cada handler de api/ se usa TAL CUAL estaba (export default async function handler(req,res)),
// sin reescribir su lógica — Express ya es compatible con esa firma.

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import configHandler from './api/config.js';
import publicConfigHandler from './api/public-config.js';
import catalogHandler from './api/catalog.js';
import leadsHandler from './api/leads.js';
import leadUploadHandler from './api/lead-upload.js';
import customerLoginHandler from './api/customer-login.js';
import customerLinkHandler from './api/customer-link.js';
import customerMeHandler from './api/customer-me.js';
import customerPayHandler from './api/customer-pay.js';
import createOrderHandler from './api/create-order.js';
import wompiWebhookHandler from './api/wompi-webhook.js';

import adminCatalogHandler from './api/admin/catalog.js';
import adminCustomersHandler from './api/admin/customers.js';
import adminDashboardHandler from './api/admin/dashboard.js';
import adminFinanceHandler from './api/admin/finance.js';
import adminLeadsHandler from './api/admin/leads.js';
import adminOrdersHandler from './api/admin/orders.js';
import adminPaymentsHandler from './api/admin/payments.js';
import adminSalesHandler from './api/admin/sales.js';
import adminTradeInPhotosHandler from './api/admin/trade-in-photos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const app = express();

app.disable('x-powered-by');

// Cabeceras de seguridad equivalentes a las de vercel.json
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; script-src 'self' https://cdn.jsdelivr.net; " +
    "connect-src 'self' https://*.supabase.co https://api.wompi.co; frame-ancestors 'none'; base-uri 'self'; " +
    "form-action 'self' https://checkout.wompi.co;"
  );
  next();
});

// express.json() solo intercepta application/json — el multipart/form-data de lead-upload
// llega intacto a Busboy, igual que pasaba en Vercel.
app.use(express.json({ limit: '2mb' }));

// ---------- API: cada ruta llama al mismo handler que ya existía ----------
app.all('/api/config', configHandler);
app.all('/api/public-config', publicConfigHandler);
app.all('/api/catalog', catalogHandler);
app.all('/api/leads', leadsHandler);
app.all('/api/lead-upload', leadUploadHandler);
app.all('/api/customer-login', customerLoginHandler);
app.all('/api/customer-link', customerLinkHandler);
app.all('/api/customer-me', customerMeHandler);
app.all('/api/customer-pay', customerPayHandler);
app.all('/api/create-order', createOrderHandler);
app.all('/api/wompi-webhook', wompiWebhookHandler);

app.all('/api/admin/catalog', adminCatalogHandler);
app.all('/api/admin/customers', adminCustomersHandler);
app.all('/api/admin/dashboard', adminDashboardHandler);
app.all('/api/admin/finance', adminFinanceHandler);
app.all('/api/admin/leads', adminLeadsHandler);
app.all('/api/admin/orders', adminOrdersHandler);
app.all('/api/admin/payments', adminPaymentsHandler);
app.all('/api/admin/sales', adminSalesHandler);
app.all('/api/admin/trade-in-photos', adminTradeInPhotosHandler);

// ---------- Archivos estáticos (index.html, admin.html, app.js, admin.js, styles.css) ----------
app.use(express.static(PUBLIC_DIR, { index: false }));

// ---------- Panel admin: /admin y /admin/* sirven admin.html (SPA) ----------
app.get(['/admin', '/admin/*'], (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

// ---------- URLs limpias de la tienda: sirven index.html (SPA) ----------
app.get(['/', '/catalogo', '/contacto', '/soy-cliente', '/producto/:id'], (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Cualquier otra ruta no reconocida: 404 simple (evita que rutas /api inexistentes caigan al index).
app.use((req, res) => {
  res.status(404).json({ error: 'NOT_FOUND' });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Kuota corriendo en el puerto ${PORT}`);
});
