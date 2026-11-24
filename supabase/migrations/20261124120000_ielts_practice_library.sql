create table public.ielts_practice_library_sets (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 100),
  skill text not null check (skill in ('reading', 'writing', 'speaking')),
  track text not null check (track in ('academic', 'general', 'both')),
  title text not null check (length(trim(title)) between 1 and 180),
  minutes smallint not null check (minutes between 1 and 60),
  display_order smallint not null check (display_order > 0),
  learner_content jsonb not null check (jsonb_typeof(learner_content) = 'object'),
  review_content jsonb not null check (jsonb_typeof(review_content) = 'object'),
  is_published boolean not null default false
);

alter table public.ielts_practice_library_sets enable row level security;
revoke all on table public.ielts_practice_library_sets from public, anon, authenticated;
grant select, insert, update on table public.ielts_practice_library_sets to service_role;
