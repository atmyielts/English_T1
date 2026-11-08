-- Schood Company English: connect (in-app notifications, reminders, public API,
-- webhooks, HRIS import, white label, privacy tools).
-- Additive and idempotent. Same lockdown as the core: RLS on, no anon/authenticated
-- access, only the `company` Edge Function (service role) reads and writes.
-- No table here holds a user_id: rows name a member and go when the member row is
-- deleted (account closure deletes it by user_id). Webhook payloads carry ids and
-- levels only, never a name or an address, so nothing here needs its own scrubbing.
-- Nothing in this file contacts anyone: Telegram, email and webhooks each have an
-- environment switch in the function, off by default.

-- One person's in-app notices. A notice is unique per person and key, so generating
-- the same event twice is harmless. Telegram reads the same rows (push_*).
create table if not exists public.company_notices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 60),
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 200),
  params jsonb not null default '{}'::jsonb check (jsonb_typeof(params) = 'object'),
  -- A path inside the app, never another site.
  link text check (link is null or (char_length(link) <= 300 and link like '/%' and link not like '//%')),
  read_at timestamptz,
  -- Null: not considered for Telegram yet. 'sending' is held for one run only.
  push_state text check (push_state is null or push_state in ('sending','sent','skipped','failed')),
  push_reason text check (push_reason is null or char_length(push_reason) <= 60),
  pushed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists company_notices_key_uq on public.company_notices (member_id, dedupe_key);
create index if not exists company_notices_member_idx on public.company_notices (member_id, created_at desc);
create index if not exists company_notices_unread_idx on public.company_notices (member_id) where read_at is null;
create index if not exists company_notices_push_idx on public.company_notices (org_id, created_at) where push_state is null;
create index if not exists company_notices_pushed_idx on public.company_notices (member_id, pushed_at) where push_state = 'sent';

