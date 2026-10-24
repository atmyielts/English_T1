import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useEnglish } from '../app/EnglishContext';
import { useT } from '../i18n';
import { edge } from '../lib/api';
import { ServicePaused } from '../components/ServicePaused';
import { LockedPanel, Loading, PageHeader, Panel, Segmented, useErrorMessage } from '../ui/kit';
import { PracticeLinks } from '../components/PracticeLinks';

const VoiceConversationCard = lazy(() => import('../components/AIIter8Cards').then((module) => ({ default: module.VoiceConversationCard })));

type Message = { role: 'user' | 'assistant'; content: string };
type Memory = { id: string; kind: string; text: string; added_at: string };
type TutorReply = {
  ai_status: 'ok' | 'unconfigured' | 'failed';
  reply: string;
  suggested_memories: Array<{ kind: string; text: string }>;
  suggested_actions: Array<{ label: string; route: string; why: string }>;
};

// Same keys the earlier tutor used, so existing conversations carry over.
const HISTORY_KEY = 'english-hub:tutor-history:v1';
const MEMORY_KEY = 'english-hub:tutor-memories:v1';

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (key: string, value: unknown) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the conversation still works for this visit.
  }
};

const STARTERS = ['tutor.starter.plan', 'tutor.starter.explain', 'tutor.starter.practice', 'tutor.starter.correct'] as const;

/** Only follow tutor action links that stay inside this app. */
const safeRoute = (route: string): string | null => {
  const path = route.trim();
  return /^\/[a-z]/.test(path) && !path.startsWith('//') ? path : null;
};

