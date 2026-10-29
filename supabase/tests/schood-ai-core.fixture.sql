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
create table public.users (id uuid primary key, role text not null default 'user', is_active boolean not null default true);
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
insert into public.users (id) values
  ('00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000a2'),
  ('00000000-0000-4000-8000-0000000000a3'),
  ('00000000-0000-4000-8000-0000000000a4');
-- Stand-ins for the account erasure registry (20261010160000) so the registry
-- extension in 20261030130000 is exercised; the real ones live in production.
create or replace function public.account_personal_erasure_tables() returns text[] language sql immutable as $$ select array['user_profiles']::text[] $$;
create or replace function public.guard_closed_personal_record() returns trigger language plpgsql as $$ begin return new; end $$;
-- A stand-in for the account closure transaction (20261010155000/160000): on the
-- first soft delete it erases the registry tables and writes the receipt, as the
-- real erase_account_personal_data() does last. 20261030140000 attaches the
-- service hooks after it, by trigger name, exactly as in production.
create schema auth;
create table auth.users (id uuid primary key, email text, deleted_at timestamptz);
create table public.account_closure_receipts (user_id uuid primary key references public.users(id) on delete restrict, closed_at timestamptz not null default now(), purge_version integer not null check (purge_version > 0), erased_counts jsonb not null default '{}'::jsonb);
create or replace function public.erase_account_personal_data() returns trigger language plpgsql as $$
declare relation_name text;
begin
  if old.deleted_at is not null or new.deleted_at is null then return new; end if;
  if not exists (select 1 from public.users where id = old.id) then return new; end if;
  if exists (select 1 from public.account_closure_receipts where user_id = old.id) then return new; end if;
  foreach relation_name in array public.account_personal_erasure_tables() loop
    if to_regclass('public.' || relation_name) is null then continue; end if;
    execute format('delete from public.%I where user_id = $1', relation_name) using old.id;
  end loop;
  update public.users set is_active = false where id = old.id;
  insert into public.account_closure_receipts (user_id, purge_version) values (old.id, 1);
  return new;
end $$;
create trigger account_erasure_transaction before update of deleted_at on auth.users for each row execute function public.erase_account_personal_data();
