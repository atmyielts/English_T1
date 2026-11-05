import type { CentreDeps } from './binding.ts';
import { secretContext, sha256Hex } from './crypto.ts';

// The centre's own Telegram bot (C8): its token is stored sealed (crypto.ts) and
// opened only to call the Bot API. Staff who linked their Telegram to the bot get
// handover alerts and the Monday brief there.

export const BOT_LABEL = 'admissions';
const MAX_TEXT = 4000;

export async function botToken(deps: CentreDeps, workspaceId: string): Promise<string | null> {
  if (!deps.secrets) return null;
  const secret = await deps.store.table('secrets').get({ workspace_id: workspaceId, purpose: 'telegram_bot', label: BOT_LABEL, revoked_at: null });
  if (!secret) return null;
  try {
    return await deps.secrets.open(secret.sealed, secretContext(workspaceId, 'telegram_bot', BOT_LABEL));
  } catch {
    console.error(JSON.stringify({ event: 'schood_ai_centre_secret_unreadable', workspace_id: workspaceId, purpose: 'telegram_bot' }));
    return null;
  }
}

/** Plain text in pieces Telegram accepts; returns the first message id or null. */
export async function sendText(deps: CentreDeps, token: string, chatId: string, text: string, extra: Record<string, unknown> = {}): Promise<number | null> {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > MAX_TEXT) {
    let cut = rest.lastIndexOf('\n', MAX_TEXT);
    if (cut < MAX_TEXT / 2) cut = rest.lastIndexOf(' ', MAX_TEXT);
    if (cut < MAX_TEXT / 2) cut = MAX_TEXT;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  let first: number | null = null;
  for (const [index, part] of parts.entries()) {
    const result = await deps.telegram.call(token, 'sendMessage', { chat_id: chatId, text: part, disable_web_page_preview: true, ...(index === parts.length - 1 ? extra : {}) });
    if (!result.ok) return first;
    first ??= Number(result.result?.message_id ?? 0) || null;
  }
  return first;
}

/** Alerts the staff who linked their Telegram to the centre's bot (all of them, or these people). */
export async function alertStaff(deps: CentreDeps, workspaceId: string, text: string, userIds?: string[]): Promise<number> {
  const token = await botToken(deps, workspaceId);
  if (!token) return 0;
  const chats = (await deps.store.table('staff_chats').list({ workspace_id: workspaceId })).filter((row) => !userIds?.length || userIds.includes(row.user_id));
  let sent = 0;
  for (const chat of chats) if (await sendText(deps, token, chat.chat_id, text) !== null) sent++;
  return sent;
}

export const webhookSecretHash = (secret: string) => sha256Hex(`telegram-webhook:${secret}`);
