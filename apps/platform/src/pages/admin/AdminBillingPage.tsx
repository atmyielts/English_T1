import React, { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { supabase } from '../../lib/supabase';
import {
  adminBillingPlanCreate,
  adminBillingPlanUpdate,
  adminBillingPlansList,
  type BillingPlan,
} from '../../lib/platformClient';

type ProductRow = {
  id: string;
  name: string;
  status: string;
  type: string;
  metadata: Record<string, unknown> | null;
};

type LimitKey = 'full_mock_tests' | 'section_practice' | 'writing_submissions';

type PlanMeta = {
  tagline?: string;
  description?: string;
  recommended?: boolean;
  features?: string[];
  limits?: Record<string, number>;
  included_product_ids?: string[];
};

type PlanDraft = {
  name: string;
  amount: number;
  currency: string;
  duration_days: number | null;
  is_active: boolean;
  tagline: string;
  description: string;
  recommended: boolean;
  featuresText: string;
  included: string[];
  limits: Record<LimitKey, string>;
};

const currencyOptions = ['UZS', 'USD', 'EUR'];
const limitFields: Array<{ key: LimitKey; label: string }> = [
  { key: 'full_mock_tests', label: 'Full mock tests' },
  { key: 'section_practice', label: 'Section practice' },
  { key: 'writing_submissions', label: 'Writing submissions' },
];

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

const normalizeFeatures = (value: string): string[] =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const normalizeIncluded = (ids: string[], baseId?: string): string[] => {
  const set = new Set(ids.map(String));
  if (baseId) set.delete(baseId);
  return Array.from(set);
};

const mergeMeta = (base: Record<string, unknown> | null | undefined, patch: PlanMeta): Record<string, unknown> => {
  const meta: Record<string, unknown> = isObject(base) ? { ...base } : {};

  if (patch.tagline !== undefined) {
    const value = String(patch.tagline ?? '').trim();
    if (value) meta.tagline = value;
    else delete meta.tagline;
  }

  if (patch.description !== undefined) {
    const desc = String(patch.description ?? '').trim();
    if (desc) meta.description = desc;
    else delete meta.description;
  }

  if (patch.recommended !== undefined) {
    if (patch.recommended === true) meta.recommended = true;
    else delete meta.recommended;
  }

  if (patch.features !== undefined) {
    const list = (patch.features ?? []).map(String).map((s) => s.trim()).filter(Boolean);
    if (list.length > 0) meta.features = list;
    else delete meta.features;
  }

  if (patch.limits !== undefined) {
    const limits: Record<string, number> = {};
    Object.entries(patch.limits ?? {}).forEach(([key, raw]) => {
      const num = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isFinite(num) && num > 0) limits[key] = num;
    });
    if (Object.keys(limits).length > 0) meta.limits = limits;
    else delete meta.limits;
  }

  if (patch.included_product_ids !== undefined) {
    const included = normalizeIncluded(patch.included_product_ids ?? []);
    if (included.length > 0) meta.included_product_ids = included;
    else delete meta.included_product_ids;
  }

  return meta;
};

const planDescription = (plan: BillingPlan): string => {
  const meta: any = plan.metadata ?? {};
  return typeof meta.description === 'string' ? meta.description : '';
};

const planTagline = (plan: BillingPlan): string => {
  const meta: any = plan.metadata ?? {};
  return typeof meta.tagline === 'string' ? meta.tagline : '';
};

const planRecommended = (plan: BillingPlan): boolean => {
  const meta: any = plan.metadata ?? {};
  return meta.recommended === true;
};

const planFeaturesText = (plan: BillingPlan): string => {
  const meta: any = plan.metadata ?? {};
  const raw = meta.features;
  if (Array.isArray(raw)) return raw.map(String).join('\n');
  return '';
};

const planLimits = (plan: BillingPlan): Record<string, number> => {
  const meta: any = plan.metadata ?? {};
  if (isObject(meta.limits)) return meta.limits as Record<string, number>;
  return {};
};

const planIncluded = (plan: BillingPlan): string[] => {
  const meta: any = plan.metadata ?? {};
  const raw = meta.included_product_ids;
  if (!Array.isArray(raw)) return [];
  return raw.map(String);
};

