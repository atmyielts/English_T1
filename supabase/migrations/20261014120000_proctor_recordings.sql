begin;
-- Separate Proctor evidence namespace; author prompt assets cannot confer evidence access.
create table public.proctor_recordings (
 id uuid primary key,tenant_id uuid not null,session_id uuid not null,candidate_id uuid not null references public.users(id),
 source text not null check(source in ('camera','screen','microphone')),mime text not null,
 provenance text not null default 'browser_reported' check(provenance='browser_reported'),
 state text not null default 'open' check(state in ('open','sealed')),last_sequence integer not null default 0,
 head_hash text not null default repeat('0',64),last_end_ms integer not null default 0,close_reason text,
 created_at timestamptz not null default clock_timestamp(),sealed_at timestamptz,
 expires_at timestamptz not null default clock_timestamp()+interval '90 days',unique(tenant_id,id),
 foreign key(tenant_id,session_id) references public.proctor_sessions(tenant_id,id)
);
create unique index proctor_recording_open_source on public.proctor_recordings(session_id,source) where state='open';
create index proctor_recordings_session on public.proctor_recordings(tenant_id,session_id,id);
create table public.proctor_recording_segments (
 tenant_id uuid not null,recording_id uuid not null,sequence integer not null check(sequence between 1 and 100000),
 kind text not null check(kind in ('media','gap')),state text not null check(state in ('reserved','committed')),
 start_ms integer not null check(start_ms>=0),end_ms integer not null check(end_ms>start_ms and end_ms<=86400000),
 byte_length integer,sha256 text,expected_parts jsonb,reason text,previous_hash text not null,chain_hash text not null,
 created_at timestamptz not null default clock_timestamp(),committed_at timestamptz,
 primary key(recording_id,sequence),foreign key(tenant_id,recording_id) references public.proctor_recordings(tenant_id,id),
 check((kind='media' and byte_length between 1 and 8388608 and sha256 ~ '^[a-f0-9]{64}$' and jsonb_typeof(expected_parts)='array' and reason is null) or (kind='gap' and byte_length is null and sha256 is null and expected_parts is null and length(reason) between 1 and 1000 and state='committed'))
);
create table public.proctor_recording_parts (
 tenant_id uuid not null,recording_id uuid not null,sequence integer not null,index integer not null check(index between 0 and 7),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),byte_length integer not null check(byte_length between 1 and 1048576),
 cipher_sha256 text not null check(cipher_sha256 ~ '^[a-f0-9]{64}$'),iv text not null check(iv ~ '^[a-f0-9]{24}$'),
 key_id text not null check(key_id ~ '^[-a-zA-Z0-9_]{1,80}$'),object_key text not null unique,etag text not null,
 received_at timestamptz not null default clock_timestamp(),primary key(recording_id,sequence,index),
 foreign key(recording_id,sequence) references public.proctor_recording_segments(recording_id,sequence),
 foreign key(tenant_id,recording_id) references public.proctor_recordings(tenant_id,id)
);
create table public.proctor_recording_commands (
 tenant_id uuid not null,actor_id uuid not null,idempotency_key text not null,request jsonb not null,result jsonb not null,
 created_at timestamptz not null default clock_timestamp(),primary key(tenant_id,actor_id,idempotency_key)
);
do $$ declare t text;begin
 foreach t in array array['proctor_recordings','proctor_recording_segments','proctor_recording_parts','proctor_recording_commands'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant all on public.%I to service_role',t);
 end loop;
 foreach t in array array['proctor_recording_parts','proctor_recording_commands'] loop
  execute format('create trigger immutable_record before update or delete on public.%I for each row execute function public.assessment_immutable()',t);
 end loop;
end; $$;
create function public.proctor_recording_guard() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then raise exception 'recording_deletion_requires_retention_workflow' using errcode='23514';end if;
 if (new.id,new.tenant_id,new.session_id,new.candidate_id,new.source,new.mime,new.provenance,new.created_at,new.expires_at) is distinct from (old.id,old.tenant_id,old.session_id,old.candidate_id,old.source,old.mime,old.provenance,old.created_at,old.expires_at) or old.state='sealed' then raise exception 'immutable_recording' using errcode='23514';end if;
 if new.last_sequence not between old.last_sequence and old.last_sequence+1 or (new.last_sequence=old.last_sequence and (new.head_hash,new.last_end_ms) is distinct from (old.head_hash,old.last_end_ms)) or new.last_end_ms<old.last_end_ms then raise exception 'invalid_recording_head' using errcode='23514';end if;
 return new;
end; $$;
create trigger recording_guard before update or delete on public.proctor_recordings for each row execute function public.proctor_recording_guard();
create function public.proctor_recording_segment_guard() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then raise exception 'recording_deletion_requires_retention_workflow' using errcode='23514';end if;
 if (new.tenant_id,new.recording_id,new.sequence,new.kind,new.start_ms,new.end_ms,new.byte_length,new.sha256,new.expected_parts,new.reason,new.previous_hash,new.chain_hash,new.created_at) is distinct from (old.tenant_id,old.recording_id,old.sequence,old.kind,old.start_ms,old.end_ms,old.byte_length,old.sha256,old.expected_parts,old.reason,old.previous_hash,old.chain_hash,old.created_at) or old.state<>'reserved' or new.state<>'committed' or new.committed_at is null then raise exception 'immutable_recording_segment' using errcode='23514';end if;
 return new;
end; $$;
create trigger recording_segment_guard before update or delete on public.proctor_recording_segments for each row execute function public.proctor_recording_segment_guard();

create function public.proctor_recording_candidate(p_actor uuid,p_tenant uuid,p_session uuid) returns public.proctor_sessions
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.proctor_sessions;begin
 -- Lock canonical attempt before Proctor session, matching pause/finalization order.
 perform 1 from public.assessment_attempts where tenant_id=p_tenant and id=(select attempt_id from public.proctor_sessions where tenant_id=p_tenant and id=p_session) for update;
 select * into s from public.proctor_sessions where tenant_id=p_tenant and id=p_session for update;
 if not found or s.candidate_id<>p_actor then raise exception 'not_found' using errcode='P0002';end if;
 if s.state='completed' and (s.completed_at is null or s.completed_at+interval '1 day'<=clock_timestamp()) then raise exception 'recording_recovery_expired' using errcode='23514';end if;
 return s;
end; $$;
create function public.proctor_recording_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.proctor_sessions;r public.proctor_recordings;prior public.proctor_recording_commands;result jsonb;request jsonb;entry jsonb;part jsonb;pos integer:=0;bytes integer;seq integer;start_ms integer;end_ms integer;chain text;rid uuid;
begin
 if p_actor is null or not exists(select 1 from public.users where id=p_actor) then raise exception 'unauthorized' using errcode='42501';end if;
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'idempotency_key_required' using errcode='22023';end if;
 rid:=(p_data->>'recording_id')::uuid;if rid is null then raise exception 'recording_id_required' using errcode='22023';end if;
 if p_action='recording.begin' then s:=public.proctor_recording_candidate(p_actor,p_tenant,(p_data->>'session_id')::uuid);
 else select * into r from public.proctor_recordings where tenant_id=p_tenant and id=rid;if not found then raise exception 'not_found' using errcode='P0002';end if;s:=public.proctor_recording_candidate(p_actor,p_tenant,r.session_id);end if;
 request:=jsonb_build_object('action',p_action,'data',p_data);perform pg_advisory_xact_lock(hashtextextended('proctor-recording:'||p_tenant::text||p_actor::text||p_key,0));
 select * into prior from public.proctor_recording_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
 if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
 if p_action='recording.begin' then
  if s.state<>'active' or not exists(select 1 from public.assessment_attempts where id=s.attempt_id and state='active' and deadline_at>clock_timestamp()) then raise exception 'session_not_active' using errcode='23514';end if;
  if p_data->>'source' not in ('camera','screen','microphone') or coalesce((s.policy_snapshot->>(p_data->>'source'))::boolean,false) is not true or p_data->>'mime' not in ('video/webm','video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/webm;codecs=vp8','video/webm;codecs=vp9','video/mp4','audio/webm','audio/webm;codecs=opus','audio/mp4') or ((p_data->>'source'='microphone') is distinct from (p_data->>'mime' like 'audio/%')) then raise exception 'recording_source_not_permitted' using errcode='22023';end if;
  if not exists(select 1 from public.proctor_preparations p join public.assessment_attempts a on a.registration_id=p.registration_id where a.id=s.attempt_id and p.policy_id=s.policy_id and p.candidate_id=p_actor) then raise exception 'proctor_consent_required' using errcode='23514';end if;
  if (select count(*) from public.proctor_recordings where session_id=s.id)>=64 then raise exception 'recording_restart_limit' using errcode='23514';end if;
  insert into public.proctor_recordings(id,tenant_id,session_id,candidate_id,source,mime) values(rid,p_tenant,s.id,p_actor,p_data->>'source',p_data->>'mime') returning * into r;
  result:=jsonb_build_object('id',r.id,'state',r.state,'sequence',0,'head_hash',r.head_hash,'part_bytes',1048576);
 else
  select * into r from public.proctor_recordings where tenant_id=p_tenant and id=rid for update;
  if r.state<>'open' or r.expires_at<=clock_timestamp() then raise exception 'recording_not_open' using errcode='23514';end if;
  if exists(select 1 from public.proctor_recording_segments where recording_id=rid and state='reserved') then raise exception 'recording_segment_pending' using errcode='23514';end if;
  if p_action='recording.close' then
   if (p_data->>'expected_sequence')::numeric<>r.last_sequence or p_data->>'expected_hash' is distinct from r.head_hash then raise exception 'recording_head_conflict' using errcode='23505';end if;
   if coalesce(p_data->>'reason','') not in ('runtime_end','track_lost','user_stop','capture_error') then raise exception 'invalid_close_reason' using errcode='22023';end if;
   update public.proctor_recordings set state='sealed',close_reason=p_data->>'reason',sealed_at=clock_timestamp() where id=rid;
   result:=jsonb_build_object('id',rid,'state','sealed','head_hash',r.head_hash,'sequence',r.last_sequence);
  elsif p_action in ('recording.reserve','recording.gap') then
   if jsonb_typeof(p_data->'sequence') is distinct from 'number' or (p_data->>'sequence')::numeric<>r.last_sequence+1 or p_data->>'previous_hash' is distinct from r.head_hash then raise exception 'recording_head_conflict' using errcode='23505';end if;
   seq:=r.last_sequence+1;
   if seq>100000 or jsonb_typeof(p_data->'start_ms') is distinct from 'number' or jsonb_typeof(p_data->'end_ms') is distinct from 'number' or (p_data->>'start_ms')::numeric<>r.last_end_ms or (p_data->>'end_ms')::numeric<>trunc((p_data->>'end_ms')::numeric) then raise exception 'recording_interval_conflict' using errcode='22023';end if;
   start_ms:=(p_data->>'start_ms')::integer;end_ms:=(p_data->>'end_ms')::integer;
   if end_ms<=start_ms or end_ms>86400000 then raise exception 'invalid_recording_interval' using errcode='22023';end if;
   if p_action='recording.reserve' then
    if end_ms-start_ms>60000 or jsonb_typeof(p_data->'byte_length') is distinct from 'number' or (p_data->>'byte_length')::numeric<>trunc((p_data->>'byte_length')::numeric) or coalesce(p_data->>'sha256','') !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_data->'parts') is distinct from 'array' then raise exception 'invalid_recording_manifest' using errcode='22023';end if;
    bytes:=(p_data->>'byte_length')::integer;if bytes not between 1 and 8388608 or jsonb_array_length(p_data->'parts')<>ceil(bytes::numeric/1048576) then raise exception 'invalid_recording_manifest' using errcode='22023';end if;
    if (select coalesce(sum(byte_length::bigint),0) from public.proctor_recording_segments where recording_id=rid)+bytes>17179869184 then raise exception 'recording_storage_ceiling' using errcode='23514';end if;
    for part in select value from jsonb_array_elements(p_data->'parts') loop
     if coalesce(part->>'sha256','') !~ '^[a-f0-9]{64}$' or jsonb_typeof(part->'byte_length') is distinct from 'number' or (part->>'byte_length')::numeric<>least(1048576,bytes-pos*1048576) then raise exception 'invalid_recording_part' using errcode='22023';end if;pos:=pos+1;
    end loop;
   elsif jsonb_typeof(p_data->'reason') is distinct from 'string' or length(trim(p_data->>'reason')) not between 1 and 1000 then raise exception 'invalid_gap_reason' using errcode='22023';end if;
   entry:=jsonb_build_object('schema','proctor.segment.v1','recording_id',rid,'sequence',seq,'start_ms',start_ms,'end_ms',end_ms,'previous_hash',r.head_hash,'kind',case when p_action='recording.reserve' then 'media' else 'gap' end,'sha256',p_data->'sha256','byte_length',p_data->'byte_length','parts',p_data->'parts','reason',p_data->'reason');
   chain:=encode(sha256(convert_to(entry::text,'UTF8')),'hex');
   insert into public.proctor_recording_segments(tenant_id,recording_id,sequence,kind,state,start_ms,end_ms,byte_length,sha256,expected_parts,reason,previous_hash,chain_hash,committed_at) values(p_tenant,rid,seq,entry->>'kind',case when p_action='recording.reserve' then 'reserved' else 'committed' end,start_ms,end_ms,bytes,p_data->>'sha256',p_data->'parts',p_data->>'reason',r.head_hash,chain,case when p_action='recording.gap' then clock_timestamp() else null end);
   update public.proctor_recordings set last_sequence=seq,head_hash=chain,last_end_ms=end_ms where id=rid;
   result:=jsonb_build_object('id',rid,'sequence',seq,'head_hash',chain,'state',case when p_action='recording.reserve' then 'reserved' else 'committed' end);
  else raise exception 'unknown_recording_action' using errcode='22023';end if;
 end if;
 insert into public.proctor_recording_commands values(p_tenant,p_actor,p_key,request,result,clock_timestamp());
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'proctor.'||p_action,rid,jsonb_build_object('session_id',s.id,'sequence',result->'sequence','head_hash',result->'head_hash'));
 return result;
