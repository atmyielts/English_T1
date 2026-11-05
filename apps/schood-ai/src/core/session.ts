import { AuthClient } from '@supabase/auth-js';
import { watchAccount } from '../../../../packages/assessment-web/src/account-watch';

// The Supabase session, with only the auth part of Supabase. The full client adds
// realtime, storage and PostgREST code this app never uses (about 35 KB gzip on
// the first load). Same cookie format, storage key and auth options as
// packages/assessment-web/src/client.ts and the platform, so the shared
// .schood.online session works across the Schood apps.

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const configured = Boolean(url && anon);

const cookies = {
  getItem(key: string) {
    const read = (name: string) => document.cookie.split('; ').find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
    const count = Number(read(`${key}.__chunks`) ?? 0);
    if (count > 100) return null;
    let encoded = count ? '' : read(key);
    for (let i = 0; i < count; i++) { const part = read(`${key}.${i}`); if (!part) return null; encoded += part; }
    try { return encoded ? decodeURIComponent(encoded) : null; } catch { return null; }
  },
  setItem(key: string, value: string) {
    this.removeItem(key);
    const encoded = encodeURIComponent(value);
    const count = Math.ceil(encoded.length / 2000);
    const domain = import.meta.env.VITE_AUTH_SHARED_COOKIE === 'true' ? import.meta.env.VITE_AUTH_COOKIE_DOMAIN : undefined;
    const suffix = `; Path=/; SameSite=Lax; Max-Age=2592000${location.protocol === 'https:' ? '; Secure' : ''}${domain ? `; Domain=${domain}` : ''}`;
    if (count <= 1) document.cookie = `${key}=${encoded}${suffix}`;
    else { document.cookie = `${key}.__chunks=${count}${suffix}`; for (let i = 0; i < count; i++) document.cookie = `${key}.${i}=${encoded.slice(i * 2000, (i + 1) * 2000)}${suffix}`; }
  },
  removeItem(key: string) {
    const names = document.cookie.split('; ').map((value) => value.split('=')[0]).filter((name) => name === key || name.startsWith(`${key}.`));
    for (const name of names) {
      document.cookie = `${name}=; Path=/; Max-Age=0`;
      if (import.meta.env.VITE_AUTH_COOKIE_DOMAIN) document.cookie = `${name}=; Path=/; Max-Age=0; Domain=${import.meta.env.VITE_AUTH_COOKIE_DOMAIN}`;
    }
  },
};

/** The app's auth client (sign-in state, tokens, sign-out). Use this, not @supabase/supabase-js. */
export const auth = configured ? new AuthClient({
  url: new URL('auth/v1', url!.endsWith('/') ? url! : `${url}/`).href,
  headers: { Authorization: `Bearer ${anon}`, apikey: anon! },
  storage: cookies, storageKey: 'schood-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit',
}) : null;

/** Calls back with the user id ('' when signed out) now and whenever the shared session changes, also from other Schood apps. */
export function observeAccount(changed: (actor: string) => void) {
  if (!auth) return () => {};
  const watcher = watchAccount({
    async current() { const { data } = await auth.getSession(); return data.session?.user.id ?? ''; },
    subscribe(publish) { const { data } = auth.onAuthStateChange((_event, session) => publish(session?.user.id ?? '')); return () => data.subscription.unsubscribe(); },
  }, changed);
  const check = () => void watcher.check(), timer = setInterval(check, 5000);
  check();
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', check);
  return () => { clearInterval(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); watcher.close(); };
}
