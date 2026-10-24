-- "Check my English" in @schoodonlinebot (telegram-public, english_check).
-- ============================================================================
-- One row per check a Telegram chat asked for. Only what the caps need is
-- kept: a salted hash of the chat id (never the raw id), the learner-local
-- (UTC+5) day, the outcome and the estimated band. The learner's text and the
-- AI's corrections are never stored.
--
-- Caps (enforced by english_tg_check_reserve, serialised per day):
--   * per chat: p_chat_limit checks a day (3 by default in the function code);
--   * global:   p_global_limit checks a day (ENGLISH_TG_CHECK_DAILY_LIMIT).
-- A check that failed (AI unavailable, invalid output) frees its slot; a
-- pending row older than five minutes (crashed function) stops counting.
-- Written and read only by edge functions (service role).
-- ============================================================================

create table if not exists public.english_tg_checks (
  id uuid primary key default gen_random_uuid(),
  chat_hash text not null check (chat_hash ~ '^[0-9a-f]{64}$'),
  check_date date not null,
  -- The Telegram update that asked for the check; a retried update reuses its row.
  update_id bigint,
  status text not null default 'pending' check (status in ('pending', 'ok', 'failed')),
  locale text check (locale is null or locale in ('en', 'ru', 'uz')),
  input_chars integer check (input_chars is null or (input_chars >= 0 and input_chars <= 4096)),
  cefr text check (cefr is null or cefr in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  corrections_count smallint check (corrections_count is null or corrections_count between 0 and 3),
  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 80),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create unique index if not exists english_tg_checks_update_unique
  on public.english_tg_checks (chat_hash, update_id)
  where update_id is not null;

create index if not exists english_tg_checks_chat_day_idx
  on public.english_tg_checks (chat_hash, check_date);

create index if not exists english_tg_checks_day_idx
  on public.english_tg_checks (check_date, status);

alter table public.english_tg_checks enable row level security;
revoke all on public.english_tg_checks from anon, authenticated;

-- Reserves one check for a chat on a day, or says which cap stopped it.
-- Returns {allowed, reason, id, chat_used, global_used}. A retried Telegram
-- update gets its own earlier row back instead of a second slot.
create or replace function public.english_tg_check_reserve(
  p_chat_hash text,
  p_check_date date,
  p_update_id bigint,
  p_chat_limit integer,
  p_global_limit integer,
  p_locale text,
  p_input_chars integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_chat_used integer;
  v_global_used integer;
  v_fresh timestamptz := now() - interval '5 minutes';
begin
  if p_chat_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid chat hash';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('english_tg_check:' || p_check_date::text, 0));

  if p_update_id is not null then
    select c.id into v_id
    from public.english_tg_checks c
    where c.chat_hash = p_chat_hash and c.update_id = p_update_id;
    if v_id is not null then
      update public.english_tg_checks
      set status = 'pending', created_at = now(), finished_at = null, failure_reason = null
      where id = v_id;
      return jsonb_build_object('allowed', true, 'reason', null, 'id', v_id, 'replay', true);
    end if;
  end if;

  select count(*) into v_chat_used
  from public.english_tg_checks c
  where c.chat_hash = p_chat_hash
    and c.check_date = p_check_date
    and (c.status = 'ok' or (c.status = 'pending' and c.created_at > v_fresh));
  if v_chat_used >= greatest(p_chat_limit, 0) then
    return jsonb_build_object('allowed', false, 'reason', 'chat_limit', 'chat_used', v_chat_used);
  end if;

  select count(*) into v_global_used
  from public.english_tg_checks c
  where c.check_date = p_check_date
    and (c.status = 'ok' or (c.status = 'pending' and c.created_at > v_fresh));
  if v_global_used >= greatest(p_global_limit, 0) then
    return jsonb_build_object('allowed', false, 'reason', 'global_limit', 'chat_used', v_chat_used, 'global_used', v_global_used);
  end if;

  insert into public.english_tg_checks (chat_hash, check_date, update_id, locale, input_chars)
  values (
    p_chat_hash,
    p_check_date,
    p_update_id,
    case when p_locale in ('en', 'ru', 'uz') then p_locale else null end,
    least(greatest(coalesce(p_input_chars, 0), 0), 4096)
  )
  returning id into v_id;

  return jsonb_build_object(
    'allowed', true,
    'reason', null,
    'id', v_id,
    'chat_used', v_chat_used + 1,
    'global_used', v_global_used + 1
  );
end;
$$;

revoke all on function public.english_tg_check_reserve(text, date, bigint, integer, integer, text, integer) from public, anon, authenticated;
grant execute on function public.english_tg_check_reserve(text, date, bigint, integer, integer, text, integer) to service_role;
