-- Features 5–11: Speaking Coach, Learning Path, Vocab Drill,
--   Peer Writing Review, White-label Branding, Corporate Assessment,
--   Teacher Marketplace

-- ── 5. Speaking Coach ─────────────────────────────────────────────────────────

create table if not exists public.speaking_coach_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  tenant_id     uuid references public.tenants(id) on delete set null,
  topic         text,
  task_type     text not null default 'part2'
    check (task_type in ('part1','part2','part3','free')),
  transcript    text not null,
  word_count    integer,
  overall_band  numeric,
  criteria      jsonb,  -- { FC, LR, GRA, P }
  feedback      text,
  model         text,
  duration_secs integer,
  created_at    timestamptz not null default now()
);
create index if not exists speaking_coach_user_idx on public.speaking_coach_sessions(user_id);
alter table public.speaking_coach_sessions enable row level security;
drop policy if exists "Speaking sessions owner" on public.speaking_coach_sessions;
create policy "Speaking sessions owner" on public.speaking_coach_sessions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── 6. Learning Path ──────────────────────────────────────────────────────────

create table if not exists public.learning_path_plans (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  exam_type      text not null default 'ielts',
  target_band    numeric,
  current_band   numeric,
  weeks          integer not null default 4,
  status         text not null default 'active' check (status in ('active','completed','archived')),
  generated_at   timestamptz not null default now(),
  metadata       jsonb not null default '{}'::jsonb
);
create index if not exists learning_path_user_idx on public.learning_path_plans(user_id);

create table if not exists public.learning_path_items (
  id           uuid primary key default gen_random_uuid(),
  plan_id      uuid not null references public.learning_path_plans(id) on delete cascade,
  user_id      uuid not null,
  week         integer not null,
  day          integer,   -- 1-7, null = any day that week
  skill        text not null,  -- reading, writing, listening, speaking, vocabulary, grammar
  activity     text not null,
  description  text,
  resource_url text,
  duration_min integer,
  completed    boolean not null default false,
  completed_at timestamptz,
  position     integer not null default 0
);
create index if not exists learning_path_items_plan_idx on public.learning_path_items(plan_id);

alter table public.learning_path_plans enable row level security;
alter table public.learning_path_items  enable row level security;
drop policy if exists "LP plans owner" on public.learning_path_plans;
create policy "LP plans owner" on public.learning_path_plans for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "LP items owner" on public.learning_path_items;
create policy "LP items owner" on public.learning_path_items for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── 7. Vocabulary Adaptive Drill ─────────────────────────────────────────────

create table if not exists public.vocab_drill_decks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  name       text not null default 'IELTS Academic',
  source     text not null default 'ielts_awl',
  created_at timestamptz not null default now()
);
create index if not exists vocab_deck_user_idx on public.vocab_drill_decks(user_id);

create table if not exists public.vocab_drill_cards (
  id           uuid primary key default gen_random_uuid(),
  deck_id      uuid not null references public.vocab_drill_decks(id) on delete cascade,
  user_id      uuid not null,
  word         text not null,
  definition   text not null,
  example      text,
  -- SM-2 fields
  interval     integer not null default 1,   -- days until next review
  ease_factor  numeric not null default 2.5,
  repetitions  integer not null default 0,
  next_review  date not null default current_date,
  last_review  date,
  created_at   timestamptz not null default now(),
  unique (deck_id, word)
);
create index if not exists vocab_cards_user_due on public.vocab_drill_cards(user_id, next_review);
create index if not exists vocab_cards_deck_idx on public.vocab_drill_cards(deck_id);

alter table public.vocab_drill_decks enable row level security;
alter table public.vocab_drill_cards  enable row level security;
drop policy if exists "Vocab decks owner" on public.vocab_drill_decks;
create policy "Vocab decks owner" on public.vocab_drill_decks for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Vocab cards owner" on public.vocab_drill_cards;
create policy "Vocab cards owner" on public.vocab_drill_cards for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── 8. Peer Writing Review ────────────────────────────────────────────────────

create table if not exists public.peer_review_submissions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  tenant_id       uuid references public.tenants(id) on delete set null,
  exam_type       text not null default 'ielts',
  task_type       text not null default 'task2',
  prompt_text     text,
  essay_text      text not null,
  word_count      integer,
  target_band     numeric,
  status          text not null default 'pending_review'
    check (status in ('pending_review','reviewing','reviewed','closed')),
  reviews_needed  integer not null default 2,
  reviews_count   integer not null default 0,
  ai_band         numeric,        -- optional AI pre-score
  created_at      timestamptz not null default now()
);
create index if not exists peer_sub_user_idx   on public.peer_review_submissions(user_id);
create index if not exists peer_sub_status_idx on public.peer_review_submissions(status, created_at);

