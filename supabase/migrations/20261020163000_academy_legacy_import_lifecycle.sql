-- Historical imports/corrections retain lifecycle facts without sending current
-- attendance/admissions automations. Preserve every other installed code path.
begin;
do $migration$
declare body text;anchor text;addition text;
begin
 select replace(pg_get_functiondef('public.academy_capture_student_lifecycle_event()'::regprocedure),E'\r\n',E'\n') into body;
 anchor:=$anchor$  if v_event is null then return new; end if;$anchor$;
 addition:=anchor||$change$
  if coalesce(current_setting('schood.legacy_import_job',true),'') ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    and exists(select 1 from public.academy_import_jobs j where j.academy_id=v_academy
      and j.id=nullif(current_setting('schood.legacy_import_job',true),'')::uuid and j.command_phase in('commit','recover')) then
    select j.command_actor_id into v_actor from public.academy_import_jobs j where j.id=nullif(current_setting('schood.legacy_import_job',true),'')::uuid;
    v_evidence:=v_evidence||jsonb_build_object('origin','legacy_spreadsheet_import',
      'legacy_import_job_id',current_setting('schood.legacy_import_job',true),'automation_suppressed',true);
    if exists(select 1 from public.academy_import_jobs j where j.id=nullif(current_setting('schood.legacy_import_job',true),'')::uuid and j.command_phase='recover') then
      v_event:='import.legacy_recovered';
    end if;
  end if;
$change$;
 if length(body)-length(replace(body,anchor,''))<>length(anchor) then raise exception 'Installed lifecycle boundary differs; retain and review its current body';end if;
 execute replace(body,anchor,addition);
 select replace(pg_get_functiondef('public.academy_publish_lifecycle_event()'::regprocedure),E'\r\n',E'\n') into body;
 anchor:=E'\nbegin\n';addition:=anchor||$change$
  if new.evidence->>'automation_suppressed'='true'
    and coalesce(new.evidence->>'legacy_import_job_id','') ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    and exists(select 1 from public.academy_import_jobs j where j.academy_id=new.academy_id
      and j.id=(new.evidence->>'legacy_import_job_id')::uuid and j.command_phase in('commit','recover')) then return new;end if;
$change$;
 if length(body)-length(replace(body,anchor,''))<>length(anchor) then raise exception 'Installed lifecycle publisher differs; retain and review its current body';end if;
 execute replace(body,anchor,addition);
end;
$migration$;
commit;
