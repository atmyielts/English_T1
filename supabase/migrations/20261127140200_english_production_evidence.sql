create table public.english_production_paths (
    slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    competency_slug text not null references public.english_competencies(slug),
    skill text not null check (skill in ('writing', 'speaking')),
    title text not null,
    goal text not null
);

create table public.english_production_tasks (
    family text primary key check (family ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    path_slug text not null references public.english_production_paths(slug),
    stage smallint not null check (stage between 1 and 4),
    form smallint not null check (form between 1 and 2),
    title text not null,
    brief text not null,
    rubric_version text not null check (rubric_version in ('article-choice-v1', 'time-reference-v1')),
    slots jsonb not null check (jsonb_typeof(slots) = 'array' and jsonb_array_length(slots) = 3),
    unique (family, path_slug),
    unique (path_slug, stage, form)
);

create table public.english_production_progress (
    user_id uuid not null references public.users(id) on delete cascade,
    path_slug text not null references public.english_production_paths(slug),
    stage smallint not null default 1 check (stage between 1 and 5),
    form smallint not null default 1 check (form between 1 and 3),
    due_at timestamptz,
    started_at timestamptz not null default now(),
    source_observation jsonb,
    primary key (user_id, path_slug),
    check ((stage in (3, 4)) = (due_at is not null))
);

create index english_production_due_idx
on public.english_production_progress (user_id, due_at, path_slug)
where stage in (3, 4);

create table public.english_production_evidence (
    user_id uuid not null references public.users(id) on delete cascade,
    path_slug text not null,
    task_family text not null,
    request_id uuid not null,
    checked_at timestamptz not null,
    responses jsonb not null,
    rubric_version text not null,
    input_mode text not null check (input_mode in ('text', 'confirmed_transcript')),
    opportunities smallint not null check (opportunities between 0 and 3),
    errors smallint not null check (errors between 0 and opportunities),
    feedback jsonb not null,
    primary key (user_id, path_slug, request_id),
    unique (user_id, task_family),
    foreign key (task_family, path_slug) references public.english_production_tasks(family, path_slug)
);

alter table public.english_production_paths enable row level security;
alter table public.english_production_tasks enable row level security;
alter table public.english_production_progress enable row level security;
alter table public.english_production_evidence enable row level security;
revoke all on public.english_production_paths, public.english_production_tasks,
    public.english_production_progress, public.english_production_evidence from public, anon, authenticated, service_role;
grant select on public.english_production_paths, public.english_production_tasks to service_role;
grant select, insert, update on public.english_production_progress to service_role;
grant select, insert on public.english_production_evidence to service_role;

-- Accept a narrow, attributable signal from a recent private Writing submission.
-- Corrected drafts and positive Writing scores never enter competency evidence.
create function public.english_article_reference_observation(p_user uuid)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
    select jsonb_build_object('attempt_id', attempt.id, 'prompt_slug', attempt.metadata->>'prompt_slug',
        'original', correction.item->>'original', 'suggestion', correction.item->>'corrected', 'submitted_at', attempt.submitted_at)
    from (
        select candidate.id, candidate.content_item_id, candidate.response_json, candidate.metadata, candidate.submitted_at
        from public.learning_attempts candidate
        where candidate.user_id = p_user and candidate.service_key = 'writing'
            and candidate.attempt_type = 'writing.submission' and candidate.status in ('scored', 'failed', 'submitted')
            and candidate.submitted_at >= statement_timestamp() - interval '21 days'
            and candidate.metadata->>'revision' = '1'
        order by candidate.submitted_at desc, candidate.id
        limit 24
    ) attempt
    join public.learning_content_registry_items content on content.id = attempt.content_item_id
        and content.service_key = 'writing' and content.cefr_level = 'A2'
    cross join lateral jsonb_array_elements(case
        when jsonb_typeof(attempt.response_json#>'{feedback,corrections}') = 'array'
        then attempt.response_json#>'{feedback,corrections}' else '[]'::jsonb end) with ordinality correction(item, position)
    cross join lateral (select lower(btrim(correction.item->>'original')) as original,
        lower(btrim(correction.item->>'corrected')) as corrected) phrase
    where correction.item->>'category' = 'grammar'
        and length(phrase.original) between 3 and 64 and length(phrase.corrected) between 3 and 64
        and phrase.original <> phrase.corrected
        and phrase.original ~ '^[a-z][a-z ]+[a-z]$' and phrase.corrected ~ '^[a-z][a-z ]+[a-z]$'
        and regexp_replace(phrase.original, '^(a|an|the) +', '') = regexp_replace(phrase.corrected, '^(a|an|the) +', '')
        and strpos(coalesce(attempt.response_json->>'text', ''), correction.item->>'original') > 0
    order by attempt.submitted_at desc, attempt.id, correction.position
    limit 1;
$$;

-- An independent Grammar pass is a prerequisite for trying the Writing brief.
-- Its age does not turn it into an estimate of current Writing ability.
create function public.english_production_grammar_ready(p_user uuid, p_competency text)
returns boolean
language sql stable security invoker set search_path = ''
as $$
    select exists (
        select 1 from public.english_competency_evidence
        where user_id = p_user and competency_slug = p_competency and phase = 'transfer'
            and correct = total
    );
$$;

create function public.english_production_view(p_user uuid, p_slug text)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
    select jsonb_build_object(
        'slug', pathway.slug, 'title', pathway.title, 'goal', pathway.goal, 'level', competency.level,
        'skill', pathway.skill, 'competency_slug', competency.slug, 'practice_path', competency.practice_path,
        'status', gate.status, 'stage', coalesce(progress.stage, 1), 'due_at', progress.due_at,
        'source_attempt_id', coalesce(progress.source_observation,
            case when progress.stage is null and pathway.competency_slug = 'article-reference'
                then public.english_article_reference_observation(p_user) end)->>'attempt_id',
        'source', case when progress.stage > 1 then progress.source_observation end,
        'task', case when gate.status = 'ready' then jsonb_build_object(
            'family', task.family, 'title', task.title, 'brief', task.brief,
            'prompts', (select jsonb_agg(slot->>'prompt' order by position)
                from jsonb_array_elements(task.slots) with ordinality as slots(slot, position))
        ) end,
        'history', coalesce((
            select jsonb_agg(jsonb_build_object(
                'family', past.family, 'title', past.title, 'stage', past.stage, 'checked_at', result.checked_at,
                'opportunities', result.opportunities, 'errors', result.errors, 'feedback', result.feedback,
                'rubric_version', result.rubric_version, 'input_mode', result.input_mode
            ) order by result.checked_at, past.family)
            from public.english_production_evidence result
            join public.english_production_tasks past on past.family = result.task_family
            where result.user_id = p_user and past.path_slug = pathway.slug
        ), '[]'::jsonb)
    )
    from public.english_production_paths pathway
    join public.english_competencies competency on competency.slug = pathway.competency_slug
    left join public.english_production_progress progress on progress.user_id = p_user and progress.path_slug = pathway.slug
    left join public.english_production_tasks task on task.path_slug = pathway.slug
        and task.stage = coalesce(progress.stage, 1) and task.form = coalesce(progress.form, 1)
    cross join lateral (select case
        when progress.stage = 5 then 'complete'
        when task.family is null then 'insufficient_evidence'
        when progress.due_at > statement_timestamp() then 'waiting'
        when progress.stage = 2 and not public.english_production_grammar_ready(p_user, competency.slug) then 'grammar'
        else 'ready'
    end as status) gate
    where pathway.slug = p_slug;
$$;

-- An article observation needs one unambiguous noun phrase in a learner-written sentence.
-- Natural alternative determiners and unrecognised constructions require another sample.
create function public.english_article_choice_v1(p_sentence text, p_slot jsonb)
returns text
language plpgsql immutable security invoker set search_path = ''
as $$
declare
    tokens text[];
    noun_tokens text[];
    noun_positions integer[];
    context_words text[];
    noun_at integer;
    article text;
begin
    if p_sentence ~ '["“”]|[.!?][[:space:]]+[[:alnum:]]' then return 'inconclusive'; end if;
    tokens := regexp_split_to_array(lower(btrim(regexp_replace(p_sentence, '[^a-zA-Z]+', ' ', 'g'))), ' +');
    if cardinality(tokens) not between 4 and 38 then return 'inconclusive'; end if;
    noun_tokens := string_to_array(p_slot->>'noun', ' ');
    select coalesce(array_agg(position), '{}') into noun_positions from generate_subscripts(tokens, 1) position
    where tokens[position:position + cardinality(noun_tokens) - 1] = noun_tokens;
    if cardinality(noun_positions) <> 1 then return 'inconclusive'; end if;
    noun_at := noun_positions[1];
    article := tokens[noun_at - 1];
    context_words := tokens[1:noun_at - 1] || tokens[noun_at + cardinality(noun_tokens):cardinality(tokens)];
    if not exists (select 1 from unnest(context_words) word where p_slot->'anchors' ? word) then
        return 'inconclusive';
    end if;
    if article = p_slot->>'article' then return 'correct'; end if;
    if article in ('a', 'an', 'the') then return 'incorrect'; end if;
    if p_slot->'bare_after' ? article then return 'incorrect'; end if;
    if noun_at = 1 and tokens[noun_at + cardinality(noun_tokens)] in ('is', 'was', 'has', 'will', 'sits', 'stands', 'hangs') then
        return 'incorrect';
    end if;
    return 'inconclusive';
end;
$$;

-- Spot the authored form in one fresh response. Ambiguous forms or conflicting
-- tense evidence abstain. This rubric does not analyse the audio signal.
create function public.english_time_reference_v1(p_response text, p_slot jsonb)
returns text
language plpgsql immutable security invoker set search_path = ''
as $$
declare
    normalized text;
    matches_correct boolean;
    matches_incorrect boolean;
begin
    if p_response ~ '["“”]|[.!?][[:space:]]+[[:alnum:]]' then return 'inconclusive'; end if;
    normalized := btrim(regexp_replace(replace(lower(p_response), '’', ''''), '[^a-z0-9'']+', ' ', 'g'));
    if cardinality(regexp_split_to_array(normalized, ' ')) not between 5 and 42 then return 'inconclusive'; end if;
    if not (normalized ~ (p_slot->>'anchor')) then return 'inconclusive'; end if;
    matches_correct := normalized ~ (p_slot->>'accept');
    matches_incorrect := normalized ~ (p_slot->>'reject');
    if (p_slot->>'finished')::boolean and matches_incorrect then
        return case when regexp_count(normalized, p_slot->>'accept') = 1 then 'incorrect' else 'inconclusive' end;
    end if;
    if matches_correct = matches_incorrect then return 'inconclusive'; end if;
    return case when matches_correct then 'correct' else 'incorrect' end;
end;
$$;

create function public.english_production_submit(
    p_user uuid, p_slug text, p_family text, p_request uuid, p_responses jsonb, p_input_mode text default 'text'
)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
    pathway public.english_production_paths%rowtype;
    progress public.english_production_progress%rowtype;
    task public.english_production_tasks%rowtype;
    prior public.english_production_evidence%rowtype;
    checked timestamptz;
    slot jsonb;
    response text;
    verdict text;
    results jsonb := '[]';
    opportunities integer := 0;
    errors integer := 0;
    position integer := 0;
    transfer_at timestamptz;
    observation jsonb;
begin
    select * into pathway from public.english_production_paths where slug = p_slug;
    if not found then return jsonb_build_object('code', 'not_found'); end if;
    if p_input_mode is distinct from (case when pathway.skill = 'speaking' then 'confirmed_transcript' else 'text' end) then
        return jsonb_build_object('code', 'invalid_mode');
    end if;
    if not exists (select 1 from public.english_production_tasks where family = p_family and path_slug = p_slug) then
        return jsonb_build_object('code', 'stale_batch');
    end if;
    if jsonb_typeof(p_responses) is distinct from 'array' then
        return jsonb_build_object('code', 'invalid_answers');
    end if;
    if jsonb_array_length(p_responses) <> 3 then
        return jsonb_build_object('code', 'invalid_answers');
    end if;
    if exists (
        select 1 from jsonb_array_elements(p_responses) entry
        where jsonb_typeof(entry) <> 'string' or length(btrim(entry#>>'{}')) not between 4 and 400
    ) then return jsonb_build_object('code', 'invalid_answers'); end if;
    insert into public.english_production_progress(user_id, path_slug)
        values (p_user, p_slug) on conflict (user_id, path_slug) do nothing;
    select * into strict progress from public.english_production_progress
        where user_id = p_user and path_slug = p_slug for update;

    select * into prior from public.english_production_evidence where user_id = p_user and path_slug = p_slug and request_id = p_request;
    if found then
        if prior.task_family = p_family and prior.responses = p_responses and prior.input_mode = p_input_mode then
            return jsonb_build_object('receipt', prior.task_family);
        end if;
        return jsonb_build_object('code', 'stale_batch');
    end if;
    checked := clock_timestamp();
    if progress.due_at > checked then return jsonb_build_object('code', 'not_due'); end if;
    if progress.stage = 2 and not public.english_production_grammar_ready(p_user, pathway.competency_slug) then
        return jsonb_build_object('code', 'grammar_required');
    end if;
    select * into task from public.english_production_tasks
    where path_slug = p_slug and stage = progress.stage and form = progress.form and family = p_family;
    if not found then return jsonb_build_object('code', 'stale_batch'); end if;

    for slot in select entry from jsonb_array_elements(task.slots) with ordinality as rows(entry, sequence) order by sequence loop
        response := p_responses->>position;
        position := position + 1;
        verdict := case task.rubric_version when 'article-choice-v1' then public.english_article_choice_v1(response, slot)
            when 'time-reference-v1' then public.english_time_reference_v1(response, slot) else 'inconclusive' end;
        if verdict <> 'inconclusive' then opportunities := opportunities + 1; end if;
        if verdict = 'incorrect' then errors := errors + 1; end if;
        results := results || jsonb_build_array(jsonb_build_object(
            'prompt', slot->>'prompt', 'response', response, 'verdict', verdict,
            'model', case when verdict = 'incorrect' then slot->>'model' end,
            'explanation', case when verdict <> 'inconclusive' then slot->>'explanation' end
        ));
    end loop;

    insert into public.english_production_evidence
    (user_id, path_slug, task_family, request_id, checked_at, responses, rubric_version, input_mode, opportunities, errors, feedback)
    values (p_user, p_slug, p_family, p_request, checked, p_responses, task.rubric_version, p_input_mode, opportunities, errors, results);
    if pathway.competency_slug = 'article-reference' and progress.stage = 1 and progress.source_observation is null then
        observation := public.english_article_reference_observation(p_user);
    end if;
    if opportunities <> 3 then
        progress.form := progress.form + 1;
        if progress.stage in (3, 4) and progress.form = 2 then
            progress.due_at := checked + interval '24 hours';
        end if;
    else
        progress.stage := progress.stage + 1;
        progress.form := 1;
        if progress.stage = 3 then
            progress.due_at := checked + interval '168 hours';
        elsif progress.stage = 4 then
            select evidence.checked_at into strict transfer_at from public.english_production_evidence evidence
            join public.english_production_tasks scored_task on scored_task.family = evidence.task_family
            where evidence.user_id = p_user and scored_task.path_slug = p_slug and scored_task.stage = 2 and evidence.opportunities = 3;
            progress.due_at := greatest(checked + interval '24 hours', transfer_at + interval '672 hours');
        else
            progress.due_at := null;
        end if;
    end if;
    update public.english_production_progress
    set stage = progress.stage, form = progress.form, due_at = progress.due_at,
        source_observation = coalesce(progress.source_observation, observation)
    where user_id = p_user and path_slug = p_slug;
    return jsonb_build_object('receipt', task.family);
end;
$$;

create function public.english_due_production(p_user uuid, p_skills text[])
returns jsonb
language sql stable security invoker set search_path = ''
as $$
    select jsonb_build_object('slug', pathway.slug, 'skill', pathway.skill, 'level', competency.level,
        'title', pathway.title, 'due_at', coalesce(progress.due_at, progress.started_at),
        'kind', 'production', 'stage', progress.stage,
        'needs_grammar', progress.stage = 2 and not public.english_production_grammar_ready(p_user, competency.slug))
    from public.english_production_progress progress
    join public.english_production_paths pathway on pathway.slug = progress.path_slug
    join public.english_competencies competency on competency.slug = pathway.competency_slug
    join public.english_production_tasks task on task.path_slug = progress.path_slug
        and task.stage = progress.stage and task.form = progress.form
    where progress.user_id = p_user and pathway.skill = any(p_skills) and competency.skill = any(p_skills)
        and (progress.stage = 2 or (progress.stage in (3, 4) and progress.due_at <= statement_timestamp()))
    order by progress.due_at nulls last, progress.path_slug
    limit 1;
$$;

revoke all on function public.english_article_reference_observation(uuid),
    public.english_production_grammar_ready(uuid, text), public.english_production_view(uuid, text),
    public.english_article_choice_v1(text, jsonb), public.english_time_reference_v1(text, jsonb),
    public.english_production_submit(uuid, text, text, uuid, jsonb, text),
    public.english_due_production(uuid, text[]) from public, anon, authenticated;
grant execute on function public.english_article_reference_observation(uuid),
    public.english_production_grammar_ready(uuid, text), public.english_production_view(uuid, text),
    public.english_article_choice_v1(text, jsonb), public.english_time_reference_v1(text, jsonb),
    public.english_production_submit(uuid, text, text, uuid, jsonb, text),
    public.english_due_production(uuid, text[]) to service_role;

do $$
declare
    relations text[] := public.account_personal_erasure_tables();
begin
    relations := relations || array['english_production_evidence', 'english_production_progress'];
    execute format(
        'create or replace function public.account_personal_erasure_tables() returns text[] language sql immutable set search_path=pg_catalog,public as %L',
        format('select %L::text[];', relations::text)
    );
end;
$$;

create trigger account_closed_personal_guard before insert or update on public.english_production_progress
for each row execute function public.guard_closed_personal_record('user_id');

create trigger account_closed_personal_guard before insert on public.english_production_evidence
for each row execute function public.guard_closed_personal_record('user_id');
