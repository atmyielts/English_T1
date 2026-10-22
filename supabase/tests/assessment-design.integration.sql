\set ON_ERROR_STOP on
do $$ declare
 tenant uuid:='10000000-0000-4000-8000-000000000001';owner uuid:='00000000-0000-4000-8000-000000000001';foreign_actor uuid:='00000000-0000-4000-8000-000000000004';
 item uuid;item2 uuid;draft uuid;published uuid;d jsonb;changed jsonb;result jsonb;version_snapshot jsonb;
begin
 select id into item from assessment_item_versions where tenant_id=tenant and status='approved' limit 1;
 result:=assessment_command(owner,tenant,'design-question-001','item.create',jsonb_build_object('bank_id',(select bank_id from assessment_items where id=(select item_id from assessment_item_versions where id=item)),'item',(select payload from assessment_item_versions where id=item),'key',(select key from assessment_item_keys where item_version_id=item)));item2:=(result->>'id')::uuid;
 d:=jsonb_build_object('schema_version','assessment.definition.v1','title','Design proof','locale','uz','duration_seconds',600,'shuffle_items',false,'shuffle_options',true,'sections',jsonb_build_array(jsonb_build_object('id','71000000-0000-4000-8000-000000000001','title','First section','duration_seconds',200,'item_version_ids',jsonb_build_array(item),'draw_count',1)));
 begin perform assessment_command(owner,tenant,'design-invalid-item','assessment.create',jsonb_build_object('definition',jsonb_set(d,'{sections,0,item_version_ids}',jsonb_build_array(item2))));raise exception 'Unapproved item accepted';exception when check_violation then null;end;
 begin perform assessment_command(owner,tenant,'design-invalid-time','assessment.create',jsonb_build_object('definition',jsonb_set(d,'{sections,0,duration_seconds}','601')));raise exception 'Invalid section timer accepted';exception when invalid_parameter_value then null;end;
 begin perform assessment_command(owner,tenant,'design-invalid-draw','assessment.create',jsonb_build_object('definition',jsonb_set(d,'{sections,0,draw_count}','1.5')));raise exception 'Fractional draw accepted';exception when invalid_parameter_value then null;end;
 begin perform assessment_command(owner,tenant,'design-invalid-boolean','assessment.create',jsonb_build_object('definition',d-'shuffle_items'));raise exception 'Missing switch accepted';exception when invalid_parameter_value then null;end;
 begin perform assessment_command(owner,tenant,'design-invalid-duplicate','assessment.create',jsonb_build_object('definition',jsonb_set(d,'{sections}',(d->'sections')||jsonb_set(d->'sections'->0,'{id}','"71000000-0000-4000-8000-000000000002"'))));raise exception 'Cross-section duplicate accepted';exception when invalid_parameter_value then null;end;
 result:=assessment_command(owner,tenant,'design-create-001','assessment.create',jsonb_build_object('definition',d));draft:=(result->>'id')::uuid;
 if assessment_command(owner,tenant,'design-create-001','assessment.create',jsonb_build_object('definition',d))<>result then raise exception 'Create replay differs';end if;
 result:=assessment_command(owner,tenant,'design-publish-001','assessment.publish',jsonb_build_object('id',draft,'revision',1));published:=(result->>'id')::uuid;select definition into version_snapshot from assessment_versions where id=published;
 changed:=jsonb_set(d,'{title}','"Changed working test"');
 result:=assessment_command(owner,tenant,'design-revise-001','assessment.revise',jsonb_build_object('id',draft,'revision',1,'definition',changed,'reason','New coverage'));
 if result->>'revision'<>'2' then raise exception 'Revision not advanced';end if;
 if assessment_command(owner,tenant,'design-revise-001','assessment.revise',jsonb_build_object('id',draft,'revision',1,'definition',changed,'reason','New coverage'))<>result then raise exception 'Revision replay differs';end if;
 if (select definition from assessment_versions where id=published)<>version_snapshot then raise exception 'Published definition changed';end if;
 if (select count(*) from assessment_definition_revisions where assessment_id=draft)<>2 then raise exception 'Revision history missing or duplicated';end if;
 begin perform assessment_command(owner,tenant,'design-stale-revision','assessment.revise',jsonb_build_object('id',draft,'revision',1,'definition',d,'reason','Stale'));raise exception 'Stale write accepted';exception when unique_violation then null;end;
 begin perform assessment_command(owner,tenant,'design-stale-publish','assessment.publish',jsonb_build_object('id',draft,'revision',1));raise exception 'Stale publication accepted';exception when unique_violation then null;end;
 begin perform assessment_command(owner,tenant,'design-missing-reason','assessment.revise',jsonb_build_object('id',draft,'revision',2,'definition',d,'reason',' '));raise exception 'Missing reason accepted';exception when invalid_parameter_value then null;end;
 begin perform assessment_command(foreign_actor,tenant,'design-foreign-write','assessment.revise',jsonb_build_object('id',draft,'revision',2,'definition',d,'reason','Foreign'));raise exception 'Foreign actor accepted';exception when insufficient_privilege then null;end;
 begin update assessment_definition_revisions set reason='Changed' where assessment_id=draft;raise exception 'History mutable';exception when check_violation then null;end;
 perform assessment_command(owner,tenant,'design-publish-002','assessment.publish',jsonb_build_object('id',draft,'revision',2));
 if (select count(*) from assessment_versions where assessment_id=draft)<>2 then raise exception 'New version not independent';end if;
 if (select count(*) from assessment_audit_events where target_id=draft and action='assessment.revise')<>1 then raise exception 'Revision audit replay duplicated';end if;
end; $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false);
do $$ begin
 if exists(select 1 from assessment_definition_revisions where tenant_id='10000000-0000-4000-8000-000000000001') then raise exception 'Foreign history leaked';end if;
 begin perform assessment_command_before_design('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','design-forged-call','assessment.publish','{}');raise exception 'Private pre-design RPC callable';exception when insufficient_privilege then null;end;
 begin insert into assessment_definition_revisions(tenant_id,assessment_id,revision,definition,actor_id,reason) values('10000000-0000-4000-8000-000000000001',gen_random_uuid(),1,'{}','00000000-0000-4000-8000-000000000004','Forged');raise exception 'History insert callable';exception when insufficient_privilege then null;end;
end; $$;
reset role;
