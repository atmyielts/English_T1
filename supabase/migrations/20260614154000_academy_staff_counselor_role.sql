-- Allow counselor staff to use the same academy-wide operations scope as managers.

alter table public.academy_staff
  drop constraint if exists academy_staff_role_check;

alter table public.academy_staff
  add constraint academy_staff_role_check
  check (role in ('teacher','manager','counselor','assistant'));
