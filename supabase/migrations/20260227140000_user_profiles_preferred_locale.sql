-- Add preferred locale for multilingual platform UI preferences.
alter table public.user_profiles
  add column if not exists preferred_locale text;

update public.user_profiles
set preferred_locale = 'en'
where preferred_locale is null;

alter table public.user_profiles
  alter column preferred_locale set default 'en';

alter table public.user_profiles
  alter column preferred_locale set not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_preferred_locale_check'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles drop constraint user_profiles_preferred_locale_check;
  end if;
end $$;

alter table public.user_profiles
  add constraint user_profiles_preferred_locale_check
  check (preferred_locale in ('en', 'uz', 'ru'));
