import { useCallback, useEffect, useState } from 'react';
import { clearLocalAuthStorage, supabase } from '../../lib/supabase';

export const toFriendlyAdminError = (err: unknown, fallback: string): string => {
  const msg = err instanceof Error ? err.message : '';
  if (/401|unauthorized|invalid jwt/i.test(msg)) return 'Session expired. Please sign in again and retry.';
  if (/403|forbidden/i.test(msg)) return 'Admin access is required for this action.';
  if (/429|rate limit/i.test(msg)) return 'Too many requests. Please wait a moment and retry.';
  return fallback;
};

export const useAdminAccessToken = () => {
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setAccessToken(session?.access_token ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const getValidToken = useCallback(async (): Promise<string | null> => {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    const session = data.session;
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = Number(session?.expires_at ?? 0);
    const shouldRefresh = !session?.access_token || !Number.isFinite(expiresAt) || expiresAt - now < 90;
    if (!shouldRefresh) return session.access_token;

    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed.session?.access_token) return session?.access_token ?? null;
    return refreshed.session.access_token;
  }, []);

  const withFreshToken = useCallback(async <T,>(run: (token: string) => Promise<T>): Promise<T> => {
    const token = await getValidToken();
    if (!token) {
      clearLocalAuthStorage();
      setAccessToken(null);
      throw new Error('Session expired. Please sign in again and retry.');
    }

    try {
      return await run(token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (/401|unauthorized|invalid jwt/i.test(msg)) {
        clearLocalAuthStorage();
        setAccessToken(null);
      }
      throw err;
    }
  }, [getValidToken]);

  return { accessToken, withFreshToken };
};

export const EnglishAdminSubnav: React.FC<{ active: 'overview' | 'content' | 'ops' | 'rules' | 'control' }> = ({ active }) => {
  const links = [
    { key: 'overview', label: 'Overview', href: '/admin/english' },
    { key: 'content', label: 'Content', href: '/admin/english/content' },
    { key: 'ops', label: 'Ops', href: '/admin/english/ops' },
    { key: 'rules', label: 'Rules', href: '/admin/english/rules' },
    { key: 'control', label: 'Control center', href: '/admin/english/control' },
  ] as const;

  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => (
        <a
          key={link.key}
          href={link.href}
          className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-semibold transition ${
            active === link.key
              ? 'border-orange-300 bg-orange-50 text-orange-900'
              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900'
          }`}
        >
          {link.label}
        </a>
      ))}
    </div>
  );
};
