-- Atomic application of a previously reviewed complete student import.
-- Service endpoints supply current server-owned scope/permissions. Browser roles
-- cannot call this function, choose capabilities, or write evidence tables.
alter table public.academy_student_import_jobs add column commit_scope jsonb;
alter table public.academy_student_import_jobs drop constraint academy_student_import_jobs_status_check;
alter table public.academy_student_import_jobs add constraint academy_student_import_jobs_status_check
 check(status in('uploading','sealed','validated','committing','completed','failed','cancelled','reversing','reversed'));

alter table public.academy_student_import_rows add constraint academy_student_import_rows_scope_id_unique unique(academy_id,job_id,id);
create table public.academy_student_import_effects(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null,job_id uuid not null,row_id uuid not null,
 target_table text not null check(target_table in('academy_contacts','academy_classrooms','academy_classroom_memberships','academy_guardians','academy_student_guardian_relationships','academy_account_ledger_entries')),
 target_id uuid not null,effect_kind text not null check(effect_kind in('insert','opening_balance')),
 after_snapshot jsonb not null,created_at timestamptz not null default now(),
 unique(academy_id,id),unique(academy_id,job_id,row_id,target_table,target_id),
 foreign key(academy_id,job_id) references public.academy_student_import_jobs(academy_id,id) on delete restrict,
 foreign key(academy_id,job_id,row_id) references public.academy_student_import_rows(academy_id,job_id,id) on delete restrict
);
alter table public.academy_student_import_effects enable row level security;
revoke all on public.academy_student_import_effects from anon,authenticated,service_role;
grant select,insert on public.academy_student_import_effects to service_role;
create or replace function public.academy_reject_student_import_evidence_mutation()
returns trigger language plpgsql set search_path=public as $$begin raise exception 'Student import effect evidence is append-only';end;$$;
create trigger academy_student_import_effects_immutable before update or delete on public.academy_student_import_effects
 for each row execute function public.academy_reject_student_import_evidence_mutation();
revoke all on function public.academy_reject_student_import_evidence_mutation() from public,anon,authenticated,service_role;

-- At most 256 locks per Academy, even for 5,000 students with separate parents.
-- Hash collisions only serialize unrelated identities; they grant no access.
create or replace function public.academy_import_identity_bucket(p_kind text,p_value text)
returns integer language sql immutable set search_path=public as $$select ((hashtext(p_kind||':'||p_value)::bigint&2147483647)%256)::integer$$;
revoke all on function public.academy_import_identity_bucket(text,text) from public,anon,authenticated,service_role;
create or replace function public.academy_lock_student_import_identity()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_new jsonb:=to_jsonb(new);v_old jsonb:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;v_lock record;
begin
 -- Current writers participate too: an import cannot miss a concurrently
 -- inserted/reformatted phone identity merely because no row existed to lock.
 for v_lock in select distinct academy,bucket from (
  select (item->>'academy_id')::uuid academy,public.academy_import_identity_bucket(case when tg_table_name='academy_guardians' then 'guardian' else 'phone' end,public.academy_normalize_phone(item->>'phone')) bucket
   from jsonb_array_elements(jsonb_build_array(v_new,v_old)) item where nullif(item->>'phone','') is not null
  union all
  select (item->>'academy_id')::uuid,public.academy_import_identity_bucket('email',lower(trim(item->>'email')))
   from jsonb_array_elements(jsonb_build_array(v_new,v_old)) item where tg_table_name='academy_contacts' and nullif(trim(item->>'email'),'') is not null
 ) keys where academy is not null and bucket is not null order by academy,bucket loop
  perform pg_advisory_xact_lock(hashtext(v_lock.academy::text),v_lock.bucket);
 end loop;
 return new;
end;$$;
create trigger academy_contacts_import_identity_lock before insert or update of academy_id,phone,email on public.academy_contacts
 for each row execute function public.academy_lock_student_import_identity();
create trigger academy_guardians_import_identity_lock before insert or update of academy_id,phone on public.academy_guardians
 for each row execute function public.academy_lock_student_import_identity();
revoke all on function public.academy_lock_student_import_identity() from public,anon,authenticated,service_role;

