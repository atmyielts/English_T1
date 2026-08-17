# Google and Telegram authentication

## Product contract

- Every Schood account has a verified email recovery identity.
- Every completed signup has a phone number in `public.user_profiles`. The phone is collected but is **not SMS-verified** until an SMS provider is deliberately enabled.
- Google may create a user because Google supplies the verified email identity. Schood requires phone completion before continuing.
- Telegram may sign in an existing linked user, but may not create an email-less user.
- Telegram signup sends a Schood email OTP first. After the user opens that link, Supabase links `custom:telegram` to the authenticated email account.
- Existing users enable Telegram sign-in from Account. Telegram identities are never auto-merged by email, username, or chat ID.
- The existing Telegram notification link remains separate from the OIDC sign-in identity.

## Provider callback

Both providers return through the production Supabase Auth callback:

`https://bbjawctnqrufvnesdsel.supabase.co/auth/v1/callback`

The application redirect is `https://schood.online/auth`, which is already in `supabase/config.toml`.

## Google provider

In Google Auth Platform, create a Web application client with:

- Authorized JavaScript origin: `https://schood.online`
- Authorized redirect URI: `https://bbjawctnqrufvnesdsel.supabase.co/auth/v1/callback`

Then enable Google under Supabase Dashboard → Authentication → Providers using the Google client ID and client secret. Provider secrets remain in Google/Supabase and must not be stored in the repository or a frontend environment variable.

## Telegram provider

In BotFather, open `@schoodonlinebot` → Bot Settings → Web Login, register the production URLs, and create the OIDC client. Use the issued client ID and client secret to create this Supabase custom provider:

- Configuration: Auto-discovery (OIDC)
- Identifier: `custom:telegram`
- Issuer: `https://oauth.telegram.org`
- Scopes: `openid`, `profile`, `phone`, `telegram:bot_access`
- Email optional: enabled (Schood supplies the verified email identity before linking)
- PKCE: enabled

Enable manual identity linking in Supabase Auth. Apply `20260817120000_auth_identity_safety.sql`, then configure the Before User Created hook as `pg-functions://postgres/public/before_user_created_require_email`. The hook blocks direct Telegram-created users while permitting Telegram to be linked to an existing verified-email user.

## Release order

1. Merge and deploy the backward-compatible frontend and Worker changes.
2. Push `20260817120000_auth_identity_safety.sql` to the linked production database.
3. Enable manual identity linking and the Before User Created hook in production Supabase Auth.
4. Configure Google and `custom:telegram` provider credentials.
5. Deploy the `schood-online-bot` Worker and run `npm run setup-commands` from its workspace with the bot token supplied only in the shell environment.
6. Verify `/auth/v1/settings`, then smoke-test new Google signup, existing Google signin, email-first Telegram signup, existing Telegram signin, duplicate Telegram linking, and account recovery.

Do not enable Telegram before both the database hook and manual-linking setting are active.
