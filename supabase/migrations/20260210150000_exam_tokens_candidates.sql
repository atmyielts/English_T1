-- Teacher office + candidate exam tokens
-- Creates exam_tokens and exam_registrations, links sessions, and adds status sync.

create table if not exists public.exam_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  experience_id uuid not null references public.experiences(id) on delete cascade,
  token_code text not null unique,
  status text not null default 'active' check (status in ('active','claimed','expired','disabled')),
  expires_at timestamptz not null,
  max_uses integer not null default 1 check (max_uses >= 1),
  uses_count integer not null default 0 check (uses_count >= 0),
  created_by uuid references public.users(id) on delete set null,
  claimed_by uuid references public.users(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb default '{}'::jsonb
);

create index if not exists exam_tokens_tenant_id_idx on public.exam_tokens(tenant_id);
create index if not exists exam_tokens_experience_id_idx on public.exam_tokens(experience_id);
create index if not exists exam_tokens_status_idx on public.exam_tokens(status);

create table if not exists public.exam_registrations (
  id uuid primary key default gen_random_uuid(),
  token_id uuid not null references public.exam_tokens(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  experience_id uuid not null references public.experiences(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  status text not null default 'registered' check (status in ('registered','started','completed','abandoned')),
  first_name text,
  last_name text,
  legal_name text,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create index if not exists exam_registrations_token_id_idx on public.exam_registrations(token_id);
create index if not exists exam_registrations_user_id_idx on public.exam_registrations(user_id);
create index if not exists exam_registrations_tenant_id_idx on public.exam_registrations(tenant_id);

alter table public.sessions
  add column if not exists token_id uuid references public.exam_tokens(id) on delete set null;

alter table public.sessions
  add column if not exists registration_id uuid references public.exam_registrations(id) on delete set null;

-- RLS policies
alter table public.exam_tokens enable row level security;
alter table public.exam_registrations enable row level security;

create policy "Exam tokens view by membership"
  on public.exam_tokens
  for select
  using (
    exists (
      select 1 from public.tenant_memberships m
      where m.tenant_id = exam_tokens.tenant_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

create policy "Exam tokens manage by owner/admin"
  on public.exam_tokens
  for all
  using (
    exists (
      select 1 from public.tenant_memberships m
      where m.tenant_id = exam_tokens.tenant_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner','admin')
    )
  )
  with check (
    exists (
      select 1 from public.tenant_memberships m
      where m.tenant_id = exam_tokens.tenant_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner','admin')
    )
  );

create policy "Exam registrations view by owner/admin"
  on public.exam_registrations
  for select
  using (
    exists (
      select 1 from public.tenant_memberships m
      where m.tenant_id = exam_registrations.tenant_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner','admin')
    )
  );

create policy "Exam registrations view own"
  on public.exam_registrations
  for select
  using (user_id = auth.uid());

-- Sync registration status from session status
create or replace function public.handle_exam_registration_status()
returns trigger as $$
begin
  if new.registration_id is not null and (old.status is distinct from new.status) then
    update public.exam_registrations
      set status = case
        when new.status = 'completed' then 'completed'
        when new.status = 'abandoned' then 'abandoned'
        when new.status = 'active' then 'started'
        else status
      end
      where id = new.registration_id;
  end if;

  return new;
end;
$$ language plpgsql;

-- Trigger only if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'sessions_exam_registration_status'
  ) THEN
    CREATE TRIGGER sessions_exam_registration_status
    AFTER UPDATE ON public.sessions
    FOR EACH ROW
    EXECUTE PROCEDURE public.handle_exam_registration_status();
  END IF;
END $$;

