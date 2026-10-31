-- Schood AI: notification preferences a person sets for themselves (Settings →
-- Notifications, core/notify-prefs). Additive to 20261030100000_schood_ai_core.sql.
--   preferred_hour: the local hour they like messages (null: any time); areas
--                   that schedule sends (daily briefs, engage) aim for it;
--   delivery:       where they want them: telegram, web (the in-app inbox), or both;
--   muted:          notification kinds they opted out of ("engage.winback"), or a
--                   whole area ("engage"); ai_notify refuses those with reason
--                   'muted' (retry_at is tomorrow's first allowed moment, so a
--                   queue that retries drops the message once it is stale).
begin;

alter table public.ai_notify_prefs add column if not exists preferred_hour smallint check (preferred_hour is null or preferred_hour between 0 and 23);
alter table public.ai_notify_prefs add column if not exists delivery text[] not null default array['telegram', 'web']::text[] check (delivery <@ array['telegram', 'web']::text[]);
alter table public.ai_notify_prefs add column if not exists muted text[] not null default '{}'::text[] check (cardinality(muted) <= 50);

create or replace function public.ai_notify(p_user uuid, p_channel text, p_take boolean, p_now timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  pref public.ai_notify_prefs;
  local_time timestamp;
  local_hour integer;
  quiet boolean;
  d public.ai_notify_daily;
  next_ok timestamp;
begin
  if p_channel is null or p_channel !~ '^[a-z][a-z0-9_.-]{1,40}$' then raise exception 'invalid_channel' using errcode = '22023'; end if;
  select * into pref from public.ai_notify_prefs where user_id = p_user;
  if not found then pref.time_zone := 'Asia/Tashkent'; pref.quiet_start := 22; pref.quiet_end := 8; pref.daily_limit := 2; pref.muted := '{}'; end if;
  local_time := p_now at time zone pref.time_zone;
  local_hour := extract(hour from local_time)::integer;
  if p_channel = any(pref.muted) or split_part(p_channel, '.', 1) = any(pref.muted) then
    next_ok := date_trunc('day', local_time) + interval '1 day' + make_interval(hours => pref.quiet_end::integer);
    return jsonb_build_object('allowed', false, 'reason', 'muted', 'retry_at', next_ok at time zone pref.time_zone);
  end if;
  quiet := case when pref.quiet_start = pref.quiet_end then false
    when pref.quiet_start > pref.quiet_end then local_hour >= pref.quiet_start or local_hour < pref.quiet_end
    else local_hour >= pref.quiet_start and local_hour < pref.quiet_end end;
  if quiet then
    next_ok := date_trunc('day', local_time) + make_interval(hours => pref.quiet_end::integer);
    if next_ok <= local_time then next_ok := next_ok + interval '1 day'; end if;
    return jsonb_build_object('allowed', false, 'reason', 'quiet_hours', 'retry_at', next_ok at time zone pref.time_zone);
  end if;
  insert into public.ai_notify_daily (user_id, day) values (p_user, local_time::date) on conflict do nothing;
  select * into d from public.ai_notify_daily where user_id = p_user and day = local_time::date for update;
  if d.sent >= pref.daily_limit then
    next_ok := date_trunc('day', local_time) + interval '1 day' + make_interval(hours => pref.quiet_end::integer);
    return jsonb_build_object('allowed', false, 'reason', 'daily_limit', 'retry_at', next_ok at time zone pref.time_zone);
  end if;
  if p_take then
    update public.ai_notify_daily set sent = sent + 1, channels = channels || p_channel where user_id = p_user and day = local_time::date;
  end if;
  return jsonb_build_object('allowed', true, 'remaining', pref.daily_limit - d.sent - case when p_take then 1 else 0 end);
end $$;

commit;
