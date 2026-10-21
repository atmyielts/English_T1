/** Four candidates start in one sitting at the same moment with the same
 * question under a one-form exposure limit: exactly one form is admitted.
 * Disposable local test container only. */
export async function exposureRace(query,parallel){
 const tenant='10000000-0000-4000-8000-000000000001',author='00000000-0000-4000-8000-000000000001',reviewer='00000000-0000-4000-8000-000000000002';
 const candidates=Array.from({length:4},(_,i)=>`00000000-0000-4000-8000-0000000000e${i}`),section='71000000-0000-4000-8000-000000000041';
 query(`insert into users(id) values${candidates.map(id=>`('${id}')`).join(',')};insert into tenant_memberships(tenant_id,user_id,status,role) values${candidates.map(id=>`('${tenant}','${id}','active','member')`).join(',')};
 create table fixture_exposure_race(ids uuid[],version_id uuid,window_id uuid,registrations uuid[]);
 do $$declare bank uuid;ids uuid[]:='{}';iid uuid;n integer;d uuid;v uuid;w uuid;regs uuid[]:='{}';definition jsonb;witness jsonb;begin
  bank:=(assessment_command('${author}','${tenant}','exposure-race-bank','bank.create','{"title":"Exposure race"}')->>'id')::uuid;
  for n in 1..3 loop
   iid:=(assessment_command('${author}','${tenant}','exposure-race-item-'||n,'item.create',jsonb_build_object('bank_id',bank,'item',jsonb_build_object('schema_version','assessment.item.v1','type','single_choice','prompt','Exposure question '||n,'locale','en','max_score',1,'tags','[]'::jsonb,'options','[{"id":"a","text":"A"},{"id":"b","text":"B"}]'::jsonb),'key','{"correct":"a"}'::jsonb))->>'id')::uuid;ids:=array_append(ids,iid);
   perform assessment_command('${author}','${tenant}','exposure-race-submit-'||n,'item.submit',jsonb_build_object('id',iid));perform assessment_command('${reviewer}','${tenant}','exposure-race-approve-'||n,'item.approve',jsonb_build_object('id',iid));
  end loop;
  definition:=jsonb_build_object('schema_version','assessment.definition.v2','title','Exposure race','locale','en','duration_seconds',600,'shuffle_items',false,'shuffle_options',false,'sections',jsonb_build_array(jsonb_build_object('id','${section}','title','Exposed','draw_count',1,'item_version_ids',to_jsonb(ids),'blueprint','{"schema_version":"assessment.blueprint.v2","rules":[],"exposure":{"maximum_per_sitting":1}}'::jsonb)));
  witness:=jsonb_build_array(jsonb_build_object('id','${section}','item_version_ids',jsonb_build_array(ids[1])));
  d:=(assessment_command('${author}','${tenant}','exposure-race-create','assessment.create',jsonb_build_object('definition',definition,'blueprint_witness',witness))->>'id')::uuid;
  v:=(assessment_command('${author}','${tenant}','exposure-race-publish','assessment.publish',jsonb_build_object('id',d,'revision',1,'blueprint_witness',witness))->>'id')::uuid;
  w:=(assessment_command('${author}','${tenant}','exposure-race-window','window.create',jsonb_build_object('assessment_version_id',v,'title','Exposure race sitting','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '1 hour'))->>'id')::uuid;
  for n in 1..4 loop regs:=array_append(regs,(assessment_command('${author}','${tenant}','exposure-race-reg-'||n,'registration.create',jsonb_build_object('window_id',w,'candidate_id',('00000000-0000-4000-8000-0000000000e'||(n-1))::uuid))->>'id')::uuid);end loop;
  insert into fixture_exposure_race values(ids,v,w,regs);
 end;$$;
 create function fixture_exposure_start(p_actor uuid,p_registration uuid) returns jsonb language plpgsql as $$declare form jsonb;r fixture_exposure_race;begin
  select * into r from fixture_exposure_race;
  select jsonb_build_object('schema_version','assessment.manifest.v1','assessment_version_id',r.version_id,'title','Exposure race','locale','en','duration_seconds',600,'sections',jsonb_build_array(jsonb_build_object('id','${section}','title','Exposed','items',jsonb_build_array(jsonb_build_object('item_version_id',i.id,'section_id','${section}','item',i.payload))))) into form from assessment_item_versions i where i.id=r.ids[1];
  return jsonb_build_object('ok',true,'id',assessment_command(p_actor,'${tenant}','exposure-race-start-'||p_registration,'attempt.start',jsonb_build_object('registration_id',p_registration,'manifest',form,'manifest_hash',repeat('a',64)))->>'id');
 exception when others then return jsonb_build_object('ok',false,'error',sqlerrm);end;$$;`);
 const registrations=JSON.parse(query('select to_jsonb(registrations) from fixture_exposure_race;'));
 const outcomes=(await parallel(candidates.map((candidate,i)=>`select fixture_exposure_start('${candidate}','${registrations[i]}');`))).map(text=>JSON.parse(text));
 const admitted=outcomes.filter(row=>row.ok),refused=outcomes.filter(row=>!row.ok);
 if(admitted.length!==1||refused.some(row=>row.error!=='blueprint_exposure_exhausted'))throw Error('Exposure race admitted the wrong number of forms: '+JSON.stringify(outcomes));
 const attempts=Number(query("select count(*) from assessment_attempts a join fixture_exposure_race f on a.registration_id=any(f.registrations);").trim());
 if(attempts!==1)throw Error('Exposure race left '+attempts+' attempts');
}
