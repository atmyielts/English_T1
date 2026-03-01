import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { isExternalUrl, sanitizeReturnTo } from '../lib/returnTo';
import { useI18n } from '../i18n';
import { LanguageSwitcher } from '../components/layout/LanguageSwitcher';

type Mode = 'signin' | 'signup';

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
    return null;
  }, [searchParams]);
  const emailRedirectTo = useMemo(() => `${window.location.origin}/auth`, []);

  const [mode, setMode] = useState<Mode>(modeParam ?? 'signin');
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

    if (lower.includes('email not confirmed')) {
      return t('auth.error.emailNotConfirmed');
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
  };

  useEffect(() => {
    // If already logged in, go straight through.
      supabase.auth.getSession().then(({ data }) => {
        if (!data.session) return;
        const um: any = data.session.user.user_metadata ?? {};
        const profile = {
          first_name: typeof um.first_name === 'string' ? um.first_name.trim() : undefined,
          last_name: typeof um.last_name === 'string' ? um.last_name.trim() : undefined,
          phone: typeof um.phone === 'string' ? um.phone.trim() : undefined,
        };
        void syncProfile(data.session.user.id, profile);
        if (isExternalUrl(returnTo)) window.location.assign(returnTo);
        else navigate(returnTo, { replace: true });
      });
  }, [navigate, returnTo]);

  useEffect(() => {
    if (!modeParam) return;
    setMode(modeParam);
    setConfirmPassword('');
    setError(null);
    setMessage(null);
  }, [modeParam]);

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
    if (mode === 'signup' && password !== confirmPassword) {
      setError(t('auth.error.passwordMismatch'));
      return;
    }
    if (mode === 'signup' && !phone.trim()) {
      setError(t('auth.error.phoneRequired'));
      return;
    }

    setBusy(true);

    try {
      if (mode === 'signin') {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        if (!data.session) throw new Error('No session returned');

        const um: any = data.session.user.user_metadata ?? {};
        const profile = {
          first_name: typeof um.first_name === 'string' ? um.first_name.trim() : undefined,
          last_name: typeof um.last_name === 'string' ? um.last_name.trim() : undefined,
          phone: typeof um.phone === 'string' ? um.phone.trim() : undefined,
        };
        await syncProfile(data.session.user.id, profile);

        if (isExternalUrl(returnTo)) window.location.assign(returnTo);
        else navigate(returnTo, { replace: true });
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
        email,
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
        await syncProfile(data.session.user.id, {
          first_name: fn || undefined,
          last_name: ln || undefined,
          phone: ph || undefined,
        });
        if (isExternalUrl(returnTo)) window.location.assign(returnTo);
        else navigate(returnTo, { replace: true });
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

  return (
    <div className="min-h-screen bg-[#f6f1e8] text-gray-900 relative overflow-hidden flex items-center justify-center p-6">
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
          <h1 className="text-3xl font-bold mt-4">{mode === 'signin' ? t('auth.welcomeBack') : t('auth.createAccount')}</h1>
          <p className="text-sm text-gray-600 mt-2">
            {mode === 'signin'
              ? t('auth.subtitle.signIn')
              : t('auth.subtitle.signUp')}
          </p>
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
              <h2 className="text-2xl font-bold text-gray-900">{mode === 'signin' ? t('auth.heading.signIn') : t('auth.heading.create')}</h2>
              <p className="text-sm text-gray-500 mt-1">
                {mode === 'signin'
                  ? t('auth.helper.signIn')
                  : t('auth.helper.signUp')}
              </p>
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
              </div>

              {mode === 'signup' ? (
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
                disabled={busy || !email || !password || (mode === 'signup' && (!phone.trim() || password !== confirmPassword))}
                className="w-full bg-[#0f172a] hover:bg-black disabled:bg-gray-300 text-white font-semibold py-3 rounded-full transition-colors"
              >
                {busy ? t('auth.button.working') : mode === 'signin' ? t('header.signIn') : t('header.signUp')}
              </button>

              <div className="flex items-center justify-between text-sm text-gray-600">
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
