-- Reference resolution is server-side, branch-scoped, and repeatable at commit.
-- Preview grants no access, records no payment, and sends no notifications.
create or replace function public.academy_validate_student_import(
 p_academy_id uuid,p_actor_id uuid,p_job_id uuid,p_branch_ids uuid[] default null,
 p_can_review_all boolean default false,p_can_create_groups boolean default false
) returns jsonb language plpgsql security definer set search_path=public
 set statement_timeout='30s' set lock_timeout='5s' as $$
declare
 v_job public.academy_student_import_jobs%rowtype;v_row public.academy_student_import_rows%rowtype;
 v_result jsonb;v_normal jsonb;v_errors jsonb;v_contacts uuid[];v_contact uuid;v_groups uuid[];v_group uuid;
 v_guardians uuid[];v_guardian uuid;v_action text;v_currency text;v_summary jsonb;v_hash text;
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
 -- Normalize all source rows before duplicate detection, avoiding order-based
 -- guesses about which of two different people sharing a phone should win.
 for v_row in select * from public.academy_student_import_rows where academy_id=p_academy_id and job_id=p_job_id order by row_number loop
  v_result:=public.academy_normalize_student_import_row(v_row.mapped_data,v_job.settings);
  update public.academy_student_import_rows set normalized_data=v_result->'normalized',validation_errors=v_result->'errors' where academy_id=p_academy_id and id=v_row.id;
 end loop;
 -- A single statement finds repeated identity columns, rather than 5,000
 -- repeated scans of the entire upload. These ambiguous rows require correction.
 with repeated as (
  select identity from (
   select 'phone:'||(normalized_data->>'phone') identity from public.academy_student_import_rows where academy_id=p_academy_id and job_id=p_job_id and normalized_data->>'phone' is not null
   union all
   select 'email:'||(normalized_data->>'email') from public.academy_student_import_rows where academy_id=p_academy_id and job_id=p_job_id and normalized_data->>'email' is not null
  ) identities group by identity having count(*)>1
 ) update public.academy_student_import_rows r set validation_errors=r.validation_errors||'"file_identity_ambiguous"'::jsonb
 where r.academy_id=p_academy_id and r.job_id=p_job_id and exists(select 1 from repeated d
  where d.identity='phone:'||(r.normalized_data->>'phone') or d.identity='email:'||(r.normalized_data->>'email'));
 for v_row in select * from public.academy_student_import_rows where academy_id=p_academy_id and job_id=p_job_id order by row_number loop
  v_normal:=v_row.normalized_data;v_errors:=v_row.validation_errors;v_action:='create';v_contact:=null;v_group:=null;v_guardian:=null;
  select array_agg(distinct id order by id) into v_contacts from public.academy_contacts where academy_id=p_academy_id
   and (phone_normalized=v_normal->>'phone' or (v_normal->>'email' is not null and lower(email)=v_normal->>'email'));
  if coalesce(cardinality(v_contacts),0)>1 then v_errors:=v_errors||'"existing_identity_ambiguous"'::jsonb;
  elsif coalesce(cardinality(v_contacts),0)=1 then
   if not exists(select 1 from public.academy_contacts where academy_id=p_academy_id and id=v_contacts[1] and primary_branch_id=v_job.branch_id) then
    v_errors:=v_errors||'"identity_unavailable_in_branch"'::jsonb;
   elsif v_job.settings->>'duplicate_strategy'='reject' then v_errors:=v_errors||'"student_already_exists"'::jsonb;
   elsif v_job.settings->>'duplicate_strategy'='skip' then v_action:='skip';
   else
    v_contact:=v_contacts[1];v_action:='reuse';
    if not exists(select 1 from public.academy_contacts where academy_id=p_academy_id and id=v_contact and status in('active','trial')) then v_errors:=v_errors||'"existing_student_not_active"'::jsonb;end if;
    if coalesce((v_normal->>'ledger_amount')::numeric,0)<>0 then v_errors:=v_errors||'"existing_balance_requires_reconciliation"'::jsonb;end if;
   end if;
  end if;
  if v_action<>'skip' and v_normal->>'group_name' is not null then
   select array_agg(id order by id) into v_groups from public.academy_classrooms where academy_id=p_academy_id and branch_id=v_job.branch_id and lower(trim(name))=lower(v_normal->>'group_name') and is_active;
   if coalesce(cardinality(v_groups),0)>1 then v_errors:=v_errors||'"group_name_ambiguous"'::jsonb;
   elsif coalesce(cardinality(v_groups),0)=1 then v_group:=v_groups[1];
   elsif exists(select 1 from public.academy_classrooms where academy_id=p_academy_id and lower(trim(name))=lower(v_normal->>'group_name')) then v_errors:=v_errors||'"group_name_unavailable"'::jsonb;
   elsif (v_job.settings->>'create_missing_groups')::boolean is distinct from true then v_errors:=v_errors||'"group_not_found"'::jsonb;
   elsif p_can_create_groups is distinct from true then v_errors:=v_errors||'"group_creation_forbidden"'::jsonb;
   else v_normal:=v_normal||jsonb_build_object('create_group',true);end if;
  end if;
  if v_action='reuse' and v_group is not null and exists(select 1 from public.academy_classroom_memberships
   where academy_id=p_academy_id and classroom_id=v_group and contact_id=v_contact and (role<>'student' or status<>'active')) then
   v_errors:=v_errors||'"existing_membership_requires_review"'::jsonb;end if;
  if v_action<>'skip' and v_normal->>'parent_phone' is not null then
   select array_agg(id order by id) into v_guardians from public.academy_guardians where academy_id=p_academy_id and phone_normalized=v_normal->>'parent_phone' and status<>'revoked';
   if coalesce(cardinality(v_guardians),0)>1 then v_errors:=v_errors||'"parent_identity_ambiguous"'::jsonb;
   elsif coalesce(cardinality(v_guardians),0)=1 then
    v_guardian:=v_guardians[1];
    if exists(select 1 from public.academy_guardians where academy_id=p_academy_id and id=v_guardian and status='suspended') then v_errors:=v_errors||'"parent_identity_suspended"'::jsonb;end if;
   end if;
  end if;
  if v_contact is not null and v_guardian is not null and exists(select 1 from public.academy_student_guardian_relationships
   where academy_id=p_academy_id and contact_id=v_contact and guardian_id=v_guardian
    and (status not in('pending','active') or consent_status in('declined','revoked','expired'))) then
   v_errors:=v_errors||'"existing_parent_relationship_requires_review"'::jsonb;end if;
  v_normal:=v_normal||jsonb_build_object('disposition',v_action,'contact_id',v_contact,'classroom_id',v_group,'guardian_id',v_guardian);
  update public.academy_student_import_rows set normalized_data=v_normal,validation_errors=v_errors where academy_id=p_academy_id and id=v_row.id;
 end loop;
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
