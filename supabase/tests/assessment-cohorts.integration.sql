\set ON_ERROR_STOP on
begin;
alter table users add column full_name text;
insert into users(id,full_name) select ('70000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Cohort candidate '||n from generate_series(1,123)n;
insert into tenant_memberships(tenant_id,user_id,status,role) select '10000000-0000-4000-8000-000000000001',id,'active','member' from users where id::text like '70000000-%';
do $$ declare tenant uuid:='10000000-0000-4000-8000-000000000001';owner uuid:='00000000-0000-4000-8000-000000000001';reviewer uuid:='00000000-0000-4000-8000-000000000002';cohort uuid;win uuid;version_id uuid;candidate uuid;job uuid;second_job uuid;cancel_job uuid;result jsonb;input jsonb;preview jsonb;lease jsonb;row_data jsonb;revision bigint;before_scores integer;i integer;
begin
 select id into version_id from assessment_versions limit 1;select count(*) into before_scores from assessment_score_revisions;
 result:=assessment_command(owner,tenant,'cohort-window-create','window.create',jsonb_build_object('assessment_version_id',version_id,'title','Cohort authority sitting','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '2 hours'));win:=(result->>'id')::uuid;
 result:=assessment_cohort_command(owner,tenant,'cohort-create-proof','cohort.create','{"title":"Reviewed class","description":"Batch registration proof"}');cohort:=(result->>'id')::uuid;
 begin perform assessment_cohort_command('00000000-0000-4000-8000-000000000004',tenant,'cohort-foreign-create','cohort.create','{"title":"Forbidden"}');raise exception 'Foreign institution coordinator wrote cohort';exception when insufficient_privilege then null;end;
 begin perform assessment_cohort_read('00000000-0000-4000-8000-000000000003',tenant,'directory');raise exception 'Candidate read institution directory';exception when insufficient_privilege then null;end;
 for i in 1..121 loop
  candidate:=('70000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
  perform assessment_cohort_command(owner,tenant,'cohort-member-'||i,'member.add',jsonb_build_object('cohort_id',cohort,'user_id',candidate,'expected_revision',i,'extra_seconds',0,'reason','Approved class roster'));
 end loop;
 begin perform assessment_cohort_command(owner,tenant,'cohort-stale-member','member.add',jsonb_build_object('cohort_id',cohort,'user_id',candidate,'expected_revision',1,'extra_seconds',0,'reason','Stale roster'));raise exception 'Stale roster revision accepted';exception when unique_violation then null;end;
 begin perform assessment_cohort_command(owner,tenant,'cohort-foreign-member','member.add',jsonb_build_object('cohort_id',cohort,'user_id','00000000-0000-4000-8000-000000000004','expected_revision',122,'extra_seconds',0,'reason','Foreign member'));raise exception 'Foreign user joined roster';exception when check_violation then null;end;
 row_data:=assessment_cohort_read(owner,tenant,'directory',null,null,null,5,'candidate 123');if jsonb_array_length(row_data)<>1 or row_data->0->>'name'<>'Cohort candidate 123' then raise exception 'Directory search not institution scoped';end if;
 perform assessment_command(owner,tenant,'cohort-existing-match','registration.create',jsonb_build_object('window_id',win,'candidate_id','70000000-0000-4000-8000-000000000001','extra_seconds',0));
 perform assessment_command(owner,tenant,'cohort-existing-conflict','registration.create',jsonb_build_object('window_id',win,'candidate_id','70000000-0000-4000-8000-000000000002','extra_seconds',60));
 update tenant_memberships set status='inactive' where user_id='70000000-0000-4000-8000-000000000121';
 preview:=assessment_cohort_read(owner,tenant,'preview',cohort,win,null,50);
 if preview->>'total'<>'121' or preview->>'eligible'<>'120' or preview->>'existing'<>'2' or preview->>'conflicts'<>'1' or jsonb_array_length(preview->'members')<>50 then raise exception 'Full roster preview/counts wrong';end if;
 begin perform assessment_cohort_command(owner,tenant,'cohort-forged-review','job.create',jsonb_build_object('cohort_id',cohort,'window_id',win,'review_hash',repeat('0',64)));raise exception 'Unreviewed roster accepted';exception when unique_violation then null;end;
 input:=jsonb_build_object('cohort_id',cohort,'window_id',win,'review_hash',preview->>'review_hash');result:=assessment_cohort_command(owner,tenant,'cohort-job-create','job.create',input);job:=(result->>'id')::uuid;
 if assessment_cohort_command(owner,tenant,'cohort-job-create','job.create',input)<>result then raise exception 'Lost job creation replay changed manifest';end if;
 update tenant_memberships set status='active' where user_id='70000000-0000-4000-8000-000000000121';
 update tenant_memberships set status='inactive' where user_id='70000000-0000-4000-8000-000000000003';
 perform assessment_cohort_command(owner,tenant,'cohort-remove-after-review','member.remove',jsonb_build_object('cohort_id',cohort,'user_id','70000000-0000-4000-8000-000000000004','expected_revision',122,'reason','Candidate left this class'));
 perform assessment_cohort_command(owner,tenant,'cohort-add-after-review','member.add',jsonb_build_object('cohort_id',cohort,'user_id','70000000-0000-4000-8000-000000000122','expected_revision',123,'extra_seconds',0,'reason','New member requires a new reviewed job'));
 lease:=assessment_roster_claim(1)->0;
 begin perform assessment_roster_step(tenant,job,gen_random_uuid());raise exception 'Foreign lease processed roster';exception when unique_violation then null;end;
 result:=assessment_roster_step(tenant,job,(lease->>'lease_token')::uuid);if result->>'processed'<>'50' or result->>'state'<>'queued' then raise exception 'Worker did not bound the first chunk to 50';end if;
 begin perform assessment_roster_step(tenant,job,(lease->>'lease_token')::uuid);raise exception 'Lost-step replay advanced another chunk';exception when unique_violation then null;end;
 for i in 1..2 loop lease:=assessment_roster_claim(1)->0;perform assessment_roster_step(tenant,job,(lease->>'lease_token')::uuid);end loop;
 row_data:=assessment_cohort_read(owner,tenant,'job',job,null,null,50);
 if row_data->>'state'<>'completed_with_issues' or row_data->'summary'->>'created'<>'116' or row_data->'summary'->>'existing'<>'1' or row_data->'summary'->>'conflict'<>'1' or row_data->'summary'->>'inactive'<>'2' or row_data->'summary'->>'removed'<>'1' then raise exception 'Job lost per-candidate outcomes: %',row_data->'summary';end if;
 if row_data?'lease_token' or (select count(*) from assessment_roster_targets where job_id=job)<>121 or exists(select 1 from assessment_roster_targets where job_id=job and user_id='70000000-0000-4000-8000-000000000122') then raise exception 'Job expanded reviewed roster or leaked worker lease';end if;
 if (select extra_seconds from assessment_registrations where window_id=win and candidate_id='70000000-0000-4000-8000-000000000002')<>60 then raise exception 'Conflicting extra time overwritten';end if;
 begin update assessment_roster_targets set name='Rewritten' where job_id=job;raise exception 'Committed target history mutable';exception when check_violation then null;end;
 -- Mid-job authority loss keeps earlier registrations and requires explicit adoption.
 result:=assessment_command(owner,tenant,'cohort-second-window','window.create',jsonb_build_object('assessment_version_id',version_id,'title','Authority handover sitting','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '2 hours'));win:=(result->>'id')::uuid;preview:=assessment_cohort_read(owner,tenant,'preview',cohort,win);
 result:=assessment_cohort_command(owner,tenant,'cohort-second-job','job.create',jsonb_build_object('cohort_id',cohort,'window_id',win,'review_hash',preview->>'review_hash'));second_job:=(result->>'id')::uuid;
 lease:=assessment_roster_claim(1)->0;perform assessment_roster_step(tenant,second_job,(lease->>'lease_token')::uuid);
 update tenant_memberships set status='inactive' where tenant_id=tenant and user_id=owner;
 lease:=assessment_roster_claim(1)->0;result:=assessment_roster_step(tenant,second_job,(lease->>'lease_token')::uuid);if result->>'state'<>'blocked' or result->>'reason'<>'authority_lost' or result->>'processed'<>'50' then raise exception 'Revoked initiator continued or erased progress';end if;
 begin perform assessment_cohort_command(owner,tenant,'cohort-second-job','job.create',jsonb_build_object('cohort_id',cohort,'window_id',win,'review_hash',preview->>'review_hash'));raise exception 'Revoked initiator replayed creation';exception when insufficient_privilege then null;end;
 row_data:=assessment_cohort_read(reviewer,tenant,'job',second_job);perform assessment_cohort_command(reviewer,tenant,'cohort-job-adopt','job.resume',jsonb_build_object('job_id',second_job,'expected_revision',(row_data->>'revision')::bigint,'reason','Authorized coordinator adopts the remaining reviewed targets'));
 for i in 1..2 loop lease:=assessment_roster_claim(1)->0;perform assessment_roster_step(tenant,second_job,(lease->>'lease_token')::uuid);end loop;
 if (select authorized_by from assessment_roster_jobs where id=second_job)<>reviewer then raise exception 'Explicit adoption not recorded';end if;
 -- Cancellation never deletes the 50 processed target outcomes/registrations.
 result:=assessment_command(reviewer,tenant,'cohort-cancel-window','window.create',jsonb_build_object('assessment_version_id',version_id,'title','Cancellation sitting','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '2 hours'));win:=(result->>'id')::uuid;preview:=assessment_cohort_read(reviewer,tenant,'preview',cohort,win);result:=assessment_cohort_command(reviewer,tenant,'cohort-cancel-job','job.create',jsonb_build_object('cohort_id',cohort,'window_id',win,'review_hash',preview->>'review_hash'));cancel_job:=(result->>'id')::uuid;
 lease:=assessment_roster_claim(1)->0;perform assessment_roster_step(tenant,cancel_job,(lease->>'lease_token')::uuid);row_data:=assessment_cohort_read(reviewer,tenant,'job',cancel_job);
 perform assessment_cohort_command(reviewer,tenant,'cohort-cancel-remaining','job.cancel',jsonb_build_object('job_id',cancel_job,'expected_revision',(row_data->>'revision')::bigint,'reason','Cancel remaining targets only'));
 if (select count(*) from assessment_roster_targets where job_id=cancel_job and outcome='cancelled')<>71 or (select count(*) from assessment_roster_targets where job_id=cancel_job and outcome<>'cancelled')<>50 then raise exception 'Cancellation destroyed processed history';end if;
 if assessment_roster_step(tenant,cancel_job,(lease->>'lease_token')::uuid)->>'state'<>'cancelled' then raise exception 'Stale delivery reopened cancelled job';end if;
 if (select count(*) from assessment_score_revisions)<>before_scores then raise exception 'Roster jobs touched academic scores';end if;
end; $$;
set role authenticated;
do $$ begin
 begin perform * from assessment_cohorts;raise exception 'Raw cohort directory exposed';exception when insufficient_privilege then null;end;
 begin perform assessment_roster_claim(1);raise exception 'Candidate claimed worker job';exception when insufficient_privilege then null;end;
 begin perform assessment_roster_step(gen_random_uuid(),gen_random_uuid(),gen_random_uuid());raise exception 'Candidate invoked worker step';exception when insufficient_privilege then null;end;
end; $$;
reset role;
rollback;
