import React, { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { clearLocalAuthStorage, supabase } from '../../lib/supabase';
import { adminProductsCreate, adminProductsList, adminProductsUpdate, type AdminProductRow } from '../../lib/platformClient';

type ProductRow = AdminProductRow;

type ProductMeta = {
  slug?: string;
  app_url?: string;
  short_description?: string;
  tagline?: string;
  sort_order?: number;
};

const TYPE_OPTIONS = ['exam', 'practice', 'tool', 'course'];
const STATUS_OPTIONS = ['draft', 'active', 'disabled', 'archived'];

const toFriendlyError = (err: unknown, fallback: string): string => {
  const msg = err instanceof Error ? err.message : '';
  if (/401|unauthorized|invalid jwt/i.test(msg)) return 'Session expired. Please sign in again and retry.';
  if (/403|forbidden/i.test(msg)) return 'Admin access is required for this action.';
  if (/429|rate limit/i.test(msg)) return 'Too many requests. Please wait a moment and retry.';
  return fallback;
};

const isUnauthorizedError = (err: unknown): boolean => {
  const msg = err instanceof Error ? err.message : '';
  return /401|unauthorized|invalid jwt/i.test(msg);
};

const parseMeta = (meta: ProductRow['metadata']): ProductMeta => {
  const m = (meta ?? {}) as ProductMeta;
  return {
    slug: m.slug ?? '',
    app_url: m.app_url ?? '',
    short_description: m.short_description ?? '',
    tagline: m.tagline ?? '',
    sort_order: typeof m.sort_order === 'number' && Number.isFinite(m.sort_order) ? m.sort_order : undefined,
  };
};

const buildMeta = (base: Record<string, unknown> | null | undefined, draft: ProductMeta): Record<string, unknown> => {
  const meta: Record<string, unknown> = { ...(base ?? {}) };

  const slug = draft.slug?.trim() ?? '';
  if (slug) meta.slug = slug;
  else delete meta.slug;

  const appUrl = draft.app_url?.trim() ?? '';
  if (appUrl) meta.app_url = appUrl;
  else delete meta.app_url;

  const shortDesc = draft.short_description?.trim() ?? '';
  if (shortDesc) meta.short_description = shortDesc;
  else delete meta.short_description;

  const tag = draft.tagline?.trim() ?? '';
  if (tag) meta.tagline = tag;
  else delete meta.tagline;

  if (typeof draft.sort_order === 'number' && Number.isFinite(draft.sort_order)) {
    meta.sort_order = draft.sort_order;
  } else {
    delete meta.sort_order;
  }

  return meta;
};

const ProductEditor: React.FC<{
  product: ProductRow;
  onSave: (id: string, patch: Partial<ProductRow>, meta: ProductMeta, baseMeta: ProductRow['metadata']) => Promise<void>;
  onArchiveToggle: (product: ProductRow) => Promise<void>;
  saving: boolean;
}> = ({ product, onSave, onArchiveToggle, saving }) => {
  const [draft, setDraft] = useState<ProductMeta>(() => parseMeta(product.metadata));
  const [name, setName] = useState(product.name);
  const [type, setType] = useState(product.type);
  const [status, setStatus] = useState(product.status);
  const [description, setDescription] = useState(product.description ?? '');

  useEffect(() => {
    setDraft(parseMeta(product.metadata));
    setName(product.name);
    setType(product.type);
    setStatus(product.status);
    setDescription(product.description ?? '');
  }, [product]);

  return (
    <div className="rounded-3xl border border-gray-200 bg-white shadow-sm p-5 space-y-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Product</div>
          <div className="text-lg font-bold text-gray-900 mt-1">{product.name}</div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onArchiveToggle(product)}
            disabled={saving}
            className={`px-4 py-2 rounded-xl border font-semibold disabled:opacity-50 ${
              product.status === 'archived' ? 'border-emerald-200 text-emerald-700' : 'border-amber-200 text-amber-700'
            }`}
          >
            {product.status === 'archived' ? 'Restore' : 'Archive'}
          </button>
          <button
            onClick={() =>
              onSave(
                product.id,
                {
                  name: name.trim() || product.name,
                  type,
                  status,
                  description: description.trim() || null,
                },
                draft,
                product.metadata,
              )
            }
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-gray-900 text-white font-semibold disabled:bg-gray-300"
          >
            Save changes
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-gray-600">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600">Slug (pricing URL)</label>
          <input
            value={draft.slug ?? ''}
            onChange={(e) => setDraft((prev) => ({ ...prev, slug: e.target.value }))}
            className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2 font-mono text-sm"
            placeholder="ielts-academic"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2">
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2">
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-semibold text-gray-600">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2 min-h-[90px]"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600">App URL</label>
          <input
            value={draft.app_url ?? ''}
            onChange={(e) => setDraft((prev) => ({ ...prev, app_url: e.target.value }))}
            className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2"
            placeholder="https://ielts.domain.com"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600">Tagline</label>
          <input
            value={draft.tagline ?? ''}
            onChange={(e) => setDraft((prev) => ({ ...prev, tagline: e.target.value }))}
            className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2"
            placeholder="Real exam pacing and review"
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-semibold text-gray-600">Short description (landing cards)</label>
          <input
            value={draft.short_description ?? ''}
            onChange={(e) => setDraft((prev) => ({ ...prev, short_description: e.target.value }))}
            className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600">Sort order (optional)</label>
          <input
            type="number"
            value={typeof draft.sort_order === 'number' ? draft.sort_order : ''}
            onChange={(e) => setDraft((prev) => ({ ...prev, sort_order: e.target.value === '' ? undefined : Number(e.target.value) }))}
            className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2"
          />
        </div>
      </div>
    </div>
  );
};

