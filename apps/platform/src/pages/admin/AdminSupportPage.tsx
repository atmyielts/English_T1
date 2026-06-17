import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Mail, MessageCircle, Send } from 'lucide-react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { supabase } from '../../lib/supabase';
import {
  adminSupportLinkDelete,
  adminSupportLinksList,
  adminSupportLinkSave,
  adminSupportMessageReply,
  adminSupportMessagesList,
  adminSupportMessageUpdate,
  type SupportLink,
  type SupportMessage,
  type SupportMessageReply,
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

type ReplyChannel = 'auto' | 'telegram' | 'email' | 'internal';

const placeholderEmails = new Set(['telegram-lead@schood.online', 'telegram@schood.online']);

const isUsableEmail = (email: string | null | undefined): boolean => {
  const value = String(email ?? '').trim().toLowerCase();
  return /.+@.+\..+/.test(value) && !placeholderEmails.has(value);
};

const metadataObject = (metadata: unknown): Record<string, unknown> => {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) return metadata as Record<string, unknown>;
  return {};
};

const telegramTarget = (message: SupportMessage): string | null => {
  const meta = metadataObject(message.metadata);
  const context = metadataObject(meta.telegram_context);
  const candidates = [meta.telegram_chat_id, meta.telegram_user_id, context.telegram_user_id, context.id, message.telegram];
  for (const candidate of candidates) {
    const value = String(candidate ?? '').trim();
    if (/^-?\d{5,}$/.test(value)) return value;
  }
  return null;
};

const replyTone = (reply: SupportMessageReply): string => {
  if (reply.delivery_status === 'failed') return 'border-red-200 bg-red-50 text-red-900';
  if (reply.delivery_channel === 'telegram') return 'border-sky-200 bg-sky-50 text-sky-950';
  if (reply.delivery_channel === 'email') return 'border-amber-200 bg-amber-50 text-amber-950';
  return 'border-gray-200 bg-white text-gray-900';
};

