\set ON_ERROR_STOP on
begin;
do $$declare t uuid:='10000000-0000-4000-8000-000000000001';author uuid:='00000000-0000-4000-8000-000000000001';reviewer uuid:='00000000-0000-4000-8000-000000000002';c1 uuid:='00000000-0000-4000-8000-000000000003';c2 uuid:='00000000-0000-4000-8000-0000000000c2';
 section_id uuid:='71000000-0000-4000-8000-000000000040';bank uuid;ids uuid[]:='{}';iid uuid;n integer;payload jsonb;definition jsonb;rules jsonb;definition_id uuid;version_id uuid;w uuid;r1 uuid;r2 uuid;receipt jsonb;saturated jsonb;
 form jsonb;
begin
 insert into public.users(id) values(c2);insert into public.tenant_memberships(tenant_id,user_id,status,role) values(t,c2,'active','member');
 bank:=(public.assessment_command(author,t,'relations-bank','bank.create','{"title":"Relations bank"}')->>'id')::uuid;
 for n in 1..4 loop
  payload:=jsonb_build_object('schema_version','assessment.item.v1','type','single_choice','prompt','Relation question '||n,'locale','en','max_score',1,'tags','[]'::jsonb,'options','[{"id":"a","text":"A"},{"id":"b","text":"B"}]'::jsonb);
  iid:=(public.assessment_command(author,t,'relations-item-'||n,'item.create',jsonb_build_object('bank_id',bank,'item',payload,'key','{"correct":"a"}'::jsonb))->>'id')::uuid;ids:=array_append(ids,iid);
  perform public.assessment_command(author,t,'relations-submit-'||n,'item.submit',jsonb_build_object('id',iid));perform public.assessment_command(reviewer,t,'relations-approve-'||n,'item.approve',jsonb_build_object('id',iid));
 end loop;
 rules:=jsonb_build_object('schema_version','assessment.blueprint.v2','rules','[]'::jsonb,
  'enemies',jsonb_build_array(jsonb_build_array(least(ids[1]::text,ids[2]::text),greatest(ids[1]::text,ids[2]::text))),
  'families',jsonb_build_array(jsonb_build_object('id','72000000-0000-4000-8000-000000000040','label','Shared passage','item_version_ids',jsonb_build_array(ids[3],ids[4]),'maximum',1)),
  'exposure','{"maximum_per_sitting":1}'::jsonb);
 definition:=jsonb_build_object('schema_version','assessment.definition.v2','title','Related forms','locale','en','duration_seconds',600,'shuffle_items',false,'shuffle_options',false,'sections',jsonb_build_array(jsonb_build_object('id',section_id,'title','Related section','draw_count',2,'item_version_ids',to_jsonb(ids),'blueprint',rules)));
 -- Questions outside the section, unsorted pairs and malformed limits are refused.
 begin perform public.assessment_command(author,t,'relations-outside','assessment.create',jsonb_build_object('definition',jsonb_set(definition,'{sections,0,blueprint,enemies}',jsonb_build_array(jsonb_build_array('00000000-0000-4000-8000-000000000001','ffffffff-0000-4000-8000-000000000001'))),'blueprint_witness',jsonb_build_array(jsonb_build_object('id',section_id,'item_version_ids',jsonb_build_array(ids[1],ids[3])))));raise exception 'Enemy outside the section accepted';exception when invalid_parameter_value then null;end;
 begin perform public.assessment_command(author,t,'relations-bad-exposure','assessment.create',jsonb_build_object('definition',jsonb_set(definition,'{sections,0,blueprint,exposure,maximum_per_sitting}','0'),'blueprint_witness',jsonb_build_array(jsonb_build_object('id',section_id,'item_version_ids',jsonb_build_array(ids[1],ids[3])))));raise exception 'Zero exposure accepted';exception when invalid_parameter_value then null;end;
 -- Witnesses that break a relation are refused; a valid one is accepted.
 begin perform public.assessment_command(author,t,'relations-enemies','assessment.create',jsonb_build_object('definition',definition,'blueprint_witness',jsonb_build_array(jsonb_build_object('id',section_id,'item_version_ids',jsonb_build_array(ids[1],ids[2])))));raise exception 'Enemies accepted together';exception when check_violation then if sqlerrm<>'blueprint_enemies_selected' then raise;end if;end;
 begin perform public.assessment_command(author,t,'relations-family','assessment.create',jsonb_build_object('definition',definition,'blueprint_witness',jsonb_build_array(jsonb_build_object('id',section_id,'item_version_ids',jsonb_build_array(ids[3],ids[4])))));raise exception 'Family maximum exceeded';exception when check_violation then if sqlerrm<>'blueprint_family_exceeded' then raise;end if;end;
 definition_id:=(public.assessment_command(author,t,'relations-create','assessment.create',jsonb_build_object('definition',definition,'blueprint_witness',jsonb_build_array(jsonb_build_object('id',section_id,'item_version_ids',jsonb_build_array(ids[1],ids[3])))))->>'id')::uuid;
 version_id:=(public.assessment_command(author,t,'relations-publish','assessment.publish',jsonb_build_object('id',definition_id,'revision',1,'blueprint_witness',jsonb_build_array(jsonb_build_object('id',section_id,'item_version_ids',jsonb_build_array(ids[1],ids[3])))))->>'id')::uuid;
 w:=(public.assessment_command(author,t,'relations-window','window.create',jsonb_build_object('assessment_version_id',version_id,'title','Related sitting','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '2 hours'))->>'id')::uuid;
 r1:=(public.assessment_command(author,t,'relations-reg-1','registration.create',jsonb_build_object('window_id',w,'candidate_id',c1))->>'id')::uuid;
 r2:=(public.assessment_command(author,t,'relations-reg-2','registration.create',jsonb_build_object('window_id',w,'candidate_id',c2))->>'id')::uuid;
 -- Start forms are checked in the database too, not only at the Edge.
 select jsonb_build_object('schema_version','assessment.manifest.v1','assessment_version_id',version_id,'title','Related forms','locale','en','duration_seconds',600,'sections',jsonb_build_array(jsonb_build_object('id',section_id,'title','Related section','items',jsonb_agg(jsonb_build_object('item_version_id',i.id,'section_id',section_id,'item',i.payload) order by chosen.ordinality))))
  into form from unnest(array[ids[1],ids[2]]) with ordinality chosen(id,ordinality) join public.assessment_item_versions i on i.id=chosen.id;
 begin perform public.assessment_command(c1,t,'relations-start-enemies','attempt.start',jsonb_build_object('registration_id',r1,'manifest',form,'manifest_hash',repeat('a',64)));raise exception 'Enemy form started';exception when check_violation then if sqlerrm<>'blueprint_enemies_selected' then raise;end if;end;
 select jsonb_set(form,'{sections,0,items}',(select jsonb_agg(jsonb_build_object('item_version_id',i.id,'section_id',section_id,'item',i.payload) order by chosen.ordinality) from unnest(array[ids[1],ids[3]]) with ordinality chosen(id,ordinality) join public.assessment_item_versions i on i.id=chosen.id)) into form;
 if public.assessment_blueprint_saturated(c1,t,r1)<>'[]'::jsonb then raise exception 'Fresh sitting reported saturation';end if;
 receipt:=public.assessment_command(c1,t,'relations-start-1','attempt.start',jsonb_build_object('registration_id',r1,'manifest',form,'manifest_hash',repeat('a',64)));
 if public.assessment_command(c1,t,'relations-start-1','attempt.start',jsonb_build_object('registration_id',r1,'manifest',form,'manifest_hash',repeat('a',64)))<>receipt then raise exception 'Start replay refused by its own exposure';end if;
 -- Each question may appear in one form per sitting: the same form is refused for the second candidate.
 saturated:=public.assessment_blueprint_saturated(c2,t,r2);
 if not(saturated@>to_jsonb(array[ids[1]]) and saturated@>to_jsonb(array[ids[3]]) and jsonb_array_length(saturated)=2) then raise exception 'Saturated questions wrong: %',saturated;end if;
 begin perform public.assessment_command(c2,t,'relations-start-reuse','attempt.start',jsonb_build_object('registration_id',r2,'manifest',form,'manifest_hash',repeat('a',64)));raise exception 'Exposure limit exceeded';exception when check_violation then if sqlerrm<>'blueprint_exposure_exhausted' then raise;end if;end;
 select jsonb_set(form,'{sections,0,items}',(select jsonb_agg(jsonb_build_object('item_version_id',i.id,'section_id',section_id,'item',i.payload) order by chosen.ordinality) from unnest(array[ids[2],ids[4]]) with ordinality chosen(id,ordinality) join public.assessment_item_versions i on i.id=chosen.id)) into form;
 perform public.assessment_command(c2,t,'relations-start-2','attempt.start',jsonb_build_object('registration_id',r2,'manifest',form,'manifest_hash',repeat('a',64)));
 if (select count(*) from public.assessment_attempts where registration_id in(r1,r2))<>2 then raise exception 'Distinct forms not both admitted';end if;
 begin perform public.assessment_blueprint_saturated(c1,t,r2);raise exception 'Another candidate''s sitting read';exception when no_data_found then null;end;
 if has_function_privilege('authenticated','public.assessment_blueprint_saturated(uuid,uuid,uuid)','execute') or has_function_privilege('service_role','public.assessment_blueprint_exposure_counts(uuid)','execute') then raise exception 'Exposure functions exposed';end if;
end;$$;
rollback;
