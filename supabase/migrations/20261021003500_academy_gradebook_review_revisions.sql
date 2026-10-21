-- Grading must receive the same current revisions its write command validates.
-- Retain the installed read's filtering, bounds, locks and authority recheck.
begin;
do $migration$
declare definition text;assignment_marker text:='attempts_allowed,allow_late_submission,position,status';
 submission_marker text:='feedback,submission_content,submission_url,metadata';
begin
 definition:=pg_get_functiondef('public.academy_operational_read(uuid,uuid,text,jsonb)'::regprocedure);
 if (length(definition)-length(replace(definition,assignment_marker,'')))/length(assignment_marker)<>1
  or (length(definition)-length(replace(definition,submission_marker,'')))/length(submission_marker)<>1
  or definition not like '%gradebook_recheck%'
  or definition not like '%authority_hash%' then
  raise exception 'Scoped gradebook read changed; review its current projection before adding revisions';
 end if;
 definition:=replace(definition,assignment_marker,assignment_marker||',updated_at');
 definition:=replace(definition,submission_marker,submission_marker||',updated_at');
 execute definition;
end;$migration$;
commit;
