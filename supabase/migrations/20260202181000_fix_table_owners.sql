-- ============================================================================
-- FIX: SET TABLE OWNERS TO POSTGRES (BYPASS RLS FOR TRIGGERS)
-- ============================================================================

alter table public.users owner to postgres;
alter table public.tenants owner to postgres;
alter table public.tenant_memberships owner to postgres;
alter table public.entitlements owner to postgres;
