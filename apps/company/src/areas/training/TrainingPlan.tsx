// Training plan (/w/:org/training): HR assigns a track, a target level and a due
// date to everyone, departments or people, and follows completion. Managers see
// their own department. Progress of people who have not agreed to share is hidden.
import React, { useMemo, useState, type FormEvent } from 'react';
import { LEVEL_LABEL, LEVELS, isLevel } from '../../../../../packages/company-core/src/mod.ts';
import { api } from '../../api.ts';
import { useAppT, useErrorText, type AppKey } from '../../i18n/index.ts';
import { useWorkspace } from '../../session.tsx';
import { LevelBadge, Loading, Progress, useDate, useLoad, useLocalized, type Localized } from './lib.tsx';

interface Stats { people: number; shared: number; hidden: number; done: number; completion: number | null; lessons_percent: number | null; at_target: number | null; overdue: boolean }
interface Assignment {
  id: string; track_code: string | null; track_title: Localized | null; track_lessons: number; target_level: string | null; due_date: string | null;
  department_id: string | null; member_id: string | null; person_name: string | null; note: string | null; status: 'active' | 'done' | 'cancelled'; created_at: string; stats: Stats;
}
interface Person { member_id: string; full_name: string | null; email: string | null; department_id: string | null; level: string | null; shared: boolean; lessons_done: number | null; lessons_total: number; meets_target: boolean | null; done: boolean | null; last_active: string | null }
interface Overview {
  can_manage: boolean;
  tracks: { code: string; title: Localized; lessons: number }[];
  people: { id: string; full_name: string | null; email: string | null; department_id: string | null; job_role: string; level: string | null }[];
  assignments: Assignment[];
}

export function TrainingPlan() {
  const t = useAppT();
  const { org } = useWorkspace();
  const { data, error, reload } = useLoad<Overview>(`orgs/${org.id}/assignments`);
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  if (!data) return <Loading error={error}/>;
  const list = data.assignments.filter((row) => filter === 'all' || row.status === 'active');
  return <div className="training-page">
    <header className="training-head">
      <h1>{t('training.plan.title')}</h1>
      <p>{data.can_manage ? t('training.plan.lead') : t('training.plan.leadManager')}</p>
    </header>
    {data.can_manage && <AssignForm overview={data} onDone={reload}/>}
    <section className="training-card" aria-labelledby="training-plan-list">
      <h2 id="training-plan-list">{t('training.plan.list')}</h2>
      <div className="company-toolbar">
        <label>{t('training.plan.show')}
          <select value={filter} onChange={(event) => setFilter(event.target.value as 'active' | 'all')}>
            <option value="active">{t('training.plan.showActive')}</option>
            <option value="all">{t('training.plan.showAll')}</option>
          </select>
        </label>
      </div>
      {list.length === 0 ? <p>{t('training.plan.empty')}</p> : <ul className="training-assignments">
        {list.map((row) => <AssignmentItem key={row.id} row={row} canManage={data.can_manage} onChanged={reload}/>)}
      </ul>}
      <p className="hint">{t('training.plan.privacy')}</p>
    </section>
  </div>;
}

