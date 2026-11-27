create table public.english_competencies (
    slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
    skill text not null check (skill in ('grammar', 'vocabulary', 'reading', 'writing', 'listening', 'speaking', 'immersion')),
    level text not null check (level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
    title text not null,
    goal text not null,
    guide text not null,
    practice_path text not null check (practice_path ~ '^/[a-z]+/[a-z0-9]+(-[a-z0-9]+)*$')
);

-- Batches are append-only for the runtime. Add fresh material under new round numbers.
create table public.english_competency_batches (
    competency_slug text not null references public.english_competencies(slug),
    phase text not null check (phase in ('diagnostic', 'transfer', 'retention')),
    round smallint not null check (round > 0),
    questions jsonb not null check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) between 2 and 8),
    primary key (competency_slug, phase, round)
);

create table public.english_competency_progress (
    user_id uuid not null references public.users(id) on delete cascade,
    competency_slug text not null references public.english_competencies(slug),
    phase text not null default 'diagnostic' check (phase in ('diagnostic', 'transfer', 'retention', 'demonstrated')),
    round smallint not null default 1 check (round > 0),
    due_at timestamptz,
    primary key (user_id, competency_slug),
    check ((phase = 'retention') = (due_at is not null))
);

create table public.english_competency_evidence (
    user_id uuid not null references public.users(id) on delete cascade,
    competency_slug text not null,
    phase text not null,
    round smallint not null,
    request_id uuid not null,
    answers jsonb not null,
    correct smallint not null,
    total smallint not null check (total between 2 and 8 and correct between 0 and total),
    checked_at timestamptz not null,
    feedback jsonb not null,
    primary key (user_id, competency_slug, request_id),
    unique (user_id, competency_slug, phase, round),
    foreign key (competency_slug, phase, round) references public.english_competency_batches(competency_slug, phase, round)
);

alter table public.english_competencies enable row level security;
alter table public.english_competency_batches enable row level security;
alter table public.english_competency_progress enable row level security;
alter table public.english_competency_evidence enable row level security;
revoke all on public.english_competencies, public.english_competency_batches,
    public.english_competency_progress, public.english_competency_evidence from public, anon, authenticated, service_role;
grant select on public.english_competencies, public.english_competency_batches to service_role;
grant select, insert, update on public.english_competency_progress to service_role;
grant select, insert on public.english_competency_evidence to service_role;

create function public.english_competency_view(p_user uuid, p_skill text, p_slug text default null)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
    select coalesce(jsonb_agg(
        jsonb_build_object(
            'slug', competency.slug,
            'level', competency.level,
            'title', competency.title,
            'goal', competency.goal,
            'status', case
                when progress.phase = 'demonstrated' then 'demonstrated'
                when batch.round is null then 'needs_practice'
                when progress.due_at > statement_timestamp() then 'waiting'
                else coalesce(progress.phase, 'diagnostic')
            end,
            'due_at', case when batch.round is not null then progress.due_at end
        ) || case when p_slug is null then '{}'::jsonb else jsonb_build_object(
            'practice_path', competency.practice_path,
            'guide', case when progress.phase <> 'diagnostic' then competency.guide end,
            'batch', case when batch.round is not null
                and (progress.due_at is null or progress.due_at <= statement_timestamp())
                then jsonb_build_object(
                    'phase', batch.phase, 'round', batch.round,
                    'questions', (
                        select jsonb_agg(
                            jsonb_build_object('prompt', item->>'prompt', 'options', item->'options')
                            order by position
                        )
                        from jsonb_array_elements(batch.questions) with ordinality as items(item, position)
                    )
                )
            end,
            'history', coalesce((
                select jsonb_agg(jsonb_build_object(
                    'phase', evidence.phase, 'round', evidence.round, 'correct', evidence.correct,
                    'total', evidence.total, 'checked_at', evidence.checked_at, 'feedback', evidence.feedback
                ) order by case evidence.phase when 'diagnostic' then 1 when 'transfer' then 2 else 3 end, evidence.round)
                from public.english_competency_evidence evidence
                where evidence.user_id = p_user and evidence.competency_slug = competency.slug
            ), '[]'::jsonb)
        ) end order by competency.level, competency.slug
    ), '[]'::jsonb)
    from public.english_competencies competency
    left join public.english_competency_progress progress
        on progress.user_id = p_user and progress.competency_slug = competency.slug
    left join public.english_competency_batches batch
        on batch.competency_slug = competency.slug
        and batch.phase = coalesce(progress.phase, 'diagnostic')
        and batch.round = coalesce(progress.round, 1)
    where competency.skill = p_skill and (p_slug is null or competency.slug = p_slug);
$$;

create function public.english_competency_submit(
    p_user uuid, p_skill text, p_slug text, p_phase text, p_round smallint, p_request uuid, p_answers jsonb
)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
    current_progress public.english_competency_progress%rowtype;
    prior public.english_competency_evidence%rowtype;
    task jsonb;
    answer jsonb;
    bank jsonb;
    explanation jsonb := '[]'::jsonb;
    checked timestamptz;
    choice int;
    written text;
    response_text text;
    model_answer text;
    is_correct boolean;
    score int := 0;
    position int := 0;