-- Every enrollment writer checks the same locked classroom; otherwise a
-- concurrent ordinary enrollment could consume the preview's remaining seat.
create or replace function public.academy_guard_active_classroom_membership()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_capacity integer;v_count bigint;
begin
 if not exists(select 1 from public.academy_contacts where academy_id=new.academy_id and id=new.contact_id) then raise exception 'Student does not belong to this Academy';end if;
 select student_capacity into v_capacity from public.academy_classrooms where academy_id=new.academy_id and id=new.classroom_id for update;
 if not found then raise exception 'Classroom does not belong to this Academy';end if;
 if tg_op='UPDATE' and row(old.academy_id,old.classroom_id,old.contact_id,old.role,old.status)
  is not distinct from row(new.academy_id,new.classroom_id,new.contact_id,new.role,new.status) then return new;end if;
 if new.role='student' and new.status='active' and v_capacity is not null then
  select count(*) into v_count from public.academy_classroom_memberships where academy_id=new.academy_id and classroom_id=new.classroom_id and role='student' and status='active' and id<>new.id;
  if v_count+1>v_capacity then raise exception 'Classroom capacity exceeded';end if;
 end if;
 return new;
end;$$;
create trigger academy_active_membership_capacity_guard before insert or update of academy_id,classroom_id,contact_id,role,status on public.academy_classroom_memberships
 for each row execute function public.academy_guard_active_classroom_membership();
revoke all on function public.academy_guard_active_classroom_membership() from public,anon,authenticated,service_role;

create or replace function public.academy_commit_student_import(
 p_academy_id uuid,p_actor_id uuid,p_job_id uuid,p_key text,p_preview_hash text,p_branch_ids uuid[] default null,
 p_can_review_all boolean default false,p_can_create_groups boolean default false,p_can_post_balances boolean default false
) returns jsonb language plpgsql security definer set search_path=public
 set statement_timeout='45s' set lock_timeout='5s' as $$
declare
 v_job public.academy_student_import_jobs%rowtype;v_row public.academy_student_import_rows%rowtype;
 v_scope jsonb;v_validated jsonb;v_normal jsonb;v_meta jsonb;v_target uuid;v_contact uuid;v_class uuid;v_guardian uuid;v_relationship uuid;
 v_snapshot jsonb;v_amount bigint;v_when timestamptz;v_bucket integer;v_rows integer:=0;v_skipped integer:=0;
 v_contacts integer:=0;v_memberships integer:=0;v_groups integer:=0;v_guardians integer:=0;v_relationships integer:=0;v_balances integer:=0;