create table if not exists public.peer_reviews (
  id              uuid primary key default gen_random_uuid(),
  submission_id   uuid not null references public.peer_review_submissions(id) on delete cascade,
  reviewer_id     uuid not null references public.users(id) on delete cascade,
  band_score      numeric,
  criteria        jsonb,  -- { TR, CC, LR, GRA }
  strengths       text,
  improvements    text,
  overall_comment text,
  is_helpful      boolean,   -- rated by submitter
  status          text not null default 'submitted'
    check (status in ('submitted','helpful','not_helpful')),
  created_at      timestamptz not null default now(),
  unique (submission_id, reviewer_id)
);
create index if not exists peer_review_sub_idx      on public.peer_reviews(submission_id);
create index if not exists peer_review_reviewer_idx on public.peer_reviews(reviewer_id);

alter table public.peer_review_submissions enable row level security;
alter table public.peer_reviews             enable row level security;

drop policy if exists "Peer subs: read open + own" on public.peer_review_submissions;
create policy "Peer subs: read open + own" on public.peer_review_submissions
  for select using (user_id = auth.uid() or status = 'pending_review');

drop policy if exists "Peer subs: insert own" on public.peer_review_submissions;
create policy "Peer subs: insert own" on public.peer_review_submissions
  for insert with check (user_id = auth.uid());

drop policy if exists "Peer reviews: read" on public.peer_reviews;
create policy "Peer reviews: read" on public.peer_reviews
  for select using (reviewer_id = auth.uid() or
    exists (select 1 from public.peer_review_submissions s where s.id = submission_id and s.user_id = auth.uid()));

drop policy if exists "Peer reviews: insert" on public.peer_reviews;
create policy "Peer reviews: insert" on public.peer_reviews
  for insert with check (reviewer_id = auth.uid());

-- ── 9. White-label Branding ───────────────────────────────────────────────────

create table if not exists public.academy_branding (
  id               uuid primary key default gen_random_uuid(),
  academy_id       uuid not null unique references public.tenants(id) on delete cascade,
  display_name     text,
  tagline          text,
  logo_url         text,
  favicon_url      text,
  primary_color    text,   -- hex e.g. #1a73e8
  accent_color     text,
  hide_schood_logo boolean not null default false,
  custom_domain    text unique,
  custom_domain_verified boolean not null default false,
  footer_text      text,
  metadata         jsonb not null default '{}'::jsonb,
  updated_at       timestamptz not null default now()
);
create index if not exists branding_academy_idx on public.academy_branding(academy_id);
alter table public.academy_branding enable row level security;
drop policy if exists "Branding read by member" on public.academy_branding;
create policy "Branding read by member" on public.academy_branding
  for select using (public.is_academy_member(academy_id));
drop policy if exists "Branding manage by admin" on public.academy_branding;
create policy "Branding manage by admin" on public.academy_branding
  for all using (public.is_academy_admin(academy_id))
  with check (public.is_academy_admin(academy_id));

-- ── 10. Corporate Assessment ──────────────────────────────────────────────────

