-- Logical recovery preserves all original records, financial history, and
-- evidence. Changed or used records remain intact for an operator's review.
alter table public.academy_student_import_jobs add column recovery_scope jsonb,add column recovery_receipt jsonb;
alter table public.academy_student_import_jobs drop constraint academy_student_import_jobs_status_check;
alter table public.academy_student_import_jobs add constraint academy_student_import_jobs_status_check
 check(status in('uploading','sealed','validated','committing','completed','failed','cancelled','reversing','reversed','recovery_review'));
create table public.academy_student_import_recovery_runs(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null,job_id uuid not null,
 request_scope jsonb not null,receipt jsonb,created_at timestamptz not null default now(),completed_at timestamptz,
 unique(academy_id,id),unique(academy_id,job_id),
 foreign key(academy_id,job_id) references public.academy_student_import_jobs(academy_id,id) on delete restrict
);
create table public.academy_student_import_recovery_effects(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null,job_id uuid not null,run_id uuid not null,
 original_effect_id uuid not null,target_table text not null,target_id uuid not null,
 outcome text not null check(outcome in('corrected','manual_review','missing')),
 reason_code text,after_snapshot jsonb,created_at timestamptz not null default now(),
 unique(academy_id,run_id,original_effect_id),unique(academy_id,job_id,target_table,target_id),
 foreign key(academy_id,run_id) references public.academy_student_import_recovery_runs(academy_id,id) on delete restrict,
 foreign key(academy_id,original_effect_id) references public.academy_student_import_effects(academy_id,id) on delete restrict
);
alter table public.academy_student_import_recovery_runs enable row level security;
alter table public.academy_student_import_recovery_effects enable row level security;
revoke all on public.academy_student_import_recovery_runs,public.academy_student_import_recovery_effects from public,anon,authenticated,service_role;
grant select,insert on public.academy_student_import_recovery_runs,public.academy_student_import_recovery_effects to service_role;
create trigger academy_student_import_recovery_effects_immutable before update or delete on public.academy_student_import_recovery_effects
 for each row execute function public.academy_reject_student_import_evidence_mutation();
create index academy_student_import_lifecycle_source_idx on public.academy_student_lifecycle_events(academy_id,source_table,source_id);
create or replace function public.academy_guard_student_import_recovery_receipt()
returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='DELETE' or old.receipt is not null or row(new.id,new.academy_id,new.job_id,new.request_scope,new.created_at)
  is distinct from row(old.id,old.academy_id,old.job_id,old.request_scope,old.created_at)
  or new.receipt is null or new.completed_at is null then raise exception 'Recovery receipts are immutable';end if;
 return new;
end;$$;
create trigger academy_student_import_recovery_runs_immutable before update or delete on public.academy_student_import_recovery_runs
 for each row execute function public.academy_guard_student_import_recovery_receipt();
revoke all on function public.academy_guard_student_import_recovery_receipt() from public,anon,authenticated,service_role;

