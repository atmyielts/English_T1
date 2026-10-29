// One attempt, for HR (and managers for their department's staff tests): the
// printable report with levels, AI feedback, answers, integrity, decision and
// notes, plus "grade again" and manual scores when writing or speaking is pending.
import React, { useState, type FormEvent } from 'react';
import type { Skill } from '../../../../../packages/company-core/src/mod.ts';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link, navigate } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { FeedbackBlock } from './MemberPages.tsx';
import type { Assessment, Decision, Report } from './types.ts';
import { DecisionBadge, FlagList, LevelBadge, MeetsBadge, SkillBars, StatusBadge, clock, shortLevel, skillText, useFormat, useHiringError, useLoad } from './ui.tsx';

interface ReportResponse { attempt: Report; assessment: Assessment; member: { id: string; full_name: string | null; email: string | null; department_id: string | null; job_role: string } | null; can_edit: boolean }

export function ReportPage({ assessmentId, attemptId, back }: { assessmentId: string; attemptId: string; back: 'hiring' | 'placement' }) {
  const t = useAppT(), problem = useHiringError(), format = useFormat();
  const { org, departments } = useWorkspace();
  const { data, error, setData } = useLoad(() => api<ReportResponse>(`orgs/${org.id}/attempts/${attemptId}`), [org.id, attemptId]);
  const [busy, setBusy] = useState(false), [actionError, setActionError] = useState(''), [notice, setNotice] = useState('');
  const [notes, setNotes] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const backTo = `/w/${org.id}/${back}/${assessmentId}`;
  if (error) return <section><p className="error" role="alert">{error}</p><p><Link to={backTo}>{t('hiring.report.back')}</Link></p></section>;
  if (!data) return <p role="status">{t('app.loading')}</p>;
  const { attempt, assessment, member, can_edit: canEdit } = data;
  const hiring = assessment.kind === 'hiring';

  async function run<T>(work: () => Promise<T>, done?: (value: T) => void) {
    setBusy(true); setActionError(''); setNotice('');
    try {
      const value = await work();
      done?.(value);
    } catch (cause) {
      setActionError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  const decide = (decision: Decision | null) => run(() => api<{ decision: Decision | null }>(`orgs/${org.id}/attempts/${attempt.id}`, { method: 'PATCH', body: { decision } }), (value) => setData({ ...data, attempt: { ...attempt, decision: value.decision } }));
  const saveNotes = (event: FormEvent) => {
    event.preventDefault();
    void run(() => api<{ notes: string | null }>(`orgs/${org.id}/attempts/${attempt.id}`, { method: 'PATCH', body: { notes: notes ?? '' } }), (value) => { setData({ ...data, attempt: { ...attempt, notes: value.notes } }); setNotes(null); setNotice(t('common.saved')); });
  };
  const regrade = (skill?: Skill) => run(() => api<{ attempt: Report; reason: string | null }>(`orgs/${org.id}/attempts/${attempt.id}/regrade`, { method: 'POST', body: skill ? { skill } : {}, timeoutMs: 90_000 }), (value) => {
    setData({ ...data, attempt: value.attempt });
    setNotice(value.attempt.status === 'graded' ? t('hiring.report.gradedNow') : t(value.reason === 'ai_limit' ? 'hiring.report.pendingLimit' : 'hiring.report.pendingAi'));
  });
  const score = (skill: Skill, value: number) => run(() => api<{ attempt: Report }>(`orgs/${org.id}/attempts/${attempt.id}/score`, { method: 'POST', body: { skill, score: value } }), (response) => { setData({ ...data, attempt: response.attempt }); setNotice(t('common.saved')); });
  const remove = () => run(() => api(`orgs/${org.id}/attempts/${attempt.id}`, { method: 'DELETE' }), () => navigate(backTo, { replace: true }));
  const production = attempt.sections.filter((section) => section.tasks);
  const department = departments.find((entry) => entry.id === member?.department_id)?.name;

  return <div className="hiring-stack hiring-report">
    <p className="no-print"><Link to={backTo}>← {t('hiring.report.back')}</Link></p>
    <section className="hiring-report-head" aria-labelledby="report-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{hiring ? t('hiring.report.title') : t('hiring.report.staffTitle')} · {assessment.title}</p>
          <h1 id="report-title">{attempt.name ?? '—'}</h1>
          <p className="hiring-card-meta">
            <StatusBadge status={attempt.status}/>
            {hiring && <DecisionBadge decision={attempt.decision}/>}
            {hiring && attempt.email && <span>{attempt.email}</span>}
            {hiring && attempt.phone && <span>{attempt.phone}</span>}
            {member && <span>{department ?? t('hiring.placement.noDepartment')} · {t(`job.${member.job_role}` as AppKey)}</span>}
          </p>
          <p className="hiring-muted">{t('hiring.report.taken', { started: format.dateTime(attempt.started_at), submitted: format.dateTime(attempt.submitted_at) })}</p>
        </div>
        <button type="button" className="quiet no-print" onClick={() => print()}>{t('common.print')}</button>
      </div>
      <div className="hiring-report-summary">
        <div className="hiring-overall">
          <span className="eyebrow">{t('hiring.report.overall')}</span>
          <LevelBadge level={attempt.overall_level}/>
          <strong>{attempt.overall_score === null ? '—' : t('hiring.report.score', { score: format.score(attempt.overall_score) })}</strong>
          <MeetsBadge meets={attempt.meets}/>
          {assessment.min_level && <span className="hiring-muted">{t('hiring.list.min', { level: shortLevel(assessment.min_level) })}</span>}
        </div>
        <div className="hiring-overall-bars">
          <SkillBars skills={assessment.skills.filter((skill) => attempt.sections.some((section) => section.skill === skill))} results={attempt.results}/>
          <SourceNotes report={attempt}/>
        </div>
      </div>
      <p className="hint">{t('hiring.report.estimateNote')}</p>
    </section>

    {notice && <p className="notice" role="status">{notice}</p>}
    {actionError && <p className="error" role="alert">{actionError}</p>}

    {attempt.status === 'submitted' && attempt.pending.length > 0 && <section className="hiring-pending" aria-labelledby="pending-title">
      <h2 id="pending-title">{t('hiring.report.pendingTitle')}</h2>
      <p>{t(attempt.feedback.reason === 'ai_limit' ? 'hiring.report.pendingLimit' : 'hiring.report.pendingAi')}</p>
      {canEdit && <>
        <div className="company-actions"><button type="button" disabled={busy} onClick={() => void regrade()}>{busy ? t('hiring.run.working') : t('hiring.report.gradeAgain')}</button></div>
        <div className="hiring-manual-row">{attempt.pending.map((skill) => <ManualScore key={skill} skill={skill} busy={busy} onSave={(value) => void score(skill, value)}/>)}</div>
      </>}
    </section>}

    {production.map((section) => <section key={section.skill} aria-labelledby={`answers-${section.skill}`}>
      <div className="page-heading">
        <h2 id={`answers-${section.skill}`}>{skillText(t, section.skill)}</h2>
        {canEdit && attempt.status === 'graded' && <details className="hiring-override no-print">
          <summary>{t('hiring.report.override')}</summary>
          <div className="company-actions">
            <button type="button" className="quiet hiring-small" disabled={busy} onClick={() => void regrade(section.skill)}>{t('hiring.report.regradeSkill')}</button>
          </div>
          <ManualScore skill={section.skill} busy={busy} onSave={(value) => void score(section.skill, value)}/>
        </details>}
      </div>
      {attempt.feedback[section.skill as 'writing' | 'speaking'] && <FeedbackBlock skill={section.skill} feedback={attempt.feedback[section.skill as 'writing' | 'speaking']!}/>}
      {section.tasks!.map((task, index) => <div key={task.id} className="hiring-answer">
        <h3>{t('hiring.report.task', { n: index + 1 })}</h3>
        <p className="hiring-task-prompt">{task.prompt}</p>
        <p className="hiring-muted">
          {t('hiring.report.words', { count: (task.answer.trim().match(/[\p{L}\p{N}'’-]+/gu) ?? []).length })}
          {section.skill === 'writing' ? ` · ${t('hiring.run.wordTarget', { count: task.target })}` : task.mode ? ` · ${t(`hiring.report.mode.${task.mode}` as AppKey)}` : ''}
        </p>
        {task.answer.trim() ? <blockquote className="hiring-answer-text">{task.answer}</blockquote> : <p className="hiring-muted">{t('hiring.report.noAnswer')}</p>}
      </div>)}
    </section>)}

    <section aria-labelledby="objective-title">
      <h2 id="objective-title">{t('hiring.report.objective')}</h2>
      <div className="company-table-wrap">
        <table className="company-table">
          <thead><tr><th>{t('hiring.report.section')}</th><th>{t('hiring.col.level')}</th><th>{t('hiring.report.correctCol')}</th><th>{t('hiring.report.path')}</th><th>{t('hiring.report.time')}</th></tr></thead>
          <tbody>{attempt.sections.map((section) => {
            const result = attempt.results[section.skill];
            return <tr key={section.skill}>
              <td>{skillText(t, section.skill)}</td>
              <td>{result ? <><LevelBadge level={result.level} short/> {format.score(result.score)}</> : '—'}</td>
              <td>{result?.total ? t('hiring.report.correct', { correct: result.correct ?? 0, total: result.total }) : result ? t(`hiring.report.source.${result.source}` as AppKey) : '—'}</td>
              <td>{result?.stages ? result.stages.map((stage) => `${shortLevel(stage.level)} ${stage.correct}/${stage.total}`).join(' → ') : section.texts?.map((text) => text.title).join('; ') ?? '—'}</td>
              <td>{section.seconds ? clock(section.seconds) : '—'}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <p className="hint">{t('hiring.report.keysNote')}</p>
    </section>

    <section aria-labelledby="integrity-title">
      <h2 id="integrity-title">{t('hiring.report.integrity')}</h2>
      <FlagList flags={attempt.flags}/>
      <p className="hint">{t('hiring.flags.note')}</p>
      <dl className="hiring-integrity">
        <div><dt>{t('hiring.integrity.tab')}</dt><dd>{attempt.integrity.tab_hidden ?? 0}</dd></div>
        <div><dt>{t('hiring.integrity.paste')}</dt><dd>{attempt.integrity.paste ?? 0}</dd></div>
        <div><dt>{t('hiring.integrity.copy')}</dt><dd>{attempt.integrity.copy ?? 0}</dd></div>
        <div><dt>{t('hiring.integrity.fullscreen')}</dt><dd>{attempt.integrity.fullscreen_exit ?? 0}</dd></div>
      </dl>
    </section>

    {hiring && canEdit && <section className="no-print" aria-labelledby="decision-title">
      <h2 id="decision-title">{t('hiring.report.decision')}</h2>
      <div className="company-actions hiring-decisions" role="group" aria-label={t('hiring.report.decision')}>
        {(['shortlist', 'hold', 'reject'] as const).map((decision) => <button key={decision} type="button" className={attempt.decision === decision ? `hiring-decision on ${decision}` : 'quiet hiring-decision'} aria-pressed={attempt.decision === decision} disabled={busy} onClick={() => void decide(attempt.decision === decision ? null : decision)}>{t(`hiring.decision.${decision}`)}</button>)}
      </div>
      <form onSubmit={saveNotes} className="hiring-notes">
        <label>{t('hiring.report.notes')}<textarea rows={4} maxLength={4000} value={notes ?? attempt.notes ?? ''} onChange={(event) => setNotes(event.target.value)}/></label>
        <div className="company-actions"><button disabled={busy || notes === null}>{t('hiring.report.saveNotes')}</button></div>
      </form>
    </section>}
    {hiring && attempt.notes && <section className="print-only"><h2>{t('hiring.report.notes')}</h2><p>{attempt.notes}</p></section>}

    {attempt.certificate_code && <p className="hiring-muted">{t('hiring.report.certificate')}: <code>{attempt.certificate_code}</code> · <Link to={`/v/${attempt.certificate_code}`}>{t('hiring.report.verify')}</Link></p>}

    {canEdit && hiring && <div className="no-print hiring-danger">
      {deleting ? <div className="hiring-confirm" role="alertdialog" aria-labelledby="delete-text">
        <p id="delete-text">{t('hiring.report.deleteConfirm')}</p>
        <div className="company-actions">
          <button type="button" className="hiring-danger-button" disabled={busy} onClick={() => void remove()}>{t('hiring.report.delete')}</button>
          <button type="button" className="quiet" onClick={() => setDeleting(false)}>{t('common.cancel')}</button>
        </div>
      </div> : <button type="button" className="quiet hiring-small" onClick={() => setDeleting(true)}>{t('hiring.report.delete')}</button>}
    </div>}
  </div>;
}

function SourceNotes({ report }: { report: Report }) {
  const t = useAppT();
  const notes = Object.entries(report.results).filter(([, result]) => result && result.source !== 'auto' && result.source !== 'ai');
  if (!notes.length) return null;
  return <p className="hint">{notes.map(([skill, result]) => `${skillText(t, skill)}: ${t(`hiring.report.source.${result!.source}` as AppKey)}`).join(' · ')}</p>;
}

function ManualScore({ skill, busy, onSave }: { skill: Skill; busy: boolean; onSave: (value: number) => void }) {
  const t = useAppT();
  const [value, setValue] = useState('');
  return <form className="hiring-manual" onSubmit={(event) => { event.preventDefault(); const number = Number(value); if (Number.isInteger(number) && number >= 0 && number <= 100) onSave(number); }}>
    <label>{t('hiring.report.manualScore', { skill: skillText(t, skill) })}<input type="number" min={0} max={100} required value={value} onChange={(event) => setValue(event.target.value)}/></label>
    <button className="quiet" disabled={busy}>{t('hiring.report.manualSave')}</button>
  </form>;
}
