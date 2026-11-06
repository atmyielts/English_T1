// /w/:org/challenges — team challenges: HR creates, edits and ends them;
// everyone sees department and personal standings.
import React, { useState, type FormEvent } from 'react';
import { api } from '../../api.ts';
import { useAppT, useErrorText, type AppKey } from '../../i18n/index.ts';
import { Link, navigate, useLocation } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { useApi, type Challenge, type ChallengeList, type Department, type Standings } from './api.ts';
import { addDays, BarList, Loading, Panel, Problem, tashkentToday, useFormat } from './ui.tsx';

const METRICS = ['points', 'minutes', 'lessons', 'active_days'] as const;
type MetricCode = (typeof METRICS)[number];

/** Ready-made starting points. Each only fills the form; HR changes anything before creating it. */
const TEMPLATES: { code: string; metric: MetricCode; days: number; teams: boolean }[] = [
  { code: 'habit_30', metric: 'active_days', days: 30, teams: false },
  { code: 'minutes_marathon', metric: 'minutes', days: 28, teams: false },
  { code: 'lesson_sprint', metric: 'lessons', days: 14, teams: false },
  { code: 'department_cup', metric: 'points', days: 28, teams: true },
];

export function Challenges() {
  const t = useAppT();
  const { org } = useWorkspace();
  const { query } = useLocation();
  const { data, error, loading, reload } = useApi<ChallengeList>(`orgs/${org.id}/challenges`);
  const [editing, setEditing] = useState<Challenge | 'new' | null>(null);
  const [repeat, setRepeat] = useState<Challenge | null>(null);
  if (error && !data) return <Problem message={error} retry={() => void reload()}/>;
  if (loading && !data) return <Loading/>;
  if (!data) return null;
  const chosen = data.challenges.find((row) => row.id === query.get('c')) ?? data.challenges[0] ?? null;
  const select = (id: string) => navigate(`/w/${org.id}/challenges?c=${id}`, { replace: true });

  return <div className="insights insights-challenges">
    <header className="insights-head">
      <div>
        <h1>{t('insights.challenges.title')}</h1>
        <p className="insights-lead">{t('insights.challenges.lead')}</p>
      </div>
      <div className="company-actions">
        <Link className="button-link quiet" to={`/w/${org.id}/challenges/winners`}>{t('insights.winners.title')}</Link>
        {data.can_manage && !editing && <button onClick={() => { setRepeat(null); setEditing('new'); }}>{t('insights.challenges.new')}</button>}
      </div>
    </header>

    {editing && <ChallengeForm key={repeat?.id ?? (editing === 'new' ? 'new' : editing.id)} departments={data.departments} challenge={editing === 'new' ? null : editing} repeat={repeat}
      onDone={async (saved) => { setEditing(null); setRepeat(null); await reload(); if (saved) select(saved.id); }}/>}

    {data.challenges.length === 0 ? <section className="insights-panel"><p className="insights-empty">{data.can_manage ? t('insights.challenges.emptyHr') : t('insights.challenges.empty')}</p></section> : <>
      <nav className="insights-chips" aria-label={t('insights.challenges.list')}>
        {data.challenges.map((row) => <button key={row.id} type="button" className={row.id === chosen?.id ? '' : 'quiet'} aria-pressed={row.id === chosen?.id} onClick={() => select(row.id)}>
          {row.title} <span className={`company-badge ${row.status === 'running' ? 'good' : row.status === 'upcoming' ? '' : 'warn'}`}>{t(`insights.challengeStatus.${row.status}` as AppKey)}</span>
        </button>)}
      </nav>
      {chosen && <StandingsView key={chosen.id} challenge={chosen} departments={data.departments} onEdit={() => { setRepeat(null); setEditing(chosen); }} onRepeat={() => { setRepeat(chosen); setEditing('new'); }} onChanged={() => void reload()}/>}
    </>}
  </div>;
}

