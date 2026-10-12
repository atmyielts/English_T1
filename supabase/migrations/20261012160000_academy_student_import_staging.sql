-- A separate sealed upload protocol. Legacy jobs/rows remain readable and
-- unchanged; this does not activate a commit path until full validation exists.
create table public.academy_student_import_jobs(
 id uuid primary key default gen_random_uuid(),
 academy_id uuid not null references public.tenants(id) on delete cascade,
 branch_id uuid not null,created_by uuid not null references public.users(id) on delete restrict,
 idempotency_key text not null,request_scope jsonb not null,settings jsonb not null,
 expected_rows integer not null check(expected_rows between 1 and 5000),
 staged_rows integer not null default 0 check(staged_rows between 0 and 5000),
 status text not null default 'uploading' check(status in('uploading','sealed','validated','completed','failed','cancelled','reversed')),
 validation jsonb,receipt jsonb,created_at timestamptz not null default now(),sealed_at timestamptz,
 unique(academy_id,id),unique(academy_id,idempotency_key),
 foreign key(academy_id,branch_id) references public.academy_branches(academy_id,id) on delete restrict
);
create table public.academy_student_import_rows(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null,job_id uuid not null,
 row_number integer not null check(row_number between 1 and 5000),
 source_data jsonb not null,mapped_data jsonb not null,normalization jsonb,normalized_data jsonb,validation_errors jsonb,
 unique(academy_id,job_id,row_number),
 foreign key(academy_id,job_id) references public.academy_student_import_jobs(academy_id,id) on delete cascade
);
alter table public.academy_student_import_jobs enable row level security;
alter table public.academy_student_import_rows enable row level security;
-- Browser roles do not write staging flags or read another operator's PII.
-- Purpose-built service endpoints must resolve current role/branch scope first.
revoke all on public.academy_student_import_jobs,public.academy_student_import_rows from anon,authenticated;
grant all on public.academy_student_import_jobs,public.academy_student_import_rows to service_role;

create or replace function public.academy_guard_student_import_rows()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_job public.academy_student_import_jobs%rowtype;
begin
 if tg_op='UPDATE' and row(new.academy_id,new.job_id,new.row_number) is distinct from row(old.academy_id,old.job_id,old.row_number) then
  raise exception 'An uploaded row cannot move to another job';end if;
 select * into v_job from public.academy_student_import_jobs
  where academy_id=coalesce(new.academy_id,old.academy_id) and id=coalesce(new.job_id,old.job_id) for update;
 if not found then raise exception 'Import job not found';end if;
 if tg_op='UPDATE' and row(new.source_data,new.mapped_data) is distinct from row(old.source_data,old.mapped_data) then
  raise exception 'An uploaded row cannot change source values';end if;
 if tg_op='UPDATE' and old.normalization is not null and new.normalization is distinct from old.normalization then
  raise exception 'An import normalization cannot be changed';end if;
 if new.normalization is not null and(tg_op='INSERT' or old.normalization is null) then
  if new.normalization is distinct from public.academy_normalize_student_import_row(new.mapped_data,v_job.settings) then
   raise exception 'Import normalization must be derived from frozen source values';end if;
 end if;
 if tg_op='DELETE' or tg_op='INSERT' or row(new.source_data,new.mapped_data) is distinct from row(old.source_data,old.mapped_data) then
  if v_job.status<>'uploading' then raise exception 'A sealed import cannot change source rows';end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end;
$$;
create trigger academy_student_import_rows_guard before insert or update or delete on public.academy_student_import_rows
 for each row execute function public.academy_guard_student_import_rows();
revoke all on function public.academy_guard_student_import_rows() from public,anon,authenticated,service_role;

create or replace function public.academy_stage_student_import(
 p_academy_id uuid,p_actor_id uuid,p_key text,p_settings jsonb,p_rows jsonb,p_offset integer,
 p_seal boolean,p_branch_ids uuid[] default null
) returns jsonb language plpgsql security definer set search_path=public
 set statement_timeout='15s' set lock_timeout='5s' as $$
declare
 v_job public.academy_student_import_jobs%rowtype;v_existing public.academy_student_import_rows%rowtype;
 v_branch uuid;v_expected integer;v_count integer;v_row jsonb;v_number integer;v_scope jsonb;v_mapping jsonb;v_mapped jsonb;
 v_field record;v_source jsonb;v_selected jsonb;v_cell jsonb;v_clock text;v_complete boolean;v_key text:=trim(p_key);
