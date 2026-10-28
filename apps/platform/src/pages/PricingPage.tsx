import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check, Crown, CreditCard, Layers, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getMe, trialClaim, trialStatus, type BillingPlan, type TrialStatusResponse } from '../lib/platformClient';
import { filterVisibleProducts, isArchivedProduct, isArchivedProductSlug, productSlug } from '../lib/productVisibility';
import { isExternalUrl, sanitizeReturnTo } from '../lib/returnTo';
import { SiteHeader, type SiteHeaderAction } from '../components/layout/SiteHeader';
import { SeoHead, createBreadcrumbSchema, createOrganizationSchema, createWebPageSchema } from '../components/seo/SeoHead';
import { useI18n } from '../i18n';
import type { TranslationKey } from '../i18n/locales/en';
import { platformJourney } from '../lib/journeyAnalytics';
import { EXAM_FAMILIES, examFamilyForSlug } from '../content/examFamilies';

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
  short_description?: string;
  sort_order?: number;
  catalog?: string;
  bundle_product_ids?: unknown;
  included_in_bundles?: unknown;
};

type LimitEntry = { key: string; label: string; value: number };
type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;
type SessionInfo = { accessToken: string; userId: string };

const PRICING_TITLE = 'Schood Pricing | IELTS, SAT, TOEFL and English plans';
const PRICING_DESCRIPTION =
  'Prices for every Schood service: IELTS, SAT and TOEFL simulators, practice, playbooks, Complete bundles and English plans. Sign in only when you buy.';

const metaOf = (p: ProductRow): ProductMeta => (p.metadata ?? {}) as ProductMeta;

const stringList = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.map((value) => String(value ?? '').trim()).filter(Boolean) : [];

const planMeta = (p: BillingPlan): Record<string, unknown> =>
  p.metadata && typeof p.metadata === 'object' && !Array.isArray(p.metadata) ? (p.metadata as Record<string, unknown>) : {};

const formatMoney = (amount: number, currency: string): string => {
  if (currency.toUpperCase() === 'UZS') return `${amount.toLocaleString()} UZS`;
  return `${amount.toLocaleString()} ${currency}`;
};

const DEFAULT_FEATURE_KEYS: TranslationKey[] = [
  'common.limit.fullMockTests',
  'common.limit.sectionPractice',
  'common.limit.writingSubmissions',
];

const getFeatures = (p: BillingPlan, t: Translate): string[] => {
  const meta = planMeta(p);
  const list = stringList(meta.features);
  if (list.length > 0) return list;
  return DEFAULT_FEATURE_KEYS.map((key) => t(key));
};

const getPlanDescription = (p: BillingPlan): string => {
  const meta = planMeta(p);
  return typeof meta.description === 'string' ? meta.description : '';
};

const getPlanLimits = (p: BillingPlan, t: Translate): LimitEntry[] => {
  const meta = planMeta(p);
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
    entries.push({ key, label: labelByKey[key] ?? key.replace(/_/g, ' '), value: num });
  });
  return entries;
};

const includedIdsOf = (plan: BillingPlan): string[] => stringList(planMeta(plan).included_product_ids);

const getPlanIncludedProducts = (
  plan: BillingPlan,
  productMap: Map<string, ProductRow>,
  baseProductId?: string | null,
): ProductRow[] =>
  includedIdsOf(plan)
    .filter((id) => !baseProductId || id !== baseProductId)
    .map((id) => productMap.get(id))
    .filter((product): product is ProductRow => !!product && !isArchivedProduct(product));

const isRecommended = (p: BillingPlan): boolean => {
  const meta = planMeta(p);
  return meta.recommended === true || meta.most_popular === true;
};

const tagline = (p: BillingPlan): string => {
  const meta = planMeta(p);
  return typeof meta.tagline === 'string' ? meta.tagline : '';
};

/** Catalogue order: display_order, then price, then duration. */
const sortPlans = (a: BillingPlan, b: BillingPlan): number => {
  const ao = Number(planMeta(a).display_order ?? NaN);
  const bo = Number(planMeta(b).display_order ?? NaN);
  if (Number.isFinite(ao) && Number.isFinite(bo) && ao !== bo) return ao - bo;
  if (Number.isFinite(ao) && !Number.isFinite(bo)) return -1;
  if (!Number.isFinite(ao) && Number.isFinite(bo)) return 1;
  const aa = Number(a.amount ?? 0);
  const ba = Number(b.amount ?? 0);
  if (aa !== ba) return aa - ba;
  return Number(a.duration_days ?? 0) - Number(b.duration_days ?? 0);
};

