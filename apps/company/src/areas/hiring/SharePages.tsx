// Share links: the panel where HR makes and revokes a hiring manager's link, and the public
// read-only page at /s/:key, which shows either a ranked report or one candidate's feedback.
import React, { useState, type FormEvent } from 'react';
import { LocaleSwitcher } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { STAGES, StageBadge, VerdictBadge } from './AtsUi.tsx';
import { telegramShare } from './candidates.ts';
import type { Assessment, PublicShare, ShareLink, Stage } from './types.ts';
import { CopyButton, FlagList, LevelBadge, SkillBars, shortLevel, skillText, useFormat, useHiringError, useLoad } from './ui.tsx';

export function SharePanel({ assessment }: { assessment: Assessment }) {
  const t = useAppT(), problem = useHiringError(), format = useFormat();
  const { org } = useWorkspace();
  const { data, reload } = useLoad(() => api<{ shares: ShareLink[] }>(`orgs/${org.id}/assessments/${assessment.id}/shares`), [org.id, assessment.id]);
  const [form, setForm] = useState({ label: '', days: '14', include_contacts: false, stages: [] as Stage[] });
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const response = await api<{ link: string }>(`orgs/${org.id}/assessments/${assessment.id}/shares`, { method: 'POST', body: { label: form.label, days: Number(form.days), include_contacts: form.include_contacts, stages: form.stages } });
      setCreated(response.link);
      setForm({ ...form, label: '' });
      await reload();
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    setBusy(true); setError('');
    try {
      await api(`orgs/${org.id}/shares/${id}`, { method: 'DELETE' });
      await reload();
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  const toggleStage = (stage: Stage) => setForm({ ...form, stages: form.stages.includes(stage) ? form.stages.filter((entry) => entry !== stage) : [...form.stages, stage] });
  return <section aria-labelledby="share-title" className="hiring-subpanel">
    <h2 id="share-title">{t('hiring.share.title')}</h2>
    <p className="hint">{t('hiring.share.lead')}</p>
    <form onSubmit={create} className="hiring-form">
      <div className="hiring-form-row">
        <label>{t('hiring.share.label')} <span className="hint">{t('common.optional')}</span><input maxLength={120} value={form.label} placeholder={t('hiring.share.labelHint')} onChange={(event) => setForm({ ...form, label: event.target.value })}/></label>
        <label>{t('hiring.share.expires')}<select value={form.days} onChange={(event) => setForm({ ...form, days: event.target.value })}>
          {[3, 7, 14, 30, 90].map((days) => <option key={days} value={days}>{t('hiring.share.days', { count: days })}</option>)}
        </select></label>
      </div>
      <fieldset>
        <legend>{t('hiring.share.stages')}</legend>
        <div className="hiring-stage-picks">{STAGES.map((stage) => <label key={stage} className="check"><input type="checkbox" checked={form.stages.includes(stage)} onChange={() => toggleStage(stage)}/> {t(`hiring.stage.${stage}` as AppKey)}</label>)}</div>
        <p className="hint">{t('hiring.share.stagesHint')}</p>
      </fieldset>
      <label className="check"><input type="checkbox" checked={form.include_contacts} onChange={(event) => setForm({ ...form, include_contacts: event.target.checked })}/> {t('hiring.share.contacts')}</label>
      <div className="company-actions"><button disabled={busy}>{busy ? t('hiring.run.working') : t('hiring.share.create')}</button></div>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
    {created && <div className="hiring-link">
      <p className="hint">{t('hiring.share.once')}</p>
      <div className="hiring-link-row">
        <label className="hiring-link-field"><span className="visually-hidden">{t('hiring.share.title')}</span><input readOnly value={created} onFocus={(event) => event.target.select()}/></label>
        <CopyButton text={created}/>
        <a className="button-link quiet" href={telegramShare(created, assessment.title)} target="_blank" rel="noopener noreferrer">{t('hiring.link.telegram')}</a>
      </div>
    </div>}
    {data && data.shares.length > 0 && <div className="company-table-wrap">
      <table className="company-table">
        <thead><tr><th>{t('hiring.share.label')}</th><th>{t('hiring.share.status')}</th><th>{t('hiring.share.opens')}</th><th><span className="visually-hidden">{t('hiring.share.revoke')}</span></th></tr></thead>
        <tbody>{data.shares.map((share) => <tr key={share.id}>
          <td>{share.label || '—'}{share.include_contacts && <><br/><span className="hiring-muted">{t('hiring.share.withContacts')}</span></>}</td>
          <td>{share.revoked_at ? <span className="company-badge bad">{t('hiring.share.revoked')}</span> : share.active ? <span className="company-badge good">{t('hiring.share.until', { date: format.date(share.expires_at) })}</span> : <span className="company-badge">{t('hiring.share.expired')}</span>}</td>
          <td>{share.opens}{share.last_opened_at && <><br/><span className="hiring-muted">{format.dateTime(share.last_opened_at)}</span></>}</td>
          <td>{share.active && <button type="button" className="quiet hiring-small" disabled={busy} onClick={() => void revoke(share.id)}>{t('hiring.share.revoke')}</button>}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}

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

export function SharedReportPage({ shareKey }: { shareKey: string }) {
  const t = useAppT(), format = useFormat();
  const { data, error } = useLoad(() => api<PublicShare>(`public/s/${encodeURIComponent(shareKey)}`, { auth: false, timeoutMs: 60_000 }), [shareKey]);
  if (error) return <Frame><section className="hiring-narrow"><h1>{t('hiring.share.invalidTitle')}</h1><p className="error" role="alert">{error}</p></section></Frame>;
  if (!data) return <Frame><p role="status">{t('app.loading')}</p></Frame>;

  if (data.kind === 'feedback') {
    return <Frame company={data.company}>
      <section className="hiring-narrow hiring-stack" aria-labelledby="share-feedback-title">
        <div>
          <p className="eyebrow">{data.test.title}</p>
          <h1 id="share-feedback-title">{t('hiring.share.feedbackFor', { name: data.name ?? '' })}</h1>
          <p className="hiring-muted">{t('hiring.share.feedbackFrom', { company: data.company, date: format.date(data.date) })}</p>
        </div>
        <div className="hiring-result">
          <p className="eyebrow">{t('hiring.candidate.yourLevel')}</p>
          <p className="hiring-result-level"><LevelBadge level={data.overall_level}/></p>
          <SkillBars skills={data.test.skills} results={data.skills}/>
        </div>
        {data.feedback && (['writing', 'speaking'] as const).map((skill) => {
          const entry = data.feedback![skill];
          if (!entry) return null;
          return <div key={skill} className="hiring-subpanel">
            <h2>{skillText(t, skill)}</h2>
            {entry.summary && <p>{entry.summary}</p>}
            {entry.strengths.length > 0 && <><h3>{t('hiring.share.strengths')}</h3><ul>{entry.strengths.map((line) => <li key={line}>{line}</li>)}</ul></>}
            {entry.improvements.length > 0 && <><h3>{t('hiring.share.improvements')}</h3><ul>{entry.improvements.map((line) => <li key={line}>{line}</li>)}</ul></>}
          </div>;
        })}
        {data.certificate_code && <p><Link to={`/v/${data.certificate_code}`}>{t('hiring.candidate.verify')}</Link> <code>{data.certificate_code}</code></p>}
        <p className="hint">{t('hiring.report.estimateNote')}</p>
      </section>
    </Frame>;
  }

  const minimums = data.test.skill_minimums ?? {};
  return <Frame company={data.company}>
    <div className="hiring-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('hiring.share.reportFrom', { company: data.company })}</p>
          <h1>{data.test.title}</h1>
          {data.label && <p>{data.label}</p>}
          <p className="hiring-muted">{t('hiring.share.until', { date: format.date(data.expires_at) })}</p>
        </div>
        <button type="button" className="quiet no-print" onClick={() => print()}>{t('common.print')}</button>
      </div>
      <p className="hiring-requirement"><strong>{t('hiring.ats.requirement')}:</strong> {data.test.min_level && <span>{t('hiring.list.min', { level: shortLevel(data.test.min_level) })}</span>} {data.test.skills.map((skill) => <span key={skill} className="hiring-chip">{skillText(t, skill)} {minimums[skill] ? shortLevel(minimums[skill]) : '—'}</span>)}</p>
      {data.candidates.length === 0 ? <p>{t('hiring.share.empty')}</p> : <ol className="hiring-share-list">
        {data.candidates.map((row) => <li key={row.rank} className="hiring-card hiring-share-card">
          <div className="hiring-share-head">
            <span className="hiring-share-rank">{row.rank}</span>
            <div>
              <h2>{row.name ?? '—'}</h2>
              <p className="hiring-card-meta">
                <LevelBadge level={row.overall_level} short/> {format.score(row.overall_score)}
                <VerdictBadge verdict={row.verdict}/>
                <StageBadge stage={row.stage}/>
                {row.minutes !== null && <span>{t('common.minutes', { count: row.minutes })}</span>}
                {row.interview_average !== null && <span>{t('hiring.kit.scoreShort', { score: row.interview_average })}</span>}
                {row.email && <a href={`mailto:${row.email}`}>{row.email}</a>}
                {row.phone && <span>{row.phone}</span>}
              </p>
            </div>
          </div>
          <SkillBars compact skills={row.skills.map((entry) => entry.skill)} results={Object.fromEntries(row.skills.map((entry) => [entry.skill, entry.score === null ? null : { score: entry.score, level: entry.level }]))}/>
          {row.summary.map((line, index) => <p key={index} className="hint">{line}</p>)}
          {row.flags.length > 0 && <FlagList flags={row.flags} empty={false}/>}
        </li>)}
      </ol>}
      <p className="hint">{t('hiring.report.estimateNote')} {t('hiring.flags.note')}</p>
    </div>
  </Frame>;
}
