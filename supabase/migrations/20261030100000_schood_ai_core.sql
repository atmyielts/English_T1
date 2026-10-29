-- Schood AI core (docs/product/44_SCHOOD_AI.md): workspaces and members, credits,
-- the provider-agnostic model registry, call log and caps, chat, specialists,
-- generation jobs, library pages, the Approve & run queue, reports and audit.
-- ============================================================================
-- Every table is read and written only by the schood-ai Edge Function with the
-- service role (Admission pattern): RLS is on and browsers get no policies.
-- Credits, balances and daily counters change only inside the SECURITY DEFINER
-- functions below, which lock rows in a fixed order (account, then member, then
-- counters); the service role itself cannot write them. The credit ledger is
-- append-only, and so are learning events. Feature areas add their own tables in
-- their own ranges (learner 2026103020*, teacher 2026103030*, centre 2026103040*,
-- pricing 2026103050*, coach engine 2026103060*, coach packs 2026103070*, engage 2026103080*).
-- ============================================================================
begin;

-- --- Service settings: one row ---------------------------------------------------
create table if not exists public.ai_settings (
  id smallint primary key default 1 check (id = 1),
  -- Global AI switch and per-feature switches ({"tutor": false, "material.generate": false}).
  ai_enabled boolean not null default true,
  features jsonb not null default '{}'::jsonb check (jsonb_typeof(features) = 'object' and pg_column_size(features) <= 16000),
  -- Daily call caps (Tashkent day) and an optional daily spend cap in USD.
  global_daily_calls integer not null default 1000 check (global_daily_calls between 0 and 10000000),
  user_daily_calls integer not null default 300 check (user_daily_calls between 0 and 100000),
  workspace_daily_calls integer not null default 5000 check (workspace_daily_calls between 0 and 10000000),
  global_daily_usd numeric(10, 2) check (global_daily_usd is null or global_daily_usd >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);
insert into public.ai_settings (id) values (1) on conflict (id) do nothing;

-- --- Workspaces --------------------------------------------------------------------
create table if not exists public.ai_workspaces (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('personal', 'centre')),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  -- Deleting the owner's account deletes their personal workspace. A centre's
  -- ownership must be handed over before its owner's account is deleted.
  owner_id uuid not null references public.users(id) on delete cascade,
  -- The Academy tenant a centre workspace mirrors (checked against Academy roles).
  academy_tenant_id uuid,
  -- Enterprise is a contract set by a Schood admin, not a Click product.
  contract_plan text check (contract_plan is null or contract_plan = 'enterprise'),
  contract_until timestamptz,
  -- Logo URL, colours and assistant name; house style; workspace switches and rules.
  branding jsonb not null default '{}'::jsonb check (jsonb_typeof(branding) = 'object' and pg_column_size(branding) <= 8000),
  house_style jsonb not null default '{}'::jsonb check (jsonb_typeof(house_style) = 'object' and pg_column_size(house_style) <= 16000),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 32000),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'centre' or (academy_tenant_id is null and contract_plan is null))
);
create unique index if not exists ai_workspaces_personal_owner_idx on public.ai_workspaces (owner_id) where kind = 'personal';
create unique index if not exists ai_workspaces_academy_tenant_idx on public.ai_workspaces (academy_tenant_id) where academy_tenant_id is not null;
create index if not exists ai_workspaces_owner_idx on public.ai_workspaces (owner_id);

create table if not exists public.ai_workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  role text not null check (role in ('admin', 'teacher', 'student', 'parent')),
  -- SHA-256 of the code; the code itself is shown once and never stored.
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  label text check (label is null or char_length(label) <= 120),
  max_uses integer not null default 1 check (max_uses between 1 and 1000),
  uses integer not null default 0 check (uses >= 0 and uses <= max_uses),
  expires_at timestamptz not null,
  created_by uuid references public.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ai_workspace_invites_workspace_idx on public.ai_workspace_invites (workspace_id, created_at desc);

