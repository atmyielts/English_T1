alter table public.evaluations
  drop constraint if exists evaluations_method_check;

alter table public.evaluations
  add constraint evaluations_method_check
  check (method in ('auto', 'manual', 'ai', 'admin'));

drop policy if exists "Evaluations select admin" on public.evaluations;
create policy "Evaluations select admin"
on public.evaluations
for select
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and (
        u.role = 'admin'
        or u.role like 'admin\_%' escape '\'
      )
  )
);
