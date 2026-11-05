import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { auth, configured, observeAccount } from './session.ts';

// Who is signed in. The default source is the shared .schood.online session cookie
// that every Schood app uses (same storage as the platform). Other sources plug in
// with registerSessionSource: the coach agent adds a Telegram Mini App source that
// exchanges Telegram WebApp initData for a Schood session when the app runs inside
// Telegram. The first source whose `detect()` is true wins.

export interface SessionSource {
  id: string;
  /** Whether this source applies on this page load (for example, inside Telegram). */
  detect(): boolean;
  /** The Supabase access token to send to the function, or null when signed out. */
  token(): Promise<string | null>;
  /** Calls back with the user id ('' when signed out) now and on every change; returns an unsubscribe. */
  observe(changed: (userId: string) => void): () => void;
  /** Where "Sign in" goes, or a sign-in action. */
  signIn(): void;
  signOut(): Promise<void>;
}

const platform = String(import.meta.env.VITE_PLATFORM_URL || 'https://schood.online').replace(/\/+$/, '');
/** The platform's sign-in page; the shared cookie brings the person back signed in. */
export const signInUrl = (mode: 'login' | 'signup' = 'login', returnTo: string = location.href) =>
  `${platform}/auth?${mode === 'signup' ? 'mode=signup&' : ''}returnTo=${encodeURIComponent(returnTo)}`;

const cookieSource: SessionSource = {
  id: 'schood-cookie',
  detect: () => configured,
  async token() {
    if (!auth) return null;
    const { data } = await auth.getSession();
    return data.session?.access_token ?? null;
  },
  observe: (changed) => observeAccount(changed),
  signIn: () => location.assign(signInUrl()),
  async signOut() {
    if (!auth) return;
    const { error } = await auth.signOut({ scope: 'local' });
    if (error) throw error;
  },
};

const sources: { source: SessionSource; priority: number }[] = [{ source: cookieSource, priority: 0 }];
/** Adds a session source; higher priority is tried first. Register before the app renders. */
export function registerSessionSource(source: SessionSource, priority = 10): void {
  if (sources.some((entry) => entry.source.id === source.id)) return;
  sources.push({ source, priority });
  sources.sort((a, b) => b.priority - a.priority);
}
export function activeSource(): SessionSource | null {
  return sources.find((entry) => entry.source.detect())?.source ?? null;
}

export type SessionState = { status: 'loading' | 'signed_out' | 'signed_in' | 'unconfigured'; userId: string; source: SessionSource | null };
const Context = createContext<SessionState>({ status: 'loading', userId: '', source: null });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const source = useMemo(() => activeSource(), []);
  const [state, setState] = useState<SessionState>({ status: source ? 'loading' : 'unconfigured', userId: '', source });
  useEffect(() => {
    if (!source) return;
    return source.observe((userId) => setState({ status: userId ? 'signed_in' : 'signed_out', userId, source }));
  }, [source]);
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
export const useSession = () => useContext(Context);
