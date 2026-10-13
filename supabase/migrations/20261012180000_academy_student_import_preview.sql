-- Reference resolution is server-side, branch-scoped, and repeatable at commit.
-- Preview grants no access, records no payment, and sends no notifications.
create or replace function public.academy_validate_student_import(
 p_academy_id uuid,p_actor_id uuid,p_job_id uuid,p_branch_ids uuid[] default null,
 p_can_review_all boolean default false,p_can_create_groups boolean default false
) returns jsonb language plpgsql security definer set search_path=public
 set statement_timeout='30s' set lock_timeout='5s' as $$
declare
 v_job public.academy_student_import_jobs%rowtype;v_currency text;v_summary jsonb;v_hash text;
begin
 if not exists(select 1 from public.users where id=p_actor_id and is_active) then raise exception 'An active account is required';end if;
 select * into v_job from public.academy_student_import_jobs where academy_id=p_academy_id and id=p_job_id for update;
 if not found or (v_job.created_by<>p_actor_id and p_can_review_all is distinct from true)
  or (p_branch_ids is not null and (v_job.branch_id=any(p_branch_ids)) is distinct from true) then raise exception 'Forbidden import job';end if;
 if v_job.status not in('sealed','validated') then raise exception 'A sealed upload is required before validation';end if;
 if not exists(select 1 from public.academy_branches where academy_id=p_academy_id and id=v_job.branch_id and is_active) then raise exception 'An active import branch is required';end if;
 -- Currency must match the Academy's actual configured ledger currency.
 select currency into v_currency from public.academy_localization_settings where academy_id=p_academy_id;
 if coalesce(v_currency,'UZS') is distinct from (v_job.settings->>'currency') then raise exception 'Import currency must match the Academy currency';end if;
 -- Resolve the complete file in one statement. Revalidation still recomputes
 -- live references; only deterministic normalization is cached. Each source row
 -- is updated once instead of issuing several queries and two writes per row.
 with base as materialized (
  select id,coalesce(normalization,public.academy_normalize_student_import_row(mapped_data,v_job.settings)) result
  from public.academy_student_import_rows where academy_id=p_academy_id and job_id=p_job_id
 ), normalized as materialized (
  select id,result,result->'normalized' n,result->'errors' errors from base
 ), repeated as materialized (
  select identity from (
   select 'phone:'||(n->>'phone') identity from normalized where n->>'phone' is not null
   union all select 'email:'||(n->>'email') from normalized where n->>'email' is not null
  ) identities group by identity having count(*)>1
 ), resolved as materialized (
  select b.*,coalesce(cardinality(c.ids),0) contact_count,c.ids[1] contact_id,c.in_branch,c.active,
   coalesce(cardinality(g.ids),0) group_count,g.ids[1] classroom_id,g.any_group,
   coalesce(cardinality(p.ids),0) guardian_count,p.ids[1] guardian_id,p.suspended,
   coalesce('phone:'||(b.n->>'phone') in(select identity from repeated),false)
    or coalesce('email:'||(b.n->>'email') in(select identity from repeated),false) file_ambiguous
  from normalized b
  cross join lateral (
   select array_agg(c.id order by c.id) ids,bool_and((c.primary_branch_id=v_job.branch_id) is true
    or(c.primary_branch_id is null and exists(select 1 from public.academy_classroom_memberships m
     join public.academy_classrooms k on k.academy_id=m.academy_id and k.id=m.classroom_id
     where m.academy_id=p_academy_id and m.contact_id=c.id and m.role='student' and m.status in('active','trial') and k.branch_id=v_job.branch_id))) in_branch,
    bool_and(c.status in('active','trial')) active from (
    select id,primary_branch_id,status from public.academy_contacts where academy_id=p_academy_id and phone_normalized=b.n->>'phone'
    union select id,primary_branch_id,status from public.academy_contacts where academy_id=p_academy_id and lower(email)=b.n->>'email'
   ) c
  ) c
  cross join lateral (
   select array_agg(id order by id) filter(where branch_id=v_job.branch_id and is_active) ids,count(*)>0 any_group
   from public.academy_classrooms where academy_id=p_academy_id and lower(trim(name))=lower(b.n->>'group_name')
  ) g
  cross join lateral (
   select array_agg(id order by id) ids,bool_or(status='suspended') suspended
   from public.academy_guardians where academy_id=p_academy_id and phone_normalized=b.n->>'parent_phone' and status<>'revoked'
  ) p
 ), actions as materialized (
  select r.*,
   case when contact_count=1 and in_branch and v_job.settings->>'duplicate_strategy'='skip' then 'skip'
    when contact_count=1 and in_branch and v_job.settings->>'duplicate_strategy'='reuse' then 'reuse' else 'create' end disposition
  from resolved r
 ), checked as (
  select a.id,a.result,
   a.n||case when disposition<>'skip' and a.n->>'group_name' is not null and group_count=0 and not any_group
    and (v_job.settings->>'create_missing_groups')::boolean and p_can_create_groups is true then jsonb_build_object('create_group',true) else '{}'::jsonb end
    ||jsonb_build_object('disposition',disposition,'contact_id',case when disposition='reuse' then contact_id end,
     'classroom_id',case when disposition<>'skip' and group_count=1 then classroom_id end,
     'guardian_id',case when disposition<>'skip' and guardian_count=1 then guardian_id end) n,
   a.errors||to_jsonb(array_remove(array[
    case when file_ambiguous then 'file_identity_ambiguous' end,
    case when contact_count>1 then 'existing_identity_ambiguous' end,
    case when contact_count=1 and not in_branch then 'identity_unavailable_in_branch' end,
    case when contact_count=1 and in_branch and v_job.settings->>'duplicate_strategy'='reject' then 'student_already_exists' end,
    case when disposition='reuse' and not active then 'existing_student_not_active' end,
    case when disposition='reuse' and coalesce((a.n->>'ledger_amount')::numeric,0)<>0 then 'existing_balance_requires_reconciliation' end,
    case when disposition<>'skip' and a.n->>'group_name' is not null and group_count>1 then 'group_name_ambiguous' end,
    case when disposition<>'skip' and a.n->>'group_name' is not null and group_count=0 and any_group then 'group_name_unavailable' end,
    case when disposition<>'skip' and a.n->>'group_name' is not null and group_count=0 and not any_group
     and (v_job.settings->>'create_missing_groups')::boolean is distinct from true then 'group_not_found' end,
    case when disposition<>'skip' and a.n->>'group_name' is not null and group_count=0 and not any_group
     and (v_job.settings->>'create_missing_groups')::boolean is true and p_can_create_groups is distinct from true then 'group_creation_forbidden' end,
    case when disposition='reuse' and group_count=1 and exists(select 1 from public.academy_classroom_memberships
     where academy_id=p_academy_id and classroom_id=a.classroom_id and contact_id=a.contact_id and (role<>'student' or status<>'active')) then 'existing_membership_requires_review' end,
    case when disposition<>'skip' and a.n->>'parent_phone' is not null and guardian_count>1 then 'parent_identity_ambiguous' end,
    case when disposition<>'skip' and a.n->>'parent_phone' is not null and guardian_count=1 and suspended then 'parent_identity_suspended' end,
    case when disposition='reuse' and guardian_count=1 and exists(select 1 from public.academy_student_guardian_relationships
     where academy_id=p_academy_id and contact_id=a.contact_id and guardian_id=a.guardian_id
      and (status not in('pending','active') or consent_status in('declined','revoked','expired'))) then 'existing_parent_relationship_requires_review' end
   ],null)) errors
  from actions a
 ) update public.academy_student_import_rows r set normalization=b.result,normalized_data=b.n,validation_errors=b.errors
  from checked b where r.academy_id=p_academy_id and r.job_id=p_job_id and r.id=b.id
   and row(r.normalization,r.normalized_data,r.validation_errors) is distinct from row(b.result,b.n,b.errors);
 -- Capacity includes every new active membership planned by this file. Existing
 -- active memberships being reused do not consume a second seat.
 with additions as (
  select (r.normalized_data->>'classroom_id')::uuid classroom_id,count(*) n
  from public.academy_student_import_rows r where r.academy_id=p_academy_id and r.job_id=p_job_id
   and r.normalized_data->>'classroom_id' is not null and r.normalized_data->>'disposition'<>'skip' and r.validation_errors='[]'::jsonb
   and not exists(select 1 from public.academy_classroom_memberships m where m.academy_id=p_academy_id
    and m.classroom_id=(r.normalized_data->>'classroom_id')::uuid and m.contact_id=(r.normalized_data->>'contact_id')::uuid and m.role='student' and m.status='active')
  group by (r.normalized_data->>'classroom_id')::uuid
 ), exceeded as (
  select c.id from additions a join public.academy_classrooms c on c.academy_id=p_academy_id and c.id=a.classroom_id
  where c.student_capacity is not null and a.n+(select count(*) from public.academy_classroom_memberships m where m.academy_id=p_academy_id and m.classroom_id=c.id and m.role='student' and m.status='active')>c.student_capacity
 ) update public.academy_student_import_rows r set validation_errors=r.validation_errors||'"group_capacity_exceeded"'::jsonb
 where r.academy_id=p_academy_id and r.job_id=p_job_id and r.normalized_data->>'disposition'<>'skip'
  and (r.normalized_data->>'classroom_id')::uuid in(select id from exceeded);
 select jsonb_build_object('total_rows',count(*),'invalid_rows',count(*) filter(where validation_errors<>'[]'::jsonb),
  'create_rows',count(*) filter(where validation_errors='[]'::jsonb and normalized_data->>'disposition'='create'),
  'reuse_rows',count(*) filter(where validation_errors='[]'::jsonb and normalized_data->>'disposition'='reuse'),
  'skipped_rows',count(*) filter(where validation_errors='[]'::jsonb and normalized_data->>'disposition'='skip'),
  'new_groups',count(distinct lower(normalized_data->>'group_name')) filter(where validation_errors='[]'::jsonb and normalized_data->>'create_group'='true'),
  'balance_rows',count(*) filter(where validation_errors='[]'::jsonb and normalized_data->>'disposition'<>'skip' and (normalized_data->>'ledger_amount')::numeric<>0),
  'opening_debt',coalesce(sum((normalized_data->>'ledger_amount')::numeric) filter(where validation_errors='[]'::jsonb and normalized_data->>'disposition'<>'skip' and (normalized_data->>'ledger_amount')::numeric>0),0)::text,
  'opening_credit',coalesce(-sum((normalized_data->>'ledger_amount')::numeric) filter(where validation_errors='[]'::jsonb and normalized_data->>'disposition'<>'skip' and (normalized_data->>'ledger_amount')::numeric<0),0)::text,
  'currency',v_job.settings->>'currency') into v_summary from public.academy_student_import_rows where academy_id=p_academy_id and job_id=p_job_id;
 select encode(sha256(convert_to(jsonb_build_object('settings',v_job.settings,'summary',v_summary,'rows',jsonb_agg(jsonb_build_object('n',row_number,'values',normalized_data,'errors',validation_errors) order by row_number))::text,'UTF8')),'hex') into v_hash
  from public.academy_student_import_rows where academy_id=p_academy_id and job_id=p_job_id;
 v_summary:=v_summary||jsonb_build_object('preview_hash',v_hash,'ready',v_summary->>'invalid_rows'='0','requires_finance_approval',(v_summary->>'balance_rows')::integer>0);
 update public.academy_student_import_jobs set validation=v_summary,status=case when v_summary->>'invalid_rows'='0' then 'validated' else 'sealed' end
  where academy_id=p_academy_id and id=p_job_id returning * into v_job;
 return jsonb_build_object('job',to_jsonb(v_job));
end;$$;
revoke all on function public.academy_validate_student_import(uuid,uuid,uuid,uuid[],boolean,boolean) from public,anon,authenticated;
grant execute on function public.academy_validate_student_import(uuid,uuid,uuid,uuid[],boolean,boolean) to service_role;
