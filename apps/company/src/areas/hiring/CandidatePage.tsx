// /t/:token — the public candidate test: intro, details and consent, microphone
// and sound checks, the test itself, and a thank-you page (with the level when the
// company allows it). The attempt key stays in localStorage so a reload resumes.
import React, { useEffect, useRef, useState, type FormEvent } from 'react';
import { LocaleSwitcher } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { canRecognize, canSpeak, speak, stopSpeaking } from './speech.ts';
import { TestRunner, type RunnerBody, type Transport } from './TestRunner.tsx';
import type { AttemptView } from './types.ts';
import { LevelBadge, SkillBars, skillText, useHiringError } from './ui.tsx';
import type { Skill } from '../../../../../packages/company-core/src/mod.ts';

interface Intro {
  test: { company: string; title: string; job_role: string; skills: Skill[]; time_limit_minutes: number; suggested_minutes: number; closes_at: string | null; show_level: boolean; speaking: boolean; listening: boolean; locale: string };
  open: boolean;
}

const SAMPLE = 'Hello. This is a short sound check before your English test. If you can hear this clearly, you are ready.';
const keyStore = (token: string) => `company-test:${token}`;
const readKey = (token: string) => { try { return localStorage.getItem(keyStore(token)); } catch { return null; } };
const writeKey = (token: string, key: string | null) => {
  try { if (key) localStorage.setItem(keyStore(token), key); else localStorage.removeItem(keyStore(token)); } catch { /* resume works only in this tab */ }
};

function Frame({ company, children }: { company?: string; children: React.ReactNode }) {
  const t = useAppT();
  return <div className="hiring-public">
    <header className="hiring-public-header">
      <div className="brand">Schood <span>{company ?? t('app.name')}</span></div>
      <LocaleSwitcher label={t('locale.label')}/>
    </header>
    <main id="workspace-main" className="hiring-public-main">{children}</main>
    <footer className="hiring-public-footer">{t('hiring.candidate.poweredBy')}</footer>
  </div>;
}

export function CandidatePage({ token }: { token: string }) {
  const t = useAppT(), problem = useHiringError();
  const [intro, setIntro] = useState<Intro | null>(null);
  const [view, setView] = useState<AttemptView | null>(null);
  const [key, setKey] = useState<string | null>(() => readKey(token));
  const [phase, setPhase] = useState<'loading' | 'intro' | 'details' | 'running' | 'done' | 'invalid'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const info = await api<Intro>(`public/t/${encodeURIComponent(token)}`, { auth: false });
        if (cancelled) return;
        setIntro(info);
        const saved = readKey(token);
        if (saved) {
          try {
            const state = await api<{ attempt: AttemptView }>('public/attempts/state', { method: 'POST', body: { key: saved }, auth: false });
            if (cancelled) return;
            setView(state.attempt);
            setPhase(state.attempt.status === 'started' ? 'running' : 'done');
            return;
          } catch {
            writeKey(token, null);
            setKey(null);
          }
        }
        setPhase('intro');
      } catch (cause) {
        if (cancelled) return;
        setError(problem(cause));
        setPhase('invalid');
      }
    })();
    return () => { cancelled = true; };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === 'loading') return <Frame><p role="status">{t('app.loading')}</p></Frame>;
  if (phase === 'invalid' || !intro) return <Frame><section className="hiring-narrow"><h1>{t('hiring.candidate.invalidTitle')}</h1><p className="error" role="alert">{error || t('hiring.error.link_not_found')}</p></section></Frame>;
  const { test } = intro;

  if (phase === 'running' && view && key) {
    const call = (path: string, body: RunnerBody) => api<{ attempt?: AttemptView }>(`public/attempts/${path}`, { method: 'POST', body: { key, ...body }, auth: false, timeoutMs: 90_000 });
    const transport: Transport = {
      save: async (body) => (await call('save', body)).attempt ?? null,
      next: async (body) => (await call('next', body)).attempt!,
      submit: async (body) => (await call('submit', body)).attempt!,
    };
    return <Frame company={test.company}>
      <TestRunner initial={view} transport={transport} storageKey={`company-test:${token}`} onDone={(done) => { setView(done); setPhase('done'); scrollTo(0, 0); }}/>
    </Frame>;
  }

  if (phase === 'done' && view) return <Frame company={test.company}><ThankYou view={view} company={test.company}/></Frame>;

  if (!intro.open) return <Frame company={test.company}><section className="hiring-narrow"><h1>{test.title}</h1><p className="error" role="alert">{t('hiring.candidate.closed', { company: test.company })}</p></section></Frame>;

  return <Frame company={test.company}>
    <section className="hiring-narrow hiring-intro">
      <p className="eyebrow">{t('hiring.candidate.from', { company: test.company })}</p>
      <h1>{test.title}</h1>
      <p>{t('hiring.candidate.forRole', { role: t(`job.${test.job_role}` as AppKey) })}</p>
      <div className="hiring-facts">
        <div className="company-stat"><strong>{t('common.minutes', { count: test.time_limit_minutes })}</strong><span>{t('hiring.take.timeLimit')}</span></div>
        <div className="company-stat"><strong>{test.skills.length}</strong><span>{t('hiring.take.sectionsCount', { count: test.skills.length })}</span></div>
      </div>
      <h2>{t('hiring.take.sections')}</h2>
      <ol className="hiring-section-list">{test.skills.map((skill) => <li key={skill}><strong>{skillText(t, skill)}</strong> <span>{t(`hiring.skillInfo.${skill}` as AppKey)}</span></li>)}</ol>
      <Rules skills={test.skills}/>
      {phase === 'intro'
        ? <div className="company-actions"><button type="button" onClick={() => setPhase('details')}>{t('hiring.candidate.begin')}</button></div>
        : <Details token={token} intro={intro} onStarted={(newKey, attempt) => { writeKey(token, newKey); setKey(newKey); setView(attempt); setPhase('running'); scrollTo(0, 0); }}/>}
    </section>
  </Frame>;
}

