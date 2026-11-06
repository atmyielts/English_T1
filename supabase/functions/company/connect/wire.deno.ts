// The real adapters. Only index.ts imports this file: it uses Deno and reaches other
// services, so it stays out of what the browser preview and the tests load.
// Every switch defaults to off: without "true" in the environment nothing is built.
//   COMPANY_TELEGRAM_ENABLED, COMPANY_EMAIL_ENABLED, COMPANY_WEBHOOKS_ENABLED
//   TELEGRAM_BOT_NAME (shared), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (shared)
//   GMAIL_SMTP_EMAIL, GMAIL_SMTP_APP_PASSWORD (shared with Academy)
import type { ConnectConfig, EmailAdapter, TelegramAdapter, WebhookAdapter } from './shared.ts';
import { createWebhookTransport } from './ssrf.ts';
import { pinnedHttps } from './https.ts';

const on = (value: string | undefined) => (value ?? '').trim().toLowerCase() === 'true';

/** Through the central send-telegram gateway, so its preferences, dedupe and log apply as well. */
function telegramAdapter(): TelegramAdapter | undefined {
  const base = Deno.env.get('SUPABASE_URL'), service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !service) return undefined;
  return async ({ user_id, text, key, cta_url }) => {
    const response = await fetch(`${base}/functions/v1/send-telegram`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id, text, notification_type: 'company_reminder', category: 'academic_required', dedupe_key: key, cta_url, parse_mode: null, metadata: { service: 'company' } }),
    });
    if (response.status >= 500) return { ok: false, retry: true, reason: 'gateway' };
    const result = await response.json().catch(() => ({})) as { ok?: boolean; outcome?: string; reason?: string };
    // Queued by the gateway for later counts as handed over.
    if (result.ok || result.outcome === 'defer' || result.outcome === 'deferred') return { ok: true };
    return { ok: false, retry: false, reason: String(result.reason ?? result.outcome ?? 'refused').slice(0, 60) };
  };
}

/** The same Gmail SMTP path Academy uses, loaded only when the switch is on. */
function emailAdapter(): EmailAdapter | undefined {
  const user = (Deno.env.get('GMAIL_SMTP_EMAIL') ?? '').trim(), pass = (Deno.env.get('GMAIL_SMTP_APP_PASSWORD') ?? '').trim();
  if (!user || !pass) return undefined;
  return async ({ to, subject, text }) => {
    const nodemailer = await import('./smtp.deno.ts');
    // One IPv4 address, for the reason Academy gives: nodemailer races address families and Deno drops that handshake.
    const addresses = await Deno.resolveDns('smtp.gmail.com', 'A').catch(() => [] as string[]);
    const transport = nodemailer.createTransport({
      host: addresses[0] ?? 'smtp.gmail.com', tls: { servername: 'smtp.gmail.com' }, port: 465, secure: true,
      auth: { user, pass }, disableFileAccess: true, disableUrlAccess: true,
    });
    await transport.sendMail({ from: `Schood Company English <${user}>`, to, subject, text });
    return { ok: true };
  };
}

/** Asks over HTTPS, for a runtime without Deno.resolveDns. */
async function resolveOverHttps(host: string, type: 'A' | 'AAAA'): Promise<string[]> {
  const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, { headers: { Accept: 'application/dns-json' } });
  if (!response.ok) return [];
  const answer = await response.json() as { Answer?: { type: number; data: string }[] };
  return (answer.Answer ?? []).filter((row) => row.type === (type === 'A' ? 1 : 28)).map((row) => row.data);
}

/** Every address a name has. An empty answer means the transport refuses to call it. */
async function resolve(host: string): Promise<string[]> {
  const out: string[] = [];
  for (const type of ['A', 'AAAA'] as const) {
    try {
      out.push(...await Deno.resolveDns(host, type));
    } catch (cause) {
      // NotFound: a name may have only one of the two. Anything else: this runtime cannot look names up itself.
      if (!(cause instanceof Deno.errors.NotFound)) out.push(...await resolveOverHttps(host, type).catch(() => [] as string[]));
    }
  }
  return out;
}

function webhookAdapter(): WebhookAdapter {
  return createWebhookTransport({ fetch: pinnedHttps, resolve });
}

export function connectFromEnv(): ConnectConfig {
  const config: ConnectConfig = {};
  if (on(Deno.env.get('COMPANY_TELEGRAM_ENABLED'))) {
    config.telegram = telegramAdapter();
    config.telegramEnabled = Boolean(config.telegram);
    config.telegramBot = Deno.env.get('TELEGRAM_BOT_NAME') ?? undefined;
  }
  if (on(Deno.env.get('COMPANY_EMAIL_ENABLED'))) {
    config.email = emailAdapter();
    config.emailEnabled = Boolean(config.email);
  }
  if (on(Deno.env.get('COMPANY_WEBHOOKS_ENABLED'))) {
    config.webhook = webhookAdapter();
    config.webhooksEnabled = true;
  }
  return config;
}
