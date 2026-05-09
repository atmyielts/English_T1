-- ============================================================================
-- IELTS EXAM INTEGRITY EVENTS + STRICT MODE FLAGS
-- ============================================================================
-- Adds an append-only audit log of integrity-relevant events emitted by the
-- IELTS exam runtime (focus loss, paste, fullscreen exit, reload, manual /
-- auto-submit, instruction/headphone acknowledgements, etc).
--
-- The table is server-write only via the `exam-integrity` Edge Function (which
-- authenticates the candidate and uses the service role to insert). End-users
-- can read their own events; admins can read all events for any session.
--
-- Strict mode and instruction acknowledgements live on session.metadata under
-- the keys `strict_mode`, `instructions_acknowledged_at`, `headphones_checked_at`,
-- `identity_acknowledged_at`. They are written by the same Edge Function so the
-- existing sessions_integrity_guard trigger does not block the candidate.

create table if not exists public.exam_integrity_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null,
  section_id uuid null references public.sections(id) on delete set null,
  event_type text not null check (
    event_type in (
      'focus_loss',
      'focus_return',
      'tab_hidden',
      'tab_visible',
      'fullscreen_enter',
      'fullscreen_exit',
      'paste',
      'copy',
      'cut',
      'context_menu',
      'reload',
      'devtools_suspected',
      'auto_submit',
      'manual_submit',
      'instructions_acknowledged',
      'headphones_checked',
      'identity_acknowledged',
      'audio_blocked',
      'audio_resumed',
      'lock_warning',
      'note'
    )
  ),
  severity text not null default 'info' check (severity in ('info', 'warn', 'high')),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists exam_integrity_events_session_idx
  on public.exam_integrity_events (session_id, created_at desc);

create index if not exists exam_integrity_events_user_idx
  on public.exam_integrity_events (user_id, created_at desc);

alter table public.exam_integrity_events enable row level security;

drop policy if exists "Integrity events read own" on public.exam_integrity_events;
create policy "Integrity events read own"
on public.exam_integrity_events
for select
using (auth.uid() = user_id);

drop policy if exists "Integrity events read admin" on public.exam_integrity_events;
create policy "Integrity events read admin"
on public.exam_integrity_events
for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) like 'admin%'
  )
);

-- No INSERT policy: only the service role (used by the exam-integrity Edge
-- Function) may write events. This prevents tampering by candidates.

comment on table public.exam_integrity_events is
  'Append-only audit log of IELTS exam runtime integrity events. Service-role-only writes via the exam-integrity Edge Function.';
