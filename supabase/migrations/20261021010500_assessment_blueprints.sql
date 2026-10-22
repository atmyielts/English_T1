begin;
-- Older clients/Edges must reject a constrained definition rather than silently
-- stripping unknown quota fields from the v1 contract. Existing v1 rows remain.
alter table public.assessment_definitions drop constraint assessment_definitions_definition_check;
alter table public.assessment_definitions add constraint assessment_definitions_definition_check check(definition->>'schema_version' in('assessment.definition.v1','assessment.definition.v2'));
create function public.assessment_validate_classification(p_payload jsonb) returns void language plpgsql immutable set search_path=public,pg_temp as $$
declare c jsonb:=p_payload->'classification';v jsonb;begin
 if c is null then return;end if;
 if jsonb_typeof(c)<>'object' or exists(select 1 from jsonb_object_keys(c) k where k not in('topics','estimated_difficulty')) or jsonb_typeof(coalesce(c->'topics','[]'::jsonb))<>'array' then raise exception 'invalid_item_classification' using errcode='22023';end if;
 if jsonb_array_length(coalesce(c->'topics','[]'::jsonb))>20 or (not c?'estimated_difficulty' and jsonb_array_length(coalesce(c->'topics','[]'::jsonb))=0) then raise exception 'invalid_item_classification' using errcode='22023';end if;
 if c?'estimated_difficulty' and (jsonb_typeof(c->'estimated_difficulty')<>'string' or c->>'estimated_difficulty' not in('easy','medium','hard')) then raise exception 'invalid_item_classification' using errcode='22023';end if;
 for v in select value from jsonb_array_elements(coalesce(c->'topics','[]'::jsonb)) loop if jsonb_typeof(v)<>'string' or length(btrim(v#>>'{}')) not between 1 and 80 or btrim(v#>>'{}')<>v#>>'{}' then raise exception 'invalid_item_classification' using errcode='22023';end if;end loop;
 if(select count(*) from jsonb_array_elements(coalesce(c->'topics','[]'::jsonb)))<>(select count(distinct value) from jsonb_array_elements(coalesce(c->'topics','[]'::jsonb))) then raise exception 'invalid_item_classification' using errcode='22023';end if;
end;$$;
create function public.assessment_blueprint_matches(p_payload jsonb,p_rule jsonb) returns boolean language sql immutable set search_path=public,pg_temp as $$
 select (jsonb_array_length(coalesce(p_rule->'topics','[]'::jsonb))=0 or case when coalesce((p_rule->>'all_topics')::boolean,false) then not exists(select 1 from jsonb_array_elements_text(p_rule->'topics') t where not coalesce(p_payload#>'{classification,topics}','[]'::jsonb)?t) else exists(select 1 from jsonb_array_elements_text(p_rule->'topics') t where coalesce(p_payload#>'{classification,topics}','[]'::jsonb)?t) end)
 and(jsonb_array_length(coalesce(p_rule->'difficulties','[]'::jsonb))=0 or p_rule->'difficulties'?coalesce(p_payload#>>'{classification,estimated_difficulty}',''))
 and(jsonb_array_length(coalesce(p_rule->'types','[]'::jsonb))=0 or p_rule->'types'?(p_payload->>'type'));
$$;
create function public.assessment_validate_blueprint(p_blueprint jsonb,p_draw integer) returns void language plpgsql immutable set search_path=public,pg_temp as $$
declare r jsonb;f text;v jsonb;minimum numeric;maximum numeric;ids text[]:='{}';begin
 if jsonb_typeof(p_blueprint)<>'object' or p_blueprint->>'schema_version' is distinct from 'assessment.blueprint.v1' or exists(select 1 from jsonb_object_keys(p_blueprint) k where k not in('schema_version','rules','minimum_points','maximum_points')) or jsonb_typeof(p_blueprint->'rules') is distinct from 'array' then raise exception 'invalid_blueprint' using errcode='22023';end if;
 if jsonb_array_length(p_blueprint->'rules')>20 or(jsonb_array_length(p_blueprint->'rules')=0 and not(p_blueprint?'minimum_points' or p_blueprint?'maximum_points')) then raise exception 'invalid_blueprint' using errcode='22023';end if;
 foreach f in array array['minimum_points','maximum_points'] loop if p_blueprint?f then
  if jsonb_typeof(p_blueprint->f)<>'number' then raise exception 'invalid_blueprint_points' using errcode='22023';end if;
  minimum:=(p_blueprint->>f)::numeric;if minimum not between 0 and 500000 or round(minimum,6)<>minimum then raise exception 'invalid_blueprint_points' using errcode='22023';end if;
 end if;end loop;
 if coalesce((p_blueprint->>'minimum_points')::numeric,0)>coalesce((p_blueprint->>'maximum_points')::numeric,500000) then raise exception 'invalid_blueprint_points' using errcode='22023';end if;
 for r in select value from jsonb_array_elements(p_blueprint->'rules') loop
  if jsonb_typeof(r)<>'object' or exists(select 1 from jsonb_object_keys(r) k where k not in('id','label','topics','difficulties','types','all_topics','minimum','maximum')) or coalesce(r->>'id','')!~*'^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$' or lower(r->>'id')=any(ids) or jsonb_typeof(r->'label') is distinct from 'string' or length(btrim(r->>'label')) not between 1 and 200 then raise exception 'invalid_blueprint_rule' using errcode='22023';end if;
  ids:=array_append(ids,lower(r->>'id'));
  if r?'all_topics' and jsonb_typeof(r->'all_topics')<>'boolean' then raise exception 'invalid_blueprint_rule' using errcode='22023';end if;
  foreach f in array array['topics','difficulties','types'] loop
   if jsonb_typeof(coalesce(r->f,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(r->f,'[]'::jsonb))>(case f when 'topics' then 20 when 'difficulties' then 3 else 15 end) then raise exception 'invalid_blueprint_rule' using errcode='22023';end if;
   for v in select value from jsonb_array_elements(coalesce(r->f,'[]'::jsonb)) loop
    if jsonb_typeof(v)<>'string' or length(btrim(v#>>'{}')) not between 1 and 80 or btrim(v#>>'{}')<>v#>>'{}' then raise exception 'invalid_blueprint_rule' using errcode='22023';end if;
    if f='difficulties' and v#>>'{}' not in('easy','medium','hard') or f='types' and v#>>'{}' not in('single_choice','multi_choice','true_false','matching','ordering','gap_fill','short_answer','numeric','table_completion','diagram_labeling','hotspot','essay','audio_response','video_response','file_response') then raise exception 'invalid_blueprint_rule' using errcode='22023';end if;
   end loop;
   if(select count(*) from jsonb_array_elements(coalesce(r->f,'[]'::jsonb)))<>(select count(distinct value) from jsonb_array_elements(coalesce(r->f,'[]'::jsonb))) then raise exception 'invalid_blueprint_rule' using errcode='22023';end if;
  end loop;
  if jsonb_array_length(coalesce(r->'topics','[]'::jsonb))+jsonb_array_length(coalesce(r->'difficulties','[]'::jsonb))+jsonb_array_length(coalesce(r->'types','[]'::jsonb))=0 or jsonb_typeof(r->'minimum') is distinct from 'number' or jsonb_typeof(coalesce(r->'maximum',to_jsonb(p_draw)))<>'number' then raise exception 'invalid_blueprint_rule' using errcode='22023';end if;
  minimum:=(r->>'minimum')::numeric;maximum:=coalesce((r->>'maximum')::numeric,p_draw);
  if minimum<>trunc(minimum) or maximum<>trunc(maximum) or minimum<0 or maximum>p_draw or minimum>maximum then raise exception 'invalid_blueprint_rule' using errcode='22023';end if;
 end loop;
end;$$;

alter function public.assessment_validate_design(uuid,jsonb) rename to assessment_validate_design_v34;
create function public.assessment_validate_design(p_tenant uuid,p_definition jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare s jsonb;v jsonb;constrained boolean;begin
 if p_definition->>'schema_version' is null or p_definition->>'schema_version' not in('assessment.definition.v1','assessment.definition.v2') then raise exception 'unsupported_definition_schema' using errcode='22023';end if;
 perform public.assessment_validate_design_v34(p_tenant,jsonb_set(p_definition,'{schema_version}','"assessment.definition.v1"'));
 select exists(select 1 from jsonb_array_elements(p_definition->'sections') section where section?'blueprint') into constrained;
 if constrained<>(p_definition->>'schema_version'='assessment.definition.v2') then raise exception 'blueprint_definition_v2_required' using errcode='22023';end if;
 for s in select value from jsonb_array_elements(p_definition->'sections') loop
  if s?'blueprint' then perform public.assessment_validate_blueprint(s->'blueprint',coalesce((s->>'draw_count')::integer,jsonb_array_length(s->'item_version_ids')));end if;
  for v in select i.payload from public.assessment_item_versions i where i.tenant_id=p_tenant and s->'item_version_ids'?i.id::text loop perform public.assessment_validate_classification(v);end loop;
 end loop;
end;$$;
create function public.assessment_validate_blueprint_selection(p_tenant uuid,p_definition jsonb,p_selection jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare s jsonb;chosen jsonb;rule jsonb;ids uuid[];iid uuid;entry jsonb;position integer:=0;points numeric;matched integer;ordered jsonb;begin
 if jsonb_typeof(p_selection) is distinct from 'array' or jsonb_array_length(p_selection)<>jsonb_array_length(p_definition->'sections') then raise exception 'blueprint_witness_required' using errcode='23514';end if;
 for s in select value from jsonb_array_elements(p_definition->'sections') loop
  chosen:=p_selection->position;position:=position+1;ids:='{}';
  if chosen->>'id' is distinct from s->>'id' or jsonb_typeof(chosen->'item_version_ids') is distinct from 'array' or jsonb_array_length(chosen->'item_version_ids')<>coalesce((s->>'draw_count')::integer,jsonb_array_length(s->'item_version_ids')) then raise exception 'invalid_blueprint_selection' using errcode='23514';end if;
  for entry in select value from jsonb_array_elements(chosen->'item_version_ids') loop
   if jsonb_typeof(entry)<>'string' or coalesce(entry#>>'{}','')!~*'^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$' then raise exception 'invalid_blueprint_selection' using errcode='23514';end if;
   iid:=(entry#>>'{}')::uuid;if iid=any(ids) or not s->'item_version_ids'?iid::text then raise exception 'invalid_blueprint_selection' using errcode='23514';end if;ids:=array_append(ids,iid);
  end loop;
  if not coalesce((p_definition->>'shuffle_items')::boolean,false) then select jsonb_agg(value order by ordinality) into ordered from jsonb_array_elements(s->'item_version_ids') with ordinality where(value#>>'{}')::uuid=any(ids);if ordered<>chosen->'item_version_ids' then raise exception 'blueprint_author_order_required' using errcode='23514';end if;end if;
  if(select count(*) from public.assessment_item_versions where tenant_id=p_tenant and id=any(ids) and status='approved' and approved_by is not null)<>cardinality(ids) then raise exception 'unapproved_or_foreign_item' using errcode='23514';end if;
  if s?'blueprint' then
   perform public.assessment_validate_blueprint(s->'blueprint',cardinality(ids));
   select sum((payload->>'max_score')::numeric) into points from public.assessment_item_versions where tenant_id=p_tenant and id=any(ids);
   if points is null or points<coalesce((s#>>'{blueprint,minimum_points}')::numeric,0) or points>coalesce((s#>>'{blueprint,maximum_points}')::numeric,500000) then raise exception 'blueprint_points_not_met' using errcode='23514';end if;
   for rule in select value from jsonb_array_elements(s#>'{blueprint,rules}') loop
    select count(*) into matched from public.assessment_item_versions where tenant_id=p_tenant and id=any(ids) and public.assessment_blueprint_matches(payload,rule);
    if matched<(rule->>'minimum')::integer or matched>coalesce((rule->>'maximum')::integer,cardinality(ids)) then raise exception 'blueprint_quota_not_met' using errcode='23514';end if;
   end loop;
  end if;
 end loop;
end;$$;

create function public.assessment_validate_blueprint_manifest(p_tenant uuid,p_version public.assessment_versions,p_manifest jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare selection jsonb;s jsonb;ms jsonb;i jsonb;source jsonb;position integer:=0;canonical_options jsonb;actual_options jsonb;begin
 if jsonb_typeof(p_manifest->'sections') is distinct from 'array' or p_manifest->>'schema_version' is distinct from 'assessment.manifest.v1' or p_manifest->>'assessment_version_id' is distinct from p_version.id::text or(p_manifest-array['sections','assessment_version_id','schema_version']) is distinct from (p_version.definition-array['sections','shuffle_items','shuffle_options','schema_version']) then raise exception 'invalid_blueprint_manifest' using errcode='23514';end if;
 select jsonb_agg(jsonb_build_object('id',section.value->'id','item_version_ids',(select coalesce(jsonb_agg(item.value->'item_version_id' order by item.ordinality),'[]'::jsonb) from jsonb_array_elements(section.value->'items') with ordinality item)) order by section.ordinality) into selection from jsonb_array_elements(p_manifest->'sections') with ordinality section;
 perform public.assessment_validate_blueprint_selection(p_tenant,p_version.definition,selection);
 for s in select value from jsonb_array_elements(p_version.definition->'sections') loop
  ms:=p_manifest->'sections'->position;position:=position+1;
  if(ms-'items') is distinct from(s-array['item_version_ids','draw_count','blueprint']) then raise exception 'invalid_blueprint_manifest' using errcode='23514';end if;
  for i in select value from jsonb_array_elements(ms->'items') loop
   select payload into source from public.assessment_item_versions where tenant_id=p_tenant and id=(i->>'item_version_id')::uuid;
   if i->>'section_id' is distinct from s->>'id' or((i->'item')-'options') is distinct from(source-array['options','classification']) then raise exception 'blueprint_prompt_mismatch' using errcode='23514';end if;
   if coalesce((p_version.definition->>'shuffle_options')::boolean,false) and source->>'type'<>'ordering' and source?'options' then
    if jsonb_typeof(i#>'{item,options}') is distinct from 'array' then raise exception 'blueprint_option_mismatch' using errcode='23514';end if;
    select jsonb_agg(value order by value->>'id') into canonical_options from jsonb_array_elements(source->'options');select jsonb_agg(value order by value->>'id') into actual_options from jsonb_array_elements(i#>'{item,options}');
    if actual_options is distinct from canonical_options then raise exception 'blueprint_option_mismatch' using errcode='23514';end if;
   elsif i#>'{item,options}' is distinct from source->'options' then raise exception 'blueprint_option_mismatch' using errcode='23514';end if;
  end loop;
 end loop;
end;$$;

alter function public.assessment_command(uuid,uuid,text,text,jsonb) rename to assessment_command_before_blueprints;
create function public.assessment_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare definition jsonb;version public.assessment_versions;cap text;prior public.assessment_commands;request jsonb;working_revision integer;begin
 if p_action in('item.create','item.revise') then
  if not public.assessment_has_capability(p_tenant,p_actor,'items.write') then raise exception 'forbidden' using errcode='42501';end if;
  perform public.assessment_validate_classification(p_data->'item');
 elsif p_action in('assessment.create','assessment.revise','assessment.publish') then
  perform pg_advisory_xact_lock(hashtextextended('assessment.staff:'||p_tenant::text,0));
  cap:=case when p_action='assessment.publish' then 'assessments.publish' else 'items.write' end;
  if not public.assessment_has_capability(p_tenant,p_actor,cap) then raise exception 'forbidden' using errcode='42501';end if;
  if p_key is null or length(p_key) not between 8 and 200 then raise exception 'idempotency_key_required' using errcode='22023';end if;
  request:=jsonb_build_object('action',p_action,'data',p_data-'blueprint_witness');
  perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_actor::text||p_key,0));
  select * into prior from public.assessment_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
  if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
  if p_action='assessment.publish' then select d.definition,d.revision into definition,working_revision from public.assessment_definitions d where tenant_id=p_tenant and id=(p_data->>'id')::uuid for update;if found and (p_data->>'revision')::numeric is distinct from working_revision::numeric then raise exception 'revision_conflict' using errcode='23505';end if;else definition:=p_data->'definition';end if;
  if exists(select 1 from jsonb_array_elements(definition->'sections') s where s?'blueprint') then
   perform public.assessment_validate_design(p_tenant,definition);perform public.assessment_validate_blueprint_selection(p_tenant,definition,p_data->'blueprint_witness');
  end if;
 elsif p_action='attempt.start' then
  select v.* into version from public.assessment_registrations r join public.assessment_exam_windows w on w.id=r.window_id join public.assessment_versions v on v.id=w.assessment_version_id where r.tenant_id=p_tenant and r.id=(p_data->>'registration_id')::uuid and r.candidate_id=p_actor;
  if version.id is not null and exists(select 1 from jsonb_array_elements(version.definition->'sections') s where s?'blueprint') then perform public.assessment_validate_blueprint_manifest(p_tenant,version,p_data->'manifest');end if;
 end if;
 -- A derived feasibility witness is not command identity. Committed requests
 -- replay before revalidation and keep their original publication/form result.
 return public.assessment_command_before_blueprints(p_actor,p_tenant,p_key,p_action,p_data-'blueprint_witness');
end;$$;
revoke all on function public.assessment_validate_classification(jsonb),public.assessment_blueprint_matches(jsonb,jsonb),public.assessment_validate_blueprint(jsonb,integer),public.assessment_validate_design_v34(uuid,jsonb),public.assessment_validate_design(uuid,jsonb),public.assessment_validate_blueprint_selection(uuid,jsonb,jsonb),public.assessment_validate_blueprint_manifest(uuid,public.assessment_versions,jsonb),public.assessment_command_before_blueprints(uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.assessment_command(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.assessment_command(uuid,uuid,text,text,jsonb) to service_role;
commit;
