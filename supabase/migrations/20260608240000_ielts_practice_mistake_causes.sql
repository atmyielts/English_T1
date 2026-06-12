-- Error-cause tagging: let learners record WHY they missed a question, so the
-- app can show a "where you lose marks" breakdown (metacognition, ~no AI cost).

create table if not exists public.ielts_practice_mistake_causes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  product_id    uuid,
  session_id    uuid,
  section_type  text,
  question_type text,
  cause         text not null
    check (cause in ('misread','vocabulary','distractor','timing','careless','other')),
  created_at    timestamptz not null default now()
);

create index if not exists ielts_practice_mistake_causes_user_idx
  on public.ielts_practice_mistake_causes(user_id, created_at desc);

alter table public.ielts_practice_mistake_causes enable row level security;

drop policy if exists "Mistake causes read by owner" on public.ielts_practice_mistake_causes;
create policy "Mistake causes read by owner"
  on public.ielts_practice_mistake_causes for select
  using (user_id = auth.uid());

drop policy if exists "Mistake causes insert by owner" on public.ielts_practice_mistake_causes;
create policy "Mistake causes insert by owner"
  on public.ielts_practice_mistake_causes for insert
  with check (user_id = auth.uid());
