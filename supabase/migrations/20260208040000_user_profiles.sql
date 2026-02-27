-- ============================================================================
-- USER PROFILES (MARKETING / CONTACT INFO)
-- ============================================================================
-- Purpose:
--   Store optional profile fields that are not part of auth.users and that
--   regular users can update under RLS.
--
-- Notes:
--   - Keep fields nullable so signups never fail due to missing metadata.
--   - Avoid adding more columns to public.users (system-managed mirror).
-- ============================================================================

create table if not exists public.user_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,

  first_name text,
  last_name text,
  phone text,
  marketing_opt_in boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_user_profiles_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists user_profiles_updated_at on public.user_profiles;
create trigger user_profiles_updated_at
before update on public.user_profiles
for each row
execute procedure public.handle_user_profiles_updated_at();

alter table public.user_profiles enable row level security;

-- Users can view/insert/update only their own profile row.
drop policy if exists "Users can view own profile" on public.user_profiles;
create policy "Users can view own profile"
on public.user_profiles
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own profile" on public.user_profiles;
create policy "Users can insert own profile"
on public.user_profiles
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own profile" on public.user_profiles;
create policy "Users can update own profile"
on public.user_profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Optional: allow admins (logged in with user JWT) to view all profiles.
-- Admin pages in this project typically use Edge Functions (service role),
-- which bypass RLS anyway. This policy is safe and convenient for debugging.
drop policy if exists "Admins can view all profiles" on public.user_profiles;
create policy "Admins can view all profiles"
on public.user_profiles
for select
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'admin'
  )
);

