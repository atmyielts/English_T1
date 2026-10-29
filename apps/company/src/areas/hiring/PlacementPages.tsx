// Placement and progress tests for staff (/w/:org/placement and
// /w/:org/placement/:assessment): HR launches one for everyone, departments or
// chosen people; managers follow their own department.
import React, { useMemo, useState, type FormEvent } from 'react';
import { SKILLS, type Level, type Skill } from '../../../../../packages/company-core/src/mod.ts';
import { api, type Usage } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link, navigate } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { LevelSpread, UsageLine, suggested } from './HiringPages.tsx';
import type { Assessment, Stats } from './types.ts';
import { CopyButton, LevelBadge, shortLevel, skillText, useFormat, useHiringError, useLoad } from './ui.tsx';

interface AudienceMember { id: string; full_name: string | null; email: string | null; department_id: string | null; job_role: string; role: string; level: Level | null }
interface Person {
  member_id: string; full_name: string | null; email: string | null; department_id: string | null; job_role: string;
  status: 'todo' | 'in_progress' | 'pending' | 'done'; attempt_id: string | null; started_at: string | null; submitted_at: string | null;
  level: Level | null; score: number | null; graded_attempt_id: string | null; previous_level: Level | null;
}
const toDateInput = (value: string | null | undefined) => value ? value.slice(0, 10) : '';
const fromDateInput = (value: string) => value ? new Date(`${value}T23:59:00+05:00`).toISOString() : null;

export function PlacementListPage() {
  const t = useAppT(), format = useFormat();
  const { org, departments } = useWorkspace();
  const { data, error, reload } = useLoad(() => api<{ campaigns: Assessment[]; usage: Usage | null; can_edit: boolean }>(`orgs/${org.id}/placement`), [org.id]);
  const [creating, setCreating] = useState(false);
  const audienceText = (assessment: Assessment) => {
    const audience = assessment.settings.audience ?? { type: 'all', ids: [] };
    if (audience.type === 'all') return t('hiring.placement.audience.all');
    if (audience.type === 'departments') return audience.ids.map((id) => departments.find((entry) => entry.id === id)?.name ?? '—').join(', ');
    return t('hiring.placement.peopleCount', { count: audience.ids.length });
  };
  return <div className="hiring-stack">
    <div className="page-heading">
      <div>
        <h1>{t('hiring.placement.title')}</h1>
        <p>{t('hiring.placement.lead')}</p>
      </div>
      {data?.can_edit && !creating && <button type="button" onClick={() => setCreating(true)}>{t('hiring.placement.new')}</button>}
    </div>
    {data && !data.can_edit && <p className="hint">{t('hiring.placement.managerNote')}</p>}
    {data?.usage && <UsageLine usage={data.usage}/>}
    {creating && <section aria-labelledby="placement-form-title">
      <h2 id="placement-form-title">{t('hiring.placement.formTitle')}</h2>
      <PlacementForm onCancel={() => setCreating(false)} onSaved={(assessment) => { void reload(); navigate(`/w/${org.id}/placement/${assessment.id}`); }}/>
    </section>}
    {error && <p className="error" role="alert">{error}</p>}
    {!data && !error && <p role="status">{t('app.loading')}</p>}
    {data && (data.campaigns.length === 0 && !creating ? <section className="hiring-empty">
      <h2>{t('hiring.placement.emptyTitle')}</h2>
      <p>{t('hiring.placement.empty')}</p>
      {data.can_edit && <button type="button" onClick={() => setCreating(true)}>{t('hiring.placement.new')}</button>}
    </section> : <ul className="hiring-cards">
      {data.campaigns.map((campaign) => {
        const progress = campaign.progress ?? { audience: 0, done: 0, in_progress: 0, levels: {} };
        return <li key={campaign.id} className="hiring-card">
          <div>
            <p className="eyebrow">{t(`hiring.kind.${campaign.kind}` as AppKey)}</p>
            <h2><Link to={`/w/${org.id}/placement/${campaign.id}`}>{campaign.title}</Link></h2>
            <p className="hiring-card-meta">
              <span className={`company-badge ${campaign.status === 'open' ? 'good' : ''}`}>{t(`hiring.testStatus.${campaign.status}` as AppKey)}</span>
              <span>{audienceText(campaign)}</span>
              {campaign.closes_at && <span>{t('hiring.list.closesOn', { date: format.date(campaign.closes_at) })}</span>}
              {campaign.settings.retest_days && <span>{t('hiring.placement.retestEvery', { count: campaign.settings.retest_days })}</span>}
            </p>
            <div className="hiring-progress" role="img" aria-label={t('hiring.placement.progress', { done: progress.done, total: progress.audience })}>
              <span className="hiring-mini wide"><b style={{ width: `${progress.audience ? progress.done / progress.audience * 100 : 0}%` }}/></span>
              <span>{t('hiring.placement.progress', { done: progress.done, total: progress.audience })}</span>
            </div>
          </div>
          <Link className="button-link quiet" to={`/w/${org.id}/placement/${campaign.id}`}>{t('hiring.list.openTest')}</Link>
        </li>;
      })}
    </ul>)}
  </div>;
}

