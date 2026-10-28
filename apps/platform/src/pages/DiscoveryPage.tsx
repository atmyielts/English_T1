import React, { useEffect } from 'react';
import { ArrowUpRight, BookOpenCheck, Compass, ExternalLink, Sparkles, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { SiteHeader, type SiteHeaderNavItem } from '../components/layout/SiteHeader';
import {
  SeoHead,
  createBreadcrumbSchema,
  createFaqSchema,
  createOrganizationSchema,
  createSoftwareApplicationSchema,
  createWebPageSchema,
} from '../components/seo/SeoHead';
import { discoveryPagesByKey, type DiscoveryLink, type DiscoveryPageKey } from '../content/discoveryPages';
import { platformJourney } from '../lib/journeyAnalytics';
import { ExamFamilyCards } from '../components/platform/ExamFamilyCards';

type DiscoveryPageProps = {
  pageKey: DiscoveryPageKey;
};

const isExternal = (href: string): boolean => /^https?:\/\//i.test(href);

const openHref = async (navigate: ReturnType<typeof useNavigate>, href: string) => {
  if (isExternal(href)) {
    let hasSession = false;
    try {
      const { data } = await supabase.auth.getSession();
      hasSession = Boolean(data.session);
    } catch {
      hasSession = false;
    }
    if (hasSession) {
      navigate(`/auth?returnTo=${encodeURIComponent(href)}`);
      return;
    }
    window.location.assign(href);
    return;
  }
  navigate(href);
};

const LinkButton: React.FC<{
  href: string;
  label: string;
  primary?: boolean;
  onSelect?: () => void;
}> = ({ href, label, primary = false, onSelect }) => {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => {
        onSelect?.();
        void openHref(navigate, href);
      }}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-colors',
        primary ? 'bg-[#0f172a] text-white' : 'border border-[#1f2937] bg-white text-gray-900',
      ].join(' ')}
    >
      {label} {isExternal(href) ? <ArrowUpRight size={16} /> : <ExternalLink size={16} />}
    </button>
  );
};

