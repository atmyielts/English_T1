-- Qualify the whole REST/RPC/view entry point, not only table RLS. Review the
-- current hook before installation and refuse baseline drift. The observed
-- production authenticator hook catalogue was empty on 2026-10-10.
begin;
set local lock_timeout='2s';
set local statement_timeout='15s';

do $$
declare setting text;
begin
  setting := nullif(current_setting('pgrst.db_pre_request',true),'');
  if setting is not null and setting <> 'public.account_api_pre_request' then
    raise exception using errcode='P0001',message='Existing API request hook requires review';
  end if;
  if exists(select 1 from pg_db_role_setting s cross join lateral unnest(s.setconfig) v(setting)
    where v.setting like 'pgrst.db_pre_request=%'
      and v.setting not in('pgrst.db_pre_request=','pgrst.db_pre_request=public.account_api_pre_request')) then
    raise exception using errcode='P0001',message='Existing API request hook requires review';
  end if;
end;
$$;

create or replace function public.account_api_pre_request()
returns void language plpgsql security invoker
set search_path=pg_catalog,public
as $$
begin
  -- Run in the actual impersonated role, before any SECURITY DEFINER RPC or
  -- owner-privileged view. Trusted service callbacks and public anon reads keep
  -- their existing semantics. No caller-supplied actor ID is accepted.
  -- Use separate statements: a combined AND still requires anon permission on
  -- account_is_open while PostgreSQL prepares the expression.
  if current_user='authenticated' then
    if not public.account_is_open() then
      raise sqlstate 'PT401' using message='Sign in with an active account.';
    end if;
  end if;
end;
$$;
revoke all on function public.account_api_pre_request() from public;
grant execute on function public.account_api_pre_request() to anon,authenticated,service_role;

alter role authenticator set pgrst.db_pre_request='public.account_api_pre_request';
notify pgrst,'reload config';
commit;
