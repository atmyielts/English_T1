begin;
-- Never upgrade immutable metadata-era reports into verified byte clearance.
alter function public.assessment_qti_report(uuid,text,uuid,text,jsonb) rename to assessment_qti_report_before_bytes;
revoke all on function public.assessment_qti_report_before_bytes(uuid,text,uuid,text,jsonb) from public,anon,authenticated,service_role;
create function public.assessment_qti_report(p_job uuid,p_stage text,p_token uuid,p_processor text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.assessment_qti_reports;
begin
 select * into prior from public.assessment_qti_reports where job_id=p_job and stage=p_stage;
 if found and prior.lease_token=p_token and prior.payload=p_data then return public.assessment_qti_report_before_bytes(p_job,p_stage,p_token,p_processor,p_data);end if;
 if p_stage='scan' then
  if p_data->>'schema_version' is distinct from 'assessment.qti-scan.v2' or jsonb_typeof(p_data->'scan_performed') is distinct from 'boolean' or coalesce(p_data->>'observed_source_hash','')!~'^[a-f0-9]{64}$' or p_data->>'reason' is null or p_data->>'reason' not in('clean','malware_or_engine_limit','source_hash_mismatch') then raise exception 'qti_byte_verification_required' using errcode='23514';end if;
  if p_data->>'verdict'='clean' and (p_data->'scan_performed'<>'true' or p_data->>'reason'<>'clean' or p_data->>'observed_source_hash' is distinct from p_data->>'source_hash') or p_data->>'verdict'='rejected' and p_data->>'reason'='clean' or p_data->>'reason'='source_hash_mismatch' and (p_data->'scan_performed'<>'false' or p_data->>'observed_source_hash'=p_data->>'source_hash') or p_data->>'reason'='malware_or_engine_limit' and (p_data->'scan_performed'<>'true' or p_data->>'observed_source_hash' is distinct from p_data->>'source_hash') then raise exception 'qti_byte_verification_conflict' using errcode='23514';end if;
 elsif p_stage='parse' and not exists(select 1 from public.assessment_qti_reports where job_id=p_job and stage='scan' and payload->>'schema_version'='assessment.qti-scan.v2' and payload->>'verdict'='clean' and payload->'scan_performed'='true' and payload->>'observed_source_hash'=payload->>'source_hash') then raise exception 'qti_verified_scan_required' using errcode='42501';end if;
 return public.assessment_qti_report_before_bytes(p_job,p_stage,p_token,p_processor,p_data);
end;$$;
alter function public.assessment_qti_command(uuid,uuid,text,text,jsonb) rename to assessment_qti_command_before_bytes;
revoke all on function public.assessment_qti_command_before_bytes(uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
create function public.assessment_qti_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('assessment.staff:'||p_tenant::text,0));perform public.assessment_qti_authorize(p_actor,p_tenant);
 if p_action='adopt' and not exists(select 1 from public.assessment_qti_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key) and not exists(select 1 from public.assessment_qti_reports where tenant_id=p_tenant and job_id=(p_data->>'id')::uuid and stage='scan' and payload->>'schema_version'='assessment.qti-scan.v2' and payload->>'verdict'='clean' and payload->'scan_performed'='true' and payload->>'observed_source_hash'=payload->>'source_hash') then raise exception 'qti_verified_scan_required' using errcode='42501';end if;
 return public.assessment_qti_command_before_bytes(p_actor,p_tenant,p_key,p_action,p_data);
end;$$;
revoke all on function public.assessment_qti_report(uuid,text,uuid,text,jsonb),public.assessment_qti_command(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.assessment_qti_report(uuid,text,uuid,text,jsonb),public.assessment_qti_command(uuid,uuid,text,text,jsonb) to service_role;
-- A bounded, current-authority projection explains scanner outcomes without
-- exposing leases, raw scanner output or treating historical metadata as proof.
alter function public.assessment_qti_read(uuid,uuid,uuid,integer,integer) rename to assessment_qti_read_before_bytes;
revoke all on function public.assessment_qti_read_before_bytes(uuid,uuid,uuid,integer,integer) from public,anon,authenticated,service_role;
create function public.assessment_qti_read(p_actor uuid,p_tenant uuid,p_id uuid default null,p_after integer default 0,p_limit integer default 50) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;scan jsonb;
begin
 result:=public.assessment_qti_read_before_bytes(p_actor,p_tenant,p_id,p_after,p_limit);
 if p_id is null then return result;end if;
 select jsonb_build_object('verdict',r.payload->>'verdict','byte_verified',coalesce(r.payload->>'schema_version'='assessment.qti-scan.v2' and r.payload->'scan_performed'='true' and r.payload->>'observed_source_hash'=result->>'source_hash',false),'reason',case when r.payload->>'schema_version'='assessment.qti-scan.v2' then r.payload->>'reason' else 'historical_metadata' end,'engine_version',r.payload->>'engine_version','signature_version',r.payload->>'signature_version') into scan from public.assessment_qti_reports r where r.tenant_id=p_tenant and r.job_id=p_id and r.stage='scan';
 return result||jsonb_build_object('scan',scan);
end;$$;
revoke all on function public.assessment_qti_read(uuid,uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.assessment_qti_read(uuid,uuid,uuid,integer,integer) to service_role;
commit;
