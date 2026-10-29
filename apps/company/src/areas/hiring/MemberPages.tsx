// Staff tests for signed-in members: "My tests" (/w/:org/tests), one test with its
// intro, the test itself and the result (/w/:org/test/:assessment).
import React, { useState } from 'react';
import type { Level, Skill } from '../../../../../packages/company-core/src/mod.ts';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { Rules } from './CandidatePage.tsx';
import { TestRunner, type RunnerBody, type Transport } from './TestRunner.tsx';
import type { AttemptView, Feedback, Kind } from './types.ts';
import { LevelBadge, SkillBars, skillText, useFormat, useHiringError, useLoad } from './ui.tsx';

interface MyTest { assessment_id: string; title: string; kind: Kind; status: 'todo' | 'in_progress' | 'done'; level: Level | null; attempt_id: string | null; deadline_at: string | null }
interface MyResult {
  attempt_id: string; overall_level: Level | null; overall_score: number | null; graded_at: string | null; certificate_code: string | null;
  skills: Partial<Record<Skill, { level: Level; score: number } | null>>; feedback: { writing: Feedback | null; speaking: Feedback | null };
}
interface TestInfo {
  test: { id: string; title: string; kind: Kind; skills: Skill[]; time_limit_minutes: number; closes_at: string | null; suggested_minutes: number; retest_days: number | null };
  status: 'todo' | 'in_progress' | 'done'; closed: boolean; can_start: boolean; attempt_id: string | null; retest_at: string | null; result: MyResult | null; pending: boolean;
}

export function MyTestsPage() {
  const t = useAppT(), format = useFormat();
  const { org } = useWorkspace();
  const { data, error } = useLoad(() => api<{ tests: MyTest[] }>(`orgs/${org.id}/my/tests`), [org.id]);
  const certificates = useLoad(() => api<{ attempts: (MyResult & { title: string | null })[] }>(`orgs/${org.id}/my/attempts`), [org.id]);
  return <section>
    <h1>{t('hiring.my.title')}</h1>
    <p>{t('hiring.my.lead')}</p>
    {error && <p className="error" role="alert">{error}</p>}
    {!data && !error && <p role="status">{t('app.loading')}</p>}
    {data && (data.tests.length === 0 ? <p>{t('hiring.my.empty')}</p> : <ul className="hiring-cards">
      {data.tests.map((test) => <li key={test.assessment_id} className="hiring-card">
        <div>
          <p className="eyebrow">{t(`hiring.kind.${test.kind}` as AppKey)}</p>
          <h2>{test.title}</h2>
          <p className="hiring-card-meta">
            <span className={`company-badge ${test.status === 'done' ? 'good' : test.status === 'in_progress' ? 'warn' : ''}`}>{t(`hiring.my.status.${test.status}` as AppKey)}</span>
            {test.level && <LevelBadge level={test.level}/>}
            {test.deadline_at && test.status !== 'done' && <span>{t('hiring.my.due', { date: format.dateTime(test.deadline_at) })}</span>}
          </p>
        </div>
        <Link className="button-link" to={`/w/${org.id}/test/${test.assessment_id}`}>{test.status === 'todo' ? t('hiring.my.start') : test.status === 'in_progress' ? t('hiring.my.continue') : t('hiring.my.view')}</Link>
      </li>)}
    </ul>)}
    {certificates.data && certificates.data.attempts.length > 0 && <>
      <h2>{t('hiring.my.certificates')}</h2>
      <ul className="records">
        {certificates.data.attempts.map((attempt) => <li key={attempt.attempt_id}>
          <strong>{attempt.title}</strong>
          <span><LevelBadge level={attempt.overall_level}/> · {format.date(attempt.graded_at)}</span>
          {attempt.certificate_code && <Link to={`/v/${attempt.certificate_code}`}>{t('hiring.take.certificate')}</Link>}
        </li>)}
      </ul>
    </>}
  </section>;
}

