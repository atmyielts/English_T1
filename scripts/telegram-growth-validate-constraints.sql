\set ON_ERROR_STOP on
set lock_timeout = '5s';
set statement_timeout = '10min';

alter table public.platform_notifications validate constraint platform_notifications_status_check;
alter table public.platform_notifications validate constraint platform_notifications_category_check;
alter table public.academy_notifications validate constraint academy_notifications_status_check;
alter table public.academy_notifications validate constraint academy_notifications_category_check;
