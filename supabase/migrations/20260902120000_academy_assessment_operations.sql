-- Additive operational layer. Academic approval is for pilot use, never a CEFR validation claim.
create table public.academy_assessment_paper_reviews (
  id uuid primary key default gen_random_uuid(), academy_id uuid not null,
  paper_id uuid not null, decision text not null check(decision in ('pilot_ready','changes_needed')),
  evidence text not null check(length(trim(evidence)) between 40 and 5000),
  reviewed_by uuid not null references public.users(id), created_at timestamptz not null default now(),
  foreign key(academy_id,paper_id) references public.academy_assessment_papers(academy_id,id)
);
create index academy_assessment_paper_reviews_latest on public.academy_assessment_paper_reviews(academy_id,paper_id,created_at desc);
create function public.academy_assessment_open_gate() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if new.status='open' and old.status='draft' and (select decision from public.academy_assessment_paper_reviews where academy_id=new.academy_id and paper_id=new.paper_id order by created_at desc,id desc limit 1) is distinct from 'pilot_ready' then
    raise exception 'A teacher must review this paper for pilot use before the session opens.';
  end if;
  return new;
end $$;
create trigger academy_assessment_open_gate before update on public.academy_assessment_runs for each row execute function public.academy_assessment_open_gate();
revoke all on function public.academy_assessment_open_gate() from public,anon,authenticated;

alter table public.academy_assessment_runs
  add column branch_id uuid,
  add column teaching_user_id uuid references public.users(id),
  add column expected_level text not null default '' check(expected_level in ('','Pre-A1','A1','A2','B1','B2','C1','C2')),
  add foreign key(academy_id,branch_id) references public.academy_branches(academy_id,id),
  add column require_check_in boolean not null default false,
  add column require_moderation boolean not null default false;
alter table public.academy_assessment_candidates
  add column checked_in_at timestamptz,
  add column checked_in_by uuid references public.users(id),
  add column seat text not null default '' check(length(seat)<=40),
  add column extra_minutes integer not null default 0 check(extra_minutes between 0 and 120),
  add column accommodation_note text not null default '',
  add column grader_id uuid references public.users(id),
  add column grading_due_at timestamptz,
  add column moderated_by uuid references public.users(id),
  add column moderated_at timestamptz,
  add column moderation_note text not null default '',
  add column report_version integer not null default 1;
create unique index academy_assessment_unique_seat on public.academy_assessment_candidates(run_id,lower(seat)) where seat<>'';

create table public.academy_assessment_incidents (
  id uuid primary key default gen_random_uuid(), academy_id uuid not null, candidate_id uuid not null,
  kind text not null check(kind in ('technical','wellbeing','integrity','appeal')),
  note text not null check(length(trim(note)) between 10 and 3000),
  status text not null default 'open' check(status in ('open','resolved')),
  resolution text not null default '', created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(), resolved_by uuid references public.users(id), resolved_at timestamptz,
  foreign key(academy_id,candidate_id) references public.academy_assessment_candidates(academy_id,id)
);
create index academy_assessment_incidents_candidate on public.academy_assessment_incidents(academy_id,candidate_id,status);
create unique index academy_assessment_open_appeal on public.academy_assessment_incidents(candidate_id) where kind='appeal' and status='open';
create table public.academy_assessment_report_history (
  id uuid primary key default gen_random_uuid(), academy_id uuid not null, candidate_id uuid not null,
  version integer not null, snapshot jsonb not null, reason text not null,
  archived_by uuid not null references public.users(id), created_at timestamptz not null default now(),
  unique(candidate_id,version),
  foreign key(academy_id,candidate_id) references public.academy_assessment_candidates(academy_id,id)
);
create table public.academy_assessment_certificates (
  id uuid primary key default gen_random_uuid(), academy_id uuid not null, candidate_id uuid not null,
  version integer not null, public_token uuid not null default gen_random_uuid() unique,
  snapshot jsonb not null, issued_by uuid not null references public.users(id), issued_at timestamptz not null default now(),
  revoked_at timestamptz, revoked_by uuid references public.users(id), revocation_reason text,
  public_consent boolean not null default false, unique(candidate_id,version),
  foreign key(academy_id,candidate_id) references public.academy_assessment_candidates(academy_id,id)
);

