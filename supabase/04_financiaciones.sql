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
