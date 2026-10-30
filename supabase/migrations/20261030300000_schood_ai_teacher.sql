-- Schood AI teacher area (docs/product/44_SCHOOD_AI.md, T1–T6 and T9–T15).
--
-- Drafts are jobs in core's ai_generations; an approved material is a page in core's
-- library (ai_pages). These tables hold what the teacher features add around them:
--   handouts           the student version of an approved library page, opened by link
--   Live Quiz (T10)    sessions, players and answers; one answer per player and question
--   marking (T3, T14, T15)  batches of scripts with AI drafts and teacher-confirmed marks
--   channel autopilot (T11) a teacher's Telegram channel, weekly batches and their posts
--   marketplace (T12)  listings, moderation, ratings, copies, verified use, and a seller
--                      earnings ledger for paid listings (behind a switch that ships off;
--                      no money moves here)
--   brand kit (T13)    the tutor's own profile and results they entered themselves
--
-- Every table has RLS on with no policies and no grants to browsers: only the
-- schood-ai function (service role) reads and writes, after its own checks. Writes
-- that race (quiz answers, ratings, copies, verified use) go through the functions
-- below so totals stay exact. Safe to apply twice.

-- --- Handouts ---------------------------------------------------------------------------------
create table if not exists public.ai_teacher_handouts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  page_id uuid not null references public.ai_pages(id) on delete cascade,
  -- SHA-256 of the link token; the token itself is never stored.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists ai_teacher_handouts_page_idx on public.ai_teacher_handouts (page_id);

-- --- Live Quiz (T10) --------------------------------------------------------------------------
create table if not exists public.ai_teacher_quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  host_id uuid not null references public.users(id) on delete cascade,
  page_id uuid references public.ai_pages(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  code text not null check (code ~ '^[0-9]{6}$'),
  status text not null default 'lobby' check (status in ('lobby', 'question', 'reveal', 'finished')),
  current_index integer not null default -1 check (current_index between -1 and 99),
  question_started_at timestamptz,
  -- A snapshot of the approved questions, so a later edit never changes a live game.
  questions jsonb not null check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) between 1 and 60 and pg_column_size(questions) <= 262144),
  seconds_per_question integer not null default 20 check (seconds_per_question between 5 and 120),
  class_label text check (class_label is null or char_length(class_label) <= 120),
  academy_group jsonb check (academy_group is null or (jsonb_typeof(academy_group) = 'object' and pg_column_size(academy_group) <= 2000)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
-- A join code belongs to one open game at a time.
create unique index if not exists ai_teacher_quiz_open_code_idx on public.ai_teacher_quiz_sessions (code) where status <> 'finished';
create index if not exists ai_teacher_quiz_host_idx on public.ai_teacher_quiz_sessions (workspace_id, host_id, created_at desc);

create table if not exists public.ai_teacher_quiz_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ai_teacher_quiz_sessions(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 24),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  score integer not null default 0 check (score >= 0),
  correct integer not null default 0 check (correct >= 0),
  answered integer not null default 0 check (answered >= 0),
  removed boolean not null default false,
  joined_at timestamptz not null default now()
);
create unique index if not exists ai_teacher_quiz_player_token_idx on public.ai_teacher_quiz_players (session_id, token_hash);
create unique index if not exists ai_teacher_quiz_player_nickname_idx on public.ai_teacher_quiz_players (session_id, lower(nickname)) where not removed;
create unique index if not exists ai_teacher_quiz_player_user_idx on public.ai_teacher_quiz_players (session_id, user_id) where user_id is not null and not removed;
create index if not exists ai_teacher_quiz_player_score_idx on public.ai_teacher_quiz_players (session_id, score desc);

create table if not exists public.ai_teacher_quiz_answers (
  session_id uuid not null references public.ai_teacher_quiz_sessions(id) on delete cascade,
  player_id uuid not null references public.ai_teacher_quiz_players(id) on delete cascade,
  question_index integer not null check (question_index between 0 and 99),
  choice text not null check (char_length(choice) between 1 and 8),
  correct boolean not null,
  points integer not null check (points between 0 and 2000),
  answered_at timestamptz not null default now(),
  primary key (player_id, question_index)
);
create index if not exists ai_teacher_quiz_answers_question_idx on public.ai_teacher_quiz_answers (session_id, question_index);

