-- Remove bundle type from products. Bundles are represented at the plan level.
update public.products
set status = 'archived',
    type = 'course'
where type = 'bundle';

alter table public.products drop constraint if exists products_type_check;
alter table public.products
  add constraint products_type_check check (type in ('exam', 'practice', 'tool', 'course'));
