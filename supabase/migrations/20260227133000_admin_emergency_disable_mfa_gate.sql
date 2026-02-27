-- Emergency unlock: disable mandatory admin MFA gate to restore admin access.
-- Re-enable after enrolling MFA on admin accounts.

insert into public.admin_security_policies (id, require_mfa)
values (1, false)
on conflict (id) do update
set require_mfa = excluded.require_mfa,
    updated_at = now();
