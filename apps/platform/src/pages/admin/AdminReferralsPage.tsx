import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { supabase } from '../../lib/supabase';
import {
  adminReferralsSummary,
  adminReferralsUpdateDefaultProgram,
  type AdminReferralsSummary,
  type ReferralProgram,
} from '../../lib/platformClient';

const money = (amount?: number | null, currency = 'UZS') =>
  typeof amount === 'number' && Number.isFinite(amount) ? `${amount.toLocaleString()} ${currency}` : '-';

export const AdminReferralsPage: React.FC = () => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [summary, setSummary] = useState<AdminReferralsSummary | null>(null);
  const [program, setProgram] = useState<ReferralProgram | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
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

  const latestRewards = useMemo(() => (summary?.rewards ?? []).slice(0, 12), [summary?.rewards]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Referrals</h1>
            <p className="text-sm text-gray-500">Configure referral discounts, platform-credit rewards, and attribution review.</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {success && <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-md border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-500">Referral accounts</p>
            <p className="mt-2 text-3xl font-semibold">{summary?.analytics.referral_accounts ?? 0}</p>
          </div>
          <div className="rounded-md border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-500">Attributions</p>
            <p className="mt-2 text-3xl font-semibold">{summary?.analytics.attributions ?? 0}</p>
          </div>
          <div className="rounded-md border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-500">Converted</p>
            <p className="mt-2 text-3xl font-semibold">{summary?.analytics.converted_attributions ?? 0}</p>
          </div>
          <div className="rounded-md border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-500">Issued credit</p>
            <p className="mt-2 text-2xl font-semibold">{money(summary?.analytics.issued_credit ?? 0, program?.currency ?? 'UZS')}</p>
          </div>
        </section>

        {program && (
          <section className="rounded-md border border-gray-200 bg-white p-5">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900">Default program</h2>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                Save
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm font-medium text-gray-700">
                Status
                <select value={program.status} onChange={(e) => updateProgram({ status: e.target.value })} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2">
                  <option value="inactive">Inactive</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <label className="text-sm font-medium text-gray-700">
                Currency
                <input value={program.currency} onChange={(e) => updateProgram({ currency: e.target.value.toUpperCase() })} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Minimum purchase
                <input type="number" value={program.min_purchase_amount ?? 0} onChange={(e) => updateProgram({ min_purchase_amount: Number(e.target.value) })} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Referred discount type
                <select value={program.referred_discount_type ?? ''} onChange={(e) => updateProgram({ referred_discount_type: (e.target.value || null) as any })} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2">
                  <option value="">None</option>
                  <option value="percent">Percent</option>
                  <option value="fixed">Fixed</option>
                </select>
              </label>
              <label className="text-sm font-medium text-gray-700">
                Referred discount value
                <input type="number" value={program.referred_discount_value ?? 0} onChange={(e) => updateProgram({ referred_discount_value: Number(e.target.value) })} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Referrer credit type
                <select value={program.referrer_credit_type ?? ''} onChange={(e) => updateProgram({ referrer_credit_type: (e.target.value || null) as any })} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2">
                  <option value="">None</option>
                  <option value="percent">Percent</option>
                  <option value="fixed">Fixed</option>
                </select>
              </label>
              <label className="text-sm font-medium text-gray-700">
                Referrer credit value
                <input type="number" value={program.referrer_credit_value ?? 0} onChange={(e) => updateProgram({ referrer_credit_value: Number(e.target.value) })} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Referrer credit cap
                <input type="number" value={program.referrer_credit_cap ?? 0} onChange={(e) => updateProgram({ referrer_credit_cap: Number(e.target.value) })} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
              </label>
              <label className="flex items-center gap-2 pt-7 text-sm font-medium text-gray-700">
                <input type="checkbox" checked={program.first_purchase_only} onChange={(e) => updateProgram({ first_purchase_only: e.target.checked })} />
                First successful payment only
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
        )}

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-md border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-4 py-3 font-semibold">Recent attributions</div>
            <div className="divide-y divide-gray-100">
              {(summary?.attributions ?? []).slice(0, 12).map((row: any) => (
                <div key={row.id} className="px-4 py-3 text-sm">
                  <p className="font-medium">{row.referral_code} · {row.status}</p>
                  <p className="text-gray-500">{row.referred_user_id} referred by {row.referrer_user_id}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-md border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-4 py-3 font-semibold">Recent rewards</div>
            <div className="divide-y divide-gray-100">
              {latestRewards.map((row: any) => (
                <div key={row.id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 text-sm">
                  <div><p className="font-medium">{row.status}</p><p className="text-gray-500">{row.payment_id}</p></div>
                  <span>{money(row.credit_amount, row.currency)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
};