const ChatTutor = () => {
  const t = useT();
  const errorText = useErrorMessage();
  const [messages, setMessages] = useState<Message[]>(() => readJson<Message[]>(HISTORY_KEY, []).filter((m) => m && m.content));
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<Array<{ kind: string; text: string }>>([]);
  const [actions, setActions] = useState<TutorReply['suggested_actions']>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { writeJson(HISTORY_KEY, messages.slice(-30)); }, [messages]);
  // Memories live on the account, so they follow the learner to every device.
  // Notes kept on this device by the earlier tutor move to the account once.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const local = readJson<Memory[]>(MEMORY_KEY, []).filter((m) => m && m.text);
        const response = local.length
          ? await edge<{ memories: Memory[] }>('hub', '/tutor/memory', { body: { action: 'add', memories: local.map(({ kind, text }) => ({ kind, text })) } })
          : await edge<{ memories: Memory[] }>('hub', '/tutor/memory');
        if (local.length) {
          try { window.localStorage.removeItem(MEMORY_KEY); } catch { /* storage blocked */ }
        }
        if (!cancelled) setMemories(response.memories ?? []);
      } catch (cause) {
        if (!cancelled) setMemoryError(errorText(cause));
      }
    };
    void load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const keepMemory = async (memo: { kind: string; text: string }) => {
    try {
      const response = await edge<{ memories: Memory[] }>('hub', '/tutor/memory', { body: { action: 'add', memory: memo } });
      setMemories(response.memories ?? []);
      setSuggested((current) => current.filter((entry) => entry.text !== memo.text));
    } catch (cause) {
      setMemoryError(errorText(cause));
    }
  };

  const forgetMemory = async (id: string) => {
    try {
      const response = await edge<{ memories: Memory[] }>('hub', '/tutor/memory', { body: { action: 'remove', id } });
      setMemories(response.memories ?? []);
    } catch (cause) {
      setMemoryError(errorText(cause));
    }
  };
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages, busy]);


  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const next = [...messages, { role: 'user' as const, content }];
    setMessages(next);
    setInput('');
    setBusy(true);
    setError(null);
    try {
      const reply = await edge<TutorReply>('hub', '/ai/tutor-chat', {
        body: {
          messages: next.slice(-16),
          memories: [],
        },
      });
      if (reply.ai_status !== 'ok' || !reply.reply) {
        setError(t('tutor.unavailable'));
        return;
      }
      setMessages([...next, { role: 'assistant', content: reply.reply }]);
      setSuggested((reply.suggested_memories ?? []).filter((memo) => !memories.some((m) => m.text === memo.text)).slice(0, 3));
      setActions((reply.suggested_actions ?? []).filter((action) => safeRoute(action.route)).slice(0, 3));
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="en-grid-2">
      <Panel
        title={t('tutor.chat.title')}
        aside={messages.length ? <button type="button" className="is-link" onClick={() => { setMessages([]); setActions([]); setSuggested([]); }}>{t('tutor.chat.clear')}</button> : null}
      >
        <div className="en-chat" aria-live="polite">
          {messages.length === 0 ? (
            <div className="en-empty">
              <strong>{t('tutor.chat.emptyTitle')}</strong>
              <p>{t('tutor.chat.emptyBody')}</p>
              <div className="en-actions">
                {STARTERS.map((key) => (
                  <button key={key} type="button" className="quiet" onClick={() => void send(t(key))}>{t(key)}</button>
                ))}
              </div>
            </div>
          ) : null}
          {messages.map((message, index) => (
            <div key={index} className={`en-bubble ${message.role === 'user' ? 'is-me' : 'is-tutor'}`}>{message.content}</div>
          ))}
          {busy ? <div className="en-bubble is-tutor" aria-label={t('tutor.chat.thinking')}>…</div> : null}
          <div ref={endRef} />
        </div>
        {error ? <div className="error" role="alert">{error}</div> : null}
        {actions.length ? (
          <div className="en-actions">
            {actions.map((action) => (
              <Link key={action.route + action.label} className="en-button-quiet" to={safeRoute(action.route)!} title={action.why}>{action.label}</Link>
            ))}
          </div>
        ) : null}
        <form className="en-composer" onSubmit={(event) => { event.preventDefault(); void send(input); }}>
          <textarea
            rows={2}
            value={input}
            aria-label={t('tutor.chat.inputLabel')}
            placeholder={t('tutor.chat.placeholder')}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send(input);
              }
            }}
          />
          <button type="submit" disabled={busy || !input.trim()}>{t('tutor.chat.send')}</button>
        </form>
      </Panel>

      <Panel title={t('tutor.memory.title')}>
        <p className="hint">{t('tutor.memory.lead')}</p>
        {suggested.length ? (
          <div className="en-stack">
            <strong style={{ fontSize: '.85rem' }}>{t('tutor.memory.suggested')}</strong>
            {suggested.map((memo) => (
              <div key={memo.text} className="en-row">
                <span style={{ flex: 1, fontSize: '.85rem' }}>{memo.text}</span>
                <button
                  type="button"
                  className="quiet"
                  onClick={() => void keepMemory(memo)}
                >
                  {t('tutor.memory.keep')}
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {memories.length ? (
          <ul className="en-list">
            {memories.map((memo) => (
              <li key={memo.id} className="en-row" style={{ fontSize: '.85rem' }}>
                <span style={{ flex: 1 }}>{memo.text}</span>
                <button type="button" className="is-link" onClick={() => void forgetMemory(memo.id)}>{t('tutor.memory.forget')}</button>
              </li>
            ))}
          </ul>
        ) : <p>{t('tutor.memory.empty')}</p>}
        {memoryError ? <p className="error">{memoryError}</p> : null}
        <p className="hint">{t('tutor.memory.device')}</p>
      </Panel>
    </div>
  );
};

export const TutorPage = () => {
  const t = useT();
  const { access, accessToken, isPaused, pricingHref } = useEnglish();
  const [mode, setMode] = useState<'chat' | 'voice'>('chat');
  const paused = isPaused('tutor');
  const locked = paused || (access.status === 'ready' && access.unlocked.size === 0);

  return (
    <>
      <PageHeader
        eyebrow={t('tutor.eyebrow')}
        title={t('tutor.title')}
        lead={t('tutor.lead')}
        actions={!locked ? <Segmented label={t('tutor.mode')} value={mode} onChange={setMode} options={[{ value: 'chat', label: t('tutor.mode.chat') }, { value: 'voice', label: t('tutor.mode.voice') }]} /> : null}
      />
      {access.status === 'loading' ? <Loading lines={4} /> : null}
      {paused ? <ServicePaused service="tutor" /> : null}
      {locked && !paused ? <LockedPanel skillName={t('tutor.title')} pricingHref={pricingHref()} /> : null}
      {access.status !== 'loading' && !locked && mode === 'chat' ? <ChatTutor /> : null}
      {access.status !== 'loading' && !locked && mode === 'voice' ? (
        <section className="en-panel en-tools-body">
          <Suspense fallback={<Loading lines={4} />}>
            <VoiceConversationCard accessToken={accessToken} />
          </Suspense>
        </section>
      ) : null}
      {access.status !== 'loading' ? <PracticeLinks /> : null}
    </>
  );
};
