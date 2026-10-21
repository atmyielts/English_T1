-- Synthetic released-score matrix for read-only analytics, never production data.
-- Five cases share raw point rows (0,0),(0,0),(1,9),(1,9),(1,9):
-- mean=60%, corrected item-rest r=1, raw alpha=.36 (unequal item weights).
-- A sixth full-credit case receives a different valid two-of-three form.
create table public.assessment_analytics_fixture_ids(window_id uuid,cohort_id uuid,first_attempt uuid);
do $$ declare t uuid:='10000000-0000-4000-8000-000000000001';a uuid:='00000000-0000-4000-8000-000000000001';b uuid:='00000000-0000-4000-8000-000000000002';u uuid;bank uuid;objective uuid;essay uuid;numeric_item uuid;def uuid;ver uuid;win uuid;grp uuid;reg uuid;att uuid;first_attempt uuid;score_id uuid;run uuid;form jsonb;scores jsonb;items jsonb;n integer;x integer;revision integer:=1;
begin
 select i.bank_id,v.id into bank,objective from assessment_item_versions v join assessment_items i on i.id=v.item_id where v.payload->>'prompt'='2 + 2?' and v.payload->>'type'='single_choice' and i.bank_id=(select id from assessment_item_banks where title='Grading bank') limit 1;
 select id into essay from assessment_item_versions where payload->>'prompt'='Explain your reasoning';
 numeric_item:=(assessment_command(a,t,'analytics-extra-create','item.create',jsonb_build_object('bank_id',bank,'item','{"schema_version":"assessment.item.v1","type":"ordering","locale":"en","prompt":"Synthetic ordering item","max_score":1,"tags":[],"options":[{"id":"a","text":"First"},{"id":"b","text":"Second"}]}'::jsonb,'key','{"correct":["a","b"]}'::jsonb))->>'id')::uuid;
 perform assessment_command(a,t,'analytics-numeric-submit','item.submit',jsonb_build_object('id',numeric_item));perform assessment_command(b,t,'analytics-numeric-approve','item.approve',jsonb_build_object('id',numeric_item));
 def:=(assessment_command(a,t,'analytics-design','assessment.create',jsonb_build_object('definition',jsonb_build_object('schema_version','assessment.definition.v1','title','Analytics randomized form','locale','en','duration_seconds',600,'shuffle_items',false,'shuffle_options',true,'sections',jsonb_build_array(jsonb_build_object('id','20000000-0000-4000-8000-000000000039','title','Problem solving','item_version_ids',jsonb_build_array(objective,essay,numeric_item),'draw_count',2)))))->>'id')::uuid;
 ver:=(assessment_command(a,t,'analytics-publication','assessment.publish',jsonb_build_object('id',def,'revision',1))->>'id')::uuid;
 win:=(assessment_command(a,t,'analytics-sitting','window.create',jsonb_build_object('assessment_version_id',ver,'title','Analytics quality sitting','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '2 hours'))->>'id')::uuid;
 declare policy_id uuid;begin
  policy_id:=(assessment_feedback_command(a,t,'analytics-feedback-propose','policy.propose',jsonb_build_object('window_id',win,'expected_revision',0,'level','questions','available_after',null,'reason','Explicit fixture permission for private question points'))->>'id')::uuid;
  perform assessment_feedback_command(b,t,'analytics-feedback-approve','policy.approve',jsonb_build_object('id',policy_id,'expected_revision',1,'review_hash',assessment_feedback_version_hash(policy_id)));
 end;
 grp:=(assessment_cohort_command(a,t,'analytics-group','cohort.create','{"title":"Analytics reviewed class"}')->>'id')::uuid;
 for n in 1..7 loop
  u:=case when n=1 then '00000000-0000-4000-8000-000000000003'::uuid else ('74000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid end;
  if n>1 then insert into users(id) values(u);insert into tenant_memberships(tenant_id,user_id,status,role) values(t,u,'active','member');end if;
  reg:=(assessment_command(a,t,'analytics-register-'||n,'registration.create',jsonb_build_object('window_id',win,'candidate_id',u))->>'id')::uuid;
  if n<=3 then perform assessment_cohort_command(a,t,'analytics-member-'||n,'member.add',jsonb_build_object('cohort_id',grp,'user_id',u,'extra_seconds',0,'expected_revision',revision,'reason','Approved analytics fixture cohort'));revision:=revision+1;end if;
  if n=7 then continue;end if;
  items:=jsonb_build_array(jsonb_build_object('item_version_id',objective),jsonb_build_object('item_version_id',case when n=6 then numeric_item else essay end));
  form:=jsonb_build_object('schema_version','assessment.manifest.v1','assessment_version_id',ver,'duration_seconds',600,'sections',jsonb_build_array(jsonb_build_object('id','20000000-0000-4000-8000-000000000039','title','Problem solving','items',items)));
  att:=(assessment_command(u,t,'analytics-start-'||n,'attempt.start',jsonb_build_object('registration_id',reg,'manifest',form,'manifest_hash',repeat('a',64)))->>'id')::uuid;
  if n=1 then first_attempt:=att;end if;
  x:=case when n<=2 then 0 else 1 end;
  perform pg_temp.assessment_command(u,t,'analytics-answer-'||n,'response.append',jsonb_build_object('attempt_id',att,'sequence',1,'item_version_id',objective,'response',case when x=1 then 'a' else 'b' end,'payload_hash',repeat('b',64)));
  perform pg_temp.assessment_command(u,t,'analytics-submit-'||n,'attempt.submit',jsonb_build_object('attempt_id',att));
  scores:=jsonb_build_array(jsonb_build_object('item_version_id',objective,'score',x,'max_score',1,'status','scored'),jsonb_build_object('item_version_id',case when n=6 then numeric_item else essay end,'score',case when n=6 then 1 else x*9 end,'max_score',case when n=6 then 1 else 9 end,'status','agreed'));
  -- Numeric serialization scale is not a different point weight/form.
  if n=5 then scores:=jsonb_set(jsonb_set(scores,'{0,max_score}','1.000000'::jsonb),'{1,max_score}','9.0'::jsonb);end if;
  insert into assessment_score_revisions(tenant_id,attempt_id,scores,status,source,approved_by) values(t,att,scores,'approved','human',b) returning id into score_id;
  insert into assessment_grading_runs(tenant_id,attempt_id,generation,input_hash,scorer_version,objective_scores,policy_snapshot,status,approved_by,approved_at,approved_hash,score_revision_id) values(t,att,1,repeat('a',64),'assessment.scorer.v1',scores,'{"marker_count":2,"tolerance_percent":0}','released',b,clock_timestamp(),repeat('b',64),score_id) returning id into run;
  insert into assessment_grading_releases(tenant_id,run_id,score_revision_id,release_at,released_by) values(t,run,score_id,clock_timestamp()-interval '1 minute',a);
  update assessment_grading_jobs set state='committed',committed_at=clock_timestamp(),lease_token=null,leased_until=null where attempt_id=att;
  if n=1 then
   scores:=jsonb_build_array(jsonb_build_object('item_version_id',objective,'score',1,'max_score',1),jsonb_build_object('item_version_id',essay,'score',9,'max_score',9));
   insert into assessment_score_revisions(tenant_id,attempt_id,scores,status,source,approved_by) values(t,att,scores,'approved','human',b) returning id into score_id;
   insert into assessment_grading_runs(tenant_id,attempt_id,generation,input_hash,scorer_version,objective_scores,policy_snapshot,status,approved_by,score_revision_id) values(t,att,2,repeat('c',64),'assessment.scorer.v1',scores,'{}','released',b,score_id) returning id into run;
   insert into assessment_grading_releases(tenant_id,run_id,score_revision_id,release_at,released_by) values(t,run,score_id,clock_timestamp()+interval '1 day',a);
  end if;
 end loop;
 insert into assessment_analytics_fixture_ids values(win,grp,first_attempt);
end;$$;
