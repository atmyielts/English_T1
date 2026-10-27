import React, { useState } from 'react';
import { MessagesSquare, Send, ChevronUp, ChevronDown, RefreshCw } from 'lucide-react';
import { apiErrorStatus, playbookSectionAsk, playbookSectionThreadGet, type PlaybookThreadMessage } from '../lib/api';
import { useT, type Translate } from '../i18n';

interface Props {
  accessToken: string | null;
  pageSlug: string;
  sectionId: string;
  sectionHeading?: string | null;
}

const errorMessage = (t: Translate, err: unknown, fallback: Parameters<Translate>[0]): string => {
  const status = apiErrorStatus(err);
  if (status === 401) return t('error.signedOut');
  if (status === 403) return t('error.premiumRequired');
  return t(fallback);
};

export const PlaybookSectionCoach: React.FC<Props> = ({ accessToken, pageSlug, sectionId, sectionHeading }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<PlaybookThreadMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadThread = async () => {
    if (!accessToken) return;
    setLoadingThread(true);
    setThreadError(null);
    try {
      const res = await playbookSectionThreadGet(accessToken, pageSlug, sectionId);
      setMessages(Array.isArray(res.messages) ? res.messages : []);
      setLoaded(true);
    } catch (err) {
      // Say so instead of silently showing an empty thread.
      setThreadError(errorMessage(t, err, 'coach.threadError'));
    } finally {
      setLoadingThread(false);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded) void loadThread();
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
      setLoaded(true);
    } catch (err) {
      setError(errorMessage(t, err, 'coach.askError'));
    } finally {
      setBusy(false);
    }
  };

  if (!accessToken) return null;

  return (
    <div className="section-coach">
      <button type="button" className="section-coach-toggle" onClick={toggle} aria-expanded={open}>
        <MessagesSquare size={13} />
        {sectionHeading ? t('coach.askAbout', { heading: sectionHeading.slice(0, 32) }) : t('coach.askThis')}
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {open ? (
        <div className="section-coach-panel">
          {loadingThread ? <p className="muted">{t('coach.loadingThread')}</p> : null}
          {threadError ? (
            <p className="inline-error" role="alert">
              {threadError}{' '}
              <button type="button" className="link-button" onClick={() => void loadThread()}>
                <RefreshCw size={12} /> {t('common.retry')}
              </button>
            </p>
          ) : null}
          {!loadingThread && !threadError && messages.length === 0 ? (
            <p className="muted coach-empty">{t('coach.empty')}</p>
          ) : null}
          {messages.length > 0 ? (
            <div className="coach-messages">
              {messages.map((m, i) => (
                <div key={i} className={`coach-message ${m.role === 'assistant' ? 'is-coach' : 'is-you'}`}>
                  <p className="coach-role">{m.role === 'assistant' ? t('coach.coach') : t('coach.you')}</p>
                  <p>{m.content}</p>
                </div>
              ))}
            </div>
          ) : null}
          <div className="coach-compose">
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
              placeholder={t('coach.placeholder')}
              aria-label={t('coach.placeholder')}
              disabled={busy}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || !draft.trim()}
              className="button button-primary"
              aria-label={t('coach.send')}
            >
              {busy ? '…' : <Send size={14} />}
            </button>
          </div>
          {error ? <p className="inline-error" role="alert">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
};
