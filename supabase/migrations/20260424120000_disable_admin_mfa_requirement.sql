-- Disable the mandatory admin MFA gate for existing deployments.

insert into public.admin_security_policies (id, require_mfa)
values (1, false)
on conflict (id) do update
set require_mfa = false,
    updated_at = now();

alter table public.admin_security_policies
alter column require_mfa set default false;
