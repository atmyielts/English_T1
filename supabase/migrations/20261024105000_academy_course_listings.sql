-- Schood Courses catalogue (V-CRS-F10, lead-based): centres and independent
-- teachers list a published Academy course on schood.online/courses, and a
-- visitor's "request a place" becomes a lead in that academy's Admissions
-- pipeline. Schood never takes payment for the course here (41, launch payment model).

create table if not exists public.academy_course_listings (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  course_id uuid not null,
  status text not null default 'draft' check (status in ('draft', 'listed', 'hidden')),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  headline text not null check (length(trim(headline)) between 3 and 160),
  summary text check (summary is null or length(summary) <= 2000),
  format text not null default 'blended' check (format in ('online', 'offline', 'blended')),
  city text check (city is null or length(city) <= 80),
  language text not null default 'uz' check (language in ('uz', 'ru', 'en', 'other')),
  level text check (level is null or length(level) <= 60),
  price_text text check (price_text is null or length(price_text) <= 120),
  schedule_text text check (schedule_text is null or length(schedule_text) <= 200),
  starts_on date,
  seats integer check (seats is null or seats between 1 and 1000),
  teacher_name text check (teacher_name is null or length(teacher_name) <= 120),
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  listed_at timestamptz,
  unique (course_id),
  constraint academy_course_listings_course_fk
    foreign key (course_id, academy_id) references public.academy_courses(id, academy_id) on delete cascade
);
create index if not exists academy_course_listings_listed_idx on public.academy_course_listings(status, listed_at desc) where status = 'listed';
alter table public.academy_course_listings enable row level security;
revoke all on public.academy_course_listings from anon, authenticated;

-- Completion is shown only with at least 15 learners, so a small group
-- cannot be singled out or flattered (41: verified results, minimum samples).
create or replace function public.academy_course_completion(p_academy uuid, p_course uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with lessons as (
    select id from public.academy_lessons where academy_id = p_academy and course_id = p_course and status = 'published'
  ), learners as (
    select distinct m.classroom_id, m.contact_id
    from public.academy_classroom_courses cc
    join public.academy_classroom_memberships m on m.academy_id = cc.academy_id and m.classroom_id = cc.classroom_id and m.role = 'student'
    where cc.academy_id = p_academy and cc.course_id = p_course and cc.status in ('active', 'completed')
  ), done as (
    select l.contact_id,
      (select count(*) from public.academy_lesson_progress p
        where p.academy_id = p_academy and p.classroom_id = l.classroom_id and p.contact_id = l.contact_id
          and p.status = 'completed' and p.lesson_id in (select id from lessons)) as completed
    from learners l
  )
  select jsonb_build_object(
    'learners', (select count(*) from done),
    'completion_percent', case when (select count(*) from done) >= 15 and (select count(*) from lessons) > 0
      then round(100.0 * (select count(*) from done where completed >= (select count(*) from lessons)) / (select count(*) from done))
      else null end);
$$;
revoke all on function public.academy_course_completion(uuid, uuid) from public, anon, authenticated;
grant execute on function public.academy_course_completion(uuid, uuid) to service_role;

-- The public catalogue: listed, published, and on a paid plan or centre tier
-- whenever billing is enforced.
create or replace function public.academy_public_course_catalog(
  p_slug text default null, p_query text default null, p_language text default null, p_format text default null, p_limit integer default 60)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(item order by sort_key desc), '[]'::jsonb) from (
    select l.listed_at as sort_key, jsonb_build_object(
      'slug', l.slug, 'headline', l.headline, 'summary', l.summary, 'format', l.format, 'city', l.city, 'language', l.language,
      'level', coalesce(l.level, c.level), 'price_text', l.price_text, 'schedule_text', l.schedule_text, 'starts_on', l.starts_on,
      'seats', l.seats, 'teacher_name', l.teacher_name, 'listed_at', l.listed_at,
      'course', jsonb_build_object('title', c.title, 'description', c.description, 'estimated_minutes', c.estimated_minutes,
        'modules', (select coalesce(jsonb_agg(jsonb_build_object('title', m.title,
            'lessons', (select count(*) from public.academy_lessons x where x.module_id = m.id and x.status = 'published')) order by m.position), '[]'::jsonb)
          from public.academy_course_modules m where m.course_id = c.id and m.status = 'published')),
      'provider', jsonb_build_object('name', t.name,
        'kind', case when t.metadata->>'parent_center_id' is not null then 'centre' else 'teacher' end),
      'results', public.academy_course_completion(l.academy_id, l.course_id)
    ) as item
    from public.academy_course_listings l
    join public.academy_courses c on c.id = l.course_id and c.academy_id = l.academy_id and c.status = 'published'
    join public.tenants t on t.id = l.academy_id
    where l.status = 'listed'
      and (p_slug is null or l.slug = p_slug)
      and (p_language is null or l.language = p_language)
      and (p_format is null or l.format = p_format)
      and (p_query is null or l.headline ilike '%' || p_query || '%' or c.title ilike '%' || p_query || '%' or coalesce(l.city, '') ilike '%' || p_query || '%')
      and public.academy_learning_allows(l.academy_id, 'courses')
    order by l.listed_at desc nulls last
    limit least(greatest(coalesce(p_limit, 60), 1), 100)
  ) listed;
$$;
revoke all on function public.academy_public_course_catalog(text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.academy_public_course_catalog(text, text, text, text, integer) to service_role;
