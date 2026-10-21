begin;
create table public.assessment_feedback_versions(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,window_id uuid not null,version integer not null check(version>0),
 level text not null check(level in('totals','sections','questions')),available_after timestamptz check(available_after is null or isfinite(available_after)),created_by uuid not null references public.users(id),reason text not null check(length(btrim(reason)) between 1 and 2000),created_at timestamptz not null default clock_timestamp(),
 unique(window_id,version),unique(tenant_id,window_id,id),foreign key(tenant_id,window_id) references public.assessment_exam_windows(tenant_id,id),check(level<>'totals' or available_after is null)
);
create table public.assessment_feedback_approvals(version_id uuid primary key references public.assessment_feedback_versions(id),approved_by uuid not null references public.users(id),review_hash text not null,created_at timestamptz not null default clock_timestamp());
create table public.assessment_feedback_settings(tenant_id uuid not null,window_id uuid primary key,revision integer not null default 0,last_version integer not null default 0,active_version_id uuid,foreign key(tenant_id,window_id) references public.assessment_exam_windows(tenant_id,id),foreign key(tenant_id,window_id,active_version_id) references public.assessment_feedback_versions(tenant_id,window_id,id));
alter table public.assessment_grading_releases add unique(tenant_id,id);
create table public.assessment_feedback_holds(tenant_id uuid not null,release_id uuid not null,revision integer not null check(revision>0),held boolean not null,reason text not null check(length(btrim(reason)) between 1 and 2000),actor_id uuid not null references public.users(id),created_at timestamptz not null default clock_timestamp(),primary key(release_id,revision),foreign key(tenant_id,release_id) references public.assessment_grading_releases(tenant_id,id));
create table public.assessment_feedback_commands(tenant_id uuid not null,actor_id uuid not null,idempotency_key text not null,request jsonb not null,result jsonb not null,primary key(tenant_id,actor_id,idempotency_key));
do $$ declare t text;begin foreach t in array array['assessment_feedback_versions','assessment_feedback_approvals','assessment_feedback_settings','assessment_feedback_holds','assessment_feedback_commands'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);if t<>'assessment_feedback_settings' then execute format('create trigger immutable_record before update or delete on public.%I for each row execute function public.assessment_immutable()',t);end if;end loop;end;$$;
create function public.assessment_feedback_current(p_tenant uuid,p_window uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('schema_version','assessment.feedback.v1','window_id',w.id,'revision',coalesce(s.revision,0),'level',coalesce(v.level,'totals'),'version_id',v.id,'version',v.version,'available_after',v.available_after) from public.assessment_exam_windows w left join public.assessment_feedback_settings s on s.window_id=w.id left join public.assessment_feedback_versions v on v.id=s.active_version_id and exists(select 1 from public.assessment_feedback_approvals a where a.version_id=v.id) where w.tenant_id=p_tenant and w.id=p_window;
$$;
create function public.assessment_feedback_version_hash(p_id uuid) returns text language sql stable security definer set search_path=public,pg_temp as $$select encode(sha256(convert_to(to_jsonb(v)::text,'UTF8')),'hex') from public.assessment_feedback_versions v where id=p_id;$$;
create function public.assessment_feedback_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.assessment_feedback_commands;settings public.assessment_feedback_settings;v public.assessment_feedback_versions;request jsonb;result jsonb;win uuid;rid uuid;revision integer;held boolean;
begin
 if p_key is null or length(p_key) not between 8 and 200 or p_action is null or p_action not in('policy.propose','policy.approve','policy.suspend','release.hold','release.resume') or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'invalid_feedback_command' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('assessment.staff:'||p_tenant::text,0));if not public.assessment_has_capability(p_tenant,p_actor,'results.release') then raise exception 'forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_actor::text||'feedback'||p_key,0));request:=jsonb_build_object('action',p_action,'data',p_data);select * into prior from public.assessment_feedback_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
 if p_action in('release.hold','release.resume') then
  rid:=(p_data->>'id')::uuid;perform 1 from public.assessment_grading_releases where tenant_id=p_tenant and id=rid;if not found then raise exception 'release_not_found' using errcode='P0002';end if;
  select h.revision,h.held into revision,held from public.assessment_feedback_holds h where h.release_id=rid order by h.revision desc limit 1;revision:=coalesce(revision,0);held:=coalesce(held,false);
  if p_data->>'expected_revision' is distinct from revision::text then raise exception 'feedback_revision_conflict' using errcode='23505';end if;
  if held=(p_action='release.hold') then raise exception 'feedback_hold_state_changed' using errcode='23514';end if;
  insert into public.assessment_feedback_holds values(p_tenant,rid,revision+1,p_action='release.hold',p_data->>'reason',p_actor,clock_timestamp());result:=jsonb_build_object('id',rid,'revision',revision+1);
 else
  if p_action='policy.approve' then select * into v from public.assessment_feedback_versions where tenant_id=p_tenant and id=(p_data->>'id')::uuid;if not found then raise exception 'feedback_version_not_found' using errcode='P0002';end if;win:=v.window_id;else win:=(p_data->>'window_id')::uuid;end if;
  perform 1 from public.assessment_exam_windows where tenant_id=p_tenant and id=win for share;if not found then raise exception 'sitting_not_found' using errcode='P0002';end if;
  insert into public.assessment_feedback_settings(tenant_id,window_id) values(p_tenant,win) on conflict do nothing;select * into settings from public.assessment_feedback_settings where window_id=win for update;
  if p_data->>'expected_revision' is distinct from settings.revision::text then raise exception 'feedback_revision_conflict' using errcode='23505';end if;
  if p_action='policy.propose' then
   insert into public.assessment_feedback_versions(tenant_id,window_id,version,level,available_after,created_by,reason) values(p_tenant,win,settings.last_version+1,p_data->>'level',(p_data->>'available_after')::timestamptz,p_actor,p_data->>'reason') returning id into rid;
   update public.assessment_feedback_settings s set revision=s.revision+1,last_version=s.last_version+1 where window_id=win;
  elsif p_action='policy.approve' then
   if v.created_by=p_actor then raise exception 'independent_feedback_approver_required' using errcode='42501';end if;
   if v.version<>settings.last_version or exists(select 1 from public.assessment_feedback_approvals where version_id=v.id) then raise exception 'feedback_version_changed' using errcode='23505';end if;
   if p_data->>'review_hash' is distinct from public.assessment_feedback_version_hash(v.id) then raise exception 'feedback_review_required' using errcode='23505';end if;
   insert into public.assessment_feedback_approvals values(v.id,p_actor,p_data->>'review_hash',clock_timestamp());update public.assessment_feedback_settings s set active_version_id=v.id,revision=s.revision+1 where window_id=win;rid:=v.id;
  else
   if settings.active_version_id is null then raise exception 'feedback_already_suspended' using errcode='23514';end if;
   if coalesce(length(btrim(p_data->>'reason')),0) not between 1 and 2000 then raise exception 'feedback_reason_required' using errcode='22023';end if;
   update public.assessment_feedback_settings s set active_version_id=null,revision=s.revision+1 where window_id=win;rid:=win;
  end if;result:=jsonb_build_object('id',rid,'window_id',win,'revision',settings.revision+1);
 end if;
 insert into public.assessment_feedback_commands values(p_tenant,p_actor,p_key,request,result);insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'feedback.'||p_action,rid,jsonb_build_object('window_id',win,'reason',p_data->>'reason'));return result;
