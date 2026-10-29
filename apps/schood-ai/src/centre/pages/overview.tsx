import { CheckCircle2, Circle, RefreshCw } from 'lucide-react';
import { ApiErrorState, Badge, Button, Link, PageHeader, useT } from '../../core/index.ts';
import { CentreGate, Loaded, Section, Stat, useCentreApi, useFormat, useLoad, useSubmit } from '../kit.tsx';

// The owner's dashboard: pool, seats, setup checklist, Academy numbers, approvals.

interface Snapshot {
  captured_at: string; parts: { name: string; ok: boolean }[];
  leads: { new: number | null; active: number | null; trials: number | null; conversions: number | null };
  students: { active: number | null; new: number | null; paused: number | null; withdrawals: number | null };
  money: { collected: number | null; expected: number | null; outstanding: number | null; currency: string | null };
  attendance_30d_percent: number | null; at_risk: { count: number | null; students: { name: string; reason: string }[] };
  homework: { assigned: number | null; submitted: number | null };
}
interface Overview {
  workspace: { id: string; name: string; role: string; academy_linked: boolean; created_via: string };
  plan: { plans: string[]; beta: boolean; grant: number; seats_plan: string };
  credits: { total: number; plan: number; pack: number; cycle_ends_at: string | null };
  seats: { teachers: { used: number; limit: number | null }; students: { used: number; limit: number | null }; parents: number };
  checklist: Record<string, boolean>; approvals: number; academy: { captured_at: string; data: Snapshot } | null;
}
const STEPS: [string, string][] = [['invites', '/centre/people'], ['budgets', '/centre/people'], ['groups', '/centre/groups'], ['admissions', '/centre/admissions'], ['brief', '/centre/brief'], ['results', '/centre/marketing']];

export function OverviewPage() {
  return <CentreGate roles={['owner', 'admin']}><Overview/></CentreGate>;
}

function Overview() {
  const t = useT(), f = useFormat(), call = useCentreApi();
  const state = useLoad<Overview>('overview');
  const refresh = useSubmit();
  return <Loaded state={state}>{(data) => {
    const snap = data.academy?.data;
    const seats = (used: number, limit: number | null) => limit === null ? t('centre.overview.seatsUnlimited', { used }) : t('centre.overview.seatsOf', { used, limit });
    return <>
      <PageHeader title={data.workspace.name} lead={t('centre.overview.lead')} actions={<>{data.plan.plans.map((plan) => <Badge key={plan} tone="lime">{t(`plans.${plan}.name`)}</Badge>)}{data.plan.beta && <Badge tone="sky">{t('centre.overview.beta')}</Badge>}</>}/>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('centre.overview.pool')} value={f.number(data.credits.total)} hint={data.credits.cycle_ends_at ? t('centre.overview.renews', { date: f.date(data.credits.cycle_ends_at) }) : t('centre.overview.grant', { count: data.plan.grant })}/>
        <Stat label={t('centre.overview.teachers')} value={seats(data.seats.teachers.used, data.seats.teachers.limit)} tone={data.seats.teachers.limit !== null && data.seats.teachers.used >= data.seats.teachers.limit ? 'warn' : 'plain'}/>
        <Stat label={t('centre.overview.students')} value={seats(data.seats.students.used, data.seats.students.limit)} tone={data.seats.students.limit !== null && data.seats.students.used >= data.seats.students.limit ? 'warn' : 'plain'}/>
        <Stat label={t('centre.overview.approvals')} value={f.number(data.approvals)} hint={<Link to="/approvals" className="font-semibold text-gray-900 underline">{t('nav.approvals')}</Link>} tone={data.approvals ? 'warn' : 'plain'}/>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Section title={t('centre.overview.setup')}>
          <ul className="m-0 grid list-none gap-1 p-0">{STEPS.map(([key, path]) => <li key={key}><Link to={path} className="flex min-h-11 items-center gap-3 rounded-2xl px-2 text-sm text-gray-900 no-underline hover:bg-cream-soft">
            {data.checklist[key] ? <CheckCircle2 size={18} className="text-green-700" aria-hidden="true"/> : <Circle size={18} className="text-gray-400" aria-hidden="true"/>}
            <span className={data.checklist[key] ? 'text-gray-600 line-through' : 'font-semibold'}>{t(`centre.overview.step.${key}`)}</span>
            <span className="sr-only">{data.checklist[key] ? t('centre.common.done') : t('centre.common.todo')}</span>
          </Link></li>)}</ul>
        </Section>
        <Section title={t('centre.overview.academy')} lead={!data.workspace.academy_linked ? t('centre.overview.academyNone') : data.academy ? t('centre.overview.asOf', { date: f.dateTime(data.academy.captured_at) }) : t('centre.overview.academyWaiting')}
          actions={data.workspace.academy_linked && <Button variant="secondary" size="sm" disabled={refresh.busy} onClick={() => void refresh.run(async () => { await call('snapshot', { method: 'POST', body: {} }); await state.reload(); })} icon={<RefreshCw size={14} aria-hidden="true"/>}>{refresh.busy ? t('centre.common.working') : t('centre.overview.refresh')}</Button>}>
          {refresh.error !== null && <div className="mb-3"><ApiErrorState error={refresh.error}/></div>}
          {snap && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label={t('centre.overview.newLeads')} value={f.number(snap.leads.new)} hint={t('centre.overview.conversions', { count: snap.leads.conversions ?? 0 })}/>
            <Stat label={t('centre.overview.activeStudents')} value={f.number(snap.students.active)}/>
            <Stat label={t('centre.overview.attendance')} value={snap.attendance_30d_percent === null ? '—' : `${snap.attendance_30d_percent}%`}/>
            <Stat label={t('centre.overview.collected')} value={f.money(snap.money.collected, snap.money.currency ?? 'UZS')}/>
            <Stat label={t('centre.overview.outstanding')} value={f.money(snap.money.outstanding, snap.money.currency ?? 'UZS')} tone={(snap.money.outstanding ?? 0) > 0 ? 'warn' : 'plain'}/>
            <Stat label={t('centre.overview.atRisk')} value={f.number(snap.at_risk.count)} tone={(snap.at_risk.count ?? 0) > 0 ? 'warn' : 'plain'}/>
          </div>}
          {snap && snap.parts.some((part) => !part.ok) && <p className="m-0 mt-3 text-xs text-gray-600">{t('centre.overview.partsMissing')}</p>}
        </Section>
      </div>
    </>;
  }}</Loaded>;
}
