import React, { useState } from 'react';
import { MessagesSquare, Send, ChevronUp, ChevronDown } from 'lucide-react';
import { playbookSectionAsk, playbookSectionThreadGet, type PlaybookThreadMessage } from '../lib/api';

interface Props {
  accessToken: string | null;
  pageSlug: string;
  sectionId: string;
  sectionHeading?: string | null;
}

export const PlaybookSectionCoach: React.FC<Props> = ({ accessToken, pageSlug, sectionId, sectionHeading }) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<PlaybookThreadMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ensureLoaded = async () => {
    if (loaded || !accessToken) return;
    try {
      const res = await playbookSectionThreadGet(accessToken, pageSlug, sectionId);
      setMessages(res.messages);
    } catch {
      // existing thread is optional
    } finally {
      setLoaded(true);
    }
  };

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) await ensureLoaded();
  };

  const send = async () => {
    const trimmed = draft.trim();
    if (!accessToken || !trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await playbookSectionAsk(accessToken, pageSlug, sectionId, trimmed);
      setMessages(res.messages);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not ask');
    } finally {
      setBusy(false);
    }
  };

  if (!accessToken) return null;

  return (
    <div style={{ margin: '12px 0 0' }}>
      <button
        type="button"
        onClick={() => void toggle()}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          fontSize: 12.5,
          border: '1px solid color-mix(in srgb, #0e4955 30%, transparent)',
          background: 'color-mix(in srgb, #0e4955 6%, white)',
          color: '#0e4955',
          borderRadius: 20,
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        <MessagesSquare size={13} />
        Ask about {sectionHeading ? `"${sectionHeading.slice(0, 32)}"` : 'this section'}
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {open ? (
        <div
          style={{
            marginTop: 10,
            padding: 14,
            background: 'color-mix(in srgb, #0e4955 3%, white)',
            border: '1px solid #e8e2d0',
            borderRadius: 10,
          }}
        >
          {messages.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: '#7a7263', fontStyle: 'italic' }}>
              Ask a follow-up about this section — the coach answers using only this section's text.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
              {messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    padding: '8px 12px',
                    background: m.role === 'assistant' ? '#fff' : 'color-mix(in srgb, #0e4955 8%, white)',
                    border: '1px solid #e8e2d0',
                    borderRadius: 8,
                    fontSize: 13.5,
                    lineHeight: 1.5,
                  }}
                >
                  <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: m.role === 'assistant' ? '#0e4955' : '#7a7263', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    {m.role === 'assistant' ? 'Coach' : 'You'}
                  </p>
                  <p style={{ margin: 0, color: '#1a1814' }}>{m.content}</p>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="What does this mean?"
              disabled={busy}
              style={{
                flex: 1,
                padding: '8px 10px',
                fontSize: 13.5,
                border: '1px solid #d4cdb9',
                borderRadius: 6,
                background: '#fff',
              }}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || !draft.trim()}
              className="button button-primary"
              style={{ padding: '8px 14px', fontSize: 13 }}
            >
              {busy ? '…' : <Send size={14} />}
            </button>
          </div>
          {error ? <p style={{ color: '#9b2c2c', margin: '8px 0 0', fontSize: 12.5 }}>{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
};
