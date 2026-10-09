begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';

-- Preserve existing records and service access; browser-owned trust and hiring
-- decisions must pass through authenticated, actor-bound commands.
revoke all on public.teacher_profiles, public.job_listings, public.job_applications from public, anon, authenticated;
do $$
declare v_table text; v_columns text;
begin
  foreach v_table in array array['teacher_profiles','job_listings','job_applications'] loop
    select string_agg(quote_ident(attname), ', ' order by attnum) into v_columns
    from pg_attribute where attrelid=('public.'||v_table)::regclass and attnum>0 and not attisdropped;
    execute format('revoke select (%1$s), insert (%1$s), update (%1$s), references (%1$s) on public.%2$I from public, anon, authenticated',v_columns,v_table);
  end loop;
end $$;
grant select, insert, update, delete on public.teacher_profiles, public.job_listings, public.job_applications to service_role;
drop policy if exists "Teacher profiles: own manage" on public.teacher_profiles;
drop policy if exists "Job listings: admin manage" on public.job_listings;
drop policy if exists "Job apps: teacher own" on public.job_applications;

alter table public.job_listings add column request_id uuid, add column request_payload jsonb;
create unique index marketplace_job_request on public.job_listings(created_by, request_id);
alter table public.teacher_profiles add column revision bigint not null default 1;
-- Preserve historical flags, but do not publish a trust badge that could have
-- been set by the former owner-write policy without an independent review.
alter table public.teacher_profiles
  add column verification_reviewed_at timestamptz,
  add column verification_reviewed_by uuid references public.users(id) on delete set null;
create table public.marketplace_profile_requests (
  actor_id uuid not null references public.users(id) on delete cascade,
  request_id uuid not null,
  request_payload jsonb not null,
  receipt jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,request_id)
);
alter table public.marketplace_profile_requests enable row level security;
revoke all on public.marketplace_profile_requests from public, anon, authenticated, service_role;
grant select, insert on public.marketplace_profile_requests to service_role;
create table public.marketplace_application_decisions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.job_applications(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  request_id uuid not null,
  from_status text not null,
  to_status text not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(actor_id, request_id)
);
alter table public.marketplace_application_decisions enable row level security;
revoke all on public.marketplace_application_decisions from public, anon, authenticated, service_role;
grant select, insert on public.marketplace_application_decisions to service_role;