-- One row per workspace: its reminder rules, the remembered import mapping and the job's cursors.
create table if not exists public.company_connect_settings (
  org_id uuid primary key references public.company_orgs(id) on delete cascade,
  telegram_enabled boolean not null default false,
  email_enabled boolean not null default false,
  -- Tashkent hours; no Telegram from quiet_start until quiet_end.
  quiet_start smallint not null default 21 check (quiet_start between 0 and 23),
  quiet_end smallint not null default 9 check (quiet_end between 0 and 23),
  daily_cap smallint not null default 3 check (daily_cap between 1 and 20),
  digest_enabled boolean not null default false,
  -- ISO weekday: 1 is Monday.
  digest_weekday smallint not null default 1 check (digest_weekday between 1 and 7),
  last_digest_week date,
  import_mapping jsonb not null default '{}'::jsonb check (jsonb_typeof(import_mapping) = 'object'),
  notices_swept_at timestamptz,
  events_swept_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One person's choice. Telegram stays off until they turn it on themselves.
create table if not exists public.company_connect_prefs (
  member_id uuid primary key references public.company_members(id) on delete cascade,
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  telegram_opt_in boolean not null default false,
  muted_kinds text[] not null default '{}'::text[],
  quiet_start smallint check (quiet_start is null or quiet_start between 0 and 23),
  quiet_end smallint check (quiet_end is null or quiet_end between 0 and 23),
  daily_cap smallint check (daily_cap is null or daily_cap between 1 and 20),
  locale text check (locale is null or locale in ('en','ru','uz')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_connect_prefs_org_idx on public.company_connect_prefs (org_id) where telegram_opt_in;

-- Public API keys. The key itself is shown once and stored only as sha256.
create table if not exists public.company_api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  key_hash text not null unique,
  key_prefix text not null check (char_length(key_prefix) <= 24),
  scope text not null default 'read' check (scope in ('read','write')),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists company_api_keys_org_idx on public.company_api_keys (org_id, created_at desc);

-- Where HR wants events sent. The signing secret has to stay readable to sign with
-- it (HMAC needs the value), so only this function's service role can read the table
-- and no route returns it after the moment it is made.
create table if not exists public.company_webhooks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  url text not null check (char_length(url) <= 500 and url like 'https://%'),
  secret text not null check (char_length(secret) between 24 and 120),
  events text[] not null default '{}'::text[],
  description text check (description is null or char_length(description) <= 200),
  active boolean not null default true,
  disabled_reason text check (disabled_reason is null or char_length(disabled_reason) <= 60),
  failure_count integer not null default 0 check (failure_count >= 0),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_webhooks_org_idx on public.company_webhooks (org_id);

-- The queue and the delivery log in one table. One event reaches one webhook at most once.
create table if not exists public.company_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  webhook_id uuid not null references public.company_webhooks(id) on delete cascade,
  event text not null check (char_length(event) <= 60),
  event_id text not null check (char_length(event_id) <= 200),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','delivering','sent','dead')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  response_status integer,
  error text check (error is null or char_length(error) <= 60),
  is_test boolean not null default false,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists company_webhook_deliveries_event_uq on public.company_webhook_deliveries (webhook_id, event_id);
create index if not exists company_webhook_deliveries_queue_idx on public.company_webhook_deliveries (next_attempt_at) where status = 'queued';
create index if not exists company_webhook_deliveries_log_idx on public.company_webhook_deliveries (webhook_id, created_at desc);

-- White label. The logo is a small re-checked PNG or JPEG kept as a data URL, never SVG.
create table if not exists public.company_brand (
  org_id uuid primary key references public.company_orgs(id) on delete cascade,
  display_name text check (display_name is null or char_length(btrim(display_name)) between 2 and 120),
  brand_color text check (brand_color is null or brand_color ~ '^#[0-9a-f]{6}$'),
  logo_data_url text check (logo_data_url is null or (char_length(logo_data_url) <= 140000 and logo_data_url ~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$')),
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Fixed-window counters for API keys and public routes.
create table if not exists public.company_connect_hits (
  bucket text not null check (char_length(bucket) <= 160),
  window_start timestamptz not null,
  hits integer not null default 1,
  primary key (bucket, window_start)
);
create index if not exists company_connect_hits_window_idx on public.company_connect_hits (window_start);

do $$
declare
  t text;
begin
  foreach t in array array['company_notices','company_connect_settings','company_connect_prefs','company_api_keys','company_webhooks','company_webhook_deliveries','company_brand','company_connect_hits'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
  foreach t in array array['company_connect_settings','company_connect_prefs','company_webhooks','company_webhook_deliveries','company_brand'] loop
    if to_regprocedure('public.set_updated_at()') is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
    end if;
  end loop;
end
$$;

-- Counts one hit in the current window; false once p_limit is passed. Two requests at
-- the same moment each count, because the insert either creates or adds in one statement.
create or replace function public.company_connect_hit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window integer := greatest(coalesce(p_window_seconds, 60), 1);
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / v_window) * v_window);
  v_hits integer;
begin
  insert into public.company_connect_hits as h (bucket, window_start, hits) values (left(p_bucket, 160), v_start, 1)
  on conflict (bucket, window_start) do update set hits = h.hits + 1
  returning hits into v_hits;
  return v_hits <= greatest(p_limit, 0);
end;
$$;

-- Nightly tidy-up: what is kept and for how long is on the privacy page, so a change
-- here goes there too. Read notices 180 days, unread 365, delivery log 30, counters 2.
create or replace function public.company_connect_purge()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notices integer;
  v_deliveries integer;
  v_hits integer;
  v_stuck integer;
begin
  delete from public.company_notices
  where (read_at is not null and read_at < now() - interval '180 days') or created_at < now() - interval '365 days';
  get diagnostics v_notices = row_count;
  delete from public.company_webhook_deliveries where created_at < now() - interval '30 days' and status in ('sent','dead');
  get diagnostics v_deliveries = row_count;
  delete from public.company_connect_hits where window_start < now() - interval '2 days';
  get diagnostics v_hits = row_count;
  -- A run that died mid-send leaves 'sending' behind; it never went out, so it may be tried again.
  update public.company_notices set push_state = null where push_state = 'sending' and created_at < now() - interval '1 hour';
  get diagnostics v_stuck = row_count;
  return jsonb_build_object('notices', v_notices, 'deliveries', v_deliveries, 'hits', v_hits, 'stuck', v_stuck);
end;
$$;

-- Wakes the job route: new notices, digests and, only where their switches are on,
-- Telegram and webhook sending. Same pattern as invoke_english_reminders. Returns null
-- without pg_net or the secret, and nothing here can reach anyone but the function.
create or replace function public.company_connect_tick()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
  v_request_id bigint;
begin
  if to_regclass('public.internal_runtime_secrets') is null then return null; end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return null; end if;
  execute 'select secret from public.internal_runtime_secrets where key = $1 limit 1' into v_secret using 'company_connect_secret';
  if v_secret is null or length(trim(v_secret)) < 32 then
    raise warning 'company connect job skipped: worker secret is missing';
    return null;
  end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3)' into v_request_id
  using 'https://bbjawctnqrufvnesdsel.supabase.co/functions/v1/company/internal/connect/run',
    jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', v_secret),
    '{}'::jsonb;
  return v_request_id;
end;
$$;

revoke all on function public.company_connect_hit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.company_connect_purge() from public, anon, authenticated;
revoke all on function public.company_connect_tick() from public, anon, authenticated;
grant execute on function public.company_connect_hit(text, integer, integer) to service_role;
grant execute on function public.company_connect_purge() to service_role;

do $$
begin
  if to_regclass('public.internal_runtime_secrets') is not null then
    execute $sql$
      insert into public.internal_runtime_secrets (key, secret)
      values ('company_connect_secret', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
      on conflict (key) do nothing
    $sql$;
  end if;
end
$$;

-- Where pg_cron is installed: the job every ten minutes, the tidy-up at 03:40 Tashkent (22:40 UTC).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'company-connect-tick') then
      perform cron.unschedule('company-connect-tick');
    end if;
    perform cron.schedule('company-connect-tick', '3-59/10 * * * *', 'select public.company_connect_tick()');
    if exists (select 1 from cron.job where jobname = 'company-connect-purge') then
      perform cron.unschedule('company-connect-purge');
    end if;
    perform cron.schedule('company-connect-purge', '40 22 * * *', 'select public.company_connect_purge()');
  end if;
end
$$;
