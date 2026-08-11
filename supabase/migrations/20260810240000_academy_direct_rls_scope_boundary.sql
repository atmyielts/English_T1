-- Branch/classroom-scoped specialists are served by the branch-filtering Academy
-- service layer. Do not let broad academy-level RLS helpers turn a scoped grant
-- into direct PostgREST access to every branch.

create or replace function public.academy_org_can_view(target_academy_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.tenant_memberships m where m.tenant_id=target_academy_id and m.user_id=auth.uid() and m.status='active')
  or exists(select 1 from public.academy_role_grants g where g.academy_id=target_academy_id and g.user_id=auth.uid()
    and g.scope_type='academy' and g.status in('invited','active') and g.starts_at<=now() and(g.expires_at is null or g.expires_at>now()));
$$;

create or replace function public.academy_org_can_manage(target_academy_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.tenant_memberships m where m.tenant_id=target_academy_id and m.user_id=auth.uid() and m.status='active' and m.role in('owner','admin'))
  or exists(select 1 from public.academy_role_grants g where g.academy_id=target_academy_id and g.user_id=auth.uid()
    and g.role in('owner','admin','center_admin','manager') and g.scope_type='academy'
    and g.status in('invited','active') and g.starts_at<=now() and(g.expires_at is null or g.expires_at>now()));
$$;

create or replace function public.academy_crm_can_access(target_academy_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.tenant_memberships m where m.tenant_id=target_academy_id and m.user_id=auth.uid() and m.status='active' and m.role in('owner','admin'))
  or exists(select 1 from public.academy_role_grants g where g.academy_id=target_academy_id and g.user_id=auth.uid()
    and g.role in('owner','admin','center_admin','manager','counselor') and g.scope_type='academy'
    and g.status in('invited','active') and g.starts_at<=now() and(g.expires_at is null or g.expires_at>now()));
$$;

create or replace function public.academy_finance_can_view(target_academy_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.tenant_memberships m where m.tenant_id=target_academy_id and m.user_id=auth.uid() and m.status='active' and m.role in('owner','admin'))
  or exists(select 1 from public.academy_role_grants g where g.academy_id=target_academy_id and g.user_id=auth.uid()
    and g.role in('owner','admin','center_admin') and g.scope_type='academy'
    and g.status in('invited','active') and g.starts_at<=now() and(g.expires_at is null or g.expires_at>now()));
$$;

create or replace function public.academy_payroll_can_view(p_academy_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.tenant_memberships m where m.tenant_id=p_academy_id and m.user_id=auth.uid() and m.status='active' and m.role in('owner','admin'))
  or exists(select 1 from public.academy_role_grants g where g.academy_id=p_academy_id and g.user_id=auth.uid()
    and g.role in('owner','admin','center_admin') and g.scope_type='academy'
    and g.status='active' and(g.starts_at is null or g.starts_at<=now()) and(g.expires_at is null or g.expires_at>now()));
$$;

create or replace function public.academy_intelligence_can_access(p_academy_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.tenant_memberships m where m.tenant_id=p_academy_id and m.user_id=auth.uid() and m.status='active' and m.role in('owner','admin'))
  or exists(select 1 from public.academy_role_grants g where g.academy_id=p_academy_id and g.user_id=auth.uid()
    and g.role in('owner','admin','center_admin','manager','counselor') and g.scope_type='academy'
    and g.status='active' and g.starts_at<=now() and(g.expires_at is null or g.expires_at>now()));
$$;

revoke all on function public.academy_org_can_view(uuid) from public,anon;
revoke all on function public.academy_org_can_manage(uuid) from public,anon;
revoke all on function public.academy_crm_can_access(uuid) from public,anon;
revoke all on function public.academy_finance_can_view(uuid) from public,anon;
revoke all on function public.academy_payroll_can_view(uuid) from public,anon;
revoke all on function public.academy_intelligence_can_access(uuid) from public,anon;
grant execute on function public.academy_org_can_view(uuid) to authenticated,service_role;
grant execute on function public.academy_org_can_manage(uuid) to authenticated,service_role;
grant execute on function public.academy_crm_can_access(uuid) to authenticated,service_role;
grant execute on function public.academy_finance_can_view(uuid) to authenticated,service_role;
grant execute on function public.academy_payroll_can_view(uuid) to authenticated,service_role;
grant execute on function public.academy_intelligence_can_access(uuid) to authenticated,service_role;
