-- Allow bundle product type
alter table public.products drop constraint if exists products_type_check;
alter table public.products
  add constraint products_type_check check (type in ('exam', 'practice', 'tool', 'course', 'bundle'));
