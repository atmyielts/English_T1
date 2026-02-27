-- ============================================================================
-- FIX: ENSURE TRIGGER FUNCTIONS RUN WITH BYPASSRLS PRIVILEGES
-- ============================================================================

alter function public.handle_auth_user_insert() owner to postgres;
alter function public.handle_tenant_bootstrap_on_user_insert() owner to postgres;
alter function public.handle_trial_autogrant_on_user_insert() owner to postgres;
alter function public.handle_admin_role_on_user_insert() owner to postgres;
