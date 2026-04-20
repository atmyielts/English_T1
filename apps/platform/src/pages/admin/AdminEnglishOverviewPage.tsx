import React, { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import {
  adminEnglishContentSummary,
  adminEnglishOpsDashboard,
  type AdminEnglishContentSummaryRow,
  type AdminEnglishOpsDashboard,
} from '../../lib/platformClient';
import { EnglishAdminSubnav, toFriendlyAdminError, useAdminAccessToken } from './AdminEnglishUtils';

const serviceAccent: Record<string, string> = {
  reading: 'from-emerald-100 to-emerald-50 text-emerald-900',
  listening: 'from-sky-100 to-sky-50 text-sky-900',
  writing: 'from-amber-100 to-amber-50 text-amber-900',
  speaking: 'from-rose-100 to-rose-50 text-rose-900',
  grammar: 'from-indigo-100 to-indigo-50 text-indigo-900',
  vocabulary: 'from-teal-100 to-teal-50 text-teal-900',
  immersion: 'from-yellow-100 to-yellow-50 text-yellow-900',
};

const pct = (value: number | null | undefined): string => `${Math.round((value ?? 0) * 100)}%`;

export const AdminEnglishOverviewPage: React.FC = () => {
  const { withFreshToken } = useAdminAccessToken();
  const [summary, setSummary] = useState<AdminEnglishContentSummaryRow[]>([]);
  const [dashboard, setDashboard] = useState<AdminEnglishOpsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void Promise.all([
      withFreshToken((token) => adminEnglishContentSummary(token)),
      withFreshToken((token) => adminEnglishOpsDashboard(token)),
    ])
      .then(([summaryPayload, dashboardPayload]) => {
        if (cancelled) return;
        setSummary(summaryPayload.services ?? []);
        setDashboard(dashboardPayload);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(toFriendlyAdminError(err, 'Could not load the English overview right now.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [withFreshToken]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <section className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <span className="inline-flex rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-orange-800">
                English Premium Suite
              </span>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">English overview</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
                  Service health, authored-content readiness, transfer pressure, and recent rule movement across the premium English ecosystem.
                </p>
              </div>
            </div>
            <EnglishAdminSubnav active="overview" />
          </div>
        </section>

        {error ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Recommendations 30d</div>
            <div className="mt-3 text-3xl font-bold text-gray-900">{dashboard?.overview.recommendations_30d ?? 0}</div>
            <p className="mt-2 text-sm text-gray-600">Active now: {dashboard?.overview.active_recommendations_now ?? 0}</p>
          </article>
          <article className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Mastery reopenings</div>
            <div className="mt-3 text-3xl font-bold text-gray-900">{dashboard?.overview.mastery_reopenings_30d ?? 0}</div>
            <p className="mt-2 text-sm text-gray-600">Last 7 days: {dashboard?.overview.mastery_reopenings_7d ?? 0}</p>
          </article>
          <article className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Activation pressure</div>
            <div className="mt-3 text-3xl font-bold text-gray-900">{dashboard?.overview.activation_candidates_now ?? 0}</div>
            <p className="mt-2 text-sm text-gray-600">Words currently waiting for productive use</p>
          </article>
          <article className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Rule changes</div>
            <div className="mt-3 text-3xl font-bold text-gray-900">{dashboard?.overview.recent_rule_changes_30d ?? 0}</div>
            <p className="mt-2 text-sm text-gray-600">Recent policy edits across English ops</p>
          </article>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
          <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Service health cards</h2>
                <p className="mt-1 text-sm text-gray-600">Publishing readiness and freshness across each learner surface.</p>
              </div>
              {loading ? <span className="text-sm text-gray-500">Loading...</span> : null}
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {summary.map((row) => (
                <article
                  key={row.service_key}
                  className={`rounded-3xl border border-gray-200 bg-gradient-to-br p-5 shadow-sm ${serviceAccent[row.service_key] ?? 'from-gray-100 to-white text-gray-900'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">{row.service_key}</div>
                      <h3 className="mt-2 text-xl font-bold">{row.label}</h3>
                    </div>
                    <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em]">
                      {row.readiness.replace(/-/g, ' ')}
                    </span>
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
                    <div className="rounded-2xl bg-white/75 p-3">
                      <div className="text-xs uppercase tracking-[0.14em] opacity-60">Total</div>
                      <div className="mt-1 text-xl font-bold">{row.total_count}</div>
                    </div>
                    <div className="rounded-2xl bg-white/75 p-3">
                      <div className="text-xs uppercase tracking-[0.14em] opacity-60">Published</div>
                      <div className="mt-1 text-xl font-bold">{row.published_count}</div>
                    </div>
                    <div className="rounded-2xl bg-white/75 p-3">
                      <div className="text-xs uppercase tracking-[0.14em] opacity-60">Drafts</div>
                      <div className="mt-1 text-xl font-bold">{row.draft_count}</div>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-6 opacity-80">
                    {row.note ?? (row.latest_updated_at ? `Latest content touch: ${new Date(row.latest_updated_at).toLocaleString()}` : 'No authored content timestamp available yet.')}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Weakest handoff chains</h2>
              <p className="mt-1 text-sm text-gray-600">Transfer routes with the most generated recommendations right now.</p>
            </div>
            <div className="mt-5 space-y-3">
              {(dashboard?.service_transfer ?? []).slice(0, 6).map((route) => (
                <div key={`${route.source_service_key}-${route.target_service_key}`} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-sm text-gray-900">
                      {(route.source_service_key || '*').toUpperCase()} to {route.target_service_key.toUpperCase()}
                    </strong>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-600">
                      success {pct(route.attempted > 0 ? route.successful / route.attempted : 0)}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3 text-sm text-gray-600">
                    <div>Generated: {route.generated}</div>
                    <div>Attempted: {route.attempted}</div>
                    <div>Avg score: {route.avg_attempt_score != null ? pct(route.avg_attempt_score) : 'n/a'}</div>
                  </div>
                </div>
              ))}
              {dashboard && dashboard.service_transfer.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                  No service transfer data yet. Complete more cross-service attempts to populate this view.
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
          <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900">Handoff effectiveness matrix</h2>
            <p className="mt-1 text-sm text-gray-600">Rules-first recommendation types and their current follow-through.</p>
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.14em] text-gray-500">
                  <tr>
                    <th className="pb-3 pr-4">Type</th>
                    <th className="pb-3 pr-4">Generated</th>
                    <th className="pb-3 pr-4">Attempt rate</th>
                    <th className="pb-3 pr-4">Success rate</th>
                    <th className="pb-3">Avg score</th>
                  </tr>
                </thead>
                <tbody>
                  {(dashboard?.handoff_effectiveness ?? []).map((row) => (
                    <tr key={row.recommendation_type} className="border-t border-gray-100">
                      <td className="py-3 pr-4 font-semibold text-gray-900">{row.recommendation_type}</td>
                      <td className="py-3 pr-4 text-gray-600">{row.generated}</td>
                      <td className="py-3 pr-4 text-gray-600">{pct(row.attempt_rate)}</td>
                      <td className="py-3 pr-4 text-gray-600">{pct(row.success_rate)}</td>
                      <td className="py-3 text-gray-600">{row.avg_attempt_score != null ? pct(row.avg_attempt_score) : 'n/a'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900">Vocabulary activation pressure</h2>
            <p className="mt-1 text-sm text-gray-600">How much lexical memory is waiting to become productive language.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl bg-teal-50 p-4">
                <div className="text-xs uppercase tracking-[0.14em] text-teal-800">Candidates now</div>
                <div className="mt-2 text-3xl font-bold text-teal-950">{dashboard?.vocabulary_activation.activation_candidates_now ?? 0}</div>
              </div>
              <div className="rounded-3xl bg-teal-50 p-4">
                <div className="text-xs uppercase tracking-[0.14em] text-teal-800">Successful follow-through</div>
                <div className="mt-2 text-3xl font-bold text-teal-950">{dashboard?.vocabulary_activation.successful_followthrough_30d ?? 0}</div>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-gray-600">
              Idle-day threshold: {dashboard?.vocabulary_activation.idle_days_threshold ?? 0} days. Productive attempts in the last 30 days:
              {' '}
              {dashboard?.vocabulary_activation.productive_followthrough_30d ?? 0}.
            </p>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
};
