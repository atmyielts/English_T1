import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, CheckCircle2, RefreshCw, Save, Sparkles, XCircle } from 'lucide-react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { supabase } from '../../lib/supabase';
import {
  adminReferralsSettleCashPayout,
  adminReferralsSummary,
  adminReferralsUpdateDefaultProgram,
  type AdminReferralsSummary,
  type ReferralProgram,
} from '../../lib/platformClient';

const money = (amount?: number | null, currency = 'UZS') =>
  typeof amount === 'number' && Number.isFinite(amount) ? `${amount.toLocaleString()} ${currency}` : '-';

const inputClass = 'mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm';
const panelClass = 'rounded-2xl border border-gray-200 bg-white p-5';

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};

const statusClass = (status?: string | null) => {
  const value = String(status ?? '').toLowerCase();
  if (['active', 'issued', 'available', 'approved', 'paid', 'converted'].includes(value)) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (['requested', 'pending', 'paused'].includes(value)) return 'border-amber-200 bg-amber-50 text-amber-800';
  if (['rejected', 'reversed', 'void', 'archived'].includes(value)) return 'border-red-200 bg-red-50 text-red-700';
  return 'border-gray-200 bg-gray-50 text-gray-700';
};

const StatusPill: React.FC<{ status?: string | null }> = ({ status }) => (
  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusClass(status)}`}>
    {status ?? 'unknown'}
  </span>
);

export const AdminReferralsPage: React.FC = () => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [summary, setSummary] = useState<AdminReferralsSummary | null>(null);
  const [program, setProgram] = useState<ReferralProgram | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
      const res = await adminReferralsSummary(accessToken);
      setSummary(res);
      setProgram(res.programs.find((item) => item.program_key === 'default') ?? res.programs[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load referrals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const updateProgram = (patch: Partial<ReferralProgram>) => setProgram((prev) => (prev ? { ...prev, ...patch } : prev));

  const save = async () => {
    if (!accessToken || !program) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await adminReferralsUpdateDefaultProgram(accessToken, {
        name: program.name,
        status: program.status,
        currency: program.currency,
        referred_discount_type: program.referred_discount_type,
        referred_discount_value: program.referred_discount_value,
        referrer_credit_type: program.referrer_credit_type,
        referrer_credit_value: program.referrer_credit_value,
        referrer_credit_cap: program.referrer_credit_cap,
        referrer_cash_type: program.referrer_cash_type ?? null,
        referrer_cash_value: program.referrer_cash_value ?? null,
        referrer_cash_cap: program.referrer_cash_cap ?? null,
        cash_payouts_enabled: Boolean(program.cash_payouts_enabled),
        minimum_cash_payout_amount: program.minimum_cash_payout_amount ?? 0,
        min_purchase_amount: program.min_purchase_amount,
        eligible_purchase_types: program.eligible_purchase_types,
        first_purchase_only: program.first_purchase_only,
        metadata: program.metadata ?? {},
      });
      if (res.program) setProgram(res.program);
      setSuccess('Referral program saved.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save referral program');
    } finally {
      setSaving(false);
    }
  };

  const settlePayout = async (requestId: string, action: 'approve' | 'paid' | 'reject') => {
    if (!accessToken) return;
    setActionBusy(`${requestId}:${action}`);
    setError(null);
    setSuccess(null);
    try {
      await adminReferralsSettleCashPayout(accessToken, { request_id: requestId, action });
      setSuccess(action === 'paid' ? 'Cash payout archived as paid.' : `Cash payout ${action}d.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update cash payout');
    } finally {
      setActionBusy(null);
    }
  };

  const payoutRequests = summary?.cash_payout_requests ?? [];
  const activeRewards = useMemo(
    () => (summary?.rewards ?? []).filter((row: any) => row.status === 'issued' && !['paid', 'void'].includes(String(row.cash_status ?? '')) && !row.archived_at),
    [summary?.rewards],
  );
  const rewardHistory = useMemo(
    () => (summary?.rewards ?? []).filter((row: any) => row.status === 'reversed' || row.archived_at || ['paid', 'void'].includes(String(row.cash_status ?? ''))),
    [summary?.rewards],
  );
  const growthProgram = useMemo(() => asRecord(asRecord(program?.metadata).growth_program), [program?.metadata]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Referrals</h1>
            <p className="text-sm text-gray-500">Configure discounts, platform credit, cash rewards, payout requests, and archived reward history.</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div> : null}

        <section className="grid gap-4 md:grid-cols-5">
          <div className={panelClass}>
            <p className="text-sm text-gray-500">Referral accounts</p>
            <p className="mt-2 text-3xl font-semibold">{summary?.analytics.referral_accounts ?? 0}</p>
          </div>
          <div className={panelClass}>
            <p className="text-sm text-gray-500">Converted</p>
            <p className="mt-2 text-3xl font-semibold">{summary?.analytics.converted_attributions ?? 0}</p>
          </div>
          <div className={panelClass}>
            <p className="text-sm text-gray-500">Issued credit</p>
            <p className="mt-2 text-xl font-semibold">{money(summary?.analytics.issued_credit ?? 0, program?.currency ?? 'UZS')}</p>
          </div>
          <div className={panelClass}>
            <p className="text-sm text-gray-500">Active cash</p>
            <p className="mt-2 text-xl font-semibold">{money(summary?.analytics.active_cash ?? 0, program?.currency ?? 'UZS')}</p>
          </div>
          <div className={panelClass}>
            <p className="text-sm text-gray-500">Paid cash</p>
            <p className="mt-2 text-xl font-semibold">{money(summary?.analytics.paid_cash ?? 0, program?.currency ?? 'UZS')}</p>
          </div>
        </section>

        {program ? (
          <section className={panelClass}>
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-gray-600" />
              <h2 className="text-lg font-semibold text-gray-900">Program strategy</h2>
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{growthProgram.brand_name ?? program.name}</p>
                <p className="mt-2 text-2xl font-semibold text-gray-900">{growthProgram.tagline ?? 'Share Schood, fund the next study step.'}</p>
                <p className="mt-2 text-sm leading-6 text-gray-600">{growthProgram.description ?? 'Referral links route people into the right Schood service while keeping attribution through signup and checkout.'}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-white p-4">
                <p className="text-sm font-semibold text-gray-900">Commercial guardrails</p>
                <div className="mt-3 space-y-2 text-sm text-gray-600">
                  <div className="flex justify-between gap-3"><span>Status</span><StatusPill status={program.status} /></div>
                  <div className="flex justify-between gap-3"><span>First purchase only</span><span className="font-medium">{program.first_purchase_only ? 'Yes' : 'No'}</span></div>
                  <div className="flex justify-between gap-3"><span>Cash payouts</span><span className="font-medium">{program.cash_payouts_enabled ? 'Enabled' : 'Disabled'}</span></div>
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              {(Array.isArray(growthProgram.audiences) ? growthProgram.audiences : []).slice(0, 4).map((audience: any) => (
                <div key={audience.id ?? audience.label} className="rounded-2xl border border-gray-100 bg-white p-4">
                  <p className="font-medium text-gray-900">{audience.label ?? audience.id}</p>
                  <p className="mt-1 text-sm leading-6 text-gray-500">{audience.description ?? '-'}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {program ? (
          <section className={panelClass}>
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900">Default program</h2>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                Save
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <label className="text-sm font-medium text-gray-700">
                Status
                <select value={program.status} onChange={(e) => updateProgram({ status: e.target.value })} className={inputClass}>
                  <option value="inactive">Inactive</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <label className="text-sm font-medium text-gray-700">
                Currency
                <input value={program.currency} onChange={(e) => updateProgram({ currency: e.target.value.toUpperCase() })} className={inputClass} />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Minimum purchase
                <input type="number" value={program.min_purchase_amount ?? 0} onChange={(e) => updateProgram({ min_purchase_amount: Number(e.target.value) })} className={inputClass} />
              </label>
              <label className="flex items-center gap-2 pt-7 text-sm font-medium text-gray-700">
                <input type="checkbox" checked={program.first_purchase_only} onChange={(e) => updateProgram({ first_purchase_only: e.target.checked })} />
                First successful payment only
              </label>

              <label className="text-sm font-medium text-gray-700">
                Referred discount type
                <select value={program.referred_discount_type ?? ''} onChange={(e) => updateProgram({ referred_discount_type: (e.target.value || null) as any })} className={inputClass}>
                  <option value="">None</option>
                  <option value="percent">Percent</option>
                  <option value="fixed">Fixed</option>
                </select>
              </label>
              <label className="text-sm font-medium text-gray-700">
                Referred discount value
                <input type="number" value={program.referred_discount_value ?? 0} onChange={(e) => updateProgram({ referred_discount_value: Number(e.target.value) })} className={inputClass} />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Referrer credit type
                <select value={program.referrer_credit_type ?? ''} onChange={(e) => updateProgram({ referrer_credit_type: (e.target.value || null) as any })} className={inputClass}>
                  <option value="">None</option>
                  <option value="percent">Percent</option>
                  <option value="fixed">Fixed</option>
                </select>
              </label>
              <label className="text-sm font-medium text-gray-700">
                Referrer credit value
                <input type="number" value={program.referrer_credit_value ?? 0} onChange={(e) => updateProgram({ referrer_credit_value: Number(e.target.value) })} className={inputClass} />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Referrer credit cap
                <input type="number" value={program.referrer_credit_cap ?? 0} onChange={(e) => updateProgram({ referrer_credit_cap: Number(e.target.value) })} className={inputClass} />
              </label>

              <label className="flex items-center gap-2 pt-7 text-sm font-medium text-gray-700">
                <input type="checkbox" checked={Boolean(program.cash_payouts_enabled)} onChange={(e) => updateProgram({ cash_payouts_enabled: e.target.checked })} />
                Cash payouts enabled
              </label>
              <label className="text-sm font-medium text-gray-700">
                Referrer cash type
                <select value={program.referrer_cash_type ?? ''} onChange={(e) => updateProgram({ referrer_cash_type: (e.target.value || null) as any })} className={inputClass}>
                  <option value="">None</option>
                  <option value="percent">Percent</option>
                  <option value="fixed">Fixed</option>
                </select>
              </label>
              <label className="text-sm font-medium text-gray-700">
                Referrer cash value
                <input type="number" value={program.referrer_cash_value ?? 0} onChange={(e) => updateProgram({ referrer_cash_value: Number(e.target.value) })} className={inputClass} />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Referrer cash cap
                <input type="number" value={program.referrer_cash_cap ?? 0} onChange={(e) => updateProgram({ referrer_cash_cap: Number(e.target.value) })} className={inputClass} />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Minimum cash payout
                <input type="number" value={program.minimum_cash_payout_amount ?? 0} onChange={(e) => updateProgram({ minimum_cash_payout_amount: Number(e.target.value) })} className={inputClass} />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              {['plan', 'token_pack', 'seat_pack'].map((type) => (
                <label key={type} className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={(program.eligible_purchase_types ?? []).includes(type)}
                    onChange={(e) => {
                      const current = new Set(program.eligible_purchase_types ?? []);
                      if (e.target.checked) current.add(type);
                      else current.delete(type);
                      updateProgram({ eligible_purchase_types: Array.from(current) });
                    }}
                  />
                  {type}
                </label>
              ))}
            </div>
          </section>
        ) : null}

        <section className={panelClass}>
          <div className="mb-4 flex items-center gap-2">
            <Banknote className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Cash payout queue</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-3 py-2">Request</th>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payoutRequests.map((request: any) => (
                  <tr key={request.id}>
                    <td className="px-3 py-3 font-mono text-xs">{request.id}</td>
                    <td className="px-3 py-3 font-mono text-xs">{request.user_id}</td>
                    <td className="px-3 py-3">
                      <div className="font-medium">{request.payout_method}</div>
                      <div className="max-w-xs truncate text-xs text-gray-500">{request.payout_details?.instructions ?? request.note ?? '-'}</div>
                    </td>
                    <td className="px-3 py-3 font-semibold">{money(request.amount, request.currency)}</td>
                    <td className="px-3 py-3"><StatusPill status={request.status} /></td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={actionBusy === `${request.id}:approve`} onClick={() => void settlePayout(request.id, 'approve')} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Approve
                        </button>
                        <button type="button" disabled={actionBusy === `${request.id}:paid`} onClick={() => void settlePayout(request.id, 'paid')} className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-2 py-1 text-xs font-semibold text-white">
                          Paid
                        </button>
                        <button type="button" disabled={actionBusy === `${request.id}:reject`} onClick={() => void settlePayout(request.id, 'reject')} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700">
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {payoutRequests.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-gray-500" colSpan={6}>No cash payout requests yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className={panelClass}>
            <div className="border-b border-gray-100 pb-3 font-semibold">Active rewards</div>
            <div className="divide-y divide-gray-100">
              {activeRewards.slice(0, 20).map((row: any) => (
                <div key={row.id} className="grid grid-cols-[1fr_auto] gap-3 py-3 text-sm">
                  <div>
                    <p className="font-medium">{row.payment_id}</p>
                    <p className="text-gray-500">Cash {money(row.cash_amount, row.currency)} / Credit {money(row.credit_amount, row.currency)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusPill status={row.status} />
                    <StatusPill status={row.cash_status} />
                  </div>
                </div>
              ))}
              {activeRewards.length === 0 ? <div className="py-6 text-sm text-gray-500">No active rewards.</div> : null}
            </div>
          </div>

          <div className={panelClass}>
            <div className="border-b border-gray-100 pb-3 font-semibold">Reward history</div>
            <div className="divide-y divide-gray-100">
              {rewardHistory.slice(0, 20).map((row: any) => (
                <div key={row.id} className="grid grid-cols-[1fr_auto] gap-3 py-3 text-sm">
                  <div>
                    <p className="font-medium">{row.payment_id}</p>
                    <p className="text-gray-500">{row.archive_reason ?? row.status}</p>
                  </div>
                  <span>{money(row.cash_amount || row.credit_amount, row.currency)}</span>
                </div>
              ))}
              {rewardHistory.length === 0 ? <div className="py-6 text-sm text-gray-500">No archived reward history.</div> : null}
            </div>
          </div>
        </section>

        <section className={panelClass}>
          <div className="border-b border-gray-100 pb-3 font-semibold">Recent attributions</div>
          <div className="divide-y divide-gray-100">
            {(summary?.attributions ?? []).slice(0, 12).map((row: any) => (
              <div key={row.id} className="px-1 py-3 text-sm">
                <p className="font-medium">{row.referral_code} - {row.status}</p>
                <p className="text-gray-500">{row.referred_user_id} referred by {row.referrer_user_id}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AdminLayout>
  );
};