const LinkCard: React.FC<{ link: DiscoveryLink }> = ({ link }) => {
  const navigate = useNavigate();

  return (
    <a
      href={link.href}
      onClick={(event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        void openHref(navigate, link.href);
      }}
      className="rounded-2xl border border-gray-900/15 bg-white p-4 hover:bg-gray-50 transition-colors"
      target={link.external ? '_self' : undefined}
      rel={link.external ? 'noreferrer' : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-base font-semibold text-gray-900">{link.label}</div>
        {link.external ? <ArrowUpRight size={16} className="text-gray-500 shrink-0" /> : <ExternalLink size={16} className="text-gray-500 shrink-0" />}
      </div>
      <p className="mt-2 text-sm text-gray-600">{link.description}</p>
    </a>
  );
};

export const DiscoveryPage: React.FC<DiscoveryPageProps> = ({ pageKey }) => {
  const navigate = useNavigate();
  const page = discoveryPagesByKey[pageKey];

  useEffect(() => {
    if (page.family !== 'english') return;
    platformJourney.track('english_discovery_viewed', { target: page.key, once: true });
  }, [page.family, page.key]);

  const navItems: SiteHeaderNavItem[] = [
    { id: 'home', label: 'Platform', onClick: () => navigate('/') },
    { id: 'ielts', label: 'IELTS', onClick: () => navigate('/ielts'), active: page.family === 'ielts' },
    { id: 'toefl', label: 'TOEFL', onClick: () => navigate('/toefl'), active: page.family === 'toefl' },
    { id: 'sat', label: 'SAT', onClick: () => navigate('/sat'), active: page.family === 'sat' },
    { id: 'english', label: 'English', onClick: () => navigate('/english'), active: page.family === 'english' },
    { id: 'plans', label: 'Plans', onClick: () => navigate('/plans') },
    { id: 'contact', label: 'Contact', onClick: () => navigate('/contact') },
  ];

  const schema = [
    createOrganizationSchema(),
    createWebPageSchema({
      title: page.seoTitle,
      description: page.seoDescription,
      path: page.path,
    }),
    createBreadcrumbSchema([
      { name: 'Schood', path: '/' },
      { name: page.cardTitle, path: page.path },
    ]),
    createSoftwareApplicationSchema({
      name: page.appName,
      description: page.seoDescription,
      url: page.primaryCta.href,
      applicationCategory: page.applicationCategory,
    }),
    createFaqSchema(page.faq.map((item) => ({ question: item.question, answer: item.answer }))),
  ];

  return (
    <div className="min-h-screen bg-[#f6f1e8] text-gray-900">
      <SeoHead
        title={page.seoTitle}
        description={page.seoDescription}
        path={page.path}
        keywords={page.keywords}
        schema={schema}
      />

      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 -right-24 h-[420px] w-[420px] rounded-full bg-emerald-200/55 blur-3xl" />
          <div className="absolute -bottom-28 -left-24 h-[480px] w-[480px] rounded-full bg-amber-200/45 blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(#00000010_1px,transparent_1px)] [background-size:22px_22px] opacity-35" />
        </div>

        <SiteHeader className="relative z-10" navItems={navItems} />

        <main className="relative z-10 px-6 md:px-10 pt-10 pb-24">
          <div className="mx-auto max-w-6xl space-y-8">
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 rounded-[2rem] border border-gray-900 bg-white/90 p-6 md:p-8 lg:p-10">
              <div className="lg:col-span-7">
                <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-gray-700">
                  <Sparkles size={14} />
                  {page.eyebrow}
                </div>
                <h1 className="mt-3 text-3xl md:text-5xl font-bold leading-tight max-w-3xl">{page.heroTitle}</h1>
                <p className="mt-4 text-base md:text-lg text-gray-700 max-w-3xl leading-relaxed">{page.heroDescription}</p>
                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                  <LinkButton
                    href={page.primaryCta.href}
                    label={page.primaryCta.label}
                    primary
                    onSelect={page.family === 'english'
                      ? () => platformJourney.track('platform_path_selected', { target: 'english_hub' })
                      : undefined}
                  />
                  {page.secondaryCta ? (
                    <LinkButton
                      href={page.secondaryCta.href}
                      label={page.secondaryCta.label}
                      onSelect={page.family === 'english'
                        ? () => platformJourney.track('platform_path_selected', { target: 'english_plans' })
                        : undefined}
                    />
                  ) : null}
                </div>
                <ul className="mt-6 space-y-2">
                  {page.heroBullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2 text-sm text-gray-700">
                      <Target size={16} className="mt-0.5 shrink-0 text-gray-500" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="lg:col-span-5 grid grid-cols-1 gap-4">
                {page.highlights.map((highlight) => (
                  <div key={highlight.label} className="rounded-3xl border border-gray-900/15 bg-[#f9f5ee] p-5">
                    <div className="text-3xl font-bold text-gray-900">{highlight.value}</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">{highlight.label}</div>
                    <div className="mt-2 text-sm text-gray-600">{highlight.detail}</div>
                  </div>
                ))}
              </div>
            </section>

            {page.family === 'ielts' || page.family === 'sat' ? (
              <section className="rounded-[2rem] border border-gray-900 bg-white/70 p-4 md:p-6">
                <ExamFamilyCards families={[page.family]} onOpen={(href) => void openHref(navigate, href)} />
              </section>
            ) : null}

            <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {page.features.map((feature) => (
                <article key={feature.title} className="rounded-3xl border border-gray-900 bg-white/85 p-6">
                  <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-gray-600">
                    <BookOpenCheck size={14} />
                    What this page helps with
                  </div>
                  <h2 className="mt-3 text-xl font-bold text-gray-900">{feature.title}</h2>
                  <p className="mt-3 text-sm leading-relaxed text-gray-700">{feature.description}</p>
                </article>
              ))}
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <article className="lg:col-span-7 rounded-3xl border border-gray-900 bg-white/85 p-6">
                <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-gray-600">
                  <Compass size={14} />
                  Why this matters
                </div>
                <div className="mt-4 space-y-3">
                  {page.outcomes.map((item) => (
                    <div key={item} className="rounded-2xl border border-gray-900/10 bg-white p-4 text-sm text-gray-700">
                      {item}
                    </div>
                  ))}
                </div>
              </article>

              <article className="lg:col-span-5 rounded-3xl border border-gray-900 bg-[#0f172a] text-white p-6">
                <div className="text-xs uppercase tracking-wider font-semibold text-white/70">Next step</div>
                <h2 className="mt-3 text-2xl font-bold">{page.primaryCta.label}</h2>
                <p className="mt-3 text-sm leading-relaxed text-white/85">{page.primaryCta.description}</p>
                <div className="mt-5">
                  <LinkButton
                    href={page.primaryCta.href}
                    label={page.primaryCta.label}
                    onSelect={page.family === 'english'
                      ? () => platformJourney.track('platform_path_selected', { target: 'english_hub' })
                      : undefined}
                  />
                </div>
                {page.secondaryCta ? <p className="mt-4 text-sm text-white/75">{page.secondaryCta.description}</p> : null}
              </article>
            </section>

            <section className="rounded-3xl border border-gray-900 bg-white/85 p-6">
              <div className="text-xs uppercase tracking-wider font-semibold text-gray-600">Frequently asked</div>
              <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
                {page.faq.map((item) => (
                  <details key={item.question} className="rounded-2xl border border-gray-900/15 bg-white px-4 py-3">
                    <summary className="cursor-pointer list-none font-semibold text-gray-900">{item.question}</summary>
                    <p className="mt-3 text-sm leading-relaxed text-gray-700">{item.answer}</p>
                  </details>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-gray-900 bg-white/85 p-6">
              <div className="text-xs uppercase tracking-wider font-semibold text-gray-600">Related pages and resources</div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {page.relatedLinks.map((link) => (
                  <LinkCard key={`${page.key}-${link.label}`} link={link} />
                ))}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
};
