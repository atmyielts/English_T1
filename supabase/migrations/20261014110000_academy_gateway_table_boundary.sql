-- Shipped clients use the Academy service API for these private records. Broad
-- membership RLS must not provide a second path around resource authorization.
-- Preserve service-role access and all records; this is an ACL-only boundary.
do $boundary$
declare target text;columns text;
begin
 -- Fail the whole atomic block if a busy production table cannot be locked
 -- promptly. This setting is local to the migration transaction.
 perform set_config('lock_timeout','5s',true);
 foreach target in array array['academy_contacts','academy_classrooms','academy_classroom_memberships',
  'academy_payments','academy_staff','academy_role_grants','academy_staff_branch_assignments'] loop
  if to_regclass('public.'||target) is null then raise exception 'Missing reviewed Academy table: %',target;end if;
  execute format('revoke all privileges on table public.%I from public,anon,authenticated',target);
  -- Column grants survive table-level revocation. Close both paths, including
  -- grants introduced by older clients or an administrative SQL session.
  select string_agg(quote_ident(a.attname),',' order by a.attnum) into columns
   from pg_attribute a where a.attrelid=to_regclass('public.'||target) and a.attnum>0 and not a.attisdropped;
  execute format('revoke select(%1$s),insert(%1$s),update(%1$s),references(%1$s) on table public.%2$I from public,anon,authenticated',columns,target);
  execute format('grant all privileges on table public.%I to service_role',target);
 end loop;
end;$boundary$;
