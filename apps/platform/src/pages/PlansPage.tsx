import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { filterVisibleProducts, isArchivedProduct, productSlug } from '../lib/productVisibility';
import { SiteHeader, type SiteHeaderNavItem } from '../components/layout/SiteHeader';
import { SeoHead, createBreadcrumbSchema, createOrganizationSchema, createWebPageSchema } from '../components/seo/SeoHead';
import { useI18n } from '../i18n';
import type { BillingPlan } from '../lib/platformClient';
import type { TranslationKey } from '../i18n/locales/en';

type ProductRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
};

type LimitEntry = { key: string; label: string; value: number };

const formatMoney = (amount: number, currency: string): string => {
  if (currency.toUpperCase() === 'UZS') return `${amount.toLocaleString()} UZS`;
  return `${amount.toLocaleString()} ${currency}`;
};

const planTagline = (p: BillingPlan): string => {
  const meta: any = p.metadata ?? {};
  return typeof meta.tagline === 'string' ? meta.tagline : '';
};

const planDescription = (p: BillingPlan): string => {
  const meta: any = p.metadata ?? {};
  return typeof meta.description === 'string' ? meta.description : '';
};

const planLimits = (
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

const sortPlans = (a: BillingPlan, b: BillingPlan): number => {
  const ar = isRecommended(a) ? 0 : 1;
  const br = isRecommended(b) ? 0 : 1;
  if (ar !== br) return ar - br;

  const ao = Number((a.metadata as any)?.display_order ?? NaN);
  const bo = Number((b.metadata as any)?.display_order ?? NaN);
  if (Number.isFinite(ao) && Number.isFinite(bo) && ao !== bo) return ao - bo;
  if (Number.isFinite(ao) && !Number.isFinite(bo)) return -1;
  if (!Number.isFinite(ao) && Number.isFinite(bo)) return 1;
  return Number(a.amount ?? 0) - Number(b.amount ?? 0);
};

export const PlansPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [plans, setPlans] = useState<BillingPlan[]>([]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [{ data: productsRes, error: prodErr }, { data: plansRes, error: planErr }] = await Promise.all([
          supabase
            .from('products')
            .select('id,name,type,status,description,metadata')
            .eq('status', 'active')
            .order('name', { ascending: true }),
          supabase
            .from('plans')
            .select('id, product_id, name, amount, currency, duration_days, is_active, metadata, created_at')
            .eq('is_active', true)
            .order('created_at', { ascending: true }),
        ]);

        if (prodErr) throw prodErr;
        if (planErr) throw planErr;
        setProducts(filterVisibleProducts((productsRes ?? []) as ProductRow[]));
        setPlans((plansRes ?? []) as BillingPlan[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : t('plans.error.load'));
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, []);

  const plansByProduct = useMemo(() => {
    const map = new Map<string, BillingPlan[]>();
    plans.forEach((plan) => {
      const list = map.get(plan.product_id) ?? [];
      list.push(plan);
      map.set(plan.product_id, list);
    });
    for (const [key, value] of map.entries()) {
      map.set(key, value.slice().sort(sortPlans));
    }
    return map;
  }, [plans]);

  const productMap = useMemo(() => {
    const map = new Map<string, ProductRow>();
    products.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  const handleChoosePlan = (product: ProductRow, plan: BillingPlan) => {
    const qs = new URLSearchParams();
    qs.set('plan_id', plan.id);
    qs.set('product', productSlug(product));
    qs.set('returnTo', '/');
    navigate(`/checkout?${qs.toString()}`);
  };

  const navItems: SiteHeaderNavItem[] = [
    { id: 'home', label: t('nav.home'), onClick: () => navigate('/') },
    { id: 'about', label: t('nav.about'), onClick: () => navigate('/about') },
    { id: 'pricing', label: t('nav.pricing'), onClick: () => navigate('/pricing') },
    { id: 'contact', label: t('nav.contact'), onClick: () => navigate('/contact') },
    { id: 'faq', label: t('nav.faq'), onClick: () => navigate('/faq') },
    { id: 'plans', label: t('nav.plans'), onClick: () => navigate('/plans'), active: true },
  ];

  return (
    <div className="min-h-screen bg-[#f6f1e8] text-gray-900">
      <SeoHead
        title="Schood Plans | IELTS, TOEFL, SAT, and English Access"
        description="Browse Schood plans for IELTS, TOEFL, SAT, and English services, including shared platform access and product-level options."
        path="/plans"
        keywords={['Schood plans', 'IELTS pricing', 'TOEFL pricing', 'SAT pricing', 'English learning plans']}
        schema={[
          createOrganizationSchema(),
          createWebPageSchema({
            title: 'Schood Plans | IELTS, TOEFL, SAT, and English Access',
            description:
              'Browse Schood plans for IELTS, TOEFL, SAT, and English services, including shared platform access and product-level options.',
            path: '/plans',
          }),
          createBreadcrumbSchema([
            { name: 'Schood', path: '/' },
            { name: 'Plans', path: '/plans' },
          ]),
        ]}
      />

      <SiteHeader navItems={navItems} />
      <div className="px-6 md:px-10 pt-8 pb-10">
        <div className="max-w-6xl mx-auto">
          <div className="rounded-3xl border border-gray-900 bg-white/85 p-6 md:p-8">
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-gray-800 bg-white/70 border border-gray-900 rounded-full px-3 py-1">
              <Sparkles size={14} />
              {t('plans.badge')}
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mt-4">{t('plans.title')}</h1>
            <p className="text-gray-600 mt-2 max-w-2xl">
              {t('plans.subtitle')}
            </p>
            <div className="mt-5 flex flex-col sm:flex-row gap-2 sm:items-center">
              <button
                onClick={() => navigate('/')}
                className="w-full sm:w-auto px-4 py-2 rounded-full border border-gray-900 bg-white/70 text-sm font-semibold"
              >
                {t('plans.backHome')}
              </button>
              <button
                onClick={() => navigate('/contact')}
                className="w-full sm:w-auto px-4 py-2 rounded-full border border-gray-900 bg-white/70 text-sm font-semibold"
              >
                {t('common.contactSupport')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 md:px-10 pb-24 md:pb-16">
        <div className="max-w-6xl mx-auto">
          {loading ? <div className="text-gray-600">{t('common.loadingPlans')}</div> : null}
          {error ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div> : null}

          {!loading && products.length === 0 ? (
            <div className="rounded-3xl border border-gray-900 bg-white/80 p-6 text-gray-700">
              {t('plans.emptyProducts')}
            </div>
          ) : null}

          <div className="space-y-8">
            {products.map((product) => {
              const productPlans = plansByProduct.get(product.id) ?? [];
              if (productPlans.length === 0) return null;
              return (
                <div key={product.id} className="rounded-3xl border border-gray-900 bg-white/85 p-6">
                  <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-wider font-semibold text-gray-600">{t('plans.service')}</div>
                      <div className="text-2xl font-bold mt-1">{product.name}</div>
                      <div className="text-sm text-gray-600 mt-1">{product.description ?? t('plans.defaultServiceDesc')}</div>
                    </div>
                    <button
                      onClick={() => navigate(`/pricing?product=${encodeURIComponent(productSlug(product))}&returnTo=/`)}
                      className="px-4 py-2 rounded-full border border-gray-900 text-sm font-semibold bg-white/70"
                    >
                      {t('plans.viewServicePricing')}
                    </button>
                  </div>

                  <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {productPlans.map((plan) => {
                      const recommended = isRecommended(plan);
                      const limits = planLimits(plan, t);
                      const included = getPlanIncludedProducts(plan, productMap, product.id);
                      return (
                        <div
                          key={plan.id}
                          className={[
                            'rounded-3xl border p-5',
                            recommended ? 'border-emerald-300 bg-emerald-50/60' : 'border-gray-300 bg-white',
                          ].join(' ')}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-semibold text-gray-900">{plan.name}</div>
                              {included.length > 0 ? (
                                <span className="text-[11px] uppercase tracking-wider font-semibold bg-amber-100 text-amber-800 border border-amber-200 rounded-full px-2 py-0.5">
                                  {t('plans.badgeBundle')}
                                </span>
                              ) : null}
                            </div>
                            {recommended ? (
                              <div className="text-xs font-semibold text-emerald-800 bg-emerald-100 border border-emerald-300 rounded-full px-2 py-0.5 flex items-center gap-1">
                                <Crown size={12} /> {t('plans.badgePopular')}
                              </div>
                            ) : null}
                          </div>
                          {planTagline(plan) ? <div className="text-xs text-gray-600 mt-1">{planTagline(plan)}</div> : null}
                          {planDescription(plan) ? <div className="text-sm text-gray-600 mt-2">{planDescription(plan)}</div> : null}
                          {included.length > 0 ? (
                            <div className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 inline-flex items-center gap-1">
                              {t('plans.includes', { items: included.map((item) => item.name).join(', ') })}
                            </div>
                          ) : null}
                          <div className="mt-4 text-2xl font-bold text-gray-900">{formatMoney(plan.amount, plan.currency)}</div>
                          <div className="text-sm text-gray-600 mt-1">
                            {plan.duration_days ? t('plans.daysAccess', { days: plan.duration_days }) : t('plans.noExpiry')}
                          </div>
                          {limits.length > 0 ? (
                            <div className="mt-4 text-xs text-gray-600 space-y-1">
                              {limits.map((limit) => (
                                <div key={limit.key} className="flex items-center justify-between gap-2">
                                  <span>{limit.label}</span>
                                  <span className="font-semibold text-gray-900">{limit.value}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          <button
                            onClick={() => handleChoosePlan(product, plan)}
                            className="mt-5 w-full px-3 py-2 rounded-full bg-[#0f172a] text-white font-semibold"
                          >
                            {t('plans.choosePlan')}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
