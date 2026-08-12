\set ON_ERROR_STOP on

-- Local-only fixture. Apply after a clean local reset and immediately before
-- replaying the Telegram migration to prove legacy preference backfill.
delete from auth.users where id in (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333'
);

insert into auth.users(
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'telegram-test-1@example.invalid', '', '{}'::jsonb, '{"full_name":"Telegram Test 1"}'::jsonb, now(), now()),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'telegram-test-2@example.invalid', '', '{}'::jsonb, '{"full_name":"Telegram Test 2"}'::jsonb, now(), now()),
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'telegram-test-3@example.invalid', '', '{}'::jsonb, '{"full_name":"Telegram Test 3"}'::jsonb, now(), now());

insert into public.telegram_user_preferences(
  user_id, notifications_enabled, digest_frequency,
  telegram_enabled, study_habit_enabled
)
values (
  '11111111-1111-4111-8111-111111111111', false, 'off', true, true
);