const SupportMessageCard: React.FC<{
  message: SupportMessage;
  saving: boolean;
  onStatus: (id: string, status: SupportMessage['status']) => void;
  onNote: (id: string, note: string | null) => void;
  onReply: (id: string, body: string, channel: ReplyChannel) => Promise<void>;
}> = ({ message, saving, onStatus, onNote, onReply }) => {
  const [replyBody, setReplyBody] = useState('');
  const [channel, setChannel] = useState<ReplyChannel>('auto');
  const [localError, setLocalError] = useState<string | null>(null);
  const meta = metadataObject(message.metadata);
  const tgTarget = telegramTarget(message);
  const hasEmail = isUsableEmail(message.email);
  const replies = message.replies ?? [];

  const submitReply = async () => {
    setLocalError(null);
    if (!replyBody.trim()) {
      setLocalError('Write a reply first.');
      return;
    }
    try {
      await onReply(message.id, replyBody.trim(), channel);
      setReplyBody('');
    } catch (err) {
      setLocalError(toFriendlyError(err, 'Failed to send reply.'));
    }
  };

  const mailto = hasEmail
    ? `mailto:${encodeURIComponent(message.email)}?subject=${encodeURIComponent(message.subject ? `Re: ${message.subject}` : 'Re: Schood support')}`
    : null;
  const telegramLink = message.telegram?.startsWith('@') ? `https://t.me/${message.telegram.slice(1)}` : null;

  return (
    <article className="rounded-xl border border-gray-200 p-3 bg-gray-50/40">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-gray-900">{message.subject || 'No subject'}</div>
            <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-600">
              {message.source}{message.service_slug ? ` / ${message.service_slug}` : ''}
            </span>
            {tgTarget ? (
              <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                Telegram reply ready
              </span>
            ) : hasEmail ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                Email handoff
              </span>
            ) : null}
          </div>
          <div className="text-xs text-gray-600 mt-1">
            {message.name} - {hasEmail ? message.email : message.email}
            {message.telegram ? ` - ${message.telegram}` : ''}
          </div>
          <div className="text-[11px] text-gray-500 mt-1">
            {new Date(message.created_at).toLocaleString()} - {String(meta.role ?? meta.contact_channel ?? 'support')}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {telegramLink ? (
              <a href={telegramLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-white px-2 py-1 font-semibold text-sky-700">
                <MessageCircle size={13} /> Open Telegram <ExternalLink size={12} />
              </a>
            ) : null}
            {mailto ? (
              <a href={mailto} className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-2 py-1 font-semibold text-amber-700">
                <Mail size={13} /> Open email <ExternalLink size={12} />
              </a>
            ) : null}
          </div>
        </div>
        <select
          value={message.status}
          onChange={(e) => onStatus(message.id, e.target.value as SupportMessage['status'])}
          className="border border-gray-200 rounded-lg px-2 py-1 text-xs"
        >
          <option value="new">new</option>
          <option value="in_progress">in_progress</option>
          <option value="resolved">resolved</option>
          <option value="closed">closed</option>
        </select>
      </div>

      <p className="mt-2 text-sm text-gray-800 whitespace-pre-wrap">{message.message}</p>

      {replies.length > 0 ? (
        <div className="mt-3 space-y-2">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">Thread replies</div>
          {replies.map((reply) => {
            const replyMeta = metadataObject(reply.metadata);
            const mailtoUrl = typeof replyMeta.mailto_url === 'string' ? replyMeta.mailto_url : null;
            return (
              <div key={reply.id} className={`rounded-lg border px-3 py-2 text-xs ${replyTone(reply)}`}>
                <div className="flex flex-wrap items-center gap-2 font-semibold">
                  <span>{reply.delivery_channel}</span>
                  <span>{reply.delivery_status}</span>
                  <span className="text-gray-500">{new Date(reply.created_at).toLocaleString()}</span>
                  {mailtoUrl ? (
                    <a href={mailtoUrl} className="ml-auto inline-flex items-center gap-1 underline">
                      Open email draft <ExternalLink size={12} />
                    </a>
                  ) : null}
                </div>
                <div className="mt-1 whitespace-pre-wrap">{reply.body}</div>
                {reply.delivery_error ? <div className="mt-1 font-semibold text-red-700">{reply.delivery_error}</div> : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <select value={channel} onChange={(e) => setChannel(e.target.value as ReplyChannel)} className="border border-gray-200 rounded-lg px-2 py-2 text-xs">
            <option value="auto">Auto route</option>
            <option value="telegram" disabled={!tgTarget}>Telegram</option>
            <option value="email" disabled={!hasEmail}>Email handoff</option>
            <option value="internal">Internal note</option>
          </select>
          <button
            type="button"
            onClick={() => void submitReply()}
            disabled={saving || !replyBody.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:bg-gray-300"
          >
            <Send size={13} /> Reply
          </button>
        </div>
        <textarea
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          placeholder={tgTarget ? 'Reply in the same Telegram chat...' : hasEmail ? 'Save reply and open an email draft...' : 'Save an internal note...'}
          className="mt-2 w-full border border-gray-200 rounded-lg px-2 py-2 text-xs min-h-[86px]"
        />
        {localError ? <div className="mt-2 text-xs font-semibold text-red-700">{localError}</div> : null}
      </div>

      <div className="mt-3">
        <label className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">Admin note</label>
        <textarea
          defaultValue={message.admin_note ?? ''}
          onBlur={(e) => {
            const next = e.currentTarget.value;
            if ((message.admin_note ?? '') === next) return;
            onNote(message.id, next || null);
          }}
          className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1 text-xs min-h-[68px]"
        />
      </div>
    </article>
  );
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
      [m.name, m.email, m.telegram ?? '', m.subject ?? '', m.message, m.source, m.service_slug ?? ''].some((v) =>
        String(v).toLowerCase().includes(q),
      ),
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

  const sendReply = async (id: string, body: string, channel: ReplyChannel) => {
    if (!accessToken) throw new Error('Your session expired. Please sign in again.');
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getValidToken();
      if (!token) {
        setError('Your session expired. Please sign in again.');
        return;
      }
      const result = await adminSupportMessageReply(token, { message_id: id, body, channel });
      if (result.mailto_url) {
        window.location.href = result.mailto_url;
        setSuccess('Reply saved and email draft opened.');
      } else if (result.reply?.delivery_channel === 'telegram' && result.reply.delivery_status === 'sent') {
        setSuccess('Reply sent to the same Telegram chat.');
      } else if (result.reply?.delivery_channel === 'internal') {
        setSuccess('Internal support note saved.');
      } else if (result.reply?.delivery_status === 'failed') {
        const message = result.reply.delivery_error || 'Reply saved, but delivery failed.';
        setError(message);
        throw new Error(message);
      } else {
        setSuccess('Reply saved.');
      }
      await load();
    } catch (e) {
      setError(toFriendlyError(e, 'Failed to send reply.'));
      throw e;
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
                <div className="text-xs text-gray-600">Messages from the contact page and Telegram Mini Apps.</div>
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
              placeholder="Search by name, email, Telegram, source, subject, or message"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            />

            <div className="space-y-3 max-h-[620px] overflow-y-auto pr-1">
              {filteredMessages.map((m) => (
                <SupportMessageCard
                  key={m.id}
                  message={m}
                  saving={saving}
                  onStatus={(id, status) => void updateMessage(id, { status })}
                  onNote={(id, note) => void updateMessage(id, { admin_note: note })}
                  onReply={sendReply}
                />
              ))}
              {!loading && filteredMessages.length === 0 ? <div className="text-sm text-gray-500">No messages found.</div> : null}
            </div>
          </section>
        </div>
      </div>
    </AdminLayout>
  );
};
