-- Isolated fixture with the platform objects the Schood AI core migration uses:
-- the Supabase roles, their default table grants, public.users and set_updated_at.
-- It does not claim to replay the whole historical migration chain.
create role anon;
create role authenticated;
create role service_role bypassrls;
grant usage on schema public to anon, authenticated, service_role;
-- Supabase grants every new public table and function to these roles by default;
-- the migration must revoke what browsers and the function may not do.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
create table public.users (id uuid primary key, role text not null default 'user');
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
insert into public.users (id) values
  ('00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000a2'),
  ('00000000-0000-4000-8000-0000000000a3'),
  ('00000000-0000-4000-8000-0000000000a4');
