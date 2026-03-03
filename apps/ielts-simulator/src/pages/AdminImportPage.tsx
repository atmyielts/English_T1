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
import {
  AI_IMPORT_TEMPLATE_V1,
  AI_SUPPORTED_UNIT_TYPES,
  type CanonicalImportPayloadLike,
  type InputFormat,
} from '../lib/import/aiSchema';
import { normalizeAiToCanonical } from '../lib/import/aiToCanonical';
import { supabase } from '../lib/supabase';
import { useAccess } from '../lib/useAccess';

type Json = Record<string, unknown>;
type ProductRow = {
  id: string;
  name: string;
  status: string;
  type: string;
  metadata: Record<string, unknown> | null;
};

type ImportDraft = {
  version: 2;
  savedAt: string;
  jsonText: string;
  selectedProductId: string;
  inputFormat: InputFormat;
  normalizedJsonText?: string;
};

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const IMPORT_DRAFT_KEY = 'ieltsx:admin-import:draft';

const readImportDraft = (): ImportDraft | null => {
  try {
    const raw = localStorage.getItem(IMPORT_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) return null;
    const version = Number((parsed as any).version ?? 1);
    if (![1, 2].includes(version)) return null;
    if (typeof (parsed as any).jsonText !== 'string') return null;
    return {
      version: 2,
      savedAt: String((parsed as any).savedAt ?? ''),
      jsonText: String((parsed as any).jsonText ?? ''),
      selectedProductId: String((parsed as any).selectedProductId ?? ''),
      inputFormat: (String((parsed as any).inputFormat ?? 'canonical') === 'ai_v1' ? 'ai_v1' : 'canonical') as InputFormat,
      normalizedJsonText: typeof (parsed as any).normalizedJsonText === 'string' ? String((parsed as any).normalizedJsonText) : undefined,
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

const AI_TEMPLATE_JSON = JSON.stringify(AI_IMPORT_TEMPLATE_V1, null, 2);

const toPayloadSignature = (payload: unknown): string => {
  try {
    return JSON.stringify(payload);
  } catch {
    return '';
  }
};

export const AdminImportPage: React.FC = () => {
  const navigate = useNavigate();
  const { accessToken } = useAccess();

  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [jsonText, setJsonText] = useState<string>(() => JSON.stringify(IMPORT_TEMPLATE, null, 2));
  const [inputFormat, setInputFormat] = useState<InputFormat>('canonical');
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<ImportExperienceResponse | null>(null);
  const [result, setResult] = useState<ImportExperienceResponse | null>(null);
  const [validatedSignature, setValidatedSignature] = useState<string | null>(null);

  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [assetResult, setAssetResult] = useState<AdminUploadAssetResponse | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [pendingDraft, setPendingDraft] = useState<ImportDraft | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [autoSavedAt, setAutoSavedAt] = useState<string | null>(null);
  const [restoredNormalizedJsonText, setRestoredNormalizedJsonText] = useState<string | null>(null);

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
      const ieltsSlug = list.find((p) => productSlug(p) === 'ielts-academic-simulator')?.id ?? '';
      const fallback = list[0]?.id ?? '';

      setSelectedProductId((prev) => {
        if (prev && list.some((p) => p.id === prev)) return prev;
        return fromPayload || ieltsSlug || fallback;
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

  const aiNormalization = useMemo(() => {
    if (inputFormat !== 'ai_v1') return null;
    if (!parsed.ok || !parsed.value) return null;
    if (!selectedProductId) return null;
    return normalizeAiToCanonical(parsed.value, selectedProductId);
  }, [inputFormat, parsed.ok, parsed.value, selectedProductId]);

  const effectivePayload = useMemo<CanonicalImportPayloadLike | Json | null>(() => {
    if (!parsed.ok || !parsed.value) return null;
    if (!selectedProductId) return null;
    if (inputFormat === 'canonical') return withSelectedProduct(parsed.value, selectedProductId);
    return aiNormalization?.payload ?? null;
  }, [parsed.ok, parsed.value, selectedProductId, inputFormat, aiNormalization?.payload]);

  const normalizedPreviewJson = useMemo(() => {
    if (inputFormat !== 'ai_v1') return null;
    if (aiNormalization?.payload) {
      return JSON.stringify(aiNormalization.payload, null, 2);
    }
    return restoredNormalizedJsonText;
  }, [inputFormat, aiNormalization?.payload, restoredNormalizedJsonText]);

  useEffect(() => {
    if (!draftHydrated || pendingDraft || typeof window === 'undefined') return;
    const timer = window.setTimeout(() => {
      const draft: ImportDraft = {
        version: 2,
        savedAt: new Date().toISOString(),
        jsonText,
        selectedProductId,
        inputFormat,
        normalizedJsonText: normalizedPreviewJson ?? undefined,
      };
      writeImportDraft(draft);
      setAutoSavedAt(draft.savedAt);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [draftHydrated, pendingDraft, jsonText, selectedProductId, inputFormat, normalizedPreviewJson]);

  const payloadSignature = useMemo(() => (effectivePayload ? toPayloadSignature(effectivePayload) : ''), [effectivePayload]);

  const hasNormalizationErrors = inputFormat === 'ai_v1' ? Boolean(aiNormalization && aiNormalization.errors.length > 0) : false;

  const canValidate = useMemo(() => {
    if (!effectivePayload) return false;
    if (!payloadSignature) return false;
    if (inputFormat === 'ai_v1' && hasNormalizationErrors) return false;
    return true;
  }, [effectivePayload, payloadSignature, inputFormat, hasNormalizationErrors]);

  const canImport = useMemo(() => {
    if (!effectivePayload) return false;
    if (!payloadSignature) return false;
    if (!validation) return false;
    if (!validatedSignature) return false;
    return validatedSignature === payloadSignature;
  }, [effectivePayload, payloadSignature, validation, validatedSignature]);

  const summary = useMemo(() => {
    if (!effectivePayload) return null;
    const payload = effectivePayload;
    return {
      product_id: String((payload as any).product_id ?? (payload as any).experience?.product_id ?? ''),
      experience_name: String((payload as any).experience?.name ?? (payload as any).experience?.title ?? ''),
      sections: getSections(payload).length,
      parts: countParts(payload),
      units: countUnits(payload),
      keys: countKeys(payload),
    };
  }, [effectivePayload]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );

  const restoreDraft = () => {
    if (!pendingDraft) return;
    setJsonText(pendingDraft.jsonText);
    setSelectedProductId(pendingDraft.selectedProductId);
    setInputFormat(pendingDraft.inputFormat ?? 'canonical');
    setRestoredNormalizedJsonText(pendingDraft.normalizedJsonText ?? null);
    setValidation(null);
    setResult(null);
    setValidatedSignature(null);
    setError(null);
    setAutoSavedAt(pendingDraft.savedAt);
    setPendingDraft(null);
  };

  const discardDraft = () => {
    clearImportDraft();
    setPendingDraft(null);
    setAutoSavedAt(null);
    setRestoredNormalizedJsonText(null);
  };

  const applySelectedProductToJson = () => {
    if (!parsed.ok || !parsed.value || !selectedProductId) return;
    const next = withSelectedProduct(parsed.value, selectedProductId);
    setJsonText(JSON.stringify(next, null, 2));
    setPendingDraft(null);
    setValidation(null);
    setResult(null);
    setValidatedSignature(null);
    setRestoredNormalizedJsonText(null);
    setError(null);
  };

  const loadFile = async (file: File) => {
    const text = await file.text();
    setJsonText(text);
    setPendingDraft(null);
    setResult(null);
    setValidation(null);
    setValidatedSignature(null);
    setRestoredNormalizedJsonText(null);
    setError(null);
  };

  const handleInputFormatChange = (nextFormat: InputFormat) => {
    setInputFormat(nextFormat);
    setValidation(null);
    setResult(null);
    setValidatedSignature(null);
    setError(null);
  };

  const loadAiTemplate = () => {
    setJsonText(AI_TEMPLATE_JSON);
    setInputFormat('ai_v1');
    setPendingDraft(null);
    setValidation(null);
    setResult(null);
    setValidatedSignature(null);
    setRestoredNormalizedJsonText(null);
    setError(null);
  };

  const copyAiTemplate = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(AI_TEMPLATE_JSON);
      }
    } catch {
      // Ignore clipboard failures in restricted browser contexts.
    }
  };

  const doValidate = async () => {
    setError(null);
    setValidation(null);
    setValidatedSignature(null);

    if (!parsed.ok || !parsed.value) return setError(parsed.error ?? 'Invalid JSON');
    if (!selectedProductId) return setError('Select a product first.');
    if (!canValidate) {
      if (inputFormat === 'ai_v1' && hasNormalizationErrors) {
        setError('Fix AI normalization errors before validation.');
        return;
      }
      setError('Nothing valid to validate yet.');
      return;
    }

    setValidating(true);
    try {
      if (!accessToken) {
        setError('Session unavailable. Please refresh.');
        return;
      }

      const res = await validateExperienceImport(accessToken, effectivePayload);
      setValidation(res);
      setValidatedSignature(payloadSignature);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Validation failed');
    } finally {
      setValidating(false);
    }
  };

  const doImport = async () => {
    setError(null);
    setResult(null);
    if (!parsed.ok || !parsed.value) return setError(parsed.error ?? 'Invalid JSON');
    if (!selectedProductId) return setError('Select a product first.');
    if (!canImport) {
      setError('Run validation first, then import without changing payload.');
      return;
    }

    setImporting(true);
    try {
      if (!accessToken) {
        setError('Session unavailable. Please refresh.');
        return;
      }

      const res = await importExperience(accessToken, effectivePayload);
      setResult(res);
      setValidation(null);
      setValidatedSignature(null);
      clearImportDraft();
      setPendingDraft(null);
      setAutoSavedAt(null);
      setRestoredNormalizedJsonText(null);
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
    if (!assetFile) return;

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
                Upload a JSON file and import it into `experiences`, `sections`, `parts`, `content_units`, `answer_keys` via an admin-only Edge Function.
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
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
                <div>
                  <div className="text-xs font-semibold text-gray-600 mb-1">Input format</div>
                  <select
                    value={inputFormat}
                    onChange={(e) => handleInputFormatChange((e.target.value === 'ai_v1' ? 'ai_v1' : 'canonical') as InputFormat)}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white"
                  >
                    <option value="canonical">Canonical JSON (existing)</option>
                    <option value="ai_v1">AI JSON (v1)</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={loadAiTemplate}
                    className="h-[42px] px-4 rounded-lg border border-gray-200 hover:bg-gray-50 font-semibold text-sm transition-colors"
                  >
                    Load AI template
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyAiTemplate()}
                    className="h-[42px] px-4 rounded-lg border border-gray-200 hover:bg-gray-50 font-semibold text-sm transition-colors"
                  >
                    Copy template
                  </button>
                </div>
              </div>

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
                      setValidation(null);
                      setResult(null);
                      setValidatedSignature(null);
                      setRestoredNormalizedJsonText(null);
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
                  disabled={inputFormat !== 'canonical' || !selectedProductId || !parsed.ok}
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
                  setValidation(null);
                  setResult(null);
                  setValidatedSignature(null);
                  setRestoredNormalizedJsonText(null);
                  setError(null);
                }}
                rows={18}
                className="w-full font-mono text-xs p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                spellCheck={false}
              />

              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-gray-500">
                  {parsed.ok ? 'JSON parses OK.' : `JSON error: ${parsed.error ?? 'Invalid JSON'}`}
                  {inputFormat === 'ai_v1' && parsed.ok && aiNormalization
                    ? ` AI normalization: ${aiNormalization.errors.length > 0 ? `${aiNormalization.errors.length} error(s)` : 'OK'}`
                    : ''}
                  {autoSavedAt ? ` Local autosave: ${new Date(autoSavedAt).toLocaleTimeString()}` : ''}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={doValidate}
                    disabled={!canValidate || validating}
                    className="px-5 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:bg-gray-100 font-semibold transition-colors"
                  >
                    {validating ? 'Validating...' : inputFormat === 'ai_v1' ? 'Normalize + Validate' : 'Validate'}
                  </button>
                  <button
                    onClick={doImport}
                    disabled={!canImport || importing}
                    className="px-5 py-2.5 bg-gray-900 hover:bg-black disabled:bg-gray-300 text-white font-semibold rounded-lg transition-colors"
                  >
                    {importing ? 'Importing...' : 'Import'}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {inputFormat === 'ai_v1' ? (
                <div className="border border-gray-200 rounded-2xl p-5 bg-white space-y-3">
                  <div className="text-sm font-bold text-gray-900">AI Generation Contract (v1)</div>
                  <ul className="list-disc pl-5 text-xs text-gray-600 space-y-1">
                    <li>Use root: <span className="font-mono">exam</span> (or <span className="font-mono">test</span> / <span className="font-mono">experience</span>).</li>
                    <li>Required: experience name + non-empty sections / parts / units.</li>
                    <li>Each unit needs <span className="font-mono">type</span> and object <span className="font-mono">data</span>.</li>
                    <li>Auto-scored items should include <span className="font-mono">answer_key.correct</span>.</li>
                    <li>IDs are optional; backend can generate them.</li>
                  </ul>
                  <div className="text-xs text-gray-500">
                    Common mistakes: missing section names, empty parts, or unit data that is not a JSON object.
                  </div>
                  <details className="text-xs">
                    <summary className="cursor-pointer font-semibold text-gray-700">Supported unit types</summary>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {AI_SUPPORTED_UNIT_TYPES.map((unitType) => (
                        <span key={unitType} className="px-2 py-1 rounded border border-gray-200 bg-gray-50 font-mono text-[10px] text-gray-700">
                          {unitType}
                        </span>
                      ))}
                    </div>
                  </details>
                </div>
              ) : null}

              {inputFormat === 'ai_v1' ? (
                <div className="border border-gray-200 rounded-2xl p-5 bg-white space-y-3">
                  <div className="text-sm font-bold text-gray-900">Normalization preview</div>
                  {!parsed.ok ? (
                    <div className="text-xs text-gray-600">Fix JSON parsing errors first.</div>
                  ) : !selectedProductId ? (
                    <div className="text-xs text-gray-600">Select target product to normalize.</div>
                  ) : !aiNormalization ? (
                    <div className="text-xs text-gray-600">No normalization result yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {aiNormalization.errors.length > 0 ? (
                        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                          {aiNormalization.errors.map((entry) => (
                            <div key={entry}>{entry}</div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">No normalization errors.</div>
                      )}

                      {aiNormalization.warnings.length > 0 ? (
                        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                          {aiNormalization.warnings.map((entry) => (
                            <div key={entry}>{entry}</div>
                          ))}
                        </div>
                      ) : null}

                      {aiNormalization.autoDefaults.length > 0 ? (
                        <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded p-2">
                          {aiNormalization.autoDefaults.map((entry) => (
                            <div key={entry}>{entry}</div>
                          ))}
                        </div>
                      ) : null}

                      {normalizedPreviewJson ? (
                        <details className="text-xs">
                          <summary className="cursor-pointer font-semibold text-gray-700">View normalized canonical JSON</summary>
                          <pre className="mt-2 max-h-56 overflow-auto bg-gray-50 border border-gray-200 rounded p-2 text-[11px] leading-5">
                            {normalizedPreviewJson}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : null}

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
        </div>
      </div>
    </AdminLayout>
  );
};
