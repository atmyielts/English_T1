import { createJourneyTracker } from '@schood/journey-analytics';
import { edgeBase, supabaseAnonKey } from './supabase';

export const platformJourney = createJourneyTracker({
  endpoint: `${edgeBase}/platform-events`,
  anonKey: supabaseAnonKey,
  surface: 'platform',
  releaseSha: import.meta.env.VITE_RELEASE_SHA as string | undefined,
  cookieDomain: import.meta.env.VITE_AUTH_COOKIE_DOMAIN as string | undefined,
});
