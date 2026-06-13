-- Education OS engine: action queue, lifecycle stage, and automation rules.

alter table public.academy_contacts
  add column if not exists lifecycle_stage text;

create index if not exists academy_contacts_lifecycle_stage_idx
  on public.academy_contacts(academy_id, lifecycle_stage);

create table if not exists public.academy_action_items (
  id                 uuid primary key default gen_random_uuid(),
  academy_id          uuid not null references public.tenants(id) on delete cascade,
  dedupe_key          text not null,
  source_type         text not null,
  priority            text not null default 'medium'
    check (priority in ('critical','high','medium','low')),
  title               text not null,
  description         text not null default '',
  recommended_action  text,
  contact_id          uuid references public.academy_contacts(id) on delete cascade,
  classroom_id        uuid references public.academy_classrooms(id) on delete cascade,
  due_at              timestamptz,
  status              text not null default 'open'
    check (status in ('open','snoozed','resolved','dismissed')),
  metadata            jsonb not null default '{}'::jsonb,
  created_by          uuid references public.users(id) on delete set null,
  resolved_by         uuid references public.users(id) on delete set null,
  resolved_at         timestamptz,
  resolution_note     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (academy_id, dedupe_key)
);

create index if not exists academy_action_items_academy_status_idx
  on public.academy_action_items(academy_id, status, priority, due_at);
create index if not exists academy_action_items_contact_idx
  on public.academy_action_items(contact_id);
create index if not exists academy_action_items_classroom_idx
  on public.academy_action_items(classroom_id);

alter table public.academy_action_items enable row level security;

drop policy if exists "Academy action items read by member" on public.academy_action_items;
create policy "Academy action items read by member"
  on public.academy_action_items for select
  using (public.is_academy_member(academy_id));

drop policy if exists "Academy action items manage by admin" on public.academy_action_items;
create policy "Academy action items manage by admin"
  on public.academy_action_items for all
  using (public.is_academy_admin(academy_id))
  with check (public.is_academy_admin(academy_id));

drop trigger if exists academy_action_items_updated_at on public.academy_action_items;
create trigger academy_action_items_updated_at
  before update on public.academy_action_items
  for each row execute procedure public.handle_teacher_studio_updated_at();

create table if not exists public.academy_automation_rules (
  id                uuid primary key default gen_random_uuid(),
  academy_id         uuid not null references public.tenants(id) on delete cascade,
  rule_key           text not null,
  name               text not null,
  description        text not null default '',
  channel            text not null default 'telegram'
    check (channel in ('telegram','email','inapp')),
  threshold          integer,
  is_active          boolean not null default true,
  metadata           jsonb not null default '{}'::jsonb,
  last_run_at        timestamptz,
  last_run_summary   jsonb not null default '{}'::jsonb,
  created_by         uuid references public.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (academy_id, rule_key)
);

create index if not exists academy_automation_rules_academy_idx
  on public.academy_automation_rules(academy_id, is_active);

alter table public.academy_automation_rules enable row level security;

drop policy if exists "Academy automation rules read by member" on public.academy_automation_rules;
create policy "Academy automation rules read by member"
  on public.academy_automation_rules for select
  using (public.is_academy_member(academy_id));

drop policy if exists "Academy automation rules manage by admin" on public.academy_automation_rules;
create policy "Academy automation rules manage by admin"
  on public.academy_automation_rules for all
  using (public.is_academy_admin(academy_id))
  with check (public.is_academy_admin(academy_id));

drop trigger if exists academy_automation_rules_updated_at on public.academy_automation_rules;
create trigger academy_automation_rules_updated_at
  before update on public.academy_automation_rules
  for each row execute procedure public.handle_teacher_studio_updated_at();
