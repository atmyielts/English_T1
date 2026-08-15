-- Atomic, server-only daily guardrail for the unified English AI Studio.
-- The table is intentionally not exposed to anon/authenticated clients.

create table if not exists public.english_ai_usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.english_ai_usage_daily enable row level security;

revoke all on table public.english_ai_usage_daily from public, anon, authenticated;
grant select, insert, update, delete on table public.english_ai_usage_daily to service_role;

create or replace function public.consume_english_ai_daily_quota(
  p_user_id uuid,
  p_limit integer,
  p_amount integer default 1
)
returns table (allowed boolean, remaining integer, total integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 500));
  v_amount integer := greatest(1, least(coalesce(p_amount, 1), 500));
  v_used integer;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  if v_amount > v_limit then
    select coalesce(d.request_count, 0)
      into v_used
      from public.english_ai_usage_daily d
     where d.user_id = p_user_id
       and d.usage_date = current_date;
    return query select false, greatest(v_limit - coalesce(v_used, 0), 0), v_limit;
    return;
  end if;

  insert into public.english_ai_usage_daily as daily (user_id, usage_date, request_count, updated_at)
  values (p_user_id, current_date, v_amount, now())
  on conflict (user_id, usage_date) do update
    set request_count = daily.request_count + excluded.request_count,
        updated_at = now()
    where daily.request_count + excluded.request_count <= v_limit
  returning request_count into v_used;

  if found then
    return query select true, greatest(v_limit - v_used, 0), v_limit;
    return;
  end if;

  select coalesce(d.request_count, 0)
    into v_used
    from public.english_ai_usage_daily d
   where d.user_id = p_user_id
     and d.usage_date = current_date;
  return query select false, greatest(v_limit - coalesce(v_used, 0), 0), v_limit;
end;
$$;

revoke all on function public.consume_english_ai_daily_quota(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_english_ai_daily_quota(uuid, integer, integer) to service_role;

comment on table public.english_ai_usage_daily is
  'Server-only UTC daily request counts for English AI cost and abuse protection.';
