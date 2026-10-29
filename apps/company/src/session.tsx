// Who is signed in (Session) and which workspace is open (Workspace). Areas read
// both through hooks instead of fetching them again.
import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { observeAccount, supabase } from '../../../packages/assessment-web/src/client';
import { api, type Me, type Workspace } from './api.ts';

export interface Session {
  /** '' while signed out; undefined until the first check finishes. */
  user: string | undefined;
  me: Me | null;
  error: unknown;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}
const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | undefined>(undefined);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => observeAccount(setUser), []);
  const refresh = useCallback(async () => {
    if (!user) { setMe(null); return; }
    try {
      setMe(await api<Me>('me', { expectedActor: user }));
      setError(null);
    } catch (cause) {
      setError(cause);
    }
  }, [user]);
  useEffect(() => { setMe(null); void refresh(); }, [refresh]);
  const signOut = useCallback(async () => {
    await supabase?.auth.signOut({ scope: 'local' });
  }, []);
  return <SessionContext.Provider value={{ user, me, error, refresh, signOut }}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession outside SessionProvider');
  return value;
}

export interface WorkspaceState extends Workspace {
  refresh: () => Promise<void>;
  /** Owner or HR admin (or Schood staff). */
  hr: boolean;
  /** Owner, HR admin or manager (or Schood staff). */
  lead: boolean;
  staff: boolean;
}
export const WorkspaceContext = createContext<WorkspaceState | null>(null);

/** The open workspace; only inside /w/:org pages. */
export function useWorkspace(): WorkspaceState {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace outside a workspace page');
  return value;
}
