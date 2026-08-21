import React, { useEffect, useMemo, useState } from 'react';
import { Activity, BadgeDollarSign, Boxes, RefreshCw, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { supabase } from '../../lib/supabase';
import { adminAnalyticsOverview, type AdminAnalyticsOverviewResponse } from '../../lib/platformClient';

const formatNumber = (value: number): string => new Intl.NumberFormat('en-US').format(value ?? 0);

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'UZS', maximumFractionDigits: 0 }).format(value ?? 0);

const formatPercent = (numerator: number, denominator: number): string =>
  denominator > 0 ? `${Math.round((numerator / denominator) * 100)}%` : 'n/a';

const MetricCard: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div className="bg-white border border-gray-200 rounded-2xl p-4">
    <div className="text-xs font-semibold tracking-wide uppercase text-gray-500">{label}</div>
    <div className="mt-2 text-2xl font-bold text-gray-900">{value}</div>
    {hint ? <div className="mt-1 text-xs text-gray-500">{hint}</div> : null}
  </div>
);

const LoopHandoffCard: React.FC<{
  label: string;
  value: string;
  detail: string;
  href: string;
  action: string;
}> = ({ label, value, detail, href, action }) => (
  <article className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-4">
    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
    <div className="mt-2 text-xl font-bold text-gray-900">{value}</div>
    <p className="mt-2 flex-1 text-sm leading-5 text-gray-600">{detail}</p>
    <Link className="mt-4 inline-flex text-sm font-semibold text-gray-900 underline-offset-4 hover:underline" to={href}>
      {action}
    </Link>
  </article>
);

const TrendBars: React.FC<{ points: Array<{ day: string; count: number }>; color: string }> = ({ points, color }) => {
  const max = Math.max(1, ...points.map((p) => p.count));
  const columnCount = Math.max(points.length, 1);
  return (
    <div
      className="h-24 w-full grid items-end gap-1 overflow-hidden"
      style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
    >
      {points.map((p) => {
        const height = Math.max(4, Math.min(96, Math.round((p.count / max) * 96)));
        return (
          <div key={p.day} className="group min-w-0 flex items-end" title={`${p.day}: ${p.count}`}>
            <div className={`w-full rounded-t ${color} transition-all`} style={{ height: `${height}px` }} />
          </div>
        );
      })}
    </div>
  );
};

