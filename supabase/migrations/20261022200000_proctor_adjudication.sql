begin;
-- CASE-01/CASE-03: when independent reviewers disagree a senior proctor
-- manager who did not review the case decides it, and a resolved case can be
-- explained to the candidate in their own words. Neither changes answers or
-- scores; result release consumes integrity outcomes separately.

create table public.proctor_case_adjudications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  case_id uuid not null unique,
  adjudicator_id uuid not null references public.users(id),
  disposition text not null check (disposition in ('clear','confirmed','insufficient_evidence')),
  rationale text not null check (length(btrim(rationale)) between 10 and 10000),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (tenant_id,case_id) references public.proctor_review_cases(tenant_id,id)
);
create table public.proctor_case_disclosures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  case_id uuid not null unique,
  session_id uuid not null,
  candidate_id uuid not null references public.users(id),
  disposition text not null check (disposition in ('clear','confirmed','insufficient_evidence')),
  summary text not null check (length(btrim(summary)) between 10 and 4000),
  disclosed_by uuid not null references public.users(id),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (tenant_id,case_id) references public.proctor_review_cases(tenant_id,id),
  foreign key (tenant_id,session_id) references public.proctor_sessions(tenant_id,id)
);
create index proctor_case_disclosures_candidate on public.proctor_case_disclosures(candidate_id,created_at desc);
do $$ declare t text; begin
  foreach t in array array['proctor_case_adjudications','proctor_case_disclosures'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to service_role',t);
    execute format('create trigger immutable_record before update or delete on public.%I for each row execute function public.assessment_immutable()',t);
  end loop;
end $$;

alter function public.proctor_command(uuid,uuid,text,text,jsonb) rename to proctor_command_before_adjudication;
create function public.proctor_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.proctor_commands;request jsonb;result jsonb;review_case public.proctor_review_cases;s public.proctor_sessions;quorum integer;total integer;kinds integer;note text;rid uuid;
begin
 if p_action not in ('case.adjudicate','case.disclose') then
  return public.proctor_command_before_adjudication(p_actor,p_tenant,p_key,p_action,p_data);
 end if;
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'idempotency_key_required' using errcode='22023'; end if;
 request:=jsonb_build_object('action',p_action,'data',p_data);
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_actor::text||p_key,0));
 select * into prior from public.proctor_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
 if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505'; end if; return prior.result; end if;
 if not public.assessment_has_capability(p_tenant,p_actor,'proctor.manage') then raise exception 'forbidden' using errcode='42501'; end if;
 select * into review_case from public.proctor_review_cases where tenant_id=p_tenant and id=(p_data->>'case_id')::uuid for update;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 select * into s from public.proctor_sessions where id=review_case.session_id;
 if p_action='case.adjudicate' then
  if review_case.state='resolved' then raise exception 'case_resolved' using errcode='23514'; end if;
  quorum:=coalesce((s.policy_snapshot->>'reviewer_quorum')::integer,2);
  select count(*),count(distinct disposition) into total,kinds from public.proctor_case_findings where case_id=review_case.id;
  -- Only a real disagreement after the full quorum reported goes to a senior decision.
  if total<quorum or kinds<2 then raise exception 'adjudication_not_needed' using errcode='23514'; end if;
  if exists(select 1 from public.proctor_case_findings where case_id=review_case.id and reviewer_id=p_actor) then raise exception 'adjudicator_must_be_independent' using errcode='23514'; end if;
  if p_data->>'disposition' not in ('clear','confirmed','insufficient_evidence') then raise exception 'invalid_disposition' using errcode='22023'; end if;
  note:=btrim(p_data->>'rationale');
  if note is null or length(note) not between 10 and 10000 then raise exception 'rationale_required' using errcode='22023'; end if;
  insert into public.proctor_case_adjudications(tenant_id,case_id,adjudicator_id,disposition,rationale) values(p_tenant,review_case.id,p_actor,p_data->>'disposition',note) returning id into rid;
  update public.proctor_review_cases set state='resolved',disposition=p_data->>'disposition',resolved_at=clock_timestamp() where id=review_case.id;
  result:=jsonb_build_object('id',rid,'case_id',review_case.id,'disposition',p_data->>'disposition','state','resolved');
 else
  if review_case.state<>'resolved' then raise exception 'case_not_resolved' using errcode='23514'; end if;
  note:=btrim(p_data->>'summary');
  if note is null or length(note) not between 10 and 4000 then raise exception 'summary_required' using errcode='22023'; end if;
  if exists(select 1 from public.proctor_case_disclosures where case_id=review_case.id) then raise exception 'already_disclosed' using errcode='23505'; end if;
  insert into public.proctor_case_disclosures(tenant_id,case_id,session_id,candidate_id,disposition,summary,disclosed_by)
  values(p_tenant,review_case.id,s.id,s.candidate_id,review_case.disposition,note,p_actor) returning id into rid;
  result:=jsonb_build_object('id',rid,'case_id',review_case.id,'disposition',review_case.disposition);
 end if;
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'proctor.'||p_action,review_case.id,jsonb_build_object('disposition',result->>'disposition'));
 insert into public.proctor_commands values(p_tenant,p_actor,p_key,request,result,clock_timestamp());
 return result;
end;$$;

-- What the candidate may see: only disclosed outcomes of their own sessions.
create function public.proctor_candidate_outcomes(p_actor uuid,p_tenant uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'disposition',d.disposition,'summary',d.summary,'disclosed_at',d.created_at,'sitting',w.title) order by d.created_at desc),'[]')
 from public.proctor_case_disclosures d
 join public.proctor_sessions s on s.id=d.session_id
 join public.assessment_attempts a on a.id=s.attempt_id
 join public.assessment_registrations r on r.id=a.registration_id
 join public.assessment_exam_windows w on w.id=r.window_id
 where d.tenant_id=p_tenant and d.candidate_id=p_actor;
$$;
-- Staff read of a case's adjudication and disclosure, for the case panel.
create function public.proctor_case_outcome(p_actor uuid,p_tenant uuid,p_case uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c public.proctor_review_cases;
begin
 select * into c from public.proctor_review_cases where tenant_id=p_tenant and id=p_case;
 if not found or not public.proctor_can_access(p_tenant,c.session_id,p_actor) then raise exception 'not_found' using errcode='P0002'; end if;
 return jsonb_build_object(
  'adjudication',(select jsonb_build_object('disposition',disposition,'rationale',rationale,'adjudicator_id',adjudicator_id,'created_at',created_at) from public.proctor_case_adjudications where case_id=p_case),
  'disclosure',(select jsonb_build_object('disposition',disposition,'summary',summary,'created_at',created_at) from public.proctor_case_disclosures where case_id=p_case));
end;$$;

revoke all on function public.proctor_command_before_adjudication(uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.proctor_command(uuid,uuid,text,text,jsonb),public.proctor_candidate_outcomes(uuid,uuid),public.proctor_case_outcome(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.proctor_command(uuid,uuid,text,text,jsonb),public.proctor_candidate_outcomes(uuid,uuid),public.proctor_case_outcome(uuid,uuid,uuid) to service_role;
commit;
