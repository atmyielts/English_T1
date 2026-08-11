-- SCHood Education Business OS — Phase A
-- Branches, rooms, admissions CRM, pipeline history, follow-ups, trials,
-- and idempotent lead conversion into the existing contact/enrollment model.

create unique index if not exists academy_contacts_academy_id_id_uidx
  on public.academy_contacts (academy_id, id);
create unique index if not exists academy_classrooms_academy_id_id_uidx
  on public.academy_classrooms (academy_id, id);

create or replace function public.academy_org_can_view(target_academy_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.tenant_memberships m
      where m.tenant_id = target_academy_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
    or exists (
      select 1
      from public.academy_role_grants g
      where g.academy_id = target_academy_id
        and g.user_id = auth.uid()
        and g.status in ('invited', 'active')
        and g.starts_at <= now()
        and (g.expires_at is null or g.expires_at > now())
    );
$$;

create or replace function public.academy_org_can_manage(target_academy_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.tenant_memberships m
      where m.tenant_id = target_academy_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
    or exists (
      select 1
      from public.academy_role_grants g
      where g.academy_id = target_academy_id
        and g.user_id = auth.uid()
        and g.role in ('owner', 'admin', 'center_admin', 'manager')
        and g.status in ('invited', 'active')
        and g.starts_at <= now()
        and (g.expires_at is null or g.expires_at > now())
    );
$$;

create or replace function public.academy_crm_can_access(target_academy_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.tenant_memberships m
      where m.tenant_id = target_academy_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
    or exists (
      select 1
      from public.academy_role_grants g
      where g.academy_id = target_academy_id
        and g.user_id = auth.uid()
        and g.role in ('owner', 'admin', 'center_admin', 'manager', 'counselor')
        and g.status in ('invited', 'active')
        and g.starts_at <= now()
        and (g.expires_at is null or g.expires_at > now())
    );
$$;

create table if not exists public.academy_branches (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  branch_key text not null,
  name text not null,
  address text,
  phone text,
  timezone text not null default 'Asia/Tashkent',
  currency text not null default 'UZS',
  capacity integer check (capacity is null or capacity >= 0),
  is_default boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academy_id, branch_key),
  unique (academy_id, id)
);

create unique index if not exists academy_branches_one_default_idx
  on public.academy_branches (academy_id)
  where is_default;
create index if not exists academy_branches_active_idx
  on public.academy_branches (academy_id, is_active, name);

create table if not exists public.academy_rooms (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null,
  room_key text not null,
  name text not null,
  capacity integer not null default 1 check (capacity > 0),
  room_type text not null default 'classroom'
    check (room_type in ('classroom', 'lab', 'meeting', 'office', 'online', 'other')),
  is_active boolean not null default true,
  features jsonb not null default '[]'::jsonb check (jsonb_typeof(features) = 'array'),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academy_id, branch_id, room_key),
  unique (academy_id, id),
  unique (academy_id, branch_id, id),
  foreign key (academy_id, branch_id)
    references public.academy_branches (academy_id, id) on delete restrict
);

create index if not exists academy_rooms_branch_active_idx
  on public.academy_rooms (academy_id, branch_id, is_active, name);

create table if not exists public.academy_lead_sources (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  source_key text not null,
  label_i18n jsonb not null default '{}'::jsonb check (jsonb_typeof(label_i18n) = 'object'),
  category text not null default 'other',
  is_system boolean not null default false,
  is_active boolean not null default true,
  position integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academy_id, source_key),
  unique (academy_id, id)
);

create table if not exists public.academy_sales_pipelines (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  pipeline_key text not null,
  name_i18n jsonb not null default '{}'::jsonb check (jsonb_typeof(name_i18n) = 'object'),
  is_default boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academy_id, pipeline_key),
  unique (academy_id, id)
);

create unique index if not exists academy_sales_pipelines_one_default_idx
  on public.academy_sales_pipelines (academy_id)
  where is_default;

create table if not exists public.academy_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  pipeline_id uuid not null,
  stage_key text not null,
  label_i18n jsonb not null default '{}'::jsonb check (jsonb_typeof(label_i18n) = 'object'),
  position integer not null check (position >= 0),
  probability_percent integer not null default 0 check (probability_percent between 0 and 100),
  terminal_kind text check (terminal_kind is null or terminal_kind in ('won', 'lost')),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academy_id, pipeline_id, stage_key),
  unique (academy_id, pipeline_id, id),
  foreign key (academy_id, pipeline_id)
    references public.academy_sales_pipelines (academy_id, id) on delete cascade
);

create index if not exists academy_pipeline_stages_order_idx
  on public.academy_pipeline_stages (academy_id, pipeline_id, position);

create table if not exists public.academy_pipeline_transitions (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  pipeline_id uuid not null,
  from_stage_id uuid not null,
  to_stage_id uuid not null,
  is_active boolean not null default true,
  requires_reason boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (academy_id, pipeline_id, from_stage_id, to_stage_id),
  foreign key (academy_id, pipeline_id)
    references public.academy_sales_pipelines (academy_id, id) on delete cascade,
  foreign key (academy_id, pipeline_id, from_stage_id)
    references public.academy_pipeline_stages (academy_id, pipeline_id, id) on delete cascade,
  foreign key (academy_id, pipeline_id, to_stage_id)
    references public.academy_pipeline_stages (academy_id, pipeline_id, id) on delete cascade,
  check (from_stage_id <> to_stage_id)
);

