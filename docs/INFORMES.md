# Informes: fórmulas aplicadas y supuestos

1. Contado: precio venta - precio proveedor. Fuente: tabla `sales` (se registra al aprobarse el pago en Wompi). Los envíos nacionales ya cuentan aquí.
2. Buena vida crediticia (por aliado): el cliente paga precio + % del aliado; a KUOTA le queda precio + 5% - proveedor.
   Porcentajes del cliente: Addi 25, Sistecrédito 30, Banco de Bogotá 15, Brilla 30, Su+ Pay 10, Nequi 10, Bancolombia 10, Tarjeta 10.
3. Reportados / Sin vida crediticia: valor crédito - 10% - proveedor (el 10% y el 5% se editan en Informes > Parámetros).
4. Plan Retoma (SUPUESTO, confirmar): ingreso = valor recibido por el equipo + restante cobrado;
   contado: restante completo; buena vida: restante + 5%; reportados: restante - 10%. Utilidad = ingreso - proveedor.

Los precios se congelan al cerrar cada solicitud (foto del precio y costo): editar Precios después no altera informes pasados.
Una venta sin precio de proveedor se marca "sin costo" y se avisa arriba del informe.

## Retoma: equipos recibidos
Al marcar como listo el paso 1 de Retoma, el equipo recibido entra a "Retoma · Equipos" con su rentabilidad esperada:
contado = precio venta - valor recibido; buena vida = precio +5% - valor recibido; reportados = valor crédito -10% - valor recibido.
"Vender" lo pasa a Vendido y no se reactiva. El valor crédito de cada equipo se carga en Precios.
