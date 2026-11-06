// /w/:org — the workforce English overview for HR and managers.
import React, { useState, type FormEvent } from 'react';
import { api } from '../../api.ts';
import { useAppT, useErrorText, type AppKey } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { useApi, type Overview as OverviewData } from './api.ts';
import { BarList, Columns, DataTable, Kpi, LEVEL_SHORT, LevelBadge, LevelDistribution, LevelLegend, LevelStrip, Loading, Meter, Panel, Problem, useFormat, useMaybeT } from './ui.tsx';

const TODO_LINKS: Record<string, (org: string) => string> = {
  no_placement: (org) => `/w/${org}/placement`,
  overdue_assignments: (org) => `/w/${org}/training`,
  candidates_waiting: (org) => `/w/${org}/hiring`,
  target_soon: (org) => `/w/${org}/people`,
  no_consent: (org) => `/w/${org}/people`,
  invites_pending: (org) => `/w/${org}/people`,
  seats_free: (org) => `/w/${org}/people`,
};

export function Overview() {
  const t = useAppT(), f = useFormat(), maybe = useMaybeT();
  const { org, hr } = useWorkspace();
  const { data, error, loading, reload } = useApi<OverviewData>(`orgs/${org.id}/insights/overview`);
  if (error && !data) return <Problem message={error} retry={() => void reload()}/>;
  if (loading && !data) return <Loading/>;
  if (!data) return null;
  const k = data.kpis;
  // Months before the first graded test are left out (keeping at least three).
  const firstTested = data.trend.findIndex((month) => month.tested > 0);
  const trend = firstTested < 0 ? data.trend : data.trend.slice(Math.min(firstTested, data.trend.length - 3));
  const scopeName = data.scope.department?.name;
  const noDepartment = data.scope.unassigned;

  return <div className="insights">
    <header className="insights-head">
      <div>
        <p className="eyebrow">{scopeName ? t('insights.scope.department', { name: scopeName }) : t('insights.scope.company')}</p>
        <h1>{t('insights.overview.title')}</h1>
        <p className="insights-lead">{t('insights.overview.lead', { date: f.date(data.today) })}</p>
      </div>
      <div className="company-actions">
        <Link className="button-link" to={`/w/${org.id}/reports`}>{t('insights.overview.openReport')}</Link>
      </div>
    </header>
    {noDepartment && <p className="notice" role="status">{t('insights.scope.unassigned')}</p>}

    <div className="company-grid insights-kpis">
      <Kpi label={t('insights.kpi.people')} value={f.num(k.people)} note={k.invited ? t('insights.kpi.invited', { count: k.invited }) : t('insights.kpi.learners', { count: k.learners })}/>
      <Kpi label={t('insights.kpi.active30')} value={f.num(k.active30)} note={t('insights.kpi.active7', { count: k.active7 })}/>
      <Kpi label={t('insights.kpi.minutesMonth')} value={f.minutes(k.minutes_month)} note={t('insights.kpi.lessonsMonth', { count: k.lessons_month })}/>
      <Kpi label={t('insights.kpi.tests')} value={f.num(k.tests_month)} note={hr ? t('insights.kpi.candidates', { count: k.candidates_month }) : t('insights.kpi.thisMonth')}/>
      <Kpi label={t('insights.kpi.avgLevel')} value={k.avg_level ? <LevelBadge level={k.avg_level} score={k.avg_score}/> : '—'} note={t('insights.kpi.tested', { tested: k.tested, total: k.learners })}/>
      <Kpi label={t('insights.kpi.atTarget')} value={k.with_target ? f.pct(k.at_target, k.with_target) : '—'} note={k.with_target ? t('insights.kpi.atTargetNote', { done: k.at_target, total: k.with_target }) : t('insights.kpi.noTargets')} tone={k.with_target && k.at_target / k.with_target >= 0.5 ? 'good' : undefined}/>
    </div>
    <p className="hint insights-consent-note">{t('insights.overview.consentNote', { sharing: k.sharing, total: k.learners })}</p>

    <div className="insights-two">
      <Panel id="ov-levels" title={t('insights.overview.levels')}>
        <LevelDistribution counts={data.levels} label={t('insights.overview.levels')}/>
        <p className="hint">{t('insights.estimateNote')}</p>
      </Panel>
      <Panel id="ov-todo" title={t('insights.todo.title')}>
        {data.todo.length === 0 ? <p className="insights-empty">{t('insights.todo.none')}</p> : <ul className="insights-todo">
          {data.todo.map((item) => <li key={item.kind}>
            <strong>{t(`insights.todo.${item.kind}` as AppKey, { count: item.count })}</strong>
            {item.people && item.people.length > 0 && <span className="insights-todo-people">
              {item.people.map((person, index) => <React.Fragment key={person.id}>{index > 0 && ', '}<Link to={`/w/${org.id}/people/${person.id}`}>{person.name}</Link></React.Fragment>)}
              {item.count > item.people.length && ` ${t('insights.todo.more', { count: item.count - item.people.length })}`}
            </span>}
            <Link className="insights-todo-go" to={TODO_LINKS[item.kind]?.(org.id) ?? `/w/${org.id}`}>{t(`insights.todo.${item.kind}.action` as AppKey)}</Link>
          </li>)}
        </ul>}
      </Panel>
    </div>

    <Panel id="ov-trend" title={t('insights.trend.title')}>
      <p className="hint">{t('insights.trend.lead')}</p>
      {trend.every((month) => month.tested === 0) ? <p className="insights-empty">{t('insights.trend.empty')}</p> : <figure className="insights-figure">
        <div className="insights-trend">
          {trend.map((month) => <div key={month.month} className="insights-trend-row">
            <span className="insights-trend-month">{f.month(month.month)}</span>
            {month.tested ? <LevelStrip counts={month.counts} label={f.monthLong(month.month)}/> : <span className="insights-strip insights-strip-empty">{t('insights.trend.noData')}</span>}
            <span className="insights-trend-avg">{month.avg.level ? <LevelBadge level={month.avg.level} score={month.avg.score}/> : '—'}<small>{t('insights.trend.tested', { count: month.tested })}</small></span>
          </div>)}
        </div>
        <LevelLegend/>
        <DataTable caption={t('insights.trend.title')}
          head={[t('insights.col.month'), ...Object.values(LEVEL_SHORT), t('insights.col.tested'), t('insights.col.avg'), t('insights.col.graded')]}
          rows={trend.map((month) => [f.monthLong(month.month), ...(['pre_a1', 'a1', 'a2', 'b1', 'b2', 'c1', 'c2'] as const).map((level) => month.counts[level]), month.tested, month.avg.score === null ? '—' : `${month.avg.level ? LEVEL_SHORT[month.avg.level] : ''} · ${f.num(month.avg.score)}`, month.graded])}/>
      </figure>}
    </Panel>

    <div className="insights-two">
      <Panel id="ov-weeks" title={t('insights.weeks.title')}>
        <Columns label={t('insights.weeks.title')} valueLabel={t('insights.col.minutes')} format={f.minutes} short={f.minutesShort}
          points={data.weeks.map((week) => ({ key: week.week, label: f.dateShort(week.week), title: t('insights.weekOf', { date: f.date(week.week) }), value: week.minutes }))}/>
        <p className="hint">{t('insights.weeks.learners', { count: data.weeks[data.weeks.length - 1]?.learners ?? 0 })}</p>
      </Panel>
      <Panel id="ov-kinds" title={t('insights.kinds.title')}>
        {Object.keys(data.kinds).length === 0 ? <p className="insights-empty">{t('insights.kinds.empty')}</p> : <>
          <BarList label={t('insights.kinds.title')} format={f.minutes}
            rows={Object.entries(data.kinds).sort((a, b) => b[1].minutes - a[1].minutes).map(([kind, totals]) => ({ key: kind, label: maybe(`insights.kind.${kind}`, kind), value: totals.minutes, note: t('insights.kinds.events', { count: totals.events }) }))}/>
          <DataTable caption={t('insights.kinds.title')} head={[t('insights.col.kind'), t('insights.col.events'), t('insights.col.minutes')]}
            rows={Object.entries(data.kinds).map(([kind, totals]) => [maybe(`insights.kind.${kind}`, kind), totals.events, totals.minutes])}/>
        </>}
      </Panel>
    </div>

    <Panel id="ov-departments" title={t('insights.departments.title')}>
      {data.departments.length === 0 ? <p className="insights-empty">{t('insights.departments.empty')}</p> : <div className="company-table-wrap">
        <table className="company-table insights-table">
          <caption className="visually-hidden">{t('insights.departments.title')}</caption>
          <thead><tr>
            <th scope="col">{t('insights.col.department')}</th>
            <th scope="col">{t('insights.col.people')}</th>
            <th scope="col">{t('insights.col.tested')}</th>
            <th scope="col">{t('insights.col.avg')}</th>
            <th scope="col">{t('insights.col.atTarget')}</th>
            <th scope="col">{t('insights.col.active30')}</th>
            <th scope="col">{t('insights.col.minutes30')}</th>
            {hr && <th scope="col">{t('insights.col.seats')}</th>}
          </tr></thead>
          <tbody>{data.departments.map((row) => <tr key={row.id ?? 'none'}>
            <th scope="row">{row.name ?? t('insights.noDepartment')}</th>
            <td>{f.num(row.people)}</td>
            <td>{f.num(row.tested)}</td>
            <td>{row.avg_level ? <LevelBadge level={row.avg_level} score={row.avg_score}/> : '—'}</td>
            <td>{row.with_target ? <span className="insights-cellbar"><span style={{ width: `${row.at_target / row.with_target * 100}%` }}/><em>{f.pct(row.at_target, row.with_target)}</em></span> : '—'}</td>
            <td>{t('common.of', { done: f.num(row.active30), total: f.num(row.sharing) })}</td>
            <td>{f.minutes(row.minutes30)}</td>
            {hr && <td>{f.num(row.seats)}</td>}
          </tr>)}</tbody>
        </table>
      </div>}
      <p className="hint">{t('insights.departments.note')}</p>
    </Panel>

    <div className="insights-two">
      <Panel id="ov-next" title={t('insights.overview.nextUp')}>
        <ul className="insights-next">
          <li>
            <span className="eyebrow">{t('insights.nav.sessions')}</span>
            {data.next_session ? <>
              <strong>{data.next_session.title}</strong>
              <span>{f.weekday(data.next_session.starts_at)} · {f.time(data.next_session.starts_at)}{data.upcoming_sessions > 1 ? ` · ${t('insights.overview.moreSessions', { count: data.upcoming_sessions - 1 })}` : ''}</span>
            </> : <span>{t('insights.overview.noSession')}</span>}
            <Link to={`/w/${org.id}/sessions`}>{hr ? t('insights.overview.manageSessions') : t('insights.overview.seeSessions')}</Link>
          </li>
          <li>
            <span className="eyebrow">{t('insights.nav.challenges')}</span>
            {data.challenge ? <>
              <strong>{data.challenge.title}</strong>
              <span>{t('insights.challenge.until', { date: f.date(data.challenge.ends_on) })} · {t(`insights.metric.${data.challenge.metric}` as AppKey)}</span>
            </> : <span>{t('insights.overview.noChallenge')}</span>}
            <Link to={`/w/${org.id}/challenges${data.challenge ? `?c=${data.challenge.id}` : ''}`}>{data.challenge ? t('insights.overview.seeStandings') : hr ? t('insights.overview.startChallenge') : t('insights.overview.seeChallenges')}</Link>
          </li>
        </ul>
      </Panel>
      {data.usage && <UsagePanel data={data} onRequested={() => void reload()}/>}
    </div>
  </div>;
}

