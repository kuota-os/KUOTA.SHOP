-- KUOTA: instalación COMPLETA desde cero (generado automáticamente a partir de los 9 archivos, en orden).
-- Úsalo SOLO en una base nueva. Para actualizar una base que ya tiene datos, ejecuta únicamente el archivo nuevo que corresponda.

-- ======================= 01_base_catalogo.sql =======================
-- ============================================================
-- KUOTA — Esquema completo + datos actuales del catálogo
-- Ejecutar UNA vez en Supabase: Dashboard -> SQL Editor -> New query -> pegar todo -> Run
-- Seguro de re-ejecutar: crea tablas si no existen, y ya NO duplica catálogo/planB/settings si ya tienen datos.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- PRODUCTOS ----------
create table if not exists products (
id uuid primary key default gen_random_uuid(),
category text not null check (category in ('nuevo','exhibicion')),
family text not null,
model text not null,
colors jsonb not null default '[]'::jsonb,
image_url text,
active boolean not null default true,
sort_order int not null default 0,
created_at timestamptz not null default now()
);

-- ---------- VARIANTES (precio de venta — público) ----------
create table if not exists variants (
id uuid primary key default gen_random_uuid(),
product_id uuid not null references products(id) on delete cascade,
storage text not null,
price numeric not null,
active boolean not null default true,
created_at timestamptz not null default now()
);

-- ---------- COSTOS DE PROVEEDOR (privado, solo admin) ----------
create table if not exists variant_costs (
variant_id uuid primary key references variants(id) on delete cascade,
cost numeric not null default 0,
updated_at timestamptz not null default now()
);

-- ---------- PLAN B: reportados / cuota inicial ----------
create table if not exists planb_plans (
id uuid primary key default gen_random_uuid(),
category text not null check (category in ('nuevo','exhibicion')),
model text not null,
storage text not null,
inicial numeric not null,
cuota numeric not null,
active boolean not null default true,
created_at timestamptz not null default now()
);

-- ---------- CONFIGURACIÓN GENERAL (whatsapp, wompi, entidades, 4x1000) ----------
create table if not exists settings (
key text primary key,
value jsonb not null
);

-- ---------- CLIENTES ----------
create table if not exists customers (
id uuid primary key default gen_random_uuid(),
full_name text,
cedula text,
whatsapp text,
email text,
birth_date date,
source text,
created_at timestamptz not null default now()
);

-- ---------- LEADS (capturas de los formularios Plan A / B / C) ----------
create table if not exists leads (
id uuid primary key default gen_random_uuid(),
lead_type text not null check (lead_type in ('plan_a','plan_b','plan_c')),
customer_id uuid references customers(id),
device_label text,
payload jsonb not null default '{}'::jsonb,
image_urls text[] default '{}',
created_at timestamptz not null default now()
);

-- ---------- VENTAS (registro manual desde el admin) ----------
create table if not exists sales (
id uuid primary key default gen_random_uuid(),
sold_at date not null default current_date,
product_model text not null,
storage text,
category text,
channel text not null,
sale_price numeric not null,
cost_price numeric not null default 0,
margin numeric generated always as (sale_price - cost_price) stored,
customer_id uuid references customers(id),
notes text,
created_at timestamptz not null default now()
);

-- ============================================================
-- SEGURIDAD (Row Level Security)
-- ============================================================

alter table products enable row level security;
alter table variants enable row level security;
alter table variant_costs enable row level security;
alter table planb_plans enable row level security;
alter table settings enable row level security;
alter table customers enable row level security;
alter table leads enable row level security;
alter table sales enable row level security;

drop policy if exists "public read active products" on products;
create policy "public read active products" on products
for select to anon using (active = true);
drop policy if exists "admin full access products" on products;
create policy "admin full access products" on products
for all to authenticated using (true) with check (true);

drop policy if exists "public read active variants" on variants;
create policy "public read active variants" on variants
for select to anon using (active = true);
drop policy if exists "admin full access variants" on variants;
create policy "admin full access variants" on variants
for all to authenticated using (true) with check (true);

drop policy if exists "admin full access variant_costs" on variant_costs;
create policy "admin full access variant_costs" on variant_costs
for all to authenticated using (true) with check (true);

drop policy if exists "public read active planb" on planb_plans;
create policy "public read active planb" on planb_plans
for select to anon using (active = true);
drop policy if exists "admin full access planb" on planb_plans;
create policy "admin full access planb" on planb_plans
for all to authenticated using (true) with check (true);

drop policy if exists "public read settings" on settings;
create policy "public read settings" on settings
for select to anon using (true);
drop policy if exists "admin write settings" on settings;
create policy "admin write settings" on settings
for insert to authenticated with check (true);
drop policy if exists "admin update settings" on settings;
create policy "admin update settings" on settings
for update to authenticated using (true) with check (true);
drop policy if exists "admin delete settings" on settings;
create policy "admin delete settings" on settings
for delete to authenticated using (true);

drop policy if exists "public insert customers" on customers;
create policy "public insert customers" on customers
for insert to anon with check (true);
drop policy if exists "admin full access customers" on customers;
create policy "admin full access customers" on customers
for all to authenticated using (true) with check (true);

drop policy if exists "public insert leads" on leads;
create policy "public insert leads" on leads
for insert to anon with check (true);
drop policy if exists "admin full access leads" on leads;
create policy "admin full access leads" on leads
for all to authenticated using (true) with check (true);

drop policy if exists "admin full access sales" on sales;
create policy "admin full access sales" on sales
for all to authenticated using (true) with check (true);

-- ============================================================
-- ALMACENAMIENTO
-- ============================================================
insert into storage.buckets (id, name, public)
values ('device-images', 'device-images', true)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
values ('trade-in-photos', 'trade-in-photos', true)
on conflict (id) do nothing;

drop policy if exists "public read device-images" on storage.objects;
create policy "public read device-images" on storage.objects
for select to anon using (bucket_id = 'device-images');
drop policy if exists "admin write device-images" on storage.objects;
create policy "admin write device-images" on storage.objects
for insert to authenticated with check (bucket_id = 'device-images');
drop policy if exists "admin update device-images" on storage.objects;
create policy "admin update device-images" on storage.objects
for update to authenticated using (bucket_id = 'device-images');
drop policy if exists "admin delete device-images" on storage.objects;
create policy "admin delete device-images" on storage.objects
for delete to authenticated using (bucket_id = 'device-images');

drop policy if exists "public read trade-in-photos" on storage.objects;
create policy "public read trade-in-photos" on storage.objects
for select to anon using (bucket_id = 'trade-in-photos');
drop policy if exists "public upload trade-in-photos" on storage.objects;
create policy "public upload trade-in-photos" on storage.objects
for insert to anon with check (bucket_id = 'trade-in-photos');
drop policy if exists "admin manage trade-in-photos" on storage.objects;
create policy "admin manage trade-in-photos" on storage.objects
for all to authenticated using (bucket_id = 'trade-in-photos') with check (bucket_id = 'trade-in-photos');

