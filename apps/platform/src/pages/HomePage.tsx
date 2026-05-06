import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowUpRight, Building2, ChevronRight, Crown, LayoutGrid, Sparkles, Users2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getAccessEffective, getMe } from '../lib/platformClient';
import { filterVisibleProducts, productSlug } from '../lib/productVisibility';
import { isExternalUrl, sanitizeReturnTo } from '../lib/returnTo';
import { SiteHeader, type SiteHeaderAction, type SiteHeaderNavItem } from '../components/layout/SiteHeader';
import {
  SeoHead,
  createBreadcrumbSchema,
  createOrganizationSchema,
  createWebPageSchema,
  createWebSiteSchema,
} from '../components/seo/SeoHead';
import { discoveryPageCards, getDiscoveryPageForProductSlug } from '../content/discoveryPages';
import { useI18n } from '../i18n';

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
  tagline?: string;
  included_product_ids?: string[];
  sort_order?: number;
};

const resolveProductLandingUrl = (p: ProductRow): string | null => {
  const meta = (p.metadata ?? {}) as ProductMeta;
  const explicit = typeof meta.app_url === 'string' ? meta.app_url.trim() : '';
  return explicit || null;
};

const metaValue = (p: ProductRow): ProductMeta => (p.metadata ?? {}) as ProductMeta;

const HOME_TITLE = 'Schood Platform | IELTS, TOEFL, SAT, and English Learning';
const HOME_DESCRIPTION =
  'Discover IELTS, TOEFL, SAT, and English learning services on Schood with shared access, clearer service pages, and connected study workflows.';
