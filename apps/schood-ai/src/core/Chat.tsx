import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { BookmarkPlus, Check, Copy, Flag, RotateCcw, Send, Square } from 'lucide-react';
import { quoteCredits } from '../../../../packages/ai-core/src/mod.ts';
import { api, ApiError, stream } from './api.ts';
import { useT } from './i18n/index.ts';
import { createPage } from './library/api.ts';
import { Answer } from './markdown.tsx';
import { Link } from './router.tsx';
import { ApiErrorState, CreditCost, PlanGate } from './states.tsx';
import type { MessageView } from './types.ts';
import { Button, Dialog, SparkMark, TextArea, Thinking, VisuallyHidden } from './ui.tsx';
import { contextLabel, useWorkspace } from './workspace.tsx';

// A streaming chat with one specialist. Shows the cost before sending, streams the
// answer, lets the person stop it (the part so far is kept) or try again (failed
// answers are refunded by the function), and puts a report button on every answer.
// Refusals (plan, caps, credits, switched off) appear as their own clear states.

interface Turn { key: string; id: string | null; role: 'user' | 'assistant'; content: string; status: 'complete' | 'streaming' | 'failed' | 'stopped'; context: string[] }
export interface ChatProps {
  specialist?: string;
  threadId?: string | null;
  onThread?: (id: string) => void;
  /** Prefills the composer, for deep links ("Ask Schood AI" from a results screen). */
  initialMessage?: string;
  heading?: ReactNode;
  autoFocus?: boolean;
}

const uuid = () => crypto.randomUUID();
const fromServer = (message: MessageView): Turn => ({ key: message.id, id: message.id, role: message.role, content: message.content, status: message.status === 'streaming' ? 'stopped' : message.status, context: message.context });

