import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { buildCandidateHandoffUrl, candidateEntry } from '../lib/platformClient';
import { useI18n } from '../i18n';
import { LanguageSwitcher } from '../components/layout/LanguageSwitcher';
import { SeoHead } from '../components/seo/SeoHead';

export const CandidateEntryPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handoffUrl, setHandoffUrl] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [form, setForm] = useState({
    token_code: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
  });

  const toUserMessage = (err: unknown): string => {
    const raw = err instanceof Error ? err.message : String(err ?? t('candidate.error.startFailed'));
    if (/already been used/i.test(raw)) return t('candidate.error.used');
    if (/not found/i.test(raw)) return t('candidate.error.notFound');
    if (/expired/i.test(raw)) return t('candidate.error.expired');
    if (/not ready/i.test(raw)) return t('candidate.error.notReady');
    if (/first and last name/i.test(raw)) return t('candidate.error.nameRequired');
    if (/email is required/i.test(raw)) return t('candidate.error.emailRequired');
    if (/phone is required/i.test(raw)) return t('candidate.error.phoneRequired');
    if (/do not match the existing account/i.test(raw)) {
      return t('candidate.error.detailsMismatch');
    }
    if (/failed to fetch|network|cors/i.test(raw)) return t('candidate.error.network');
    if (/invalid jwt|unauthorized|\b401\b/i.test(raw)) return t('candidate.error.sessionExpired');
    if (/exam app url is not configured/i.test(raw)) return t('candidate.error.examRouteMissing');
    return t('candidate.error.startFailed');
  };

  const onChange = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('schood:candidate_handoff_url');
    }
  }, []);

  useEffect(() => {
    const code = new URLSearchParams(location.search).get('code')?.trim().toUpperCase();
    if (code) setForm((prev) => ({ ...prev, token_code: code }));
  }, [location.search]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await candidateEntry({
        token_code: form.token_code,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone,
      });

      const target = buildCandidateHandoffUrl(res, { launchKind: 'candidate_id' });
      setHandoffUrl(target);
      window.location.assign(target);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f1e7] text-[#111827]">
      <SeoHead
        title="Schood Candidate Entry"
        description="Candidate exam entry page for Schood."
        path="/candidate"
        robots="noindex, nofollow"
      />

      <div className="max-w-4xl mx-auto px-6 pt-12 pb-24">
        <div className="rounded-3xl border border-gray-900/20 bg-white/70 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-semibold tracking-wider uppercase text-gray-600">{t('candidate.header.label')}</div>
            <div className="hidden sm:grid grid-cols-2 gap-2 w-full sm:w-auto">
              <button
                onClick={() => navigate('/contact')}
                className="w-full sm:w-auto px-4 py-2 rounded-full border border-gray-900 bg-white/80 text-sm font-semibold"
              >
                {t('common.contact')}
              </button>
              <button
                onClick={() => navigate('/')}
                className="w-full sm:w-auto px-4 py-2 rounded-full border border-gray-900 bg-white/80 text-sm font-semibold"
              >
                {t('candidate.header.backHome')}
              </button>
            </div>
            <div className="hidden sm:block">
              <LanguageSwitcher compact />
            </div>
            <button
              type="button"
              className="sm:hidden w-full px-4 py-2 rounded-full border border-gray-900 bg-white/80 text-sm font-semibold"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-expanded={mobileMenuOpen}
              aria-controls="candidate-mobile-actions"
            >
              {t('common.menu')}
            </button>
          </div>
          {mobileMenuOpen ? (
            <div id="candidate-mobile-actions" className="sm:hidden mt-3 rounded-2xl border border-gray-900/20 bg-white/90 p-2 space-y-2">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate('/contact');
                }}
                className="w-full text-left px-3 py-2 rounded-xl border border-gray-900 bg-white text-sm font-semibold"
              >
                {t('common.contact')}
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate('/');
                }}
                className="w-full text-left px-3 py-2 rounded-xl border border-gray-900 bg-white text-sm font-semibold"
              >
                {t('candidate.header.backHome')}
              </button>
              <LanguageSwitcher compact className="w-full justify-between px-1 py-1" />
            </div>
          ) : null}
        </div>

        <div className="mt-6 bg-white/80 border border-gray-900 rounded-3xl shadow-sm p-8">
          <h1 className="text-3xl font-bold">{t('candidate.form.title')}</h1>
          <p className="mt-2 text-sm text-gray-600">
            {t('candidate.form.desc')}
          </p>

          {error ? (
            <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
          ) : null}
          {handoffUrl ? (
            <div className="mt-4 text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg p-3 flex flex-col gap-3">
              <div>{t('candidate.handoff.message')}</div>
              <button
                type="button"
                onClick={() => window.location.assign(handoffUrl)}
                className="self-start px-4 py-2 rounded-full border border-blue-700 text-blue-900 font-semibold bg-white"
              >
                {t('candidate.handoff.button')}
              </button>
            </div>
          ) : null}

          <form onSubmit={submit} className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="md:col-span-2 text-sm font-semibold text-gray-700">
              {t('candidate.form.candidateId')}
              <input
                value={form.token_code}
                onChange={onChange('token_code')}
                required
                className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                placeholder={t('candidate.form.candidateIdPlaceholder')}
              />
            </label>
            <label className="text-sm font-semibold text-gray-700">
              {t('candidate.form.firstName')}
              <input
                value={form.first_name}
                onChange={onChange('first_name')}
                required
                className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                placeholder={t('candidate.form.firstNamePlaceholder')}
              />
            </label>
            <label className="text-sm font-semibold text-gray-700">
              {t('candidate.form.lastName')}
              <input
                value={form.last_name}
                onChange={onChange('last_name')}
                required
                className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                placeholder={t('candidate.form.lastNamePlaceholder')}
              />
            </label>
            <label className="text-sm font-semibold text-gray-700">
              {t('candidate.form.email')}
              <input
                type="email"
                value={form.email}
                onChange={onChange('email')}
                required
                className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                placeholder={t('candidate.form.emailPlaceholder')}
              />
            </label>
            <label className="text-sm font-semibold text-gray-700">
              {t('candidate.form.phone')}
              <input
                value={form.phone}
                onChange={onChange('phone')}
                required
                className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                placeholder={t('candidate.form.phonePlaceholder')}
              />
            </label>

            <div className="md:col-span-2 flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-3 rounded-full bg-gray-900 text-white font-semibold disabled:opacity-60"
              >
                {loading ? t('candidate.form.starting') : t('candidate.form.start')}
              </button>
              <div className="text-xs text-gray-500 flex items-center">
                {t('candidate.form.confirm')}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