function StandingsView({ challenge, departments, onEdit, onRepeat, onChanged }: { challenge: Challenge; departments: Department[]; onEdit: () => void; onRepeat: () => void; onChanged: () => void }) {
  const t = useAppT(), f = useFormat(), problem = useErrorText();
  const { org, lead, member } = useWorkspace();
  const { data, error, loading, reload } = useApi<Standings>(`orgs/${org.id}/challenges/${challenge.id}`);
  const [busy, setBusy] = useState(false), [actionError, setActionError] = useState('');
  const unit = (value: number) => challenge.metric === 'minutes' ? f.minutes(value) : t(`insights.metricValue.${challenge.metric}` as AppKey, { count: value });
  const scope = challenge.department_ids.length ? departments.filter((entry) => challenge.department_ids.includes(entry.id)).map((entry) => entry.name).join(', ') : t('insights.everyone');
  async function act(path: string, method: 'POST' | 'DELETE', confirmText: string) {
    if (!confirm(confirmText)) return;
    setBusy(true); setActionError('');
    try {
      await api(`orgs/${org.id}/challenges/${challenge.id}${path}`, { method });
      if (method === 'DELETE') navigate(`/w/${org.id}/challenges`, { replace: true });
      onChanged();
      await reload();
    } catch (cause) {
      setActionError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  return <>
    <Panel id="ch-detail" title={challenge.title} actions={data?.can_manage && <>
      {challenge.status !== 'finished' && <button className="quiet" disabled={busy} onClick={onEdit}>{t('common.edit')}</button>}
      {challenge.status === 'running' && <button className="quiet" disabled={busy} onClick={() => void act('/end', 'POST', t('insights.challenges.confirmEnd'))}>{t('insights.challenges.end')}</button>}
      {challenge.status === 'upcoming' && <button className="quiet" disabled={busy} onClick={() => void act('', 'DELETE', t('insights.challenges.confirmDelete'))}>{t('common.delete')}</button>}
      {challenge.status === 'finished' && <button className="quiet" disabled={busy} onClick={onRepeat}>{t('insights.challenges.repeat')}</button>}
    </>}>
      <p className="insights-meta">
        <span className={`company-badge ${challenge.status === 'running' ? 'good' : challenge.status === 'finished' ? 'warn' : ''}`}>{t(`insights.challengeStatus.${challenge.status}` as AppKey)}</span>
        <span>{f.date(challenge.starts_on)} – {f.date(challenge.ends_on)}</span>
        <span>{t('insights.challenges.metricIs', { metric: t(`insights.metric.${challenge.metric}` as AppKey) })}</span>
        <span>{scope}</span>
        {data && challenge.status === 'running' && <span><strong>{t('insights.challenges.daysLeft', { count: data.days_left })}</strong></span>}
        {data && challenge.status === 'upcoming' && <span><strong>{t('insights.challenges.startsIn', { count: data.starts_in })}</strong></span>}
      </p>
      {challenge.description && <p className="insights-description">{challenge.description}</p>}
      {challenge.prize && <p className="insights-winner-prize">{t('insights.winners.prize', { prize: challenge.prize })}</p>}
      {data?.frozen_at && <p className="hint">{t('insights.challenges.frozen', { date: f.date(data.frozen_at) })}</p>}
      {actionError && <p className="error" role="alert">{actionError}</p>}
      {error && <Problem message={error} retry={() => void reload()}/>}
      {loading && !data && <Loading/>}
      {data && <>
        {data.me && !(data.can_manage && !data.me.rank) && <div className="insights-me" role="status">
          {!data.me.sharing ? <p>{t('insights.challenges.meNotSharing')}</p>
            : !data.me.participating ? <p>{t('insights.challenges.meNotIn')}</p>
            : data.me.rank ? <p><strong>{t('insights.challenges.meRank', { rank: data.me.rank, count: data.active })}</strong> · {unit(data.me.value)}</p>
            : <p>{challenge.status === 'upcoming' ? t('insights.challenges.meSoon') : member?.seat ? t('insights.challenges.meStart') : t('insights.challenges.meNoSeat')}</p>}
        </div>}
        <ul className="insights-movement">
          <li><strong>{f.num(data.participants)}</strong><span>{t('insights.challenges.participants')}</span></li>
          <li><strong>{f.num(data.active)}</strong><span>{t('insights.challenges.active')}</span></li>
          <li><strong>{unit(data.total)}</strong><span>{t('insights.challenges.total')}</span></li>
        </ul>
      </>}
    </Panel>
    {data && (data.teams ?? []).length > 0 && <Panel id="ch-teams" title={t('insights.challenges.byTeam')}>
      <ol className="insights-board">
        {data.teams.map((row) => <li key={row.id}>
          <span className="insights-board-rank">{row.rank}</span>
          <span className="insights-board-name">{row.name}<small>{t('insights.challenges.deptNote', { active: row.active, total: row.participants })}</small></span>
          <span className="insights-board-value">{unit(row.average)}<small>{t('insights.challenges.perPerson')}</small></span>
        </li>)}
      </ol>
      <p className="hint">{t('insights.challenges.teamRule')}</p>
    </Panel>}
    {data && <div className="insights-two">
      <Panel id="ch-departments" title={t('insights.challenges.byDepartment')}>
        {data.departments.length === 0 ? <p className="insights-empty">{t('insights.challenges.noDepartments')}</p> : <>
          <ol className="insights-board">
            {data.departments.map((row) => <li key={row.id}>
              <span className="insights-board-rank">{row.rank}</span>
              <span className="insights-board-name">{row.name}<small>{t('insights.challenges.deptNote', { active: row.active, total: row.participants })}</small></span>
              <span className="insights-board-value">{unit(row.average)}<small>{t('insights.challenges.perPerson')}</small></span>
            </li>)}
          </ol>
          <p className="hint">{t('insights.challenges.deptRule')}</p>
        </>}
      </Panel>
      <Panel id="ch-people" title={t('insights.challenges.byPerson')}>
        {data.people.length === 0 ? <p className="insights-empty">{challenge.status === 'upcoming' ? t('insights.challenges.notStarted') : t('insights.challenges.noOne')}</p> : <>
          <BarList label={t('insights.challenges.byPerson')} format={unit} highlight={data.people.find((row) => row.me) ? 'me' : undefined}
            rows={data.people.map((row, index) => ({
              key: row.me ? 'me' : `${row.rank}-${index}`,
              label: <>{`${row.rank}. `}{lead && row.member_id ? <Link to={`/w/${org.id}/people/${row.member_id}`}>{row.name ?? t('insights.challenges.colleague')}</Link> : row.name ?? t('insights.challenges.colleague')}{row.me ? ` (${t('insights.challenges.you')})` : ''}{row.department ? <small> · {row.department}</small> : null}</>,
              value: row.value,
            }))}/>
          {!lead && <p className="hint">{t('insights.challenges.namesNote')}</p>}
        </>}
      </Panel>
    </div>}
    <p className="hint">{t('insights.challenges.consentNote')}</p>
  </>;
}

interface TeamDraft { name: string; department_ids: string[] }

function ChallengeForm({ challenge, repeat, departments, onDone }: { challenge: Challenge | null; repeat: Challenge | null; departments: Department[]; onDone: (saved: Challenge | null) => void | Promise<void> }) {
  const t = useAppT(), problem = useErrorText();
  const { org } = useWorkspace();
  const today = tashkentToday();
  const running = challenge?.status === 'running';
  const base = challenge ?? repeat;
  const [form, setForm] = useState({
    title: base?.title ?? '', description: base?.description ?? '', metric: (base?.metric ?? 'points') as MetricCode, prize: base?.prize ?? '',
    starts_on: challenge?.starts_on ?? today, ends_on: challenge?.ends_on ?? addDays(today, 27), department_ids: base?.department_ids ?? [] as string[],
    mode: (base?.mode ?? 'individual') as 'individual' | 'teams', template: base?.template ?? '',
  });
  const [teams, setTeams] = useState<TeamDraft[]>(base?.teams?.length ? base.teams.map((team) => ({ name: team.name, department_ids: team.department_ids })) : [{ name: '', department_ids: [] }, { name: '', department_ids: [] }]);
  const useTemplate = (code: string) => {
    const template = TEMPLATES.find((entry) => entry.code === code)!;
    setForm({
      ...form, template: code, metric: template.metric, mode: template.teams ? 'teams' : 'individual', ends_on: addDays(form.starts_on || today, template.days - 1),
      title: t(`insights.template.${code}.title` as AppKey), description: t(`insights.template.${code}.description` as AppKey),
    });
  };
  const teamsReady = teams.length >= 2 && teams.every((team) => team.name.trim() && team.department_ids.length > 0);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const scope = form.mode === 'teams' ? { teams: teams.map((team) => ({ name: team.name, department_ids: team.department_ids })) } : { department_ids: form.department_ids };
      const body = challenge
        ? (running ? { title: form.title, description: form.description, prize: form.prize, ends_on: form.ends_on, ...(form.mode === 'teams' ? {} : scope) }
          : { title: form.title, description: form.description, prize: form.prize, metric: form.metric, starts_on: form.starts_on, ends_on: form.ends_on, ...scope })
        : { title: form.title, description: form.description, prize: form.prize, metric: form.metric, starts_on: form.starts_on, ends_on: form.ends_on, mode: form.mode, template: form.template || undefined, ...scope };
      const { challenge: saved } = await api<{ challenge: Challenge }>(challenge ? `orgs/${org.id}/challenges/${challenge.id}` : `orgs/${org.id}/challenges`, { method: challenge ? 'PATCH' : 'POST', body });
      await onDone(saved);
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  const toggle = (id: string) => setForm({ ...form, department_ids: form.department_ids.includes(id) ? form.department_ids.filter((value) => value !== id) : [...form.department_ids, id] });
  return <Panel id="ch-form" title={challenge ? t('insights.challenges.edit') : t('insights.challenges.new')}>
    {!challenge && <fieldset className="insights-form-templates">
      <legend>{t('insights.challenges.templates')}</legend>
      <div className="insights-template-list">
        {TEMPLATES.map((entry) => <button key={entry.code} type="button" className="insights-template" aria-pressed={form.template === entry.code} onClick={() => useTemplate(entry.code)}>
          <strong>{t(`insights.template.${entry.code}.title` as AppKey)}</strong>
          <small>{t(`insights.template.${entry.code}.short` as AppKey)}</small>
        </button>)}
      </div>
    </fieldset>}
    <form onSubmit={submit} className="insights-form">
      <label>{t('insights.challenges.name')}<input required minLength={2} maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={t('insights.challenges.namePlaceholder')}/></label>
      <label>{t('insights.challenges.description')} <span className="hint">{t('common.optional')}</span><textarea rows={2} maxLength={600} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}/></label>
      <fieldset disabled={running}>
        <legend>{t('insights.challenges.metric')}</legend>
        {METRICS.map((metric) => <label key={metric} className="check"><input type="radio" name="metric" value={metric} checked={form.metric === metric} onChange={() => setForm({ ...form, metric })}/>{t(`insights.metric.${metric}` as AppKey)} <span className="hint">— {t(`insights.metricHelp.${metric}` as AppKey)}</span></label>)}
      </fieldset>
      <div className="insights-form-row">
        <label>{t('insights.challenges.starts')}<input type="date" required disabled={running} value={form.starts_on} min={addDays(today, -60)} onChange={(event) => setForm({ ...form, starts_on: event.target.value })}/></label>
        <label>{t('insights.challenges.ends')}<input type="date" required value={form.ends_on} min={form.starts_on > today ? form.starts_on : today} max={addDays(form.starts_on || today, 91)} onChange={(event) => setForm({ ...form, ends_on: event.target.value })}/></label>
      </div>
      {!challenge && <fieldset>
        <legend>{t('insights.challenges.modeLegend')}</legend>
        <label className="check"><input type="radio" name="mode" checked={form.mode === 'individual'} onChange={() => setForm({ ...form, mode: 'individual' })}/>{t('insights.challenges.modeIndividual')}</label>
        <label className="check"><input type="radio" name="mode" checked={form.mode === 'teams'} disabled={departments.length < 2} onChange={() => setForm({ ...form, mode: 'teams' })}/>{t('insights.challenges.modeTeams')}{departments.length < 2 ? <span className="hint"> — {t('insights.challenges.modeNeeds')}</span> : null}</label>
      </fieldset>}
      {form.mode === 'teams' ? <fieldset disabled={running}>
        <legend>{t('insights.challenges.teams')}</legend>
        <div className="insights-team-editor">
          {teams.map((team, index) => {
            const taken = new Set(teams.filter((_, other) => other !== index).flatMap((entry) => entry.department_ids));
            return <div key={index} className="insights-team-row">
              <label>{t('insights.challenges.teamName', { number: index + 1 })}<input maxLength={60} required value={team.name} onChange={(event) => setTeams(teams.map((entry, other) => other === index ? { ...entry, name: event.target.value } : entry))}/></label>
              {departments.filter((entry) => !taken.has(entry.id)).map((entry) => <label key={entry.id} className="check"><input type="checkbox" checked={team.department_ids.includes(entry.id)} onChange={() => setTeams(teams.map((row, other) => other !== index ? row : { ...row, department_ids: row.department_ids.includes(entry.id) ? row.department_ids.filter((id) => id !== entry.id) : [...row.department_ids, entry.id] }))}/>{entry.name}</label>)}
              {teams.length > 2 && <button type="button" className="quiet" onClick={() => setTeams(teams.filter((_, other) => other !== index))}>{t('common.remove')}</button>}
            </div>;
          })}
        </div>
        {teams.length < 8 && <button type="button" className="quiet" onClick={() => setTeams([...teams, { name: '', department_ids: [] }])}>{t('insights.challenges.addTeam')}</button>}
      </fieldset> : <fieldset>
        <legend>{t('insights.challenges.who')}</legend>
        <label className="check"><input type="checkbox" checked={form.department_ids.length === 0} onChange={() => setForm({ ...form, department_ids: [] })}/>{t('insights.everyone')}</label>
        {departments.map((entry) => <label key={entry.id} className="check"><input type="checkbox" checked={form.department_ids.includes(entry.id)} onChange={() => toggle(entry.id)}/>{entry.name}</label>)}
      </fieldset>}
      <label>{t('insights.challenges.prize')} <span className="hint">{t('common.optional')}</span><input maxLength={200} value={form.prize} onChange={(event) => setForm({ ...form, prize: event.target.value })}/></label>
      <p className="hint">{t('insights.challenges.formNote')}</p>
      <div className="company-actions">
        <button disabled={busy || (form.mode === 'teams' && !running && !teamsReady)}>{challenge ? t('common.save') : t('insights.challenges.create')}</button>
        <button type="button" className="quiet" onClick={() => void onDone(null)}>{t('common.cancel')}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  </Panel>;
}
