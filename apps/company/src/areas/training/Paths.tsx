// Learning paths. /w/:org/my-path: the learner's ordered path with a planning estimate.
// /w/:org/paths (HR and managers): who is on what, with progress only under consent.
// /w/:org/paths/:member (HR edits): one person's path, starting from a suggestion.
import React, { useMemo, useState } from 'react';
import { LEVEL_LABEL, LEVELS, isLevel } from '../../../../../packages/company-core/src/mod.ts';
import { api } from '../../api.ts';
import { useAppT, useErrorText, type AppKey } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { tashkentDate } from './dates.ts';
import { downloadCsv, LevelBadge, Loading, Progress, SeatLocked, useDate, useLoad, useLocalized, type Localized, type SeatReason } from './lib.tsx';

interface StepView { kind: 'track' | 'course'; code: string; stage: 'foundation' | 'professional' | null; title: Localized | null; lessons: number; done: number | null; next: { code: string; track_code: string } | null; available: boolean }
interface Estimate { lessons_left: number; lesson_hours: number; level_hours: number; hours: number; weeks: number; minutes_per_week: number; pace: 'recent' | 'assumed' }
interface MyPathView { source: 'member' | 'department' | 'suggested'; level: string | null; target_level: string | null; due_date: string | null; steps: StepView[]; can_learn: boolean; seat_reason?: SeatReason | null; gap: number | null; estimate: Estimate }
interface Catalog {
  tracks: { code: string; title: Localized; foundation: number; professional: number }[];
  courses: { code: string; title: Localized; lessons: number; job_role: string | null }[];
}
interface Person {
  id: string; full_name: string | null; email: string | null; department_id: string | null; job_role: string; level: string | null; target_level: string | null; shared: boolean;
  path: { id: string; source: 'member' | 'department'; steps: number; target_level: string | null; due_date: string | null; lessons: number; done: number | null } | null;
}
interface DepartmentPath { id: string; department_id: string; target_level: string | null; due_date: string | null; steps: StepView[] }
interface Board { can_manage: boolean; catalog: Catalog; department_paths: DepartmentPath[]; people: Person[] }
interface MemberDetail {
  member: { id: string; full_name: string | null; email: string | null; job_role: string; department_id: string | null; level: string | null; target_level: string | null };
  shared: boolean;
  path: { id: string; source: 'member' | 'department'; target_level: string | null; due_date: string | null } | null;
  steps: StepView[]; target_level: string | null; estimate: Estimate; can_manage: boolean; catalog: Catalog;
}
interface DraftStep { kind: 'track' | 'course'; code: string; stage: 'foundation' | 'professional' | null }

const levelName = (level: string | null | undefined) => level && isLevel(level) ? LEVEL_LABEL[level] : '—';

function useStepName() {
  const t = useAppT(), pick = useLocalized();
  return (step: Pick<StepView, 'title' | 'stage'>) => `${step.title ? pick(step.title) : t('training.path.unavailable')}${step.stage ? ` · ${t(`training.stage.${step.stage}` as AppKey)}` : ''}`;
}

function EstimateNote({ estimate }: { estimate: Estimate }) {
  const t = useAppT();
  return <div className="training-p-estimate">
    <div className="company-stat"><strong>{estimate.weeks === 0 ? '✓' : t('training.path.weeks', { count: estimate.weeks })}</strong><span>{t('training.path.toTarget')}</span></div>
    <div className="company-stat"><strong>{t('training.path.hours', { count: Math.ceil(estimate.hours) })}</strong><span>{t('training.path.studyTime')}</span></div>
    <div className="company-stat"><strong>{estimate.lessons_left}</strong><span>{t('training.path.lessonsLeft')}</span></div>
    <p className="hint">{t(estimate.pace === 'recent' ? 'training.path.paceRecent' : 'training.path.paceAssumed', { minutes: estimate.minutes_per_week })} {t('training.path.estimateNote')}</p>
  </div>;
}

