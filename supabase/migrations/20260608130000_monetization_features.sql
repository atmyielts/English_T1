-- Monetization features: certificates, parent reports, score predictions, writing tutor

-- ── 1. Mock Exam Certificates ─────────────────────────────────────────────────

create table if not exists public.issued_certificates (
  id              uuid primary key default gen_random_uuid(),
  public_token    text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  user_id         uuid not null references public.users(id) on delete cascade,
  session_id      uuid references public.sessions(id) on delete set null,
  outcome_id      uuid references public.exam_outcomes(id) on delete set null,
  tenant_id       uuid references public.tenants(id) on delete set null,
  product_id      uuid references public.products(id) on delete set null,
  exam_type       text not null,              -- 'ielts', 'sat', 'toefl', 'itep', 'ielts-practice'
  overall_band    numeric,
  overall_score   numeric,
  section_scores  jsonb,
  candidate_name  text not null,
  exam_date       date not null default current_date,
  center_name     text,
  center_logo_url text,
  is_public       boolean not null default true,
  metadata        jsonb not null default '{}'::jsonb,
  issued_at       timestamptz not null default now(),
  expires_at      timestamptz                -- null = never expires
);

create index if not exists issued_certificates_user_idx    on public.issued_certificates(user_id);
create index if not exists issued_certificates_session_idx on public.issued_certificates(session_id);
create index if not exists issued_certificates_token_idx   on public.issued_certificates(public_token);

alter table public.issued_certificates enable row level security;

drop policy if exists "Certificates read by owner" on public.issued_certificates;
create policy "Certificates read by owner"
  on public.issued_certificates for select
  using (user_id = auth.uid());

drop policy if exists "Certificates insert by owner" on public.issued_certificates;
create policy "Certificates insert by owner"
  on public.issued_certificates for insert
  with check (user_id = auth.uid());

-- ── 2. Parent Report Tokens ───────────────────────────────────────────────────

create table if not exists public.parent_report_tokens (
  id          uuid primary key default gen_random_uuid(),
  token       text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  academy_id  uuid not null references public.tenants(id) on delete cascade,
  contact_id  uuid not null references public.academy_contacts(id) on delete cascade,
  created_by  uuid not null references public.users(id),
  label       text,             -- e.g. "Shared with Mom" for tracking
  expires_at  timestamptz,      -- null = never expires
  last_viewed_at timestamptz,
  view_count  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists parent_report_tokens_academy_idx  on public.parent_report_tokens(academy_id);
create index if not exists parent_report_tokens_contact_idx  on public.parent_report_tokens(contact_id);
create index if not exists parent_report_tokens_token_idx    on public.parent_report_tokens(token);

alter table public.parent_report_tokens enable row level security;

drop policy if exists "Parent tokens manage by admin" on public.parent_report_tokens;
create policy "Parent tokens manage by admin"
  on public.parent_report_tokens for all
  using (public.is_academy_admin(academy_id))
  with check (public.is_academy_admin(academy_id));

-- ── 3. Score Prediction Cache ─────────────────────────────────────────────────

create table if not exists public.score_predictions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  product_id      uuid references public.products(id) on delete set null,
  exam_type       text not null,
  predicted_band  numeric,
  confidence_low  numeric,
  confidence_high numeric,
  trend           text check (trend in ('improving','stable','declining')),
  data_points     integer not null default 0,
  computed_at     timestamptz not null default now(),
  metadata        jsonb not null default '{}'::jsonb,
  unique (user_id, exam_type)
);

create index if not exists score_predictions_user_idx on public.score_predictions(user_id);

alter table public.score_predictions enable row level security;

drop policy if exists "Score predictions read by owner" on public.score_predictions;
create policy "Score predictions read by owner"
  on public.score_predictions for select
  using (user_id = auth.uid());

drop policy if exists "Score predictions service write" on public.score_predictions;
create policy "Score predictions service write"
  on public.score_predictions for all
  using (true)
  with check (true);

-- ── 4. Writing Tutor Sessions (usage tracking) ────────────────────────────────

create table if not exists public.writing_tutor_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  tenant_id     uuid references public.tenants(id) on delete set null,
  exam_type     text not null default 'ielts',
  task_type     text,           -- 'task1', 'task2', null
  word_count    integer,
  overall_band  numeric,
  criteria      jsonb,          -- { TR, CC, LR, GRA }
  feedback      text,
  model         text,
  tokens_used   integer,
  created_at    timestamptz not null default now()
);

create index if not exists writing_tutor_sessions_user_idx on public.writing_tutor_sessions(user_id);
create index if not exists writing_tutor_sessions_date_idx on public.writing_tutor_sessions(user_id, created_at);

alter table public.writing_tutor_sessions enable row level security;

drop policy if exists "Writing tutor sessions read by owner" on public.writing_tutor_sessions;
create policy "Writing tutor sessions read by owner"
  on public.writing_tutor_sessions for select
  using (user_id = auth.uid());
