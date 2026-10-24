import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useEnglish } from '../app/EnglishContext';
import { L1Why } from '../components/L1Why';
import { ResultSummary } from '../components/ResultSummary';
import { ShadowButton } from '../components/shadow/ShadowButton';
import { getRoleplayState } from '../lib/glue';
import { SpeakOrType } from '../components/SpeakOrType';
import { useI18n, useT } from '../i18n';
import { ApiError } from '../lib/api';
import { saveWords } from '../lib/notebook';
import {
  finishRoleplay,
  getRoleplayScenarios,
  sendRoleplayTurn,
  type RoleplayResult,
  type RoleplayScenarioView,
  type RoleplayTurnResponse,
} from '../lib/practice';
import { canSpeak, speak, stopSpeaking } from '../lib/speech';
import { useResource } from '../lib/useResource';
import { EmptyState, ErrorState, LevelBadge, Loading, PageHeader, Panel, Tag, useErrorMessage } from '../ui/kit';
import '../components/practice.css';

const levelLabel = (scenario: RoleplayScenarioView, t: ReturnType<typeof useT>) =>
  scenario.levels[0] === scenario.levels[1]
    ? t('roleplay.level', { level: scenario.levels[0] })
    : t('roleplay.levels', { from: scenario.levels[0], to: scenario.levels[1] });

