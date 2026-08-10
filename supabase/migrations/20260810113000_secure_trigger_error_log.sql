-- trigger_error_log is an internal diagnostic sink used only by SECURITY
-- DEFINER bootstrap triggers. It must never be exposed through the Data API.
alter table public.trigger_error_log enable row level security;
alter table public.trigger_error_log force row level security;

-- No client-facing policies are intentional: RLS defaults to deny. The trigger
-- functions execute as their privileged owner and do not need client grants.
revoke all privileges on table public.trigger_error_log from public;
revoke all privileges on table public.trigger_error_log from anon;
revoke all privileges on table public.trigger_error_log from authenticated;

comment on table public.trigger_error_log is
  'Internal authentication/bootstrap trigger diagnostics. Client access is denied.';
