begin;

insert into auth.users(id, email, aud, role, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select id, id || '@example.invalid', 'authenticated', 'authenticated', now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Writing evidence fixture"}'
from unnest(array['11000000-0000-4000-8000-000000000001'::uuid, '11000000-0000-4000-8000-000000000002'::uuid]) id;

insert into public.learning_content_registry_items
    (id, language_id, product_id, service_key, content_type, source_ref, title, skill_key, cefr_level)
select '11000000-0000-4000-8000-000000000100', id, '2f7c2d09-08e4-4f9f-9e8d-4f5916ef8532',
    'writing', 'writing.prompt', 'evidence-fixture-shopping-note', 'Writing evidence fixture', 'writing', 'A2'
from public.languages where code = 'en';

insert into public.learning_attempts
    (id, user_id, content_item_id, language_id, product_id, service_key, attempt_type, status, response_json, metadata, submitted_at)
select '11000000-0000-4000-8000-000000000101', '11000000-0000-4000-8000-000000000001',
    id, language_id, product_id, 'writing', 'writing.submission', 'scored',
    '{"text":"I bought a apple today.","feedback":{"corrections":[
        {"category":"grammar","original":"a pear","corrected":"the pear"},
        {"category":"grammar","original":"a apple","corrected":"an apple"}
    ]}}', '{"revision":1,"prompt_slug":"evidence-fixture-shopping-note"}', now()
from public.learning_content_registry_items where id = '11000000-0000-4000-8000-000000000100';

-- Exact keys and calibrated anchor examples for the constrained article scorer.
do $$
declare
    slot jsonb;
    case_entry record;
    wrong jsonb;
begin
    if (select count(*) from public.english_production_tasks) <> 16 then raise exception 'expected sixteen separate contexts'; end if;
    for slot in select item from public.english_production_tasks cross join lateral jsonb_array_elements(slots) item
        where rubric_version = 'article-choice-v1' loop
        if public.english_article_choice_v1(slot->>'model', slot) is distinct from 'correct' then
            raise exception 'authored anchor rejected: %', slot->>'model';
        end if;
        wrong := jsonb_set(slot, '{article}', to_jsonb(case when slot->>'article' = 'the' then 'a' else 'the' end));
        if public.english_article_choice_v1(slot->>'model', wrong) is distinct from 'incorrect' then
            raise exception 'article swap misclassified: %', slot->>'model';
        end if;
    end loop;
    for slot in select item from public.english_production_tasks cross join lateral jsonb_array_elements(slots) item
        where rubric_version = 'time-reference-v1' loop
        if public.english_time_reference_v1(slot->>'model', slot) is distinct from 'correct' then
            raise exception 'spoken wording anchor rejected: %', slot->>'model';
        end if;
    end loop;

    select slots->1 into slot from public.english_production_tasks where family = 'club-lost-property';
    for case_entry in select * from (values
        ('I left THE key in your drawer.', 'correct'),
        ('I left the spare key in your drawer.', 'inconclusive'),
        ('I left your key in the drawer.', 'inconclusive'),
        ('I left that key in the drawer.', 'inconclusive'),
        ('I left key in your drawer.', 'incorrect'),
        ('Key is in the drawer.', 'incorrect'),
        ('The key is in my drawer.', 'correct'),
        ('I left the key beside a second key.', 'inconclusive'),
        ('I left "the key" in the drawer.', 'inconclusive'),
        ('Everything is in the other drawer.', 'inconclusive')
    ) as cases(response, verdict) loop
        if public.english_article_choice_v1(case_entry.response, slot) is distinct from case_entry.verdict then
            raise exception 'incorrect anchor score: %', case_entry.response;
        end if;
    end loop;
    select slots->0 into slot from public.english_production_tasks where family = 'repair-shift-update';
    for case_entry in select * from (values
        ('I have repaired the back door yesterday.', 'incorrect'),
        ('I repaired the door and have repaired a second door yesterday.', 'inconclusive'),
        ('I repaired the back door.', 'inconclusive'),
        ('I replaced the lock yesterday.', 'inconclusive'),
        ('I clearly repaired the back door yesterday.', 'correct')
    ) as cases(response, verdict) loop
        if public.english_time_reference_v1(case_entry.response, slot) is distinct from case_entry.verdict then
            raise exception 'incorrect spoken anchor score: %', case_entry.response;
        end if;
    end loop;
    if has_function_privilege('authenticated', 'public.english_production_submit(uuid,text,text,uuid,jsonb,text)', 'EXECUTE')
        or has_table_privilege('authenticated', 'public.english_production_tasks', 'SELECT') then
        raise exception 'learner role can bypass authenticated edge or inspect the keys';
    end if;
end;
$$;

