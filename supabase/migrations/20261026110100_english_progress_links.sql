-- Read-only progress links for parents and teachers, and the weekly report log.
-- ============================================================================
--   english_progress_links          a learner's revocable link /p/:token. Only
--                                   a SHA-256 hash of the token is stored; the
--                                   learner sees the link once when creating it.
--   english_progress_link_watchers  Telegram chats (a parent or teacher) that
--                                   started @schoodstudentbot with the link and
--                                   get the weekly report. Revoking the link
--                                   stops them too.
--   english_weekly_report_log       one row per learner and week once the
--                                   Sunday report went out (hub/weekly-report.ts).
-- Service role only: no grants.
-- ============================================================================

create table if not exists public.english_progress_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  -- Last four characters of the token, so the learner can tell links apart.
  token_hint text not null check (token_hint ~ '^[A-Za-z0-9_-]{4}$'),
  label text check (label is null or length(label) <= 40),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer not null default 0 check (view_count >= 0),
  constraint english_progress_links_token_unique unique (token_hash)
);

create index if not exists english_progress_links_user_idx
  on public.english_progress_links (user_id, language_id, created_at desc);

alter table public.english_progress_links enable row level security;
revoke all on public.english_progress_links from anon, authenticated;

create table if not exists public.english_progress_link_watchers (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.english_progress_links(id) on delete cascade,
  chat_id text not null check (chat_id ~ '^-?[0-9]{1,20}$'),
  -- Language of the follower's Telegram app, for the report text.
  locale text not null default 'en' check (locale in ('en', 'ru', 'uz')),
  created_at timestamptz not null default now(),
  stopped_at timestamptz,
  constraint english_progress_link_watchers_unique unique (link_id, chat_id)
);

create index if not exists english_progress_link_watchers_active_idx
  on public.english_progress_link_watchers (link_id)
  where stopped_at is null;

alter table public.english_progress_link_watchers enable row level security;
revoke all on public.english_progress_link_watchers from anon, authenticated;

create table if not exists public.english_weekly_report_log (
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  -- Learner-local Monday of the reported week.
  week_start date not null,
  sent_at timestamptz not null default now(),
  learner_sent boolean not null default false,
  watchers_sent integer not null default 0 check (watchers_sent >= 0),
  primary key (user_id, language_id, week_start)
);

alter table public.english_weekly_report_log enable row level security;
revoke all on public.english_weekly_report_log from anon, authenticated;
