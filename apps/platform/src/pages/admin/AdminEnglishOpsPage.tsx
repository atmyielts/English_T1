import React, { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { adminEnglishOpsDashboard, type AdminEnglishOpsDashboard } from '../../lib/platformClient';
import { EnglishAdminSubnav, toFriendlyAdminError, useAdminAccessToken } from './AdminEnglishUtils';

const pct = (value: number | null | undefined): string => `${Math.round((value ?? 0) * 100)}%`;

export const AdminEnglishOpsPage: React.FC = () => {
  const { withFreshToken } = useAdminAccessToken();
  const [dashboard, setDashboard] = useState<AdminEnglishOpsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void withFreshToken((token) => adminEnglishOpsDashboard(token))
      .then((payload) => {
        if (!cancelled) setDashboard(payload);
      })
      .catch((err) => {
        if (!cancelled) setError(toFriendlyAdminError(err, 'Could not load English ops metrics right now.'));
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
              <span className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-800">
                English Ops
              </span>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Ops dashboard</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
                  Handoff effectiveness, reopen pressure, service-transfer bottlenecks, and vocabulary activation follow-through.
                </p>
              </div>
            </div>
            <EnglishAdminSubnav active="ops" />
          </div>
        </section>

        {error ? <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div> : null}
        {loading ? <div className="rounded-3xl border border-gray-200 bg-white px-5 py-4 text-sm text-gray-500 shadow-sm">Loading English ops...</div> : null}

        <section className="grid gap-4 xl:grid-cols-[1.12fr_0.88fr]">
          <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900">Service-to-service transfer</h2>
            <p className="mt-1 text-sm text-gray-600">Which routes are generating the most pressure right now.</p>
            <div className="mt-5 space-y-3">
              {(dashboard?.service_transfer ?? []).map((route) => (
                <div key={`${route.source_service_key}-${route.target_service_key}`} className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-sm text-gray-900">
                      {(route.source_service_key || '*').toUpperCase()} to {route.target_service_key.toUpperCase()}
                    </strong>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-600">
                      avg {route.avg_attempt_score != null ? pct(route.avg_attempt_score) : 'n/a'}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3 text-sm text-gray-600">
                    <div>Generated: {route.generated}</div>
                    <div>Attempted: {route.attempted}</div>
                    <div>Successful: {route.successful}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900">Mastery reopen pressure</h2>
              <p className="mt-1 text-sm text-gray-600">Stable areas slipping under transfer stress.</p>
              <div className="mt-5 space-y-3">
                {(dashboard?.mastery_reopenings.by_service ?? []).map((row) => (
                  <div key={row.service_key} className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 text-sm">
                    <span className="font-semibold uppercase tracking-[0.12em] text-gray-600">{row.service_key}</span>
                    <strong className="text-gray-900">{row.count}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900">Vocabulary activation</h2>
              <p className="mt-1 text-sm text-gray-600">How successfully passive memory becomes productive use.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-3xl bg-teal-50 p-4">
                  <div className="text-xs uppercase tracking-[0.14em] text-teal-700">Candidates</div>
                  <div className="mt-2 text-3xl font-bold text-teal-950">{dashboard?.vocabulary_activation.activation_candidates_now ?? 0}</div>
                </div>
                <div className="rounded-3xl bg-teal-50 p-4">
                  <div className="text-xs uppercase tracking-[0.14em] text-teal-700">Successful</div>
                  <div className="mt-2 text-3xl font-bold text-teal-950">{dashboard?.vocabulary_activation.successful_followthrough_30d ?? 0}</div>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-gray-600">
                Recommendations 30d: {dashboard?.vocabulary_activation.activation_recommendations_30d ?? 0}. Productive follow-through:
                {' '}
                {dashboard?.vocabulary_activation.productive_followthrough_30d ?? 0}.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">Recommendation outcome matrix</h2>
          <p className="mt-1 text-sm text-gray-600">Attempt and success behavior by recommendation type.</p>
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
        </section>
      </div>
    </AdminLayout>
  );
};