export const AdminAnalyticsPage: React.FC = () => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AdminAnalyticsOverviewResponse | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setAccessToken(session?.access_token ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const load = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const data = await adminAnalyticsOverview(accessToken);
      setAnalytics(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!accessToken) return;
    void load();
  }, [accessToken]);

  const truncatedInfo = useMemo(() => analytics?.diagnostics?.truncated_sources?.filter(Boolean) ?? [], [analytics]);
  const reliabilityUnavailable = useMemo(
    () => analytics?.reliability?.unavailable_sources?.filter(Boolean) ?? [],
    [analytics],
  );
  const adminActivity = useMemo(
    () =>
      analytics?.admin_activity ?? {
        available: false,
        requests_24h: 0,
        failed_requests_24h: 0,
        unique_admins_24h: 0,
        top_actions_24h: [] as Array<{ action: string; count: number }>,
        top_admins_24h: [] as Array<{ user_id: string | null; user_email: string | null; count: number }>,
        status_buckets_24h: [] as Array<{ bucket: string; count: number }>,
        daily_requests_30d: [] as Array<{ day: string; count: number }>,
        recent_events: [] as Array<{
          created_at: string;
          user_id: string | null;
          user_email: string | null;
          action: string;
          method: string;
          path: string;
          status_code: number;
          permission_key: string | null;
          ip: string | null;
          request_id: string | null;
        }>,
      },
    [analytics],
  );
  const publicJourney = useMemo(
    () => analytics?.public_journey ?? {
      available: false,
      since: '',
      events: {},
      funnel: { discovered: 0, intent: 0, auth_started: 0, activated: 0 },
      daily: [] as Array<{ day: string; discovered: number; auth_started: number; activated: number }>,
    },
    [analytics],
  );

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
            <p className="text-sm text-gray-600">Users, activity, and service usage across the platform.</p>
          </div>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        {error ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div> : null}
        {truncatedInfo.length > 0 ? (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
            Large datasets were truncated for performance: {truncatedInfo.join(', ')}.
          </div>
        ) : null}
        {reliabilityUnavailable.length > 0 ? (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
            Reliability sources unavailable: {reliabilityUnavailable.join(', ')}.
          </div>
        ) : null}
        {loading ? <div className="text-sm text-gray-500">Loading analytics...</div> : null}

        {analytics ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <MetricCard label="Users total" value={formatNumber(analytics.totals.users_total)} hint={`+${formatNumber(analytics.totals.users_new_7d)} in 7d`} />
              <MetricCard label="Visits (users / 24h)" value={formatNumber(analytics.totals.visits_users_24h)} hint={`${formatNumber(analytics.totals.visits_users_7d)} in 7d`} />
              <MetricCard
                label="Sessions (30d)"
                value={formatNumber(analytics.totals.sessions_30d)}
                hint={`${formatNumber(analytics.totals.sessions_completed_30d)} completed`}
              />
              <MetricCard label="Revenue (30d)" value={formatCurrency(analytics.totals.revenue_30d)} hint={`${formatNumber(analytics.totals.paid_payments_30d)} paid`} />
            </div>
            {publicJourney.available ? (
              <section className="space-y-3" aria-label="Public activation funnel">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Public activation loop (30d)</h2>
                  <p className="text-sm text-gray-600">Unique anonymous journeys from discovery through a completed authenticated return.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  <MetricCard label="Discovered" value={formatNumber(publicJourney.funnel.discovered)} hint="Home, English discovery, or Hub" />
                  <MetricCard
                    label="Showed intent"
                    value={formatNumber(publicJourney.funnel.intent)}
                    hint={`${formatPercent(publicJourney.funnel.intent, publicJourney.funnel.discovered)} of discovery`}
                  />
                  <MetricCard
                    label="Started auth"
                    value={formatNumber(publicJourney.funnel.auth_started)}
                    hint={`${formatPercent(publicJourney.funnel.auth_started, publicJourney.funnel.intent)} of intent`}
                  />
                  <MetricCard
                    label="Returned authenticated"
                    value={formatNumber(publicJourney.funnel.activated)}
                    hint={`${formatPercent(publicJourney.funnel.activated, publicJourney.funnel.auth_started)} of auth starts`}
                  />
                </div>
              </section>
            ) : null}
            <section className="space-y-3" aria-label="Operator loop handoffs">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Operator loop handoffs</h2>
                <p className="text-sm text-gray-600">Each platform signal leads to the existing workspace where an operator can act and verify recovery.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                <LoopHandoffCard
                  label="Learner activation"
                  value={publicJourney.available
                    ? `${formatNumber(publicJourney.funnel.activated)} returned`
                    : 'Awaiting journey data'}
                  detail="Use the acquisition funnel above to find the largest discovery, intent, or authentication drop-off."
                  href="/admin/users"
                  action="Inspect activated accounts"
                />
                <LoopHandoffCard
                  label="Learning completion"
                  value={`${formatPercent(analytics.totals.sessions_completed_30d, analytics.totals.sessions_30d)} completed`}
                  detail={`${formatNumber(analytics.totals.sessions_completed_30d)} of ${formatNumber(analytics.totals.sessions_30d)} sessions completed in the last 30 days.`}
                  href="/admin/english"
                  action="Open English learning ops"
                />
                <LoopHandoffCard
                  label="Content and transfer"
                  value="7 connected skills"
                  detail="Review authored-content readiness, freshness, handoff attempts, and vocabulary activation pressure together."
                  href="/admin/english"
                  action="Open content loop"
                />
                <LoopHandoffCard
                  label="Revenue fulfillment"
                  value={analytics.totals.payments_paid_ungranted_30m > 0
                    ? `${formatNumber(analytics.totals.payments_paid_ungranted_30m)} need review`
                    : 'No stuck grants'}
                  detail="Paid checkouts older than 30 minutes must converge to an entitlement or an operator-owned exception."
                  href="/admin/payments"
                  action="Open payment anomalies"
                />
                <LoopHandoffCard
                  label="Academy operations"
                  value="Owned service queues"
                  detail="Continue into Academy for service requests, collections, staff cases, communications, and operational follow-through."
                  href="/academy-control"
                  action="Open Academy operations"
                />
              </div>
            </section>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <MetricCard
                label="Paid not granted (5m)"
                value={formatNumber(analytics.totals.payments_paid_ungranted_5m)}
                hint="Needs payment grant retry/check"
              />
              <MetricCard
                label="Paid not granted (30m)"
                value={formatNumber(analytics.totals.payments_paid_ungranted_30m)}
                hint="Likely stuck grants"
              />
              <MetricCard
                label="Payments with grant error"
                value={formatNumber(analytics.totals.payments_with_grant_error)}
                hint={`${formatNumber(analytics.reliability.grant_errors_30d)} in last 30 days`}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                label="Paid not granted (2h)"
                value={formatNumber(analytics.totals.payments_paid_ungranted_2h)}
                hint="Escalate if above zero"
              />
              <MetricCard
                label="Paid not granted (24h)"
                value={formatNumber(analytics.totals.payments_paid_ungranted_24h)}
                hint="Should stay zero"
              />
              <MetricCard
                label="Delete blocks (24h)"
                value={formatNumber(analytics.reliability.hard_delete_blocks_24h)}
                hint="Blocked hard-delete attempts"
              />
              <MetricCard
                label="Delete blocks (7d)"
                value={formatNumber(analytics.reliability.hard_delete_blocks_7d)}
                hint="Archive workflow guardrail"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-gray-200 rounded-2xl p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Users size={16} />
                  Signups (30d)
                </div>
                <div className="mt-3">
                  <TrendBars points={analytics.trends_30d.signups_by_day} color="bg-blue-500/75" />
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Activity size={16} />
                  Sessions (30d)
                </div>
                <div className="mt-3">
                  <TrendBars points={analytics.trends_30d.sessions_by_day} color="bg-emerald-500/75" />
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Activity size={16} />
                  Grant errors (30d)
                </div>
                <div className="mt-3">
                  <TrendBars points={analytics.trends_30d.grant_errors_by_day} color="bg-rose-500/75" />
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <BadgeDollarSign size={16} />
                  Paid checkouts (30d)
                </div>
                <div className="mt-3">
                  <TrendBars points={analytics.trends_30d.paid_payments_by_day} color="bg-amber-500/75" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard label="Products active" value={formatNumber(analytics.totals.products_active)} />
              <MetricCard label="Plans active" value={formatNumber(analytics.totals.plans_active)} />
              <MetricCard label="Entitlements active" value={formatNumber(analytics.totals.entitlements_active)} />
              <MetricCard label="Payments total" value={formatNumber(analytics.totals.payments_total)} />
            </div>

            {adminActivity.available ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <MetricCard label="Admin requests (24h)" value={formatNumber(adminActivity.requests_24h)} />
                  <MetricCard label="Admin errors (24h)" value={formatNumber(adminActivity.failed_requests_24h)} />
                  <MetricCard label="Active admins (24h)" value={formatNumber(adminActivity.unique_admins_24h)} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">Admin activity (30d)</div>
                    <div className="mt-3">
                      <TrendBars points={adminActivity.daily_requests_30d} color="bg-violet-500/75" />
                    </div>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
                    <div className="text-sm font-semibold text-gray-700">Top actions (24h)</div>
                    {adminActivity.top_actions_24h.length === 0 ? (
                      <div className="text-sm text-gray-500">No admin actions in the last 24 hours.</div>
                    ) : (
                      adminActivity.top_actions_24h.map((item) => (
                        <div key={item.action} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700 truncate pr-3">{item.action}</span>
                          <span className="font-semibold text-gray-900">{formatNumber(item.count)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-700">Recent admin API events</div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="text-left px-4 py-2 font-semibold">Time</th>
                          <th className="text-left px-4 py-2 font-semibold">Admin</th>
                          <th className="text-left px-4 py-2 font-semibold">Action</th>
                          <th className="text-left px-4 py-2 font-semibold">Route</th>
                          <th className="text-left px-4 py-2 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminActivity.recent_events.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-5 text-gray-500">
                              No recent admin events.
                            </td>
                          </tr>
                        ) : (
                          adminActivity.recent_events.map((event, idx) => (
                            <tr key={`${event.created_at}-${idx}`} className="border-t border-gray-100">
                              <td className="px-4 py-3 text-gray-700">{new Date(event.created_at).toLocaleString()}</td>
                              <td className="px-4 py-3 text-gray-700">{event.user_email ?? event.user_id ?? 'unknown'}</td>
                              <td className="px-4 py-3 text-gray-700">{event.action}</td>
                              <td className="px-4 py-3 text-gray-700 font-mono text-xs">{event.method} {event.path}</td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex px-2 py-0.5 rounded-full border text-xs ${
                                    event.status_code >= 500
                                      ? 'bg-red-50 text-red-700 border-red-200'
                                      : event.status_code >= 400
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  }`}
                                >
                                  {event.status_code}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-sm text-gray-500 bg-white border border-gray-200 rounded-2xl p-4">
                Admin activity monitoring requires <code>admin.activity.view</code> permission.
              </div>
            )}

            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2 text-sm font-semibold text-gray-700">
                Reliability events
              </div>
              <div className="p-4">
                {analytics.reliability.recent_hard_delete_blocks.length === 0 ? (
                  <div className="text-sm text-gray-500">No blocked hard-delete attempts recently.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold">Time</th>
                          <th className="text-left px-3 py-2 font-semibold">Table</th>
                          <th className="text-left px-3 py-2 font-semibold">Row</th>
                          <th className="text-left px-3 py-2 font-semibold">Actor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.reliability.recent_hard_delete_blocks.map((event, idx) => (
                          <tr key={`${event.created_at}-${idx}`} className="border-t border-gray-100">
                            <td className="px-3 py-2 text-gray-700">{new Date(event.created_at).toLocaleString()}</td>
                            <td className="px-3 py-2 text-gray-700">{event.table_name ?? 'n/a'}</td>
                            <td className="px-3 py-2 text-gray-700 font-mono text-xs">{event.row_id ?? 'n/a'}</td>
                            <td className="px-3 py-2 text-gray-700 font-mono text-xs">{event.actor_user_id ?? 'unknown'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Boxes size={16} />
                Services in use (30d)
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-4 py-2 font-semibold">Service</th>
                      <th className="text-left px-4 py-2 font-semibold">Type</th>
                      <th className="text-right px-4 py-2 font-semibold">Users</th>
                      <th className="text-right px-4 py-2 font-semibold">Sessions</th>
                      <th className="text-right px-4 py-2 font-semibold">Entitlements</th>
                      <th className="text-right px-4 py-2 font-semibold">Paid</th>
                      <th className="text-right px-4 py-2 font-semibold">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.services.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-5 text-gray-500">
                          No services found.
                        </td>
                      </tr>
                    ) : (
                      analytics.services.map((service) => (
                        <tr key={service.product_id} className="border-t border-gray-100">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-gray-900">{service.name}</div>
                            <div className="text-xs text-gray-500">{service.status}</div>
                          </td>
                          <td className="px-4 py-3 text-gray-700">{service.type}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{formatNumber(service.users_30d)}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{formatNumber(service.sessions_30d)}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{formatNumber(service.active_entitlements)}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{formatNumber(service.paid_payments_30d)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(service.revenue_30d)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </AdminLayout>
  );
};
