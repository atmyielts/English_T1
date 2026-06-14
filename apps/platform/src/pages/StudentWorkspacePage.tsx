import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  BookOpen,
  Home,
  Inbox,
  LifeBuoy,
  Search,
  Settings,
  Sparkles,
  UserCircle2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  teacherStudioStudentDashboard,
  type TeacherStudioStudentClassroom,
  type TeacherStudioStudentDashboard,
} from '../lib/platformClient';
import { useI18n } from '../i18n';
import type { TranslationKey } from '../i18n/locales/en';
import { LanguageSwitcher } from '../components/layout/LanguageSwitcher';

type ProductRow = {
  name: string;
  metadata: Record<string, unknown> | null;
};

type CourseCard = {
  id: string;
  academy_id: string;
  academyName: string;
  name: string;
  summary: string;
  memberCount: number;
  announcementsCount: number;
  openAlertsCount: number;
  readiness: number;
};

type ActionRow = {
  id: string;
  type: 'announcement' | 'alert';
  title: string;
  subtitle: string;
  academyName: string;
  classroomName: string;
  createdAt: string;
};

const CARD_PALETTE = [
  { bg: 'bg-[#f6d55c]', border: 'border-[#221d13]' },
  { bg: 'bg-[#c4b5fd]', border: 'border-[#2a1f4d]' },
  { bg: 'bg-[#a7d8f0]', border: 'border-[#1b3144]' },
  { bg: 'bg-[#d9f99d]', border: 'border-[#2a3b14]' },
] as const;

const defaultAcademyUrl = String(import.meta.env.VITE_ACADEMY_URL ?? '').trim() || 'https://academy.schood.online';

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const toText = (value: unknown): string => (typeof value === 'string' ? value : '');

const truncate = (value: string, max = 120): string => (value.length > max ? `${value.slice(0, max - 3)}...` : value);

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
};

