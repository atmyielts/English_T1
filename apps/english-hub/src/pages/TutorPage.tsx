import { Fragment, lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useEnglish } from '../app/EnglishContext';
import { ShadowButton } from '../components/shadow/ShadowButton';
import { useT } from '../i18n';
import { ServicePaused } from '../components/ServicePaused';
import { LockedPanel, Loading, PageHeader, Panel, Segmented, useErrorMessage } from '../ui/kit';
import { PracticeLinks } from '../components/PracticeLinks';
import { MiniLesson, useTopicName } from '../components/tutor/MiniLesson';
import { useResource } from '../lib/useResource';
import {
  addMemories,
  deleteThread,
  getMemories,
  getThread,
  getThreads,
  getTutorContext,
  importLocalHistory,
  removeMemory,
  sendTutorMessage,
  startLesson,
  type TutorAction,
  type TutorContext,
  type TutorMemory,
  type TutorMessage,
  type TutorThread,
} from '../lib/tutor';
import { GRAMMAR_TOPICS } from '../../../../supabase/functions/_shared/english-mistakes.ts';
import '../depth.css';

const VoiceConversationCard = lazy(() => import('../components/AIIter8Cards').then((module) => ({ default: module.VoiceConversationCard })));

// Keys the earlier, on-device tutor used. Their contents move to the account once.
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
const forget = (key: string) => {
  try { window.localStorage.removeItem(key); } catch { /* storage blocked */ }
};

const STARTERS = ['tutor.starter.plan', 'tutor.starter.explain', 'tutor.starter.practice', 'tutor.starter.correct'] as const;

/** Only follow tutor action links that stay inside this app (the server checks them too). */
const safeRoute = (route: string): string | null => {
  const path = route.trim();
  return /^\/[a-z]/.test(path) && !path.startsWith('//') ? path : null;
};

const ActionLinks = ({ actions, context }: { actions: TutorAction[]; context: TutorContext | null }) => {
  const t = useT();
  const topicName = useTopicName();
  const label = (action: TutorAction): string => {
    if (action.kind === 'review') return t('depth.tutor.action.review', { count: context?.words_due ?? 0 });
    if (action.kind === 'lesson') return t('depth.tutor.action.lesson', { topic: action.topic ? topicName(action.topic) : '' });
    if (action.kind === 'project') return t('depth.tutor.action.project');
    if (action.kind === 'assignment') return t('depth.tutor.action.assignment', { title: action.label ?? '' });
    return action.label ?? action.route;
  };
  const shown = actions.filter((action) => safeRoute(action.route)).slice(0, 3);
  if (!shown.length) return null;
  return (
    <div className="en-actions">
      {shown.map((action) => (
        <Link key={action.route} className="en-button-quiet" to={safeRoute(action.route)!} title={action.why ?? undefined}>{label(action)}</Link>
      ))}
    </div>
  );
};

