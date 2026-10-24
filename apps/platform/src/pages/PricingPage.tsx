import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check, Crown, CreditCard, Layers, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { billingPlansList, getMe, trialClaim, trialStatus, type BillingPlan, type TrialStatusResponse } from '../lib/platformClient';
import { filterVisibleProducts, isArchivedProduct, isArchivedProductSlug, productSlug } from '../lib/productVisibility';
import { isExternalUrl, sanitizeReturnTo } from '../lib/returnTo';
import { SiteHeader, type SiteHeaderAction } from '../components/layout/SiteHeader';
import { useI18n } from '../i18n';
import type { TranslationKey } from '../i18n/locales/en';
import { platformJourney } from '../lib/journeyAnalytics';

const ENGLISH_BUNDLE_SLUG = 'english-all';

type ProductRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
};

type ProductMeta = {
  slug?: string;
  app_url?: string;
};

type LimitEntry = { key: string; label: string; value: number };

const formatMoney = (amount: number, currency: string): string => {
  if (currency.toUpperCase() === 'UZS') return `${amount.toLocaleString()} UZS`;
  return `${amount.toLocaleString()} ${currency}`;
};

const DEFAULT_FEATURE_KEYS: TranslationKey[] = [
  'common.limit.fullMockTests',
  'common.limit.sectionPractice',
  'common.limit.writingSubmissions',
];

const getFeatures = (p: BillingPlan, t: (key: TranslationKey, params?: Record<string, string | number>) => string): string[] => {
  const meta: any = p.metadata ?? {};
  const raw = meta.features;
  if (Array.isArray(raw)) {
    const list = raw.map(String).map((s) => s.trim()).filter(Boolean);
    if (list.length > 0) return list;
  }
  return DEFAULT_FEATURE_KEYS.map((key) => t(key));
};

const getPlanDescription = (p: BillingPlan): string => {
  const meta: any = p.metadata ?? {};
  return typeof meta.description === 'string' ? meta.description : '';
};

const getPlanLimits = (
  p: BillingPlan,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): LimitEntry[] => {
  const meta: any = p.metadata ?? {};
  const raw = meta.limits;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const labelByKey: Record<string, string> = {
    full_mock_tests: t('common.limit.fullMockTests'),
    section_practice: t('common.limit.sectionPractice'),
    writing_submissions: t('common.limit.writingSubmissions'),
  };
  const entries: LimitEntry[] = [];
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num) || num <= 0) return;
    entries.push({
      key,
      label: labelByKey[key] ?? key.replace(/_/g, ' '),
      value: num,
    });
  });
  return entries;
};

const getPlanIncludedProducts = (
  plan: BillingPlan,
  productMap: Map<string, ProductRow>,
  baseProductId?: string | null,
): ProductRow[] => {
  const meta: any = plan.metadata ?? {};
  const raw = Array.isArray(meta.included_product_ids) ? meta.included_product_ids : [];
  return raw
    .map((id: unknown) => String(id))
    .filter((id: string) => !baseProductId || id !== baseProductId)
    .map((id: string) => productMap.get(id))
    .filter((product: ProductRow | undefined): product is ProductRow => !!product && !isArchivedProduct(product));
};

const isRecommended = (p: BillingPlan): boolean => {
  const meta: any = p.metadata ?? {};
  return meta.recommended === true || meta.most_popular === true;
};

const tagline = (p: BillingPlan): string => {
  const meta: any = p.metadata ?? {};
  return typeof meta.tagline === 'string' ? meta.tagline : '';
};

const sortPlans = (a: BillingPlan, b: BillingPlan): number => {
  const ar = isRecommended(a) ? 0 : 1;
  const br = isRecommended(b) ? 0 : 1;
  if (ar !== br) return ar - br;

  const aa = Number(a.amount ?? 0);
  const ba = Number(b.amount ?? 0);
  if (Number.isFinite(aa) && Number.isFinite(ba) && aa !== ba) return aa - ba;

  const ad = Number(a.duration_days ?? 0);
  const bd = Number(b.duration_days ?? 0);
  if (Number.isFinite(ad) && Number.isFinite(bd) && ad !== bd) return bd - ad;

  return String(a.name ?? '').localeCompare(String(b.name ?? ''));
};

