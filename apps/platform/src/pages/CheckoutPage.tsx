import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  billingPlansList,
  billingQuote,
  getMe,
  tspayCreateTransaction,
  tspayStatus,
  type BillingPlan,
  type BillingQuoteResponse,
} from '../lib/platformClient';
import { isExternalUrl, sanitizeReturnTo } from '../lib/returnTo';
import { useI18n } from '../i18n';
import { LanguageSwitcher } from '../components/layout/LanguageSwitcher';

type ProductRow = {
  id: string;
  name: string;
  metadata: Record<string, unknown> | null;
};

const slugify = (value: string | null): string =>
  (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const productSlug = (p: ProductRow): string => {
  const meta: any = p.metadata ?? {};
  const raw = typeof meta.slug === 'string' ? meta.slug : p.name;
  return slugify(raw);
};

// Server returns TsPay payment status (e.g. "paid", "pending"), not API-level "success".
const isSuccessStatus = (status: string): boolean => ['paid', 'success', 'completed'].includes(status.trim().toLowerCase());

const formatMoney = (amount: number, currency: string): string => {
  if (currency.toUpperCase() === 'UZS') return `${amount.toLocaleString()} UZS`;
  return `${amount.toLocaleString()} ${currency}`;
};

export const CheckoutPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const quoteSeq = useRef(0);

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const returnTo = useMemo(() => sanitizeReturnTo(searchParams.get('returnTo')), [searchParams]);
  const planId = useMemo(() => searchParams.get('plan_id'), [searchParams]);
  const productIdParam = useMemo(() => searchParams.get('product_id'), [searchParams]);
  const productParam = useMemo(() => searchParams.get('product'), [searchParams]);

  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [entitled, setEntitled] = useState<boolean | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<BillingPlan | null>(null);
  const [resolvedProductId, setResolvedProductId] = useState<string | null>(productIdParam);

  const [couponCode, setCouponCode] = useState<string>('');
  const [applyCredit, setApplyCredit] = useState<boolean>(true);
  const [referralCode, setReferralCode] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem('schood:referral_code') ?? '';
  });
  const [quote, setQuote] = useState<BillingQuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [checkoutPricing, setCheckoutPricing] = useState<{
    amount: number;
    currency: string;
    original_amount: number;
    discount_amount: number;
    credit_amount?: number;
    referral_discount_amount?: number;
    final_amount?: number;
    coupon_code: string | null;
  } | null>(null);

  const loadEntitlement = async (accessToken: string, pid: string | null, force?: boolean) => {
    if (!pid) {
      setEntitled(false);
      return false;
    }
    const me = await getMe(accessToken, { force });
    const ok = me.entitlements.some((e) => e.resource_type === 'product' && e.resource_id === pid);
    setEntitled(ok);
    return ok;
  };

  useEffect(() => {
    const ref = searchParams.get('ref')?.trim().toUpperCase();
    if (ref) {
      window.localStorage.setItem('schood:referral_code', ref);
      setReferralCode(ref);
    }
  }, [searchParams]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;

        let pid = productIdParam ?? null;
        if (!pid && productParam) {
          const { data: products, error: prodErr } = await supabase
            .from('products')
            .select('id,name,metadata')
            .eq('status', 'active');
          if (prodErr) throw prodErr;
          const found = (products as ProductRow[]).find((p) => productSlug(p) === slugify(productParam)) ?? null;
          pid = found?.id ?? null;
        }

        setResolvedProductId(pid);

        if (planId && pid) {
          const res = await billingPlansList(data.session.access_token, pid);
          const plan = (res.plans ?? []).find((p) => p.id === planId) ?? null;
          setSelectedPlan(plan);
        }

        await loadEntitlement(data.session.access_token, pid);
      } catch (e) {
        setError(e instanceof Error ? e.message : t('checkout.error.load'));
        setEntitled(false);
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, [planId, productIdParam, productParam]);

  useEffect(() => {
    const seq = ++quoteSeq.current;
    let cancelled = false;

    const run = async () => {
      setQuote(null);
      setQuoteError(null);

      if (!planId) return;
      const code = couponCode.trim();
      if (!code) return;

      const { data } = await supabase.auth.getSession();
      if (!data.session) return;

      try {
        const q = await billingQuote(data.session.access_token, planId, code);
        if (cancelled || seq !== quoteSeq.current) return;
        setQuote(q);
      } catch (e) {
        if (cancelled || seq !== quoteSeq.current) return;
        const raw = e instanceof Error ? e.message : 'Invalid coupon';
        const match = raw.match(/"error"\s*:\s*"([^"]+)"/);
        setQuoteError(match?.[1] ?? raw);
      }
    };

    const t = window.setTimeout(() => void run(), 350);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [couponCode, planId]);

  useEffect(() => {
    if (loading) return;
    if (!planId || !resolvedProductId) {
      const qs = new URLSearchParams();
      if (productParam) qs.set('product', productParam);
      qs.set('returnTo', returnTo);
      navigate(`/pricing?${qs.toString()}`, { replace: true });
    }
  }, [loading, navigate, planId, productParam, resolvedProductId, returnTo]);

  const continueTo = (target: string) => {
    if (isExternalUrl(target)) {
      navigate(`/auth?returnTo=${encodeURIComponent(target)}`, { replace: true });
      return;
    }
    navigate(target, { replace: true });
  };

  const createCheckout = async () => {
    if (!planId) return;

    setError(null);
    setStatus(null);
    setBusy(true);

    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        const qs = new URLSearchParams({ plan_id: planId, returnTo });
        if (productParam) qs.set('product', productParam);
        navigate(`/auth?returnTo=${encodeURIComponent(`/checkout?${qs.toString()}`)}`, { replace: true });
        return;
      }

      const description = selectedPlan?.name ? `Plan: ${selectedPlan.name}` : t('checkout.selectedPlan');

      const res = await tspayCreateTransaction(data.session.access_token, {
        plan_id: planId,
        description,
        metadata: { source: 'checkout_page' },
        coupon_code: couponCode.trim() || null,
        apply_credit: applyCredit,
        referral_code: referralCode.trim() || null,
      });

      setTransactionId(res.transaction_id);
      setPaymentUrl(res.payment_url);
      setCheckoutPricing({
        amount: res.amount,
        currency: res.currency,
        original_amount: res.original_amount,
        discount_amount: res.discount_amount,
        credit_amount: res.credit_amount ?? 0,
        referral_discount_amount: res.referral_discount_amount ?? 0,
        final_amount: res.final_amount ?? res.amount,
        coupon_code: res.coupon_code,
      });

      if (res.payment_url) {
        window.location.assign(res.payment_url);
        return;
      }

      if (isSuccessStatus(res.status ?? '')) {
        setStatus(res.status ?? 'paid');
        const ok = await loadEntitlement(data.session.access_token, resolvedProductId ?? null, true);
        if (ok) {
          continueTo(returnTo);
        }
        return;
      }

      setError(t('checkout.error.redirectMissing'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('checkout.error.unknown');
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const checkStatus = async () => {
    if (!transactionId) return;

    setError(null);
    setBusy(true);

    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        const qs = new URLSearchParams({ plan_id: planId ?? '', returnTo });
        if (productParam) qs.set('product', productParam);
        navigate(`/auth?returnTo=${encodeURIComponent(`/checkout?${qs.toString()}`)}`, { replace: true });
        return;
      }

      const res = await tspayStatus(data.session.access_token, transactionId);
      setStatus(res.status);

      if (isSuccessStatus(res.status)) {
        const ok = await loadEntitlement(data.session.access_token, resolvedProductId ?? null, true);
        if (ok) {
          continueTo(returnTo);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('checkout.error.unknown');
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!transactionId) return;
    if (status && isSuccessStatus(status)) return;

    let cancelled = false;
    const interval = window.setInterval(async () => {
      if (cancelled) return;
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;
        const res = await tspayStatus(data.session.access_token, transactionId);
        if (cancelled) return;
        setStatus(res.status);
        if (isSuccessStatus(res.status)) {
          const ok = await loadEntitlement(data.session.access_token, resolvedProductId ?? null, true);
          if (ok) {
            continueTo(returnTo);
          }
        }
      } catch {
        // ignore polling errors
      }
    }, 6000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [transactionId, status, resolvedProductId, returnTo, navigate]);

  const signOut = async () => {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // ignore sign-out failures
    }
    navigate('/auth', { replace: true });
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">{t('checkout.loading')}</div>;
  }

  const pricing = quote?.pricing
    ? quote.pricing
    : selectedPlan
      ? { original_amount: selectedPlan.amount, discount_amount: 0, final_amount: selectedPlan.amount }
      : null;

  const backQuery = new URLSearchParams();
  if (productParam) backQuery.set('product', productParam);
  backQuery.set('returnTo', returnTo);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-3xl bg-white border border-gray-200 rounded-3xl shadow-sm p-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <div className="text-xs font-semibold tracking-wider uppercase text-emerald-700 mb-2">{t('checkout.badge')}</div>
            <h1 className="text-2xl font-bold text-gray-900">{t('checkout.title')}</h1>
            <p className="text-sm text-gray-500 mt-1">{t('checkout.subtitle')}</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:justify-end">
            <button
              onClick={() => navigate(`/pricing?${backQuery.toString()}`, { replace: true })}
              className="w-full sm:w-auto px-3 py-2 text-sm font-medium rounded-xl border border-gray-200 hover:bg-gray-50"
            >
              {t('common.back')}
            </button>
            <button onClick={signOut} className="w-full sm:w-auto px-3 py-2 text-sm font-medium rounded-xl border border-gray-200 hover:bg-gray-50">
              {t('common.signOut')}
            </button>
            <button
              onClick={() => navigate('/contact')}
              className="w-full sm:w-auto px-3 py-2 text-sm font-medium rounded-xl border border-gray-200 hover:bg-gray-50"
            >
              {t('checkout.contact')}
            </button>
            <LanguageSwitcher compact className="w-full sm:w-auto justify-between rounded-xl border border-gray-200 bg-white px-3 py-1.5" />
          </div>
        </div>

        {selectedPlan ? (
          <div className="mb-6 bg-gray-50 border border-gray-200 rounded-2xl p-4">
            <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">{t('checkout.selectedPlan')}</div>
            <div className="mt-1 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <div className="font-bold text-gray-900">{selectedPlan.name}</div>
                <div className="text-sm text-gray-600 mt-1">
                  {pricing ? (
                    <div className="space-y-1">
                      <div className="font-semibold text-gray-900">{formatMoney(pricing.final_amount, selectedPlan.currency)}</div>
                      {pricing.discount_amount > 0 ? (
                        <div className="text-xs text-gray-600">
                          <span className="line-through">{formatMoney(pricing.original_amount, selectedPlan.currency)}</span>
                          <span className="mx-2">-</span>
                          <span className="font-semibold">{t('checkout.discountOff', { amount: formatMoney(pricing.discount_amount, selectedPlan.currency) })}</span>
                        </div>
                      ) : (
                        <div className="text-xs text-gray-600">{formatMoney(pricing.original_amount, selectedPlan.currency)}</div>
                      )}
                    </div>
                  ) : (
                    formatMoney(selectedPlan.amount, selectedPlan.currency)
                  )}
                  {selectedPlan.duration_days ? ` - ${t('checkout.daysAccess', { days: selectedPlan.duration_days })}` : null}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">{t('checkout.coupon.label')}</label>
                <input
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 font-mono"
                  placeholder={t('checkout.coupon.placeholder')}
                />
                {quote?.coupon ? (
                  <div className="mt-2 text-xs text-emerald-700">
                    {t('checkout.coupon.applied', { code: quote.coupon.code })}
                  </div>
                ) : null}
                {quoteError ? <div className="mt-2 text-xs text-red-700">{quoteError}</div> : null}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{t('checkout.pay.label')}</label>
                <div className="px-3 py-2 border border-gray-200 rounded-xl bg-white text-sm font-bold text-gray-900">
                  {pricing ? formatMoney(pricing.final_amount, selectedPlan.currency) : '--'}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="md:col-span-2 block text-xs font-semibold text-gray-600">
                Referral code
                <input
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 font-mono"
                  placeholder="Optional"
                />
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700">
                <input type="checkbox" checked={applyCredit} onChange={(e) => setApplyCredit(e.target.checked)} />
                Apply credit
              </label>
            </div>
          </div>
        ) : (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-900">
            {t('checkout.planNotFound')}
          </div>
        )}

        {entitled === true ? (
          <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-emerald-900">
            <div className="font-semibold">{t('checkout.accessActiveTitle')}</div>
            <div className="text-sm opacity-80 mt-1">{t('checkout.accessActiveHint')}</div>
          </div>
        ) : null}

        {error ? <div className="mb-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div> : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border border-gray-200 rounded-2xl p-6">
            <div className="text-sm font-semibold text-gray-900">{t('checkout.step1.title')}</div>
            <div className="text-sm text-gray-500 mt-1">{t('checkout.step1.desc')}</div>

            <button
              onClick={createCheckout}
              disabled={busy || !selectedPlan}
              className="mt-6 w-full bg-gray-900 hover:bg-black disabled:bg-gray-300 text-white font-semibold py-2.5 rounded-xl transition-colors"
            >
              {busy ? t('checkout.working') : t('checkout.step1.button')}
            </button>
          </div>

          <div className="border border-gray-200 rounded-2xl p-6">
            <div className="text-sm font-semibold text-gray-900">{t('checkout.step2.title')}</div>
            <div className="text-sm text-gray-500 mt-1">{t('checkout.step2.desc')}</div>

            <div className="mt-4 space-y-3 text-sm">
              {checkoutPricing ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
                  <div className="font-semibold text-gray-900">{t('checkout.summary.title')}</div>
                  <div className="mt-1">
                    {t('checkout.summary.paid', { amount: formatMoney(checkoutPricing.amount, checkoutPricing.currency) })}
                  </div>
                  {checkoutPricing.discount_amount > 0 ? (
                    <div className="mt-1">
                      {t('checkout.summary.discount', { amount: formatMoney(checkoutPricing.discount_amount, checkoutPricing.currency) })}
                      {checkoutPricing.coupon_code ? (
                        <>
                          {' '}
                          (<span className="font-mono">{checkoutPricing.coupon_code}</span>)
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  {(checkoutPricing.referral_discount_amount ?? 0) > 0 ? (
                    <div className="mt-1">
                      Referral discount: {formatMoney(checkoutPricing.referral_discount_amount ?? 0, checkoutPricing.currency)}
                    </div>
                  ) : null}
                  {(checkoutPricing.credit_amount ?? 0) > 0 ? (
                    <div className="mt-1">
                      Credit applied: {formatMoney(checkoutPricing.credit_amount ?? 0, checkoutPricing.currency)}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div>
                <div className="text-xs text-gray-500 mb-1">{t('checkout.field.transactionId')}</div>
                <div className="font-mono text-xs bg-gray-50 border border-gray-200 rounded p-2 break-all">
                  {transactionId ?? t('checkout.payment.notCreated')}
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">{t('checkout.field.paymentUrl')}</div>
                {paymentUrl ? (
                  <a href={paymentUrl} target="_blank" rel="noreferrer" className="text-emerald-700 hover:text-emerald-900 underline break-all">
                    {t('checkout.payment.open')}
                  </a>
                ) : (
                  <div className="text-gray-400">{t('checkout.payment.notCreated')}</div>
                )}
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">{t('checkout.field.status')}</div>
                <div className="text-gray-900">{status ?? t('checkout.status.unknown')}</div>
              </div>
            </div>

            <button
              onClick={checkStatus}
              disabled={busy || !transactionId}
              className="mt-6 w-full border border-gray-300 hover:bg-gray-50 disabled:bg-gray-100 text-gray-900 font-semibold py-2.5 rounded-xl transition-colors"
            >
              {busy ? t('checkout.working') : t('checkout.button.checkStatus')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