const dashboardError = (
  err: unknown,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string => {
  const raw = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  if (/invalid jwt|unauthorized|\b401\b/i.test(raw)) return t('student.error.sessionExpired');
  if (/forbidden|\b403\b/i.test(raw)) return t('student.error.forbidden');
  if (/failed to fetch|network/i.test(raw)) return t('student.error.network');
  return t('student.error.load');
};

export const StudentWorkspacePage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<TeacherStudioStudentDashboard | null>(null);
  const [academyUrl, setAcademyUrl] = useState(defaultAcademyUrl);
  const [activeAcademyFilter, setActiveAcademyFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          navigate(`/auth?mode=signin&returnTo=${encodeURIComponent('/workspace/student')}`, { replace: true });
          return;
        }

        const [dash, productsRes] = await Promise.all([
          teacherStudioStudentDashboard(token),
          supabase.from('products').select('name,metadata').eq('status', 'active'),
        ]);

        if (productsRes.error) throw productsRes.error;
        const products = (productsRes.data ?? []) as ProductRow[];
        const academyProduct = products.find((product) => {
          const meta = toRecord(product.metadata);
          const slug = toText(meta.slug).toLowerCase();
          const name = String(product.name ?? '').toLowerCase();
          return slug === 'academy' || slug === 'teacher-studio' || name === 'academy' || name === 'teacher studio';
        });
        const academyAppUrl = academyProduct ? toText(toRecord(academyProduct.metadata).app_url).trim() : '';
        setAcademyUrl(academyAppUrl || defaultAcademyUrl);
        setDashboard(dash);
      } catch (err) {
        setError(dashboardError(err, t));
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [navigate]);

  const academyById = useMemo(() => {
    const map = new Map<string, string>();
    for (const academy of dashboard?.academies ?? []) map.set(academy.id, academy.name);
    return map;
  }, [dashboard]);

  const classroomById = useMemo(() => {
    const map = new Map<string, TeacherStudioStudentClassroom>();
    for (const classroom of dashboard?.classrooms ?? []) map.set(classroom.id, classroom);
    return map;
  }, [dashboard]);

  const cards = useMemo<CourseCard[]>(() => {
    const announcementsByClassroom = new Map<string, number>();
    for (const announcement of dashboard?.announcements ?? []) {
      if (!announcement.classroom_id) continue;
      announcementsByClassroom.set(
        announcement.classroom_id,
        (announcementsByClassroom.get(announcement.classroom_id) ?? 0) + 1,
      );
    }

    const alertCountsByClassroom = new Map<string, number>();
    for (const alert of dashboard?.alerts ?? []) {
      if (alert.resolved) continue;
      if (!alert.contact_id) {
        for (const classroom of dashboard?.classrooms ?? []) {
          if (classroom.academy_id === alert.academy_id) {
            alertCountsByClassroom.set(classroom.id, (alertCountsByClassroom.get(classroom.id) ?? 0) + 1);
          }
        }
        continue;
      }

      for (const membership of dashboard?.classroom_memberships ?? []) {
        if (membership.contact_id !== alert.contact_id) continue;
        if (membership.academy_id !== alert.academy_id) continue;
        alertCountsByClassroom.set(
          membership.classroom_id,
          (alertCountsByClassroom.get(membership.classroom_id) ?? 0) + 1,
        );
      }
    }

    return (dashboard?.classrooms ?? []).map((classroom) => {
      const landing = toRecord(toRecord(classroom.metadata).landing);
      const summary = toText(landing.card_summary) || classroom.description || t('student.fallback.classroomSummary');
      const announcementsCount = announcementsByClassroom.get(classroom.id) ?? 0;
      const openAlertsCount = alertCountsByClassroom.get(classroom.id) ?? 0;
      const readinessRaw = 35 + announcementsCount * 8 + (classroom.is_active ? 20 : -10) - openAlertsCount * 9;
      const readiness = Math.max(10, Math.min(96, readinessRaw));
      return {
        id: classroom.id,
        academy_id: classroom.academy_id,
        academyName: academyById.get(classroom.academy_id) ?? t('student.fallback.academy'),
        name: toText(landing.headline) || classroom.name,
        summary: truncate(summary),
        memberCount: classroom.member_count,
        announcementsCount,
        openAlertsCount,
        readiness,
      };
    });
  }, [academyById, dashboard]);

  const actions = useMemo<ActionRow[]>(() => {
    const rows: ActionRow[] = [];

    for (const announcement of dashboard?.announcements ?? []) {
      const classroom = announcement.classroom_id ? classroomById.get(announcement.classroom_id) : null;
      rows.push({
        id: `ann-${announcement.id}`,
        type: 'announcement',
        title: announcement.title || t('student.fallback.announcementTitle'),
        subtitle: truncate(announcement.body || t('student.fallback.announcementSubtitle')),
        academyName: academyById.get(announcement.academy_id) ?? t('student.fallback.academy'),
        classroomName: classroom?.name ?? t('student.fallback.allClassrooms'),
        createdAt: announcement.created_at,
      });
    }

    for (const alert of dashboard?.alerts ?? []) {
      if (alert.resolved) continue;
      const classroomName = alert.contact_id
        ? (() => {
            const firstMembership = (dashboard?.classroom_memberships ?? []).find((membership) => membership.contact_id === alert.contact_id);
            return firstMembership
              ? classroomById.get(firstMembership.classroom_id)?.name ?? t('student.fallback.classroom')
              : t('student.fallback.classroom');
          })()
        : t('student.fallback.allClassrooms');
      rows.push({
        id: `alert-${alert.id}`,
        type: 'alert',
        title: `${alert.type.replace(/[_-]+/g, ' ')} ${t('student.type.alert')}`,
        subtitle: truncate(alert.message || t('student.fallback.alertAttention')),
        academyName: academyById.get(alert.academy_id) ?? t('student.fallback.academy'),
        classroomName,
        createdAt: alert.created_at,
      });
    }

    return rows.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [academyById, classroomById, dashboard]);

  const academyFilters = useMemo(() => {
    const list = [{ id: 'all', label: t('student.filter.allClasses') }];
    for (const academy of dashboard?.academies ?? []) {
      list.push({ id: academy.id, label: academy.name });
    }
    return list;
  }, [dashboard]);

  const filteredCards = useMemo(() => {
    const query = search.trim().toLowerCase();
    return cards.filter((card) => {
      if (activeAcademyFilter !== 'all' && card.academy_id !== activeAcademyFilter) return false;
      if (!query) return true;
      return `${card.name} ${card.summary} ${card.academyName}`.toLowerCase().includes(query);
    });
  }, [activeAcademyFilter, cards, search]);

  const nextActions = useMemo(() => actions.slice(0, 8), [actions]);
  const unreadMessages = useMemo(() => (dashboard?.messages ?? []).filter((item) => item.sender_type !== 'student').length, [dashboard]);
  const openAlerts = useMemo(() => (dashboard?.alerts ?? []).filter((item) => !item.resolved).length, [dashboard]);
  const activeAccess = useMemo(
    () => (dashboard?.entitlements ?? []).filter((item) => item.status === 'active').length,
    [dashboard],
  );
  const totalAnnouncements = useMemo(() => dashboard?.announcements?.length ?? 0, [dashboard]);

  const openAcademyClassroom = (academyId: string, classroomId: string) => {
    const base = academyUrl.replace(/\/$/, '');
    if (!base) {
      setError(t('student.error.academyUrlMissing'));
      return;
    }
    const href = `${base}/academy/student/classrooms/${encodeURIComponent(classroomId)}?academy_id=${encodeURIComponent(academyId)}`;
    const target = new URL(href, window.location.origin);
    if (target.origin === window.location.origin) {
      navigate(`${target.pathname}${target.search}${target.hash}`);
      return;
    }
    window.location.href = target.toString();
  };

  const openAcademyWorkspace = () => {
    const base = academyUrl.replace(/\/$/, '');
    if (!base) {
      setError(t('student.error.academyUrlMissing'));
      return;
    }
    const target = new URL(`${base}/academy/student`, window.location.origin);
    if (target.origin === window.location.origin) {
      navigate(`${target.pathname}${target.search}${target.hash}`);
      return;
    }
    window.location.href = target.toString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f6f1e8] px-6 py-10">
        <div className="mx-auto max-w-6xl rounded-3xl border border-gray-900 bg-white/85 p-8">
          <div className="text-sm font-semibold text-gray-700">{t('student.loading')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f1e8] p-3 md:p-6">
      <div className="mx-auto max-w-[1400px] rounded-[36px] border-2 border-gray-900 bg-white p-3 md:p-5 shadow-[0_26px_60px_rgba(15,23,42,0.15)]">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[86px_1fr_320px]">
          <aside className="rounded-3xl border border-gray-900 bg-[#121212] px-3 py-4 text-white">
            <div className="flex flex-col items-center gap-2">
              <button className="rounded-2xl bg-[#d0ff14] p-3 text-gray-900">
                <Home size={18} />
              </button>
              <button className="rounded-2xl border border-white/20 p-3 text-white/90">
                <BookOpen size={18} />
              </button>
              <button className="rounded-2xl border border-white/20 p-3 text-white/90">
                <Inbox size={18} />
              </button>
              <button className="rounded-2xl border border-white/20 p-3 text-white/90">
                <Bell size={18} />
              </button>
              <button className="rounded-2xl border border-white/20 p-3 text-white/90">
                <Settings size={18} />
              </button>
            </div>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="rounded-2xl border border-white/20 px-2 py-2 text-xs font-semibold text-white/90"
              >
                {t('student.sidebar.platform')}
              </button>
              <button
                type="button"
                onClick={openAcademyWorkspace}
                className="rounded-2xl border border-white/20 px-2 py-2 text-xs font-semibold text-white/90"
              >
                {t('student.sidebar.academy')}
              </button>
            </div>
          </aside>

          <main className="rounded-3xl border border-gray-900 bg-[#f8f8f5] p-4 md:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('student.header.label')}</div>
                <h1 className="text-2xl font-bold md:text-3xl">{t('student.header.title')}</h1>
              </div>
              <div className="flex w-full items-center gap-2 md:w-auto">
                <div className="flex w-full items-center gap-2 rounded-2xl border border-gray-900 bg-white px-3 py-2 md:w-[320px]">
                  <Search size={16} className="text-gray-500" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t('student.search.placeholder')}
                    className="w-full border-0 bg-transparent text-sm outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/updates')}
                  className="rounded-2xl border border-gray-900 bg-white px-3 py-2 text-sm font-semibold"
                >
                  {t('nav.updates')}
                </button>
                <LanguageSwitcher compact />
              </div>
            </div>

            {error ? <div className="mt-4 rounded-2xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {academyFilters.map((academy) => (
                <button
                  key={academy.id}
                  type="button"
                  onClick={() => setActiveAcademyFilter(academy.id)}
                  className={[
                    'rounded-full border px-3 py-1.5 text-sm font-semibold',
                    academy.id === activeAcademyFilter
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-gray-300 bg-white text-gray-700',
                  ].join(' ')}
                >
                  {academy.label}
                </button>
              ))}
            </div>

            <section className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-3">
              {filteredCards.slice(0, 3).map((card, index) => {
                const palette = CARD_PALETTE[index % CARD_PALETTE.length];
                return (
                  <article key={card.id} className={`rounded-3xl border-2 p-4 ${palette.bg} ${palette.border}`}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="rounded-full border border-black/30 bg-white/70 px-2 py-1 text-xs font-semibold">
                        {card.academyName}
                      </span>
                      <span className="text-xs font-semibold text-gray-800">
                        {t('student.card.readiness', { percent: Math.round(card.readiness) })}
                      </span>
                    </div>
                    <h2 className="text-xl font-bold leading-tight">{card.name}</h2>
                    <p className="mt-1 text-sm text-gray-800">{card.summary}</p>
                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-black/15">
                      <div className="h-full rounded-full bg-black/70" style={{ width: `${card.readiness}%` }} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs font-semibold text-gray-800">
                      <span>{t('student.card.updates', { count: card.announcementsCount })}</span>
                      <span>{t('student.card.openAlerts', { count: card.openAlertsCount })}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => openAcademyClassroom(card.academy_id, card.id)}
                      className="mt-4 inline-flex items-center gap-1 rounded-full border border-gray-900 bg-[#ff5c35] px-4 py-2 text-sm font-semibold text-white"
                    >
                      {t('student.button.continue')} <ArrowUpRight size={14} />
                    </button>
                  </article>
                );
              })}
              {filteredCards.length === 0 ? (
                <article className="xl:col-span-3 rounded-3xl border border-gray-900 bg-white p-4">
                  <h2 className="text-lg font-bold">{t('student.empty.classroomsTitle')}</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {t('student.empty.classroomsDesc')}
                  </p>
                </article>
              ) : null}
            </section>

            <section className="mt-4 rounded-3xl border border-gray-900 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xl font-bold">{t('student.actions.title')}</h3>
                <button type="button" onClick={() => navigate('/updates')} className="text-sm font-semibold text-gray-700 underline">
                  {t('student.actions.viewAll')}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="py-2 pr-4">{t('student.table.type')}</th>
                      <th className="py-2 pr-4">{t('student.table.title')}</th>
                      <th className="py-2 pr-4">{t('student.table.classroom')}</th>
                      <th className="py-2 pr-4">{t('student.table.academy')}</th>
                      <th className="py-2">{t('student.table.time')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nextActions.map((row) => (
                      <tr key={row.id} className="border-b border-gray-100">
                        <td className="py-3 pr-4">
                          <span
                            className={[
                              'rounded-full border px-2 py-0.5 text-xs font-semibold',
                              row.type === 'alert'
                                ? 'border-red-300 bg-red-50 text-red-700'
                                : 'border-blue-300 bg-blue-50 text-blue-700',
                            ].join(' ')}
                          >
                            {row.type === 'alert' ? t('student.type.alert') : t('student.type.announcement')}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="font-semibold text-gray-900">{row.title}</div>
                          <div className="text-xs text-gray-600">{row.subtitle}</div>
                        </td>
                        <td className="py-3 pr-4 text-gray-700">{row.classroomName}</td>
                        <td className="py-3 pr-4 text-gray-700">{row.academyName}</td>
                        <td className="py-3 text-gray-500">{formatDate(row.createdAt)}</td>
                      </tr>
                    ))}
                    {nextActions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-4 text-sm text-gray-500">
                          {t('student.table.emptyActions')}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </main>

          <aside className="rounded-3xl border border-gray-900 bg-[#111111] p-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-white/70">{t('student.stats.label')}</div>
                <div className="mt-1 text-xl font-bold">{t('student.stats.today')}</div>
              </div>
              <UserCircle2 size={24} className="text-[#d0ff14]" />
            </div>

            <div className="mt-4 grid gap-2">
              <div className="rounded-2xl border border-white/15 bg-white/5 px-3 py-2">
                <div className="text-xs text-white/70">{t('student.stats.unreadMessages')}</div>
                <div className="text-2xl font-bold">{unreadMessages}</div>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/5 px-3 py-2">
                <div className="text-xs text-white/70">{t('student.stats.openAlerts')}</div>
                <div className="text-2xl font-bold">{openAlerts}</div>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/5 px-3 py-2">
                <div className="text-xs text-white/70">{t('student.stats.activeAccess')}</div>
                <div className="text-2xl font-bold">{activeAccess}</div>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/5 px-3 py-2">
                <div className="text-xs text-white/70">{t('student.stats.totalUpdates')}</div>
                <div className="text-2xl font-bold">{totalAnnouncements}</div>
              </div>
            </div>

            <div className="mt-5 rounded-3xl border border-[#d0ff14]/40 bg-[#1f1f1f] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#d0ff14]">
                <Sparkles size={16} /> {t('student.recommendation.label')}
              </div>
              <h3 className="mt-2 text-xl font-bold">{t('student.recommendation.title')}</h3>
              <p className="mt-2 text-sm text-white/75">
                {t('student.recommendation.desc')}
              </p>
              <button
                type="button"
                onClick={openAcademyWorkspace}
                className="mt-4 w-full rounded-full bg-[#ff5c35] px-4 py-2 text-sm font-semibold text-white"
              >
                {t('student.recommendation.button')}
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={() => navigate('/updates')}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-2 text-sm font-semibold text-white/90"
              >
                <Inbox size={15} /> {t('student.nav.notifications')}
              </button>
              <button
                type="button"
                onClick={() => navigate('/contact')}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-2 text-sm font-semibold text-white/90"
              >
                <LifeBuoy size={15} /> {t('student.nav.contactSupport')}
              </button>
              <button
                type="button"
                onClick={() => navigate('/account')}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-2 text-sm font-semibold text-white/90"
              >
                <UserCircle2 size={15} /> {t('student.nav.accountSettings')}
              </button>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-2 text-sm font-semibold text-white/90"
              >
                <Home size={15} /> {t('student.nav.backToPlatform')}
              </button>
            </div>
          </aside>
        </div>
      </div>

      <div className="mx-auto mt-3 flex max-w-[1400px] items-center justify-between px-2 text-xs text-gray-600">
        <span className="inline-flex items-center gap-1">
          <AlertTriangle size={14} />
          {t('student.footer.dataSource')}
        </span>
        <span>{t('student.footer.route')}</span>
      </div>
    </div>
  );
};
