-- Full database-side erasure candidate; disabled until hosted retention,
-- provider/source, storage and financial-consumer qualification is complete.
-- Auth's soft-delete transaction owns this trigger: every database effect is
-- committed with credential removal, or every effect rolls back together.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

create table if not exists public.account_closure_config (
  id boolean primary key default true check(id),
  enabled boolean not null default false
);
insert into public.account_closure_config(id,enabled) values(true,false) on conflict(id) do nothing;
alter table public.account_closure_config enable row level security;
revoke all on public.account_closure_config from public,anon,authenticated,service_role;
grant select on public.account_closure_config to service_role;

-- The database owner may qualify a disposable QA identity without changing the
-- global flag. This is not a client feature or an alternate deletion authority.
-- The normal ownership, billing, media and transactional guards still apply.
create table if not exists public.account_closure_qualifications (
  user_id uuid primary key references public.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  check(expires_at>created_at and expires_at<=created_at+interval '1 hour')
);
alter table public.account_closure_qualifications enable row level security;
revoke all on public.account_closure_qualifications from public,anon,authenticated,service_role;

-- A retained personal billing scope must not become renewable again after its
-- owner is erased, including legacy scopes that have no created_by value.
-- Only identifiers are retained; this table is private even to service clients.
create table if not exists public.account_closed_personal_tenants (
  tenant_id uuid primary key references public.tenants(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict
);
alter table public.account_closed_personal_tenants enable row level security;
revoke all on public.account_closed_personal_tenants from public,anon,authenticated,service_role;

create or replace function public.account_closure_is_enabled(p_actor uuid)
returns boolean language sql volatile security definer
set search_path=pg_catalog,public
as $$
  select exists(select 1 from public.account_closure_config where id and enabled)
    or exists(select 1 from public.account_closure_qualifications
      where user_id=p_actor and expires_at>clock_timestamp());
$$;
revoke all on function public.account_closure_is_enabled(uuid) from public,anon,authenticated,service_role;

-- Legacy personal scopes may have no creator attribution. Current ownership
-- is authoritative too. The caller first holds the ownership-preflight locks;
-- any institutional scope must have another owner and is excluded here.
create or replace function public.account_personal_tenants(p_actor uuid)
returns uuid[] language sql stable security definer
set search_path=pg_catalog,public
as $$
  select coalesce(array_agg(t.id order by t.id),'{}'::uuid[]) from public.tenants t
    where t.type='personal'
    and (t.created_by=p_actor or exists(select 1 from public.tenant_memberships m
      where m.tenant_id=t.id and m.user_id=p_actor and m.role='owner' and m.status='active'))
    and not exists(select 1 from public.tenant_memberships m
      where m.tenant_id=t.id and m.user_id<>p_actor and m.status='active');
$$;
revoke all on function public.account_personal_tenants(uuid) from public,anon,authenticated,service_role;

create or replace function public.account_personal_erasure_tables()
returns text[] language sql immutable
set search_path = pg_catalog, public
as $$ select array[
  'user_profiles','user_device_activity','user_daily_activity','user_streak_state',
  'user_vocabulary_notebook_entries','vocab_drill_cards','vocab_drill_decks',
  'writing_revision_cycles','writing_drafts','writing_tutor_sessions',
  'speaking_transcripts','speaking_attempts','speaking_coach_sessions',
  'grammar_remediation_assignments','immersion_mission_attempts',
  'learning_attempt_feedback','learning_attempts','learning_path_items','learning_path_plans',
  'learner_language_daily_plans','learner_language_recommendations','learner_language_errors',
  'learner_language_mastery','learner_language_profile_events','learner_language_profiles',
  'learner_language_goals','learner_skill_profile_events','learner_skill_profiles','language_signals',
  'ielts_playbook_diagnostic_results','ielts_playbook_drill_attempts','ielts_playbook_events',
  'ielts_playbook_recommendation_snapshots','ielts_playbook_section_threads','ielts_playbook_skills_probes',
  'ielts_playbook_user_notes','ielts_playbook_user_profiles',
  'ielts_practice_mistake_causes','ielts_practice_mistake_notebook','ielts_practice_mastery',
  'ielts_practice_roadmap_items','ielts_practice_diagnostic_snapshots','ielts_practice_plan_items',
  'ielts_practice_lab_attempts','ielts_practice_attempts','ielts_practice_sessions','ielts_practice_user_goals',
  'ielts_practice_ai_usage','ielts_srs_question_reviews',
  'sat_playbook_events','sat_playbook_recommendation_snapshots','sat_playbook_user_profiles',
  'sat_practice_attempt_results','sat_practice_attempt_sources','sat_practice_lab_attempts',
  'sat_practice_mistake_notebook','sat_practice_mastery','sat_practice_plan_items',
  'sat_practice_srs_queue','sat_practice_user_goals','sat_practice_daily_activity',
  'sat_practice_ai_generated_questions','toefl_playbook_events',
  'toefl_playbook_recommendation_snapshots','toefl_playbook_user_profiles','score_predictions',
  'english_ai_usage_daily','ai_usage_events','platform_announcement_reads',
  'platform_notifications','platform_journey_events','app_function_error_log',
  'telegram_link_tokens','telegram_user_preferences','telegram_app_events',
  'admin_user_permissions','admin_api_rate_limits','peer_reviews','peer_review_assignments',
  'peer_review_submissions','guide_sessions'
]::text[]; $$;
revoke all on function public.account_personal_erasure_tables() from public,anon,authenticated;
grant execute on function public.account_personal_erasure_tables() to service_role;

create or replace function public.account_closure_preflight(p_actor uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
set lock_timeout = '3s'
set statement_timeout = '15s'
as $$
declare decision jsonb; personal_scopes uuid[]; billing_review boolean;
begin
  decision := public.account_deletion_preflight(p_actor);
  if decision->'eligible' is distinct from 'true'::jsonb then return decision; end if;
  if not public.account_closure_is_enabled(p_actor) then
    return jsonb_build_object('eligible',false,'code','account_delete_unavailable');
  end if;
  if not exists(select 1 from pg_db_role_setting s join pg_roles r on r.oid=s.setrole
    cross join lateral unnest(s.setconfig) v(setting)
    where r.rolname='authenticator' and v.setting='pgrst.db_pre_request=public.account_api_pre_request') then
    return jsonb_build_object('eligible',false,'code','account_delete_unavailable');
  end if;
  -- Retaining payment history must not silently leave personal renewal billing
  -- running. This also covers an institution's subscription that still names
  -- this account as payer; transfer billing responsibility before erasure.
  -- Unknown/non-terminal states require review, not invented cancellation.
  personal_scopes := public.account_personal_tenants(p_actor);
  if to_regclass('public.billing_subscriptions') is not null then
    perform 1 from public.billing_subscriptions b
      where b.tenant_id=any(personal_scopes) or b.user_id=p_actor
      order by b.id for update;
    select exists(select 1 from public.billing_subscriptions b
      where (b.tenant_id=any(personal_scopes) or b.user_id=p_actor)
        and coalesce(lower(b.status),'') not in('canceled','cancelled','expired')) into billing_review;
    if billing_review then
      return jsonb_build_object('eligible',false,'code','account_billing_review_required');
    end if;
  end if;
  return decision;
end;
$$;
revoke all on function public.account_closure_preflight(uuid) from public,anon,authenticated;
grant execute on function public.account_closure_preflight(uuid) to service_role;

-- A webhook that started before closure may finish after it. Serialize with
-- both the tenant and payer before reading the private closure markers. Allow
-- terminal settlement/history updates; reject new or revived renewal billing.
-- Mixed tenant-first/user-first contention is bounded and rolls back safely.
create or replace function public.guard_closed_account_billing()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public
set lock_timeout='3s'
as $$
declare closed_scope boolean; closed_payer boolean; old_scope uuid; old_payer uuid;
begin
  if tg_op='UPDATE' then old_scope:=old.tenant_id;old_payer:=old.user_id;end if;
  perform 1 from public.tenants where id=any(array[new.tenant_id,old_scope]) order by id for share;
  perform 1 from public.users where id=any(array[new.user_id,old_payer]) order by id for share;
  closed_scope := exists(select 1 from public.account_closed_personal_tenants where tenant_id=any(array[new.tenant_id,old_scope]));
  closed_payer := exists(select 1 from public.account_closure_receipts where user_id=any(array[new.user_id,old_payer]));
  if (closed_scope or closed_payer) and tg_op='UPDATE' then
    if new.tenant_id is distinct from old.tenant_id or new.user_id is distinct from old.user_id then
      raise exception using errcode='P0001',message='account_closed';
    end if;
  end if;
  if (closed_scope or closed_payer)
    and coalesce(lower(new.status),'') not in('canceled','cancelled','expired') then
    raise exception using errcode='P0001',message='account_closed';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_closed_account_billing() from public,anon,authenticated,service_role;
do $$
begin
  if to_regclass('public.billing_subscriptions') is not null then
    execute 'drop trigger if exists account_closed_billing_guard on public.billing_subscriptions';
    execute 'create trigger account_closed_billing_guard before insert or update on public.billing_subscriptions for each row execute function public.guard_closed_account_billing()';
  end if;
end;
$$;

-- Stale definer RPCs and delayed service workers must not recreate erased
-- writing, speech, profiles or study history after the account has closed.
do $$
declare relation_name text; actor_column text;
begin
  foreach relation_name in array public.account_personal_erasure_tables()||array['teacher_profiles','trial_claims','referral_accounts','english_learning_analytics_events'] loop
    if to_regclass('public.'||relation_name) is null then continue; end if;
    actor_column := case when relation_name in('peer_reviews','peer_review_assignments') then 'reviewer_id'
      when relation_name='english_learning_analytics_events' then 'learner_user_id' else 'user_id' end;
    execute format('drop trigger if exists account_closed_personal_guard on public.%I',relation_name);
    execute format('create trigger account_closed_personal_guard before insert or update on public.%I for each row execute function public.guard_closed_personal_record(%L)',relation_name,actor_column);
  end loop;
end;
$$;

-- Audit evidence may outlive an operator's login. A request that started before
-- closure must not repopulate email/IP/agent data after the purge has committed.
create or replace function public.redact_closed_account_audit()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public
set lock_timeout='3s'
as $$
begin
  if new.user_id is not null then
    perform 1 from public.users where id=new.user_id for share;
    if exists(select 1 from public.account_closure_receipts where user_id=new.user_id) then
      new.user_email:=null;new.ip:=null;new.user_agent:=null;new.metadata:='{}'::jsonb;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.redact_closed_account_audit() from public,anon,authenticated,service_role;
do $$
begin
  if to_regclass('public.admin_audit_logs') is not null then
    execute 'drop trigger if exists account_closed_audit_guard on public.admin_audit_logs';
    execute 'create trigger account_closed_audit_guard before insert or update on public.admin_audit_logs for each row execute function public.redact_closed_account_audit()';
  end if;
end;
$$;

create or replace function public.erase_account_personal_data()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
set lock_timeout = '3s'
set statement_timeout = '20s'
as $$
declare
  decision jsonb;
  relation_name text;
  actor_column text;
  count_erased bigint;
  counts jsonb := '{}'::jsonb;
  retained_sessions uuid[] := '{}'::uuid[];
  institutional_sessions uuid[] := '{}'::uuid[];
  linked_sessions uuid[];
  personal_tenants uuid[];
  personal_email text;
  owner_column text;
  has_storage boolean;
begin
  if old.deleted_at is not null or new.deleted_at is null then return new; end if;
  -- Pre-mirror Auth cleanup has no personal application data or owned scope.
  if not exists(select 1 from public.users where id=old.id) then return new; end if;
  decision := public.account_closure_preflight(old.id);
  if decision->'eligible' is distinct from 'true'::jsonb then
    raise exception using errcode='P0001',message='account_closure_unavailable';
  end if;
  if exists(select 1 from public.account_closure_receipts where user_id=old.id) then return new; end if;
  select email into personal_email from public.users where id=old.id for update;

  -- Unknown owned Storage objects require classification before erasure. Never
  -- remove an academy/shared object or report it erased on a mere DB cascade.
  if to_regclass('storage.objects') is not null then
    select string_agg(format('%I::text=$1',a.attname),' or ') into owner_column from pg_attribute a
      where a.attrelid='storage.objects'::regclass and a.attnum>0 and not a.attisdropped
        and a.attname in('owner_id','owner');
    if owner_column is null then raise exception using errcode='P0001',message='account_storage_review_required'; end if;
    execute 'select exists(select 1 from storage.objects where '||owner_column||')'
      into has_storage using old.id::text;
    if has_storage then raise exception using errcode='P0001',message='account_storage_review_required'; end if;
  end if;

  personal_tenants := public.account_personal_tenants(old.id);

  -- Paid/exam admission roots and institutional assessment evidence survive.
  -- Pure self-study sessions are erased with their responses/evaluations.
  if to_regclass('public.sessions') is not null then
    execute 'select coalesce(array_agg(id),''{}''::uuid[]) from public.sessions where user_id=$1 and (token_id is not null or registration_id is not null)'
      into retained_sessions using old.id;
    foreach relation_name in array array['academy_submissions','corporate_candidates','partner_center_review_items'] loop
      if to_regclass('public.'||relation_name) is null then continue; end if;
      execute format('select coalesce(array_agg(s.id),''{}''::uuid[]) from public.sessions s where s.user_id=$1 and exists(select 1 from public.%I r where r.session_id=s.id)',relation_name)
        into linked_sessions using old.id;
      retained_sessions := retained_sessions||linked_sessions;
      institutional_sessions := institutional_sessions||linked_sessions;
    end loop;
    if to_regclass('public.exam_tokens') is not null then
      execute 'select coalesce(array_agg(s.id),''{}''::uuid[]) from public.sessions s join public.exam_tokens t on t.id=s.token_id where s.user_id=$1 and not(t.tenant_id=any($2))'
        into linked_sessions using old.id,personal_tenants;
      institutional_sessions := institutional_sessions||linked_sessions;
    end if;
    if to_regclass('public.exam_admission_receipts') is not null then
      select coalesce(array_agg(s.id),'{}'::uuid[]) into linked_sessions from public.sessions s
        where s.user_id=old.id and exists(select 1 from public.exam_admission_receipts r where r.session_id=s.id);
      retained_sessions := retained_sessions||linked_sessions;
    end if;
  end if;

  foreach relation_name in array public.account_personal_erasure_tables() loop
    if to_regclass('public.'||relation_name) is null then continue; end if;
    actor_column := case when relation_name in('peer_reviews','peer_review_assignments') then 'reviewer_id' else 'user_id' end;
    execute format('delete from public.%I where %I=$1',relation_name,actor_column) using old.id;
    get diagnostics count_erased = row_count;
    counts := counts||jsonb_build_object(relation_name,count_erased);
  end loop;
  if to_regclass('public.english_learning_analytics_events') is not null then
    delete from public.english_learning_analytics_events where learner_user_id=old.id;
  end if;
  if to_regclass('public.issued_certificates') is not null then
    delete from public.issued_certificates where user_id=old.id and (tenant_id is null or tenant_id=any(personal_tenants)) and not coalesce(session_id=any(institutional_sessions),false);
  end if;
  if to_regclass('public.sessions') is not null then
    -- A financial admission FK can retain a private exam root without retaining
    -- its personal answers, scores, flags or metadata.
    foreach relation_name in array array['responses','evaluations','exam_outcomes','exam_integrity_events'] loop
      if to_regclass('public.'||relation_name) is null then continue; end if;
      execute format('delete from public.%I r using public.sessions s where r.session_id=s.id and s.user_id=$1 and not(s.id=any($2))',relation_name)
        using old.id,institutional_sessions;
    end loop;
    update public.sessions set metadata='{}' where user_id=old.id and id=any(retained_sessions) and not(id=any(institutional_sessions));
    if to_regclass('public.exam_registrations') is not null then
      update public.exam_registrations set first_name='Deleted',last_name='account',legal_name='Deleted account',email=null,phone=null
        where user_id=old.id and tenant_id=any(personal_tenants);
    end if;
    delete from public.sessions where user_id=old.id and not(id=any(retained_sessions));
    get diagnostics count_erased = row_count;
    counts := counts||jsonb_build_object('sessions',count_erased);
  end if;
  -- Outbox events referenced by institutional automation are academy evidence.
  if to_regclass('public.domain_event_outbox') is not null then
    if to_regclass('public.academy_automation_executions') is not null then
      delete from public.domain_event_outbox e where e.user_id=old.id
        and not exists(select 1 from public.academy_automation_executions a where a.source_event_id=e.id);
    else delete from public.domain_event_outbox where user_id=old.id; end if;
  end if;

  if to_regclass('public.marketplace_profile_requests') is not null then
    delete from public.marketplace_profile_requests where actor_id=old.id;
  end if;
  if to_regclass('public.referral_accounts') is not null then
    update public.referral_accounts set status='disabled',metadata='{}' where user_id=old.id;
  end if;
  if to_regclass('public.trial_claims') is not null then
    -- Retain the consumed trial identity; erase arbitrary personal metadata.
    update public.trial_claims set metadata='{}' where user_id=old.id;
  end if;
  if to_regclass('public.admin_audit_logs') is not null then
    update public.admin_audit_logs set user_email=null,ip=null,user_agent=null,metadata='{}' where user_id=old.id;
  end if;
  if to_regclass('public.telegram_acquisition_sessions') is not null then
    -- Personal acquisition/diagnostic journeys are erased; institution-linked
    -- acquisition evidence survives but must no longer authenticate a login.
    delete from public.telegram_acquisition_sessions where schood_user_id=old.id and academy_lead_id is null;
    update public.telegram_acquisition_sessions set schood_user_id=null,journey_state='{}',metadata='{}',status='canceled'
      where schood_user_id=old.id;
  end if;
  if to_regclass('public.teacher_profiles') is not null then
    update public.teacher_profiles set full_name='Deleted account',bio=null,avatar_url=null,
      subjects='{}',languages='{}',location=null,timezone='UTC',hourly_rate=null,
      available=false,certifications='{}',experience_years=null,is_public=false,verified=false,metadata='{}'
      where user_id=old.id;
  end if;
  if to_regclass('public.support_messages') is not null then
    if to_regclass('public.support_message_replies') is not null then
      delete from public.support_message_replies r where r.support_message_id in(select id from public.support_messages where user_id=old.id);
    end if;
    delete from public.support_messages where user_id=old.id;
  end if;

  -- Business history remains linked to the frozen, pseudonymous principal;
  -- login memberships and access grants are removed/revoked.
  if to_regclass('public.academy_staff') is not null then
    -- Older minimal installations may have no login linkage yet.
    if exists(select 1 from pg_attribute where attrelid='public.academy_staff'::regclass and attname='user_id' and not attisdropped) then
      update public.academy_staff set is_active=false where user_id=old.id;
    end if;
  end if;
  if to_regclass('public.academy_role_grants') is not null then
    update public.academy_role_grants set status='revoked',revoked_at=coalesce(revoked_at,now())
      where user_id=old.id or (email is not null and lower(email) in(lower(personal_email),lower(old.email)));
  end if;
  if to_regclass('public.academy_contacts') is not null then
    if exists(select 1 from pg_attribute where attrelid='public.academy_contacts'::regclass and attname='user_id' and not attisdropped) then
      update public.academy_contacts set notify_enabled=false where user_id=old.id;
    end if;
  end if;
  if to_regclass('public.academy_telegram_link_tokens') is not null then
    delete from public.academy_telegram_link_tokens where user_id=old.id;
  end if;
  delete from public.tenant_memberships where user_id=old.id;
  if to_regclass('public.platform_admins') is not null then
    delete from public.platform_admins where lower(email) in(lower(personal_email),lower(old.email));
  end if;
  if to_regclass('public.entitlements') is not null then
    update public.entitlements set is_active=false where tenant_id=any(personal_tenants);
  end if;
  update public.tenants set name='Deleted personal account',slug='deleted-'||id::text,metadata='{}'
    where id=any(personal_tenants);
  update public.users set email='deleted-'||id::text||'@deleted.invalid',full_name=null,
    avatar_url=null,telegram_chat_id=null,role='user',is_active=false where id=old.id;
  insert into public.account_closed_personal_tenants(tenant_id,user_id)
    select unnest(personal_tenants),old.id;
  insert into public.account_closure_receipts(user_id,purge_version,erased_counts) values(old.id,1,counts);
  return new;
end;
$$;
revoke all on function public.erase_account_personal_data() from public,anon,authenticated,service_role;
drop trigger if exists account_erasure_transaction on auth.users;
create trigger account_erasure_transaction before update of deleted_at on auth.users
for each row execute function public.erase_account_personal_data();

create or replace function public.guard_account_retained_principal()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op='DELETE' then
    if exists(select 1 from public.users where id=old.id)
      and (public.account_closure_is_enabled(old.id)
        or exists(select 1 from public.account_closure_receipts where user_id=old.id)) then
      raise exception using errcode='P0001',message='account_soft_delete_required';
    end if;
    return old;
  end if;
  if old.deleted_at is not null and new.deleted_at is null
    and exists(select 1 from public.account_closure_receipts where user_id=old.id) then
    raise exception using errcode='P0001',message='account_closed';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_account_retained_principal() from public,anon,authenticated,service_role;
drop trigger if exists account_retained_principal_guard on auth.users;
create trigger account_retained_principal_guard before delete or update of deleted_at on auth.users
for each row execute function public.guard_account_retained_principal();

commit;
