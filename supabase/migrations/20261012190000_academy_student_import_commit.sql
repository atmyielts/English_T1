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
 unique(academy_id,id),unique(academy_id,job_id,row_id,target_table,target_id),unique(academy_id,job_id,target_table,target_id),
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

-- Explicit immutable receipts distinguish the import's own lifecycle history
-- from later activity. Recovery never deletes these historical events.
create table public.academy_student_import_lifecycle_evidence(
 academy_id uuid not null,job_id uuid not null,event_id uuid not null,after_snapshot jsonb not null,
 primary key(academy_id,job_id,event_id),
 foreign key(academy_id,job_id) references public.academy_student_import_jobs(academy_id,id) on delete restrict,
 foreign key(academy_id,event_id) references public.academy_student_lifecycle_events(academy_id,id) on delete restrict
);
alter table public.academy_student_import_lifecycle_evidence enable row level security;
revoke all on public.academy_student_import_lifecycle_evidence from public,anon,authenticated,service_role;
grant select,insert on public.academy_student_import_lifecycle_evidence to service_role;
create trigger academy_student_import_lifecycle_evidence_immutable before update or delete on public.academy_student_import_lifecycle_evidence
 for each row execute function public.academy_reject_student_import_evidence_mutation();

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
  union all
  select (item->>'academy_id')::uuid,public.academy_import_identity_bucket('group',lower(trim(item->>'name')))
   from jsonb_array_elements(jsonb_build_array(v_new,v_old)) item where tg_table_name='academy_classrooms' and nullif(trim(item->>'name'),'') is not null
 ) keys where academy is not null and bucket is not null order by academy,bucket loop
  perform pg_advisory_xact_lock(hashtext(v_lock.academy::text),v_lock.bucket);
 end loop;
 return new;
end;$$;
create trigger academy_contacts_import_identity_lock before insert or update of academy_id,phone,email on public.academy_contacts
 for each row execute function public.academy_lock_student_import_identity();
create trigger academy_guardians_import_identity_lock before insert or update of academy_id,phone on public.academy_guardians
 for each row execute function public.academy_lock_student_import_identity();
create trigger academy_classrooms_import_identity_lock before insert or update of academy_id,name on public.academy_classrooms
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
 set statement_timeout='45s' set lock_timeout='5s' set enable_nestloop=off set jit=off as $$
