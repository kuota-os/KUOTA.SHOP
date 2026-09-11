# KUOTA Platform

Plataforma de producción para KUOTA: catálogo de dispositivos, compra de contado con Wompi, solicitudes de financiación, Plan C de trade-in, cartera y portal **Soy Cliente**.

## 1. Arquitectura

- **Frontend:** HTML/CSS/JavaScript mobile-first en la raíz del proyecto (`index.html`, `admin.html`, `app.js`, `admin.js`, `styles.css`).
- **Backend:** Vercel Serverless Functions en `api/`.
- **Datos:** Supabase.
- **Autenticación:** Supabase Auth con email OTP.
- **Pagos:** Wompi. El secreto de integridad y el secreto de eventos solo existen en servidor.
- **Admin:** `/admin/`, protegido por Supabase Auth + `admin_users`.
- **Financiación canónica:** `financiaciones` → `cuotas` → `pagos`.
- **Fotos Plan C:** bucket privado `trade-in-photos`.

## 2. Instalación

```bash
npm install
npm run build
```

El build-check no necesita credenciales reales: verifica estructura, archivos y sintaxis JavaScript.

## 3. Variables de entorno

Copiar `.env.example` a `.env` solo para desarrollo local. En Vercel configurar las mismas variables como Environment Variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `WOMPI_PUBLIC_KEY`
- `WOMPI_INTEGRITY_SECRET`
- `WOMPI_EVENTS_SECRET`
- `WOMPI_CHECKOUT_URL`
- `KUOTA_BASE_URL`
- `WHATSAPP_NUMBER`

Nunca subir `.env`.

## 4. Supabase

Ejecutar en este orden, si esos archivos ya existen en tu proyecto histórico:

1. `kuota-schema.sql`
2. `kuota-orders-schema.sql`
3. `kuota-customer-login.sql`
4. `kuota-financiaciones-schema.sql`
5. `supabase/001_kuota_canonical_alignment.sql`

El último archivo es de alineación: usa `financiaciones`, `cuotas` y `pagos` como arquitectura única. Incluye columnas e índices faltantes de forma condicional, RLS y el bucket privado de Plan C.

Los cuatro SQL históricos proporcionados por KUOTA son la fuente de estructura y datos de negocio. `001_kuota_canonical_alignment.sql` se ejecuta después para añadir únicamente capacidades de producción que faltan (vínculo Auth, admin, metadatos de aprobación, RLS, Storage privado y funciones transaccionales), manteniendo `financiaciones → cuotas → pagos` como modelo canónico y sin crear tablas paralelas.

## 5. Primer administrador

Crear primero el usuario en Supabase Auth. Luego insertar su UUID en `admin_users`:

```sql
insert into public.admin_users(auth_user_id, active)
values ('UUID_DEL_USUARIO_AUTH', true);
```

El frontend de administración no confía únicamente en que el usuario esté autenticado: `/api/admin/*` comprueba `admin_users.active`. Las operaciones financieras sensibles se ejecutan con funciones transaccionales en PostgreSQL mediante el backend.

## 6. Wompi

Configurar en el comercio:

- llave pública
- secreto de integridad
- secreto de eventos
- URL de eventos: `https://TU_DOMINIO/api/wompi-webhook`

La firma de checkout se genera en servidor con `reference + amountInCents + currency + integritySecret`. Wompi documenta que el secreto de integridad no debe exponerse al frontend y que el checksum de eventos se construye usando dinámicamente `signature.properties`, `timestamp` y el secreto de eventos. El webhook implementa esa validación antes de modificar órdenes o pagos.

## 7. Compra de contado

`Catálogo → producto → variante/color → entrega → /api/create-order → Wompi → /api/wompi-webhook`.

El backend vuelve a leer producto y variante desde Supabase y recalcula 4x1000, envío/domicilio y total. El navegador nunca decide el importe definitivo.

Una redirección de Wompi no marca una orden como pagada. El estado definitivo se obtiene del evento verificado.

## 8. Plan B

Una solicitud pública crea un **lead**, no una financiación activa.

