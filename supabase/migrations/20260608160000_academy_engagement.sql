-- Engagement loop: notification outbox + at-risk scan support

-- ── Notification outbox ───────────────────────────────────────────────────────
-- Queued messages dispatched to students/parents over Telegram (and later email).
create table if not exists public.academy_notifications (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null references public.tenants(id) on delete cascade,
  contact_id   uuid references public.academy_contacts(id) on delete cascade,
  channel      text not null default 'telegram'
    check (channel in ('telegram','email','inapp')),
  type         text not null,         -- 'assignment_due','class_reminder','new_grade','announcement','at_risk'
  title        text,
  body         text not null,
  target       text,                  -- telegram chat id / email captured at queue time
  status       text not null default 'queued'
    check (status in ('queued','sent','failed','skipped')),
  error        text,
  attempts     integer not null default 0,
  scheduled_at timestamptz not null default now(),
  sent_at      timestamptz,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists academy_notifications_academy_idx  on public.academy_notifications(academy_id);
create index if not exists academy_notifications_pending_idx  on public.academy_notifications(status, scheduled_at);
create index if not exists academy_notifications_contact_idx  on public.academy_notifications(contact_id);

alter table public.academy_notifications enable row level security;

drop policy if exists "Academy notifications read by member" on public.academy_notifications;
create policy "Academy notifications read by member"
  on public.academy_notifications for select
  using (public.is_academy_member(academy_id));

drop policy if exists "Academy notifications manage by admin" on public.academy_notifications;
create policy "Academy notifications manage by admin"
  on public.academy_notifications for all
  using (public.is_academy_admin(academy_id))
  with check (public.is_academy_admin(academy_id));

-- ── Notification preference on contacts ───────────────────────────────────────
-- Default on; students/parents can opt out by flipping metadata.notify_opt_out.
alter table public.academy_contacts
  add column if not exists notify_enabled boolean not null default true;
