\set ON_ERROR_STOP on

-- Run against production before applying 20260812130000. Abort the release if
-- any invalid or duplicate rows are returned, if active writes cannot tolerate
-- a five-second DDL lock attempt, or if table sizes exceed the reviewed window.
select 'telegram_user_preferences' as table_name, count(*) as rows from public.telegram_user_preferences
union all select 'platform_notifications', count(*) from public.platform_notifications
union all select 'academy_notifications', count(*) from public.academy_notifications
union all select 'telegram_link_tokens', count(*) from public.telegram_link_tokens;

select status, count(*)
from public.platform_notifications
where status not in ('pending','queued','processing','sent','failed','skipped','suppressed')
group by status;

select status, count(*)
from public.academy_notifications
where status not in ('queued','sent','failed','skipped','suppressed')
group by status;

-- Preference-migration preview. These counts are expected to become explicit
-- Telegram/study-habit opt-outs; review them before the one-way backfill.
select
  count(*) filter (where notifications_enabled = false) as legacy_global_opt_outs,
  count(*) filter (where digest_frequency = 'off') as legacy_digest_opt_outs,
  count(*) filter (
    where not exists (
      select 1 from pg_timezone_names tz
      where tz.name = telegram_user_preferences.timezone
    )
  ) as invalid_timezones
from public.telegram_user_preferences;

do $$
begin
  if exists (
    select 1 from public.platform_notifications
    where status not in ('pending','queued','processing','sent','failed','skipped','suppressed')
  ) then raise exception 'telegram_preflight_invalid_platform_notification_status'; end if;
  if exists (
    select 1 from public.academy_notifications
    where status not in ('queued','sent','failed','skipped','suppressed')
  ) then raise exception 'telegram_preflight_invalid_academy_notification_status'; end if;
end
$$;

select pid, usename, state, wait_event_type, wait_event, query_start, left(query, 200) as query
from pg_stat_activity
where datname = current_database() and pid <> pg_backend_pid() and state <> 'idle'
order by query_start;
