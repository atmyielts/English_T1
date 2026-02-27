import React, { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { supabase } from '../../lib/supabase';
import { platformSettingsGet, platformSettingsPatch, type PlatformSettings } from '../../lib/platformClient';

type ProductRow = {
  id: string;
  name: string;
  status: string;
  type: string;
  metadata: Record<string, unknown> | null;
};

type LimitRowDraft = {
  id: string;
  key: string;
  value: string;
};

type TrialOverride = {
  trial_enabled?: boolean;
  trial_days?: number;
  trial_limits?: Record<string, number>;
};

const normalizePositiveInt = (raw: string): number | null => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
};

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

const normalizeLimitKey = (raw: string): string | null => {
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!key) return null;
  return key;
};

const formatLimitKeyLabel = (key: string): string =>
  key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

let limitRowCounter = 0;
const createLimitRow = (key = '', value = ''): LimitRowDraft => {
  limitRowCounter += 1;
  return { id: `limit-row-${limitRowCounter}`, key, value };
};

const emptyLimitRows = (): LimitRowDraft[] => [createLimitRow()];

const limitsToDraft = (limits: Record<string, number> | null | undefined): LimitRowDraft[] => {
  const entries = Object.entries(limits ?? {}).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return emptyLimitRows();
  return entries.map(([key, value]) => createLimitRow(key, String(value)));
};

const draftToLimits = (rows: LimitRowDraft[]): { limits: Record<string, number>; error: string | null } => {
  const out: Record<string, number> = {};
  const seen = new Set<string>();

  for (const row of rows) {
    const rawKey = row.key.trim();
    const rawValue = row.value.trim();
    if (!rawKey && !rawValue) continue;

    const normalizedKey = normalizeLimitKey(rawKey);
    if (!normalizedKey) {
      return {
        limits: {},
        error: 'Limit keys must contain letters or numbers (example: full_mock_tests).',
      };
    }

    const value = normalizePositiveInt(rawValue);
    if (value == null) {
      return {
        limits: {},
        error: `Limit for "${normalizedKey}" must be a positive integer.`,
      };
    }

    if (seen.has(normalizedKey)) {
      return {
        limits: {},
        error: `Duplicate limit key "${normalizedKey}".`,
      };
    }

    seen.add(normalizedKey);
    out[normalizedKey] = value;
  }

  return { limits: out, error: null };
};

const withUpdatedRow = (
  rows: LimitRowDraft[],
  rowId: string,
  patch: Partial<Pick<LimitRowDraft, 'key' | 'value'>>,
): LimitRowDraft[] => rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row));

const withRemovedRow = (rows: LimitRowDraft[], rowId: string): LimitRowDraft[] => {
  const next = rows.filter((row) => row.id !== rowId);
  return next.length > 0 ? next : emptyLimitRows();
};