create table if not exists public.academy_leads (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid,
  preferred_branch_id uuid,
  pipeline_id uuid not null,
  current_stage_id uuid not null,
  source_id uuid,
  assigned_user_id uuid references public.users(id) on delete set null,
  responsible_user_id uuid references public.users(id) on delete set null,
  full_name text not null,
  phone text,
  telegram text,
  email text,
  parent_name text,
  parent_phone text,
  age integer check (age is null or age between 1 and 120),
  interested_course text,
  preferred_teacher_id uuid references public.users(id) on delete set null,
  preferred_schedule text,
  preferred_lesson_time time,
  expected_price bigint check (expected_price is null or expected_price >= 0),
  currency text not null default 'UZS',
  campaign text,
  referral_source text,
  notes text,
  tags jsonb not null default '[]'::jsonb check (jsonb_typeof(tags) = 'array'),
  estimated_probability integer check (estimated_probability is null or estimated_probability between 0 and 100),
  status text not null default 'open' check (status in ('open', 'lost', 'converted')),
  lost_reason text,
  last_contacted_at timestamptz,
  next_follow_up_at timestamptz,
  converted_at timestamptz,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academy_id, id),
  foreign key (academy_id, branch_id)
    references public.academy_branches (academy_id, id) on delete restrict,
  foreign key (academy_id, preferred_branch_id)
    references public.academy_branches (academy_id, id) on delete restrict,
  foreign key (academy_id, source_id)
    references public.academy_lead_sources (academy_id, id) on delete restrict,
  foreign key (academy_id, pipeline_id)
    references public.academy_sales_pipelines (academy_id, id) on delete restrict,
  foreign key (academy_id, pipeline_id, current_stage_id)
    references public.academy_pipeline_stages (academy_id, pipeline_id, id) on delete restrict,
  check (phone is not null or telegram is not null or email is not null)
);

create unique index if not exists academy_leads_idempotency_idx
  on public.academy_leads (academy_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists academy_leads_pipeline_idx
  on public.academy_leads (academy_id, pipeline_id, current_stage_id, status, created_at desc);
create index if not exists academy_leads_follow_up_idx
  on public.academy_leads (academy_id, next_follow_up_at)
  where status = 'open';
create index if not exists academy_leads_owner_idx
  on public.academy_leads (academy_id, assigned_user_id, status);
create index if not exists academy_leads_contact_lookup_idx
  on public.academy_leads (academy_id, lower(email), phone);

create table if not exists public.academy_lead_stage_history (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  lead_id uuid not null,
  pipeline_id uuid not null,
  from_stage_id uuid,
  to_stage_id uuid not null,
  responsible_user_id uuid references public.users(id) on delete set null,
  reason text,
  notes text,
  entered_at timestamptz not null default now(),
  exited_at timestamptz,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (academy_id, id),
  foreign key (academy_id, lead_id)
    references public.academy_leads (academy_id, id) on delete restrict,
  foreign key (academy_id, pipeline_id)
    references public.academy_sales_pipelines (academy_id, id) on delete restrict,
  foreign key (academy_id, pipeline_id, from_stage_id)
    references public.academy_pipeline_stages (academy_id, pipeline_id, id) on delete restrict,
  foreign key (academy_id, pipeline_id, to_stage_id)
    references public.academy_pipeline_stages (academy_id, pipeline_id, id) on delete restrict
);

create unique index if not exists academy_lead_stage_history_idempotency_idx
  on public.academy_lead_stage_history (academy_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists academy_lead_stage_history_timeline_idx
  on public.academy_lead_stage_history (academy_id, lead_id, entered_at desc);

create table if not exists public.academy_lead_activities (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  lead_id uuid not null,
  activity_type text not null
    check (activity_type in ('follow_up', 'call', 'telegram', 'sms', 'email', 'meeting', 'note', 'task', 'other')),
  method text check (method is null or method in ('call', 'telegram', 'sms', 'email', 'in_person', 'other')),
  status text not null default 'planned' check (status in ('planned', 'completed', 'cancelled', 'missed')),
  assigned_user_id uuid references public.users(id) on delete set null,
  due_at timestamptz,
  completed_at timestamptz,
  outcome text,
  notes text,
  next_follow_up_at timestamptz,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academy_id, id),
  foreign key (academy_id, lead_id)
    references public.academy_leads (academy_id, id) on delete restrict
);

create unique index if not exists academy_lead_activities_idempotency_idx
  on public.academy_lead_activities (academy_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists academy_lead_activities_queue_idx
  on public.academy_lead_activities (academy_id, status, due_at, assigned_user_id);

create table if not exists public.academy_trial_lessons (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  lead_id uuid not null,
  branch_id uuid not null,
  room_id uuid,
  classroom_id uuid,
  teacher_user_id uuid references public.users(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'confirmed', 'attended', 'missed', 'cancelled', 'rescheduled', 'converted')),
  attendance_marked_at timestamptz,
  feedback text,
  recommended_course text,
  recommended_level text,
  next_step text,
  rescheduled_from_id uuid,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academy_id, id),
  foreign key (academy_id, lead_id)
    references public.academy_leads (academy_id, id) on delete restrict,
  foreign key (academy_id, branch_id)
    references public.academy_branches (academy_id, id) on delete restrict,
  foreign key (academy_id, branch_id, room_id)
    references public.academy_rooms (academy_id, branch_id, id) on delete restrict,
  foreign key (academy_id, classroom_id)
    references public.academy_classrooms (academy_id, id) on delete restrict,
  foreign key (academy_id, rescheduled_from_id)
    references public.academy_trial_lessons (academy_id, id) on delete set null (rescheduled_from_id),
  check (ends_at > starts_at)
);

