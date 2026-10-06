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