const collectKeyCandidates = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '')).filter(Boolean);
  }
  if (isObject(value)) {
    return Object.keys(value);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const resolveProductLimitSuggestions = (product: ProductRow | null, fallbackRows: LimitRowDraft[]): string[] => {
  const keys = new Set<string>();

  fallbackRows.forEach((row) => {
    const normalized = normalizeLimitKey(row.key);
    if (normalized) keys.add(normalized);
  });

  if (!product) return Array.from(keys).sort();

  const productType = String(product.type ?? '').toLowerCase();
  if (productType === 'exam') {
    keys.add('full_mock_tests');
    keys.add('section_practice');
  }

  if (isObject(product.metadata)) {
    const metadata = product.metadata;
    [
      metadata.trial_limit_keys,
      metadata.capability_keys,
      metadata.usage_limit_keys,
      metadata.trial_capabilities,
      metadata.limit_keys,
    ].forEach((candidate) => {
      collectKeyCandidates(candidate).forEach((key) => {
        const normalized = normalizeLimitKey(key);
        if (normalized) keys.add(normalized);
      });
    });
  }

  return Array.from(keys).sort();
};

const readProductOverride = (settings: PlatformSettings | null, productId: string): TrialOverride | null => {
  if (!settings || !productId) return null;
  const all = settings.trial_product_overrides ?? {};
  const raw = all[productId];
  if (!isObject(raw)) return null;
  const out: TrialOverride = {};
  if (typeof raw.trial_enabled === 'boolean') out.trial_enabled = raw.trial_enabled;
  if (typeof raw.trial_days === 'number' && raw.trial_days > 0) out.trial_days = Math.floor(raw.trial_days);
  if (isObject(raw.trial_limits)) {
    const normalized: Record<string, number> = {};
    Object.entries(raw.trial_limits).forEach(([key, value]) => {
      const n = typeof value === 'number' ? value : Number(value);
      if (Number.isFinite(n) && n > 0) normalized[key] = Math.floor(n);
    });
    out.trial_limits = normalized;
  }
  return Object.keys(out).length > 0 ? out : null;
};

type LimitRowsEditorProps = {
  title: string;
  description: string;
  rows: LimitRowDraft[];
  onChange: (rows: LimitRowDraft[]) => void;
  disabled?: boolean;
  suggestedKeys?: string[];
};

const LimitRowsEditor: React.FC<LimitRowsEditorProps> = ({
  title,
  description,
  rows,
  onChange,
  disabled = false,
  suggestedKeys = [],
}) => {
  const normalizedRowKeys = new Set(
    rows
      .map((row) => normalizeLimitKey(row.key))
      .filter((value): value is string => Boolean(value)),
  );

  const addSuggestion = (key: string) => {
    if (disabled) return;
    const normalized = normalizeLimitKey(key);
    if (!normalized || normalizedRowKeys.has(normalized)) return;
    onChange([...rows, createLimitRow(normalized, '')]);
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-600">{title}</div>
        <p className="text-xs text-gray-500 mt-1">{description}</p>
      </div>

      {suggestedKeys.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {suggestedKeys.map((key) => {
            const normalized = normalizeLimitKey(key);
            const active = normalized ? normalizedRowKeys.has(normalized) : false;
            return (
              <button
                key={key}
                type="button"
                disabled={disabled || active}
                onClick={() => addSuggestion(key)}
                className="px-2.5 py-1 rounded-full border border-gray-300 text-xs text-gray-700 disabled:opacity-50"
              >
                + {formatLimitKeyLabel(key)}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-2">
            <input
              type="text"
              value={row.key}
              disabled={disabled}
              onChange={(e) => onChange(withUpdatedRow(rows, row.id, { key: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2"
              placeholder="Capability key (example: full_mock_tests)"
            />
            <input
              type="number"
              min={1}
              value={row.value}
              disabled={disabled}
              onChange={(e) => onChange(withUpdatedRow(rows, row.id, { value: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2"
              placeholder="Monthly limit"
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(withRemovedRow(rows, row.id))}
              className="px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-700"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange([...rows, createLimitRow()])}
        className="px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-700"
      >
        Add limit key
      </button>
    </div>
  );
};

export const AdminTrialsPage: React.FC = () => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [globalTrialEnabled, setGlobalTrialEnabled] = useState(false);
  const [globalTrialOnce, setGlobalTrialOnce] = useState(true);
  const [globalTrialDays, setGlobalTrialDays] = useState('15');
  const [globalLimits, setGlobalLimits] = useState<LimitRowDraft[]>(emptyLimitRows());

  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [overrideTrialEnabled, setOverrideTrialEnabled] = useState(false);
  const [overrideTrialDays, setOverrideTrialDays] = useState('15');
  const [overrideLimits, setOverrideLimits] = useState<LimitRowDraft[]>(emptyLimitRows());

  const activeProducts = useMemo(
    () => products.filter((product) => String(product.status).toLowerCase() === 'active'),
    [products],
  );
  const selectedProduct = activeProducts.find((product) => product.id === selectedProductId) ?? null;
  const suggestedLimitKeys = useMemo(
    () => resolveProductLimitSuggestions(selectedProduct, globalLimits),
    [selectedProduct, globalLimits],
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setAccessToken(session?.access_token ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!accessToken) return;
      setLoading(true);
      setError(null);
      try {
        const [settingsRes, productsRes] = await Promise.all([
          platformSettingsGet(accessToken),
          supabase.from('products').select('id,name,status,type,metadata').order('name', { ascending: true }),
        ]);
        if (productsRes.error) throw productsRes.error;
        const list = (productsRes.data ?? []) as ProductRow[];
        setSettings(settingsRes);
        setProducts(list);
        const firstActive = list.find((p) => String(p.status).toLowerCase() === 'active') ?? list[0] ?? null;
        setSelectedProductId((prev) => prev || firstActive?.id || '');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load trial settings');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [accessToken]);

  useEffect(() => {
    if (!settings) return;

    setGlobalTrialEnabled(Boolean(settings.trial_enabled));
    setGlobalTrialOnce(Boolean(settings.trial_once_per_user));
    setGlobalTrialDays(String(settings.trial_days ?? 15));
    setGlobalLimits(limitsToDraft(settings.trial_limits ?? {}));

    const override = readProductOverride(settings, selectedProductId);
    if (!override) {
      setOverrideEnabled(false);
      setOverrideTrialEnabled(Boolean(settings.trial_enabled));
      setOverrideTrialDays(String(settings.trial_days ?? 15));
      setOverrideLimits(limitsToDraft(settings.trial_limits ?? {}));
      return;
    }

    setOverrideEnabled(true);
    setOverrideTrialEnabled(typeof override.trial_enabled === 'boolean' ? override.trial_enabled : Boolean(settings.trial_enabled));
    setOverrideTrialDays(String(override.trial_days ?? settings.trial_days ?? 15));
    setOverrideLimits(limitsToDraft(override.trial_limits ?? settings.trial_limits ?? {}));
  }, [settings, selectedProductId]);

  const saveGlobalDefaults = async () => {
    if (!accessToken || !settings) return;
    const trialDays = normalizePositiveInt(globalTrialDays);
    if (trialDays == null) {
      setError('Trial days must be a positive integer.');
      return;
    }
    const parsedLimits = draftToLimits(globalLimits);
    if (parsedLimits.error) {
      setError(parsedLimits.error);
      return;
    }

    setSavingGlobal(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await platformSettingsPatch(accessToken, {
        trial_enabled: globalTrialEnabled,
        trial_once_per_user: globalTrialOnce,
        trial_days: trialDays,
        trial_limits: parsedLimits.limits,
      });
      setSettings(updated);
      setNotice('Global trial defaults saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save global defaults');
    } finally {
      setSavingGlobal(false);
    }
  };

  const saveProductConfig = async () => {
    if (!accessToken || !settings || !selectedProductId) return;

    const allOverrides: Record<string, TrialOverride> = { ...(settings.trial_product_overrides ?? {}) };
    if (!overrideEnabled) {
      delete allOverrides[selectedProductId];
    } else {
      const trialDays = normalizePositiveInt(overrideTrialDays);
      if (trialDays == null) {
        setError('Service trial days must be a positive integer.');
        return;
      }
      const parsedLimits = draftToLimits(overrideLimits);
      if (parsedLimits.error) {
        setError(parsedLimits.error);
        return;
      }
      allOverrides[selectedProductId] = {
        trial_enabled: overrideTrialEnabled,
        trial_days: trialDays,
        trial_limits: parsedLimits.limits,
      };
    }

    setSavingProduct(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await platformSettingsPatch(accessToken, {
        trial_product_overrides: allOverrides,
      });
      setSettings(updated);
      setNotice(overrideEnabled ? `Saved trial override for ${selectedProduct?.name ?? 'service'}.` : 'Service override removed.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save service trial settings');
    } finally {
      setSavingProduct(false);
    }
  };

  const removeProductOverride = async () => {
    if (!accessToken || !settings || !selectedProductId) return;
    const allOverrides: Record<string, TrialOverride> = { ...(settings.trial_product_overrides ?? {}) };
    if (!allOverrides[selectedProductId]) {
      setNotice('No override exists for this service.');
      return;
    }
    delete allOverrides[selectedProductId];
    setSavingProduct(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await platformSettingsPatch(accessToken, {
        trial_product_overrides: allOverrides,
      });
      setSettings(updated);
      setNotice(`Removed trial override for ${selectedProduct?.name ?? 'service'}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove service override');
    } finally {
      setSavingProduct(false);
    }
  };

  if (loading || !settings) {
    return (
      <AdminLayout>
        <div className="text-sm text-gray-600">Loading trial configuration...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trial Configuration</h1>
          <p className="text-sm text-gray-600">
            Keep global trial defaults, then override specific services from the product dropdown.
          </p>
        </div>

        {error ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div> : null}
        {notice ? <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3">{notice}</div> : null}

        <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Global defaults</h2>
            <p className="text-sm text-gray-600">Used for all services unless a product override is configured below.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={globalTrialEnabled} onChange={(e) => setGlobalTrialEnabled(e.target.checked)} />
              Trial enabled
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={globalTrialOnce} onChange={(e) => setGlobalTrialOnce(e.target.checked)} />
              Trial once per user (per product)
            </label>
            <div>
              <label className="text-xs font-semibold text-gray-600">Trial days</label>
              <input
                type="number"
                min={1}
                value={globalTrialDays}
                onChange={(e) => setGlobalTrialDays(e.target.value)}
                className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2"
              />
            </div>
          </div>

          <LimitRowsEditor
            title="Global usage limits"
            description="Universal trial limits by capability key. Each key is monthly. Leave rows empty for unlimited trial usage."
            rows={globalLimits}
            onChange={setGlobalLimits}
            suggestedKeys={['full_mock_tests', 'section_practice', 'writing_submissions']}
          />

          <button
            type="button"
            onClick={saveGlobalDefaults}
            disabled={savingGlobal}
            className="px-4 py-2 rounded-xl bg-gray-900 text-white font-semibold"
          >
            {savingGlobal ? 'Saving...' : 'Save global defaults'}
          </button>
        </section>

        <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Service overrides</h2>
            <p className="text-sm text-gray-600">Choose a product and override trial values only for that service.</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600">Product</label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="mt-2 w-full md:w-96 border border-gray-200 rounded-xl px-3 py-2"
            >
              {activeProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </div>

          {selectedProduct ? (
            <div className="border border-gray-200 rounded-2xl p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-gray-900">{selectedProduct.name}</div>
                  <div className="text-xs text-gray-500">{selectedProduct.type}</div>
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={overrideEnabled} onChange={(e) => setOverrideEnabled(e.target.checked)} />
                  Custom override enabled
                </label>
              </div>

              <div className={`${overrideEnabled ? '' : 'opacity-60 pointer-events-none'} space-y-4`}>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={overrideTrialEnabled}
                    onChange={(e) => setOverrideTrialEnabled(e.target.checked)}
                  />
                  Trial enabled for this service
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-600">Trial days</label>
                    <input
                      type="number"
                      min={1}
                      value={overrideTrialDays}
                      onChange={(e) => setOverrideTrialDays(e.target.value)}
                      className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2"
                    />
                  </div>
                  <div className="text-xs text-gray-500 self-end">
                    Tailor this service to its own content and capabilities.
                  </div>
                </div>

                <LimitRowsEditor
                  title="Service-specific usage limits"
                  description='Use capability keys for this service (for example: "module_practice", "essay_submissions"). Keys in product metadata (trial_limit_keys) appear as quick-add options.'
                  rows={overrideLimits}
                  onChange={setOverrideLimits}
                  disabled={!overrideEnabled}
                  suggestedKeys={suggestedLimitKeys}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={saveProductConfig}
                  disabled={savingProduct}
                  className="px-4 py-2 rounded-xl bg-gray-900 text-white font-semibold"
                >
                  {savingProduct ? 'Saving...' : overrideEnabled ? 'Save service override' : 'Use global defaults'}
                </button>
                <button
                  type="button"
                  onClick={removeProductOverride}
                  disabled={savingProduct}
                  className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 font-semibold"
                >
                  Remove override
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-600">No active products found.</div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
};
