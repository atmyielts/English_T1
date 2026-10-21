create function public.fixture_workload_race(p_key text,p_action text,p_revision integer) returns jsonb language plpgsql as $$declare result jsonb;begin
 result:=public.proctor_workload_command('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',p_key,p_action,jsonb_build_object('user_id','00000000-0000-4000-8000-000000000071','role','observer','reason','Reviewed concurrent coverage change','targets',jsonb_build_array(jsonb_build_object('session_id',(select session_id from public.fixture_proctor_workload where n=1),'expected_revision',p_revision))));
 return jsonb_build_object('won',true,'result',result);
exception when unique_violation then if sqlerrm<>'assignment_revision_conflict' then raise;end if;return jsonb_build_object('won',false);
when check_violation then if sqlerrm<>'assignee_capability_required' then raise;end if;return jsonb_build_object('won',false);end;$$;
