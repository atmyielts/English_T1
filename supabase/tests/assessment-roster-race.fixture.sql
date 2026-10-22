-- Persistent only inside the runner's disposable database, after all rollback suites.
insert into public.users(id,full_name)
 select ('73000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Race candidate '||n from generate_series(1,60)n;
insert into public.tenant_memberships(tenant_id,user_id,status,role)
 select '10000000-0000-4000-8000-000000000001',id,'active','member' from public.users where id::text like '73000000-%';
create table public.assessment_roster_race_ids(cohort_id uuid not null,window_id uuid not null,review_hash text not null);
do $$ declare tenant uuid:='10000000-0000-4000-8000-000000000001';actor uuid:='00000000-0000-4000-8000-000000000001';cohort uuid;win uuid;result jsonb;n integer;
begin
 result:=assessment_cohort_command(actor,tenant,'race-cohort-create','cohort.create','{"title":"Concurrent roster proof","description":"Sixty reviewed targets"}');cohort:=(result->>'id')::uuid;
 for n in 1..60 loop
  perform assessment_cohort_command(actor,tenant,'race-cohort-member-'||n,'member.add',jsonb_build_object('cohort_id',cohort,'user_id',('73000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'expected_revision',n,'extra_seconds',0,'reason','Approved concurrency fixture roster'));
 end loop;
 result:=assessment_command(actor,tenant,'race-cohort-window','window.create',jsonb_build_object('assessment_version_id',(select id from assessment_versions limit 1),'title','Concurrent roster sitting','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '2 hours'));win:=(result->>'id')::uuid;
 insert into assessment_roster_race_ids values(cohort,win,assessment_cohort_read(actor,tenant,'preview',cohort,win)->>'review_hash');
end; $$;
