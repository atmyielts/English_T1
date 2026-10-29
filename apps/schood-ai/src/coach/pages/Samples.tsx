import { useEffect, useState } from 'react';
import { Badge, Card, EmptyState, LoadingState, PageHeader, useI18n, useT } from '../../core/index.ts';
import type { Localized, PackManifest, Sample, SampleBodies } from '../../../../../packages/coach-packs/src/types.ts';

// /coach/<pack>/samples and /coach/<pack>/samples/<id>: static example reports a
// person without a plan (or without an account) can see. They are labelled as
// examples of a fictional learner. Each pack's examples load only on this page.

const manifests = import.meta.glob<{ manifest: PackManifest }>('../../../../../packages/coach-packs/*/manifest.ts');
const samples = import.meta.glob<{ samples: Sample[] }>('../../../../../packages/coach-packs/*/samples.ts');
const fileOf = (pack: string, name: string) => `../../../../../packages/coach-packs/${pack}/${name}.ts`;

const pick = (text: Localized | undefined, locale: string) => text?.[locale as 'en'] ?? text?.en ?? '';

export function CoachSamples({ params }: { params: Record<string, string> }) {
  const t = useT(), { locale } = useI18n();
  const [state, setState] = useState<{ manifest: PackManifest; samples: Sample[] } | null | 'missing'>(null);
  useEffect(() => {
    const loadManifest = manifests[fileOf(params.pack, 'manifest')], loadSamples = samples[fileOf(params.pack, 'samples')];
    if (!loadManifest || !loadSamples) { setState('missing'); return; }
    let live = true;
    Promise.all([loadManifest(), loadSamples()]).then(([m, s]) => { if (live) setState({ manifest: m.manifest, samples: s.samples }); }, () => { if (live) setState('missing'); });
    return () => { live = false; };
  }, [params.pack]);
  if (state === 'missing') return <EmptyState title={t('coach.notFound')}/>;
  if (!state) return <LoadingState/>;
  const shown = params.id ? state.samples.filter((sample) => sample.id === params.id) : state.samples;
  return <div className="flex min-w-0 flex-col gap-4">
    <PageHeader eyebrow={pick(state.manifest.name, locale)} title={t('coach.samples.title')} lead={t('coach.samples.lead')}/>
    {shown.map((sample) => <Card key={sample.id} className="flex flex-col gap-3" id={sample.id}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="m-0 font-display text-lg font-bold">{pick(sample.title, locale)}</h2><Badge tone="warn">{t('coach.samples.badge')}</Badge></div>
      <SampleBody sample={sample} locale={locale}/>
    </Card>)}
  </div>;
}

function Criteria({ rows, locale }: { rows: SampleBodies['speaking_report']['criteria']; locale: string }) {
  const t = useT();
  return <ul className="m-0 flex list-none flex-col gap-3 p-0">{rows.map((row) => <li key={row.id} className="text-sm leading-6">
    <div className="flex items-center justify-between gap-2"><b>{row.id.replace(/_/g, ' ')}</b><Badge tone="sky">{row.score ?? t('coach.session.audio')}</Badge></div>
    {row.evidence.map((quote, index) => <q key={index} className="mr-2 font-semibold">{quote}</q>)}
    <p className="m-0 text-gray-700">{pick(row.note, locale)}</p>
  </li>)}</ul>;
}

function SampleBody({ sample, locale }: { sample: Sample; locale: string }) {
  const t = useT();
  switch (sample.kind) {
    case 'speaking_report': {
      const body = sample.body;
      return <>
        <p className="m-0 text-sm text-gray-700">{body.task}</p>
        <p className="m-0 font-display text-2xl font-bold">{t('coach.session.overall', { level: body.overall })}</p>
        <Criteria rows={body.criteria} locale={locale}/>
        <p className="m-0 text-sm text-gray-700">{t('coach.samples.metrics', { wpm: body.metrics.wpm, fillers: body.metrics.fillersPerMinute, pauses: body.metrics.longPauses })}</p>
        <Upgrades rows={body.upgrades} locale={locale}/>
      </>;
    }
    case 'writing_report': {
      const body = sample.body;
      return <>
        <p className="m-0 text-sm text-gray-700">{body.task}</p>
        <p className="m-0 font-display text-2xl font-bold">{t('coach.session.overall', { level: body.overall })}</p>
        <Criteria rows={body.criteria} locale={locale}/>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">{body.corrections.map((row, index) => <li key={index} className="text-sm"><s>{row.original}</s> → <b>{row.corrected}</b> <span className="text-gray-700">— {pick(row.why, locale)}</span></li>)}</ul>
        {body.ladder?.map((step) => <details key={step.level} className="rounded-2xl border border-navy-line/30 bg-white/70 p-3"><summary className="cursor-pointer text-sm font-semibold">{step.level}</summary><p className="whitespace-pre-wrap text-sm leading-6">{step.text}</p></details>)}
      </>;
    }
    case 'weekly_report': {
      const body = sample.body;
      return <>
        <ul className="m-0 flex list-none flex-col p-0">{body.rows.map((row, index) => <li key={index} className="flex justify-between gap-3 border-b border-navy-line/15 py-2 text-sm last:border-0"><span>{pick(row.label, locale)}</span><span>{row.before} → <b>{row.after}</b>{row.unit ? ` ${row.unit}` : ''}</span></li>)}</ul>
        <p className="m-0 text-sm text-gray-700">{t('coach.samples.week', { minutes: body.minutes, streak: body.streak })}</p>
        <ul className="m-0 pl-5 text-sm text-gray-700">{body.focus.map((focus, index) => <li key={index}>{pick(focus, locale)}</li>)}</ul>
      </>;
    }
    case 'roleplay_review': {
      const body = sample.body;
      return <>
        <p className="m-0 text-sm text-gray-700">{body.scenario}</p>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">{body.goals.map((goal, index) => <li key={index} className="text-sm">{goal.met ? '✅' : '⬜'} {pick(goal.text, locale)}{goal.quote && <> — <q>{goal.quote}</q></>}</li>)}</ul>
        <Criteria rows={body.criteria} locale={locale}/>
        <p className="m-0 text-sm text-gray-700">{t('coach.session.scorecard', { ratio: body.scorecard.talkRatio, questions: body.scorecard.questionsAsked, words: body.scorecard.averageTurnWords })}</p>
        <Upgrades rows={body.betterLines} locale={locale}/>
      </>;
    }
    case 'plan': {
      const body = sample.body;
      return <>
        <p className="m-0 text-sm text-gray-700">{t('coach.samples.plan', { target: body.target, weeks: body.weeks })}</p>
        <ol className="m-0 flex flex-col gap-2 pl-5">{body.days.map((day, index) => <li key={index} className="text-sm"><b>{pick(day.day, locale)}</b>: {day.tasks.map((task) => pick(task, locale)).join(' · ')}</li>)}</ol>
      </>;
    }
  }
}

function Upgrades({ rows, locale }: { rows: { said: string; better: string; why: Localized }[]; locale: string }) {
  const t = useT();
  if (!rows.length) return null;
  return <ul className="m-0 flex list-none flex-col gap-2 p-0">{rows.map((row, index) => <li key={index} className="rounded-2xl border border-navy-line/30 bg-white/70 p-3 text-sm leading-6">
    <span className="text-gray-600">{t('coach.session.youSaid')}</span> <q>{row.said}</q><br/><span className="text-gray-600">{t('coach.session.tryThis')}</span> <b>{row.better}</b><br/><i className="text-gray-700">{pick(row.why, locale)}</i>
  </li>)}</ul>;
}
