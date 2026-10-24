-- D4 (docs/product/42 §2): with consent, homework mistakes feed the learner's
-- own Schood English Today plan and Review.
--
-- * academy_homework_feed_consents: one row per centre and learner, off until
--   the learner (18 or older) or a linked guardian turns it on. Revoking is
--   always allowed. academy_homework_feed_consent_events keeps the history.
-- * While consent is on, every open English mistake (grammar, vocabulary,
--   spelling, punctuation) is copied into learner_language_errors (so Today
--   suggests the lesson that fixes it) and learner_review_items (so Review asks
--   the learner to correct it). Only the excerpt, the correction, the
--   explanation, the tag and the centre's name are copied. Assignment titles,
--   submissions, scores and teacher names stay inside the centre.
-- * academy_homework_mistake_feed records each copy, so a mistake that is fixed,
--   dismissed or deleted, and every mistake of a revoked consent, removes
--   exactly the rows it added. Nothing flows back to the centre.
--
-- Copying is done by triggers in this database, so the web, Mini App and
-- Telegram review paths all behave the same. The mistake trigger swallows its
-- own errors: practice copies must never block a teacher's review.

-- ---------------------------------------------------------------------------
-- Consent.
-- ---------------------------------------------------------------------------
create table if not exists public.academy_homework_feed_consents (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.academy_contacts(id) on delete cascade,
  learner_user_id uuid not null references public.users(id) on delete cascade,
  status text not null check (status in ('granted', 'revoked')),
  granted_by_user_id uuid references public.users(id) on delete set null,
  granted_by_role text check (granted_by_role is null or granted_by_role in ('learner', 'guardian')),
  guardian_relationship_id uuid,
  learner_confirmed_adult boolean not null default false,
  policy_version text not null default 'homework-mistakes-v1' check (length(policy_version) between 1 and 40),
  source text check (source is null or length(source) between 1 and 40),
  granted_at timestamptz,
  revoked_at timestamptz,
  revoked_by_user_id uuid references public.users(id) on delete set null,
  revoked_by_role text check (revoked_by_role is null or revoked_by_role in ('learner', 'guardian', 'system')),
  revocation_reason text check (revocation_reason is null or length(revocation_reason) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academy_id, contact_id),
  check (status <> 'granted' or (granted_at is not null and granted_by_role is not null)),
  check (granted_by_role is distinct from 'learner' or status <> 'granted' or learner_confirmed_adult),
  check (granted_by_role is distinct from 'guardian' or status <> 'granted' or guardian_relationship_id is not null)
);
create index if not exists academy_homework_feed_consents_learner_idx on public.academy_homework_feed_consents(learner_user_id);
alter table public.academy_homework_feed_consents enable row level security;
revoke all on public.academy_homework_feed_consents from anon, authenticated;

create table if not exists public.academy_homework_feed_consent_events (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.academy_contacts(id) on delete cascade,
  learner_user_id uuid references public.users(id) on delete set null,
  action text not null check (action in ('granted', 'revoked')),
  actor_user_id uuid references public.users(id) on delete set null,
  actor_role text not null check (actor_role in ('learner', 'guardian', 'system')),
  guardian_relationship_id uuid,
  policy_version text not null,
  source text,
  reason text,
  occurred_at timestamptz not null default now()
);
create index if not exists academy_homework_feed_consent_events_contact_idx
  on public.academy_homework_feed_consent_events(academy_id, contact_id, occurred_at desc);
alter table public.academy_homework_feed_consent_events enable row level security;
revoke all on public.academy_homework_feed_consent_events from anon, authenticated;

