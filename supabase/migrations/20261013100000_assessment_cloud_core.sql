-- Assessment Cloud: additive domain layer. No Academy table or existing policy is replaced.
begin;

create table public.assessment_capability_grants (
  tenant_id uuid not null references public.tenants(id),
  user_id uuid not null references public.users(id),
  capability text not null check (capability in ('banks.read','items.write','items.approve','assessments.publish','exams.manage','grades.manage','results.read','audit.read','proctor.manage','proctor.review')),
  granted_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  primary key (tenant_id,user_id,capability)
);
create or replace function public.assessment_has_capability(p_tenant uuid,p_user uuid,p_capability text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists (select 1 from public.tenant_memberships m
    where m.tenant_id=p_tenant and m.user_id=p_user and m.status='active'
      and (m.role in ('owner','admin') or exists (
        select 1 from public.assessment_capability_grants g
        where g.tenant_id=p_tenant and g.user_id=p_user and g.capability=p_capability)));
$$;

create table public.assessment_item_banks (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  title text not null check (length(title) between 1 and 200),
  created_by uuid not null references public.users(id), created_at timestamptz not null default now(),
  unique (tenant_id,id)
);
create table public.assessment_rubrics (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  title text not null, criteria jsonb not null check (jsonb_typeof(criteria)='array'),
  created_by uuid not null references public.users(id), created_at timestamptz not null default now(),
  unique (tenant_id,id)
);
create table public.assessment_items (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  bank_id uuid not null, created_by uuid not null references public.users(id), created_at timestamptz not null default now(),
  unique (tenant_id,id), foreign key (tenant_id,bank_id) references public.assessment_item_banks(tenant_id,id)
);
create table public.assessment_item_versions (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  item_id uuid not null, version integer not null check (version>0),
  payload jsonb not null check (payload->>'schema_version'='assessment.item.v1'),
  status text not null default 'draft' check (status in ('draft','review','approved','retired')),
  created_by uuid not null references public.users(id), approved_by uuid references public.users(id),
  approved_at timestamptz, created_at timestamptz not null default now(),
  unique (tenant_id,id), unique (item_id,version),
  foreign key (tenant_id,item_id) references public.assessment_items(tenant_id,id),
  check (status<>'approved' or (approved_by is not null and approved_at is not null)),
  check (approved_by is null or approved_by<>created_by)
);
-- Keys never appear in an authenticated SQL select or candidate manifest.
create table public.assessment_item_keys (
  tenant_id uuid not null, item_version_id uuid primary key, key jsonb not null,
  foreign key (tenant_id,item_version_id) references public.assessment_item_versions(tenant_id,id)
);
create table public.assessment_definitions (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  title text not null, definition jsonb not null check (definition->>'schema_version'='assessment.definition.v1'),
  revision integer not null default 1,
  created_by uuid not null references public.users(id), created_at timestamptz not null default now(),
  unique (tenant_id,id)
);
create table public.assessment_versions (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  assessment_id uuid not null, version integer not null,
  definition jsonb not null, experience_id uuid not null references public.experiences(id),
  published_by uuid not null references public.users(id), created_at timestamptz not null default now(),
  unique (tenant_id,id), unique (assessment_id,version), unique (experience_id),
  foreign key (tenant_id,assessment_id) references public.assessment_definitions(tenant_id,id)
);
create table public.assessment_runtime_items (
  tenant_id uuid not null, assessment_version_id uuid not null, item_version_id uuid not null,
  content_unit_id uuid not null references public.content_units(id),
  section_key uuid not null, runtime_section_id uuid not null references public.sections(id),
  primary key (assessment_version_id,item_version_id),
  foreign key (tenant_id,assessment_version_id) references public.assessment_versions(tenant_id,id),
  foreign key (tenant_id,item_version_id) references public.assessment_item_versions(tenant_id,id)
);
create table public.assessment_exam_windows (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  assessment_version_id uuid not null, title text not null,
  opens_at timestamptz not null, closes_at timestamptz not null,
  required_services text[] not null default '{}',
  created_by uuid not null references public.users(id), created_at timestamptz not null default now(),
  unique (tenant_id,id), check (closes_at>opens_at),
  foreign key (tenant_id,assessment_version_id) references public.assessment_versions(tenant_id,id)
);
create table public.assessment_registrations (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  window_id uuid not null, candidate_id uuid not null references public.users(id),
  extra_seconds integer not null default 0 check (extra_seconds between 0 and 86400),
  created_by uuid not null references public.users(id), created_at timestamptz not null default now(),
  unique (tenant_id,id), unique (window_id,candidate_id),
  foreign key (tenant_id,window_id) references public.assessment_exam_windows(tenant_id,id)
);
create table public.assessment_forms (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  assessment_version_id uuid not null, manifest jsonb not null,
  manifest_hash text not null check (manifest_hash ~ '^[0-9a-f]{64}$'), created_at timestamptz not null default now(),
  unique (tenant_id,id), foreign key (tenant_id,assessment_version_id) references public.assessment_versions(tenant_id,id)
);
create table public.assessment_attempts (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  registration_id uuid not null unique, candidate_id uuid not null references public.users(id),
  form_id uuid not null, session_id uuid not null unique references public.sessions(id),
  state text not null default 'active' check (state in ('active','paused','submitted','expired')),
  required_services text[] not null default '{}',
  starts_at timestamptz not null default clock_timestamp(), deadline_at timestamptz not null,
  section_index integer not null default 0 check (section_index>=0), section_deadline_at timestamptz not null,
  last_sequence integer not null default 0, submitted_at timestamptz,
  unique (tenant_id,id), foreign key (tenant_id,registration_id) references public.assessment_registrations(tenant_id,id),
  foreign key (tenant_id,form_id) references public.assessment_forms(tenant_id,id)
);
create table public.assessment_response_journal (
  tenant_id uuid not null, attempt_id uuid not null, sequence integer not null check (sequence>0),
  item_version_id uuid not null, response jsonb not null, payload_hash text not null,
  response_id uuid not null references public.responses(id), received_at timestamptz not null default clock_timestamp(),
  primary key (attempt_id,sequence),
  foreign key (tenant_id,attempt_id) references public.assessment_attempts(tenant_id,id),
  foreign key (tenant_id,item_version_id) references public.assessment_item_versions(tenant_id,id)
);
create table public.assessment_score_revisions (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, attempt_id uuid not null,
  scores jsonb not null, status text not null check (status in ('needs_human','approved')),
  source text not null check (source in ('deterministic','human','ai_suggestion')),
  approved_by uuid references public.users(id), created_at timestamptz not null default now(),
  foreign key (tenant_id,attempt_id) references public.assessment_attempts(tenant_id,id),
  check (source<>'ai_suggestion' or status='needs_human'),
  check (status<>'approved' or source='deterministic' or approved_by is not null)
);
create table public.assessment_audit_events (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  actor_id uuid not null references public.users(id), action text not null,
  target_id uuid, details jsonb not null default '{}', created_at timestamptz not null default clock_timestamp()
);
create table public.assessment_commands (
  tenant_id uuid not null, actor_id uuid not null references public.users(id),
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  request jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
  primary key (tenant_id,actor_id,idempotency_key)
);
alter table public.sessions add column assessment_version_id uuid references public.assessment_versions(id),
  add column assessment_form_id uuid references public.assessment_forms(id),
  add column assessment_manifest_hash text;

create index assessment_banks_tenant on public.assessment_item_banks(tenant_id,created_at desc);
create index assessment_item_versions_tenant on public.assessment_item_versions(tenant_id,status,created_at desc);
create index assessment_definitions_tenant on public.assessment_definitions(tenant_id,created_at desc);
create index assessment_windows_tenant on public.assessment_exam_windows(tenant_id,opens_at);
create index assessment_registrations_candidate on public.assessment_registrations(candidate_id,window_id);
create index assessment_attempts_candidate on public.assessment_attempts(candidate_id,state);
create index assessment_audit_tenant on public.assessment_audit_events(tenant_id,created_at desc);

create function public.assessment_immutable() returns trigger language plpgsql as $$
begin raise exception 'immutable_record' using errcode='23514'; end; $$;
create function public.assessment_attempt_binding_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if (new.id,new.tenant_id,new.registration_id,new.candidate_id,new.form_id,new.session_id,new.starts_at,new.required_services)
  is distinct from (old.id,old.tenant_id,old.registration_id,old.candidate_id,old.form_id,old.session_id,old.starts_at,old.required_services) then raise exception 'immutable_attempt_binding' using errcode='23514';end if;
 return new;
end; $$;
create trigger assessment_attempt_binding_guard before update on public.assessment_attempts for each row execute function public.assessment_attempt_binding_guard();
create function public.assessment_window_services_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.required_services is distinct from old.required_services and exists(select 1 from public.assessment_registrations r join public.assessment_attempts a on a.registration_id=r.id where r.window_id=old.id) then raise exception 'immutable_delivery_dependencies' using errcode='23514';end if;
 return new;
end; $$;
create trigger assessment_window_services_guard before update on public.assessment_exam_windows for each row execute function public.assessment_window_services_guard();
create function public.assessment_item_version_guard() returns trigger language plpgsql as $$
begin
  if tg_op='DELETE' then raise exception 'immutable_item_version' using errcode='23514'; end if;
  if (to_jsonb(new)-array['status','approved_by','approved_at'])<>(to_jsonb(old)-array['status','approved_by','approved_at']) then
    raise exception 'immutable_item_payload' using errcode='23514';
  end if;
  if not ((old.status='draft' and new.status='review') or (old.status='review' and new.status='approved') or (old.status='approved' and new.status='retired')) then
    raise exception 'invalid_item_transition' using errcode='23514';
  end if;
  if old.approved_by is not null and (old.approved_by<>new.approved_by or old.approved_at<>new.approved_at) then
    raise exception 'immutable_approval' using errcode='23514';
  end if;
  return new;
end; $$;
create trigger assessment_item_version_guard before update or delete on public.assessment_item_versions for each row execute function public.assessment_item_version_guard();
do $$ declare t text; begin
  foreach t in array array['assessment_versions','assessment_forms','assessment_item_keys','assessment_runtime_items','assessment_response_journal','assessment_score_revisions','assessment_audit_events'] loop
    execute format('create trigger immutable_record before update or delete on public.%I for each row execute function public.assessment_immutable()',t);
  end loop;
end; $$;

-- No client mutation grants. Sensitive keys/commands/journals have no authenticated policies.
do $$ declare t text; cap text; begin
  foreach t in array array['assessment_capability_grants','assessment_item_banks','assessment_rubrics','assessment_items','assessment_item_versions','assessment_definitions','assessment_versions','assessment_runtime_items','assessment_exam_windows','assessment_registrations','assessment_forms','assessment_attempts','assessment_response_journal','assessment_score_revisions','assessment_audit_events','assessment_commands','assessment_item_keys'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
  foreach t in array array['assessment_item_banks','assessment_rubrics','assessment_items','assessment_item_versions','assessment_definitions','assessment_versions','assessment_runtime_items','assessment_exam_windows','assessment_registrations','assessment_attempts','assessment_score_revisions','assessment_audit_events'] loop
    cap:=case when t='assessment_audit_events' then 'audit.read' when t in ('assessment_score_revisions','assessment_attempts') then 'results.read' when t in ('assessment_exam_windows','assessment_registrations') then 'exams.manage' else 'banks.read' end;
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy institution_select on public.%I for select to authenticated using (public.assessment_has_capability(tenant_id,auth.uid(),%L))',t,cap);
  end loop;
end; $$;

-- Every write is serialized, replay-safe and audited in the same transaction.
-- Only the authenticated Edge handler may call this service-role-only RPC.
create function public.assessment_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  prior public.assessment_commands; cap text; rid uuid; result jsonb;
  iv public.assessment_item_versions; def public.assessment_definitions; ver public.assessment_versions;
  win public.assessment_exam_windows; reg public.assessment_registrations; att public.assessment_attempts;
  old_response public.assessment_response_journal;
  product_id uuid; experience_id uuid; section_id uuid; part_id uuid; unit_id uuid; session_id uuid; form_id uuid;
  section jsonb; item_id_json jsonb; entry jsonb; payload jsonb; manifest jsonb;
  pos integer; item_pos integer; count_versions integer; request jsonb; deadline timestamptz; section_duration integer;
begin
  if p_key is null or length(p_key) not between 8 and 200 then raise exception 'idempotency_key_required' using errcode='22023'; end if;
  if p_actor is null or not exists(select 1 from public.users where id=p_actor) then raise exception 'unauthorized' using errcode='42501'; end if;
  request:=jsonb_build_object('action',p_action,'data',case when p_action='attempt.start' then jsonb_build_object('registration_id',p_data->'registration_id') else p_data end);
  perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_actor::text||p_key,0));
  select * into prior from public.assessment_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
  if found then
    if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505'; end if;
    return prior.result;
  end if;
  cap:=case p_action
    when 'bank.create' then 'items.write' when 'rubric.create' then 'items.write'
    when 'item.create' then 'items.write' when 'item.revise' then 'items.write' when 'item.submit' then 'items.write'
    when 'item.approve' then 'items.approve' when 'assessment.create' then 'items.write'
    when 'assessment.publish' then 'assessments.publish'
    when 'window.create' then 'exams.manage' when 'registration.create' then 'exams.manage'
    else null end;
  if cap is not null and not public.assessment_has_capability(p_tenant,p_actor,cap) then raise exception 'forbidden' using errcode='42501'; end if;
  case p_action
  when 'bank.create' then
    insert into public.assessment_item_banks(tenant_id,title,created_by) values(p_tenant,p_data->>'title',p_actor) returning id into rid;
  when 'rubric.create' then
    insert into public.assessment_rubrics(tenant_id,title,criteria,created_by) values(p_tenant,p_data->>'title',p_data->'criteria',p_actor) returning id into rid;
  when 'item.create','item.revise' then
    if p_action='item.create' then
      insert into public.assessment_items(tenant_id,bank_id,created_by) values(p_tenant,(p_data->>'bank_id')::uuid,p_actor) returning id into rid;
    else
      rid:=(p_data->>'item_id')::uuid;
      perform 1 from public.assessment_items where tenant_id=p_tenant and id=rid for update;
      if not found then raise exception 'not_found' using errcode='P0002'; end if;
    end if;
    if p_data->'item'->>'rubric_id' is not null and not exists(select 1 from public.assessment_rubrics where tenant_id=p_tenant and id=(p_data->'item'->>'rubric_id')::uuid) then raise exception 'invalid_rubric' using errcode='22023'; end if;
    insert into public.assessment_item_versions(tenant_id,item_id,version,payload,created_by)
      select p_tenant,rid,coalesce(max(version),0)+1,p_data->'item',p_actor from public.assessment_item_versions where item_id=rid returning * into iv;
    insert into public.assessment_item_keys values(p_tenant,iv.id,p_data->'key');
    result:=jsonb_build_object('id',iv.id,'item_id',rid,'version',iv.version); rid:=iv.id;
  when 'item.submit','item.approve' then
    rid:=(p_data->>'id')::uuid;
    select * into iv from public.assessment_item_versions where id=rid and tenant_id=p_tenant for update;
    if not found then raise exception 'not_found' using errcode='P0002'; end if;
    if p_action='item.submit' then
      if iv.status<>'draft' then raise exception 'invalid_item_transition' using errcode='23514'; end if;
      update public.assessment_item_versions set status='review' where id=rid;
    else
      if iv.created_by=p_actor then raise exception 'reviewer_must_differ_from_author' using errcode='23514'; end if;
      update public.assessment_item_versions set status='approved',approved_by=p_actor,approved_at=clock_timestamp() where id=rid;
    end if;
  when 'assessment.create' then
    insert into public.assessment_definitions(tenant_id,title,definition,created_by) values(p_tenant,p_data->'definition'->>'title',p_data->'definition',p_actor) returning id into rid;
  when 'assessment.publish' then
    select * into def from public.assessment_definitions where tenant_id=p_tenant and id=(p_data->>'id')::uuid for update;
    if not found then raise exception 'not_found' using errcode='P0002'; end if;
    if def.revision<>(p_data->>'revision')::integer then raise exception 'revision_conflict' using errcode='23505'; end if;
    if exists(select 1 from jsonb_array_elements(def.definition->'sections') s,
      jsonb_array_elements_text(s->'item_version_ids') ids
      left join public.assessment_item_versions i on i.id=ids::uuid and i.tenant_id=p_tenant
      where i.id is null or i.status<>'approved') then raise exception 'unapproved_or_foreign_item' using errcode='23514'; end if;
    -- Canonical adapters stay out of the public product catalog until legacy clients
    -- understand institution-owned manifests. Assessment Cloud uses its own scoped API.
    insert into public.products(name,type,status,metadata) values(def.title,'exam','draft',jsonb_build_object('slug','assessment-cloud-'||def.id,'tenant_id',p_tenant,'visibility','institution')) returning id into product_id;
    insert into public.experiences(product_id,name,is_active,metadata) values(product_id,def.title,false,jsonb_build_object('assessment_cloud',true,'tenant_id',p_tenant)) returning id into experience_id;
    select coalesce(max(version),0)+1 into count_versions from public.assessment_versions where assessment_id=def.id;
    insert into public.assessment_versions(tenant_id,assessment_id,version,definition,experience_id,published_by)
      values(p_tenant,def.id,count_versions,def.definition,experience_id,p_actor) returning * into ver;
    pos:=0;
    for section in select value from jsonb_array_elements(def.definition->'sections') loop
      pos:=pos+1;
      insert into public.sections(experience_id,name,display_order,metadata) values(experience_id,section->>'title',pos,jsonb_build_object('type','general','assessment_section_key',section->>'id')) returning id into section_id;
      insert into public.parts(section_id,name,display_order) values(section_id,section->>'title',1) returning id into part_id;
      item_pos:=0;
      for item_id_json in select value from jsonb_array_elements(section->'item_version_ids') loop
        select * into iv from public.assessment_item_versions where id=(item_id_json#>>'{}')::uuid and tenant_id=p_tenant;
        item_pos:=item_pos+1;
        insert into public.content_units(part_id,type,data,display_order,metadata) values(part_id,'assessment_'||(iv.payload->>'type'),iv.payload,item_pos,jsonb_build_object('assessment_item_version_id',iv.id)) returning id into unit_id;
        insert into public.answer_keys(content_unit_id,correct) select unit_id,key from public.assessment_item_keys where item_version_id=iv.id;
        insert into public.assessment_runtime_items values(p_tenant,ver.id,iv.id,unit_id,(section->>'id')::uuid,section_id);
      end loop;
    end loop;
    rid:=ver.id;
    result:=jsonb_build_object('id',rid,'version',ver.version,'experience_id',experience_id);
  when 'window.create' then
    insert into public.assessment_exam_windows(tenant_id,assessment_version_id,title,opens_at,closes_at,created_by)
    values(p_tenant,(p_data->>'assessment_version_id')::uuid,p_data->>'title',(p_data->>'opens_at')::timestamptz,(p_data->>'closes_at')::timestamptz,p_actor) returning id into rid;
  when 'registration.create' then
    insert into public.assessment_registrations(tenant_id,window_id,candidate_id,extra_seconds,created_by)
    values(p_tenant,(p_data->>'window_id')::uuid,(p_data->>'candidate_id')::uuid,coalesce((p_data->>'extra_seconds')::integer,0),p_actor) returning id into rid;
  when 'attempt.start' then
    select * into reg from public.assessment_registrations where id=(p_data->>'registration_id')::uuid and tenant_id=p_tenant and candidate_id=p_actor for update;
    if not found then raise exception 'not_found' using errcode='P0002'; end if;
    select * into att from public.assessment_attempts where registration_id=reg.id;
    if found then return jsonb_build_object('id',att.id,'session_id',att.session_id,'reused',true); end if;
    select * into win from public.assessment_exam_windows where id=reg.window_id;
    if clock_timestamp()<win.opens_at or clock_timestamp()>=win.closes_at then raise exception 'window_closed' using errcode='23514'; end if;
    select * into ver from public.assessment_versions where id=win.assessment_version_id;
    manifest:=p_data->'manifest';
    if manifest->>'assessment_version_id'<>ver.id::text or (manifest->>'duration_seconds')::integer<>(ver.definition->>'duration_seconds')::integer then raise exception 'invalid_manifest' using errcode='23514'; end if;
    if exists(select 1 from jsonb_array_elements(manifest->'sections') s,jsonb_array_elements(s->'items') i
      where not exists(select 1 from public.assessment_runtime_items ri where ri.assessment_version_id=ver.id and ri.section_key=(s->>'id')::uuid and ri.item_version_id=(i->>'item_version_id')::uuid)) then raise exception 'foreign_form_item' using errcode='23514'; end if;
    insert into public.assessment_forms(tenant_id,assessment_version_id,manifest,manifest_hash) values(p_tenant,ver.id,manifest,p_data->>'manifest_hash') returning id into form_id;
    insert into public.sessions(user_id,experience_id,status,started_at,assessment_version_id,assessment_form_id,assessment_manifest_hash)
      values(p_actor,ver.experience_id,'active',clock_timestamp(),ver.id,form_id,p_data->>'manifest_hash') returning id into session_id;
    deadline:=least(win.closes_at,clock_timestamp()+make_interval(secs=>(ver.definition->>'duration_seconds')::integer+reg.extra_seconds));
    section_duration:=coalesce((manifest->'sections'->0->>'duration_seconds')::integer,(ver.definition->>'duration_seconds')::integer);
    section_duration:=section_duration+floor(reg.extra_seconds*section_duration::numeric/(ver.definition->>'duration_seconds')::integer)::integer;
    insert into public.assessment_attempts(tenant_id,registration_id,candidate_id,form_id,session_id,deadline_at,section_deadline_at,required_services)
      values(p_tenant,reg.id,p_actor,form_id,session_id,deadline,least(deadline,clock_timestamp()+make_interval(secs=>section_duration)),win.required_services) returning id into rid;
    result:=jsonb_build_object('id',rid,'session_id',session_id);
  when 'response.append','attempt.submit','section.advance' then
    select * into att from public.assessment_attempts where id=(p_data->>'attempt_id')::uuid and tenant_id=p_tenant and candidate_id=p_actor for update;
    if not found then raise exception 'not_found' using errcode='P0002'; end if;
    if p_action='response.append' then
      select * into old_response from public.assessment_response_journal where attempt_id=att.id and sequence=(p_data->>'sequence')::integer;
      if found then
        if old_response.payload_hash<>p_data->>'payload_hash' then raise exception 'sequence_conflict' using errcode='23505'; end if;
        return jsonb_build_object('id',old_response.response_id,'sequence',old_response.sequence,'replayed',true);
      end if;
      if att.state<>'active' or clock_timestamp()>=att.deadline_at or clock_timestamp()>=att.section_deadline_at then raise exception 'attempt_not_active' using errcode='23514'; end if;
      if (p_data->>'sequence')::integer<>att.last_sequence+1 then raise exception 'sequence_gap' using errcode='23505'; end if;
      select f.manifest into manifest from public.assessment_forms f where f.id=att.form_id;
      if not exists(select 1 from jsonb_array_elements(manifest->'sections'->att.section_index->'items') i where i->>'item_version_id'=p_data->>'item_version_id') then raise exception 'item_not_in_active_section' using errcode='23514'; end if;
      select ri.content_unit_id into unit_id from public.assessment_runtime_items ri join public.assessment_forms f on f.assessment_version_id=ri.assessment_version_id where f.id=att.form_id and ri.item_version_id=(p_data->>'item_version_id')::uuid;
      insert into public.responses(session_id,content_unit_id,type,data,metadata) values(att.session_id,unit_id,'assessment_response',jsonb_build_object('value',p_data->'response'),jsonb_build_object('sequence',(p_data->>'sequence')::integer)) returning id into rid;
      insert into public.assessment_response_journal(tenant_id,attempt_id,sequence,item_version_id,response,payload_hash,response_id) values(p_tenant,att.id,(p_data->>'sequence')::integer,(p_data->>'item_version_id')::uuid,p_data->'response',p_data->>'payload_hash',rid);
      update public.assessment_attempts set last_sequence=last_sequence+1 where id=att.id;
      result:=jsonb_build_object('id',rid,'sequence',att.last_sequence+1);
    elsif p_action='section.advance' then
      if att.state<>'active' or clock_timestamp()>=att.deadline_at then raise exception 'attempt_not_active' using errcode='23514'; end if;
      select f.manifest into manifest from public.assessment_forms f where f.id=att.form_id;
      if att.section_index+1>=jsonb_array_length(manifest->'sections') then raise exception 'last_section' using errcode='23514'; end if;
      select * into reg from public.assessment_registrations where id=att.registration_id;
      section_duration:=coalesce((manifest->'sections'->(att.section_index+1)->>'duration_seconds')::integer,(manifest->>'duration_seconds')::integer);
      section_duration:=section_duration+floor(reg.extra_seconds*section_duration::numeric/(manifest->>'duration_seconds')::integer)::integer;
      update public.assessment_attempts set section_index=section_index+1,section_deadline_at=least(deadline_at,clock_timestamp()+make_interval(secs=>section_duration)) where id=att.id;
      rid:=att.id;
    else
      if att.state not in ('active','paused') then raise exception 'attempt_finalized' using errcode='23514'; end if;
      update public.assessment_attempts set state=case when clock_timestamp()>=deadline_at then 'expired' else 'submitted' end,submitted_at=clock_timestamp() where id=att.id;
      update public.sessions set status=case when clock_timestamp()>=att.deadline_at then 'expired' else 'completed' end,completed_at=clock_timestamp() where id=att.session_id;
      rid:=att.id;
      insert into public.domain_event_outbox(event_type,event_version,aggregate_type,aggregate_id,user_id,payload,idempotency_key)
        values('assessment.attempt.submitted','v1','assessment_attempt',att.id,p_actor,jsonb_build_object('tenant_id',p_tenant,'attempt_id',att.id),'assessment.submit:'||att.id);
    end if;
  else raise exception 'unknown_action' using errcode='22023';
  end case;
  result:=coalesce(result,jsonb_build_object('id',rid));
  insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id) values(p_tenant,p_actor,p_action,rid);
  insert into public.assessment_commands values(p_tenant,p_actor,p_key,request,result,now());
  return result;
end; $$;
revoke all on function public.assessment_command(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.assessment_command(uuid,uuid,text,text,jsonb) to service_role;
revoke all on function public.assessment_has_capability(uuid,uuid,text) from public,anon;
grant execute on function public.assessment_has_capability(uuid,uuid,text) to authenticated,service_role;
commit;
