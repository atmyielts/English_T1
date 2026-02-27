import React, { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { supabase } from '../../lib/supabase';
import {
  adminSupportLinkDelete,
  adminSupportLinksList,
  adminSupportLinkSave,
  adminSupportMessagesList,
  adminSupportMessageUpdate,
  type SupportLink,
  type SupportMessage,
} from '../../lib/platformClient';

const defaultLink: Partial<SupportLink> = {
  label: '',
  type: 'email',
  value: '',
  is_active: true,
  display_order: 100,
  metadata: {},
};

const toFriendlyError = (err: unknown, fallback: string): string => {
  const msg = err instanceof Error ? err.message : '';
  if (/401|unauthorized|invalid jwt/i.test(msg)) return 'Your session expired. Please sign in again and retry.';
  if (/403|forbidden/i.test(msg)) return 'Admin access is required for this action.';
  if (/429|rate limit/i.test(msg)) return 'Too many requests. Please wait a moment and retry.';
  return fallback;
};

export const AdminSupportPage: React.FC = () => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [links, setLinks] = useState<SupportLink[]>([]);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Partial<SupportLink>>(defaultLink);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setAccessToken(session?.access_token ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const getValidToken = async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session?.access_token) return null;

    const { data: userData, error: userError } = await supabase.auth.getUser(session.access_token);
    if (!userError && userData?.user) return session.access_token;

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
        setError('Your session expired. Please sign in again.');
        return;
      }
      const [linksRes, messagesRes] = await Promise.all([
        adminSupportLinksList(token),
        adminSupportMessagesList(token, { status: statusFilter, query, limit: 200 }),
      ]);
      setLinks(linksRes.links ?? []);
      setMessages(messagesRes.messages ?? []);
    } catch (e) {
      setError(toFriendlyError(e, 'Failed to load support data.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, statusFilter]);

  const filteredMessages = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) =>
      [m.name, m.email, m.subject ?? '', m.message, m.service_slug ?? ''].some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [messages, query]);

  const saveLink = async () => {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getValidToken();
      if (!token) {
        setError('Your session expired. Please sign in again.');
        return;
      }
      await adminSupportLinkSave(token, {
        id: draft.id,
        label: String(draft.label ?? ''),
        type: draft.type as any,
        value: String(draft.value ?? ''),
        is_active: Boolean(draft.is_active),
        display_order: Number(draft.display_order ?? 100),
        metadata: (draft.metadata as any) ?? {},
      });
      setDraft(defaultLink);
      setSuccess('Support link saved.');
      await load();
    } catch (e) {
      setError(toFriendlyError(e, 'Failed to save link.'));
    } finally {
      setSaving(false);
    }
  };

  const removeLink = async (id: string) => {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getValidToken();
      if (!token) {
        setError('Your session expired. Please sign in again.');
        return;
      }
      await adminSupportLinkDelete(token, id);
      if (draft.id === id) setDraft(defaultLink);
      setSuccess('Support link deleted.');
      await load();
    } catch (e) {
      setError(toFriendlyError(e, 'Failed to delete link.'));
    } finally {
      setSaving(false);
    }
  };

  const updateMessage = async (id: string, patch: { status?: SupportMessage['status']; admin_note?: string | null }) => {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getValidToken();
      if (!token) {
        setError('Your session expired. Please sign in again.');
        return;
      }
      await adminSupportMessageUpdate(token, id, patch);
      await load();
    } catch (e) {
      setError(toFriendlyError(e, 'Failed to update message.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Support Center</h1>
          <p className="text-sm text-gray-600">Manage public contact links and inbox messages.</p>
        </div>

        {error ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div> : null}
        {success ? <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3">{success}</div> : null}

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <section className="xl:col-span-5 bg-white border border-gray-200 rounded-2xl p-4 space-y-4">
            <div className="text-sm font-semibold text-gray-900">Contact links</div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-gray-600">Label</label>
                <input
                  value={String(draft.label ?? '')}
                  onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))}
                  className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2"
                  placeholder="Email support"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Type</label>
                <select
                  value={String(draft.type ?? 'email')}
                  onChange={(e) => setDraft((prev) => ({ ...prev, type: e.target.value as SupportLink['type'] }))}
                  className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2"
                >
                  <option value="email">Email</option>
                  <option value="telegram">Telegram</option>
                  <option value="url">URL</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Display order</label>
                <input
                  type="number"
                  value={Number(draft.display_order ?? 100)}
                  onChange={(e) => setDraft((prev) => ({ ...prev, display_order: Number(e.target.value) }))}
                  className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-gray-600">Value</label>
                <input
                  value={String(draft.value ?? '')}
                  onChange={(e) => setDraft((prev) => ({ ...prev, value: e.target.value }))}
                  className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2"
                  placeholder="support@schood.com or https://t.me/schood_support"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700 md:col-span-2">
                <input
                  type="checkbox"
                  checked={Boolean(draft.is_active ?? true)}
                  onChange={(e) => setDraft((prev) => ({ ...prev, is_active: e.target.checked }))}
                />
                Active
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={saveLink}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-gray-900 text-white font-semibold disabled:bg-gray-300"
              >
                {saving ? 'Saving...' : draft.id ? 'Update link' : 'Add link'}
              </button>
              {draft.id ? (
                <button
                  onClick={() => setDraft(defaultLink)}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold"
                >
                  Cancel edit
                </button>
              ) : null}
            </div>

            <div className="border-t border-gray-100 pt-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Existing links</div>
              <div className="mt-3 space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {links.map((link) => (
                  <div key={link.id} className="rounded-xl border border-gray-200 p-3 bg-gray-50/50">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{link.label}</div>
                        <div className="text-xs text-gray-600 mt-1">{link.type} ? {link.value}</div>
                        <div className="text-[11px] text-gray-500 mt-1">order {link.display_order} ? {link.is_active ? 'active' : 'inactive'}</div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setDraft(link)}
                          className="px-2 py-1 rounded-lg border border-gray-200 text-xs font-semibold"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => void removeLink(link.id)}
                          className="px-2 py-1 rounded-lg border border-red-200 text-red-700 text-xs font-semibold"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {!loading && links.length === 0 ? <div className="text-sm text-gray-500">No links yet.</div> : null}
              </div>
            </div>
          </section>

          <section className="xl:col-span-7 bg-white border border-gray-200 rounded-2xl p-4 space-y-4">
            <div className="flex flex-col md:flex-row md:items-end gap-3 md:justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-900">Inbox</div>
                <div className="text-xs text-gray-600">Messages submitted from the contact page.</div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
                >
                  <option value="all">All statuses</option>
                  <option value="new">New</option>
                  <option value="in_progress">In progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
                <button onClick={() => void load()} className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold">
                  Refresh
                </button>
              </div>
            </div>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, email, subject, or message"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            />

            <div className="space-y-3 max-h-[620px] overflow-y-auto pr-1">
              {filteredMessages.map((m) => (
                <article key={m.id} className="rounded-xl border border-gray-200 p-3 bg-gray-50/40">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{m.subject || 'No subject'}</div>
                      <div className="text-xs text-gray-600 mt-1">
                        {m.name} ? {m.email}{m.telegram ? ` ? ${m.telegram}` : ''}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-1">
                        {new Date(m.created_at).toLocaleString()} ? {m.source}{m.service_slug ? ` ? ${m.service_slug}` : ''}
                      </div>
                    </div>
                    <select
                      value={m.status}
                      onChange={(e) => void updateMessage(m.id, { status: e.target.value as SupportMessage['status'] })}
                      className="border border-gray-200 rounded-lg px-2 py-1 text-xs"
                    >
                      <option value="new">new</option>
                      <option value="in_progress">in_progress</option>
                      <option value="resolved">resolved</option>
                      <option value="closed">closed</option>
                    </select>
                  </div>

                  <p className="mt-2 text-sm text-gray-800 whitespace-pre-wrap">{m.message}</p>

                  <div className="mt-3">
                    <label className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">Admin note</label>
                    <textarea
                      defaultValue={m.admin_note ?? ''}
                      onBlur={(e) => {
                        const next = e.currentTarget.value;
                        if ((m.admin_note ?? '') === next) return;
                        void updateMessage(m.id, { admin_note: next || null });
                      }}
                      className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1 text-xs min-h-[68px]"
                    />
                  </div>
                </article>
              ))}
              {!loading && filteredMessages.length === 0 ? <div className="text-sm text-gray-500">No messages found.</div> : null}
            </div>
          </section>
        </div>
      </div>
    </AdminLayout>
  );
};
