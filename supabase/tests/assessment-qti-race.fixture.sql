create table public.assessment_qti_race_ids(bank uuid not null,job_id uuid);
insert into public.assessment_qti_race_ids(bank) select (assessment_command('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','qti-race-bank','bank.create','{"title":"QTI concurrency proof"}')->>'id')::uuid;
