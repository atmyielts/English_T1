-- Preserve the installed lifecycle functions, adding only tightly guarded
-- import behavior. Historical joins retain their date and audit history, but
-- never enroll imported parents/students into communication automation.
do $migration$
declare v_def text;v_old text;v_new text;
begin
 select pg_get_functiondef('public.academy_capture_student_lifecycle_event()'::regprocedure) into v_def;
 v_def:=replace(v_def,E'\r\n',E'\n');
 v_old:=$anchor$  v_evidence jsonb := '{}'::jsonb;$anchor$;
 v_new:=v_old||E'\n  v_import uuid;\n  v_occurred timestamptz := now();';
 if length(v_def)-length(replace(v_def,v_old,''))<>length(v_old) then raise exception 'Installed lifecycle declaration differs; review the retained body';end if;
 v_def:=replace(v_def,v_old,v_new);
 v_old:=$anchor$  if v_event is null then return new; end if;$anchor$;
 v_new:=v_old||$change$
  -- A raw metadata flag is insufficient: the service-only job must currently
  -- be applying inside this same transaction. Other sessions cannot observe
  -- its uncommitted state or use it to suppress unrelated events.
  if tg_table_name in ('academy_classroom_memberships','academy_student_guardian_relationships')
    and coalesce(v_new->'metadata'->>'student_import_job_id','') ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
    select j.id, ((v_new->'metadata'->>'source_joined_on')::date::timestamp at time zone (j.settings->>'branch_timezone'))
      into v_import,v_occurred from public.academy_student_import_jobs j
      where j.academy_id=v_academy and j.id=(v_new->'metadata'->>'student_import_job_id')::uuid and j.status='committing';
    if found then
      select (j.commit_scope->>'actor')::uuid into v_actor from public.academy_student_import_jobs j where j.id=v_import;
      v_evidence:=v_evidence||jsonb_build_object('origin','student_spreadsheet_import','student_import_job_id',v_import,'automation_suppressed',true);
    else v_occurred:=now();end if;
  end if;
$change$;
 if length(v_def)-length(replace(v_def,v_old,''))<>length(v_old) then raise exception 'Installed lifecycle event boundary differs; review the retained body';end if;
 v_def:=replace(v_def,v_old,v_new);
 v_old:=$anchor$    idempotency_key, evidence$anchor$;v_new:=$change$    idempotency_key, occurred_at, evidence$change$;
 if length(v_def)-length(replace(v_def,v_old,''))<>length(v_old) then raise exception 'Installed lifecycle evidence columns differ';end if;
 v_def:=replace(v_def,v_old,v_new);
 v_old:=$anchor$    v_relationship, v_event, v_actor, tg_table_name, v_source, v_key, v_evidence$anchor$;
 v_new:=$change$    v_relationship, v_event, v_actor, tg_table_name, v_source, v_key, v_occurred, v_evidence$change$;
 if length(v_def)-length(replace(v_def,v_old,''))<>length(v_old) then raise exception 'Installed lifecycle evidence values differ';end if;
 execute replace(v_def,v_old,v_new);

 select pg_get_functiondef('public.academy_publish_lifecycle_event()'::regprocedure) into v_def;
 v_def:=replace(v_def,E'\r\n',E'\n');
 v_old:=E'\nbegin\n';v_new:=v_old||$change$
  if new.evidence->>'automation_suppressed'='true'
    and coalesce(new.evidence->>'student_import_job_id','') ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    and exists(select 1 from public.academy_student_import_jobs j where j.academy_id=new.academy_id
      and j.id=(new.evidence->>'student_import_job_id')::uuid and j.status='committing') then
    return new;
  end if;
$change$;
 if length(v_def)-length(replace(v_def,v_old,''))<>length(v_old) then raise exception 'Installed lifecycle publisher differs; review the retained body';end if;
 execute replace(v_def,v_old,v_new);
end;
$migration$;
