import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, MessageCircle, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { supportLinksList, supportMessageCreate, type SupportLink } from '../lib/platformClient';
import { SiteHeader, type SiteHeaderNavItem } from '../components/layout/SiteHeader';
import { SeoHead, createBreadcrumbSchema, createOrganizationSchema, createWebPageSchema } from '../components/seo/SeoHead';
import { useI18n } from '../i18n';

export const ContactPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<SupportLink[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [telegram, setTelegram] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const navItems: SiteHeaderNavItem[] = [
    { id: 'home', label: t('nav.home'), onClick: () => navigate('/') },
    { id: 'pricing', label: t('nav.pricing'), onClick: () => navigate('/pricing') },
    { id: 'about', label: t('nav.about'), onClick: () => navigate('/about') },
    { id: 'faq', label: t('nav.faq'), onClick: () => navigate('/faq') },
    { id: 'contact', label: t('nav.contact'), onClick: () => navigate('/contact'), active: true },
  ];

  const toFriendlyError = (err: unknown, fallback: string): string => {
    const msg = err instanceof Error ? err.message : '';
    if (/401|unauthorized|invalid jwt/i.test(msg)) return t('contact.error.session');
    if (/429|rate limit/i.test(msg)) return t('contact.error.rateLimit');
    return fallback;
  };

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [linksRes, sessionRes] = await Promise.all([supportLinksList(), supabase.auth.getSession()]);
        setLinks(linksRes.links ?? []);

        const session = sessionRes.data.session;
        if (session?.user) {
          const um: Record<string, unknown> = session.user.user_metadata ?? {};
          const fullName = [String(um.first_name ?? '').trim(), String(um.last_name ?? '').trim()]
            .filter(Boolean)
            .join(' ')
            .trim();
          if (fullName) setName(fullName);
          if (session.user.email) setEmail(session.user.email);
          if (typeof um.phone === 'string') setTelegram((um.phone ?? '').trim());
        }
      } catch (e) {
        setError(toFriendlyError(e, t('contact.error.load')));
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [t]);

  const emailLinks = useMemo(() => links.filter((l) => l.type === 'email' && l.is_active), [links]);
  const telegramLinks = useMemo(() => links.filter((l) => l.type === 'telegram' && l.is_active), [links]);
  const otherLinks = useMemo(() => links.filter((l) => l.type === 'url' && l.is_active), [links]);

  const submit = async () => {
    setError(null);
    setSuccess(null);

    const cleanName = name.trim();
    const cleanEmail = email.trim();
    const cleanMessage = message.trim();

    if (!cleanName || !cleanEmail || !cleanMessage) {
      setError(t('contact.error.required'));
      return;
    }

    setBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? null;
      await supportMessageCreate(
        {
          name: cleanName,
          email: cleanEmail,
          telegram: telegram.trim() || undefined,
          subject: subject.trim() || undefined,
          message: cleanMessage,
          source: 'platform_contact',
          service_slug: 'platform',
        },
        token,
      );
      setSuccess(t('contact.success.sent'));
      setSubject('');
      setMessage('');
    } catch (e) {
      setError(toFriendlyError(e, t('contact.error.send')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f1e8] text-gray-900">
      <SeoHead
        title="Contact Schood | Support for IELTS, TOEFL, SAT, and English Services"
        description="Contact Schood support for help with platform access, plans, and learning services across IELTS, TOEFL, SAT, and English."
        path="/contact"
        keywords={['contact Schood', 'learning platform support', 'IELTS support', 'TOEFL support', 'SAT support']}
        schema={[
          createOrganizationSchema(),
          createWebPageSchema({
            title: 'Contact Schood | Support for IELTS, TOEFL, SAT, and English Services',
            description:
              'Contact Schood support for help with platform access, plans, and learning services across IELTS, TOEFL, SAT, and English.',
            path: '/contact',
            type: 'ContactPage',
          }),
          createBreadcrumbSchema([
            { name: 'Schood', path: '/' },
            { name: 'Contact', path: '/contact' },
          ]),
        ]}
      />

      <SiteHeader navItems={navItems} />

      <main className="px-6 md:px-10 pt-10 pb-24 md:py-10">
        <div className="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-5 rounded-3xl border border-gray-900 bg-white/85 p-6 md:p-8">
            <div className="text-xs uppercase tracking-wider font-semibold text-gray-600">{t('contact.badge')}</div>
            <h1 className="text-3xl font-bold mt-2">{t('contact.title')}</h1>
            <p className="text-sm text-gray-600 mt-2">{t('contact.subtitle')}</p>

            {loading ? <div className="mt-6 text-sm text-gray-600">{t('contact.loadingLinks')}</div> : null}

            {!loading ? (
              <div className="mt-6 space-y-4">
                {emailLinks.map((link) => (
                  <a
                    key={link.id}
                    href={`mailto:${link.value}`}
                    className="flex items-center gap-3 rounded-2xl border border-gray-900/20 bg-white p-3 hover:bg-gray-50"
                  >
                    <Mail size={18} className="text-gray-700" />
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{link.label}</div>
                      <div className="text-xs text-gray-600">{link.value}</div>
                    </div>
                  </a>
                ))}

                {telegramLinks.map((link) => (
                  <a
                    key={link.id}
                    href={link.value.startsWith('http') ? link.value : `https://t.me/${link.value.replace(/^@/, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 rounded-2xl border border-gray-900/20 bg-white p-3 hover:bg-gray-50"
                  >
                    <MessageCircle size={18} className="text-gray-700" />
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{link.label}</div>
                      <div className="text-xs text-gray-600">{link.value}</div>
                    </div>
                  </a>
                ))}

                {otherLinks.map((link) => (
                  <a
                    key={link.id}
                    href={link.value}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-2xl border border-gray-900/20 bg-white p-3 hover:bg-gray-50"
                  >
                    <div className="text-sm font-semibold text-gray-900">{link.label}</div>
                    <div className="text-xs text-gray-600 mt-1">{link.value}</div>
                  </a>
                ))}

                {links.length === 0 ? (
                  <div className="text-sm text-gray-600 rounded-2xl border border-gray-900/15 bg-white p-3">{t('contact.emptyLinks')}</div>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="lg:col-span-7 rounded-3xl border border-gray-900 bg-white/90 p-6 md:p-8">
            <div className="text-xs uppercase tracking-wider font-semibold text-gray-600">{t('contact.message.badge')}</div>
            <h2 className="text-2xl font-bold mt-2">{t('contact.message.title')}</h2>
            <p className="text-sm text-gray-600 mt-2">{t('contact.message.subtitle')}</p>

            {error ? <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div> : null}
            {success ? (
              <div className="mt-4 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3">{success}</div>
            ) : null}

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-600">{t('contact.form.name')}</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-2 w-full border border-gray-300 rounded-xl px-3 py-2"
                  placeholder={t('contact.form.namePlaceholder')}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">{t('contact.form.email')}</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 w-full border border-gray-300 rounded-xl px-3 py-2"
                  placeholder={t('contact.form.emailPlaceholder')}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">{t('contact.form.telegram')}</label>
                <input
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  className="mt-2 w-full border border-gray-300 rounded-xl px-3 py-2"
                  placeholder={t('contact.form.telegramPlaceholder')}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">{t('contact.form.subject')}</label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="mt-2 w-full border border-gray-300 rounded-xl px-3 py-2"
                  placeholder={t('contact.form.subjectPlaceholder')}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-gray-600">{t('contact.form.message')}</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="mt-2 w-full border border-gray-300 rounded-xl px-3 py-2 min-h-[140px]"
                  placeholder={t('contact.form.messagePlaceholder')}
                />
              </div>
            </div>

            <button
              onClick={submit}
              disabled={busy || loading}
              className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#0f172a] text-white font-semibold disabled:bg-gray-300"
            >
              <Send size={16} /> {busy ? t('contact.form.sending') : t('contact.form.send')}
            </button>
          </section>
        </div>
      </main>
    </div>
  );
};
