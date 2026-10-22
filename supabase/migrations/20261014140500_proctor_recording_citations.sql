begin;
alter table public.proctor_case_findings add constraint proctor_findings_tenant_case unique(tenant_id,id,case_id);
alter table public.proctor_review_cases add constraint proctor_cases_session_binding unique(tenant_id,id,session_id);
alter table public.proctor_recordings add constraint proctor_recordings_session_binding unique(tenant_id,id,session_id);
create table public.proctor_recording_citations (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,session_id uuid not null,finding_id uuid not null,case_id uuid not null,recording_id uuid not null,
 from_sequence integer not null check(from_sequence between 1 and 100000),to_sequence integer not null check(to_sequence between from_sequence and 100000),
 recording_head_hash text not null check(recording_head_hash ~ '^[a-f0-9]{64}$'),from_chain_hash text not null check(from_chain_hash ~ '^[a-f0-9]{64}$'),to_chain_hash text not null check(to_chain_hash ~ '^[a-f0-9]{64}$'),
 start_ms integer not null check(start_ms>=0),end_ms integer not null check(end_ms>start_ms and end_ms<=86400000),media_count integer not null check(media_count>=0),gap_count integer not null check(gap_count>=0),
 source text not null check(source in ('camera','screen','microphone')),provenance text not null check(provenance='browser_reported'),created_at timestamptz not null default clock_timestamp(),
 check(media_count+gap_count=to_sequence-from_sequence+1),
 unique(finding_id,recording_id,from_sequence,to_sequence),
 foreign key(tenant_id,finding_id,case_id) references public.proctor_case_findings(tenant_id,id,case_id),
 foreign key(tenant_id,case_id,session_id) references public.proctor_review_cases(tenant_id,id,session_id),
 foreign key(tenant_id,recording_id,session_id) references public.proctor_recordings(tenant_id,id,session_id),
 foreign key(recording_id,from_sequence) references public.proctor_recording_segments(recording_id,sequence),
 foreign key(recording_id,to_sequence) references public.proctor_recording_segments(recording_id,sequence)
);
create index proctor_citations_case on public.proctor_recording_citations(tenant_id,case_id,finding_id);
alter table public.proctor_recording_citations enable row level security;
revoke all on public.proctor_recording_citations from anon,authenticated;
grant all on public.proctor_recording_citations to service_role;
create trigger immutable_record before update or delete on public.proctor_recording_citations for each row execute function public.assessment_immutable();

