import React, { useEffect, useState } from 'react';
import { Building2, CheckCircle2, RefreshCw, Save, WalletCards, XCircle } from 'lucide-react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { supabase } from '../../lib/supabase';
import {
  adminPartnersSummary,
  adminPartnersUpdateProfile,
  adminPartnersWallet,
  type AdminPartnerRow,
} from '../../lib/platformClient';

const money = (amount?: number | null, currency = 'UZS') =>
  typeof amount === 'number' && Number.isFinite(amount) ? `${amount.toLocaleString()} ${currency}` : '-';
const inputClass = 'mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm';
const panelClass = 'rounded-2xl border border-gray-200 bg-white p-5';
const selectClass = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm capitalize';
const STATUS_OPTIONS = ['pending', 'active', 'paused', 'disabled'];
const TIER_OPTIONS = ['starter', 'growth', 'premium', 'exclusive'];
const MODEL_OPTIONS = ['prepaid_wallet', 'wholesale', 'revenue_share', 'hybrid'];

const statusClass = (status?: string | null) => {
  const value = String(status ?? '').toLowerCase();
  if (['active', 'posted'].includes(value)) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (['pending', 'reserved', 'paused'].includes(value)) return 'border-amber-200 bg-amber-50 text-amber-800';
  if (['disabled', 'void'].includes(value)) return 'border-red-200 bg-red-50 text-red-700';
  return 'border-gray-200 bg-gray-50 text-gray-700';
};

