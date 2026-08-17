import { useEffect } from 'react';
import { supabase } from '../../lib/supabase';

type GoogleCredentialResponse = {
  credential?: string;
};

type GooglePromptNotification = {
  isNotDisplayed?: () => boolean;
  isSkippedMoment?: () => boolean;
};

type GoogleIdentityApi = {
  initialize: (configuration: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    nonce: string;
    context: 'signin';
    auto_select: false;
    use_fedcm_for_prompt: true;
  }) => void;
  prompt: (listener?: (notification: GooglePromptNotification) => void) => void;
  cancel: () => void;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleIdentityApi;
      };
    };
  }
}

// A Google OAuth client ID is a public browser identifier, not the provider secret.
// The corresponding client secret remains configured only in Supabase Auth.
const GOOGLE_ONE_TAP_CLIENT_ID = '409252403991-mrk16s1vkspcph1b43qhoplrvck3sge1.apps.googleusercontent.com';
const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client';

let googleIdentityScript: Promise<void> | null = null;

const loadGoogleIdentityScript = (): Promise<void> => {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleIdentityScript) return googleIdentityScript;

  googleIdentityScript = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-schood-google-one-tap="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google One Tap failed to load.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = GOOGLE_IDENTITY_SCRIPT;
    script.async = true;
    script.dataset.schoodGoogleOneTap = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google One Tap failed to load.'));
    document.head.appendChild(script);
  });

  return googleIdentityScript;
};

const createNonce = async (): Promise<{ plain: string; sha256: string }> => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const plain = btoa(String.fromCharCode(...bytes));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plain));
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return { plain, sha256 };
};

type GoogleOneTapProps = {
  enabled: boolean;
  returnTo: string;
  onError: () => void;
};

/**
 * Displays Google's own One Tap surface for guests. Google determines whether
 * the prompt is eligible for a given browser/account; regular auth remains the fallback.
 */
export const GoogleOneTap = ({ enabled, returnTo, onError }: GoogleOneTapProps) => {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let receivedCredential = false;

    const initialize = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (cancelled || sessionData.session) return;

        const nonce = await createNonce();
        await loadGoogleIdentityScript();
        if (cancelled) return;

        const identity = window.google?.accounts?.id;
        if (!identity) throw new Error('Google One Tap did not initialize.');

        identity.initialize({
          client_id: GOOGLE_ONE_TAP_CLIENT_ID,
          nonce: nonce.sha256,
          context: 'signin',
          auto_select: false,
          use_fedcm_for_prompt: true,
          callback: async ({ credential }) => {
            if (!credential || receivedCredential || cancelled) return;
            receivedCredential = true;

            try {
              const { data, error } = await supabase.auth.signInWithIdToken({
                provider: 'google',
                token: credential,
                nonce: nonce.plain,
              });
              if (error || !data.session) throw error ?? new Error('Google One Tap did not return a session.');
              window.location.assign(`/auth?returnTo=${encodeURIComponent(returnTo)}`);
            } catch {
              if (!cancelled) onError();
            }
          },
        });

        identity.prompt((notification) => {
          // Google handles unavailable/dismissed prompts. The normal Login action remains available.
          if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.()) return;
        });
      } catch {
        if (!cancelled) onError();
      }
    };

    void initialize();

    return () => {
      cancelled = true;
      window.google?.accounts?.id?.cancel();
    };
  }, [enabled, onError, returnTo]);

  return null;
};