-- Build once, using actual foreign keys rather than an incomplete list of
-- today's known payments/grades tables. New referencing tables fail safely too.
create or replace function public.academy_student_import_reference_plan()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_plan jsonb:='{}';v_table text;v_refs jsonb;v_extra jsonb;
begin
 foreach v_table in array array['academy_contacts','academy_classrooms','academy_classroom_memberships','academy_guardians','academy_student_guardian_relationships'] loop
  select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'pairs',(
   select jsonb_agg(jsonb_build_object('child',ca.attname,'parent',pa.attname,'type',format_type(ca.atttypid,ca.atttypmod)) order by keys.i)
    from generate_subscripts(k.conkey,1) keys(i) join pg_attribute ca on ca.attrelid=k.conrelid and ca.attnum=k.conkey[keys.i]
    join pg_attribute pa on pa.attrelid=k.confrelid and pa.attnum=k.confkey[keys.i]))),'[]') into v_refs
   from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
   where k.contype='f' and k.confrelid=to_regclass('public.'||v_table) and c.relkind in('r','p');
  if v_table='academy_classroom_memberships' then
   -- Attendance/submissions usually reference contact+classroom, not the
   -- membership ID. Treat such contextual associations as activity as well.
   select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'pairs',
    jsonb_build_array(jsonb_build_object('child','contact_id','parent','contact_id','type',(select format_type(a.atttypid,a.atttypmod) from pg_attribute a where a.attrelid=c.oid and a.attname='contact_id' and not a.attisdropped)),
    jsonb_build_object('child','classroom_id','parent','classroom_id','type',(select format_type(a.atttypid,a.atttypmod) from pg_attribute a where a.attrelid=c.oid and a.attname='classroom_id' and not a.attisdropped))))),'[]') into v_extra
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in('r','p')
     and n.nspname not in('pg_catalog','information_schema') and c.oid<>to_regclass('public.academy_classroom_memberships')
     and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='contact_id' and not a.attisdropped)
     and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='classroom_id' and not a.attisdropped);
   v_refs:=v_refs||v_extra;
  end if;
  v_plan:=v_plan||jsonb_build_object(v_table,v_refs);
 end loop;
 return v_plan;
end;$$;
revoke all on function public.academy_student_import_reference_plan() from public,anon,authenticated,service_role;

-- Resolve references once per table/phase rather than planning one query for
-- every individual imported record and foreign key. Read fresh journals at each
-- phase so a child retained for review also protects its parent group.
create or replace function public.academy_student_import_external_targets(p_academy uuid,p_job uuid,p_table text,p_plan jsonb)
returns uuid[] language plpgsql security definer set search_path=public set enable_nestloop=off set jit=off as $$
declare v_ref jsonb;v_pair jsonb;v_where text;v_sql text;v_found uuid[];v_result uuid[]:='{}';v_parents text;
begin
 if p_table not in('academy_contacts','academy_classrooms','academy_classroom_memberships','academy_guardians','academy_student_guardian_relationships') then raise exception 'Unsupported recovery reference target';end if;
 v_parents:='select target_id from public.academy_student_import_effects where academy_id=$1 and job_id=$2 and target_table=$3';
 if p_table='academy_contacts' then
  -- Existing students reused by an import are still protected by their own
  -- payments/activity when deciding whether its new membership can be withdrawn.
  v_parents:=v_parents||' union select (after_snapshot->>''contact_id'')::uuid from public.academy_student_import_effects where academy_id=$1 and job_id=$2 and target_table=''academy_classroom_memberships''';
 end if;
 for v_ref in select value from jsonb_array_elements(p_plan->p_table) loop
  v_where:='';
  for v_pair in select value from jsonb_array_elements(v_ref->'pairs') loop
   if v_where<>'' then v_where:=v_where||' and ';end if;
   v_where:=v_where||format('child.%I=parent.%I::text::%s',v_pair->>'child',v_pair->>'parent',v_pair->>'type');
  end loop;
  v_sql:=format('select parent.id parent_id,to_jsonb(child) child_value from public.%I parent join (%s) targets on targets.target_id=parent.id join %I.%I child on %s where parent.academy_id=$1',p_table,v_parents,v_ref->>'schema',v_ref->>'table',v_where);
  if v_ref->>'schema'<>'public' then
   -- Another schema's identically named record never inherits public evidence.
   v_sql:='select array_agg(distinct parent_id) from ('||v_sql||') referenced';
  else
   -- Compare keyed evidence sets directly. Hash/merge joins prevent freshly
   -- inserted, un-analyzed journals from causing a nested full-table scan for
   -- every child. Each evidence table has a unique job/table/target key.
   v_sql:='with referenced as materialized ('||v_sql||'), identified as materialized (
    select *,case when child_value->>''id'' ~ ''^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'' then (child_value->>''id'')::uuid end child_id from referenced
   ) select array_agg(distinct child.parent_id) from identified child
    left join public.academy_student_import_effects original on original.academy_id=$1 and original.job_id=$2 and original.target_table=$4 and original.target_id=child.child_id and original.after_snapshot=child.child_value
    left join public.academy_student_import_recovery_effects recovery on recovery.academy_id=$1 and recovery.job_id=$2 and recovery.target_table=$4 and recovery.target_id=child.child_id
    left join public.academy_student_import_lifecycle_evidence lifecycle on $4=''academy_student_lifecycle_events'' and lifecycle.academy_id=$1 and lifecycle.job_id=$2 and lifecycle.event_id=child.child_id and lifecycle.after_snapshot=child.child_value
   where recovery.outcome<>''corrected'' or (original.id is null and lifecycle.event_id is null and (recovery.id is null or recovery.after_snapshot is distinct from child.child_value))';

  end if;
  execute v_sql into v_found using p_academy,p_job,p_table,v_ref->>'table';
  v_result:=v_result||coalesce(v_found,'{}'::uuid[]);
 end loop;
 return array(select distinct unnest(v_result));
