import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  BadgeDollarSign,
  BellRing,
  BookOpen,
  Boxes,
  Building2,
  CheckCircle2,
  CreditCard,
  HandCoins,
  Inbox,
  LayoutGrid,
  RefreshCw,
  Settings,
  ShieldCheck,
  Tag,
  Users,
} from 'lucide-react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { hasAdminPermission, useAdminAccess } from '../../components/platform/adminAccess';
import { supabase } from '../../lib/supabase';
import {
  adminAnalyticsOverview,
  adminPartnersSummary,
  adminReferralsSummary,
  adminSupportMessagesList,
  type AdminAnalyticsOverviewResponse,
  type AdminReferralsSummary,
  type SupportMessage,
} from '../../lib/platformClient';

type PartnersSummary = Awaited<ReturnType<typeof adminPartnersSummary>>;

type DashboardData = {
  analytics?: AdminAnalyticsOverviewResponse | null;
  referrals?: AdminReferralsSummary | null;
  partners?: PartnersSummary | null;
  support?: SupportMessage[];
};

const formatNumber = (value: number | null | undefined): string => new Intl.NumberFormat('en-US').format(Number(value ?? 0));

const formatCurrency = (value: number | null | undefined, currency = 'UZS'): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value ?? 0));

const statusTone = (status: 'steady' | 'watch' | 'urgent'): string => {
  if (status === 'urgent') return 'border-rose-200 bg-rose-50 text-rose-800';
  if (status === 'watch') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-emerald-200 bg-emerald-50 text-emerald-800';
};

const panelClass = 'rounded-2xl border border-gray-200 bg-white shadow-sm';

const MetricCard: React.FC<{
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tone?: string;
}> = ({ label, value, hint, icon: Icon, tone = 'bg-gray-100 text-gray-700' }) => (
  <div className={`${panelClass} p-4`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
        <p className="mt-2 text-2xl font-bold text-gray-950">{value}</p>
      </div>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${tone}`}>
        <Icon size={18} />
      </div>
    </div>
    {hint ? <p className="mt-2 text-sm text-gray-500">{hint}</p> : null}
  </div>
);

const QueueCard: React.FC<{
  title: string;
  label: string;
  value: string;
  detail: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  status: 'steady' | 'watch' | 'urgent';
}> = ({ title, label, value, detail, href, icon: Icon, status }) => (
  <Link to={href} className={`${panelClass} block p-4 transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md`}>
    <div className="flex items-center justify-between gap-3">
      <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(status)}`}>
        <Icon size={14} />
        {label}
      </div>
      <ArrowUpRight size={17} className="text-gray-400" />
    </div>
    <p className="mt-4 text-sm font-semibold text-gray-700">{title}</p>
    <p className="mt-1 text-3xl font-bold text-gray-950">{value}</p>
    <p className="mt-2 text-sm leading-6 text-gray-500">{detail}</p>
  </Link>
);

