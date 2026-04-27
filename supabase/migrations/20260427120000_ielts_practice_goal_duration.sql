alter table public.ielts_practice_user_goals
  add column if not exists practice_start_date date not null default current_date;

alter table public.ielts_practice_user_goals
  add column if not exists program_duration_days integer not null default 30;

alter table public.ielts_practice_user_goals
  add column if not exists daily_practice_minutes integer not null default 60;

alter table public.ielts_practice_user_goals
  add column if not exists timezone text not null default 'UTC';

update public.ielts_practice_user_goals
set target_date = practice_start_date + (program_duration_days - 1)
where target_date is null;

alter table public.ielts_practice_user_goals
  drop constraint if exists ielts_practice_user_goals_program_duration_days_range;

alter table public.ielts_practice_user_goals
  add constraint ielts_practice_user_goals_program_duration_days_range
  check (program_duration_days between 1 and 365);

alter table public.ielts_practice_user_goals
  drop constraint if exists ielts_practice_user_goals_daily_practice_minutes_range;

alter table public.ielts_practice_user_goals
  add constraint ielts_practice_user_goals_daily_practice_minutes_range
  check (daily_practice_minutes between 10 and 360);

alter table public.ielts_practice_user_goals
  drop constraint if exists ielts_practice_user_goals_timezone_length;

alter table public.ielts_practice_user_goals
  add constraint ielts_practice_user_goals_timezone_length
  check (char_length(timezone) between 1 and 80);