-- Retain course policies as versioned evidence, not editable global score-to-CEFR cutoffs.
create table public.academy_assessment_course_rules (
  id uuid primary key default gen_random_uuid(), academy_id uuid not null, paper_id uuid not null,
  course_name text not null check(length(trim(course_name)) between 1 and 200),
  minimum_percent numeric not null check(minimum_percent between 0 and 100),
  maximum_percent numeric not null check(maximum_percent between minimum_percent and 100),
  required_skills jsonb not null default '[]' check(jsonb_typeof(required_skills)='array'),
  evidence text not null check(length(trim(evidence)) between 40 and 5000),
  status text not null default 'active' check(status in ('active','retired')),
  created_by uuid not null references public.users(id), created_at timestamptz not null default now(),
  foreign key(academy_id,paper_id) references public.academy_assessment_papers(academy_id,id)
);
create table public.academy_assessment_support_plans (
  id uuid primary key default gen_random_uuid(), academy_id uuid not null, candidate_id uuid not null,
  assigned_to uuid not null references public.users(id), goal text not null check(length(trim(goal)) between 10 and 3000),
  due_on date not null, status text not null default 'open' check(status in ('open','completed','cancelled')),
  outcome text not null default '', created_by uuid not null references public.users(id), created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key(academy_id,candidate_id) references public.academy_assessment_candidates(academy_id,id)
);

-- Coordination orders record an agreed service and responsible staff. They do not claim a
-- Schood operator has accepted an outsourced job or collect money without an explicit charge.
create table public.academy_assessment_service_orders (
  id uuid primary key default gen_random_uuid(), academy_id uuid not null, run_id uuid not null unique,
  service_kind text not null check(service_kind in ('placement','exam','audit')),
  status text not null default 'requested' check(status in ('requested','confirmed','in_progress','delivered','cancelled')),
  coordinator_id uuid references public.users(id), due_at timestamptz not null,
  brief text not null check(length(trim(brief)) between 10 and 5000), provider_name text not null default '',
  agreed_amount bigint not null default 0 check(agreed_amount>=0), currency text not null default 'UZS' check(currency='UZS'),
  acceptance_note text not null default '', delivery_note text not null default '',
  created_by uuid not null references public.users(id), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(academy_id,run_id) references public.academy_assessment_runs(academy_id,id)
);
create table public.academy_assessment_packages (
  id uuid primary key default gen_random_uuid(), academy_id uuid not null references public.tenants(id),
  name text not null check(length(trim(name)) between 1 and 200), assessments integer not null check(assessments between 1 and 100),
  price bigint not null check(price between 0 and 1000000000), currency text not null default 'UZS' check(currency='UZS'),
  valid_days integer not null check(valid_days between 1 and 730),
  created_by uuid not null references public.users(id), created_at timestamptz not null default now(), unique(academy_id,id)
);
create function public.academy_assessment_delivery_gate() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if new.status='delivered' and old.status<>'delivered' then
    if not exists(select 1 from public.academy_assessment_candidates where run_id=new.run_id)
       or exists(select 1 from public.academy_assessment_candidates where run_id=new.run_id and status<>'released')
       or exists(select 1 from public.academy_assessment_incidents i join public.academy_assessment_candidates c on c.id=i.candidate_id where c.run_id=new.run_id and i.status='open' and i.kind in ('integrity','appeal')) then
      raise exception 'Share every report and resolve result concerns before confirming delivery.';
    end if;
  end if;
  return new;
end $$;
create trigger academy_assessment_delivery_gate before update on public.academy_assessment_service_orders for each row execute function public.academy_assessment_delivery_gate();
revoke all on function public.academy_assessment_delivery_gate() from public,anon,authenticated;
create table public.academy_assessment_allowances (
  id uuid primary key default gen_random_uuid(), academy_id uuid not null, contact_id uuid not null, package_id uuid not null,
  charge_id uuid, included_subscription_id uuid, expires_at timestamptz not null,
  assessments integer not null check(assessments>0), used integer not null default 0 check(used>=0 and used<=assessments),
  idempotency_key text not null, created_by uuid not null references public.users(id), created_at timestamptz not null default now(),
  unique(academy_id,id), unique(academy_id,idempotency_key),
  foreign key(academy_id,contact_id) references public.academy_contacts(academy_id,id),
  foreign key(academy_id,package_id) references public.academy_assessment_packages(academy_id,id),
  foreign key(academy_id,contact_id,charge_id) references public.academy_charges(academy_id,contact_id,id),
  foreign key(academy_id,contact_id,included_subscription_id) references public.academy_subscriptions(academy_id,contact_id,id)
);
create table public.academy_assessment_allowance_uses (
  academy_id uuid not null, candidate_id uuid primary key, allowance_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key(academy_id,candidate_id) references public.academy_assessment_candidates(academy_id,id),
  foreign key(academy_id,allowance_id) references public.academy_assessment_allowances(academy_id,id)
);