begin
    if not exists (select 1 from public.english_competencies where slug = p_slug and skill = p_skill) then
        return jsonb_build_object('code', 'not_found');
    end if;

    insert into public.english_competency_progress (user_id, competency_slug)
    values (p_user, p_slug) on conflict (user_id, competency_slug) do nothing;
    select * into strict current_progress from public.english_competency_progress
    where user_id = p_user and competency_slug = p_slug for update;

    select * into prior from public.english_competency_evidence
    where user_id = p_user and competency_slug = p_slug and request_id = p_request;
    if found then
        if prior.phase is distinct from p_phase or prior.round is distinct from p_round
            or prior.answers is distinct from p_answers then
            return jsonb_build_object('code', 'stale_batch');
        end if;
        return jsonb_build_object('receipt', jsonb_build_object('phase', prior.phase, 'round', prior.round));
    end if;

    checked := clock_timestamp();
    if current_progress.phase is distinct from p_phase or current_progress.round is distinct from p_round then
        return jsonb_build_object('code', 'stale_batch');
    end if;
    if current_progress.due_at > checked then
        return jsonb_build_object('code', 'not_due');
    end if;
    select questions into bank from public.english_competency_batches
    where competency_slug = p_slug and phase = p_phase and round = p_round;
    if not found then
        return jsonb_build_object('code', 'no_batch');
    end if;
    if jsonb_typeof(p_answers) is distinct from 'array' then
        return jsonb_build_object('code', 'invalid_answers');
    end if;
    if jsonb_array_length(p_answers) <> jsonb_array_length(bank) then
        return jsonb_build_object('code', 'invalid_answers');
    end if;

    for task in select item from jsonb_array_elements(bank) with ordinality as questions(item, sequence) order by sequence loop
        answer := p_answers -> position;
        position := position + 1;
        if task ? 'options' then
            if jsonb_typeof(answer) <> 'number' or (answer #>> '{}') !~ '^[0-7]$' then
                return jsonb_build_object('code', 'invalid_answers');
            end if;
            choice := (answer #>> '{}')::int;
            if choice >= jsonb_array_length(task->'options') then
                return jsonb_build_object('code', 'invalid_answers');
            end if;
            is_correct := choice = (task->>'key')::int;
            response_text := task->'options'->>choice;
            model_answer := task->'options'->>((task->>'key')::int);
        else
            if jsonb_typeof(answer) <> 'string' then
                return jsonb_build_object('code', 'invalid_answers');
            end if;
            response_text := answer #>> '{}';
            written := lower(btrim(regexp_replace(replace(response_text, '’', ''''), '[[:space:]]+', ' ', 'g')));
            if written = '' or length(response_text) > 160 then
                return jsonb_build_object('code', 'invalid_answers');
            end if;
            is_correct := (task->'accepted') ? written;
            model_answer := task->'accepted'->>0;
        end if;

        if is_correct then score := score + 1; end if;
        explanation := explanation || jsonb_build_array(jsonb_build_object(
            'prompt', task->>'prompt', 'response', response_text, 'model', model_answer,
            'correct', is_correct, 'explanation', task->>'explanation'
        ));
    end loop;

    insert into public.english_competency_evidence
        (user_id, competency_slug, phase, round, request_id, answers, correct, total, checked_at, feedback)
    values (p_user, p_slug, p_phase, p_round, p_request, p_answers, score, position, checked, explanation);

    if p_phase = 'diagnostic' then
        current_progress.phase := 'transfer';
        current_progress.round := 1;
    elsif score = position then
        current_progress.phase := case p_phase when 'transfer' then 'retention' else 'demonstrated' end;
        current_progress.round := 1;
    else
        current_progress.round := p_round + 1;
    end if;
    current_progress.due_at := case when current_progress.phase = 'retention'
        then checked + interval '24 hours' end;

    update public.english_competency_progress
    set phase = current_progress.phase, round = current_progress.round, due_at = current_progress.due_at
    where user_id = p_user and competency_slug = p_slug;

    return jsonb_build_object('receipt', jsonb_build_object('phase', p_phase, 'round', p_round));
end;
$$;

revoke all on function public.english_competency_view(uuid, text, text) from public, anon, authenticated;
revoke all on function public.english_competency_submit(uuid, text, text, text, smallint, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.english_competency_view(uuid, text, text) to service_role;
grant execute on function public.english_competency_submit(uuid, text, text, text, smallint, uuid, jsonb) to service_role;

-- Auth soft-deletion retains a scrubbed public.users row. Register both tables
-- for erasure and use the shared guard to serialize writes with account closure.
do $$
declare
    relations text[] := public.account_personal_erasure_tables();
begin
    relations := relations || array['english_competency_evidence', 'english_competency_progress'];
    execute format(
        'create or replace function public.account_personal_erasure_tables() returns text[] language sql immutable set search_path=pg_catalog,public as %L',
        format('select %L::text[];', relations::text)
    );
end;
$$;

create trigger account_closed_personal_guard before insert or update on public.english_competency_progress
for each row execute function public.guard_closed_personal_record('user_id');

create trigger account_closed_personal_guard before insert on public.english_competency_evidence
for each row execute function public.guard_closed_personal_record('user_id');
