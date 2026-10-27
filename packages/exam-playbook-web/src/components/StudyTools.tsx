import { CheckCircle2, Circle, Highlighter, MessagesSquare, Send, Sparkles, X } from 'lucide-react';
import { useEffect, useState, type RefObject } from 'react';
import { useT } from '../i18n';
import type { Note, Section, ThreadMessage } from '../lib/api';
import { usePlaybook } from '../lib/context';
import { useErrorText } from './ui';

/** "Ask the coach" for one section. AI answers come from the free model and are labelled. */
export const SectionCoach = ({ slug, section }: { slug: string; section: Section }) => {
  const t = useT();
  const errorText = useErrorText();
  const { api, access } = usePlaybook();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const token = access.token;
  if (!token) return null;

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded) {
      try {
        setMessages((await api.sectionThread(slug, section.id, token)).messages ?? []);
      } catch {
        /* an empty thread is fine */
      }
      setLoaded(true);
    }
  };

  const send = async () => {
    const question = draft.trim();
    if (!question) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await api.sectionAsk(slug, section.id, question, token);
      if (!res.ok) setNotice(t('coach.unavailable'));
      else {
        setMessages(res.messages);
        setDraft('');
      }
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="coach">
      <button type="button" className="tool-button" aria-expanded={open} onClick={() => void toggle()}>
        <MessagesSquare size={14} aria-hidden="true" /> {t('coach.ask')}
      </button>
      {open ? (
        <div className="coach-panel">
          <p className="ai-label"><Sparkles size={13} aria-hidden="true" /> {t('coach.label')}</p>
          {messages.length === 0 ? <p className="muted-note">{t('coach.empty')}</p> : (
            <div className="coach-thread">
              {messages.map((m, i) => (
                <div key={i} className={`coach-msg ${m.role}`}>
                  <span>{m.role === 'assistant' ? t('coach.coach') : t('coach.you')}</span>
                  <p>{m.content}</p>
                </div>
              ))}
            </div>
          )}
          <form className="coach-form" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <label className="visually-hidden" htmlFor={`coach-${section.id}`}>{t('coach.placeholder')}</label>
            <input id={`coach-${section.id}`} value={draft} maxLength={1000} onChange={(e) => setDraft(e.target.value)} placeholder={t('coach.placeholder')} disabled={busy} />
            <button type="submit" className="btn solid compact" disabled={busy || !draft.trim()} aria-label={t('coach.send')}>
              {busy ? '…' : <Send size={14} aria-hidden="true" />}
            </button>
          </form>
          {notice ? <p className="alert error" role="status">{notice}</p> : null}
        </div>
      ) : null}
    </div>
  );
};

export const MarkRead = ({ done, onToggle, busy }: { done: boolean; onToggle: () => void; busy: boolean }) => {
  const t = useT();
  return (
    <button type="button" className={`tool-button${done ? ' done' : ''}`} aria-pressed={done} onClick={onToggle} disabled={busy}>
      {done ? <CheckCircle2 size={14} aria-hidden="true" /> : <Circle size={14} aria-hidden="true" />} {done ? t('content.markedRead') : t('content.markRead')}
    </button>
  );
};

/** Floating "Save highlight" for selected article text (Premium). */
export const HighlightSaver = ({ slug, container, onSaved }: { slug: string; container: RefObject<HTMLElement | null>; onSaved: (note: Note) => void }) => {
  const t = useT();
  const errorText = useErrorText();
  const { api, access } = usePlaybook();
  const [selection, setSelection] = useState<{ text: string; sectionId: string | null; x: number; y: number } | null>(null);
  const [composer, setComposer] = useState<{ text: string; sectionId: string | null } | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!access.token) return;
    const onUp = () => {
      const sel = window.getSelection();
      const root = container.current;
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !root) return setSelection(null);
      const range = sel.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) return setSelection(null);
      const text = sel.toString().trim();
      if (text.length < 3) return setSelection(null);
      const node = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
      const sectionId = node?.closest('[data-section-id]')?.getAttribute('data-section-id') ?? null;
      const rect = range.getBoundingClientRect();
      const x = Math.min(Math.max(rect.left + rect.width / 2, 80), window.innerWidth - 80);
      setSelection({ text: text.slice(0, 1000), sectionId, x, y: Math.max(rect.top - 8, 48) });
    };
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);
    return () => {
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchend', onUp);
    };
  }, [access.token, container]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  if (!access.token) return null;
  const token = access.token;

  const save = async () => {
    if (!composer) return;
    setBusy(true);
    try {
      const res = await api.addNote(token, { page_slug: slug, anchor_text: composer.text, body: body.trim(), section_id: composer.sectionId });
      onSaved(res.note);
      setComposer(null);
      setBody('');
      setToast(t('notes.saved'));
    } catch (error) {
      setToast(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {selection && !composer ? (
        <button
          type="button"
          className="highlight-fab"
          style={{ top: selection.y, left: selection.x }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { setComposer({ text: selection.text, sectionId: selection.sectionId }); setSelection(null); }}
        >
          <Highlighter size={13} aria-hidden="true" /> {t('notes.saveHighlight')}
        </button>
      ) : null}
      {composer ? (
        <div className="note-composer" role="dialog" aria-label={t('notes.saveHighlight')}>
          <div className="note-composer-head">
            <strong>{t('notes.saveHighlight')}</strong>
            <button type="button" className="icon-button" onClick={() => setComposer(null)} aria-label={t('common.close')}><X size={16} aria-hidden="true" /></button>
          </div>
          <blockquote>{composer.text.length > 240 ? `${composer.text.slice(0, 240)}…` : composer.text}</blockquote>
          <label className="visually-hidden" htmlFor="note-body">{t('notes.addNote')}</label>
          <textarea id="note-body" rows={3} maxLength={4000} placeholder={t('notes.addNote')} value={body} onChange={(e) => setBody(e.target.value)} />
          <button type="button" className="btn solid" onClick={() => void save()} disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
        </div>
      ) : null}
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </>
  );
};