const ChatTutor = ({ context, onLessonDone, onMemoryAdded }: { context: TutorContext | null; onLessonDone: () => void; onMemoryAdded: () => void }) => {
  const t = useT();
  const errorText = useErrorMessage();
  const topicName = useTopicName();
  const [threads, setThreads] = useState<TutorThread[] | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [actions, setActions] = useState<TutorAction[]>([]);
  const [suggested, setSuggested] = useState<Array<{ kind: string; text: string }>>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // A thread the page just created already has its messages on screen.
  const skipLoad = useRef<string | null>(null);

  // Conversations live on the account; the old on-device history moves there once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const local = readJson<Array<{ role: string; content: string }>>(HISTORY_KEY, []).filter((m) => m && m.content);
        if (local.length) {
          await importLocalHistory(local.slice(-30));
          forget(HISTORY_KEY);
        }
        const response = await getThreads();
        if (cancelled) return;
        setThreads(response.threads);
        if (response.threads[0]) setThreadId(response.threads[0].id);
      } catch (cause) {
        if (!cancelled) {
          setLoadError(cause);
          setThreads([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!threadId) {
      setMessages([]);
      return;
    }
    if (skipLoad.current === threadId) {
      skipLoad.current = null;
      return;
    }
    const controller = new AbortController();
    setLoadingThread(true);
    getThread(threadId, controller.signal)
      .then((response) => {
        setMessages(response.messages);
        const lastAssistant = [...response.messages].reverse().find((message) => message.role === 'assistant' && message.kind === 'chat');
        setActions(lastAssistant?.actions ?? []);
      })
      .catch((cause) => { if (!controller.signal.aborted) setLoadError(cause); })
      .finally(() => { if (!controller.signal.aborted) setLoadingThread(false); });
    return () => controller.abort();
  }, [threadId]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages, busy]);

  const rememberThread = (thread: TutorThread | null | undefined) => {
    if (!thread) return;
    setThreads((current) => [thread, ...(current ?? []).filter((entry) => entry.id !== thread.id)]);
    if (thread.id !== threadId) {
      skipLoad.current = thread.id;
      setThreadId(thread.id);
    }
  };

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const pending: TutorMessage = { id: -Date.now(), role: 'user', kind: 'chat', content, created_at: new Date().toISOString() };
    setMessages((current) => [...current, pending]);
    setInput('');
    setBusy(true);
    setError(null);
    try {
      const reply = await sendTutorMessage(threadId, content);
      if (!reply.ok || reply.ai_status !== 'ok' || !reply.messages?.length) {
        setMessages((current) => current.filter((message) => message.id !== pending.id));
        setInput(content);
        setError(t('tutor.unavailable'));
        return;
      }
      setMessages((current) => [...current.filter((message) => message.id !== pending.id), ...reply.messages!]);
      rememberThread(reply.thread);
      setActions(reply.suggested_actions ?? []);
      setSuggested((reply.suggested_memories ?? []).slice(0, 3));
    } catch (cause) {
      setMessages((current) => current.filter((message) => message.id !== pending.id));
      setInput(content);
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  const lesson = async (topic: string | null) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await startLesson(threadId, topic);
      if (!response.ok || !response.message) {
        setError(t('depth.lesson.unavailable'));
        return;
      }
      setMessages((current) => [...current, response.message!]);
      rememberThread(response.thread);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  const updateMessage = (next: TutorMessage) => {
    setMessages((current) => current.map((message) => (message.id === next.id ? next : message)));
    if (next.lesson?.progress.done) onLessonDone();
  };

  const newConversation = () => {
    setThreadId(null);
    setMessages([]);
    setActions([]);
    setSuggested([]);
    setError(null);
  };

  const removeThread = async () => {
    if (!threadId) return;
    try {
      await deleteThread(threadId);
      setThreads((current) => (current ?? []).filter((entry) => entry.id !== threadId));
      newConversation();
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const keepMemory = async (memo: { kind: string; text: string }) => {
    try {
      await addMemories([memo]);
      setSuggested((current) => current.filter((entry) => entry.text !== memo.text));
      onMemoryAdded();
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const lastLessonTopic = [...messages].reverse().find((message) => message.role === 'assistant' && message.kind === 'chat')?.lesson_topic ?? null;
  const topMistake = context?.mistakes.find((entry) => (GRAMMAR_TOPICS as readonly string[]).includes(entry.topic))?.topic ?? null;
  const lessonTopic = lastLessonTopic ?? topMistake;

  return (
    <Panel
      title={t('tutor.chat.title')}
      aside={(
        <span className="en-row dp-thread-bar">
          {threads && threads.length ? (
            <label className="en-row" style={{ gap: '.35rem' }}>
              <span className="visually-hidden">{t('depth.tutor.threads')}</span>
              <select value={threadId ?? ''} onChange={(event) => setThreadId(event.target.value || null)}>
                {threadId === null ? <option value="">{t('depth.tutor.newThread')}</option> : null}
                {threads.map((thread) => <option key={thread.id} value={thread.id}>{thread.title}</option>)}
              </select>
            </label>
          ) : null}
          {threadId ? <button type="button" className="is-link" onClick={newConversation}>{t('depth.tutor.new')}</button> : null}
        </span>
      )}
    >
      <div className="en-chat" aria-live="polite">
        {threads === null || loadingThread ? <Loading lines={2} /> : null}
        {threads !== null && !loadingThread && messages.length === 0 ? (
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
        {messages.map((message) => (
          message.kind === 'lesson'
            ? <MiniLesson key={message.id} message={message} onChange={updateMessage} />
            : (
              <Fragment key={message.id}>
                <div className={`en-bubble ${message.role === 'user' ? 'is-me' : 'is-tutor'}`}>{message.content}</div>
                {message.role === 'assistant' ? (
                  <div className="sh-bubble-actions"><ShadowButton text={message.content} source="tutor" /></div>
                ) : null}
              </Fragment>
            )
        ))}
        {busy ? <div className="en-bubble is-tutor" aria-label={t('tutor.chat.thinking')}>…</div> : null}
        <div ref={endRef} />
      </div>
      {loadError ? <div className="error" role="alert">{errorText(loadError)}</div> : null}
      {error ? <div className="error" role="alert">{error}</div> : null}
      <ActionLinks actions={actions} context={context} />
      {lessonTopic ? (
        <div className="en-actions">
          <button type="button" className="quiet" disabled={busy} onClick={() => void lesson(lessonTopic)}>
            {t('depth.tutor.lessonOn', { topic: topicName(lessonTopic) })}
          </button>
        </div>
      ) : null}
      {suggested.length ? (
        <div className="en-stack dp-suggested">
          <strong style={{ fontSize: '.85rem' }}>{t('tutor.memory.suggested')}</strong>
          {suggested.map((memo) => (
            <div key={memo.text} className="en-row">
              <span style={{ flex: 1, fontSize: '.85rem' }}>{memo.text}</span>
              <button type="button" className="quiet" onClick={() => void keepMemory(memo)}>{t('tutor.memory.keep')}</button>
            </div>
          ))}
        </div>
      ) : null}
      <form className="en-composer" onSubmit={(event) => { event.preventDefault(); void send(input); }}>
        <textarea
          rows={2}
          value={input}
          maxLength={2000}
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
      <p className="hint dp-thread-note">
        {t('depth.tutor.saved')}{' '}
        {threadId ? <button type="button" className="is-link" onClick={() => void removeThread()}>{t('depth.tutor.delete')}</button> : null}
      </p>
    </Panel>
  );
};

/** What the tutor knows (built from real activity), the quick next steps, and the learner's kept notes. */
const TutorSide = ({
  context,
  actions,
  error,
  onRetry,
  memoryTick,
}: {
  context: TutorContext | null;
  actions: TutorAction[];
  error: unknown;
  onRetry: () => void;
  memoryTick: number;
}) => {
  const t = useT();
  const errorText = useErrorMessage();
  const topicName = useTopicName();
  const [memories, setMemories] = useState<TutorMemory[]>([]);
  const [memoryError, setMemoryError] = useState<string | null>(null);

  const loadMemories = useCallback(async () => {
    try {
      const local = readJson<TutorMemory[]>(MEMORY_KEY, []).filter((m) => m && m.text);
      const response = local.length ? await addMemories(local.map(({ kind, text }) => ({ kind, text }))) : await getMemories();
      if (local.length) forget(MEMORY_KEY);
      setMemories(response.memories ?? []);
    } catch (cause) {
      setMemoryError(errorText(cause));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { void loadMemories(); }, [loadMemories, memoryTick]);

  const forgetMemory = async (id: string) => {
    try {
      const response = await removeMemory(id);
      setMemories(response.memories ?? []);
    } catch (cause) {
      setMemoryError(errorText(cause));
    }
  };

  const levels = Object.entries(context?.levels ?? {});
  return (
    <div className="en-stack">
      <Panel title={t('depth.tutor.knowsTitle')}>
        {error ? (
          <p className="hint">{t('depth.tutor.knowsError')} <button type="button" className="is-link" onClick={onRetry}>{t('depth.retry')}</button></p>
        ) : !context ? <Loading lines={3} /> : (
          <div className="en-stack dp-knows" style={{ gap: '.6rem' }}>
            <p className="hint" style={{ margin: 0 }}>{t('depth.tutor.knowsLead')}</p>
            <dl>
              <dt>{t('depth.tutor.level')}</dt>
              <dd>
                {context.level ?? t('depth.tutor.unknown')}
                {levels.length ? <span className="hint"> · {levels.map(([skill, value]) => `${t(`skill.${skill}`)} ${value}`).join(' · ')}</span> : null}
              </dd>
              {context.target || context.goal_date ? (
                <>
                  <dt>{t('depth.tutor.goal')}</dt>
                  <dd>{[context.target, context.goal_date].filter(Boolean).join(' · ')}</dd>
                </>
              ) : null}
              <dt>{t('depth.tutor.words')}</dt>
              <dd>{t('depth.tutor.wordsDue', { count: context.words_due })}</dd>
              {context.assignments.length ? (
                <>
                  <dt>{t('depth.tutor.classWork')}</dt>
                  <dd>{context.assignments.map((entry) => `${entry.title}${entry.due ? ` (${entry.due})` : ''}`).join('; ')}</dd>
                </>
              ) : null}
              {context.project ? (
                <>
                  <dt>{t('depth.tutor.project')}</dt>
                  <dd lang="en">{context.project}</dd>
                </>
              ) : null}
            </dl>
            {context.mistakes.length ? (
              <div className="en-stack" style={{ gap: '.3rem' }}>
                <strong style={{ fontSize: '.85rem' }}>{t('depth.tutor.mistakes')}</strong>
                <ul className="en-list dp-mistakes">
                  {context.mistakes.map((entry) => (
                    <li key={entry.topic}>
                      <span>{topicName(entry.topic)} <span className="hint">×{entry.times}</span></span>
                      {entry.example ? <span className="hint" lang="en">{entry.example}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : <p className="hint" style={{ margin: 0 }}>{t('depth.tutor.noMistakes')}</p>}
            <ActionLinks actions={actions} context={context} />
          </div>
        )}
      </Panel>

      <Panel title={t('tutor.memory.title')}>
        <p className="hint">{t('tutor.memory.lead')}</p>
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
  const ready = access.status !== 'loading' && !locked;
  const knows = useResource((signal) => getTutorContext(signal), [], ready);
  const [memoryTick, setMemoryTick] = useState(0);

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
      {ready && mode === 'chat' ? (
        <div className="en-grid-2">
          <ChatTutor context={knows.data?.context ?? null} onLessonDone={knows.reload} onMemoryAdded={() => setMemoryTick((value) => value + 1)} />
          <TutorSide context={knows.data?.context ?? null} actions={knows.data?.actions ?? []} error={knows.error} onRetry={knows.reload} memoryTick={memoryTick} />
        </div>
      ) : null}
      {ready && mode === 'voice' ? (
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
