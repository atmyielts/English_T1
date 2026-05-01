import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  teacherOfficeExperiences,
  teacherOfficePlans,
  teacherOfficeResults,
  teacherOfficeSeats,
  teacherOfficeAssignSeat,
  teacherOfficeTokens,
  tspayCreateTransaction,
  tspayStatus,
  type TeacherOfficeExperience,
  type TeacherOfficePlan,
  type TeacherOfficeResult,
  type TeacherOfficeSeat,
  type TeacherOfficeToken,
} from '../lib/platformClient';
import { useI18n } from '../i18n';
import { LanguageSwitcher } from '../components/layout/LanguageSwitcher';

export const TeacherOfficePage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [experiences, setExperiences] = useState<TeacherOfficeExperience[]>([]);
  const [tokens, setTokens] = useState<TeacherOfficeToken[]>([]);
  const [results, setResults] = useState<TeacherOfficeResult[]>([]);
  const [plans, setPlans] = useState<TeacherOfficePlan[]>([]);
  const [seats, setSeats] = useState<TeacherOfficeSeat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [experienceId, setExperienceId] = useState<string>('');
  const [expiryDays, setExpiryDays] = useState<number>(7);
  const [tokenQuantity, setTokenQuantity] = useState<number>(1);
  const [tokenTransactionId, setTokenTransactionId] = useState<string | null>(null);
  const [tokenStatus, setTokenStatus] = useState<string | null>(null);
  const [tokenPaymentUrl, setTokenPaymentUrl] = useState<string | null>(null);
  const [seatPlanId, setSeatPlanId] = useState<string>('');
  const [seatQuantity, setSeatQuantity] = useState<number>(1);
  const [seatTransactionId, setSeatTransactionId] = useState<string | null>(null);
  const [seatStatus, setSeatStatus] = useState<string | null>(null);
  const [seatPaymentUrl, setSeatPaymentUrl] = useState<string | null>(null);
  const [seatEmails, setSeatEmails] = useState<Record<string, string>>({});

  const toUserMessage = (err: unknown, fallback: string): string => {
    const raw = err instanceof Error ? err.message : String(err ?? fallback);
    if (/invalid jwt|unauthorized|\b401\b/i.test(raw)) return t('teacher.error.sessionExpired');
    if (/rate limit|\b429\b/i.test(raw)) return t('teacher.error.rateLimit');
    if (/failed to fetch|network|cors|blocked by cors/i.test(raw)) return t('teacher.error.network');
    if (/tspay status returned invalid json/i.test(raw)) return t('teacher.error.paymentSync');
    if (/payment not found/i.test(raw)) return t('teacher.error.paymentNotFound');
    if (/popup/i.test(raw)) return raw;

    const explicit = raw.match(/\"error\":\"([^\"]+)\"/i)?.[1];
    if (explicit) return explicit;
    return fallback;
  };

  const getValidToken = async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session?.access_token) return null;

    const { data: userData, error: userError } = await supabase.auth.getUser(session.access_token);
    if (!userError && userData?.user) return session.access_token;

    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed.session?.access_token) {
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        // ignore
      }
      return null;
    }

    return refreshed.session.access_token;
  };

  const refreshAll = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getValidToken();
      if (!token) {
        setError(t('teacher.error.signInAgain'));
        navigate(`/auth?returnTo=${encodeURIComponent('/teacher')}`, { replace: true });
        return;
      }

      const [expRes, tokenRes, resultRes, planRes, seatRes] = await Promise.all([
        teacherOfficeExperiences(token),
        teacherOfficeTokens(token),
        teacherOfficeResults(token),
        teacherOfficePlans(token),
        teacherOfficeSeats(token),
      ]);
      setExperiences(expRes.experiences || []);
      setTokens(tokenRes.tokens || []);
      setResults(resultRes.results || []);
      setPlans(planRes.plans || []);
      setSeats(seatRes.seats || []);
      if (!experienceId && expRes.experiences?.length) {
        setExperienceId(expRes.experiences[0].id);
      }
      if (!seatPlanId && planRes.plans?.length) {
        setSeatPlanId(planRes.plans[0].id);
      }
    } catch (err) {
      setError(toUserMessage(err, t('teacher.error.load')));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshAll();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) void refreshAll();
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createToken = async () => {
    const token = await getValidToken();
    if (!token || !experienceId) {
      setError(t('teacher.error.signInContinue'));
      navigate(`/auth?returnTo=${encodeURIComponent('/teacher')}`, { replace: true });
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await tspayCreateTransaction(token, {
        purchase_type: 'token_pack',
        experience_id: experienceId,
        quantity: tokenQuantity,
        expires_in_days: expiryDays,
        description: `Candidate IDs (${tokenQuantity})`,
      });
      setTokenTransactionId(res.transaction_id);
      setTokenPaymentUrl(res.payment_url);
      setTokenStatus('pending');
      if (res.payment_url) {
        const popup = window.open(res.payment_url, '_blank', 'noopener,noreferrer');
        if (!popup) {
          setError(t('teacher.error.popupBlocked'));
        } else {
          setSuccess(t('teacher.success.popupOpened'));
        }
      } else {
        setTokenStatus(res.status ?? 'paid');
        await refreshAll();
        setSuccess(t('teacher.success.tokensGenerated'));
      }
    } catch (err) {
      setError(toUserMessage(err, t('teacher.error.createToken')));
    } finally {
      setLoading(false);
    }
  };

  const checkTokenPayment = async () => {
    if (!tokenTransactionId) return;
    const token = await getValidToken();
    if (!token) {
      setError(t('teacher.error.signInContinue'));
      navigate(`/auth?returnTo=${encodeURIComponent('/teacher')}`, { replace: true });
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await tspayStatus(token, tokenTransactionId);
      setTokenStatus(res.status);
      if (['paid', 'success', 'completed'].includes(res.status.trim().toLowerCase())) {
        setTokenTransactionId(null);
        setTokenPaymentUrl(null);
        setTokenStatus('paid');
        await refreshAll();
        setSuccess(t('teacher.success.tokensGenerated'));
      }
    } catch (err) {
      setError(toUserMessage(err, t('teacher.error.checkToken')));
    } finally {
      setLoading(false);
    }
  };

  const createSeatPurchase = async () => {
    const token = await getValidToken();
    if (!token || !seatPlanId) {
      setError(t('teacher.error.signInContinue'));
      navigate(`/auth?returnTo=${encodeURIComponent('/teacher')}`, { replace: true });
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await tspayCreateTransaction(token, {
        purchase_type: 'seat_pack',
        plan_id: seatPlanId,
        seat_count: seatQuantity,
        description: `Seat pack (${seatQuantity})`,
      });
      setSeatTransactionId(res.transaction_id);
      setSeatStatus(null);
      setSeatPaymentUrl(res.payment_url);
      setSeatStatus('pending');
      if (res.payment_url) {
        const popup = window.open(res.payment_url, '_blank', 'noopener,noreferrer');
        if (!popup) {
          setError(t('teacher.error.popupBlocked'));
        } else {
          setSuccess(t('teacher.success.popupOpened'));
        }
      } else {
        setSeatStatus(res.status ?? 'paid');
        await refreshAll();
        setSuccess(t('teacher.success.seatsAdded'));
      }
    } catch (err) {
      setError(toUserMessage(err, t('teacher.error.createSeat')));
    } finally {
      setLoading(false);
    }
  };

  const checkSeatPayment = async () => {
    if (!seatTransactionId) return;
    const token = await getValidToken();
    if (!token) {
      setError(t('teacher.error.signInContinue'));
      navigate(`/auth?returnTo=${encodeURIComponent('/teacher')}`, { replace: true });
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await tspayStatus(token, seatTransactionId);
      setSeatStatus(res.status);
      if (['paid', 'success', 'completed'].includes(res.status.trim().toLowerCase())) {
        setSeatTransactionId(null);
        setSeatPaymentUrl(null);
        setSeatStatus('paid');
        await refreshAll();
        setSuccess(t('teacher.success.seatsAdded'));
      }
    } catch (err) {
      setError(toUserMessage(err, t('teacher.error.checkSeat')));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!tokenTransactionId) return;
    let cancelled = false;
    const interval = window.setInterval(async () => {
      if (cancelled) return;
      await checkTokenPayment();
    }, 6000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [tokenTransactionId]);

  useEffect(() => {
    if (!seatTransactionId) return;
    let cancelled = false;
    const interval = window.setInterval(async () => {
      if (cancelled) return;
      await checkSeatPayment();
    }, 6000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [seatTransactionId]);

  const assignSeat = async (seatId: string) => {
    const email = (seatEmails[seatId] ?? '').trim();
    if (!email) return;
    const token = await getValidToken();
    if (!token) {
      setError(t('teacher.error.signInContinue'));
      navigate(`/auth?returnTo=${encodeURIComponent('/teacher')}`, { replace: true });
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await teacherOfficeAssignSeat(token, { seat_id: seatId, email });
      setSeatEmails((prev) => ({ ...prev, [seatId]: '' }));
      await refreshAll();
      setSuccess(t('teacher.success.seatAssigned'));
    } catch (err) {
      setError(toUserMessage(err, t('teacher.error.assignSeat')));
    } finally {
      setLoading(false);
    }
  };

  const experienceOptions = useMemo(() => {
    return experiences.map((exp) => ({
      id: exp.id,
      label: exp.products?.name ? `${exp.products.name} • ${exp.name}` : exp.name,
    }));
  }, [experiences]);

  const selectedExperience = experiences.find((exp) => exp.id === experienceId) ?? null;
  const selectedPlan = plans.find((plan) => plan.id === seatPlanId) ?? null;

  return (
    <div className="min-h-screen bg-[#f7f1e7] text-[#111827]">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="text-xs font-semibold tracking-wider uppercase text-gray-600">{t('teacher.title')}</div>
            <h1 className="text-3xl font-bold">{t('teacher.subtitle')}</h1>
            <p className="mt-2 text-sm text-gray-600">
              {t('teacher.header.desc')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 rounded-full border border-gray-900 bg-white/80 text-sm font-semibold"
            >
              {t('teacher.button.backPlatform')}
            </button>
            <button
              onClick={() => navigate('/contact')}
              className="px-4 py-2 rounded-full border border-gray-900 bg-white/80 text-sm font-semibold"
            >
              {t('common.contactSupport')}
            </button>
            <button
              onClick={refreshAll}
              className="px-4 py-2 rounded-full border border-gray-900 bg-white/80 text-sm font-semibold"
            >
              {t('common.refresh')}
            </button>
            <LanguageSwitcher compact />
          </div>
        </div>

        {error ? (
          <div className="mt-5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
        ) : null}
        {success ? (
          <div className="mt-5 text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg p-3">{success}</div>
        ) : null}

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-white/80 border border-gray-900 rounded-3xl p-6 shadow-sm">
              <h2 className="text-lg font-bold">{t('teacher.section.createIds')}</h2>
              <div className="mt-4 space-y-4">
              <label className="text-sm font-semibold text-gray-700">
                {t('teacher.label.activeTest')}
                <select
                  value={experienceId}
                  onChange={(e) => setExperienceId(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm bg-white"
                >
                  {experienceOptions.map((exp) => (
                    <option key={exp.id} value={exp.id}>
                      {exp.label}
                    </option>
                  ))}
                </select>
              </label>
              {selectedExperience ? (
                <div className="text-xs text-gray-500">
                  {t('teacher.label.pricePerCandidate')}{' '}
                  <span className="font-semibold text-gray-800">
                    {selectedExperience.price_amount
                      ? `${selectedExperience.price_amount.toLocaleString()} ${selectedExperience.price_currency ?? 'UZS'}`
                      : t('teacher.value.notSet')}
                  </span>
                </div>
              ) : null}
              <label className="text-sm font-semibold text-gray-700">
                {t('teacher.label.expiryDays')}
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(Number(e.target.value))}
                  className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm font-semibold text-gray-700">
                {t('teacher.label.quantity')}
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={tokenQuantity}
                  onChange={(e) => setTokenQuantity(Number(e.target.value))}
                  className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <button
                onClick={createToken}
                disabled={loading || !experienceId || !selectedExperience?.price_amount}
                className="w-full px-4 py-3 rounded-full bg-gray-900 text-white font-semibold disabled:opacity-60"
              >
                {loading ? t('teacher.button.creating') : tokenTransactionId ? t('teacher.button.awaitingPayment') : t('teacher.button.payGenerate')}
              </button>
              {tokenTransactionId ? (
                <button
                  onClick={checkTokenPayment}
                  disabled={loading}
                  className="w-full px-4 py-2 rounded-full border border-gray-900 bg-white/80 text-sm font-semibold"
                >
                  {t('teacher.button.checkPayment')} {tokenStatus ? `(${tokenStatus})` : ''}
                </button>
              ) : null}
              {tokenTransactionId && tokenPaymentUrl ? (
                <button
                  onClick={() => window.open(tokenPaymentUrl, '_blank', 'noopener,noreferrer')}
                  className="w-full px-4 py-2 rounded-full border border-gray-900 bg-white/80 text-sm font-semibold"
                >
                  {t('teacher.button.openPayment')}
                </button>
              ) : null}
              <p className="text-xs text-gray-500">
                {t('teacher.note.singleUse')}
              </p>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white/80 border border-gray-900 rounded-3xl p-6 shadow-sm">
              <h2 className="text-lg font-bold">{t('teacher.section.seats')}</h2>
              <p className="mt-2 text-sm text-gray-600">{t('teacher.section.seatsDesc')}</p>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="text-sm font-semibold text-gray-700 md:col-span-2">
                  {t('teacher.label.plan')}
                  <select
                    value={seatPlanId}
                    onChange={(e) => setSeatPlanId(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm bg-white"
                  >
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.products?.name ? `${plan.products.name} • ${plan.name}` : plan.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-semibold text-gray-700">
                  {t('teacher.label.seats')}
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={seatQuantity}
                    onChange={(e) => setSeatQuantity(Number(e.target.value))}
                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>
              {selectedPlan ? (
                <div className="text-xs text-gray-500 mt-2">
                  {t('teacher.label.perSeat', {
                    amount: `${selectedPlan.amount.toLocaleString()} ${selectedPlan.currency}`,
                  })}
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={createSeatPurchase}
                  disabled={loading || !seatPlanId}
                  className="px-4 py-2 rounded-full bg-gray-900 text-white text-sm font-semibold disabled:opacity-60"
                >
                  {seatTransactionId ? t('teacher.button.awaitingPayment') : t('teacher.button.buySeats')}
                </button>
                {seatTransactionId ? (
                  <button
                    onClick={checkSeatPayment}
                    disabled={loading}
                    className="px-4 py-2 rounded-full border border-gray-900 bg-white/80 text-sm font-semibold"
                  >
                    {t('teacher.button.checkPayment')} {seatStatus ? `(${seatStatus})` : ''}
                  </button>
                ) : null}
                {seatTransactionId && seatPaymentUrl ? (
                  <button
                    onClick={() => window.open(seatPaymentUrl, '_blank', 'noopener,noreferrer')}
                    className="px-4 py-2 rounded-full border border-gray-900 bg-white/80 text-sm font-semibold"
                  >
                    {t('teacher.button.openPayment')}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="bg-white/80 border border-gray-900 rounded-3xl p-6 shadow-sm">
              <h2 className="text-lg font-bold">{t('teacher.table.activeIds')}</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-gray-600">
                    <tr>
                      <th className="text-left py-2">{t('teacher.table.candidateId')}</th>
                      <th className="text-left py-2">{t('teacher.table.test')}</th>
                      <th className="text-left py-2">{t('teacher.table.status')}</th>
                      <th className="text-left py-2">{t('teacher.table.expires')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tokens.map((token) => (
                      <tr key={token.id} className="border-t border-gray-100">
                        <td className="py-2 font-semibold text-gray-900">{token.token_code}</td>
                        <td className="py-2 text-gray-700">{token.experiences?.name ?? t('teacher.fallback.test')}</td>
                        <td className="py-2 text-gray-700">{token.status}</td>
                        <td className="py-2 text-gray-600">
                          {new Date(token.expires_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                    {tokens.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-4 text-sm text-gray-500">
                          {t('teacher.table.emptyIds')}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white/80 border border-gray-900 rounded-3xl p-6 shadow-sm">
              <h2 className="text-lg font-bold">{t('teacher.table.seatLicenses')}</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-gray-600">
                    <tr>
                      <th className="text-left py-2">{t('teacher.label.plan')}</th>
                      <th className="text-left py-2">{t('teacher.table.status')}</th>
                      <th className="text-left py-2">{t('teacher.table.assignedTo')}</th>
                      <th className="text-left py-2">{t('teacher.table.expires')}</th>
                      <th className="text-left py-2">{t('teacher.table.assign')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seats.map((seat) => (
                      <tr key={seat.id} className="border-t border-gray-100">
                        <td className="py-2 text-gray-700">{seat.plans?.name ?? t('teacher.fallback.plan')}</td>
                        <td className="py-2 text-gray-700">{seat.status}</td>
                        <td className="py-2 text-gray-700">{seat.assigned_user?.email ?? '—'}</td>
                        <td className="py-2 text-gray-600">{new Date(seat.expires_at).toLocaleDateString()}</td>
                        <td className="py-2">
                          {seat.status === 'unassigned' ? (
                            <div className="flex flex-col sm:flex-row gap-2">
                              <input
                                value={seatEmails[seat.id] ?? ''}
                                onChange={(e) =>
                                  setSeatEmails((prev) => ({ ...prev, [seat.id]: e.target.value }))
                                }
                                placeholder={t('teacher.placeholder.studentEmail')}
                                className="w-full sm:w-48 rounded-lg border border-gray-300 px-2 py-1 text-xs"
                              />
                              <button
                                onClick={() => assignSeat(seat.id)}
                                disabled={loading}
                                className="px-2 py-1 rounded-lg border border-gray-900 bg-white/80 text-xs font-semibold"
                              >
                                {t('teacher.table.assign')}
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-500">{t('teacher.status.assigned')}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {seats.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-4 text-sm text-gray-500">
                          {t('teacher.table.emptySeats')}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
                <div className="text-xs text-gray-500 mt-3">
                  {t('teacher.note.studentAccount')}
                </div>
              </div>
            </div>

            <div className="bg-white/80 border border-gray-900 rounded-3xl p-6 shadow-sm">
              <h2 className="text-lg font-bold">{t('teacher.table.results')}</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-gray-600">
                    <tr>
                      <th className="text-left py-2">{t('teacher.table.candidate')}</th>
                      <th className="text-left py-2">{t('teacher.table.test')}</th>
                      <th className="text-left py-2">{t('teacher.table.status')}</th>
                      <th className="text-left py-2">{t('teacher.table.band')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((row) => (
                      <tr key={row.id} className="border-t border-gray-100">
                        <td className="py-2">
                          <div className="font-semibold text-gray-900">{row.candidate_name || t('teacher.fallback.candidate')}</div>
                          <div className="text-xs text-gray-500">{row.email}</div>
                        </td>
                        <td className="py-2 text-gray-700">{row.experience_name ?? t('teacher.fallback.test')}</td>
                        <td className="py-2 text-gray-700">{row.session_status ?? row.registration_status}</td>
                        <td className="py-2 text-gray-900 font-semibold">{row.overall_score ?? row.overall_band ?? '—'}</td>
                      </tr>
                    ))}
                    {results.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-4 text-sm text-gray-500">
                          {t('teacher.table.emptyResults')}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

