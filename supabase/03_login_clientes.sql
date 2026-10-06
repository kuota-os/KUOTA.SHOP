-- ============================================================
-- KUOTA — Identificación de clientes por cédula + primer apellido
-- Ejecutar en Supabase DESPUÉS de 01_kuota-schema.sql y 02_kuota-orders-schema.sql
-- Seguro de re-ejecutar (columnas e índices con guardas if not exists).
-- ============================================================

alter table customers add column if not exists primer_apellido text;

-- Índice para que la búsqueda de login sea rápida
create index if not exists idx_customers_cedula_apellido
on customers (cedula, lower(primer_apellido));

-- NOTA DE SEGURIDAD: no agregamos ninguna política de RLS que permita a "anon"
-- leer la tabla customers por cédula/apellido directamente. Si lo hiciéramos así,
-- cualquier persona podría intentar combinaciones y ver datos de otros clientes.
-- En su lugar, el login se hace a través de una función de backend (api/customer-login.js)
-- que usa la Service Role Key (nunca expuesta al navegador) para hacer esa búsqueda
-- de forma segura y devolver ÚNICAMENTE los datos del cliente que coincide.