create table if not exists public.corporate_assessments (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  title            text not null,
  description      text,
  exam_type        text not null default 'ielts',
  experience_id    uuid,
  passing_band     numeric,
  status           text not null default 'active' check (status in ('active','paused','closed')),
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists corp_assess_tenant on public.corporate_assessments(tenant_id);

create table if not exists public.corporate_candidates (
  id               uuid primary key default gen_random_uuid(),
  assessment_id    uuid not null references public.corporate_assessments(id) on delete cascade,
  tenant_id        uuid not null,
  email            text not null,
  full_name        text,
  invite_token     text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  user_id          uuid references public.users(id) on delete set null,
  session_id       uuid references public.sessions(id) on delete set null,
  outcome_id       uuid references public.exam_outcomes(id) on delete set null,
  overall_band     numeric,
  overall_score    numeric,
  status           text not null default 'invited'
    check (status in ('invited','started','completed','expired')),
  invited_at       timestamptz not null default now(),
  completed_at     timestamptz,
  expires_at       timestamptz,
  certificate_token text
);
create index if not exists corp_cand_assess    on public.corporate_candidates(assessment_id);
create index if not exists corp_cand_token     on public.corporate_candidates(invite_token);
create index if not exists corp_cand_email     on public.corporate_candidates(assessment_id, email);

alter table public.corporate_assessments enable row level security;
alter table public.corporate_candidates  enable row level security;
drop policy if exists "Corp assess admin" on public.corporate_assessments;
create policy "Corp assess admin" on public.corporate_assessments for all
  using (public.is_academy_admin(tenant_id)) with check (public.is_academy_admin(tenant_id));
drop policy if exists "Corp cand admin" on public.corporate_candidates;
create policy "Corp cand admin" on public.corporate_candidates for all
  using (public.is_academy_admin(tenant_id)) with check (public.is_academy_admin(tenant_id));

-- ── 11. Teacher Marketplace ───────────────────────────────────────────────────

create table if not exists public.teacher_profiles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references public.users(id) on delete cascade,
  full_name     text not null,
  bio           text,
  avatar_url    text,
  subjects      text[] default '{}',   -- e.g. ['ielts','sat','english']
  languages     text[] default '{}',
  location      text,
  timezone      text,
  hourly_rate   integer,               -- UZS per hour, null = negotiable
  currency      text default 'UZS',
  available     boolean not null default true,
  experience_years integer,
  certifications text[],
  is_public     boolean not null default true,
  verified      boolean not null default false,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists teacher_profile_public on public.teacher_profiles(is_public, available);

create table if not exists public.job_listings (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  title         text not null,
  description   text,
  subjects      text[] default '{}',
  employment_type text not null default 'part_time'
    check (employment_type in ('full_time','part_time','contract','freelance')),
  salary_min    integer,
  salary_max    integer,
  currency      text default 'UZS',
  location      text,
  remote_ok     boolean not null default false,
  status        text not null default 'open' check (status in ('open','filled','closed')),
  created_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz
);
create index if not exists job_listing_tenant on public.job_listings(tenant_id);
create index if not exists job_listing_open   on public.job_listings(status, created_at);

create table if not exists public.job_applications (
  id             uuid primary key default gen_random_uuid(),
  listing_id     uuid not null references public.job_listings(id) on delete cascade,
  teacher_id     uuid not null references public.teacher_profiles(id) on delete cascade,
  cover_note     text,
  status         text not null default 'pending'
    check (status in ('pending','shortlisted','rejected','hired')),
  applied_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (listing_id, teacher_id)
);
create index if not exists job_app_listing on public.job_applications(listing_id);
create index if not exists job_app_teacher on public.job_applications(teacher_id);

alter table public.teacher_profiles  enable row level security;
alter table public.job_listings       enable row level security;
alter table public.job_applications   enable row level security;

drop policy if exists "Teacher profiles: public read" on public.teacher_profiles;
create policy "Teacher profiles: public read" on public.teacher_profiles
  for select using (is_public = true or user_id = auth.uid());

drop policy if exists "Teacher profiles: own manage" on public.teacher_profiles;
create policy "Teacher profiles: own manage" on public.teacher_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Job listings: public read" on public.job_listings;
create policy "Job listings: public read" on public.job_listings
  for select using (status = 'open' or public.is_academy_member(tenant_id));

drop policy if exists "Job listings: admin manage" on public.job_listings;
create policy "Job listings: admin manage" on public.job_listings
  for all using (public.is_academy_admin(tenant_id)) with check (public.is_academy_admin(tenant_id));

drop policy if exists "Job apps: teacher own" on public.job_applications;
create policy "Job apps: teacher own" on public.job_applications
  for all using (
    teacher_id in (select id from public.teacher_profiles where user_id = auth.uid())
    or public.is_academy_admin((select tenant_id from public.job_listings where id = listing_id))
  ) with check (
    teacher_id in (select id from public.teacher_profiles where user_id = auth.uid())
  );

-- updated_at triggers for new tables
drop trigger if exists teacher_profiles_updated_at on public.teacher_profiles;
create trigger teacher_profiles_updated_at before update on public.teacher_profiles
  for each row execute procedure public.handle_teacher_studio_updated_at();

drop trigger if exists job_applications_updated_at on public.job_applications;
create trigger job_applications_updated_at before update on public.job_applications
  for each row execute procedure public.handle_teacher_studio_updated_at();
