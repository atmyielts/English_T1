import { registerSessionSource, type SessionSource } from '../core/index.ts';
import { auth } from '../core/session.ts';

// The Telegram Mini App session source, registered before render. Only this file is
// in the main bundle: it reads Telegram's signed launch data from the URL fragment
// (and keeps it for the tab), and the sign-in itself (telegram-session.ts) loads on
// demand, inside Telegram only. Pages import telegram-session.ts.

export interface Launch { initData: string; platform: string }
const KEY = 'schood-coach.tg';

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
export const launch = typeof window === 'undefined' ? null : readLaunch();

const session = () => import('./telegram-session.ts');
if (launch && auth) {
  const source: SessionSource = {
    id: 'telegram-mini-app',
    detect: () => true,
    token: async () => (await session()).token(),
    observe(changed) {
      let stop = () => {};
      let closed = false;
      void session().then((module) => { if (!closed) stop = module.observe(changed); });
      return () => { closed = true; stop(); };
    },
    signIn() { void session().then((module) => module.signIn()); },
    signOut: async () => (await session()).signOut(),
  };
  registerSessionSource(source, 20);
  void session().then((module) => { module.telegramEvent('web_app_ready'); module.telegramEvent('web_app_expand'); });
}
