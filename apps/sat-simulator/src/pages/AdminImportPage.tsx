import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '../components/admin/AdminLayout';
import {
  adminUploadAsset,
  importExperience,
  validateExperienceImport,
  type AdminUploadAssetResponse,
  type ImportExperienceResponse,
} from '../lib/platformClient';
import { supabase } from '../lib/supabase';
import { useAccess } from '../lib/useAccess';
import { useAdminPermission } from '../components/platform/adminAccess';

type Json = Record<string, unknown>;
type ProductRow = {
  id: string;
  name: string;
  status: string;
  type: string;
  metadata: Record<string, unknown> | null;
};

type ImportDraft = {
  version: 1;
  savedAt: string;
  jsonText: string;
  selectedProductId: string;
};

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const IMPORT_DRAFT_KEY = 'satx:admin-import:draft';

const readImportDraft = (): ImportDraft | null => {
  try {
    const raw = localStorage.getItem(IMPORT_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed) || (parsed as any).version !== 1) return null;
    if (typeof (parsed as any).jsonText !== 'string') return null;
    return {
      version: 1,
      savedAt: String((parsed as any).savedAt ?? ''),
      jsonText: String((parsed as any).jsonText ?? ''),
      selectedProductId: String((parsed as any).selectedProductId ?? ''),
    };
  } catch {
    return null;
  }
};

