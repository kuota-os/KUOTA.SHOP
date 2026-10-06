# Despliegue de KUOTA — solo copiar y pegar

## 1. GitHub
Sube **el contenido** de este ZIP a la raíz del repositorio `kuota-os/KUOTAWEB` (borra antes lo que haya). Debe quedar `vercel.json` y la carpeta `public/` en la raíz del repo.
(Opcional: en tu computador `npm install` y sube también el `package-lock.json`.)

> **Desde el celular:** abre GitHub en "Sitio de escritorio". Para reemplazar una carpeta: ábrela, toca los tres puntos (⋯) > **Delete directory**, y luego vuelve a crearla subiendo sus archivos (si no te deja subir carpetas, entra a la carpeta y sube los archivos desde dentro; para crear una carpeta nueva usa Add file > Create new file y escribe `carpeta/archivo`). Cada subida lanza un despliegue en Vercel: **las X rojas intermedias son normales**; solo importa el último despliegue, cuando ya subiste todo. Sube `vercel.json` y `package.json` al final.

## 2. Supabase (SQL Editor)
- **Base nueva:** pega y ejecuta `supabase/00_INSTALAR_TODO.sql` (una sola vez).
- **Base que ya tiene datos:** ejecuta solo los archivos que te falten, en orden numérico (01…09). Nunca vuelvas a ejecutar el 01 en una base con precios editados.
- Authentication > Email Templates > "Magic Link": agrega el código al correo:
  `Tu código de acceso KUOTA es: {{ .Token }}`
- Authentication > URL Configuration: Site URL `https://www.kuota.shop` y en Redirect URLs agrega `https://www.kuota.shop/admin/`.
- Crea tu usuario (Authentication > Users > Add user, con tu correo) y hazlo administrador ejecutando esto con tu correo real:
  `insert into admin_users (auth_user_id) select id from auth.users where email = 'TU_CORREO';`

## 3. Vercel
- Settings > General > **Root Directory:** vacío. Framework Preset: Other. Node 22.x.
- Los demás valores (sin build, carpeta `public`) ya están fijados en `vercel.json`.
- Settings > Environment Variables (Production): copia los 9 valores de `.env.example`.
- Deployments > Redeploy (sin caché). Domains: `www.kuota.shop` (DNS en Spaceship como indique Vercel).

## 4. Wompi
Panel Wompi > Desarrolladores > Eventos: URL `https://www.kuota.shop/api/wompi-webhook`. Empieza con llaves de **pruebas**; al validar, cambia a producción.

## 5. Comprobación (5 minutos)
1. `kuota.shop` te lleva a `kuota.shop/inicio`; el logo dice KUOTA; Nuevos y Exhibición se ponen verdes al tocarlos.
2. `kuota.shop/admin` pide correo, te llega el enlace y entras. Cierra sesión y confirma que sin sesión no se ve nada.
3. En Admin > Precios carga el **precio proveedor** de cada equipo (hoy está en 0).
4. Compra de prueba en Wompi (sandbox): debe aparecer en Ventas. Con envío nacional aparece en Solicitudes > Envíos nacionales.
5. Envía un formulario de Reportados: aparece en Solicitudes. Apruébalo, completa los pasos y ciérralo: aparece en Cartera con 14 cuotas.
6. En `kuota.shop/soy-cliente` entra con el correo del cliente de prueba: código, cédula y apellido, y paga una cuota.

## Pendiente a propósito
Recordatorios y avisos automáticos por WhatsApp (requieren la API oficial de WhatsApp Business). Mientras tanto, el bloqueo, el desbloqueo y la bienvenida abren WhatsApp con el mensaje listo.
