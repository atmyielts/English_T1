-- Schood AI after the library: specialist overrides without a name, and (below)
-- conversation retention and account erasure. Runs on PGlite and a real Postgres.
do $$
declare
  teacher constant uuid := '00000000-0000-4000-8000-0000000000a1';
  ws uuid := (public.ai_ensure_personal_workspace(teacher, 'Teacher')).id;
  raised boolean;
begin
  -- A built-in tailored without renaming keeps its own name (null), a blank name is still refused.
  insert into public.ai_specialists (workspace_id, key, name, instructions) values (ws, 'assistant', null, 'Answer in Uzbek first.');
  assert (select name is null from public.ai_specialists where workspace_id = ws and key = 'assistant'), 'null name kept';
  raised := false;
  begin insert into public.ai_specialists (workspace_id, key, name) values (ws, 'blank_name', '   '); exception when check_violation then raised := true; end;
  assert raised, 'blank names are refused';
  delete from public.ai_specialists where workspace_id = ws;
end $$;
select 'schood ai polish: ok';
