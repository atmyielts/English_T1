-- ============================================================================
-- TOEFL Playbook learner engine + 2026 band scale (additive)
-- ----------------------------------------------------------------------------
-- TOEFL iBT reports each section on a 1-6 band (0.5 steps) since January 2026;
-- overall = mean of the four, rounded to 0.5. The profile gains band columns.
-- The legacy 0-120 columns stay and are kept in sync by the edge function
-- (ETS Table 6 comparison). Existing rows were entered on the 0-120 scale, so
-- they are marked score_scale = 'legacy_120'.
-- Also: adopted plans + checklist items, section reading progress,
-- notes/highlights, AI section-coach threads and the new learner events.
-- ============================================================================
begin;
set local lock_timeout = '5s';

alter table public.toefl_playbook_user_profiles
  add column if not exists score_scale text,
  add column if not exists target_band numeric(2,1),
  add column if not exists current_band numeric(2,1),
  add column if not exists section_target_bands jsonb not null default '{}'::jsonb,
  add column if not exists section_current_bands jsonb not null default '{}'::jsonb,
  add column if not exists legacy_section_scores jsonb not null default '{}'::jsonb,
  add column if not exists weekly_hours integer;

update public.toefl_playbook_user_profiles set score_scale = 'legacy_120' where score_scale is null;
alter table public.toefl_playbook_user_profiles alter column score_scale set default 'band_2026';
alter table public.toefl_playbook_user_profiles alter column score_scale set not null;

alter table public.toefl_playbook_user_profiles drop constraint if exists toefl_playbook_user_profiles_band_ranges;
alter table public.toefl_playbook_user_profiles add constraint toefl_playbook_user_profiles_band_ranges
  check (
    score_scale in ('band_2026', 'legacy_120')
    and (target_band is null or (target_band between 1 and 6 and target_band * 2 = round(target_band * 2)))
    and (current_band is null or (current_band between 1 and 6 and current_band * 2 = round(current_band * 2)))
    and (weekly_hours is null or weekly_hours between 0 and 80)
  );

-- Learner plan adopted from a template, with the schedule adapted to the test date.
create table if not exists public.toefl_playbook_user_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  plan_template_id uuid references public.toefl_playbook_plan_templates(id) on delete set null,
  template_slug text not null,
  start_date date not null,
  test_date date,
  status text not null default 'active' check (status in ('active', 'archived', 'completed')),
  schedule jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists toefl_playbook_user_plans_one_active
  on public.toefl_playbook_user_plans(user_id, product_id)
  where status = 'active';

-- Checklist rows: tasks of an adopted plan, or modules added with "Add to my plan".
create table if not exists public.toefl_playbook_user_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  user_plan_id uuid references public.toefl_playbook_user_plans(id) on delete cascade,
  kind text not null check (kind in ('module', 'task')),
  page_slug text,
  title text not null default '',
  week_number integer check (week_number is null or week_number between 1 and 60),
  due_date date,
  status text not null default 'todo' check (status in ('todo', 'done')),
  done_at timestamptz,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists toefl_playbook_user_plan_items_user_idx
  on public.toefl_playbook_user_plan_items(user_id, product_id, sort_order);

create index if not exists toefl_playbook_user_plan_items_plan_idx
  on public.toefl_playbook_user_plan_items(user_plan_id, week_number, sort_order);

create unique index if not exists toefl_playbook_user_plan_items_module_unique
  on public.toefl_playbook_user_plan_items(user_id, product_id, page_slug)
  where kind = 'module' and user_plan_id is null;

-- Sections a learner marked as read.
create table if not exists public.toefl_playbook_section_progress (
  user_id uuid not null references public.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  page_id uuid not null references public.toefl_playbook_pages(id) on delete cascade,
  section_id text not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, page_id, section_id)
);

create index if not exists toefl_playbook_section_progress_user_idx
  on public.toefl_playbook_section_progress(user_id, product_id);