export function Rules({ skills }: { skills: Skill[] }) {
  const t = useAppT();
  const rules: AppKey[] = ['hiring.take.rule.autosave', 'hiring.take.rule.timer', 'hiring.take.rule.order', 'hiring.take.rule.focus'];
  if (skills.includes('grammar') || skills.includes('vocabulary')) rules.push('hiring.take.rule.adaptive');
  if (skills.includes('listening')) rules.push('hiring.take.rule.listening');
  if (skills.includes('speaking')) rules.push('hiring.take.rule.speaking');
  return <>
    <h2>{t('hiring.take.rules')}</h2>
    <ul className="hiring-rules">{rules.map((rule) => <li key={rule}>{t(rule)}</li>)}</ul>
  </>;
}

function Details({ token, intro, onStarted }: { token: string; intro: Intro; onStarted: (key: string, attempt: AttemptView) => void }) {
  const t = useAppT(), problem = useHiringError();
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const { test } = intro;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const started = await api<{ key: string; attempt: AttemptView }>(`public/t/${encodeURIComponent(token)}/start`, { method: 'POST', body: { ...form, consent }, auth: false });
      onStarted(started.key, started.attempt);
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  return <>
    {(test.speaking || test.listening) && <div className="hiring-checks">
      {test.listening && <SoundCheck/>}
      {test.speaking && <MicCheck/>}
    </div>}
    <form onSubmit={submit} className="hiring-details">
      <h2>{t('hiring.candidate.detailsTitle')}</h2>
      <label>{t('hiring.candidate.name')}<input required minLength={2} maxLength={120} autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/></label>
      <label>{t('hiring.candidate.email')}<input required type="email" maxLength={200} autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })}/></label>
      <label>{t('hiring.candidate.phone')}<input type="tel" maxLength={40} autoComplete="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })}/></label>
      <label className="check hiring-consent"><input type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)}/>
        <span>{t('hiring.candidate.consent', { company: test.company })}</span>
      </label>
      <button disabled={busy || !consent}>{busy ? t('hiring.run.working') : t('hiring.candidate.start')}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  </>;
}