/** The lesson link a step leads to, when the viewer can learn. */
export function MyPath() {
  const t = useAppT(), when = useDate();
  const { org, member } = useWorkspace();
  const name = useStepName();
  const { data, error } = useLoad<MyPathView>(member ? `orgs/${org.id}/my/path` : null);
  if (!member) return <section><h1>{t('training.path.title')}</h1><p>{t('training.notMember')}</p></section>;
  if (!data) return <Loading error={error}/>;
  const total = data.steps.reduce((sum, step) => sum + step.lessons, 0), done = data.steps.reduce((sum, step) => sum + (step.done ?? 0), 0);
  const current = data.steps.findIndex((step) => (step.done ?? 0) < step.lessons);
  return <div className="training-page">
    <header className="training-head">
      <h1>{t('training.path.title')}</h1>
      <p>{t(`training.path.source.${data.source}` as AppKey)}</p>
    </header>
    {!data.can_learn && <SeatLocked browse reason={data.seat_reason}/>}
    <section className="training-card" aria-labelledby="training-p-goal">
      <h2 id="training-p-goal">{t('training.path.goal', { from: levelName(data.level), to: levelName(data.target_level) })}</h2>
      {data.due_date && <p>{t('training.path.due', { date: when(data.due_date) })}</p>}
      <Progress value={done} total={total} label={t('training.path.progress', { done, total })}/>
      <p className="hint">{t('training.path.progress', { done, total })}</p>
      <EstimateNote estimate={data.estimate}/>
    </section>
    <section className="training-card" aria-labelledby="training-p-steps">
      <h2 id="training-p-steps">{t('training.path.steps')}</h2>
      <ol className="training-p-steps">
        {data.steps.map((step, index) => {
          const finished = step.lessons > 0 && (step.done ?? 0) >= step.lessons;
          return <li key={`${step.kind}:${step.code}:${step.stage ?? ''}`} className={`${finished ? 'is-done ' : ''}${index === current ? 'is-current' : ''}`}>
            <span className="training-lesson-number" aria-hidden="true">{finished ? '✓' : index + 1}</span>
            <div>
              <strong>{name(step)}</strong>
              <span className="training-lesson-meta">
                <span className="company-badge">{t(step.kind === 'course' ? 'training.path.kindCourse' : 'training.path.kindTrack')}</span>
                <span className="hint">{t('training.me.lessonsProgress', { done: step.done ?? 0, total: step.lessons })}</span>
              </span>
              {step.lessons > 0 && <Progress value={step.done ?? 0} total={step.lessons} label={name(step)}/>}
            </div>
            {data.can_learn && step.next && <Link className={`button-link${index === current ? '' : ' quiet'}`} to={`/w/${org.id}/learn/${step.next.track_code}/${step.next.code}`}>{(step.done ?? 0) > 0 ? t('training.me.continueButton') : t('training.me.startButton')}<span className="visually-hidden"> {name(step)}</span></Link>}
          </li>;
        })}
      </ol>
    </section>
  </div>;
}