create unique index if not exists academy_trial_lessons_idempotency_idx
  on public.academy_trial_lessons (academy_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists academy_trial_lessons_calendar_idx
  on public.academy_trial_lessons (academy_id, branch_id, starts_at, status);
create index if not exists academy_trial_lessons_teacher_idx
  on public.academy_trial_lessons (academy_id, teacher_user_id, starts_at);

create table if not exists public.academy_lead_conversions (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete restrict,
  lead_id uuid not null,
  contact_id uuid not null,
  classroom_id uuid,
  trial_id uuid,
  source_id uuid,
  salesperson_user_id uuid references public.users(id) on delete set null,
  expected_value bigint check (expected_value is null or expected_value >= 0),
  currency text not null default 'UZS',
  converted_at timestamptz not null default now(),
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (academy_id, lead_id),
  unique (academy_id, idempotency_key),
  foreign key (academy_id, lead_id)
    references public.academy_leads (academy_id, id) on delete restrict,
  foreign key (academy_id, contact_id)
    references public.academy_contacts (academy_id, id) on delete restrict,
  foreign key (academy_id, classroom_id)
    references public.academy_classrooms (academy_id, id) on delete restrict,
  foreign key (academy_id, trial_id)
    references public.academy_trial_lessons (academy_id, id) on delete restrict,
  foreign key (academy_id, source_id)
    references public.academy_lead_sources (academy_id, id) on delete restrict
);

create index if not exists academy_lead_conversions_attribution_idx
  on public.academy_lead_conversions (academy_id, source_id, salesperson_user_id, converted_at desc);

create or replace function public.ensure_academy_crm_defaults(
  p_academy_id uuid,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pipeline_id uuid;
  v_source record;
  v_stage record;
begin
  if not exists (select 1 from public.tenants where id = p_academy_id) then
    raise exception 'Academy not found';
  end if;

  insert into public.academy_branches (
    academy_id, branch_key, name, timezone, currency, is_default, created_by
  )
  values (p_academy_id, 'main', 'Main branch', 'Asia/Tashkent', 'UZS', true, p_actor_id)
  on conflict (academy_id, branch_key) do nothing;

  for v_source in
    select * from (values
      ('instagram', 'social', 10, 'Instagram', 'Instagram', 'Instagram'),
      ('telegram', 'social', 20, 'Telegram', 'Telegram', 'Telegram'),
      ('website', 'digital', 30, 'Website', 'Veb-sayt', 'Веб-сайт'),
      ('landing_page', 'digital', 40, 'Landing page', 'Landing sahifa', 'Лендинг'),
      ('phone', 'direct', 50, 'Phone', 'Telefon', 'Телефон'),
      ('walk_in', 'direct', 60, 'Walk-in', 'Tashrif', 'Личный визит'),
      ('referral', 'referral', 70, 'Referral', 'Tavsiya', 'Рекомендация'),
      ('existing_student', 'referral', 80, 'Existing student', 'Mavjud o‘quvchi', 'Действующий ученик'),
      ('school_partnership', 'partnership', 90, 'School partnership', 'Maktab hamkorligi', 'Партнерство со школой'),
      ('advertising_campaign', 'paid', 100, 'Advertising campaign', 'Reklama kampaniyasi', 'Рекламная кампания'),
      ('manual', 'direct', 110, 'Manual entry', 'Qo‘lda kiritish', 'Ручной ввод'),
      ('api_import', 'integration', 120, 'API or import', 'API yoki import', 'API или импорт'),
      ('other', 'other', 130, 'Other', 'Boshqa', 'Другое')
    ) as s(source_key, category, position, en_label, uz_label, ru_label)
  loop
    insert into public.academy_lead_sources (
      academy_id, source_key, category, position, label_i18n, is_system, created_by
    ) values (
      p_academy_id,
      v_source.source_key,
      v_source.category,
      v_source.position,
      jsonb_build_object('en', v_source.en_label, 'uz', v_source.uz_label, 'ru', v_source.ru_label),
      true,
      p_actor_id
    ) on conflict (academy_id, source_key) do nothing;
  end loop;

  insert into public.academy_sales_pipelines (
    academy_id, pipeline_key, name_i18n, is_default, created_by
  ) values (
    p_academy_id,
    'admissions',
    jsonb_build_object('en', 'Admissions', 'uz', 'Qabul', 'ru', 'Прием'),
    true,
    p_actor_id
  )
  on conflict (academy_id, pipeline_key) do update
    set is_active = true
  returning id into v_pipeline_id;

  for v_stage in
    select * from (values
      ('new', 10, 5, null::text, 'New', 'Yangi', 'Новый'),
      ('contacted', 20, 15, null::text, 'Contacted', 'Bog‘lanildi', 'Связались'),
      ('qualified', 30, 30, null::text, 'Qualified', 'Mos', 'Квалифицирован'),
      ('trial_booked', 40, 45, null::text, 'Trial booked', 'Sinov rejalashtirilgan', 'Пробный урок назначен'),
      ('trial_attended', 50, 65, null::text, 'Trial attended', 'Sinovga qatnashdi', 'Пробный урок посещен'),
      ('offered', 60, 80, null::text, 'Offered', 'Taklif berildi', 'Предложение сделано'),
      ('won', 70, 100, 'won', 'Won', 'Muvaffaqiyatli', 'Успешно'),
      ('lost', 80, 0, 'lost', 'Lost', 'Yo‘qotilgan', 'Потерян')
    ) as s(stage_key, position, probability, terminal_kind, en_label, uz_label, ru_label)
  loop
    insert into public.academy_pipeline_stages (
      academy_id, pipeline_id, stage_key, label_i18n, position,
      probability_percent, terminal_kind
    ) values (
      p_academy_id,
      v_pipeline_id,
      v_stage.stage_key,
      jsonb_build_object('en', v_stage.en_label, 'uz', v_stage.uz_label, 'ru', v_stage.ru_label),
      v_stage.position,
      v_stage.probability,
      v_stage.terminal_kind
    ) on conflict (academy_id, pipeline_id, stage_key) do nothing;
  end loop;

  insert into public.academy_pipeline_transitions (
    academy_id, pipeline_id, from_stage_id, to_stage_id, requires_reason
  )
  select
    p_academy_id,
    v_pipeline_id,
    fs.id,
    ts.id,
    t.to_key = 'lost'
  from (values
    ('new', 'contacted'),
    ('contacted', 'qualified'),
    ('qualified', 'trial_booked'),
    ('trial_booked', 'trial_attended'),
    ('trial_attended', 'offered'),
    ('offered', 'won'),
    ('contacted', 'new'),
    ('qualified', 'contacted'),
    ('trial_booked', 'qualified'),
    ('trial_attended', 'trial_booked'),
    ('offered', 'trial_attended'),
    ('new', 'lost'),
    ('contacted', 'lost'),
    ('qualified', 'lost'),
    ('trial_booked', 'lost'),
    ('trial_attended', 'lost'),
    ('offered', 'lost')
  ) as t(from_key, to_key)
  join public.academy_pipeline_stages fs
    on fs.academy_id = p_academy_id and fs.pipeline_id = v_pipeline_id and fs.stage_key = t.from_key
  join public.academy_pipeline_stages ts
    on ts.academy_id = p_academy_id and ts.pipeline_id = v_pipeline_id and ts.stage_key = t.to_key
  on conflict (academy_id, pipeline_id, from_stage_id, to_stage_id) do nothing;

  return jsonb_build_object('academy_id', p_academy_id, 'pipeline_id', v_pipeline_id);
end;
$$;

-- Creates the tenant and its first owner membership in one transaction. The
-- Edge function authenticates the actor; this command is service-role only so
-- a failed membership insert cannot leave an orphaned academy behind.
create or replace function public.academy_create_organization(
  p_name text,
  p_slug text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy public.tenants%rowtype;
begin
  if nullif(trim(p_name), '') is null then raise exception 'Academy name is required'; end if;
  if nullif(trim(p_slug), '') is null then raise exception 'Academy slug is required'; end if;
  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Academy slug is invalid'; end if;
  if not exists (select 1 from public.users where id = p_actor_id) then raise exception 'Actor not found'; end if;

  insert into public.tenants (name, slug, type, created_by, metadata)
  values (
    trim(p_name), p_slug, 'team', p_actor_id,
    jsonb_build_object('service_family', 'academy', 'academy_service', true, 'created_from', 'academy_app')
  )
  returning * into v_academy;

  insert into public.tenant_memberships (tenant_id, user_id, role, status)
  values (v_academy.id, p_actor_id, 'owner', 'active');

  perform public.ensure_academy_crm_defaults(v_academy.id, p_actor_id);

  insert into public.academy_audit_events (
    academy_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    v_academy.id, p_actor_id, 'academy.created', 'academy', v_academy.id::text,
    jsonb_build_object('slug', v_academy.slug, 'source', 'academy_app')
  );

  return to_jsonb(v_academy);
end;
$$;

create or replace function public.academy_create_lead(
  p_academy_id uuid,
  p_actor_id uuid,
  p_payload jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pipeline_id uuid;
  v_stage_id uuid;
  v_source_id uuid;
  v_branch_id uuid;
  v_lead public.academy_leads%rowtype;
  v_price bigint;
begin
  if nullif(trim(p_idempotency_key), '') is null then
    raise exception 'Idempotency key is required';
  end if;

  select * into v_lead
  from public.academy_leads
  where academy_id = p_academy_id and idempotency_key = p_idempotency_key;
  if found then
    return to_jsonb(v_lead);
  end if;

  perform public.ensure_academy_crm_defaults(p_academy_id, p_actor_id);

  select id into v_pipeline_id
  from public.academy_sales_pipelines
  where academy_id = p_academy_id and is_default and is_active
  order by created_at asc limit 1;
  select id into v_stage_id
  from public.academy_pipeline_stages
  where academy_id = p_academy_id and pipeline_id = v_pipeline_id and stage_key = 'new';
  select id into v_branch_id
  from public.academy_branches
  where academy_id = p_academy_id and is_default and is_active
  order by created_at asc limit 1;

  if nullif(p_payload->>'branch_id', '') is not null then
    select id into v_branch_id
    from public.academy_branches
    where academy_id = p_academy_id and id = (p_payload->>'branch_id')::uuid and is_active;
    if v_branch_id is null then raise exception 'Branch not found'; end if;
  end if;

  if nullif(p_payload->>'source_id', '') is not null then
    select id into v_source_id
    from public.academy_lead_sources
    where academy_id = p_academy_id and id = (p_payload->>'source_id')::uuid and is_active;
  elsif nullif(p_payload->>'source_key', '') is not null then
    select id into v_source_id
    from public.academy_lead_sources
    where academy_id = p_academy_id and source_key = lower(trim(p_payload->>'source_key')) and is_active;
  end if;

  if nullif(p_payload->>'expected_price', '') ~ '^[0-9]+$' then
    v_price := (p_payload->>'expected_price')::bigint;
  end if;

  insert into public.academy_leads (
    academy_id, branch_id, preferred_branch_id, pipeline_id, current_stage_id,
    source_id, assigned_user_id, responsible_user_id, full_name, phone,
    telegram, email, parent_name, parent_phone, age, interested_course,
    preferred_teacher_id, preferred_schedule, preferred_lesson_time,
    expected_price, currency, campaign, referral_source, notes, tags,
    estimated_probability, next_follow_up_at, idempotency_key, metadata,
    created_by, updated_by
  ) values (
    p_academy_id,
    v_branch_id,
    coalesce(nullif(p_payload->>'preferred_branch_id', '')::uuid, v_branch_id),
    v_pipeline_id,
    v_stage_id,
    v_source_id,
    nullif(p_payload->>'assigned_user_id', '')::uuid,
    nullif(p_payload->>'responsible_user_id', '')::uuid,
    trim(p_payload->>'full_name'),
    nullif(trim(p_payload->>'phone'), ''),
    nullif(trim(p_payload->>'telegram'), ''),
    nullif(lower(trim(p_payload->>'email')), ''),
    nullif(trim(p_payload->>'parent_name'), ''),
    nullif(trim(p_payload->>'parent_phone'), ''),
    case when nullif(p_payload->>'age', '') ~ '^[0-9]+$' then (p_payload->>'age')::integer else null end,
    nullif(trim(p_payload->>'interested_course'), ''),
    nullif(p_payload->>'preferred_teacher_id', '')::uuid,
    nullif(trim(p_payload->>'preferred_schedule'), ''),
    nullif(p_payload->>'preferred_lesson_time', '')::time,
    v_price,
    coalesce(nullif(upper(trim(p_payload->>'currency')), ''), 'UZS'),
    nullif(trim(p_payload->>'campaign'), ''),
    nullif(trim(p_payload->>'referral_source'), ''),
    nullif(trim(p_payload->>'notes'), ''),
    case when jsonb_typeof(p_payload->'tags') = 'array' then p_payload->'tags' else '[]'::jsonb end,
    case when nullif(p_payload->>'estimated_probability', '') ~ '^[0-9]+$' then (p_payload->>'estimated_probability')::integer else null end,
    nullif(p_payload->>'next_follow_up_at', '')::timestamptz,
    p_idempotency_key,
    coalesce(p_payload->'metadata', '{}'::jsonb),
    p_actor_id,
    p_actor_id
  ) returning * into v_lead;

  insert into public.academy_lead_stage_history (
    academy_id, lead_id, pipeline_id, to_stage_id, responsible_user_id,
    reason, idempotency_key, metadata
  ) values (
    p_academy_id, v_lead.id, v_pipeline_id, v_stage_id, p_actor_id,
    'lead_created', 'lead-created:' || v_lead.id::text, '{}'::jsonb
  );

  insert into public.academy_audit_events (
    academy_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    p_academy_id, p_actor_id, 'lead.created', 'academy_lead', v_lead.id::text,
    jsonb_build_object('source_id', v_source_id, 'branch_id', v_branch_id, 'idempotency_key', p_idempotency_key)
  );

  insert into public.domain_event_outbox (
    event_type, event_version, aggregate_type, aggregate_id, user_id, payload, idempotency_key
  ) values (
    'lead.created', 'v1', 'academy_lead', v_lead.id, p_actor_id,
    jsonb_build_object('academy_id', p_academy_id, 'lead_id', v_lead.id, 'branch_id', v_branch_id, 'source_id', v_source_id),
    'lead.created:' || v_lead.id::text
  ) on conflict (idempotency_key) do nothing;

  return to_jsonb(v_lead);
end;
$$;

create or replace function public.academy_transition_lead(
  p_academy_id uuid,
  p_lead_id uuid,
  p_to_stage_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_notes text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.academy_leads%rowtype;
  v_target public.academy_pipeline_stages%rowtype;
  v_history_id uuid;
  v_from_stage_id uuid;
begin
  if nullif(trim(p_idempotency_key), '') is null then raise exception 'Idempotency key is required'; end if;

  if exists (
    select 1 from public.academy_lead_stage_history
    where academy_id = p_academy_id and idempotency_key = p_idempotency_key
  ) then
    select * into v_lead from public.academy_leads where academy_id = p_academy_id and id = p_lead_id;
    return to_jsonb(v_lead);
  end if;

  select * into v_lead
  from public.academy_leads
  where academy_id = p_academy_id and id = p_lead_id
  for update;
  if not found then raise exception 'Lead not found'; end if;
  if v_lead.status <> 'open' then raise exception 'Lead is not open'; end if;
  v_from_stage_id := v_lead.current_stage_id;

  select * into v_target
  from public.academy_pipeline_stages
  where academy_id = p_academy_id and pipeline_id = v_lead.pipeline_id and id = p_to_stage_id and is_active;
  if not found then raise exception 'Target stage not found'; end if;
  if v_target.terminal_kind = 'won' then raise exception 'Use lead conversion to enter WON'; end if;

  if not exists (
    select 1 from public.academy_pipeline_transitions t
    where t.academy_id = p_academy_id
      and t.pipeline_id = v_lead.pipeline_id
      and t.from_stage_id = v_from_stage_id
      and t.to_stage_id = p_to_stage_id
      and t.is_active
      and (not t.requires_reason or nullif(trim(p_reason), '') is not null)
  ) then
    raise exception 'Invalid lead stage transition';
  end if;

  update public.academy_lead_stage_history
  set exited_at = now()
  where academy_id = p_academy_id and lead_id = p_lead_id and exited_at is null;

  insert into public.academy_lead_stage_history (
    academy_id, lead_id, pipeline_id, from_stage_id, to_stage_id,
    responsible_user_id, reason, notes, idempotency_key
  ) values (
    p_academy_id, p_lead_id, v_lead.pipeline_id, v_from_stage_id,
    p_to_stage_id, p_actor_id, nullif(trim(p_reason), ''), nullif(trim(p_notes), ''), p_idempotency_key
  ) returning id into v_history_id;

  update public.academy_leads
  set current_stage_id = p_to_stage_id,
      status = case when v_target.terminal_kind = 'lost' then 'lost' else 'open' end,
      lost_reason = case when v_target.terminal_kind = 'lost' then nullif(trim(p_reason), '') else null end,
      estimated_probability = v_target.probability_percent,
      updated_by = p_actor_id,
      updated_at = now()
  where academy_id = p_academy_id and id = p_lead_id
  returning * into v_lead;

  insert into public.academy_audit_events (
    academy_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    p_academy_id, p_actor_id, 'lead.stage_changed', 'academy_lead', p_lead_id::text,
    jsonb_build_object('from_stage_id', v_from_stage_id, 'to_stage_id', p_to_stage_id, 'history_id', v_history_id, 'reason', p_reason)
  );

  insert into public.domain_event_outbox (
    event_type, event_version, aggregate_type, aggregate_id, user_id, payload, idempotency_key
  ) values (
    'lead.stage_changed', 'v1', 'academy_lead', p_lead_id, p_actor_id,
    jsonb_build_object('academy_id', p_academy_id, 'lead_id', p_lead_id, 'to_stage_id', p_to_stage_id, 'history_id', v_history_id),
    'lead.stage_changed:' || v_history_id::text
  ) on conflict (idempotency_key) do nothing;

  return to_jsonb(v_lead);
end;
$$;

create or replace function public.academy_record_lead_activity(
  p_academy_id uuid,
  p_lead_id uuid,
  p_actor_id uuid,
  p_payload jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity public.academy_lead_activities%rowtype;
begin
  select * into v_activity from public.academy_lead_activities
  where academy_id = p_academy_id and idempotency_key = p_idempotency_key;
  if found then return to_jsonb(v_activity); end if;
  if not exists (select 1 from public.academy_leads where academy_id = p_academy_id and id = p_lead_id) then
    raise exception 'Lead not found';
  end if;

  insert into public.academy_lead_activities (
    academy_id, lead_id, activity_type, method, status, assigned_user_id,
    due_at, completed_at, outcome, notes, next_follow_up_at,
    idempotency_key, metadata, created_by
  ) values (
    p_academy_id,
    p_lead_id,
    coalesce(nullif(lower(trim(p_payload->>'activity_type')), ''), 'follow_up'),
    nullif(lower(trim(p_payload->>'method')), ''),
    coalesce(nullif(lower(trim(p_payload->>'status')), ''), 'planned'),
    coalesce(nullif(p_payload->>'assigned_user_id', '')::uuid, p_actor_id),
    nullif(p_payload->>'due_at', '')::timestamptz,
    case when lower(coalesce(p_payload->>'status', 'planned')) = 'completed'
      then coalesce(nullif(p_payload->>'completed_at', '')::timestamptz, now()) else null end,
    nullif(trim(p_payload->>'outcome'), ''),
    nullif(trim(p_payload->>'notes'), ''),
    nullif(p_payload->>'next_follow_up_at', '')::timestamptz,
    p_idempotency_key,
    coalesce(p_payload->'metadata', '{}'::jsonb),
    p_actor_id
  ) returning * into v_activity;

  update public.academy_leads
  set last_contacted_at = case when v_activity.status = 'completed' then coalesce(v_activity.completed_at, now()) else last_contacted_at end,
      next_follow_up_at = coalesce(v_activity.next_follow_up_at, v_activity.due_at, next_follow_up_at),
      updated_by = p_actor_id,
      updated_at = now()
  where academy_id = p_academy_id and id = p_lead_id;

  insert into public.academy_audit_events (
    academy_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    p_academy_id, p_actor_id, 'lead.activity_recorded', 'academy_lead_activity', v_activity.id::text,
    jsonb_build_object('lead_id', p_lead_id, 'activity_type', v_activity.activity_type, 'status', v_activity.status)
  );
  return to_jsonb(v_activity);
end;
$$;

create or replace function public.academy_schedule_trial(
  p_academy_id uuid,
  p_lead_id uuid,
  p_actor_id uuid,
  p_payload jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trial public.academy_trial_lessons%rowtype;
  v_branch_id uuid;
begin
  select * into v_trial from public.academy_trial_lessons
  where academy_id = p_academy_id and idempotency_key = p_idempotency_key;
  if found then return to_jsonb(v_trial); end if;
  if not exists (select 1 from public.academy_leads where academy_id = p_academy_id and id = p_lead_id and status = 'open') then
    raise exception 'Open lead not found';
  end if;
  select id into v_branch_id from public.academy_branches
  where academy_id = p_academy_id
    and id = coalesce(nullif(p_payload->>'branch_id', '')::uuid, (select branch_id from public.academy_leads where academy_id = p_academy_id and id = p_lead_id));
  if v_branch_id is null then raise exception 'Branch not found'; end if;

  insert into public.academy_trial_lessons (
    academy_id, lead_id, branch_id, room_id, classroom_id, teacher_user_id,
    starts_at, ends_at, status, idempotency_key, metadata, created_by, updated_by
  ) values (
    p_academy_id, p_lead_id, v_branch_id,
    nullif(p_payload->>'room_id', '')::uuid,
    nullif(p_payload->>'classroom_id', '')::uuid,
    nullif(p_payload->>'teacher_user_id', '')::uuid,
    (p_payload->>'starts_at')::timestamptz,
    (p_payload->>'ends_at')::timestamptz,
    'scheduled', p_idempotency_key, coalesce(p_payload->'metadata', '{}'::jsonb), p_actor_id, p_actor_id
  ) returning * into v_trial;

  insert into public.academy_audit_events (
    academy_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    p_academy_id, p_actor_id, 'trial.scheduled', 'academy_trial_lesson', v_trial.id::text,
    jsonb_build_object('lead_id', p_lead_id, 'branch_id', v_branch_id, 'starts_at', v_trial.starts_at)
  );
  insert into public.domain_event_outbox (
    event_type, event_version, aggregate_type, aggregate_id, user_id, payload, idempotency_key
  ) values (
    'trial.scheduled', 'v1', 'academy_trial_lesson', v_trial.id, p_actor_id,
    jsonb_build_object('academy_id', p_academy_id, 'trial_id', v_trial.id, 'lead_id', p_lead_id, 'starts_at', v_trial.starts_at),
    'trial.scheduled:' || v_trial.id::text
  ) on conflict (idempotency_key) do nothing;
  return to_jsonb(v_trial);
end;
$$;

create or replace function public.academy_set_trial_status(
  p_academy_id uuid,
  p_trial_id uuid,
  p_actor_id uuid,
  p_status text,
  p_feedback text,
  p_recommended_course text,
  p_recommended_level text,
  p_next_step text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trial public.academy_trial_lessons%rowtype;
  v_next text := lower(trim(p_status));
begin
  select * into v_trial from public.academy_trial_lessons
  where academy_id = p_academy_id and id = p_trial_id for update;
  if not found then raise exception 'Trial not found'; end if;
  if coalesce(v_trial.metadata->>'last_status_idempotency_key', '') = p_idempotency_key then return to_jsonb(v_trial); end if;
  if not (
    (v_trial.status = 'scheduled' and v_next in ('confirmed', 'attended', 'missed', 'cancelled', 'rescheduled')) or
    (v_trial.status = 'confirmed' and v_next in ('attended', 'missed', 'cancelled', 'rescheduled')) or
    (v_trial.status = 'rescheduled' and v_next in ('scheduled', 'confirmed', 'cancelled')) or
    (v_trial.status = 'missed' and v_next in ('rescheduled', 'cancelled')) or
    (v_trial.status = 'attended' and v_next = 'converted')
  ) then raise exception 'Invalid trial status transition'; end if;

  update public.academy_trial_lessons
  set status = v_next,
      attendance_marked_at = case when v_next in ('attended', 'missed') then now() else attendance_marked_at end,
      feedback = coalesce(nullif(trim(p_feedback), ''), feedback),
      recommended_course = coalesce(nullif(trim(p_recommended_course), ''), recommended_course),
      recommended_level = coalesce(nullif(trim(p_recommended_level), ''), recommended_level),
      next_step = coalesce(nullif(trim(p_next_step), ''), next_step),
      metadata = metadata || jsonb_build_object('last_status_idempotency_key', p_idempotency_key),
      updated_by = p_actor_id,
      updated_at = now()
  where academy_id = p_academy_id and id = p_trial_id
  returning * into v_trial;

  insert into public.academy_audit_events (
    academy_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    p_academy_id, p_actor_id, 'trial.' || v_next, 'academy_trial_lesson', p_trial_id::text,
    jsonb_build_object('lead_id', v_trial.lead_id, 'status', v_next, 'idempotency_key', p_idempotency_key)
  );
  insert into public.domain_event_outbox (
    event_type, event_version, aggregate_type, aggregate_id, user_id, payload, idempotency_key
  ) values (
    'trial.' || v_next, 'v1', 'academy_trial_lesson', p_trial_id, p_actor_id,
    jsonb_build_object('academy_id', p_academy_id, 'trial_id', p_trial_id, 'lead_id', v_trial.lead_id, 'status', v_next),
    'trial.' || v_next || ':' || p_idempotency_key
  ) on conflict (idempotency_key) do nothing;
  return to_jsonb(v_trial);
end;
$$;

create or replace function public.academy_convert_lead(
  p_academy_id uuid,
  p_lead_id uuid,
  p_actor_id uuid,
  p_classroom_id uuid,
  p_existing_contact_id uuid,
  p_trial_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.academy_leads%rowtype;
  v_contact public.academy_contacts%rowtype;
  v_conversion public.academy_lead_conversions%rowtype;
  v_won_stage_id uuid;
  v_first_name text;
  v_last_name text;
begin
  select * into v_conversion from public.academy_lead_conversions
  where academy_id = p_academy_id and idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('conversion', to_jsonb(v_conversion)); end if;

  select * into v_lead from public.academy_leads
  where academy_id = p_academy_id and id = p_lead_id for update;
  if not found then raise exception 'Lead not found'; end if;
  if v_lead.status = 'lost' then raise exception 'Lost lead must be reopened before conversion'; end if;
  if v_lead.status = 'converted' then
    select * into v_conversion from public.academy_lead_conversions where academy_id = p_academy_id and lead_id = p_lead_id;
    return jsonb_build_object('conversion', to_jsonb(v_conversion));
  end if;

  select id into v_won_stage_id from public.academy_pipeline_stages
  where academy_id = p_academy_id and pipeline_id = v_lead.pipeline_id and terminal_kind = 'won' and is_active
  order by position limit 1;

  if p_existing_contact_id is not null then
    select * into v_contact from public.academy_contacts
    where academy_id = p_academy_id and id = p_existing_contact_id;
    if not found then raise exception 'Existing contact not found'; end if;
  else
    if v_lead.email is not null then
      select * into v_contact from public.academy_contacts
      where academy_id = p_academy_id and lower(email) = lower(v_lead.email)
      order by created_at asc limit 1;
    end if;
    if v_contact.id is null and v_lead.phone is not null then
      select * into v_contact from public.academy_contacts
      where academy_id = p_academy_id and phone = v_lead.phone
      order by created_at asc limit 1;
    end if;
    if v_contact.id is null then
      v_first_name := split_part(trim(v_lead.full_name), ' ', 1);
      v_last_name := nullif(trim(substr(trim(v_lead.full_name), length(v_first_name) + 1)), '');
      insert into public.academy_contacts (
        academy_id, first_name, last_name, email, phone, telegram_id,
        status, metadata, created_by
      ) values (
        p_academy_id, v_first_name, coalesce(v_last_name, ''), v_lead.email,
        v_lead.phone, v_lead.telegram, 'active',
        jsonb_build_object('converted_from_lead_id', v_lead.id, 'source_id', v_lead.source_id, 'campaign', v_lead.campaign),
        p_actor_id
      ) returning * into v_contact;
    end if;
  end if;

  if p_classroom_id is not null then
    if not exists (select 1 from public.academy_classrooms where academy_id = p_academy_id and id = p_classroom_id) then
      raise exception 'Classroom not found';
    end if;
    insert into public.academy_classroom_memberships (
      academy_id, classroom_id, contact_id, role, status, started_at, metadata
    ) values (
      p_academy_id, p_classroom_id, v_contact.id, 'student', 'active', now(),
      jsonb_build_object('source', 'lead_conversion', 'lead_id', p_lead_id)
    ) on conflict (classroom_id, contact_id) do update
      set status = 'active', started_at = coalesce(public.academy_classroom_memberships.started_at, now());
  end if;

  if p_trial_id is not null and not exists (
    select 1 from public.academy_trial_lessons where academy_id = p_academy_id and id = p_trial_id and lead_id = p_lead_id
  ) then raise exception 'Trial does not belong to lead'; end if;

  insert into public.academy_lead_conversions (
    academy_id, lead_id, contact_id, classroom_id, trial_id, source_id,
    salesperson_user_id, expected_value, currency, idempotency_key, metadata,
    created_by
  ) values (
    p_academy_id, p_lead_id, v_contact.id, p_classroom_id, p_trial_id,
    v_lead.source_id, coalesce(v_lead.assigned_user_id, p_actor_id),
    v_lead.expected_price, v_lead.currency, p_idempotency_key,
    jsonb_build_object('campaign', v_lead.campaign, 'referral_source', v_lead.referral_source),
    p_actor_id
  ) returning * into v_conversion;

  update public.academy_lead_stage_history set exited_at = now()
  where academy_id = p_academy_id and lead_id = p_lead_id and exited_at is null;
  insert into public.academy_lead_stage_history (
    academy_id, lead_id, pipeline_id, from_stage_id, to_stage_id,
    responsible_user_id, reason, idempotency_key
  ) values (
    p_academy_id, p_lead_id, v_lead.pipeline_id, v_lead.current_stage_id,
    v_won_stage_id, p_actor_id, 'lead_converted', 'lead-converted:' || v_conversion.id::text
  );
  update public.academy_leads
  set current_stage_id = v_won_stage_id, status = 'converted', converted_at = now(),
      updated_by = p_actor_id, updated_at = now()
  where academy_id = p_academy_id and id = p_lead_id;
  if p_trial_id is not null then
    update public.academy_trial_lessons
    set status = 'converted', updated_by = p_actor_id, updated_at = now()
    where academy_id = p_academy_id and id = p_trial_id and status = 'attended';
  end if;

  insert into public.academy_audit_events (
    academy_id, actor_user_id, action, target_type, target_id, contact_id,
    classroom_id, metadata
  ) values (
    p_academy_id, p_actor_id, 'lead.converted', 'academy_lead_conversion',
    v_conversion.id::text, v_contact.id, p_classroom_id,
    jsonb_build_object('lead_id', p_lead_id, 'trial_id', p_trial_id, 'source_id', v_lead.source_id, 'idempotency_key', p_idempotency_key)
  );
  insert into public.domain_event_outbox (
    event_type, event_version, aggregate_type, aggregate_id, user_id, payload, idempotency_key
  ) values (
    'lead.converted', 'v1', 'academy_lead', p_lead_id, p_actor_id,
    jsonb_build_object('academy_id', p_academy_id, 'lead_id', p_lead_id, 'conversion_id', v_conversion.id, 'contact_id', v_contact.id, 'classroom_id', p_classroom_id),
    'lead.converted:' || v_conversion.id::text
  ) on conflict (idempotency_key) do nothing;

  return jsonb_build_object('conversion', to_jsonb(v_conversion), 'contact', to_jsonb(v_contact));
end;
$$;

revoke all on function public.ensure_academy_crm_defaults(uuid, uuid) from public, anon, authenticated;
revoke all on function public.academy_create_organization(text, text, uuid) from public, anon, authenticated;
revoke all on function public.academy_create_lead(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.academy_transition_lead(uuid, uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.academy_record_lead_activity(uuid, uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.academy_schedule_trial(uuid, uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.academy_set_trial_status(uuid, uuid, uuid, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.academy_convert_lead(uuid, uuid, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.ensure_academy_crm_defaults(uuid, uuid) to service_role;
grant execute on function public.academy_create_organization(text, text, uuid) to service_role;
grant execute on function public.academy_create_lead(uuid, uuid, jsonb, text) to service_role;
grant execute on function public.academy_transition_lead(uuid, uuid, uuid, uuid, text, text, text) to service_role;
grant execute on function public.academy_record_lead_activity(uuid, uuid, uuid, jsonb, text) to service_role;
grant execute on function public.academy_schedule_trial(uuid, uuid, uuid, jsonb, text) to service_role;
grant execute on function public.academy_set_trial_status(uuid, uuid, uuid, text, text, text, text, text, text) to service_role;
grant execute on function public.academy_convert_lead(uuid, uuid, uuid, uuid, uuid, uuid, text) to service_role;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'academy_branches', 'academy_rooms', 'academy_lead_sources',
    'academy_sales_pipelines', 'academy_pipeline_stages',
    'academy_leads', 'academy_lead_activities', 'academy_trial_lessons'
  ] loop
    execute format('drop trigger if exists %I_updated_at on public.%I', v_table, v_table);
    execute format(
      'create trigger %I_updated_at before update on public.%I for each row execute procedure public.handle_teacher_studio_updated_at()',
      v_table, v_table
    );
  end loop;
end $$;

alter table public.academy_branches enable row level security;
alter table public.academy_rooms enable row level security;
alter table public.academy_lead_sources enable row level security;
alter table public.academy_sales_pipelines enable row level security;
alter table public.academy_pipeline_stages enable row level security;
alter table public.academy_pipeline_transitions enable row level security;
alter table public.academy_leads enable row level security;
alter table public.academy_lead_stage_history enable row level security;
alter table public.academy_lead_activities enable row level security;
alter table public.academy_trial_lessons enable row level security;
alter table public.academy_lead_conversions enable row level security;

create policy "Academy branches read by organization member" on public.academy_branches
  for select using (public.academy_org_can_view(academy_id));
create policy "Academy rooms read by organization member" on public.academy_rooms
  for select using (public.academy_org_can_view(academy_id));

create policy "Academy lead sources read by CRM staff" on public.academy_lead_sources
  for select using (public.academy_crm_can_access(academy_id));
create policy "Academy sales pipelines read by CRM staff" on public.academy_sales_pipelines
  for select using (public.academy_crm_can_access(academy_id));
create policy "Academy pipeline stages read by CRM staff" on public.academy_pipeline_stages
  for select using (public.academy_crm_can_access(academy_id));
create policy "Academy pipeline transitions read by CRM staff" on public.academy_pipeline_transitions
  for select using (public.academy_crm_can_access(academy_id));
create policy "Academy leads read by CRM staff" on public.academy_leads
  for select using (public.academy_crm_can_access(academy_id));
create policy "Academy lead history read by CRM staff" on public.academy_lead_stage_history
  for select using (public.academy_crm_can_access(academy_id));
create policy "Academy lead activities read by CRM staff" on public.academy_lead_activities
  for select using (public.academy_crm_can_access(academy_id));
create policy "Academy trials read by CRM staff" on public.academy_trial_lessons
  for select using (public.academy_crm_can_access(academy_id));
create policy "Academy conversions read by CRM staff" on public.academy_lead_conversions
  for select using (public.academy_crm_can_access(academy_id));

-- Pre-create defaults only for tenants that already contain Academy records.
do $$
declare
  v_academy_id uuid;
begin
  for v_academy_id in
    select academy_id from public.academy_contacts
    union select academy_id from public.academy_classrooms
    union select academy_id from public.academy_offers
  loop
    perform public.ensure_academy_crm_defaults(v_academy_id, null);
  end loop;
end $$;