export function Chat({ specialist = 'assistant', threadId = null, onThread, initialMessage = '', heading, autoFocus = false }: ChatProps) {
  const t = useT(), workspace = useWorkspace();
  const me = workspace.me;
  const info = me?.specialists.find((entry) => entry.key === specialist);
  const [thread, setThread] = useState<string | null>(threadId);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState(initialMessage);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<unknown>(null);
  const [announce, setAnnounce] = useState('');
  const [loading, setLoading] = useState(!!threadId);
  const [reporting, setReporting] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const max = me?.limits.message_chars ?? 8000;
  const inputId = useId(), hintId = useId();

  useEffect(() => {
    setThread(threadId);
    if (!threadId) { setTurns([]); setLoading(false); return; }
    let live = true;
    setLoading(true);
    api<{ messages: MessageView[] }>('core/messages', { workspaceId: workspace.workspaceId, query: { thread_id: threadId } })
      .then((result) => { if (live) setTurns(result.messages.map(fromServer)); })
      .catch((cause) => { if (live) setRefusal(cause); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [threadId, workspace.workspaceId]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'nearest' }); }, [turns.length]);

  const patchLast = (patch: (turn: Turn) => Turn) => setTurns((list) => list.map((turn, index) => (index === list.length - 1 ? patch(turn) : turn)));

  const run = useCallback(async (body: Record<string, unknown>, userText: string | null) => {
    setBusy(true); setRefusal(null); setAnnounce(t('chat.thinking'));
    const abort = new AbortController();
    controller.current = abort;
    const before = turns;
    setTurns((list) => [
      ...(body.regenerate ? list.filter((turn, index) => !(index === list.length - 1 && turn.role === 'assistant' && turn.status !== 'complete')) : list),
      ...(userText !== null ? [{ key: uuid(), id: null, role: 'user' as const, content: userText, status: 'complete' as const, context: [] }] : []),
      { key: uuid(), id: null, role: 'assistant', content: '', status: 'streaming', context: [] },
    ]);
    let started = false;
    try {
      await stream('core/chat', {
        workspaceId: workspace.workspaceId, signal: abort.signal, body,
        onEvent: ({ event, data }) => {
          if (event === 'start') {
            started = true;
            const next = (data.thread as { id: string }).id;
            setThread(next);
            onThread?.(next);
            patchLast((turn) => ({ ...turn, id: String(data.message_id), context: Array.isArray(data.context) ? data.context.map((entry: { kind: string }) => entry.kind) : [] }));
            setAnnounce(t('chat.writing'));
          } else if (event === 'delta') {
            patchLast((turn) => ({ ...turn, content: turn.content + String(data.text ?? '') }));
          } else if (event === 'done') {
            patchLast((turn) => ({ ...turn, status: 'complete' }));
            setAnnounce(t('chat.ready'));
          } else if (event === 'error') {
            patchLast((turn) => ({ ...turn, status: 'failed' }));
            setAnnounce(t('chat.failed'));
          }
        },
      });
      // A stream that ended without a final event did not finish.
      setTurns((list) => list.map((turn, index) => (index === list.length - 1 && turn.status === 'streaming' ? { ...turn, status: 'failed' } : turn)));
    } catch (cause) {
      if (abort.signal.aborted) {
        patchLast((turn) => ({ ...turn, status: 'stopped' }));
        setAnnounce(t('chat.stopped'));
      } else if (!started) {
        // Refused before anything was stored: give the text back and show why.
        setTurns(before);
        if (userText !== null) setDraft(userText);
        setRefusal(cause);
        setAnnounce('');
      } else {
        patchLast((turn) => ({ ...turn, status: 'failed' }));
        setAnnounce(t('chat.failed'));
      }
    } finally {
      controller.current = null;
      setBusy(false);
      void workspace.refresh();
    }
  }, [turns, workspace, onThread, t]);

  const send = (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || busy || text.length > max) return;
    setDraft('');
    void run({ client_message_id: uuid(), message: text, specialist, ...(thread ? { thread_id: thread } : {}) }, text);
  };
  const retry = () => { if (thread && !busy) void run({ client_message_id: uuid(), regenerate: true, thread_id: thread }, null); };
  const last = turns.at(-1);

  return <div className="flex min-h-0 flex-col gap-4">
    {heading}
    <p className="sr-only" role="status" aria-live="polite">{announce}</p>
    <div role="log" aria-live="off" aria-busy={busy} aria-label={t('chat.title')} className="flex flex-col gap-4">
      {loading && <Thinking label={t('state.loading')}/>}
      {!loading && !turns.length && <div className="rounded-3xl border border-dashed border-navy-line/40 bg-white/60 p-5">
        <p className="m-0 font-display text-lg font-bold text-gray-900">{t('chat.empty.title')}</p>
        <p className="mb-0 mt-1 text-sm text-gray-700">{t('chat.empty.lead')}</p>
        {!!info?.suggestions.length && <div className="mt-4">
          <p className="m-0 mb-2 text-xs font-semibold uppercase tracking-wider text-gray-600">{t('chat.suggestions')}</p>
          <div className="flex flex-wrap gap-2">{info.suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => { setDraft(suggestion); input.current?.focus(); }}
            className="rounded-full border border-navy-line bg-white px-3 py-2 text-left text-sm text-gray-900 hover:bg-cream-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy">{suggestion}</button>)}</div>
        </div>}
      </div>}
      {turns.map((turn) => turn.role === 'user'
        ? <div key={turn.key} className="ml-auto max-w-[min(85%,36rem)] rounded-3xl rounded-br-lg bg-navy px-4 py-3 text-sm leading-6 text-white">
            <VisuallyHidden>{t('chat.you')}: </VisuallyHidden><span className="whitespace-pre-wrap break-words">{turn.content}</span>
          </div>
        : <AssistantTurn key={turn.key} turn={turn} onReport={() => turn.id && setReporting(turn.id)}/>)}
      <div ref={end}/>
    </div>
    {refusal !== null && <ApiErrorState error={refusal} onRetry={refusal instanceof ApiError && ['plan_required', 'capped', 'insufficient_credits', 'budget_exhausted', 'role_required'].includes(refusal.code) ? undefined : () => setRefusal(null)}/>}
    {last?.role === 'assistant' && (last.status === 'failed' || last.status === 'stopped') && !busy && <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700">
      <span>{last.status === 'failed' ? t('chat.failed') : t('chat.stopped')}</span>
      <Button variant="secondary" size="sm" onClick={retry} icon={<RotateCcw size={14} aria-hidden="true"/>}>{t('chat.retry')}</Button>
    </div>}
    <PlanGate feature={info ? quoteCredits(info.credit_key).feature : 'CORE'}>
      <form onSubmit={send} className="rounded-3xl border border-navy-line bg-white p-3 shadow-sm">
        <label className="sr-only" htmlFor={inputId}>{t('chat.label')}</label>
        <TextArea id={inputId} ref={input} rows={3} value={draft} maxLength={max + 1} autoFocus={autoFocus} placeholder={t('chat.placeholder')}
          aria-describedby={hintId} className="border-0 px-2 focus-visible:outline-offset-0"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }}/>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1">
          <div id={hintId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {info && <CreditCost creditKey={info.credit_key}/>}
            {me && <span className="text-xs text-gray-600">{t('chat.balance', { count: me.credits.budget ? Math.min(me.credits.total, me.credits.budget.left) : me.credits.total })}</span>}
            {draft.length > max ? <span className="text-xs font-semibold text-red-700">{t('chat.tooLong', { max })}</span> : <span className="hidden text-xs text-gray-500 sm:inline">{t('chat.enterHint')}</span>}
          </div>
          {busy
            ? <Button variant="secondary" onClick={() => controller.current?.abort()} icon={<Square size={14} aria-hidden="true"/>}>{t('chat.stop')}</Button>
            : <Button type="submit" variant="spark" disabled={!draft.trim() || draft.length > max} icon={<Send size={16} aria-hidden="true"/>}>{t('chat.send')}</Button>}
        </div>
      </form>
    </PlanGate>
    <ReportDialog messageId={reporting} onClose={() => setReporting(null)}/>
  </div>;
}

