begin;
-- Editable working definitions and immutable publication snapshots are separate.
create table public.assessment_definition_revisions (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,
 assessment_id uuid not null,revision integer not null check(revision>0),
 definition jsonb not null,actor_id uuid not null references public.users(id),
 reason text not null,created_at timestamptz not null default clock_timestamp(),
 unique(assessment_id,revision),
 foreign key(tenant_id,assessment_id) references public.assessment_definitions(tenant_id,id)
);
alter table public.assessment_definition_revisions enable row level security;
revoke all on public.assessment_definition_revisions from anon,authenticated;
grant select on public.assessment_definition_revisions to authenticated;
grant all on public.assessment_definition_revisions to service_role;
create policy institution_read on public.assessment_definition_revisions for select to authenticated
 using(public.assessment_has_capability(tenant_id,auth.uid(),'banks.read'));
create trigger immutable_record before update or delete on public.assessment_definition_revisions for each row execute function public.assessment_immutable();
insert into public.assessment_definition_revisions(tenant_id,assessment_id,revision,definition,actor_id,reason,created_at)
 select tenant_id,id,revision,definition,created_by,'Existing working definition',created_at from public.assessment_definitions;

-- Defense in depth for service RPC callers: reject malformed forms, repeated
-- section/items, foreign/unapproved versions and impossible timing before write.
create function public.assessment_validate_design(p_tenant uuid,p_definition jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare s jsonb;v jsonb;duration numeric;timers numeric:=0;draw numeric;ids uuid[]:='{}';sections uuid[]:='{}';sid uuid;iid uuid;
begin
 if jsonb_typeof(p_definition) is distinct from 'object' or p_definition->>'schema_version' is distinct from 'assessment.definition.v1'
 or jsonb_typeof(p_definition->'title') is distinct from 'string' or length(trim(p_definition->>'title')) not between 1 and 200
 or coalesce(p_definition->>'locale','') not in ('uz','ru','en')
 or jsonb_typeof(p_definition->'duration_seconds') is distinct from 'number'
 or jsonb_typeof(p_definition->'shuffle_items') is distinct from 'boolean' or jsonb_typeof(p_definition->'shuffle_options') is distinct from 'boolean'
 or jsonb_typeof(p_definition->'sections') is distinct from 'array' then raise exception 'invalid_definition' using errcode='22023';end if;
 duration:=(p_definition->>'duration_seconds')::numeric;
 if duration<>trunc(duration) or duration not between 60 and 86400 or jsonb_array_length(p_definition->'sections') not between 1 and 50 then raise exception 'invalid_definition' using errcode='22023';end if;
 for s in select value from jsonb_array_elements(p_definition->'sections') loop
  if jsonb_typeof(s) is distinct from 'object' or jsonb_typeof(s->'title') is distinct from 'string' or length(trim(s->>'title')) not between 1 and 200
  or coalesce(s->>'id','') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  or jsonb_typeof(s->'item_version_ids') is distinct from 'array' then raise exception 'invalid_section' using errcode='22023';end if;
  sid:=(s->>'id')::uuid;
  if sid=any(sections) or jsonb_array_length(s->'item_version_ids') not between 1 and 500 then raise exception 'invalid_section' using errcode='22023';end if;sections:=array_append(sections,sid);
  draw:=jsonb_array_length(s->'item_version_ids');
  if s ? 'draw_count' then
   if jsonb_typeof(s->'draw_count') is distinct from 'number' then raise exception 'invalid_draw_count' using errcode='22023';end if;draw:=(s->>'draw_count')::numeric;
  end if;
  if draw<>trunc(draw) or draw not between 1 and jsonb_array_length(s->'item_version_ids') then raise exception 'invalid_draw_count' using errcode='22023';end if;
  if s ? 'duration_seconds' then
   if jsonb_typeof(s->'duration_seconds') is distinct from 'number' then raise exception 'invalid_section_duration' using errcode='22023';end if;
   if (s->>'duration_seconds')::numeric<>trunc((s->>'duration_seconds')::numeric) or (s->>'duration_seconds')::numeric not between 1 and duration then raise exception 'invalid_section_duration' using errcode='22023';end if;
   timers:=timers+(s->>'duration_seconds')::numeric;
  end if;
  for v in select value from jsonb_array_elements(s->'item_version_ids') loop
   if jsonb_typeof(v) is distinct from 'string' or (v#>>'{}') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then raise exception 'invalid_item_id' using errcode='22023';end if;
   iid:=(v#>>'{}')::uuid;
   if iid=any(ids) then raise exception 'duplicate_item_version' using errcode='22023';end if;ids:=array_append(ids,iid);
  end loop;
 end loop;
 if timers>duration then raise exception 'section_timers_exceed_total' using errcode='22023';end if;
 -- Approvals are irreversible; lock referenced rows through the definition commit.
 perform 1 from public.assessment_item_versions where tenant_id=p_tenant and id=any(ids) order by id for share;
 if (select count(*) from public.assessment_item_versions where tenant_id=p_tenant and id=any(ids) and status='approved' and approved_by is not null)<>cardinality(ids) then raise exception 'unapproved_or_foreign_item' using errcode='23514';end if;
end; $$;
revoke all on function public.assessment_validate_design(uuid,jsonb) from public,anon,authenticated,service_role;

alter function public.assessment_command(uuid,uuid,text,text,jsonb) rename to assessment_command_before_design;
revoke all on function public.assessment_command_before_design(uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
create function public.assessment_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.assessment_commands;def public.assessment_definitions;result jsonb;request jsonb;cap text;reason text;
begin
 if p_action not in ('assessment.create','assessment.revise','assessment.publish') then return public.assessment_command_before_design(p_actor,p_tenant,p_key,p_action,p_data);end if;
 cap:=case when p_action='assessment.publish' then 'assessments.publish' else 'items.write' end;
 -- Current authority precedes receipt replay; revoked actors cannot use old keys.
 if not public.assessment_has_capability(p_tenant,p_actor,cap) then raise exception 'forbidden' using errcode='42501';end if;
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'idempotency_key_required' using errcode='22023';end if;
 request:=jsonb_build_object('action',p_action,'data',p_data);
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_actor::text||p_key,0));
 select * into prior from public.assessment_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
 if found then
  if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;
 end if;
 if p_action='assessment.create' then
  perform public.assessment_validate_design(p_tenant,p_data->'definition');
  result:=public.assessment_command_before_design(p_actor,p_tenant,p_key,p_action,p_data);
  select * into def from public.assessment_definitions where id=(result->>'id')::uuid and tenant_id=p_tenant;
  insert into public.assessment_definition_revisions(tenant_id,assessment_id,revision,definition,actor_id,reason) values(p_tenant,def.id,def.revision,def.definition,p_actor,'Initial working definition');
  return result;
 end if;
 select * into def from public.assessment_definitions where tenant_id=p_tenant and id=(p_data->>'id')::uuid for update;
 if not found then raise exception 'not_found' using errcode='P0002';end if;
 if jsonb_typeof(p_data->'revision') is distinct from 'number' or (p_data->>'revision')::numeric<>def.revision then raise exception 'revision_conflict' using errcode='23505';end if;
 if p_action='assessment.publish' then
  perform public.assessment_validate_design(p_tenant,def.definition);
  return public.assessment_command_before_design(p_actor,p_tenant,p_key,p_action,p_data);
 end if;
 reason:=trim(p_data->>'reason');
 if jsonb_typeof(p_data->'reason') is distinct from 'string' or length(reason) not between 1 and 2000 then raise exception 'revision_reason_required' using errcode='22023';end if;
 perform public.assessment_validate_design(p_tenant,p_data->'definition');
 update public.assessment_definitions set title=p_data->'definition'->>'title',definition=p_data->'definition',revision=revision+1 where id=def.id;
 insert into public.assessment_definition_revisions(tenant_id,assessment_id,revision,definition,actor_id,reason) values(p_tenant,def.id,def.revision+1,p_data->'definition',p_actor,reason);
 result:=jsonb_build_object('id',def.id,'revision',def.revision+1);
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,p_action,def.id,jsonb_build_object('from_revision',def.revision,'to_revision',def.revision+1,'reason',reason));
 insert into public.assessment_commands values(p_tenant,p_actor,p_key,request,result,clock_timestamp());
 return result;
end; $$;
revoke all on function public.assessment_command(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.assessment_command(uuid,uuid,text,text,jsonb) to service_role;
commit;
