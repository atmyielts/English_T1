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

    const hydrate = async (session: Session | null) => {
      if (!session) {
        if (!cancelled) setState({ status: 'unauthenticated' });
        return;
      }

      try {
        const me = await getMe(session.access_token);
        const effective = includeEffective ? await getAccessEffective(session.access_token).catch(() => null) : null;
        if (!cancelled) setState({ status: 'authenticated', session, me, effective });
      } catch {
        if (!cancelled) setState({ status: 'unauthenticated' });
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) void hydrate(data.session);
    });

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