end; $$;

create function public.proctor_recording_read(p_actor uuid,p_tenant uuid,p_recording uuid,p_after integer default 0,p_limit integer default 100) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.proctor_recordings;rows jsonb;begin
 select * into r from public.proctor_recordings where tenant_id=p_tenant and id=p_recording;
 if not found or not public.assessment_has_capability(p_tenant,p_actor,'proctor.review') or not public.proctor_can_access(p_tenant,r.session_id,p_actor,'reviewer') then raise exception 'not_found' using errcode='P0002';end if;
 if r.expires_at<=clock_timestamp() then raise exception 'recording_retention_expired' using errcode='23514';end if;
 if p_after<0 or p_limit not between 1 and 100 then raise exception 'invalid_recording_page' using errcode='22023';end if;
 select coalesce(jsonb_agg(row order by sequence),'[]') into rows from (select sequence,kind,state,start_ms,end_ms,byte_length,sha256,reason,previous_hash,chain_hash,created_at,committed_at from public.proctor_recording_segments where recording_id=p_recording and sequence>p_after order by sequence limit p_limit+1) row;
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'proctor.recording.read',p_recording,jsonb_build_object('after',p_after));
 return jsonb_build_object('recording',to_jsonb(r),'segments',case when jsonb_array_length(rows)>p_limit then rows-p_limit else rows end,'next_cursor',case when jsonb_array_length(rows)>p_limit then rows->(p_limit-1)->'sequence' else null end);
