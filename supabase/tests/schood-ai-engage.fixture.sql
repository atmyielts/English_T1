-- Extra platform objects the engage migration reads, on top of the core fixture
-- (supabase/tests/schood-ai-core.fixture.sql): the users columns the real table has
-- (telegram_chat_id from 20260608190000, full_name and is_active from the platform
-- spine) and more people for leagues and squads.
alter table public.users add column if not exists telegram_chat_id text unique;
alter table public.users add column if not exists full_name text;
alter table public.users add column if not exists is_active boolean not null default true;
insert into public.users (id, full_name) select ('00000000-0000-4000-8000-' || lpad((100 + n)::text, 12, '0'))::uuid, 'Learner ' || n from generate_series(1, 60) as n
  on conflict (id) do nothing;
update public.users set telegram_chat_id = '700100', full_name = 'Dilnoza Karimova' where id = '00000000-0000-4000-8000-0000000000a2';