begin
 if nullif(trim(p_key),'') is null or length(p_key)>180 then raise exception 'A valid upload key is required';end if;
 if not exists(select 1 from public.users where id=p_actor_id and is_active) then raise exception 'An active account is required';end if;
 if jsonb_typeof(p_settings) is distinct from 'object' or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_typeof(p_settings->'column_mapping') is distinct from 'object' then
  raise exception 'Import settings and source rows are required';end if;
 v_branch:=(p_settings->>'branch_id')::uuid;v_expected:=(p_settings->>'expected_rows')::integer;v_mapping:=p_settings->'column_mapping';
 if nullif(trim(p_settings->>'source_filename'),'') is null or length(p_settings->>'source_filename')>300
  or (p_settings->>'balance_convention') is null or (p_settings->>'balance_convention') not in('credit_positive','debt_positive')
  or (p_settings->>'currency') is null or (p_settings->>'currency') !~ '^[A-Z]{3}$'
  or (p_settings->>'date_format') is null or (p_settings->>'date_format') not in('iso','day_first','month_first')
  or jsonb_typeof(p_settings->'create_missing_groups') is distinct from 'boolean'
  or (p_settings->>'duplicate_strategy') is null or (p_settings->>'duplicate_strategy') not in('reject','skip','reuse')
  or (nullif(trim(v_mapping->>'full_name'),'') is null and nullif(trim(v_mapping->>'first_name'),'') is null)
  or nullif(trim(v_mapping->>'phone'),'') is null then raise exception 'Valid import settings and name/phone mapping are required';end if;
 if v_expected is null or v_expected not between 1 and 5000 or p_offset is null or p_offset<0 or p_offset::bigint+jsonb_array_length(p_rows)>v_expected
  or jsonb_array_length(p_rows)>200 or octet_length(p_rows::text)>2097152 then raise exception 'Import row/file budget exceeded';end if;
 if p_seal is null then raise exception 'An explicit upload or seal mode is required';end if;
 if v_branch is null or(p_branch_ids is not null and (v_branch=any(p_branch_ids)) is distinct from true) then raise exception 'Forbidden import branch';end if;
 for v_field in select key,value from jsonb_each(v_mapping) loop
  if v_field.key not in('full_name','first_name','last_name','phone','email','parent_phone','parent_name','group_name','balance','joined_on')
   or jsonb_typeof(v_field.value) is distinct from 'string' or nullif(trim(v_field.value#>>'{}'),'') is null
   or length(v_field.value#>>'{}')>180 then raise exception 'Unsupported import mapping field';end if;
 end loop;
 select timezone into v_clock from public.academy_branches where academy_id=p_academy_id and id=v_branch and is_active;
 if not found then raise exception 'An active import branch is required';end if;
 v_scope:=jsonb_build_object('actor',p_actor_id,'settings',p_settings,
  'branches',case when p_branch_ids is null then null else to_jsonb(array(select distinct unnest(p_branch_ids) order by 1)) end);
 insert into public.academy_student_import_jobs(academy_id,branch_id,created_by,idempotency_key,request_scope,settings,expected_rows)
 values(p_academy_id,v_branch,p_actor_id,v_key,v_scope,p_settings||jsonb_build_object('as_of_date',(now() at time zone v_clock)::date,'branch_timezone',v_clock),v_expected)
 on conflict(academy_id,idempotency_key) do nothing;
 select * into v_job from public.academy_student_import_jobs where academy_id=p_academy_id and idempotency_key=v_key for update;
 if v_job.request_scope is distinct from v_scope then raise exception 'Upload key already used for another file, actor or scope';end if;
 for v_row,v_number in select value,p_offset+ordinality::integer from jsonb_array_elements(p_rows) with ordinality loop
  v_source:=v_row->'source';
  if jsonb_typeof(v_source) is distinct from 'object' then raise exception 'Each upload row needs selected source values';end if;
  -- Apply the mapping in SQL too. Caller mapped_data/validation/target fields
  -- never establish authority or determine what will be committed.
  v_mapped:='{}';v_selected:='{}';
  for v_field in select key,value from jsonb_each(v_mapping) loop
   v_cell:=coalesce(v_source->(v_field.value#>>'{}'),'null'::jsonb);
   if jsonb_typeof(v_cell) not in('string','number','boolean','null')
    or (jsonb_typeof(v_cell)='string' and length(v_cell#>>'{}')>2000) then raise exception 'Unsupported import source cell';end if;
   v_mapped:=v_mapped||jsonb_build_object(v_field.key,v_cell);
   v_selected:=v_selected||jsonb_build_object(v_field.value#>>'{}',v_cell);
  end loop;
  v_source:=v_selected;
  select * into v_existing from public.academy_student_import_rows where academy_id=p_academy_id and job_id=v_job.id and row_number=v_number;
  if found then
   if v_existing.source_data is distinct from v_source or v_existing.mapped_data is distinct from v_mapped then
    raise exception 'Uploaded row already exists with different values';end if;
  else
   if v_job.status<>'uploading' then raise exception 'A sealed import cannot accept more source rows';end if;
   insert into public.academy_student_import_rows(academy_id,job_id,row_number,source_data,mapped_data)
    values(p_academy_id,v_job.id,v_number,v_source,v_mapped);
  end if;
 end loop;
 select count(*) into v_count from public.academy_student_import_rows where academy_id=p_academy_id and job_id=v_job.id;
 v_complete:=v_count=v_expected and not exists(select 1 from generate_series(1,v_expected) n where not exists(
  select 1 from public.academy_student_import_rows where academy_id=p_academy_id and job_id=v_job.id and row_number=n));
 if p_seal and not v_complete then raise exception 'Upload every expected row before sealing the import';end if;
 update public.academy_student_import_jobs set staged_rows=v_count,
  status=case when p_seal and status='uploading' then 'sealed' else status end,
  sealed_at=case when p_seal and sealed_at is null then now() else sealed_at end
 where academy_id=p_academy_id and id=v_job.id returning * into v_job;
 return jsonb_build_object('job',to_jsonb(v_job));
end;
$$;
revoke all on function public.academy_stage_student_import(uuid,uuid,text,jsonb,jsonb,integer,boolean,uuid[]) from public,anon,authenticated;
grant execute on function public.academy_stage_student_import(uuid,uuid,text,jsonb,jsonb,integer,boolean,uuid[]) to service_role;