function SoundCheck() {
  const t = useAppT();
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => stopSpeaking(), []);
  return <div className="hiring-check">
    <h2>{t('hiring.candidate.audioTitle')}</h2>
    {canSpeak() ? <>
      <p className="hint">{t('hiring.candidate.audioLead')}</p>
      <button type="button" className="quiet" disabled={playing} onClick={() => { setPlaying(true); void speak(SAMPLE).finally(() => setPlaying(false)); }}>{playing ? t('hiring.run.playing') : t('hiring.candidate.audioPlay')}</button>
    </> : <p className="hint">{t('hiring.candidate.audioNo')}</p>}
  </div>;
}

/** Asks for the microphone, shows a live level for a few seconds, and says whether speech-to-text is available. */
function MicCheck() {
  const t = useAppT();
  const [state, setState] = useState<'idle' | 'listening' | 'ok' | 'quiet' | 'denied'>('idle');
  const [level, setLevel] = useState(0);
  const cleanup = useRef<() => void>(() => undefined);
  useEffect(() => () => cleanup.current(), []);
  async function check() {
    cleanup.current();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      let peak = 0, frame = 0;
      const started = Date.now();
      setState('listening');
      const stop = () => { cancelAnimationFrame(frame); stream.getTracks().forEach((track) => track.stop()); void context.close().catch(() => undefined); };
      cleanup.current = stop;
      const loop = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const value of data) sum += (value - 128) ** 2;
        const rms = Math.sqrt(sum / data.length) / 128;
        peak = Math.max(peak, rms);
        setLevel(Math.min(1, rms * 4));
        if (peak > 0.06 && Date.now() - started > 1200) { stop(); setLevel(0); setState('ok'); return; }
        if (Date.now() - started > 8000) { stop(); setLevel(0); setState('quiet'); return; }
        frame = requestAnimationFrame(loop);
      };
      loop();
    } catch {
      setState('denied');
    }
  }
  return <div className="hiring-check">
    <h2>{t('hiring.candidate.micTitle')}</h2>
    <p className="hint">{canRecognize() ? t('hiring.candidate.recognitionYes') : t('hiring.candidate.recognitionNo')}</p>
    <div className="company-actions">
      <button type="button" className="quiet" disabled={state === 'listening'} onClick={() => void check()}>{t('hiring.candidate.micCheck')}</button>
      {state === 'listening' && <span className="hiring-meter" role="img" aria-label={t('hiring.candidate.micListening')}><b style={{ width: `${Math.round(level * 100)}%` }}/></span>}
    </div>
    <p role="status" className={state === 'ok' ? 'notice' : state === 'quiet' || state === 'denied' ? 'hint' : 'hint'}>
      {state === 'listening' ? t('hiring.candidate.micListening') : state === 'ok' ? t('hiring.candidate.micOk') : state === 'quiet' ? t('hiring.candidate.micQuiet') : state === 'denied' ? t('hiring.candidate.micDenied') : ''}
    </p>
  </div>;
}

function ThankYou({ view, company }: { view: AttemptView; company: string }) {
  const t = useAppT();
  const result = view.result;
  return <section className="hiring-narrow hiring-thanks">
    <div className="hiring-check-mark" aria-hidden="true">✓</div>
    <h1>{view.status === 'expired' ? t('hiring.candidate.expiredTitle') : t('hiring.candidate.thanksTitle')}</h1>
    <p>{view.status === 'expired' ? t('hiring.candidate.expired') : t('hiring.candidate.thanksLead', { company })}</p>
    {view.status === 'submitted' && <p className="notice" role="status">{t('hiring.candidate.pending')}</p>}
    {result && <div className="hiring-result">
      <p className="eyebrow">{t('hiring.candidate.yourLevel')}</p>
      <p className="hiring-result-level"><LevelBadge level={result.overall_level}/></p>
      <SkillBars skills={view.sections.map((section) => section.skill)} results={result.skills}/>
      {result.certificate_code && <p>{t('hiring.candidate.certificate', { code: result.certificate_code })} <Link to={`/v/${result.certificate_code}`}>{t('hiring.candidate.verify')}</Link></p>}
      <p className="hint">{t('hiring.report.estimateNote')}</p>
    </div>}
    <p className="hint">{t('hiring.candidate.closeNote')}</p>
  </section>;
}
