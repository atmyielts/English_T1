// /w/:org/challenges — team challenges: HR creates, edits and ends them;
// everyone sees department and personal standings.
import React, { useState, type FormEvent } from 'react';
import { api } from '../../api.ts';
import { useAppT, useErrorText, type AppKey } from '../../i18n/index.ts';
import { Link, navigate, useLocation } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { useApi, type Challenge, type ChallengeList, type Department, type Standings } from './api.ts';
import { addDays, BarList, Loading, Panel, Problem, tashkentToday, useFormat } from './ui.tsx';

const METRICS = ['points', 'minutes', 'lessons'] as const;

export function Challenges() {
  const t = useAppT();
  const { org } = useWorkspace();
  const { query } = useLocation();
  const { data, error, loading, reload } = useApi<ChallengeList>(`orgs/${org.id}/challenges`);
  const [editing, setEditing] = useState<Challenge | 'new' | null>(null);
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
      {data.can_manage && !editing && <div className="company-actions"><button onClick={() => setEditing('new')}>{t('insights.challenges.new')}</button></div>}
    </header>

    {editing && <ChallengeForm departments={data.departments} challenge={editing === 'new' ? null : editing}
      onDone={async (saved) => { setEditing(null); await reload(); if (saved) select(saved.id); }}/>}

    {data.challenges.length === 0 ? <section className="insights-panel"><p className="insights-empty">{data.can_manage ? t('insights.challenges.emptyHr') : t('insights.challenges.empty')}</p></section> : <>
      <nav className="insights-chips" aria-label={t('insights.challenges.list')}>
        {data.challenges.map((row) => <button key={row.id} type="button" className={row.id === chosen?.id ? '' : 'quiet'} aria-pressed={row.id === chosen?.id} onClick={() => select(row.id)}>
          {row.title} <span className={`company-badge ${row.status === 'running' ? 'good' : row.status === 'upcoming' ? '' : 'warn'}`}>{t(`insights.challengeStatus.${row.status}` as AppKey)}</span>
        </button>)}
      </nav>
      {chosen && <StandingsView key={chosen.id} challenge={chosen} departments={data.departments} onEdit={() => setEditing(chosen)} onChanged={() => void reload()}/>}
    </>}
  </div>;
}

function StandingsView({ challenge, departments, onEdit, onChanged }: { challenge: Challenge; departments: Department[]; onEdit: () => void; onChanged: () => void }) {
  const t = useAppT(), f = useFormat(), problem = useErrorText();
  const { org, lead } = useWorkspace();
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
      {actionError && <p className="error" role="alert">{actionError}</p>}
      {error && <Problem message={error} retry={() => void reload()}/>}
      {loading && !data && <Loading/>}
      {data && <>
        {data.me && !(data.can_manage && !data.me.rank) && <div className="insights-me" role="status">
          {!data.me.sharing ? <p>{t('insights.challenges.meNotSharing')}</p>
            : !data.me.participating ? <p>{t('insights.challenges.meNotIn')}</p>
            : data.me.rank ? <p><strong>{t('insights.challenges.meRank', { rank: data.me.rank, count: data.active })}</strong> · {unit(data.me.value)}</p>
            : <p>{challenge.status === 'upcoming' ? t('insights.challenges.meSoon') : t('insights.challenges.meStart')}</p>}
        </div>}
        <ul className="insights-movement">
          <li><strong>{f.num(data.participants)}</strong><span>{t('insights.challenges.participants')}</span></li>
          <li><strong>{f.num(data.active)}</strong><span>{t('insights.challenges.active')}</span></li>
          <li><strong>{unit(data.total)}</strong><span>{t('insights.challenges.total')}</span></li>
        </ul>
      </>}
    </Panel>
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
              label: <>{`${row.rank}. `}{lead && row.member_id ? <Link to={`/w/${org.id}/people/${row.member_id}`}>{row.name}</Link> : row.name}{row.me ? ` (${t('insights.challenges.you')})` : ''}{row.department ? <small> · {row.department}</small> : null}</>,
              value: row.value,
            }))}/>
          {!lead && <p className="hint">{t('insights.challenges.namesNote')}</p>}
        </>}
      </Panel>
    </div>}
    <p className="hint">{t('insights.challenges.consentNote')}</p>
  </>;
}

function ChallengeForm({ challenge, departments, onDone }: { challenge: Challenge | null; departments: Department[]; onDone: (saved: Challenge | null) => void | Promise<void> }) {
  const t = useAppT(), problem = useErrorText();
  const { org } = useWorkspace();
  const today = tashkentToday();
  const running = challenge?.status === 'running';
  const [form, setForm] = useState({
    title: challenge?.title ?? '', description: challenge?.description ?? '', metric: challenge?.metric ?? 'points',
    starts_on: challenge?.starts_on ?? today, ends_on: challenge?.ends_on ?? addDays(today, 27), department_ids: challenge?.department_ids ?? [] as string[],
  });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const body = running ? { title: form.title, description: form.description, ends_on: form.ends_on, department_ids: form.department_ids } : form;
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
      <fieldset>
        <legend>{t('insights.challenges.who')}</legend>
        <label className="check"><input type="checkbox" checked={form.department_ids.length === 0} onChange={() => setForm({ ...form, department_ids: [] })}/>{t('insights.everyone')}</label>
        {departments.map((entry) => <label key={entry.id} className="check"><input type="checkbox" checked={form.department_ids.includes(entry.id)} onChange={() => toggle(entry.id)}/>{entry.name}</label>)}
      </fieldset>
      <p className="hint">{t('insights.challenges.formNote')}</p>
      <div className="company-actions">
        <button disabled={busy}>{challenge ? t('common.save') : t('insights.challenges.create')}</button>
        <button type="button" className="quiet" onClick={() => void onDone(null)}>{t('common.cancel')}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  </Panel>;
}
