import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '../components/admin/AdminLayout';
import { ITEP_PRODUCT_ID } from '../lib/constants';
import { adminTestsClone, adminTestsList, adminTestsReorder, adminTestsUpdate, type AdminTestRow } from '../lib/platformClient';
import { useAccess } from '../lib/useAccess';

const byDisplayOrder = (a: AdminTestRow, b: AdminTestRow) => (a.display_order ?? 0) - (b.display_order ?? 0);

export const AdminTestsPage: React.FC = () => {
  const navigate = useNavigate();
  const { accessToken } = useAccess();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<AdminTestRow[]>([]);

  const load = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);

    try {
      const res = await adminTestsList(accessToken, ITEP_PRODUCT_ID);
      setRows((res.experiences ?? []).slice().sort(byDisplayOrder));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tests');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const move = async (id: string, dir: -1 | 1) => {
    if (!accessToken) return;
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const next = rows.slice();
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= next.length) return;

    const tmp = next[idx];
    next[idx] = next[swapIdx];
    next[swapIdx] = tmp;

    // Recompute sequential display_order to avoid duplicates/gaps.
    const order = next.map((r, i) => ({ ...r, display_order: i + 1 }));
    setRows(order);

    setSaving(true);
    setError(null);
    try {
      await adminTestsReorder(
        accessToken,
        order.map((r) => ({ experience_id: r.id, display_order: r.display_order })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reorder');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: AdminTestRow, isActive: boolean) => {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    try {
      const res = await adminTestsUpdate(accessToken, row.id, { is_active: isActive, version: row.version });
      if (res.experience) {
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...res.experience } : r)));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const rename = async (row: AdminTestRow, name: string) => {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    try {
      const res = await adminTestsUpdate(accessToken, row.id, { name, version: row.version });
      if (res.experience) setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...res.experience } : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to rename');
    } finally {
      setSaving(false);
    }
  };

  const updatePrice = async (row: AdminTestRow, priceAmount?: number, priceCurrency?: string | null) => {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    try {
      const patch: Partial<Pick<AdminTestRow, 'price_amount' | 'price_currency'>> & { version: number } = {
        version: row.version,
      };
      if (Number.isFinite(priceAmount)) patch.price_amount = priceAmount;
      if (priceCurrency) patch.price_currency = priceCurrency;
      if (Object.keys(patch).length === 1) return;
      const res = await adminTestsUpdate(accessToken, row.id, patch);
      if (res.experience) setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...res.experience } : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update price');
    } finally {
      setSaving(false);
    }
  };

  const clone = async (id: string) => {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    try {
      await adminTestsClone(accessToken, id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to clone');
    } finally {
      setSaving(false);
    }
  };

  const totalUnits = useMemo(() => rows.reduce((acc, r) => acc + (r.counts?.units ?? 0), 0), [rows]);

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Tests Manager</h2>
            <p className="text-sm text-gray-500 mt-1">
              Manage <span className="font-mono">public.experiences</span> for the iTEP product. Clone, activate/deactivate, and reorder.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:justify-end">
            <button
              type="button"
              onClick={() => void load()}
              className="w-full sm:w-auto px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 font-semibold"
              disabled={loading || saving}
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/builder')}
              className="w-full sm:w-auto px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 font-semibold"
              disabled={loading || saving}
            >
              Open Builder
            </button>
            <button
              type="button"
              onClick={() => navigate(`/admin/import?returnTo=${encodeURIComponent('/admin/tests')}`)}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-gray-900 hover:bg-black text-white font-semibold"
              disabled={loading || saving}
            >
              Import New Test
            </button>
          </div>
        </div>

        {error ? (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Tests</div>
            <div className="text-3xl font-bold text-gray-900 mt-2">{rows.length}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Units</div>
            <div className="text-3xl font-bold text-gray-900 mt-2">{totalUnits}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Status</div>
            <div className="text-sm text-gray-700 mt-3">{saving ? 'Saving...' : loading ? 'Loading...' : 'Idle'}</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="text-left p-3 font-semibold whitespace-nowrap">Order</th>
                  <th className="text-left p-3 font-semibold">Name</th>
                  <th className="text-left p-3 font-semibold whitespace-nowrap">Price</th>
                  <th className="text-left p-3 font-semibold whitespace-nowrap">Active</th>
                  <th className="text-left p-3 font-semibold whitespace-nowrap">Sections</th>
                  <th className="text-left p-3 font-semibold whitespace-nowrap">Parts</th>
                  <th className="text-left p-3 font-semibold whitespace-nowrap">Units</th>
                  <th className="text-right p-3 font-semibold whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="p-3 align-top">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1">
                          {r.display_order}
                        </span>
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 text-xs font-semibold"
                            onClick={() => void move(r.id, -1)}
                            disabled={saving || loading}
                            title="Move up"
                          >
                            Up
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 text-xs font-semibold"
                            onClick={() => void move(r.id, 1)}
                            disabled={saving || loading}
                            title="Move down"
                          >
                            Down
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 align-top">
                      <div className="space-y-2">
                        <input
                          defaultValue={r.name}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-100 focus:border-amber-400"
                          onBlur={(e) => {
                            const next = e.target.value.trim();
                            if (next && next !== r.name) void rename(r, next);
                          }}
                        />
                        <div className="text-xs text-gray-500 font-mono break-all">{r.id}</div>
                      </div>
                    </td>
                    <td className="p-3 align-top text-sm text-gray-700">
                      <div className="flex flex-col gap-2">
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          defaultValue={typeof r.price_amount === 'number' ? r.price_amount : ''}
                          onBlur={(e) => {
                            const raw = e.target.value.trim();
                            const next = raw === '' ? NaN : Number(raw);
                            if (Number.isFinite(next) && next !== r.price_amount) {
                              void updatePrice(r, next, r.price_currency ?? 'UZS');
                            }
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          placeholder="Price"
                        />
                        <input
                          defaultValue={r.price_currency ?? 'UZS'}
                          onBlur={(e) => {
                            const next = e.target.value.trim().toUpperCase() || 'UZS';
                            if (next !== (r.price_currency ?? 'UZS')) {
                              void updatePrice(r, undefined, next);
                            }
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          placeholder="Currency"
                        />
                      </div>
                    </td>
                    <td className="p-3 align-top">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={r.is_active}
                          onChange={(e) => void toggleActive(r, e.target.checked)}
                          disabled={saving || loading}
                        />
                        <span className={`text-xs font-semibold ${r.is_active ? 'text-emerald-700' : 'text-gray-500'}`}>
                          {r.is_active ? 'Active' : 'Hidden'}
                        </span>
                      </label>
                    </td>
                    <td className="p-3 align-top">{r.counts?.sections ?? 0}</td>
                    <td className="p-3 align-top">{r.counts?.parts ?? 0}</td>
                    <td className="p-3 align-top">{r.counts?.units ?? 0}</td>
                    <td className="p-3 align-top text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/test/${r.id}`)}
                          className="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-xs font-semibold"
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/builder?experience_id=${encodeURIComponent(r.id)}`)}
                          className="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-xs font-semibold"
                        >
                          Builder
                        </button>
                        <button
                          type="button"
                          onClick={() => void clone(r.id)}
                          disabled={saving || loading}
                          className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white text-xs font-semibold"
                        >
                          Clone
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-sm text-gray-600">
                      No tests yet. Import one from <span className="font-mono">/admin/import</span>.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