function AssignForm({ overview, onDone }: { overview: Overview; onDone: () => Promise<void> }) {
  const t = useAppT(), pick = useLocalized(), problem = useErrorText();
  const { org, departments } = useWorkspace();
  const [form, setForm] = useState({ track_code: '', target_level: 'b1', due_date: '', note: '', scope: 'departments' as 'all' | 'departments' | 'people' });
  const [chosenDepartments, setChosenDepartments] = useState<string[]>([]);
  const [chosenPeople, setChosenPeople] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState(''), [notice, setNotice] = useState('');
  const people = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return overview.people.filter((person) => !needle || `${person.full_name ?? ''} ${person.email ?? ''}`.toLowerCase().includes(needle));
  }, [overview.people, search]);
  const departmentName = (id: string | null) => departments.find((entry) => entry.id === id)?.name ?? t('training.plan.noDepartment');
  const toggle = (list: string[], id: string) => list.includes(id) ? list.filter((value) => value !== id) : [...list, id];
  const today = new Date().toISOString().slice(0, 10);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setFailure(''); setNotice('');
    try {
      const result = await api<{ created: number }>(`orgs/${org.id}/assignments`, { method: 'POST', body: {
        scope: form.scope, track_code: form.track_code || null, target_level: form.target_level || null, due_date: form.due_date || null, note: form.note || null,
        department_ids: form.scope === 'departments' ? chosenDepartments : undefined,
        member_ids: form.scope === 'people' ? chosenPeople : undefined,
      } });
      setNotice(t('training.plan.created', { count: result.created }));
      setChosenDepartments([]); setChosenPeople([]);
      setForm({ ...form, note: '' });
      await onDone();
    } catch (cause) {
      setFailure(problem(cause));
    } finally {
      setBusy(false);
    }
  }

  return <section className="training-card" aria-labelledby="training-assign">
    <h2 id="training-assign">{t('training.plan.assign')}</h2>
    <form onSubmit={submit}>
      <div className="training-form-row">
        <label>{t('training.plan.track')}
          <select value={form.track_code} onChange={(event) => setForm({ ...form, track_code: event.target.value })}>
            <option value="">{t('training.plan.noTrack')}</option>
            {overview.tracks.map((track) => <option key={track.code} value={track.code}>{pick(track.title)} ({t('training.plan.lessons', { count: track.lessons })})</option>)}
          </select>
        </label>
        <label>{t('training.plan.target')}
          <select value={form.target_level} onChange={(event) => setForm({ ...form, target_level: event.target.value })}>
            <option value="">{t('training.plan.noTarget')}</option>
            {LEVELS.filter((level) => level !== 'pre_a1').map((level) => <option key={level} value={level}>{t(`level.${level}` as AppKey)}</option>)}
          </select>
        </label>
        <label>{t('training.plan.due')}<input type="date" min={today} value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })}/></label>
      </div>
      <fieldset>
        <legend>{t('training.plan.who')}</legend>
        {(['all', 'departments', 'people'] as const).map((scope) => <label key={scope} className="check">
          <input type="radio" name="training-scope" checked={form.scope === scope} onChange={() => setForm({ ...form, scope })}/>{t(`training.plan.scope.${scope}` as AppKey)}
        </label>)}
      </fieldset>
      {form.scope === 'departments' && <fieldset>
        <legend>{t('training.plan.departments')}</legend>
        {departments.length === 0 ? <p className="hint">{t('training.plan.noDepartments')}</p> : departments.map((department) => <label key={department.id} className="check">
          <input type="checkbox" checked={chosenDepartments.includes(department.id)} onChange={() => setChosenDepartments(toggle(chosenDepartments, department.id))}/>{department.name}
        </label>)}
      </fieldset>}
      {form.scope === 'people' && <fieldset>
        <legend>{t('training.plan.people', { count: chosenPeople.length })}</legend>
        <label>{t('common.search')}<input type="search" value={search} onChange={(event) => setSearch(event.target.value)}/></label>
        <div className="training-people-pick">
          {people.map((person) => <label key={person.id} className="check">
            <input type="checkbox" checked={chosenPeople.includes(person.id)} onChange={() => setChosenPeople(toggle(chosenPeople, person.id))}/>
            <span>{person.full_name ?? person.email} <span className="hint">· {departmentName(person.department_id)} · {person.level && isLevel(person.level) ? LEVEL_LABEL[person.level] : t('level.none')}</span></span>
          </label>)}
          {people.length === 0 && <p className="hint">{t('training.glossary.noMatch')}</p>}
        </div>
      </fieldset>}
      <label><span>{t('training.plan.note')} <span className="hint">{t('common.optional')}</span></span><textarea rows={2} maxLength={1000} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })}/></label>
      {failure && <p className="error" role="alert">{failure}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      <button disabled={busy || (!form.track_code && !form.target_level) || (form.scope === 'departments' && !chosenDepartments.length) || (form.scope === 'people' && !chosenPeople.length)}>{t('training.plan.assignButton')}</button>
    </form>
  </section>;
}