-- Preserve the existing public command contract and its receipt namespace.
alter function public.proctor_command(uuid,uuid,text,text,jsonb) rename to proctor_without_recording_citations;
revoke all on function public.proctor_without_recording_citations(uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
create function public.proctor_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.proctor_review_cases;r public.proctor_recordings;prior public.proctor_commands;refs jsonb;entry jsonb;normalized jsonb;request jsonb;result jsonb;first public.proctor_recording_segments;last public.proctor_recording_segments;from_seq integer;to_seq integer;media integer;gaps integer;total integer;
begin
 if p_action<>'case.finding' then return public.proctor_without_recording_citations(p_actor,p_tenant,p_key,p_action,p_data);end if;
 if p_actor is null or not exists(select 1 from public.users where id=p_actor) then raise exception 'unauthorized' using errcode='42501';end if;
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'idempotency_key_required' using errcode='22023';end if;
 refs:=coalesce(p_data->'evidence_recording_refs','[]'::jsonb);
 if jsonb_typeof(refs) is distinct from 'array' or jsonb_array_length(refs)>25 then raise exception 'invalid_recording_citations' using errcode='22023';end if;
 for entry in select value from jsonb_array_elements(refs) loop
  if jsonb_typeof(entry->'recording_id') is distinct from 'string' or jsonb_typeof(entry->'from_sequence') is distinct from 'number' or jsonb_typeof(entry->'to_sequence') is distinct from 'number' or (entry->>'from_sequence')::numeric<>trunc((entry->>'from_sequence')::numeric) or (entry->>'to_sequence')::numeric<>trunc((entry->>'to_sequence')::numeric) or (entry->>'from_sequence')::numeric not between 1 and 100000 or (entry->>'to_sequence')::numeric not between (entry->>'from_sequence')::numeric and 100000 or coalesce(entry->>'head_hash','') !~ '^[a-f0-9]{64}$' then raise exception 'invalid_recording_citation' using errcode='22023';end if;
 end loop;
 select coalesce(jsonb_agg(row order by row->>'recording_id',(row->>'from_sequence')::integer,(row->>'to_sequence')::integer,row->>'head_hash'),'[]') into refs from (select distinct jsonb_build_object('recording_id',(value->>'recording_id')::uuid,'from_sequence',(value->>'from_sequence')::integer,'to_sequence',(value->>'to_sequence')::integer,'head_hash',value->>'head_hash') as row from jsonb_array_elements(refs)) sorted;
 normalized:=p_data-'evidence_recording_refs';if jsonb_array_length(refs)>0 then normalized:=normalized||jsonb_build_object('evidence_recording_refs',refs);end if;
 request:=jsonb_build_object('action',p_action,'data',normalized);
 -- Match the legacy command's advisory -> case lock order. Recording locks are sorted.
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_actor::text||'proctor'||p_key,0));
 select * into c from public.proctor_review_cases where tenant_id=p_tenant and id=(normalized->>'case_id')::uuid for update;
 if not found then raise exception 'not_found' using errcode='P0002';end if;
 if not public.assessment_has_capability(p_tenant,p_actor,'proctor.review') or not public.proctor_can_access(p_tenant,c.session_id,p_actor,'reviewer') then raise exception 'review_assignment_required' using errcode='42501';end if;
 select * into prior from public.proctor_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
 if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
 for entry in select value from jsonb_array_elements(refs) loop
  select * into r from public.proctor_recordings where tenant_id=p_tenant and id=(entry->>'recording_id')::uuid for update;
  if not found or r.session_id<>c.session_id then raise exception 'foreign_recording_evidence' using errcode='23514';end if;
  if r.state<>'sealed' or r.expires_at<=clock_timestamp() then raise exception 'recording_evidence_not_available' using errcode='23514';end if;
  if r.head_hash<>entry->>'head_hash' then raise exception 'recording_evidence_head_conflict' using errcode='23505';end if;
  from_seq:=(entry->>'from_sequence')::integer;to_seq:=(entry->>'to_sequence')::integer;
  select count(*),count(*) filter(where kind='media'),count(*) filter(where kind='gap') into total,media,gaps from public.proctor_recording_segments where recording_id=r.id and sequence between from_seq and to_seq and state='committed';
  if total<>to_seq-from_seq+1 then raise exception 'recording_evidence_interval_incomplete' using errcode='23514';end if;
 end loop;
 -- Recheck effective reviewer authority after any recording lock wait.
 if not public.assessment_has_capability(p_tenant,p_actor,'proctor.review') or not public.proctor_can_access(p_tenant,c.session_id,p_actor,'reviewer') then raise exception 'review_assignment_required' using errcode='42501';end if;
 result:=public.proctor_without_recording_citations(p_actor,p_tenant,p_key,p_action,normalized);
 for entry in select value from jsonb_array_elements(refs) loop
  select * into r from public.proctor_recordings where id=(entry->>'recording_id')::uuid;
  from_seq:=(entry->>'from_sequence')::integer;to_seq:=(entry->>'to_sequence')::integer;
  select * into first from public.proctor_recording_segments where recording_id=r.id and sequence=from_seq;
  select * into last from public.proctor_recording_segments where recording_id=r.id and sequence=to_seq;
  select count(*) filter(where kind='media'),count(*) filter(where kind='gap') into media,gaps from public.proctor_recording_segments where recording_id=r.id and sequence between from_seq and to_seq;
  insert into public.proctor_recording_citations(tenant_id,session_id,finding_id,case_id,recording_id,from_sequence,to_sequence,recording_head_hash,from_chain_hash,to_chain_hash,start_ms,end_ms,media_count,gap_count,source,provenance) values(p_tenant,c.session_id,(result->>'id')::uuid,c.id,r.id,from_seq,to_seq,r.head_hash,first.chain_hash,last.chain_hash,first.start_ms,last.end_ms,media,gaps,r.source,r.provenance);
 end loop;
 if jsonb_array_length(refs)>0 then insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'proctor.recording.cited',(result->>'id')::uuid,jsonb_build_object('case_id',c.id,'references',refs));end if;
 return result;
end; $$;
revoke all on function public.proctor_command(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.proctor_command(uuid,uuid,text,text,jsonb) to service_role;
commit;