const normalizeSlug = (value: string | null): string =>
  (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const productSlugAliases = (requested: string | null): Set<string> => {
  const normalized = normalizeSlug(requested);
  const aliases = new Set<string>();
  if (!normalized) return aliases;
  aliases.add(normalized);
  return aliases;
};

const resolveProductLandingUrl = (p: ProductRow, fallbackReturnTo: string): string => {
  const meta = (p.metadata ?? {}) as ProductMeta;
  const explicit = typeof meta.app_url === 'string' ? meta.app_url.trim() : '';
  if (explicit) return explicit;

  if (isExternalUrl(fallbackReturnTo)) {
    try {
      const u = new URL(fallbackReturnTo);
      return `${u.origin}/`;
    } catch {
      // Ignore malformed URL and continue to local fallback.
    }
  }

  if (fallbackReturnTo.startsWith('/')) {
    return '/';
  }

  return '/';
};

export const PricingPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const returnTo = useMemo(() => sanitizeReturnTo(searchParams.get('returnTo')), [searchParams]);
  const productIdParam = useMemo(() => searchParams.get('product_id'), [searchParams]);
  const productParam = useMemo(() => searchParams.get('product'), [searchParams]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productError, setProductError] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductRow | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [entitled, setEntitled] = useState<boolean | null>(null);
  const [endsAt, setEndsAt] = useState<string | null>(null);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [activePlanLabel, setActivePlanLabel] = useState<string | null>(null);
  const [trialInfo, setTrialInfo] = useState<TrialStatusResponse | null>(null);
  const [trialBusy, setTrialBusy] = useState(false);
  const [trialError, setTrialError] = useState<string | null>(null);
  const [trialLoading, setTrialLoading] = useState(false);
  const [trialStatusError, setTrialStatusError] = useState<string | null>(null);

  const productMap = useMemo(() => {
    const map = new Map<string, ProductRow>();
    products.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      setProductError(null);
      setPlans([]);
      setSelectedProduct(null);
      setEntitled(null);
      setEndsAt(null);
      setActivePlanId(null);
      setActivePlanLabel(null);
      setTrialInfo(null);
      setTrialError(null);
      setTrialLoading(false);
      setTrialStatusError(null);

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate(`/auth?returnTo=${encodeURIComponent(`/pricing?${searchParams.toString()}`)}`, { replace: true });
        return;
      }
      platformJourney.track('pricing_viewed', {
        target: productParam || productIdParam || 'all',
        accessToken: data.session.access_token,
        once: true,
      });

      try {
        const [productsRes, me] = await Promise.all([
          supabase
            .from('products')
            .select('id,name,type,status,description,metadata')
            .eq('status', 'active')
            .order('name', { ascending: true }),
          getMe(data.session.access_token),
        ]);

        if (productsRes.error) throw productsRes.error;

        const list = filterVisibleProducts((productsRes.data ?? []) as ProductRow[]);
        setProducts(list);

        const byId = productIdParam ? list.find((p) => p.id === productIdParam) ?? null : null;
        const slugMatches = productSlugAliases(productParam);
        const bySlug = slugMatches.size > 0
          ? list.find((p) => slugMatches.has(productSlug(p))) ?? null
          : null;
        const explicitRequested = !!(productIdParam || productParam);
        const resolved = byId ?? bySlug ?? (list.length > 0 ? list[0] : null);

        if (!resolved) {
          if (explicitRequested && isArchivedProductSlug(productParam)) {
            setProductError(t('pricing.error.archived'));
          } else if (explicitRequested) {
            setProductError(t('pricing.error.selectedNotFound'));
          }
          setEntitled(false);
          setLoading(false);
          return;
        }
        if (explicitRequested && !byId && !bySlug) {
          setProductError(t('pricing.error.fallbackService'));
        }

        setSelectedProduct(resolved);

        const entForProduct =
          me.entitlements.find((e) => e.resource_type === 'product' && e.resource_id === resolved.id) ?? null;
        setEntitled(!!entForProduct);
        setEndsAt(entForProduct?.ends_at ?? null);
        const planIdFromValue =
          entForProduct && entForProduct.value && typeof entForProduct.value === 'object'
            ? String((entForProduct.value as Record<string, unknown>).plan_id ?? '')
            : '';
        const planNameFromValue =
          entForProduct && entForProduct.value && typeof entForProduct.value === 'object'
            ? String((entForProduct.value as Record<string, unknown>).plan_name ?? '')
            : '';
        setActivePlanId(planIdFromValue || null);
        setActivePlanLabel(planNameFromValue || null);

        const plansRes = await billingPlansList(data.session.access_token, resolved.id);
        setPlans((plansRes.plans ?? []).slice().sort(sortPlans));

        try {
          setTrialLoading(true);
          setTrialStatusError(null);
          const t = await trialStatus(data.session.access_token, resolved.id);
          setTrialInfo(t);
        } catch {
          setTrialInfo(null);
          setTrialStatusError(t('pricing.trial.loadFailed'));
        } finally {
          setTrialLoading(false);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : t('pricing.error.load'));
        setEntitled(false);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [navigate, productIdParam, productParam, returnTo, searchParams]);

  const activePlanName = useMemo(() => {
    if (activePlanLabel) return activePlanLabel;
    if (!activePlanId) return null;
    const row = plans.find((p) => p.id === activePlanId);
    return row?.name ?? null;
  }, [activePlanId, activePlanLabel, plans]);

  const choose = (planId: string) => {
    if (!selectedProduct) return;
    platformJourney.track('checkout_started', {
      target: productSlug(selectedProduct),
      metadata: { plan_selected: true },
    });
    setBusy(true);
    setError(null);
    try {
      navigate(
        `/checkout?plan_id=${encodeURIComponent(planId)}&product=${encodeURIComponent(
          productSlug(selectedProduct),
        )}&returnTo=${encodeURIComponent(returnTo)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const continueTo = (target: string, opts?: { replace?: boolean }) => {
    if (isExternalUrl(target)) {
      navigate(`/auth?returnTo=${encodeURIComponent(target)}`, { replace: opts?.replace ?? false });
      return;
    }
    navigate(target, { replace: opts?.replace ?? false });
  };

  const claimFreeTrial = async () => {
    if (!selectedProduct) return;
    setTrialBusy(true);
    setTrialError(null);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate(`/auth?returnTo=${encodeURIComponent(`/pricing?${searchParams.toString()}`)}`, { replace: true });
        return;
      }

      const result = await trialClaim(data.session.access_token, selectedProduct.id);
      setEntitled(true);
      setEndsAt(result.entitlement?.ends_at ?? null);
      setActivePlanId(null);
      setActivePlanLabel(t('pricing.trial.label'));

      const freshMe = await getMe(data.session.access_token, { force: true });
      const entForProduct =
        freshMe.entitlements.find((e) => e.resource_type === 'product' && e.resource_id === selectedProduct.id) ?? null;
      if (entForProduct) {
        setEndsAt(entForProduct.ends_at ?? null);
      }

      try {
        setTrialLoading(true);
        setTrialStatusError(null);
        const t = await trialStatus(data.session.access_token, selectedProduct.id);
        setTrialInfo(t);
      } catch {
        setTrialInfo(null);
        setTrialStatusError(t('pricing.trial.refreshFailed'));
      } finally {
        setTrialLoading(false);
      }

      const landingUrl = resolveProductLandingUrl(selectedProduct, returnTo);
      continueTo(landingUrl, { replace: true });
    } catch (e) {
      const raw = e instanceof Error ? e.message : t('pricing.trial.unavailable');
      if (/already claimed/i.test(raw)) setTrialError(t('pricing.trial.alreadyClaimed'));
      else if (/already active/i.test(raw)) setTrialError(t('pricing.trial.alreadyEntitled'));
      else setTrialError(t('pricing.trial.unavailable'));
    } finally {
      setTrialBusy(false);
    }
  };

  const refreshTrialStatus = async () => {
    if (!selectedProduct) return;
    setTrialError(null);
    setTrialLoading(true);
    setTrialStatusError(null);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate(`/auth?returnTo=${encodeURIComponent(`/pricing?${searchParams.toString()}`)}`, { replace: true });
        return;
      }
      const t = await trialStatus(data.session.access_token, selectedProduct.id);
      setTrialInfo(t);
    } catch {
      setTrialInfo(null);
      setTrialStatusError(t('pricing.trial.loadFailed'));
    } finally {
      setTrialLoading(false);
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // ignore sign-out failures
    }
    navigate('/auth', { replace: true });
  };

  // Someone looking at one English skill sees the All Skills bundle as an option.
  const englishBundle = useMemo(() => {
    const slug = selectedProduct ? productSlug(selectedProduct) : '';
    if (!slug.startsWith('english-') || slug === ENGLISH_BUNDLE_SLUG) return null;
    return products.find((p) => productSlug(p) === ENGLISH_BUNDLE_SLUG) ?? null;
  }, [products, selectedProduct]);

  const goSelectProduct = (product: ProductRow) => {
    const slug = productSlug(product);
    navigate(`/pricing?product=${encodeURIComponent(slug)}&returnTo=${encodeURIComponent(returnTo)}`);
  };

  const headerActions: SiteHeaderAction[] = [
    {
      id: 'back',
      label: t('common.back'),
      onClick: () => {
        continueTo(returnTo, { replace: true });
      },
    },
    { id: 'signout', label: t('common.signOut'), onClick: () => void signOut() },
    { id: 'contact', label: t('common.contact'), onClick: () => navigate('/contact') },
  ];

  return (
    <div className="min-h-screen bg-[#f6f1e8] text-gray-900 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 -right-24 h-[420px] w-[420px] rounded-full bg-emerald-200/60 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 h-[480px] w-[480px] rounded-full bg-amber-200/40 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(#00000010_1px,transparent_1px)] [background-size:22px_22px] opacity-30" />
      </div>

      <div className="relative max-w-6xl mx-auto p-6 pb-24 md:p-10">
        <SiteHeader className="px-0 pt-0" actions={headerActions} />

        <div className="mt-10 flex flex-col gap-6">
          <div className="rounded-3xl border border-gray-900 bg-white/85 p-6 md:p-8">
            <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider uppercase text-gray-800 bg-white/70 border border-gray-900 rounded-full px-3 py-1">
              <CreditCard size={14} />
              {t('pricing.badge')}
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mt-4">{t('pricing.title')}</h1>
            <p className="text-gray-700 mt-2 max-w-2xl">
              {t('pricing.subtitle')}
            </p>
            {selectedProduct ? (
              <div className="mt-3 text-sm text-gray-700 flex items-center gap-2">
                <Layers size={16} className="text-gray-500" />
                <span>
                  {t('pricing.serviceLabel', { name: selectedProduct.name })}
                </span>
              </div>
            ) : null}
            {selectedProduct?.description ? (
              <div className="mt-2 text-sm text-gray-600 max-w-2xl">{selectedProduct.description}</div>
            ) : null}
          </div>
          {englishBundle ? (
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50/80 p-4 text-emerald-950 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-semibold">{t('pricing.englishBundle.title')}</div>
                <div className="text-sm mt-1 max-w-2xl">{t('pricing.englishBundle.body')}</div>
              </div>
              <button
                type="button"
                onClick={() => goSelectProduct(englishBundle)}
                className="self-start md:self-auto px-4 py-2 rounded-full bg-emerald-800 hover:bg-emerald-900 text-white text-sm font-semibold whitespace-nowrap"
              >
                {t('pricing.englishBundle.cta')}
              </button>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="mt-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div>
        ) : null}
        {productError ? (
          <div className="mt-4 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">{productError}</div>
        ) : null}

        {entitled && selectedProduct ? (
          <div className="mt-6 bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 text-emerald-900">
            <div className="font-semibold">{t('pricing.accessActiveTitle')}</div>
            {activePlanName || activePlanId ? (
              <div className="text-sm mt-1">
                {t('pricing.activePlan', { plan: activePlanName ?? `Plan ${activePlanId}` })}
              </div>
            ) : null}
            <div className="text-sm opacity-80 mt-1">
              {endsAt ? t('pricing.endsAt', { date: new Date(endsAt).toLocaleString() }) : t('pricing.noExpiry')} {t('pricing.extendHint')}
            </div>
          </div>
        ) : null}

        {selectedProduct ? (
          <div className="mt-6 bg-blue-50/80 border border-blue-200 rounded-2xl p-4 text-blue-900">
            <div className="font-semibold">{t('pricing.trial.title')}</div>
            <div className="text-sm mt-1">
              {entitled
                ? t('pricing.trial.alreadyEntitled')
                : trialLoading
                  ? t('pricing.trial.checking')
                  : trialInfo
                    ? trialInfo.claimable
                      ? t('pricing.trial.start', { days: trialInfo.trial_days })
                      : !trialInfo.trial_enabled
                        ? t('pricing.trial.disabled')
                      : trialInfo.reason === 'already_claimed'
                        ? t('pricing.trial.alreadyClaimed')
                        : trialInfo.reason === 'already_entitled'
                          ? t('pricing.trial.alreadyEntitled')
                          : t('pricing.trial.unavailable')
                    : trialStatusError ?? t('pricing.trial.statusUnavailable')}
            </div>
            {trialInfo && Object.keys(trialInfo.trial_limits ?? {}).length > 0 ? (
              <div className="text-xs mt-2 opacity-80">
                {t('pricing.trial.label')}:
                {Object.entries(trialInfo.trial_limits)
                  .map(([key, value]) => ` ${key.replace(/_/g, ' ')}: ${value}`)
                  .join(',')}
              </div>
            ) : null}
            {trialError ? <div className="text-sm mt-2 text-red-700">{trialError}</div> : null}
            <div className="mt-3">
              {trialInfo ? (
                <button
                  onClick={claimFreeTrial}
                  disabled={trialBusy || !trialInfo.claimable || !!entitled}
                  className="px-4 py-2 rounded-full bg-blue-700 hover:bg-blue-800 disabled:bg-gray-300 text-white text-sm font-semibold"
                >
                  {trialBusy ? t('pricing.trial.claiming') : t('pricing.trial.claim')}
                </button>
              ) : (
                <button
                  onClick={refreshTrialStatus}
                  disabled={trialLoading}
                  className="px-4 py-2 rounded-full border border-blue-300 bg-white/90 hover:bg-white disabled:bg-gray-100 text-blue-800 text-sm font-semibold"
                >
                  {trialLoading ? t('pricing.trial.checking') : t('pricing.trial.check')}
                </button>
              )}
            </div>
          </div>
        ) : null}

        {!loading && !selectedProduct ? (
          <div className="mt-8 rounded-3xl border border-gray-900 bg-white/85 p-6">
            <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">{t('pricing.selectService.badge')}</div>
            <div className="text-lg font-bold text-gray-900 mt-1">{t('pricing.selectService.title')}</div>
            {products.length === 0 ? (
              <div className="mt-4 text-sm text-gray-600">{t('pricing.selectService.empty')}</div>
            ) : (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {products.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => goSelectProduct(p)}
                    className="text-left rounded-2xl border border-gray-900/20 bg-white/90 hover:bg-white p-4 transition-colors"
                  >
                    <div className="text-sm font-semibold text-gray-900">{p.name}</div>
                    <div className="text-xs text-gray-500 mt-1">{p.description ?? t('pricing.selectService.defaultDesc')}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {selectedProduct ? (
          <div className="mt-10">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">{t('pricing.plans.badge')}</div>
                <div className="text-lg font-bold text-gray-900 mt-1">{t('pricing.plans.title')}</div>
              </div>
            </div>

            {loading ? (
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div key={idx} className="rounded-3xl border border-gray-900/10 bg-white/70 backdrop-blur shadow-sm ring-1 ring-black/5 p-6">
                    <div className="h-4 bg-gray-100 rounded w-1/2" />
                    <div className="mt-4 h-8 bg-gray-100 rounded w-2/3" />
                    <div className="mt-2 h-4 bg-gray-100 rounded w-1/3" />
                    <div className="mt-6 space-y-2">
                      <div className="h-3 bg-gray-100 rounded" />
                      <div className="h-3 bg-gray-100 rounded w-11/12" />
                      <div className="h-3 bg-gray-100 rounded w-10/12" />
                    </div>
                    <div className="mt-8 h-10 bg-gray-100 rounded-2xl" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {plans.map((p) => {
                  const features = getFeatures(p, t);
                  const limits = getPlanLimits(p, t);
                  const included = getPlanIncludedProducts(p, productMap, selectedProduct?.id ?? null);
                  const recommended = isRecommended(p);
                  const desc = getPlanDescription(p);
                  const Icon = recommended ? Crown : Check;
                  return (
                    <div
                      key={p.id}
                      className={[
                        'rounded-3xl border shadow-sm overflow-hidden backdrop-blur ring-1 ring-black/5',
                        recommended ? 'border-emerald-300 bg-white/90' : 'border-gray-900/15 bg-white/85',
                      ].join(' ')}
                    >
                      <div className="p-6">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-bold text-gray-900">{p.name}</div>
                              {included.length > 0 ? (
                                <span className="text-[11px] uppercase tracking-wider font-semibold bg-amber-100 text-amber-800 border border-amber-200 rounded-full px-2 py-0.5">
                                  {t('pricing.plan.bundle')}
                                </span>
                              ) : null}
                            </div>
                            {tagline(p) ? <div className="text-xs text-gray-500 mt-1">{tagline(p)}</div> : null}
                          </div>
                          <div className="shrink-0 flex items-center gap-2">
                            {recommended ? (
                              <span className="inline-flex items-center text-xs font-bold bg-emerald-600 text-white rounded-full px-3 py-1">
                                {t('pricing.plan.popular')}
                              </span>
                            ) : null}
                            <div
                              className={[
                                'w-9 h-9 rounded-2xl flex items-center justify-center text-white',
                                recommended ? 'bg-emerald-600' : 'bg-gray-900',
                              ].join(' ')}
                              title={recommended ? t('pricing.plan.popular') : t('plans.choosePlan')}
                            >
                              <Icon size={18} />
                            </div>
                          </div>
                        </div>

                        {desc ? <div className="text-sm text-gray-600 mt-3">{desc}</div> : null}

                        {included.length > 0 ? (
                          <div className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 inline-flex items-center gap-1">
                            {t('plans.includes', { items: included.map((item) => item.name).join(', ') })}
                          </div>
                        ) : null}

                        <div className="mt-5">
                          <div className="text-3xl font-extrabold text-gray-900">{formatMoney(p.amount, p.currency)}</div>
                          <div className="text-sm text-gray-500 mt-1">
                            {p.duration_days ? t('plans.daysAccess', { days: p.duration_days }) : t('plans.noExpiry')}
                          </div>
                        </div>

                        <div className="mt-6 space-y-2">
                          {features.map((f, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                              <span className="mt-0.5 w-5 h-5 rounded-full bg-emerald-600/10 border border-emerald-600/15 flex items-center justify-center">
                                <Check size={12} className="text-emerald-700" />
                              </span>
                              <span className="leading-snug">{f}</span>
                            </div>
                          ))}
                        </div>

                        {limits.length > 0 ? (
                          <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50/70 p-3">
                            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('pricing.plan.usageLimits')}</div>
                            <div className="mt-2 space-y-1 text-sm text-gray-700">
                              {limits.map((limit) => (
                                <div key={limit.key} className="flex items-center justify-between gap-3">
                                  <span>{limit.label}</span>
                                  <span className="font-semibold text-gray-900">{limit.value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <button
                          onClick={() => choose(p.id)}
                          disabled={busy}
                          className={[
                            'mt-7 w-full font-semibold py-2.5 rounded-2xl transition-colors',
                            recommended
                              ? 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white'
                              : 'bg-gray-900 hover:bg-black disabled:bg-gray-300 text-white',
                          ].join(' ')}
                        >
                          {t('pricing.plan.choose')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {plans.length === 0 && !loading ? (
              <div className="mt-6 bg-white/70 backdrop-blur border border-gray-900/15 rounded-3xl p-8 text-gray-700">
                {t('pricing.plans.empty')}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-3xl border border-gray-900/15 bg-white/85 backdrop-blur shadow-sm ring-1 ring-black/5 p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-600/10 border border-emerald-700/10 flex items-center justify-center text-emerald-800">
                <ShieldCheck size={18} />
              </div>
              <div>
                <div className="text-sm font-bold text-gray-900">{t('pricing.secureCheckout.title')}</div>
                <div className="text-sm text-gray-600 mt-1">{t('pricing.secureCheckout.desc')}</div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-gray-900/15 bg-white/85 backdrop-blur shadow-sm ring-1 ring-black/5 p-6">
            <div className="text-sm font-bold text-gray-900">{t('pricing.discount.title')}</div>
            <div className="text-sm text-gray-600 mt-2">{t('pricing.discount.desc')}</div>
            <button
              onClick={() => navigate('/contact')}
              className="mt-4 px-4 py-2 rounded-full border border-gray-900 text-sm font-semibold"
            >
              {t('common.contactSupport')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
