# Autoanálisis de seguridad y calidad (octubre 2026)

## Problemas encontrados y corregidos
| # | Gravedad | Problema | Corrección |
|---|----------|----------|-----------|
| 1 | Alta | `customer-link` tomaba el correo del cuerpo de la petición y usaba `ilike` con comodines: un usuario con sesión podía vincularse a la cuenta de otro cliente conociendo su cédula y apellido, o con `%`. | El correo sale del token verificado y se compara de forma exacta. Prueba automática del ataque. |
| 2 | Alta | Los botones del sitio estaban bloqueados por la política de seguridad (40 handlers inline). | Delegación de eventos (`events.js`); el verificador falla si reaparece uno. |
| 3 | Alta | El admin no tenía estilos (clases inexistentes): login y panel visibles juntos. | `admin.css`; prueba en navegador de login oculto con sesión y viceversa. |
| 4 | Alta | Deploy en Vercel fallaba (script `build` buscaba otra carpeta) y archivos internos quedaban públicos. | `public/` como única carpeta publicada, `vercel.json` fija sin build; SQL, docs y scripts fuera del sitio. |
| 5 | Media | Las fotos de trade-in (hasta 8 MB) superaban el límite de Vercel (~4,5 MB) y fallaban. | Compresión en el celular y límite del servidor en 4 MB. |
| 6 | Media | Los endpoints públicos devolvían mensajes internos de la base de datos. | `safeError`: solo códigos propios; prueba que lo verifica. |
| 7 | Media | `/api/leads` aceptaba cualquier tipo y rutas de fotos enviadas por el cliente. | Solo `plan_a/b/c`; `image_urls` siempre vacío; tope de tamaño. |
| 8 | Media | El valor crédito (dato comercial) podía leerse desde el navegador. | Permisos por columna en la base y consultas sin `select *`; el verificador lo vigila. |
| 9 | Media | El admin era indexable y cacheable. | `noindex`, `X-Robots-Tag`, `no-store`, `robots.txt`, sin enlaces desde la web. |
| 10 | Baja | Addi mostraba +15% en una versión intermedia. | Vuelve a +25% (el cliente) y a KUOTA +5% (utilidad). |
| 11 | **Crítica** | El proyecto tenía 28 funciones en `api/` y el plan Hobby de Vercel permite máximo 12 por despliegue: el despliegue a producción fallaba (X roja) con "No more than 12 Serverless Functions". Muy probablemente también causaba el 404 inicial. | Solo 2 funciones en `api/` (despachadores) y el código en `server/`; mismas URLs gracias a los rewrites. El verificador falla si `api/` supera 12 archivos y comprueba que cada ruta que usa el navegador llega a un endpoint real. |
| 12 | Baja | Numeración de SQL confusa (01…04 y luego 001…005). | Renumerados 01…09 en orden de ejecución y un `00_INSTALAR_TODO.sql` generado automáticamente. |

## Qué se verifica automáticamente (`npm run verify`)
Estructura y archivos, sintaxis de los 56 archivos JS, ausencia de scripts/handlers inline, rewrites y cabeceras de `vercel.json`, dependencias del backend, ausencia de secretos en `public/`, orden y dependencias de los SQL, RLS en cada tabla, columnas usadas por el código vs. columnas reales del esquema, 28 endpoints cargando, los 17 endpoints admin rechazando sin sesión (401) y con usuario no admin (403), webhook con firma inválida, fórmulas de utilidad (incluido tu ejemplo de 1.110.000), CRM, cartera, calendario de cuotas y paz y salvo.

## Lo que NO se pudo probar desde aquí (hazlo al desplegar)
- Ejecución real de los SQL en Supabase y las políticas RLS (revisadas estáticamente).
- Pago real con Wompi y llegada del webhook.
- Envío de correos OTP (depende de la plantilla en Supabase).
- Subida real de fotos al almacenamiento privado.
- Navegadores distintos de Chromium y dispositivos físicos.

## Recomendado después del lanzamiento
- **Anti-spam en formularios públicos** (`/api/leads`, `/api/customer-login`): activar el Firewall de Vercel con límite de peticiones por IP o agregar Cloudflare Turnstile. Supabase ya limita los envíos de código OTP.
- **Copias de seguridad:** activar los respaldos diarios del proyecto en Supabase (plan Pro) antes de manejar cartera real.
- **Segundo factor para administradores** si se agregan más personas al panel.
