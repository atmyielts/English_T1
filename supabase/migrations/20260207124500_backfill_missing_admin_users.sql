-- ============================================================================
-- BACKFILL: public.users FOR EXISTING ADMIN EMAILS
-- ============================================================================
-- If a user existed in auth.users before our auth->public mirror trigger was fixed,
-- they can be missing from public.users, which breaks tenancy and entitlements.
--
-- We backfill ONLY users whose email is listed in public.platform_admins to keep
-- scope minimal and safe.

insert into public.users (id, email, created_at, updated_at)
select
  au.id,
  coalesce(au.email, 'unknown') as email,
  now() as created_at,
  now() as updated_at
from auth.users au
join public.platform_admins pa on pa.email = au.email
left join public.users u on u.id = au.id
where u.id is null;

