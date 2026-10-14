-- Current database authority for the combined importer. Browser payloads and
-- the presentation role never establish branch/classroom/student permissions.
create or replace function public.academy_student_import_role_has(p_role text,p_capability text)
returns boolean language sql immutable set search_path=public as $$
 select case p_capability
  when 'import' then p_role in('owner','admin','center_admin','manager','counselor','branch_manager','receptionist')
  when 'review' then p_role in('owner','admin','center_admin','manager','counselor','branch_manager')
  when 'groups' then p_role in('owner','admin','center_admin','manager','counselor','branch_manager')
  when 'finance' then p_role in('owner','admin','center_admin','accountant')
  when 'view_finance' then p_role in('owner','admin','center_admin','branch_manager','cashier','accountant')
  else false end;
$$;
revoke all on function public.academy_student_import_role_has(text,text) from public,anon,authenticated,service_role;

create or replace function public.academy_student_import_scope_ids(p_value jsonb)
returns uuid[] language sql immutable set search_path=public as $$
 select public.academy_authority_scope_ids(p_value);
$$;
revoke all on function public.academy_student_import_scope_ids(jsonb) from public,anon,authenticated,service_role;

create or replace function public.academy_student_import_authorities(p_academy_id uuid,p_actor_id uuid)
returns jsonb language sql security definer set search_path=public as $$
 select public.academy_current_authorities(p_academy_id,p_actor_id);