const buildDraftFromPlan = (plan: BillingPlan): PlanDraft => {
  const limits = planLimits(plan);
  return {
    name: plan.name,
    amount: Number(plan.amount ?? 0),
    currency: plan.currency,
    duration_days: plan.duration_days ?? null,
    is_active: !!plan.is_active,
    tagline: planTagline(plan),
    description: planDescription(plan),
    recommended: planRecommended(plan),
    featuresText: planFeaturesText(plan),
    included: planIncluded(plan),
    limits: {
      full_mock_tests: typeof limits.full_mock_tests === 'number' ? String(limits.full_mock_tests) : '',
      section_practice: typeof limits.section_practice === 'number' ? String(limits.section_practice) : '',
      writing_submissions: typeof limits.writing_submissions === 'number' ? String(limits.writing_submissions) : '',
    },
  };
};

export const AdminBillingPage: React.FC = () => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [filterProductId, setFilterProductId] = useState<string>('');
  const [createProductId, setCreateProductId] = useState<string>('');
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showAdvancedCreate, setShowAdvancedCreate] = useState(false);
  const [expandedPlans, setExpandedPlans] = useState<Set<string>>(new Set());
  const [planDrafts, setPlanDrafts] = useState<Record<string, PlanDraft>>({});

  const [newPlan, setNewPlan] = useState({
    name: '',
    amount: 0,
    currency: 'UZS',
    duration_days: 30,
    is_active: true,
  });

  const [newPlanMeta, setNewPlanMeta] = useState({
    tagline: '',
    description: '',
    recommended: false,
    featuresText: '',
    included: [] as string[],
    limits: {
      full_mock_tests: '',
      section_practice: '',
      writing_submissions: '',
    } as Record<LimitKey, string>,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setAccessToken(session?.access_token ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: prodErr } = await supabase
          .from('products')
          .select('id,name,status,metadata,type')
          .order('name', { ascending: true });
        if (prodErr) throw prodErr;
        const list = (data ?? []) as ProductRow[];
        setProducts(list);
        if (!createProductId && list.length > 0) setCreateProductId(list[0].id);
        if (!filterProductId && list.length > 0) setFilterProductId(list[0].id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load products');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [accessToken]);

  const loadPlans = async (pid: string) => {
    if (!accessToken || !pid) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminBillingPlansList(accessToken, pid);
      setPlans(res.plans ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load plans');
      setPlans([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (filterProductId) void loadPlans(filterProductId);
  }, [filterProductId]);

  const updatePlan = async (planId: string, patch: Partial<BillingPlan>) => {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    try {
      const res = await adminBillingPlanUpdate(accessToken, planId, patch);
      if (res.plan) setPlans((prev) => prev.map((p) => (p.id === planId ? { ...p, ...res.plan } : p)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update plan');
    } finally {
      setSaving(false);
    }
  };

  const togglePlanArchived = async (plan: BillingPlan) => {
    if (!accessToken) return;
    const willArchive = !!plan.is_active;
    const actionLabel = willArchive ? 'archive' : 'restore';
    if (!window.confirm(`${actionLabel === 'archive' ? 'Archive' : 'Restore'} this plan?`)) return;

    setSaving(true);
    setError(null);
    try {
      const currentMeta = isObject(plan.metadata) ? { ...(plan.metadata as Record<string, unknown>) } : {};
      if (willArchive) {
        currentMeta.archived = true;
        currentMeta.archived_at = new Date().toISOString();
      } else {
        delete currentMeta.archived;
        delete currentMeta.archived_at;
      }

      const res = await adminBillingPlanUpdate(accessToken, plan.id, {
        is_active: !willArchive,
        metadata: currentMeta,
      });
      if (res.plan) {
        setPlans((prev) => prev.map((p) => (p.id === plan.id ? (res.plan as BillingPlan) : p)));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${actionLabel} plan`);
    } finally {
      setSaving(false);
    }
  };

  const createPlan = async () => {
    if (!accessToken || !createProductId) return;
    setSaving(true);
    setError(null);
    try {
      const limits: Record<string, number> = {};
      Object.entries(newPlanMeta.limits).forEach(([key, raw]) => {
        const num = Number(raw);
        if (Number.isFinite(num) && num > 0) limits[key] = num;
      });

      const meta = mergeMeta({}, {
        tagline: newPlanMeta.tagline,
        description: newPlanMeta.description,
        recommended: newPlanMeta.recommended,
        features: normalizeFeatures(newPlanMeta.featuresText),
        limits,
        included_product_ids: normalizeIncluded(newPlanMeta.included, createProductId),
      });

      const res = await adminBillingPlanCreate(accessToken, {
        product_id: createProductId,
        name: newPlan.name.trim() || 'New Plan',
        amount: Number(newPlan.amount),
        currency: newPlan.currency,
        duration_days: newPlan.duration_days ? Number(newPlan.duration_days) : null,
        is_active: newPlan.is_active,
        metadata: meta,
      });
      if (res.plan) setPlans((prev) => [res.plan as BillingPlan, ...prev]);
      setNewPlan({ name: '', amount: 0, currency: 'UZS', duration_days: 30, is_active: true });
      setNewPlanMeta({
        tagline: '',
        description: '',
        recommended: false,
        featuresText: '',
        included: [],
        limits: {
          full_mock_tests: '',
          section_practice: '',
          writing_submissions: '',
        },
      });
      setShowAdvancedCreate(false);
      setFilterProductId(createProductId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create plan');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    setPlanDrafts((prev) => {
      const next = { ...prev };
      for (const plan of plans) {
        if (!next[plan.id]) next[plan.id] = buildDraftFromPlan(plan);
      }
      return next;
    });
  }, [plans]);

  const updateDraft = (planId: string, patch: Partial<PlanDraft>) => {
    setPlanDrafts((prev) => {
      const current = prev[planId];
      if (!current) return prev;
      return { ...prev, [planId]: { ...current, ...patch } };
    });
  };

  const updateDraftLimit = (planId: string, key: LimitKey, value: string) => {
    setPlanDrafts((prev) => {
      const current = prev[planId];
      if (!current) return prev;
      return {
        ...prev,
        [planId]: {
          ...current,
          limits: { ...current.limits, [key]: value },
        },
      };
    });
  };

  const toggleDraftIncluded = (planId: string, productId: string) => {
    setPlanDrafts((prev) => {
      const current = prev[planId];
      if (!current) return prev;
      const set = new Set(current.included);
      if (set.has(productId)) set.delete(productId);
      else set.add(productId);
      return { ...prev, [planId]: { ...current, included: Array.from(set) } };
    });
  };

  const savePlan = async (plan: BillingPlan) => {
    const draft = planDrafts[plan.id];
    if (!draft) return;
    const limits: Record<string, number> = {};
    Object.entries(draft.limits).forEach(([key, raw]) => {
      const num = Number(raw);
      if (Number.isFinite(num) && num > 0) limits[key] = num;
    });

    const meta = mergeMeta(plan.metadata as Record<string, unknown> | null, {
      tagline: draft.tagline,
      description: draft.description,
      recommended: draft.recommended,
      features: normalizeFeatures(draft.featuresText),
      limits,
      included_product_ids: normalizeIncluded(draft.included, plan.product_id),
    });

    await updatePlan(plan.id, {
      name: draft.name.trim() || plan.name,
      amount: Number(draft.amount),
      currency: draft.currency,
      duration_days: draft.duration_days ?? null,
      is_active: draft.is_active,
      metadata: meta,
    });
  };

  const togglePlanExpanded = (planId: string) => {
    setExpandedPlans((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  };

  const selectableCreateProducts = useMemo(() => products.filter((p) => p.id !== createProductId), [products, createProductId]);

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing Plans</h1>
          <p className="text-sm text-gray-600">Create plans first, then attach services to define bundles.</p>
        </div>

        {error ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div> : null}

        <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-5">
          <div className="text-sm font-semibold text-gray-900">Create plan</div>

          <div>
            <div className="text-xs font-semibold text-gray-600">Plan details</div>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                value={newPlan.name}
                onChange={(e) => setNewPlan((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Plan name"
                className="w-full border border-gray-200 rounded-xl px-3 py-2"
              />
              <input
                type="number"
                value={newPlan.amount}
                onChange={(e) => setNewPlan((prev) => ({ ...prev, amount: Number(e.target.value) }))}
                placeholder="Amount"
                className="w-full border border-gray-200 rounded-xl px-3 py-2"
              />
              <select
                value={newPlan.currency}
                onChange={(e) => setNewPlan((prev) => ({ ...prev, currency: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2"
              >
                {currencyOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={newPlan.duration_days}
                onChange={(e) => setNewPlan((prev) => ({ ...prev, duration_days: Number(e.target.value) }))}
                placeholder="Duration days"
                className="w-full border border-gray-200 rounded-xl px-3 py-2"
              />
              <label className="inline-flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={newPlan.is_active}
                  onChange={(e) => setNewPlan((prev) => ({ ...prev, is_active: e.target.checked }))}
                />
                Active
              </label>
            </div>
          </div>

          <textarea
            value={newPlanMeta.tagline}
            onChange={(e) => setNewPlanMeta((prev) => ({ ...prev, tagline: e.target.value }))}
            placeholder="Subtitle under plan title (e.g. Best for score growth)"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 min-h-[58px]"
          />

          <textarea
            value={newPlanMeta.description}
            onChange={(e) => setNewPlanMeta((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="Longer plan description (optional)"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 min-h-[80px]"
          />

          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={newPlanMeta.recommended}
              onChange={(e) => setNewPlanMeta((prev) => ({ ...prev, recommended: e.target.checked }))}
            />
            Mark as Most popular
          </label>

          <div>
            <div className="text-xs font-semibold text-gray-600">Services included</div>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-semibold text-gray-500">Primary service (required)</div>
                <select
                  value={createProductId}
                  onChange={(e) => {
                    const next = e.target.value;
                    setCreateProductId(next);
                    setNewPlanMeta((prev) => ({ ...prev, included: normalizeIncluded(prev.included, next) }));
                  }}
                  className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.status})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-500">Bundle extras (optional)</div>
                <div className="mt-2 text-xs text-gray-500">Select additional services to bundle with the plan.</div>
                <div className="mt-3 grid grid-cols-1 gap-2">
                  {selectableCreateProducts.length === 0 ? (
                    <div className="text-sm text-gray-500">Add another product to create a bundle plan.</div>
                  ) : (
                    selectableCreateProducts.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={newPlanMeta.included.includes(p.id)}
                          onChange={() =>
                            setNewPlanMeta((prev) => {
                              const set = new Set(prev.included);
                              if (set.has(p.id)) set.delete(p.id);
                              else set.add(p.id);
                              return { ...prev, included: Array.from(set) };
                            })
                          }
                        />
                        {p.name}
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvancedCreate((prev) => !prev)}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            {showAdvancedCreate ? 'Hide advanced options' : 'Show advanced options'}
          </button>

          {showAdvancedCreate ? (
            <div className="space-y-4">
              <textarea
                value={newPlanMeta.featuresText}
                onChange={(e) => setNewPlanMeta((prev) => ({ ...prev, featuresText: e.target.value }))}
                placeholder="Plan features (one per line)"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 min-h-[100px]"
              />
              <div>
                <div className="text-xs font-semibold text-gray-600">Usage limits (leave blank for unlimited)</div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {limitFields.map((field) => (
                    <input
                      key={field.key}
                      type="number"
                      value={newPlanMeta.limits[field.key]}
                      onChange={(e) =>
                        setNewPlanMeta((prev) => ({
                          ...prev,
                          limits: { ...prev.limits, [field.key]: e.target.value },
                        }))
                      }
                      placeholder={field.label}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2"
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <button
            onClick={createPlan}
            disabled={saving || !createProductId}
            className="px-4 py-2 rounded-xl bg-gray-900 text-white font-semibold"
          >
            Create plan
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <label className="text-xs font-semibold text-gray-600">Filter plans by service</label>
          <select
            value={filterProductId}
            onChange={(e) => setFilterProductId(e.target.value)}
            className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.status})
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-700">
            Plans for {products.find((p) => p.id === filterProductId)?.name ?? 'product'}
          </div>
          <div className="divide-y divide-gray-200">
            {loading ? <div className="p-4 text-sm text-gray-500">Loading plans…</div> : null}
            {!loading && plans.length === 0 ? <div className="p-4 text-sm text-gray-500">No plans found.</div> : null}
            {plans.map((plan) => {
              const draft = planDrafts[plan.id] ?? buildDraftFromPlan(plan);
              const included = draft.included.filter((id) => id !== plan.product_id);
              const otherProducts = products.filter((p) => p.id !== plan.product_id);
              const isExpanded = expandedPlans.has(plan.id);
              return (
                <div key={plan.id} className="p-4 grid grid-cols-1 gap-4">
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-center">
                    <input
                      value={draft.name}
                      onChange={(e) => updateDraft(plan.id, { name: e.target.value })}
                      className="md:col-span-2 border border-gray-200 rounded-xl px-3 py-2"
                    />
                    <input
                      type="number"
                      value={draft.amount}
                      onChange={(e) => updateDraft(plan.id, { amount: Number(e.target.value) })}
                      className="border border-gray-200 rounded-xl px-3 py-2"
                    />
                    <input
                      value={draft.currency}
                      onChange={(e) => updateDraft(plan.id, { currency: e.target.value })}
                      className="border border-gray-200 rounded-xl px-3 py-2"
                    />
                    <input
                      type="number"
                      value={draft.duration_days ?? ''}
                      onChange={(e) =>
                        updateDraft(plan.id, { duration_days: e.target.value ? Number(e.target.value) : null })
                      }
                      className="border border-gray-200 rounded-xl px-3 py-2"
                    />
                    <label className="inline-flex items-center gap-2 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={draft.is_active}
                        onChange={(e) => updateDraft(plan.id, { is_active: e.target.checked })}
                      />
                      Active
                    </label>
                  </div>

                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => savePlan(plan)}
                      disabled={saving}
                      className="text-sm font-semibold text-gray-900"
                    >
                      Save changes
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePlanArchived(plan)}
                      disabled={saving}
                      className="text-sm font-semibold text-red-600 hover:text-red-700"
                    >
                      {plan.is_active ? 'Archive plan' : 'Restore plan'}
                    </button>
                  </div>

                  <textarea
                    value={draft.tagline}
                    onChange={(e) => updateDraft(plan.id, { tagline: e.target.value })}
                    placeholder="Subtitle under plan title (e.g. Best for score growth)"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 min-h-[58px]"
                  />

                  <textarea
                    value={draft.description}
                    onChange={(e) => updateDraft(plan.id, { description: e.target.value })}
                    placeholder="Longer plan description (optional)"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 min-h-[80px]"
                  />

                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={draft.recommended}
                      onChange={(e) => updateDraft(plan.id, { recommended: e.target.checked })}
                    />
                    Mark as Most popular
                  </label>

                  <div>
                    <div className="text-xs font-semibold text-gray-600">Included services (bundle)</div>
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                      {otherProducts.length === 0 ? (
                        <div className="text-sm text-gray-500">Add another product to create a bundle plan.</div>
                      ) : (
                        otherProducts.map((p) => (
                          <label key={p.id} className="flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={included.includes(p.id)}
                              onChange={() => toggleDraftIncluded(plan.id, p.id)}
                            />
                            {p.name}
                          </label>
                        ))
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => togglePlanExpanded(plan.id)}
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    {isExpanded ? 'Hide advanced options' : 'Show advanced options'}
                  </button>

                  {isExpanded ? (
                    <div className="space-y-4">
                      <textarea
                        value={draft.featuresText}
                        onChange={(e) => updateDraft(plan.id, { featuresText: e.target.value })}
                        placeholder="Plan features (one per line)"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 min-h-[100px]"
                      />

                      <div>
                        <div className="text-xs font-semibold text-gray-600">Usage limits (leave blank for unlimited)</div>
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                          {limitFields.map((field) => (
                            <input
                              key={field.key}
                              type="number"
                              value={draft.limits[field.key]}
                              onChange={(e) => updateDraftLimit(plan.id, field.key, e.target.value)}
                              placeholder={field.label}
                              className="w-full border border-gray-200 rounded-xl px-3 py-2"
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};