function AssignmentItem({ row, canManage, onChanged }: { row: Assignment; canManage: boolean; onChanged: () => Promise<void> }) {
  const t = useAppT(), pick = useLocalized(), problem = useErrorText(), when = useDate();
  const { org, departments } = useWorkspace();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState(''), [busy, setBusy] = useState(false);
  const scope = row.member_id ? row.person_name ?? t('training.plan.scope.people')
    : row.department_id ? departments.find((entry) => entry.id === row.department_id)?.name ?? t('training.plan.noDepartment') : t('training.plan.scope.all');
  const { stats } = row;

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !people) {
      try {
        setPeople((await api<{ people: Person[] }>(`orgs/${org.id}/assignments/${row.id}`)).people);
      } catch (cause) {
        setFailure(problem(cause));
      }
    }
  }
  async function setStatus(status: 'done' | 'cancelled' | 'active') {
    setBusy(true); setFailure('');
    try {
      await api(`orgs/${org.id}/assignments/${row.id}`, { method: 'PATCH', body: { status } });
      await onChanged();
    } catch (cause) {
      setFailure(problem(cause));
    } finally {
      setBusy(false);
    }
  }

  return <li className="training-assignment">
    <div className="training-assignment-head">
      <div>
        <strong>{row.track_title ? pick(row.track_title) : t('training.plan.levelOnly')}</strong>
        <span>{scope}
          {row.target_level && <> · {t('training.plan.targetShort', { level: isLevel(row.target_level) ? LEVEL_LABEL[row.target_level] : row.target_level })}</>}
          {row.due_date && <> · {t('training.me.due', { date: when(row.due_date) })}</>}
        </span>
        {row.note && <span className="training-note">{row.note}</span>}
      </div>
      <span className="training-assignment-badges">
        {row.status !== 'active' && <span className="company-badge">{t(`training.plan.status.${row.status}` as AppKey)}</span>}
        {stats.overdue && <span className="company-badge bad">{t('training.me.overdue')}</span>}
      </span>
    </div>
    <div className="training-assignment-stats">
      <div>
        <Progress value={stats.done} total={stats.shared} label={t('training.plan.completion')}/>
        <span>{stats.completion === null ? t('training.plan.noShared') : t('training.plan.doneOf', { done: stats.done, total: stats.shared, percent: stats.completion })}</span>
      </div>
      {stats.lessons_percent !== null && <span>{t('training.plan.lessonsPercent', { percent: stats.lessons_percent })}</span>}
      {stats.at_target !== null && <span>{t('training.plan.atTarget', { count: stats.at_target, total: stats.people })}</span>}
      {stats.hidden > 0 && <span className="hint">{t('training.plan.hidden', { count: stats.hidden })}</span>}
    </div>
    <div className="company-actions">
      <button type="button" className="quiet" aria-expanded={open} onClick={() => void toggle()}>{open ? t('training.plan.hidePeople') : t('training.plan.showPeople', { count: stats.people })}</button>
      {canManage && row.status === 'active' && <>
        <button type="button" className="quiet" disabled={busy} onClick={() => void setStatus('done')}>{t('training.plan.markDone')}</button>
        <button type="button" className="quiet" disabled={busy} onClick={() => { if (confirm(t('training.plan.cancelConfirm'))) void setStatus('cancelled'); }}>{t('training.plan.cancel')}</button>
      </>}
      {canManage && row.status !== 'active' && <button type="button" className="quiet" disabled={busy} onClick={() => void setStatus('active')}>{t('training.plan.reopen')}</button>}
    </div>
    {failure && <p className="error" role="alert">{failure}</p>}
    {open && (people ? <div className="company-table-wrap">
      <table className="company-table">
        <caption className="visually-hidden">{t('training.plan.peopleCaption')}</caption>
        <thead><tr><th scope="col">{t('training.plan.col.name')}</th><th scope="col">{t('training.plan.col.department')}</th><th scope="col">{t('training.plan.col.level')}</th><th scope="col">{t('training.plan.col.lessons')}</th><th scope="col">{t('training.plan.col.status')}</th><th scope="col">{t('training.plan.col.active')}</th></tr></thead>
        <tbody>
          {people.map((person) => <tr key={person.member_id}>
            <td>{person.full_name ?? person.email}</td>
            <td>{departments.find((entry) => entry.id === person.department_id)?.name ?? '—'}</td>
            <td><LevelBadge level={person.level}/>{person.meets_target && <span className="visually-hidden"> {t('training.me.targetMet')}</span>}</td>
            <td>{person.shared ? (person.lessons_total ? `${person.lessons_done}/${person.lessons_total}` : '—') : <span className="hint">{t('training.plan.notShared')}</span>}</td>
            <td>{!person.shared ? '—' : person.done ? <span className="company-badge good">{t('training.done')}</span> : <span className="company-badge warn">{t('training.notYet')}</span>}</td>
            <td>{person.last_active ? when(person.last_active) : '—'}</td>
          </tr>)}
          {people.length === 0 && <tr><td colSpan={6}>{t('training.plan.nobody')}</td></tr>}
        </tbody>
      </table>
    </div> : !failure && <p role="status">{t('app.loading')}</p>)}
  </li>;
}
