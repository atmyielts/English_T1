-- Reading service article library (A1-C2) with category/theme filtering.
-- English-first data model with product+language scope to stay multi-language ready.

create table if not exists public.reading_articles (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,

  slug text not null,
  title text not null,
  summary text not null,
  content_markdown text,

  level text not null
    check (level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  category text not null,
  theme text not null,
  tone text not null default 'mint'
    check (tone in ('lime', 'mint', 'sky', 'peach', 'lavender', 'sand')),
  read_time_minutes smallint not null default 6
    check (read_time_minutes between 1 and 60),

  is_hot boolean not null default false,
  status text not null default 'published'
    check (status in ('draft', 'published', 'archived')),
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,

  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reading_articles_slug_not_empty check (length(trim(slug)) > 0),
  constraint reading_articles_unique_slug_per_scope unique (product_id, language_id, slug)
);

create index if not exists reading_articles_scope_status_idx
  on public.reading_articles(product_id, language_id, status, sort_order asc, updated_at desc);

create index if not exists reading_articles_taxonomy_idx
  on public.reading_articles(product_id, language_id, level, category, theme, updated_at desc);

drop trigger if exists reading_articles_updated_at on public.reading_articles;
create trigger reading_articles_updated_at
before update on public.reading_articles
for each row execute function public.set_updated_at();

alter table public.reading_articles enable row level security;

drop policy if exists "Reading articles select published" on public.reading_articles;
create policy "Reading articles select published"
on public.reading_articles
for select
to authenticated
using (status = 'published');

drop policy if exists "Reading articles select admin" on public.reading_articles;
create policy "Reading articles select admin"
on public.reading_articles
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) = 'admin'
  )
);

drop policy if exists "Reading articles mutate admin" on public.reading_articles;
create policy "Reading articles mutate admin"
on public.reading_articles
for all
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) = 'admin'
  )
);

do $$
declare
  v_language_id uuid;
  v_product_id uuid;