end;$$;
revoke all on function public.academy_student_import_external_targets(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;

create or replace function public.academy_recover_student_import(
 p_academy_id uuid,p_actor_id uuid,p_job_id uuid,p_key text,p_reason text,p_branch_ids uuid[] default null,
 p_can_review_all boolean default false,p_can_post_balances boolean default false
) returns jsonb language plpgsql security definer set search_path=public
 set statement_timeout='45s' set lock_timeout='5s' as $$
declare
 v_job public.academy_student_import_jobs%rowtype;v_run public.academy_student_import_recovery_runs%rowtype;
 v_effect public.academy_student_import_effects%rowtype;v_scope jsonb;v_current jsonb;v_contact jsonb;v_after jsonb;v_plan jsonb;v_receipt jsonb;
 v_outcome text;v_code text;v_target uuid;v_amount bigint;v_corrected integer:=0;v_review integer:=0;v_missing integer:=0;v_balances integer:=0;
 v_table text;v_phase text;v_external uuid[];v_used_contacts uuid[];v_lock_targets text;
begin
 if nullif(trim(p_key),'') is null or length(p_key)>180 or nullif(trim(p_reason),'') is null or length(p_reason)>1000 then raise exception 'A recovery key and reason are required';end if;
 if not exists(select 1 from public.users where id=p_actor_id and is_active) then raise exception 'An active account is required';end if;
 select * into v_job from public.academy_student_import_jobs where academy_id=p_academy_id and id=p_job_id for update;
 if not found or(v_job.created_by<>p_actor_id and p_can_review_all is distinct from true)
  or(p_branch_ids is not null and(v_job.branch_id=any(p_branch_ids)) is distinct from true) then raise exception 'Forbidden import job';end if;
 if exists(select 1 from public.academy_student_import_effects where academy_id=p_academy_id and job_id=p_job_id and effect_kind='opening_balance')
  and p_can_post_balances is distinct from true then raise exception 'Reversing opening balances requires finance approval';end if;
 v_scope:=jsonb_build_object('actor',p_actor_id,'key',trim(p_key),'reason',trim(p_reason),
  'branches',case when p_branch_ids is null then null else to_jsonb(array(select distinct unnest(p_branch_ids) order by 1)) end);
 select * into v_run from public.academy_student_import_recovery_runs where academy_id=p_academy_id and job_id=p_job_id;
 if found then
  if v_run.request_scope is distinct from v_scope then raise exception 'A recovery already exists with another operator, key, reason or scope';end if;
  return jsonb_build_object('job',to_jsonb(v_job),'receipt',v_run.receipt,'replayed',true);
 end if;
 if v_job.status<>'completed' or v_job.receipt is null then raise exception 'Only a completed import can be recovered';end if;
 perform pg_advisory_xact_lock(hashtext(p_academy_id::text),-1);
 insert into public.academy_student_import_recovery_runs(academy_id,job_id,request_scope)values(p_academy_id,p_job_id,v_scope) returning * into v_run;
 update public.academy_student_import_jobs set status='reversing',recovery_scope=v_scope where academy_id=p_academy_id and id=p_job_id;
 v_plan:=public.academy_student_import_reference_plan();
 -- Lock target parents before inspecting references. Foreign-key writers cannot
 -- add activity behind a completed review. Classroom-first matches enrollment
 -- writers; imports share the Academy fence and cannot interleave these phases.
 foreach v_table in array array['academy_classrooms','academy_contacts','academy_guardians','academy_classroom_memberships','academy_student_guardian_relationships','academy_account_ledger_entries'] loop
  v_lock_targets:='select target_id from public.academy_student_import_effects where academy_id=$1 and job_id=$2 and target_table=$3';
  if v_table in('academy_classrooms','academy_contacts') then
   v_lock_targets:=v_lock_targets||format(' union select (after_snapshot->>%L)::uuid from public.academy_student_import_effects where academy_id=$1 and job_id=$2 and target_table=''academy_classroom_memberships''',case when v_table='academy_classrooms' then 'classroom_id' else 'contact_id' end);
  end if;
  execute format('select 1 from public.%I parent where parent.academy_id=$1 and parent.id in(%s) order by parent.id for update',v_table,v_lock_targets) using p_academy_id,p_job_id,v_table;
 end loop;
 if to_regprocedure('public.academy_assert_student_import_authority(uuid,uuid,uuid,text)') is not null then
  perform public.academy_assert_student_import_authority(p_academy_id,p_actor_id,p_job_id,'recover');
 end if;
 -- Reverse child relationships/memberships first; their resulting snapshots
 -- prove that later parent deactivation is still part of this same recovery.
 for v_effect in select * from public.academy_student_import_effects where academy_id=p_academy_id and job_id=p_job_id
  order by case target_table when 'academy_account_ledger_entries' then 1 when 'academy_student_guardian_relationships' then 2 when 'academy_classroom_memberships' then 3 when 'academy_contacts' then 4 when 'academy_guardians' then 5 else 6 end,id loop
  if v_phase is distinct from v_effect.target_table then
   v_phase:=v_effect.target_table;
   v_external:=case when v_phase='academy_account_ledger_entries' then '{}'::uuid[] else public.academy_student_import_external_targets(p_academy_id,p_job_id,v_phase,v_plan) end;
   if v_phase='academy_classroom_memberships' then v_used_contacts:=public.academy_student_import_external_targets(p_academy_id,p_job_id,'academy_contacts',v_plan);end if;
  end if;
  v_outcome:='corrected';v_code:=null;v_target:=v_effect.target_id;v_current:=null;v_after:=null;
  execute format('select to_jsonb(t) from public.%I t where academy_id=$1 and id=$2 for update',v_effect.target_table) into v_current using p_academy_id,v_effect.target_id;
  v_contact:=null;
  if v_effect.target_table='academy_classroom_memberships' and v_current is not null then
   select to_jsonb(c) into v_contact from public.academy_contacts c where academy_id=p_academy_id and id=(v_current->>'contact_id')::uuid for update;
  end if;
  if v_current is null then v_outcome:='missing';v_code:='record_not_found';
  elsif v_effect.effect_kind='opening_balance' then
   if v_current is distinct from v_effect.after_snapshot then v_outcome:='manual_review';v_code:='opening_entry_changed';
   else
    v_amount:=(v_current->>'amount')::bigint;
    insert into public.academy_account_ledger_entries(academy_id,contact_id,entry_type,amount,currency,effective_at,reason,idempotency_key,created_by,metadata)
     values(p_academy_id,(v_current->>'contact_id')::uuid,case when v_amount>0 then 'credit_adjustment' else 'debit_adjustment' end,-v_amount,v_current->>'currency',now(),trim(p_reason),
      'student-import-recovery:'||p_job_id||':'||v_effect.id,p_actor_id,jsonb_build_object('student_import_job_id',p_job_id,'recovery_run_id',v_run.id,'reverses_import_effect_id',v_effect.id,'reverses_ledger_entry_id',v_effect.target_id))
     returning id,to_jsonb(academy_account_ledger_entries.*) into v_target,v_after;
    v_balances:=v_balances+1;
   end if;
  elsif v_current is distinct from v_effect.after_snapshot then v_outcome:='manual_review';v_code:='record_changed';
  elsif v_effect.target_id=any(v_external) then v_outcome:='manual_review';v_code:='record_has_later_activity';
  elsif v_contact is not null and(v_contact->>'user_id' is not null or (v_contact->>'id')::uuid=any(v_used_contacts)) then
   v_outcome:='manual_review';v_code:='student_has_later_activity';
  else
   case v_effect.target_table
    when 'academy_contacts' then update public.academy_contacts set status='inactive' where academy_id=p_academy_id and id=v_target returning to_jsonb(academy_contacts.*) into v_after;
    when 'academy_classrooms' then update public.academy_classrooms set is_active=false where academy_id=p_academy_id and id=v_target returning to_jsonb(academy_classrooms.*) into v_after;
    -- This corrects an imported registration, rather than reporting a real
    -- student dropout. Leave withdrawn_at unchanged and retain the provenance.
    when 'academy_classroom_memberships' then update public.academy_classroom_memberships set status='withdrawn',metadata=metadata||jsonb_build_object('import_recovery_run_id',v_run.id)
     where academy_id=p_academy_id and id=v_target returning to_jsonb(academy_classroom_memberships.*) into v_after;
    when 'academy_guardians' then update public.academy_guardians set status='revoked' where academy_id=p_academy_id and id=v_target returning to_jsonb(academy_guardians.*) into v_after;
    when 'academy_student_guardian_relationships' then update public.academy_student_guardian_relationships set status='revoked',consent_status='revoked' where academy_id=p_academy_id and id=v_target returning to_jsonb(academy_student_guardian_relationships.*) into v_after;
    else raise exception 'Unsupported recovery target';
   end case;
  end if;
  if v_after is null then v_after:=v_current;end if;
  insert into public.academy_student_import_recovery_effects(academy_id,job_id,run_id,original_effect_id,target_table,target_id,outcome,reason_code,after_snapshot)
   values(p_academy_id,p_job_id,v_run.id,v_effect.id,v_effect.target_table,v_target,v_outcome,v_code,v_after);
  if v_outcome='corrected' then v_corrected:=v_corrected+1;elsif v_outcome='missing' then v_missing:=v_missing+1;else v_review:=v_review+1;end if;
  -- Capture any recovery lifecycle event before checking a parent reference.
  insert into public.academy_student_import_lifecycle_evidence(academy_id,job_id,event_id,after_snapshot)
   select p_academy_id,p_job_id,e.id,to_jsonb(e) from public.academy_student_lifecycle_events e
    where e.academy_id=p_academy_id and e.source_table=v_effect.target_table and e.source_id=v_effect.target_id
     and e.evidence->>'student_import_job_id'=p_job_id::text and e.evidence->>'automation_suppressed'='true' on conflict do nothing;
 end loop;
 v_receipt:=jsonb_build_object('run_id',v_run.id,'job_id',p_job_id,'actor_id',p_actor_id,'corrected_effects',v_corrected,'manual_review_effects',v_review,'missing_effects',v_missing,'reversal_entries',v_balances,'records_deleted',0,'messages_sent',0,'status',case when v_review+v_missing>0 then 'recovery_review' else 'reversed' end);
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata)values(p_academy_id,p_actor_id,'student_import.recovered','academy_student_import_job',p_job_id::text,v_receipt||jsonb_build_object('reason',trim(p_reason)));
 update public.academy_student_import_recovery_runs set receipt=v_receipt,completed_at=now() where id=v_run.id;
 update public.academy_student_import_jobs set status=v_receipt->>'status',recovery_receipt=v_receipt where academy_id=p_academy_id and id=p_job_id returning * into v_job;
 return jsonb_build_object('job',to_jsonb(v_job),'receipt',v_receipt,'replayed',false);