set local role service_role;
do $$
declare
    learner constant uuid := '11000000-0000-4000-8000-000000000001';
    other constant uuid := '11000000-0000-4000-8000-000000000002';
    check_id constant text := 'article-reference-writing';
    submit_id constant uuid := '11000000-0000-4000-8000-000000000102';
    baseline constant jsonb :=
        '["I found the bottle under the bench.", "I left your key in the drawer.", "Could you bring an umbrella to the gate?"]';
    usable_baseline constant jsonb :=
        '["I left a table beside the window.", "Please bring an envelope for the drawing.", "I bought brush this morning."]';
    fresh constant jsonb :=
        '["A passenger found a wallet near platform two.", "I left the parcel in the manager’s office.", "Can you book an airport taxi for me?"]';
    week constant jsonb :=
        '["I noticed a leak in the corridor.", "The screen will be ready at three.", "Please call an electrician this morning."]';
    retry_week constant jsonb :=
        '["I left the hat on the shelf.", "Please draw an arrow on the card.", "A parent brought a cushion for the audience."]';
    month constant jsonb :=
        '["The bell is beside the front door.", "I can leave a blanket on the bed.", "I can lend you an adapter for your charger."]';
    current_view jsonb;
    receipt jsonb;
    transfer_at timestamptz;
begin
    current_view := public.english_production_view(learner, check_id);
    if current_view->>'source_attempt_id' <> '11000000-0000-4000-8000-000000000101'
        or current_view->>'source' is not null or current_view->'task' ? 'slots'
        or public.english_production_view(other, check_id)->>'source_attempt_id' is not null then
        raise exception 'source or private keys were exposed to the wrong stage or learner';
    end if;
    receipt := public.english_production_submit(learner, check_id, 'club-lost-property', submit_id, baseline);
    if receipt->>'receipt' <> 'club-lost-property'
        or public.english_production_view(learner, check_id)#>>'{task,family}' <> 'craft-room-handover' then
        raise exception 'inconclusive baseline did not offer a fresh form';
    end if;
    if public.english_production_submit(learner, check_id, 'club-lost-property', submit_id, baseline) <> receipt then
        raise exception 'retry did not return the original receipt';
    end if;
    if public.english_production_submit(learner, check_id, 'club-lost-property', gen_random_uuid(), baseline)->>'code'
        <> 'stale_batch' then raise exception 'replaying a task under a new request was allowed'; end if;

    perform public.english_production_submit(learner, check_id, 'craft-room-handover', gen_random_uuid(), usable_baseline);
    current_view := public.english_production_view(learner, check_id);
    if current_view->>'status' <> 'grammar' or current_view->>'task' is not null
        or current_view#>>'{source,original}' <> 'a apple'
        or current_view#>>'{history,1,errors}' <> '2'
        or current_view#>>'{history,1,opportunities}' <> '3' then
        raise exception 'baseline evidence, exact quote or Grammar checkpoint is incorrect: %', current_view;
    end if;
    if public.english_production_submit(learner, check_id, 'station-help-desk', gen_random_uuid(), fresh)->>'code'
        <> 'grammar_required' then raise exception 'Writing progression skipped the independent Grammar check'; end if;
    if public.english_due_production(learner, array['writing']) is not null
        or public.english_due_production(learner, array['grammar']) is not null
        or public.english_due_production(learner, array['writing', 'grammar'])->>'stage' <> '2' then
        raise exception 'the same entitlement boundary was not applied to recommendations';
    end if;

    perform public.english_competency_submit(learner, 'grammar', 'article-reference', 'diagnostic', 1::smallint,
        gen_random_uuid(), '[1,"an"]');
    select jsonb_agg(case when question ? 'key' then question->'key' else question->'accepted'->0 end order by position)
    into current_view from public.english_competency_batches,
        lateral jsonb_array_elements(questions) with ordinality as entries(question, position)
    where competency_slug = 'article-reference' and phase = 'transfer' and round = 1;
    perform public.english_competency_submit(learner, 'grammar', 'article-reference', 'transfer', 1::smallint,
        gen_random_uuid(), current_view);

    perform public.english_production_submit(learner, check_id, 'station-help-desk', gen_random_uuid(), fresh);
    select checked_at into transfer_at from public.english_production_evidence
        where user_id = learner and task_family = 'station-help-desk';
    current_view := public.english_production_view(learner, check_id);
    if current_view->>'status' <> 'waiting' or current_view->>'task' is not null
        or (current_view->>'due_at')::timestamptz <> transfer_at + interval '168 hours'
        or current_view#>>'{history,2,errors}' <> '0' then raise exception 'seven-day holdout or writing transfer is incorrect'; end if;
    if public.english_due_production(learner, array['writing', 'grammar']) is not null
        or public.english_production_submit(learner, check_id, 'building-repair-desk', gen_random_uuid(), week)->>'code'
        <> 'not_due' then raise exception 'a week check was available too early'; end if;
    update public.english_production_progress set due_at = now() - interval '1 hour' where user_id = learner and path_slug = check_id;
    if public.english_due_production(learner, array['writing', 'grammar'])->>'stage' <> '3' then
        raise exception 'due week assessment not recommended';
    end if;
    perform public.english_production_submit(learner, check_id, 'building-repair-desk', gen_random_uuid(),
        jsonb_set(week, '{1}', '"Your screen will be ready at three."'));
    if public.english_production_view(learner, check_id)->>'status' is distinct from 'waiting'
        or public.english_due_production(learner, array['writing', 'grammar']) is not null then
        raise exception 'a delayed sample was replaced immediately after seeing feedback';
    end if;
    update public.english_production_progress set due_at = now() - interval '1 hour' where user_id = learner and path_slug = check_id;
    if public.english_production_view(learner, check_id)#>>'{task,family}' is distinct from 'school-play-handover' then
        raise exception 'the replacement holdout reused an exposed task';
    end if;
    perform public.english_production_submit(learner, check_id, 'school-play-handover', gen_random_uuid(), retry_week);
    current_view := public.english_production_view(learner, check_id);
    if (current_view->>'due_at')::timestamptz <> transfer_at + interval '672 hours' then
        raise exception 'four-week holdout did not use the transfer date';
    end if;
    update public.english_production_progress set due_at = now() - interval '1 hour' where user_id = learner and path_slug = check_id;
    perform public.english_production_submit(learner, check_id, 'holiday-flat-arrival', gen_random_uuid(), month);
    current_view := public.english_production_view(learner, check_id);
    if current_view->>'status' <> 'complete' or jsonb_array_length(current_view->'history') <> 6
        or jsonb_array_length(public.english_production_view(other, check_id)->'history') <> 0
        or public.english_due_production(learner, array['writing', 'grammar']) is not null then
        raise exception 'completion or ownership boundary failed';
    end if;
