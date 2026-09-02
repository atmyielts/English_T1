-- Placement, exam days and academic progress share immutable papers and evidence.
-- Only the authenticated Academy Edge service can access these tables/functions.
create table public.academy_assessment_papers (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id),
  title text not null check (length(title) between 1 and 200),
  duration_minutes integer not null check (duration_minutes between 5 and 240),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 100),
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  unique(academy_id,id)
);
create table public.academy_assessment_runs (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id),
  paper_id uuid not null,
  classroom_id uuid,
  title text not null check (length(title) between 1 and 200),
  kind text not null check (kind in ('placement','exam','audit')),
  status text not null default 'draft' check (status in ('draft','open','closed')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null check (capacity between 1 and 500),
  room text not null default '',
  instructions text not null default '',
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  check(ends_at > starts_at),
  unique(academy_id,id),
  foreign key(academy_id,paper_id) references public.academy_assessment_papers(academy_id,id),
  foreign key(academy_id,classroom_id) references public.academy_classrooms(academy_id,id)
);
create table public.academy_assessment_candidates (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id),
  run_id uuid not null,
  contact_id uuid not null,
  lead_id uuid,
  candidate_code text not null default upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
  status text not null default 'invited' check(status in ('invited','in_progress','submitted','reviewed','released')),
  started_at timestamptz,
  expires_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  released_at timestamptz,
  reviewed_by uuid references public.users(id),
  answers jsonb not null default '{}' check(jsonb_typeof(answers)='object'),
  marks jsonb not null default '{}' check(jsonb_typeof(marks)='object'),
  report jsonb not null default '{}' check(jsonb_typeof(report)='object'),
  review_notes text not null default '',
  created_at timestamptz not null default now(),
  unique(academy_id,id), unique(run_id,contact_id), unique(run_id,candidate_code),
  foreign key(academy_id,run_id) references public.academy_assessment_runs(academy_id,id),
  foreign key(academy_id,contact_id) references public.academy_contacts(academy_id,id),
  foreign key(academy_id,lead_id) references public.academy_leads(academy_id,id)
);
create index academy_assessment_runs_academy_idx on public.academy_assessment_runs(academy_id,created_at desc);
create index academy_assessment_candidates_contact_idx on public.academy_assessment_candidates(academy_id,contact_id,created_at desc);
create index academy_assessment_candidates_run_idx on public.academy_assessment_candidates(academy_id,run_id,status);
alter table public.academy_assessment_papers enable row level security;
alter table public.academy_assessment_runs enable row level security;
alter table public.academy_assessment_candidates enable row level security;
revoke all on public.academy_assessment_papers, public.academy_assessment_runs, public.academy_assessment_candidates from anon, authenticated;
grant all on public.academy_assessment_papers, public.academy_assessment_runs, public.academy_assessment_candidates to service_role;

create function public.academy_assessment_paper_immutable()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  raise exception 'Saved assessment papers cannot be changed. Prepare a new paper instead.';
end $$;
create trigger academy_assessment_paper_immutable
before update on public.academy_assessment_papers
for each row execute function public.academy_assessment_paper_immutable();
revoke all on function public.academy_assessment_paper_immutable() from public,anon,authenticated;

create function public.academy_register_assessment_candidates(p_academy_id uuid,p_run_id uuid,p_contact_ids uuid[])
returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_run public.academy_assessment_runs%rowtype; v_count integer; v_new integer;
begin
  select * into strict v_run from public.academy_assessment_runs where academy_id=p_academy_id and id=p_run_id for update;
  if v_run.status='closed' or now()>=v_run.ends_at then raise exception 'Registration is closed.'; end if;
  if coalesce(cardinality(p_contact_ids),0) not between 1 and 500 then raise exception 'Select between 1 and 500 students.'; end if;
  if exists(select 1 from unnest(p_contact_ids) c(id) where not exists(select 1 from public.academy_contacts a where a.academy_id=p_academy_id and a.id=c.id)) then raise exception 'Student not found in this academy.'; end if;
  select count(*) into v_count from public.academy_assessment_candidates where run_id=p_run_id;
  select count(distinct c.id) into v_new from unnest(p_contact_ids) c(id) where not exists(select 1 from public.academy_assessment_candidates a where a.run_id=p_run_id and a.contact_id=c.id);
  if v_count+v_new>v_run.capacity then raise exception 'This exam session has no remaining seats for this selection.'; end if;
  insert into public.academy_assessment_candidates(academy_id,run_id,contact_id) select p_academy_id,p_run_id,c.id from (select distinct unnest(p_contact_ids) id) c on conflict(run_id,contact_id) do nothing;
  return v_new;