-- What was copied, so it can be removed again.
create table if not exists public.academy_homework_mistake_feed (
  mistake_id uuid primary key references public.academy_homework_mistakes(id) on delete cascade,
  academy_id uuid not null,
  contact_id uuid not null,
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  language_error_id uuid references public.learner_language_errors(id) on delete set null,
  review_item_id uuid references public.learner_review_items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists academy_homework_mistake_feed_contact_idx on public.academy_homework_mistake_feed(academy_id, contact_id);
create index if not exists academy_homework_mistake_feed_error_idx on public.academy_homework_mistake_feed(language_error_id) where language_error_id is not null;
alter table public.academy_homework_mistake_feed enable row level security;
revoke all on public.academy_homework_mistake_feed from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Which mistakes belong in the English loop.
-- ---------------------------------------------------------------------------

-- Grammar topic for a homework tag, matching grammar_units.focus_area.
-- The list mirrors GRAMMAR_TOPICS in supabase/functions/_shared/english-mistakes.ts
-- (a test keeps them equal). Unknown stays unknown: no topic beats a wrong lesson.
create or replace function public.academy_homework_feed_topic(p_tag text)
returns text language sql immutable set search_path = public as $$
  with t as (
    select lower(coalesce(p_tag, '')) ~ '^grammar[.:_-]' as is_grammar,
      replace(regexp_replace(lower(coalesce(p_tag, '')), '^grammar[.:_-]', ''), '_', '-') as v
  )
  select case
    when not is_grammar then null
    when v = any (array[
      'to-be', 'present-simple', 'there-is', 'modal-can', 'plurals-demonstratives', 'possessives', 'articles',
      'past-simple', 'present-continuous', 'comparatives', 'future', 'quantifiers', 'tense', 'prepositions',
      'agreement', 'present-perfect', 'conditionals', 'used-to', 'modals-obligation', 'relative-clauses',
      'verb-patterns', 'past-perfect', 'passive', 'reported-speech', 'conditionals-past', 'modals-deduction',
      'linkers', 'inversion', 'cleft-sentences', 'participle-clauses', 'modals-past', 'wish', 'subjunctive', 'hedging'
    ]) then v
    else case v
      when 'tenses' then 'tense' when 'verb-tense' then 'tense' when 'verb-tenses' then 'tense'
      when 'article' then 'articles' when 'preposition' then 'prepositions'
      when 'subject-verb-agreement' then 'agreement' when 'sva' then 'agreement'
      when 'plural' then 'plurals-demonstratives' when 'plurals' then 'plurals-demonstratives'
      when 'comparative' then 'comparatives' when 'superlative' then 'comparatives' when 'superlatives' then 'comparatives'
      when 'conditional' then 'conditionals' when 'passive-voice' then 'passive'
      when 'gerund' then 'verb-patterns' when 'infinitive' then 'verb-patterns'
      when 'possessive' then 'possessives' when 'quantifier' then 'quantifiers'
      else null end
  end from t;
$$;

-- English-language mistakes only: maths, task and structure comments, or work
-- in other scripts, never reach Schood English.
create or replace function public.academy_homework_feed_eligible(p_tag text, p_excerpt text, p_correction text)
returns boolean language sql immutable set search_path = public as $$
  select lower(coalesce(p_tag, '')) ~ '^(grammar|vocabulary|spelling|punctuation)([.:_-]|$)'
    and coalesce(p_excerpt, p_correction) is not null
    and coalesce(p_excerpt, '') !~ '[^\u0001-˿ -⁯]'
    and coalesce(p_correction, '') !~ '[^\u0001-˿ -⁯]'
    and (coalesce(p_excerpt, '') || coalesce(p_correction, '')) ~ '[A-Za-z]';
$$;

-- ---------------------------------------------------------------------------
-- Copy and remove.
-- ---------------------------------------------------------------------------

-- Keeps one copied learner_language_errors row counting only its live links.
create or replace function public.academy_homework_feed_recount(p_error uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if p_error is null then return; end if;
  select count(*) into n from public.academy_homework_mistake_feed where language_error_id = p_error;
  if n = 0 then
    delete from public.learner_language_errors where id = p_error and service_key = 'academy_homework';
  else
    update public.learner_language_errors set error_frequency = n
    where id = p_error and service_key = 'academy_homework' and error_frequency is distinct from n;
  end if;
end;$$;

create or replace function public.academy_homework_unfeed_mistake(p_mistake uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare f public.academy_homework_mistake_feed;
begin
  delete from public.academy_homework_mistake_feed where mistake_id = p_mistake returning * into f;
  if not found then return false; end if;
  if f.review_item_id is not null then
    delete from public.learner_review_items where id = f.review_item_id and user_id = f.user_id and item_key like 'homework:%';
  end if;
  perform public.academy_homework_feed_recount(f.language_error_id);
  return true;
end;$$;

-- Copies one mistake when its learner's consent is on, or removes the copy
-- when it no longer qualifies. Returns true when the mistake is fed.
create or replace function public.academy_homework_feed_mistake(p_mistake uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  m public.academy_homework_mistakes; f public.academy_homework_mistake_feed; learner uuid; lang uuid; centre text;
  topic text; skill text; subskill text; kind text; label text; err uuid; item uuid; review boolean;
begin
  select * into m from public.academy_homework_mistakes where id = p_mistake;
  if not found then
    perform public.academy_homework_unfeed_mistake(p_mistake);
    return false;
  end if;
  select c.user_id into learner from public.academy_contacts c
  join public.academy_homework_feed_consents k on k.academy_id = c.academy_id and k.contact_id = c.id
  where c.id = m.contact_id and c.academy_id = m.academy_id and k.status = 'granted' and k.learner_user_id = c.user_id;
  select id into lang from public.languages where code = 'en';
  if learner is null or lang is null or m.status <> 'open'
     or not public.academy_homework_feed_eligible(m.tag, m.excerpt, m.correction) then
    perform public.academy_homework_unfeed_mistake(m.id);
    return false;
  end if;

  select * into f from public.academy_homework_mistake_feed where mistake_id = m.id for update;
  if found and f.user_id <> learner then
    perform public.academy_homework_unfeed_mistake(m.id);
    f := null;
  end if;

  topic := public.academy_homework_feed_topic(m.tag);
  skill := split_part(lower(m.tag), '.', 1);
  skill := case when skill ~ '^(spelling|punctuation)' then 'writing' when skill ~ '^vocabulary' then 'vocabulary' else 'grammar' end;
  subskill := case when topic is not null then 'grammar.' || topic else left(lower(m.tag), 120) end;
  kind := left(case
    when m.excerpt is not null and m.correction is not null then m.excerpt || ' → ' || m.correction
    else coalesce(m.excerpt, m.correction) end, 240);

  select e.id into err from public.learner_language_errors e
  where e.id = f.language_error_id and e.user_id = learner and e.language_id = lang and e.service_key = 'academy_homework'
    and e.skill_key = skill and e.subskill_key = subskill and e.error_type = kind;
  if err is null then
    -- New or changed text: link to the matching row, reopening one already practised.
    insert into public.learner_language_errors(user_id, language_id, service_key, skill_key, subskill_key, error_type,
      severity_score, mastery_status, metadata)
    values (learner, lang, 'academy_homework', skill, subskill, kind, 0.5, 'open', '{"source":"academy_homework"}'::jsonb)
    on conflict on constraint learner_language_errors_unique do update
      set last_seen_at = now(),
          mastery_status = case when learner_language_errors.mastery_status in ('improving', 'resolved') then 'reopened'
            else learner_language_errors.mastery_status end
    returning id into err;
  end if;

  review := m.excerpt is not null and m.correction is not null
    and lower(btrim(m.excerpt)) <> lower(btrim(m.correction)) and length(m.correction) <= 300;
  if review then
    select name into centre from public.tenants where id = m.academy_id;
    label := left('Homework · ' || coalesce(nullif(btrim(centre), ''), 'your centre'), 220);
    insert into public.learner_review_items(user_id, language_id, kind, item_key, payload, box, next_due_at)
    values (learner, lang, 'grammar', 'homework:' || m.id::text, jsonb_build_object(
      'type', 'grammar', 'prompt', m.excerpt, 'instructions', 'Write this correctly.',
      'accepted', jsonb_build_array(m.correction), 'explanation', coalesce(m.explanation, ''),
      'source_title', label, 'source_slug', ''), 1, now())
    on conflict on constraint learner_review_items_unique do update set payload = excluded.payload
    returning id into item;
  elsif f.review_item_id is not null then
    delete from public.learner_review_items where id = f.review_item_id and user_id = learner and item_key like 'homework:%';
  end if;

  insert into public.academy_homework_mistake_feed(mistake_id, academy_id, contact_id, user_id, language_id, language_error_id, review_item_id)
  values (m.id, m.academy_id, m.contact_id, learner, lang, err, item)
  on conflict (mistake_id) do update set academy_id = excluded.academy_id, contact_id = excluded.contact_id,
    language_error_id = excluded.language_error_id, review_item_id = excluded.review_item_id, updated_at = now();
  if f.language_error_id is distinct from err then perform public.academy_homework_feed_recount(f.language_error_id); end if;
  perform public.academy_homework_feed_recount(err);
  return true;
end;$$;

create or replace function public.academy_homework_feed_contact(p_academy uuid, p_contact uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  for r in select id from public.academy_homework_mistakes where academy_id = p_academy and contact_id = p_contact order by created_at loop
    if public.academy_homework_feed_mistake(r.id) then n := n + 1; end if;
  end loop;
  return n;
end;$$;

create or replace function public.academy_homework_unfeed_contact(p_academy uuid, p_contact uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  for r in select mistake_id from public.academy_homework_mistake_feed where academy_id = p_academy and contact_id = p_contact loop
    if public.academy_homework_unfeed_mistake(r.mistake_id) then n := n + 1; end if;
  end loop;
  return n;
end;$$;

-- ---------------------------------------------------------------------------
-- Triggers.
-- ---------------------------------------------------------------------------
create or replace function public.academy_homework_mistake_feed_track()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if tg_op = 'DELETE' then
      perform public.academy_homework_unfeed_mistake(old.id);
      return old;
    end if;
    if tg_op = 'INSERT' and not exists (select 1 from public.academy_homework_feed_consents
        where academy_id = new.academy_id and contact_id = new.contact_id and status = 'granted') then
      return new;
    end if;
    perform public.academy_homework_feed_mistake(new.id);
  exception when others then
    raise warning 'academy_homework_mistake_feed_track: %', sqlerrm;
  end;
  return case when tg_op = 'DELETE' then old else new end;
end;$$;

-- BEFORE DELETE so the copies go before the feed row's own cascade.
drop trigger if exists academy_homework_mistake_unfeed on public.academy_homework_mistakes;
create trigger academy_homework_mistake_unfeed before delete on public.academy_homework_mistakes
  for each row execute function public.academy_homework_mistake_feed_track();
drop trigger if exists academy_homework_mistake_feed on public.academy_homework_mistakes;
create trigger academy_homework_mistake_feed after insert or update of status, tag, excerpt, correction, explanation, contact_id
  on public.academy_homework_mistakes for each row execute function public.academy_homework_mistake_feed_track();

-- Consent belongs to one Schood account. If the centre links the learner record
-- to a different account (or unlinks it), the consent ends and the copies go.
create or replace function public.academy_homework_feed_contact_account()
returns trigger language plpgsql security definer set search_path = public as $$
declare k public.academy_homework_feed_consents;
begin
  for k in update public.academy_homework_feed_consents
      set status = 'revoked', revoked_at = now(), revoked_by_user_id = null, revoked_by_role = 'system',
          revocation_reason = 'account_changed', updated_at = now()
      where academy_id = new.academy_id and contact_id = new.id and status = 'granted'
      returning * loop
    insert into public.academy_homework_feed_consent_events(academy_id, contact_id, learner_user_id, action, actor_role, policy_version, reason)
    values (k.academy_id, k.contact_id, k.learner_user_id, 'revoked', 'system', k.policy_version, 'account_changed');
  end loop;
  perform public.academy_homework_unfeed_contact(new.academy_id, new.id);
  return new;
end;$$;
drop trigger if exists academy_homework_feed_contact_account on public.academy_contacts;
create trigger academy_homework_feed_contact_account after update of user_id on public.academy_contacts
  for each row when (old.user_id is distinct from new.user_id)
  execute function public.academy_homework_feed_contact_account();

-- ---------------------------------------------------------------------------
-- Commands (service role only; the academy-learning function authenticates).
-- ---------------------------------------------------------------------------
create or replace function public.academy_homework_feed_assert_actor(p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from auth.users where id = p_actor and deleted_at is null and (banned_until is null or banned_until <= clock_timestamp()) for share;
  if not found then raise exception using errcode = '42501', message = 'Sign in again to continue.'; end if;
  perform 1 from public.users where id = p_actor and is_active for share;
  if not found then raise exception using errcode = '42501', message = 'Sign in again to continue.'; end if;
end;$$;

create or replace function public.academy_homework_feed_state(p_academy uuid, p_contact uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'academy_id', p_academy, 'contact_id', p_contact,
    'status', coalesce(k.status, 'off'), 'granted_at', k.granted_at, 'granted_by_role', k.granted_by_role,
    'revoked_at', k.revoked_at, 'revoked_by_role', k.revoked_by_role, 'policy_version', coalesce(k.policy_version, 'homework-mistakes-v1'),
    'copied', (select count(*) from public.academy_homework_mistake_feed f where f.academy_id = p_academy and f.contact_id = p_contact))
  from (select 1) one
  left join public.academy_homework_feed_consents k on k.academy_id = p_academy and k.contact_id = p_contact;
$$;

create or replace function public.academy_homework_feed_set(
  p_academy uuid, p_contact uuid, p_learner uuid, p_grant boolean, p_actor uuid, p_role text,
  p_relationship uuid, p_confirmed_adult boolean, p_source text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare k public.academy_homework_feed_consents; changed boolean := false; src text := left(nullif(btrim(p_source), ''), 40);
begin
  select * into k from public.academy_homework_feed_consents where academy_id = p_academy and contact_id = p_contact for update;
  if p_grant then
    if not found or k.status <> 'granted' or k.learner_user_id <> p_learner then
      insert into public.academy_homework_feed_consents(academy_id, contact_id, learner_user_id, status, granted_by_user_id, granted_by_role,
        guardian_relationship_id, learner_confirmed_adult, source, granted_at)
      values (p_academy, p_contact, p_learner, 'granted', p_actor, p_role, p_relationship, coalesce(p_confirmed_adult, false), src, now())
      on conflict (academy_id, contact_id) do update set learner_user_id = excluded.learner_user_id, status = 'granted',
        granted_by_user_id = excluded.granted_by_user_id, granted_by_role = excluded.granted_by_role,
        guardian_relationship_id = excluded.guardian_relationship_id, learner_confirmed_adult = excluded.learner_confirmed_adult,
        policy_version = excluded.policy_version, source = excluded.source, granted_at = excluded.granted_at,
        revoked_at = null, revoked_by_user_id = null, revoked_by_role = null, revocation_reason = null, updated_at = now()
      returning * into k;
      changed := true;
    end if;
    perform public.academy_homework_feed_contact(p_academy, p_contact);
  else
    if found and k.status = 'granted' then
      update public.academy_homework_feed_consents set status = 'revoked', revoked_at = now(), revoked_by_user_id = p_actor,
        revoked_by_role = p_role, revocation_reason = 'withdrawn', updated_at = now()
      where id = k.id returning * into k;
      changed := true;
    end if;
    perform public.academy_homework_unfeed_contact(p_academy, p_contact);
  end if;
  if changed then
    insert into public.academy_homework_feed_consent_events(academy_id, contact_id, learner_user_id, action, actor_user_id, actor_role,
      guardian_relationship_id, policy_version, source, reason)
    values (p_academy, p_contact, p_learner, case when p_grant then 'granted' else 'revoked' end, p_actor, p_role,
      p_relationship, k.policy_version, src, case when p_grant then null else 'withdrawn' end);
    insert into public.academy_audit_events(academy_id, actor_user_id, actor_role, action, target_type, target_id, contact_id, status, metadata)
    values (p_academy, p_actor, p_role, case when p_grant then 'homework.mistake_feed_granted' else 'homework.mistake_feed_revoked' end,
      'academy_contact', p_contact::text, p_contact, 'ok', jsonb_build_object('actor_role', p_role, 'policy_version', k.policy_version));
  end if;
  return public.academy_homework_feed_state(p_academy, p_contact);
end;$$;

-- A learner turns it on (18 or older only) or off for one centre.
create or replace function public.academy_homework_feed_learner_command(
  p_actor uuid, p_academy uuid, p_grant boolean, p_confirmed_adult boolean, p_source text
) returns jsonb language plpgsql security definer set search_path = public set lock_timeout = '5s' as $$
declare c public.academy_contacts; result jsonb := '[]'::jsonb;
begin
  perform public.academy_homework_feed_assert_actor(p_actor);
  if p_grant and p_confirmed_adult is not true then
    raise exception 'If you are under 18, a parent or guardian turns this on from the parent page.';
  end if;
  for c in select * from public.academy_contacts where academy_id = p_academy and user_id = p_actor
      and status in ('active', 'trial', 'paused') order by id for update loop
    result := result || jsonb_build_array(public.academy_homework_feed_set(c.academy_id, c.id, p_actor, p_grant, p_actor, 'learner',
      null, p_confirmed_adult, p_source));
  end loop;
  if jsonb_array_length(result) = 0 then
    raise exception using errcode = '42501', message = 'You are not a learner at this centre.';
  end if;
  return jsonb_build_object('consents', result);
end;$$;

-- A guardian with current, consented parent access turns it on or off for their child.
create or replace function public.academy_homework_feed_guardian_command(
  p_actor uuid, p_relationship uuid, p_grant boolean, p_source text
) returns jsonb language plpgsql security definer set search_path = public set lock_timeout = '5s' as $$
declare t jsonb; r public.academy_student_guardian_relationships; c public.academy_contacts;
begin
  t := public.academy_guardian_relationship_for_actor(p_actor, p_relationship);
  r := jsonb_populate_record(null::public.academy_student_guardian_relationships, t->'relationship');
  if not r.can_view_homework then
    raise exception using errcode = '42501', message = 'Your parent access does not include homework.';
  end if;
  select * into c from public.academy_contacts where academy_id = r.academy_id and id = r.contact_id for update;
  if p_grant and c.user_id is null then
    raise exception 'Your child needs a Schood account linked to this centre first. Ask the centre to send an invitation.';
  end if;
  if c.user_id is null then return public.academy_homework_feed_state(r.academy_id, r.contact_id); end if;
  return public.academy_homework_feed_set(r.academy_id, r.contact_id, c.user_id, p_grant, p_actor, 'guardian',
    r.id, false, p_source);
end;$$;

-- What a guardian sees for their child: the same state, plus whether the child
-- has a Schood account to practise in.
create or replace function public.academy_homework_feed_guardian_state(p_actor uuid, p_relationship uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t jsonb; r public.academy_student_guardian_relationships; linked boolean;
begin
  t := public.academy_guardian_relationship_for_actor(p_actor, p_relationship);
  r := jsonb_populate_record(null::public.academy_student_guardian_relationships, t->'relationship');
  if not r.can_view_homework then
    raise exception using errcode = '42501', message = 'Your parent access does not include homework.';
  end if;
  linked := (t->'contact'->>'user_id') is not null;
  return public.academy_homework_feed_state(r.academy_id, r.contact_id) || jsonb_build_object('relationship_id', r.id, 'account_linked', linked);
end;$$;

-- Service role only, like every other Homework OS function.
do $grants$
declare fn text;
begin
  foreach fn in array array[
    'public.academy_homework_feed_topic(text)', 'public.academy_homework_feed_eligible(text,text,text)',
    'public.academy_homework_feed_recount(uuid)', 'public.academy_homework_unfeed_mistake(uuid)',
    'public.academy_homework_feed_mistake(uuid)', 'public.academy_homework_feed_contact(uuid,uuid)',
    'public.academy_homework_unfeed_contact(uuid,uuid)', 'public.academy_homework_mistake_feed_track()',
    'public.academy_homework_feed_contact_account()', 'public.academy_homework_feed_assert_actor(uuid)',
    'public.academy_homework_feed_state(uuid,uuid)',
    'public.academy_homework_feed_set(uuid,uuid,uuid,boolean,uuid,text,uuid,boolean,text)',
    'public.academy_homework_feed_learner_command(uuid,uuid,boolean,boolean,text)',
    'public.academy_homework_feed_guardian_command(uuid,uuid,boolean,text)',
    'public.academy_homework_feed_guardian_state(uuid,uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
end;
$grants$;
grant execute on function public.academy_homework_feed_state(uuid,uuid) to service_role;
grant execute on function public.academy_homework_feed_learner_command(uuid,uuid,boolean,boolean,text) to service_role;
grant execute on function public.academy_homework_feed_guardian_command(uuid,uuid,boolean,text) to service_role;
grant execute on function public.academy_homework_feed_guardian_state(uuid,uuid) to service_role;
