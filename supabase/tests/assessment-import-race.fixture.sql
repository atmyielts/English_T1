\set ON_ERROR_STOP on
create table assessment_import_race_data(data jsonb);
do $$ declare bank uuid;rows jsonb;begin
 bank:=(assessment_command('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','import-race-bank','bank.create','{"title":"Concurrent import library"}')->>'id')::uuid;
 select jsonb_agg(jsonb_build_object('line',n,'item',jsonb_build_object('schema_version','assessment.item.v1','type','short_answer','locale','en','prompt','Concurrent import '||n,'max_score',1,'tags','[]'::jsonb),'key',jsonb_build_object('correct','Answer '||n),'fingerprint',repeat('a',64),'warnings','[]'::jsonb)) into rows from generate_series(1,60)n;
 insert into assessment_import_race_data values(jsonb_build_object('bank_id',bank,'source_name','concurrent.json','format','json','source_hash',repeat('e',64),'rows',rows));
end;$$;
