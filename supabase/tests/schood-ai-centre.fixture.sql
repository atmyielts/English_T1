-- Extra platform objects the Schood AI centre migration reads, on top of
-- schood-ai-core.fixture.sql: display names on public.users (production has
-- full_name) and the people of the centre test.
alter table public.users add column if not exists full_name text;
insert into public.users (id, full_name) values
  ('00000000-0000-4000-8000-0000000000c1', 'Centre Owner'),
  ('00000000-0000-4000-8000-0000000000c2', 'Teacher One'),
  ('00000000-0000-4000-8000-0000000000c3', 'Teacher Two'),
  ('00000000-0000-4000-8000-0000000000c4', 'Student One'),
  ('00000000-0000-4000-8000-0000000000c5', 'Student Two'),
  ('00000000-0000-4000-8000-0000000000c6', 'Student Three'),
  ('00000000-0000-4000-8000-0000000000c7', 'Outsider')
on conflict (id) do update set full_name = excluded.full_name;
