-- Preserve local-day email caps across 00:00 UTC and serialize Telegram reservations
-- per person. Additive/idempotent; existing clients and in-flight sends still work.
create or replace function public.company_connect_day_hit(p_bucket text, p_limit integer, p_at timestamptz)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_start timestamptz := date_trunc('day', coalesce(p_at, now()) at time zone 'Asia/Tashkent') at time zone 'Asia/Tashkent';
  v_hits integer;
begin
  insert into public.company_connect_hits as h(bucket, window_start, hits)
  values (left(p_bucket,160), v_start, 1)
  on conflict(bucket,window_start) do update set hits=h.hits+1
  returning hits into v_hits;
  return v_hits <= greatest(coalesce(p_limit,0),0);
end;
$$;

create or replace function public.company_claim_push_notice(p_org uuid, p_member uuid, p_notice uuid, p_limit integer, p_at timestamptz)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_at timestamptz := coalesce(p_at,now());
  v_start timestamptz;
  v_count integer;
begin
  -- Two jobs sending different notices to one person must share the same budget.
  -- Holding the member row until this reservation commits makes check+claim atomic.
  perform 1 from public.company_members where id=p_member and org_id=p_org and status='active' for update;
  if not found then return false; end if;
  v_start := date_trunc('day',v_at at time zone 'Asia/Tashkent') at time zone 'Asia/Tashkent';
  select count(*) into v_count from public.company_notices
    where member_id=p_member and org_id=p_org
      and (push_state='sending' or (push_state='sent' and pushed_at >= v_start));
  if v_count >= greatest(coalesce(p_limit,0),0) then return false; end if;
  update public.company_notices set push_state='sending',pushed_at=v_at
    where id=p_notice and org_id=p_org and member_id=p_member and push_state is null;
  return found;
end;
$$;

revoke all on function public.company_connect_day_hit(text,integer,timestamptz) from public,anon,authenticated;
revoke all on function public.company_claim_push_notice(uuid,uuid,uuid,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.company_connect_day_hit(text,integer,timestamptz) to service_role;
grant execute on function public.company_claim_push_notice(uuid,uuid,uuid,integer,timestamptz) to service_role;