-- --- Marking (T3, T14, T15) ---------------------------------------------------------------------
create table if not exists public.ai_teacher_marking_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  owner_id uuid not null references public.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  rubric text not null check (rubric ~ '^[a-z][a-z0-9_]{1,40}$'),
  task text not null default '' check (char_length(task) <= 6000),
  level text check (level is null or char_length(level) <= 20),
  feedback_language text not null default 'en' check (feedback_language in ('en', 'uz', 'ru')),
  status text not null default 'open' check (status in ('open', 'confirmed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_teacher_marking_batches_idx on public.ai_teacher_marking_batches (workspace_id, owner_id, created_at desc);

create table if not exists public.ai_teacher_scripts (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.ai_teacher_marking_batches(id) on delete cascade,
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  student_label text not null check (char_length(btrim(student_label)) between 1 and 80),
  source text not null check (source in ('typed', 'pasted', 'photo', 'recording', 'transcript')),
  -- The script, or the transcript of a photo or recording; photos and audio are not kept.
  text text check (text is null or char_length(text) <= 20000),
  meta jsonb not null default '{}'::jsonb check (jsonb_typeof(meta) = 'object' and pg_column_size(meta) <= 4000),
  -- AI marks are drafts; `final` is what the teacher confirmed.
  draft jsonb check (draft is null or pg_column_size(draft) <= 65536),
  final jsonb check (final is null or pg_column_size(final) <= 65536),
  signals jsonb check (signals is null or pg_column_size(signals) <= 32768),
  status text not null default 'new' check (status in ('new', 'marking', 'marked', 'failed', 'confirmed')),
  error_code text check (error_code is null or char_length(error_code) <= 64),
  confirmed_by uuid references public.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_teacher_scripts_batch_idx on public.ai_teacher_scripts (batch_id, created_at);

-- --- Channel autopilot (T11) ----------------------------------------------------------------------
create table if not exists public.ai_teacher_channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  owner_id uuid not null references public.users(id) on delete cascade,
  -- A channel's numeric id (-100…) or its public @username.
  chat_id text not null check (chat_id ~ '^(-100[0-9]{5,15}|@[A-Za-z][A-Za-z0-9_]{4,31})$'),
  title text not null check (char_length(btrim(title)) between 1 and 128),
  username text check (username is null or username ~ '^[A-Za-z][A-Za-z0-9_]{4,31}$'),
  voice text not null default '' check (char_length(voice) <= 1000),
  language text not null default 'uz' check (language in ('en', 'uz', 'ru')),
  level text not null default 'B1' check (char_length(level) between 2 and 20),
  topics text not null default '' check (char_length(topics) <= 500),
  schedule jsonb not null default '{}'::jsonb check (jsonb_typeof(schedule) = 'object' and pg_column_size(schedule) <= 2000),
  status text not null default 'pending' check (status in ('pending', 'verified', 'error')),
  verified_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, chat_id)
);

create table if not exists public.ai_teacher_channel_batches (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.ai_teacher_channels(id) on delete cascade,
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  week_start date not null,
  status text not null default 'generating' check (status in ('generating', 'draft', 'proposed', 'approved', 'cancelled')),
  action_id uuid references public.ai_actions(id) on delete set null,
  created_by uuid not null references public.users(id) on delete cascade,
  credits integer not null default 0 check (credits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_teacher_channel_batches_idx on public.ai_teacher_channel_batches (channel_id, created_at desc);

create table if not exists public.ai_teacher_channel_posts (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.ai_teacher_channels(id) on delete cascade,
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  batch_id uuid not null references public.ai_teacher_channel_batches(id) on delete cascade,
  kind text not null check (kind in ('word', 'quiz', 'tip')),
  content jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 16000),
  scheduled_for timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  message_id text check (message_id is null or message_id ~ '^[0-9]{1,20}$'),
  attempts integer not null default 0 check (attempts between 0 and 20),
  last_error text check (last_error is null or char_length(last_error) <= 200),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ai_teacher_channel_posts_due_idx on public.ai_teacher_channel_posts (scheduled_for) where status = 'scheduled';
create index if not exists ai_teacher_channel_posts_batch_idx on public.ai_teacher_channel_posts (batch_id, scheduled_for);
create index if not exists ai_teacher_channel_posts_sent_idx on public.ai_teacher_channel_posts (channel_id, sent_at desc) where status = 'sent';

-- --- Marketplace (T12) ------------------------------------------------------------------------------
create table if not exists public.ai_teacher_listings (
  id uuid primary key default gen_random_uuid(),
  seller_workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  seller_id uuid not null references public.users(id) on delete cascade,
  seller_name text not null check (char_length(btrim(seller_name)) between 1 and 120),
  source_page_id uuid references public.ai_pages(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  kind text not null check (kind ~ '^[a-z][a-z0-9_]{1,39}$'),
  level text not null check (char_length(level) between 2 and 20),
  exam text check (exam is null or char_length(exam) <= 40),
  language text not null check (language in ('en', 'uz', 'ru')),
  tags text[] not null default '{}' check (cardinality(tags) <= 12),
  -- A frozen copy of the approved material, key included (buyers get the key).
  material jsonb not null check (jsonb_typeof(material) = 'object' and pg_column_size(material) <= 524288),
  -- 0 is free. A price only matters once paid listings are switched on and checkout exists.
  price_uzs integer not null default 0 check (price_uzs between 0 and 10000000),
  status text not null default 'draft' check (status in ('draft', 'pending', 'published', 'rejected', 'withdrawn')),
  moderation_note text check (moderation_note is null or char_length(moderation_note) <= 1000),
  moderated_by uuid references public.users(id) on delete set null,
  moderated_at timestamptz,
  rating_sum integer not null default 0 check (rating_sum >= 0),
  rating_count integer not null default 0 check (rating_count >= 0),
  -- Distinct workspaces that used a copy (assigned, played, printed, exported).
  usage_count integer not null default 0 check (usage_count >= 0),
  copies integer not null default 0 check (copies >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists ai_teacher_listings_published_idx on public.ai_teacher_listings (published_at desc) where status = 'published';
create index if not exists ai_teacher_listings_pending_idx on public.ai_teacher_listings (updated_at) where status = 'pending';
create index if not exists ai_teacher_listings_seller_idx on public.ai_teacher_listings (seller_workspace_id, created_at desc);

create table if not exists public.ai_teacher_listing_ratings (
  listing_id uuid not null references public.ai_teacher_listings(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  primary key (listing_id, user_id)
);

create table if not exists public.ai_teacher_listing_copies (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.ai_teacher_listings(id) on delete cascade,
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  -- The buyer's library page; a copy stays counted if they delete it later.
  page_id uuid references public.ai_pages(id) on delete set null,
  price_uzs integer not null default 0 check (price_uzs >= 0),
  created_at timestamptz not null default now(),
  unique (listing_id, workspace_id)
);
create index if not exists ai_teacher_listing_copies_page_idx on public.ai_teacher_listing_copies (page_id);

create table if not exists public.ai_teacher_listing_uses (
  listing_id uuid not null references public.ai_teacher_listings(id) on delete cascade,
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  kind text not null check (kind in ('homework', 'live_quiz', 'print', 'assessment')),
  created_at timestamptz not null default now(),
  primary key (listing_id, workspace_id, kind)
);

-- Seller earnings for paid listings. Append-only; commission stays null until the
-- owner sets the rate. Nothing here pays anyone out. Like ai_credit_ledger, rows
-- outlive a closed account: a deleted listing or workspace is unlinked (set null),
-- never deleted, and the listing's title stays on the row.
create table if not exists public.ai_teacher_seller_ledger (
  id bigint generated always as identity primary key,
  listing_id uuid references public.ai_teacher_listings(id) on delete set null,
  listing_title text not null check (char_length(btrim(listing_title)) between 1 and 160),
  seller_workspace_id uuid references public.ai_workspaces(id) on delete set null,
  buyer_workspace_id uuid references public.ai_workspaces(id) on delete set null,
  gross_uzs integer not null check (gross_uzs >= 0),
  commission_uzs integer check (commission_uzs is null or commission_uzs >= 0),
  net_uzs integer check (net_uzs is null or net_uzs >= 0),
  status text not null default 'pending' check (status in ('pending', 'cleared', 'reversed')),
  reference text not null unique check (char_length(reference) between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists ai_teacher_seller_ledger_idx on public.ai_teacher_seller_ledger (seller_workspace_id, created_at desc);

-- --- Tutor brand kit (T13) ------------------------------------------------------------------------------
create table if not exists public.ai_teacher_brand_profiles (
  workspace_id uuid primary key references public.ai_workspaces(id) on delete cascade,
  owner_id uuid not null references public.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  subjects text not null default '' check (char_length(subjects) <= 300),
  city text not null default '' check (char_length(city) <= 120),
  experience_years integer check (experience_years is null or experience_years between 0 and 60),
  format text not null default '' check (char_length(format) <= 300),
  contact text not null default '' check (char_length(contact) <= 300),
  about text not null default '' check (char_length(about) <= 2000),
  updated_at timestamptz not null default now()
);

-- Results the tutor entered. Posts may quote only these; consent gates naming.
create table if not exists public.ai_teacher_results (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  owner_id uuid not null references public.users(id) on delete cascade,
  student_label text not null check (char_length(btrim(student_label)) between 1 and 60),
  consent boolean not null default false,
  exam text not null check (char_length(btrim(exam)) between 1 and 60),
  score text not null check (char_length(btrim(score)) between 1 and 20),
  previous_score text check (previous_score is null or char_length(previous_score) <= 20),
  achieved_on date not null,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists ai_teacher_results_idx on public.ai_teacher_results (workspace_id, achieved_on desc);

-- --- updated_at ---------------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ai_teacher_quiz_sessions', 'ai_teacher_marking_batches', 'ai_teacher_scripts', 'ai_teacher_channels', 'ai_teacher_channel_batches', 'ai_teacher_listings', 'ai_teacher_brand_profiles'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
  end loop;
end $$;

-- The earnings ledger only grows. The one change allowed is unlinking a deleted
-- listing or workspace (the foreign keys' set null), as ai_credit_ledger_guard does.
create or replace function public.ai_teacher_ledger_guard() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE'
    and (new.listing_id is null or new.listing_id is not distinct from old.listing_id)
    and (new.seller_workspace_id is null or new.seller_workspace_id is not distinct from old.seller_workspace_id)
    and (new.buyer_workspace_id is null or new.buyer_workspace_id is not distinct from old.buyer_workspace_id)
    and (to_jsonb(new) - 'listing_id' - 'seller_workspace_id' - 'buyer_workspace_id') = (to_jsonb(old) - 'listing_id' - 'seller_workspace_id' - 'buyer_workspace_id') then
    return new;
  end if;
  raise exception 'ai_teacher_seller_ledger is append-only' using errcode = '42501';
end $$;
drop trigger if exists ai_teacher_seller_ledger_guard on public.ai_teacher_seller_ledger;
create trigger ai_teacher_seller_ledger_guard before update or delete on public.ai_teacher_seller_ledger for each row execute function public.ai_teacher_ledger_guard();

-- --- Functions ------------------------------------------------------------------------------------------------

-- One answer per player and question; the player's totals move with it.
create or replace function public.ai_teacher_quiz_answer(p_session uuid, p_player uuid, p_index integer, p_choice text, p_correct boolean, p_points integer)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare inserted integer;
begin
  insert into public.ai_teacher_quiz_answers (session_id, player_id, question_index, choice, correct, points)
  select p_session, p_player, p_index, p_choice, p_correct, greatest(0, least(p_points, 2000))
  where exists (select 1 from public.ai_teacher_quiz_players where id = p_player and session_id = p_session and not removed)
  on conflict (player_id, question_index) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return false; end if;
  update public.ai_teacher_quiz_players
     set score = score + greatest(0, least(p_points, 2000)), answered = answered + 1, correct = correct + case when p_correct then 1 else 0 end
   where id = p_player;
  return true;
end $$;

-- One rating per person; replacing it keeps the listing's sum and count exact.
create or replace function public.ai_teacher_rate_listing(p_listing uuid, p_user uuid, p_stars integer, p_comment text)
returns public.ai_teacher_listings
language plpgsql security definer set search_path = public, pg_temp as $$
declare previous smallint; updated public.ai_teacher_listings;
begin
  if p_stars not between 1 and 5 then raise exception 'stars must be 1 to 5' using errcode = '22023'; end if;
  perform 1 from public.ai_teacher_listings where id = p_listing for update;
  if not found then return null; end if;
  select stars into previous from public.ai_teacher_listing_ratings where listing_id = p_listing and user_id = p_user;
  insert into public.ai_teacher_listing_ratings (listing_id, user_id, stars, comment) values (p_listing, p_user, p_stars, p_comment)
  on conflict (listing_id, user_id) do update set stars = excluded.stars, comment = excluded.comment, created_at = now();
  update public.ai_teacher_listings
     set rating_sum = rating_sum - coalesce(previous, 0) + p_stars, rating_count = rating_count + case when previous is null then 1 else 0 end
   where id = p_listing returning * into updated;
  return updated;
end $$;

-- One copy per workspace; the listing's copy count moves with it. Null when it already has one.
create or replace function public.ai_teacher_add_copy(p_listing uuid, p_workspace uuid, p_user uuid, p_page uuid, p_price integer)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare created uuid;
begin
  insert into public.ai_teacher_listing_copies (listing_id, workspace_id, user_id, page_id, price_uzs)
  values (p_listing, p_workspace, p_user, p_page, greatest(0, p_price))
  on conflict (listing_id, workspace_id) do nothing
  returning id into created;
  if created is not null then update public.ai_teacher_listings set copies = copies + 1 where id = p_listing; end if;
  return created;
end $$;

-- Verified use: only a workspace holding a copy counts, once per kind; usage_count is distinct workspaces.
create or replace function public.ai_teacher_record_use(p_listing uuid, p_workspace uuid, p_kind text)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare inserted integer; first_use boolean;
begin
  if not exists (select 1 from public.ai_teacher_listing_copies where listing_id = p_listing and workspace_id = p_workspace) then return false; end if;
  perform 1 from public.ai_teacher_listings where id = p_listing for update;
  first_use := not exists (select 1 from public.ai_teacher_listing_uses where listing_id = p_listing and workspace_id = p_workspace);
  insert into public.ai_teacher_listing_uses (listing_id, workspace_id, kind) values (p_listing, p_workspace, p_kind) on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return false; end if;
  if first_use then update public.ai_teacher_listings set usage_count = usage_count + 1 where id = p_listing; end if;
  return true;
end $$;

-- A rating removed by account erasure (or a users cascade) leaves the listing's totals exact.
create or replace function public.ai_teacher_rating_removed() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.ai_teacher_listings
     set rating_sum = greatest(0, rating_sum - old.stars), rating_count = greatest(0, rating_count - 1)
   where id = old.listing_id;
  return old;
end $$;
drop trigger if exists ai_teacher_rating_removed on public.ai_teacher_listing_ratings;
create trigger ai_teacher_rating_removed after delete on public.ai_teacher_listing_ratings for each row execute function public.ai_teacher_rating_removed();

-- --- Account erasure ------------------------------------------------------------------------------------------
-- Players' nicknames and raters' comments are personal data keyed on user_id: they join
-- account_personal_erasure_tables() with the closed-account guard, the same additive
-- pattern as 20261030130000_schood_ai_retention_and_erasure.sql. Everything else here
-- belongs to the teacher (owner_id, host_id) and goes with the users cascade.
do $$
declare
  relations text[];
  wanted text[] := array['ai_teacher_quiz_players', 'ai_teacher_listing_ratings'];
  relation_name text;
  guard_installed boolean := to_regprocedure('public.guard_closed_personal_record()') is not null;
begin
  if to_regprocedure('public.account_personal_erasure_tables()') is null then
    raise notice 'account_personal_erasure_tables() is not installed; erasure registry not extended';
    return;
  end if;
  relations := public.account_personal_erasure_tables();
  foreach relation_name in array wanted loop
    if not (relation_name = any(relations)) then
      relations := relations || relation_name;
      if guard_installed then
        execute format('drop trigger if exists account_closed_personal_guard on public.%I', relation_name);
        execute format('create trigger account_closed_personal_guard before insert or update on public.%I for each row execute function public.guard_closed_personal_record(%L)', relation_name, 'user_id');
      end if;
    end if;
  end loop;
  execute format(
    'create or replace function public.account_personal_erasure_tables() returns text[] language sql immutable set search_path=pg_catalog,public as %L',
    format('select %L::text[];', relations::text)
  );
end
$$;

-- --- Access -----------------------------------------------------------------------------------------------------
alter table public.ai_teacher_handouts enable row level security;
alter table public.ai_teacher_quiz_sessions enable row level security;
alter table public.ai_teacher_quiz_players enable row level security;
alter table public.ai_teacher_quiz_answers enable row level security;
alter table public.ai_teacher_marking_batches enable row level security;
alter table public.ai_teacher_scripts enable row level security;
alter table public.ai_teacher_channels enable row level security;
alter table public.ai_teacher_channel_batches enable row level security;
alter table public.ai_teacher_channel_posts enable row level security;
alter table public.ai_teacher_listings enable row level security;
alter table public.ai_teacher_listing_ratings enable row level security;
alter table public.ai_teacher_listing_copies enable row level security;
alter table public.ai_teacher_listing_uses enable row level security;
alter table public.ai_teacher_seller_ledger enable row level security;
alter table public.ai_teacher_brand_profiles enable row level security;
alter table public.ai_teacher_results enable row level security;

-- No policies: browsers get nothing directly.
revoke all on public.ai_teacher_handouts, public.ai_teacher_quiz_sessions, public.ai_teacher_quiz_players, public.ai_teacher_quiz_answers,
  public.ai_teacher_marking_batches, public.ai_teacher_scripts, public.ai_teacher_channels, public.ai_teacher_channel_batches,
  public.ai_teacher_channel_posts, public.ai_teacher_listings, public.ai_teacher_listing_ratings, public.ai_teacher_listing_copies,
  public.ai_teacher_listing_uses, public.ai_teacher_seller_ledger, public.ai_teacher_brand_profiles, public.ai_teacher_results
  from anon, authenticated;
-- Totals that must stay exact change only through the functions.
revoke insert, update, delete, truncate on public.ai_teacher_quiz_answers, public.ai_teacher_listing_ratings, public.ai_teacher_listing_copies, public.ai_teacher_listing_uses from service_role;
revoke update, delete, truncate on public.ai_teacher_seller_ledger from service_role;

revoke all on function public.ai_teacher_quiz_answer(uuid, uuid, integer, text, boolean, integer) from public, anon, authenticated;
revoke all on function public.ai_teacher_rate_listing(uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.ai_teacher_add_copy(uuid, uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.ai_teacher_record_use(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.ai_teacher_ledger_guard() from public, anon, authenticated;
revoke all on function public.ai_teacher_rating_removed() from public, anon, authenticated;
grant execute on function public.ai_teacher_quiz_answer(uuid, uuid, integer, text, boolean, integer) to service_role;
grant execute on function public.ai_teacher_rate_listing(uuid, uuid, integer, text) to service_role;
grant execute on function public.ai_teacher_add_copy(uuid, uuid, uuid, uuid, integer) to service_role;
grant execute on function public.ai_teacher_record_use(uuid, uuid, text) to service_role;
