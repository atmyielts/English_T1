-- Academy audit events: append-only operational trail for finance, LMS, staff,
-- reports, certificates, and other center-critical actions.

create table if not exists public.academy_audit_events (
  id              uuid primary key default gen_random_uuid(),
  academy_id      uuid not null references public.tenants(id) on delete cascade,
  actor_user_id   uuid references public.users(id) on delete set null,
  actor_role      text,
  action          text not null,
  target_type     text not null,
  target_id       text,
  contact_id      uuid references public.academy_contacts(id) on delete set null,
  classroom_id    uuid references public.academy_classrooms(id) on delete set null,
  status          text not null default 'ok'
    check (status in ('ok','warning','error')),
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists academy_audit_events_academy_created_idx
  on public.academy_audit_events(academy_id, created_at desc);
create index if not exists academy_audit_events_actor_created_idx
  on public.academy_audit_events(actor_user_id, created_at desc);
create index if not exists academy_audit_events_action_created_idx
  on public.academy_audit_events(action, created_at desc);
create index if not exists academy_audit_events_contact_created_idx
  on public.academy_audit_events(contact_id, created_at desc);
create index if not exists academy_audit_events_classroom_created_idx
  on public.academy_audit_events(classroom_id, created_at desc);

alter table public.academy_audit_events enable row level security;

drop policy if exists "Academy audit events read by member" on public.academy_audit_events;
create policy "Academy audit events read by member"
  on public.academy_audit_events for select
  using (public.is_academy_member(academy_id));

drop policy if exists "Academy audit events insert by admin" on public.academy_audit_events;
create policy "Academy audit events insert by admin"
  on public.academy_audit_events for insert
  with check (public.is_academy_admin(academy_id));
