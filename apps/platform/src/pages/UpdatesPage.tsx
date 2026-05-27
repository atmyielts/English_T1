import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Megaphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supportAnnouncementsList, supportAnnouncementsMarkRead, type PlatformAnnouncement } from '../lib/platformClient';
import { supabase } from '../lib/supabase';
import {
  MARKETING_UPDATES,
  markUpdateIdsSeen,
  marketingUpdateKey,
  platformAnnouncementUpdateKey,
} from '../lib/updates';
import { SiteHeader, type SiteHeaderNavItem } from '../components/layout/SiteHeader';
import { SeoHead, createBreadcrumbSchema, createOrganizationSchema, createWebPageSchema } from '../components/seo/SeoHead';
import { useI18n } from '../i18n';

const fmt = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
};

export const UpdatesPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<PlatformAnnouncement[]>([]);

  const navItems: SiteHeaderNavItem[] = [
    { id: 'home', label: t('nav.home'), onClick: () => navigate('/') },
    { id: 'plans', label: t('nav.plans'), onClick: () => navigate('/plans') },
    { id: 'pricing', label: t('nav.pricing'), onClick: () => navigate('/pricing') },
    { id: 'contact', label: t('nav.contact'), onClick: () => navigate('/contact') },
    { id: 'account', label: t('common.account'), onClick: () => navigate('/account') },
    { id: 'updates', label: t('nav.updates'), onClick: () => navigate('/updates'), active: true },
  ];

  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setAccessToken(session?.access_token ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await supportAnnouncementsList({ limit: 200, accessToken });
        setAnnouncements(res.announcements ?? []);
      } catch {
        setAnnouncements([]);
      }
    };
    void run();
  }, [accessToken]);

  const updateItems = useMemo(() => {
    const staticItems = MARKETING_UPDATES.map((item) => ({
      key: marketingUpdateKey(item.id),
      title: item.title,
      body: item.body,
      created_at: item.created_at,
      cta_label: item.cta_label,
      cta_href: item.cta_href,
      source: 'Release',
    }));

    const dynamicItems = announcements.map((item) => ({
      key: platformAnnouncementUpdateKey(item.id),
      title: item.title,
      body: item.body,
      created_at: item.created_at,
      cta_label: item.cta_label ?? undefined,
      cta_href: item.cta_href ?? undefined,
      announcement_id: item.id,
      is_read: item.is_read,
      source: 'Announcement',
    }));

    return [...dynamicItems, ...staticItems].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  }, [announcements]);

  useEffect(() => {
    markUpdateIdsSeen(updateItems.map((item) => item.key));
    if (!accessToken) return;

    const unreadAnnouncementIds = announcements.filter((item) => !item.is_read).map((item) => item.id);
    if (unreadAnnouncementIds.length === 0) return;

    const nowIso = new Date().toISOString();
    setAnnouncements((prev) =>
      prev.map((item) => (unreadAnnouncementIds.includes(item.id) ? { ...item, is_read: true, read_at: item.read_at ?? nowIso } : item)),
    );
    void supportAnnouncementsMarkRead(accessToken, unreadAnnouncementIds).catch(() => {
      // Local read state still prevents the current page from presenting already-read items as new.
    });
  }, [accessToken, announcements, updateItems]);

  return (
    <div className="min-h-screen bg-[#f6f1e8] text-gray-900">
      <SeoHead
        title="Schood Updates | Product Releases and Platform Announcements"
        description="Follow product releases and platform announcements across Schood services, including IELTS, TOEFL, SAT, and English updates."
        path="/updates"
        keywords={['Schood updates', 'product releases', 'platform announcements', 'IELTS TOEFL SAT updates']}
        schema={[
          createOrganizationSchema(),
          createWebPageSchema({
            title: 'Schood Updates | Product Releases and Platform Announcements',
            description:
              'Follow product releases and platform announcements across Schood services, including IELTS, TOEFL, SAT, and English updates.',
            path: '/updates',
            type: 'CollectionPage',
          }),
          createBreadcrumbSchema([
            { name: 'Schood', path: '/' },
            { name: 'Updates', path: '/updates' },
          ]),
        ]}
      />

      <SiteHeader navItems={navItems} />

      <main className="px-6 md:px-10 py-10">
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="rounded-3xl border border-gray-900 bg-white/85 p-6 md:p-8">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-600">
                <Bell size={14} /> {t('updates.title')}
              </div>
              <button
                type="button"
                onClick={goBack}
                className="rounded-full border border-gray-900 px-3 py-1.5 text-sm font-semibold"
              >
                {t('common.back')}
              </button>
            </div>
            <h1 className="mt-2 text-3xl md:text-4xl font-bold">{t('updates.title')}</h1>
            <p className="mt-2 text-sm text-gray-600">{t('updates.subtitle')}</p>
          </section>

          <section className="rounded-3xl border border-gray-900 bg-white/85 p-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-600">
              <Megaphone size={14} /> {t('nav.updates')}
            </div>
            <div className="mt-4 space-y-3">
              {updateItems.map((item) => (
                <article key={item.key} className="rounded-2xl border border-gray-900/15 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-base font-semibold text-gray-900">{item.title}</h2>
                    <span className="text-xs text-gray-500">{`${item.source} - ${fmt(item.created_at)}`}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-700">{item.body}</p>
                  {item.cta_label && item.cta_href ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (item.cta_href) navigate(item.cta_href);
                      }}
                      className="mt-3 rounded-full border border-gray-900 px-3 py-1.5 text-sm font-semibold"
                    >
                      {item.cta_label}
                    </button>
                  ) : null}
                </article>
              ))}
              {updateItems.length === 0 ? (
                <div className="rounded-2xl border border-gray-900/15 bg-white p-4 text-sm text-gray-600">{t('updates.empty')}</div>
              ) : null}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};