end;$$;
alter table public.assessment_grading_releases add column feedback_snapshot jsonb not null default '{"schema_version":"assessment.feedback.v1","level":"totals","version_id":null,"available_at":null}'::jsonb;
create function public.assessment_feedback_pin() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$declare win uuid;policy jsonb;begin
 select g.window_id into win from public.assessment_grading_runs r join public.assessment_attempts a on a.id=r.attempt_id join public.assessment_registrations g on g.id=a.registration_id where r.id=new.run_id and r.tenant_id=new.tenant_id;
 perform pg_advisory_xact_lock(hashtextextended('assessment.staff:'||new.tenant_id::text,0));policy:=public.assessment_feedback_current(new.tenant_id,win);
 new.feedback_snapshot:=policy||jsonb_build_object('available_at',case when policy->>'level'<>'totals' then greatest(new.release_at,(policy->>'available_after')::timestamptz) else null end);return new;
end;$$;
create trigger feedback_pin before insert on public.assessment_grading_releases for each row execute function public.assessment_feedback_pin();
alter function public.assessment_grading_command(uuid,uuid,text,text,jsonb) rename to assessment_grading_command_pre_feedback;
create function public.assessment_grading_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare win uuid;policy jsonb;expected text;begin
 if p_action='grade.release' then
  perform pg_advisory_xact_lock(hashtextextended('assessment.staff:'||p_tenant::text,0));if not public.assessment_has_capability(p_tenant,p_actor,'results.release') then raise exception 'forbidden' using errcode='42501';end if;
  if not exists(select 1 from public.assessment_grading_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key) then
   select g.window_id into win from public.assessment_grading_runs r join public.assessment_attempts a on a.id=r.attempt_id join public.assessment_registrations g on g.id=a.registration_id where r.tenant_id=p_tenant and r.id=(p_data->>'run_id')::uuid;
   if win is null then raise exception 'not_found' using errcode='P0002';end if;policy:=public.assessment_feedback_current(p_tenant,win);expected:=encode(sha256(convert_to(policy::text,'UTF8')),'hex');
   if (policy->>'level'<>'totals' or p_data ? 'feedback_review_hash') and p_data->>'feedback_review_hash' is distinct from expected then raise exception 'feedback_release_review_required' using errcode='23505';end if;
  end if;
 end if;return public.assessment_grading_command_pre_feedback(p_actor,p_tenant,p_key,p_action,p_data);
