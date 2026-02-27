import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, BarChart3, BookOpenCheck, Compass, GraduationCap, Layers, Sparkles, Target } from 'lucide-react';
import { SiteHeader, type SiteHeaderNavItem } from '../components/layout/SiteHeader';
import { useI18n } from '../i18n';

export const AboutPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();

  const navItems: SiteHeaderNavItem[] = [
    { id: 'home', label: t('nav.home'), onClick: () => navigate('/') },
    { id: 'pricing', label: t('nav.pricing'), onClick: () => navigate('/pricing') },
    { id: 'contact', label: t('nav.contact'), onClick: () => navigate('/contact') },
    { id: 'faq', label: t('nav.faq'), onClick: () => navigate('/faq') },
    { id: 'about', label: t('nav.about'), onClick: () => navigate('/about'), active: true },
  ];

  const supportItems = [
    t('about.learn.item1'),
    t('about.learn.item2'),
    t('about.learn.item3'),
    t('about.learn.item4'),
    t('about.learn.item5'),
  ];

  const progressItems = [
    t('about.progress.item1'),
    t('about.progress.item2'),
    t('about.progress.item3'),
    t('about.progress.item4'),
  ];

  return (
    <div className="min-h-screen bg-[#f6f1e8] text-gray-900">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-28 -left-24 h-[360px] w-[360px] rounded-full bg-emerald-200/55 blur-3xl" />
          <div className="absolute top-40 -right-24 h-[360px] w-[360px] rounded-full bg-amber-200/55 blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(#00000010_1px,transparent_1px)] [background-size:22px_22px] opacity-30" />
        </div>

        <SiteHeader className="relative z-10" navItems={navItems} />

        <main className="relative z-10 px-6 md:px-10 pt-10 pb-24 md:py-12">
          <div className="mx-auto max-w-6xl space-y-8">
            <section className="rounded-3xl border border-gray-900 bg-white/90 p-6 md:p-8 lg:p-10">
                <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-gray-600">
                  <Sparkles size={14} />
                  {t('about.badge')}
                </div>
              <h1 className="mt-3 text-3xl md:text-4xl font-bold leading-tight">
                {t('about.title')}
              </h1>
              <p className="mt-4 text-gray-700 text-base md:text-lg leading-relaxed max-w-4xl">
                {t('about.p1')}
              </p>
              <p className="mt-4 text-gray-700 text-base md:text-lg leading-relaxed max-w-4xl">
                {t('about.p2')}
              </p>
              <p className="mt-4 text-gray-700 text-base md:text-lg leading-relaxed max-w-4xl">
                {t('about.p3')}
              </p>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <article className="rounded-3xl border border-gray-900 bg-white/85 p-6">
                <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-gray-600">
                  <Layers size={14} />
                  {t('about.learn.badge')}
                </div>
                <p className="mt-3 text-gray-700 leading-relaxed">
                  {t('about.learn.p1')}
                </p>
                <p className="mt-3 text-gray-700 leading-relaxed">
                  {t('about.learn.p2')}
                </p>
                <ul className="mt-4 space-y-2">
                  {supportItems.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-gray-700">
                      <BookOpenCheck size={16} className="mt-0.5 text-gray-500 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-gray-700 leading-relaxed">
                  {t('about.learn.p3')}
                </p>
              </article>

              <article className="rounded-3xl border border-gray-900 bg-white/85 p-6">
                <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-gray-600">
                  <BarChart3 size={14} />
                  {t('about.progress.badge')}
                </div>
                <p className="mt-3 text-gray-700 leading-relaxed">
                  {t('about.progress.p1')}
                </p>
                <p className="mt-3 text-gray-700 leading-relaxed">{t('about.progress.p2')}</p>
                <ul className="mt-4 space-y-2">
                  {progressItems.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-gray-700">
                      <Target size={16} className="mt-0.5 text-gray-500 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-gray-700 leading-relaxed">
                  {t('about.progress.p3')}
                </p>
              </article>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <article className="rounded-3xl border border-gray-900 bg-white/85 p-6">
                <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-gray-600">
                  <GraduationCap size={14} />
                  {t('about.growth.badge')}
                </div>
                <p className="mt-3 text-gray-700 leading-relaxed">
                  {t('about.growth.p1')}
                </p>
                <p className="mt-3 text-gray-700 leading-relaxed">
                  {t('about.growth.p2')}
                </p>
              </article>

              <article className="rounded-3xl border border-gray-900 bg-[#0f172a] text-white p-6">
                <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-white/80">
                  <Compass size={14} />
                  {t('about.goal.badge')}
                </div>
                <p className="mt-3 text-white/90 leading-relaxed">
                  {t('about.goal.p1')}
                </p>
                <p className="mt-3 text-white/90 leading-relaxed">
                  {t('about.goal.p2')}
                </p>
              </article>
            </section>

            <section className="rounded-3xl border border-gray-900 bg-white/85 p-6 md:p-8">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-wider font-semibold text-gray-600">{t('about.cta.badge')}</div>
                  <h2 className="mt-2 text-2xl font-bold text-gray-900">{t('about.cta.title')}</h2>
                  <p className="mt-2 text-gray-600">
                    {t('about.cta.desc')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => navigate('/plans')}
                    className="px-4 py-2 rounded-full bg-[#0f172a] text-white text-sm font-semibold inline-flex items-center gap-2"
                  >
                    {t('about.cta.explore')} <ArrowUpRight size={16} />
                  </button>
                  <button
                    onClick={() => navigate('/')}
                    className="px-4 py-2 rounded-full border border-[#1f2937] bg-white text-sm font-semibold"
                  >
                    {t('about.cta.back')}
                  </button>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
};
