import React, { useEffect, useMemo, useState } from 'react';
import { Megaphone, RefreshCw } from 'lucide-react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { supabase } from '../../lib/supabase';
import {
  adminAnnouncementDelete,
  adminAnnouncementsList,
  adminAnnouncementSave,
  type PlatformAnnouncement,
  type PlatformAnnouncementSaveInput,
} from '../../lib/platformClient';

const toFriendlyError = (err: unknown, fallback: string): string => {
  const msg = err instanceof Error ? err.message : '';
  if (/401|unauthorized|invalid jwt/i.test(msg)) return 'Session expired. Please sign in again and retry.';
  if (/403|forbidden/i.test(msg)) return 'Admin access is required for this action.';
  if (/429|rate limit/i.test(msg)) return 'Too many requests. Please wait a moment and retry.';
  return fallback;
};

const emptyDraft: PlatformAnnouncementSaveInput = {
  title: '',
  body: '',
  cta_label: '',
  cta_href: '',
  audience: 'all',
  is_active: true,
  starts_at: null,
  ends_at: null,
  priority: 100,
  metadata: {},
};

const toLocalDateTime = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

const fromLocalDateTime = (value: string): string | null => {
  const raw = value.trim();
  if (!raw) return null;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
};

export const AdminAnnouncementsPage: React.FC = () => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<PlatformAnnouncement[]>([]);
  const [draft, setDraft] = useState<PlatformAnnouncementSaveInput>(emptyDraft);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setAccessToken(session?.access_token ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const getValidToken = async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) return data.session.access_token;
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed.session?.access_token) return null;
    return refreshed.session.access_token;
  };

  const load = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getValidToken();
      if (!token) {
        setError('Session expired. Please sign in again.');
        return;
      }
      const res = await adminAnnouncementsList(token, { limit: 300 });
      setAnnouncements(res.announcements ?? []);
    } catch (e) {
      setError(toFriendlyError(e, 'Failed to load announcements.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const save = async () => {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getValidToken();
      if (!token) {
        setError('Session expired. Please sign in again.');
        return;
      }

      const payload: PlatformAnnouncementSaveInput = {
        id: draft.id,
        title: String(draft.title ?? '').trim(),
        body: String(draft.body ?? '').trim(),
        cta_label: String(draft.cta_label ?? '').trim() || null,
        cta_href: String(draft.cta_href ?? '').trim() || null,
        audience: draft.audience ?? 'all',
        is_active: Boolean(draft.is_active ?? true),
        starts_at: fromLocalDateTime(String(draft.starts_at ?? '')),
        ends_at: fromLocalDateTime(String(draft.ends_at ?? '')),
        priority: Number(draft.priority ?? 100),
        metadata: (draft.metadata as Record<string, unknown> | null) ?? {},
      };

      if (!payload.title || !payload.body) {
        setError('Title and body are required.');
        return;
      }

      await adminAnnouncementSave(token, payload);
      setDraft(emptyDraft);
      setSuccess('Announcement saved and available to users.');
      await load();
    } catch (e) {
      setError(toFriendlyError(e, 'Failed to save announcement.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getValidToken();
      if (!token) {
        setError('Session expired. Please sign in again.');
        return;
      }
      await adminAnnouncementDelete(token, id);
      if (draft.id === id) setDraft(emptyDraft);
      setSuccess('Announcement deleted.');
      await load();
    } catch (e) {
      setError(toFriendlyError(e, 'Failed to delete announcement.'));
    } finally {
      setSaving(false);
    }
  };

  const sortedAnnouncements = useMemo(
    () =>
      [...announcements].sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return Date.parse(b.created_at) - Date.parse(a.created_at);
      }),
    [announcements],
  );

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
            <p className="text-sm text-gray-600">Send announcements that appear in every user&apos;s Updates center.</p>
          </div>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        {error ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div> : null}
        {success ? <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3">{success}</div> : null}
        {loading ? <div className="text-sm text-gray-500">Loading announcements...</div> : null}

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <section className="xl:col-span-5 bg-white border border-gray-200 rounded-2xl p-4 space-y-4">
            <div className="text-sm font-semibold text-gray-900">{draft.id ? 'Edit announcement' : 'New announcement'}</div>

            <div>
              <label className="text-xs font-semibold text-gray-600">Title</label>
              <input
                value={String(draft.title ?? '')}
                onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
                className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2"
                placeholder="System maintenance notice"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600">Body</label>
              <textarea
                value={String(draft.body ?? '')}
                onChange={(e) => setDraft((prev) => ({ ...prev, body: e.target.value }))}
                className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2 min-h-[140px]"
                placeholder="Write a clear and short announcement for users."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-600">CTA label (optional)</label>
                <input
                  value={String(draft.cta_label ?? '')}
                  onChange={(e) => setDraft((prev) => ({ ...prev, cta_label: e.target.value }))}
                  className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2"
                  placeholder="Open pricing"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">CTA URL (optional)</label>
                <input
                  value={String(draft.cta_href ?? '')}
                  onChange={(e) => setDraft((prev) => ({ ...prev, cta_href: e.target.value }))}
                  className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2"
                  placeholder="/pricing"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Audience</label>
                <select
                  value={draft.audience ?? 'all'}
                  onChange={(e) => setDraft((prev) => ({ ...prev, audience: e.target.value as 'all' | 'authenticated' }))}
                  className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2"
                >
                  <option value="all">All visitors</option>
                  <option value="authenticated">Signed-in users</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Priority (lower appears first)</label>
                <input
                  type="number"
                  value={Number(draft.priority ?? 100)}
                  onChange={(e) => setDraft((prev) => ({ ...prev, priority: Number(e.target.value || 100) }))}
                  className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Starts at (optional)</label>
                <input
                  type="datetime-local"
                  value={toLocalDateTime(String(draft.starts_at ?? ''))}
                  onChange={(e) => setDraft((prev) => ({ ...prev, starts_at: e.target.value }))}
                  className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Ends at (optional)</label>
                <input
                  type="datetime-local"
                  value={toLocalDateTime(String(draft.ends_at ?? ''))}
                  onChange={(e) => setDraft((prev) => ({ ...prev, ends_at: e.target.value }))}
                  className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2"
                />
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={Boolean(draft.is_active ?? true)}
                onChange={(e) => setDraft((prev) => ({ ...prev, is_active: e.target.checked }))}
              />
              Active
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-gray-900 text-white font-semibold disabled:bg-gray-300"
              >
                {saving ? 'Saving...' : draft.id ? 'Update announcement' : 'Publish announcement'}
              </button>
              {draft.id ? (
                <button
                  onClick={() => setDraft(emptyDraft)}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold"
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </section>

          <section className="xl:col-span-7 bg-white border border-gray-200 rounded-2xl p-4 space-y-4">
            <div className="text-sm font-semibold text-gray-900">Published announcements</div>
            <div className="space-y-3 max-h-[760px] overflow-y-auto pr-1">
              {sortedAnnouncements.map((item) => (
                <article key={item.id} className="rounded-xl border border-gray-200 p-3 bg-gray-50/60">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{item.title}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {item.audience} • priority {item.priority} • {item.is_active ? 'active' : 'inactive'}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-1">
                        Created {new Date(item.created_at).toLocaleString()}
                        {item.starts_at ? ` • starts ${new Date(item.starts_at).toLocaleString()}` : ''}
                        {item.ends_at ? ` • ends ${new Date(item.ends_at).toLocaleString()}` : ''}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          setDraft({
                            id: item.id,
                            title: item.title,
                            body: item.body,
                            cta_label: item.cta_label ?? '',
                            cta_href: item.cta_href ?? '',
                            audience: item.audience,
                            is_active: item.is_active,
                            starts_at: item.starts_at,
                            ends_at: item.ends_at,
                            priority: item.priority,
                            metadata: item.metadata ?? {},
                          })
                        }
                        className="px-2 py-1 rounded-lg border border-gray-200 text-xs font-semibold"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => void remove(item.id)}
                        className="px-2 py-1 rounded-lg border border-red-200 text-red-700 text-xs font-semibold"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{item.body}</p>
                  {item.cta_label && item.cta_href ? (
                    <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-700">
                      <Megaphone size={12} />
                      CTA: {item.cta_label} -&gt; {item.cta_href}
                    </div>
                  ) : null}
                </article>
              ))}
              {!loading && sortedAnnouncements.length === 0 ? (
                <div className="text-sm text-gray-500">No announcements yet.</div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </AdminLayout>
  );
};
