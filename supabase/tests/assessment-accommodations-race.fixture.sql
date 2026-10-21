-- Test-only helpers for the four-process accommodation/break races. A failed
-- command is reported as data so that one expected rejection does not abort the
-- other racing sessions; nothing here is installed outside the disposable DB.
create table if not exists fixture_accommodation_race(name text primary key,id uuid not null);
create or replace function fixture_accommodation_try(p_actor uuid,p_key text,p_action text,p_data jsonb,p_runtime boolean default false) returns jsonb language plpgsql as $$
begin
 if p_runtime then return jsonb_build_object('ok',true,'result',public.assessment_runtime_command(p_actor,'10000000-0000-4000-8000-000000000001',p_key,p_action,p_data)->'result');end if;
 return jsonb_build_object('ok',true,'result',public.assessment_command(p_actor,'10000000-0000-4000-8000-000000000001',p_key,p_action,p_data));
exception when others then return jsonb_build_object('ok',false,'error',sqlerrm);
end;$$;
-- Stands in for the proctor pause transition (state change only); the canonical
-- proctor command path is exercised by the proctor suites.
create or replace function fixture_accommodation_pause(p_attempt uuid) returns jsonb language plpgsql as $$
begin
 update public.assessment_attempts set state='paused' where id=p_attempt and state='active';
 return jsonb_build_object('ok',true,'paused',found);
exception when others then return jsonb_build_object('ok',false,'error',sqlerrm);
end;$$;
create or replace function fixture_accommodation_expire(p_attempt uuid) returns jsonb language plpgsql as $$
begin
 perform public.assessment_runtime_expire('10000000-0000-4000-8000-000000000001',p_attempt);
 return jsonb_build_object('ok',true);
exception when others then return jsonb_build_object('ok',false,'error',sqlerrm);
end;$$;
