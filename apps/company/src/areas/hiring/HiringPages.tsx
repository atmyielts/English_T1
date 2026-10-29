// HR: hiring tests (/w/:org/hiring) and one test with its candidates
// (/w/:org/hiring/:assessment): create, edit, close, duplicate, the candidate link,
// filters, sort, side-by-side compare and CSV export.
import React, { useEffect, useMemo, useState, type FormEvent } from 'react';
import { JOB_ROLES, LEVELS, SKILLS, levelIndex, type Level, type Skill } from '../../../../../packages/company-core/src/mod.ts';
import { api, type Usage } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link, navigate } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import type { Assessment, AttemptRow, Stats } from './types.ts';
import {
  CopyButton, DecisionBadge, FlagList, LevelBadge, MeetsBadge, StatusBadge, downloadText, shortLevel, skillText, useFormat, useHiringError, useLoad,
} from './ui.tsx';

const SUGGESTED: Record<Skill, number> = { grammar: 7, vocabulary: 7, reading: 12, listening: 10, writing: 15, speaking: 8 };
export const suggested = (skills: Skill[]) => Math.min(180, Math.max(5, skills.reduce((sum, skill) => sum + SUGGESTED[skill], 0)));
const linkKey = (id: string) => `company-hiring-link:${id}`;
export const rememberLink = (id: string, link: string) => { try { localStorage.setItem(linkKey(id), link); } catch { /* shown once */ } };
const recallLink = (id: string) => { try { return localStorage.getItem(linkKey(id)); } catch { return null; } };
const toDateInput = (value: string | null) => value ? value.slice(0, 10) : '';
const fromDateInput = (value: string) => value ? new Date(`${value}T23:59:00+05:00`).toISOString() : null;

export function UsageLine({ usage }: { usage: Usage | null }) {
  const t = useAppT();
  if (!usage) return null;
  return <p className="hiring-usage">{usage.tests_limit === null ? t('hiring.list.usageUnlimited', { used: usage.tests_used }) : t('hiring.list.usage', { used: usage.tests_used, limit: usage.tests_limit })}
    {usage.tests_limit !== null && <span className="hiring-mini" aria-hidden="true"><b style={{ width: `${Math.min(100, usage.tests_used / Math.max(1, usage.tests_limit) * 100)}%` }}/></span>}
  </p>;
}

export function HiringListPage() {
  const t = useAppT(), format = useFormat();
  const { org } = useWorkspace();
  const { data, error, reload } = useLoad(() => api<{ assessments: Assessment[]; usage: Usage; bank: Record<Skill, number> }>(`orgs/${org.id}/assessments?kind=hiring`), [org.id]);
  const [creating, setCreating] = useState(false);
  return <div className="hiring-stack">
    <div className="page-heading">
      <div>
        <h1>{t('hiring.list.title')}</h1>
        <p>{t('hiring.list.lead')}</p>
      </div>
      {!creating && <button type="button" onClick={() => setCreating(true)}>{t('hiring.list.new')}</button>}
    </div>
    {data && <UsageLine usage={data.usage}/>}
    {creating && <section aria-labelledby="hiring-form-title">
      <h2 id="hiring-form-title">{t('hiring.form.createTitle')}</h2>
      <TestForm onCancel={() => setCreating(false)} onSaved={(assessment, link) => {
        if (link) rememberLink(assessment.id, link);
        void reload();
        navigate(`/w/${org.id}/hiring/${assessment.id}`);
      }}/>
    </section>}
    {error && <p className="error" role="alert">{error}</p>}
    {!data && !error && <p role="status">{t('app.loading')}</p>}
    {data && (data.assessments.length === 0 && !creating ? <section className="hiring-empty">
      <h2>{t('hiring.list.emptyTitle')}</h2>
      <p>{t('hiring.list.empty')}</p>
      <button type="button" onClick={() => setCreating(true)}>{t('hiring.list.new')}</button>
    </section> : <ul className="hiring-cards">
      {data.assessments.map((assessment) => <li key={assessment.id} className="hiring-card">
        <div>
          <p className="eyebrow">{t(`job.${assessment.job_role}` as AppKey)}</p>
          <h2><Link to={`/w/${org.id}/hiring/${assessment.id}`}>{assessment.title}</Link></h2>
          <p className="hiring-card-meta">
            <span className={`company-badge ${assessment.status === 'open' ? 'good' : ''}`}>{t(`hiring.testStatus.${assessment.status}` as AppKey)}</span>
            {assessment.min_level && <span>{t('hiring.list.min', { level: shortLevel(assessment.min_level) })}</span>}
            <span>{t('common.minutes', { count: assessment.time_limit_minutes })}</span>
            {assessment.closes_at && <span>{t('hiring.list.closesOn', { date: format.date(assessment.closes_at) })}</span>}
          </p>
          {assessment.stats && <StatsLine stats={assessment.stats}/>}
        </div>
        <Link className="button-link quiet" to={`/w/${org.id}/hiring/${assessment.id}`}>{t('hiring.list.openTest')}</Link>
      </li>)}
    </ul>)}
    {data && <p className="hint">{t('hiring.list.bank', data.bank)}</p>}
  </div>;
}

