-- Homework OS launch (owner go-ahead 2026-10-22): turn on Telegram hand-in,
-- AI pre-marking and the weekly parent summary. Billing stays off until the
-- Schood Teaching prices are set (academy_learning_config 'billing.enforced').
-- Each academy can still opt out in Homework → Plan and settings.

update public.academy_learning_config set value = 'true'::jsonb, updated_at = now()
where key in ('telegram_handin.enabled', 'premark.enabled', 'digest.enabled');

-- academy-learning adds /homework and /center to the student bot menu the
-- first time it handles a bot update after deploy (see ensureBotCommands).
