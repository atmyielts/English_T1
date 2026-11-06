// Progress (/w/:org/coach/progress): the learner's own page. Streak, weekly goal, points,
// practice calendar, then-versus-now test scores, badges and the habit settings. Nothing
// here is urgent, and nobody is compared with anyone.
import React, { useState } from 'react';
import { isLevel, LEVEL_LABEL } from '../../../../../packages/company-core/src/mod.ts';
import { api } from '../../api.ts';
import { useAppT, useErrorText, type AppKey } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { useDate, useLoad, useWeekday } from '../training/lib.tsx';
import { reminderIcs } from './calendar.ts';
import { Gate, Meter, PrivacyNote } from './lib.tsx';

interface DayCell { day: string; status: 'practiced' | 'frozen' | 'rest' | 'leave' | 'missed' | 'open' | 'none' | 'future'; minutes: number }
interface Score { title: string | null; level: string | null; score: number | null; graded_at: string | null }
interface Settings { weekly_goal: number; daily_minutes: 5 | 10; rest_days: number[]; leave: { from: string; to: string } | null; kudos_opt_in: boolean }
interface ProgressData {
  day: string;
  streak: { current: number; best: number; freezes_left: number; freezes_per_month: number; practiced_today: boolean };
  week: { done: number; goal: number; met: boolean; history: { monday: string; days: number; met: boolean }[] };
  points: { week: number; total: number };
  minutes: { week: number; total: number };
  calendar: DayCell[];
  badges: { code: string; target: number; value: number; earned: boolean }[];
  scores: { first: Score | null; latest: Score | null; tests: number; skills: { skill: string; then: number | null; now: number | null }[] };
  level: { current: string | null; target: string | null; target_date: string | null };
  deck: { due: number; new_total: number; reviewed_today: number };
  settings: Settings;
  consent: boolean;
}

