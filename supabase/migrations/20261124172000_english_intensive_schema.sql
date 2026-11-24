create table public.english_intensive_units (
    slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
    level text not null check (level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
    title text not null check (char_length(title) between 1 and 200),
    summary text not null check (char_length(summary) between 1 and 800),
    position smallint not null check (position > 0),
    packet jsonb not null check (jsonb_typeof(packet) = 'object'),
    listening_ready boolean generated always as (coalesce(
        packet #>> '{recordings,0,audio_url}' ~ '^https://[^/]+/.+' and
        packet #>> '{recordings,1,audio_url}' ~ '^https://[^/]+/.+', false
    )) stored,
    unique (level, position)
);

create table public.english_intensive_progress (
    user_id uuid not null references public.users(id) on delete cascade,
    unit_slug text not null references public.english_intensive_units(slug),
    skill text not null check (skill in ('reading', 'listening', 'grammar', 'vocabulary', 'speaking', 'writing', 'immersion')),
    revision integer not null check (revision > 0),
    answers jsonb not null check (jsonb_typeof(answers) = 'array'),
    work jsonb not null check (jsonb_typeof(work) = 'object'),
    feedback jsonb not null check (jsonb_typeof(feedback) = 'array'),
    completed boolean not null default false,
    updated_at timestamptz not null default now(),
    primary key (user_id, unit_slug, skill)
);

alter table public.english_intensive_units enable row level security;
alter table public.english_intensive_progress enable row level security;
revoke all on public.english_intensive_units, public.english_intensive_progress from public, anon, authenticated;
grant select on public.english_intensive_units to service_role;
grant select, insert, update, delete on public.english_intensive_progress to service_role;
