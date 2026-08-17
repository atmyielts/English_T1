import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { referralsClaim } from '../lib/platformClient';
import {
  buildReferralContext,
  clearStoredReferral,
  readStoredReferralContext,
  REFERRAL_CODE_STORAGE_KEY,
  storeReferral,
} from '../lib/referralContext';
import { isExternalUrl, sanitizeReturnTo } from '../lib/returnTo';
import { useI18n } from '../i18n';
import { LanguageSwitcher } from '../components/layout/LanguageSwitcher';
import { SeoHead } from '../components/seo/SeoHead';
import {
  fetchAuthProviderAvailability,
  hasProviderIdentity,
  normalizePhone,
  TELEGRAM_AUTH_PROVIDER,
  type AuthProviderAvailability,
} from '../lib/authProviders';

type Mode = 'signin' | 'signup' | 'forgot' | 'reset' | 'profile';
type OAuthProvider = 'google' | 'telegram';
type ProfileDraft = { first_name?: string; last_name?: string; phone?: string };

const OAUTH_PROFILE_STORAGE_KEY = 'schood.auth.oauth-profile';

const readPendingOAuthProfile = (): ProfileDraft => {
  try {
    const raw = window.sessionStorage.getItem(OAUTH_PROFILE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      first_name: typeof parsed.first_name === 'string' ? parsed.first_name : undefined,
      last_name: typeof parsed.last_name === 'string' ? parsed.last_name : undefined,
      phone: typeof parsed.phone === 'string' ? parsed.phone : undefined,
    };
  } catch {
    return {};
  }
};