begin
  insert into public.languages (code, name, status, metadata)
  values (
    'en',
    'English',
    'active',
    jsonb_build_object('seeded_by', '20260408113000_reading_articles_library')
  )
  on conflict (code) do update
  set
    name = excluded.name,
    status = excluded.status,
    metadata = coalesce(public.languages.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now();

  select id
  into v_language_id
  from public.languages
  where code = 'en'
  limit 1;

  select p.id
  into v_product_id
  from public.products p
  where lower(coalesce(p.metadata->>'slug', '')) = 'english-reading'
  order by p.created_at asc
  limit 1;

  if v_product_id is null then
    raise exception 'english-reading product not found; seed product first';
  end if;

  insert into public.reading_articles (
    product_id,
    language_id,
    slug,
    title,
    summary,
    level,
    category,
    theme,
    tone,
    read_time_minutes,
    is_hot,
    status,
    sort_order,
    metadata
  )
  values
    (
      v_product_id, v_language_id, 'city-signs-quick-read',
      'How to Read City Signs Quickly',
      'A simple routine to understand common signs, directions, and warning words in busy places.',
      'A1', 'Daily Life', 'Everyday Language', 'lime', 4, true, 'published', 10,
      jsonb_build_object('seeded_by', '20260408113000_reading_articles_library')
    ),
    (
      v_product_id, v_language_id, 'grocery-label-choices',
      'Smart Grocery Choices on Labels',
      'Learn to compare ingredients, prices, and serving details without getting lost in long text.',
      'A2', 'Daily Life', 'Healthy Living', 'sand', 5, false, 'published', 20,
      jsonb_build_object('seeded_by', '20260408113000_reading_articles_library')
    ),
    (
      v_product_id, v_language_id, 'study-plan-that-lasts',
      'Building a Study Plan That Lasts',
      'Use weekly structure, realistic targets, and short review loops to keep learning consistent.',
      'B1', 'Work and Study', 'Productivity', 'mint', 6, false, 'published', 30,
      jsonb_build_object('seeded_by', '20260408113000_reading_articles_library')
    ),
    (
      v_product_id, v_language_id, 'meeting-notes-reading-between-lines',
      'Reading Between the Lines in Meeting Notes',
      'Identify implied actions, hidden priorities, and tone shifts in workplace communication.',
      'B2', 'Work and Study', 'Professional Communication', 'sky', 7, false, 'published', 40,
      jsonb_build_object('seeded_by', '20260408113000_reading_articles_library')
    ),
    (
      v_product_id, v_language_id, 'ai-bias-everyday-tools',
      'How AI Bias Appears in Everyday Tools',
      'A practical look at language bias in recommendation systems and how to question outputs critically.',
      'C1', 'Science and Tech', 'Digital Literacy', 'lavender', 8, true, 'published', 50,
      jsonb_build_object('seeded_by', '20260408113000_reading_articles_library')
    ),
    (
      v_product_id, v_language_id, 'urban-design-human-behavior',
      'Urban Design and Human Behavior',
      'Explore how city layout influences reading patterns in public communication and civic participation.',
      'C2', 'Culture', 'Society', 'peach', 10, false, 'published', 60,
      jsonb_build_object('seeded_by', '20260408113000_reading_articles_library')
    ),
    (
      v_product_id, v_language_id, 'airport-guides-without-stress',
      'Airport Guides Without Stress',
      'Understand gate updates, transfer notices, and travel rules with confidence and speed.',
      'B1', 'Travel', 'Navigation', 'sky', 6, false, 'published', 70,
      jsonb_build_object('seeded_by', '20260408113000_reading_articles_library')
    ),
    (
      v_product_id, v_language_id, 'museum-captions-like-curator',
      'Reading Museum Captions Like a Curator',
      'Decode visual clues, timeline markers, and historical framing in exhibition texts.',
      'B2', 'Culture', 'Art and History', 'mint', 7, false, 'published', 80,
      jsonb_build_object('seeded_by', '20260408113000_reading_articles_library')
    ),
    (
      v_product_id, v_language_id, 'weather-words-you-need',
      'Weather Words You Actually Need',
      'Master practical weather vocabulary for plans, travel updates, and everyday conversations.',
      'A2', 'Daily Life', 'Everyday Language', 'lime', 5, false, 'published', 90,
      jsonb_build_object('seeded_by', '20260408113000_reading_articles_library')
    ),
    (
      v_product_id, v_language_id, 'green-transport-city-priority',
      'Should Cities Prioritize Green Transport?',
      'Read and evaluate opposing viewpoints on policy, sustainability, and public cost.',
      'C1', 'Science and Tech', 'Environment', 'sand', 9, false, 'published', 100,
      jsonb_build_object('seeded_by', '20260408113000_reading_articles_library')
    ),
    (
      v_product_id, v_language_id, 'remote-collaboration-signals',
      'Remote Collaboration Signals',
      'Interpret short team updates and identify urgency, blockers, and ownership quickly.',
      'B1', 'Work and Study', 'Professional Communication', 'lavender', 6, false, 'published', 110,
      jsonb_build_object('seeded_by', '20260408113000_reading_articles_library')
    ),
    (
      v_product_id, v_language_id, 'cultural-context-global-news',
      'Cultural Context in Global News',
      'Track how source framing changes meaning and influences interpretation across regions.',
      'C2', 'Culture', 'Global Perspective', 'peach', 10, false, 'published', 120,
      jsonb_build_object('seeded_by', '20260408113000_reading_articles_library')
    )
  on conflict (product_id, language_id, slug) do update
  set
    title = excluded.title,
    summary = excluded.summary,
    level = excluded.level,
    category = excluded.category,
    theme = excluded.theme,
    tone = excluded.tone,
    read_time_minutes = excluded.read_time_minutes,
    is_hot = excluded.is_hot,
    status = excluded.status,
    sort_order = excluded.sort_order,
    metadata = coalesce(public.reading_articles.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now();
end
$$;