export function MemberTestPage({ assessmentId }: { assessmentId: string }) {
  const t = useAppT(), problem = useHiringError(), format = useFormat();
  const { org } = useWorkspace();
  const info = useLoad(() => api<TestInfo>(`orgs/${org.id}/my/tests/${assessmentId}`), [org.id, assessmentId]);
  const [running, setRunning] = useState<AttemptView | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');

  async function begin() {
    setBusy(true); setError('');
    try {
      const response = info.data?.attempt_id
        ? await api<{ attempt: AttemptView }>(`orgs/${org.id}/my/attempts/${info.data.attempt_id}`)
        : await api<{ attempt: AttemptView }>(`orgs/${org.id}/my/attempts`, { method: 'POST', body: { assessment_id: assessmentId } });
      if (response.attempt.status === 'started') setRunning(response.attempt);
      else await info.reload();
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }

  if (running) {
    const call = (path: string, body: RunnerBody) => api<{ attempt?: AttemptView }>(`orgs/${org.id}/my/attempts/${running.id}/${path}`, { method: 'POST', body, timeoutMs: 90_000 });
    const transport: Transport = {
      save: async (body) => (await call('save', body)).attempt ?? null,
      next: async (body) => (await call('next', body)).attempt!,
      submit: async (body) => (await call('submit', body)).attempt!,
    };
    return <TestRunner initial={running} transport={transport} storageKey={`company-staff-test:${org.id}`} onDone={() => { setRunning(null); void info.reload(); }}/>;
  }

  if (info.error) return <section><p className="error" role="alert">{info.error}</p><p><Link to={`/w/${org.id}/tests`}>{t('hiring.my.back')}</Link></p></section>;
  if (!info.data) return <p role="status">{t('app.loading')}</p>;
  const { test, result } = info.data;
  return <div className="hiring-stack">
    <p><Link to={`/w/${org.id}/tests`}>← {t('hiring.my.back')}</Link></p>
    <section className="hiring-intro">
      <p className="eyebrow">{t(`hiring.kind.${test.kind}` as AppKey)}</p>
      <h1>{test.title}</h1>
      <div className="hiring-facts">
        <div className="company-stat"><strong>{t('common.minutes', { count: test.time_limit_minutes })}</strong><span>{t('hiring.take.timeLimit')}</span></div>
        <div className="company-stat"><strong>{test.skills.length}</strong><span>{t('hiring.take.sectionsCount')}</span></div>
        {test.closes_at && <div className="company-stat"><strong>{format.date(test.closes_at)}</strong><span>{t('hiring.take.closes')}</span></div>}
      </div>
      {info.data.status !== 'done' && <>
        <h2>{t('hiring.take.sections')}</h2>
        <ol className="hiring-section-list">{test.skills.map((skill) => <li key={skill}><strong>{skillText(t, skill)}</strong> <span>{t(`hiring.skillInfo.${skill}` as AppKey)}</span></li>)}</ol>
        <Rules skills={test.skills}/>
      </>}
      {info.data.pending && <p className="notice" role="status">{t('hiring.take.pending')}</p>}
      {info.data.status === 'done' && !info.data.pending && <p>{t('hiring.take.done')}</p>}
      {info.data.retest_at && info.data.status === 'done' && <p className="hint">{t('hiring.take.retestAt', { date: format.date(info.data.retest_at) })}</p>}
      {info.data.closed && info.data.status !== 'done' && <p className="error" role="alert">{t('hiring.error.test_closed')}</p>}
      {(info.data.can_start || info.data.status === 'in_progress') && <div className="company-actions">
        <button type="button" disabled={busy} onClick={() => void begin()}>{busy ? t('hiring.run.working') : info.data.status === 'in_progress' ? t('hiring.take.resume') : result ? t('hiring.take.retake') : t('hiring.take.start')}</button>
      </div>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
    {result && <ResultCard result={result} skills={test.skills}/>}
  </div>;
}

function ResultCard({ result, skills }: { result: MyResult; skills: Skill[] }) {
  const t = useAppT(), format = useFormat();
  return <section className="hiring-result" aria-labelledby="my-result">
    <div className="page-heading">
      <h2 id="my-result">{t('hiring.take.result')}</h2>
      <div className="company-actions no-print">
        {result.certificate_code && <Link className="button-link quiet" to={`/v/${result.certificate_code}`}>{t('hiring.take.certificate')}</Link>}
      </div>
    </div>
    <p className="hiring-result-level"><LevelBadge level={result.overall_level}/> <span className="hiring-muted">{format.score(result.overall_score)} / 100 · {format.date(result.graded_at)}</span></p>
    <SkillBars skills={skills} results={result.skills}/>
    {(['writing', 'speaking'] as const).map((skill) => result.feedback[skill] && <FeedbackBlock key={skill} skill={skill} feedback={result.feedback[skill]!}/>)}
    <p className="hint">{t('hiring.report.estimateNote')}</p>
  </section>;
}

export function FeedbackBlock({ skill, feedback }: { skill: Skill; feedback: Feedback }) {
  const t = useAppT();
  return <div className="hiring-feedback">
    <h3>{skillText(t, skill)} — {t('hiring.report.feedback')}</h3>
    {feedback.summary && <p>{feedback.summary}</p>}
    <div className="hiring-feedback-grid">
      {feedback.strengths.length > 0 && <div><h4>{t('hiring.report.strengths')}</h4><ul>{feedback.strengths.map((line) => <li key={line}>{line}</li>)}</ul></div>}
      {feedback.improvements.length > 0 && <div><h4>{t('hiring.report.improvements')}</h4><ul>{feedback.improvements.map((line) => <li key={line}>{line}</li>)}</ul></div>}
    </div>
    <dl className="hiring-criteria">
      {Object.entries(feedback.criteria).map(([name, value]) => <div key={name}><dt>{t(`hiring.criteria.${name}` as AppKey)}</dt><dd><span className="hiring-mini"><b style={{ width: `${value}%` }}/></span> {value}</dd></div>)}
    </dl>
    {skill === 'speaking' && <p className="hint">{feedback.typed_only ? t('hiring.report.typedOnly') : t('hiring.report.transcriptBased')}</p>}
  </div>;
}