alter table public.academy_assessment_paper_reviews enable row level security;
revoke all on public.academy_assessment_paper_reviews from public,anon,authenticated;
grant all on public.academy_assessment_paper_reviews to service_role;
alter table public.academy_assessment_incidents enable row level security;
revoke all on public.academy_assessment_incidents from public,anon,authenticated;
grant all on public.academy_assessment_incidents to service_role;
alter table public.academy_assessment_report_history enable row level security;
revoke all on public.academy_assessment_report_history from public,anon,authenticated;
grant all on public.academy_assessment_report_history to service_role;
alter table public.academy_assessment_certificates enable row level security;
revoke all on public.academy_assessment_certificates from public,anon,authenticated;
grant all on public.academy_assessment_certificates to service_role;
alter table public.academy_assessment_course_rules enable row level security;
revoke all on public.academy_assessment_course_rules from public,anon,authenticated;
grant all on public.academy_assessment_course_rules to service_role;
alter table public.academy_assessment_support_plans enable row level security;
revoke all on public.academy_assessment_support_plans from public,anon,authenticated;
grant all on public.academy_assessment_support_plans to service_role;
alter table public.academy_assessment_service_orders enable row level security;
revoke all on public.academy_assessment_service_orders from public,anon,authenticated;
grant all on public.academy_assessment_service_orders to service_role;
alter table public.academy_assessment_packages enable row level security;
revoke all on public.academy_assessment_packages from public,anon,authenticated;
grant all on public.academy_assessment_packages to service_role;
alter table public.academy_assessment_allowances enable row level security;
revoke all on public.academy_assessment_allowances from public,anon,authenticated;
grant all on public.academy_assessment_allowances to service_role;
alter table public.academy_assessment_allowance_uses enable row level security;
revoke all on public.academy_assessment_allowance_uses from public,anon,authenticated;
grant all on public.academy_assessment_allowance_uses to service_role;