$$;
revoke all on function public.academy_student_import_authorities(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.academy_student_import_scope_covers(
 p_authorities jsonb,p_capability text,p_branch_id uuid,p_classroom_ids uuid[],p_contact_id uuid
) returns boolean language sql immutable set search_path=public as $$
 select exists(select 1 from jsonb_array_elements(p_authorities) a where public.academy_student_import_role_has(a->>'role',p_capability)
  and case a->>'scope_type'
   when 'academy' then true
   when 'branches' then a->'scope_ids' @> to_jsonb(array[p_branch_id])
   when 'classrooms' then exists(select 1 from unnest(p_classroom_ids) c where a->'scope_ids' @> to_jsonb(array[c]))
   when 'students' then p_contact_id is not null and a->'scope_ids' @> to_jsonb(array[p_contact_id])
   else false end);
$$;
revoke all on function public.academy_student_import_scope_covers(jsonb,text,uuid,uuid[],uuid) from public,anon,authenticated,service_role;

create or replace function public.academy_student_import_branch_access(p_academy_id uuid,p_authorities jsonb,p_branch_id uuid,p_capability text)
returns boolean language sql stable security definer set search_path=public as $$
 select public.academy_student_import_scope_covers(p_authorities,p_capability,p_branch_id,'{}'::uuid[],null)
  or exists(select 1 from jsonb_array_elements(p_authorities) a where public.academy_student_import_role_has(a->>'role',p_capability)
   and case a->>'scope_type'
    when 'classrooms' then exists(select 1 from public.academy_classrooms c where c.academy_id=p_academy_id and c.branch_id=p_branch_id
     and a->'scope_ids' @> to_jsonb(array[c.id]))
    when 'students' then exists(select 1 from public.academy_contacts c where c.academy_id=p_academy_id and a->'scope_ids' @> to_jsonb(array[c.id])
     and(c.primary_branch_id=p_branch_id or exists(select 1 from public.academy_classroom_memberships m
      join public.academy_classrooms k on k.academy_id=m.academy_id and k.id=m.classroom_id
      where m.academy_id=p_academy_id and m.contact_id=c.id and m.role='student' and m.status in('active','trial') and k.branch_id=p_branch_id)))
    else false end);
$$;
revoke all on function public.academy_student_import_branch_access(uuid,jsonb,uuid,text) from public,anon,authenticated,service_role;

create or replace function public.academy_student_import_row_targets(p_academy_id uuid,p_job_id uuid)
returns table(row_id uuid,row_number integer,branch_id uuid,contact_id uuid,classroom_ids uuid[],normalized jsonb)
language sql stable security definer set search_path=public set enable_nestloop=off set jit=off as $$
 with job as materialized(select * from public.academy_student_import_jobs where academy_id=p_academy_id and id=p_job_id),
 normalized as materialized(
  select r.id,r.row_number,j.branch_id,coalesce(r.normalized_data,(coalesce(r.normalization,public.academy_normalize_student_import_row(r.mapped_data,j.settings)))->'normalized') n
   from public.academy_student_import_rows r cross join job j where r.academy_id=p_academy_id and r.job_id=p_job_id
 ), groups as materialized(
  select lower(trim(c.name)) name,array_agg(c.id order by c.id) ids from public.academy_classrooms c cross join job j
   where c.academy_id=p_academy_id and c.branch_id=j.branch_id and c.is_active group by lower(trim(c.name))
 ), identities as materialized(
  select 'phone:'||phone_normalized identity,id from public.academy_contacts where academy_id=p_academy_id and phone_normalized is not null
  union all select 'email:'||lower(email),id from public.academy_contacts where academy_id=p_academy_id and email is not null
 ), row_keys as materialized(
  select id,'phone:'||(n->>'phone') identity from normalized where n->>'phone' is not null
  union all select id,'email:'||(n->>'email') from normalized where n->>'email' is not null
 ), matched as materialized(
  select k.id,array_agg(distinct i.id order by i.id) ids from row_keys k join identities i on i.identity=k.identity group by k.id
 ), targets as materialized(
  select n.*,
   case when n.n->>'classroom_id' is not null then (n.n->>'classroom_id')::uuid when cardinality(g.ids)=1 then g.ids[1] end classroom_id,
   case when n.n->>'contact_id' is not null then (n.n->>'contact_id')::uuid when cardinality(c.ids)=1 then c.ids[1] end contact_id
   from normalized n left join groups g on g.name=lower(trim(n.n->>'group_name')) left join matched c on c.id=n.id
 ), members as materialized(
  select m.contact_id,array_agg(distinct m.classroom_id order by m.classroom_id) ids from public.academy_classroom_memberships m
   where m.academy_id=p_academy_id and m.role='student' and m.status in('active','trial') group by m.contact_id
 ), resources as materialized(
  select t.*,case when t.classroom_id is not null then array[t.classroom_id] else coalesce(m.ids,'{}'::uuid[]) end classroom_ids
   from targets t left join members m on m.contact_id=t.contact_id
 ) select id,row_number,branch_id,contact_id,classroom_ids,n from resources;
$$;
revoke all on function public.academy_student_import_row_targets(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.academy_student_import_row_authorization(p_academy_id uuid,p_job_id uuid,p_authorities jsonb)
returns table(row_id uuid,row_number integer,operation_allowed boolean,review_allowed boolean,finance_allowed boolean,finance_visible boolean)
language sql stable security definer set search_path=public as $$
 select row_id,row_number,
  public.academy_student_import_scope_covers(p_authorities,'import',branch_id,classroom_ids,contact_id)
   and(case when coalesce(normalized->>'create_group','false')='true' then public.academy_student_import_scope_covers(p_authorities,'groups',branch_id,'{}'::uuid[],null) else true end),
  public.academy_student_import_scope_covers(p_authorities,'review',branch_id,classroom_ids,contact_id),
  coalesce(normalized->>'disposition','')='skip' or coalesce((normalized->>'ledger_amount')::numeric,0)=0
   or public.academy_student_import_scope_covers(p_authorities,'finance',branch_id,classroom_ids,contact_id),
  public.academy_student_import_scope_covers(p_authorities,'view_finance',branch_id,classroom_ids,contact_id)
 from public.academy_student_import_row_targets(p_academy_id,p_job_id);
$$;
revoke all on function public.academy_student_import_row_authorization(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create or replace function public.academy_student_import_lock_references(p_academy_id uuid,p_job_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_bucket integer;
begin
 perform pg_advisory_xact_lock(hashtext(p_academy_id::text),-1);
 -- Cache only the deterministic frozen-source normalization. Repeated scope
 -- and lock queries must not parse every cell again for a large file.
 update public.academy_student_import_rows r set normalization=public.academy_normalize_student_import_row(r.mapped_data,j.settings)
  from public.academy_student_import_jobs j where j.academy_id=r.academy_id and j.id=r.job_id
   and r.academy_id=p_academy_id and r.job_id=p_job_id and r.normalization is null;
 for v_bucket in with source_values as materialized(
  select coalesce(r.normalized_data,(coalesce(r.normalization,public.academy_normalize_student_import_row(r.mapped_data,j.settings)))->'normalized') n
   from public.academy_student_import_rows r join public.academy_student_import_jobs j on j.academy_id=r.academy_id and j.id=r.job_id
   where r.academy_id=p_academy_id and r.job_id=p_job_id
 ) select distinct public.academy_import_identity_bucket(kind,value) from(
  select 'phone' kind,n->>'phone' value from source_values union all select 'email',n->>'email' from source_values
  union all select 'guardian',n->>'parent_phone' from source_values union all select 'group',lower(n->>'group_name') from source_values
 ) identities where value is not null order by 1 loop perform pg_advisory_xact_lock(hashtext(p_academy_id::text),v_bucket);end loop;
 perform 1 from public.academy_branches where academy_id=p_academy_id and id=(select branch_id from public.academy_student_import_jobs where academy_id=p_academy_id and id=p_job_id) for update;
 -- Freeze both reviewed IDs and current name/phone references, in the same
 -- classroom-first order as ordinary enrollment and the private write engines.
 perform 1 from public.academy_classrooms c where c.academy_id=p_academy_id and(c.id in(
  select unnest(classroom_ids) from public.academy_student_import_row_targets(p_academy_id,p_job_id))
  or lower(trim(c.name)) in(select lower(normalized->>'group_name') from public.academy_student_import_row_targets(p_academy_id,p_job_id))) order by c.id for update;
 perform 1 from public.academy_contacts c where c.academy_id=p_academy_id and(c.id in(
  select contact_id from public.academy_student_import_row_targets(p_academy_id,p_job_id))
  or c.phone_normalized in(select normalized->>'phone' from public.academy_student_import_row_targets(p_academy_id,p_job_id))
  or lower(c.email) in(select normalized->>'email' from public.academy_student_import_row_targets(p_academy_id,p_job_id))) order by c.id for update;
end;$$;
revoke all on function public.academy_student_import_lock_references(uuid,uuid) from public,anon,authenticated,service_role;

-- UPDATE/INSERT already lock the classroom through the capacity guard. DELETE
-- must use that same fence so withdrawal/removal cannot invalidate the class
-- association relied on by an in-flight scoped import.
create or replace function public.academy_student_import_membership_delete_lock()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform 1 from public.academy_classrooms where academy_id=old.academy_id and id=old.classroom_id for update;
 return old;
end;$$;
create trigger academy_student_import_membership_delete_lock before delete on public.academy_classroom_memberships
 for each row execute function public.academy_student_import_membership_delete_lock();
revoke all on function public.academy_student_import_membership_delete_lock() from public,anon,authenticated,service_role;

create or replace function public.academy_assert_student_import_authority(p_academy_id uuid,p_actor_id uuid,p_job_id uuid,p_mode text)
returns void language plpgsql security definer set search_path=public as $$
declare v_authorities jsonb;v_creator uuid;
begin
 v_authorities:=public.academy_student_import_authorities(p_academy_id,p_actor_id);
 select created_by into v_creator from public.academy_student_import_jobs where academy_id=p_academy_id and id=p_job_id;
 if not found or exists(select 1 from public.academy_student_import_row_authorization(p_academy_id,p_job_id,v_authorities)
  where not operation_allowed or(p_actor_id<>v_creator and not review_allowed) or(p_mode in('commit','recover') and not finance_allowed)) then
  raise exception using errcode='42501',message='Current student import permissions do not cover every row and opening balance';end if;
 if not exists(select 1 from jsonb_array_elements(v_authorities) a where public.academy_student_import_role_has(a->>'role','import')) then
  raise exception using errcode='42501',message='Forbidden student import';end if;
end;$$;
revoke all on function public.academy_assert_student_import_authority(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;

create or replace function public.academy_student_import_public_job(p_job jsonb,p_finance_visible boolean)
returns jsonb language sql immutable set search_path=public as $$
 select case when p_finance_visible then p_job-'request_scope'-'commit_scope'-'recovery_scope' else
  (p_job-'request_scope'-'commit_scope'-'recovery_scope')||jsonb_build_object(
   'validation',case when p_job->'validation' is null or p_job->'validation'='null' then null else
    ((p_job->'validation')-'opening_debt'-'opening_credit'-'balance_rows')||'{"opening_debt":null,"opening_credit":null,"balance_rows":null}'::jsonb end,
   'receipt',case when p_job->'receipt' is null or p_job->'receipt'='null' then null else (p_job->'receipt')-'opening_debt'-'opening_credit' end)
  end;
$$;
revoke all on function public.academy_student_import_public_job(jsonb,boolean) from public,anon,authenticated,service_role;

create or replace function public.academy_student_import_command(p_academy_id uuid,p_actor_id uuid,p_action text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public set statement_timeout='45s' set lock_timeout='5s' set enable_nestloop=off set jit=off as $$
declare
 v_authorities jsonb;v_job public.academy_student_import_jobs%rowtype;v_branch uuid;v_result jsonb;v_permissions jsonb;
 v_read boolean;v_operation boolean;v_finance boolean;v_view_money boolean;v_other_review boolean;v_offset integer;v_limit integer;
 v_rows jsonb;v_jobs jsonb;v_groups jsonb;v_branches jsonb;v_currency text;v_cursor_time timestamptz;v_cursor_id uuid;
begin
 if p_action not in('options','stage','preview','commit','recover','job','rows','list','lookup','cancel') or jsonb_typeof(p_payload) is distinct from 'object' then
  raise exception 'A valid student import command is required';end if;
 v_authorities:=public.academy_student_import_authorities(p_academy_id,p_actor_id);
 if not exists(select 1 from jsonb_array_elements(v_authorities) a where public.academy_student_import_role_has(a->>'role','import')) then
  raise exception using errcode='42501',message='Forbidden student import';end if;
 if p_action='options' then
  select coalesce(currency,'UZS') into v_currency from public.academy_localization_settings where academy_id=p_academy_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'timezone',b.timezone,'currency',coalesce(v_currency,'UZS'),
   'can_create_groups',public.academy_student_import_scope_covers(v_authorities,'groups',b.id,'{}'::uuid[],null)) order by b.name,b.id),'[]') into v_branches
   from public.academy_branches b where b.academy_id=p_academy_id and b.is_active
    and public.academy_student_import_branch_access(p_academy_id,v_authorities,b.id,'import');
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'branch_id',c.branch_id,'name',c.name) order by c.name,c.id),'[]') into v_groups
   from public.academy_classrooms c join public.academy_branches b on b.academy_id=c.academy_id and b.id=c.branch_id
   where c.academy_id=p_academy_id and c.is_active and b.is_active
    and(public.academy_student_import_scope_covers(v_authorities,'import',c.branch_id,array[c.id],null)
     or exists(select 1 from jsonb_array_elements(v_authorities) a where a->>'scope_type'='students'
      and public.academy_student_import_role_has(a->>'role','import')
      and public.academy_student_import_branch_access(p_academy_id,jsonb_build_array(a),c.branch_id,'import')));
  return jsonb_build_object('branches',v_branches,'groups',v_groups,'limits',jsonb_build_object('rows',5000,'batch_rows',200,'batch_bytes',2097152));
 end if;
 if p_action='list' then
  if p_payload->>'before_time' is not null then
   v_cursor_time:=(p_payload->>'before_time')::timestamptz;v_cursor_id:=(p_payload->>'before_id')::uuid;
   if v_cursor_id is null then raise exception 'A complete history cursor is required';end if;
  end if;
  select coalesce(jsonb_agg(public.academy_student_import_public_job(to_jsonb(j),
   public.academy_student_import_scope_covers(v_authorities,'view_finance',j.branch_id,'{}'::uuid[],null)) order by j.created_at desc,j.id desc),'[]') into v_jobs
   from(select j.* from public.academy_student_import_jobs j where j.academy_id=p_academy_id
    and(v_cursor_time is null or row(j.created_at,j.id)<row(v_cursor_time,v_cursor_id))
    and public.academy_student_import_branch_access(p_academy_id,v_authorities,j.branch_id,'import')
    and(j.created_by=p_actor_id or public.academy_student_import_scope_covers(v_authorities,'review',j.branch_id,'{}'::uuid[],null)
     or exists(select 1 from public.academy_student_import_row_authorization(p_academy_id,j.id,v_authorities)
      having count(*)>0 and bool_and(review_allowed))) order by j.created_at desc,j.id desc limit 31) j;
  return jsonb_build_object('jobs',case when jsonb_array_length(v_jobs)>30 then v_jobs-30 else v_jobs end,
   'has_more',jsonb_array_length(v_jobs)>30,
   'cursor',case when jsonb_array_length(v_jobs)>30 then jsonb_build_object('before_time',v_jobs->29->'created_at','before_id',v_jobs->29->'id') end);
 end if;
 if p_action='stage' then
  v_branch:=(p_payload->'settings'->>'branch_id')::uuid;
  if v_branch is null or not public.academy_student_import_branch_access(p_academy_id,v_authorities,v_branch,'import') then
   raise exception using errcode='42501',message='Forbidden import branch';end if;
  if p_payload->'settings'->>'create_missing_groups'='true'
   and not public.academy_student_import_scope_covers(v_authorities,'groups',v_branch,'{}'::uuid[],null) then
   raise exception using errcode='42501',message='Creating missing groups requires permission for the selected branch';end if;
  v_result:=public.academy_stage_student_import(p_academy_id,p_actor_id,p_payload->>'key',p_payload->'settings',p_payload->'rows',
   (p_payload->>'offset')::integer,(p_payload->>'seal')::boolean,array[v_branch]);
  return jsonb_build_object('job',public.academy_student_import_public_job(v_result->'job',true));
 end if;
 if p_action='lookup' then
  if nullif(trim(p_payload->>'key'),'') is null or length(p_payload->>'key')>180 then raise exception 'A valid upload key is required';end if;
  select * into v_job from public.academy_student_import_jobs where academy_id=p_academy_id and created_by=p_actor_id and idempotency_key=trim(p_payload->>'key') for update;
  if not found then return jsonb_build_object('found',false);end if;
 else
  select * into v_job from public.academy_student_import_jobs where academy_id=p_academy_id and id=(p_payload->>'job_id')::uuid for update;
 end if;
 if not found then
  raise exception using errcode='42501',message='Forbidden import job';end if;
 -- Every read resolves its current resource scope. The write engines take
 -- their stronger reference locks before the final
 -- per-row assertion, so newly-resolved references cannot inherit old rights.
 select coalesce(bool_and(operation_allowed),false),coalesce(bool_and(finance_allowed),false),coalesce(bool_and(finance_visible),false),
  coalesce(bool_and(review_allowed),false) into v_operation,v_finance,v_view_money,v_other_review
  from public.academy_student_import_row_authorization(p_academy_id,v_job.id,v_authorities);
 v_read:=(v_job.created_by=p_actor_id and(v_operation or public.academy_student_import_branch_access(p_academy_id,v_authorities,v_job.branch_id,'import')))
  or v_other_review or public.academy_student_import_scope_covers(v_authorities,'review',v_job.branch_id,'{}'::uuid[],null);
 if not v_read then raise exception using errcode='42501',message='Forbidden import job';end if;
 v_view_money:=v_operation and(v_job.created_by=p_actor_id or v_view_money);
 if p_action='preview' then
  perform public.academy_student_import_lock_references(p_academy_id,v_job.id);
  v_result:=public.academy_validate_student_import(p_academy_id,p_actor_id,v_job.id,array[v_job.branch_id],true,true);
  select * into v_job from public.academy_student_import_jobs where academy_id=p_academy_id and id=v_job.id;
 elsif p_action='commit' then
  perform public.academy_assert_student_import_authority(p_academy_id,p_actor_id,v_job.id,'commit');
  perform public.academy_student_import_lock_references(p_academy_id,v_job.id);
  v_result:=public.academy_commit_student_import(p_academy_id,p_actor_id,v_job.id,p_payload->>'key',p_payload->>'preview_hash',array[v_job.branch_id],true,true,true);
  -- Expiry can advance during a long batch even though grant rows are locked.
  perform public.academy_assert_student_import_authority(p_academy_id,p_actor_id,v_job.id,'commit');
  select * into v_job from public.academy_student_import_jobs where academy_id=p_academy_id and id=v_job.id;
 elsif p_action='recover' then
  perform public.academy_assert_student_import_authority(p_academy_id,p_actor_id,v_job.id,'recover');
  perform public.academy_student_import_lock_references(p_academy_id,v_job.id);
  v_result:=public.academy_recover_student_import(p_academy_id,p_actor_id,v_job.id,p_payload->>'key',p_payload->>'reason',array[v_job.branch_id],true,true);
  perform public.academy_assert_student_import_authority(p_academy_id,p_actor_id,v_job.id,'recover');
  select * into v_job from public.academy_student_import_jobs where academy_id=p_academy_id and id=v_job.id;
 elsif p_action='cancel' then
  if v_job.status not in('uploading','sealed','validated','cancelled') then raise exception 'A completed import needs logical correction instead of cancellation';end if;
  update public.academy_student_import_jobs set status='cancelled' where academy_id=p_academy_id and id=v_job.id returning * into v_job;
 end if;
 v_authorities:=public.academy_student_import_authorities(p_academy_id,p_actor_id);
 select coalesce(bool_and(operation_allowed),false),coalesce(bool_and(finance_allowed),false),
  coalesce(bool_and(finance_visible),false),coalesce(bool_and(review_allowed),false)
  into v_operation,v_finance,v_view_money,v_other_review from public.academy_student_import_row_authorization(p_academy_id,v_job.id,v_authorities);
 v_view_money:=v_operation and(v_job.created_by=p_actor_id or v_view_money);
 if v_job.created_by=p_actor_id and not v_operation
  and not public.academy_student_import_branch_access(p_academy_id,v_authorities,v_job.branch_id,'import') then
  raise exception using errcode='42501',message='Forbidden import job';end if;
 if v_job.created_by<>p_actor_id and not v_other_review
  and not public.academy_student_import_scope_covers(v_authorities,'review',v_job.branch_id,'{}'::uuid[],null) then
  raise exception using errcode='42501',message='Forbidden import job';end if;
 v_permissions:=jsonb_build_object('can_commit',v_operation and v_finance and v_job.validation->>'ready'='true' and v_job.status='validated',
  'can_recover',v_operation and v_finance and v_job.status='completed','scope_valid',v_operation,'finance_approved',v_finance);
 if p_action='rows' then
  v_offset:=coalesce((p_payload->>'offset')::integer,0);v_limit:=coalesce((p_payload->>'limit')::integer,50);
  if v_offset<0 or v_limit not between 1 and 100 then raise exception 'A valid import row page is required';end if;
  select coalesce(jsonb_agg(jsonb_build_object('row_number',r.row_number,
   'source',case when not a.operation_allowed then '{}'::jsonb when v_job.created_by=p_actor_id or a.finance_visible then r.source_data else r.source_data-coalesce(v_job.settings->'column_mapping'->>'balance','__unmapped__') end,
   'mapped',case when not a.operation_allowed then '{}'::jsonb when v_job.created_by=p_actor_id or a.finance_visible then r.mapped_data else r.mapped_data-'balance' end,
   'normalized',case when a.operation_allowed then
    case when v_job.created_by=p_actor_id or a.finance_visible then r.normalized_data-'guardian_id' else r.normalized_data-'guardian_id'-'ledger_amount' end
    else '{}'::jsonb end,
   'errors',case when not a.operation_allowed then '["scope_unavailable"]'::jsonb else coalesce(r.validation_errors,'[]') end,
   'finance_approved',a.finance_allowed) order by r.row_number),'[]') into v_rows
   from(select * from public.academy_student_import_rows where academy_id=p_academy_id and job_id=v_job.id order by row_number limit v_limit offset v_offset) r
   join public.academy_student_import_row_authorization(p_academy_id,v_job.id,v_authorities) a on a.row_id=r.id
   where v_job.created_by=p_actor_id or a.review_allowed;
  return jsonb_build_object('job',public.academy_student_import_public_job(to_jsonb(v_job),v_view_money),'permissions',v_permissions,'rows',v_rows,
   'has_more',v_offset+v_limit<v_job.staged_rows);
 end if;
 return jsonb_build_object('job',public.academy_student_import_public_job(to_jsonb(v_job),v_view_money),'permissions',v_permissions,
  'found',true,
  'preview_changed',coalesce((v_result->>'preview_changed')::boolean,false),'replayed',coalesce((v_result->>'replayed')::boolean,false));
end;$$;
revoke all on function public.academy_student_import_command(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.academy_student_import_command(uuid,uuid,text,jsonb) to service_role;
create index academy_student_import_history_idx on public.academy_student_import_jobs(academy_id,created_at desc,id desc);

-- Only the guarded command gateway (added below) may call the internal write
-- engines. Existing frontends use legacy jobs and do not call these functions.
revoke all on function public.academy_stage_student_import(uuid,uuid,text,jsonb,jsonb,integer,boolean,uuid[]) from service_role;
revoke all on function public.academy_validate_student_import(uuid,uuid,uuid,uuid[],boolean,boolean) from service_role;
revoke all on function public.academy_commit_student_import(uuid,uuid,uuid,text,text,uuid[],boolean,boolean,boolean) from service_role;
revoke all on function public.academy_recover_student_import(uuid,uuid,uuid,text,text,uuid[],boolean,boolean) from service_role;
revoke all on public.academy_student_import_jobs,public.academy_student_import_rows,public.academy_student_import_effects,
 public.academy_student_import_lifecycle_evidence,public.academy_student_import_recovery_runs,public.academy_student_import_recovery_effects
 from public,anon,authenticated,service_role;
