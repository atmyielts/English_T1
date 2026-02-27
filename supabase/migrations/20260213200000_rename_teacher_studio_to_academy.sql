-- Rename Teacher Studio product to Academy (user-facing slug + branding).

update public.products
set
  name = case when lower(name) = 'teacher studio' then 'Academy' else name end,
  description = case
    when lower(name) = 'teacher studio'
      then 'Academy workspace for teachers, classrooms, and student access.'
    else description
  end,
  metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{slug}', '"academy"', true)
where lower(coalesce(metadata->>'slug', '')) = 'teacher-studio'
   or lower(name) = 'teacher studio';

insert into public.products (name, type, status, description, metadata)
select
  'Academy',
  'tool',
  'active',
  'Academy workspace for teachers, classrooms, and student access.',
  jsonb_build_object('slug', 'academy')
where not exists (
  select 1
  from public.products p
  where lower(coalesce(p.metadata->>'slug', '')) = 'academy'
     or lower(p.name) = 'academy'
);
