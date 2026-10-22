begin;
-- Blueprint v2 (FORM-01): item enemies (never delivered together), item
-- families (at most N per form) and a per-sitting exposure limit per question.
-- v1 blueprints are unchanged. Older validators reject v2 because its schema
-- version and fields are unknown to them, so nothing is silently dropped.

alter function public.assessment_validate_blueprint(jsonb,integer) rename to assessment_validate_blueprint_v1;
create function public.assessment_validate_blueprint(p_blueprint jsonb,p_draw integer) returns void language plpgsql immutable set search_path=public,pg_temp as $$
declare pair jsonb;family jsonb;ids text[];seen text[]:='{}';fids text[]:='{}';v jsonb;uuid_re text:='^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$';base jsonb;begin
 if p_blueprint->>'schema_version' is distinct from 'assessment.blueprint.v2' then perform public.assessment_validate_blueprint_v1(p_blueprint,p_draw);return;end if;
 if exists(select 1 from jsonb_object_keys(p_blueprint) k where k not in('schema_version','rules','minimum_points','maximum_points','enemies','families','exposure')) then raise exception 'invalid_blueprint' using errcode='22023';end if;
 if not(p_blueprint?'enemies' or p_blueprint?'families' or p_blueprint?'exposure') then raise exception 'invalid_blueprint' using errcode='22023';end if;
 -- Quotas and points follow the v1 rules; an empty rule list needs no v1 check.
 base:=jsonb_set(p_blueprint-'enemies'-'families'-'exposure','{schema_version}','"assessment.blueprint.v1"');
 if jsonb_array_length(coalesce(base->'rules','[]'::jsonb))>0 or base?'minimum_points' or base?'maximum_points' then perform public.assessment_validate_blueprint_v1(base,p_draw);
 elsif jsonb_typeof(base->'rules') is distinct from 'array' then raise exception 'invalid_blueprint' using errcode='22023';end if;
 if p_blueprint?'enemies' then
  if jsonb_typeof(p_blueprint->'enemies')<>'array' or jsonb_array_length(p_blueprint->'enemies') not between 1 and 100 then raise exception 'invalid_blueprint_enemies' using errcode='22023';end if;
  for pair in select value from jsonb_array_elements(p_blueprint->'enemies') loop
   if jsonb_typeof(pair)<>'array' or jsonb_array_length(pair)<>2 or coalesce(pair->>0,'')!~*uuid_re or coalesce(pair->>1,'')!~*uuid_re or lower(pair->>0)>=lower(pair->>1) or (lower(pair->>0)||':'||lower(pair->>1))=any(seen) then raise exception 'invalid_blueprint_enemies' using errcode='22023';end if;
   seen:=array_append(seen,lower(pair->>0)||':'||lower(pair->>1));
  end loop;
 end if;
 if p_blueprint?'families' then
  if jsonb_typeof(p_blueprint->'families')<>'array' or jsonb_array_length(p_blueprint->'families') not between 1 and 20 then raise exception 'invalid_blueprint_families' using errcode='22023';end if;
  for family in select value from jsonb_array_elements(p_blueprint->'families') loop
   if jsonb_typeof(family)<>'object' or exists(select 1 from jsonb_object_keys(family) k where k not in('id','label','item_version_ids','maximum')) or coalesce(family->>'id','')!~*uuid_re or lower(family->>'id')=any(fids) or jsonb_typeof(family->'label')<>'string' or length(btrim(family->>'label')) not between 1 and 200 or jsonb_typeof(family->'item_version_ids')<>'array' or jsonb_array_length(family->'item_version_ids') not between 2 and 50 or jsonb_typeof(family->'maximum')<>'number' or (family->>'maximum')::numeric<>trunc((family->>'maximum')::numeric) or (family->>'maximum')::numeric not between 0 and p_draw then raise exception 'invalid_blueprint_families' using errcode='22023';end if;
   fids:=array_append(fids,lower(family->>'id'));ids:='{}';
   for v in select value from jsonb_array_elements(family->'item_version_ids') loop
    if jsonb_typeof(v)<>'string' or (v#>>'{}')!~*uuid_re or lower(v#>>'{}')=any(ids) then raise exception 'invalid_blueprint_families' using errcode='22023';end if;
    ids:=array_append(ids,lower(v#>>'{}'));
   end loop;
  end loop;
 end if;
 if p_blueprint?'exposure' and(jsonb_typeof(p_blueprint->'exposure')<>'object' or exists(select 1 from jsonb_object_keys(p_blueprint->'exposure') k where k<>'maximum_per_sitting') or jsonb_typeof(p_blueprint#>'{exposure,maximum_per_sitting}') is distinct from 'number' or (p_blueprint#>>'{exposure,maximum_per_sitting}')::numeric<>trunc((p_blueprint#>>'{exposure,maximum_per_sitting}')::numeric) or (p_blueprint#>>'{exposure,maximum_per_sitting}')::numeric not between 1 and 100000) then raise exception 'invalid_blueprint_exposure' using errcode='22023';end if;
end;$$;

-- Enemy and family questions must belong to their own section.
alter function public.assessment_validate_design(uuid,jsonb) rename to assessment_validate_design_v35;
create function public.assessment_validate_design(p_tenant uuid,p_definition jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare s jsonb;begin
 perform public.assessment_validate_design_v35(p_tenant,p_definition);
 for s in select value from jsonb_array_elements(p_definition->'sections') loop
  if s#>>'{blueprint,schema_version}'='assessment.blueprint.v2' and exists(
   select 1 from jsonb_array_elements(coalesce(s#>'{blueprint,enemies}','[]'::jsonb)) pair,jsonb_array_elements_text(pair) member where not exists(select 1 from jsonb_array_elements_text(s->'item_version_ids') own where lower(own)=lower(member))
   union all
   select 1 from jsonb_array_elements(coalesce(s#>'{blueprint,families}','[]'::jsonb)) family,jsonb_array_elements_text(family->'item_version_ids') member where not exists(select 1 from jsonb_array_elements_text(s->'item_version_ids') own where lower(own)=lower(member))
  ) then raise exception 'blueprint_relation_outside_section' using errcode='22023';end if;
 end loop;
end;$$;

-- Every committed form re-checks enemies and families, not only the Edge.
alter function public.assessment_validate_blueprint_selection(uuid,jsonb,jsonb) rename to assessment_validate_blueprint_selection_v1;
create function public.assessment_validate_blueprint_selection(p_tenant uuid,p_definition jsonb,p_selection jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare s jsonb;chosen jsonb;position integer:=0;family jsonb;begin
 perform public.assessment_validate_blueprint_selection_v1(p_tenant,p_definition,p_selection);
 for s in select value from jsonb_array_elements(p_definition->'sections') loop
  chosen:=p_selection->position;position:=position+1;
  if s#>>'{blueprint,schema_version}' is distinct from 'assessment.blueprint.v2' then continue;end if;
  if exists(select 1 from jsonb_array_elements(coalesce(s#>'{blueprint,enemies}','[]'::jsonb)) pair where exists(select 1 from jsonb_array_elements_text(chosen->'item_version_ids') c where lower(c)=lower(pair->>0)) and exists(select 1 from jsonb_array_elements_text(chosen->'item_version_ids') c where lower(c)=lower(pair->>1))) then raise exception 'blueprint_enemies_selected' using errcode='23514';end if;
  for family in select value from jsonb_array_elements(coalesce(s#>'{blueprint,families}','[]'::jsonb)) loop
   if(select count(*) from jsonb_array_elements_text(chosen->'item_version_ids') c where exists(select 1 from jsonb_array_elements_text(family->'item_version_ids') m where lower(m)=lower(c)))>(family->>'maximum')::integer then raise exception 'blueprint_family_exceeded' using errcode='23514';end if;
  end loop;
 end loop;
end;$$;

-- How many forms in this sitting already include each question.
create function public.assessment_blueprint_exposure_counts(p_window uuid) returns table(item_version_id uuid,forms bigint) language sql stable security definer set search_path=public,pg_temp as $$
 select (i->>'item_version_id')::uuid,count(distinct a.id) from public.assessment_attempts a join public.assessment_registrations r on r.id=a.registration_id join public.assessment_forms f on f.id=a.form_id,
  jsonb_array_elements(f.manifest->'sections') s,jsonb_array_elements(s->'items') i where r.window_id=p_window group by 1
$$;
-- Candidate-facing: questions at their limit in the candidate's own sitting,
-- so the Edge never offers a form the database would refuse.
create function public.assessment_blueprint_saturated(p_actor uuid,p_tenant uuid,p_registration uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare reg public.assessment_registrations;def jsonb;begin
 select * into reg from public.assessment_registrations where tenant_id=p_tenant and id=p_registration and candidate_id=p_actor;
 if not found then raise exception 'not_found' using errcode='P0002';end if;
 select v.definition into def from public.assessment_exam_windows w join public.assessment_versions v on v.id=w.assessment_version_id where w.id=reg.window_id;
 return coalesce((select jsonb_agg(distinct c.item_version_id) from jsonb_array_elements(def->'sections') s join lateral jsonb_array_elements_text(s->'item_version_ids') own on true
  join public.assessment_blueprint_exposure_counts(reg.window_id) c on c.item_version_id=own::uuid
  where s#>'{blueprint,exposure,maximum_per_sitting}' is not null and c.forms>=(s#>>'{blueprint,exposure,maximum_per_sitting}')::bigint),'[]'::jsonb);
end;$$;

-- Admission: a new form may not push any question past its sitting limit.
-- Serialised per sitting; a replay of an existing attempt is not re-counted.
alter function public.assessment_command(uuid,uuid,text,text,jsonb) rename to assessment_command_before_exposure;
create function public.assessment_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare reg public.assessment_registrations;def jsonb;s jsonb;ms jsonb;item jsonb;position integer:=0;used bigint;begin
 if p_action='attempt.start' then
  select * into reg from public.assessment_registrations where tenant_id=p_tenant and id=(p_data->>'registration_id')::uuid and candidate_id=p_actor;
  if found and not exists(select 1 from public.assessment_attempts where registration_id=reg.id) then
   select v.definition into def from public.assessment_exam_windows w join public.assessment_versions v on v.id=w.assessment_version_id where w.id=reg.window_id;
   if exists(select 1 from jsonb_array_elements(def->'sections') x where x#>'{blueprint,exposure}' is not null) then
    perform pg_advisory_xact_lock(hashtextextended(reg.window_id::text||':blueprint-exposure',0));
    for s in select value from jsonb_array_elements(def->'sections') loop
     ms:=p_data->'manifest'->'sections'->position;position:=position+1;
     if s#>'{blueprint,exposure}' is null then continue;end if;
     for item in select value from jsonb_array_elements(coalesce(ms->'items','[]'::jsonb)) loop
      select coalesce((select forms from public.assessment_blueprint_exposure_counts(reg.window_id) where item_version_id=(item->>'item_version_id')::uuid),0) into used;
      if used>=(s#>>'{blueprint,exposure,maximum_per_sitting}')::bigint then raise exception 'blueprint_exposure_exhausted' using errcode='23514';end if;
     end loop;
    end loop;
   end if;
  end if;
 end if;
 return public.assessment_command_before_exposure(p_actor,p_tenant,p_key,p_action,p_data);
end;$$;

revoke all on function public.assessment_validate_blueprint_v1(jsonb,integer),public.assessment_validate_blueprint(jsonb,integer),public.assessment_validate_design_v35(uuid,jsonb),public.assessment_validate_design(uuid,jsonb),public.assessment_validate_blueprint_selection_v1(uuid,jsonb,jsonb),public.assessment_validate_blueprint_selection(uuid,jsonb,jsonb),public.assessment_blueprint_exposure_counts(uuid),public.assessment_command_before_exposure(uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.assessment_command(uuid,uuid,text,text,jsonb),public.assessment_blueprint_saturated(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.assessment_command(uuid,uuid,text,text,jsonb),public.assessment_blueprint_saturated(uuid,uuid,uuid) to service_role;
commit;
