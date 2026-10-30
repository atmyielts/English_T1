import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AskSchoodAI } from '../../../../../packages/schood-ai-link/src/index.tsx';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { useAppT, type AppKey } from '../../i18n';
import { gradeWriting, scoreSession, toeflSpeaking, type ScoreSessionResponse } from '../../lib/platformClient';
import { supabase } from '../../lib/supabase';
import {
  isRecord,
  nextStepModules,
  playbookDiagnosticUrl,
  playbookModuleUrl,
  TOEFL_2026_SECTIONS,
  type Toefl2026Section,
  type Toefl2026Task,
} from './tasks';
import './toefl2026.css';
import { toefl2026From } from './resultShape';

type Json = Record<string, unknown>;
type AiState = 'idle' | 'running' | 'done' | 'error';

const reasonKey = (reason: string | null | undefined): AppKey | null => {
  switch (reason) {
    case 'writing_ai_pending': return 'results.reason.writing_ai_pending';
    case 'speaking_pending': return 'results.reason.speaking_pending';
    case 'speaking_no_transcript': return 'results.reason.speaking_no_transcript';
    case 'no_scored_items': return 'results.reason.no_scored_items';
    case 'practice_set': return 'results.reason.practice_set';
    default: return null;
  }
};

const aiErrorKey = (err: unknown): AppKey => {
  const details = (err as { details?: unknown })?.details;
  const code = isRecord(details) ? String(details.code ?? '') : '';
  if (code === 'ai_disabled' || code === 'ai_not_configured') return 'results.ai_disabled';
  if (code === 'ai_limit_reached') return 'results.ai_limit';
  if (code === 'usage_limit_reached') return 'results.writing_limit';
  if (code === 'no_writing_answer') return 'results.no_writing';
  return 'results.ai_failed';
};