const storePendingOAuthProfile = (profile: ProfileDraft): void => {
  try {
    window.sessionStorage.setItem(OAUTH_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // The required-profile screen is the fallback when session storage is unavailable.
  }
};

const clearPendingOAuthProfile = (): void => {
  try {
    window.sessionStorage.removeItem(OAUTH_PROFILE_STORAGE_KEY);
  } catch {
    // no-op
  }
};

const AUTH_HANDOFF_KEYS = [
  'access_token',
  'refresh_token',
  'expires_at',
  'expires_in',
  'token_type',
  'type',
];

const passwordChecks = (value: string): Array<'length' | 'letter' | 'number'> => {
  const missing: Array<'length' | 'letter' | 'number'> = [];
  if (value.length < 8) missing.push('length');
  if (!/[A-Za-z]/.test(value)) missing.push('letter');
  if (!/\d/.test(value)) missing.push('number');
  return missing;
};

const withPlatformAuthHandoff = (target: string, session: Session): string => {
  const url = new URL(target);
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  const hashParams = new URLSearchParams(hash);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresIn =
    typeof session.expires_in === 'number' && Number.isFinite(session.expires_in)
      ? session.expires_in
      : session.expires_at
        ? Math.max(session.expires_at - nowSeconds, 1)
        : 3600;
  const expiresAt = session.expires_at ?? nowSeconds + expiresIn;
  AUTH_HANDOFF_KEYS.forEach((key) => hashParams.delete(key));
  hashParams.set('access_token', session.access_token);
  hashParams.set('refresh_token', session.refresh_token);
  hashParams.set('token_type', session.token_type || 'bearer');
  hashParams.set('type', 'platform_handoff');
  hashParams.set('expires_at', String(expiresAt));
  hashParams.set('expires_in', String(expiresIn));
  url.hash = hashParams.toString();
  return url.toString();
};

export const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const returnTo = useMemo(() => sanitizeReturnTo(searchParams.get('returnTo')), [searchParams]);
  const modeParam = useMemo(() => {
    const raw = (searchParams.get('mode') ?? '').toLowerCase();
    if (!raw) return null;
    if (raw === 'signup' || raw === 'register' || raw === 'create') return 'signup';
    if (raw === 'signin' || raw === 'login') return 'signin';
    if (raw === 'forgot' || raw === 'recover') return 'forgot';
    if (raw === 'reset' || raw === 'recovery') return 'reset';
    return null;
  }, [searchParams]);
  const authIntent = searchParams.get('authIntent');
  const authRedirectTo = useMemo(() => `${window.location.origin}/auth?returnTo=${encodeURIComponent(returnTo)}`, [returnTo]);
  const telegramEmailRedirectTo = useMemo(
    () => `${window.location.origin}/auth?authIntent=telegram-link&returnTo=${encodeURIComponent(returnTo)}`,
    [returnTo],
  );
  const telegramLinkRedirectTo = useMemo(
    () => `${window.location.origin}/auth?authIntent=telegram-complete&returnTo=${encodeURIComponent(returnTo)}`,
    [returnTo],
  );
  const emailRedirectTo = authRedirectTo;
  const passwordResetRedirectTo = useMemo(() => `${window.location.origin}/auth?mode=reset`, []);
  const isRecoveryLink = useMemo(() => {
    const hash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
    return new URLSearchParams(hash).get('type') === 'recovery';
  }, [location.hash]);

  const [mode, setMode] = useState<Mode>(isRecoveryLink ? 'reset' : modeParam ?? 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState<OAuthProvider | null>(null);
  const [pendingSession, setPendingSession] = useState<Session | null>(null);
  const [providers, setProviders] = useState<AuthProviderAvailability>({
    google: null,
    telegram: null,
    manualLinking: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const mapAuthError = useCallback((err: unknown, currentMode: Mode): string => {
    const message = err instanceof Error ? err.message : '';
    const lower = message.toLowerCase();
    const status = (err as { status?: number } | null)?.status;

    if (lower.includes('weak password') || lower.includes('password should') || lower.includes('password must') || lower.includes('password is too')) {
      return t('auth.error.weakPassword');
    }

    if (lower.includes('invalid') && lower.includes('email')) {
      return t('auth.error.invalidEmail');
    }

    if (lower.includes('email not confirmed')) {
      return t('auth.error.emailNotConfirmed');
    }

    if (lower.includes('telegram_requires_verified_email') || lower.includes('verify your email before using telegram')) {
      return t('auth.error.telegramEmailFirst');
    }

    if (lower.includes('identity is already linked') || lower.includes('identity already exists')) {
      return t('auth.error.identityAlreadyLinked');
    }

    if (lower.includes('manual linking') || lower.includes('provider is not enabled') || lower.includes('unsupported provider')) {
      return t('auth.error.providerUnavailable');
    }

    if (currentMode === 'forgot') {
      if (status === 429) return t('auth.error.tooManyAttempts');
      return t('auth.error.resetRequestGeneric');
    }

    if (currentMode === 'reset') {
      if (status === 429) return t('auth.error.tooManyAttempts');
      return t('auth.error.resetGeneric');
    }

    if (currentMode === 'signup') {
      if (lower.includes('already registered') || lower.includes('already exists')) {
        return t('auth.error.signupExists');
      }
      if (status === 429) return t('auth.error.tooManyAttempts');
      return t('auth.error.signupGeneric');
    }

    if (currentMode === 'signin') {
      if (lower.includes('invalid login credentials')) {
        return t('auth.error.signinGeneric');
      }
      if (lower.includes('user not found')) {
        return t('auth.error.signinNoAccount');
      }
      if (status === 429) return t('auth.error.tooManyAttempts');
      return t('auth.error.signinGeneric');
    }

    return t('auth.error.generic');
  }, [t]);

  useEffect(() => {
    const ref = searchParams.get('ref')?.trim().toUpperCase();
    if (ref) storeReferral(ref, buildReferralContext(location.pathname, location.search, ref));
  }, [location.pathname, location.search, searchParams]);

  const claimStoredReferral = useCallback(async (accessToken: string) => {
    const code = window.localStorage.getItem(REFERRAL_CODE_STORAGE_KEY)?.trim();
    if (!code) return;
    try {
      await referralsClaim(accessToken, code, readStoredReferralContext());
    } catch {
      // Referral claims are best-effort and should not block account access.
    } finally {
      clearStoredReferral();
    }
  }, []);

  const syncProfile = useCallback(async (userId: string, profile: ProfileDraft) => {
    const payload: Record<string, unknown> = { user_id: userId };
    if (profile.first_name) payload.first_name = profile.first_name;
    if (profile.last_name) payload.last_name = profile.last_name;
    if (profile.phone) payload.phone = profile.phone;

    if (Object.keys(payload).length <= 1) return;
    const { error: profileError } = await supabase.from('user_profiles').upsert(payload, { onConflict: 'user_id' });
    if (profileError) throw profileError;
  }, []);

  const completeAuth = useCallback(async (
    session: Session,
    profile: ProfileDraft = {},
  ) => {
    if (!session.user.email) {
      await supabase.auth.signOut({ scope: 'local' });
      setMode('signup');
      setError(t('auth.error.emailIdentityRequired'));
      return;
    }

    const { data: storedProfile, error: storedProfileError } = await supabase
      .from('user_profiles')
      .select('first_name,last_name,phone')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (storedProfileError) throw storedProfileError;

    const metadata = session.user.user_metadata as Record<string, unknown>;
    const metadataValue = (key: string): string | undefined => {
      const value = metadata?.[key];
      return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    };
    const storedPhone = typeof storedProfile?.phone === 'string' ? storedProfile.phone.trim() : '';
    const normalizedPhone = normalizePhone(profile.phone || storedPhone || metadataValue('phone') || '');
    const resolvedProfile: ProfileDraft = {
      first_name: profile.first_name ?? storedProfile?.first_name ?? metadataValue('first_name'),
      last_name: profile.last_name ?? storedProfile?.last_name ?? metadataValue('last_name'),
      phone: normalizedPhone ?? undefined,
    };

    if (!resolvedProfile.phone) {
      setPendingSession(session);
      setEmail(session.user.email);
      setFirstName(resolvedProfile.first_name ?? '');
      setLastName(resolvedProfile.last_name ?? '');
      setPhone('');
      setMode('profile');
      setOauthBusy(null);
      setMessage(t('auth.message.phoneCompletionRequired'));
      return;
    }

    await syncProfile(session.user.id, resolvedProfile);
    clearPendingOAuthProfile();
    await claimStoredReferral(session.access_token);

    if (isExternalUrl(returnTo)) {
      window.location.assign(withPlatformAuthHandoff(returnTo, session));
      return;
    }
    navigate(returnTo, { replace: true });
  }, [claimStoredReferral, navigate, returnTo, syncProfile, t]);

  useEffect(() => {
    const controller = new AbortController();
    fetchAuthProviderAvailability(controller.signal)
      .then(setProviders)
      .catch(() => {
        // Keep providers clickable if the public settings endpoint is temporarily unavailable.
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let canceled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (canceled || !data.session) return;
      if (mode === 'reset' || mode === 'profile' || isRecoveryLink) return;

      try {
        if (
          authIntent === 'telegram-link'
          && !hasProviderIdentity(data.session.user.identities, TELEGRAM_AUTH_PROVIDER)
        ) {
          setOauthBusy('telegram');
          const { error: linkError } = await supabase.auth.linkIdentity({
            provider: TELEGRAM_AUTH_PROVIDER,
            options: {
              redirectTo: telegramLinkRedirectTo,
              scopes: 'openid profile phone telegram:bot_access',
            },
          });
          if (linkError) throw linkError;
          return;
        }

        await completeAuth(data.session, readPendingOAuthProfile());
      } catch (err) {
        if (!canceled) {
          setOauthBusy(null);
          setError(mapAuthError(err, mode));
        }
      }
    });
    return () => {
      canceled = true;
    };
  }, [authIntent, completeAuth, isRecoveryLink, mapAuthError, mode, telegramLinkRedirectTo]);

  useEffect(() => {
    if (!modeParam && !isRecoveryLink) return;
    setMode(isRecoveryLink ? 'reset' : modeParam ?? 'signin');
    setConfirmPassword('');
    setError(null);
    setMessage(null);
  }, [isRecoveryLink, modeParam]);

  const submit = async () => {
    setError(null);
    setMessage(null);

    const trimmedEmail = email.trim();
    const normalizedPhone = normalizePhone(phone);

    if (mode === 'profile') {
      if (!pendingSession) {
        setError(t('auth.error.sessionExpired'));
        return;
      }
      if (!normalizedPhone) {
        setError(t('auth.error.phoneInvalid'));
        return;
      }
      setBusy(true);
      try {
        await completeAuth(pendingSession, {
          first_name: firstName.trim() || undefined,
          last_name: lastName.trim() || undefined,
          phone: normalizedPhone,
        });
      } catch (err) {
        setError(mapAuthError(err, mode));
      } finally {
        setBusy(false);
      }
      return;
    }

    if ((mode === 'signin' || mode === 'signup' || mode === 'forgot') && !trimmedEmail) {
      setError(t('auth.error.emailRequired'));
      return;
    }

    if ((mode === 'signin' || mode === 'signup' || mode === 'reset') && !password) {
      setError(t('auth.error.passwordRequired'));
      return;
    }

    if ((mode === 'signup' || mode === 'reset') && passwordChecks(password).length > 0) {
      setError(t('auth.error.weakPassword'));
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setError(t('auth.error.passwordMismatch'));
      return;
    }
    if (mode === 'reset' && password !== confirmPassword) {
      setError(t('auth.error.passwordMismatch'));
      return;
    }
    if (mode === 'signup' && !normalizedPhone) {
      setError(phone.trim() ? t('auth.error.phoneInvalid') : t('auth.error.phoneRequired'));
      return;
    }

    setBusy(true);

    try {
      if (mode === 'forgot') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
          redirectTo: passwordResetRedirectTo,
        });
        if (resetError) throw resetError;
        setMessage(t('auth.message.resetEmailSent'));
        setMode('signin');
        return;
      }

      if (mode === 'reset') {
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        setMessage(t('auth.message.passwordUpdated'));
        setPassword('');
        setConfirmPassword('');
        setMode('signin');
        return;
      }

      if (mode === 'signin') {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
        if (signInError) throw signInError;
        if (!data.session) throw new Error('No session returned');

        const um = (data.session.user.user_metadata ?? {}) as Record<string, unknown>;
        const profile = {
          first_name: typeof um.first_name === 'string' ? um.first_name.trim() : undefined,
          last_name: typeof um.last_name === 'string' ? um.last_name.trim() : undefined,
          phone: typeof um.phone === 'string' ? um.phone.trim() : undefined,
        };
        await completeAuth(data.session, profile);
        return;
      }

      const meta: Record<string, unknown> = {};
      const fn = firstName.trim();
      const ln = lastName.trim();
      const ph = normalizedPhone ?? '';
      if (fn) meta.first_name = fn;
      if (ln) meta.last_name = ln;
      if (ph) meta.phone = ph;

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: { data: meta, emailRedirectTo },
      });
      if (signUpError) throw signUpError;

      const identities = data.user?.identities ?? [];
      if (data.user && identities.length === 0) {
        setMessage(t('auth.message.accountExists'));
        setMode('signin');
        return;
      }

      if (data.session) {
        await completeAuth(data.session, {
          first_name: fn || undefined,
          last_name: ln || undefined,
          phone: ph || undefined,
        });
        return;
      }

      setMessage(`${t('auth.message.signupSuccess')} ${t('auth.message.checkSpam')}`);
      setMode('signin');
    } catch (err) {
      setError(mapAuthError(err, mode));
    } finally {
        setBusy(false);
      }
    };

  const signInWithGoogle = async () => {
    setError(null);
    setMessage(null);
    if (providers.google === false) {
      setError(t('auth.error.googleUnavailable'));
      return;
    }

    if (mode === 'signup') {
      const normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone) {
        setError(phone.trim() ? t('auth.error.phoneInvalid') : t('auth.error.phoneRequiredForSocial'));
        return;
      }
      storePendingOAuthProfile({
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
        phone: normalizedPhone,
      });
    }

    setOauthBusy('google');
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: authRedirectTo,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      setError(mapAuthError(err, mode));
      setOauthBusy(null);
    }
  };

  const signInWithTelegram = async () => {
    setError(null);
    setMessage(null);
    if (providers.telegram === false) {
      setError(t('auth.error.telegramUnavailable'));
      return;
    }

    if (mode === 'signup') {
      const trimmedEmail = email.trim();
      const normalizedPhone = normalizePhone(phone);
      if (!trimmedEmail) {
        setError(t('auth.error.emailRequired'));
        return;
      }
      if (!normalizedPhone) {
        setError(phone.trim() ? t('auth.error.phoneInvalid') : t('auth.error.phoneRequiredForSocial'));
        return;
      }

      setOauthBusy('telegram');
      try {
        const profile = {
          first_name: firstName.trim() || undefined,
          last_name: lastName.trim() || undefined,
          phone: normalizedPhone,
        };
        storePendingOAuthProfile(profile);
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email: trimmedEmail,
          options: {
            shouldCreateUser: true,
            emailRedirectTo: telegramEmailRedirectTo,
            data: { ...profile, auth_signup_provider: 'telegram' },
          },
        });
        if (otpError) throw otpError;
        setMessage(`${t('auth.message.telegramEmailSent')} ${t('auth.message.checkSpam')}`);
      } catch (err) {
        setError(mapAuthError(err, mode));
      } finally {
        setOauthBusy(null);
      }
      return;
    }

    setOauthBusy('telegram');
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: TELEGRAM_AUTH_PROVIDER,
        options: {
          redirectTo: authRedirectTo,
          scopes: 'openid profile phone telegram:bot_access',
        },
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      setError(mapAuthError(err, mode));
      setOauthBusy(null);
    }
  };

  const authTitle =
    mode === 'signin'
      ? t('auth.welcomeBack')
      : mode === 'signup'
        ? t('auth.createAccount')
        : mode === 'forgot'
          ? t('auth.forgot.title')
          : mode === 'reset'
            ? t('auth.reset.title')
            : t('auth.profile.title');

  const authSubtitle =
    mode === 'signin'
      ? t('auth.subtitle.signIn')
      : mode === 'signup'
        ? t('auth.subtitle.signUp')
        : mode === 'forgot'
          ? t('auth.forgot.subtitle')
          : mode === 'reset'
            ? t('auth.reset.subtitle')
            : t('auth.profile.subtitle');

  const formHeading =
    mode === 'signin'
      ? t('auth.heading.signIn')
      : mode === 'signup'
        ? t('auth.heading.create')
        : mode === 'forgot'
          ? t('auth.forgot.heading')
          : mode === 'reset'
            ? t('auth.reset.heading')
            : t('auth.profile.heading');

  const formHelper =
    mode === 'signin'
      ? t('auth.helper.signIn')
      : mode === 'signup'
        ? t('auth.helper.signUp')
        : mode === 'forgot'
          ? t('auth.forgot.helper')
          : mode === 'reset'
            ? t('auth.reset.helper')
            : t('auth.profile.helper');

  const primaryLabel =
    mode === 'signin'
      ? t('header.signIn')
      : mode === 'signup'
        ? t('header.signUp')
        : mode === 'forgot'
          ? t('auth.button.sendReset')
          : mode === 'reset'
            ? t('auth.button.updatePassword')
            : t('auth.button.completeProfile');

  const passwordMissing = passwordChecks(password);
  const requiresPassword = mode === 'signin' || mode === 'signup' || mode === 'reset';
  const requiresConfirmPassword = mode === 'signup' || mode === 'reset';
  const primaryDisabled =
    busy ||
    Boolean(oauthBusy) ||
    ((mode === 'signin' || mode === 'signup' || mode === 'forgot') && !email.trim()) ||
    (requiresPassword && !password) ||
    ((mode === 'signup' || mode === 'reset') && password !== confirmPassword) ||
    ((mode === 'signup' || mode === 'profile') && !phone.trim());

  return (
    <div className="min-h-screen bg-[#f6f1e8] text-gray-900 relative overflow-hidden flex items-center justify-center p-6">
      <SeoHead
        title="Schood Account Access"
        description="Sign in or create your Schood account."
        path="/auth"
        robots="noindex, nofollow"
      />

      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 -right-24 h-[420px] w-[420px] rounded-full bg-emerald-200/60 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 h-[480px] w-[480px] rounded-full bg-amber-200/40 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(#00000010_1px,transparent_1px)] [background-size:22px_22px] opacity-30" />
      </div>

      <div className="relative w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 rounded-3xl border border-gray-900 bg-white/85 p-8 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-gray-800 bg-white/70 border border-gray-900 rounded-full px-3 py-1 hover:bg-white"
            >
              {t('nav.brand')}
            </button>
            <LanguageSwitcher compact />
          </div>
          <h1 className="text-3xl font-bold mt-4">{authTitle}</h1>
          <p className="text-sm text-gray-600 mt-2">{authSubtitle}</p>
          <div className="mt-6 space-y-3 text-sm text-gray-700">
            <div className="rounded-2xl border border-gray-900/15 bg-white/90 p-3">
              {t('auth.benefit.oneAccount')}
            </div>
            <div className="rounded-2xl border border-gray-900/15 bg-white/90 p-3">
              {t('auth.benefit.pacing')}
            </div>
            <div className="rounded-2xl border border-gray-900/15 bg-white/90 p-3">
              {t('auth.benefit.plans')}
            </div>
            <button
              type="button"
              onClick={() => navigate('/contact')}
              className="w-full rounded-2xl border border-gray-900/15 bg-white/90 p-3 text-left font-semibold hover:bg-white"
            >
              {t('auth.contactSupport')}
            </button>
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="w-full bg-white/90 border border-gray-900 rounded-3xl shadow-sm p-8">
            <div className="mb-6">
              <div className="text-xs font-semibold tracking-wider uppercase text-gray-600 mb-2">{t('auth.section.account')}</div>
              <h2 className="text-2xl font-bold text-gray-900">{formHeading}</h2>
              <p className="text-sm text-gray-500 mt-1">{formHelper}</p>
            </div>

            {error && (
              <div role="alert" className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
            )}
            {message && (
              <div role="status" aria-live="polite" className="mb-4 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                {message}
              </div>
            )}

            <div className="space-y-4">
              {mode === 'signin' || mode === 'signup' ? (
                <>
                  <button
                    type="button"
                    onClick={() => void signInWithGoogle()}
                    disabled={busy || Boolean(oauthBusy) || providers.google === false}
                    className="flex w-full items-center justify-center gap-3 rounded-full border border-gray-900 bg-white px-4 py-3 text-sm font-semibold text-gray-900 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 bg-white text-sm font-bold">G</span>
                    {oauthBusy === 'google' ? t('auth.button.working') : t('auth.button.google')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void signInWithTelegram()}
                    disabled={busy || Boolean(oauthBusy) || providers.telegram === false}
                    className="flex w-full items-center justify-center gap-3 rounded-full border border-[#229ED9] bg-[#229ED9] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#168ac2] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-sm font-bold">T</span>
                    {oauthBusy === 'telegram'
                      ? t('auth.button.working')
                      : mode === 'signup'
                        ? t('auth.button.telegramSignup')
                        : t('auth.button.telegramSignin')}
                  </button>
                  {providers.google === false || providers.telegram === false ? (
                    <p className="text-center text-xs text-amber-700" role="status">
                      {t('auth.provider.configurationPending')}
                    </p>
                  ) : null}
                  {mode === 'signup' ? (
                    <p className="text-center text-xs text-gray-500">{t('auth.provider.signupHelper')}</p>
                  ) : null}
                  <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                    <span className="h-px flex-1 bg-gray-200" />
                    {t('auth.divider.email')}
                    <span className="h-px flex-1 bg-gray-200" />
                  </div>
                </>
              ) : null}

              {mode !== 'reset' ? (
              <div>
                <label htmlFor="auth-email" className="block text-sm font-medium text-gray-700 mb-1">{t('auth.label.email')}</label>
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  readOnly={mode === 'profile'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                  placeholder={t('auth.placeholder.email')}
                  autoComplete="email"
                />
              </div>
              ) : null}
              {mode === 'signup' || mode === 'profile' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="auth-first-name" className="block text-sm font-medium text-gray-700 mb-1">{t('auth.label.firstName')}</label>
                    <input
                      id="auth-first-name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                      placeholder={t('auth.placeholder.firstName')}
                      autoComplete="given-name"
                    />
                  </div>

                  <div>
                    <label htmlFor="auth-last-name" className="block text-sm font-medium text-gray-700 mb-1">{t('auth.label.lastName')}</label>
                    <input
                      id="auth-last-name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                      placeholder={t('auth.placeholder.lastName')}
                      autoComplete="family-name"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor="auth-phone" className="block text-sm font-medium text-gray-700 mb-1">{t('auth.label.phone')}</label>
                    <input
                      id="auth-phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                      placeholder={t('auth.placeholder.phone')}
                      autoComplete="tel"
                      inputMode="tel"
                      required
                    />
                    <p className="mt-1 text-xs text-gray-500">{t('auth.phone.helper')}</p>
                  </div>
                </div>
              ) : null}

              {requiresPassword ? (
              <div>
                <label htmlFor="auth-password" className="block text-sm font-medium text-gray-700 mb-1">{t('auth.label.password')}</label>
                <div className="relative">
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-20 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                    placeholder={t('auth.placeholder.password')}
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold px-2 py-1 rounded-md border border-gray-200 bg-white text-gray-700"
                  >
                    {showPassword ? t('auth.button.hide') : t('auth.button.show')}
                  </button>
                </div>
                {(mode === 'signup' || mode === 'reset') ? (
                  <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                    <div className={passwordMissing.includes('length') ? 'text-gray-700' : 'text-emerald-700'}>
                      {t('auth.passwordRule.length')}
                    </div>
                    <div className={passwordMissing.includes('letter') ? 'text-gray-700' : 'text-emerald-700'}>
                      {t('auth.passwordRule.letter')}
                    </div>
                    <div className={passwordMissing.includes('number') ? 'text-gray-700' : 'text-emerald-700'}>
                      {t('auth.passwordRule.number')}
                    </div>
                  </div>
                ) : null}
              </div>
              ) : null}

              {requiresConfirmPassword ? (
                <div>
                  <label htmlFor="auth-confirm-password" className="block text-sm font-medium text-gray-700 mb-1">{t('auth.label.confirmPassword')}</label>
                  <div className="relative">
                    <input
                      id="auth-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-3 py-2 pr-20 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                      placeholder={t('auth.placeholder.password')}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold px-2 py-1 rounded-md border border-gray-200 bg-white text-gray-700"
                    >
                      {showConfirmPassword ? t('auth.button.hide') : t('auth.button.show')}
                    </button>
                  </div>
                  {confirmPassword && confirmPassword !== password ? (
                    <div className="mt-2 text-xs text-red-700">{t('auth.error.passwordMismatch')}</div>
                  ) : null}
                </div>
              ) : null}

              <button
                type="button"
                onClick={submit}
                disabled={primaryDisabled}
                className="w-full bg-[#0f172a] hover:bg-black disabled:bg-gray-300 text-white font-semibold py-3 rounded-full transition-colors"
              >
                {busy ? t('auth.button.working') : primaryLabel}
              </button>

              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
                {mode !== 'profile' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setMessage(null);
                      setMode(mode === 'signin' ? 'signup' : 'signin');
                      setConfirmPassword('');
                    }}
                    className="hover:text-gray-900 font-medium"
                  >
                    {mode === 'signin' ? t('auth.button.create') : t('auth.button.haveAccount')}
                  </button>
                ) : null}

                {mode === 'signin' ? (
                  <button
                    onClick={() => {
                      setError(null);
                      setMessage(null);
                      setPassword('');
                      setConfirmPassword('');
                      setMode('forgot');
                    }}
                    className="hover:text-gray-900 font-medium"
                    type="button"
                  >
                    {t('auth.button.forgotPassword')}
                  </button>
                ) : null}

                <button
                  onClick={async () => {
                    if (mode === 'profile') {
                      await supabase.auth.signOut({ scope: 'local' });
                      clearPendingOAuthProfile();
                      setPendingSession(null);
                    }
                    if (isExternalUrl(returnTo)) window.location.assign(returnTo);
                    else navigate('/', { replace: true });
                  }}
                  className="hover:text-gray-900 font-medium"
                  type="button"
                >
                  {mode === 'profile' ? t('auth.button.signOut') : t('common.back')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
