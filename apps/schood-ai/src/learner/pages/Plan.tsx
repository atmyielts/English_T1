import { useState, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { Badge, Button, CreditCost, Field, LoadingState, TextInput, Thinking, useI18n, useT } from '../../core/index.ts';
import { ConsentGate, Failure, OutLink, Section, ToolHeader, options, useLearnerApi, useLoad, useRun } from '../kit.tsx';

// L5 study plan, L15 gap-to-target and L16 study-abroad copilot.

const EXAMS = ['ielts', 'toefl', 'sat', 'multilevel', 'english', 'itep'] as const;
interface Plan { id: string; exam: string; target: string; exam_date: string | null; hours_per_week: number; summary: string; progress: { done: number; total: number }; weeks: { week: number; theme: string; goal: string; tasks: { index: number; title: string; minutes: number; skill: string; done: boolean; link: { url: string; label: string } | null }[] }[] }
interface Gap { id: string; exam: string; current: number; predicted_next: number | null; target: string; days_left: number | null; data_points: number | null; drivers: { title: string; why: string; action: string; link: { url: string; label: string } | null }[]; note: string; next_check_at: string | null; due: boolean }

export function PlanPage() {
  const t = useT(), call = useLearnerApi(), { date } = useI18n();
  const current = useLoad(() => call<{ plan: Plan | null; gap: Gap | null }>('study-plan'));
  const [exam, setExam] = useState<string>('ielts'), [target, setTarget] = useState(''), [examDate, setExamDate] = useState(''), [hours, setHours] = useState('5');
  const build = useRun<{ plan: Plan }>(), gap = useRun<{ gap: Gap }>();
  const plan = build.data?.plan ?? current.data?.plan ?? null;
  const gapView = gap.data?.gap ?? current.data?.gap ?? null;
  const tick = async (week: number, task: number, done: boolean) => {
    const out = await call<{ plan: Plan }>('study-plan', { method: 'PATCH', body: { id: plan!.id, week, task, done } }).catch(() => null);
    if (out) build.set(out);
  };
  const make = (replan: boolean) => build.run(() => call('study-plan', { method: 'POST', idempotencyKey: crypto.randomUUID(), body: replan && plan ? { exam: plan.exam, target: plan.target, exam_date: plan.exam_date, hours_per_week: plan.hours_per_week, replan: true } : { exam, target, exam_date: examDate || undefined, hours_per_week: Number(hours) || 5 } }));
  return <ConsentGate>
    <ToolHeader title={t('learner.tool.plan')} lead={t('learner.plan.lead')} creditKey="study_plan.build"/>
    {current.loading && !current.data && <LoadingState/>}
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="grid content-start gap-4">
        <Section title={plan ? t('learner.plan.newOne') : t('learner.plan.make')}>
          <Field label={t('learner.exam')}>{(id) => <select id={id} value={exam} onChange={(event) => setExam(event.target.value)} className="min-h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm">{options(t, EXAMS, 'learner.exam')}</select>}</Field>
          <Field label={t('learner.plan.target')} hint={t('learner.plan.targetHint')}>{(id) => <TextInput id={id} value={target} maxLength={20} onChange={(event) => setTarget(event.target.value)}/>}</Field>
          <Field label={t('learner.plan.date')}>{(id) => <TextInput id={id} type="date" value={examDate} onChange={(event) => setExamDate(event.target.value)}/>}</Field>
          <Field label={t('learner.plan.hours')}>{(id) => <TextInput id={id} inputMode="numeric" value={hours} onChange={(event) => setHours(event.target.value.replace(/\D/g, '').slice(0, 2))}/>}</Field>
          <div><Button variant="spark" disabled={!target.trim() || build.busy} onClick={() => void make(false)}>{build.busy ? t('chat.thinking') : t('learner.plan.go')}</Button></div>
          <Failure error={build.error}/>
        </Section>
        <Section title={t('learner.gap.title')}>
          <p className="m-0 text-sm text-gray-700">{t('learner.gap.lead')}</p>
          {gapView && <>
            <p className="m-0 text-sm font-semibold">{gapView.days_left !== null ? t('learner.gap.headline', { current: gapView.current, target: gapView.target, days: gapView.days_left }) : t('learner.gap.headlineNoDate', { current: gapView.current, target: gapView.target })}</p>
            <ol className="m-0 grid gap-2 pl-5 text-sm">{gapView.drivers.map((driver, index) => <li key={index}><strong>{driver.title}</strong> — {driver.why} <em>{driver.action}</em>{driver.link && <> · <OutLink href={driver.link.url}>{driver.link.label}</OutLink></>}</li>)}</ol>
            <p className="m-0 text-xs text-gray-600">{gapView.note} {gapView.next_check_at && t('learner.gap.recheck', { date: date(gapView.next_check_at, { dateStyle: 'medium' }) })}</p>
          </>}
          <div className="flex flex-wrap items-center gap-3"><Button variant={gapView?.due === false ? 'secondary' : 'spark'} disabled={gap.busy} onClick={() => void gap.run(() => call('gap', { method: 'POST', idempotencyKey: crypto.randomUUID(), body: { exam: plan?.exam ?? exam, target: plan?.target ?? (target || undefined), exam_date: plan?.exam_date ?? (examDate || undefined) } }))}>{gap.busy ? t('chat.thinking') : gapView ? t('learner.gap.again') : t('learner.gap.go')}</Button><CreditCost creditKey="gap.replan"/></div>
          <Failure error={gap.error}/>
        </Section>
      </div>
      <div className="grid content-start gap-4">
        {build.busy && <Thinking label={t('learner.plan.building')}/>}
        {plan ? <>
          <Section title={t('learner.plan.yours', { exam: t(`learner.exam.${plan.exam}`), target: plan.target })}>
            <p className="m-0 text-sm">{plan.summary}</p>
            <p className="m-0 text-sm text-gray-700">{t('learner.plan.progress', { done: plan.progress.done, total: plan.progress.total })}{plan.exam_date ? ` · ${date(plan.exam_date, { dateStyle: 'medium' })}` : ''}</p>
            <div className="flex flex-wrap items-center gap-3"><Button variant="secondary" size="sm" disabled={build.busy} onClick={() => void make(true)}>{t('learner.plan.replan')}</Button><CreditCost creditKey="study_plan.build"/></div>
          </Section>
          {plan.weeks.map((week) => <Section key={week.week} title={t('learner.plan.week', { n: week.week, theme: week.theme })}>
            <p className="m-0 text-sm text-gray-700">{week.goal}</p>
            <ul className="m-0 grid list-none gap-2 p-0">{week.tasks.map((task) => <li key={task.index} className="flex flex-wrap items-center gap-3 rounded-2xl bg-white/85 p-3 text-sm">
              <label className="flex min-w-0 flex-1 items-start gap-3"><input type="checkbox" className="mt-1" checked={task.done} onChange={(event) => void tick(week.week, task.index, event.target.checked)}/><span className={task.done ? 'line-through' : ''}>{task.title} <Badge>{t('learner.plan.minutes', { count: task.minutes })}</Badge></span></label>
              {task.link && <a href={task.link.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-gray-900 underline underline-offset-2">{task.link.label}<ExternalLink size={14} aria-hidden="true"/></a>}
            </li>)}</ul>
          </Section>)}
        </> : !build.busy && <p className="m-0 rounded-3xl border border-dashed border-navy-line/40 bg-white/60 p-6 text-sm text-gray-700">{t('learner.plan.empty')}</p>}
      </div>
    </div>
  </ConsentGate>;
}

// --- L16 --------------------------------------------------------------------------------
interface Entry { id: string; country: string; topic: string; fact: string; source: string; checked: string | null; verified: boolean }
interface Line { entry_ids: string[]; verified: boolean; sources: { id: string; url: string; checked: string | null }[] }
interface AbroadPlan { summary: string; data_version: string; checklist: (Line & { item: string })[]; timeline: (Line & { when: string; task: string })[]; tests: (Line & { test: string; note: string })[]; next_steps: string[]; entries: Entry[] }
const COUNTRIES = ['uk', 'us', 'de', 'kr', 'tr'] as const;

function Sourced({ line, children }: { line: Line; children: ReactNode }) {
  const t = useT();
  return <li className="rounded-2xl bg-white/85 p-3 text-sm">
    {children}
    <span className="mt-1 flex flex-wrap items-center gap-2 text-xs">
      {line.verified ? <Badge tone="lime">{t('learner.abroad.verified')}</Badge> : <Badge tone="warn">{t('learner.abroad.check')}</Badge>}
      {line.sources.map((source) => <OutLink key={source.id} href={source.url}>{source.checked ? t('learner.abroad.source', { date: source.checked }) : t('learner.abroad.official')}</OutLink>)}
    </span>
  </li>;
}

export function AbroadPage() {
  const t = useT(), call = useLearnerApi();
  const data = useLoad(() => call<{ version: string; entries: Entry[] }>('abroad'));
  const [countries, setCountries] = useState<string[]>(['uk']), [level, setLevel] = useState('bachelor'), [field, setField] = useState(''), [intake, setIntake] = useState(''), [budget, setBudget] = useState(''), [ielts, setIelts] = useState('');
  const plan = useRun<{ plan: AbroadPlan }>();
  const toggle = (country: string) => setCountries((list) => (list.includes(country) ? list.filter((entry) => entry !== country) : [...list, country].slice(0, 3)));
  const result = plan.data?.plan;
  return <ConsentGate>
    <ToolHeader title={t('learner.tool.abroad')} lead={t('learner.abroad.lead')} creditKey="abroad.plan"/>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <Section title={t('learner.abroad.you')}>
        <fieldset className="m-0 border-0 p-0"><legend className="mb-2 text-sm font-semibold">{t('learner.abroad.countries')}</legend>
          <div className="flex flex-wrap gap-2">{COUNTRIES.map((country) => <label key={country} className="flex min-h-11 items-center gap-2 rounded-full border border-navy-line/40 bg-white px-3 text-sm"><input type="checkbox" checked={countries.includes(country)} onChange={() => toggle(country)}/>{t(`learner.abroad.country.${country}`)}</label>)}</div>
        </fieldset>
        <Field label={t('learner.abroad.level')}>{(id) => <select id={id} value={level} onChange={(event) => setLevel(event.target.value)} className="min-h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm">{options(t, ['foundation', 'bachelor', 'master', 'phd', 'school'], 'learner.abroad.level')}</select>}</Field>
        <Field label={t('learner.abroad.field')}>{(id) => <TextInput id={id} value={field} maxLength={120} onChange={(event) => setField(event.target.value)}/>}</Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('learner.abroad.intake')}>{(id) => <TextInput id={id} type="month" value={intake} onChange={(event) => setIntake(event.target.value)}/>}</Field>
          <Field label={t('learner.abroad.budget')}>{(id) => <TextInput id={id} inputMode="numeric" value={budget} onChange={(event) => setBudget(event.target.value.replace(/\D/g, ''))}/>}</Field>
        </div>
        <Field label={t('learner.abroad.ielts')}>{(id) => <TextInput id={id} value={ielts} maxLength={4} onChange={(event) => setIelts(event.target.value)}/>}</Field>
        <div><Button variant="spark" disabled={!countries.length || plan.busy} onClick={() => void plan.run(() => call('abroad-plan', { method: 'POST', idempotencyKey: crypto.randomUUID(), body: { countries, level, field: field || undefined, intake: intake || undefined, budget_usd_year: budget ? Number(budget) : undefined, scores: ielts ? { ielts } : {} } }))}>{plan.busy ? t('chat.thinking') : t('learner.abroad.go')}</Button></div>
        <p className="m-0 text-xs text-gray-600">{t('learner.abroad.rule', { date: data.data?.version ?? '' })}</p>
        <Failure error={plan.error ?? data.error}/>
      </Section>
      <div className="grid content-start gap-4">
        {plan.busy && <Thinking label={t('learner.abroad.building')}/>}
        {result ? <>
          <Section title={t('learner.abroad.summary')}><p className="m-0 text-sm">{result.summary}</p></Section>
          <Section title={t('learner.abroad.checklist')}><ul className="m-0 grid list-none gap-2 p-0">{result.checklist.map((line, index) => <Sourced key={index} line={line}>{line.item}</Sourced>)}</ul></Section>
          {result.tests.length > 0 && <Section title={t('learner.abroad.tests')}><ul className="m-0 grid list-none gap-2 p-0">{result.tests.map((line, index) => <Sourced key={index} line={line}><strong>{line.test}</strong> — {line.note}</Sourced>)}</ul></Section>}
          {result.timeline.length > 0 && <Section title={t('learner.abroad.timeline')}><ul className="m-0 grid list-none gap-2 p-0">{result.timeline.map((line, index) => <Sourced key={index} line={line}><strong>{line.when}</strong> — {line.task}</Sourced>)}</ul></Section>}
        </> : data.data && <Section title={t('learner.abroad.dataset')}>
          <ul className="m-0 grid list-none gap-2 p-0">{data.data.entries.filter((entry) => countries.includes(entry.country)).map((entry) => <Sourced key={entry.id} line={{ entry_ids: [entry.id], verified: entry.verified, sources: [{ id: entry.id, url: entry.source, checked: entry.checked }] }}>{entry.fact}</Sourced>)}</ul>
        </Section>}
      </div>
    </div>
  </ConsentGate>;
}