end;
$$;

do $$
declare
    learner constant uuid := '11000000-0000-4000-8000-000000000002';
    check_id constant text := 'time-reference-voice-updates';
    request_id constant uuid := '11000000-0000-4000-8000-000000000103';
    responses constant jsonb :=
        '["I repaired the back door yesterday.", "I have been working here since May.", "I have checked four lamps so far."]';
    fresh constant jsonb :=
        '["We moved the produce stall to the east gate last week.", "We have been selling tea at the market since March.", "I have approved three requests so far."]';
    current_view jsonb;
    answer_key jsonb;
begin
    if public.english_production_submit(learner, check_id, 'repair-shift-update', request_id, responses, 'text')->>'code'
        is distinct from 'invalid_mode' then raise exception 'typed rehearsal created spoken evidence'; end if;
    perform public.english_production_submit(learner, check_id, 'repair-shift-update', request_id, responses, 'confirmed_transcript');
    current_view := public.english_production_view(learner, check_id);
    if current_view->>'status' is distinct from 'grammar' or current_view#>>'{history,0,input_mode}' is distinct from 'confirmed_transcript'
        or current_view#>>'{history,0,rubric_version}' is distinct from 'time-reference-v1'
        or current_view#>>'{history,0,opportunities}' is distinct from '3' then
        raise exception 'spoken wording provenance was not preserved';
    end if;

    perform public.english_competency_submit(learner, 'grammar', 'time-and-current-relevance', 'diagnostic', 1::smallint,
        gen_random_uuid(), '[1,"wrote"]');
    select jsonb_agg(case when question ? 'key' then question->'key' else question->'accepted'->0 end order by position)
        into answer_key from public.english_competency_batches,
        lateral jsonb_array_elements(questions) with ordinality as entries(question, position)
        where competency_slug = 'time-and-current-relevance' and phase = 'transfer' and round = 1;
    perform public.english_competency_submit(learner, 'grammar', 'time-and-current-relevance', 'transfer', 1::smallint,
        gen_random_uuid(), answer_key);
    if public.english_production_view(learner, check_id)#>>'{task,family}' is distinct from 'market-coordinator-update'
        or public.english_due_production(learner, array['grammar','writing']) is not null
        or public.english_due_production(learner, array['grammar','speaking'])->>'skill' is distinct from 'speaking' then
        raise exception 'different-skill fresh transfer or entitlement is wrong';
    end if;
    perform public.english_production_submit(learner, check_id, 'market-coordinator-update', gen_random_uuid(), fresh, 'confirmed_transcript');
    if public.english_production_view(learner, check_id)->>'status' is distinct from 'waiting' then
        raise exception 'spoken wording check did not schedule a later holdout';
    end if;
end;
$$;
rollback;