function UsagePanel({ data, onRequested }: { data: OverviewData; onRequested: () => void }) {
  const t = useAppT(), f = useFormat(), problem = useErrorText();
  const { org } = useWorkspace();
  const usage = data.usage!;
  const [open, setOpen] = useState(false);
  const [seats, setSeats] = useState(''), [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [sent, setSent] = useState<string | null>(null);
  const pilot = usage.status === 'pilot';
  const seatsTight = !pilot && usage.seats_limit > 0 && usage.seats_used / usage.seats_limit >= 0.9;
  const requestedAt = sent ?? data.seats_requested_at;
  const contact = data.contact;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const result = await api<{ requested_at: string }>(`orgs/${org.id}/insights/seats-request`, { method: 'POST', body: { seats: seats ? Number(seats) : undefined, message: message || undefined } });
      setSent(result.requested_at);
      setOpen(false);
      onRequested();
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  return <Panel id="ov-usage" title={t('insights.usage.title')} className="insights-usage">
    <p className="insights-usage-status"><span className={`company-badge${pilot ? ' warn' : usage.status === 'active' ? ' good' : ' bad'}`}>{t(`status.${usage.status}` as AppKey)}</span>
      {usage.contract_ends_at && <span>{t('insights.usage.contractEnds', { date: f.date(usage.contract_ends_at) })}</span>}</p>
    <Meter label={t('insights.usage.tests')} used={usage.tests_used} limit={usage.tests_limit}/>
    <Meter label={t('insights.usage.seats')} used={usage.seats_used} limit={usage.seats_limit}/>
    {pilot && <p>{t('insights.usage.pilotLead')}</p>}
    {seatsTight && <p>{t('insights.usage.seatsTight')}</p>}
    {(pilot || seatsTight || usage.seats_limit === 0) && <>
      {requestedAt && <p className="notice" role="status">{t('insights.usage.requested', { date: f.date(requestedAt) })}</p>}
      {!requestedAt && !open && <div className="company-actions"><button onClick={() => setOpen(true)}>{t('insights.usage.talk')}</button></div>}
      {open && <form onSubmit={submit} className="insights-form">
        <label>{t('insights.usage.seatsWanted')}<input type="number" min={1} max={100000} inputMode="numeric" value={seats} onChange={(event) => setSeats(event.target.value)}/></label>
        <label>{t('insights.usage.message')}<textarea rows={3} maxLength={1000} value={message} onChange={(event) => setMessage(event.target.value)}/></label>
        <p className="hint">{t('insights.usage.privacy')}</p>
        <div className="company-actions">
          <button disabled={busy}>{t('insights.usage.send')}</button>
          <button type="button" className="quiet" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </form>}
      {contact && (contact.email || contact.phone) && <p className="insights-contact">{t('insights.usage.orContact')}{' '}
        {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
        {contact.email && contact.phone && ' · '}
        {contact.phone && <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}>{contact.phone}</a>}
      </p>}
    </>}
  </Panel>;
}