/** Launch or edit a placement/progress test. */
function PlacementForm({ initial, onSaved, onCancel }: { initial?: Assessment; onSaved: (assessment: Assessment) => void; onCancel: () => void }) {
  const t = useAppT(), problem = useHiringError();
  const { org, departments } = useWorkspace();
  const people = useLoad(() => api<{ members: AudienceMember[] }>(`orgs/${org.id}/placement/audience`), [org.id]);
  const audience = initial?.settings.audience ?? { type: 'all' as const, ids: [] };
  const [form, setForm] = useState({
    kind: (initial?.kind ?? 'placement') as 'placement' | 'progress', title: initial?.title ?? '',
    skills: initial?.skills ?? (['grammar', 'vocabulary', 'reading', 'listening'] as Skill[]),
    time_limit_minutes: String(initial?.time_limit_minutes ?? suggested(['grammar', 'vocabulary', 'reading', 'listening'])),
    audienceType: audience.type, ids: audience.ids, retest_days: initial?.settings.retest_days ? String(initial.settings.retest_days) : '90',
    member_role: initial?.settings.member_role ?? true, closes_at: toDateInput(initial?.closes_at),
  });
  const [timeTouched, setTimeTouched] = useState(Boolean(initial));
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const toggleSkill = (skill: Skill) => {
    const skills = form.skills.includes(skill) ? form.skills.filter((entry) => entry !== skill) : SKILLS.filter((entry) => entry === skill || form.skills.includes(entry));
    setForm({ ...form, skills, time_limit_minutes: timeTouched ? form.time_limit_minutes : String(suggested(skills)) });
  };
  const toggleId = (id: string) => setForm({ ...form, ids: form.ids.includes(id) ? form.ids.filter((entry) => entry !== id) : [...form.ids, id] });
  const visible = useMemo(() => (people.data?.members ?? []).filter((member) => !search.trim() || `${member.full_name ?? ''} ${member.email ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())), [people.data, search]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    const body = {
      kind: form.kind, title: form.title, skills: form.skills, time_limit_minutes: Number(form.time_limit_minutes),
      audience: { type: form.audienceType, ids: form.audienceType === 'all' ? [] : form.ids.filter((id) => form.audienceType === 'departments' ? departments.some((entry) => entry.id === id) : (people.data?.members ?? []).some((member) => member.id === id)) },
      retest_days: form.retest_days ? Number(form.retest_days) : null, member_role: form.member_role, closes_at: fromDateInput(form.closes_at),
    };
    try {
      const { assessment } = initial
        ? await api<{ assessment: Assessment }>(`orgs/${org.id}/assessments/${initial.id}`, { method: 'PATCH', body: { ...body, kind: undefined } })
        : await api<{ assessment: Assessment }>(`orgs/${org.id}/placement`, { method: 'POST', body });
      onSaved(assessment);
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  return <form onSubmit={submit} className="hiring-form">
    {!initial && <fieldset>
      <legend>{t('hiring.placement.kind')}</legend>
      {(['placement', 'progress'] as const).map((kind) => <label key={kind} className="check"><input type="radio" name="placement-kind" checked={form.kind === kind} onChange={() => setForm({ ...form, kind, title: form.title || '' })}/> {t(`hiring.placement.kind.${kind}`)}</label>)}
    </fieldset>}
    <label>{t('hiring.placement.name')}<input required minLength={2} maxLength={160} value={form.title} placeholder={t(form.kind === 'placement' ? 'hiring.placement.namePlaceholder' : 'hiring.placement.namePlaceholderProgress')} onChange={(event) => setForm({ ...form, title: event.target.value })}/></label>
    <fieldset>
      <legend>{t('hiring.placement.audience')}</legend>
      <div className="hiring-segment" role="radiogroup" aria-label={t('hiring.placement.audience')}>
        {(['all', 'departments', 'members'] as const).map((type) => <label key={type} className={`check${form.audienceType === type ? ' on' : ''}`}><input type="radio" name="placement-audience" checked={form.audienceType === type} onChange={() => setForm({ ...form, audienceType: type, ids: [] })}/> {t(`hiring.placement.audience.${type}`)}</label>)}
      </div>
      {form.audienceType === 'departments' && (departments.length ? <div className="hiring-pick-list">
        {departments.map((department) => <label key={department.id} className="check"><input type="checkbox" checked={form.ids.includes(department.id)} onChange={() => toggleId(department.id)}/> {department.name}</label>)}
      </div> : <p className="hint">{t('hiring.placement.noDepartments')}</p>)}
      {form.audienceType === 'members' && <>
        <label>{t('hiring.placement.searchPeople')}<input type="search" value={search} onChange={(event) => setSearch(event.target.value)}/></label>
        <p className="hint" role="status">{t('hiring.placement.selected', { count: form.ids.length })}</p>
        <div className="hiring-pick-list tall">
          {visible.map((member) => <label key={member.id} className="check"><input type="checkbox" checked={form.ids.includes(member.id)} onChange={() => toggleId(member.id)}/>
            <span>{member.full_name ?? member.email} <span className="hiring-muted">{departments.find((entry) => entry.id === member.department_id)?.name ?? ''} {member.level ? `· ${shortLevel(member.level)}` : ''}</span></span></label>)}
        </div>
      </>}
      {form.audienceType !== 'all' && !form.ids.length && <p className="hint">{t('hiring.placement.chooseSomeone')}</p>}
    </fieldset>
    <fieldset>
      <legend>{t('hiring.form.skills')}</legend>
      <div className="hiring-skill-picks">
        {SKILLS.map((skill) => <label key={skill} className={`check hiring-skill-pick${form.skills.includes(skill) ? ' on' : ''}`}>
          <input type="checkbox" checked={form.skills.includes(skill)} onChange={() => toggleSkill(skill)}/>
          <span><strong>{skillText(t, skill)}</strong><small>{t(`hiring.skillInfo.${skill}` as AppKey)}</small></span>
        </label>)}
      </div>
    </fieldset>
    <label className="check"><input type="checkbox" checked={form.member_role} onChange={(event) => setForm({ ...form, member_role: event.target.checked })}/> {t('hiring.placement.memberRole')}</label>
    <div className="hiring-form-row">
      <label>{t('hiring.form.time')}<input type="number" required min={5} max={180} value={form.time_limit_minutes} onChange={(event) => { setTimeTouched(true); setForm({ ...form, time_limit_minutes: event.target.value }); }}/>
        <span className="hint">{t('hiring.form.timeHint', { minutes: suggested(form.skills) })}</span></label>
      <label>{t('hiring.placement.retest')}<input type="number" min={1} max={730} value={form.retest_days} onChange={(event) => setForm({ ...form, retest_days: event.target.value })}/>
        <span className="hint">{t('hiring.placement.retestHint')}</span></label>
      <label>{t('hiring.form.closesAt')} <span className="hint">{t('common.optional')}</span><input type="date" value={form.closes_at} onChange={(event) => setForm({ ...form, closes_at: event.target.value })}/></label>
    </div>
    <div className="company-actions">
      <button disabled={busy || !form.skills.length || (form.audienceType !== 'all' && !form.ids.length)}>{busy ? t('hiring.run.working') : initial ? t('hiring.form.save') : t('hiring.placement.launch')}</button>
      <button type="button" className="quiet" onClick={onCancel}>{t('common.cancel')}</button>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
  </form>;
}

export function PlacementDetailPage({ assessmentId }: { assessmentId: string }) {
  const t = useAppT(), problem = useHiringError(), format = useFormat();
  const { org, departments } = useWorkspace();
  const { data, error, setData, reload } = useLoad(() => api<{ assessment: Assessment; people: Person[]; stats: Stats; can_edit: boolean }>(`orgs/${org.id}/placement/${assessmentId}`), [org.id, assessmentId]);
  const [editing, setEditing] = useState(false);
  const [filter, setFilter] = useState({ status: '', department: '', search: '' });
  const [busy, setBusy] = useState(false), [actionError, setActionError] = useState('');
  const rows = useMemo(() => (data?.people ?? []).filter((person) =>
    (!filter.status || person.status === filter.status)
    && (!filter.department || (filter.department === 'none' ? !person.department_id : person.department_id === filter.department))
    && (!filter.search.trim() || `${person.full_name ?? ''} ${person.email ?? ''}`.toLowerCase().includes(filter.search.trim().toLowerCase()))), [data, filter]);
  if (error) return <section><p className="error" role="alert">{error}</p><p><Link to={`/w/${org.id}/placement`}>{t('hiring.placement.back')}</Link></p></section>;
  if (!data) return <p role="status">{t('app.loading')}</p>;
  const { assessment, people, can_edit: canEdit } = data;
  const done = people.filter((person) => person.status === 'done');
  const levels = done.reduce<Partial<Record<Level, number>>>((out, person) => { if (person.level) out[person.level] = (out[person.level] ?? 0) + 1; return out; }, {});
  const memberLink = `${location.origin}/w/${org.id}/test/${assessment.id}`;
  async function setStatus(status: 'open' | 'closed') {
    setBusy(true); setActionError('');
    try {
      const { assessment: updated } = await api<{ assessment: Assessment }>(`orgs/${org.id}/assessments/${assessment.id}`, { method: 'PATCH', body: { status } });
      setData({ ...data!, assessment: updated });
    } catch (cause) {
      setActionError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  return <div className="hiring-stack">
    <p className="no-print"><Link to={`/w/${org.id}/placement`}>← {t('hiring.placement.back')}</Link></p>
    <div className="page-heading">
      <div>
        <p className="eyebrow">{t(`hiring.kind.${assessment.kind}` as AppKey)}</p>
        <h1>{assessment.title}</h1>
        <p className="hiring-card-meta">
          <span className={`company-badge ${assessment.status === 'open' ? 'good' : ''}`}>{t(`hiring.testStatus.${assessment.status}` as AppKey)}</span>
          <span>{assessment.skills.map((skill) => skillText(t, skill)).join(' · ')}</span>
          <span>{t('common.minutes', { count: assessment.time_limit_minutes })}</span>
          {assessment.settings.retest_days && <span>{t('hiring.placement.retestEvery', { count: assessment.settings.retest_days })}</span>}
        </p>
      </div>
      <button type="button" className="quiet no-print" onClick={() => print()}>{t('common.print')}</button>
    </div>
    {canEdit && <div className="company-actions no-print">
      <button type="button" className="quiet" onClick={() => setEditing((value) => !value)}>{t('common.edit')}</button>
      <button type="button" className="quiet" disabled={busy} onClick={() => void setStatus(assessment.status === 'open' ? 'closed' : 'open')}>{assessment.status === 'open' ? t('hiring.detail.close') : t('hiring.detail.reopen')}</button>
    </div>}
    {actionError && <p className="error" role="alert">{actionError}</p>}
    {editing && <section aria-labelledby="placement-edit-title">
      <h2 id="placement-edit-title">{t('hiring.form.editTitle')}</h2>
      <PlacementForm initial={assessment} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); void reload(); }}/>
    </section>}
    {assessment.status === 'open' && <section className="hiring-link no-print" aria-labelledby="placement-share">
      <h2 id="placement-share">{t('hiring.placement.shareTitle')}</h2>
      <p className="hint">{t('hiring.placement.howTo')}</p>
      <div className="hiring-link-row">
        <label className="hiring-link-field"><span className="visually-hidden">{t('hiring.link.label')}</span><input readOnly value={memberLink} onFocus={(event) => event.target.select()}/></label>
        <CopyButton text={memberLink}/>
      </div>
    </section>}
    <div className="company-grid hiring-stats">
      <div className="company-stat"><strong>{people.length}</strong><span>{t('hiring.placement.stat.audience')}</span></div>
      <div className="company-stat"><strong>{done.length}</strong><span>{t('hiring.placement.stat.done')}</span></div>
      <div className="company-stat"><strong>{people.filter((person) => person.status === 'in_progress' || person.status === 'pending').length}</strong><span>{t('hiring.placement.stat.inProgress')}</span></div>
      <div className="company-stat"><strong>{people.filter((person) => person.status === 'todo').length}</strong><span>{t('hiring.placement.stat.todo')}</span></div>
    </div>
    {done.length > 0 && <LevelSpread levels={levels} total={done.length}/>}
    <section aria-labelledby="placement-people">
      <h2 id="placement-people">{t('hiring.placement.people')}</h2>
      {!canEdit && <p className="hint">{t('hiring.placement.managerNote')}</p>}
      <div className="company-toolbar no-print">
        <label>{t('hiring.filter.search')}<input type="search" value={filter.search} onChange={(event) => setFilter({ ...filter, search: event.target.value })}/></label>
        <label>{t('hiring.filter.status')}<select value={filter.status} onChange={(event) => setFilter({ ...filter, status: event.target.value })}>
          <option value="">{t('hiring.filter.any')}</option>
          {(['todo', 'in_progress', 'pending', 'done'] as const).map((status) => <option key={status} value={status}>{t(`hiring.placement.person.${status}`)}</option>)}
        </select></label>
        {departments.length > 0 && <label>{t('hiring.filter.department')}<select value={filter.department} onChange={(event) => setFilter({ ...filter, department: event.target.value })}>
          <option value="">{t('hiring.filter.any')}</option>
          {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
          <option value="none">{t('hiring.placement.noDepartment')}</option>
        </select></label>}
      </div>
      {people.length === 0 ? <p>{t('hiring.placement.nobody')}</p> : rows.length === 0 ? <p>{t('hiring.detail.noMatch')}</p> : <div className="company-table-wrap">
        <table className="company-table">
          <thead><tr><th>{t('hiring.placement.col.person')}</th><th>{t('hiring.filter.department')}</th><th>{t('hiring.col.status')}</th><th>{t('hiring.placement.col.before')}</th><th>{t('hiring.placement.col.result')}</th><th>{t('hiring.col.date')}</th></tr></thead>
          <tbody>{rows.map((person) => <tr key={person.member_id}>
            <td>{person.graded_attempt_id || person.attempt_id
              ? <Link to={`/w/${org.id}/placement/${assessment.id}/${person.graded_attempt_id ?? person.attempt_id}`}><strong>{person.full_name ?? person.email}</strong></Link>
              : <strong>{person.full_name ?? person.email}</strong>}<br/><span className="hiring-muted">{t(`job.${person.job_role}` as AppKey)}</span></td>
            <td>{departments.find((entry) => entry.id === person.department_id)?.name ?? t('hiring.placement.noDepartment')}</td>
            <td><span className={`company-badge ${person.status === 'done' ? 'good' : person.status === 'todo' ? '' : 'warn'}`}>{t(`hiring.placement.person.${person.status}` as AppKey)}</span></td>
            <td>{person.previous_level ? <LevelBadge level={person.previous_level} short/> : <span className="hiring-muted">—</span>}</td>
            <td>{person.level ? <><LevelBadge level={person.level} short/> <span className="hiring-muted">{format.score(person.score)}</span></> : <span className="hiring-muted">—</span>}</td>
            <td>{format.date(person.submitted_at ?? person.started_at)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </div>;
}
