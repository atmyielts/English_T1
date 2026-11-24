create table public.ielts_practice_library_progress (
  user_id uuid not null references public.users(id) on delete cascade,
  set_slug text not null references public.ielts_practice_library_sets(slug) on delete cascade,
  reviewed_at timestamptz not null default now(),
  best_correct smallint,
  question_total smallint,
  primary key (user_id, set_slug),
  check ((best_correct is null and question_total is null) or (
    best_correct is not null and question_total is not null
    and question_total > 0 and best_correct between 0 and question_total
  ))
);

alter table public.ielts_practice_library_progress enable row level security;
revoke all on table public.ielts_practice_library_progress from public, anon, authenticated;
grant select, insert, update on table public.ielts_practice_library_progress to service_role;

create function public.record_ielts_practice_library_review(
  p_user_id uuid, p_set_slug text, p_correct smallint, p_total smallint
) returns void
language sql
set search_path = ''
as $$
  insert into public.ielts_practice_library_progress as progress (user_id, set_slug, best_correct, question_total)
  values (p_user_id, p_set_slug, p_correct, p_total)
  on conflict (user_id, set_slug) do update set
    reviewed_at = greatest(progress.reviewed_at, excluded.reviewed_at),
    best_correct = case when progress.question_total = excluded.question_total
      then greatest(progress.best_correct, excluded.best_correct) else excluded.best_correct end,
    question_total = excluded.question_total;
$$;

revoke all on function public.record_ielts_practice_library_review(uuid, text, smallint, smallint) from public, anon, authenticated;
grant execute on function public.record_ielts_practice_library_review(uuid, text, smallint, smallint) to service_role;
