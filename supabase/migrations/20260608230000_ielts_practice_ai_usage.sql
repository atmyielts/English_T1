-- Per-user daily cap for IELTS Practice AI coaching (cost guardrail).
-- Distinct from the tenant/product entitlement usage_counters — this is a
-- simple per-learner daily counter that resets by calendar day.

create table if not exists public.ielts_practice_ai_usage (
  user_id    uuid not null references public.users(id) on delete cascade,
  usage_date date not null default current_date,
  count      integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.ielts_practice_ai_usage enable row level security;
-- Service-role only (the edge function consumes via SECURITY DEFINER rpc).
revoke all on table public.ielts_practice_ai_usage from anon, authenticated;

-- Atomically increment today's count; if it would exceed the limit, roll the
-- increment back and report not-allowed. Returns the post-call state.
create or replace function public.consume_ielts_practice_ai(
  p_user_id uuid,
  p_limit integer,
  p_amount integer default 1
) returns table(allowed boolean, used integer, day_limit integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.ielts_practice_ai_usage (user_id, usage_date, count, updated_at)
    values (p_user_id, current_date, p_amount, now())
    on conflict (user_id, usage_date)
    do update set count = public.ielts_practice_ai_usage.count + p_amount, updated_at = now()
    returning count into v_count;

  if v_count > p_limit then
    update public.ielts_practice_ai_usage
      set count = count - p_amount, updated_at = now()
      where user_id = p_user_id and usage_date = current_date;
    return query select false, greatest(0, v_count - p_amount), p_limit;
  else
    return query select true, v_count, p_limit;
  end if;
end;
$$;

revoke all on function public.consume_ielts_practice_ai(uuid, integer, integer) from public;