export const AdminProductsPage: React.FC = () => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newProduct, setNewProduct] = useState({
    name: '',
    type: 'exam',
    status: 'draft',
    description: '',
    slug: '',
    app_url: '',
    short_description: '',
    tagline: '',
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setAccessToken(session?.access_token ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const getValidToken = async (): Promise<string | null> => {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    const session = data.session;
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = Number(session?.expires_at ?? 0);
    const shouldRefresh = !session?.access_token || !Number.isFinite(expiresAt) || expiresAt - now < 90;
    if (!shouldRefresh) return session.access_token;

    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed.session?.access_token) return session?.access_token ?? null;
    return refreshed.session.access_token;
  };

  const withFreshToken = async <T,>(run: (token: string) => Promise<T>): Promise<T> => {
    const token = await getValidToken();
    if (!token) {
      clearLocalAuthStorage();
      setAccessToken(null);
      throw new Error('Session expired. Please sign in again and retry.');
    }

    try {
      return await run(token);
    } catch (err) {
      if (!isUnauthorizedError(err)) throw err;

      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      const refreshedToken = refreshError ? null : refreshed.session?.access_token ?? null;
      if (refreshedToken) {
        try {
          return await run(refreshedToken);
        } catch (retryErr) {
          if (!isUnauthorizedError(retryErr)) throw retryErr;
        }
      }

      clearLocalAuthStorage();
      setAccessToken(null);
      throw new Error('Session expired. Please sign in again and retry.');
    }
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { products: rows } = await withFreshToken((freshToken) => adminProductsList(freshToken, { limit: 500 }));
      setProducts(rows ?? []);
    } catch (e) {
      setError(toFriendlyError(e, 'Failed to load products.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!accessToken) return;
    void load();
  }, [accessToken]);

  const createProduct = async () => {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    try {
      const meta = buildMeta(null, {
        slug: newProduct.slug,
        app_url: newProduct.app_url,
        short_description: newProduct.short_description,
        tagline: newProduct.tagline,
      });

      const { product } = await withFreshToken((token) =>
        adminProductsCreate(token, {
          name: newProduct.name.trim() || 'New product',
          type: newProduct.type,
          status: newProduct.status,
          description: newProduct.description.trim() || null,
          metadata: meta,
        }),
      );
      if (product) setProducts((prev) => [product as ProductRow, ...prev]);
      setNewProduct({ name: '', type: 'exam', status: 'draft', description: '', slug: '', app_url: '', short_description: '', tagline: '' });
    } catch (e) {
      setError(toFriendlyError(e, 'Failed to create product.'));
    } finally {
      setSaving(false);
    }
  };

  const saveProduct = async (
    id: string,
    patch: Partial<ProductRow>,
    metaDraft: ProductMeta,
    baseMeta: ProductRow['metadata'],
  ) => {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    try {
      const meta = buildMeta(baseMeta, metaDraft);
      const { product } = await withFreshToken((token) => adminProductsUpdate(token, id, { ...patch, metadata: meta }));
      if (product) setProducts((prev) => prev.map((p) => (p.id === id ? (product as ProductRow) : p)));
    } catch (e) {
      setError(toFriendlyError(e, 'Failed to update product.'));
    } finally {
      setSaving(false);
    }
  };

  const toggleArchiveProduct = async (product: ProductRow) => {
    if (!accessToken) return;
    const isArchived = String(product.status).toLowerCase() === 'archived';
    if (!window.confirm(`${isArchived ? 'Restore' : 'Archive'} this product?`)) return;

    setSaving(true);
    setError(null);
    try {
      const baseMeta = (product.metadata ?? {}) as Record<string, unknown>;
      const meta: Record<string, unknown> = { ...baseMeta };

      let nextStatus = 'archived';
      if (isArchived) {
        const prev = String(meta.archived_from_status ?? '').trim().toLowerCase();
        const fallback = prev && prev !== 'archived' && STATUS_OPTIONS.includes(prev) ? prev : 'active';
        nextStatus = fallback;
        delete meta.archived;
        delete meta.archived_at;
      } else {
        nextStatus = 'archived';
        meta.archived = true;
        meta.archived_at = new Date().toISOString();
        meta.archived_from_status = product.status;
      }

      const { product: updated } = await withFreshToken((token) =>
        adminProductsUpdate(token, product.id, { status: nextStatus, metadata: meta }),
      );
      if (updated) setProducts((prev) => prev.map((p) => (p.id === product.id ? (updated as ProductRow) : p)));
    } catch (e) {
      setError(toFriendlyError(e, `Failed to ${isArchived ? 'restore' : 'archive'} product.`));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-sm text-gray-600">Create and configure services. These drive the landing page and pricing.</p>
        </div>

        {error ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div> : null}

        <div className="rounded-3xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
          <div className="text-sm font-semibold text-gray-900">Create product</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              value={newProduct.name}
              onChange={(e) => setNewProduct((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Product name"
              className="border border-gray-200 rounded-xl px-3 py-2"
            />
            <input
              value={newProduct.slug}
              onChange={(e) => setNewProduct((prev) => ({ ...prev, slug: e.target.value }))}
              placeholder="Slug (pricing URL)"
              className="border border-gray-200 rounded-xl px-3 py-2 font-mono text-sm"
            />
            <select
              value={newProduct.type}
              onChange={(e) => setNewProduct((prev) => ({ ...prev, type: e.target.value }))}
              className="border border-gray-200 rounded-xl px-3 py-2"
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <select
              value={newProduct.status}
              onChange={(e) => setNewProduct((prev) => ({ ...prev, status: e.target.value }))}
              className="border border-gray-200 rounded-xl px-3 py-2"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <input
              value={newProduct.app_url}
              onChange={(e) => setNewProduct((prev) => ({ ...prev, app_url: e.target.value }))}
              placeholder="App URL (optional)"
              className="border border-gray-200 rounded-xl px-3 py-2"
            />
            <input
              value={newProduct.tagline}
              onChange={(e) => setNewProduct((prev) => ({ ...prev, tagline: e.target.value }))}
              placeholder="Tagline (optional)"
              className="border border-gray-200 rounded-xl px-3 py-2"
            />
            <input
              value={newProduct.short_description}
              onChange={(e) => setNewProduct((prev) => ({ ...prev, short_description: e.target.value }))}
              placeholder="Short description"
              className="border border-gray-200 rounded-xl px-3 py-2 md:col-span-2"
            />
            <textarea
              value={newProduct.description}
              onChange={(e) => setNewProduct((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Full description (optional)"
              className="border border-gray-200 rounded-xl px-3 py-2 md:col-span-2 min-h-[90px]"
            />
          </div>
          <button onClick={createProduct} disabled={saving} className="px-4 py-2 rounded-xl bg-gray-900 text-white font-semibold">
            Create product
          </button>
        </div>

        <div className="space-y-5">
          {loading ? <div className="text-gray-600">Loading products...</div> : null}
          {!loading && products.length === 0 ? <div className="text-gray-600">No products found.</div> : null}
          {products.map((product) => (
            <ProductEditor key={product.id} product={product} onSave={saveProduct} onArchiveToggle={toggleArchiveProduct} saving={saving} />
          ))}
        </div>
      </div>
    </AdminLayout>
  );
};
