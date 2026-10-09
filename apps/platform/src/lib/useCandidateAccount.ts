import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export const candidateProfileFromSession = (session: Session | null) => {
  const metadata = session?.user.user_metadata ?? {};
  const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
  const parts = (text(metadata.full_name) || text(metadata.name)).split(/\s+/).filter(Boolean);
  return {
    first_name: text(metadata.first_name) || text(metadata.given_name) || parts.slice(0, -1).join(' '),
    last_name: text(metadata.last_name) || text(metadata.family_name) || parts.at(-1) || '',
    email: session?.user.email?.trim() ?? '',
    phone: text(metadata.phone) || text(metadata.phone_number),
  };
};

export const useCandidateAccount = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    let revision = 0;
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      revision++;
      if (mounted) { setSession(next); setLoading(false); }
    });
    const initialRevision = revision;
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted && revision === initialRevision) { setSession(data.session); setLoading(false); }
    }).catch(() => { if (mounted && revision === initialRevision) setLoading(false); });
    return () => { mounted = false; data.subscription.unsubscribe(); };
  }, []);
  // This changes only with identity, so token refresh does not discard typed roster details.
  const identity = session?.user.id ?? '';
  const profile = useRef(candidateProfileFromSession(session));
  const previousIdentity = useRef<string | null>(null);
  if (identity !== previousIdentity.current) {
    previousIdentity.current = identity;
    profile.current = candidateProfileFromSession(session);
  }
  return { session, loading, identity, profile: profile.current };
};