const writeImportDraft = (draft: ImportDraft): void => {
  try {
    localStorage.setItem(IMPORT_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Ignore quota/storage failures.
  }
};

const clearImportDraft = (): void => {
  try {
    localStorage.removeItem(IMPORT_DRAFT_KEY);
  } catch {
    // Ignore storage failures.
  }
};

const getSections = (payload: Json): any[] => {
  const top = asArray<any>((payload as any).sections);
  if (top.length > 0) return top;
  return asArray<any>((payload as any).experience?.sections);
};

const countParts = (payload: Json): number =>
  getSections(payload).reduce((acc, s) => acc + asArray<any>(s?.parts).length, 0);

const countUnits = (payload: Json): number =>
  getSections(payload).reduce(
    (acc, s) =>
      acc +
      asArray<any>(s?.parts).reduce(
        (acc2, p) => acc2 + (asArray<any>(p?.content_units).length > 0 ? asArray<any>(p?.content_units).length : asArray<any>(p?.units).length),
        0,
      ),
    0,
  );

const countKeys = (payload: Json): number =>
  getSections(payload).reduce(
    (acc, s) =>
      acc +
      asArray<any>(s?.parts).reduce(
        (acc2, p) =>
          acc2 +
          (asArray<any>(p?.content_units).length > 0 ? asArray<any>(p?.content_units) : asArray<any>(p?.units)).filter((u) => isObject(u?.answer_key)).length,
        0,
      ),
    0,
  );

const productSlug = (p: ProductRow): string | null => {
  const raw = isObject(p.metadata) ? p.metadata.slug : null;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim().toLowerCase() : null;
};

const withSelectedProduct = (payload: Json, productId: string): Json => {
  const root = { ...payload } as Record<string, unknown>;
  root.product_id = productId;

  const expRaw = root.experience;
  if (isObject(expRaw)) {
    root.experience = { ...expRaw, product_id: productId };
  }

  return root as Json;
};

const IMPORT_TEMPLATE = {
  product_id: '',
  experience: {
    name: '',
    display_order: 1,
    is_active: false,
    metadata: {},
  },
  sections: [],
};

export const AdminImportPage: React.FC = () => {
  const navigate = useNavigate();
  const { accessToken } = useAccess();
  const canManageAssets = useAdminPermission('admin.assets.manage');

  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [jsonText, setJsonText] = useState<string>(() => JSON.stringify(IMPORT_TEMPLATE, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<ImportExperienceResponse | null>(null);
  const [result, setResult] = useState<ImportExperienceResponse | null>(null);

  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [assetResult, setAssetResult] = useState<AdminUploadAssetResponse | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [pendingDraft, setPendingDraft] = useState<ImportDraft | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [autoSavedAt, setAutoSavedAt] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setLoading(!accessToken);
  }, [accessToken]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const draft = readImportDraft();
    setPendingDraft(draft);
    setDraftHydrated(true);
  }, []);

  useEffect(() => {
    if (!draftHydrated || pendingDraft || typeof window === 'undefined') return;
    const timer = window.setTimeout(() => {
      const draft: ImportDraft = {
        version: 1,
        savedAt: new Date().toISOString(),
        jsonText,
        selectedProductId,
      };
      writeImportDraft(draft);
      setAutoSavedAt(draft.savedAt);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [draftHydrated, pendingDraft, jsonText, selectedProductId]);

  useEffect(() => {
    if (!accessToken) {
      setProducts([]);
      setSelectedProductId('');
      return;
    }

    let cancelled = false;

    const run = async () => {
      const { data, error: productsError } = await supabase
        .from('products')
        .select('id,name,status,type,metadata')
        .order('name', { ascending: true });

      if (cancelled) return;
      if (productsError) {
        setError(productsError.message);
        setProducts([]);
        setSelectedProductId('');
        return;
      }

      const list = (data ?? []) as ProductRow[];
      setProducts(list);

      let payloadProductId = '';
      try {
        const parsedJson = JSON.parse(jsonText) as any;
        payloadProductId = String(parsedJson?.product_id ?? parsedJson?.experience?.product_id ?? '');
      } catch {
        payloadProductId = '';
      }
      const fromPayload = list.find((p) => p.id === payloadProductId)?.id ?? '';
      const satSlug = list.find((p) => productSlug(p) === 'sat-exam-simulator')?.id ?? '';
      const fallback = list[0]?.id ?? '';

      setSelectedProductId((prev) => {
        if (prev && list.some((p) => p.id === prev)) return prev;
        return fromPayload || satSlug || fallback;
      });
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [accessToken, jsonText]);

  const parsed = useMemo(() => {
    try {
      const v = JSON.parse(jsonText) as unknown;
      if (!isObject(v)) return { ok: false as const, error: 'JSON must be an object', value: null };
      return { ok: true as const, error: null, value: v as Json };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : 'Invalid JSON', value: null };
    }
  }, [jsonText]);

  const summary = useMemo(() => {
    if (!parsed.ok || !parsed.value) return null;
    const payload = parsed.value;
    return {
      product_id: String((payload as any).product_id ?? (payload as any).experience?.product_id ?? ''),
      experience_name: String((payload as any).experience?.name ?? (payload as any).experience?.title ?? ''),
      sections: getSections(payload).length,
      parts: countParts(payload),
      units: countUnits(payload),
      keys: countKeys(payload),
    };
  }, [parsed.ok, parsed.value]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );

  const restoreDraft = () => {
    if (!pendingDraft) return;
    setJsonText(pendingDraft.jsonText);
    setSelectedProductId(pendingDraft.selectedProductId);
    setValidation(null);
    setResult(null);
    setError(null);
    setAutoSavedAt(pendingDraft.savedAt);
    setPendingDraft(null);
  };

  const discardDraft = () => {
    clearImportDraft();
    setPendingDraft(null);
    setAutoSavedAt(null);
  };

  const applySelectedProductToJson = () => {
    if (!parsed.ok || !parsed.value || !selectedProductId) return;
    const next = withSelectedProduct(parsed.value, selectedProductId);
    setJsonText(JSON.stringify(next, null, 2));
    setPendingDraft(null);
    setValidation(null);
    setResult(null);
    setError(null);
  };

  const loadFile = async (file: File) => {
    const text = await file.text();
    setJsonText(text);
    setPendingDraft(null);
    setResult(null);
    setValidation(null);
    setError(null);
  };

  const doValidate = async () => {
    setError(null);
    setValidation(null);
    if (!parsed.ok || !parsed.value) {
      setError(parsed.error ?? 'Invalid JSON');
      return;
    }
    if (!selectedProductId) {
      setError('Select a product first.');
      return;
    }

    setValidating(true);
    try {
      if (!accessToken) {
        setError('Session unavailable. Please refresh.');
        return;
      }

      const res = await validateExperienceImport(accessToken, withSelectedProduct(parsed.value, selectedProductId));
      setValidation(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Validation failed');
    } finally {
      setValidating(false);
    }
  };

  const doImport = async () => {
    setError(null);
    setResult(null);
    if (!parsed.ok || !parsed.value) {
      setError(parsed.error ?? 'Invalid JSON');
      return;
    }
    if (!selectedProductId) {
      setError('Select a product first.');
      return;
    }

    setImporting(true);
    try {
      if (!accessToken) {
        setError('Session unavailable. Please refresh.');
        return;
      }

      const res = await importExperience(accessToken, withSelectedProduct(parsed.value, selectedProductId));
      setResult(res);
      clearImportDraft();
      setPendingDraft(null);
      setAutoSavedAt(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const downloadNormalized = () => {
    const payload = (result?.normalized ?? validation?.normalized) as any;
    const id = result?.experience_id ?? validation?.experience_id ?? 'preview';
    if (!payload) return;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `experience-${id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const uploadAsset = async () => {
    if (!assetFile || !canManageAssets) return;

    setUploading(true);
    setError(null);
    setAssetResult(null);

    try {
      if (!accessToken) {
        setError('Session unavailable. Please refresh.');
        return;
      }

      const res = await adminUploadAsset(accessToken, assetFile, { kind: 'audio' });
      setAssetResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const storageSnippet = useMemo(() => {
    if (!assetResult) return null;
    return JSON.stringify(
      {
        type: 'audio',
        data: {
          storage: { bucket: assetResult.bucket, path: assetResult.path },
          duration_seconds: 60,
          play_once: true,
        },
        display_order: 1,
      },
      null,
      2,
    );
  }, [assetResult]);

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">Loading...</div>;
  }

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <div className="text-xs font-semibold tracking-wider uppercase text-emerald-700 mb-2">Admin</div>
              <h1 className="text-2xl font-bold text-gray-900">Import Test Content (JSON)</h1>
              <p className="text-sm text-gray-500 mt-1">
                Upload JSON, normalize it, and save it through the admin builder snapshot flow so re-imports replace stale test content safely.
              </p>
            </div>
            <div />
          </div>

          {error ? (
            <div className="mt-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
          ) : null}

          {pendingDraft ? (
            <div className="mt-6 text-sm text-blue-900 bg-blue-50 border border-blue-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                Local import draft found
                <span className="text-blue-700">
                  {' '}
                  ({pendingDraft.savedAt ? new Date(pendingDraft.savedAt).toLocaleString() : 'unknown time'})
                </span>
                . Restore it or discard it.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={restoreDraft}
                  className="px-3 py-1.5 rounded-lg border border-blue-200 bg-white text-xs font-semibold hover:bg-blue-100"
                >
                  Restore draft
                </button>
                <button
                  type="button"
                  onClick={discardDraft}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold hover:bg-gray-100"
                >
                  Discard
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-gray-900">Payload</div>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (f) void loadFile(f);
                    }}
                    className="text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
                <div>
                  <div className="text-xs font-semibold text-gray-600 mb-1">Target product</div>
                  <select
                    value={selectedProductId}
                    onChange={(e) => {
                      setSelectedProductId(e.target.value);
                      setPendingDraft(null);
                    }}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white"
                  >
                    <option value="">Select product...</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} ({product.status})
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={applySelectedProductToJson}
                  disabled={!selectedProductId || !parsed.ok}
                  className="h-[42px] px-4 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:bg-gray-100 font-semibold text-sm transition-colors"
                >
                  Apply ID to JSON
                </button>
              </div>

              <textarea
                value={jsonText}
                onChange={(e) => {
                  setJsonText(e.target.value);
                  setPendingDraft(null);
                }}
                rows={18}
                className="w-full font-mono text-xs p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                spellCheck={false}
              />

              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-gray-500">
                  {parsed.ok ? 'JSON parses OK.' : `JSON error: ${parsed.error ?? 'Invalid JSON'}`}
                  {autoSavedAt ? ` Local autosave: ${new Date(autoSavedAt).toLocaleTimeString()}` : ''}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={doValidate}
                    disabled={!parsed.ok || validating}
                    className="px-5 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:bg-gray-100 font-semibold transition-colors"
                  >
                    {validating ? 'Validating...' : 'Validate'}
                  </button>
                  <button
                    onClick={doImport}
                    disabled={!parsed.ok || importing}
                    className="px-5 py-2.5 bg-gray-900 hover:bg-black disabled:bg-gray-300 text-white font-semibold rounded-lg transition-colors"
                  >
                    {importing ? 'Importing...' : 'Import'}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="border border-gray-200 rounded-2xl p-5 bg-white">
                <div className="text-sm font-bold text-gray-900">Summary</div>
                {summary ? (
                  <div className="mt-3 text-sm text-gray-700 space-y-2">
                    <div>
                      <span className="text-gray-500">payload product_id:</span>{' '}
                      <span className="font-mono text-xs">{summary.product_id || '(missing)'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">selected product_id:</span>{' '}
                      <span className="font-mono text-xs">{selectedProductId || '(not selected)'}</span>
                    </div>
                    {selectedProduct ? (
                      <div>
                        <span className="text-gray-500">selected product:</span> {selectedProduct.name}
                      </div>
                    ) : null}
                    <div>
                      <span className="text-gray-500">experience:</span> {summary.experience_name || '(missing)'}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="border border-gray-100 rounded-lg p-3">
                        <div className="text-xs text-gray-500">Sections</div>
                        <div className="text-xl font-bold text-gray-900">{summary.sections}</div>
                      </div>
                      <div className="border border-gray-100 rounded-lg p-3">
                        <div className="text-xs text-gray-500">Parts</div>
                        <div className="text-xl font-bold text-gray-900">{summary.parts}</div>
                      </div>
                      <div className="border border-gray-100 rounded-lg p-3">
                        <div className="text-xs text-gray-500">Units</div>
                        <div className="text-xl font-bold text-gray-900">{summary.units}</div>
                      </div>
                      <div className="border border-gray-100 rounded-lg p-3">
                        <div className="text-xs text-gray-500">Answer keys</div>
                        <div className="text-xl font-bold text-gray-900">{summary.keys}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-gray-600">Paste a valid JSON payload to see summary.</div>
                )}
              </div>

              <div className="border border-gray-200 rounded-2xl p-5 bg-white">
                <div className="text-sm font-bold text-gray-900">Preview / Last Import</div>
                {validation ? (
                  <div className="mt-3 space-y-3">
                    <div className="text-xs font-semibold text-gray-700">Validation OK (dry-run)</div>
                    <div className="text-xs text-gray-500">experience_id</div>
                    <div className="font-mono text-xs bg-gray-50 border border-gray-200 rounded p-2 break-all">
                      {validation.experience_id}
                    </div>
                    <div className="text-xs text-gray-500">
                      Would write: {validation.counts.sections} sections, {validation.counts.parts} parts, {validation.counts.content_units} units, {validation.counts.answer_keys} keys.
                    </div>
                    {validation.stale_counts ? (
                      <div className="text-xs text-amber-700">
                        Would replace stale rows: {validation.stale_counts.sections} sections, {validation.stale_counts.parts} parts, {validation.stale_counts.content_units} units.
                      </div>
                    ) : null}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <button
                        onClick={downloadNormalized}
                        className="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 font-semibold"
                      >
                        Download JSON
                      </button>
                      <button
                        onClick={() => navigate(`/admin/test/${validation.experience_id}`)}
                        className="px-3 py-2 rounded-lg bg-gray-900 hover:bg-black text-white font-semibold"
                        title="Only works after you click Import"
                      >
                        Open (after import)
                      </button>
                    </div>
                  </div>
                ) : result ? (
                  <div className="mt-3 space-y-3">
                    <div className="text-xs text-gray-500">experience_id</div>
                    <div className="font-mono text-xs bg-gray-50 border border-gray-200 rounded p-2 break-all">
                      {result.experience_id}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <button
                        onClick={() => navigate(`/admin/test/${result.experience_id}`)}
                        className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                      >
                        Open Test
                      </button>
                      <button
                        onClick={downloadNormalized}
                        className="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 font-semibold"
                      >
                        Download JSON
                      </button>
                    </div>
                    <div className="text-xs text-gray-500">
                      Imported: {result.counts.sections} sections, {result.counts.parts} parts, {result.counts.content_units} units.
                    </div>
                    {typeof result.version === 'number' ? (
                      <div className="text-xs text-gray-500">Saved version: {result.version}</div>
                    ) : null}
                    {result.stale_counts ? (
                      <div className="text-xs text-amber-700">
                        Replaced stale rows: {result.stale_counts.sections} sections, {result.stale_counts.parts} parts, {result.stale_counts.content_units} units.
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-gray-600">No import yet.</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Listening Audio (Storage)</h2>
              <p className="text-sm text-gray-500 mt-1">
                Upload an audio file to Supabase Storage and get a `bucket/path` pair you can reference in your JSON as `audio.data.storage`.
              </p>
            </div>
          </div>

          {canManageAssets ? (
            <>
              <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-3">
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) => {
                      setAssetResult(null);
                      setError(null);
                      setAssetFile(e.target.files?.[0] ?? null);
                    }}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-gray-500">
                      {assetFile ? (
                        <span>
                          Selected: <span className="font-mono">{assetFile.name}</span>
                        </span>
                      ) : (
                        'Select an audio file.'
                      )}
                    </div>
                    <button
                      onClick={uploadAsset}
                      disabled={!assetFile || uploading}
                      className="px-5 py-2.5 bg-gray-900 hover:bg-black disabled:bg-gray-300 text-white font-semibold rounded-lg transition-colors"
                    >
                      {uploading ? 'Uploading...' : 'Upload'}
                    </button>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-2xl p-5 bg-white space-y-3">
                  <div className="text-sm font-bold text-gray-900">Result</div>
                  {assetResult ? (
                    <>
                      <div className="text-xs text-gray-500">Storage reference</div>
                      <div className="font-mono text-xs bg-gray-50 border border-gray-200 rounded p-2 break-all">
                        {assetResult.bucket}/{assetResult.path}
                      </div>
                      {assetResult.signed_url ? (
                        <audio src={assetResult.signed_url} controls preload="none" className="w-full" />
                      ) : null}
                    </>
                  ) : (
                    <div className="text-sm text-gray-600">No upload yet.</div>
                  )}
                </div>
              </div>

              {storageSnippet ? (
                <div className="mt-6">
                  <div className="text-sm font-semibold text-gray-900 mb-2">JSON snippet</div>
                  <pre className="text-xs font-mono p-3 bg-gray-50 border border-gray-200 rounded-xl overflow-x-auto">
                    {storageSnippet}
                  </pre>
                </div>
              ) : null}
            </>
          ) : (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Your account can import tests, but audio uploads require the additional <span className="font-mono">admin.assets.manage</span> permission.
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};