/** A title for an answer saved to the library: its first line without Markdown marks. */
const answerTitle = (text: string) => {
  const line = text.split('\n').map((entry) => entry.replace(/[#>*_`|\\$]+/g, ' ').replace(/\s+/g, ' ').trim()).find(Boolean) ?? '';
  return line.split(/(?<=[.!?])\s/)[0].slice(0, 100);
};

function AssistantTurn({ turn, onReport }: { turn: Turn; onReport(): void }) {
  const t = useT(), workspace = useWorkspace();
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState<{ id: string } | 'saving' | 'failed' | null>(null);
  // Teachers and centre staff with the library keep good answers as pages.
  const canSave = workspace.access('T6').allowed;
  const save = async () => {
    setSaved('saving');
    try {
      const page = await createPage({ kind: 'chat_answer', title: answerTitle(turn.content) || t('library.untitled'), body: turn.content }, workspace.workspaceId);
      setSaved({ id: page.id });
    } catch { setSaved('failed'); }
  };
  const sources = turn.context.map((kind) => contextLabel(workspace.me, t, kind)).join(', ');
  return <article className="flex max-w-full gap-3" aria-label={t('chat.assistant')}>
    <SparkMark size={30}/>
    <div className={`min-w-0 flex-1 rounded-3xl rounded-tl-lg border border-navy-line bg-white px-4 py-3 ${turn.status === 'streaming' ? 'ai-streaming' : ''}`}>
      {turn.content ? <Answer text={turn.content}/> : <Thinking label={t('chat.thinking')}/>}
      {(turn.status !== 'streaming' && turn.content) && <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-2">
        {sources && <span className="mr-auto text-xs text-gray-600">{t('chat.context', { sources })}</span>}
        <Button variant="ghost" size="sm" onClick={() => { void navigator.clipboard?.writeText(turn.content).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
          icon={copied ? <Check size={14} aria-hidden="true"/> : <Copy size={14} aria-hidden="true"/>}>{copied ? t('chat.copied') : t('chat.copy')}</Button>
        {canSave && (saved && typeof saved === 'object'
          ? <Link to={`/library/${saved.id}`} className="inline-flex min-h-9 items-center gap-1 px-2 text-xs font-semibold text-gray-900 underline underline-offset-2"><Check size={14} aria-hidden="true"/>{t('library.savedAnswer')}</Link>
          : <Button variant="ghost" size="sm" disabled={saved === 'saving'} onClick={() => void save()} icon={<BookmarkPlus size={14} aria-hidden="true"/>}>{saved === 'failed' ? t('library.error.save') : t('library.saveAnswer')}</Button>)}
        {turn.id && <Button variant="ghost" size="sm" onClick={onReport} icon={<Flag size={14} aria-hidden="true"/>}>{t('chat.report')}</Button>}
      </div>}
    </div>
  </article>;
}

const REASONS = ['incorrect', 'harmful', 'inappropriate', 'privacy', 'other'] as const;
export function ReportDialog({ messageId, onClose }: { messageId: string | null; onClose(): void }) {
  const t = useT(), workspace = useWorkspace();
  const [reason, setReason] = useState<(typeof REASONS)[number]>('incorrect');
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  useEffect(() => { if (messageId) { setReason('incorrect'); setNote(''); setState('idle'); } }, [messageId]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!messageId) return;
    setState('sending');
    try {
      await api('core/report', { workspaceId: workspace.workspaceId, body: { message_id: messageId, reason, ...(note.trim() ? { note: note.trim() } : {}) } });
      setState('sent');
    } catch { setState('error'); }
  };
  return <Dialog open={!!messageId} title={t('report.title')} onClose={onClose} closeLabel={t('report.cancel')}>
    {state === 'sent'
      ? <div className="flex flex-col gap-4"><p className="m-0 text-sm text-gray-800" role="status">{t('report.thanks')}</p><Button onClick={onClose}>{t('report.close')}</Button></div>
      : <form onSubmit={submit} className="flex flex-col gap-4">
          <p className="m-0 text-sm text-gray-700">{t('report.lead')}</p>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 text-sm font-semibold text-gray-900">{t('report.reason')}</legend>
            {REASONS.map((value) => <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border border-gray-300 bg-white px-3 text-sm">
              <input type="radio" name="reason" value={value} checked={reason === value} onChange={() => setReason(value)} className="h-4 w-4 accent-navy"/>{t(`report.reason.${value}`)}
            </label>)}
          </fieldset>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-gray-900">{t('report.note')}
            <TextArea rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)}/>
          </label>
          {state === 'error' && <p className="m-0 text-sm text-red-700" role="alert">{t('state.error.lead')}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>{t('report.cancel')}</Button>
            <Button type="submit" disabled={state === 'sending'}>{t('report.send')}</Button>
          </div>
        </form>}
  </Dialog>;
}