El administrador debe verificar:

- cliente
- producto
- modelo exacto
- capacidad exacta
- plan exacto
- inicial
- método y referencia de inicial

Al aprobar la inicial se crea la financiación, se registra la inicial como `pagos` con `cuota_id = null` y se generan 14 cuotas. La primera fecha se calcula con la regla quincenal de días 2/17 en `America/Bogota`.

## 9. Soy Cliente

El cliente solicita un OTP por email. Una vez autenticado, si el registro KUOTA todavía no está vinculado a ese usuario, debe proporcionar cédula y primer apellido. El backend solo puede crear el vínculo si el customer coincide y no está vinculado previamente a otro `auth_user_id`.

Después se muestran:

- saldo
- cuotas pagadas
- cuotas pendientes
- próxima cuota
- historial
- pagar cuota

## 10. Pago de cuotas

`Soy Cliente → Pagar cuota → /api/customer-pay → Wompi → webhook`.

La API verifica que la financiación pertenece al usuario autenticado y usa el monto de la cuota guardado en servidor. El webhook comprueba referencia, monto, moneda, firma e idempotencia antes de crear el pago y marcar la cuota.

## 11. Plan C

El frontend conserva la elegibilidad desde iPhone 12 Pro. Los archivos se validan por tamaño/tipo permitido y se suben al bucket privado `trade-in-photos` mediante `/api/lead-upload`. El bucket no es público y el administrador recibe URLs firmadas de corta duración.

La revisión administrativa puede usar posteriormente URLs firmadas de corta duración para visualizar las fotos.

## 12. Catálogo

Los productos y variantes viven en Supabase. No se hardcodean modelos/precios en el frontend. Para agregar un producto:

1. Crear `products`.
2. Crear sus `variants`.
3. Definir `colors`.
4. Marcar `active=true`.
5. Si aplica Plan B, crear una fila exacta en `planb_plans` con `category + model + storage`.

## 13. Seguridad

- `SUPABASE_SERVICE_ROLE_KEY` solo servidor.
- Secretos Wompi solo servidor.
- RLS activo para datos sensibles.
- Admin separado y comprobado por `admin_users`.
- Clientes limitados a su propio `auth_user_id`.
- Fotos Plan C privadas.
- Pagos confirmados únicamente por webhook verificado.
- Referencias Wompi únicas.
- Pagos con referencias/transaction IDs únicos para evitar duplicados.

## 14. Vercel

Importar el repositorio desde GitHub y desplegar **desde la raíz**. No se necesita un segundo proyecto ni otra carpeta de aplicación.

La configuración está en `vercel.json` y contiene rewrites para `/catalogo`, `/contacto`, `/soy-cliente`, `/producto/:id` y `/admin/*`, además de headers de seguridad.

## 15. GitHub

Subir:

```text
api/
docs/
lib/
scripts/
supabase/
index.html
admin.html
app.js
admin.js
styles.css
.env.example
.gitignore
README.md
package.json
vercel.json
```

No subir `.env`, claves privadas ni `node_modules`.

## 16. Validación realizada

`npm run build` valida estructura y sintaxis JavaScript. `npm run lint` comprueba sintaxis de los módulos principales y `npm test` comprueba las reglas de calendario Plan B (2/17). Estas pruebas son estáticas; las integraciones reales requieren el proyecto Supabase/Wompi de KUOTA.

No se puede declarar una prueba real de Supabase, Wompi, webhook, OTP o RLS en producción sin las credenciales y el proyecto real de KUOTA. Esas integraciones quedan preparadas, pero requieren configuración y prueba en el entorno del comercio.

## 17. Fuente analizada

La fuente disponible en esta entrega fue `kuota-rediseño-premium.html`. Se preservaron conceptos y lógica observables del archivo: catálogo remoto, Plan A/B/C, elegibilidad de Plan C, configuración exacta de Plan B, formularios, datos de contacto, Wompi, 4x1000, envío/domicilio y navegación pública `Inicio | Catálogo | Contacto | Soy cliente`.
