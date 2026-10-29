import { registerSessionSource, type SessionSource } from '../core/index.ts';
import { auth, observeAccount } from '../core/session.ts';

// The Telegram Mini App session source. Inside Telegram the coach pages read the
// signed launch data (initData, from the URL fragment Telegram opens them with) and
// exchange it for a Schood session at the coach bots' Worker:
//   1. the Worker checks Telegram's HMAC with that coach bot's own token (only it
//      holds the tokens) and finds the linked Schood account through telegram-link;
//   2. the schood-ai function checks Telegram's Ed25519 signature again with the
//      bot's public id and signs the person in with a normal Supabase session.
// The session then lives in the same auth client as on the web. Nothing here needs
// Telegram's script: the two calls the app makes to the Telegram client are posted
// directly.

const WORKER = String(import.meta.env.VITE_COACH_BOTS_URL || 'https://coach-bots.schood.online').replace(/\/+$/, '');
const KEY = 'schood-coach.tg';

interface Launch { initData: string; platform: string }
function readLaunch(): Launch | null {
  try {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    const fresh = hash.get('tgWebAppData');
    if (fresh) {
      const launch = { initData: fresh, platform: hash.get('tgWebAppPlatform') ?? 'unknown' };
      sessionStorage.setItem(KEY, JSON.stringify(launch));
      // The fragment carries signed data; keep it out of the address bar and history.
      history.replaceState(null, '', location.pathname + location.search);
      return launch;
    }
    const kept = sessionStorage.getItem(KEY);
    return kept ? JSON.parse(kept) as Launch : null;
  } catch {
    return null;
  }
}
const launch = typeof window === 'undefined' ? null : readLaunch();

/** Talks to the Telegram client that hosts the Mini App (mobile, desktop or web). */
export function telegramEvent(type: string, data: Record<string, unknown> = {}) {
  const w = window as unknown as { TelegramWebviewProxy?: { postEvent(type: string, data: string): void } };
  try {
    if (w.TelegramWebviewProxy?.postEvent) w.TelegramWebviewProxy.postEvent(type, JSON.stringify(data));
    else if (window.parent !== window) window.parent.postMessage(JSON.stringify({ eventType: type, eventData: data }), 'https://web.telegram.org');
  } catch { /* outside Telegram */ }
}
export const insideTelegram = () => !!launch;
/** Opens a page outside the Mini App (sign-in on the web, a t.me link). */
export function openOutside(url: string) {
  if (launch) { telegramEvent(url.startsWith('https://t.me/') ? 'web_app_open_tg_link' : 'web_app_open_link', url.startsWith('https://t.me/') ? { path_full: url.slice('https://t.me'.length) } : { url }); return; }
  window.open(url, '_blank', 'noopener');
}

export type TelegramLink = { state: 'idle' | 'working' | 'linked' | 'unlinked' | 'failed'; linkUrl: string | null; pack: string | null; code: string | null };
let link: TelegramLink = { state: 'idle', linkUrl: null, pack: null, code: null };
const listeners = new Set<() => void>();
const publish = (next: TelegramLink) => { link = next; for (const listener of listeners) listener(); };
export const telegramLink = () => link;
export function onTelegramLink(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

const packFromPath = () => /^\/coach\/([a-z][a-z0-9-]{1,15})(?:\/|$)/.exec(location.pathname)?.[1] ?? null;
let exchanging: Promise<void> | null = null;
function exchange(): Promise<void> {
  if (!launch || !auth) return Promise.resolve();
  exchanging ??= (async () => {
    const { data } = await auth.getSession();
    if (data.session) { publish({ ...link, state: 'linked' }); return; }
    publish({ ...link, state: 'working' });
    try {
      const pack = packFromPath();
      const response = await fetch(`${WORKER}/miniapp/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(pack && !['team', 'verify', 'certificates'].includes(pack) ? { pack } : {}), init_data: launch.initData }) });
      const payload = await response.json().catch(() => ({})) as { linked?: boolean; link_url?: string; pack?: string; code?: string; session?: { access_token: string; refresh_token: string } };
      if (response.ok && payload.linked && payload.session) {
        const { error } = await auth.setSession({ access_token: payload.session.access_token, refresh_token: payload.session.refresh_token });
        publish({ state: error ? 'failed' : 'linked', linkUrl: null, pack: payload.pack ?? pack, code: error ? 'session_unavailable' : null });
      } else if (response.ok && payload.linked === false) {
        publish({ state: 'unlinked', linkUrl: payload.link_url ?? null, pack: payload.pack ?? pack, code: null });
      } else {
        publish({ state: 'failed', linkUrl: null, pack, code: payload.code ?? 'telegram_invalid' });
      }
    } catch {
      publish({ state: 'failed', linkUrl: null, pack: packFromPath(), code: 'network' });
    } finally {
      exchanging = null;
    }
  })();
  return exchanging;
}

const telegramSource: SessionSource = {
  id: 'telegram-mini-app',
  detect: () => !!launch && !!auth,
  async token() {
    await exchange();
    const { data } = await auth!.getSession();
    return data.session?.access_token ?? null;
  },
  observe(changed) {
    let stop = () => {};
    let closed = false;
    void exchange().then(() => { if (!closed) stop = observeAccount(changed); });
    return () => { closed = true; stop(); };
  },
  signIn() { if (link.linkUrl) openOutside(link.linkUrl); },
  async signOut() { await auth?.signOut({ scope: 'local' }); },
};

if (launch) {
  registerSessionSource(telegramSource, 20);
  telegramEvent('web_app_ready');
  telegramEvent('web_app_expand');
}
