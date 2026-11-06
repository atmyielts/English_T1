// /check: the free public level check. No sign-in; answers stay in this page until the
// visitor asks for a result, and a person is stored only if they send the form.
import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../../api.ts';
import { useAppT, useErrorText, type AppKey } from '../../../i18n/index.ts';
import { Link } from '../../../router.tsx';
import { canSpeak, speakLines, stopSpeaking } from '../../hiring/speech.ts';
import { SITE_URL } from '../catalog.ts';
import { PAGES, useContent } from '../content.ts';
import { DemoForm } from '../DemoForm.tsx';
import { SiteFrame } from '../SiteChrome.tsx';
import { fill, PageLoading } from './common.tsx';

interface Passage { id: string; kind: 'notice' | 'email' | 'voicemail'; title: string; lines: { speaker: string; text: string }[] }
interface Item { id: string; skill: string; level: string; passage?: string; prompt: string; options: string[] }
interface Bank { minutes: number; replays: number; skills: string[]; passages: Passage[]; items: Item[] }
interface Result {
  answered: number; total: number;
  overall: { score: number; level: string; label: string };
  skills: Record<string, { score: number; level: string; label: string; correct: number; total: number }>;
  review: { id: string; correct: boolean; answer: number }[];
}

/** Plays a voicemail at most `limit` times; falls back to the text when the browser has no speech. */
function Listening({ passage, plays, setPlays, limit, labels }: { passage: Passage; plays: number; setPlays: (value: number) => void; limit: number; labels: { play: string; playing: string; left: string; none: string; noSpeech: string } }) {
  const [playing, setPlaying] = useState(false);
  const stopped = useRef(false);
  useEffect(() => { stopped.current = false; return () => { stopped.current = true; stopSpeaking(); }; }, []);
  if (!canSpeak()) return <div className="site-check-passage"><p>{labels.noSpeech}</p><p lang="en">{passage.lines.map((line) => line.text).join(' ')}</p></div>;
  const left = Math.max(0, limit - plays);
  async function play() {
    setPlaying(true);
    setPlays(plays + 1);
    await speakLines(passage.lines, () => stopped.current);
    if (!stopped.current) setPlaying(false);
  }
  return <div className="site-check-passage site-check-audio">
    <button type="button" disabled={playing || left === 0} onClick={() => void play()}>{playing ? labels.playing : labels.play}</button>
    <span>{left > 0 ? fill(labels.left, { n: left }) : labels.none}</span>
  </div>;
}

