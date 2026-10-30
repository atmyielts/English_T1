import { Award, Flame, Target, Timer } from 'lucide-react';
import { Badge, Card, EmptyState, Link, Paywall, useI18n, useSession, useT } from '../../core/index.ts';
import { coachApi, levelLabel, type Dashboard } from '../api.ts';
import { Bars, CoachFrame, dateText, Loaded, ResultChart, Stat, useLoad } from '../ui.tsx';
import { OpenBot, SignedOut } from './common.tsx';

// /coach/<pack>: the dashboard (also the Telegram Mini App's first screen): today's
// plan, streak and minutes, results over time with the forecast, skills, recurring
// errors, recent sessions and certificates.

export function CoachDashboard({ params }: { params: Record<string, string> }) {
  const session = useSession();
  if (session.status !== 'signed_in') return <SignedOut pack={params.pack}/>;
  return <DashboardBody pack={params.pack}/>;
}

function DashboardBody({ pack }: { pack: string }) {
  const state = useLoad(() => coachApi.dashboard(pack), [pack]);
  return <Loaded state={state}>{(data) => <CoachFrame pack={pack} name={data.coach.name} accent={data.coach.accent}><Body data={data} pack={pack}/></CoachFrame>}</Loaded>;
}

function Body({ data, pack }: { data: Dashboard; pack: string }) {
  const t = useT(), { locale } = useI18n();
  const scale = data.coach.scale;
  const roots = data.skills.filter((skill) => !skill.parent && skill.level !== null);
  const range = scale.max - scale.min;
  return <>
    {!data.access.allowed && <>
      {data.enrollment.placement && <Card><p className="m-0 text-sm text-gray-700">{t('coach.dash.placementOnly', { level: data.enrollment.placement.label })}</p></Card>}
      <Paywall plans={data.access.plans}/>
      <Link to={`/coach/${pack}/samples`} className="text-sm font-semibold text-gray-900 underline underline-offset-2">{t('coach.samples.see')}</Link>
    </>}

    <section aria-label={t('coach.dash.stats')} className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat label={t('coach.dash.streak')} value={<span className="inline-flex items-center gap-1.5"><Flame size={20} aria-hidden="true"/>{data.streak.current}</span>} hint={t('coach.dash.best', { count: data.streak.best })}/>
      <Stat label={t('coach.dash.minutes')} value={<span className="inline-flex items-center gap-1.5"><Timer size={20} aria-hidden="true"/>{data.streak.minutes}</span>} hint={t('coach.dash.minutesHint')}/>
      <Stat label={t('coach.dash.goal')} value={<span className="inline-flex items-center gap-1.5"><Target size={20} aria-hidden="true"/>{data.enrollment.has_goal ? data.goal.target_label : '—'}</span>} hint={!data.enrollment.has_goal ? t('coach.plan.setGoal') : data.goal.days_left !== null ? t('coach.dash.daysLeft', { count: data.goal.days_left }) : t('coach.dash.weeksLeft', { count: data.goal.weeks_left })}/>
      <Stat label={t('coach.dash.placement')} value={data.enrollment.placement?.label ?? '—'} hint={data.enrollment.placement ? dateText(data.enrollment.placement.at, locale) : t('coach.dash.noPlacement')}/>
    </section>

    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 font-display text-lg font-bold">{t('coach.dash.today')}</h2>
        {data.today && <Badge tone="sky">{data.today.phase} · {t('coach.dash.todayMinutes', { count: data.today.minutes })}</Badge>}
      </div>
      {data.today && data.today.tasks.length ? <ol className="m-0 flex flex-col gap-2 pl-5">
        {data.today.tasks.map((task, index) => <li key={index} className="text-sm leading-6 text-gray-800"><b>{task.title}</b> · {t('coach.dash.taskMinutes', { count: task.minutes })} — <span className="text-gray-600">{t(`coach.reason.${task.reason}`)}</span></li>)}
      </ol> : <p className="m-0 text-sm text-gray-700">{data.enrollment.has_goal ? t('coach.dash.todayEmpty') : t('coach.dash.setGoal')}</p>}
      <div className="flex flex-wrap gap-2">
        <OpenBot bot={data.bot} label={t('coach.dash.practise')}/>
        {!data.enrollment.has_goal && <Link to={`/coach/${pack}/plan`} className="inline-flex min-h-11 items-center rounded-full border border-navy-line bg-white px-4 text-sm font-semibold text-gray-900 no-underline">{t('coach.plan.setGoal')}</Link>}
      </div>
    </Card>

    {data.forecasts.filter((forecast) => forecast.points.length).map((forecast) => <Card key={forecast.rubric} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 font-display text-lg font-bold">{forecast.name}</h2>
        <span className="text-sm text-gray-700">{t('coach.dash.now')}: <b>{levelLabel(forecast.scale, forecast.current)}</b></span>
      </div>
      <ResultChart points={forecast.points} scale={forecast.scale} target={data.goal.target} label={forecast.name}/>
      <p className="m-0 text-sm text-gray-700">{forecast.predicted !== null
        ? t('coach.dash.forecast', { level: levelLabel(forecast.scale, forecast.predicted), confidence: t(`coach.confidence.${forecast.confidence ?? 'low'}`), perWeek: forecast.perWeek ?? 0 })
        : t('coach.dash.needMore')}</p>
    </Card>)}

    {roots.length > 0 && <Card className="flex flex-col gap-3">
      <h2 className="m-0 font-display text-lg font-bold">{t('coach.dash.skills')}</h2>
      <Bars rows={data.skills.filter((skill) => skill.level !== null).map((skill) => ({ label: skill.parent ? `· ${skill.name}` : skill.name, value: range ? (skill.level! - scale.min) / range : 0, text: skill.label ?? '—' }))}/>
      <p className="m-0 text-xs text-gray-600">{t('coach.dash.skillsNote')}</p>
    </Card>}

    {data.errors.length > 0 && <Card className="flex flex-col gap-3">
      <h2 className="m-0 font-display text-lg font-bold">{t('coach.dash.errors')}</h2>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {data.errors.slice(0, 5).map((error) => <li key={error.tag} className="text-sm leading-6"><b>{error.name}</b> <Badge tone="warn">×{error.count}</Badge><br/><span className="text-gray-700">{error.explain}</span></li>)}
      </ul>
    </Card>}

    <Card className="flex flex-col gap-3">
      <h2 className="m-0 font-display text-lg font-bold">{t('coach.dash.sessions')}</h2>
      {data.sessions.length ? <ul className="m-0 flex list-none flex-col p-0">
        {data.sessions.map((session) => <li key={session.id} className="border-b border-navy-line/15 py-2 last:border-0">
          <Link to={`/coach/${pack}/session/${session.id}`} className="flex items-center justify-between gap-3 text-sm text-gray-900 no-underline">
            <span className="min-w-0 truncate">{session.title}</span>
            <span className="flex shrink-0 items-center gap-2">{session.overall_label && <Badge tone="lime">{session.overall_label}</Badge>}<span className="text-xs text-gray-600">{dateText(session.finished_at ?? session.started_at, locale)}</span></span>
          </Link>
        </li>)}
      </ul> : <EmptyState title={t('coach.dash.noSessions')} lead={t('coach.dash.noSessionsLead')}/>}
    </Card>

    {data.certificates.length > 0 && <Card className="flex flex-col gap-3">
      <h2 className="m-0 inline-flex items-center gap-2 font-display text-lg font-bold"><Award size={18} aria-hidden="true"/>{t('coach.cert.title')}</h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {data.certificates.filter((cert) => !cert.revoked).map((cert) => <li key={cert.id}><Link to={`/coach/verify/${cert.code}`} className="text-sm font-semibold text-gray-900 underline underline-offset-2">{cert.level_label} · {dateText(cert.issued_at, locale)}</Link></li>)}
      </ul>
    </Card>}
  </>;
}
