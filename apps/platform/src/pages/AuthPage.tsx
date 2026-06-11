import React, { useEffect, useMemo, useState } from 'react';
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

type Mode = 'signin' | 'signup' | 'forgot' | 'reset';

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
  const emailRedirectTo = useMemo(() => `${window.location.origin}/auth`, []);
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
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const mapAuthError = (err: unknown, currentMode: Mode): string => {
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
      if (lower) return message;
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
  };

  useEffect(() => {
    const ref = searchParams.get('ref')?.trim().toUpperCase();
    if (ref) storeReferral(ref, buildReferralContext(location.pathname, location.search, ref));
  }, [location.pathname, location.search, searchParams]);

  const claimStoredReferral = async (accessToken: string) => {
    const code = window.localStorage.getItem(REFERRAL_CODE_STORAGE_KEY)?.trim();
    if (!code) return;
    try {
      await referralsClaim(accessToken, code, readStoredReferralContext());
    } catch {
      // Referral claims are best-effort and should not block account access.
    } finally {
      clearStoredReferral();
    }
  };

  const completeAuth = async (
    session: Session,
    profile: { first_name?: string; last_name?: string; phone?: string } = {},
  ) => {
    await syncProfile(session.user.id, profile);
    await claimStoredReferral(session.access_token);

    if (isExternalUrl(returnTo)) {
      window.location.assign(withPlatformAuthHandoff(returnTo, session));
      return;
    }
    navigate(returnTo, { replace: true });
  };

  useEffect(() => {
    // If already logged in, go straight through.
      supabase.auth.getSession().then(({ data }) => {
        if (!data.session) return;
        if (mode === 'reset' || isRecoveryLink) return;
        const um: any = data.session.user.user_metadata ?? {};
        const profile = {
          first_name: typeof um.first_name === 'string' ? um.first_name.trim() : undefined,
          last_name: typeof um.last_name === 'string' ? um.last_name.trim() : undefined,
          phone: typeof um.phone === 'string' ? um.phone.trim() : undefined,
        };
        void completeAuth(data.session, profile);
      });
  }, [isRecoveryLink, mode, navigate, returnTo]);

  useEffect(() => {
    if (!modeParam && !isRecoveryLink) return;
    setMode(isRecoveryLink ? 'reset' : modeParam ?? 'signin');
    setConfirmPassword('');
    setError(null);
    setMessage(null);
  }, [isRecoveryLink, modeParam]);

  const syncProfile = async (
    userId: string,
    profile: { first_name?: string; last_name?: string; phone?: string },
  ) => {
    const payload: Record<string, unknown> = { user_id: userId };
    if (profile.first_name) payload.first_name = profile.first_name;
    if (profile.last_name) payload.last_name = profile.last_name;
    if (profile.phone) payload.phone = profile.phone;

    // Nothing to write.
    if (Object.keys(payload).length <= 1) return;

    // Best-effort: profile is optional and should never block auth.
    try {
      await supabase.from('user_profiles').upsert(payload, { onConflict: 'user_id' });
    } catch {
      // ignore
    }
  };

  const submit = async () => {
    setError(null);
    setMessage(null);

    const trimmedEmail = email.trim();

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
    if (mode === 'signup' && !phone.trim()) {
      setError(t('auth.error.phoneRequired'));
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

        const um: any = data.session.user.user_metadata ?? {};
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
      const ph = phone.trim();
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

  const authTitle =
    mode === 'signin'
      ? t('auth.welcomeBack')
      : mode === 'signup'
        ? t('auth.createAccount')
        : mode === 'forgot'
          ? t('auth.forgot.title')
          : t('auth.reset.title');

  const authSubtitle =
    mode === 'signin'
      ? t('auth.subtitle.signIn')
      : mode === 'signup'
        ? t('auth.subtitle.signUp')
        : mode === 'forgot'
          ? t('auth.forgot.subtitle')
          : t('auth.reset.subtitle');

  const formHeading =
    mode === 'signin'
      ? t('auth.heading.signIn')
      : mode === 'signup'
        ? t('auth.heading.create')
        : mode === 'forgot'
          ? t('auth.forgot.heading')
          : t('auth.reset.heading');

  const formHelper =
    mode === 'signin'
      ? t('auth.helper.signIn')
      : mode === 'signup'
        ? t('auth.helper.signUp')
        : mode === 'forgot'
          ? t('auth.forgot.helper')
          : t('auth.reset.helper');

  const primaryLabel =
    mode === 'signin'
      ? t('header.signIn')
      : mode === 'signup'
        ? t('header.signUp')
        : mode === 'forgot'
          ? t('auth.button.sendReset')
          : t('auth.button.updatePassword');

  const passwordMissing = passwordChecks(password);
  const requiresPassword = mode === 'signin' || mode === 'signup' || mode === 'reset';
  const requiresConfirmPassword = mode === 'signup' || mode === 'reset';
  const primaryDisabled =
    busy ||
    ((mode === 'signin' || mode === 'signup' || mode === 'forgot') && !email.trim()) ||
    (requiresPassword && !password) ||
    ((mode === 'signup' || mode === 'reset') && password !== confirmPassword) ||
    (mode === 'signup' && !phone.trim());

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
              <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
            )}
            {message && (
              <div className="mb-4 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                {message}
              </div>
            )}

            <div className="space-y-4">
              {mode !== 'reset' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.label.email')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                  placeholder={t('auth.placeholder.email')}
                  autoComplete="email"
                />
              </div>
              ) : null}
              {mode === 'signup' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.label.firstName')}</label>
                    <input
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                      placeholder={t('auth.placeholder.firstName')}
                      autoComplete="given-name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.label.lastName')}</label>
                    <input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                      placeholder={t('auth.placeholder.lastName')}
                      autoComplete="family-name"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.label.phone')}</label>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                      placeholder={t('auth.placeholder.phone')}
                      autoComplete="tel"
                      inputMode="tel"
                      required
                    />
                  </div>
                </div>
              ) : null}

              {requiresPassword ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.label.password')}</label>
                <div className="relative">
                  <input
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.label.confirmPassword')}</label>
                  <div className="relative">
                    <input
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
                onClick={submit}
                disabled={primaryDisabled}
                className="w-full bg-[#0f172a] hover:bg-black disabled:bg-gray-300 text-white font-semibold py-3 rounded-full transition-colors"
              >
                {busy ? t('auth.button.working') : primaryLabel}
              </button>

              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
                <button
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
                  onClick={() => {
                    if (isExternalUrl(returnTo)) window.location.assign(returnTo);
                    else navigate('/', { replace: true });
                  }}
                  className="hover:text-gray-900 font-medium"
                  type="button"
                >
                  {t('common.back')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