export function CheckPage() {
  const t = useAppT(), problem = useErrorText();
  const text = useContent(PAGES);
  const [bank, setBank] = useState<Bank | null>(null);
  const [stage, setStage] = useState<'intro' | 'questions' | 'result'>('intro');
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [plays, setPlays] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [copied, setCopied] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (stage !== 'intro') heading.current?.focus(); }, [stage, index]);

  async function begin() {
    setBusy(true); setError('');
    try {
      setBank(bank ?? await api<Bank>('public/check', { auth: false }));
      setStage('questions'); setIndex(0); setAnswers({}); setPlays(0); setResult(null);
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    setBusy(true); setError('');
    try {
      setResult(await api<Result>('public/check/score', { method: 'POST', auth: false, body: { answers } }));
      setStage('result');
      scrollTo(0, 0);
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${SITE_URL}/check`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (!text) return <PageLoading path="/check"/>;
  const c = text.check;
  const seo = { title: c.metaTitle, description: c.metaDescription, path: '/check' };

  if (stage === 'intro' || !bank) return <SiteFrame seo={seo}>
    <section className="site-page-hero">
      <p className="site-eyebrow">{c.eyebrow}</p>
      <h1>{c.title}</h1>
      <p className="site-lead">{c.lead}</p>
      <ul className="site-ticks">{c.points.map((point) => <li key={point}>{point}</li>)}</ul>
      <div className="site-ctas site-check-start">
        <button className="site-cta" disabled={busy} onClick={() => void begin()}>{busy ? c.loading : c.start}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <p className="site-note">{c.estimateNote}</p>
    </section>
  </SiteFrame>;

  if (stage === 'questions') {
    const item = bank.items[index];
    const passage = item.passage ? bank.passages.find((candidate) => candidate.id === item.passage) : undefined;
    const last = index === bank.items.length - 1;
    const missing = bank.items.length - Object.keys(answers).length;
    return <SiteFrame seo={seo}>
      <section className="site-check">
        <div className="site-check-progress"><span style={{ width: `${((index + 1) / bank.items.length) * 100}%` }}/></div>
        <p className="site-check-count">{fill(c.question, { n: index + 1, total: bank.items.length })} · {t(`skill.${item.skill}` as AppKey)}</p>
        {passage && <>
          <h2 className="site-h3">{c.passage[passage.kind]}</h2>
          {passage.kind === 'voicemail'
            ? <Listening passage={passage} plays={plays} setPlays={setPlays} limit={bank.replays} labels={{ play: c.play, playing: c.playing, left: c.playsLeft, none: c.noPlays, noSpeech: c.noSpeech }}/>
            : <blockquote className="site-check-passage" lang="en">{passage.lines.map((line) => line.text).join(' ')}</blockquote>}
        </>}
        <h1 ref={heading} tabIndex={-1} className="site-check-prompt" lang="en">{item.prompt}</h1>
        <fieldset className="site-check-options">
          <legend className="visually-hidden">{c.choose}</legend>
          {item.options.map((option, optionIndex) => <label key={option} className={answers[item.id] === optionIndex ? 'site-check-option site-check-chosen' : 'site-check-option'} lang="en">
            <input type="radio" name={item.id} checked={answers[item.id] === optionIndex} onChange={() => setAnswers({ ...answers, [item.id]: optionIndex })}/>
            {option}
          </label>)}
        </fieldset>
        {last && missing > 0 && <p className="hint" role="status">{fill(c.unanswered, { n: missing })}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="site-check-nav">
          <button type="button" className="quiet" disabled={index === 0} onClick={() => setIndex(index - 1)}>{c.back}</button>
          {last
            ? <button type="button" disabled={busy || Object.keys(answers).length === 0} onClick={() => void finish()}>{busy ? t('app.loading') : c.finish}</button>
            : <button type="button" onClick={() => setIndex(index + 1)}>{c.next}</button>}
        </div>
      </section>
    </SiteFrame>;
  }

  const outcome = result!;
  return <SiteFrame seo={seo}>
    <section className="site-page-hero">
      <p className="site-eyebrow">{c.eyebrow}</p>
      <h1 ref={heading} tabIndex={-1}>{c.resultTitle}</h1>
      <p className="site-lead">{fill(c.resultLead, { n: outcome.total })}</p>
    </section>
    <section className="site-check-result">
      <div className="site-check-overall">
        <span>{c.overall}</span>
        <strong>{outcome.overall.label}</strong>
        <em>{t('site.estimate')}</em>
      </div>
      <div className="site-check-skills">
        <h2 className="site-h3">{c.bySkill}</h2>
        <ul>
          {bank.skills.map((skill) => {
            const row = outcome.skills[skill];
            return <li key={skill}>
              <span>{t(`skill.${skill}` as AppKey)}</span>
              <span className="site-hero-track"><span style={{ width: `${row.score}%` }}/></span>
              <b>{row.label}</b>
              <small>{fill(c.correctOf, { correct: row.correct, total: row.total })}</small>
            </li>;
          })}
        </ul>
      </div>
    </section>
    <section className="site-section-tight">
      <h2 className="site-h2">{c.meaningTitle}</h2>
      <p className="site-section-lead">{c.meaning[outcome.overall.level as keyof typeof c.meaning]}</p>
      <p><Link className="button-link quiet" to="/guide">{c.guideLink}</Link></p>
      <p className="site-note">{c.estimateNote}</p>
    </section>
    <section className="site-section-tight">
      <details className="site-check-review">
        <summary>{c.reviewTitle}</summary>
        <ol>
          {bank.items.map((item) => {
            const row = outcome.review.find((entry) => entry.id === item.id);
            const chosen = answers[item.id];
            return <li key={item.id}>
              <p lang="en">{item.prompt}</p>
              <p className={row?.correct ? 'site-good' : 'site-bad'}>{c.yourAnswer}: <span lang="en">{chosen === undefined ? c.noAnswer : item.options[chosen]}</span></p>
              {!row?.correct && row && <p>{c.correctAnswer}: <span lang="en">{item.options[row.answer]}</span></p>}
            </li>;
          })}
        </ol>
      </details>
      <p className="hint">{c.notStored}</p>
      <p><button type="button" className="quiet" onClick={() => void begin()}>{c.retry}</button></p>
    </section>
    <section className="site-section-tight site-check-share">
      <h2 className="site-h2">{c.shareTitle}</h2>
      <p className="site-section-lead">{c.shareLead}</p>
      <div className="site-ctas">
        <button type="button" className="quiet" onClick={() => void copy()}>{copied ? c.copied : c.copy}</button>
        <Link className="button-link" to="/solutions/placement">{t('site.solution.placement')}</Link>
      </div>
      <span className="visually-hidden" role="status">{copied ? c.copied : ''}</span>
    </section>
    <section className="site-section site-demo" id="demo" aria-labelledby="site-demo-title">
      <div className="site-demo-intro">
        <h2 id="site-demo-title" className="site-h2">{c.formTitle}</h2>
        <p className="site-section-lead">{c.formLead}</p>
      </div>
      <DemoForm source="check" checkAnswers={answers}/>
    </section>
  </SiteFrame>;
}
