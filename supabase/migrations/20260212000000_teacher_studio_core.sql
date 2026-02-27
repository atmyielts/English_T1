-- Teacher Studio core schema (academy-scoped, additive only)

create or replace function public.is_academy_member(target_academy_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.tenant_memberships m
    where m.tenant_id = target_academy_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.is_academy_admin(target_academy_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.tenant_memberships m
    where m.tenant_id = target_academy_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  );
$$;

create table if not exists public.academy_contacts (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  first_name text not null default '',
  last_name text not null default '',
  email text,
  phone text,
  telegram_id text,
  status text not null default 'active' check (status in ('active', 'inactive', 'trial', 'paused')),
  last_activity_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists academy_contacts_academy_idx on public.academy_contacts(academy_id);
create index if not exists academy_contacts_user_idx on public.academy_contacts(user_id);
create unique index if not exists academy_contacts_academy_email_unique
  on public.academy_contacts(academy_id, lower(email))
  where email is not null;
create unique index if not exists academy_contacts_academy_phone_unique
  on public.academy_contacts(academy_id, phone)
  where phone is not null;

create table if not exists public.academy_classrooms (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academy_id, name)
);

create index if not exists academy_classrooms_academy_idx on public.academy_classrooms(academy_id);

create table if not exists public.academy_classroom_memberships (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  classroom_id uuid not null references public.academy_classrooms(id) on delete cascade,
  contact_id uuid not null references public.academy_contacts(id) on delete cascade,
  role text not null default 'student' check (role in ('student', 'assistant')),
  joined_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (classroom_id, contact_id)
);

create index if not exists academy_classroom_memberships_academy_idx on public.academy_classroom_memberships(academy_id);
create index if not exists academy_classroom_memberships_classroom_idx on public.academy_classroom_memberships(classroom_id);
create index if not exists academy_classroom_memberships_contact_idx on public.academy_classroom_memberships(contact_id);

create table if not exists public.academy_offers (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  type text not null check (type in ('subscription', 'cohort', 'product', 'credits')),
  price_amount integer not null check (price_amount >= 0),
  currency text not null default 'UZS',
  duration_days integer check (duration_days is null or duration_days > 0),
  description text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists academy_offers_academy_idx on public.academy_offers(academy_id);
create index if not exists academy_offers_active_idx on public.academy_offers(academy_id, is_active);

create table if not exists public.academy_offer_grants (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  offer_id uuid not null references public.academy_offers(id) on delete cascade,
  grant_type text not null check (grant_type in ('classroom_access', 'product_access', 'mock_tests', 'writing_credits', 'capability', 'time_extension')),
  resource_type text,
  resource_id uuid,
  capability_key text,
  quantity integer,
  duration_days integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists academy_offer_grants_academy_idx on public.academy_offer_grants(academy_id);
create index if not exists academy_offer_grants_offer_idx on public.academy_offer_grants(offer_id);

create table if not exists public.academy_payments (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid references public.academy_contacts(id) on delete set null,
  offer_id uuid references public.academy_offers(id) on delete set null,
  provider text not null,
  provider_transaction_id text not null,
  amount integer not null check (amount >= 0),
  currency text not null default 'UZS',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'canceled', 'refunded')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_transaction_id)
);

create index if not exists academy_payments_academy_idx on public.academy_payments(academy_id);
create index if not exists academy_payments_contact_idx on public.academy_payments(contact_id);
create index if not exists academy_payments_offer_idx on public.academy_payments(offer_id);

create table if not exists public.academy_entitlements (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.academy_contacts(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  offer_id uuid references public.academy_offers(id) on delete set null,
  payment_id uuid references public.academy_payments(id) on delete set null,
  grant_type text not null,
  resource_type text,
  resource_id uuid,
  capability_key text,
  quantity integer,
  remaining integer,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  source text not null default 'offer',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists academy_entitlements_academy_idx on public.academy_entitlements(academy_id);
create index if not exists academy_entitlements_contact_idx on public.academy_entitlements(contact_id);
create index if not exists academy_entitlements_user_idx on public.academy_entitlements(user_id);
create index if not exists academy_entitlements_status_idx on public.academy_entitlements(status);

create table if not exists public.academy_conversations (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.academy_contacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academy_id, contact_id)
);

create index if not exists academy_conversations_academy_idx on public.academy_conversations(academy_id);

create table if not exists public.academy_messages (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.academy_conversations(id) on delete cascade,
  contact_id uuid references public.academy_contacts(id) on delete set null,
  sender_type text not null check (sender_type in ('teacher', 'student', 'system')),
  message_type text not null check (message_type in ('message', 'announcement', 'alert', 'event')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists academy_messages_academy_idx on public.academy_messages(academy_id);
create index if not exists academy_messages_conversation_idx on public.academy_messages(conversation_id);
create index if not exists academy_messages_contact_idx on public.academy_messages(contact_id);

create table if not exists public.academy_alerts (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid references public.academy_contacts(id) on delete set null,
  type text not null,
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  message text not null,
  resolved boolean not null default false,
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists academy_alerts_academy_idx on public.academy_alerts(academy_id);
create index if not exists academy_alerts_resolved_idx on public.academy_alerts(academy_id, resolved);
create index if not exists academy_alerts_contact_idx on public.academy_alerts(contact_id);

create or replace function public.handle_teacher_studio_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists academy_contacts_updated_at on public.academy_contacts;
create trigger academy_contacts_updated_at
before update on public.academy_contacts
for each row
execute procedure public.handle_teacher_studio_updated_at();

drop trigger if exists academy_classrooms_updated_at on public.academy_classrooms;
create trigger academy_classrooms_updated_at
before update on public.academy_classrooms
for each row
execute procedure public.handle_teacher_studio_updated_at();

drop trigger if exists academy_offers_updated_at on public.academy_offers;
create trigger academy_offers_updated_at
before update on public.academy_offers
for each row
execute procedure public.handle_teacher_studio_updated_at();

drop trigger if exists academy_payments_updated_at on public.academy_payments;
create trigger academy_payments_updated_at
before update on public.academy_payments
for each row
execute procedure public.handle_teacher_studio_updated_at();

drop trigger if exists academy_entitlements_updated_at on public.academy_entitlements;
create trigger academy_entitlements_updated_at
before update on public.academy_entitlements
for each row
execute procedure public.handle_teacher_studio_updated_at();

drop trigger if exists academy_conversations_updated_at on public.academy_conversations;
create trigger academy_conversations_updated_at
before update on public.academy_conversations
for each row
execute procedure public.handle_teacher_studio_updated_at();

alter table public.academy_contacts enable row level security;
alter table public.academy_classrooms enable row level security;
alter table public.academy_classroom_memberships enable row level security;
alter table public.academy_offers enable row level security;
alter table public.academy_offer_grants enable row level security;
alter table public.academy_payments enable row level security;
alter table public.academy_entitlements enable row level security;
alter table public.academy_conversations enable row level security;
alter table public.academy_messages enable row level security;
alter table public.academy_alerts enable row level security;

drop policy if exists "Academy contacts read by membership" on public.academy_contacts;
create policy "Academy contacts read by membership"
on public.academy_contacts
for select
using (public.is_academy_member(academy_id));

drop policy if exists "Academy contacts manage by admin" on public.academy_contacts;
create policy "Academy contacts manage by admin"
on public.academy_contacts
for all
using (public.is_academy_admin(academy_id))
with check (public.is_academy_admin(academy_id));

drop policy if exists "Academy classrooms read by membership" on public.academy_classrooms;
create policy "Academy classrooms read by membership"
on public.academy_classrooms
for select
using (public.is_academy_member(academy_id));

drop policy if exists "Academy classrooms manage by admin" on public.academy_classrooms;
create policy "Academy classrooms manage by admin"
on public.academy_classrooms
for all
using (public.is_academy_admin(academy_id))
with check (public.is_academy_admin(academy_id));

drop policy if exists "Academy classroom memberships read by membership" on public.academy_classroom_memberships;
create policy "Academy classroom memberships read by membership"
on public.academy_classroom_memberships
for select
using (public.is_academy_member(academy_id));

drop policy if exists "Academy classroom memberships manage by admin" on public.academy_classroom_memberships;
create policy "Academy classroom memberships manage by admin"
on public.academy_classroom_memberships
for all
using (public.is_academy_admin(academy_id))
with check (public.is_academy_admin(academy_id));

drop policy if exists "Academy offers read by membership" on public.academy_offers;
create policy "Academy offers read by membership"
on public.academy_offers
for select
using (public.is_academy_member(academy_id));

drop policy if exists "Academy offers manage by admin" on public.academy_offers;
create policy "Academy offers manage by admin"
on public.academy_offers
for all
using (public.is_academy_admin(academy_id))
with check (public.is_academy_admin(academy_id));

drop policy if exists "Academy offer grants read by membership" on public.academy_offer_grants;
create policy "Academy offer grants read by membership"
on public.academy_offer_grants
for select
using (public.is_academy_member(academy_id));

drop policy if exists "Academy offer grants manage by admin" on public.academy_offer_grants;
create policy "Academy offer grants manage by admin"
on public.academy_offer_grants
for all
using (public.is_academy_admin(academy_id))
with check (public.is_academy_admin(academy_id));

drop policy if exists "Academy payments read by membership" on public.academy_payments;
create policy "Academy payments read by membership"
on public.academy_payments
for select
using (public.is_academy_member(academy_id));

drop policy if exists "Academy payments manage by admin" on public.academy_payments;
create policy "Academy payments manage by admin"
on public.academy_payments
for all
using (public.is_academy_admin(academy_id))
with check (public.is_academy_admin(academy_id));

drop policy if exists "Academy entitlements read by membership" on public.academy_entitlements;
create policy "Academy entitlements read by membership"
on public.academy_entitlements
for select
using (public.is_academy_member(academy_id));

drop policy if exists "Academy entitlements manage by admin" on public.academy_entitlements;
create policy "Academy entitlements manage by admin"
on public.academy_entitlements
for all
using (public.is_academy_admin(academy_id))
with check (public.is_academy_admin(academy_id));

drop policy if exists "Academy conversations read by membership" on public.academy_conversations;
create policy "Academy conversations read by membership"
on public.academy_conversations
for select
using (public.is_academy_member(academy_id));

drop policy if exists "Academy conversations manage by admin" on public.academy_conversations;
create policy "Academy conversations manage by admin"
on public.academy_conversations
for all
using (public.is_academy_admin(academy_id))
with check (public.is_academy_admin(academy_id));

drop policy if exists "Academy messages read by membership" on public.academy_messages;
create policy "Academy messages read by membership"
on public.academy_messages
for select
using (public.is_academy_member(academy_id));

drop policy if exists "Academy messages manage by admin" on public.academy_messages;
create policy "Academy messages manage by admin"
on public.academy_messages
for all
using (public.is_academy_admin(academy_id))
with check (public.is_academy_admin(academy_id));

drop policy if exists "Academy alerts read by membership" on public.academy_alerts;
create policy "Academy alerts read by membership"
on public.academy_alerts
for select
using (public.is_academy_member(academy_id));

drop policy if exists "Academy alerts manage by admin" on public.academy_alerts;
create policy "Academy alerts manage by admin"
on public.academy_alerts
for all
using (public.is_academy_admin(academy_id))
with check (public.is_academy_admin(academy_id));

insert into public.products (name, type, status, description, metadata)
select
  'Teacher Studio',
  'tool',
  'active',
  'Academy workspace for sponsored student access and communication.',
  jsonb_build_object('slug', 'teacher-studio')
where not exists (
  select 1 from public.products p where lower(p.name) = 'teacher studio'
);