const StatusPill: React.FC<{ status?: string | null }> = ({ status }) => (
  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusClass(status)}`}>
    {status ?? 'unknown'}
  </span>
);

export const AdminPartnersPage: React.FC = () => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [partners, setPartners] = useState<AdminPartnerRow[]>([]);
  const [topups, setTopups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [adjustments, setAdjustments] = useState<Record<string, { amount: number; note: string }>>({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setAccessToken(session?.access_token ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const load = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminPartnersSummary(accessToken);
      setPartners(res.partners ?? []);
      setTopups(res.topup_requests ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load partners');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const updatePartner = async (tenantId: string, patch: Partial<AdminPartnerRow>) => {
    if (!accessToken) return;
    setBusy(tenantId);
    setError(null);
    setSuccess(null);
    try {
      await adminPartnersUpdateProfile(accessToken, { tenant_id: tenantId, ...patch });
      setSuccess('Partner updated.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update partner');
    } finally {
      setBusy(null);
    }
  };

  const settleTopup = async (request: any, status: 'posted' | 'void') => {
    if (!accessToken) return;
    setBusy(request.id);
    setError(null);
    setSuccess(null);
    try {
      await adminPartnersWallet(accessToken, {
        action: 'settle_topup',
        tenant_id: request.tenant_id,
        ledger_id: request.id,
        status,
      });
      setSuccess(status === 'posted' ? 'Top-up posted.' : 'Top-up voided.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to settle top-up');
    } finally {
      setBusy(null);
    }
  };

  const adjustWallet = async (partner: AdminPartnerRow) => {
    if (!accessToken) return;
    const form = adjustments[partner.tenant_id] ?? { amount: 0, note: '' };
    if (!form.amount) return;
    setBusy(`${partner.tenant_id}:adjust`);
    setError(null);
    setSuccess(null);
    try {
      await adminPartnersWallet(accessToken, {
        action: 'adjust',
        tenant_id: partner.tenant_id,
        entry_kind: 'adjustment',
        amount: form.amount,
        currency: partner.wallet?.currency ?? 'UZS',
        note: form.note,
      });
      setAdjustments((prev) => ({ ...prev, [partner.tenant_id]: { amount: 0, note: '' } }));
      setSuccess('Wallet adjusted.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to adjust wallet');
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Education partners</h1>
            <p className="text-sm text-gray-500">Approve centers, manage tiers, settle wallet requests, and monitor voucher inventory.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div> : null}

        <section className="grid gap-4 md:grid-cols-4">
          <div className={panelClass}><p className="text-sm text-gray-500">Centers</p><p className="mt-2 text-3xl font-semibold">{partners.length}</p></div>
          <div className={panelClass}><p className="text-sm text-gray-500">Active</p><p className="mt-2 text-3xl font-semibold">{partners.filter((p) => p.status === 'active').length}</p></div>
          <div className={panelClass}><p className="text-sm text-gray-500">Pending top-ups</p><p className="mt-2 text-3xl font-semibold">{topups.length}</p></div>
          <div className={panelClass}><p className="text-sm text-gray-500">Vouchers</p><p className="mt-2 text-3xl font-semibold">{partners.reduce((sum, p) => sum + Number(p.voucher_counts?.total ?? 0), 0)}</p></div>
        </section>

        <section className={panelClass}>
          <div className="mb-4 flex items-center gap-2">
            <WalletCards className="h-5 w-5" />
            <h2 className="text-lg font-semibold text-gray-900">Top-up requests</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {topups.map((request) => (
              <div key={request.id} className="grid gap-3 py-4 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
                <div>
                  <p className="font-mono text-sm font-semibold">{request.id}</p>
                  <p className="text-xs text-gray-500">{request.tenant_id} - {new Date(request.created_at).toLocaleString()}</p>
                </div>
                <span className="font-semibold">{money(request.amount, request.currency)}</span>
                <StatusPill status={request.status} />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void settleTopup(request, 'posted')} disabled={busy === request.id} className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-3 py-2 text-sm font-medium text-white">
                    <CheckCircle2 className="h-4 w-4" />
                    Post
                  </button>
                  <button type="button" onClick={() => void settleTopup(request, 'void')} disabled={busy === request.id} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700">
                    <XCircle className="h-4 w-4" />
                    Void
                  </button>
                </div>
              </div>
            ))}
            {topups.length === 0 ? <p className="py-6 text-sm text-gray-500">No pending top-up requests.</p> : null}
          </div>
        </section>

        <section className={panelClass}>
          <div className="mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            <h2 className="text-lg font-semibold text-gray-900">Centers</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3">Center</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Tier</th>
                  <th className="px-4 py-3">Model</th>
                  <th className="px-4 py-3">Wallet</th>
                  <th className="px-4 py-3">Vouchers</th>
                  <th className="px-4 py-3">Adjust</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {partners.map((partner) => {
                  const form = adjustments[partner.tenant_id] ?? { amount: 0, note: '' };
                  return (
                    <tr key={partner.tenant_id}>
                      <td className="px-4 py-4">
                        <p className="font-semibold">{partner.display_name}</p>
                        <p className="text-xs text-gray-500">/{partner.slug}</p>
                      </td>
                      <td className="px-4 py-4 min-w-[150px]">
                        <select value={partner.status} onChange={(e) => void updatePartner(partner.tenant_id, { status: e.target.value })} className={selectClass}>
                          {STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                        <div className="mt-2"><StatusPill status={partner.status} /></div>
                      </td>
                      <td className="px-4 py-4 min-w-[150px]">
                        <select value={partner.package_tier} onChange={(e) => void updatePartner(partner.tenant_id, { package_tier: e.target.value })} className={selectClass}>
                          {TIER_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-4 min-w-[170px]">
                        <select value={partner.commercial_model} onChange={(e) => void updatePartner(partner.tenant_id, { commercial_model: e.target.value })} className={selectClass}>
                          {MODEL_OPTIONS.map((option) => <option key={option} value={option}>{option.replace('_', ' ')}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-4 font-semibold">{money(partner.wallet?.available_amount, partner.wallet?.currency)}</td>
                      <td className="px-4 py-4">{partner.voucher_counts?.redeemed ?? 0}/{partner.voucher_counts?.total ?? 0}</td>
                      <td className="px-4 py-4 min-w-[220px]">
                        <div className="grid gap-2">
                          <input type="number" value={form.amount || ''} onChange={(e) => setAdjustments((prev) => ({ ...prev, [partner.tenant_id]: { ...form, amount: Number(e.target.value) } }))} className={inputClass} placeholder="Amount" />
                          <input value={form.note} onChange={(e) => setAdjustments((prev) => ({ ...prev, [partner.tenant_id]: { ...form, note: e.target.value } }))} className={inputClass} placeholder="Note" />
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => void updatePartner(partner.tenant_id, { status: 'active' })} disabled={busy === partner.tenant_id} className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-3 py-2 text-sm font-medium text-white">
                            Approve
                          </button>
                          <button type="button" onClick={() => void updatePartner(partner.tenant_id, { status: 'paused' })} disabled={busy === partner.tenant_id} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700">
                            Pause
                          </button>
                          <button type="button" onClick={() => void adjustWallet(partner)} disabled={busy === `${partner.tenant_id}:adjust` || !form.amount} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700">
                            <Save className="h-4 w-4" />
                            Adjust
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {partners.length === 0 ? <p className="py-6 text-sm text-gray-500">No partner center profiles yet.</p> : null}
        </section>
      </div>
    </AdminLayout>
  );
};
