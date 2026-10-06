-- ============================================================
-- KUOTA — Tabla de órdenes (carrito de contado con envío/domicilio)
-- Ejecutar en Supabase SQL Editor DESPUÉS de 01_kuota-schema.sql
-- Seguro de re-ejecutar (create table if not exists + políticas con drop previo).
-- ============================================================

create table if not exists orders (
id uuid primary key default gen_random_uuid(),
reference text unique not null,

product_id uuid references products(id),
variant_id uuid references variants(id),
product_model text not null,
storage text,
color text,
category text,

product_price numeric not null,
tax_4x1000 numeric not null default 0,

shipping_selected boolean not null default false,
shipping_percentage numeric,
shipping_fee numeric,

domestic_delivery_selected boolean not null default false,
domestic_delivery_percentage numeric,
domestic_delivery_fee numeric,

total_amount numeric not null,

shipping_customer_name text,
shipping_customer_id text,
shipping_department text,
shipping_city text,
shipping_address text,
shipping_whatsapp text,

status text not null default 'pending' check (status in ('pending','paid','mismatch','expired')),
wompi_transaction_id text,
paid_at timestamptz,
created_at timestamptz not null default now()
);

-- Sin políticas para anon: esta tabla solo la toca el backend (Vercel) usando la
-- Service Role Key, que se salta RLS. Ni la tienda ni nadie externo puede leerla o escribirla
-- directamente — así se evita que alguien manipule el monto de una orden desde el navegador.
alter table orders enable row level security;

drop policy if exists "admin read orders" on orders;
create policy "admin read orders" on orders
for select to authenticated using (true);