declare
 v_job public.academy_student_import_jobs%rowtype;v_scope jsonb;v_validated jsonb;
 v_snapshot jsonb;v_bucket integer;v_rows integer:=0;v_skipped integer:=0;
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
  union all select 'group',lower(normalized_data->>'group_name') from public.academy_student_import_rows where academy_id=p_academy_id and job_id=p_job_id
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
 -- Apply each entity set in bulk inside the same transaction. Frozen source
 -- and normalization stay immutable; resolved IDs bind the applied row to its
 -- exact effects after the reviewed preview has been revalidated.
 select count(*) filter(where normalized_data->>'disposition'<>'skip'),count(*) filter(where normalized_data->>'disposition'='skip') into v_rows,v_skipped
  from public.academy_student_import_rows where academy_id=p_academy_id and job_id=p_job_id;
 with inserted as (
  insert into public.academy_contacts(academy_id,primary_branch_id,first_name,last_name,phone,email,status,lifecycle_stage,created_by,metadata)
  select p_academy_id,v_job.branch_id,n->>'first_name',n->>'last_name',n->>'phone',n->>'email','active','learning',p_actor_id,
   jsonb_build_object('student_import_job_id',p_job_id,'student_import_row_id',id,'source_joined_on',n->>'joined_on','source_full_name',n->>'source_full_name')
  from (select id,normalized_data n from public.academy_student_import_rows where academy_id=p_academy_id and job_id=p_job_id and normalized_data->>'disposition'='create' order by row_number) rows
  returning id,metadata,to_jsonb(academy_contacts.*) snapshot
 ), evidence as (
  insert into public.academy_student_import_effects(academy_id,job_id,row_id,target_table,target_id,effect_kind,after_snapshot)
  select p_academy_id,p_job_id,(metadata->>'student_import_row_id')::uuid,'academy_contacts',id,'insert',snapshot from inserted
 ), bound as (
  update public.academy_student_import_rows r set normalized_data=jsonb_set(r.normalized_data,'{contact_id}',to_jsonb(i.id))
   from inserted i where r.academy_id=p_academy_id and r.job_id=p_job_id and r.id=(i.metadata->>'student_import_row_id')::uuid
 ) select count(*) into v_contacts from inserted;
 with missing as (
  select distinct on(lower(normalized_data->>'group_name')) id,normalized_data n
  from public.academy_student_import_rows where academy_id=p_academy_id and job_id=p_job_id and normalized_data->>'disposition'<>'skip' and normalized_data->>'create_group'='true'
  order by lower(normalized_data->>'group_name'),row_number
 ), inserted as (
  insert into public.academy_classrooms(academy_id,branch_id,name,created_by,metadata)
  select p_academy_id,v_job.branch_id,n->>'group_name',p_actor_id,jsonb_build_object('student_import_job_id',p_job_id,'student_import_row_id',id,'source_joined_on',n->>'joined_on') from missing
  returning id,metadata,to_jsonb(academy_classrooms.*) snapshot
 ), evidence as (
  insert into public.academy_student_import_effects(academy_id,job_id,row_id,target_table,target_id,effect_kind,after_snapshot)
  select p_academy_id,p_job_id,(metadata->>'student_import_row_id')::uuid,'academy_classrooms',id,'insert',snapshot from inserted
 ) select count(*) into v_groups from inserted;
 update public.academy_student_import_rows r set normalized_data=jsonb_set(r.normalized_data,'{classroom_id}',to_jsonb(c.id))
  from public.academy_classrooms c where r.academy_id=p_academy_id and r.job_id=p_job_id and r.normalized_data->>'disposition'<>'skip'
   and r.normalized_data->>'create_group'='true' and c.academy_id=p_academy_id and c.branch_id=v_job.branch_id
   and c.metadata->>'student_import_job_id'=p_job_id::text and lower(trim(c.name))=lower(r.normalized_data->>'group_name');
 with inserted as (
  insert into public.academy_classroom_memberships(academy_id,classroom_id,contact_id,role,status,joined_at,started_at,metadata)
  select p_academy_id,(n->>'classroom_id')::uuid,(n->>'contact_id')::uuid,'student','active',
   (n->>'joined_on')::date::timestamp at time zone (v_job.settings->>'branch_timezone'),(n->>'joined_on')::date::timestamp at time zone (v_job.settings->>'branch_timezone'),
   jsonb_build_object('student_import_job_id',p_job_id,'student_import_row_id',id,'source_joined_on',n->>'joined_on')
  from (select id,normalized_data n from public.academy_student_import_rows where academy_id=p_academy_id and job_id=p_job_id and normalized_data->>'disposition'<>'skip' and normalized_data->>'classroom_id' is not null order by (normalized_data->>'classroom_id')::uuid,row_number) rows
  where not exists(select 1 from public.academy_classroom_memberships m where m.academy_id=p_academy_id and m.classroom_id=(n->>'classroom_id')::uuid and m.contact_id=(n->>'contact_id')::uuid)
  returning id,metadata,to_jsonb(academy_classroom_memberships.*) snapshot
 ), evidence as (
  insert into public.academy_student_import_effects(academy_id,job_id,row_id,target_table,target_id,effect_kind,after_snapshot)
  select p_academy_id,p_job_id,(metadata->>'student_import_row_id')::uuid,'academy_classroom_memberships',id,'insert',snapshot from inserted
 ) select count(*) into v_memberships from inserted;
 with missing as (
  select distinct on(normalized_data->>'parent_phone') id,normalized_data n from public.academy_student_import_rows
  where academy_id=p_academy_id and job_id=p_job_id and normalized_data->>'disposition'<>'skip' and normalized_data->>'parent_phone' is not null and normalized_data->>'guardian_id' is null
  order by normalized_data->>'parent_phone',row_number
 ), inserted as (
  insert into public.academy_guardians(academy_id,full_name,phone,status,created_by,metadata)
  select p_academy_id,coalesce(n->>'parent_name',n->>'parent_phone'),n->>'parent_phone','invited',p_actor_id,
   jsonb_build_object('student_import_job_id',p_job_id,'student_import_row_id',id,'source_joined_on',n->>'joined_on') from missing
  returning id,metadata,to_jsonb(academy_guardians.*) snapshot
 ), evidence as (
  insert into public.academy_student_import_effects(academy_id,job_id,row_id,target_table,target_id,effect_kind,after_snapshot)
  select p_academy_id,p_job_id,(metadata->>'student_import_row_id')::uuid,'academy_guardians',id,'insert',snapshot from inserted
 ) select count(*) into v_guardians from inserted;
 update public.academy_student_import_rows r set normalized_data=jsonb_set(r.normalized_data,'{guardian_id}',to_jsonb(g.id))
  from public.academy_guardians g where r.academy_id=p_academy_id and r.job_id=p_job_id and r.normalized_data->>'disposition'<>'skip'
   and r.normalized_data->>'parent_phone' is not null and r.normalized_data->>'guardian_id' is null and g.academy_id=p_academy_id
   and g.phone_normalized=r.normalized_data->>'parent_phone' and g.metadata->>'student_import_job_id'=p_job_id::text;
 with inserted as (
  insert into public.academy_student_guardian_relationships(academy_id,contact_id,guardian_id,relationship_type,status,consent_status,is_financially_responsible,is_primary_contact,can_view_payments,can_view_debt,created_by,metadata)
  select p_academy_id,(n->>'contact_id')::uuid,(n->>'guardian_id')::uuid,'guardian','pending','pending',false,false,false,false,p_actor_id,
   jsonb_build_object('student_import_job_id',p_job_id,'student_import_row_id',id,'source_joined_on',n->>'joined_on')
  from (select id,normalized_data n from public.academy_student_import_rows where academy_id=p_academy_id and job_id=p_job_id and normalized_data->>'disposition'<>'skip' and normalized_data->>'parent_phone' is not null order by row_number) rows
  where not exists(select 1 from public.academy_student_guardian_relationships r where r.academy_id=p_academy_id and r.contact_id=(n->>'contact_id')::uuid and r.guardian_id=(n->>'guardian_id')::uuid)
  returning id,metadata,to_jsonb(academy_student_guardian_relationships.*) snapshot
 ), evidence as (
  insert into public.academy_student_import_effects(academy_id,job_id,row_id,target_table,target_id,effect_kind,after_snapshot)
  select p_academy_id,p_job_id,(metadata->>'student_import_row_id')::uuid,'academy_student_guardian_relationships',id,'insert',snapshot from inserted
 ) select count(*) into v_relationships from inserted;
 with inserted as (
  insert into public.academy_account_ledger_entries(academy_id,contact_id,entry_type,amount,currency,effective_at,reason,idempotency_key,created_by,metadata)
  select p_academy_id,(n->>'contact_id')::uuid,case when (n->>'ledger_amount')::bigint>0 then 'debit_adjustment' else 'credit_adjustment' end,
   (n->>'ledger_amount')::bigint,v_job.settings->>'currency',(n->>'joined_on')::date::timestamp at time zone (v_job.settings->>'branch_timezone'),'Imported opening balance',
   'student-import:'||p_job_id||':'||row_number,p_actor_id,jsonb_build_object('student_import_job_id',p_job_id,'student_import_row_id',id,'source_joined_on',n->>'joined_on')
  from (select id,row_number,normalized_data n from public.academy_student_import_rows where academy_id=p_academy_id and job_id=p_job_id and normalized_data->>'disposition'<>'skip' and (normalized_data->>'ledger_amount')::bigint<>0 order by row_number) rows
  returning id,metadata,to_jsonb(academy_account_ledger_entries.*) snapshot
 ), evidence as (
  insert into public.academy_student_import_effects(academy_id,job_id,row_id,target_table,target_id,effect_kind,after_snapshot)
  select p_academy_id,p_job_id,(metadata->>'student_import_row_id')::uuid,'academy_account_ledger_entries',id,'opening_balance',snapshot from inserted
 ) select count(*) into v_balances from inserted;
 insert into public.academy_student_import_lifecycle_evidence(academy_id,job_id,event_id,after_snapshot)
 select p_academy_id,p_job_id,e.id,to_jsonb(e) from public.academy_student_lifecycle_events e
 where e.academy_id=p_academy_id and e.evidence->>'student_import_job_id'=p_job_id::text and e.evidence->>'automation_suppressed'='true'
  and exists(select 1 from public.academy_student_import_effects f where f.academy_id=p_academy_id and f.job_id=p_job_id and f.target_table=e.source_table and f.target_id=e.source_id)
 on conflict do nothing;
 v_snapshot:=jsonb_build_object('job_id',p_job_id,'actor_id',p_actor_id,'preview_hash',p_preview_hash,'applied_rows',v_rows,'skipped_rows',v_skipped,'contacts',v_contacts,'groups',v_groups,'memberships',v_memberships,'guardians',v_guardians,'relationships',v_relationships,'opening_balance_entries',v_balances,'currency',v_job.settings->>'currency','opening_credit',v_job.validation->>'opening_credit','opening_debt',v_job.validation->>'opening_debt','payment_collected',false,'messages_sent',0);
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata)values(p_academy_id,p_actor_id,'student_import.committed','academy_student_import_job',p_job_id::text,v_snapshot);
 update public.academy_student_import_jobs set status='completed',receipt=v_snapshot where academy_id=p_academy_id and id=p_job_id returning * into v_job;
 return jsonb_build_object('job',to_jsonb(v_job),'receipt',v_snapshot,'replayed',false);
end;$$;
revoke all on function public.academy_commit_student_import(uuid,uuid,uuid,text,text,uuid[],boolean,boolean,boolean) from public,anon,authenticated;
grant execute on function public.academy_commit_student_import(uuid,uuid,uuid,text,text,uuid[],boolean,boolean,boolean) to service_role;
