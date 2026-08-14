import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleOff, Cloud, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import {
  academyVideoPolicyList,
  academyVideoPolicyUpdate,
  academyVideoProviderHealth,
  type AcademyVideoHealth,
  type AcademyVideoPolicyRow,
} from '../../lib/platformClient';

type Props = {
  accessToken: string;
  globalEnabled: boolean;
  onGlobalEnabledChange: (enabled: boolean) => void;
};

const emptyPolicy = (academyId: string) => ({
  academy_id: academyId,
  upload_enabled: false,
  max_asset_duration_seconds: 0,
  max_total_stored_minutes: 0,
  max_monthly_upload_minutes: 0,
  approved_by: null,
  approved_at: null,
  updated_at: '',
});

export const AcademyVideoSettingsPanel: React.FC<Props> = ({ accessToken, globalEnabled, onGlobalEnabledChange }) => {
  const [health, setHealth] = useState<AcademyVideoHealth | null>(null);
  const [rows, setRows] = useState<AcademyVideoPolicyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [savingAcademyId, setSavingAcademyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await academyVideoPolicyList(accessToken);
      setHealth(result.health);
      setRows(result.academies.map((row) => ({ ...row, policy: row.policy ?? emptyPolicy(row.academy.id) })));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load Academy video policy');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => `${row.academy.name} ${row.academy.slug}`.toLowerCase().includes(needle));
  }, [query, rows]);

  const updateDraft = (academyId: string, patch: Record<string, boolean | number>) => {
    setRows((current) => current.map((row) => row.academy.id === academyId
      ? { ...row, policy: { ...(row.policy ?? emptyPolicy(academyId)), ...patch } }
      : row));
  };

  const savePolicy = async (row: AcademyVideoPolicyRow) => {
    const policy = row.policy ?? emptyPolicy(row.academy.id);
    setSavingAcademyId(row.academy.id);
    setError(null);
    try {
      const result = await academyVideoPolicyUpdate(accessToken, {
        academy_id: row.academy.id,
        upload_enabled: policy.upload_enabled,
        max_asset_duration_seconds: Number(policy.max_asset_duration_seconds) || 0,
        max_total_stored_minutes: Number(policy.max_total_stored_minutes) || 0,
        max_monthly_upload_minutes: Number(policy.max_monthly_upload_minutes) || 0,
      });
      setRows((current) => current.map((candidate) => candidate.academy.id === row.academy.id
        ? { ...candidate, policy: result.policy }
        : candidate));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to update Academy video policy');
    } finally {
      setSavingAcademyId(null);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setError(null);
    try {
      setHealth(await academyVideoProviderHealth(accessToken, true));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Cloudflare Stream could not be reached');
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden" aria-labelledby="academy-video-settings-title">
      <div className="p-5 border-b border-gray-200 bg-[#f6f0e4] flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#715943]"><Cloud size={15} /> Managed lesson video</div>
          <h2 id="academy-video-settings-title" className="mt-2 text-xl font-bold text-[#472f26]">Cloudflare Stream controls</h2>
          <p className="mt-1 text-sm text-[#75665d]">Secrets remain in Supabase. This screen can enable the provider and set hard academy cost limits, but never displays a credential.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-300 bg-white text-sm font-semibold"><RefreshCw size={15} /> Refresh</button>
          <button type="button" onClick={() => void testConnection()} disabled={testing || !health?.configured} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#472f26] text-[#f6f0e4] text-sm font-semibold disabled:opacity-50"><ShieldCheck size={15} /> {testing ? 'Testing…' : 'Test connection'}</button>
        </div>
      </div>

      {error ? <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</div> : null}

      <div className="p-5 space-y-5">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-4 items-start">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            {Object.entries(health?.fields ?? {}).map(([field, present]) => (
              <div key={field} className={`rounded-xl border p-3 ${present ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                <div className="flex items-center gap-2 text-xs font-semibold">
                  {present ? <CheckCircle2 size={15} className="text-emerald-700" /> : <CircleOff size={15} className="text-amber-700" />}
                  {field.replaceAll('_', ' ')}
                </div>
                <div className="mt-1 text-[11px] text-gray-600">{present ? 'Present' : 'Missing'}</div>
              </div>
            ))}
            {!health ? <div className="text-sm text-gray-500">Loading provider health…</div> : null}
          </div>
          <label className={`rounded-xl border p-3 flex items-start gap-3 ${health?.configured ? 'border-gray-300' : 'border-amber-200 bg-amber-50'}`}>
            <input
              type="checkbox"
              checked={globalEnabled}
              disabled={!health?.configured}
              onChange={(event) => onGlobalEnabledChange(event.target.checked)}
              className="mt-1"
            />
            <span><strong className="block text-sm">Global upload switch</strong><span className="block text-xs text-gray-600">Requires all secrets and saved platform settings.</span></span>
          </label>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 flex gap-2">
          <TriangleAlert size={18} className="shrink-0 mt-0.5" />
          <p>Global enablement never grants an academy access. Each academy also needs approval and positive duration, storage, and monthly upload limits.</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div><h3 className="font-bold text-gray-900">Academy limits</h3><p className="text-xs text-gray-600">Stored and monthly usage include reserved uploads until processing completes.</p></div>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search academies" className="w-full sm:w-72 border border-gray-300 rounded-xl px-3 py-2 text-sm" />
        </div>

        <div className="space-y-3">
          {filtered.map((row) => {
            const policy = row.policy ?? emptyPolicy(row.academy.id);
            const quotaReady = policy.max_asset_duration_seconds > 0 && policy.max_total_stored_minutes > 0 && policy.max_monthly_upload_minutes > 0;
            return (
              <article key={row.academy.id} className="rounded-2xl border border-gray-200 p-4">
                <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                  <div className="min-w-0 xl:w-60"><h4 className="font-bold text-gray-900 break-words">{row.academy.name}</h4><p className="text-xs text-gray-500 break-all">{row.academy.slug}</p><p className="mt-2 text-xs text-gray-600">{row.usage.stored_minutes} stored min · {row.usage.monthly_upload_minutes} uploaded this month</p></div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
                    <label className="text-xs font-semibold text-gray-600">Max video seconds<input type="number" min={0} value={policy.max_asset_duration_seconds} onChange={(event) => updateDraft(row.academy.id, { max_asset_duration_seconds: Number(event.target.value) })} className="mt-1 w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" /></label>
                    <label className="text-xs font-semibold text-gray-600">Total stored minutes<input type="number" min={0} value={policy.max_total_stored_minutes} onChange={(event) => updateDraft(row.academy.id, { max_total_stored_minutes: Number(event.target.value) })} className="mt-1 w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" /></label>
                    <label className="text-xs font-semibold text-gray-600">Monthly upload minutes<input type="number" min={0} value={policy.max_monthly_upload_minutes} onChange={(event) => updateDraft(row.academy.id, { max_monthly_upload_minutes: Number(event.target.value) })} className="mt-1 w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" /></label>
                  </div>
                  <div className="xl:w-48 flex xl:flex-col items-center xl:items-stretch gap-2">
                    <label className="inline-flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={policy.upload_enabled} disabled={!quotaReady} onChange={(event) => updateDraft(row.academy.id, { upload_enabled: event.target.checked })} /> Approved</label>
                    <button type="button" onClick={() => void savePolicy(row)} disabled={savingAcademyId === row.academy.id || (policy.upload_enabled && !quotaReady)} className="px-3 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-50">{savingAcademyId === row.academy.id ? 'Saving…' : 'Save policy'}</button>
                  </div>
                </div>
              </article>
            );
          })}
          {!loading && filtered.length === 0 ? <div className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-600">No academies match this search.</div> : null}
        </div>
      </div>
    </section>
  );
};