end; $$;
create function public.proctor_recording_transport(p_actor uuid,p_tenant uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.proctor_recordings;s public.proctor_recording_segments;part public.proctor_recording_parts;expected jsonb;pos integer;key text;payload jsonb;result jsonb;unused public.proctor_sessions;
begin
 select * into r from public.proctor_recordings where tenant_id=p_tenant and id=(p_data->>'recording_id')::uuid;
 if not found then raise exception 'not_found' using errcode='P0002';end if;
 if p_action='segment.read' then
  if not public.assessment_has_capability(p_tenant,p_actor,'proctor.review') or not public.proctor_can_access(p_tenant,r.session_id,p_actor,'reviewer') then raise exception 'not_found' using errcode='P0002';end if;
 else unused:=public.proctor_recording_candidate(p_actor,p_tenant,r.session_id);end if;
 select * into r from public.proctor_recordings where id=r.id for update;
 if r.expires_at<=clock_timestamp() then raise exception 'recording_retention_expired' using errcode='23514';end if;
 select * into s from public.proctor_recording_segments where recording_id=r.id and sequence=(p_data->>'sequence')::integer for update;
 if not found or s.kind<>'media' then raise exception 'not_found' using errcode='P0002';end if;
 if p_action='segment.read' then
  if s.state<>'committed' then raise exception 'recording_not_ready' using errcode='23514';end if;
  select coalesce(jsonb_agg(to_jsonb(p) order by index),'[]') into payload from public.proctor_recording_parts p where recording_id=r.id and sequence=s.sequence;
  insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'proctor.recording.playback',r.id,jsonb_build_object('sequence',s.sequence));
  return jsonb_build_object('tenant_id',p_tenant,'recording_id',r.id,'sequence',s.sequence,'mime',r.mime,'byte_length',s.byte_length,'sha256',s.sha256,'parts',payload);
 end if;
 if r.state<>'open' then raise exception 'recording_not_open' using errcode='23514';end if;
 if p_action='segment.complete' then
  if (select count(*) from public.proctor_recording_parts where recording_id=r.id and sequence=s.sequence)<>jsonb_array_length(s.expected_parts) then raise exception 'recording_parts_missing' using errcode='23514';end if;
  if s.state='reserved' then
   update public.proctor_recording_segments set state='committed',committed_at=clock_timestamp() where recording_id=r.id and sequence=s.sequence;
   insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'proctor.recording.segment.committed',r.id,jsonb_build_object('sequence',s.sequence,'chain_hash',s.chain_hash));
  end if;
  return jsonb_build_object('recording_id',r.id,'sequence',s.sequence,'state','committed','head_hash',s.chain_hash);
 end if;
 pos:=(p_data->>'index')::integer;expected:=s.expected_parts->pos;
 if pos is null or pos<0 or expected is null then raise exception 'invalid_recording_part' using errcode='22023';end if;
 key:='proctor/'||p_tenant::text||'/'||r.id::text||'/'||s.sequence::text||'/'||pos::text||'/'||(expected->>'sha256');
 select * into part from public.proctor_recording_parts where recording_id=r.id and sequence=s.sequence and index=pos;
 if p_action='part.receipt' then
  if p_data->>'sha256' is distinct from expected->>'sha256' or (p_data->>'byte_length')::numeric is distinct from (expected->>'byte_length')::numeric or coalesce(p_data->>'iv','') !~ '^[a-f0-9]{24}$' or coalesce(p_data->>'cipher_sha256','') !~ '^[a-f0-9]{64}$' or coalesce(p_data->>'key_id','') !~ '^[-a-zA-Z0-9_]{1,80}$' or length(coalesce(p_data->>'etag','')) not between 1 and 200 then raise exception 'invalid_recording_receipt' using errcode='22023';end if;
  if part.recording_id is not null then
   if (part.iv,part.key_id,part.etag,part.cipher_sha256) is distinct from (p_data->>'iv',p_data->>'key_id',p_data->>'etag',p_data->>'cipher_sha256') then raise exception 'recording_receipt_conflict' using errcode='23505';end if;
  else
   if s.state<>'reserved' then raise exception 'recording_not_reserved' using errcode='23514';end if;
   insert into public.proctor_recording_parts(tenant_id,recording_id,sequence,index,sha256,byte_length,cipher_sha256,iv,key_id,object_key,etag) values(p_tenant,r.id,s.sequence,pos,expected->>'sha256',(expected->>'byte_length')::integer,p_data->>'cipher_sha256',p_data->>'iv',p_data->>'key_id',key,p_data->>'etag') returning * into part;
  end if;
 elsif p_action<>'part.authorize' then raise exception 'unknown_recording_transport' using errcode='22023';end if;
 return jsonb_build_object('tenant_id',p_tenant,'recording_id',r.id,'sequence',s.sequence,'index',pos,'sha256',expected->>'sha256','byte_length',expected->'byte_length','segment_sha256',s.sha256,'segment_bytes',s.byte_length,'part_count',jsonb_array_length(s.expected_parts),'receipt',case when part.recording_id is null then null else to_jsonb(part) end);
end; $$;
revoke all on function public.proctor_recording_candidate(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.proctor_recording_guard(),public.proctor_recording_segment_guard() from public,anon,authenticated;
revoke all on function public.proctor_recording_command(uuid,uuid,text,text,jsonb),public.proctor_recording_read(uuid,uuid,uuid,integer,integer),public.proctor_recording_transport(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.proctor_recording_command(uuid,uuid,text,text,jsonb),public.proctor_recording_read(uuid,uuid,uuid,integer,integer),public.proctor_recording_transport(uuid,uuid,text,jsonb) to service_role;
commit;
