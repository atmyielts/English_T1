-- ============================================================================
-- ASSETS LIBRARY (ADMIN)
-- ============================================================================
-- Store uploaded Storage objects (audio/images) as reusable references.
-- Admin UI uses Edge Functions + this table for listing/searching.

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) = 'admin'
  );
$$;

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),

  kind text not null, -- 'audio' | 'image' | ...
  bucket text not null,
  path text not null,

  filename text,
  mime_type text,
  size_bytes bigint,

  metadata jsonb not null default '{}'::jsonb,

  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),

  unique(bucket, path)
);

create index if not exists assets_kind_created_at_idx on public.assets(kind, created_at desc);
create index if not exists assets_bucket_path_idx on public.assets(bucket, path);

alter table public.assets enable row level security;

drop policy if exists "Admins can manage assets" on public.assets;
create policy "Admins can manage assets"
on public.assets
for all
using (public.is_admin())
with check (public.is_admin());

