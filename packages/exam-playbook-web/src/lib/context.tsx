import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { ExamConfig } from '../config';
import { createAdminApi, createApi, getEffective, getMe, type AdminApi, type MeResponse, type PlaybookApi } from './api';
import { supabase } from './supabase';

export type AccessState = {
  status: 'loading' | 'anonymous' | 'signed_in';
  token: string | null;
  userId: string | null;
  email: string | null;
  effectiveProductIds: string[];
  premium: boolean;
  isAdmin: boolean;
  permissions: string[];
  /** Whether `effectiveProductIds` could be loaded (false = access check unavailable). */
  effectiveKnown: boolean;
  hasProduct: (productId: string) => boolean;
  signOut: () => Promise<void>;
};

type PlaybookContextValue = { config: ExamConfig; api: PlaybookApi; adminApi: AdminApi; access: AccessState };

const PlaybookContext = createContext<PlaybookContextValue | null>(null);

const paywallDisabled = String(import.meta.env.VITE_DISABLE_PAYWALL ?? '').toLowerCase() === 'true';

const ADMIN_PERMISSIONS = ['admin.*', 'admin.products.manage', 'admin.analytics.view'];

export const PlaybookProvider = ({ config, children }: { config: ExamConfig; children: ReactNode }) => {
  const api = useMemo(() => createApi(config.functionName), [config.functionName]);
  const adminApi = useMemo(() => createAdminApi(config.exam), [config.exam]);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [effective, setEffective] = useState<string[] | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => active && setSession(data.session ?? null)).catch(() => active && setSession(null));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => active && setSession(next ?? null));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const token = session?.access_token ?? null;
  useEffect(() => {
    if (session === undefined) return;
    if (!token) {
      setMe(null);
      setEffective(null);
      setHydrated(true);
      return;
    }
    let active = true;
    setHydrated(false);
    Promise.allSettled([getMe(token), getEffective(token)]).then(([meResult, effResult]) => {
      if (!active) return;
      setMe(meResult.status === 'fulfilled' ? meResult.value : null);
      setEffective(effResult.status === 'fulfilled' && Array.isArray(effResult.value.effective_product_ids) ? effResult.value.effective_product_ids : null);
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, [session, token]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut().catch(() => undefined);
    setSession(null);
  }, []);

  const access = useMemo<AccessState>(() => {
    const effectiveIds = effective ?? [];
    const entitled = (productId: string) =>
      effectiveIds.includes(productId) || !!me?.entitlements?.some((e) => e.resource_type === 'product' && e.resource_id === productId);
    const permissions = Array.isArray(me?.admin?.permissions) ? me!.admin!.permissions! : [];
    const status: AccessState['status'] = session === undefined || (token && !hydrated) ? 'loading' : token ? 'signed_in' : 'anonymous';
    return {
      status,
      token,
      userId: session?.user?.id ?? null,
      email: session?.user?.email ?? me?.user?.email ?? null,
      effectiveProductIds: effectiveIds,
      effectiveKnown: effective !== null,
      premium: !!token && (paywallDisabled || entitled(config.productId)),
      isAdmin: !!token && (String(me?.user?.role ?? '').toLowerCase() === 'admin' || permissions.some((p) => ADMIN_PERMISSIONS.includes(p))),
      permissions,
      hasProduct: (productId: string) => !!token && entitled(productId),
      signOut,
    };
  }, [config.productId, effective, hydrated, me, session, signOut, token]);

  const value = useMemo(() => ({ config, api, adminApi, access }), [access, adminApi, api, config]);
  return <PlaybookContext.Provider value={value}>{children}</PlaybookContext.Provider>;
};

export const usePlaybook = (): PlaybookContextValue => {
  const value = useContext(PlaybookContext);
  if (!value) throw new Error('usePlaybook must be used inside PlaybookProvider');
  return value;
};
