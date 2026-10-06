# KUOTA — plataforma de ventas y financiación de iPhone

Sitio público: **kuota.shop/inicio** · Panel privado: **kuota.shop/admin** (sin enlace desde la web, fuera de Google, con login obligatorio).

## Estructura (todo lo que se publica está en `public/`)
```
public/                    lo que ve el navegador
  index.html, app.js, events.js, styles.css      sitio público (inicio, catálogo, contacto, soy cliente)
  robots.txt, sitemap.xml
  admin/                   panel privado  -> kuota.shop/admin
api/                       SOLO 2 archivos = 2 funciones de Vercel (límite de 12 en plan Hobby)
  public.js, admin.js      despachadores: /api/<nombre> y /api/admin/<nombre> (ver vercel.json)
server/                    el código de cada endpoint
  public/                  catálogo, órdenes, leads, soy cliente, webhook de Wompi
  admin/                   endpoints del panel (todos exigen sesión de administrador)
lib/                       lógica de negocio compartida (fórmulas, CRM, cartera, precios)
supabase/                  base de datos: 01..09 en orden + 00_INSTALAR_TODO.sql (base nueva)
scripts/                   pruebas automáticas
docs/                      INFORMES.md (fórmulas), AUTOANALISIS.md (auditoría), archivo/
vercel.json  package.json  .env.example  .gitignore  .vercelignore  DESPLIEGUE.md
```

## Qué hace
- **Público:** catálogo (nuevos y exhibición), compra de contado con Wompi (envío nacional o domicilio), crédito con aliados (Addi, Sistecrédito, Banco de Bogotá, Brilla, Su+ Pay, Nequi, Bancolombia, tarjeta), Reportados / Sin vida crediticia, Plan Retoma y **Soy cliente** (ingreso por código OTP al correo, calendario de cuotas y pago con Wompi).
- **Admin:** Resumen · Solicitudes (CRM de 4 secciones con aprobación, pasos con fotos y finalizados de solo lectura) · Clientes · Cartera (avance, pagos manuales, bloqueo/desbloqueo, paz y salvo) · Recaudos · Ventas · Catálogo · Precios (precio web, proveedor, inicial, cuota y valor crédito) · Informes (utilidad bruta por canal) · Retoma · Equipos.

## Comandos (necesitan Node 22)
```
npm install        una vez, para instalar dependencias
npm run verify     revisa estructura, seguridad estática y corre todas las pruebas
```
Para desplegar sigue **DESPLIEGUE.md**. Fórmulas de informes: `docs/INFORMES.md`.

## Reglas que no se rompen
Los secretos (service role, secretos de Wompi) solo en el servidor. Un pago se aprueba únicamente por webhook firmado. Una financiación nunca se activa sola desde un formulario. Las fotos de clientes viven en buckets privados y se ven con enlaces firmados. Cada cliente solo ve lo suyo.