create function public.marketplace_text_array(p_value jsonb)
returns text[] language plpgsql security invoker set search_path = '' as $$
begin
  if p_value is null then return '{}'; end if;
  if jsonb_typeof(p_value) is distinct from 'array' then
    raise exception 'Expected a list of text values' using errcode='PT400';
  end if;
  if jsonb_array_length(p_value)>30 or exists(select 1 from jsonb_array_elements(p_value) e
    where jsonb_typeof(e) <> 'string' or length(btrim(e#>>'{}')) not between 1 and 120) then
    raise exception 'Use up to 30 text values of 1-120 characters' using errcode='PT400';
  end if;
  return array(select distinct btrim(e#>>'{}') from jsonb_array_elements(p_value) e order by 1);
end;
$$;
revoke all on function public.marketplace_text_array(jsonb) from public, anon, authenticated;
grant execute on function public.marketplace_text_array(jsonb) to service_role;

create function public.marketplace_command(p_actor uuid,p_action text,p_payload jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' set lock_timeout = '2s'
as $$
declare
  v_profile public.teacher_profiles%rowtype;
  v_job public.job_listings%rowtype;
  v_app public.job_applications%rowtype;
  v_decision public.marketplace_application_decisions%rowtype;
  v_profile_request public.marketplace_profile_requests%rowtype;
  v_result jsonb;
  v_tenant uuid;
  v_id uuid;
  v_request uuid;
  v_payload jsonb;
  v_subjects text[];
  v_name text;
  v_status text;
  v_expected text;
  v_field text;
  v_min integer;
  v_max integer;
  v_rate integer;
  v_years integer;
  v_days integer;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Invalid request' using errcode='PT400'; end if;
  if p_action='teachers' then
    select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into v_result from (
      select p.id,p.full_name,p.bio,p.avatar_url,p.subjects,p.languages,p.location,p.hourly_rate,p.currency,p.experience_years,
        p.certifications,p.available,
        (p.verified and p.verification_reviewed_at is not null and p.verification_reviewed_by is not null) as verified
      from public.teacher_profiles p join public.users u on u.id=p.user_id
      where u.is_active and p.is_public and p.available and
        (nullif(btrim(p_payload->>'subject'),'') is null or (p_payload->>'subject')=any(subjects))
      order by (p.verified and p.verification_reviewed_at is not null and p.verification_reviewed_by is not null) desc,p.updated_at desc,p.id desc limit 50
    ) q;
    return jsonb_build_object('teachers',v_result,'history_window',50);
  end if;
  if p_action='jobs' then
    select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into v_result from (
      select j.id,j.tenant_id,j.title,j.description,j.subjects,j.employment_type,j.salary_min,j.salary_max,
        j.currency,j.location,j.remote_ok,j.created_at,j.expires_at,jsonb_build_object('name',t.name) as tenants
      from public.job_listings j join public.tenants t on t.id=j.tenant_id
      where t.type in ('team','org') and j.status='open' and (j.expires_at is null or j.expires_at>clock_timestamp())
      order by j.created_at desc,j.id desc limit 50
    ) q;
    return jsonb_build_object('jobs',v_result,'history_window',50);
  end if;
  -- Serialize same-actor commands, including reads, with account suspension.
  -- Acquire this before listing/membership locks so later write paths never
  -- upgrade competing shared actor locks or reverse the command lock order.
  perform id from public.users where id=p_actor and is_active for no key update;
  if p_actor is null or not found then
    raise exception 'An active account is required' using errcode='PT403';
  end if;
  if p_action='manageable_tenants' then
    select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into v_result from (
      select t.id,t.name,m.role from public.tenants t join public.tenant_memberships m on m.tenant_id=t.id
      where t.type in ('team','org') and m.user_id=p_actor and m.status='active' and m.role in ('owner','admin')
      order by t.name,t.id limit 50
    ) q;
    return jsonb_build_object('tenants',v_result);
  end if;
  if p_action='get_my_profile' then
    select * into v_profile from public.teacher_profiles where user_id=p_actor;
    return jsonb_build_object('profile',case when found then to_jsonb(v_profile)-'metadata' else 'null'::jsonb end);
  end if;
  if p_action='upsert_profile' then
    v_request:=(p_payload->>'request_id')::uuid;
    if v_request is null then raise exception 'A profile request id is required; refresh and retry' using errcode='PT400'; end if;
    perform id from public.users where id=p_actor for no key update;
    select jsonb_object_agg(key,value) into v_payload from jsonb_each(p_payload)
      where key=any(array['full_name','bio','avatar_url','subjects','languages','location','timezone','hourly_rate','experience_years',
        'certifications','available','is_public','expected_revision']);
    select * into v_profile_request from public.marketplace_profile_requests where actor_id=p_actor and request_id=v_request;
    if found then
      if v_profile_request.request_payload is distinct from v_payload then
        raise exception 'This profile request was used for different content' using errcode='PT409';
      end if;
      return v_profile_request.receipt;
    end if;
    select * into v_profile from public.teacher_profiles where user_id=p_actor;
    if jsonb_typeof(p_payload->'expected_revision') is distinct from 'number'
      or (p_payload->>'expected_revision')::numeric<>coalesce(v_profile.revision,0) then
      raise exception 'Your profile changed. Reload it before saving.' using errcode='PT409';
    end if;
    if jsonb_typeof(p_payload->'full_name') is distinct from 'string'
      or length(btrim(p_payload->>'full_name')) not between 1 and 120 then
      raise exception 'Add a full name of 1-120 characters' using errcode='PT400';
    end if;
    foreach v_field in array array['bio','location','timezone','avatar_url'] loop
      if p_payload?v_field and p_payload->v_field<>'null'::jsonb and
        (jsonb_typeof(p_payload->v_field)<>'string' or length(p_payload->>v_field)>
          case v_field when 'bio' then 2000 when 'avatar_url' then 500 when 'timezone' then 80 else 120 end) then
        raise exception 'Profile text is invalid or too long' using errcode='PT400';
      end if;
    end loop;
    foreach v_field in array array['is_public','available'] loop
      if p_payload?v_field and jsonb_typeof(p_payload->v_field)<>'boolean' then
        raise exception 'Profile visibility and availability must be boolean' using errcode='PT400';
      end if;
    end loop;
    foreach v_field in array array['hourly_rate','experience_years'] loop
      if p_payload?v_field and p_payload->v_field<>'null'::jsonb and
        (jsonb_typeof(p_payload->v_field)<>'number' or (p_payload->>v_field)::numeric<>trunc((p_payload->>v_field)::numeric)
          or (p_payload->>v_field)::numeric<0 or (p_payload->>v_field)::numeric>2147483647) then
        raise exception 'Rate and experience must be non-negative whole numbers' using errcode='PT400';
      end if;
    end loop;
    v_name:=btrim(p_payload->>'full_name');
    v_subjects:=case when p_payload?'subjects' then public.marketplace_text_array(p_payload->'subjects') else coalesce(v_profile.subjects,'{}') end;
    v_rate:=case when p_payload?'hourly_rate' then (p_payload->>'hourly_rate')::integer else v_profile.hourly_rate end;
    v_years:=case when p_payload?'experience_years' then (p_payload->>'experience_years')::integer else v_profile.experience_years end;
    insert into public.teacher_profiles(user_id,full_name,bio,avatar_url,subjects,languages,location,timezone,hourly_rate,experience_years,certifications,available,is_public)
    values(p_actor,v_name,
      case when p_payload?'bio' then nullif(btrim(p_payload->>'bio'),'') else v_profile.bio end,
      case when p_payload?'avatar_url' then nullif(btrim(p_payload->>'avatar_url'),'') else v_profile.avatar_url end,
      v_subjects,case when p_payload?'languages' then public.marketplace_text_array(p_payload->'languages') else coalesce(v_profile.languages,'{}') end,
      case when p_payload?'location' then nullif(btrim(p_payload->>'location'),'') else v_profile.location end,
      case when p_payload?'timezone' then nullif(btrim(p_payload->>'timezone'),'') else v_profile.timezone end,
      v_rate,v_years,case when p_payload?'certifications' then public.marketplace_text_array(p_payload->'certifications') else coalesce(v_profile.certifications,'{}') end,
      coalesce((p_payload->>'available')::boolean,v_profile.available,true),
      coalesce((p_payload->>'is_public')::boolean,v_profile.is_public,false))
    on conflict(user_id) do update set full_name=excluded.full_name,bio=excluded.bio,avatar_url=excluded.avatar_url,
      subjects=excluded.subjects,languages=excluded.languages,location=excluded.location,timezone=excluded.timezone,
      hourly_rate=excluded.hourly_rate,experience_years=excluded.experience_years,certifications=excluded.certifications,
      available=excluded.available,is_public=excluded.is_public,revision=public.teacher_profiles.revision+1 returning * into v_profile;
    -- verified, metadata, currency and ownership are never copied from input.
    v_result:=jsonb_build_object('profile',to_jsonb(v_profile)-'metadata','request_id',v_request);
    insert into public.marketplace_profile_requests(actor_id,request_id,request_payload,receipt)
      values(p_actor,v_request,v_payload,v_result);
    return v_result;
  end if;
  if p_action='my_applications' then
    select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into v_result from (
      select a.id,a.listing_id,a.status,a.applied_at,a.cover_note,
        jsonb_build_object('id',j.id,'title',j.title,'employment_type',j.employment_type,'tenants',jsonb_build_object('name',t.name)) as job_listings
      from public.job_applications a join public.teacher_profiles p on p.id=a.teacher_id
      join public.job_listings j on j.id=a.listing_id join public.tenants t on t.id=j.tenant_id
      where p.user_id=p_actor order by a.applied_at desc,a.id desc limit 50
    ) q;
    return jsonb_build_object('applications',v_result,'history_window',50);
  end if;
  if p_action in ('post_job','my_jobs') then
    v_tenant:=(p_payload->>'tenant_id')::uuid;
  elsif p_action in ('close_job','list_applications','apply') then
    v_id:=coalesce(p_payload->>'job_id',p_payload->>'listing_id')::uuid;
    select * into v_job from public.job_listings where id=v_id for update;
    if not found then raise exception 'Job not found' using errcode='PT404'; end if;
    v_tenant:=v_job.tenant_id;
  elsif p_action='update_application_status' then
    perform id from public.users where id=p_actor for no key update;
    v_id:=(p_payload->>'application_id')::uuid;
    select * into v_app from public.job_applications where id=v_id;
    if not found then raise exception 'Application not found' using errcode='PT404'; end if;
    select * into v_job from public.job_listings where id=v_app.listing_id for update;
    if not found then raise exception 'Job not found' using errcode='PT404'; end if;
    v_tenant:=v_job.tenant_id;
  else raise exception 'Unknown action' using errcode='PT404';
  end if;
  if p_action='apply' then
    select * into v_profile from public.teacher_profiles where user_id=p_actor;
    if not found then raise exception 'Create a teacher profile first' using errcode='PT400'; end if;
    if v_job.created_by=p_actor then raise exception 'You cannot apply to your own listing' using errcode='PT409'; end if;
    select * into v_app from public.job_applications where listing_id=v_job.id and teacher_id=v_profile.id;
    if found then return jsonb_build_object('application',jsonb_build_object('id',v_app.id,'listing_id',v_app.listing_id,'status',v_app.status,'applied_at',v_app.applied_at)); end if;
    if v_job.status<>'open' or (v_job.expires_at is not null and v_job.expires_at<=clock_timestamp()) then
      raise exception 'This job is no longer accepting applications' using errcode='PT409';
    end if;
    if p_payload?'cover_note' and p_payload->'cover_note'<>'null'::jsonb and
      (jsonb_typeof(p_payload->'cover_note')<>'string' or length(p_payload->>'cover_note')>2000) then
      raise exception 'Cover note must be text up to 2,000 characters' using errcode='PT400';
    end if;
    insert into public.job_applications(listing_id,teacher_id,cover_note)
      values(v_job.id,v_profile.id,nullif(btrim(p_payload->>'cover_note'),'')) returning * into v_app;
    return jsonb_build_object('application',jsonb_build_object('id',v_app.id,'listing_id',v_app.listing_id,'status',v_app.status,'applied_at',v_app.applied_at));
  end if;
  -- Share locks make access checks and reads/writes one operation: concurrent
  -- membership revocation or role changes serialize with the command.
  perform m.id from public.tenant_memberships m join public.tenants t on t.id=m.tenant_id
    where m.tenant_id=v_tenant and m.user_id=p_actor and m.status='active' and m.role in ('owner','admin')
      and t.type in ('team','org') for share of m,t;
  if not found then raise exception 'Only an active owner or administrator can manage this listing' using errcode='PT403'; end if;
  if p_action='my_jobs' then
    select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into v_result from (
      select j.id,j.title,j.employment_type,j.status,j.created_at,j.expires_at,
        (select count(*) from public.job_applications a where a.listing_id=j.id) as application_count
      from public.job_listings j where j.tenant_id=v_tenant order by j.created_at desc,j.id desc limit 50
    ) q;
    return jsonb_build_object('jobs',v_result,'history_window',50);
  end if;
  if p_action='close_job' then
    update public.job_listings set status='closed' where id=v_job.id;
    return jsonb_build_object('ok',true,'job',jsonb_build_object('id',v_job.id,'status','closed'));
  end if;
  if p_action='list_applications' then
    select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into v_result from (
      select a.id,a.listing_id,a.status,a.applied_at,a.cover_note,
        jsonb_build_object('full_name',p.full_name,'bio',p.bio,'subjects',p.subjects,'experience_years',p.experience_years,
          'hourly_rate',p.hourly_rate,'location',p.location,'available',p.available) as teacher_profiles
      from public.job_applications a join public.teacher_profiles p on p.id=a.teacher_id
      where a.listing_id=v_job.id order by a.applied_at desc,a.id desc limit 100
    ) q;
    return jsonb_build_object('applications',v_result,'history_window',100);
  end if;
  if p_action='update_application_status' then
    v_request:=(p_payload->>'request_id')::uuid;
    v_status:=p_payload->>'status'; v_expected:=p_payload->>'expected_status';
    if v_request is null or v_status not in ('shortlisted','rejected','hired') or v_status is null
      or v_expected not in ('pending','shortlisted','rejected','hired') or v_expected is null then
      raise exception 'A decision request, expected status and supported status are required' using errcode='PT400';
    end if;
    select * into v_decision from public.marketplace_application_decisions where actor_id=p_actor and request_id=v_request;
    if found then
      if v_decision.application_id<>v_app.id or v_decision.from_status<>v_expected or v_decision.to_status<>v_status then
        raise exception 'This decision request was used for different content' using errcode='PT409';
      end if;
      return jsonb_build_object('ok',true,'decision',to_jsonb(v_decision),'application',jsonb_build_object('id',v_app.id,'status',v_app.status));
    end if;
    select * into v_app from public.job_applications where id=v_id for update;
    if v_app.status<>v_expected then raise exception 'This application changed. Reload before deciding.' using errcode='PT409'; end if;
    insert into public.marketplace_application_decisions(application_id,actor_id,request_id,from_status,to_status)
      values(v_app.id,p_actor,v_request,v_expected,v_status) returning * into v_decision;
    update public.job_applications set status=v_status where id=v_app.id;
    return jsonb_build_object('ok',true,'decision',to_jsonb(v_decision),'application',jsonb_build_object('id',v_app.id,'status',v_status));
  end if;
  -- post_job: normalize immutable request content before dispatching a write.
  v_request:=(p_payload->>'request_id')::uuid;
  if v_request is null or jsonb_typeof(p_payload->'title') is distinct from 'string'
    or length(btrim(p_payload->>'title')) not between 1 and 160 then
    raise exception 'A request id and job title of 1-160 characters are required' using errcode='PT400';
  end if;
  foreach v_field in array array['description','location'] loop
    if p_payload?v_field and p_payload->v_field<>'null'::jsonb and
      (jsonb_typeof(p_payload->v_field)<>'string' or length(p_payload->>v_field)>case v_field when 'description' then 3000 else 120 end) then
      raise exception 'Job text is invalid or too long' using errcode='PT400';
    end if;
  end loop;
  foreach v_field in array array['salary_min','salary_max','expires_in_days'] loop
    if p_payload?v_field and p_payload->v_field<>'null'::jsonb and
      (jsonb_typeof(p_payload->v_field)<>'number' or (p_payload->>v_field)::numeric<>trunc((p_payload->>v_field)::numeric)
        or (p_payload->>v_field)::numeric<0 or (p_payload->>v_field)::numeric>2147483647) then
      raise exception 'Salary and duration must be non-negative whole numbers' using errcode='PT400';
    end if;
  end loop;
  v_min:=(p_payload->>'salary_min')::integer; v_max:=(p_payload->>'salary_max')::integer;
  v_days:=coalesce((p_payload->>'expires_in_days')::integer,30);
  if (v_min is not null and v_max is not null and v_min>v_max) or v_days not between 1 and 365
    or coalesce(p_payload->>'employment_type','part_time') not in ('full_time','part_time','contract','freelance')
    or (p_payload?'remote_ok' and jsonb_typeof(p_payload->'remote_ok')<>'boolean') then
    raise exception 'Check salary bounds, employment type and a duration of 1-365 days' using errcode='PT400';
  end if;
  v_subjects:=public.marketplace_text_array(p_payload->'subjects');
  v_payload:=jsonb_build_object('tenant_id',v_tenant,'title',btrim(p_payload->>'title'),'description',nullif(btrim(p_payload->>'description'),''),
    'subjects',v_subjects,'employment_type',coalesce(p_payload->>'employment_type','part_time'),'salary_min',v_min,'salary_max',v_max,
    'location',nullif(btrim(p_payload->>'location'),''),'remote_ok',coalesce((p_payload->>'remote_ok')::boolean,false),'expires_in_days',v_days);
  perform id from public.users where id=p_actor for no key update;
  select * into v_job from public.job_listings where created_by=p_actor and request_id=v_request;
  if found then
    if v_job.request_payload is distinct from v_payload then raise exception 'This job request was used for different content' using errcode='PT409'; end if;
  else
    insert into public.job_listings(tenant_id,title,description,subjects,employment_type,salary_min,salary_max,location,remote_ok,created_by,expires_at,request_id,request_payload)
      values(v_tenant,v_payload->>'title',v_payload->>'description',v_subjects,v_payload->>'employment_type',v_min,v_max,v_payload->>'location',
        (v_payload->>'remote_ok')::boolean,p_actor,clock_timestamp()+make_interval(days=>v_days),v_request,v_payload) returning * into v_job;
  end if;
  return jsonb_build_object('job',jsonb_build_object('id',v_job.id,'title',v_job.title,'status',v_job.status,'created_at',v_job.created_at,'request_id',v_job.request_id));
end;
$$;
revoke all on function public.marketplace_command(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.marketplace_command(uuid,text,jsonb) to service_role;
commit;
