-- Usage counters for plan limits (monthly reset)

create table if not exists public.usage_counters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  capability_key text not null,
  period_start date not null,
  period_end date not null,
  total integer not null,
  remaining integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, product_id, capability_key, period_start)
);

create index if not exists usage_counters_tenant_product_idx on public.usage_counters(tenant_id, product_id);
create index if not exists usage_counters_period_idx on public.usage_counters(period_start, period_end);

create trigger usage_counters_updated_at
before update on public.usage_counters
for each row execute procedure public.handle_user_updated_at();

alter table public.usage_counters enable row level security;

create policy "Usage counters view by tenant membership"
on public.usage_counters
for select
using (
  exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = usage_counters.tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

-- Atomic consumption for a period-based counter.
create or replace function public.consume_usage_counter(
  p_tenant_id uuid,
  p_product_id uuid,
  p_capability_key text,
  p_period_start date,
  p_period_end date,
  p_amount integer,
  p_total integer
)
returns table (allowed boolean, remaining integer, total integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  row_id uuid;
  row_remaining integer;
  row_total integer;
begin
  if p_amount is null or p_amount <= 0 then
    return query select false, 0, 0;
    return;
  end if;

  select id, remaining, total
    into row_id, row_remaining, row_total
  from public.usage_counters
  where tenant_id = p_tenant_id
    and product_id = p_product_id
    and capability_key = p_capability_key
    and period_start = p_period_start
  for update;

  if not found then
    insert into public.usage_counters (
      tenant_id, product_id, capability_key, period_start, period_end, total, remaining
    ) values (
      p_tenant_id, p_product_id, p_capability_key, p_period_start, p_period_end, p_total, p_total
    )
    returning id, remaining, total into row_id, row_remaining, row_total;
  end if;

  if row_remaining < p_amount then
    return query select false, row_remaining, row_total;
    return;
  end if;

  update public.usage_counters
    set remaining = row_remaining - p_amount,
        updated_at = now()
  where id = row_id
  returning remaining, total into row_remaining, row_total;

  return query select true, row_remaining, row_total;
end;
$$;
