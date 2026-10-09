begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';
-- Browser clients use authenticated Edge commands; preserve records and service access.
revoke all on public.peer_review_submissions, public.peer_reviews from public, anon, authenticated;
do $$
declare v_table text; v_columns text;
begin
  foreach v_table in array array['peer_review_submissions', 'peer_reviews'] loop
    select string_agg(quote_ident(attname), ', ' order by attnum) into v_columns
      from pg_attribute where attrelid = ('public.' || v_table)::regclass and attnum>0 and not attisdropped;
    execute format('revoke select (%1$s), insert (%1$s), update (%1$s), references (%1$s)
      on public.%2$I from public, anon, authenticated', v_columns, v_table);
  end loop;
end $$;
grant select, insert, update, delete on public.peer_review_submissions, public.peer_reviews to service_role;
drop policy if exists "Peer subs: read open + own" on public.peer_review_submissions;
drop policy if exists "Peer subs: insert own" on public.peer_review_submissions;
drop policy if exists "Peer reviews: insert" on public.peer_reviews;
-- Retain the existing author/reviewer review-read policy as defense in depth;
-- browser grants remain denied and public queue DTOs contain no essay content.
create policy "Peer subs: owner read" on public.peer_review_submissions
  for select to authenticated using (user_id=auth.uid());

-- Existing essays remain private until their author explicitly opts in.
alter table public.peer_review_submissions
  add column sharing_consent_at timestamptz,
  add column request_id uuid;
create unique index peer_submission_request on public.peer_review_submissions(user_id, request_id);

create table public.peer_review_assignments (
  submission_id uuid not null references public.peer_review_submissions(id) on delete cascade,
  reviewer_id uuid not null references public.users(id) on delete cascade,
  expires_at timestamptz not null,
  primary key(submission_id, reviewer_id)
);
create index peer_assignment_reviewer on public.peer_review_assignments(reviewer_id, expires_at);
alter table public.peer_review_assignments enable row level security;
revoke all on public.peer_review_assignments from public, anon, authenticated;
grant select, insert, update, delete on public.peer_review_assignments to service_role;

-- Only the authenticated Edge handler may supply p_actor. Invoker privileges,
-- empty search_path and explicit grants avoid a browser-accessible definer RPC.
create function public.peer_review_command(p_actor uuid, p_action text, p_payload jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' set lock_timeout = '2s'
as $$
declare
  v_sub public.peer_review_submissions%rowtype;
  v_review public.peer_reviews%rowtype;
  v_id uuid;
  v_request uuid;
  v_count integer;
  v_active integer;
  v_expires timestamptz;
  v_essay text;
  v_prompt text;
  v_exam text;
  v_task text;
  v_band numeric;
  v_max numeric;
  v_comment text;
  v_strengths text;
  v_improvements text;
  v_result jsonb;
  v_reviews jsonb;
begin
  if p_actor is null or not exists(select 1 from public.users where id=p_actor) then
    raise exception 'Account not found' using errcode='PT403';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Invalid request' using errcode='PT400';
  end if;

  if p_action = 'submit' then
    if p_payload->'sharing_consent' is distinct from 'true'::jsonb then
      raise exception 'Confirm sharing consent before submitting' using errcode='PT400';
    end if;
    if jsonb_typeof(p_payload->'essay_text') is distinct from 'string'
      or (p_payload->'prompt_text' is not null and p_payload->'prompt_text' <> 'null'::jsonb
        and jsonb_typeof(p_payload->'prompt_text') <> 'string') then
      raise exception 'Essay and question must be text' using errcode='PT400';
    end if;
    v_essay := btrim(p_payload->>'essay_text');
    v_prompt := nullif(btrim(p_payload->>'prompt_text'), '');
    v_exam := coalesce(p_payload->>'exam_type', 'ielts');
    v_task := coalesce(p_payload->>'task_type', 'task2');
    if length(v_essay) not between 100 and 20000 or length(v_prompt) > 2000
      or v_exam not in ('ielts','itep') or v_task not in ('task1','task2') then
      raise exception 'Use a supported exam and an essay of 100–20,000 characters; question limit is 2,000' using errcode='PT400';
    end if;
    v_request := (p_payload->>'request_id')::uuid;
    if v_request is null then
      raise exception 'A submission request id is required; refresh and retry' using errcode='PT400';
    end if;
    -- Per-author serialization also makes a lost-response retry idempotent.
    perform id from public.users where id=p_actor for no key update;
    select * into v_sub from public.peer_review_submissions where user_id=p_actor and request_id=v_request;
    if found then
      if v_sub.essay_text <> v_essay or v_sub.prompt_text is distinct from v_prompt
        or v_sub.exam_type <> v_exam or v_sub.task_type <> v_task then
        raise exception 'This submission id was already used for different content' using errcode='PT409';
      end if;
    else
      insert into public.peer_review_submissions(user_id, request_id, exam_type, task_type,
        essay_text, prompt_text, word_count, sharing_consent_at)
      values(p_actor, v_request, v_exam, v_task, v_essay, v_prompt,
        cardinality(regexp_split_to_array(v_essay, '\s+')), clock_timestamp())
      returning * into v_sub;
    end if;
    return jsonb_build_object('submission', jsonb_build_object('id',v_sub.id,'request_id',v_sub.request_id,
      'status',v_sub.status,'reviews_needed',v_sub.reviews_needed,'created_at',v_sub.created_at));
  end if;

  if p_action = 'my_submissions' then
    select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into v_result from (
      select s.id, s.exam_type, s.task_type, s.word_count, s.status, s.reviews_needed,
        (select count(*) from public.peer_reviews r where r.submission_id=s.id) as reviews_count,
        s.sharing_consent_at, s.created_at from public.peer_review_submissions s
      where s.user_id=p_actor order by s.created_at desc, s.id desc limit 20
    ) q;
    select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into v_reviews from (
      select r.id, r.submission_id, r.band_score, r.criteria, r.strengths, r.improvements,
        r.overall_comment, r.is_helpful, r.created_at from public.peer_reviews r
      where r.submission_id in (select (value->>'id')::uuid from jsonb_array_elements(v_result))
      order by r.created_at desc, r.id desc limit 200
    ) q;
    return jsonb_build_object('submissions',v_result,'reviews',v_reviews,
      'history_window',jsonb_build_object('submissions',20,'reviews',200));
  end if;
  if p_action = 'my_reviews' then
    select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into v_result from (
      select r.id,r.submission_id,r.band_score,r.overall_comment,r.created_at,
        jsonb_build_object('exam_type',s.exam_type,'task_type',s.task_type,'word_count',s.word_count) as peer_review_submissions
      from public.peer_reviews r join public.peer_review_submissions s on s.id=r.submission_id
      where r.reviewer_id=p_actor order by r.created_at desc,r.id desc limit 20
    ) q;
    return jsonb_build_object('reviews',v_result);
  end if;
  if p_action = 'rate_helpful' then
    if jsonb_typeof(p_payload->'is_helpful') is distinct from 'boolean' then
      raise exception 'Helpful rating must be true or false' using errcode='PT400';
    end if;
    select s.* into v_sub from public.peer_review_submissions s
      join public.peer_reviews r on r.submission_id=s.id
      where r.id=(p_payload->>'review_id')::uuid and s.user_id=p_actor for update of s;
    if not found then raise exception 'Review unavailable' using errcode='PT404'; end if;
    update public.peer_reviews set is_helpful=(p_payload->>'is_helpful')::boolean,
      status=case when (p_payload->>'is_helpful')::boolean then 'helpful' else 'not_helpful' end
      where id=(p_payload->>'review_id')::uuid and submission_id=v_sub.id;
    return jsonb_build_object('ok',true);
  end if;

  if p_action = 'queue' then
    select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into v_result from (
      select s.id, s.exam_type, s.task_type, s.word_count, s.target_band,
        s.reviews_needed, (select count(*) from public.peer_reviews r where r.submission_id=s.id) as reviews_count,
        s.created_at
      from public.peer_review_submissions s
      where s.user_id <> p_actor and s.tenant_id is null and s.sharing_consent_at is not null
        and s.status in ('pending_review','reviewing')
        and not exists(select 1 from public.peer_reviews r where r.submission_id=s.id and r.reviewer_id=p_actor)
        and (
          exists(select 1 from public.peer_review_assignments a where a.submission_id=s.id
            and a.reviewer_id=p_actor and a.expires_at > clock_timestamp())
          or (select count(*) from public.peer_reviews r where r.submission_id=s.id)
            + (select count(*) from public.peer_review_assignments a where a.submission_id=s.id
              and a.expires_at > clock_timestamp()
              and not exists(select 1 from public.peer_reviews r where r.submission_id=s.id and r.reviewer_id=a.reviewer_id))
            < s.reviews_needed
        )
      order by exists(select 1 from public.peer_review_assignments own_assignment
        where own_assignment.submission_id=s.id and own_assignment.reviewer_id=p_actor
        and own_assignment.expires_at>clock_timestamp()) desc, s.created_at, s.id limit 10
    ) q;
    return jsonb_build_object('submissions',v_result);
  end if;

  if p_action not in ('get_submission','claim_submission','release_submission','submit_review','set_sharing') then
    raise exception 'Unknown action' using errcode='PT404';
  end if;
  v_id := (p_payload->>'submission_id')::uuid;
  -- Serialize claims for a reviewer before locking a submission, allowing at most
  -- one active essay assignment. Other commands only lock the submission.
  if p_action = 'claim_submission' then
    perform id from public.users where id=p_actor for no key update;
  end if;
  select * into v_sub from public.peer_review_submissions where id=v_id for update;
  if not found then raise exception 'Submission unavailable' using errcode='PT404'; end if;
  select count(*) into v_count from public.peer_reviews where submission_id=v_id;

  if p_action = 'set_sharing' then
    if v_sub.user_id <> p_actor then raise exception 'Submission unavailable' using errcode='PT404'; end if;
    if v_sub.tenant_id is not null then
      raise exception 'Academy submissions cannot enter the public review pool' using errcode='PT403';
    end if;
    if jsonb_typeof(p_payload->'sharing_consent') is distinct from 'boolean' then
      raise exception 'Sharing consent must be true or false' using errcode='PT400';
    end if;
    if (p_payload->>'sharing_consent')::boolean then
      update public.peer_review_submissions set sharing_consent_at=clock_timestamp(),
        reviews_count=v_count, status=case when v_count>=reviews_needed then 'reviewed'
          when v_count>0 then 'reviewing' else 'pending_review' end where id=v_id;
    else
      update public.peer_review_submissions set sharing_consent_at=null, status='closed', reviews_count=v_count where id=v_id;
      delete from public.peer_review_assignments where submission_id=v_id;
    end if;
    return jsonb_build_object('ok',true);
  end if;

  if p_action = 'release_submission' then
    delete from public.peer_review_assignments where submission_id=v_id and reviewer_id=p_actor;
    return jsonb_build_object('ok',true);
  end if;

  if p_action = 'submit_review' then
    select * into v_review from public.peer_reviews where submission_id=v_id and reviewer_id=p_actor;
    if found then
      -- A duplicate must never add a second count or change previously saved feedback.
      if v_review.overall_comment is distinct from nullif(btrim(p_payload->>'overall_comment'),'')
        or v_review.strengths is distinct from nullif(btrim(p_payload->>'strengths'),'')
        or v_review.improvements is distinct from nullif(btrim(p_payload->>'improvements'),'')
        or v_review.band_score is distinct from (p_payload->>'band_score')::numeric then
        raise exception 'Feedback was already saved with different content; check your given reviews' using errcode='PT409';
      end if;
      return jsonb_build_object('review',jsonb_build_object('id',v_review.id,'created_at',v_review.created_at));
    end if;
  end if;

  if not (p_action='get_submission' and v_sub.user_id=p_actor) then
    if v_sub.user_id=p_actor or v_sub.tenant_id is not null or v_sub.sharing_consent_at is null
      or v_sub.status not in ('pending_review','reviewing') or v_count>=v_sub.reviews_needed then
      raise exception 'Submission unavailable for review' using errcode='PT409';
    end if;
    select expires_at into v_expires from public.peer_review_assignments
      where submission_id=v_id and reviewer_id=p_actor;
    if p_action = 'claim_submission' and (v_expires is null or v_expires<=clock_timestamp()) then
      if exists(select 1 from public.peer_reviews where submission_id=v_id and reviewer_id=p_actor) then
        raise exception 'You already reviewed this submission' using errcode='PT409';
      end if;
      if exists(select 1 from public.peer_review_assignments a where reviewer_id=p_actor
        and submission_id<>v_id and expires_at>clock_timestamp()
        and not exists(select 1 from public.peer_reviews r where r.submission_id=a.submission_id and r.reviewer_id=p_actor)) then
        raise exception 'Finish or release your current review first' using errcode='PT409';
      end if;
      select count(*) into v_active from public.peer_review_assignments a where submission_id=v_id
        and expires_at>clock_timestamp()
        and not exists(select 1 from public.peer_reviews r where r.submission_id=v_id and r.reviewer_id=a.reviewer_id);
      if v_count+v_active>=v_sub.reviews_needed then
        raise exception 'Other reviewers have reserved the remaining reviews' using errcode='PT409';
      end if;
      v_expires := clock_timestamp()+interval '1 hour';
      insert into public.peer_review_assignments(submission_id,reviewer_id,expires_at)
        values(v_id,p_actor,v_expires) on conflict(submission_id,reviewer_id)
        do update set expires_at=excluded.expires_at;
    end if;
    if v_expires is null or v_expires<=clock_timestamp() then
      raise exception 'Reserve this essay from the review queue before continuing' using errcode='PT403';
    end if;
    if p_action='claim_submission' then
      v_expires := clock_timestamp()+interval '1 hour';
      update public.peer_review_assignments set expires_at=v_expires
        where submission_id=v_id and reviewer_id=p_actor;
    end if;
  end if;

  if p_action in ('get_submission','claim_submission') then
    return jsonb_build_object('submission',jsonb_build_object('id',v_sub.id,
      'exam_type',v_sub.exam_type,'task_type',v_sub.task_type,'prompt_text',v_sub.prompt_text,
      'essay_text',v_sub.essay_text,'word_count',v_sub.word_count,'target_band',v_sub.target_band,
      'status',v_sub.status,'reviews_count',v_count,'reviews_needed',v_sub.reviews_needed,
      'created_at',v_sub.created_at,'assignment_expires_at',v_expires));
  end if;

  if jsonb_typeof(p_payload->'overall_comment') is distinct from 'string'
    or (p_payload->'strengths' is not null and p_payload->'strengths'<>'null'::jsonb and jsonb_typeof(p_payload->'strengths')<>'string')
    or (p_payload->'improvements' is not null and p_payload->'improvements'<>'null'::jsonb and jsonb_typeof(p_payload->'improvements')<>'string') then
    raise exception 'Feedback fields must be text' using errcode='PT400';
  end if;
  v_comment := nullif(btrim(p_payload->>'overall_comment'),'');
  v_strengths := nullif(btrim(p_payload->>'strengths'),'');
  v_improvements := nullif(btrim(p_payload->>'improvements'),'');
  if v_comment is null or length(v_comment)>3000 or length(v_strengths)>3000 or length(v_improvements)>3000 then
    raise exception 'Add feedback; each feedback field is limited to 3,000 characters' using errcode='PT400';
  end if;
  v_max := case when v_sub.exam_type='itep' then 6 else 9 end;
  if p_payload->'band_score' is not null and p_payload->'band_score'<>'null'::jsonb then
    if jsonb_typeof(p_payload->'band_score') <> 'number' then
      raise exception 'Score must be numeric' using errcode='PT400';
    end if;
    v_band := (p_payload->>'band_score')::numeric;
    if v_band<0 or v_band>v_max then raise exception 'Score is outside the exam scale' using errcode='PT400'; end if;
  end if;
  insert into public.peer_reviews(submission_id,reviewer_id,band_score,overall_comment,strengths,improvements)
    values(v_id,p_actor,v_band,v_comment,v_strengths,v_improvements) returning * into v_review;
  select count(*) into v_count from public.peer_reviews where submission_id=v_id;
  update public.peer_review_submissions set reviews_count=v_count,
    status=case when v_count>=reviews_needed then 'reviewed' else 'reviewing' end where id=v_id;
  delete from public.peer_review_assignments where submission_id=v_id and reviewer_id=p_actor;
  return jsonb_build_object('review',jsonb_build_object('id',v_review.id,'created_at',v_review.created_at));
end;
$$;
revoke all on function public.peer_review_command(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.peer_review_command(uuid,text,jsonb) to service_role;

commit;
