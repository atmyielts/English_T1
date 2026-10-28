-- English classes for teachers and learning centres (Schood English).
-- ============================================================================
-- A lightweight class inside Schood English, separate from the Academy LMS
-- (academy_classrooms etc. are tenant-scoped centre software; these tables are
-- personal: any signed-in user can open a class and become its teacher).
--
--   english_classes             one class: name, level, optional school name,
--                               a short join code, archived or not
--   english_class_members       learners in a class; joining records consent,
--                               leaving or removal keeps the row (status)
--   english_class_assignments   lessons, "N activities in a skill", a role-play
--                               or the speaking mock, with a due date
--
-- Progress is never stored here: completion is computed from learning_attempts
-- (supabase/functions/_shared/english-classes.ts). Everything is read and
-- written only by the hub edge function (service role), which checks teacher
-- vs member server-side. No grants to anon/authenticated.
-- ============================================================================

create table if not exists public.english_classes (
  id uuid primary key default gen_random_uuid(),
  language_id uuid not null references public.languages(id) on delete cascade,
  teacher_id uuid not null references public.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  level text check (level is null or level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  school_name text check (school_name is null or char_length(school_name) <= 120),
  -- 6 characters from an alphabet without look-alikes (no 0/O, 1/I/L).
  join_code text not null check (join_code ~ '^[A-HJKMNP-Z2-9]{6}$'),
  status text not null default 'active' check (status in ('active', 'archived')),
  -- Weekly digest to the teacher in Telegram (in-app digest is always there).
  digest_telegram boolean not null default false,
  digest_locale text not null default 'en' check (digest_locale in ('en', 'ru', 'uz')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint english_classes_join_code_unique unique (join_code)
);

create index if not exists english_classes_teacher_idx
  on public.english_classes (teacher_id, status);

alter table public.english_classes enable row level security;
revoke all on public.english_classes from public, anon, authenticated;
grant select, insert, update, delete on public.english_classes to service_role;

create table if not exists public.english_class_members (
  class_id uuid not null references public.english_classes(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'left', 'removed')),
  joined_at timestamptz not null default now(),
  -- When the learner accepted "your teacher will see your level, activity and scores".
  consented_at timestamptz not null default now(),
  left_at timestamptz,
  -- The join code at the time of removal: that code can no longer bring them back.
  removed_code text,
  primary key (class_id, user_id)
);

create index if not exists english_class_members_user_idx
  on public.english_class_members (user_id, status);

alter table public.english_class_members enable row level security;
revoke all on public.english_class_members from public, anon, authenticated;
grant select, insert, update, delete on public.english_class_members to service_role;

create table if not exists public.english_class_assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.english_classes(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  kind text not null check (kind in ('lessons', 'skill_count', 'roleplay', 'speaking_mock')),
  -- The teacher's own title; null = described from kind/skill/count in the learner's language.
  title text check (title is null or char_length(title) between 1 and 120),
  skill text check (skill is null or skill in ('reading', 'listening', 'writing', 'speaking', 'grammar', 'vocabulary', 'immersion')),
  level text check (level is null or level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  required_count integer not null default 1 check (required_count between 1 and 20),
  content_item_ids uuid[] not null default '{}' check (cardinality(content_item_ids) <= 10),
  scenario_id text check (scenario_id is null or scenario_id ~ '^[a-z0-9-]{2,64}$'),
  note text check (note is null or char_length(note) <= 280),
  -- End of the due day in learner time (UTC+5).
  due_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- Cancelled by the teacher.
  archived_at timestamptz
);

create index if not exists english_class_assignments_class_idx
  on public.english_class_assignments (class_id, due_at desc)
  where archived_at is null;

create index if not exists english_class_assignments_due_idx
  on public.english_class_assignments (due_at)
  where archived_at is null;

alter table public.english_class_assignments enable row level security;
revoke all on public.english_class_assignments from public, anon, authenticated;
grant select, insert, update, delete on public.english_class_assignments to service_role;

-- Joins (or re-joins) a class without overfilling it: serialised per class.
-- Returns 'joined', 'already_member', 'removed', 'class_full' or 'not_found'.
create or replace function public.english_class_join(
  p_class_id uuid,
  p_user_id uuid,
  p_code text,
  p_max_students integer
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.english_class_members%rowtype;
  v_active integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('english_class_join:' || p_class_id::text, 0));
  if not exists (select 1 from public.english_classes where id = p_class_id and status = 'active') then
    return 'not_found';
  end if;
  select * into v_member from public.english_class_members where class_id = p_class_id and user_id = p_user_id;
  if found and v_member.status = 'active' then
    return 'already_member';
  end if;
  if found and v_member.status = 'removed' and v_member.removed_code = p_code then
    return 'removed';
  end if;
  select count(*) into v_active from public.english_class_members where class_id = p_class_id and status = 'active';
  if v_active >= greatest(1, p_max_students) then
    return 'class_full';
  end if;
  insert into public.english_class_members (class_id, user_id, status, joined_at, consented_at, left_at, removed_code)
  values (p_class_id, p_user_id, 'active', now(), now(), null, null)
  on conflict (class_id, user_id) do update
    set status = 'active', joined_at = now(), consented_at = now(), left_at = null, removed_code = null;
  return 'joined';
end;
$$;

revoke all on function public.english_class_join(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.english_class_join(uuid, uuid, text, integer) to service_role;
