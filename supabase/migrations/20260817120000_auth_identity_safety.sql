-- Keep Telegram passwordless auth recoverable and prevent duplicate accounts.
--
-- New Telegram users must first prove ownership of an email through Schood's
-- email OTP flow. The app then links the Telegram OIDC identity to that already
-- authenticated user. Existing linked users are unaffected because identity
-- linking does not create a new auth.users row.

create or replace function public.before_user_created_require_email(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  provider text := coalesce(event->'user'->'app_metadata'->>'provider', '');
begin
  if provider = 'custom:telegram' then
    return jsonb_build_object(
      'error',
      jsonb_build_object(
        'http_code', 422,
        'message', 'telegram_requires_verified_email: Verify your email before using Telegram sign-in.'
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.before_user_created_require_email(jsonb) to supabase_auth_admin;
revoke execute on function public.before_user_created_require_email(jsonb) from anon, authenticated, public;

comment on function public.before_user_created_require_email(jsonb) is
  'Blocks direct Telegram-created accounts so Telegram is linked only after verified email ownership.';
