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