const HOME_SCHEMA = [
  createOrganizationSchema(),
  createWebSiteSchema(HOME_TITLE, HOME_DESCRIPTION, '/'),
  createWebPageSchema({
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    path: '/',
  }),
  createBreadcrumbSchema([{ name: 'Schood', path: '/' }]),
];

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();

  const returnTo = useMemo(() => {
    const raw = new URLSearchParams(location.search).get('returnTo');
    return raw ? sanitizeReturnTo(raw) : '/';
  }, [location.search]);

  useEffect(() => {
    const ref = new URLSearchParams(location.search).get('ref')?.trim().toUpperCase();
    if (ref) window.localStorage.setItem('schood:referral_code', ref);
  }, [location.search]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [entitlements, setEntitlements] = useState<Set<string>>(new Set());
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string>('user');

  const typeLabel = (value: string): string => {
    switch (value) {
      case 'exam':
        return t('type.exam');
      case 'practice':
        return t('type.practice');
      case 'tool':
        return t('type.tool');
      case 'course':
        return t('type.course');
      default:
        return value || t('type.product');
    }
  };

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      setProducts([]);
      setEntitlements(new Set());
      setEmail(null);
      setRole('user');

      try {
        const { data: productsRes, error: prodErr } = await supabase
          .from('products')
          .select('id,name,type,status,description,metadata')
          .eq('status', 'active')
          .order('name', { ascending: true });

        if (prodErr) throw prodErr;
        const list = filterVisibleProducts((productsRes ?? []) as ProductRow[]);

        const sorted = list.slice().sort((a, b) => {
          const ao = Number((metaValue(a).sort_order as number | undefined) ?? NaN);
          const bo = Number((metaValue(b).sort_order as number | undefined) ?? NaN);
          if (Number.isFinite(ao) && Number.isFinite(bo) && ao !== bo) return ao - bo;
          if (Number.isFinite(ao) && !Number.isFinite(bo)) return -1;
          if (!Number.isFinite(ao) && Number.isFinite(bo)) return 1;
          return a.name.localeCompare(b.name);
        });

        setProducts(sorted);

        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          const [me, effective] = await Promise.all([
            getMe(sessionData.session.access_token),
            getAccessEffective(sessionData.session.access_token).catch(() => null),
          ]);
          setEmail(me.user.email ?? null);
          setRole(String(me.user.role ?? 'user'));
          const set = new Set<string>();
          (me.entitlements ?? []).forEach((e) => {
            if (e.resource_type === 'product' && e.resource_id) set.add(e.resource_id);
          });
          (effective?.effective_product_ids ?? []).forEach((productId) => {
            if (productId) set.add(String(productId));
          });
          setEntitlements(set);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : t('home.error.load'));
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, []);

  const isAuthed = !!email;
  const isAdmin = String(role).toLowerCase() === 'admin';

  const openPricing = (product?: ProductRow | null) => {
    const qs = new URLSearchParams();
    if (product) qs.set('product', productSlug(product));
    const appUrl = product ? metaValue(product).app_url : null;
    const targetReturn = appUrl ? String(appUrl) : returnTo;
    qs.set('returnTo', targetReturn);
    navigate(`/pricing?${qs.toString()}`);
  };

  const openProduct = (product: ProductRow) => {
    const appUrl = resolveProductLandingUrl(product);
    if (appUrl) {
      if (isExternalUrl(appUrl)) window.location.assign(appUrl);
      else navigate(appUrl);
      return;
    }
    openPricing(product);
  };

  const openHref = (href: string) => {
    if (isExternalUrl(href)) {
      window.location.assign(href);
      return;
    }
    navigate(href);
  };

  const featuredProduct = products[0] ?? null;
  const productCount = products.length;
  const accessCount = products.reduce((count, product) => (entitlements.has(product.id) ? count + 1 : count), 0);
  const subscribedProducts = useMemo(
    () => products.filter((product) => entitlements.has(product.id)),
    [products, entitlements],
  );

  const navItems: SiteHeaderNavItem[] = [
    { id: 'about', label: t('nav.about'), onClick: () => navigate('/about') },
    {
      id: 'services',
      label: t('nav.services'),
      onClick: () => document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' }),
    },
    { id: 'plans', label: t('nav.plans'), onClick: () => navigate('/plans') },
    { id: 'redeem', label: 'Redeem', onClick: () => navigate('/redeem') },
    { id: 'candidate', label: t('nav.candidate'), onClick: () => navigate('/candidate') },
    { id: 'partner', label: t('nav.partner'), onClick: () => navigate('/partner') },
    { id: 'contact', label: t('nav.contact'), onClick: () => navigate('/contact') },
    { id: 'faq', label: t('nav.faq'), onClick: () => navigate('/faq') },
  ];

  const actions: SiteHeaderAction[] = isAuthed
    ? [
        { id: 'account', label: t('common.account'), onClick: () => navigate('/account') },
        ...(isAdmin ? [{ id: 'admin', label: t('common.admin'), onClick: () => navigate('/admin'), primary: true }] : []),
      ]
    : [
        {
          id: 'login',
          label: t('common.login'),
          onClick: () => navigate(`/auth?mode=signin&returnTo=${encodeURIComponent('/')}`),
        },
        {
          id: 'signup',
          label: t('common.signup'),
          onClick: () => navigate(`/auth?mode=signup&returnTo=${encodeURIComponent('/')}`),
          primary: true,
        },
      ];

  return (
    <div className="min-h-screen bg-[#f6f1e8] text-gray-900">
      <SeoHead
        title={HOME_TITLE}
        description={HOME_DESCRIPTION}
        path="/"
        keywords={[
          'IELTS preparation platform',
          'TOEFL practice platform',
          'Digital SAT practice',
          'English learning platform',
          'Schood',
        ]}
        schema={HOME_SCHEMA}
      />

      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 -right-24 h-[420px] w-[420px] rounded-full bg-emerald-200/60 blur-3xl" />
          <div className="absolute -bottom-32 -left-24 h-[480px] w-[480px] rounded-full bg-amber-200/40 blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(#00000010_1px,transparent_1px)] [background-size:22px_22px] opacity-40" />
          <div className="absolute left-0 right-0 bottom-0 h-28 bg-gradient-to-b from-transparent via-[#f6f1e8]/80 to-[#f6f1e8]" />
        </div>

        <SiteHeader className="relative z-10" navItems={navItems} actions={actions} />

        <section className="relative z-10 px-6 md:px-10 pt-12 pb-20 lg:pt-16 lg:pb-24 lg:min-h-[75vh]">
          <div className="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-6 space-y-6">
              <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-gray-800 bg-white/70 border border-gray-900 rounded-full px-3 py-1">
                <Sparkles size={14} />
                {t('home.badge')}
              </div>
              <h1 className="text-4xl md:text-5xl font-bold leading-tight">
                {t('home.title')}
              </h1>
              <p className="text-gray-700 text-lg max-w-xl">
                {t('home.subtitle')}
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => navigate('/plans')}
                  className="w-full sm:w-auto px-5 py-3 rounded-full bg-[#0f172a] text-white font-semibold flex items-center justify-center gap-2"
                >
                  {t('home.cta.explorePlans')} <ChevronRight size={18} />
                </button>
                <button
                  onClick={() => document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' })}
                  className="w-full sm:w-auto px-5 py-3 rounded-full border border-gray-900 bg-white/70 text-gray-900 font-semibold"
                >
                  {t('home.cta.viewServices')}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                <div className="rounded-2xl bg-white/80 border border-gray-900 p-4">
                  <div className="text-sm font-semibold text-gray-900">{t('home.card.oneAccount.title')}</div>
                  <div className="text-sm text-gray-600 mt-1">{t('home.card.oneAccount.desc')}</div>
                </div>
                <div className="rounded-2xl bg-white/80 border border-gray-900 p-4">
                  <div className="text-sm font-semibold text-gray-900">{t('home.card.realPacing.title')}</div>
                  <div className="text-sm text-gray-600 mt-1">{t('home.card.realPacing.desc')}</div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-3xl border border-gray-900 bg-white/80 p-5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-600">{t('home.stats.services')}</div>
                  <div className="text-3xl font-bold mt-2">{productCount}</div>
                  <div className="text-sm text-gray-600 mt-2">{t('home.stats.servicesDesc')}</div>
                </div>
                <div className="rounded-3xl border border-gray-900 bg-white/80 p-5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-600">{t('home.stats.access')}</div>
                  <div className="text-3xl font-bold mt-2">{accessCount}</div>
                  <div className="text-sm text-gray-600 mt-2">{t('home.stats.accessDesc')}</div>
                </div>

                <div className="col-span-2 rounded-3xl border border-gray-900 bg-white/90 p-5">
                  <div className="text-sm font-semibold text-gray-900">{t('home.featured.title')}</div>
                  <div className="mt-3 text-xl font-bold">{featuredProduct?.name ?? t('home.featured.emptyTitle')}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    {featuredProduct
                      ? metaValue(featuredProduct).tagline ?? featuredProduct.description ?? t('home.featured.defaultDesc')
                      : t('home.featured.emptyDesc')}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => (featuredProduct ? openProduct(featuredProduct) : openPricing(null))}
                      className="px-4 py-2 rounded-full bg-[#0f172a] text-white text-sm font-semibold"
                    >
                      {featuredProduct ? t('home.featured.cta.open') : t('home.featured.cta.explore')}
                    </button>
                    <button
                      onClick={() => openPricing(featuredProduct)}
                      className="px-4 py-2 rounded-full border border-gray-900 text-sm font-semibold"
                    >
                      {t('home.featured.cta.pricing')}
                    </button>
                  </div>
                </div>

                <div className="col-span-2 rounded-3xl border border-gray-900 bg-[#0f172a] text-white p-5">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <Crown size={16} /> {t('home.guided.title')}
                  </div>
                  <div className="text-sm text-white/80 mt-2">{t('home.guided.desc')}</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="px-6 md:px-10 pb-12">
        <div className="mx-auto max-w-6xl rounded-3xl border border-gray-900 bg-white/85 p-6 md:p-7">
          <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-600">
                <Building2 size={14} />
                Education centers
              </div>
              <h2 className="mt-2 text-2xl font-bold text-gray-900">Run Schood access through your center.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
                Approved centers get a dedicated office for wallet credits, voucher distribution, staff access, and teacher reports.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/education-centers')}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-900 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900"
            >
              Center cooperation
              <ArrowUpRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {subscribedProducts.length > 0 ? (
        <section id="my-services" className="px-6 md:px-10 pb-12">
          <div className="max-w-6xl mx-auto rounded-3xl border border-gray-900 bg-white/85 p-6">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-600 flex items-center gap-2">
              <Crown size={14} /> {t('home.subscribed.badge')}
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mt-2">{t('home.subscribed.title')}</h2>
            <p className="text-gray-600 mt-2">
              {t('home.subscribed.desc')}
            </p>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {subscribedProducts.map((product) => {
                const meta = metaValue(product);
                const shortDesc = meta.short_description ?? product.description ?? t('home.subscribed.fallback');
                return (
                  <div key={`subscribed-${product.id}`} className="rounded-2xl border border-gray-900/20 bg-white/90 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wider text-gray-600">{typeLabel(product.type)}</div>
                    <div className="mt-2 text-lg font-bold text-gray-900">{product.name}</div>
                    <div className="mt-2 text-sm text-gray-600">{shortDesc}</div>
                    <button
                      onClick={() => openProduct(product)}
                      className="mt-4 w-full px-3 py-2 rounded-full bg-[#0f172a] text-white text-sm font-semibold flex items-center justify-center gap-2"
                    >
                      {t('common.openService')} <ArrowUpRight size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      <section id="about" className="px-6 md:px-10 py-12">
        <div className="mx-auto max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="rounded-3xl border border-gray-900 bg-white/80 p-6">
            <div className="text-sm font-semibold">{t('home.about.realism.title')}</div>
            <p className="text-sm text-gray-600 mt-2">{t('home.about.realism.desc')}</p>
          </div>
          <div className="rounded-3xl border border-gray-900 bg-white/80 p-6">
            <div className="text-sm font-semibold">{t('home.about.structured.title')}</div>
            <p className="text-sm text-gray-600 mt-2">{t('home.about.structured.desc')}</p>
          </div>
          <div className="rounded-3xl border border-gray-900 bg-white/80 p-6">
            <div className="text-sm font-semibold">{t('home.about.progress.title')}</div>
            <p className="text-sm text-gray-600 mt-2">{t('home.about.progress.desc')}</p>
          </div>
        </div>
      </section>

      <section className="px-6 md:px-10 pb-12">
        <div className="max-w-6xl mx-auto rounded-3xl border border-gray-900 bg-white/85 p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-gray-900">{t('home.support.title')}</div>
            <div className="text-sm text-gray-600 mt-1">{t('home.support.desc')}</div>
          </div>
          <button
            onClick={() => navigate('/contact')}
            className="px-4 py-2 rounded-full bg-[#0f172a] text-white text-sm font-semibold"
          >
            {t('common.contactSupport')}
          </button>
        </div>
      </section>

      <section id="partners" className="px-6 md:px-10 pb-12">
        <div className="max-w-6xl mx-auto overflow-hidden rounded-3xl border border-gray-900 bg-[#0f172a] text-white">
          <div className="grid gap-0 lg:grid-cols-12">
            <div className="lg:col-span-7 p-6 md:p-8">
              <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-white/70">
                <Users2 size={14} /> {t('home.partner.badge')}
              </div>
              <h2 className="mt-3 text-2xl md:text-3xl font-bold">{t('home.partner.title')}</h2>
              <p className="mt-3 max-w-2xl text-sm md:text-base text-white/75">{t('home.partner.desc')}</p>
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => navigate('/partner')}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-full bg-white text-[#0f172a] text-sm font-semibold flex items-center justify-center gap-2"
                >
                  {t('home.partner.cta')} <ArrowUpRight size={16} />
                </button>
                <button
                  onClick={() => navigate('/candidate')}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-full border border-white/30 text-white text-sm font-semibold"
                >
                  {t('home.partner.secondary')}
                </button>
              </div>
            </div>
            <div className="lg:col-span-5 border-t border-white/15 bg-white/10 p-6 md:p-8 lg:border-l lg:border-t-0">
              <div className="divide-y divide-white/15 rounded-2xl border border-white/15">
                <div className="p-4">
                  <div className="text-sm font-semibold">{t('home.partner.item1.title')}</div>
                  <div className="mt-1 text-sm text-white/70">{t('home.partner.item1.desc')}</div>
                </div>
                <div className="p-4">
                  <div className="text-sm font-semibold">{t('home.partner.item2.title')}</div>
                  <div className="mt-1 text-sm text-white/70">{t('home.partner.item2.desc')}</div>
                </div>
                <div className="p-4">
                  <div className="text-sm font-semibold">{t('home.partner.item3.title')}</div>
                  <div className="mt-1 text-sm text-white/70">{t('home.partner.item3.desc')}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="services" className="px-6 md:px-10 pb-14">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                <LayoutGrid size={14} /> {t('home.services.badge')}
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mt-2">{t('home.services.title')}</h2>
              <p className="text-gray-600 mt-1">{t('home.services.desc')}</p>
            </div>
          </div>

          {loading ? <div className="mt-8 text-gray-600">{t('common.loadingServices')}</div> : null}
          {error ? <div className="mt-8 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div> : null}

          {!loading && products.length === 0 ? (
            <div className="mt-8 rounded-3xl border border-gray-900 bg-white/70 p-6 text-gray-700">
              {t('home.services.empty')}
            </div>
          ) : null}

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {products.map((product) => {
              const meta = metaValue(product);
              const hasAccess = entitlements.has(product.id);
              const shortDesc = meta.short_description ?? product.description ?? t('home.service.fallbackDesc');
              const tagline = meta.tagline ?? '';
              const discoveryPath = getDiscoveryPageForProductSlug(productSlug(product));
              return (
                <div key={product.id} className="rounded-3xl border border-gray-900 bg-white/85 p-6 flex flex-col">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                      {typeLabel(product.type)}
                    </div>
                  </div>
                  <div className="mt-3 text-lg font-bold text-gray-900">{product.name}</div>
                  {tagline ? <div className="text-sm text-gray-600 mt-1">{tagline}</div> : null}
                  <div className="text-sm text-gray-600 mt-3">{shortDesc}</div>

                  <div className="mt-6 flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (hasAccess) {
                          openProduct(product);
                          return;
                        }
                        openPricing(product);
                      }}
                      className="flex-1 px-3 py-2 rounded-full bg-[#0f172a] text-white font-semibold flex items-center justify-center gap-2"
                    >
                      {hasAccess ? t('home.service.cta.open') : t('home.service.cta.pricingTrial')}
                      <ArrowUpRight size={16} />
                    </button>
                    <button
                      onClick={() => openPricing(product)}
                      className="px-3 py-2 rounded-full border border-gray-900 text-gray-700 font-semibold"
                      title={t('nav.plans')}
                    >
                      <Users2 size={16} />
                    </button>
                  </div>
                  {discoveryPath ? (
                    <a
                      href={discoveryPath}
                      className="mt-3 text-sm font-semibold text-gray-700 underline underline-offset-2"
                    >
                      Learn more about this service
                    </a>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="pricing" className="px-6 md:px-10 pb-16">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-3xl border border-gray-900 bg-white/85 p-6">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-600">{t('home.pricing.badge')}</div>
            <div className="text-2xl font-bold text-gray-900 mt-2">{t('home.pricing.title')}</div>
            <p className="text-gray-600 mt-2">
              {t('home.pricing.desc')}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={() => navigate('/plans')}
                className="px-4 py-2 rounded-full bg-[#0f172a] text-white font-semibold"
              >
                {t('home.pricing.cta.allPlans')}
              </button>
              <button
                onClick={() => openPricing(null)}
                className="px-4 py-2 rounded-full border border-gray-900 font-semibold bg-white/70"
              >
                {t('home.pricing.cta.servicePricing')}
              </button>
            </div>
          </div>
          <div id="faq" className="lg:col-span-5 rounded-3xl border border-gray-900 bg-[#0f172a] text-white p-6">
            <div className="text-sm font-semibold">{t('home.faq.title')}</div>
            <div className="mt-3 text-sm text-white/80 space-y-2">
              <div>{t('home.faq.item1')}</div>
              <div>{t('home.faq.item2')}</div>
              <div>{t('home.faq.item3')}</div>
            </div>
          </div>
        </div>
      </section>

      <section id="service-landings" className="px-6 md:px-10 pb-16">
        <div className="max-w-6xl mx-auto rounded-3xl border border-gray-900 bg-white/85 p-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-600">{t('home.landings.badge')}</div>
          <h2 className="text-2xl font-bold text-gray-900 mt-2">{t('home.landings.title')}</h2>
          <p className="text-gray-600 mt-2">
            {t('home.landings.desc')}
          </p>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {discoveryPageCards.map((page) => {
              return (
                <div key={`landing-${page.key}`} className="rounded-2xl border border-gray-900/20 bg-white/90 p-4">
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">{page.label}</div>
                  <div className="mt-2 text-sm font-semibold text-gray-900">{page.title}</div>
                  <div className="mt-2 text-sm text-gray-600">{page.description}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => openHref(page.path)}
                      className="px-3 py-2 rounded-full bg-[#0f172a] text-white text-sm font-semibold"
                    >
                      {t('home.landings.openLanding')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="px-6 md:px-10 pb-10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-t border-gray-300/70 pt-6 text-sm text-gray-600">
          <div>{t('home.footer.platform')}</div>
          <div className="flex items-center gap-4">
            <span>{t('home.footer.account')}</span>
            <button onClick={() => navigate('/contact')} className="underline underline-offset-2">
              {t('common.contactSupport')}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};