export const Toefl2026Results: React.FC<{
  sessionId: string;
  accessToken: string;
  initial: ScoreSessionResponse;
  backPath: string;
  isCandidate: boolean;
}> = ({ sessionId, accessToken, initial, backPath, isCandidate }) => {
  const t = useAppT();
  const { date } = useI18n();
  const [data, setData] = useState<ScoreSessionResponse>(initial);
  const [writingState, setWritingState] = useState<AiState>('idle');
  const [speakingState, setSpeakingState] = useState<AiState>('idle');
  const [writingError, setWritingError] = useState<AppKey | null>(null);
  const [speakingError, setSpeakingError] = useState<AppKey | null>(null);
  const [writingEval, setWritingEval] = useState<Json | null>(null);
  const [speakingEval, setSpeakingEval] = useState<Json | null>(null);
  const started = useRef(false);
  const result = toefl2026From(data)!;

  const rescore = useCallback(async () => {
    try { setData(await scoreSession(accessToken, sessionId)); } catch { /* keep the previous result */ }
  }, [accessToken, sessionId]);

  const runWriting = useCallback(async (force: boolean) => {
    setWritingState('running');
    setWritingError(null);
    try {
      const res = await gradeWriting(accessToken, sessionId, { force });
      setWritingEval((res.evaluation?.result ?? null) as Json | null);
      setWritingState('done');
      return true;
    } catch (err) {
      setWritingError(aiErrorKey(err));
      setWritingState('error');
      return false;
    }
  }, [accessToken, sessionId]);

  const runSpeaking = useCallback(async (force: boolean) => {
    setSpeakingState('running');
    setSpeakingError(null);
    try {
      const res = await toeflSpeaking(accessToken, sessionId, { force });
      setSpeakingEval((res.evaluation?.result ?? null) as Json | null);
      setSpeakingState('done');
      return true;
    } catch (err) {
      setSpeakingError(aiErrorKey(err));
      setSpeakingState('error');
      return false;
    }
  }, [accessToken, sessionId]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const r = toefl2026From(initial);
    if (!r) return;
    const needWriting = r.tasks.some((x) => x.task === 'write_email' || x.task === 'write_academic_discussion');
    const needSpeaking = r.tasks.some((x) => x.task === 'listen_repeat' || x.task === 'take_interview');
    void (async () => {
      // Existing evaluations are shown immediately; missing ones are requested once.
      const { data: evals } = await supabase.from('evaluations').select('method, result').eq('session_id', sessionId).in('method', ['ai', 'ai_speaking']);
      const ai = (evals ?? []).find((e: { method: string }) => e.method === 'ai') as { result: Json } | undefined;
      const sp = (evals ?? []).find((e: { method: string }) => e.method === 'ai_speaking') as { result: Json } | undefined;
      if (ai) { setWritingEval(ai.result); setWritingState('done'); }
      if (sp) { setSpeakingEval(sp.result); setSpeakingState('done'); }
      const jobs: Array<Promise<boolean>> = [];
      if (needWriting && !ai) jobs.push(runWriting(false));
      if (needSpeaking && !sp) jobs.push(runSpeaking(false));
      if (jobs.length) {
        const outcomes = await Promise.all(jobs);
        if (outcomes.some(Boolean)) await rescore();
      }
    })();
  }, [initial, runSpeaking, runWriting, rescore, sessionId]);

  const sectionName = (s: Toefl2026Section) => t(`section.${s}` as AppKey);
  const taskName = (task: Toefl2026Task) => t(`task.${task}` as AppKey);
  const overall = result.overall_band;
  const steps = nextStepModules(result.tasks, 3);
  const writingTasks = isRecord(writingEval) && Array.isArray(writingEval.tasks) ? (writingEval.tasks as Json[]) : [];
  const speakingItems = isRecord(speakingEval) && Array.isArray(speakingEval.items) ? (speakingEval.items as Json[]) : [];
  const speakingBasic = isRecord(speakingEval) && speakingEval.interview_rater === 'basic' && speakingItems.some((i) => i.task === 'take_interview');
  const computedAt = (data.result as unknown as Json).computed_at;

  return (
    <div className="t26-results" data-testid="toefl2026-results">
      <p className="t26-muted">{t('format.2026')} · {t('runner.estimate_flag')}</p>
      <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{t('results.title')}</h1>
      <p className="t26-muted">{t('results.subtitle')}</p>

      <div className="t26-bands" style={{ marginTop: '1rem' }}>
        <div className="t26-band-card is-overall" data-testid="overall-band">
          <div className="t26-band-label">{t('results.overall')}</div>
          <div className="t26-band-value">{overall != null ? overall.toFixed(1) : '—'}</div>
          {overall != null ? (
            <>
              <div className="t26-band-meta">{t('results.cefr', { level: result.overall_cefr ?? '' })}</div>
              <div className="t26-band-meta">{t('results.legacy_total', { min: result.overall_legacy_total_min ?? 0 })}</div>
            </>
          ) : (
            <div className="t26-band-meta">{result.mode === 'full_test' ? t('results.overall_pending') : result.mode === 'practice' ? t('results.practice_note') : t('results.overall_not_full')}</div>
          )}
        </div>
        {TOEFL_2026_SECTIONS.map((s) => {
          const sec = result.sections[s];
          if (!sec) return null;
          const reason = reasonKey(sec.pending_reason);
          return (
            <div key={s} className="t26-band-card" data-testid={`band-${s}`}>
              <div className="t26-band-label">{sectionName(s)}</div>
              <div className="t26-band-value">{sec.band != null ? sec.band.toFixed(1) : sec.raw != null && result.mode === 'practice' ? `${sec.raw}/${sec.max}` : '—'}</div>
              {sec.band != null ? (
                <>
                  <div className="t26-band-meta">{t('results.cefr', { level: sec.cefr ?? '' })}</div>
                  {sec.legacy_range ? <div className="t26-band-meta">{t('results.legacy_section', { min: sec.legacy_range.min, max: sec.legacy_range.max })}</div> : null}
                </>
              ) : reason ? <div className="t26-band-meta">{t(reason)}</div> : null}
              {sec.raw != null && sec.band != null ? <div className="t26-band-meta">{t('results.points', { raw: sec.raw, max: sec.max })}</div> : null}
              {sec.module_path ? <div className="t26-band-meta">{sec.module_path === 'upper' ? t('results.module_upper') : t('results.module_lower')}</div> : null}
              {sec.router && sec.router.max > 0 ? (
                <div className="t26-band-meta">{t('results.router', { raw: sec.router.raw, max: sec.router.max, pct: Math.round((sec.router.raw / sec.router.max) * 100) })}</div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="t26-warn" style={{ marginTop: '1rem' }}>{t('results.disclaimer')}</div>
      {result.sections.speaking?.pending_reason === 'speaking_no_transcript' ? <div className="t26-warn">{t('results.speaking_no_stt')}</div> : null}

      <h2 className="text-lg font-bold mt-6 mb-2">{t('results.what_next')}</h2>
      <div className="t26-next-links">
        <a className="t26-next-link is-primary" href={playbookDiagnosticUrl(sessionId)} data-testid="playbook-diagnostic">
          {t('results.diagnostic')}
          <div className="t26-band-meta" style={{ fontWeight: 400 }}>{t('results.diagnostic_body')}</div>
        </a>
        {steps.map((s) => (
          <a key={s.task} className="t26-next-link" href={playbookModuleUrl(s.slug)} data-testid="playbook-module">
            {t('results.module_link', { task: taskName(s.task) })}
          </a>
        ))}
        {steps[0] ? <Link className="t26-next-link" to={`/practice?task=${steps[0].task}`}>{t('results.practice_again')}: {taskName(steps[0].task)}</Link> : null}
        <AskSchoodAI source="toefl" session={sessionId}/>
      </div>

      <h2 className="text-lg font-bold mt-6 mb-2">{t('results.task_breakdown')}</h2>
      <div className="t26-results-table-wrap">
        <table className="t26-results-table">
          <thead><tr><th>{t('results.task')}</th><th>{t('results.score')}</th></tr></thead>
          <tbody>
            {result.tasks.map((task) => (
              <tr key={task.task}>
                <td>{taskName(task.task)}<div className="t26-muted">{sectionName(task.section)}</div></td>
                <td>{task.raw}/{task.max} <span className="t26-muted">{task.scale === '0-5' ? t('results.scale_05') : t('results.scale_points')}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {writingTasks.length > 0 || writingState === 'running' || writingError ? (
        <section className="t26-feedback" data-testid="writing-feedback">
          <h2 className="text-lg font-bold">{t('results.writing_feedback')}</h2>
          {writingState === 'running' ? <p className="t26-muted">{t('results.ai_running')}</p> : null}
          {writingError ? (
            <p className="t26-warn">{t(writingError)} <button type="button" className="t26-link-button" onClick={() => void runWriting(false).then((ok) => { if (ok) void rescore(); })}>{t('common.retry')}</button></p>
          ) : null}
          {writingTasks.map((task, i) => (
            <div key={String(task.content_unit_id ?? i)} className="t26-card">
              <p className="t26-strong">{task.task_type === 'toefl_email' ? t('task.write_email') : t('task.write_academic_discussion')}: {task.score != null ? `${String(task.score)}/5` : t('results.pending')}</p>
              {task.feedback ? <p>{String(task.feedback)}</p> : null}
              {Array.isArray(task.actionable_feedback) && task.actionable_feedback.length ? (
                <ul>{(task.actionable_feedback as unknown[]).map((x, j) => <li key={j}>{String(x)}</li>)}</ul>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      {speakingItems.length > 0 || speakingState === 'running' || speakingError ? (
        <section className="t26-feedback" data-testid="speaking-feedback">
          <h2 className="text-lg font-bold">{t('results.speaking_feedback')}</h2>
          {speakingState === 'running' ? <p className="t26-muted">{t('results.ai_running')}</p> : null}
          {speakingError ? (
            <p className="t26-warn">{t(speakingError)} <button type="button" className="t26-link-button" onClick={() => void runSpeaking(false).then((ok) => { if (ok) void rescore(); })}>{t('common.retry')}</button></p>
          ) : null}
          {speakingBasic ? <p className="t26-muted">{t('results.speaking_basic')}</p> : null}
          {speakingItems.map((item, i) => (
            <div key={String(item.content_unit_id ?? i)} className="t26-card">
              <p className="t26-strong">{item.task === 'listen_repeat' ? t('task.listen_repeat') : t('task.take_interview')}: {String(item.score)}/5</p>
              <p className="t26-muted">{t('speak.transcript')}: <span className="t26-break">{String(item.transcript || '') || t('speak.transcript_empty')}</span></p>
              {item.feedback ? <p>{String(item.feedback)}</p> : null}
            </div>
          ))}
        </section>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', marginTop: '1.5rem' }}>
        <Link className="t26-button" to={backPath} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>{isCandidate ? t('common.back') : t('results.back')}</Link>
        {!isCandidate ? <Link className="t26-button-secondary" to={`/review/${sessionId}`} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>{t('results.review')}</Link> : null}
      </div>
      {typeof computedAt === 'string' ? <p className="t26-muted" style={{ marginTop: '1rem' }}>{t('results.computed', { date: date(computedAt) })}</p> : null}
    </div>
  );
};