const levelLabel = (level: string | null, none: string) => level && isLevel(level) ? LEVEL_LABEL[level] : none;
/** A week drawn Monday first, as calendars are in Uzbekistan. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const SAMPLE_MONDAY = '2026-11-02';

export function Progress() {
  const t = useAppT();
  const { org } = useWorkspace();
  const { data, error, cause, reload } = useLoad<ProgressData>(`orgs/${org.id}/coach/progress`);
  if (!data) return <Gate error={error} cause={cause}/>;
  const { streak, week, points, minutes } = data;
  return <div className="coach-page">
    <header className="coach-head">
      <h1>{t('coach.progress.title')}</h1>
      <p>{t('coach.progress.lead')}</p>
    </header>

    <div className="company-grid coach-tiles">
      <div className="company-stat"><strong>{streak.current}</strong><span>{t('coach.progress.streak', { best: streak.best })}</span></div>
      <div className="company-stat"><strong>{week.done} / {week.goal}</strong><span>{week.met ? t('coach.today.weekMet') : t('coach.today.week')}</span></div>
      <div className="company-stat"><strong>{points.week}</strong><span>{t('coach.progress.points', { total: points.total })}</span></div>
      <div className="company-stat"><strong>{minutes.week}</strong><span>{t('coach.progress.minutes', { total: minutes.total })}</span></div>
    </div>

    <Calendar cells={data.calendar} week={week}/>
    <ThenNow data={data}/>
    <Badges badges={data.badges} consent={data.consent} joined={data.settings.kudos_opt_in}/>
    <Habit settings={data.settings} day={data.day} freezes={streak} onChange={reload}/>
    <PrivacyNote/>
  </div>;
}

function Calendar({ cells, week }: { cells: DayCell[]; week: ProgressData['week'] }) {
  const t = useAppT(), when = useDate(), weekday = useWeekday();
  const statusOf = (cell: DayCell) => cell.status === 'practiced' ? t('coach.calendar.practiced', { minutes: cell.minutes }) : t(`coach.calendar.${cell.status}` as AppKey);
  const practiced = cells.filter((cell) => cell.status === 'practiced').length;
  return <section className="coach-card" aria-labelledby="coach-calendar">
    <h2 id="coach-calendar">{t('coach.calendar.title')}</h2>
    <p className="coach-note">{t('coach.calendar.summary', { count: practiced, weeks: Math.round(cells.length / 7) })}</p>
    <div className="coach-calendar">
      <div className="coach-calendar-days" aria-hidden="true">
        {WEEK.map((_, index) => <span key={index}>{index % 2 === 0 ? weekday(new Date(Date.parse(`${SAMPLE_MONDAY}T00:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10)) : ''}</span>)}
      </div>
      <div className="coach-calendar-grid" role="img" aria-label={t('coach.calendar.aria', { count: practiced })}>
        {cells.map((cell) => <span key={cell.day} title={`${when(cell.day)}: ${statusOf(cell)}`} className={`coach-day is-${cell.status}${cell.status === 'practiced' && cell.minutes >= 15 ? ' is-long' : ''}`}/>)}
      </div>
    </div>
    <ul className="coach-legend" aria-hidden="true">
      <li><span className="coach-day is-practiced"/>{t('coach.calendar.legendPractice')}</li>
      <li><span className="coach-day is-frozen"/>{t('coach.calendar.legendFrozen')}</li>
      <li><span className="coach-day is-rest"/>{t('coach.calendar.legendRest')}</li>
    </ul>
    <h3>{t('coach.week.title')}</h3>
    <ol className="coach-weeks">
      {week.history.map((entry) => <li key={entry.monday} className={entry.met ? 'is-met' : ''}>
        <span className="coach-week-bar" style={{ height: `${Math.round(entry.days / 7 * 100)}%` }}/>
        <span className="visually-hidden">{t('coach.week.row', { date: when(entry.monday), days: entry.days })}</span>
      </li>)}
    </ol>
    <p className="coach-note">{t('coach.week.note', { goal: week.goal })}</p>
  </section>;
}

function ThenNow({ data }: { data: ProgressData }) {
  const t = useAppT(), when = useDate();
  const { org } = useWorkspace();
  const { first, latest, skills } = data.scores;
  const none = t('level.none');
  return <section className="coach-card" aria-labelledby="coach-then">
    <h2 id="coach-then">{t('coach.then.title')}</h2>
    {!first ? <p>{t('coach.then.none')} <Link to={`/w/${org.id}/tests`}>{t('coach.then.tests')}</Link></p> : <>
      <div className="coach-then">
        <div className="company-stat"><span>{t('coach.then.then')}</span><strong>{levelLabel(first.level, none)}</strong><span>{when(first.graded_at)}{first.score !== null ? ` · ${Math.round(first.score)}/100` : ''}</span><span>{first.title}</span></div>
        {latest ? <div className="company-stat"><span>{t('coach.then.now')}</span><strong>{levelLabel(latest.level, none)}</strong><span>{when(latest.graded_at)}{latest.score !== null ? ` · ${Math.round(latest.score)}/100` : ''}</span><span>{latest.title}</span></div>
          : <div className="company-stat"><span>{t('coach.then.now')}</span><strong>…</strong><span>{t('coach.then.oneTest')}</span></div>}
      </div>
      {skills.length > 0 && <div className="company-table-wrap"><table className="company-table">
        <thead><tr><th scope="col">{t('coach.then.skill')}</th><th scope="col">{t('coach.then.then')}</th><th scope="col">{t('coach.then.now')}</th><th scope="col">{t('coach.then.change')}</th></tr></thead>
        <tbody>{skills.map((row) => {
          const change = row.then !== null && row.now !== null ? row.now - row.then : null;
          return <tr key={row.skill}>
            <th scope="row">{t(`skill.${row.skill}` as AppKey)}</th>
            <td>{row.then ?? '—'}</td><td>{row.now ?? '—'}</td>
            <td>{change === null ? '—' : change > 0 ? `+${change}` : change}</td>
          </tr>;
        })}</tbody>
      </table></div>}
      <p className="coach-note">{t('coach.then.estimate')}</p>
    </>}
    {data.level.target && <p>{t('coach.then.target', { level: levelLabel(data.level.target, none) })}</p>}
  </section>;
}

function Badges({ badges, consent, joined }: { badges: ProgressData['badges']; consent: boolean; joined: boolean }) {
  const t = useAppT(), problem = useErrorText();
  const { org } = useWorkspace();
  const [shared, setShared] = useState<Set<string>>(new Set()), [failure, setFailure] = useState('');
  async function share(code: string) {
    setFailure('');
    try {
      await api(`orgs/${org.id}/coach/team/share`, { method: 'POST', body: { badge: code } });
      setShared((current) => new Set([...current, code]));
    } catch (cause) {
      if ((cause as { code?: string }).code === 'badge_already_shared') setShared((current) => new Set([...current, code]));
      else setFailure(problem(cause));
    }
  }
  const earned = badges.filter((badge) => badge.earned).length;
  return <section className="coach-card" aria-labelledby="coach-badges">
    <h2 id="coach-badges">{t('coach.badges.title')}</h2>
    <p className="coach-note">{t('coach.badges.lead', { earned, total: badges.length })}</p>
    <ul className="coach-badges">
      {badges.map((badge) => <li key={badge.code} className={badge.earned ? 'is-earned' : ''}>
        <strong>{t(`coach.badge.${badge.code}` as AppKey)}</strong>
        <span>{t(`coach.badge.${badge.code}.rule` as AppKey)}</span>
        {badge.earned ? <span className="company-badge good">{t('coach.badges.earned')}</span> : <Meter value={badge.value} total={badge.target} label={t(`coach.badge.${badge.code}` as AppKey)}/>}
        {badge.earned && joined && consent && <button type="button" className="quiet" disabled={shared.has(badge.code)} onClick={() => void share(badge.code)}>{shared.has(badge.code) ? t('coach.badges.shared') : t('coach.badges.share')}</button>}
      </li>)}
    </ul>
    {failure && <p className="error" role="alert">{failure}</p>}
    {!joined && <p className="coach-note"><Link to={`/w/${org.id}/coach/team`}>{t('coach.badges.joinHint')}</Link></p>}
    {joined && !consent && <p className="coach-note">{t('coach.error.consent_required')}</p>}
  </section>;
}

function Habit({ settings, day, freezes, onChange }: { settings: Settings; day: string; freezes: ProgressData['streak']; onChange: () => Promise<void> }) {
  const t = useAppT(), problem = useErrorText(), when = useDate(), weekday = useWeekday();
  const { org } = useWorkspace();
  const [until, setUntil] = useState(''), [busy, setBusy] = useState(false), [failure, setFailure] = useState(''), [saved, setSaved] = useState(false);
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setFailure(''); setSaved(false);
    try {
      await action();
      await onChange();
      setSaved(true);
    } catch (cause) {
      setFailure(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  const [time, setTime] = useState('09:00');
  function downloadReminder() {
    const ics = reminderIcs({
      time, restDays: settings.rest_days, today: day, minutes: settings.daily_minutes,
      summary: t('coach.reminder.summary'), description: t('coach.reminder.description'), url: `${location.origin}/w/${org.id}/today`,
      stamp: new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''),
    });
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: 'schood-english-practice.ics' });
    link.click();
    URL.revokeObjectURL(url);
  }
  const save = (patch: Partial<Settings>) => run(() => api(`orgs/${org.id}/coach/settings`, { method: 'PUT', body: patch }));
  const toggleRest = (weekdayIndex: number) => {
    const has = settings.rest_days.includes(weekdayIndex);
    void save({ rest_days: has ? settings.rest_days.filter((value) => value !== weekdayIndex) : [...settings.rest_days, weekdayIndex] });
  };
  return <section className="coach-card" aria-labelledby="coach-habit">
    <h2 id="coach-habit">{t('coach.habit.title')}</h2>
    <div className="coach-form-row">
      <label>{t('coach.habit.goal')}
        <select disabled={busy} value={settings.weekly_goal} onChange={(event) => void save({ weekly_goal: Number(event.target.value) })}>
          {[1, 2, 3, 4, 5, 6, 7].map((value) => <option key={value} value={value}>{t('coach.habit.goalOption', { days: value })}</option>)}
        </select>
      </label>
      <label>{t('coach.habit.length')}
        <select disabled={busy} value={settings.daily_minutes} onChange={(event) => void save({ daily_minutes: Number(event.target.value) as 5 | 10 })}>
          <option value={5}>{t('coach.habit.minutes', { minutes: 5 })}</option>
          <option value={10}>{t('coach.habit.minutes', { minutes: 10 })}</option>
        </select>
      </label>
    </div>
    <fieldset className="coach-rest" disabled={busy}>
      <legend>{t('coach.habit.rest')}</legend>
      {WEEK.map((value, index) => {
        const sample = new Date(Date.parse(`${SAMPLE_MONDAY}T00:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10);
        const checked = settings.rest_days.includes(value);
        return <label key={value} className="check"><input type="checkbox" checked={checked} disabled={!checked && settings.rest_days.length >= 3} onChange={() => toggleRest(value)}/>{weekday(sample)}</label>;
      })}
    </fieldset>
    <details>
      <summary>{t('coach.habit.rulesTitle')}</summary>
      <ul className="coach-rules">
        <li>{t('coach.habit.rule1')}</li>
        <li>{t('coach.habit.rule2', { count: freezes.freezes_per_month, left: freezes.freezes_left })}</li>
        <li>{t('coach.habit.rule3')}</li>
        <li>{t('coach.habit.rule4')}</li>
      </ul>
    </details>
    <h3>{t('coach.reminder.title')}</h3>
    <p className="coach-note">{t('coach.reminder.lead')}</p>
    <form className="coach-form-row" onSubmit={(event) => { event.preventDefault(); downloadReminder(); }}>
      <label>{t('coach.reminder.time')}<input type="time" required value={time} onChange={(event) => setTime(event.target.value)}/></label>
      <button type="submit" className="quiet">{t('coach.reminder.add')}</button>
    </form>
    <h3>{t('coach.leave.title')}</h3>
    {settings.leave && settings.leave.from <= day ? <p className="company-actions">
      <span>{t('coach.leave.on', { date: when(settings.leave.to) })}</span>
      <button type="button" className="quiet" disabled={busy} onClick={() => void run(() => api(`orgs/${org.id}/coach/leave`, { method: 'DELETE' }))}>{t('coach.leave.end')}</button>
    </p> : <form className="coach-form-row" onSubmit={(event) => { event.preventDefault(); void run(async () => { await api(`orgs/${org.id}/coach/leave`, { method: 'POST', body: { until } }); setUntil(''); }); }}>
      <label>{t('coach.leave.until')}<input type="date" required min={day} value={until} onChange={(event) => setUntil(event.target.value)}/></label>
      <button type="submit" className="quiet" disabled={busy}>{t('coach.leave.start')}</button>
    </form>}
    {failure && <p className="error" role="alert">{failure}</p>}
    {saved && <p role="status" className="coach-note">{t('coach.habit.saved')}</p>}
  </section>;
}
