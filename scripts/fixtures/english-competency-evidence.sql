-- Rollback-only contract against an isolated database with the release migrations applied.
begin;

do $fixture$
declare
    learner uuid := gen_random_uuid();
    other_learner uuid := gen_random_uuid();
    request_id uuid := gen_random_uuid();
    slug constant text := 'routine-questions';
    settings text[];
    detail jsonb;
    receipt jsonb;
    reply jsonb;
    first_due timestamptz;
    next_due timestamptz;
begin
    insert into auth.users(id, email, aud, role, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
    select id, id || '@example.invalid', 'authenticated', 'authenticated', now(),
        '{"provider":"email","providers":["email"]}', '{"full_name":"Grammar evidence fixture"}'
    from unnest(array[learner, other_learner]) id;

    if (select count(distinct level) from public.english_competencies where skill = 'grammar') <> 6
        or (select count(*) from public.english_competency_batches) <> 30
        or (select count(distinct item->>'prompt') from public.english_competency_batches,
            jsonb_array_elements(questions) as item) <> 60 then
        raise exception 'The six-level bank is incomplete or contains repeated prompts';
    end if;
    settings := public.account_personal_erasure_tables();
    if not settings @> array['english_competency_evidence', 'english_competency_progress']
        or (select count(*) from pg_trigger
            where tgname = 'account_closed_personal_guard'
            and tgrelid in ('public.english_competency_evidence'::regclass, 'public.english_competency_progress'::regclass)) <> 2 then
        raise exception 'Account erasure coverage or its write guards are missing';
    end if;

    if has_table_privilege('authenticated', 'public.english_competency_batches', 'SELECT')
        or has_table_privilege('anon', 'public.english_competency_evidence', 'SELECT')
        or has_function_privilege('authenticated', 'public.english_competency_view(uuid,text,text)', 'EXECUTE')
        or has_function_privilege('authenticated', 'public.english_competency_submit(uuid,text,text,text,smallint,uuid,jsonb)', 'EXECUTE')
        or has_table_privilege('service_role', 'public.english_competency_evidence', 'UPDATE') then
        raise exception 'Private answers, evidence or mutation privileges are exposed';
    end if;

    set local role service_role;
    detail := public.english_competency_view(learner, 'grammar', slug)->0;
    if detail->>'status' is distinct from 'diagnostic' or jsonb_array_length(detail#>'{batch,questions}') <> 2
        or detail#>'{batch,questions,0}' ?| array['key', 'accepted', 'explanation']
        or detail#>'{batch,questions,1}' ?| array['key', 'accepted', 'explanation']
        or detail->>'guide' is not null then
        raise exception 'The initial view includes private grading data or the wrong phase';
    end if;
    reply := public.english_competency_submit(learner, 'grammar', slug, 'transfer', 1::smallint, gen_random_uuid(), '[2,"does"]');
    if reply->>'code' is distinct from 'stale_batch' then raise exception 'Phase skipping succeeded'; end if;
    reply := public.english_competency_submit(learner, 'grammar', slug, 'diagnostic', 1::smallint, gen_random_uuid(), '[1,1]');
    if reply->>'code' is distinct from 'invalid_answers' then raise exception 'Wrong answer type accepted'; end if;

    receipt := public.english_competency_submit(learner, 'grammar', slug, 'diagnostic', 1::smallint, request_id, '[0,"  DOESN’T   WORK  "]');
    reply := public.english_competency_submit(learner, 'grammar', slug, 'diagnostic', 1::smallint, request_id, '[0,"  DOESN’T   WORK  "]');
    if reply is distinct from receipt or receipt#>>'{receipt,phase}' is distinct from 'diagnostic' then
        raise exception 'An identical retry failed to return the original receipt';
    end if;
    reply := public.english_competency_submit(learner, 'grammar', slug, 'diagnostic', 1::smallint, request_id, '[1,"does not work"]');
    if reply->>'code' is distinct from 'stale_batch' then raise exception 'Idempotency key allowed a changed response'; end if;
    detail := public.english_competency_view(learner, 'grammar', slug)->0;
    if detail->>'status' is distinct from 'transfer'
        or detail#>>'{history,0,correct}' is distinct from '1'
        or detail#>>'{history,0,feedback,0,model}' is distinct from 'Does'
        or jsonb_array_length(detail->'history') <> 1 then
        raise exception 'Diagnostic grading, feedback or history differs';
    end if;
    detail := public.english_competency_view(other_learner, 'grammar', slug)->0;
    if detail->>'status' is distinct from 'diagnostic' or detail->'history' is distinct from '[]'::jsonb then
        raise exception 'Evidence from one learner changed another learner’s check';
    end if;

    perform public.english_competency_submit(learner, 'grammar', slug, 'transfer', 1::smallint, gen_random_uuid(), '[2,"do"]');
    detail := public.english_competency_view(learner, 'grammar', slug)->0;
    if detail->>'status' is distinct from 'transfer' or detail#>>'{batch,round}' is distinct from '2' then
        raise exception 'A transfer miss did not open a fresh batch';
    end if;
    reply := public.english_competency_submit(learner, 'grammar', slug, 'transfer', 1::smallint, gen_random_uuid(), '[2,"does"]');
    if reply->>'code' is distinct from 'stale_batch' then raise exception 'A revealed batch could qualify again'; end if;
    perform public.english_competency_submit(learner, 'grammar', slug, 'transfer', 2::smallint, gen_random_uuid(), '[0,"do"]');
    detail := public.english_competency_view(learner, 'grammar', slug)->0;
    first_due := (detail->>'due_at')::timestamptz;
    if detail->>'status' is distinct from 'waiting' or detail->>'batch' is not null
        or first_due - (detail#>>'{history,2,checked_at}')::timestamptz is distinct from interval '24 hours' then
        raise exception 'The first delayed check was exposed or scheduled incorrectly';
    end if;
    reply := public.english_competency_submit(learner, 'grammar', slug, 'retention', 1::smallint, gen_random_uuid(), '[3,"does not accept"]');
    if reply->>'code' is distinct from 'not_due' then raise exception 'An early submission advanced mastery'; end if;

    -- Shift the local fixture’s schedule without adding a client-controlled clock.
    update public.english_competency_progress set due_at = now() - interval '1 day' where user_id = learner;
    if not exists (
        select from jsonb_array_elements(public.english_competency_view(learner, 'grammar')) entry
        where entry->>'slug' = slug and entry->>'status' = 'retention' and not (entry ?| array['batch','history'])
    ) then raise exception 'A due check is missing from the lightweight catalog'; end if;
    perform public.english_competency_submit(learner, 'grammar', slug, 'retention', 1::smallint, gen_random_uuid(), '[3,"does not accepts"]');
    detail := public.english_competency_view(learner, 'grammar', slug)->0;
    next_due := (detail->>'due_at')::timestamptz;
    if detail->>'status' is distinct from 'waiting' or detail->>'batch' is not null
        or next_due - (detail#>>'{history,3,checked_at}')::timestamptz is distinct from interval '24 hours' then
        raise exception 'A failed retention check did not schedule another delayed batch';
    end if;
    update public.english_competency_progress set due_at = now() - interval '1 day' where user_id = learner;
    perform public.english_competency_submit(learner, 'grammar', slug, 'retention', 2::smallint, gen_random_uuid(), '[1,"does"]');
    detail := public.english_competency_view(learner, 'grammar', slug)->0;
    if detail->>'status' is distinct from 'demonstrated' or detail->>'batch' is not null
        or detail->>'due_at' is not null or jsonb_array_length(detail->'history') <> 5 then
        raise exception 'The final state or its retained evidence differs';
    end if;

    perform public.english_competency_submit(other_learner, 'grammar', slug, 'diagnostic', 1::smallint, gen_random_uuid(), '[0,"do not work"]');
    perform public.english_competency_submit(other_learner, 'grammar', slug, 'transfer', 1::smallint, gen_random_uuid(), '[0,"do"]');
    perform public.english_competency_submit(other_learner, 'grammar', slug, 'transfer', 2::smallint, gen_random_uuid(), '[2,"does"]');
    detail := public.english_competency_view(other_learner, 'grammar', slug)->0;
    if detail->>'status' is distinct from 'needs_practice' or detail->>'batch' is not null
        or detail->>'guide' is null or jsonb_array_length(detail->'history') <> 3 then
        raise exception 'An exhausted bank must retain history and direct the learner to practice';
    end if;
    reset role;
end;
$fixture$;

select 'English competency evidence contract passed' as result;
rollback;