end;$$;
create function public.assessment_feedback_read(p_actor uuid,p_tenant uuid,p_kind text,p_id uuid default null,p_after uuid default null,p_limit integer default 50) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare win uuid;settings public.assessment_feedback_settings;policy jsonb;rows jsonb;begin
 if not public.assessment_has_capability(p_tenant,p_actor,'results.release') then raise exception 'forbidden' using errcode='42501';end if;if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid_feedback_page' using errcode='22023';end if;
 if p_kind='sittings' then return(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from(select id,title from public.assessment_exam_windows where tenant_id=p_tenant and (p_after is null or id>p_after) order by id limit p_limit)t);end if;
 if p_kind='preview' then
  select g.window_id into win from public.assessment_grading_runs r join public.assessment_attempts a on a.id=r.attempt_id join public.assessment_registrations g on g.id=a.registration_id where r.tenant_id=p_tenant and r.id=p_id and r.status='approved' and a.candidate_id<>p_actor;if win is null then raise exception 'approved_release_not_found' using errcode='P0002';end if;
  policy:=public.assessment_feedback_current(p_tenant,win);return policy||jsonb_build_object('review_hash',encode(sha256(convert_to(policy::text,'UTF8')),'hex'));
 end if;
 if not exists(select 1 from public.assessment_exam_windows where tenant_id=p_tenant and id=p_id) then raise exception 'sitting_not_found' using errcode='P0002';end if;
 if p_kind='releases' then return(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from(select l.id,r.generation,l.release_at,l.feedback_snapshot,coalesce(h.held,false) held,coalesce(h.revision,0) revision from public.assessment_grading_releases l join public.assessment_grading_runs r on r.id=l.run_id join public.assessment_attempts a on a.id=r.attempt_id join public.assessment_registrations g on g.id=a.registration_id left join lateral(select * from public.assessment_feedback_holds where release_id=l.id order by revision desc limit 1)h on true where l.tenant_id=p_tenant and g.window_id=p_id and (p_after is null or l.id>p_after) order by l.id limit p_limit)t);end if;
 if p_kind<>'policy' then raise exception 'feedback_resource_not_found' using errcode='P0002';end if;
 select * into settings from public.assessment_feedback_settings where window_id=p_id;
 select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') into rows from(select v.*,public.assessment_feedback_version_hash(v.id) review_hash,(a.version_id is not null) approved,(a.version_id is null and v.created_by<>p_actor and v.version=settings.last_version) can_approve from public.assessment_feedback_versions v left join public.assessment_feedback_approvals a on a.version_id=v.id where v.tenant_id=p_tenant and v.window_id=p_id and (p_after is null or v.id>p_after) order by v.id limit p_limit)t;
 return jsonb_build_object('window_id',p_id,'revision',coalesce(settings.revision,0),'current',public.assessment_feedback_current(p_tenant,p_id),'versions',rows);
