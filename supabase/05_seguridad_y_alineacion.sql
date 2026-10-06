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
