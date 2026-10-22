begin;
-- Candidate recovery never grants reviewer playback or exposes encryption/storage envelopes.
create function public.proctor_recording_checkpoint(p_actor uuid,p_tenant uuid,p_recording uuid,p_sequence integer default 0) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.proctor_recordings;s public.proctor_recording_segments;unused public.proctor_sessions;
begin
 select * into r from public.proctor_recordings where tenant_id=p_tenant and id=p_recording;
 if not found then raise exception 'not_found' using errcode='P0002';end if;
 unused:=public.proctor_recording_candidate(p_actor,p_tenant,r.session_id);
 select * into r from public.proctor_recordings where id=p_recording for update;
 if r.expires_at<=clock_timestamp() then raise exception 'recording_retention_expired' using errcode='23514';end if;
 if p_sequence not between 0 and 100000 then raise exception 'invalid_recording_sequence' using errcode='22023';end if;
 select * into s from public.proctor_recording_segments where recording_id=p_recording and sequence=p_sequence;
 return jsonb_build_object('recording',jsonb_build_object('id',r.id,'session_id',r.session_id,'source',r.source,'mime',r.mime,'state',r.state,'last_sequence',r.last_sequence,'head_hash',r.head_hash,'last_end_ms',r.last_end_ms,'close_reason',r.close_reason),'segment',case when s.recording_id is null then null else jsonb_build_object('sequence',s.sequence,'kind',s.kind,'state',s.state,'start_ms',s.start_ms,'end_ms',s.end_ms,'byte_length',s.byte_length,'sha256',s.sha256,'previous_hash',s.previous_hash,'chain_hash',s.chain_hash) end);
end; $$;
create function public.proctor_recording_catalog(p_actor uuid,p_tenant uuid,p_session uuid,p_after uuid default null,p_limit integer default 100) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare rows jsonb;begin
 if not exists(select 1 from public.proctor_sessions where tenant_id=p_tenant and id=p_session) or not public.assessment_has_capability(p_tenant,p_actor,'proctor.review') or not public.proctor_can_access(p_tenant,p_session,p_actor,'reviewer') then raise exception 'not_found' using errcode='P0002';end if;
 if p_limit not between 1 and 100 then raise exception 'invalid_recording_page' using errcode='22023';end if;
 select coalesce(jsonb_agg(row order by id),'[]') into rows from (select r.id,r.session_id,r.source,r.mime,r.provenance,r.state,r.last_sequence,r.last_end_ms,r.close_reason,r.created_at,r.sealed_at,r.expires_at,(select count(*) from public.proctor_recording_segments s where s.recording_id=r.id and s.kind='gap') as gap_count,(select count(*) from public.proctor_recording_segments s where s.recording_id=r.id and s.state='reserved') as pending_count from public.proctor_recordings r where tenant_id=p_tenant and session_id=p_session and (p_after is null or id>p_after) order by id limit p_limit+1) row;
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'proctor.recording.catalog',p_session,jsonb_build_object('after',p_after));
 return jsonb_build_object('items',case when jsonb_array_length(rows)>p_limit then rows-p_limit else rows end,'next_cursor',case when jsonb_array_length(rows)>p_limit then rows->(p_limit-1)->>'id' else null end);
end; $$;
create or replace function public.proctor_recording_read(p_actor uuid,p_tenant uuid,p_recording uuid,p_after integer default 0,p_limit integer default 100) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.proctor_recordings;rows jsonb;begin
 select * into r from public.proctor_recordings where tenant_id=p_tenant and id=p_recording;
 if not found or not public.assessment_has_capability(p_tenant,p_actor,'proctor.review') or not public.proctor_can_access(p_tenant,r.session_id,p_actor,'reviewer') then raise exception 'not_found' using errcode='P0002';end if;
 if r.expires_at<=clock_timestamp() then raise exception 'recording_retention_expired' using errcode='23514';end if;
 if p_after<0 or p_limit not between 1 and 100 then raise exception 'invalid_recording_page' using errcode='22023';end if;
 select coalesce(jsonb_agg(row order by sequence),'[]') into rows from (select sequence,kind,state,start_ms,end_ms,byte_length,sha256,reason,previous_hash,chain_hash,created_at,committed_at,jsonb_build_object('schema','proctor.segment.v1','recording_id',recording_id,'sequence',sequence,'start_ms',start_ms,'end_ms',end_ms,'previous_hash',previous_hash,'kind',kind,'sha256',sha256,'byte_length',byte_length,'parts',expected_parts,'reason',reason)::text as chain_entry from public.proctor_recording_segments where recording_id=p_recording and sequence>p_after order by sequence limit p_limit+1) row;
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'proctor.recording.read',p_recording,jsonb_build_object('after',p_after));
 return jsonb_build_object('recording',to_jsonb(r),'segments',case when jsonb_array_length(rows)>p_limit then rows-p_limit else rows end,'next_cursor',case when jsonb_array_length(rows)>p_limit then rows->(p_limit-1)->'sequence' else null end);
end; $$;
revoke all on function public.proctor_recording_checkpoint(uuid,uuid,uuid,integer),public.proctor_recording_catalog(uuid,uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.proctor_recording_checkpoint(uuid,uuid,uuid,integer),public.proctor_recording_catalog(uuid,uuid,uuid,uuid,integer) to service_role;
commit;
