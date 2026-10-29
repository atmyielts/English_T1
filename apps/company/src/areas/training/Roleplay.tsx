// AI role-play: pick a workplace scenario (/w/:org/roleplay), then talk to the
// character by typing or speaking (/w/:org/roleplay/:session) and get feedback.
import React, { useEffect, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { api } from '../../api.ts';
import { useAppT, useErrorText, type AppKey } from '../../i18n/index.ts';
import { Link, navigate, useLocation } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { aiMessage, DIFFICULTY_CLASS, ListenButton, Loading, readLocal, useDate, useLoad, useLocalized, writeLocal, type AiStatus, type Localized } from './lib.tsx';
import { canRecognize, canSpeak, listen, speak, stopSpeaking, type Listener } from './speech.ts';

interface ScenarioView { code: string; title: Localized; goal: Localized; difficulty: 'easy' | 'medium' | 'hard'; learner_role: string; setting: string; checklist: string[] }
interface Turn { role: 'ai' | 'learner'; text: string; at: string; mode?: 'typed' | 'voice'; tip?: string }
interface Feedback {
  score: number; summary: string; goal_met: boolean; good_phrases: string[];
  better_phrases: { said: string; better: string; why: string }[]; checklist: { item: string; done: boolean }[]; next_step: string;
}
interface Session {
  id: string; track_code: string; status: 'active' | 'ended'; turns: Turn[]; learner_turns: number; max_turns: number;
  feedback: Feedback | null; score: number | null; minutes: number; created_at: string; ended_at: string | null; scenario: ScenarioView | null;
}
interface Overview {
  recommended: string; max_turns: number;
  tracks: { code: string; title: Localized; scenarios: ScenarioView[] }[];
  sessions: { id: string; scenario_code: string; title: Localized | null; status: string; score: number | null; learner_turns: number; created_at: string }[];
}

function ScenarioCard({ scenario, onStart, busy }: { scenario: ScenarioView; onStart: () => void; busy: boolean }) {
  const t = useAppT(), pick = useLocalized();
  return <li className="training-scenario">
    <div>
      <strong>{pick(scenario.title)}</strong>
      <span className={`company-badge ${DIFFICULTY_CLASS[scenario.difficulty]}`}>{t(`training.difficulty.${scenario.difficulty}` as AppKey)}</span>
    </div>
    <p>{pick(scenario.goal)}</p>
    <button type="button" disabled={busy} onClick={onStart}>{t('training.roleplay.start')}</button>
  </li>;
}

export function RoleplayHome() {
  const t = useAppT(), pick = useLocalized(), problem = useErrorText(), when = useDate();
  const { locale } = useI18n();
  const { org, member } = useWorkspace();
  const { query } = useLocation();
  const { data, error } = useLoad<Overview>(`orgs/${org.id}/roleplay`);
  const [track, setTrack] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [startError, setStartError] = useState('');
  if (!data) return <Loading error={error}/>;
  const chosen = track ?? data.recommended;
  const asked = query.get('scenario');
  const featured = asked ? data.tracks.flatMap((entry) => entry.scenarios).find((scenario) => scenario.code === asked) : undefined;
  const current = data.tracks.find((entry) => entry.code === chosen) ?? data.tracks[0];

  async function start(code: string) {
    if (!member) { setStartError(t('training.notMember')); return; }
    setBusy(true); setStartError('');
    try {
      const { session } = await api<{ session: Session }>(`orgs/${org.id}/roleplay`, { method: 'POST', body: { scenario: code, locale } });
      navigate(`/w/${org.id}/roleplay/${session.id}`);
    } catch (cause) {
      setStartError(problem(cause));
      setBusy(false);
    }
  }

  return <div className="training-page">
    <header className="training-head">
      <h1>{t('training.roleplay.title')}</h1>
      <p>{t('training.roleplay.lead', { turns: data.max_turns })}</p>
    </header>
    {startError && <p className="error" role="alert">{startError}</p>}
    {featured && <section className="training-card training-featured" aria-labelledby="training-featured">
      <p className="eyebrow">{t('training.roleplay.fromLesson')}</p>
      <h2 id="training-featured">{pick(featured.title)}</h2>
      <p>{pick(featured.goal)}</p>
      <p className="hint" lang="en"><strong>{t('training.roleplay.yourRole')}</strong> {featured.learner_role}</p>
      <button type="button" disabled={busy} onClick={() => void start(featured.code)}>{t('training.roleplay.start')}</button>
    </section>}

    <section className="training-card" aria-labelledby="training-scenarios">
      <h2 id="training-scenarios">{t('training.roleplay.choose')}</h2>
      <div className="company-toolbar">
        <label>{t('training.learn.track')}
          <select value={chosen} onChange={(event) => setTrack(event.target.value)}>
            {data.tracks.map((entry) => <option key={entry.code} value={entry.code}>{pick(entry.title)}{entry.code === data.recommended ? ` — ${t('training.learn.yourRole')}` : ''}</option>)}
          </select>
        </label>
      </div>
      <ul className="training-scenarios">
        {current.scenarios.map((scenario) => <ScenarioCard key={scenario.code} scenario={scenario} busy={busy} onStart={() => void start(scenario.code)}/>)}
      </ul>
    </section>

    <section className="training-card" aria-labelledby="training-recent">
      <h2 id="training-recent">{t('training.roleplay.recent')}</h2>
      {data.sessions.length === 0 ? <p>{t('training.roleplay.none')}</p> : <ul className="training-list">
        {data.sessions.map((session) => <li key={session.id}>
          <div>
            <strong>{session.title ? pick(session.title) : session.scenario_code}</strong>
            <span>{when(session.created_at)} · {session.status === 'active' ? t('training.roleplay.inProgress') : session.score !== null ? t('training.roleplay.scored', { score: session.score }) : t('training.roleplay.noFeedback')}</span>
          </div>
          <Link className="button-link quiet" to={`/w/${org.id}/roleplay/${session.id}`}>{session.status === 'active' ? t('training.roleplay.resume') : t('training.roleplay.open')}</Link>
        </li>)}
      </ul>}
    </section>
  </div>;
}

export function RoleplaySession({ id }: { id: string }) {
  const t = useAppT(), pick = useLocalized(), problem = useErrorText();
  const { locale } = useI18n();
  const { org } = useWorkspace();
  const { data, error, set } = useLoad<{ session: Session }>(`orgs/${org.id}/roleplay/${id}`);
  const draftKey = `training.roleplay.${id}`;
  const [draft, setDraft] = useState(() => readLocal(draftKey, ''));
  const [mode, setMode] = useState<'typed' | 'voice'>('typed');
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [failure, setFailure] = useState('');
  const [ended, setEnded] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(() => readLocal('training.autoSpeak', true));
  const [listening, setListening] = useState(false);
  const listener = useRef<Listener | null>(null);
  const log = useRef<HTMLOListElement>(null);
  const feedbackRef = useRef<HTMLElement>(null);
  const session = data?.session ?? null;

  useEffect(() => { log.current?.lastElementChild?.scrollIntoView({ block: 'nearest' }); }, [session?.turns.length]);
  useEffect(() => () => { listener.current?.stop(); stopSpeaking(); }, []);
  const saveDraft = (value: string) => { setDraft(value); writeLocal(draftKey, value || null); };

  if (!session) return <Loading error={error}/>;
  const scenario = session.scenario;
  const turnsLeft = session.max_turns - session.learner_turns;
  const canTalk = session.status === 'active' && turnsLeft > 0;

  function voice() {
    if (listening) { listener.current?.stop(); return; }
    setFailure('');
    const before = draft ? `${draft} ` : '';
    const started = listen({
      onText: (text) => saveDraft(`${before}${text}`),
      onEnd: (problemCode) => {
        setListening(false);
        listener.current = null;
        if (problemCode && problemCode !== 'no-speech' && problemCode !== 'aborted') setFailure(t('training.voice.failed'));
      },
    });
    if (!started) { setFailure(t('training.voice.failed')); return; }
    stopSpeaking();
    listener.current = started;
    setListening(true);
    setMode('voice');
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    listener.current?.stop();
    setBusy(true); setNotice(''); setFailure('');
    try {
      const result = await api<{ status: AiStatus; done?: boolean; session: Session }>(`orgs/${org.id}/roleplay/${id}/turn`, { method: 'POST', body: { text, mode, locale }, timeoutMs: 45000 });
      set({ session: result.session });
      const message = aiMessage(result.status);
      if (message) { setFailure(t(message)); return; }
      saveDraft('');
      setMode('typed');
      if (result.done) setEnded(true);
      const reply = result.session.turns[result.session.turns.length - 1];
      if (autoSpeak && reply?.role === 'ai') void speak(reply.text);
    } catch (cause) {
      setFailure(problem(cause));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    listener.current?.stop();
    stopSpeaking();
    setBusy(true); setNotice(''); setFailure('');
    try {
      const result = await api<{ status: AiStatus; session: Session }>(`orgs/${org.id}/roleplay/${id}/finish`, { method: 'POST', body: { locale }, timeoutMs: 60000 });
      set({ session: result.session });
      const message = aiMessage(result.status);
      if (message) setFailure(t(message === 'training.ai.unavailable' ? 'training.roleplay.feedbackFailed' : message));
      else if (result.status === 'no_turns') setNotice(t('training.roleplay.noTurns'));
      else queueMicrotask(() => feedbackRef.current?.focus());
    } catch (cause) {
      setFailure(problem(cause));
    } finally {
      setBusy(false);
    }
  }

  async function again() {
    if (!scenario) return;
    setBusy(true);
    try {
      const { session: next } = await api<{ session: Session }>(`orgs/${org.id}/roleplay`, { method: 'POST', body: { scenario: scenario.code, locale } });
      navigate(`/w/${org.id}/roleplay/${next.id}`);
    } catch (cause) {
      setFailure(problem(cause));
      setBusy(false);
    }
  }

  return <div className="training-page training-roleplay">
    <p className="training-crumbs"><Link to={`/w/${org.id}/roleplay`}>{t('training.nav.roleplay')}</Link></p>
    <header className="training-head">
      <h1>{scenario ? pick(scenario.title) : t('training.roleplay.title')}</h1>
      {scenario && <p>{pick(scenario.goal)} <span className={`company-badge ${DIFFICULTY_CLASS[scenario.difficulty]}`}>{t(`training.difficulty.${scenario.difficulty}` as AppKey)}</span></p>}
    </header>
    {scenario && <details className="training-brief">
      <summary>{t('training.roleplay.brief')}</summary>
      <p lang="en"><strong>{t('training.roleplay.yourRole')}</strong> {scenario.learner_role}</p>
      <p lang="en"><strong>{t('training.roleplay.situation')}</strong> {scenario.setting}</p>
      <p><strong>{t('training.roleplay.checklist')}</strong></p>
      <ul lang="en">{scenario.checklist.map((item) => <li key={item}>{item}</li>)}</ul>
    </details>}

    <section className="training-card training-chat" aria-labelledby="training-chat-title">
      <div className="training-chat-head">
        <h2 id="training-chat-title">{t('training.roleplay.conversation')}</h2>
        <span className="hint">{t('training.roleplay.turns', { used: session.learner_turns, total: session.max_turns })}</span>
        {canSpeak() && <label className="check"><input type="checkbox" checked={autoSpeak} onChange={(event) => { setAutoSpeak(event.target.checked); writeLocal('training.autoSpeak', event.target.checked); }}/>{t('training.roleplay.autoSpeak')}</label>}
      </div>
      <ol className="training-turns" ref={log} role="log" aria-live="polite" aria-label={t('training.roleplay.conversation')}>
        {session.turns.map((turn, index) => <li key={index} className={`training-turn is-${turn.role}`}>
          <span className="training-turn-who">{turn.role === 'ai' ? t('training.roleplay.character') : t('training.roleplay.you')}{turn.mode === 'voice' && ` · ${t('training.roleplay.spoken')}`}</span>
          <p lang="en">{turn.text}</p>
          {turn.role === 'ai' && <ListenButton text={turn.text}/>}
          {turn.tip && <p className="training-tip"><span aria-hidden="true">💡</span> {turn.tip}</p>}
        </li>)}
        {busy && session.status === 'active' && <li className="training-turn is-ai is-typing" aria-label={t('training.roleplay.thinking')}><p>…</p></li>}
      </ol>

      {failure && <p className="error" role="alert">{failure}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      {(ended || (session.status === 'active' && turnsLeft === 0)) && session.status === 'active' && <p className="notice" role="status">{t('training.roleplay.readyToFinish')}</p>}

      {canTalk && <form onSubmit={send} className="training-reply">
        <label>{t('training.roleplay.reply')}
          <textarea rows={3} maxLength={600} value={draft} lang="en" disabled={busy}
            onChange={(event) => { saveDraft(event.target.value); if (!listening) setMode('typed'); }}
            onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); (event.currentTarget.form as HTMLFormElement).requestSubmit(); } }}/>
        </label>
        <p className="hint">{canRecognize() ? t('training.roleplay.replyHint') : t('training.voice.unsupported')}</p>
        <div className="company-actions">
          <button disabled={busy || !draft.trim()}>{busy ? t('training.roleplay.sending') : t('training.roleplay.send')}</button>
          {canRecognize() && <button type="button" className={listening ? '' : 'quiet'} aria-pressed={listening} disabled={busy} onClick={voice}>
            {listening ? `■ ${t('training.voice.stop')}` : `🎤 ${t('training.voice.speak')}`}
          </button>}
          <button type="button" className="quiet" disabled={busy || session.learner_turns === 0} onClick={() => void finish()}>{t('training.roleplay.finish')}</button>
        </div>
        {listening && <p className="hint" role="status">{t('training.voice.listening')}</p>}
      </form>}
      {session.status === 'active' && !canTalk && <div className="company-actions"><button disabled={busy} onClick={() => void finish()}>{t('training.roleplay.finish')}</button></div>}
      {session.status === 'ended' && !session.feedback && session.learner_turns > 0 && <div className="company-actions">
        <button disabled={busy} onClick={() => void finish()}>{busy ? t('training.roleplay.feedbackWorking') : t('training.roleplay.getFeedback')}</button>
      </div>}
    </section>

    {session.feedback && <section className="training-card training-feedback" aria-labelledby="training-feedback" ref={feedbackRef} tabIndex={-1}>
      <h2 id="training-feedback">{t('training.roleplay.feedback')}</h2>
      <div className="training-feedback-score">
        <strong>{session.feedback.score}</strong><span>/100</span>
        <span className={`company-badge ${session.feedback.goal_met ? 'good' : 'warn'}`}>{session.feedback.goal_met ? t('training.roleplay.goalMet') : t('training.roleplay.goalNotMet')}</span>
      </div>
      <p>{session.feedback.summary}</p>
      {session.feedback.good_phrases.length > 0 && <>
        <h3>{t('training.roleplay.good')}</h3>
        <ul className="training-good" lang="en">{session.feedback.good_phrases.map((phrase) => <li key={phrase}>“{phrase}”</li>)}</ul>
      </>}
      {session.feedback.better_phrases.length > 0 && <>
        <h3>{t('training.roleplay.better')}</h3>
        <ul className="training-better">
          {session.feedback.better_phrases.map((item, index) => <li key={index}>
            {item.said && <span className="training-said" lang="en"><s>{item.said}</s></span>}
            <strong lang="en">{item.better}</strong>
            {item.why && <span>{item.why}</span>}
          </li>)}
        </ul>
      </>}
      {session.feedback.checklist.length > 0 && <>
        <h3>{t('training.roleplay.checklist')}</h3>
        <ul className="training-checklist">{session.feedback.checklist.map((item) => <li key={item.item} className={item.done ? 'is-done' : ''}><span aria-hidden="true">{item.done ? '✓' : '○'}</span> <span lang="en">{item.item}</span><span className="visually-hidden"> — {item.done ? t('training.done') : t('training.notYet')}</span></li>)}</ul>
      </>}
      {session.feedback.next_step && <p className="notice">{session.feedback.next_step}</p>}
      <p className="hint">{t('training.ai.label')}</p>
      <div className="company-actions">
        <button type="button" disabled={busy} onClick={() => void again()}>{t('training.roleplay.again')}</button>
        <Link className="button-link quiet" to={`/w/${org.id}/roleplay`}>{t('training.roleplay.other')}</Link>
      </div>
    </section>}
  </div>;
}