/** Adds, moves and removes steps of a path. */
function StepEditor({ steps, catalog, onChange }: { steps: DraftStep[]; catalog: Catalog; onChange: (steps: DraftStep[]) => void }) {
  const t = useAppT(), pick = useLocalized();
  const [choice, setChoice] = useState('');
  const options = useMemo(() => {
    const list: { value: string; label: string; step: DraftStep; group: 'course' | 'track' }[] = [];
    for (const course of catalog.courses) list.push({ value: `course:${course.code}:`, label: pick(course.title), step: { kind: 'course', code: course.code, stage: null }, group: 'course' });
    for (const track of catalog.tracks) for (const stage of ['foundation', 'professional'] as const) {
      list.push({ value: `track:${track.code}:${stage}`, label: `${pick(track.title)} · ${t(`training.stage.${stage}` as AppKey)}`, step: { kind: 'track', code: track.code, stage }, group: 'track' });
    }
    return list;
  }, [catalog, pick, t]);
  const key = (step: DraftStep) => `${step.kind}:${step.code}:${step.stage ?? ''}`;
  const label = (step: DraftStep) => options.find((option) => option.value === key(step))?.label ?? step.code;
  const free = options.filter((option) => !steps.some((step) => key(step) === option.value));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= steps.length) return;
    const next = [...steps];
    [next[from], next[to]] = [next[to], next[from]];
    onChange(next);
  };
  return <>
    <ol className="training-b-order">
      {steps.map((step, index) => <li key={key(step)}>
        <span className="training-b-grow"><strong>{label(step)}</strong></span>
        <span className="training-order-buttons">
          <button type="button" className="quiet" disabled={index === 0} aria-label={t('training.exercise.up', { line: label(step) })} onClick={() => move(index, index - 1)}>↑</button>
          <button type="button" className="quiet" disabled={index === steps.length - 1} aria-label={t('training.exercise.down', { line: label(step) })} onClick={() => move(index, index + 1)}>↓</button>
          <button type="button" className="quiet" aria-label={t('training.path.removeStep', { title: label(step) })} onClick={() => onChange(steps.filter((_, position) => position !== index))}>×</button>
        </span>
      </li>)}
    </ol>
    <form className="training-b-add" onSubmit={(event) => {
      event.preventDefault();
      const found = options.find((option) => option.value === choice);
      if (found) { onChange([...steps, found.step]); setChoice(''); }
    }}>
      <label>{t('training.path.addStep')}
        <select value={choice} onChange={(event) => setChoice(event.target.value)}>
          <option value="">{t('training.exercise.choose')}</option>
          {free.some((option) => option.group === 'course') && <optgroup label={t('training.builder.ours')}>{free.filter((option) => option.group === 'course').map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup>}
          <optgroup label={t('training.path.tracks')}>{free.filter((option) => option.group === 'track').map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup>
        </select>
      </label>
      <button className="quiet" disabled={!choice}>{t('common.add')}</button>
    </form>
  </>;
}

function TargetAndDue({ target, due, onTarget, onDue }: { target: string; due: string; onTarget: (value: string) => void; onDue: (value: string) => void }) {
  const t = useAppT();
  return <div className="training-form-row">
    <label>{t('training.plan.target')}
      <select value={target} onChange={(event) => onTarget(event.target.value)}>
        <option value="">{t('training.plan.noTarget')}</option>
        {LEVELS.filter((level) => level !== 'pre_a1').map((level) => <option key={level} value={level}>{t(`level.${level}` as AppKey)}</option>)}
      </select>
    </label>
    <label>{t('training.plan.due')}<input type="date" min={tashkentDate(new Date())} value={due} onChange={(event) => onDue(event.target.value)}/></label>
  </div>;
}

/** HR makes one path for a whole department, from a suggestion or from nothing. */
function DepartmentPathForm({ board, onSaved }: { board: Board; onSaved: () => Promise<void> }) {
  const t = useAppT(), problem = useErrorText();
  const { org, departments } = useWorkspace();
  const [department, setDepartment] = useState('');
  const [jobRole, setJobRole] = useState('general'), [level, setLevel] = useState('a2');
  const [target, setTarget] = useState('b1'), [due, setDue] = useState('');
  const [steps, setSteps] = useState<DraftStep[]>([]);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState(''), [notice, setNotice] = useState('');
  const existing = board.department_paths.find((path) => path.department_id === department);
  function choose(id: string) {
    setDepartment(id); setNotice(''); setEstimate(null);
    const current = board.department_paths.find((path) => path.department_id === id);
    setSteps(current ? current.steps.map(({ kind, code, stage }) => ({ kind, code, stage })) : []);
    setTarget(current?.target_level ?? 'b1');
    setDue(current?.due_date ?? '');
  }
  async function suggest() {
    setBusy(true); setFailure('');
    try {
      const result = await api<{ steps: StepView[]; target_level: string; estimate: Estimate }>(`orgs/${org.id}/paths/suggest`, { method: 'POST', body: { job_role: jobRole, level, target_level: target || null } });
      setSteps(result.steps.map(({ kind, code, stage }) => ({ kind, code, stage })));
      setEstimate(result.estimate);
    } catch (cause) {
      setFailure(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true); setFailure(''); setNotice('');
    try {
      await api(`orgs/${org.id}/paths`, { method: 'POST', body: { department_id: department, steps, target_level: target || null, due_date: due || null } });
      setNotice(t('training.path.saved'));
      await onSaved();
    } catch (cause) {
      setFailure(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!existing || !confirm(t('training.path.removeConfirm'))) return;
    setBusy(true); setFailure('');
    try {
      await api(`orgs/${org.id}/paths/${existing.id}`, { method: 'DELETE' });
      setSteps([]);
      setNotice(t('training.path.removed'));
      await onSaved();
    } catch (cause) {
      setFailure(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  return <section className="training-card" aria-labelledby="training-p-dept">
    <h2 id="training-p-dept">{t('training.path.department')}</h2>
    <p>{t('training.path.departmentLead')}</p>
    {departments.length === 0 ? <p className="hint">{t('training.plan.noDepartments')}</p> : <>
      <label>{t('training.plan.col.department')}
        <select value={department} onChange={(event) => choose(event.target.value)}>
          <option value="">{t('training.exercise.choose')}</option>
          {departments.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{board.department_paths.some((path) => path.department_id === entry.id) ? ` · ${t('training.path.hasPath')}` : ''}</option>)}
        </select>
      </label>
      {department && <>
        <div className="training-form-row">
          <label>{t('training.path.typicalRole')}
            <select value={jobRole} onChange={(event) => setJobRole(event.target.value)}>
              {board.catalog.tracks.map((track) => <option key={track.code} value={track.code}>{t(`job.${track.code}` as AppKey)}</option>)}
            </select>
          </label>
          <label>{t('training.path.typicalLevel')}
            <select value={level} onChange={(event) => setLevel(event.target.value)}>
              {LEVELS.filter((value) => value !== 'pre_a1').map((value) => <option key={value} value={value}>{t(`level.${value}` as AppKey)}</option>)}
            </select>
          </label>
        </div>
        <TargetAndDue target={target} due={due} onTarget={setTarget} onDue={setDue}/>
        <div className="company-actions"><button type="button" className="quiet" disabled={busy} onClick={() => void suggest()}>{t('training.path.suggest')}</button></div>
        {estimate && <EstimateNote estimate={estimate}/>}
        <StepEditor steps={steps} catalog={board.catalog} onChange={(next) => { setSteps(next); setEstimate(null); }}/>
        {failure && <p className="error" role="alert">{failure}</p>}
        {notice && <p className="notice" role="status">{notice}</p>}
        <div className="company-actions">
          <button type="button" disabled={busy || !steps.length} onClick={() => void save()}>{t('training.path.saveDepartment')}</button>
          {existing && <button type="button" className="quiet" disabled={busy} onClick={() => void remove()}>{t('training.path.remove')}</button>}
        </div>
      </>}
    </>}
  </section>;
}

export function PathsBoard() {
  const t = useAppT(), when = useDate();
  const { org, departments } = useWorkspace();
  const { data, error, reload } = useLoad<Board>(`orgs/${org.id}/paths`);
  const [search, setSearch] = useState('');
  const people = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.people ?? []).filter((person) => !needle || `${person.full_name ?? ''} ${person.email ?? ''}`.toLowerCase().includes(needle));
  }, [data, search]);
  if (!data) return <Loading error={error}/>;
  const departmentName = (id: string | null) => departments.find((entry) => entry.id === id)?.name ?? '—';
  return <div className="training-page">
    <header className="training-head">
      <h1>{t('training.path.boardTitle')}</h1>
      <p>{data.can_manage ? t('training.path.boardLead') : t('training.path.boardLeadManager')}</p>
    </header>
    {data.can_manage && <DepartmentPathForm board={data} onSaved={reload}/>}
    <section className="training-card" aria-labelledby="training-p-people">
      <h2 id="training-p-people">{t('training.path.people', { count: data.people.length })}</h2>
      <div className="company-toolbar">
        <label>{t('common.search')}<input type="search" value={search} onChange={(event) => setSearch(event.target.value)}/></label>
        <button type="button" className="quiet" onClick={() => downloadCsv('learning-paths.csv', [
          [t('training.plan.col.name'), t('training.plan.col.department'), t('training.plan.col.level'), t('training.plan.target'), t('training.path.col.path'), t('training.plan.due'), t('training.path.col.progress')],
          ...people.map((person) => [person.full_name ?? person.email, departmentName(person.department_id), person.level ?? '', person.path?.target_level ?? person.target_level ?? '', person.path ? t(person.path.source === 'member' ? 'training.path.ownPath' : 'training.path.departmentPath') : t('training.path.none'), person.path?.due_date ?? '', !person.path ? '' : person.shared ? `${person.path.done ?? 0}/${person.path.lessons}` : t('training.plan.notShared')]),
        ])}>{t('training.results.csv')}</button>
      </div>
      <div className="company-table-wrap">
        <table className="company-table">
          <caption className="visually-hidden">{t('training.path.boardTitle')}</caption>
          <thead><tr><th scope="col">{t('training.plan.col.name')}</th><th scope="col">{t('training.plan.col.department')}</th><th scope="col">{t('training.plan.col.level')}</th><th scope="col">{t('training.path.col.path')}</th><th scope="col">{t('training.path.col.progress')}</th><th scope="col"><span className="visually-hidden">{t('training.path.open')}</span></th></tr></thead>
          <tbody>
            {people.map((person) => <tr key={person.id}>
              <td>{person.full_name ?? person.email}</td>
              <td>{departmentName(person.department_id)}</td>
              <td><LevelBadge level={person.level}/></td>
              <td>{person.path ? <>{t(person.path.source === 'member' ? 'training.path.ownPath' : 'training.path.departmentPath')}{person.path.due_date && <span className="hint"> · {when(person.path.due_date)}</span>}</> : <span className="hint">{t('training.path.none')}</span>}</td>
              <td>{!person.path ? '—' : person.shared ? `${person.path.done ?? 0}/${person.path.lessons}` : <span className="hint">{t('training.plan.notShared')}</span>}</td>
              <td><Link to={`/w/${org.id}/paths/${person.id}`}>{t('training.path.open')}<span className="visually-hidden"> {person.full_name ?? person.email}</span></Link></td>
            </tr>)}
            {people.length === 0 && <tr><td colSpan={6}>{t('training.plan.nobody')}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="hint">{t('training.plan.privacy')}</p>
    </section>
  </div>;
}

export function PathMember({ id }: { id: string }) {
  const t = useAppT(), problem = useErrorText(), when = useDate();
  const { org } = useWorkspace();
  const name = useStepName();
  const { data, error, reload } = useLoad<MemberDetail>(`orgs/${org.id}/paths/member/${id}`);
  const [steps, setSteps] = useState<DraftStep[] | null>(null);
  const [target, setTarget] = useState<string | null>(null), [due, setDue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState(''), [notice, setNotice] = useState('');
  if (!data) return <Loading error={error}/>;
  const current = steps ?? data.steps.map(({ kind, code, stage }) => ({ kind, code, stage }));
  const targetValue = target ?? data.target_level ?? '';
  const dueValue = due ?? data.path?.due_date ?? '';

  async function save() {
    setBusy(true); setFailure(''); setNotice('');
    try {
      await api(`orgs/${org.id}/paths`, { method: 'POST', body: { member_id: id, steps: current, target_level: targetValue || null, due_date: dueValue || null } });
      setNotice(t('training.path.saved'));
      setSteps(null);
      await reload();
    } catch (cause) {
      setFailure(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!data?.path || data.path.source !== 'member' || !confirm(t('training.path.removeConfirm'))) return;
    setBusy(true); setFailure('');
    try {
      await api(`orgs/${org.id}/paths/${data.path.id}`, { method: 'DELETE' });
      setSteps(null); setTarget(null); setDue(null);
      await reload();
    } catch (cause) {
      setFailure(problem(cause));
    } finally {
      setBusy(false);
    }
  }

  return <div className="training-page">
    <p className="training-crumbs"><Link to={`/w/${org.id}/paths`}>{t('training.path.boardTitle')}</Link></p>
    <header className="training-head">
      <h1>{data.member.full_name ?? data.member.email}</h1>
      <p className="training-lesson-meta"><span>{t(`job.${data.member.job_role}` as AppKey)}</span> <LevelBadge level={data.member.level}/>
        <span>{data.path ? t(data.path.source === 'member' ? 'training.path.ownPath' : 'training.path.departmentPath') : t('training.path.suggestedHere')}</span>
      </p>
    </header>
    <section className="training-card" aria-labelledby="training-p-member">
      <h2 id="training-p-member">{t('training.path.goal', { from: levelName(data.member.level), to: levelName(data.target_level) })}</h2>
      {data.path?.due_date && <p>{t('training.path.due', { date: when(data.path.due_date) })}</p>}
      <EstimateNote estimate={data.estimate}/>
      {!data.shared && <p className="notice" role="note">{t('training.path.noConsent')}</p>}
      <ol className="training-p-steps">
        {data.steps.map((step, index) => <li key={`${step.code}:${step.stage ?? ''}`}>
          <span className="training-lesson-number" aria-hidden="true">{index + 1}</span>
          <div>
            <strong>{name(step)}</strong>
            {step.done !== null ? <>
              <span className="hint">{t('training.me.lessonsProgress', { done: step.done, total: step.lessons })}</span>
              <Progress value={step.done} total={step.lessons} label={name(step)}/>
            </> : <span className="hint">{t('training.plan.lessons', { count: step.lessons })}</span>}
          </div>
        </li>)}
      </ol>
    </section>
    {data.can_manage && <section className="training-card" aria-labelledby="training-p-edit">
      <h2 id="training-p-edit">{t('training.path.edit')}</h2>
      <p className="hint">{t('training.path.editHint')}</p>
      <TargetAndDue target={targetValue} due={dueValue} onTarget={setTarget} onDue={setDue}/>
      <StepEditor steps={current} catalog={data.catalog} onChange={setSteps}/>
      {failure && <p className="error" role="alert">{failure}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      <div className="company-actions">
        <button type="button" disabled={busy || !current.length} onClick={() => void save()}>{t('training.path.savePerson')}</button>
        {data.path?.source === 'member' && <button type="button" className="quiet" disabled={busy} onClick={() => void remove()}>{t('training.path.remove')}</button>}
      </div>
    </section>}
  </div>;
}
