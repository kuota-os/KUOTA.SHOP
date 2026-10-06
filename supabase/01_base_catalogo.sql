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
