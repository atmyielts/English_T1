-- Isolated fixture matching the existing spine columns used by the additive migration.
-- This deliberately does not claim to exercise the entire historical migration chain.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
create table public.users(id uuid primary key);
create table public.tenants(id uuid primary key);
create table public.tenant_memberships(tenant_id uuid references tenants(id),user_id uuid references users(id),status text,role text);
create table public.products(id uuid primary key default gen_random_uuid(),name text,type text,status text,metadata jsonb);
create table public.experiences(id uuid primary key default gen_random_uuid(),product_id uuid references products(id),name text,is_active boolean,metadata jsonb);
create table public.sections(id uuid primary key default gen_random_uuid(),experience_id uuid references experiences(id),name text,display_order integer,metadata jsonb);
create table public.parts(id uuid primary key default gen_random_uuid(),section_id uuid references sections(id),name text,display_order integer);
create table public.content_units(id uuid primary key default gen_random_uuid(),part_id uuid references parts(id),type text,data jsonb,display_order integer,metadata jsonb);
create table public.answer_keys(content_unit_id uuid primary key references content_units(id),correct jsonb);
create table public.sessions(id uuid primary key default gen_random_uuid(),user_id uuid references users(id),experience_id uuid references experiences(id),status text,started_at timestamptz,completed_at timestamptz,paused_at timestamptz,resumed_at timestamptz);
create table public.responses(id uuid primary key default gen_random_uuid(),session_id uuid references sessions(id),content_unit_id uuid references content_units(id),type text,data jsonb,metadata jsonb);
create table public.domain_event_outbox(event_type text,event_version text,aggregate_type text,aggregate_id uuid,user_id uuid,payload jsonb,idempotency_key text unique);
grant usage on schema public,auth to authenticated,service_role;