begin
 if nullif(trim(p_key),'') is null or length(p_key)>180 or p_preview_hash is null or p_preview_hash !~ '^[a-f0-9]{64}$' then raise exception 'A commit key and reviewed preview are required';end if;
 if not exists(select 1 from public.users where id=p_actor_id and is_active) then raise exception 'An active account is required';end if;
 select * into v_job from public.academy_student_import_jobs where academy_id=p_academy_id and id=p_job_id for update;
 if not found or(v_job.created_by<>p_actor_id and p_can_review_all is distinct from true)
  or(p_branch_ids is not null and(v_job.branch_id=any(p_branch_ids)) is distinct from true) then raise exception 'Forbidden import job';end if;
 v_scope:=jsonb_build_object('actor',p_actor_id,'key',trim(p_key),'preview_hash',p_preview_hash,
  'branches',case when p_branch_ids is null then null else to_jsonb(array(select distinct unnest(p_branch_ids) order by 1)) end);
 if coalesce((v_job.validation->>'balance_rows')::integer,0)>0 and p_can_post_balances is distinct from true then raise exception 'Opening balances require finance approval';end if;
 if v_job.status='completed' then
  if v_job.commit_scope is distinct from v_scope then raise exception 'Commit identity already used with another actor, preview or scope';end if;
  return jsonb_build_object('job',to_jsonb(v_job),'receipt',v_job.receipt,'replayed',true);
 end if;
 if v_job.status<>'validated' or v_job.validation->>'preview_hash' is distinct from p_preview_hash then raise exception 'Validate and review the complete import before committing';end if;
 -- Serializes imports in one Academy, without holding a global table lock.
 perform pg_advisory_xact_lock(hashtext(p_academy_id::text),-1);
 for v_bucket in select distinct public.academy_import_identity_bucket(kind,value) from (
  select 'phone' kind,normalized_data->>'phone' value from public.academy_student_import_rows where academy_id=p_academy_id and job_id=p_job_id
  union all select 'email',normalized_data->>'email' from public.academy_student_import_rows where academy_id=p_academy_id and job_id=p_job_id
  union all select 'guardian',normalized_data->>'parent_phone' from public.academy_student_import_rows where academy_id=p_academy_id and job_id=p_job_id
 ) identities where value is not null order by 1 loop perform pg_advisory_xact_lock(hashtext(p_academy_id::text),v_bucket);end loop;
 perform 1 from public.academy_branches where academy_id=p_academy_id and id=v_job.branch_id for update;
 -- Lock current references in deterministic order, then re-derive validation.
 -- Ordinary enrollment writers lock the same classrooms through the guard above.
 perform 1 from public.academy_classrooms c where c.academy_id=p_academy_id and exists(select 1 from public.academy_student_import_rows r where r.academy_id=p_academy_id and r.job_id=p_job_id and lower(trim(c.name))=lower(r.normalized_data->>'group_name')) order by c.id for update;
 perform 1 from public.academy_contacts c where c.academy_id=p_academy_id and exists(select 1 from public.academy_student_import_rows r where r.academy_id=p_academy_id and r.job_id=p_job_id and (c.phone_normalized=r.normalized_data->>'phone' or lower(c.email)=r.normalized_data->>'email')) order by c.id for update;
 perform 1 from public.academy_guardians g where g.academy_id=p_academy_id and exists(select 1 from public.academy_student_import_rows r where r.academy_id=p_academy_id and r.job_id=p_job_id and g.phone_normalized=r.normalized_data->>'parent_phone') order by g.id for update;
 v_validated:=public.academy_validate_student_import(p_academy_id,p_actor_id,p_job_id,p_branch_ids,p_can_review_all,p_can_create_groups);
 if v_validated->'job'->'validation'->>'preview_hash' is distinct from p_preview_hash then
  return jsonb_build_object('job',v_validated->'job','preview_changed',true);
 end if;
 if v_validated->'job'->'validation'->>'ready' is distinct from 'true' then raise exception 'The import has validation errors';end if;
 update public.academy_student_import_jobs set status='committing',commit_scope=v_scope where academy_id=p_academy_id and id=p_job_id;
 for v_row in select * from public.academy_student_import_rows where academy_id=p_academy_id and job_id=p_job_id order by row_number loop
  v_normal:=v_row.normalized_data;
  if v_normal->>'disposition'='skip' then v_skipped:=v_skipped+1;continue;end if;
  v_meta:=jsonb_build_object('student_import_job_id',p_job_id,'student_import_row_id',v_row.id,'source_joined_on',v_normal->>'joined_on');
  v_when:=(v_normal->>'joined_on')::date::timestamp at time zone (v_job.settings->>'branch_timezone');
  v_contact:=(v_normal->>'contact_id')::uuid;v_class:=(v_normal->>'classroom_id')::uuid;v_guardian:=(v_normal->>'guardian_id')::uuid;
  if v_contact is null then
   insert into public.academy_contacts(academy_id,primary_branch_id,first_name,last_name,phone,email,status,lifecycle_stage,created_by,metadata)
   values(p_academy_id,v_job.branch_id,v_normal->>'first_name',v_normal->>'last_name',v_normal->>'phone',v_normal->>'email','active','learning',p_actor_id,v_meta||jsonb_build_object('source_full_name',v_normal->>'source_full_name')) returning id,to_jsonb(academy_contacts.*) into v_contact,v_snapshot;
   insert into public.academy_student_import_effects(academy_id,job_id,row_id,target_table,target_id,effect_kind,after_snapshot)values(p_academy_id,p_job_id,v_row.id,'academy_contacts',v_contact,'insert',v_snapshot);v_contacts:=v_contacts+1;
  end if;
  if v_normal->>'create_group'='true' then
   select id into v_class from public.academy_classrooms where academy_id=p_academy_id and branch_id=v_job.branch_id and lower(trim(name))=lower(v_normal->>'group_name');
   if not found then
    insert into public.academy_classrooms(academy_id,branch_id,name,created_by,metadata)values(p_academy_id,v_job.branch_id,v_normal->>'group_name',p_actor_id,v_meta) returning id,to_jsonb(academy_classrooms.*) into v_class,v_snapshot;
    insert into public.academy_student_import_effects(academy_id,job_id,row_id,target_table,target_id,effect_kind,after_snapshot)values(p_academy_id,p_job_id,v_row.id,'academy_classrooms',v_class,'insert',v_snapshot);v_groups:=v_groups+1;
   elsif not exists(select 1 from public.academy_classrooms where academy_id=p_academy_id and id=v_class and metadata->>'student_import_job_id'=p_job_id::text) then raise exception 'A missing group changed during commit';end if;
  end if;
  if v_class is not null and not exists(select 1 from public.academy_classroom_memberships where academy_id=p_academy_id and classroom_id=v_class and contact_id=v_contact) then
   insert into public.academy_classroom_memberships(academy_id,classroom_id,contact_id,role,status,joined_at,started_at,metadata)values(p_academy_id,v_class,v_contact,'student','active',v_when,v_when,v_meta) returning id,to_jsonb(academy_classroom_memberships.*) into v_target,v_snapshot;
   insert into public.academy_student_import_effects(academy_id,job_id,row_id,target_table,target_id,effect_kind,after_snapshot)values(p_academy_id,p_job_id,v_row.id,'academy_classroom_memberships',v_target,'insert',v_snapshot);v_memberships:=v_memberships+1;
  end if;
  if v_normal->>'parent_phone' is not null then
   if v_guardian is null then
    select id into v_guardian from public.academy_guardians where academy_id=p_academy_id and phone_normalized=v_normal->>'parent_phone' and status<>'revoked';
    if not found then
     insert into public.academy_guardians(academy_id,full_name,phone,status,created_by,metadata)values(p_academy_id,coalesce(v_normal->>'parent_name',v_normal->>'parent_phone'),v_normal->>'parent_phone','invited',p_actor_id,v_meta) returning id,to_jsonb(academy_guardians.*) into v_guardian,v_snapshot;
     insert into public.academy_student_import_effects(academy_id,job_id,row_id,target_table,target_id,effect_kind,after_snapshot)values(p_academy_id,p_job_id,v_row.id,'academy_guardians',v_guardian,'insert',v_snapshot);v_guardians:=v_guardians+1;
    end if;
   end if;
   if not exists(select 1 from public.academy_student_guardian_relationships where academy_id=p_academy_id and contact_id=v_contact and guardian_id=v_guardian) then
    insert into public.academy_student_guardian_relationships(academy_id,contact_id,guardian_id,relationship_type,status,consent_status,is_financially_responsible,is_primary_contact,can_view_payments,can_view_debt,created_by,metadata)
    values(p_academy_id,v_contact,v_guardian,'guardian','pending','pending',false,false,false,false,p_actor_id,v_meta) returning id,to_jsonb(academy_student_guardian_relationships.*) into v_relationship,v_snapshot;
    insert into public.academy_student_import_effects(academy_id,job_id,row_id,target_table,target_id,effect_kind,after_snapshot)values(p_academy_id,p_job_id,v_row.id,'academy_student_guardian_relationships',v_relationship,'insert',v_snapshot);v_relationships:=v_relationships+1;
   end if;
  end if;
  v_amount:=(v_normal->>'ledger_amount')::bigint;
  if v_amount<>0 then
   insert into public.academy_account_ledger_entries(academy_id,contact_id,entry_type,amount,currency,effective_at,reason,idempotency_key,created_by,metadata)
   values(p_academy_id,v_contact,case when v_amount>0 then 'debit_adjustment' else 'credit_adjustment' end,v_amount,v_job.settings->>'currency',v_when,'Imported opening balance','student-import:'||p_job_id||':'||v_row.row_number,p_actor_id,v_meta) returning id,to_jsonb(academy_account_ledger_entries.*) into v_target,v_snapshot;
   insert into public.academy_student_import_effects(academy_id,job_id,row_id,target_table,target_id,effect_kind,after_snapshot)values(p_academy_id,p_job_id,v_row.id,'academy_account_ledger_entries',v_target,'opening_balance',v_snapshot);v_balances:=v_balances+1;
  end if;
  v_rows:=v_rows+1;
 end loop;
 v_snapshot:=jsonb_build_object('job_id',p_job_id,'actor_id',p_actor_id,'preview_hash',p_preview_hash,'applied_rows',v_rows,'skipped_rows',v_skipped,'contacts',v_contacts,'groups',v_groups,'memberships',v_memberships,'guardians',v_guardians,'relationships',v_relationships,'opening_balance_entries',v_balances,'currency',v_job.settings->>'currency','opening_credit',v_job.validation->>'opening_credit','opening_debt',v_job.validation->>'opening_debt','payment_collected',false,'messages_sent',0);
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata)values(p_academy_id,p_actor_id,'student_import.committed','academy_student_import_job',p_job_id::text,v_snapshot);
 update public.academy_student_import_jobs set status='completed',receipt=v_snapshot where academy_id=p_academy_id and id=p_job_id returning * into v_job;
 return jsonb_build_object('job',to_jsonb(v_job),'receipt',v_snapshot,'replayed',false);
end;$$;
revoke all on function public.academy_commit_student_import(uuid,uuid,uuid,text,text,uuid[],boolean,boolean,boolean) from public,anon,authenticated;
grant execute on function public.academy_commit_student_import(uuid,uuid,uuid,text,text,uuid[],boolean,boolean,boolean) to service_role;
