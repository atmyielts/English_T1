import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { ApiErrorState, Badge, Button, Card, Field, TextInput, useSession, useT } from '../../core/index.ts';
import { coachApi, type PlanView } from '../api.ts';
import { CoachFrame, Loaded, useLoad } from '../ui.tsx';
import { SignedOut } from './common.tsx';

// /coach/<pack>/plan: the goal (target, exam date, minutes a day) and the plan to
// the exam date week by week, with the weekly mock and links to the Schood simulator.

export function CoachPlan({ params }: { params: Record<string, string> }) {
  const session = useSession();
  if (session.status !== 'signed_in') return <SignedOut pack={params.pack}/>;
  return <PlanBody pack={params.pack}/>;
}

function PlanBody({ pack }: { pack: string }) {
  const dashboard = useLoad(() => coachApi.dashboard(pack), [pack]);
  const plan = useLoad(() => coachApi.plan(pack), [pack]);
  return <Loaded state={dashboard}>{(coach) => <CoachFrame pack={pack} name={coach.coach.name} accent={coach.coach.accent}>
    <Loaded state={plan}>{(data) => <PlanEditor pack={pack} data={data} onSaved={plan.reload}/>}</Loaded>
  </CoachFrame>}</Loaded>;
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function PlanEditor({ pack, data, onSaved }: { pack: string; data: PlanView; onSaved(): void }) {
  const t = useT();
  const [target, setTarget] = useState(data.goal.target);
  const [date, setDate] = useState(data.goal.examDate ?? '');
  const [minutes, setMinutes] = useState(data.goal.dailyMinutes);
  const [state, setState] = useState<{ saving: boolean; error: unknown; saved: boolean }>({ saving: false, error: null, saved: false });
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const save = async () => {
    setState({ saving: true, error: null, saved: false });
    try {
      await coachApi.setGoal(pack, { target, exam_date: data.options.exam_date === 'none' || !date ? null : date, daily_minutes: minutes });
      setState({ saving: false, error: null, saved: true });
      onSaved();
    } catch (error) { setState({ saving: false, error, saved: false }); }
  };
  return <>
    <Card className="flex flex-col gap-4">
      <h2 className="m-0 font-display text-lg font-bold">{t('coach.plan.goal')}</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label={t('coach.plan.target')}>{(id) => <select id={id} value={target} onChange={(event) => setTarget(Number(event.target.value))} className="min-h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm">
          {data.options.targets.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>}</Field>
        {data.options.exam_date !== 'none' && <Field label={t('coach.plan.examDate')} hint={data.options.exam_date === 'optional' ? t('coach.plan.examDateHint') : undefined}>{(id) => <TextInput id={id} type="date" min={tomorrow} value={date} onChange={(event) => setDate(event.target.value)}/>}</Field>}
        <Field label={t('coach.plan.minutes')}>{(id) => <select id={id} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} className="min-h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm">
          {data.options.minutes.map((value) => <option key={value} value={value}>{t('coach.plan.minutesOption', { count: value })}</option>)}
        </select>}</Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void save()} disabled={state.saving}>{state.saving ? t('coach.saving') : t('coach.plan.save')}</Button>
        {state.saved && <span role="status" className="text-sm text-gray-700">{t('coach.saved')}</span>}
      </div>
      {state.error !== null && <ApiErrorState error={state.error}/>}
    </Card>

    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 font-display text-lg font-bold">{t('coach.plan.weeks')}</h2>
        <span className="text-sm text-gray-700">{data.days_left !== null ? t('coach.dash.daysLeft', { count: data.days_left }) : t('coach.dash.weeksLeft', { count: data.weeks_left })}</span>
      </div>
      <ol className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
        {data.weeks.map((week) => <li key={week.week} className="rounded-2xl border border-navy-line/30 bg-white/70 p-3">
          <div className="flex items-center justify-between gap-2"><b className="text-sm">{t('coach.plan.week', { n: week.week })}</b><Badge tone="sky">{week.phase}</Badge></div>
          <p className="mb-0 mt-1 text-xs text-gray-700">{t('coach.plan.focus', { list: week.focus.map((slot) => t(`coach.slot.${slot}`)).join(', ') })}</p>
        </li>)}
      </ol>
      {data.weekly_mock && <p className="m-0 text-sm text-gray-700">{t('coach.plan.mock', { title: data.weekly_mock.title, day: t(`coach.day.${WEEKDAYS[data.weekly_mock.weekday]}`) })}</p>}
    </Card>

    {data.today.length > 0 && <Card className="flex flex-col gap-2">
      <h2 className="m-0 font-display text-lg font-bold">{t('coach.dash.today')}</h2>
      <ol className="m-0 flex flex-col gap-1 pl-5">{data.today.map((task, index) => <li key={index} className="text-sm text-gray-800">{task.title} · {t('coach.dash.taskMinutes', { count: task.minutes })}</li>)}</ol>
    </Card>}

    {data.links.length > 0 && <Card className="flex flex-col gap-2">
      <h2 className="m-0 font-display text-lg font-bold">{t('coach.plan.more')}</h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">{data.links.map((link) => <li key={link.id}><a href={link.url} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900 underline underline-offset-2">{link.label}<ExternalLink size={14} aria-hidden="true"/></a></li>)}</ul>
    </Card>}
  </>;
}