end;$$;
revoke all on function public.academy_recover_student_import(uuid,uuid,uuid,text,text,uuid[],boolean,boolean) from public,anon,authenticated;
grant execute on function public.academy_recover_student_import(uuid,uuid,uuid,text,text,uuid[],boolean,boolean) to service_role;

-- Keep the existing publisher body, extending only the guarded import state.
do $migration$
declare v_def text;v_old text;v_new text;
begin
 select replace(pg_get_functiondef('public.academy_capture_student_lifecycle_event()'::regprocedure),E'\r\n',E'\n') into v_def;
 v_old:=$anchor$j.status='committing';$anchor$;v_new:=$change$j.status in('committing','reversing');$change$;
 if length(v_def)-length(replace(v_def,v_old,''))<>length(v_old) then raise exception 'Installed import lifecycle state differs';end if;v_def:=replace(v_def,v_old,v_new);
 v_old:=$anchor$select j.id, ((v_new->'metadata'->>'source_joined_on')::date::timestamp at time zone (j.settings->>'branch_timezone'))$anchor$;
 v_new:=$change$select j.id, case when j.status='reversing' then now() else ((v_new->'metadata'->>'source_joined_on')::date::timestamp at time zone (j.settings->>'branch_timezone')) end$change$;
 if length(v_def)-length(replace(v_def,v_old,''))<>length(v_old) then raise exception 'Installed import lifecycle clock differs';end if;v_def:=replace(v_def,v_old,v_new);
 v_old:=$anchor$(j.commit_scope->>'actor')::uuid$anchor$;
 v_new:=$change$(case when j.status='reversing' then j.recovery_scope->>'actor' else j.commit_scope->>'actor' end)::uuid$change$;
 if length(v_def)-length(replace(v_def,v_old,''))<>length(v_old) then raise exception 'Installed import lifecycle actor differs';end if;v_def:=replace(v_def,v_old,v_new);
 v_old:=$anchor$      v_evidence:=v_evidence||jsonb_build_object('origin','student_spreadsheet_import','student_import_job_id',v_import,'automation_suppressed',true);$anchor$;
 v_new:=$change$      if exists(select 1 from public.academy_student_import_jobs where id=v_import and status='reversing') then
        v_event:=case when tg_table_name='academy_classroom_memberships' then 'import.enrollment_recovered' else 'import.relationship_recovered' end;
        v_evidence:=v_evidence||jsonb_build_object('operation','recovery');
      else v_evidence:=v_evidence||jsonb_build_object('operation','commit');end if;
      v_evidence:=v_evidence||jsonb_build_object('origin','student_spreadsheet_import','student_import_job_id',v_import,'automation_suppressed',true);$change$;
 if length(v_def)-length(replace(v_def,v_old,''))<>length(v_old) then raise exception 'Installed import lifecycle provenance differs';end if;execute replace(v_def,v_old,v_new);
 select replace(pg_get_functiondef('public.academy_publish_lifecycle_event()'::regprocedure),E'\r\n',E'\n') into v_def;
 v_old:=$anchor$j.status='committing')$anchor$;v_new:=$change$j.status in('committing','reversing'))$change$;
 if length(v_def)-length(replace(v_def,v_old,''))<>length(v_old) then raise exception 'Installed import lifecycle publisher state differs';end if;execute replace(v_def,v_old,v_new);
end;
$migration$;