function StatsLine({ stats }: { stats: Stats }) {
  const t = useAppT();
  return <p className="hiring-statline">
    <span>{t('hiring.list.candidates', { count: stats.total })}</span>
    <span>{t('hiring.list.graded', { count: stats.graded })}</span>
    {stats.meets > 0 && <span>{t('hiring.list.meets', { count: stats.meets })}</span>}
    {stats.shortlisted > 0 && <span>{t('hiring.list.shortlisted', { count: stats.shortlisted })}</span>}
    {stats.pending > 0 && <span className="company-badge warn">{t('hiring.list.pending', { count: stats.pending })}</span>}
  </p>;
}

/** Create or edit a hiring test. */
export function TestForm({ initial, onSaved, onCancel }: { initial?: Assessment; onSaved: (assessment: Assessment, link: string | null) => void; onCancel: () => void }) {
  const t = useAppT(), problem = useHiringError();
  const { org } = useWorkspace();
  const [form, setForm] = useState({
    title: initial?.title ?? '', job_role: initial?.job_role ?? 'general', skills: initial?.skills ?? (['grammar', 'vocabulary', 'reading', 'listening', 'writing', 'speaking'] as Skill[]),
    min_level: initial?.min_level ?? '', time_limit_minutes: String(initial?.time_limit_minutes ?? suggested([...SKILLS])), max_attempts: initial?.max_attempts ? String(initial.max_attempts) : '',
    closes_at: toDateInput(initial?.closes_at ?? null), show_level: initial?.settings.show_level ?? false,
  });
  const [timeTouched, setTimeTouched] = useState(Boolean(initial));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const toggle = (skill: Skill) => {
    const skills = form.skills.includes(skill) ? form.skills.filter((entry) => entry !== skill) : SKILLS.filter((entry) => entry === skill || form.skills.includes(entry));
    setForm({ ...form, skills, time_limit_minutes: timeTouched ? form.time_limit_minutes : String(suggested(skills)) });
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    const body = {
      title: form.title, job_role: form.job_role, skills: form.skills, min_level: form.min_level || null, time_limit_minutes: Number(form.time_limit_minutes),
      max_attempts: form.max_attempts ? Number(form.max_attempts) : null, closes_at: fromDateInput(form.closes_at), show_level: form.show_level,
    };
    try {
      if (initial) {
        const { assessment } = await api<{ assessment: Assessment }>(`orgs/${org.id}/assessments/${initial.id}`, { method: 'PATCH', body });
        onSaved(assessment, null);
      } else {
        const { assessment, link } = await api<{ assessment: Assessment; link: string }>(`orgs/${org.id}/assessments`, { method: 'POST', body });
        onSaved(assessment, link);
      }
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  return <form onSubmit={submit} className="hiring-form">
    <label>{t('hiring.form.title')}<input required minLength={2} maxLength={160} value={form.title} placeholder={t('hiring.form.titlePlaceholder')} onChange={(event) => setForm({ ...form, title: event.target.value })}/>
      <span className="hint">{t('hiring.form.titleHint')}</span></label>
    <label>{t('hiring.form.jobRole')}<select value={form.job_role} onChange={(event) => setForm({ ...form, job_role: event.target.value })}>
      {JOB_ROLES.map((role) => <option key={role} value={role}>{t(`job.${role}` as AppKey)}</option>)}
    </select><span className="hint">{t('hiring.form.jobRoleHint')}</span></label>
    <fieldset>
      <legend>{t('hiring.form.skills')}</legend>
      <div className="hiring-skill-picks">
        {SKILLS.map((skill) => <label key={skill} className={`check hiring-skill-pick${form.skills.includes(skill) ? ' on' : ''}`}>
          <input type="checkbox" checked={form.skills.includes(skill)} onChange={() => toggle(skill)}/>
          <span><strong>{skillText(t, skill)}</strong><small>{t(`hiring.skillInfo.${skill}` as AppKey)}</small></span>
        </label>)}
      </div>
      {form.skills.length === 0 && <p className="error" role="alert">{t('hiring.form.skillsNone')}</p>}
    </fieldset>
    <div className="hiring-form-row">
      <label>{t('hiring.form.minLevel')}<select value={form.min_level} onChange={(event) => setForm({ ...form, min_level: event.target.value })}>
        <option value="">{t('hiring.form.minLevelNone')}</option>
        {LEVELS.filter((level) => level !== 'pre_a1').map((level) => <option key={level} value={level}>{t(`level.${level}` as AppKey)}</option>)}
      </select></label>
      <label>{t('hiring.form.time')}<input type="number" required min={5} max={180} value={form.time_limit_minutes} onChange={(event) => { setTimeTouched(true); setForm({ ...form, time_limit_minutes: event.target.value }); }}/>
        <span className="hint">{t('hiring.form.timeHint', { minutes: suggested(form.skills) })}</span></label>
    </div>
    <div className="hiring-form-row">
      <label>{t('hiring.form.maxAttempts')} <span className="hint">{t('common.optional')}</span><input type="number" min={1} max={100000} value={form.max_attempts} onChange={(event) => setForm({ ...form, max_attempts: event.target.value })}/>
        <span className="hint">{t('hiring.form.maxAttemptsHint')}</span></label>
      <label>{t('hiring.form.closesAt')} <span className="hint">{t('common.optional')}</span><input type="date" value={form.closes_at} onChange={(event) => setForm({ ...form, closes_at: event.target.value })}/></label>
    </div>
    <label className="check"><input type="checkbox" checked={form.show_level} onChange={(event) => setForm({ ...form, show_level: event.target.checked })}/> {t('hiring.form.showLevel')}</label>
    <div className="company-actions">
      <button disabled={busy || form.skills.length === 0}>{busy ? t('hiring.run.working') : initial ? t('hiring.form.save') : t('hiring.form.create')}</button>
      <button type="button" className="quiet" onClick={onCancel}>{t('common.cancel')}</button>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
  </form>;
}

/** The candidate link: shown when made (and remembered in this browser), regenerated on demand. */
function LinkPanel({ assessment }: { assessment: Assessment }) {
  const t = useAppT(), problem = useHiringError();
  const { org } = useWorkspace();
  const [link, setLink] = useState<string | null>(() => recallLink(assessment.id));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function regenerate() {
    setBusy(true); setError('');
    try {
      const response = await api<{ link: string }>(`orgs/${org.id}/assessments/${assessment.id}/link`, { method: 'POST' });
      rememberLink(assessment.id, response.link);
      setLink(response.link);
      setConfirming(false);
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  const message = `${assessment.title} — ${t('hiring.link.shareText', { company: org.name })}`;
  return <section className="hiring-link no-print" aria-labelledby="hiring-link-title">
    <h2 id="hiring-link-title">{t('hiring.link.title')}</h2>
    {link ? <>
      <p className="hint">{t('hiring.link.lead')}</p>
      <div className="hiring-link-row">
        <label className="hiring-link-field"><span className="visually-hidden">{t('hiring.link.label')}</span><input readOnly value={link} onFocus={(event) => event.target.select()}/></label>
        <CopyButton text={link}/>
        <a className="button-link quiet" href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">{t('hiring.link.telegram')}</a>
      </div>
    </> : <p className="hint">{t('hiring.link.hidden')}</p>}
    {confirming ? <div className="hiring-confirm" role="alertdialog" aria-labelledby="hiring-relink">
      <p id="hiring-relink">{t('hiring.link.regenerateConfirm')}</p>
      <div className="company-actions">
        <button type="button" disabled={busy} onClick={() => void regenerate()}>{t('hiring.link.regenerate')}</button>
        <button type="button" className="quiet" onClick={() => setConfirming(false)}>{t('common.cancel')}</button>
      </div>
    </div> : <button type="button" className="quiet hiring-small" onClick={() => setConfirming(true)}>{t('hiring.link.regenerate')}</button>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}

type Sort = 'newest' | 'score' | 'name';
interface Filters { search: string; meets: '' | 'yes' | 'no'; status: string; decision: string; sort: Sort }

export function TestDetailPage({ assessmentId }: { assessmentId: string }) {
  const t = useAppT(), problem = useHiringError(), format = useFormat();
  const { org } = useWorkspace();
  const { data, error, setData } = useLoad(() => api<{ assessment: Assessment; stats: Stats; attempts: AttemptRow[] }>(`orgs/${org.id}/assessments/${assessmentId}`), [org.id, assessmentId]);
  const [editing, setEditing] = useState(false);
  const [filters, setFilters] = useState<Filters>({ search: '', meets: '', status: '', decision: '', sort: 'newest' });
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [actionError, setActionError] = useState('');
  useEffect(() => { setPicked([]); }, [assessmentId]);

  const rows = useMemo(() => {
    if (!data) return [];
    const search = filters.search.trim().toLowerCase();
    const list = data.attempts.filter((row) =>
      (!search || `${row.name ?? ''} ${row.email ?? ''} ${row.phone ?? ''}`.toLowerCase().includes(search))
      && (!filters.meets || (filters.meets === 'yes' ? row.meets === true : row.meets === false))
      && (!filters.status || row.status === filters.status)
      && (!filters.decision || (filters.decision === 'none' ? !row.decision : row.decision === filters.decision)));
    const sorted = [...list];
    if (filters.sort === 'score') sorted.sort((a, b) => (b.overall_score ?? -1) - (a.overall_score ?? -1));
    else if (filters.sort === 'name') sorted.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
    return sorted;
  }, [data, filters]);

  if (error) return <section><p className="error" role="alert">{error}</p><p><Link to={`/w/${org.id}/hiring`}>{t('hiring.detail.back')}</Link></p></section>;
  if (!data) return <p role="status">{t('app.loading')}</p>;
  const { assessment, stats } = data;

  async function act(kind: 'close' | 'reopen' | 'duplicate' | 'export') {
    setBusy(true); setActionError(''); setNotice('');
    try {
      if (kind === 'duplicate') {
        const copy = await api<{ assessment: Assessment; link: string }>(`orgs/${org.id}/assessments/${assessment.id}/duplicate`, { method: 'POST' });
        rememberLink(copy.assessment.id, copy.link);
        navigate(`/w/${org.id}/hiring/${copy.assessment.id}`);
      } else if (kind === 'export') {
        const file = await api<{ filename: string; csv: string }>(`orgs/${org.id}/assessments/${assessment.id}/export`);
        downloadText(file.filename, file.csv);
      } else {
        const { assessment: updated } = await api<{ assessment: Assessment }>(`orgs/${org.id}/assessments/${assessment.id}`, { method: 'PATCH', body: { status: kind === 'close' ? 'closed' : 'open' } });
        setData({ ...data!, assessment: updated });
        setNotice(t(kind === 'close' ? 'hiring.detail.closed' : 'hiring.detail.reopened'));
      }
    } catch (cause) {
      setActionError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  const togglePick = (id: string) => setPicked((current) => current.includes(id) ? current.filter((entry) => entry !== id) : current.length >= 3 ? current : [...current, id]);
  const compared = picked.map((id) => data.attempts.find((row) => row.id === id)).filter((row): row is AttemptRow => !!row);

  return <div className="hiring-stack">
    <p className="no-print"><Link to={`/w/${org.id}/hiring`}>← {t('hiring.detail.back')}</Link></p>
    <div className="page-heading hiring-heading">
      <div>
        <p className="eyebrow">{t(`job.${assessment.job_role}` as AppKey)}</p>
        <h1>{assessment.title}</h1>
        <p className="hiring-card-meta">
          <span className={`company-badge ${assessment.status === 'open' ? 'good' : ''}`}>{t(`hiring.testStatus.${assessment.status}` as AppKey)}</span>
          {assessment.min_level && <span>{t('hiring.list.min', { level: shortLevel(assessment.min_level) })}</span>}
          <span>{t('common.minutes', { count: assessment.time_limit_minutes })}</span>
          <span>{assessment.skills.map((skill) => skillText(t, skill)).join(' · ')}</span>
          {assessment.closes_at && <span>{t('hiring.list.closesOn', { date: format.date(assessment.closes_at) })}</span>}
          {assessment.max_attempts && <span>{t('hiring.detail.maxCandidates', { count: assessment.max_attempts })}</span>}
        </p>
      </div>
    </div>
    <div className="company-actions no-print">
      <button type="button" className="quiet" onClick={() => setEditing((value) => !value)}>{t('common.edit')}</button>
      {assessment.status === 'open'
        ? <button type="button" className="quiet" disabled={busy} onClick={() => void act('close')}>{t('hiring.detail.close')}</button>
        : <button type="button" className="quiet" disabled={busy} onClick={() => void act('reopen')}>{t('hiring.detail.reopen')}</button>}
      <button type="button" className="quiet" disabled={busy} onClick={() => void act('duplicate')}>{t('hiring.detail.duplicate')}</button>
      <button type="button" className="quiet" disabled={busy || !data.attempts.length} onClick={() => void act('export')}>{t('hiring.detail.export')}</button>
    </div>
    {notice && <p className="notice" role="status">{notice}</p>}
    {actionError && <p className="error" role="alert">{actionError}</p>}
    {editing && <section aria-labelledby="hiring-edit-title">
      <h2 id="hiring-edit-title">{t('hiring.form.editTitle')}</h2>
      <p className="hint">{t('hiring.form.editHint')}</p>
      <TestForm initial={assessment} onCancel={() => setEditing(false)} onSaved={(updated) => { setEditing(false); setData({ ...data, assessment: updated }); }}/>
    </section>}
    {assessment.status === 'open' && <LinkPanel assessment={assessment}/>}

    <div className="company-grid hiring-stats">
      <div className="company-stat"><strong>{stats.total}</strong><span>{t('hiring.stats.total')}</span></div>
      <div className="company-stat"><strong>{stats.graded}</strong><span>{t('hiring.stats.graded')}</span></div>
      {assessment.min_level && <div className="company-stat"><strong>{stats.meets}</strong><span>{t('hiring.stats.meets', { level: shortLevel(assessment.min_level) })}</span></div>}
      <div className="company-stat"><strong>{format.score(stats.average)}</strong><span>{t('hiring.stats.average')}</span></div>
      {(stats.in_progress > 0 || stats.pending > 0) && <div className="company-stat"><strong>{stats.in_progress} / {stats.pending}</strong><span>{t('hiring.stats.progressPending')}</span></div>}
    </div>
    {stats.graded > 0 && <LevelSpread levels={stats.levels} total={stats.graded} min={assessment.min_level}/>}

    <section aria-labelledby="hiring-candidates">
      <h2 id="hiring-candidates">{t('hiring.detail.candidates')}</h2>
      <div className="company-toolbar no-print">
        <label>{t('hiring.filter.search')}<input type="search" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })}/></label>
        {assessment.min_level && <label>{t('hiring.filter.meets')}<select value={filters.meets} onChange={(event) => setFilters({ ...filters, meets: event.target.value as Filters['meets'] })}>
          <option value="">{t('hiring.filter.any')}</option><option value="yes">{t('hiring.meets.yes')}</option><option value="no">{t('hiring.meets.no')}</option>
        </select></label>}
        <label>{t('hiring.filter.status')}<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
          <option value="">{t('hiring.filter.any')}</option>
          {(['graded', 'submitted', 'started', 'expired'] as const).map((status) => <option key={status} value={status}>{t(`hiring.status.${status}`)}</option>)}
        </select></label>
        <label>{t('hiring.filter.decision')}<select value={filters.decision} onChange={(event) => setFilters({ ...filters, decision: event.target.value })}>
          <option value="">{t('hiring.filter.any')}</option>
          {(['shortlist', 'hold', 'reject'] as const).map((decision) => <option key={decision} value={decision}>{t(`hiring.decision.${decision}`)}</option>)}
          <option value="none">{t('hiring.decision.none')}</option>
        </select></label>
        <label>{t('hiring.filter.sort')}<select value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value as Sort })}>
          <option value="newest">{t('hiring.sort.newest')}</option><option value="score">{t('hiring.sort.score')}</option><option value="name">{t('hiring.sort.name')}</option>
        </select></label>
      </div>
      <p className="hint no-print">{t('hiring.compare.hint')}</p>
      {compared.length >= 2 && <Compare rows={compared} skills={assessment.skills} onClear={() => setPicked([])}/>}
      {data.attempts.length === 0 ? <p>{t('hiring.detail.noCandidates')}</p> : rows.length === 0 ? <p>{t('hiring.detail.noMatch')}</p> : <div className="company-table-wrap">
        <table className="company-table hiring-table">
          <thead><tr>
            <th className="no-print"><span className="visually-hidden">{t('hiring.col.compare')}</span></th>
            <th>{t('hiring.col.candidate')}</th><th>{t('hiring.col.level')}</th><th>{t('hiring.col.skills')}</th>
            <th>{t('hiring.col.status')}</th><th>{t('hiring.col.decision')}</th><th>{t('hiring.col.flags')}</th><th>{t('hiring.col.date')}</th>
          </tr></thead>
          <tbody>
            {rows.map((row) => <tr key={row.id}>
              <td className="no-print"><input type="checkbox" aria-label={t('hiring.compare.pick', { name: row.name ?? '' })} checked={picked.includes(row.id)} disabled={!picked.includes(row.id) && picked.length >= 3} onChange={() => togglePick(row.id)}/></td>
              <td><Link to={`/w/${org.id}/hiring/${assessment.id}/${row.id}`}><strong>{row.name ?? '—'}</strong></Link><br/><span className="hiring-muted">{row.email}</span></td>
              <td>{row.overall_level ? <><LevelBadge level={row.overall_level} short/> <span className="hiring-muted">{format.score(row.overall_score)}</span></> : <span className="hiring-muted">—</span>}{row.meets !== null && <><br/><MeetsBadge meets={row.meets}/></>}</td>
              <td><SkillChips skills={assessment.skills} row={row}/></td>
              <td><StatusBadge status={row.status}/>{row.pending.length > 0 && <><br/><span className="hiring-muted">{t('hiring.detail.waiting', { skills: row.pending.map((skill) => skillText(t, skill)).join(', ') })}</span></>}</td>
              <td><DecisionBadge decision={row.decision}/></td>
              <td>{row.flags.length ? <span className={`company-badge ${row.flags.some((flag) => flag.severity === 'warn') ? 'warn' : ''}`} title={row.flags.map((flag) => flag.code).join(', ')}>{t('hiring.detail.flagCount', { count: row.flags.length })}</span> : <span className="hiring-muted">—</span>}</td>
              <td>{format.date(row.started_at)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>}
    </section>
  </div>;
}

function SkillChips({ skills, row }: { skills: Skill[]; row: AttemptRow }) {
  const t = useAppT();
  return <span className="hiring-chips">{skills.map((skill) => {
    const result = row.skills[skill];
    return <span key={skill} className="hiring-chip" title={`${skillText(t, skill)}: ${result ? `${result.score}` : '—'}`}>
      <abbr title={skillText(t, skill)}>{skillText(t, skill).slice(0, 1)}</abbr> {result ? shortLevel(result.level) : '…'}
    </span>;
  })}</span>;
}

export function LevelSpread({ levels, total, min }: { levels: Partial<Record<Level, number>>; total: number; min?: Level | null }) {
  const t = useAppT();
  return <div className="hiring-spread" role="img" aria-label={t('hiring.stats.spread')}>
    {LEVELS.map((level) => {
      const count = levels[level] ?? 0;
      const below = min ? levelIndex(level) < levelIndex(min) : false;
      return <div key={level} className={`hiring-spread-col${below ? ' below' : ''}`}>
        <span className="hiring-spread-count">{count || ''}</span>
        <span className="hiring-spread-bar"><b style={{ height: `${total ? Math.max(count ? 6 : 0, count / total * 100) : 0}%` }}/></span>
        <span className="hiring-spread-label">{shortLevel(level)}</span>
      </div>;
    })}
  </div>;
}

function Compare({ rows, skills, onClear }: { rows: AttemptRow[]; skills: Skill[]; onClear: () => void }) {
  const t = useAppT(), format = useFormat();
  const best = (value: (row: AttemptRow) => number | null) => {
    const values = rows.map(value).filter((entry): entry is number => entry !== null);
    return values.length ? Math.max(...values) : null;
  };
  const cell = (score: number | null, top: number | null) => score !== null && score === top && rows.length > 1 ? 'hiring-best' : '';
  return <div className="hiring-compare" aria-labelledby="hiring-compare-title">
    <div className="page-heading"><h3 id="hiring-compare-title">{t('hiring.compare.title')}</h3><button type="button" className="quiet hiring-small" onClick={onClear}>{t('hiring.compare.clear')}</button></div>
    <div className="company-table-wrap">
      <table className="company-table">
        <thead><tr><th>{t('hiring.col.candidate')}</th>{rows.map((row) => <th key={row.id}>{row.name}</th>)}</tr></thead>
        <tbody>
          <tr><th scope="row">{t('hiring.compare.overall')}</th>{rows.map((row) => <td key={row.id} className={cell(row.overall_score, best((entry) => entry.overall_score))}><LevelBadge level={row.overall_level} short/> {format.score(row.overall_score)}</td>)}</tr>
          {skills.map((skill) => {
            const top = best((row) => row.skills[skill]?.score ?? null);
            return <tr key={skill}><th scope="row">{skillText(t, skill)}</th>{rows.map((row) => {
              const result = row.skills[skill];
              return <td key={row.id} className={cell(result?.score ?? null, top)}>{result ? <>{shortLevel(result.level)} · {format.score(result.score)}</> : '—'}</td>;
            })}</tr>;
          })}
          <tr><th scope="row">{t('hiring.col.decision')}</th>{rows.map((row) => <td key={row.id}><DecisionBadge decision={row.decision}/></td>)}</tr>
          <tr><th scope="row">{t('hiring.col.flags')}</th>{rows.map((row) => <td key={row.id}><FlagList flags={row.flags}/></td>)}</tr>
        </tbody>
      </table>
    </div>
  </div>;
}