-- Notes and highlights (same shape as the IELTS Playbook).
create table if not exists public.toefl_playbook_user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  page_id uuid not null references public.toefl_playbook_pages(id) on delete cascade,
  section_id text,
  anchor_text text not null default '',
  body text not null default '',
  color text not null default 'amber' check (color in ('amber', 'green', 'blue', 'pink')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists toefl_playbook_user_notes_user_idx
  on public.toefl_playbook_user_notes(user_id, product_id, updated_at desc);

create index if not exists toefl_playbook_user_notes_page_idx
  on public.toefl_playbook_user_notes(user_id, page_id);

-- AI section coach threads.
create table if not exists public.toefl_playbook_section_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  page_id uuid not null references public.toefl_playbook_pages(id) on delete cascade,
  section_id text not null,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, page_id, section_id)
);

-- New learner events (superset of the original list, so existing rows stay valid).
-- Drop whichever check currently restricts event_name (normally the inline
-- toefl_playbook_events_event_name_check) before adding the wider one.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.toefl_playbook_events'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%event_name%'
  loop
    execute format('alter table public.toefl_playbook_events drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.toefl_playbook_events add constraint toefl_playbook_events_event_name_check
  check (event_name in (
    'page_view',
    'premium_gate_seen',
    'premium_gate_clicked',
    'onboarding_completed',
    'recommendation_generated',
    'simulator_referral_opened',
    'practice_referral_opened',
    'resource_clicked',
    'official_source_clicked',
    'module_open',
    'section_complete',
    'diagnostic_run',
    'plan_adopted',
    'note_saved',
    'practice_click',
    'upgrade_click'
  ));

-- Supports the per-minute cap on anonymous events.
create index if not exists toefl_playbook_events_anon_idx
  on public.toefl_playbook_events(product_id, occurred_at desc)
  where user_id is null;

-- updated_at triggers
drop trigger if exists toefl_playbook_user_plans_updated_at on public.toefl_playbook_user_plans;
create trigger toefl_playbook_user_plans_updated_at before update on public.toefl_playbook_user_plans
for each row execute procedure public.handle_user_updated_at();

drop trigger if exists toefl_playbook_user_plan_items_updated_at on public.toefl_playbook_user_plan_items;
create trigger toefl_playbook_user_plan_items_updated_at before update on public.toefl_playbook_user_plan_items
for each row execute procedure public.handle_user_updated_at();

drop trigger if exists toefl_playbook_user_notes_updated_at on public.toefl_playbook_user_notes;
create trigger toefl_playbook_user_notes_updated_at before update on public.toefl_playbook_user_notes
for each row execute procedure public.handle_user_updated_at();

drop trigger if exists toefl_playbook_section_threads_updated_at on public.toefl_playbook_section_threads;
create trigger toefl_playbook_section_threads_updated_at before update on public.toefl_playbook_section_threads
for each row execute procedure public.handle_user_updated_at();

-- Row-level security: owners read/write their own rows; admins manage. The
-- edge function uses the service role and scopes every query to the caller.
alter table public.toefl_playbook_user_plans enable row level security;
alter table public.toefl_playbook_user_plan_items enable row level security;
alter table public.toefl_playbook_section_progress enable row level security;
alter table public.toefl_playbook_user_notes enable row level security;
alter table public.toefl_playbook_section_threads enable row level security;

drop policy if exists "TOEFL playbook user plans own" on public.toefl_playbook_user_plans;
create policy "TOEFL playbook user plans own" on public.toefl_playbook_user_plans for all
using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "TOEFL playbook plan items own" on public.toefl_playbook_user_plan_items;
create policy "TOEFL playbook plan items own" on public.toefl_playbook_user_plan_items for all
using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "TOEFL playbook section progress own" on public.toefl_playbook_section_progress;
create policy "TOEFL playbook section progress own" on public.toefl_playbook_section_progress for all
using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "TOEFL playbook notes own" on public.toefl_playbook_user_notes;
create policy "TOEFL playbook notes own" on public.toefl_playbook_user_notes for all
using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "TOEFL playbook section threads own" on public.toefl_playbook_section_threads;
create policy "TOEFL playbook section threads own" on public.toefl_playbook_section_threads for all
using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id or public.is_admin());

commit;