-- ============================================================
-- DATOS ACTUALES (migrados desde la landing)
-- ============================================================

do $$
declare
pid uuid;
vid uuid;
begin
if exists (select 1 from products limit 1) then
return;
end if;

insert into products (category, family, model, colors, sort_order) values ('nuevo', 'iPhone', 'iPhone 13', '[["Rosa", "#f3c6d9"], ["Azul", "#a9c6e6"], ["Verde", "#c4d9bd"], ["Medianoche", "#2b2d31"], ["Blanco Estelar", "#f0ecdf"]]'::jsonb, 0) returning id into pid;
insert into variants (product_id, storage, price) values (pid, '128GB', 2200000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into products (category, family, model, colors, sort_order) values ('nuevo', 'iPhone', 'iPhone 14', '[["Azul", "#b9c9de"], ["Púrpura", "#cabfda"], ["Medianoche", "#2b2d31"], ["Blanco Estelar", "#f0ecdf"], ["(PRODUCT)RED", "#a12a30"]]'::jsonb, 10) returning id into pid;
insert into variants (product_id, storage, price) values (pid, '128GB', 2380000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into products (category, family, model, colors, sort_order) values ('nuevo', 'iPhone', 'iPhone 15', '[["Negro", "#2b2b2b"], ["Azul", "#9fb8cf"], ["Verde", "#b9c9ad"], ["Amarillo", "#e8dfa8"], ["Rosa", "#e9cdd4"]]'::jsonb, 20) returning id into pid;
insert into variants (product_id, storage, price) values (pid, '128GB', 2750000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into products (category, family, model, colors, sort_order) values ('nuevo', 'iPhone', 'iPhone 16', '[["Negro", "#2b2b2b"], ["Blanco", "#f0ecdf"], ["Rosa", "#e9c9cf"], ["Azul Ultramar", "#5b6ea8"], ["Verde Azulado", "#8fada3"]]'::jsonb, 30) returning id into pid;
insert into variants (product_id, storage, price) values (pid, '128GB', 2900000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into products (category, family, model, colors, sort_order) values ('nuevo', 'iPhone', 'iPhone 17', '[["Negro", "#2b2b2b"], ["Blanco", "#f0ecdf"], ["Azul", "#9fb8cf"], ["Verde Niebla", "#b9c2ad"], ["Lavanda", "#c9c2df"]]'::jsonb, 40) returning id into pid;
insert into variants (product_id, storage, price) values (pid, '256GB', 3450000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into products (category, family, model, colors, sort_order) values ('nuevo', 'iPhone', 'iPhone 17 Pro', '[["Titanio Natural", "#b7ab9a"], ["Titanio Azul", "#5c7086"], ["Titanio Blanco", "#e4e1d6"], ["Titanio Negro", "#2f2f2d"]]'::jsonb, 50) returning id into pid;
insert into variants (product_id, storage, price) values (pid, '256GB', 4480000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into products (category, family, model, colors, sort_order) values ('nuevo', 'iPhone', 'iPhone 17 Pro Max', '[["Titanio Natural", "#b7ab9a"], ["Titanio Azul", "#5c7086"], ["Titanio Blanco", "#e4e1d6"], ["Titanio Negro", "#2f2f2d"]]'::jsonb, 60) returning id into pid;
insert into variants (product_id, storage, price) values (pid, '256GB', 4680000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into variants (product_id, storage, price) values (pid, '512GB', 5950000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into products (category, family, model, colors, sort_order) values ('nuevo', 'Otros dispositivos', 'iPad A16', '[["Azul", "#a9c6e6"], ["Amarillo", "#e8dfa8"], ["Rosa", "#e9cdd4"], ["Plata", "#d8d8d6"]]'::jsonb, 70) returning id into pid;
insert into variants (product_id, storage, price) values (pid, '128GB', 1780000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into products (category, family, model, colors, sort_order) values ('nuevo', 'Otros dispositivos', 'Apple Watch S11', '[["Negro", "#2b2b2b"], ["Plata", "#d8d8d6"], ["Oro Rosa", "#dcb6ab"], ["Medianoche", "#2b2d31"]]'::jsonb, 80) returning id into pid;
insert into variants (product_id, storage, price) values (pid, '42MM', 1800000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into products (category, family, model, colors, sort_order) values ('exhibicion', 'iPhone 12', 'iPhone 12', '[["Negro", "#2b2b2b"], ["Blanco", "#f0ecdf"], ["Azul", "#7a93b8"], ["Verde", "#a9c1a1"], ["(PRODUCT)RED", "#a12a30"]]'::jsonb, 90) returning id into pid;
insert into variants (product_id, storage, price) values (pid, '64GB', 1130000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into variants (product_id, storage, price) values (pid, '128GB', 1250000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into products (category, family, model, colors, sort_order) values ('exhibicion', 'iPhone 12', 'iPhone 12 Pro', '[["Grafito", "#4c4c4e"], ["Plata", "#d8d8d6"], ["Oro", "#e7d3b0"], ["Azul Sierra", "#7996a8"]]'::jsonb, 100) returning id into pid;
insert into variants (product_id, storage, price) values (pid, '128GB', 1450000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into variants (product_id, storage, price) values (pid, '256GB', 1530000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into products (category, family, model, colors, sort_order) values ('exhibicion', 'iPhone 12', 'iPhone 12 Pro Max', '[["Grafito", "#4c4c4e"], ["Plata", "#d8d8d6"], ["Oro", "#e7d3b0"], ["Azul Sierra", "#7996a8"]]'::jsonb, 110) returning id into pid;
insert into variants (product_id, storage, price) values (pid, '128GB', 1700000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into variants (product_id, storage, price) values (pid, '256GB', 1830000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into products (category, family, model, colors, sort_order) values ('exhibicion', 'iPhone 13', 'iPhone 13', '[["Rosa", "#f3c6d9"], ["Azul", "#a9c6e6"], ["Verde", "#c4d9bd"], ["Medianoche", "#2b2d31"], ["Blanco Estelar", "#f0ecdf"]]'::jsonb, 120) returning id into pid;
insert into variants (product_id, storage, price) values (pid, '128GB', 1550000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into variants (product_id, storage, price) values (pid, '256GB', 1650000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into products (category, family, model, colors, sort_order) values ('exhibicion', 'iPhone 13', 'iPhone 13 Pro', '[["Grafito", "#4c4c4e"], ["Plata", "#d8d8d6"], ["Oro", "#e7d3b0"], ["Azul Sierra", "#7996a8"]]'::jsonb, 130) returning id into pid;
insert into variants (product_id, storage, price) values (pid, '128GB', 1880000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into variants (product_id, storage, price) values (pid, '256GB', 1990000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into products (category, family, model, colors, sort_order) values ('exhibicion', 'iPhone 13', 'iPhone 13 Pro Max', '[["Grafito", "#4c4c4e"], ["Plata", "#d8d8d6"], ["Oro", "#e7d3b0"], ["Azul Sierra", "#7996a8"]]'::jsonb, 140) returning id into pid;
insert into variants (product_id, storage, price) values (pid, '128GB', 2130000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into variants (product_id, storage, price) values (pid, '256GB', 2230000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into products (category, family, model, colors, sort_order) values ('exhibicion', 'iPhone 14', 'iPhone 14', '[["Azul", "#b9c9de"], ["Púrpura", "#cabfda"], ["Medianoche", "#2b2d31"], ["Blanco Estelar", "#f0ecdf"], ["(PRODUCT)RED", "#a12a30"]]'::jsonb, 150) returning id into pid;
insert into variants (product_id, storage, price) values (pid, '128GB', 1650000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into products (category, family, model, colors, sort_order) values ('exhibicion', 'iPhone 14', 'iPhone 14 Plus', '[["Azul", "#b9c9de"], ["Púrpura", "#cabfda"], ["Medianoche", "#2b2d31"], ["Blanco Estelar", "#f0ecdf"], ["(PRODUCT)RED", "#a12a30"]]'::jsonb, 160) returning id into pid;
insert into variants (product_id, storage, price) values (pid, '128GB', 1850000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into products (category, family, model, colors, sort_order) values ('exhibicion', 'iPhone 14', 'iPhone 14 Pro', '[["Morado Oscuro", "#4d4358"], ["Oro", "#e7d3b0"], ["Plata", "#d8d8d6"], ["Negro Espacial", "#2b2b2b"]]'::jsonb, 170) returning id into pid;
insert into variants (product_id, storage, price) values (pid, '128GB', 2050000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into variants (product_id, storage, price) values (pid, '256GB', 2200000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into products (category, family, model, colors, sort_order) values ('exhibicion', 'iPhone 14', 'iPhone 14 Pro Max', '[["Morado Oscuro", "#4d4358"], ["Oro", "#e7d3b0"], ["Plata", "#d8d8d6"], ["Negro Espacial", "#2b2b2b"]]'::jsonb, 180) returning id into pid;
insert into variants (product_id, storage, price) values (pid, '128GB', 2400000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into variants (product_id, storage, price) values (pid, '256GB', 2550000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into products (category, family, model, colors, sort_order) values ('exhibicion', 'iPhone 15', 'iPhone 15', '[["Negro", "#2b2b2b"], ["Azul", "#9fb8cf"], ["Verde", "#b9c9ad"], ["Amarillo", "#e8dfa8"], ["Rosa", "#e9cdd4"]]'::jsonb, 190) returning id into pid;
insert into variants (product_id, storage, price) values (pid, '128GB', 2130000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into products (category, family, model, colors, sort_order) values ('exhibicion', 'iPhone 15', 'iPhone 15 Plus', '[["Negro", "#2b2b2b"], ["Azul", "#9fb8cf"], ["Verde", "#b9c9ad"], ["Amarillo", "#e8dfa8"], ["Rosa", "#e9cdd4"]]'::jsonb, 200) returning id into pid;
insert into variants (product_id, storage, price) values (pid, '128GB', 2480000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into products (category, family, model, colors, sort_order) values ('exhibicion', 'iPhone 15', 'iPhone 15 Pro', '[["Titanio Natural", "#b7ab9a"], ["Titanio Azul", "#5c7086"], ["Titanio Blanco", "#e4e1d6"], ["Titanio Negro", "#2f2f2d"]]'::jsonb, 210) returning id into pid;
insert into variants (product_id, storage, price) values (pid, '128GB', 2500000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into variants (product_id, storage, price) values (pid, '256GB', 2600000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into products (category, family, model, colors, sort_order) values ('exhibicion', 'iPhone 15', 'iPhone 15 Pro Max', '[["Titanio Natural", "#b7ab9a"], ["Titanio Azul", "#5c7086"], ["Titanio Blanco", "#e4e1d6"], ["Titanio Negro", "#2f2f2d"]]'::jsonb, 220) returning id into pid;
insert into variants (product_id, storage, price) values (pid, '256GB', 2950000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into variants (product_id, storage, price) values (pid, '512GB', 3050000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into products (category, family, model, colors, sort_order) values ('exhibicion', 'iPhone 16', 'iPhone 16', '[["Negro", "#2b2b2b"], ["Blanco", "#f0ecdf"], ["Rosa", "#e9c9cf"], ["Azul Ultramar", "#5b6ea8"], ["Verde Azulado", "#8fada3"]]'::jsonb, 230) returning id into pid;
insert into variants (product_id, storage, price) values (pid, '128GB', 2700000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into products (category, family, model, colors, sort_order) values ('exhibicion', 'iPhone 16', 'iPhone 16 Pro', '[["Titanio Natural", "#b7ab9a"], ["Titanio Desierto", "#c9ab7f"], ["Titanio Blanco", "#e4e1d6"], ["Titanio Negro", "#2f2f2d"]]'::jsonb, 240) returning id into pid;
insert into variants (product_id, storage, price) values (pid, '128GB', 3100000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into variants (product_id, storage, price) values (pid, '256GB', 3250000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into products (category, family, model, colors, sort_order) values ('exhibicion', 'iPhone 16', 'iPhone 16 Pro Max', '[["Titanio Natural", "#b7ab9a"], ["Titanio Desierto", "#c9ab7f"], ["Titanio Blanco", "#e4e1d6"], ["Titanio Negro", "#2f2f2d"]]'::jsonb, 250) returning id into pid;
insert into variants (product_id, storage, price) values (pid, '256GB', 3600000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into variants (product_id, storage, price) values (pid, '512GB', 3880000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into products (category, family, model, colors, sort_order) values ('exhibicion', 'iPhone 17', 'iPhone 17 Pro', '[["Titanio Natural", "#b7ab9a"], ["Titanio Azul", "#5c7086"], ["Titanio Blanco", "#e4e1d6"], ["Titanio Negro", "#2f2f2d"]]'::jsonb, 260) returning id into pid;
insert into variants (product_id, storage, price) values (pid, '256GB', 4150000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
insert into products (category, family, model, colors, sort_order) values ('exhibicion', 'iPhone 17', 'iPhone 17 Pro Max', '[["Titanio Natural", "#b7ab9a"], ["Titanio Azul", "#5c7086"], ["Titanio Blanco", "#e4e1d6"], ["Titanio Negro", "#2f2f2d"]]'::jsonb, 270) returning id into pid;
insert into variants (product_id, storage, price) values (pid, '256GB', 4290000) returning id into vid;
insert into variant_costs (variant_id, cost) values (vid, 0);
end $$;

do $$
begin
if exists (select 1 from planb_plans limit 1) then
return;
end if;

insert into planb_plans (category, model, storage, inicial, cuota) values ('nuevo', 'iPhone 13', '128GB', 800000, 206600);
insert into planb_plans (category, model, storage, inicial, cuota) values ('nuevo', 'iPhone 14', '128GB', 900000, 225400);
insert into planb_plans (category, model, storage, inicial, cuota) values ('nuevo', 'iPhone 15', '128GB', 1050000, 260300);
insert into planb_plans (category, model, storage, inicial, cuota) values ('nuevo', 'iPhone 16', '128GB', 1100000, 275200);
insert into planb_plans (category, model, storage, inicial, cuota) values ('nuevo', 'iPhone 17', '256GB', 1750000, 279500);
insert into planb_plans (category, model, storage, inicial, cuota) values ('nuevo', 'iPhone 17 Pro', '256GB', 2100000, 372200);
insert into planb_plans (category, model, storage, inicial, cuota) values ('nuevo', 'iPhone 17 Pro Max', '256GB', 2500000, 365700);
insert into planb_plans (category, model, storage, inicial, cuota) values ('nuevo', 'iPhone 17 Pro Max', '512GB', 4200000, 363100);
insert into planb_plans (category, model, storage, inicial, cuota) values ('exhibicion', 'iPhone 12 Pro', '128GB', 550000, 140000);
insert into planb_plans (category, model, storage, inicial, cuota) values ('exhibicion', 'iPhone 12 Pro', '256GB', 600000, 160000);
insert into planb_plans (category, model, storage, inicial, cuota) values ('exhibicion', 'iPhone 12 Pro Max', '128GB', 650000, 165000);
insert into planb_plans (category, model, storage, inicial, cuota) values ('exhibicion', 'iPhone 12 Pro Max', '256GB', 700000, 180000);
insert into planb_plans (category, model, storage, inicial, cuota) values ('exhibicion', 'iPhone 13', '128GB', 600000, 150000);
insert into planb_plans (category, model, storage, inicial, cuota) values ('exhibicion', 'iPhone 13', '256GB', 700000, 168000);
insert into planb_plans (category, model, storage, inicial, cuota) values ('exhibicion', 'iPhone 13 Pro', '128GB', 750000, 174800);
insert into planb_plans (category, model, storage, inicial, cuota) values ('exhibicion', 'iPhone 13 Pro', '256GB', 750000, 215500);
insert into planb_plans (category, model, storage, inicial, cuota) values ('exhibicion', 'iPhone 13 Pro Max', '128GB', 900000, 210750);
insert into planb_plans (category, model, storage, inicial, cuota) values ('exhibicion', 'iPhone 13 Pro Max', '256GB', 950000, 215600);
insert into planb_plans (category, model, storage, inicial, cuota) values ('exhibicion', 'iPhone 14', '128GB', 700000, 155000);
insert into planb_plans (category, model, storage, inicial, cuota) values ('exhibicion', 'iPhone 14 Plus', '128GB', 800000, 167200);
insert into planb_plans (category, model, storage, inicial, cuota) values ('exhibicion', 'iPhone 14 Pro', '128GB', 800000, 200743);
insert into planb_plans (category, model, storage, inicial, cuota) values ('exhibicion', 'iPhone 14 Pro', '256GB', 850000, 210586);
insert into planb_plans (category, model, storage, inicial, cuota) values ('exhibicion', 'iPhone 14 Pro Max', '128GB', 1000000, 240009);
insert into planb_plans (category, model, storage, inicial, cuota) values ('exhibicion', 'iPhone 14 Pro Max', '256GB', 1100000, 240009);
insert into planb_plans (category, model, storage, inicial, cuota) values ('exhibicion', 'iPhone 15', '128GB', 800000, 213285);
insert into planb_plans (category, model, storage, inicial, cuota) values ('exhibicion', 'iPhone 15 Plus', '128GB', 950000, 240700);
insert into planb_plans (category, model, storage, inicial, cuota) values ('exhibicion', 'iPhone 15 Pro', '128GB', 950000, 236450);
insert into planb_plans (category, model, storage, inicial, cuota) values ('exhibicion', 'iPhone 15 Pro', '256GB', 1000000, 245458);
insert into planb_plans (category, model, storage, inicial, cuota) values ('exhibicion', 'iPhone 15 Pro Max', '256GB', 1200000, 270350);
insert into planb_plans (category, model, storage, inicial, cuota) values ('exhibicion', 'iPhone 15 Pro Max', '512GB', 1300000, 281263);
insert into planb_plans (category, model, storage, inicial, cuota) values ('exhibicion', 'iPhone 16', '128GB', 1100000, 251300);
insert into planb_plans (category, model, storage, inicial, cuota) values ('exhibicion', 'iPhone 16 Pro', '128GB', 1200000, 292400);
insert into planb_plans (category, model, storage, inicial, cuota) values ('exhibicion', 'iPhone 16 Pro', '256GB', 1400000, 295500);
insert into planb_plans (category, model, storage, inicial, cuota) values ('exhibicion', 'iPhone 16 Pro Max', '256GB', 1500000, 329990);
insert into planb_plans (category, model, storage, inicial, cuota) values ('exhibicion', 'iPhone 16 Pro Max', '512GB', 1700000, 349442);
insert into planb_plans (category, model, storage, inicial, cuota) values ('exhibicion', 'iPhone 17 Pro', '256GB', 1900000, 358645);
insert into planb_plans (category, model, storage, inicial, cuota) values ('exhibicion', 'iPhone 17 Pro Max', '256GB', 2200000, 363800);
end $$;

insert into settings (key, value) values ('whatsapp_number', '"573246613532"'::jsonb) on conflict (key) do update set value = excluded.value;
insert into settings (key, value) values ('wompi_link', '"https://checkout.wompi.co/l/VPOS_ci7Enu"'::jsonb) on conflict (key) do update set value = excluded.value;
insert into settings (key, value) values ('cash_transfer_pct', '0.004'::jsonb) on conflict (key) do update set value = excluded.value;
insert into settings (key, value) values ('entities', '[{"key": "addi", "name": "Addi", "kind": "cupo", "pct": 0.25, "validateUrl": "https://preapproval.addi.com/", "validateText": "Consulta tu cupo con Addi en un par de minutos, sin afectar tu historial."}, {"key": "sistecredito", "name": "Sistecrédito", "kind": "cupo", "pct": 0.3, "validateUrl": "https://www.sistecredito.com/clientes/", "validateText": "Consulta tu cupo con Sistecrédito y descubre cuánto puedes financiar."}, {"key": "bancobogota", "name": "Banco de Bogotá", "kind": "cupo", "pct": 0.15, "validateUrl": "https://slm.bancodebogota.com/lwv699zg", "validateText": "Consulta tu cupo preaprobado con Banco de Bogotá."}, {"key": "supay", "name": "Su+Pay", "kind": "cupo", "pct": 0.1, "validateUrl": "https://solicitud.sumas.co/v2/home/main", "validateText": "Consulta tu cupo con Su+Pay y conoce cuánto tienes disponible."}, {"key": "brilla", "name": "Cupo Brilla", "kind": "brilla", "pct": 0.3, "validateUrl": null, "validateText": null}, {"key": "nequi", "name": "Nequi Créditos", "kind": "direct", "pct": 0.1, "validateUrl": null, "validateText": null}, {"key": "bancolombia", "name": "Bancolombia Créditos", "kind": "direct", "pct": 0.1, "validateUrl": null, "validateText": null}, {"key": "tarjeta", "name": "Tarjeta de Crédito", "kind": "direct", "pct": 0.1, "validateUrl": null, "validateText": null}]'::jsonb) on conflict (key) do update set value = excluded.value;

-- ======================= 02_ordenes.sql =======================
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

-- ======================= 03_login_clientes.sql =======================
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

-- ======================= 04_financiaciones.sql =======================
-- ============================================================
-- KUOTA — Arquitectura de financiación / cartera (Soy Cliente + admin de cartera)
-- Ejecutar en Supabase DESPUÉS de los scripts anteriores.
-- Estas tablas empiezan vacías: se llenan cuando aprueban un crédito real.
-- Seguro de re-ejecutar (create table if not exists + políticas con drop previo).
-- ============================================================

create table if not exists financiaciones (
id uuid primary key default gen_random_uuid(),
customer_id uuid not null references customers(id),
product_model text not null,
storage text,
category text,
channel text,                       -- ej: plan_a_addi, plan_b, plan_c, etc.
financed_amount numeric not null,   -- valor total financiado
total_cuotas int not null,
cuota_value numeric not null,
saldo_pendiente numeric not null,
status text not null default 'activa' check (status in ('activa','pagada','mora','cancelada')),
start_date date not null default current_date,
created_at timestamptz not null default now()
);

create table if not exists cuotas (
id uuid primary key default gen_random_uuid(),
financiacion_id uuid not null references financiaciones(id) on delete cascade,
numero_cuota int not null,
fecha_vencimiento date not null,
valor numeric not null,
estado text not null default 'pendiente' check (estado in ('pendiente','pagada','vencida')),
paid_at timestamptz,
wompi_transaction_id text,
created_at timestamptz not null default now()
);

create table if not exists pagos (
id uuid primary key default gen_random_uuid(),
financiacion_id uuid not null references financiaciones(id) on delete cascade,
cuota_id uuid references cuotas(id),
monto numeric not null,
metodo text,                        -- ej: wompi, transferencia, efectivo
wompi_transaction_id text,
paid_at timestamptz not null default now(),
created_at timestamptz not null default now()
);

-- Seguridad: igual que orders, ningún acceso público directo. Todo pasa por
-- el backend (customer-login.js extendido, y el panel admin con su propio login).
alter table financiaciones enable row level security;
alter table cuotas enable row level security;
alter table pagos enable row level security;

drop policy if exists "admin full access financiaciones" on financiaciones;
create policy "admin full access financiaciones" on financiaciones for all to authenticated using (true) with check (true);
drop policy if exists "admin full access cuotas" on cuotas;
create policy "admin full access cuotas" on cuotas for all to authenticated using (true) with check (true);
drop policy if exists "admin full access pagos" on pagos;
create policy "admin full access pagos" on pagos for all to authenticated using (true) with check (true);

-- ======================= 05_seguridad_y_alineacion.sql =======================
-- KUOTA — canonical alignment over the four supplied SQL schemas.
-- Run after: kuota-schema.sql, kuota-orders-schema.sql,
-- kuota-customer-login.sql, kuota-financiaciones-schema.sql.
-- This migration DOES NOT create parallel financing tables.
--
-- CORRECCIONES respecto a la versión original:
--   1) Se eliminó settle_wompi_installment: quedaba una función de
--      liquidación duplicada que NO registraba la venta en `sales` para
--      órdenes de contado, a diferencia de settle_wompi_order. Ahora
--      settle_wompi_order es la única función de liquidación Wompi.
--   2) Se eliminó el primer bloque de políticas RLS (estático). Las
--      políticas se crean una sola vez, en el bloque de "hardening"
--      (DROP dinámico de políticas heredadas + CREATE canónico).
--   3) En settle_wompi_order, tras el INSERT ... ON CONFLICT DO NOTHING
--      sobre public.pagos, si la fila no se insertó (carrera de
--      condiciones) ahora se recupera el pago ya existente por
--      wompi_transaction_id, en vez de devolver payment_id = null.

create extension if not exists pgcrypto;

-- Customer authentication link. Existing customer data is preserved.
alter table public.customers add column if not exists auth_user_id uuid;
create unique index if not exists customers_auth_user_id_uidx
  on public.customers(auth_user_id) where auth_user_id is not null;

-- Admin allow-list used by server endpoints and authenticated admin policies.
create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Lead workflow metadata; original lead columns remain unchanged.
alter table public.leads add column if not exists status text not null default 'pending';
alter table public.leads add column if not exists reviewed_at timestamptz;
alter table public.leads add column if not exists reviewed_by uuid;
create index if not exists leads_status_created_idx
  on public.leads(status, created_at desc);

-- Order links needed for financing installment checkout. Keep canonical order columns
-- from kuota-orders-schema.sql (total_amount, shipping_fee, etc.).
alter table public.orders add column if not exists customer_id uuid references public.customers(id);
alter table public.orders add column if not exists financiacion_id uuid references public.financiaciones(id);
alter table public.orders add column if not exists cuota_id uuid references public.cuotas(id);
alter table public.orders add column if not exists order_type text not null default 'contado';
alter table public.orders add column if not exists updated_at timestamptz not null default now();
alter table public.orders add column if not exists shipping_data jsonb;
alter table public.orders add column if not exists domestic_data jsonb;
alter table public.orders add column if not exists customer_email text;
create unique index if not exists orders_reference_uidx on public.orders(reference);
create unique index if not exists orders_wompi_tx_uidx
  on public.orders(wompi_transaction_id) where wompi_transaction_id is not null;

-- Financing metadata required to track the initial separately from installments.
alter table public.financiaciones add column if not exists product_id uuid references public.products(id);
alter table public.financiaciones add column if not exists variant_id uuid references public.variants(id);
alter table public.financiaciones add column if not exists color text;
alter table public.financiaciones add column if not exists list_price numeric(14,2);
alter table public.financiaciones add column if not exists initial_amount numeric(14,2) not null default 0;
alter table public.financiaciones add column if not exists initial_status text not null default 'pendiente';
alter table public.financiaciones add column if not exists initial_payment_method text;
alter table public.financiaciones add column if not exists initial_received_at timestamptz;
alter table public.financiaciones add column if not exists initial_reference text;
alter table public.financiaciones add column if not exists fecha_activacion date;
alter table public.financiaciones add column if not exists proxima_cuota_id uuid references public.cuotas(id);
alter table public.financiaciones add column if not exists created_by uuid;
alter table public.financiaciones add column if not exists updated_at timestamptz not null default now();
create index if not exists financiaciones_customer_status_idx
  on public.financiaciones(customer_id,status,created_at desc);

-- Canonical installment names are numero_cuota / fecha_vencimiento / valor / estado / paid_at.
alter table public.cuotas add column if not exists fecha_pago timestamptz;
create unique index if not exists cuotas_financiacion_numero_uidx
  on public.cuotas(financiacion_id,numero_cuota);
create index if not exists cuotas_financiacion_fecha_idx
  on public.cuotas(financiacion_id,fecha_vencimiento);

-- Initial payment is cuota_id NULL. Reference is an idempotency/business reference.
alter table public.pagos add column if not exists referencia text;
alter table public.pagos add column if not exists created_by uuid;
create unique index if not exists pagos_referencia_uidx
  on public.pagos(referencia) where referencia is not null;
create unique index if not exists pagos_wompi_tx_uidx
  on public.pagos(wompi_transaction_id) where wompi_transaction_id is not null;

-- Private Plan C bucket. Device images remain public as defined by the supplied schema.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'trade-in-photos','trade-in-photos',false,8388608,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update set
  public=false,
  file_size_limit=8388608,
  allowed_mime_types=excluded.allowed_mime_types;

-- RLS: enable now; policies themselves are created once, further below,
-- in the hardening block (after any legacy policies are dropped).
alter table public.customers enable row level security;
alter table public.admin_users enable row level security;
alter table public.orders enable row level security;
alter table public.financiaciones enable row level security;
alter table public.cuotas enable row level security;
alter table public.pagos enable row level security;
alter table public.leads enable row level security;

-- Atomic Plan B approval. API performs authentication/authorization; this function performs
-- all database mutations in one transaction and uses the canonical tables.
create or replace function public.approve_plan_b(
  p_lead_id uuid,
  p_initial_payment_method text,
  p_initial_reference text default null,
  p_admin_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_variant public.variants%rowtype;
  v_product public.products%rowtype;
  v_plan public.planb_plans%rowtype;
  v_fin public.financiaciones%rowtype;
  v_initial numeric(14,2);
  v_financed numeric(14,2);
  v_start date;
  v_due date;
  v_initial_ref text;
  i integer;
begin
  if nullif(trim(p_initial_payment_method),'') is null then
    raise exception 'LEAD_AND_INITIAL_METHOD_REQUIRED';
  end if;

  select * into v_lead from public.leads where id=p_lead_id for update;
  if not found then raise exception 'LEAD_NOT_FOUND'; end if;
  if v_lead.lead_type <> 'plan_b' then raise exception 'NOT_PLAN_B'; end if;
  if v_lead.customer_id is null then raise exception 'LEAD_CUSTOMER_REQUIRED'; end if;
  if coalesce(v_lead.status,'pending') = 'approved' then raise exception 'LEAD_ALREADY_APPROVED'; end if;

  if nullif(v_lead.payload->>'variant_id','') is null or nullif(v_lead.payload->>'plan_id','') is null then raise exception 'LEAD_PRODUCT_PLAN_REQUIRED'; end if;

  select v.* into v_variant
  from public.variants v
  where v.id = (v_lead.payload->>'variant_id')::uuid and v.active=true
  for update;
  if not found then raise exception 'VARIANT_NOT_FOUND'; end if;

  select p.* into v_product
  from public.products p
  where p.id=v_variant.product_id and p.active=true;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;

  select pb.* into v_plan
  from public.planb_plans pb
  where pb.id=(v_lead.payload->>'plan_id')::uuid and pb.active=true;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;

  if v_plan.category <> v_product.category
     or v_plan.model <> v_product.model
     or v_plan.storage <> v_variant.storage then
    raise exception 'PLAN_EXACT_MATCH_FAILED';
  end if;

  v_initial := round(v_plan.inicial,2);
  v_financed := greatest(0, round(v_variant.price - v_initial,2));
  v_start := (now() at time zone 'America/Bogota')::date;
  v_initial_ref := coalesce(nullif(trim(p_initial_reference),''),'INIT-'||gen_random_uuid()::text);

  if extract(day from v_start) < 2 then
    v_due := make_date(extract(year from v_start)::int,extract(month from v_start)::int,2);
  elsif extract(day from v_start) < 17 then
    v_due := make_date(extract(year from v_start)::int,extract(month from v_start)::int,17);
  else
    v_due := (date_trunc('month',v_start)::date + interval '1 month')::date + 1;
  end if;

  insert into public.financiaciones(
    customer_id,product_model,storage,category,channel,financed_amount,total_cuotas,cuota_value,
    saldo_pendiente,status,start_date,product_id,variant_id,color,list_price,initial_amount,
    initial_status,initial_payment_method,initial_received_at,initial_reference,fecha_activacion,created_by,updated_at
  ) values (
    v_lead.customer_id,v_product.model,v_variant.storage,v_product.category,'plan_b',v_financed,14,v_plan.cuota,
    v_financed,case when v_financed=0 then 'pagada' else 'activa' end,v_start,v_product.id,v_variant.id,
    nullif(v_lead.payload->>'color',''),v_variant.price,v_initial,'recibida',p_initial_payment_method,
    now(),v_initial_ref,v_start,p_admin_user_id,now()
  ) returning * into v_fin;

  insert into public.pagos(financiacion_id,cuota_id,monto,metodo,wompi_transaction_id,paid_at,referencia,created_by)
  values(v_fin.id,null,v_initial,p_initial_payment_method,null,now(),
         v_initial_ref,p_admin_user_id);

  for i in 1..14 loop
    insert into public.cuotas(financiacion_id,numero_cuota,fecha_vencimiento,valor,estado,paid_at,created_at)
    values(v_fin.id,i,v_due,v_plan.cuota,'pendiente',null,now());
    if i < 14 then
      if extract(day from v_due)=2 then
        v_due := make_date(extract(year from v_due)::int,extract(month from v_due)::int,17);
      else
        v_due := (date_trunc('month',v_due)::date + interval '1 month')::date + 1;
      end if;
    end if;
  end loop;

  update public.leads
    set status='approved',reviewed_at=now(),reviewed_by=p_admin_user_id
    where id=p_lead_id;

  return v_fin.id;
end;
$$;

revoke all on function public.approve_plan_b(uuid,text,text,uuid) from public;
revoke all on function public.approve_plan_b(uuid,text,text,uuid) from anon;
grant execute on function public.approve_plan_b(uuid,text,text,uuid) to service_role;


-- Atomic manual payment registration. No partial payment state is allowed.
create or replace function public.register_manual_payment(
  p_cuota_id uuid, p_metodo text, p_referencia text default null, p_admin_user_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_cuota public.cuotas%rowtype; v_pago public.pagos%rowtype; v_now timestamptz:=now(); v_ref text; v_summary jsonb;
begin
  if nullif(trim(p_metodo),'') is null then raise exception 'METHOD_REQUIRED'; end if;
  select * into v_cuota from public.cuotas where id=p_cuota_id for update;
  if not found then raise exception 'CUOTA_NOT_FOUND'; end if;
  if v_cuota.estado='pagada' then raise exception 'ALREADY_PAID'; end if;
  v_ref:=nullif(trim(p_referencia),'');
  insert into public.pagos(financiacion_id,cuota_id,monto,metodo,paid_at,referencia,created_by)
    values(v_cuota.financiacion_id,v_cuota.id,v_cuota.valor,p_metodo,v_now,v_ref,p_admin_user_id) returning * into v_pago;
  update public.cuotas set estado='pagada',paid_at=v_now,fecha_pago=v_now where id=v_cuota.id;
  update public.financiaciones f set saldo_pendiente=greatest(0,(select coalesce(sum(c.valor),0) from public.cuotas c where c.financiacion_id=f.id and c.estado<>'pagada')),
    status=case when (select count(*) from public.cuotas c where c.financiacion_id=f.id and c.estado<>'pagada')=0 then 'pagada'
                when exists(select 1 from public.cuotas c where c.financiacion_id=f.id and c.estado='vencida') then 'mora' else 'activa' end,
    proxima_cuota_id=(select c.id from public.cuotas c where c.financiacion_id=f.id and c.estado<>'pagada' order by c.fecha_vencimiento,c.numero_cuota limit 1),updated_at=v_now
    where f.id=v_cuota.financiacion_id;
  return jsonb_build_object('id',v_pago.id,'cuota_id',v_pago.cuota_id,'monto',v_pago.monto,'metodo',v_pago.metodo,'referencia',v_pago.referencia,'paid_at',v_pago.paid_at);
end; $$;
revoke all on function public.register_manual_payment(uuid,text,text,uuid) from public,anon;
grant execute on function public.register_manual_payment(uuid,text,text,uuid) to service_role;

-- Harden legacy RLS policies from the supplied schemas. Public lead/customer inserts are
-- intentionally removed: public writes go through server endpoints using service_role.
-- This is the single place where table-level SELECT policies are created (no duplicate
-- static block exists elsewhere in this migration).
do $$
declare r record;
begin
  for r in select schemaname,tablename,policyname from pg_policies
    where schemaname='public' and tablename in ('customers','leads','orders','financiaciones','cuotas','pagos','admin_users')
  loop
    execute format('drop policy if exists %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  end loop;
end $$;

create policy customers_self_select on public.customers for select to authenticated using (auth.uid()=auth_user_id);
create policy admin_users_self_select on public.admin_users for select to authenticated using (auth.uid()=auth_user_id);
create policy financing_customer_select on public.financiaciones for select to authenticated using (exists(select 1 from public.customers c where c.id=customer_id and c.auth_user_id=auth.uid()));
create policy cuotas_customer_select on public.cuotas for select to authenticated using (exists(select 1 from public.financiaciones f join public.customers c on c.id=f.customer_id where f.id=financiacion_id and c.auth_user_id=auth.uid()));
create policy pagos_customer_select on public.pagos for select to authenticated using (exists(select 1 from public.financiaciones f join public.customers c on c.id=f.customer_id where f.id=financiacion_id and c.auth_user_id=auth.uid()));
create policy orders_customer_select on public.orders for select to authenticated using (exists(select 1 from public.customers c where c.id=customer_id and c.auth_user_id=auth.uid()));

-- Remove any legacy public storage policy for the private trade-in bucket, regardless of its name.
do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname='storage' and tablename='objects'
    and (coalesce(qual,'') like '%trade-in-photos%' or coalesce(with_check,'') like '%trade-in-photos%')
  loop execute format('drop policy if exists %I on storage.objects',r.policyname); end loop;
end $$;

create policy trade_in_private_read on storage.objects for select to authenticated using (
  bucket_id='trade-in-photos' and exists(select 1 from public.admin_users a where a.auth_user_id=auth.uid() and a.active=true)
);

-- Link sales to the originating order so Wompi APPROVED can be settled idempotently.
alter table public.sales add column if not exists order_id uuid references public.orders(id);
create unique index if not exists sales_order_uidx on public.sales(order_id) where order_id is not null;

-- Atomic Wompi order settlement. This is the ONLY settlement function: it handles both
-- installment payments (cuota_id present) and one-off "contado" sales (cuota_id null),
-- so no separate/duplicate settlement path is left for webhooks to accidentally call.
create or replace function public.settle_wompi_order(
  p_order_id uuid, p_transaction_id text, p_reference text, p_paid_at timestamptz default now()
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_order public.orders%rowtype;
  v_cuota public.cuotas%rowtype;
  v_pago public.pagos%rowtype;
  v_cost numeric(14,2):=0;
  v_sale_id uuid;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status='paid' and v_order.wompi_transaction_id=p_transaction_id then
    return jsonb_build_object('idempotent',true);
  end if;
  update public.orders set status='paid',wompi_transaction_id=p_transaction_id,paid_at=p_paid_at,updated_at=now() where id=v_order.id;

  if v_order.cuota_id is not null then
    select * into v_cuota from public.cuotas where id=v_order.cuota_id for update;
    if not found then raise exception 'CUOTA_NOT_FOUND'; end if;
    if v_cuota.estado<>'pagada' then
      insert into public.pagos(financiacion_id,cuota_id,monto,metodo,wompi_transaction_id,paid_at,referencia)
        values(v_cuota.financiacion_id,v_cuota.id,v_cuota.valor,'wompi',p_transaction_id,p_paid_at,p_reference)
        on conflict (wompi_transaction_id) where wompi_transaction_id is not null do nothing returning * into v_pago;
      -- ON CONFLICT DO NOTHING skips the INSERT on a race (e.g. duplicate webhook
      -- delivery), which previously left v_pago empty and payment_id = null in the
      -- response. Recover the already-existing row instead so callers always get
      -- a real payment_id.
      if v_pago.id is null then
        select * into v_pago from public.pagos where wompi_transaction_id=p_transaction_id;
      end if;
      update public.cuotas set estado='pagada',paid_at=p_paid_at,fecha_pago=p_paid_at where id=v_cuota.id;
      update public.financiaciones f set saldo_pendiente=greatest(0,(select coalesce(sum(c.valor),0) from public.cuotas c where c.financiacion_id=f.id and c.estado<>'pagada')),
        status=case when (select count(*) from public.cuotas c where c.financiacion_id=f.id and c.estado<>'pagada')=0 then 'pagada'
                    when exists(select 1 from public.cuotas c where c.financiacion_id=f.id and c.estado='vencida') then 'mora' else 'activa' end,
        proxima_cuota_id=(select c.id from public.cuotas c where c.financiacion_id=f.id and c.estado<>'pagada' order by c.fecha_vencimiento,c.numero_cuota limit 1),updated_at=now()
        where f.id=v_cuota.financiacion_id;
    else
      select * into v_pago from public.pagos where cuota_id=v_cuota.id order by paid_at desc limit 1;
    end if;
  else
    -- Counted sale: record product price/cost once. Financing installment orders are not sales.
    if coalesce(v_order.order_type,'contado')='contado' then
      select coalesce(vc.cost,0) into v_cost from public.variant_costs vc where vc.variant_id=v_order.variant_id;
      insert into public.sales(order_id,sold_at,product_model,storage,category,channel,sale_price,cost_price,customer_id,notes)
        values(v_order.id,p_paid_at,v_order.product_model,v_order.storage,v_order.category,'wompi',v_order.product_price,v_cost,v_order.customer_id,'Wompi ref '||p_reference)
        on conflict (order_id) where order_id is not null do nothing returning id into v_sale_id;
      if v_sale_id is null then
        select id into v_sale_id from public.sales where order_id=v_order.id;
      end if;
    end if;
  end if;
  return jsonb_build_object('settled',true,'installment',v_order.cuota_id is not null,'sale_id',v_sale_id,'payment_id',v_pago.id);
end; $$;
revoke all on function public.settle_wompi_order(uuid,text,text,timestamptz) from public,anon;
grant execute on function public.settle_wompi_order(uuid,text,text,timestamptz) to service_role;

-- ======================= 06_precios_admin.sql =======================
-- KUOTA 002: historial de cambios de precios (solo backend con service role)
create table if not exists public.price_changes (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid references public.variants(id) on delete set null,
  changed_by uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
alter table public.price_changes enable row level security;
-- Sin políticas: anon y authenticated no tienen acceso; el backend usa service_role.
revoke all on public.price_changes from anon, authenticated;

-- ======================= 07_solicitudes_crm.sql =======================
-- KUOTA 003: CRM de solicitudes (en espera -> aprobada/rechazada -> pasos con fotos -> finalizada/cartera)
alter table public.leads drop constraint if exists leads_lead_type_check;
alter table public.leads add constraint leads_lead_type_check check (lead_type in ('plan_a','plan_b','plan_c','envio_nacional'));
alter table public.leads add column if not exists stage text not null default 'en_espera';
alter table public.leads drop constraint if exists leads_stage_check;
alter table public.leads add constraint leads_stage_check check (stage in ('en_espera','rechazada','en_proceso','finalizada','cartera'));
alter table public.leads add column if not exists decision jsonb;
alter table public.leads add column if not exists entity text;
alter table public.leads add column if not exists steps jsonb not null default '{}'::jsonb;
alter table public.leads add column if not exists closing jsonb;
alter table public.leads add column if not exists finalized_at timestamptz;
alter table public.leads add column if not exists updated_at timestamptz not null default now();
create index if not exists leads_type_stage_idx on public.leads (lead_type, stage, created_at desc);

create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  action text not null,
  actor uuid,
  data jsonb,
  created_at timestamptz not null default now()
);
alter table public.lead_events enable row level security;
revoke all on public.lead_events from anon, authenticated;
alter table public.leads enable row level security;

-- Bucket PRIVADO para las fotos de evidencia del seguimiento (solo backend con service_role)
insert into storage.buckets (id, name, public) values ('crm-evidence', 'crm-evidence', false)
on conflict (id) do update set public = false;

-- ======================= 08_informes.sql =======================
-- KUOTA 004: parámetros privados de informes (+ asegura Addi al 25%)
create table if not exists public.report_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.report_config enable row level security;
revoke all on public.report_config from anon, authenticated;
insert into public.report_config (key, value) values
  ('credit_net_pct', '0.05'::jsonb),            -- a KUOTA le queda: precio venta + 5% - proveedor
  ('reportados_discount_pct', '0.10'::jsonb)    -- reportados: valor crédito - 10% - proveedor
on conflict (key) do nothing;

-- Recargo que ve el cliente en la web: Addi 25% (ya viene así en 01_kuota-schema.sql). Si en algún momento
-- se cambió a 15%, esta línea lo devuelve a 25%:
update public.settings
set value = (select jsonb_agg(case when e->>'key' = 'addi' then jsonb_set(e, '{pct}', '0.25'::jsonb) else e end) from jsonb_array_elements(value) e)
where key = 'entities';

-- ======================= 09_retoma_cartera.sql =======================
-- KUOTA 005: Retoma (equipos recibidos), valor crédito por plan, cartera con bloqueo y paz y salvo
alter table public.planb_plans add column if not exists valor_credito numeric(14,2);   -- precio del equipo a crédito (Reportados)

-- valor_credito es información comercial privada: el público (anon/authenticated) solo puede leer las demás columnas del plan.
revoke select on public.planb_plans from anon, authenticated;
grant select (active, category, created_at, cuota, id, inicial, model, storage) on public.planb_plans to anon, authenticated;

create table if not exists public.equipos_recibidos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.leads(id) on delete cascade,
  variant_id uuid references public.variants(id) on delete set null,
  model text not null, storage text, category text,
  imei text,
  valor_recibido numeric(14,2) not null check (valor_recibido > 0),
  precio_contado numeric(14,2), valor_credito numeric(14,2),
  status text not null default 'en_inventario' check (status in ('en_inventario','vendido')),
  sold_at timestamptz, sold_by uuid,
  created_at timestamptz not null default now()
);
alter table public.equipos_recibidos enable row level security;
revoke all on public.equipos_recibidos from anon, authenticated;

alter table public.financiaciones add column if not exists lead_id uuid references public.leads(id) on delete set null;
alter table public.financiaciones add column if not exists imei text;
alter table public.financiaciones add column if not exists lock_state text not null default 'activo';
alter table public.financiaciones drop constraint if exists financiaciones_lock_state_check;
alter table public.financiaciones add constraint financiaciones_lock_state_check check (lock_state in ('activo','bloqueado'));
alter table public.financiaciones add column if not exists paz_y_salvo_at timestamptz;
create unique index if not exists financiaciones_lead_uidx on public.financiaciones(lead_id) where lead_id is not null;

create table if not exists public.lock_events (
  id uuid primary key default gen_random_uuid(),
  financiacion_id uuid not null references public.financiaciones(id) on delete cascade,
  action text not null check (action in ('bloquear','desbloquear')),
  reason text not null,
  evidence_path text,          -- obligatoria al desbloquear (bucket privado crm-evidence)
  actor uuid,
  created_at timestamptz not null default now()
);
alter table public.lock_events enable row level security;
revoke all on public.lock_events from anon, authenticated;
