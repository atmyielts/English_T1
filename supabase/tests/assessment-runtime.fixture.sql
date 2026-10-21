-- Test-only protocol adapter: existing behavioral tests use real runtime leases, never the private control RPC.
set search_path=pg_temp,public;
create function pg_temp.assessment_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb)
returns jsonb language plpgsql as $$
declare acquired jsonb; payload jsonb;
begin
 if p_action in ('response.append','section.advance','attempt.submit') then
  acquired:=public.assessment_runtime_command(p_actor,p_tenant,'test-lease:'||md5(p_key||(p_data->>'attempt_id')),'lease.acquire',jsonb_build_object('attempt_id',p_data->>'attempt_id','device_id',p_actor,'token_hash',repeat('a',64)));
  payload:=p_data||jsonb_build_object('lease',jsonb_build_object('device_id',p_actor,'token_hash',repeat('a',64),'epoch',acquired#>>'{result,epoch}'));
  return public.assessment_runtime_command(p_actor,p_tenant,p_key,p_action,payload)->'result';
 end if;
 return public.assessment_command(p_actor,p_tenant,p_key,p_action,p_data);
end; $$;
