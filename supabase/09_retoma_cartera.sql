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