end $$;

create function public.academy_assessment_candidate_command(p_academy_id uuid,p_candidate_id uuid,p_action text,p_actor_id uuid,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_candidate public.academy_assessment_candidates%rowtype;
  v_run public.academy_assessment_runs%rowtype;
  v_paper public.academy_assessment_papers%rowtype;
  v_item jsonb; v_answers jsonb; v_marks jsonb; v_mark numeric; v_key text;
begin
  -- Lock the run before the candidate, matching registration and session closing.
  select * into strict v_candidate from public.academy_assessment_candidates where academy_id=p_academy_id and id=p_candidate_id;
  select * into strict v_run from public.academy_assessment_runs where academy_id=p_academy_id and id=v_candidate.run_id for share;
  select * into strict v_candidate from public.academy_assessment_candidates where academy_id=p_academy_id and id=p_candidate_id for update;
  select * into strict v_paper from public.academy_assessment_papers where academy_id=p_academy_id and id=v_run.paper_id;
  if p_action='collect' then
    if v_candidate.status in ('submitted','reviewed','released') then return to_jsonb(v_candidate); end if;
    if v_candidate.status<>'in_progress' or (now()<v_candidate.expires_at and v_run.status='open') then raise exception 'Wait until the assessment ends before collecting saved answers.'; end if;
    p_action:='submit';
    p_payload:=jsonb_build_object('answers',v_candidate.answers);
  end if;
  if p_action='start' then
    if v_candidate.status='in_progress' then return to_jsonb(v_candidate); end if;
    if v_candidate.status<>'invited' then raise exception 'This assessment has already been submitted.'; end if;
    if v_run.status<>'open' or now()<v_run.starts_at or now()>=v_run.ends_at then raise exception 'This assessment is not open. Check the session time with your center.'; end if;
    update public.academy_assessment_candidates set status='in_progress',started_at=now(),expires_at=least(v_run.ends_at,now()+make_interval(mins=>v_paper.duration_minutes)) where id=v_candidate.id returning * into v_candidate;
  elsif p_action in ('save','submit') then
    if p_action='submit' and v_candidate.status in ('submitted','reviewed','released') then return to_jsonb(v_candidate); end if;
    if v_candidate.status<>'in_progress' then raise exception 'Start this assessment before saving answers.'; end if;
    if p_action='save' and (now()>=v_candidate.expires_at or v_run.status<>'open') then raise exception 'Time has ended. Submit your saved answers.'; end if;
    v_answers:=coalesce(p_payload->'answers','{}');
    if jsonb_typeof(v_answers)<>'object' or octet_length(v_answers::text)>150000 then raise exception 'Answers are too long.'; end if;
    -- Never accept new answers after the server deadline, including browser clock changes.
    if now()>=v_candidate.expires_at or v_run.status<>'open' then v_answers:=v_candidate.answers; end if;
    for v_key in select jsonb_object_keys(v_answers) loop
      if not exists(select 1 from jsonb_array_elements(v_paper.items) q where q->>'id'=v_key) then raise exception 'Unknown question.'; end if;
      if jsonb_typeof(v_answers->v_key) not in ('string','number','null') then raise exception 'Invalid answer.'; end if;
    end loop;
    v_marks:='{}';
    if p_action='submit' then
      for v_item in select * from jsonb_array_elements(v_paper.items) loop
        if v_item->>'kind'='choice' then
          v_marks:=v_marks||jsonb_build_object(v_item->>'id',case when v_answers->(v_item->>'id')=v_item->'correct' then (v_item->>'points')::numeric else 0 end);
        end if;
      end loop;
    end if;
    update public.academy_assessment_candidates set answers=v_answers, marks=case when p_action='submit' then v_marks else marks end,status=case when p_action='submit' then 'submitted' else status end,submitted_at=case when p_action='submit' then now() else submitted_at end where id=v_candidate.id returning * into v_candidate;
  elsif p_action='review' then
    if v_candidate.status not in ('submitted','reviewed') then raise exception 'Only submitted, unreleased work can be reviewed.'; end if;
    if length(trim(coalesce(p_payload->>'review_notes','')))<10 or length(trim(coalesce(p_payload->'report'->>'basis','')))<20 then raise exception 'Add review notes and explain the evidence before approving.'; end if;
    v_marks:=v_candidate.marks;
    for v_item in select * from jsonb_array_elements(v_paper.items) loop
      if v_item->>'kind'<>'choice' then
        if jsonb_typeof(p_payload->'marks'->(v_item->>'id')) is distinct from 'number' then raise exception 'Enter a valid mark for every teacher-reviewed task.'; end if;
        v_mark:=(p_payload->'marks'->>(v_item->>'id'))::numeric;
        if v_mark is null or v_mark<0 or v_mark>(v_item->>'points')::numeric then raise exception 'Enter a valid mark for every teacher-reviewed task.'; end if;
        v_marks:=v_marks||jsonb_build_object(v_item->>'id',v_mark);
      end if;
    end loop;
    update public.academy_assessment_candidates set marks=v_marks, report=p_payload->'report',review_notes=p_payload->>'review_notes',reviewed_by=p_actor_id,reviewed_at=now(),status='reviewed' where id=v_candidate.id returning * into v_candidate;
  elsif p_action='release' then
    if v_candidate.status='released' then return to_jsonb(v_candidate); end if;
    if v_candidate.status<>'reviewed' then raise exception 'A teacher must approve the report before it is shared.'; end if;
    update public.academy_assessment_candidates set status='released',released_at=now() where id=v_candidate.id returning * into v_candidate;
  else raise exception 'Unknown assessment action.';
  end if;
  return to_jsonb(v_candidate);
end $$;
revoke all on function public.academy_register_assessment_candidates(uuid,uuid,uuid[]) from public,anon,authenticated;
revoke all on function public.academy_assessment_candidate_command(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.academy_register_assessment_candidates(uuid,uuid,uuid[]) to service_role;
grant execute on function public.academy_assessment_candidate_command(uuid,uuid,text,uuid,jsonb) to service_role;

-- Intake registration does not convert the lead or create a paid enrollment.
create function public.academy_register_assessment_lead(p_academy_id uuid,p_run_id uuid,p_lead_id uuid,p_actor_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_lead public.academy_leads%rowtype; v_contact uuid; v_email_contact uuid; v_phone_contact uuid; v_run public.academy_assessment_runs%rowtype;
begin
  select * into strict v_run from public.academy_assessment_runs where academy_id=p_academy_id and id=p_run_id for update;
  if v_run.kind<>'placement' or v_run.classroom_id is not null then raise exception 'Choose an intake placement session for this applicant.'; end if;
  select * into strict v_lead from public.academy_leads where academy_id=p_academy_id and id=p_lead_id for update;
  if v_lead.status<>'open' then raise exception 'This applicant is not in the open admissions pipeline.'; end if;
  if nullif(trim(v_lead.email),'') is null then raise exception 'Add the learner email in Admissions before registering.'; end if;
  select contact_id into v_contact from public.academy_assessment_candidates where academy_id=p_academy_id and lead_id=p_lead_id limit 1;
  if v_contact is null then
    select id into v_email_contact from public.academy_contacts where academy_id=p_academy_id and lower(email)=lower(v_lead.email) limit 1;
    select id into v_phone_contact from public.academy_contacts where academy_id=p_academy_id and phone=v_lead.phone limit 1;
    if v_phone_contact is not null and v_email_contact is distinct from v_phone_contact then raise exception 'This phone belongs to another student record. Resolve the duplicate in Contacts first.'; end if;
    v_contact:=v_email_contact;
    if v_contact is null then
      insert into public.academy_contacts(academy_id,first_name,last_name,email,phone,status,metadata,created_by,primary_branch_id)
      values(p_academy_id,split_part(trim(v_lead.full_name),' ',1),trim(substr(trim(v_lead.full_name),length(split_part(trim(v_lead.full_name),' ',1))+1)),lower(trim(v_lead.email)),v_lead.phone,'trial',jsonb_build_object('placement_lead_id',p_lead_id),p_actor_id,coalesce(v_lead.preferred_branch_id,v_lead.branch_id)) returning id into v_contact;
    end if;
  end if;
  perform public.academy_register_assessment_candidates(p_academy_id,p_run_id,array[v_contact]);
  if exists(select 1 from public.academy_assessment_candidates where run_id=p_run_id and contact_id=v_contact and lead_id is not null and lead_id<>p_lead_id) then raise exception 'This student is already registered through a different applicant record.'; end if;
  update public.academy_assessment_candidates set lead_id=p_lead_id where academy_id=p_academy_id and run_id=p_run_id and contact_id=v_contact;
  return v_contact;
end $$;
revoke all on function public.academy_register_assessment_lead(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.academy_register_assessment_lead(uuid,uuid,uuid,uuid) to service_role;
