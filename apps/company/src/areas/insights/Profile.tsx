// /w/:org/people/:member — one person's English: company tests with per-skill
// results, certificates, assignments, and (with consent) learning and Schood
// English activity.
import React from 'react';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { useApi, type Profile as ProfileData } from './api.ts';
import { BarList, Columns, DataTable, Kpi, LEVEL_CODES, LEVEL_SHORT, LevelBadge, Loading, Panel, Problem, SkillBars, useFormat, useMaybeT } from './ui.tsx';

export function Profile({ memberId }: { memberId: string }) {
  const t = useAppT(), f = useFormat(), maybe = useMaybeT();
  const { org, lead } = useWorkspace();
  const { data, error, loading, reload } = useApi<ProfileData>(`orgs/${org.id}/members/${encodeURIComponent(memberId)}/profile`);
  if (error && !data) return <>
    <Problem message={error} retry={() => void reload()}/>
    <p><Link to={lead ? `/w/${org.id}/people` : `/w/${org.id}/me`}>{t('common.back')}</Link></p>
  </>;
  if (loading && !data) return <Loading/>;
  if (!data) return null;
  const { member } = data;
  const name = member.full_name || member.email || t('insights.profile.unnamed');
  const gap = member.level && member.target_level ? Math.max(0, LEVEL_CODES.indexOf(member.target_level) - LEVEL_CODES.indexOf(member.level)) : null;
  const track = (code: string | null) => code ? maybe(`job.${code}`, code) : t('insights.profile.anyTrack');

  return <div className="insights insights-profile">
    <p className="no-print"><Link to={data.self && !lead ? `/w/${org.id}/me` : `/w/${org.id}/people`}>← {data.self && !lead ? t('nav.section.me') : t('nav.section.people')}</Link></p>
    <header className="insights-head">
      <div>
        <p className="eyebrow">{t(`role.${member.role}` as AppKey)}{member.department_name ? ` · ${member.department_name}` : ''} · {maybe(`job.${member.job_role}`, member.job_role)}</p>
        <h1>{name}</h1>
        <p className="insights-badges">
          {member.status !== 'active' && <span className="company-badge warn">{t(`insights.memberStatus.${member.status}` as AppKey)}</span>}
          <span className={`company-badge${member.seat ? ' good' : ''}`}>{member.seat ? t('insights.profile.seat') : t('insights.profile.noSeat')}</span>
          <span className={`company-badge${member.consent_at ? ' good' : ' warn'}`}>{member.consent_at ? t('insights.profile.sharing', { date: f.date(member.consent_at) }) : t('insights.profile.notSharing')}</span>
          {member.email && lead && <a href={`mailto:${member.email}`}>{member.email}</a>}
        </p>
      </div>
      <div className="company-actions no-print"><button className="quiet" onClick={() => print()}>{t('common.print')}</button></div>
    </header>

    <div className="company-grid insights-kpis">
      <Kpi label={t('insights.profile.level')} value={<LevelBadge level={member.level} score={member.level_score}/>} note={member.level_at ? t('insights.profile.levelAt', { date: f.date(member.level_at), source: member.level_source ? t(`insights.source.${member.level_source}` as AppKey) : '' }) : t('insights.profile.takePlacement')}/>
      <Kpi label={t('insights.profile.target')} value={member.target_level ? <LevelBadge level={member.target_level}/> : '—'}
        note={member.target_level ? (gap === 0 ? t('insights.profile.targetMet') : gap !== null ? t('insights.profile.gap', { count: gap }) : t('insights.profile.targetNoLevel')) + (member.target_date ? ` · ${t('insights.profile.by', { date: f.date(member.target_date) })}` : '') : t('insights.profile.noTarget')}
        tone={gap === 0 ? 'good' : undefined}/>
      {data.learning && <>
        <Kpi label={t('insights.profile.minutes', { weeks: data.learning.weeks_count })} value={f.minutes(data.learning.minutes)} note={t('insights.profile.activeDays', { count: data.learning.active_days })}/>
        <Kpi label={t('insights.profile.lessons')} value={f.num(data.learning.lessons_completed)} note={data.learning.avg_lesson_score !== null ? t('insights.profile.avgScore', { score: data.learning.avg_lesson_score }) : t('insights.profile.inProgress', { count: data.learning.lessons_started })}/>
      </>}
    </div>
    <p className="hint">{t('insights.estimateNote')}</p>

    {!data.detail && <p className="notice insights-private" role="status">{t('insights.profile.private', { name })}</p>}

    <Panel id="pr-tests" title={t('insights.profile.tests')}>
      {data.tests.length === 0 ? <p className="insights-empty">{t('insights.profile.noTests')}</p> : <ol className="insights-tests">
        {data.tests.map((test) => <li key={test.id}>
          <div className="insights-tests-head">
            <div>
              <strong>{test.title ?? t('insights.profile.test')}</strong>
              <span>{test.kind ? t(`insights.testKind.${test.kind}` as AppKey) : ''} · {f.date(test.graded_at ?? test.started_at)}</span>
            </div>
            {test.status === 'graded' ? <LevelBadge level={test.overall_level} score={test.overall_score}/> : <span className="company-badge warn">{t(`insights.attempt.${test.status}` as AppKey)}</span>}
          </div>
          <SkillBars label={t('insights.profile.skillsOf', { test: test.title ?? '' })} skills={test.skills}/>
          {test.certificate_code && <p className="insights-cert"><Link to={`/v/${test.certificate_code}`}>{t('insights.profile.certificate', { code: test.certificate_code })}</Link></p>}
        </li>)}
      </ol>}
      {data.tests.some((test) => test.skills.length) && <DataTable caption={t('insights.profile.tests')}
        head={[t('insights.col.date'), t('insights.col.test'), t('insights.col.level'), ...['grammar', 'vocabulary', 'reading', 'listening', 'writing', 'speaking'].map((skill) => t(`skill.${skill}` as AppKey))]}
        rows={data.tests.filter((test) => test.status === 'graded').map((test) => [f.date(test.graded_at), test.title ?? '', `${test.overall_level ? LEVEL_SHORT[test.overall_level] : '—'} · ${f.num(test.overall_score)}`,
          ...['grammar', 'vocabulary', 'reading', 'listening', 'writing', 'speaking'].map((skill) => test.skills.find((entry) => entry.skill === skill)?.score ?? '—')])}/>}
    </Panel>

    <div className="insights-two">
      <Panel id="pr-assignments" title={t('insights.profile.assignments')}>
        {data.assignments.length === 0 ? <p className="insights-empty">{t('insights.profile.noAssignments')}</p> : <ul className="records insights-records">
          {data.assignments.map((row) => <li key={row.id}>
            <strong>{track(row.track_code)}</strong>
            <span>
              {row.target_level && <>{t('insights.profile.targetShort')} <LevelBadge level={row.target_level}/> {row.target_met ? `✓ ${t('insights.profile.reached')}` : ''} · </>}
              {row.due_date ? t('insights.profile.due', { date: f.date(row.due_date) }) : t('insights.profile.noDue')}
              {' · '}{row.scope === 'department' ? t('insights.profile.forDepartment') : t('insights.profile.forPerson')}
            </span>
            <span>
              {row.overdue && <span className="company-badge bad">{t('insights.profile.overdue')}</span>}{' '}
              {row.status === 'done' && <span className="company-badge good">{t('insights.profile.done')}</span>}{' '}
              {row.lessons_done !== null && t('insights.profile.lessonsDone', { count: row.lessons_done })}
            </span>
          </li>)}
        </ul>}
      </Panel>
      <Panel id="pr-certificates" title={t('insights.profile.certificates')}>
        {data.certificates.length === 0 ? <p className="insights-empty">{t('insights.profile.noCertificates')}</p> : <ul className="records insights-records">
          {data.certificates.map((row) => <li key={row.code}>
            <strong><LevelBadge level={row.level} plain/></strong>
            <span>{row.title} · {f.date(row.date)}</span>
            <Link to={`/v/${row.code}`}>{t('insights.profile.openCertificate', { code: row.code })}</Link>
          </li>)}
        </ul>}
        <p className="hint">{t('insights.profile.certificateNote')}</p>
      </Panel>
    </div>

    {data.learning && <Panel id="pr-learning" title={t('insights.profile.learning')}>
      <div className="insights-two insights-inner">
        <div>
          <h3>{t('insights.profile.weekly')}</h3>
          <Columns label={t('insights.profile.weekly')} valueLabel={t('insights.col.minutes')} format={f.minutes} short={f.minutesShort}
            points={data.learning.weeks.map((week) => ({ key: week.week, label: f.dateShort(week.week), title: t('insights.weekOf', { date: f.date(week.week) }), value: week.minutes }))}/>
        </div>
        <div>
          <h3>{t('insights.profile.byKind')}</h3>
          {Object.keys(data.learning.kinds).length === 0 ? <p className="insights-empty">{t('insights.kinds.empty')}</p> : <BarList label={t('insights.profile.byKind')} format={f.minutes}
            rows={Object.entries(data.learning.kinds).sort((a, b) => b[1].minutes - a[1].minutes).map(([kind, totals]) => ({ key: kind, label: maybe(`insights.kind.${kind}`, kind), value: totals.minutes, note: t('insights.kinds.events', { count: totals.events }) }))}/>}
          {data.learning.last_at && <p className="hint">{t('insights.profile.lastActive', { date: f.date(data.learning.last_at) })}</p>}
        </div>
      </div>
      {data.learning.tracks.length > 0 && <>
        <h3>{t('insights.profile.tracks')}</h3>
        <div className="company-table-wrap"><table className="company-table">
          <thead><tr><th scope="col">{t('insights.col.track')}</th><th scope="col">{t('insights.col.completed')}</th><th scope="col">{t('insights.col.started')}</th><th scope="col">{t('insights.col.lastActivity')}</th></tr></thead>
          <tbody>{data.learning.tracks.map((row) => <tr key={row.track_code}><th scope="row">{track(row.track_code)}</th><td>{row.completed}</td><td>{row.started}</td><td>{f.date(row.last_at)}</td></tr>)}</tbody>
        </table></div>
      </>}
      {data.learning.recent_lessons.length > 0 && <>
        <h3>{t('insights.profile.recentLessons')}</h3>
        <ul className="records insights-records">
          {data.learning.recent_lessons.map((row) => <li key={`${row.track_code}-${row.lesson_code}`}>
            <strong>{maybe(`insights.lesson.${row.lesson_code}`, row.lesson_code)}</strong>
            <span>{track(row.track_code)} · {row.status === 'completed' ? t('insights.profile.completedOn', { date: f.date(row.completed_at) }) : t('insights.profile.started')}{row.score !== null ? ` · ${t('insights.profile.score', { score: row.score })}` : ''}{row.minutes ? ` · ${f.minutes(row.minutes)}` : ''}</span>
          </li>)}
        </ul>
      </>}
      {data.learning.sessions.length > 0 && <>
        <h3>{t('insights.profile.sessions')}</h3>
        <ul className="records insights-records">
          {data.learning.sessions.map((row) => <li key={row.id}><strong>{row.title}</strong><span>{t(`insights.sessionKind.${row.kind}` as AppKey)} · {f.date(row.starts_at)} · {f.minutes(row.duration_minutes)}</span></li>)}
        </ul>
      </>}
    </Panel>}

    {data.detail && <Panel id="pr-english" title={t('insights.english.title')}>
      {data.english ? <EnglishBlock english={data.english}/> : <p className="insights-empty">{t(`insights.english.${data.english_reason ?? 'no_data'}` as AppKey)}</p>}
      <p className="hint">{t('insights.english.privacy')}</p>
    </Panel>}
  </div>;
}