const sortProducts = (a: ProductRow, b: ProductRow): number => {
  const ao = Number(metaOf(a).sort_order ?? NaN);
  const bo = Number(metaOf(b).sort_order ?? NaN);
  if (Number.isFinite(ao) && Number.isFinite(bo) && ao !== bo) return ao - bo;
  if (Number.isFinite(ao) && !Number.isFinite(bo)) return -1;
  if (!Number.isFinite(ao) && Number.isFinite(bo)) return 1;
  return a.name.localeCompare(b.name);
};

const normalizeSlug = (value: string | null): string =>
  (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/** Learner-facing catalogue: center tiers and institution plans are sold elsewhere. */
const isLearnerProduct = (p: ProductRow): boolean => !metaOf(p).catalog;

const isBundleProduct = (p: ProductRow): boolean =>
  stringList(metaOf(p).bundle_product_ids).length > 0 || productSlug(p) === ENGLISH_BUNDLE_SLUG;

const resolveProductLandingUrl = (p: ProductRow, fallbackReturnTo: string): string => {
  const explicit = typeof metaOf(p).app_url === 'string' ? String(metaOf(p).app_url).trim() : '';
  if (explicit) return explicit;
  if (isExternalUrl(fallbackReturnTo)) {
    try {
      return `${new URL(fallbackReturnTo).origin}/`;
    } catch {
      // Ignore malformed URL and continue to local fallback.
    }
  }
  return '/';
};

type GroupKey = 'ielts' | 'sat' | 'toefl' | 'english' | 'other';
const GROUP_ORDER: GroupKey[] = ['ielts', 'sat', 'toefl', 'english', 'other'];
const GROUP_TITLE: Record<GroupKey, TranslationKey> = {
  ielts: 'examFamily.ielts.title',
  sat: 'examFamily.sat.title',
  toefl: 'examFamily.toefl.title',
  english: 'pricing.group.english',
  other: 'pricing.group.other',
};

const groupOf = (p: ProductRow): GroupKey => {
  const slug = productSlug(p);
  const family = examFamilyForSlug(slug);
  if (family) return family.key;
  if (slug.startsWith('english-')) return 'english';
  return 'other';
};

/** Position inside an exam family: simulator, practice, playbook, Complete. */
const familyRank = (p: ProductRow): number => {
  const slug = productSlug(p);
  for (const family of EXAM_FAMILIES) {
    const index = family.members.findIndex((member) => member.slug === slug);
    if (index >= 0) return index;
  }
  return 100;
};

/** Cheapest active plan of the same duration for each member; null when any member has none. */
const separatePrice = (
  memberIds: string[],
  plansByProduct: Map<string, BillingPlan[]>,
  durationDays: number | null,
  currency: string,
): number | null => {
  if (memberIds.length === 0 || !durationDays) return null;
  let total = 0;
  for (const id of memberIds) {
    const candidates = (plansByProduct.get(id) ?? []).filter(
      (plan) => plan.duration_days === durationDays && plan.currency.toUpperCase() === currency.toUpperCase(),
    );
    if (candidates.length === 0) return null;
    total += Math.min(...candidates.map((plan) => Number(plan.amount)));
  }
  return total;
};

export const PricingPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const hasReturnTo = searchParams.has('returnTo');
  const returnTo = useMemo(() => sanitizeReturnTo(searchParams.get('returnTo')), [searchParams]);
  const productIdParam = searchParams.get('product_id');
  const productParam = searchParams.get('product');
  const explicitRequested = !!(productIdParam || productParam);

  const [catalogLoading, setCatalogLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [entitled, setEntitled] = useState<boolean | null>(null);
  const [endsAt, setEndsAt] = useState<string | null>(null);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [activePlanLabel, setActivePlanLabel] = useState<string | null>(null);
  const [trialInfo, setTrialInfo] = useState<TrialStatusResponse | null>(null);
  const [trialBusy, setTrialBusy] = useState(false);
  const [trialError, setTrialError] = useState<string | null>(null);
  const [trialLoading, setTrialLoading] = useState(false);
  const [trialStatusError, setTrialStatusError] = useState<string | null>(null);

  // The public catalogue: active products and active plans are readable without
  // an account (row-level security "Products read active" / "Plans read active").
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setCatalogLoading(true);
      setError(null);
      try {
        const [productsRes, plansRes] = await Promise.all([
          supabase
            .from('products')
            .select('id,name,type,status,description,metadata')
            .eq('status', 'active')
            .order('name', { ascending: true }),
          supabase
            .from('plans')
            .select('id,product_id,name,amount,currency,duration_days,is_active,metadata,created_at')
            .eq('is_active', true)
            .order('created_at', { ascending: true }),
        ]);
        if (productsRes.error) throw productsRes.error;
        if (plansRes.error) throw plansRes.error;
        if (cancelled) return;
        setProducts(filterVisibleProducts((productsRes.data ?? []) as ProductRow[]).filter(isLearnerProduct).sort(sortProducts));
        setPlans((plansRes.data ?? []) as BillingPlan[]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t('pricing.error.load'));
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        setSession(data.session ? { accessToken: data.session.access_token, userId: data.session.user.id } : null);
      })
      .catch(() => {
        if (!cancelled) setSession(null);
      })
      .finally(() => {
        if (!cancelled) setSessionChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const productMap = useMemo(() => {
    const map = new Map<string, ProductRow>();
    products.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  const plansByProduct = useMemo(() => {
    const map = new Map<string, BillingPlan[]>();
    plans.forEach((plan) => {
      const list = map.get(plan.product_id) ?? [];
      list.push(plan);
      map.set(plan.product_id, list);
    });
    for (const [key, value] of map.entries()) map.set(key, value.slice().sort(sortPlans));
    return map;
  }, [plans]);

  const selectedProduct = useMemo<ProductRow | null>(() => {
    if (!explicitRequested) return null;
    const byId = productIdParam ? products.find((p) => p.id === productIdParam) ?? null : null;
    const wanted = normalizeSlug(productParam);
    const bySlug = wanted ? products.find((p) => productSlug(p) === wanted) ?? null : null;
    return byId ?? bySlug;
  }, [explicitRequested, productIdParam, productParam, products]);

  const productError = useMemo<string | null>(() => {
    if (!explicitRequested || catalogLoading || selectedProduct || error) return null;
    if (isArchivedProductSlug(productParam)) return t('pricing.error.archived');
    return t('pricing.error.selectedNotFound');
  }, [catalogLoading, error, explicitRequested, productParam, selectedProduct, t]);

  const selectedPlans = useMemo(
    () => (selectedProduct ? plansByProduct.get(selectedProduct.id) ?? [] : []),
    [plansByProduct, selectedProduct],
  );
  const selectedIsBundle = selectedProduct ? isBundleProduct(selectedProduct) : false;

  useEffect(() => {
    if (!sessionChecked) return;
    platformJourney.track('pricing_viewed', {
      target: productParam || productIdParam || 'all',
      accessToken: session?.accessToken ?? null,
      once: true,
    });
  }, [productIdParam, productParam, session, sessionChecked]);

  // Signed-in extras: current access and trial status for the selected service.
  useEffect(() => {
    setEntitled(null);
    setEndsAt(null);
    setActivePlanId(null);
    setActivePlanLabel(null);
    setTrialInfo(null);
    setTrialError(null);
    setTrialStatusError(null);
    if (!session || !selectedProduct) return;
    let cancelled = false;
    const run = async () => {
      try {
        const me = await getMe(session.accessToken);
        if (cancelled) return;
        const ent = me.entitlements.find((e) => e.resource_type === 'product' && e.resource_id === selectedProduct.id) ?? null;
        setEntitled(!!ent);
        setEndsAt(ent?.ends_at ?? null);
        const value = ent && ent.value && typeof ent.value === 'object' ? (ent.value as Record<string, unknown>) : {};
        setActivePlanId(String(value.plan_id ?? '') || null);
        setActivePlanLabel(String(value.plan_name ?? '') || null);
      } catch {
        if (!cancelled) setEntitled(false);
      }
      if (isBundleProduct(selectedProduct)) return;
      try {
        setTrialLoading(true);
        const info = await trialStatus(session.accessToken, selectedProduct.id);
        if (!cancelled) setTrialInfo(info);
      } catch {
        if (!cancelled) setTrialStatusError(t('pricing.trial.loadFailed'));
      } finally {
        if (!cancelled) setTrialLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [selectedProduct, session]);

  const activePlanName = useMemo(() => {
    if (activePlanLabel) return activePlanLabel;
    if (!activePlanId) return null;
    return selectedPlans.find((p) => p.id === activePlanId)?.name ?? null;
  }, [activePlanId, activePlanLabel, selectedPlans]);

  const authPath = (target: string) => `/auth?returnTo=${encodeURIComponent(target)}`;
  const currentPricingPath = `${location.pathname}${location.search}`;

  const checkoutPath = (product: ProductRow, plan: BillingPlan): string => {
    const landing = hasReturnTo ? returnTo : resolveProductLandingUrl(product, returnTo);
    const qs = new URLSearchParams({ plan_id: plan.id, product: productSlug(product), returnTo: landing });
    return `/checkout?${qs.toString()}`;
  };

  const choose = (product: ProductRow, plan: BillingPlan) => {
    platformJourney.track('checkout_started', {
      target: productSlug(product),
      metadata: { plan_selected: true, signed_in: !!session },
    });
    setBusy(true);
    try {
      const target = checkoutPath(product, plan);
      // Buying needs an account; sign-in returns straight to the chosen plan.
      navigate(session ? target : authPath(target));
    } finally {
      setBusy(false);
    }
  };

  const continueTo = (target: string, opts?: { replace?: boolean }) => {
    if (isExternalUrl(target)) {
      navigate(authPath(target), { replace: opts?.replace ?? false });
      return;
    }
    navigate(target, { replace: opts?.replace ?? false });
  };

  const claimFreeTrial = async () => {
    if (!selectedProduct) return;
    if (!session) {
      navigate(authPath(currentPricingPath));
      return;
    }
    setTrialBusy(true);
    setTrialError(null);
    setError(null);
    try {
      const result = await trialClaim(session.accessToken, selectedProduct.id);
      setEntitled(true);
      setEndsAt(result.entitlement?.ends_at ?? null);
      setActivePlanId(null);
      setActivePlanLabel(t('pricing.trial.label'));
      await getMe(session.accessToken, { force: true }).catch(() => null);
      continueTo(resolveProductLandingUrl(selectedProduct, returnTo), { replace: true });
    } catch (e) {
      const raw = e instanceof Error ? e.message : '';
      if (/already claimed/i.test(raw)) setTrialError(t('pricing.trial.alreadyClaimed'));
      else if (/already active/i.test(raw)) setTrialError(t('pricing.trial.alreadyEntitled'));
      else setTrialError(t('pricing.trial.unavailable'));
    } finally {
      setTrialBusy(false);
    }
  };

  const refreshTrialStatus = async () => {
    if (!selectedProduct || !session) return;
    setTrialError(null);
    setTrialLoading(true);
    setTrialStatusError(null);
    try {
      setTrialInfo(await trialStatus(session.accessToken, selectedProduct.id));
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
    setSession(null);
  };

  const goSelectProduct = (product: ProductRow) => {
    const qs = new URLSearchParams({ product: productSlug(product) });
    if (hasReturnTo) qs.set('returnTo', returnTo);
    navigate(`/pricing?${qs.toString()}`);
  };

  // Someone looking at one English skill sees the All Skills bundle as an option.
  const englishBundle = useMemo(() => {
    const slug = selectedProduct ? productSlug(selectedProduct) : '';
    if (!slug.startsWith('english-') || slug === ENGLISH_BUNDLE_SLUG) return null;
    return products.find((p) => productSlug(p) === ENGLISH_BUNDLE_SLUG) ?? null;
  }, [products, selectedProduct]);

  // Someone looking at one exam service sees its Complete bundle.
  const examBundleOffer = useMemo(() => {
    if (!selectedProduct || selectedIsBundle) return null;
    const bundleSlug = stringList(metaOf(selectedProduct).included_in_bundles)[0];
    const bundle = bundleSlug ? products.find((p) => productSlug(p) === bundleSlug) ?? null : null;
    const plan = bundle ? (plansByProduct.get(bundle.id) ?? [])[0] ?? null : null;
    if (!bundle || !plan) return null;
    const members = getPlanIncludedProducts(plan, productMap, bundle.id);
    const separately = separatePrice(includedIdsOf(plan), plansByProduct, plan.duration_days, plan.currency);
    return { bundle, plan, members, separately };
  }, [plansByProduct, productMap, products, selectedIsBundle, selectedProduct]);

  const groups = useMemo(() => {
    const map = new Map<GroupKey, ProductRow[]>();
    products
      .filter((product) => (plansByProduct.get(product.id) ?? []).length > 0)
      .forEach((product) => {
        const key = groupOf(product);
        map.set(key, [...(map.get(key) ?? []), product]);
      });
    return GROUP_ORDER.filter((key) => map.has(key)).map((key) => ({
      key,
      products: (map.get(key) ?? []).slice().sort((a, b) => familyRank(a) - familyRank(b) || sortProducts(a, b)),
    }));
  }, [plansByProduct, products]);

  const headerActions: SiteHeaderAction[] = [
    ...(selectedProduct || explicitRequested
      ? [{ id: 'all', label: t('pricing.allServices'), onClick: () => navigate('/pricing') }]
      : []),
    ...(hasReturnTo ? [{ id: 'back', label: t('common.back'), onClick: () => continueTo(returnTo, { replace: true }) }] : []),
    session
      ? { id: 'signout', label: t('common.signOut'), onClick: () => void signOut() }
      : { id: 'login', label: t('common.login'), onClick: () => navigate(authPath(currentPricingPath)), primary: true },
    { id: 'contact', label: t('common.contact'), onClick: () => navigate('/contact') },
  ];

  const buyLabel = session ? t('pricing.plan.choose') : t('pricing.plan.signInToBuy');

  const renderPlanCard = (product: ProductRow, p: BillingPlan) => {
    const features = getFeatures(p, t);
    const limits = getPlanLimits(p, t);
    const included = getPlanIncludedProducts(p, productMap, product.id);
    const recommended = isRecommended(p);
    const desc = getPlanDescription(p);
    const separately = included.length > 0 ? separatePrice(includedIdsOf(p), plansByProduct, p.duration_days, p.currency) : null;
    const Icon = recommended ? Crown : Check;
    return (
      <div
        key={p.id}
        data-testid="plan-card"
        className={[
          'min-w-0 rounded-3xl border shadow-sm overflow-hidden backdrop-blur ring-1 ring-black/5',
          recommended ? 'border-emerald-300 bg-white/90' : 'border-gray-900/15 bg-white/85',
        ].join(' ')}
      >
        <div className="p-5 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-bold text-gray-900 [overflow-wrap:anywhere]">{p.name}</div>
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
            {separately && separately > p.amount ? (
              <div className="text-xs text-gray-500 mt-1">
                {t('pricing.bundle.separately', { price: formatMoney(separately, p.currency) })}
              </div>
            ) : null}
          </div>

          <div className="mt-5 space-y-2">
            {features.map((f, idx) => (
              <div key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-emerald-600/10 border border-emerald-600/15 flex items-center justify-center">
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
            type="button"
            onClick={() => choose(product, p)}
            disabled={busy}
            className={[
              'mt-6 w-full font-semibold py-2.5 rounded-2xl transition-colors',
              recommended
                ? 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white'
                : 'bg-gray-900 hover:bg-black disabled:bg-gray-300 text-white',
            ].join(' ')}
          >
            {buyLabel}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f6f1e8] text-gray-900 relative overflow-hidden">
      <SeoHead
        title={PRICING_TITLE}
        description={PRICING_DESCRIPTION}
        path="/pricing"
        keywords={['Schood pricing', 'IELTS price', 'SAT price', 'TOEFL price', 'IELTS Complete', 'SAT Complete', 'TOEFL Complete']}
        schema={[
          createOrganizationSchema(),
          createWebPageSchema({ title: PRICING_TITLE, description: PRICING_DESCRIPTION, path: '/pricing' }),
          createBreadcrumbSchema([
            { name: 'Schood', path: '/' },
            { name: 'Pricing', path: '/pricing' },
          ]),
        ]}
      />
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 -right-24 h-[420px] w-[420px] rounded-full bg-emerald-200/60 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 h-[480px] w-[480px] rounded-full bg-amber-200/40 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(#00000010_1px,transparent_1px)] [background-size:22px_22px] opacity-30" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 py-6 pb-24 md:p-10">
        <SiteHeader className="px-0 pt-0" actions={headerActions} />

        <div className="mt-8 md:mt-10 flex flex-col gap-6">
          <div className="rounded-3xl border border-gray-900 bg-white/85 p-5 md:p-8">
            <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider uppercase text-gray-800 bg-white/70 border border-gray-900 rounded-full px-3 py-1">
              <CreditCard size={14} />
              {t('pricing.badge')}
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mt-4">
              {selectedProduct ? t('pricing.title') : t('pricing.overview.title')}
            </h1>
            <p className="text-gray-700 mt-2 max-w-2xl">
              {selectedProduct ? t('pricing.subtitle') : t('pricing.overview.desc')}
            </p>
            {selectedProduct ? (
              <div className="mt-3 text-sm text-gray-700 flex items-center gap-2">
                <Layers size={16} className="text-gray-500 shrink-0" />
                <span>{t('pricing.serviceLabel', { name: selectedProduct.name })}</span>
              </div>
            ) : null}
            {selectedProduct?.description ? (
              <div className="mt-2 text-sm text-gray-600 max-w-2xl">{selectedProduct.description}</div>
            ) : null}
            {sessionChecked && !session ? (
              <div className="mt-4 text-sm text-gray-700 bg-[#f9f5ee] border border-gray-900/10 rounded-2xl p-3 max-w-2xl" data-testid="pricing-signin-hint">
                {t('pricing.signInHint')}
              </div>
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
                className="self-start md:self-auto px-4 py-2 rounded-full bg-emerald-800 hover:bg-emerald-900 text-white text-sm font-semibold"
              >
                {t('pricing.englishBundle.cta')}
              </button>
            </div>
          ) : null}

          {examBundleOffer ? (
            <div
              data-testid="exam-bundle-offer"
              className="rounded-2xl border border-amber-300 bg-amber-50/90 p-4 text-amber-950 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <div className="font-semibold">{t('pricing.bundle.title', { name: examBundleOffer.bundle.name })}</div>
                <div className="text-sm mt-1 max-w-2xl">
                  {t('pricing.bundle.body', {
                    name: examBundleOffer.bundle.name,
                    items: examBundleOffer.members.map((member) => member.name).join(', '),
                    price: formatMoney(examBundleOffer.plan.amount, examBundleOffer.plan.currency),
                    days: examBundleOffer.plan.duration_days ?? 30,
                  })}
                  {examBundleOffer.separately && examBundleOffer.separately > examBundleOffer.plan.amount
                    ? ` ${t('pricing.bundle.separately', { price: formatMoney(examBundleOffer.separately, examBundleOffer.plan.currency) })}`
                    : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => goSelectProduct(examBundleOffer.bundle)}
                className="self-start md:self-auto px-4 py-2 rounded-full bg-amber-700 hover:bg-amber-800 text-white text-sm font-semibold"
              >
                {t('pricing.bundle.cta', { name: examBundleOffer.bundle.name })}
              </button>
            </div>
          ) : null}
        </div>

        {error ? <div className="mt-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{t('pricing.error.load')}</div> : null}
        {productError ? (
          <div className="mt-4 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">{productError}</div>
        ) : null}

        {entitled && selectedProduct ? (
          <div className="mt-6 bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 text-emerald-900">
            <div className="font-semibold">{t('pricing.accessActiveTitle')}</div>
            {activePlanName ? <div className="text-sm mt-1">{t('pricing.activePlan', { plan: activePlanName })}</div> : null}
            <div className="text-sm opacity-80 mt-1">
              {endsAt ? t('pricing.endsAt', { date: new Date(endsAt).toLocaleString() }) : t('pricing.noExpiry')} {t('pricing.extendHint')}
            </div>
          </div>
        ) : null}

        {selectedProduct && selectedIsBundle ? (
          <div className="mt-6 bg-white/80 border border-gray-900/15 rounded-2xl p-4 text-sm text-gray-700">
            {t('pricing.bundle.noTrial')}
          </div>
        ) : null}

        {selectedProduct && !selectedIsBundle ? (
          <div className="mt-6 bg-blue-50/80 border border-blue-200 rounded-2xl p-4 text-blue-900" data-testid="trial-box">
            <div className="font-semibold">{t('pricing.trial.title')}</div>
            {!session ? (
              <>
                <div className="text-sm mt-1">{t('pricing.trial.signIn')}</div>
                <button
                  type="button"
                  onClick={() => navigate(authPath(currentPricingPath))}
                  className="mt-3 px-4 py-2 rounded-full bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold"
                >
                  {t('pricing.trial.signInCta')}
                </button>
              </>
            ) : (
              <>
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
                      type="button"
                      onClick={claimFreeTrial}
                      disabled={trialBusy || !trialInfo.claimable || !!entitled}
                      className="px-4 py-2 rounded-full bg-blue-700 hover:bg-blue-800 disabled:bg-gray-300 text-white text-sm font-semibold"
                    >
                      {trialBusy ? t('pricing.trial.claiming') : t('pricing.trial.claim')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={refreshTrialStatus}
                      disabled={trialLoading}
                      className="px-4 py-2 rounded-full border border-blue-300 bg-white/90 hover:bg-white disabled:bg-gray-100 text-blue-800 text-sm font-semibold"
                    >
                      {trialLoading ? t('pricing.trial.checking') : t('pricing.trial.check')}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ) : null}

        {selectedProduct ? (
          <div className="mt-10">
            <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">{t('pricing.plans.badge')}</div>
            <div className="text-lg font-bold text-gray-900 mt-1">{t('pricing.plans.title')}</div>
            {catalogLoading ? (
              <div className="mt-6 text-gray-600">{t('common.loadingPlans')}</div>
            ) : selectedPlans.length === 0 ? (
              <div className="mt-6 bg-white/70 backdrop-blur border border-gray-900/15 rounded-3xl p-6 text-gray-700">
                {t('pricing.plans.empty')}
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {selectedPlans.map((p) => renderPlanCard(selectedProduct, p))}
              </div>
            )}
          </div>
        ) : null}

        {!selectedProduct ? (
          <div className="mt-10 space-y-10" data-testid="pricing-overview">
            {catalogLoading ? <div className="text-gray-600">{t('common.loadingPlans')}</div> : null}
            {!catalogLoading && !error && groups.length === 0 ? (
              <div className="rounded-3xl border border-gray-900 bg-white/85 p-6 text-gray-700">{t('pricing.selectService.empty')}</div>
            ) : null}
            {groups.map((group) => (
              <section key={group.key} aria-labelledby={`pricing-group-${group.key}`}>
                <h2 id={`pricing-group-${group.key}`} className="text-2xl font-bold text-gray-900">
                  {t(GROUP_TITLE[group.key])}
                </h2>
                <div className="mt-4 space-y-6">
                  {group.products.map((product) => (
                    <div key={product.id} className="rounded-3xl border border-gray-900 bg-white/70 p-4 md:p-6">
                      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-xl font-bold text-gray-900">{product.name}</h3>
                            {isBundleProduct(product) ? (
                              <span className="text-[11px] uppercase tracking-wider font-semibold bg-amber-100 text-amber-800 border border-amber-200 rounded-full px-2 py-0.5">
                                {t('pricing.plan.bundle')}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-sm text-gray-600 mt-1">
                            {metaOf(product).short_description ?? product.description ?? t('plans.defaultServiceDesc')}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => goSelectProduct(product)}
                          className="self-start md:self-auto px-4 py-2 rounded-full border border-gray-900 text-sm font-semibold bg-white/80"
                        >
                          {t('plans.viewServicePricing')}
                        </button>
                      </div>
                      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {(plansByProduct.get(product.id) ?? []).map((plan) => renderPlanCard(product, plan))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : null}

        <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-3xl border border-gray-900/15 bg-white/85 backdrop-blur shadow-sm ring-1 ring-black/5 p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 shrink-0 rounded-2xl bg-emerald-600/10 border border-emerald-700/10 flex items-center justify-center text-emerald-800">
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
              type="button"
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
