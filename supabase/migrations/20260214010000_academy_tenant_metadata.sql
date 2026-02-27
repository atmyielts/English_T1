-- Add metadata storage for academy-level landing customization.
alter table public.tenants
add column if not exists metadata jsonb not null default '{}'::jsonb;
