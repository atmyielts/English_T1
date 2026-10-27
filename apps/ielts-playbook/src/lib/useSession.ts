import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/** Signed-in state for the header only (no network beyond the local session). */
export const useSignedIn = (): 'loading' | 'signed-in' | 'signed-out' => {
  const [state, setState] = useState<'loading' | 'signed-in' | 'signed-out'>('loading');
  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setState(data.session ? 'signed-in' : 'signed-out');
      })
      .catch(() => {
        if (active) setState('signed-out');
      });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setState(session ? 'signed-in' : 'signed-out');
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return state;
};

export const signOut = async (): Promise<void> => {
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
};
