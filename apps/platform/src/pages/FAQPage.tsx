import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeHelp, BookOpenCheck, CreditCard, ShieldCheck, Sparkles } from 'lucide-react';
import { SiteHeader, type SiteHeaderNavItem } from '../components/layout/SiteHeader';
import {
  SeoHead,
  createBreadcrumbSchema,
  createFaqSchema,
  createOrganizationSchema,
  createWebPageSchema,
} from '../components/seo/SeoHead';
import { useI18n } from '../i18n';

type FAQItem = {
  question: string;
  answer: string;
};

const FAQSection: React.FC<{ title: string; icon: React.ReactNode; items: FAQItem[] }> = ({ title, icon, items }) => (
  <section className="rounded-3xl border border-gray-900 bg-white/85 p-6">
    <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-gray-600">
      {icon}
      {title}
    </div>
    <div className="mt-4 space-y-3">
      {items.map((item) => (
        <details key={item.question} className="group rounded-2xl border border-gray-900/15 bg-white px-4 py-3">
          <summary className="cursor-pointer list-none font-semibold text-gray-900 flex items-center justify-between gap-3">
            <span>{item.question}</span>
            <span className="text-gray-500 transition-transform group-open:rotate-45">+</span>
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-gray-700">{item.answer}</p>
        </details>
      ))}
    </div>
  </section>
);

export const FAQPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();

  const navItems: SiteHeaderNavItem[] = [
    { id: 'home', label: t('nav.home'), onClick: () => navigate('/') },
    { id: 'about', label: t('nav.about'), onClick: () => navigate('/about') },
    { id: 'pricing', label: t('nav.pricing'), onClick: () => navigate('/pricing') },
    { id: 'contact', label: t('nav.contact'), onClick: () => navigate('/contact') },
    { id: 'faq', label: t('nav.faq'), onClick: () => navigate('/faq'), active: true },
  ];

  const gettingStarted: FAQItem[] = [
    {
      question: t('faq.getting.q1.question'),
      answer: t('faq.getting.q1.answer'),
    },
    {
      question: t('faq.getting.q2.question'),
      answer: t('faq.getting.q2.answer'),
    },
    {
      question: t('faq.getting.q3.question'),
      answer: t('faq.getting.q3.answer'),
    },
  ];

  const billingAndAccess: FAQItem[] = [
    {
      question: t('faq.billing.q1.question'),
      answer: t('faq.billing.q1.answer'),
    },
    {
      question: t('faq.billing.q2.question'),
      answer: t('faq.billing.q2.answer'),
    },
    {
      question: t('faq.billing.q3.question'),
      answer: t('faq.billing.q3.answer'),
    },
    {
      question: t('faq.billing.q4.question'),
      answer: t('faq.billing.q4.answer'),
    },
  ];

  const learningAndSecurity: FAQItem[] = [
    {
      question: t('faq.security.q1.question'),
      answer: t('faq.security.q1.answer'),
    },
    {
      question: t('faq.security.q2.question'),
      answer: t('faq.security.q2.answer'),
    },
    {
      question: t('faq.security.q3.question'),
      answer: t('faq.security.q3.answer'),
    },
    {
      question: t('faq.security.q4.question'),
      answer: t('faq.security.q4.answer'),
    },
  ];

  const faqItems = [...gettingStarted, ...billingAndAccess, ...learningAndSecurity];

  return (
    <div className="min-h-screen bg-[#f6f1e8] text-gray-900">
      <SeoHead
        title="Schood FAQ | Platform Access, Plans, and Learning Support"
        description="Find answers about Schood accounts, subscriptions, support, and platform behavior across IELTS, TOEFL, SAT, and English services."
        path="/faq"
        keywords={['Schood FAQ', 'platform FAQ', 'IELTS TOEFL SAT support', 'learning platform questions']}
        schema={[
          createOrganizationSchema(),
          createWebPageSchema({
            title: 'Schood FAQ | Platform Access, Plans, and Learning Support',
            description:
              'Find answers about Schood accounts, subscriptions, support, and platform behavior across IELTS, TOEFL, SAT, and English services.',
            path: '/faq',
          }),
          createBreadcrumbSchema([
            { name: 'Schood', path: '/' },
            { name: 'FAQ', path: '/faq' },
          ]),
          createFaqSchema(faqItems.map((item) => ({ question: item.question, answer: item.answer }))),
        ]}
      />

      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 right-16 h-[340px] w-[340px] rounded-full bg-emerald-200/50 blur-3xl" />
          <div className="absolute -bottom-24 -left-20 h-[360px] w-[360px] rounded-full bg-amber-200/45 blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(#00000010_1px,transparent_1px)] [background-size:22px_22px] opacity-30" />
        </div>

        <SiteHeader className="relative z-10" navItems={navItems} />

        <main className="relative z-10 px-6 md:px-10 pt-10 pb-24 md:py-10">
          <div className="mx-auto max-w-6xl space-y-6">
            <section className="rounded-3xl border border-gray-900 bg-white/90 p-6 md:p-8">
              <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-gray-600">
                <Sparkles size={14} />
                {t('faq.badge')}
              </div>
              <h1 className="mt-3 text-3xl md:text-4xl font-bold leading-tight">{t('faq.title')}</h1>
              <p className="mt-3 text-gray-700 max-w-3xl">{t('faq.subtitle')}</p>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <FAQSection title={t('faq.section.gettingStarted')} icon={<BookOpenCheck size={14} />} items={gettingStarted} />
              <FAQSection title={t('faq.section.billing')} icon={<CreditCard size={14} />} items={billingAndAccess} />
              <FAQSection title={t('faq.section.security')} icon={<ShieldCheck size={14} />} items={learningAndSecurity} />
            </div>

            <section className="rounded-3xl border border-gray-900 bg-[#0f172a] text-white p-6 md:p-8">
              <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-white/80">
                <BadgeHelp size={14} />
                {t('faq.help.title')}
              </div>
              <p className="mt-3 text-white/90 max-w-2xl">{t('faq.help.desc')}</p>
              <button
                onClick={() => navigate('/contact')}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-white text-[#0f172a] px-4 py-2 text-sm font-semibold"
              >
                {t('common.contactSupport')}
              </button>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
};
