import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { getAccessEffective, getMe, type AccessEffectiveResponse, type MeResponse } from './api';

type AccessState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; session: Session; me: MeResponse; effective: AccessEffectiveResponse | null };

type AccessResult = {
  status: AccessState['status'];
  session: Session | null;
  me: MeResponse | null;
  effective: AccessEffectiveResponse | null;
  accessToken: string | null;
  userId: string | null;
};

export const useAccess = (opts?: { force?: boolean; includeEffective?: boolean }): AccessResult => {
  const [state, setState] = useState<AccessState>({ status: 'loading' });
  const includeEffective = opts?.includeEffective === true;
  const force = opts?.force === true;

  useEffect(() => {
    let cancelled = false;
    let version = 0;
    let actor: string | null = null;

    const hydrate = async (session: Session | null) => {
      const current = ++version;
      if (actor !== (session?.user.id ?? null)) {
        actor = session?.user.id ?? null;
        if (!cancelled) setState({ status: 'loading' });
      }
      if (!session) {
        if (!cancelled) setState({ status: 'unauthenticated' });
        return;
      }

      try {
        const me = await getMe(session.access_token);
        const effective = includeEffective ? await getAccessEffective(session.access_token).catch(() => null) : null;
        if (!cancelled && current === version) setState({ status: 'authenticated', session, me, effective });
      } catch {
        if (!cancelled && current === version) setState({ status: 'unauthenticated' });
      }
    };

    const initialVersion = version;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && version === initialVersion) void hydrate(data.session);
    }).catch(() => { if (!cancelled && version === initialVersion) setState({ status: 'unauthenticated' }); });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) void hydrate(session);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [force, includeEffective]);

  if (state.status === 'authenticated') {
    return {
      status: state.status,
      session: state.session,
      me: state.me,
      effective: state.effective,
      accessToken: state.session.access_token,
      userId: state.session.user.id,
    };
  }

  return {
    status: state.status,
    session: null,
    me: null,
    effective: null,
    accessToken: null,
    userId: null,
  };
};
