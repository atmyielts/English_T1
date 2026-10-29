-- Isolated fixture with the spine columns the Company English core touches.
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role bypassrls; exception when duplicate_object then null; end $$;
create table public.users(id uuid primary key, role text);
create table public.tenants(id uuid primary key);
create table public.tenant_memberships(tenant_id uuid references tenants(id), user_id uuid references users(id), status text, role text, created_at timestamptz not null default now());
create table public.entitlements(id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id), tenant_id uuid not null references tenants(id), resource_type text not null, resource_id uuid, is_active boolean not null default true, starts_at timestamptz default now(), ends_at timestamptz, source text not null default 'system', value jsonb default '{}'::jsonb, unique(tenant_id, resource_type, resource_id));
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