-- Keep the tested scoring engine behind a gated, transactionally locked command layer.
alter function public.academy_assessment_candidate_command(uuid,uuid,text,uuid,jsonb) rename to academy_assessment_candidate_core;
create function public.academy_assessment_candidate_command(p_academy_id uuid,p_candidate_id uuid,p_action text,p_actor_id uuid,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.academy_assessment_candidates%rowtype; r public.academy_assessment_runs%rowtype; result jsonb;
begin
  select * into strict c from public.academy_assessment_candidates where academy_id=p_academy_id and id=p_candidate_id;
  select * into strict r from public.academy_assessment_runs where academy_id=p_academy_id and id=c.run_id for share;
  select * into strict c from public.academy_assessment_candidates where id=p_candidate_id for update;
  if p_action='start' and c.status='invited' and r.require_check_in and c.checked_in_at is null then raise exception 'Please check in with the exam desk before starting.'; end if;
  if p_action='review' and c.grader_id is not null and c.grader_id<>p_actor_id then raise exception 'This work is assigned to another teacher. Ask the exam coordinator to reassign it.'; end if;
  if p_action='release' and c.status<>'released' then
    if exists(select 1 from public.academy_assessment_incidents where candidate_id=c.id and status='open' and kind in ('integrity','appeal')) then raise exception 'Resolve the open review or appeal before sharing results.'; end if;
    if r.require_moderation and (c.moderated_at is null or c.moderated_by=c.reviewed_by) then raise exception 'A second teacher must moderate this report before sharing.'; end if;
  end if;
  result:=public.academy_assessment_candidate_core(p_academy_id,p_candidate_id,p_action,p_actor_id,p_payload);
  if p_action='start' and c.status='invited' and c.extra_minutes>0 then
    update public.academy_assessment_candidates set expires_at=least(r.ends_at,expires_at+make_interval(mins=>c.extra_minutes)) where id=c.id returning to_jsonb(academy_assessment_candidates.*) into result;
  end if;
  if p_action='review' then
    update public.academy_assessment_candidates set moderated_by=null,moderated_at=null,moderation_note='' where id=c.id returning to_jsonb(academy_assessment_candidates.*) into result;
  end if;
  return result;
end $$;
revoke all on function public.academy_assessment_candidate_command(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.academy_assessment_candidate_command(uuid,uuid,text,uuid,jsonb) to service_role;

create function public.academy_assessment_ops_command(p_academy_id uuid,p_candidate_id uuid,p_action text,p_actor_id uuid,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.academy_assessment_candidates%rowtype; r public.academy_assessment_runs%rowtype; cert public.academy_assessment_certificates%rowtype; v_note text:=trim(coalesce(p_payload->>'note','')); v_result jsonb;
begin
  select * into strict c from public.academy_assessment_candidates where academy_id=p_academy_id and id=p_candidate_id;
  select * into strict r from public.academy_assessment_runs where id=c.run_id for share;
  select * into strict c from public.academy_assessment_candidates where id=p_candidate_id for update;
  if p_action='check_in' then
    if c.status<>'invited' then raise exception 'Check-in and accommodations must be set before the student starts.'; end if;
    if (p_payload->>'extra_minutes')::integer>0 and length(v_note)<10 then raise exception 'Record the agreed accommodation, without medical details.'; end if;
    update public.academy_assessment_candidates set checked_in_at=coalesce(checked_in_at,now()),checked_in_by=p_actor_id,seat=trim(coalesce(p_payload->>'seat','')),extra_minutes=coalesce((p_payload->>'extra_minutes')::integer,0),accommodation_note=v_note where id=c.id;
  elsif p_action='assign_grader' then
    if c.status='released' then raise exception 'Reopen the report before changing the reviewer.'; end if;
    update public.academy_assessment_candidates set grader_id=nullif(p_payload->>'grader_id','')::uuid,grading_due_at=nullif(p_payload->>'grading_due_at','')::timestamptz where id=c.id;
  elsif p_action='moderate' then
    if c.status<>'reviewed' or c.reviewed_by=p_actor_id or length(v_note)<20 then raise exception 'A different teacher must check the reviewed report and explain their moderation.'; end if;
    update public.academy_assessment_candidates set moderated_by=p_actor_id,moderated_at=now(),moderation_note=v_note where id=c.id;
  elsif p_action='incident' then
    insert into public.academy_assessment_incidents(academy_id,candidate_id,kind,note,created_by) values(p_academy_id,c.id,p_payload->>'kind',v_note,p_actor_id) returning to_jsonb(academy_assessment_incidents.*) into v_result;
    if p_payload->>'kind' in ('integrity','appeal') then
      update public.academy_assessment_certificates set revoked_at=coalesce(revoked_at,now()),revoked_by=coalesce(revoked_by,p_actor_id),revocation_reason=coalesce(revocation_reason,'Result under review') where candidate_id=c.id;
    end if;
    return v_result;
  elsif p_action='resolve_incident' then
    if length(v_note)<10 then raise exception 'Explain how the concern was resolved.'; end if;
    update public.academy_assessment_incidents set status='resolved',resolution=v_note,resolved_at=now(),resolved_by=p_actor_id where academy_id=p_academy_id and candidate_id=c.id and id=(p_payload->>'incident_id')::uuid and status='open';
    if not found then raise exception 'This concern is already resolved or unavailable.'; end if;
  elsif p_action='reopen' then
    if c.status<>'released' or length(v_note)<20 then raise exception 'Explain why the shared report needs another review.'; end if;
    insert into public.academy_assessment_report_history(academy_id,candidate_id,version,snapshot,reason,archived_by) values(p_academy_id,c.id,c.report_version,to_jsonb(c),v_note,p_actor_id);
    update public.academy_assessment_certificates set revoked_at=coalesce(revoked_at,now()),revoked_by=coalesce(revoked_by,p_actor_id),revocation_reason=coalesce(revocation_reason,'Report replaced after review') where candidate_id=c.id;
    update public.academy_assessment_candidates set status='submitted',report_version=report_version+1,released_at=null,reviewed_at=null,reviewed_by=null,moderated_at=null,moderated_by=null where id=c.id;
  elsif p_action='certificate' then
    if c.status<>'released' then raise exception 'Share the reviewed report before issuing a certificate.'; end if;
    if exists(select 1 from public.academy_assessment_incidents where candidate_id=c.id and status='open' and kind in ('integrity','appeal')) then raise exception 'Resolve the review before issuing a certificate.'; end if;
    -- Snapshot is assembled by the authenticated server, never by the browser.
    insert into public.academy_assessment_certificates(academy_id,candidate_id,version,snapshot,issued_by) values(p_academy_id,c.id,c.report_version,p_payload->'snapshot',p_actor_id) on conflict(candidate_id,version) do nothing;
    select * into strict cert from public.academy_assessment_certificates where candidate_id=c.id and version=c.report_version;
    return to_jsonb(cert);
  elsif p_action='certificate_consent' then
    update public.academy_assessment_certificates set public_consent=coalesce((p_payload->>'consent')::boolean,false) where candidate_id=c.id and version=c.report_version and revoked_at is null;
  elsif p_action='revoke_certificate' then
    if length(v_note)<10 then raise exception 'Record a reason for withdrawing the certificate.'; end if;
    update public.academy_assessment_certificates set revoked_at=now(),revoked_by=p_actor_id,revocation_reason=v_note where candidate_id=c.id and version=c.report_version and revoked_at is null;
  else raise exception 'Unknown exam desk action.';
  end if;
  select to_jsonb(academy_assessment_candidates.*) into v_result from public.academy_assessment_candidates where id=c.id;
  return v_result;
end $$;
revoke all on function public.academy_assessment_ops_command(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.academy_assessment_ops_command(uuid,uuid,text,uuid,jsonb) to service_role;

create function public.academy_assessment_grant_package(p_academy_id uuid,p_contact_id uuid,p_package_id uuid,p_subscription_id uuid,p_actor_id uuid,p_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare p public.academy_assessment_packages%rowtype; a public.academy_assessment_allowances%rowtype; charge uuid; v_key text;
begin
  if length(trim(p_key)) not between 8 and 180 then raise exception 'A request reference is required.'; end if;
  perform 1 from public.academy_contacts where academy_id=p_academy_id and id=p_contact_id for update;
  if not found then raise exception 'Student not found.'; end if;
  select * into a from public.academy_assessment_allowances where academy_id=p_academy_id and idempotency_key=p_key;
  if found then
    if a.contact_id<>p_contact_id or a.package_id<>p_package_id or a.included_subscription_id is distinct from p_subscription_id then raise exception 'This request reference belongs to a different package grant.'; end if;
    return to_jsonb(a);
  end if;
  select * into strict p from public.academy_assessment_packages where academy_id=p_academy_id and id=p_package_id;
  if p_subscription_id is not null then
    perform 1 from public.academy_subscriptions where academy_id=p_academy_id and id=p_subscription_id and contact_id=p_contact_id and status='active' and starts_on<=current_date and (ends_on is null or ends_on>=current_date) for share;
    if not found then raise exception 'Choose a current active subscription for this learner.'; end if;
  elsif p.price>0 then
    v_key:='assessment-package:'||p_key;
    insert into public.academy_charges(academy_id,contact_id,charge_number,charge_type,due_on,original_amount,discount_amount,net_amount,currency,description,idempotency_key,created_by,metadata)
    values(p_academy_id,p_contact_id,'AS-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),'exam',current_date,p.price,0,p.price,'UZS',p.name,v_key,p_actor_id,jsonb_build_object('assessment_package_id',p.id)) returning id into charge;
    insert into public.academy_account_ledger_entries(academy_id,contact_id,charge_id,entry_type,amount,currency,reason,idempotency_key,created_by)
    values(p_academy_id,p_contact_id,charge,'charge',p.price,'UZS',p.name,v_key,p_actor_id);
  end if;
  insert into public.academy_assessment_allowances(academy_id,contact_id,package_id,charge_id,included_subscription_id,expires_at,assessments,idempotency_key,created_by)
  values(p_academy_id,p_contact_id,p.id,charge,p_subscription_id,now()+make_interval(days=>p.valid_days),p.assessments,p_key,p_actor_id) returning * into a;
  return to_jsonb(a);
end $$;
create function public.academy_assessment_use_allowance(p_academy_id uuid,p_candidate_id uuid,p_allowance_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.academy_assessment_allowances%rowtype; c public.academy_assessment_candidates%rowtype; prior uuid;
begin
  select * into strict c from public.academy_assessment_candidates where academy_id=p_academy_id and id=p_candidate_id for update;
  select allowance_id into prior from public.academy_assessment_allowance_uses where candidate_id=c.id;
  if found then
    if prior<>p_allowance_id then raise exception 'This assessment already uses another package.'; end if;
    return jsonb_build_object('used',true);
  end if;
  select * into strict a from public.academy_assessment_allowances where academy_id=p_academy_id and id=p_allowance_id for update;
  if a.contact_id<>c.contact_id or a.expires_at<=now() or a.used>=a.assessments then raise exception 'Choose an available, unexpired package for this learner.'; end if;
  if a.charge_id is not null and exists(select 1 from public.academy_charges where id=a.charge_id and status in ('void','written_off')) then raise exception 'This package charge has been withdrawn.'; end if;
  insert into public.academy_assessment_allowance_uses(academy_id,candidate_id,allowance_id) values(p_academy_id,c.id,a.id);
  update public.academy_assessment_allowances set used=used+1 where id=a.id;
  return jsonb_build_object('used',true);
end $$;
revoke all on function public.academy_assessment_grant_package(uuid,uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.academy_assessment_use_allowance(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.academy_assessment_grant_package(uuid,uuid,uuid,uuid,uuid,text) to service_role;
grant execute on function public.academy_assessment_use_allowance(uuid,uuid,uuid) to service_role;
