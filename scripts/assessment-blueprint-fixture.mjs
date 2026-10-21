/** Disposable canonical question fixtures, not a production identity/provider. */
export function seedAssessmentBlueprints(sql,actors,tenant){
 sql(`create table assessment_blueprint_fixture_ids(bank_id uuid);do $$declare bank uuid;iid uuid;n integer;payload jsonb;begin
 bank:=(assessment_command('${actors.owner}','${tenant}','browser-blueprint-bank','bank.create','{"title":"Center blueprint library"}')->>'id')::uuid;insert into assessment_blueprint_fixture_ids values(bank);
 for n in 1..4 loop
  payload:=jsonb_build_object('schema_version','assessment.item.v1','type','numeric','prompt','Approved blueprint question '||n,'locale','en','max_score',case when n in(1,4) then 2 else 1 end,'tags','[]'::jsonb,'classification',jsonb_build_object('topics',case n when 1 then '["Algebra","Reasoning"]'::jsonb when 2 then '["Algebra"]'::jsonb when 3 then '["Geometry"]'::jsonb else '["Geometry","Reasoning"]'::jsonb end,'estimated_difficulty',case when n in(2,3) then 'easy' else 'hard' end));
  iid:=(assessment_command('${actors.owner}','${tenant}','browser-blueprint-item-'||n,'item.create',jsonb_build_object('bank_id',bank,'item',payload,'key',jsonb_build_object('numeric',jsonb_build_object('value',n,'tolerance',0))))->>'id')::uuid;
  perform assessment_command('${actors.owner}','${tenant}','browser-blueprint-submit-'||n,'item.submit',jsonb_build_object('id',iid));perform assessment_command('${actors.reviewer}','${tenant}','browser-blueprint-approve-'||n,'item.approve',jsonb_build_object('id',iid));
 end loop;end;$$;`);
 return JSON.parse(sql(`select jsonb_build_object('bank',bank_id,'candidate','${actors.candidate}') from assessment_blueprint_fixture_ids;`));
}
export function assessmentBlueprintProof(sql){return JSON.parse(sql(`select jsonb_build_object(
 'definitions',(select count(*) from assessment_definitions where title='Balanced center placement'),
 'versions',(select count(*) from assessment_versions v join assessment_definitions d on d.id=v.assessment_id where d.title='Balanced center placement'),
 'forms',(select count(*) from assessment_forms f join assessment_versions v on v.id=f.assessment_version_id join assessment_definitions d on d.id=v.assessment_id where d.title='Balanced center placement'),
 'attempts',(select count(*) from assessment_attempts a join assessment_forms f on f.id=a.form_id join assessment_versions v on v.id=f.assessment_version_id join assessment_definitions d on d.id=v.assessment_id where d.title='Balanced center placement'),
 'classified_questions',(select count(*) from assessment_item_versions i join assessment_items q on q.id=i.item_id join assessment_blueprint_fixture_ids b on b.bank_id=q.bank_id where i.status='approved' and i.payload?'classification'),
 'classification_leaks',(select count(*) from assessment_forms f join assessment_versions v on v.id=f.assessment_version_id join assessment_definitions d on d.id=v.assessment_id where d.title='Balanced center placement' and exists(select 1 from jsonb_array_elements(f.manifest->'sections') s,jsonb_array_elements(s->'items') i where(i->'item')?'classification')),
 'actual_forms',(select coalesce(jsonb_agg(jsonb_build_object('manifest',f.manifest,'definition',v.definition,'source',(select jsonb_agg(jsonb_build_object('id',i.id,'payload',i.payload)) from assessment_item_versions i where i.tenant_id=v.tenant_id and exists(select 1 from jsonb_array_elements(v.definition->'sections') s where s->'item_version_ids'?i.id::text)))),'[]') from assessment_forms f join assessment_versions v on v.id=f.assessment_version_id join assessment_definitions d on d.id=v.assessment_id where d.title='Balanced center placement')
 );`));}
