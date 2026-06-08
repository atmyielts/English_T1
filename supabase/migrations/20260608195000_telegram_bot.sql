-- Telegram bot: account linking tokens + chat_id on users

-- One-time deep-link tokens for account linking
create table if not exists public.telegram_link_tokens (
  id          uuid primary key default gen_random_uuid(),
  token       text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  user_id     uuid not null references public.users(id) on delete cascade,
  expires_at  timestamptz not null default now() + interval '15 minutes',
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists tg_link_tokens_user on public.telegram_link_tokens(user_id);
create index if not exists tg_link_tokens_token on public.telegram_link_tokens(token);

alter table public.telegram_link_tokens enable row level security;
drop policy if exists "TG tokens: own" on public.telegram_link_tokens;
create policy "TG tokens: own" on public.telegram_link_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Add telegram_chat_id to users for platform-wide linking
alter table public.users add column if not exists telegram_chat_id text unique;
create index if not exists users_telegram_chat_idx on public.users(telegram_chat_id) where telegram_chat_id is not null;

-- Platform-wide notification log (all channels: telegram, email, push)
create table if not exists public.platform_notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.users(id) on delete cascade,
  chat_id      text,           -- telegram chat_id if telegram channel
  channel      text not null default 'telegram' check (channel in ('telegram','email','push')),
  type         text not null,  -- 'score_ready', 'assignment_due', 'cert_issued', 'payment', 'announcement', etc.
  title        text,
  body         text not null,
  metadata     jsonb not null default '{}'::jsonb,
  status       text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  sent_at      timestamptz,
  error        text,
  created_at   timestamptz not null default now()
);
create index if not exists platform_notif_user on public.platform_notifications(user_id, created_at desc);
create index if not exists platform_notif_pending on public.platform_notifications(status, channel) where status = 'pending';

alter table public.platform_notifications enable row level security;
drop policy if exists "Notif: own read" on public.platform_notifications;
create policy "Notif: own read" on public.platform_notifications
  for select using (user_id = auth.uid());