function EnglishBlock({ english }: { english: NonNullable<ProfileData['english']> }) {
  const t = useAppT(), f = useFormat(), maybe = useMaybeT();
  const skills = Object.entries(english.skills).sort((a, b) => b[1].minutes - a[1].minutes);
  return <>
    <div className="company-grid insights-kpis">
      <Kpi label={t('insights.english.level')} value={<LevelBadge level={english.level}/>} note={english.target ? t('insights.english.target', { level: LEVEL_SHORT[english.target] }) : t('insights.english.noTarget')}/>
      <Kpi label={t('insights.english.minutes', { days: english.days })} value={f.minutes(english.minutes)} note={english.daily_goal_minutes ? t('insights.english.goal', { minutes: english.daily_goal_minutes }) : t('insights.english.activeDays', { count: english.active_days })}/>
      <Kpi label={t('insights.english.activities')} value={f.num(english.activities)} note={t('insights.english.activeDays', { count: english.active_days })}/>
      <Kpi label={t('insights.english.xp')} value={f.num(english.xp)} note={[english.reviews ? t('insights.english.reviews', { count: english.reviews }) : '', english.badges ? t('insights.english.badges', { count: english.badges }) : ''].filter(Boolean).join(' · ') || undefined}/>
    </div>
    <div className="insights-two insights-inner">
      <div>
        <h3>{t('insights.english.bySkill')}</h3>
        {skills.length === 0 ? <p className="insights-empty">{t('insights.english.no_data')}</p> : <>
          <BarList label={t('insights.english.bySkill')} format={f.minutes}
            rows={skills.map(([skill, totals]) => ({ key: skill, label: maybe(`skill.${skill}`, maybe(`insights.englishSkill.${skill}`, skill)), value: totals.minutes, note: totals.accuracy !== null ? t('insights.english.accuracy', { value: totals.accuracy }) : undefined }))}/>
          <DataTable caption={t('insights.english.bySkill')} head={[t('insights.col.skill'), t('insights.col.activities'), t('insights.col.minutes'), t('insights.col.accuracy')]}
            rows={skills.map(([skill, totals]) => [maybe(`skill.${skill}`, maybe(`insights.englishSkill.${skill}`, skill)), totals.activities, totals.minutes, totals.accuracy === null ? '—' : `${totals.accuracy}%`])}/>
        </>}
      </div>
      <div>
        <h3>{t('insights.english.weekly')}</h3>
        <Columns label={t('insights.english.weekly')} valueLabel={t('insights.col.minutes')} format={f.minutes} short={f.minutesShort}
          points={english.weeks.map((week) => ({ key: week.week, label: f.dateShort(week.week), title: t('insights.weekOf', { date: f.date(week.week) }), value: week.minutes }))}/>
        {english.last_at && <p className="hint">{t('insights.profile.lastActive', { date: f.date(english.last_at) })}</p>}
      </div>
    </div>
  </>;
}
