-- ============================================================================
-- FUNCTION ERROR LOG: persistent capture of edge function failures
-- ============================================================================
-- We blew an hour debugging a production 500 because Supabase's edge function
-- logs are only available via the dashboard / management API, and the latter
-- requires a personal access token we don't ship with our deploy creds. This
-- table is the in-band alternative: any edge function can catch an error and
-- write a row here, and we can surface them in an admin page without leaving
-- the project.
--
-- RLS: admin-only read; writes are unrestricted from service-role (functions
-- use service-role anyway) but blocked for regular users so a bug can't be
-- exploited to spam the table.

create table if not exists public.app_function_error_log (
  id uuid primary key default gen_random_uuid(),
  function_name text not null,
  route text,
  http_status integer,
  user_id uuid references public.users(id) on delete set null,
  error_message text not null,
  error_stack text,
  request_summary jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists app_function_error_log_recent_idx
  on public.app_function_error_log(function_name, occurred_at desc);

create index if not exists app_function_error_log_user_idx
  on public.app_function_error_log(user_id, occurred_at desc)
  where user_id is not null;

alter table public.app_function_error_log enable row level security;

drop policy if exists "Function error log admin read" on public.app_function_error_log;
create policy "Function error log admin read"
on public.app_function_error_log
for select
using (public.is_admin());

drop policy if exists "Function error log admin manage" on public.app_function_error_log;
create policy "Function error log admin manage"
on public.app_function_error_log
for all
using (public.is_admin())
with check (public.is_admin());