create table if not exists public.ai_workspace_members (
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'teacher', 'student', 'parent')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  -- Monthly budget of pooled centre credits (Tashkent month); null means no limit.
  credit_budget integer check (credit_budget is null or credit_budget between 0 and 10000000),
  budget_period text check (budget_period is null or budget_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  budget_used integer not null default 0 check (budget_used >= 0),
  invite_id uuid references public.ai_workspace_invites(id) on delete set null,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists ai_workspace_members_user_idx on public.ai_workspace_members (user_id);

-- A personal workspace has exactly one member: its owner.
create or replace function public.ai_workspace_members_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare ws public.ai_workspaces;
begin
  select * into ws from public.ai_workspaces where id = new.workspace_id;
  if ws.kind = 'personal' and (new.user_id <> ws.owner_id or new.role <> 'owner') then
    raise exception 'personal_workspace_single_member' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists ai_workspace_members_guard on public.ai_workspace_members;
create trigger ai_workspace_members_guard before insert or update on public.ai_workspace_members
  for each row execute function public.ai_workspace_members_guard();

-- --- Credits ------------------------------------------------------------------------
-- The account of a workspace: a person's own credits live in their personal
-- workspace, a centre's pooled credits in the centre workspace. Plan credits are
-- granted per 30-day cycle while a plan is active and expire at the cycle's end;
-- pack credits (bought top-ups and admin grants) do not expire.
create table if not exists public.ai_credit_accounts (
  workspace_id uuid primary key references public.ai_workspaces(id) on delete cascade,
  plan_balance integer not null default 0 check (plan_balance >= 0),
  plan_grant integer not null default 0 check (plan_grant >= 0),
  plan_anchor timestamptz,
  plan_cycle integer check (plan_cycle is null or plan_cycle >= 0),
  plan_seen_at timestamptz,
  pack_balance integer not null default 0 check (pack_balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_credit_ledger (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  kind text not null check (kind in ('grant', 'expire', 'charge', 'refund', 'pack', 'adjust')),
  bucket text not null check (bucket in ('plan', 'pack')),
  delta integer not null check (delta <> 0),
  balance_after integer not null check (balance_after >= 0),
  credit_key text check (credit_key is null or credit_key ~ '^[a-z][a-z0-9_]{1,30}\.[a-z][a-z0-9_]{1,30}$'),
  -- Groups the rows of one charge (one per bucket) and its refund.
  charge_id uuid,
  -- Idempotency: request key for charges, cycle for grants, order id for packs.
  reference text check (reference is null or char_length(reference) between 1 and 200),
  created_at timestamptz not null default now(),
  check ((kind in ('charge', 'expire')) = (delta < 0)),
  check ((kind in ('charge', 'refund')) = (charge_id is not null))
);
create index if not exists ai_credit_ledger_workspace_idx on public.ai_credit_ledger (workspace_id, created_at desc);
create index if not exists ai_credit_ledger_user_idx on public.ai_credit_ledger (user_id, created_at desc) where user_id is not null;
create index if not exists ai_credit_ledger_charge_idx on public.ai_credit_ledger (charge_id) where charge_id is not null;
create unique index if not exists ai_credit_ledger_charge_reference_idx on public.ai_credit_ledger (workspace_id, reference, bucket) where kind = 'charge';
create unique index if not exists ai_credit_ledger_refund_idx on public.ai_credit_ledger (charge_id, bucket) where kind = 'refund';
create unique index if not exists ai_credit_ledger_grant_reference_idx on public.ai_credit_ledger (workspace_id, kind, reference) where kind in ('grant', 'expire', 'pack', 'adjust');

-- Append-only: rows are never changed or removed, except that deleting a person
-- clears their user_id and deleting a whole workspace removes its rows.
create or replace function public.ai_credit_ledger_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id is null and (to_jsonb(new) - 'user_id') = (to_jsonb(old) - 'user_id') then return new; end if;
    raise exception 'ai_credit_ledger is append-only' using errcode = '42501';
  end if;
  if exists (select 1 from public.ai_workspaces where id = old.workspace_id) then
    raise exception 'ai_credit_ledger is append-only' using errcode = '42501';
  end if;
  return old;
end $$;
drop trigger if exists ai_credit_ledger_guard on public.ai_credit_ledger;
create trigger ai_credit_ledger_guard before update or delete on public.ai_credit_ledger
  for each row execute function public.ai_credit_ledger_guard();

-- --- Model registry -----------------------------------------------------------------
create table if not exists public.ai_providers (
  key text primary key check (key ~ '^[a-z0-9][a-z0-9_-]{1,40}$'),
  adapter text not null check (adapter in ('openai_compatible', 'anthropic', 'google_gemini', 'cloudflare_workers_ai')),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  base_url text not null check (base_url ~ '^https://[^\s/@]+(/[^\s]*)?$' and char_length(base_url) <= 300),
  -- The Supabase secret holding the key. Keys are never stored here; well-known
  -- provider keys are pinned to their own hosts by the function (ai-core models.ts).
  api_key_env text not null check (
    api_key_env ~ '^(OPENROUTER|OPENAI|ANTHROPIC|GOOGLE_AI|GEMINI|GROQ|DEEPSEEK|MISTRAL|TOGETHER|FIREWORKS|XAI)_API_KEY$'
    or api_key_env = 'CLOUDFLARE_AI_API_TOKEN'
    or api_key_env ~ '^SCHOOD_AI_KEY_[A-Z0-9_]{1,40}$'
  ),
  extra_headers jsonb not null default '{}'::jsonb check (jsonb_typeof(extra_headers) = 'object' and pg_column_size(extra_headers) <= 4000),
  -- Non-secret adapter settings, for example Cloudflare's account_id.
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object' and pg_column_size(config) <= 4000),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

create table if not exists public.ai_models (
  key text primary key check (key ~ '^[a-z0-9][a-z0-9_.:/-]{2,120}$'),
  provider_key text not null references public.ai_providers(key) on update cascade,
  model_id text not null check (char_length(btrim(model_id)) between 1 and 160 and model_id <> 'openrouter/auto'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  capabilities text[] not null check (cardinality(capabilities) between 1 and 7 and capabilities <@ array['chat', 'stream', 'json', 'json_schema', 'vision', 'stt', 'tts']),
  context_window integer check (context_window is null or context_window > 0),
  max_output integer check (max_output is null or max_output > 0),
  input_usd_per_mtok numeric(12, 4) not null default 0 check (input_usd_per_mtok between 0 and 1000),
  output_usd_per_mtok numeric(12, 4) not null default 0 check (output_usd_per_mtok between 0 and 1000),
  -- The provider contractually does not train on prompts. [VERIFY] per provider.
  no_training boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null,
  unique (provider_key, model_id)
);

-- A feature (credit key), area, tier (tier.premium) or `default`, and its ordered models.
create table if not exists public.ai_model_routes (
  key text primary key check (key ~ '^[a-z0-9][a-z0-9_.-]{1,60}$'),
  model_keys text[] not null check (cardinality(model_keys) between 1 and 8),
  required_capabilities text[] not null default '{}' check (required_capabilities <@ array['chat', 'stream', 'json', 'json_schema', 'vision', 'stt', 'tts']),
  require_no_training boolean not null default false,
  max_output_tokens integer check (max_output_tokens is null or max_output_tokens between 16 and 64000),
  temperature numeric(3, 2) check (temperature is null or temperature between 0 and 2),
  enabled boolean not null default true,
  notes text check (notes is null or char_length(notes) <= 500),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

-- Seed: the existing OpenRouter key and the free Gemma model homework pre-marking
-- already uses, as the default route, so cost stays at zero until the owner adds
-- paid models.
insert into public.ai_providers (key, adapter, display_name, base_url, api_key_env, extra_headers)
values ('openrouter', 'openai_compatible', 'OpenRouter', 'https://openrouter.ai/api/v1', 'OPENROUTER_API_KEY',
  '{"HTTP-Referer": "https://ai.schood.online", "X-Title": "Schood AI"}'::jsonb)
on conflict (key) do nothing;
insert into public.ai_models (key, provider_key, model_id, display_name, capabilities, max_output)
values ('openrouter/google/gemma-4-31b-it:free', 'openrouter', 'google/gemma-4-31b-it:free', 'Gemma 4 31B (free)',
  array['chat', 'stream', 'json', 'vision'], 4096)
on conflict (key) do nothing;
insert into public.ai_model_routes (key, model_keys, notes)
values ('default', array['openrouter/google/gemma-4-31b-it:free'], 'Seed: free model, zero cost. Add a paid no_training model before children''s chats and paid plans.')
on conflict (key) do nothing;

-- --- Calls and caps -------------------------------------------------------------------
-- One row per provider attempt; attempts of one gateway call share call_id. No
-- prompt or answer text is stored here.
create table if not exists public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null,
  attempt smallint not null default 1 check (attempt between 1 and 10),
  request_id uuid,
  feature text not null check (feature ~ '^[a-z][a-z0-9_.-]{1,60}$'),
  user_id uuid references public.users(id) on delete set null,
  workspace_id uuid references public.ai_workspaces(id) on delete set null,
  route_key text check (route_key is null or char_length(route_key) <= 64),
  provider_key text check (provider_key is null or char_length(provider_key) <= 64),
  model_key text check (model_key is null or char_length(model_key) <= 124),
  status text not null check (status in ('ok', 'failed', 'timeout', 'rate_limited', 'invalid_output', 'stopped', 'capped', 'disabled', 'unavailable')),
  error_code text check (error_code is null or char_length(error_code) <= 64),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  usage_estimated boolean not null default false,
  cost_usd numeric(14, 6) not null default 0 check (cost_usd >= 0),
  credits integer not null default 0 check (credits >= 0),
  charge_id uuid,
  streamed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ai_calls_created_idx on public.ai_calls (created_at desc);
create index if not exists ai_calls_model_idx on public.ai_calls (model_key, created_at desc);
create index if not exists ai_calls_feature_idx on public.ai_calls (feature, created_at desc);
create index if not exists ai_calls_user_idx on public.ai_calls (user_id, created_at desc) where user_id is not null;
create index if not exists ai_calls_workspace_idx on public.ai_calls (workspace_id, created_at desc) where workspace_id is not null;
create index if not exists ai_calls_call_idx on public.ai_calls (call_id);

-- Daily counters per Tashkent day: the whole service (nil uuid), a workspace, a person.
create table if not exists public.ai_usage_daily (
  day date not null,
  scope text not null check (scope in ('global', 'workspace', 'user')),
  scope_id uuid not null,
  calls integer not null default 0 check (calls >= 0),
  cost_usd numeric(14, 6) not null default 0 check (cost_usd >= 0),
  primary key (day, scope, scope_id)
);

-- --- Library, jobs, chat, specialists, actions ------------------------------------------
create table if not exists public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  feature text not null check (feature ~ '^[a-z][a-z0-9_]{1,30}\.[a-z][a-z0-9_]{1,30}$'),
  status text not null default 'requested' check (status in ('requested', 'generating', 'ready', 'approved', 'rejected', 'failed')),
  input jsonb not null default '{}'::jsonb check (pg_column_size(input) <= 65536),
  output jsonb check (output is null or pg_column_size(output) <= 1048576),
  -- Answer-key checks and their disagreements, shown on the review card.
  verification jsonb check (verification is null or pg_column_size(verification) <= 262144),
  progress jsonb not null default '{}'::jsonb check (pg_column_size(progress) <= 8000),
  error_code text check (error_code is null or char_length(error_code) <= 64),
  credits integer not null default 0 check (credits >= 0),
  charge_id uuid,
  model_key text check (model_key is null or char_length(model_key) <= 124),
  decided_by uuid references public.users(id) on delete set null,
  decided_at timestamptz,
  -- A job still "generating" without a recent heartbeat was interrupted and may be retried.
  heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_generations_workspace_idx on public.ai_generations (workspace_id, created_at desc);
create index if not exists ai_generations_user_idx on public.ai_generations (user_id, created_at desc);

create table if not exists public.ai_pages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  owner_id uuid references public.users(id) on delete set null,
  folder text not null default '' check (char_length(folder) <= 200),
  kind text not null check (kind ~ '^[a-z][a-z0-9_.-]{1,60}$'),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  material jsonb check (material is null or pg_column_size(material) <= 524288),
  document jsonb check (document is null or pg_column_size(document) <= 1048576),
  revision integer not null default 1 check (revision >= 1),
  visibility text not null default 'private' check (visibility in ('private', 'workspace')),
  status text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  source_generation_id uuid references public.ai_generations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_pages_workspace_idx on public.ai_pages (workspace_id, updated_at desc);
create index if not exists ai_pages_owner_idx on public.ai_pages (owner_id, updated_at desc) where owner_id is not null;

create table if not exists public.ai_page_revisions (
  page_id uuid not null references public.ai_pages(id) on delete cascade,
  revision integer not null check (revision >= 1),
  title text not null check (char_length(title) <= 200),
  material jsonb check (material is null or pg_column_size(material) <= 524288),
  document jsonb check (document is null or pg_column_size(document) <= 1048576),
  author_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (page_id, revision)
);

create table if not exists public.ai_specialists (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  -- The key of a built-in specialist it overrides, or a new custom key.
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (description is null or char_length(description) <= 300),
  instructions text not null default '' check (char_length(instructions) <= 4000),
  -- Context providers it may read ("allowed tools"); always a subset of what the code allows.
  context_kinds text[] not null default '{}' check (cardinality(context_kinds) <= 12),
  roles text[] not null default '{owner,admin,teacher,student}' check (roles <@ array['owner', 'admin', 'teacher', 'student', 'parent']),
  enabled boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, key)
);

create table if not exists public.ai_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  specialist_key text not null check (specialist_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  page_id uuid references public.ai_pages(id) on delete set null,
  title text not null default '' check (char_length(title) <= 120),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create index if not exists ai_threads_user_idx on public.ai_threads (user_id, workspace_id, last_message_at desc);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.ai_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '' check (char_length(content) <= 40000),
  status text not null default 'complete' check (status in ('complete', 'streaming', 'failed', 'stopped')),
  client_message_id uuid,
  credit_key text check (credit_key is null or credit_key ~ '^[a-z][a-z0-9_]{1,30}\.[a-z][a-z0-9_]{1,30}$'),
  credits integer not null default 0 check (credits >= 0),
  call_id uuid,
  charge_id uuid,
  -- Which context the model saw for this answer (shown to the learner).
  context_kinds text[] not null default '{}' check (cardinality(context_kinds) <= 12),
  error_code text check (error_code is null or char_length(error_code) <= 64),
  created_at timestamptz not null default now()
);
create index if not exists ai_messages_thread_idx on public.ai_messages (thread_id, created_at);
create unique index if not exists ai_messages_client_idx on public.ai_messages (thread_id, client_message_id) where client_message_id is not null;

create table if not exists public.ai_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  kind text not null check (kind ~ '^[a-z][a-z0-9_]{1,60}$'),
  -- The exact arguments that run on approval, shown on the card as stored here.
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 65536),
  summary text not null check (char_length(btrim(summary)) between 1 and 500),
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed', 'declined', 'expired')),
  proposed_by uuid references public.users(id) on delete set null,
  thread_id uuid references public.ai_threads(id) on delete set null,
  message_id uuid references public.ai_messages(id) on delete set null,
  decided_by uuid references public.users(id) on delete set null,
  decided_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  attempts smallint not null default 0 check (attempts between 0 and 10),
  result jsonb check (result is null or pg_column_size(result) <= 65536),
  error_code text check (error_code is null or char_length(error_code) <= 64),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);
create index if not exists ai_actions_workspace_idx on public.ai_actions (workspace_id, status, created_at desc);

create table if not exists public.ai_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.ai_messages(id) on delete set null,
  call_id uuid,
  workspace_id uuid references public.ai_workspaces(id) on delete set null,
  reporter_id uuid references public.users(id) on delete set null,
  reason text not null check (reason in ('harmful', 'incorrect', 'inappropriate', 'privacy', 'other')),
  note text check (note is null or char_length(note) <= 1000),
  -- A copy of the reported answer, so the admin queue can act after the chat is deleted.
  excerpt text not null default '' check (char_length(excerpt) <= 4000),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists ai_reports_once_idx on public.ai_reports (message_id, reporter_id) where message_id is not null and reporter_id is not null;
create index if not exists ai_reports_open_idx on public.ai_reports (status, created_at desc);

create table if not exists public.ai_audit_events (
  id bigint generated always as identity primary key,
  workspace_id uuid references public.ai_workspaces(id) on delete set null,
  actor_id uuid references public.users(id) on delete set null,
  event text not null check (event ~ '^[a-z][a-z0-9_.]{2,80}$'),
  target_type text check (target_type is null or char_length(target_type) <= 40),
  target_id text check (target_id is null or char_length(target_id) <= 200),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 16000),
  created_at timestamptz not null default now()
);
create index if not exists ai_audit_events_workspace_idx on public.ai_audit_events (workspace_id, created_at desc);

-- --- Learning events and the notification budget ------------------------------------------
-- One row per real learning act, reported by every area and the coach bots
-- (ctx.events.emit). Leagues and XP count only verified rows: a passed check or a
-- scored turn, never just opening something. Append-only.
create table if not exists public.ai_learning_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  workspace_id uuid references public.ai_workspaces(id) on delete set null,
  area text not null check (area in ('core', 'learner', 'teacher', 'centre', 'coach', 'engage')),
  kind text not null check (kind in ('turn_scored', 'check_passed', 'check_failed', 'drill_finished', 'mock_finished', 'lesson_viewed', 'goal_set', 'outcome_recorded')),
  verified boolean not null,
  feature text not null check (feature ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,60}$'),
  skill text check (skill is null or skill ~ '^[a-z0-9][a-z0-9_.:-]{0,100}$'),
  verified_minutes smallint not null default 0 check (verified_minutes between 0 and 240 and (verified or verified_minutes = 0)),
  score numeric(10, 3) check (score is null or score between -1000 and 100000),
  outcome text check (outcome is null or outcome ~ '^[a-z][a-z0-9_]{0,40}$'),
  ref text check (ref is null or char_length(ref) <= 200),
  source text not null default 'web' check (source in ('web', 'telegram', 'system')),
  created_at timestamptz not null default now(),
  check (verified = (kind in ('turn_scored', 'check_passed', 'drill_finished', 'mock_finished', 'outcome_recorded')))
);
create index if not exists ai_learning_events_user_idx on public.ai_learning_events (user_id, created_at desc);
create index if not exists ai_learning_events_verified_idx on public.ai_learning_events (created_at desc, user_id) where verified;

create or replace function public.ai_learning_events_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    if new.workspace_id is null and (to_jsonb(new) - 'workspace_id') = (to_jsonb(old) - 'workspace_id') then return new; end if;
    raise exception 'ai_learning_events is append-only' using errcode = '42501';
  end if;
  if exists (select 1 from public.users where id = old.user_id) then
    raise exception 'ai_learning_events is append-only' using errcode = '42501';
  end if;
  return old;
end $$;
drop trigger if exists ai_learning_events_guard on public.ai_learning_events;
create trigger ai_learning_events_guard before update or delete on public.ai_learning_events
  for each row execute function public.ai_learning_events_guard();

-- At most two notifications a day per person across every bot, never in quiet
-- hours (22:00-08:00 in the person's time zone unless they choose otherwise).
create table if not exists public.ai_notify_prefs (
  user_id uuid primary key references public.users(id) on delete cascade,
  time_zone text not null default 'Asia/Tashkent' check (time_zone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$'),
  quiet_start smallint not null default 22 check (quiet_start between 0 and 23),
  quiet_end smallint not null default 8 check (quiet_end between 0 and 23),
  daily_limit smallint not null default 2 check (daily_limit between 0 and 2),
  updated_at timestamptz not null default now()
);
create table if not exists public.ai_notify_daily (
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  sent smallint not null default 0 check (sent between 0 and 2),
  channels text[] not null default '{}' check (cardinality(channels) <= 2),
  primary key (user_id, day)
);

-- --- updated_at ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ai_settings', 'ai_workspaces', 'ai_workspace_members', 'ai_providers', 'ai_models', 'ai_model_routes', 'ai_generations', 'ai_pages', 'ai_specialists', 'ai_threads', 'ai_notify_prefs'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
  end loop;
end $$;

-- --- Functions -----------------------------------------------------------------------------

-- The person's personal workspace, created with its owner membership on first use.
create or replace function public.ai_ensure_personal_workspace(p_user uuid, p_name text)
returns public.ai_workspaces
language plpgsql security definer set search_path = public, pg_temp as $$
declare ws public.ai_workspaces;
begin
  insert into public.ai_workspaces (kind, name, owner_id)
    values ('personal', left(coalesce(nullif(btrim(p_name), ''), 'My workspace'), 120), p_user)
    on conflict (owner_id) where kind = 'personal' do nothing;
  select * into ws from public.ai_workspaces where owner_id = p_user and kind = 'personal';
  insert into public.ai_workspace_members (workspace_id, user_id, role) values (ws.id, p_user, 'owner')
    on conflict (workspace_id, user_id) do nothing;
  return ws;
end $$;

-- Locks the workspace's account and rolls its plan credits forward. p_grant is
-- the credits per 30-day cycle of the plans in force now (0 without a plan).
-- A cycle run starts when a plan is first seen, or again after a lapse of more
-- than two days; each new cycle expires the unused plan credits and grants
-- afresh; an upgrade inside a cycle adds the difference once. Internal: called
-- by the charge and balance functions only.
create or replace function public.ai_credit_sync(p_workspace uuid, p_grant integer, p_now timestamptz)
returns public.ai_credit_accounts
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a public.ai_credit_accounts;
  next_cycle integer;
  anchor_ref text;
begin
  if p_grant is null or p_grant < 0 or p_grant > 10000000 then raise exception 'invalid_grant' using errcode = '22023'; end if;
  insert into public.ai_credit_accounts (workspace_id) values (p_workspace) on conflict (workspace_id) do nothing;
  select * into a from public.ai_credit_accounts where workspace_id = p_workspace for update;
  if p_grant = 0 then return a; end if;
  -- Concurrent sessions carry slightly different transaction times, so a time
  -- before the anchor or the last sighting counts as the current cycle.
  if a.plan_anchor is null or a.plan_seen_at is null or p_now - a.plan_seen_at > interval '2 days' then
    if a.plan_balance > 0 then
      insert into public.ai_credit_ledger (workspace_id, kind, bucket, delta, balance_after, reference, created_at)
        values (p_workspace, 'expire', 'plan', -a.plan_balance, 0, format('expire:%s:%s', extract(epoch from a.plan_anchor)::bigint, a.plan_cycle), p_now);
    end if;
    a.plan_anchor := p_now; a.plan_cycle := 0; a.plan_grant := p_grant; a.plan_balance := p_grant;
    insert into public.ai_credit_ledger (workspace_id, kind, bucket, delta, balance_after, reference, created_at)
      values (p_workspace, 'grant', 'plan', p_grant, p_grant, format('grant:%s:0', extract(epoch from p_now)::bigint), p_now);
  else
    next_cycle := greatest(0, floor(extract(epoch from (p_now - a.plan_anchor)) / 2592000)::integer);
    anchor_ref := extract(epoch from a.plan_anchor)::bigint::text;
    if next_cycle > a.plan_cycle then
      if a.plan_balance > 0 then
        insert into public.ai_credit_ledger (workspace_id, kind, bucket, delta, balance_after, reference, created_at)
          values (p_workspace, 'expire', 'plan', -a.plan_balance, 0, format('expire:%s:%s', anchor_ref, a.plan_cycle), p_now);
      end if;
      a.plan_cycle := next_cycle; a.plan_grant := p_grant; a.plan_balance := p_grant;
      insert into public.ai_credit_ledger (workspace_id, kind, bucket, delta, balance_after, reference, created_at)
        values (p_workspace, 'grant', 'plan', p_grant, p_grant, format('grant:%s:%s', anchor_ref, next_cycle), p_now);
    elsif p_grant > a.plan_grant then
      a.plan_balance := a.plan_balance + (p_grant - a.plan_grant);
      insert into public.ai_credit_ledger (workspace_id, kind, bucket, delta, balance_after, reference, created_at)
        values (p_workspace, 'grant', 'plan', p_grant - a.plan_grant, a.plan_balance, format('grant:%s:%s:to:%s', anchor_ref, a.plan_cycle, p_grant), p_now);
      a.plan_grant := p_grant;
    end if;
  end if;
  a.plan_seen_at := greatest(a.plan_seen_at, p_now);
  update public.ai_credit_accounts set plan_balance = a.plan_balance, plan_grant = a.plan_grant, plan_anchor = a.plan_anchor,
    plan_cycle = a.plan_cycle, plan_seen_at = a.plan_seen_at, updated_at = now()
    where workspace_id = p_workspace;
  return a;
end $$;

create or replace function public.ai_credit_view(a public.ai_credit_accounts) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'plan', a.plan_balance, 'plan_grant', a.plan_grant, 'pack', a.pack_balance, 'total', a.plan_balance + a.pack_balance,
    'cycle_ends_at', case when a.plan_anchor is null then null else a.plan_anchor + (a.plan_cycle + 1) * interval '30 days' end)
$$;

-- The workspace's balance after rolling its plan credits forward.
create or replace function public.ai_credit_balance(p_workspace uuid, p_grant integer, p_now timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return public.ai_credit_view(public.ai_credit_sync(p_workspace, p_grant, p_now));
end $$;

-- Charges an action before its model call. Plan credits go first, then packs.
-- In a centre workspace the member's monthly budget applies. The same p_reference
-- returns the original charge instead of charging twice. Never raises for an
-- empty balance: returns {ok:false, code}.
create or replace function public.ai_credit_charge(
  p_workspace uuid, p_user uuid, p_cost integer, p_credit_key text, p_reference text, p_grant integer, p_now timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a public.ai_credit_accounts;
  ws public.ai_workspaces;
  m public.ai_workspace_members;
  previous record;
  budget_month text := to_char((p_now at time zone 'UTC') + interval '5 hours', 'YYYY-MM');
  used integer := 0;
  from_plan integer;
  from_pack integer;
  charge uuid := gen_random_uuid();
begin
  if p_cost is null or p_cost < 1 or p_cost > 100000 then raise exception 'invalid_cost' using errcode = '22023'; end if;
  if p_reference is null or char_length(p_reference) not between 1 and 200 then raise exception 'invalid_reference' using errcode = '22023'; end if;
  select * into ws from public.ai_workspaces where id = p_workspace;
  if not found then raise exception 'workspace_not_found' using errcode = 'P0002'; end if;
  a := public.ai_credit_sync(p_workspace, p_grant, p_now);
  -- Checked under the account lock, so a concurrent duplicate sees the first charge.
  select charge_id, sum(-delta)::integer as cost into previous from public.ai_credit_ledger
    where workspace_id = p_workspace and kind = 'charge' and reference = p_reference group by charge_id;
  if found then
    -- A key whose charge was refunded belonged to a failed attempt: a retry needs a new key.
    if exists (select 1 from public.ai_credit_ledger where charge_id = previous.charge_id and kind = 'refund') then
      return jsonb_build_object('ok', false, 'code', 'reference_refunded');
    end if;
    return jsonb_build_object('ok', true, 'replayed', true, 'charge_id', previous.charge_id, 'cost', previous.cost, 'balance', public.ai_credit_view(a));
  end if;
  if ws.kind = 'centre' then
    select * into m from public.ai_workspace_members where workspace_id = p_workspace and user_id = p_user for update;
    if not found or m.status <> 'active' then
      return jsonb_build_object('ok', false, 'code', 'not_member');
    end if;
    used := case when m.budget_period = budget_month then m.budget_used else 0 end;
    if m.credit_budget is not null and used + p_cost > m.credit_budget then
      return jsonb_build_object('ok', false, 'code', 'budget_exhausted', 'cost', p_cost, 'budget', m.credit_budget, 'used', used, 'balance', public.ai_credit_view(a));
    end if;
  end if;
  if a.plan_balance + a.pack_balance < p_cost then
    return jsonb_build_object('ok', false, 'code', 'insufficient_credits', 'cost', p_cost, 'available', a.plan_balance + a.pack_balance, 'balance', public.ai_credit_view(a));
  end if;
  from_plan := least(a.plan_balance, p_cost);
  from_pack := p_cost - from_plan;
  if from_plan > 0 then
    insert into public.ai_credit_ledger (workspace_id, user_id, kind, bucket, delta, balance_after, credit_key, charge_id, reference, created_at)
      values (p_workspace, p_user, 'charge', 'plan', -from_plan, a.plan_balance - from_plan, p_credit_key, charge, p_reference, p_now);
  end if;
  if from_pack > 0 then
    insert into public.ai_credit_ledger (workspace_id, user_id, kind, bucket, delta, balance_after, credit_key, charge_id, reference, created_at)
      values (p_workspace, p_user, 'charge', 'pack', -from_pack, a.pack_balance - from_pack, p_credit_key, charge, p_reference, p_now);
  end if;
  update public.ai_credit_accounts set plan_balance = plan_balance - from_plan, pack_balance = pack_balance - from_pack, updated_at = now()
    where workspace_id = p_workspace returning * into a;
  if ws.kind = 'centre' then
    update public.ai_workspace_members set budget_period = budget_month, budget_used = used + p_cost
      where workspace_id = p_workspace and user_id = p_user;
  end if;
  return jsonb_build_object('ok', true, 'replayed', false, 'charge_id', charge, 'cost', p_cost, 'plan', from_plan, 'pack', from_pack, 'balance', public.ai_credit_view(a));
end $$;

-- Gives a charge back after its call failed: each bucket gets back what it gave,
-- and the member's budget too while it is still the same month. Refunding twice
-- refunds once.
create or replace function public.ai_credit_refund(p_charge uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  ws uuid;
  a public.ai_credit_accounts;
  r record;
  total integer := 0;
  charged_by uuid;
  charged_at timestamptz;
  ws_kind text;
begin
  select l.workspace_id, l.user_id, l.created_at into ws, charged_by, charged_at from public.ai_credit_ledger l
    where l.charge_id = p_charge and l.kind = 'charge' limit 1;
  if ws is null then return jsonb_build_object('ok', false, 'code', 'charge_not_found'); end if;
  select * into a from public.ai_credit_accounts where workspace_id = ws for update;
  if exists (select 1 from public.ai_credit_ledger where charge_id = p_charge and kind = 'refund') then
    return jsonb_build_object('ok', true, 'replayed', true, 'refunded', 0, 'balance', public.ai_credit_view(a));
  end if;
  for r in select bucket, -delta as amount, credit_key from public.ai_credit_ledger where charge_id = p_charge and kind = 'charge' order by bucket loop
    if r.bucket = 'plan' then a.plan_balance := a.plan_balance + r.amount; else a.pack_balance := a.pack_balance + r.amount; end if;
    insert into public.ai_credit_ledger (workspace_id, user_id, kind, bucket, delta, balance_after, credit_key, charge_id)
      values (ws, charged_by, 'refund', r.bucket, r.amount, case when r.bucket = 'plan' then a.plan_balance else a.pack_balance end, r.credit_key, p_charge);
    total := total + r.amount;
  end loop;
  update public.ai_credit_accounts set plan_balance = a.plan_balance, pack_balance = a.pack_balance, updated_at = now() where workspace_id = ws returning * into a;
  select w.kind into ws_kind from public.ai_workspaces w where w.id = ws;
  if ws_kind = 'centre' and charged_by is not null then
    update public.ai_workspace_members set budget_used = greatest(0, budget_used - total)
      where workspace_id = ws and user_id = charged_by
        and budget_period = to_char((charged_at at time zone 'UTC') + interval '5 hours', 'YYYY-MM');
  end if;
  return jsonb_build_object('ok', true, 'replayed', false, 'refunded', total, 'balance', public.ai_credit_view(a));
end $$;

-- Adds pack credits (a bought top-up, gift or admin grant). Idempotent per reference.
create or replace function public.ai_credit_grant(p_workspace uuid, p_amount integer, p_kind text, p_reference text, p_user uuid default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.ai_credit_accounts;
begin
  if p_kind not in ('pack', 'adjust') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 10000000 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  if p_reference is null or char_length(p_reference) not between 1 and 200 then raise exception 'invalid_reference' using errcode = '22023'; end if;
  if not exists (select 1 from public.ai_workspaces where id = p_workspace) then raise exception 'workspace_not_found' using errcode = 'P0002'; end if;
  insert into public.ai_credit_accounts (workspace_id) values (p_workspace) on conflict (workspace_id) do nothing;
  select * into a from public.ai_credit_accounts where workspace_id = p_workspace for update;
  if exists (select 1 from public.ai_credit_ledger where workspace_id = p_workspace and kind = p_kind and reference = p_reference) then
    return jsonb_build_object('ok', true, 'replayed', true, 'balance', public.ai_credit_view(a));
  end if;
  update public.ai_credit_accounts set pack_balance = pack_balance + p_amount, updated_at = now() where workspace_id = p_workspace returning * into a;
  insert into public.ai_credit_ledger (workspace_id, user_id, kind, bucket, delta, balance_after, reference)
    values (p_workspace, p_user, p_kind, 'pack', p_amount, a.pack_balance, p_reference);
  return jsonb_build_object('ok', true, 'replayed', false, 'balance', public.ai_credit_view(a));
end $$;

-- Takes one call from today's caps, all or nothing: the whole service, the
-- workspace and the person. Returns the scope that is full instead of raising.
create or replace function public.ai_take_call(
  p_day date, p_user uuid, p_workspace uuid, p_global_cap integer, p_user_cap integer, p_workspace_cap integer, p_global_usd numeric default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  nil constant uuid := '00000000-0000-0000-0000-000000000000';
  g public.ai_usage_daily;
  w public.ai_usage_daily;
  u public.ai_usage_daily;
begin
  insert into public.ai_usage_daily (day, scope, scope_id) values (p_day, 'global', nil) on conflict do nothing;
  if p_workspace is not null then insert into public.ai_usage_daily (day, scope, scope_id) values (p_day, 'workspace', p_workspace) on conflict do nothing; end if;
  if p_user is not null then insert into public.ai_usage_daily (day, scope, scope_id) values (p_day, 'user', p_user) on conflict do nothing; end if;
  select * into g from public.ai_usage_daily where day = p_day and scope = 'global' and scope_id = nil for update;
  if p_workspace is not null then select * into w from public.ai_usage_daily where day = p_day and scope = 'workspace' and scope_id = p_workspace for update; end if;
  if p_user is not null then select * into u from public.ai_usage_daily where day = p_day and scope = 'user' and scope_id = p_user for update; end if;
  if g.calls >= p_global_cap then return jsonb_build_object('ok', false, 'scope', 'global'); end if;
  if p_global_usd is not null and g.cost_usd >= p_global_usd then return jsonb_build_object('ok', false, 'scope', 'spend'); end if;
  if p_workspace is not null and w.calls >= p_workspace_cap then return jsonb_build_object('ok', false, 'scope', 'workspace'); end if;
  if p_user is not null and u.calls >= p_user_cap then return jsonb_build_object('ok', false, 'scope', 'user'); end if;
  update public.ai_usage_daily set calls = calls + 1
    where day = p_day and ((scope = 'global' and scope_id = nil) or (scope = 'workspace' and scope_id = p_workspace) or (scope = 'user' and scope_id = p_user));
  return jsonb_build_object('ok', true);
end $$;

-- Each recorded attempt's cost counts towards today's spend.
create or replace function public.ai_calls_accrue_cost() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare usage_day date := ((new.created_at at time zone 'UTC') + interval '5 hours')::date;
begin
  if new.cost_usd > 0 then
    insert into public.ai_usage_daily as d (day, scope, scope_id, cost_usd) values (usage_day, 'global', '00000000-0000-0000-0000-000000000000', new.cost_usd)
      on conflict (day, scope, scope_id) do update set cost_usd = d.cost_usd + excluded.cost_usd;
    if new.workspace_id is not null then
      insert into public.ai_usage_daily as d (day, scope, scope_id, cost_usd) values (usage_day, 'workspace', new.workspace_id, new.cost_usd)
        on conflict (day, scope, scope_id) do update set cost_usd = d.cost_usd + excluded.cost_usd;
    end if;
    if new.user_id is not null then
      insert into public.ai_usage_daily as d (day, scope, scope_id, cost_usd) values (usage_day, 'user', new.user_id, new.cost_usd)
        on conflict (day, scope, scope_id) do update set cost_usd = d.cost_usd + excluded.cost_usd;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists ai_calls_accrue_cost on public.ai_calls;
create trigger ai_calls_accrue_cost after insert on public.ai_calls for each row execute function public.ai_calls_accrue_cost();

-- Whether a notification may reach this person now; with p_take it is also counted.
-- Quiet hours and the day follow the person's own time zone.
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
  if not found then pref.time_zone := 'Asia/Tashkent'; pref.quiet_start := 22; pref.quiet_end := 8; pref.daily_limit := 2; end if;
  local_time := p_now at time zone pref.time_zone;
  local_hour := extract(hour from local_time)::integer;
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

-- --- Access: the schood-ai function only ----------------------------------------------------
alter table public.ai_settings enable row level security;
alter table public.ai_workspaces enable row level security;
alter table public.ai_workspace_invites enable row level security;
alter table public.ai_workspace_members enable row level security;
alter table public.ai_credit_accounts enable row level security;
alter table public.ai_credit_ledger enable row level security;
alter table public.ai_providers enable row level security;
alter table public.ai_models enable row level security;
alter table public.ai_model_routes enable row level security;
alter table public.ai_calls enable row level security;
alter table public.ai_usage_daily enable row level security;
alter table public.ai_generations enable row level security;
alter table public.ai_pages enable row level security;
alter table public.ai_page_revisions enable row level security;
alter table public.ai_specialists enable row level security;
alter table public.ai_threads enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_actions enable row level security;
alter table public.ai_reports enable row level security;
alter table public.ai_audit_events enable row level security;
alter table public.ai_learning_events enable row level security;
alter table public.ai_notify_prefs enable row level security;
alter table public.ai_notify_daily enable row level security;

-- No policies: browsers get nothing directly.
revoke all on public.ai_settings, public.ai_workspaces, public.ai_workspace_invites, public.ai_workspace_members,
  public.ai_credit_accounts, public.ai_credit_ledger, public.ai_providers, public.ai_models, public.ai_model_routes,
  public.ai_calls, public.ai_usage_daily, public.ai_generations, public.ai_pages, public.ai_page_revisions,
  public.ai_specialists, public.ai_threads, public.ai_messages, public.ai_actions, public.ai_reports, public.ai_audit_events,
  public.ai_learning_events, public.ai_notify_prefs, public.ai_notify_daily
  from anon, authenticated;
-- Money-like state changes only through the functions; the call log only grows.
revoke insert, update, delete, truncate on public.ai_credit_accounts, public.ai_credit_ledger, public.ai_usage_daily, public.ai_notify_daily from service_role;
revoke update, delete, truncate on public.ai_calls, public.ai_audit_events, public.ai_learning_events from service_role;

revoke all on function public.ai_ensure_personal_workspace(uuid, text) from public, anon, authenticated;
revoke all on function public.ai_credit_sync(uuid, integer, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.ai_credit_view(public.ai_credit_accounts) from public, anon, authenticated;
revoke all on function public.ai_credit_balance(uuid, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.ai_credit_charge(uuid, uuid, integer, text, text, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.ai_credit_refund(uuid) from public, anon, authenticated;
revoke all on function public.ai_credit_grant(uuid, integer, text, text, uuid) from public, anon, authenticated;
revoke all on function public.ai_take_call(date, uuid, uuid, integer, integer, integer, numeric) from public, anon, authenticated;
revoke all on function public.ai_workspace_members_guard() from public, anon, authenticated;
revoke all on function public.ai_credit_ledger_guard() from public, anon, authenticated;
revoke all on function public.ai_calls_accrue_cost() from public, anon, authenticated;
revoke all on function public.ai_learning_events_guard() from public, anon, authenticated;
revoke all on function public.ai_notify(uuid, text, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.ai_ensure_personal_workspace(uuid, text) to service_role;
grant execute on function public.ai_credit_balance(uuid, integer, timestamptz) to service_role;
grant execute on function public.ai_credit_charge(uuid, uuid, integer, text, text, integer, timestamptz) to service_role;
grant execute on function public.ai_credit_refund(uuid) to service_role;
grant execute on function public.ai_credit_grant(uuid, integer, text, text, uuid) to service_role;
grant execute on function public.ai_take_call(date, uuid, uuid, integer, integer, integer, numeric) to service_role;
grant execute on function public.ai_notify(uuid, text, boolean, timestamptz) to service_role;

commit;
