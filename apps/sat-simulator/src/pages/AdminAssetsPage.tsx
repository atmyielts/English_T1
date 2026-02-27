import React, { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '../components/admin/AdminLayout';
import { adminAssetsList, adminUploadAsset, type AdminAssetRow } from '../lib/platformClient';
import { useAccess } from '../lib/useAccess';

const formatBytes = (n: number | null): string => {
  if (n == null || !Number.isFinite(n)) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = Math.max(0, n);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

export const AdminAssetsPage: React.FC = () => {
  const { accessToken } = useAccess();
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assets, setAssets] = useState<AdminAssetRow[]>([]);

  const [kind, setKind] = useState<'audio' | 'image' | 'all'>('audio');
  const [query, setQuery] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploadKind, setUploadKind] = useState<'audio' | 'image'>('audio');

  const load = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);

    try {
      const res = await adminAssetsList(accessToken, {
        kind: kind === 'all' ? undefined : kind,
        q: query.trim() || undefined,
        limit: 50,
        signed: true,
      });
      setAssets(res.assets ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load assets');
      setAssets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, kind]);

  const filtered = useMemo(() => {
    if (!query.trim()) return assets;
    const q = query.trim().toLowerCase();
    return assets.filter((a) => (a.filename ?? '').toLowerCase().includes(q) || `${a.bucket}/${a.path}`.toLowerCase().includes(q));
  }, [assets, query]);

  const upload = async () => {
    if (!file || !accessToken) return;
    setUploading(true);
    setError(null);

    try {
      await adminUploadAsset(accessToken, file, { kind: uploadKind });
      setFile(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const snippetFor = (a: AdminAssetRow): string => {
    if (a.kind === 'audio') {
      return JSON.stringify(
        {
          type: 'audio',
          data: {
            storage: { bucket: a.bucket, path: a.path },
            duration_seconds: 60,
            play_once: true,
          },
          display_order: 1,
        },
        null,
        2,
      );
    }

    // For images, you can reference storage and the server will inject a signed URL at runtime.
    return JSON.stringify(
      {
        type: 'image',
        data: {
          storage: { bucket: a.bucket, path: a.path },
          alt: a.filename ?? 'Image',
        },
        display_order: 1,
      },
      null,
      2,
    );
  };

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Assets Library</h2>
            <p className="text-sm text-gray-500 mt-1">Upload and reuse audio/images across tests. Files are stored privately in Supabase Storage.</p>
          </div>
        </div>

        {error ? (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
        ) : null}

        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <div className="text-sm font-semibold text-gray-900 mb-2">Filter kind</div>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                value={kind}
                onChange={(e) => setKind(e.target.value as any)}
              >
                <option value="audio">Audio</option>
                <option value="image">Image</option>
                <option value="all">All</option>
              </select>
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900 mb-2">Search</div>
              <input
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="filename or bucket/path"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 font-semibold"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="text-sm font-semibold text-gray-900">Upload</div>
              <div className="text-xs text-gray-500 mt-1">Uploaded assets become available in the library immediately.</div>
            </div>
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1">Kind</div>
                <select
                  className="px-3 py-2 border border-gray-300 rounded-lg bg-white"
                  value={uploadKind}
                  onChange={(e) => setUploadKind(e.target.value as any)}
                >
                  <option value="audio">Audio</option>
                  <option value="image">Image</option>
                </select>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1">File</div>
                <input
                  type="file"
                  accept={uploadKind === 'audio' ? 'audio/*' : 'image/*'}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <button
                type="button"
                onClick={() => void upload()}
                disabled={!file || uploading}
                className="px-5 py-2.5 rounded-lg bg-gray-900 hover:bg-black disabled:bg-gray-300 text-white font-semibold"
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>

          {file ? <div className="mt-3 text-xs text-gray-600">Selected: <span className="font-mono">{file.name}</span></div> : null}
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-900">Assets</div>
            <div className="text-xs text-gray-500">
              {loading ? 'Loading...' : `${filtered.length} shown`}
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {filtered.map((a) => (
              <div key={a.id} className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="space-y-2">
                  <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">{a.kind}</div>
                  <div className="font-semibold text-gray-900">{a.filename ?? '(no filename)'}</div>
                  <div className="text-xs text-gray-500 font-mono break-all">
                    {a.bucket}/{a.path}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatBytes(a.size_bytes)} {a.mime_type ? `| ${a.mime_type}` : ''}
                  </div>
                </div>

                <div>
                  {a.kind === 'audio' && a.signed_url ? (
                    <audio src={a.signed_url} controls preload="none" className="w-full" />
                  ) : a.kind === 'image' && a.signed_url ? (
                    <img
                      src={a.signed_url}
                      alt={a.filename ?? 'Asset preview'}
                      className="w-full max-h-56 object-contain border border-gray-200 rounded bg-white"
                      loading="lazy"
                    />
                  ) : (
                    <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded p-4">
                      Preview unavailable (no signed URL).
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-xs font-semibold tracking-wider uppercase text-gray-500 mb-2">JSON snippet</div>
                  <pre className="text-xs font-mono p-3 bg-gray-50 border border-gray-200 rounded-xl overflow-x-auto">
                    {snippetFor(a)}
                  </pre>
                </div>
              </div>
            ))}

            {filtered.length === 0 && !loading ? (
              <div className="p-6 text-sm text-gray-600">No assets found.</div>
            ) : null}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};