end;$$;
create or replace function public.assessment_released_breakdown(p_actor uuid,p_tenant uuid,p_attempt uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare released record;form jsonb;sections jsonb:='[]';policy jsonb;state text;held boolean;stamp timestamptz:=clock_timestamp();
begin
 select r.generation,l.id release_id,l.score_revision_id,l.release_at,l.feedback_snapshot,v.scores into released from public.assessment_attempts a join public.assessment_grading_runs r on r.attempt_id=a.id join public.assessment_grading_releases l on l.run_id=r.id join public.assessment_score_revisions v on v.id=l.score_revision_id where a.tenant_id=p_tenant and a.candidate_id=p_actor and a.id=p_attempt and l.release_at<=stamp order by r.generation desc limit 1;if not found then raise exception 'released_result_not_found' using errcode='P0002';end if;
 policy:=released.feedback_snapshot;select h.held into held from public.assessment_feedback_holds h where h.release_id=released.release_id order by revision desc limit 1;
 state:=case when coalesce(held,false) then 'withheld' when policy->>'level'='totals' then 'totals_only' when (policy->>'available_at')::timestamptz>stamp then 'pending' else 'available' end;
 if state='available' then
  select f.manifest into form from public.assessment_attempts a join public.assessment_forms f on f.id=a.form_id where a.id=p_attempt;
  select jsonb_agg(jsonb_build_object('title',section->>'title','position',position,'total',(select sum((score->>'score')::numeric) from jsonb_array_elements(released.scores)score where exists(select 1 from jsonb_array_elements(section->'items')i where i->>'item_version_id'=score->>'item_version_id')),'max_score',(select sum((score->>'max_score')::numeric) from jsonb_array_elements(released.scores)score where exists(select 1 from jsonb_array_elements(section->'items')i where i->>'item_version_id'=score->>'item_version_id')),'questions',case when policy->>'level'='questions' then (select jsonb_agg(jsonb_build_object('position',n,'score',score->'score','max_score',score->'max_score') order by n) from jsonb_array_elements(section->'items') with ordinality items(i,n) join lateral(select value score from jsonb_array_elements(released.scores) where value->>'item_version_id'=i->>'item_version_id')sc on true) else '[]'::jsonb end) order by position) into sections from jsonb_array_elements(form->'sections') with ordinality parts(section,position);
 end if;
 return jsonb_build_object('attempt_id',p_attempt,'generation',released.generation,'score_revision_id',released.score_revision_id,'released_at',released.release_at,'detail_level',policy->>'level','feedback_status',state,'available_at',policy->'available_at','sections',coalesce(sections,'[]'));
end;$$;
revoke all on function public.assessment_feedback_current(uuid,uuid),public.assessment_feedback_version_hash(uuid),public.assessment_feedback_command(uuid,uuid,text,text,jsonb),public.assessment_feedback_pin(),public.assessment_feedback_read(uuid,uuid,text,uuid,uuid,integer),public.assessment_grading_command_pre_feedback(uuid,uuid,text,text,jsonb),public.assessment_grading_command(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.assessment_grading_command_pre_feedback(uuid,uuid,text,text,jsonb) from service_role;
grant execute on function public.assessment_feedback_command(uuid,uuid,text,text,jsonb),public.assessment_feedback_read(uuid,uuid,text,uuid,uuid,integer),public.assessment_grading_command(uuid,uuid,text,text,jsonb) to service_role;
commit;