/** The list of role-plays (/roleplay). */
export const RolePlaysPage = () => {
  const t = useT();
  const { locale } = useI18n();
  const { pricingHref } = useEnglish();
  const list = useResource((signal) => getRoleplayScenarios(locale, signal), [locale]);
  const data = list.data;

  return (
    <>
      <PageHeader
        back={{ to: '/speaking', label: t('roleplay.back') }}
        eyebrow={t('roleplay.eyebrow')}
        title={t('roleplay.title')}
        lead={t('roleplay.lead')}
        actions={<Link className="en-button-quiet" to="/speaking-mock">{t('practice.links.mock')}</Link>}
      />
      {list.loading && !data ? <Panel><Loading lines={6} /></Panel> : null}
      {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : null}
      {data ? (
        <>
          {!data.ai_available ? <p className="en-explain" role="status">{t('roleplay.aiOff')}</p> : null}
          {data.ai_available ? (
            data.allowance.basis === 'entitled' ? (
              <p className="hint" role="status">{t('roleplay.allowance.entitled', { count: data.allowance.sessions_left })}</p>
            ) : data.allowance.sessions_left > 0 ? (
              <p className="en-notice" role="status">{t('roleplay.allowance.free')}</p>
            ) : (
              <p className="en-explain" role="status">
                {t('roleplay.allowance.freeUsed')} <a href={pricingHref('speaking')}>{t('locked.cta')}</a>
              </p>
            )
          ) : null}
          {data.scenarios.length === 0 ? <Panel><EmptyState title={t('roleplay.notFound')} /></Panel> : null}
          <div className="en-rp-grid">
            {data.scenarios.map((scenario) => (
              <Link key={scenario.id} to={`/roleplay/${encodeURIComponent(scenario.id)}`} className="en-rp-card">
                <h2>{scenario.title}</h2>
                <p>{scenario.situation}</p>
                <footer>
                  <span>{levelLabel(scenario, t)}</span>
                  {scenario.best ? <Tag>{t('roleplay.best', { met: scenario.best.goals_met, total: scenario.best.goals_total })}</Tag> : <span aria-hidden="true">→</span>}
                </footer>
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
};

type ChatLine = { role: 'partner' | 'learner'; text: string };
type Stored = {
  sessionId: string;
  messages: ChatLine[];
  goalsMet: string[];
  turnsLeft: number;
  canFinish: boolean;
  shouldFinish: boolean;
  savedAt: number;
};

const STORE_PREFIX = 'english-hub:roleplay:v1:';
const STORE_TTL_MS = 3 * 3_600_000;

const readStored = (id: string): Stored | null => {
  try {
    const raw = window.sessionStorage.getItem(STORE_PREFIX + id);
    const parsed = raw ? (JSON.parse(raw) as Stored) : null;
    return parsed && parsed.sessionId && Date.now() - parsed.savedAt < STORE_TTL_MS ? parsed : null;
  } catch {
    return null;
  }
};

const writeStored = (id: string, value: Stored | null) => {
  try {
    if (value) window.sessionStorage.setItem(STORE_PREFIX + id, JSON.stringify(value));
    else window.sessionStorage.removeItem(STORE_PREFIX + id);
  } catch {
    // Storage may be blocked; the conversation still works in this tab.
  }
};

const codeOf = (error: unknown): string | null => (error instanceof ApiError ? error.code : null);

/** The finished role-play: goals, fixes and phrases to save. */
const RoleplayResultView = ({ scenario, result, onAgain }: { scenario: RoleplayScenarioView; result: RoleplayResult; onAgain: () => void }) => {
  const t = useT();
  const { locale } = useI18n();
  const errorText = useErrorMessage();
  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const goalText = (id: string) => scenario.goals.find((goal) => goal.id === id)?.text ?? id;

  const save = async (phrases: RoleplayResult['phrases']) => {
    const fresh = phrases.filter((phrase) => !saved.has(phrase.en));
    if (!fresh.length) return;
    setSaving(true);
    setError(null);
    try {
      await saveWords(fresh.map((phrase) => ({
        word: phrase.en,
        definition: phrase.meaning && locale !== 'en' ? phrase.meaning[locale] : null,
        source_type: 'roleplay',
        source_label: scenario.title,
        source_ref: `roleplay-${scenario.id}`,
      })));
      setSaved(new Set([...saved, ...fresh.map((phrase) => phrase.en)]));
    } catch (cause) {
      setError(cause);
    } finally {
      setSaving(false);
    }
  };

  const mainFix = result.fixes[0] ?? null;
  return (
    <section className="en-panel" aria-live="polite">
      <ResultSummary
        title={t('roleplay.result.title')}
        score={result.score}
        summary={t('roleplay.result.goals', { met: result.goals_met, total: result.goals_total })}
        xp={{ skill: 'speaking', slug: `roleplay-${scenario.id}` }}
        saved={{ words: saved.size, mistakes: result.fixes.length }}
        mainMistake={mainFix ? { original: mainFix.said, corrected: mainFix.better, explanation: mainFix.why, topic: mainFix.topic, noteId: mainFix.l1 } : null}
        share={{ kind: 'roleplay', skill: 'speaking', slug: scenario.id, title: scenario.title, score: result.score }}
        upNext={{ skill: 'speaking', slug: `roleplay-${scenario.id}` }}
        actions={(
          <>
            <button type="button" onClick={onAgain}>{t('roleplay.result.again')}</button>
            <Link className="en-button-quiet" to="/roleplay">{t('roleplay.result.other')}</Link>
          </>
        )}
      >
        <div className="en-stack" style={{ gap: '.4rem' }}>
          <h3 style={{ margin: 0, fontSize: '.95rem' }}>{t('roleplay.goals')}</h3>
          <ul className="en-rp-goals">
            {result.goals.map((goal) => (
              <li key={goal.id} className={goal.achieved ? 'is-met' : undefined}>
                <span>
                  {goalText(goal.id)}
                  {goal.achieved ? <span className="visually-hidden"> ({t('roleplay.goalDone')})</span> : null}
                  {goal.note ? <small className="hint" lang="en" style={{ display: 'block' }}>{goal.note}</small> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
        {result.summary ? <p className="en-explain" lang="en">{result.summary}</p> : null}
        {result.source === 'basic' ? <p className="hint">{t('roleplay.result.basic')}</p> : null}

        <div className="en-stack" style={{ gap: '.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '.95rem' }}>{t('roleplay.result.fixes')}</h3>
          {result.fixes.length ? (
            <ul className="en-list">
              {result.fixes.map((fix, index) => (
                <li key={index} className="en-stack" style={{ gap: '.3rem' }}>
                  <span className="en-diff" lang="en"><del>{fix.said}</del> <span aria-hidden="true">→</span> <ins>{fix.better}</ins></span>
                  {fix.why ? <span className="hint" lang="en">{fix.why}</span> : null}
                  <L1Why noteId={fix.l1} original={fix.said} corrected={fix.better} explanation={fix.why} topic={fix.topic} />
                </li>
              ))}
            </ul>
          ) : <p style={{ margin: 0 }}>{t('roleplay.result.noFixes')}</p>}
        </div>

        {result.phrases.length ? (
          <div className="en-stack" style={{ gap: '.5rem' }}>
            <div className="en-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: '.95rem' }}>{t('roleplay.result.phrases')}</h3>
              <button type="button" className="quiet" disabled={saving || result.phrases.every((phrase) => saved.has(phrase.en))} onClick={() => void save(result.phrases)}>
                {t('roleplay.result.saveAll')}
              </button>
            </div>
            <p className="hint" style={{ margin: 0 }}>{t('roleplay.result.phrasesHint')}</p>
            <ul className="en-rp-phrases">
              {result.phrases.map((phrase) => (
                <li key={phrase.en}>
                  <span>
                    <span lang="en">{phrase.en}</span>
                    {phrase.meaning && locale !== 'en' ? <small>{phrase.meaning[locale]}</small> : null}
                  </span>
                  <span className="en-row" style={{ gap: '.4rem' }}>
                    {canSpeak() ? <button type="button" className="quiet" onClick={() => void speak(phrase.en, { rate: 0.95 })}>▶ <span className="visually-hidden">{t('roleplay.listen')}</span></button> : null}
                    <button type="button" className={saved.has(phrase.en) ? 'quiet' : undefined} disabled={saving || saved.has(phrase.en)} onClick={() => void save([phrase])}>
                      {saved.has(phrase.en) ? t('roleplay.result.saved') : t('roleplay.result.save')}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            {error ? <div className="error" role="alert">{errorText(error)}</div> : null}
          </div>
        ) : null}
      </ResultSummary>
    </section>
  );
};

/** One role-play conversation (/roleplay/:id). */
export const RolePlayPage = () => {
  const t = useT();
  const { locale } = useI18n();
  const { pricingHref } = useEnglish();
  const errorText = useErrorMessage();
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const list = useResource((signal) => getRoleplayScenarios(locale, signal), [locale]);
  const scenario = list.data?.scenarios.find((entry) => entry.id === id) ?? null;
  const stored = useRef(readStored(id)).current;

  const [sessionId, setSessionId] = useState<string | null>(stored?.sessionId ?? null);
  const [messages, setMessages] = useState<ChatLine[]>(stored?.messages ?? []);
  const [goalsMet, setGoalsMet] = useState<string[]>(stored?.goalsMet ?? []);
  const [turnsLeft, setTurnsLeft] = useState<number | null>(stored?.turnsLeft ?? null);
  const [canFinish, setCanFinish] = useState(stored?.canFinish ?? false);
  const [shouldFinish, setShouldFinish] = useState(stored?.shouldFinish ?? false);
  const [tip, setTip] = useState<RoleplayTurnResponse['tip']>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'send' | 'finish' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [freeUsed, setFreeUsed] = useState(false);
  const [readAloud, setReadAloud] = useState(true);
  const [result, setResult] = useState<RoleplayResult | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [level, setLevel] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  // The partner's opening line starts every conversation.
  const lines: ChatLine[] = scenario && messages.length === 0 ? [{ role: 'partner', text: scenario.opening }] : messages;

  useEffect(() => () => stopSpeaking(), []);

  // Continue a conversation started on another device (?session= from "Continue").
  const remoteSession = params.get('session');
  useEffect(() => {
    if (!remoteSession || sessionId) return;
    const controller = new AbortController();
    getRoleplayState(remoteSession, controller.signal)
      .then((state) => {
        if (state.scenario_id !== id) return;
        setSessionId(state.session_id);
        setLevel(state.level);
        setMessages(state.messages);
        setGoalsMet(state.goals_met);
        setTurnsLeft(state.turns_left);
        setCanFinish(state.can_finish);
        setShouldFinish(state.should_finish);
      })
      .catch(() => { /* Ended or not found: the learner starts a new conversation as usual. */ });
    return () => controller.abort();
    // Only on arrival with a session in the address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteSession, id]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [lines.length, busy]);

  useEffect(() => {
    if (!sessionId) return;
    writeStored(id, { sessionId, messages, goalsMet, turnsLeft: turnsLeft ?? 0, canFinish, shouldFinish, savedAt: Date.now() });
  }, [id, sessionId, messages, goalsMet, turnsLeft, canFinish, shouldFinish]);

  const reset = () => {
    stopSpeaking();
    writeStored(id, null);
    setSessionId(null);
    setMessages([]);
    setGoalsMet([]);
    setTurnsLeft(null);
    setCanFinish(false);
    setShouldFinish(false);
    setTip(null);
    setDraft('');
    setError(null);
    setResult(null);
    setInputKey((value) => value + 1);
    // Allowance and best results may have changed.
    list.reload();
  };

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!scenario || !text || busy) return;
    const before = lines;
    setMessages([...before, { role: 'learner', text }]);
    setDraft('');
    setInputKey((value) => value + 1);
    setBusy('send');
    setError(null);
    setTip(null);
    try {
      const reply = await sendRoleplayTurn({ scenario_id: scenario.id, session_id: sessionId, text });
      setSessionId(reply.session_id);
      setLevel(reply.level);
      setMessages([...before, { role: 'learner', text }, { role: 'partner', text: reply.reply }]);
      setGoalsMet(reply.goals_met);
      setTurnsLeft(reply.turns_left);
      setCanFinish(reply.can_finish);
      setShouldFinish(reply.should_finish);
      setTip(reply.tip);
      if (readAloud && canSpeak()) void speak(reply.reply, { rate: 0.95 });
    } catch (cause) {
      setMessages(messages);
      setDraft(text);
      const code = codeOf(cause);
      if (code === 'english_free_limit_reached') setFreeUsed(true);
      else if (code === 'roleplay_turn_limit') { setShouldFinish(true); setCanFinish(true); setError(t('roleplay.limit')); }
      else if (code === 'roleplay_session_closed') { reset(); setError(t('roleplay.error.closed')); }
      else if (code === 'roleplay_daily_limit_reached') setError(t('roleplay.error.daily'));
      else if (code === 'english_ai_unavailable') setError(t('roleplay.error.ai'));
      else setError(errorText(cause));
    } finally {
      setBusy(null);
    }
  };

  const finish = async () => {
    if (!sessionId || busy) return;
    stopSpeaking();
    setBusy('finish');
    setError(null);
    try {
      const response = await finishRoleplay(sessionId);
      setResult(response.result);
      writeStored(id, null);
      window.scrollTo({ top: 0 });
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(null);
    }
  };

  if (list.loading && !list.data) return <Panel><Loading lines={6} /></Panel>;
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />;
  if (!scenario) {
    return (
      <Panel>
        <EmptyState title={t('roleplay.notFound')} action={<Link className="en-button" to="/roleplay">{t('roleplay.backToList')}</Link>} />
      </Panel>
    );
  }

  const learnerTurns = lines.filter((line) => line.role === 'learner').length;
  const blocked = !list.data?.ai_available || freeUsed || (!sessionId && list.data.allowance.sessions_left <= 0);

  return (
    <>
      <PageHeader
        back={{ to: '/roleplay', label: t('roleplay.backToList') }}
        eyebrow={levelLabel(scenario, t)}
        title={scenario.title}
        lead={scenario.situation}
      />

      {result ? <RoleplayResultView scenario={scenario} result={result} onAgain={reset} /> : (
        <div className="en-rp-layout">
          <Panel>
            <div className="en-stack">
              <div className="en-stack" style={{ gap: '.3rem' }}>
                <h2 style={{ margin: 0, fontSize: '1rem' }}>{t('roleplay.yourRole')}</h2>
                <p style={{ margin: 0 }}>{scenario.role_card}</p>
              </div>
              <div className="en-stack" style={{ gap: '.4rem' }}>
                <h2 style={{ margin: 0, fontSize: '1rem' }}>{t('roleplay.goals')}</h2>
                <ul className="en-rp-goals" aria-live="polite">
                  {scenario.goals.map((goal) => {
                    const met = goalsMet.includes(goal.id);
                    return (
                      <li key={goal.id} className={met ? 'is-met' : undefined}>
                        <span>{goal.text}{met ? <span className="visually-hidden"> ({t('roleplay.goalDone')})</span> : null}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <details>
                <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{t('roleplay.phrases')}</summary>
                <ul className="en-rp-phrases" style={{ marginTop: '.5rem' }}>
                  {scenario.phrases.map((phrase) => (
                    <li key={phrase.en}>
                      <span>
                        <span lang="en">{phrase.en}</span>
                        {phrase.meaning ? <small>{phrase.meaning}</small> : null}
                      </span>
                      {canSpeak() ? <button type="button" className="quiet" onClick={() => void speak(phrase.en, { rate: 0.95 })}>▶ <span className="visually-hidden">{t('roleplay.listen')}</span></button> : null}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          </Panel>

          <Panel>
            <div className="en-stack">
              <div className="en-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                {level ? <LevelBadge level={level} muted /> : <span />}
                {canSpeak() ? (
                  <label className="en-row">
                    <input type="checkbox" style={{ width: 'auto' }} checked={readAloud} onChange={(event) => setReadAloud(event.target.checked)} />
                    {t('roleplay.speakAloud')}
                  </label>
                ) : null}
              </div>
              <div className="en-chat" aria-live="polite">
                {lines.map((line, index) => (
                  <Fragment key={index}>
                    <div className={`en-bubble ${line.role === 'learner' ? 'is-me' : 'is-tutor'}`} lang="en">
                      <span className="visually-hidden">{line.role === 'learner' ? t('roleplay.you') : scenario.partner}: </span>
                      {line.text}
                    </div>
                    {line.role === 'partner' ? (
                      <div className="sh-bubble-actions"><ShadowButton text={line.text} source="roleplay" /></div>
                    ) : null}
                  </Fragment>
                ))}
                {busy === 'send' ? <p className="hint">{t('roleplay.replying', { name: scenario.partner })}</p> : null}
                <div ref={endRef} />
              </div>

              {tip ? (
                <div className="en-feedback is-fix">
                  <h3>{t('roleplay.tip')}</h3>
                  <p className="en-diff" lang="en" style={{ margin: 0 }}><del>{tip.said}</del> → <ins>{tip.better}</ins></p>
                  <L1Why noteId={tip.l1} original={tip.said} corrected={tip.better} />
                </div>
              ) : null}

              {freeUsed ? (
                <p className="en-explain" role="status">{t('roleplay.allowance.freeUsed')} <a href={pricingHref('speaking')}>{t('locked.cta')}</a></p>
              ) : !list.data?.ai_available ? (
                <p className="en-explain" role="status">{t('roleplay.aiOff')}</p>
              ) : !sessionId && list.data.allowance.sessions_left <= 0 ? (
                <p className="en-explain" role="status">
                  {list.data.allowance.basis === 'entitled' ? t('roleplay.error.daily') : t('roleplay.allowance.freeUsed')}
                </p>
              ) : null}

              {shouldFinish ? <p className="en-notice" role="status">{t('roleplay.limit')}</p> : null}

              {!shouldFinish ? (
                <form onSubmit={(event) => void send(event)}>
                  <SpeakOrType
                    key={inputKey}
                    id="roleplay-answer"
                    label={t('speak.label')}
                    value={draft}
                    onChange={setDraft}
                    rows={2}
                    disabled={blocked || busy !== null}
                  >
                    <button type="submit" disabled={!draft.trim() || blocked || busy !== null}>
                      {busy === 'send' ? t('speak.sending') : t('speak.send')}
                    </button>
                  </SpeakOrType>
                </form>
              ) : null}

              {error ? <div className="error" role="alert">{error}</div> : null}

              <div className="en-actions">
                {sessionId ? (
                  <button type="button" className={shouldFinish ? undefined : 'quiet'} disabled={!canFinish || busy !== null} onClick={() => void finish()}>
                    {busy === 'finish' ? t('roleplay.finishing') : t('roleplay.finish')}
                  </button>
                ) : null}
                {turnsLeft !== null && !shouldFinish ? <span className="hint">{t('roleplay.turnsLeft', { count: turnsLeft })}</span> : null}
                {sessionId && !canFinish && list.data ? <span className="hint">{t('roleplay.finishHint', { count: list.data.min_turns })}</span> : null}
                {learnerTurns > 0 && list.data?.allowance.basis === 'entitled' ? <button type="button" className="is-link" onClick={reset}>{t('roleplay.restart')}</button> : null}
              </div>
            </div>
          </Panel>
        </div>
      )}
    </>
  );
};
