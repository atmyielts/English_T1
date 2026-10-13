-- Import flags and effect snapshots are service-owned. Current browser clients
-- already use the authenticated Academy endpoint; none needs raw table writes.
revoke all on public.academy_import_jobs,public.academy_import_rows,public.academy_import_effects from public,anon,authenticated;
grant all on public.academy_import_jobs,public.academy_import_rows,public.academy_import_effects to service_role;
alter table public.academy_import_jobs add column request_identity jsonb;

create or replace function public.academy_guard_legacy_import_identity()
returns trigger language plpgsql set search_path=public as $$
begin
 if row(new.id,new.academy_id,new.idempotency_key,new.import_type,new.source_filename,new.column_mapping)
  is distinct from row(old.id,old.academy_id,old.idempotency_key,old.import_type,old.source_filename,old.column_mapping) then raise exception 'Import request identity is immutable';end if;
 -- Preserve the existing ON DELETE SET NULL attribution contract. A nested FK
 -- cleanup may detach a removed principal; the immutable request still retains
 -- its original opaque actor identity. Ordinary callers cannot reassign it.
 if new.created_by is distinct from old.created_by and not(old.created_by is not null and new.created_by is null
  and pg_trigger_depth()>1 and not exists(select 1 from public.users where id=old.created_by)) then raise exception 'Import request identity is immutable';end if;
 -- The previous Edge version configures mode/duplicates immediately after
 -- creation. Allow that one service-owned configuration before any row exists,
 -- then freeze it. The new Edge version creates the complete identity at once.
 if old.request_identity is null and new.request_identity->>'legacy_config_pending'='true'
  and new.import_mode is not distinct from old.import_mode and new.duplicate_strategy is not distinct from old.duplicate_strategy
  and old.status='draft' and new.status='draft'
  and not exists(select 1 from public.academy_import_rows where academy_id=old.academy_id and import_job_id=old.id) then return new;end if;
 if (old.request_identity is null or old.request_identity->>'legacy_config_pending'='true') and old.status='draft' and new.status='draft'
  and not exists(select 1 from public.academy_import_rows where academy_id=old.academy_id and import_job_id=old.id) then
  new.request_identity:=jsonb_build_object('actor',old.created_by,'type',old.import_type,'filename',old.source_filename,'mapping',old.column_mapping,'mode',new.import_mode,'duplicates',new.duplicate_strategy);
  return new;
 end if;
 if new.duplicate_strategy is distinct from old.duplicate_strategy
  or (old.request_identity is not null and new.request_identity is distinct from old.request_identity) then raise exception 'Import request identity is immutable';end if;
 if new.import_mode is distinct from old.import_mode and not(old.import_mode='dry_run' and new.import_mode='commit' and old.status='ready') then
  raise exception 'Only a reviewed dry-run import can move to commit mode';end if;
 return new;
end;$$;
create trigger academy_legacy_import_identity_guard before update on public.academy_import_jobs
 for each row execute function public.academy_guard_legacy_import_identity();
revoke all on function public.academy_guard_legacy_import_identity() from public,anon,authenticated,service_role;

create or replace function public.academy_create_import_job(p_academy_id uuid,p_actor_id uuid,p_payload jsonb,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' as $$
declare v public.academy_import_jobs%rowtype;v_identity jsonb;v_previous jsonb;v_type text;v_filename text;v_mode text;v_duplicates text;v_mapping jsonb;v_legacy boolean;
begin
 if nullif(trim(p_idempotency_key),'') is null or length(p_idempotency_key)>180 then raise exception 'A valid import key is required';end if;
 if not exists(select 1 from public.users where id=p_actor_id and is_active) then raise exception 'An active account is required';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Import settings are required';end if;
 v_type:=lower(p_payload->>'import_type');v_filename:=trim(p_payload->>'source_filename');v_mapping:=coalesce(p_payload->'column_mapping','{}'::jsonb);
 v_mode:=coalesce(p_payload->>'import_mode','dry_run');v_duplicates:=coalesce(p_payload->>'duplicate_strategy','reject');
 v_legacy:=not(p_payload?'import_mode' or p_payload?'duplicate_strategy');
 if v_type is null or v_type not in('contacts','leads','guardians','staff','classrooms','balances','enrollments','attendance')
  or nullif(v_filename,'') is null or length(v_filename)>300 or jsonb_typeof(v_mapping) is distinct from 'object'
  or v_mode not in('dry_run','commit') or v_duplicates not in('reject','skip','update_safe_fields') then raise exception 'Valid import settings are required';end if;
 v_identity:=jsonb_build_object('actor',p_actor_id,'type',v_type,'filename',v_filename,'mapping',v_mapping,'mode',v_mode,'duplicates',v_duplicates);
 if v_legacy then v_identity:=(v_identity-'mode'-'duplicates')||'{"legacy_config_pending":true}'::jsonb;end if;
 insert into public.academy_import_jobs(academy_id,import_type,source_filename,column_mapping,idempotency_key,created_by,import_mode,duplicate_strategy,request_identity)
 values(p_academy_id,v_type,v_filename,v_mapping,trim(p_idempotency_key),p_actor_id,v_mode,v_duplicates,v_identity)
 on conflict(academy_id,idempotency_key) do nothing;
 select * into v from public.academy_import_jobs where academy_id=p_academy_id and idempotency_key=trim(p_idempotency_key) for update;
 v_previous:=coalesce(v.request_identity,jsonb_build_object('actor',v.created_by,'type',v.import_type,'filename',v.source_filename,'mapping',v.column_mapping,'mode',v.import_mode,'duplicates',v.duplicate_strategy));
 if (v_legacy and(v_previous-'mode'-'duplicates'-'legacy_config_pending') is distinct from(v_identity-'legacy_config_pending'))
  or(not v_legacy and v_previous is distinct from v_identity) then raise exception 'Import key already used for another operator or configuration';end if;
 if v.request_identity is null then
  update public.academy_import_jobs set request_identity=case when v_legacy and v.status='draft'
    and not exists(select 1 from public.academy_import_rows where academy_id=v.academy_id and import_job_id=v.id)
    then v_identity else v_previous end where id=v.id returning * into v;
 end if;
 return to_jsonb(v);
end;$$;
revoke all on function public.academy_create_import_job(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.academy_create_import_job(uuid,uuid,jsonb,text) to service_role;
