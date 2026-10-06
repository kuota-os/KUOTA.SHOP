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