const QuickLink: React.FC<{
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  allowed: boolean;
}> = ({ title, description, href, icon: Icon, allowed }) => {
  const content = (
    <div className={`${panelClass} h-full p-4 ${allowed ? 'transition hover:border-gray-300 hover:shadow-md' : 'opacity-50'}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gray-950 text-white">
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-950">{title}</p>
          <p className="mt-1 text-sm leading-6 text-gray-500">{description}</p>
        </div>
      </div>
    </div>
  );

  return allowed ? <Link to={href}>{content}</Link> : content;
};

export const AdminDashboardPage: React.FC = () => {
  const access = useAdminAccess();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [data, setData] = useState<DashboardData>({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data: sessionData }) => setAccessToken(sessionData.session?.access_token ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setAccessToken(session?.access_token ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const can = (permission: string): boolean => hasAdminPermission(access?.permissions ?? [], permission);

  const load = async () => {
    if (!accessToken || !access) return;
    setLoading(true);
    const next: DashboardData = {};
    const errors: string[] = [];

    const tasks: Promise<void>[] = [];
    if (can('admin.analytics.view')) {
      tasks.push(
        adminAnalyticsOverview(accessToken)
          .then((res) => {
            next.analytics = res;
          })
          .catch((err) => {
            errors.push(err instanceof Error ? err.message : 'Analytics failed');
          }),
      );
    }
    if (can('admin.referrals.manage')) {
      tasks.push(
        adminReferralsSummary(accessToken)
          .then((res) => {
            next.referrals = res;
          })
          .catch((err) => {
            errors.push(err instanceof Error ? err.message : 'Referrals failed');
          }),
      );
    }
    if (can('admin.partners.manage')) {
      tasks.push(
        adminPartnersSummary(accessToken)
          .then((res) => {
            next.partners = res;
          })
          .catch((err) => {
            errors.push(err instanceof Error ? err.message : 'Partners failed');
          }),
      );
    }
    if (can('admin.support.manage')) {
      tasks.push(
        adminSupportMessagesList(accessToken, { limit: 50 })
          .then((res) => {
            next.support = res.messages;
          })
          .catch((err) => {
            errors.push(err instanceof Error ? err.message : 'Support failed');
          }),
      );
    }

    await Promise.all(tasks);
    setData(next);
    setLoadErrors(errors);
    setLoading(false);
  };

  useEffect(() => {
    if (!accessToken || !access) return;
    void load();
  }, [accessToken, access?.userId]);

  const analytics = data.analytics ?? null;
  const referrals = data.referrals ?? null;
  const partners = data.partners ?? null;
  const support = data.support ?? [];

  const supportOpen = useMemo(() => support.filter((m) => ['new', 'in_progress'].includes(m.status)), [support]);
  const supportNew = useMemo(() => support.filter((m) => m.status === 'new'), [support]);
  const cashRequests = useMemo(() => referrals?.cash_payout_requests ?? [], [referrals]);
  const requestedCash = useMemo(() => cashRequests.filter((r: any) => ['requested', 'approved'].includes(String(r.status ?? ''))), [cashRequests]);
  const requestedCashAmount = useMemo(
    () => requestedCash.reduce((sum: number, row: any) => sum + Number(row.amount ?? 0), 0),
    [requestedCash],
  );
  const reservedTopups = useMemo(() => partners?.topup_requests ?? [], [partners]);
  const tierRequests = useMemo(
    () => (partners?.tier_requests ?? []).filter((row: any) => ['paid', 'manual_review', 'pending_payment'].includes(String(row.status ?? ''))),
    [partners],
  );

  const stale30m = analytics?.totals.payments_paid_ungranted_30m ?? 0;
  const stale2h = analytics?.totals.payments_paid_ungranted_2h ?? 0;
  const grantErrors = analytics?.totals.payments_with_grant_error ?? 0;
  const urgentCount = stale2h + (analytics?.totals.payments_paid_ungranted_24h ?? 0);
  const watchCount = stale30m + requestedCash.length + reservedTopups.length + tierRequests.length + supportOpen.length;
  const healthStatus: 'steady' | 'watch' | 'urgent' = urgentCount > 0 ? 'urgent' : watchCount > 0 ? 'watch' : 'steady';
  const healthLabel = healthStatus === 'urgent' ? 'Action needed' : healthStatus === 'watch' ? 'Watch queue' : 'Steady';
  const topServices = useMemo(() => (analytics?.services ?? []).slice(0, 6), [analytics]);
  const recentAdminEvents = analytics?.admin_activity?.recent_events ?? [];

  return (
    <AdminLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-3xl border border-gray-900 bg-gray-950 text-white shadow-sm">
          <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,1fr)_360px] md:p-7">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/70">
                <ShieldCheck size={14} />
                Admin command center
              </div>
              <h1 className="mt-5 max-w-3xl text-3xl font-bold leading-tight md:text-4xl">Run the whole Schood ecosystem from one operational view.</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-white/70">
                Payments, access, referrals, affiliates, centers, support, and content health now surface as queues instead of scattered numbers.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void load()}
                  className="inline-flex items-center gap-2 rounded-full bg-[#b6f24a] px-4 py-2.5 text-sm font-bold text-gray-950 transition hover:bg-[#cdfc72]"
                >
                  <RefreshCw size={16} />
                  {loading ? 'Refreshing...' : 'Refresh'}
                </button>
                <Link to="/admin/payments" className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10">
                  <CreditCard size={16} />
                  Payment queue
                </Link>
              </div>
            </div>
            <div className="rounded-3xl border border-white/15 bg-white/10 p-5">
              <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${statusTone(healthStatus)}`}>{healthLabel}</div>
              <p className="mt-4 text-4xl font-bold">{formatNumber(watchCount + urgentCount)}</p>
              <p className="mt-2 text-sm leading-6 text-white/70">items across payment grants, cash payouts, center approvals, affiliate/referral flow, and support inbox.</p>
              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
                  <p className="text-white/60">Urgent</p>
                  <p className="mt-1 text-2xl font-bold">{formatNumber(urgentCount)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
                  <p className="text-white/60">Watch</p>
                  <p className="mt-1 text-2xl font-bold">{formatNumber(watchCount)}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {loadErrors.length > 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
            Some admin sources did not load: {loadErrors.slice(0, 3).join(' | ')}
          </div>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={Users} tone="bg-blue-50 text-blue-700" label="Users total" value={formatNumber(analytics?.totals.users_total)} hint={`+${formatNumber(analytics?.totals.users_new_7d)} in 7 days`} />
          <MetricCard icon={Activity} tone="bg-emerald-50 text-emerald-700" label="Sessions 30d" value={formatNumber(analytics?.totals.sessions_30d)} hint={`${formatNumber(analytics?.totals.sessions_completed_30d)} completed`} />
          <MetricCard icon={BadgeDollarSign} tone="bg-lime-50 text-lime-800" label="Revenue 30d" value={formatCurrency(analytics?.totals.revenue_30d)} hint={`${formatNumber(analytics?.totals.paid_payments_30d)} paid checkouts`} />
          <MetricCard icon={Boxes} tone="bg-violet-50 text-violet-700" label="Active products" value={formatNumber(analytics?.totals.products_active)} hint={`${formatNumber(analytics?.totals.entitlements_active)} active entitlements`} />
        </section>

        <section className="grid gap-4 lg:grid-cols-4">
          <QueueCard
            icon={CreditCard}
            status={stale2h > 0 ? 'urgent' : stale30m > 0 || grantErrors > 0 ? 'watch' : 'steady'}
            label="Commerce"
            title="Payment grant queue"
            value={formatNumber(stale30m)}
            detail={`${formatNumber(stale2h)} over 2h, ${formatNumber(grantErrors)} total grant errors.`}
            href="/admin/payments"
          />
          <QueueCard
            icon={HandCoins}
            status={requestedCash.length > 0 ? 'watch' : 'steady'}
            label="Revenue share"
            title="Referral and affiliate payouts"
            value={formatNumber(requestedCash.length)}
            detail={`${formatCurrency(requestedCashAmount, referrals?.programs?.[0]?.currency ?? 'UZS')} requested or approved.`}
            href="/admin/referrals"
          />
          <QueueCard
            icon={Building2}
            status={reservedTopups.length + tierRequests.length > 0 ? 'watch' : 'steady'}
            label="Centers"
            title="Center approvals"
            value={formatNumber(reservedTopups.length + tierRequests.length)}
            detail={`${formatNumber(reservedTopups.length)} top-ups and ${formatNumber(tierRequests.length)} tier requests waiting.`}
            href="/admin/partners"
          />
          <QueueCard
            icon={Inbox}
            status={supportNew.length > 0 ? 'watch' : 'steady'}
            label="Support"
            title="Open support inbox"
            value={formatNumber(supportOpen.length)}
            detail={`${formatNumber(supportNew.length)} new messages need first response.`}
            href="/admin/support"
          />
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className={`${panelClass} overflow-hidden`}>
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-gray-950">Ecosystem usage</p>
                <p className="text-sm text-gray-500">Top services by 30-day sessions.</p>
              </div>
              <Link to="/admin/analytics" className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-950">
                Analytics
                <ArrowUpRight size={16} />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-5 py-3 text-left font-semibold">Service</th>
                    <th className="px-5 py-3 text-right font-semibold">Users</th>
                    <th className="px-5 py-3 text-right font-semibold">Sessions</th>
                    <th className="px-5 py-3 text-right font-semibold">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {topServices.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-6 text-gray-500">
                        Usage data will appear after analytics loads.
                      </td>
                    </tr>
                  ) : (
                    topServices.map((service) => (
                      <tr key={service.product_id} className="border-t border-gray-100">
                        <td className="px-5 py-4">
                          <div className="font-semibold text-gray-950">{service.name}</div>
                          <div className="text-xs uppercase tracking-wide text-gray-500">{service.type} / {service.status}</div>
                        </td>
                        <td className="px-5 py-4 text-right text-gray-700">{formatNumber(service.users_30d)}</td>
                        <td className="px-5 py-4 text-right text-gray-700">{formatNumber(service.sessions_30d)}</td>
                        <td className="px-5 py-4 text-right font-semibold text-gray-950">{formatCurrency(service.revenue_30d)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className={`${panelClass} p-5`}>
            <div className="flex items-center gap-2">
              <BellRing size={18} className="text-gray-600" />
              <p className="font-semibold text-gray-950">Recent admin activity</p>
            </div>
            <div className="mt-4 space-y-3">
              {recentAdminEvents.length === 0 ? (
                <p className="text-sm leading-6 text-gray-500">No recent admin activity available for this role.</p>
              ) : (
                recentAdminEvents.slice(0, 6).map((event, index) => (
                  <div key={`${event.created_at}-${index}`} className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-semibold text-gray-900">{event.action}</p>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${event.status_code >= 400 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                        {event.status_code}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-gray-500">{event.user_email ?? event.user_id ?? 'unknown admin'}</p>
                    <p className="mt-2 font-mono text-xs text-gray-500">{event.method} {event.path}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <QuickLink allowed={can('admin.products.manage')} href="/admin/products" icon={LayoutGrid} title="Products" description="Product catalog, service status, and visibility." />
          <QuickLink allowed={can('admin.billing.manage')} href="/admin/billing" icon={CreditCard} title="Billing" description="Plans, prices, and commerce settings." />
          <QuickLink allowed={can('admin.coupons.manage')} href="/admin/coupons" icon={Tag} title="Coupons" description="Discount codes and redemption controls." />
          <QuickLink allowed={can('admin.users.manage')} href="/admin/users" icon={Users} title="Users" description="Roles, access grants, and account support." />
          <QuickLink allowed={can('admin.analytics.view')} href="/admin/english" icon={BookOpen} title="English Ops" description="Content health, service rules, and learning ops." />
          <QuickLink allowed={can('admin.trials.manage')} href="/admin/trials" icon={CheckCircle2} title="Trials" description="Trial campaign controls and claim visibility." />
          <QuickLink allowed={can('admin.announcements.manage')} href="/admin/announcements" icon={BellRing} title="Announcements" description="Product notices and service updates." />
          <QuickLink allowed={can('admin.settings.manage')} href="/admin/settings" icon={Settings} title="Settings" description="Platform defaults and admin security policy." />
        </section>
      </div>
    </AdminLayout>
  );
};
