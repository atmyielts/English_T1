import React, { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { supabase } from '../../lib/supabase';
import {
  adminPaymentsAnomalies,
  adminPaymentsList,
  adminPaymentsRefreshStatus,
  adminPaymentsRetryGrant,
  adminPaymentsSearch,
  type AdminPayment,
} from '../../lib/platformClient';

export const AdminPaymentsPage: React.FC = () => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdminPayment[]>([]);
  const [grantAnomalyCount, setGrantAnomalyCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setAccessToken(session?.access_token ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadLatest = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const [res, anomalies] = await Promise.all([
        adminPaymentsList(accessToken, { limit: 100 }),
        adminPaymentsAnomalies(accessToken, { minutes: 5, limit: 1 }),
      ]);
      setResults(res.payments ?? []);
      setGrantAnomalyCount(anomalies.count ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!accessToken) return;
    void loadLatest();
  }, [accessToken]);

  const runSearch = async () => {
    if (!accessToken || !query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminPaymentsSearch(accessToken, query.trim(), { limit: 100 });
      setResults(res.payments ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to search');
    } finally {
      setLoading(false);
    }
  };

  const loadAnomalies = async (minutes = 5) => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminPaymentsAnomalies(accessToken, { minutes, limit: 100 });
      setGrantAnomalyCount(res.count ?? 0);
      setResults(res.anomalies ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load anomalies');
    } finally {
      setLoading(false);
    }
  };

  const refreshStatus = async (paymentId: string) => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminPaymentsRefreshStatus(accessToken, paymentId);
      if (res.payment) setResults((prev) => prev.map((p) => (p.id === paymentId ? { ...p, ...res.payment } : p)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh');
    } finally {
      setLoading(false);
    }
  };

  const retryGrant = async (paymentId: string) => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminPaymentsRetryGrant(accessToken, paymentId);
      if (res.payment) setResults((prev) => prev.map((p) => (p.id === paymentId ? { ...p, ...res.payment } : p)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to retry grant');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
          <p className="text-sm text-gray-600">Latest payments are shown by default. Search by email, transaction id, or cheque id.</p>
          <p className="mt-1 text-xs text-gray-500">Grant anomalies (paid but not granted after 5 minutes): {grantAnomalyCount}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col md:flex-row gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="email@example.com or 998877"
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2"
          />
          <button onClick={runSearch} className="px-4 py-2 rounded-xl bg-gray-900 text-white font-semibold">
            Search
          </button>
          <button onClick={() => void loadLatest()} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold">
            Latest
          </button>
          <button onClick={() => void loadAnomalies(5)} className="px-4 py-2 rounded-xl border border-amber-200 text-sm font-semibold text-amber-700">
            Grant anomalies
          </button>
        </div>

        {error ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div> : null}

        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-700">Results</div>
          {loading ? <div className="p-4 text-sm text-gray-500">Loading...</div> : null}
          {!loading && results.length === 0 ? <div className="p-4 text-sm text-gray-500">No payments found.</div> : null}
          {results.map((p) => (
            <div key={p.id} className="p-4 grid grid-cols-1 md:grid-cols-6 gap-3 items-center border-t border-gray-100">
              <div className="text-sm text-gray-700">
                <div className="font-semibold">{p.users?.email ?? p.user_id ?? 'n/a'}</div>
                <div className="text-xs text-gray-500">{p.provider_transaction_id}</div>
              </div>
              <div className="text-sm">{p.status}</div>
              <div className="text-sm">
                {p.amount} {p.currency}
              </div>
              <div className="text-xs text-gray-500">{p.products?.name ?? p.product_id ?? ''}</div>
              <div className="text-xs text-gray-500">{new Date(p.created_at).toLocaleString()}</div>
              <div className="flex gap-2">
                <button onClick={() => void refreshStatus(p.id)} className="px-3 py-2 rounded-xl border border-gray-200 text-sm">
                  Refresh
                </button>
                <button onClick={() => void retryGrant(p.id)} className="px-3 py-2 rounded-xl border border-gray-200 text-sm">
                  Retry grant
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
};
