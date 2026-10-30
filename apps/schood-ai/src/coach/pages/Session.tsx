import { Badge, Card, useI18n, useSession, useT } from '../../core/index.ts';
import { coachApi, levelLabel, type Evidence, type SessionDetail } from '../api.ts';
import { CoachFrame, dateText, Loaded, useLoad } from '../ui.tsx';
import { SignedOut } from './common.tsx';

// /coach/<pack>/session/<id>: the long feedback that does not fit in a chat: every
// criterion with the learner's own words as evidence, corrections, "say it better"
// lines, the essay ladder, role-play goals and what the persona was thinking, the
// answers with their fluency numbers, and set results question by question.

type Upgrade = { said: string; better: string; why: string };
type ErrorFound = { quote: string; correction: string; tag: string; explanation: string };

export function CoachSession({ params }: { params: Record<string, string> }) {
  const session = useSession();
  if (session.status !== 'signed_in') return <SignedOut pack={params.pack}/>;
  return <SessionBody pack={params.pack} id={params.id}/>;
}

function SessionBody({ pack, id }: { pack: string; id: string }) {
  const coach = useLoad(() => coachApi.dashboard(pack), [pack]);
  const detail = useLoad(() => coachApi.session(id), [id]);
  return <Loaded state={coach}>{(data) => <CoachFrame pack={pack} name={data.coach.name} accent={data.coach.accent}>
    <Loaded state={detail}>{(session) => <Detail data={session}/>}</Loaded>
  </CoachFrame>}</Loaded>;
}

function Quote({ evidence }: { evidence: Evidence }) {
  return <li className="text-sm leading-6"><q className="font-semibold text-gray-900">{evidence.quote}</q>{evidence.comment && <span className="text-gray-700"> — {evidence.comment}</span>}</li>;
}

function Detail({ data }: { data: SessionDetail }) {
  const t = useT(), { locale } = useI18n();
  const summary = data.summary as Record<string, unknown>;
  const criteria = (summary.criteria ?? {}) as Record<string, number | null>;
  const evidence = (summary.evidence ?? {}) as Record<string, Evidence[]>;
  const upgrades = (summary.upgrades ?? []) as Upgrade[];
  const errors = (summary.errors ?? []) as ErrorFound[];
  const metrics = (summary.metrics ?? {}) as Record<string, number | null>;
  const goals = (summary.goals ?? []) as { id: string; met: boolean; quote: string | null }[];
  const hidden = (summary.hidden ?? []) as { id: string; description: string; start: unknown; end: unknown }[];
  const scorecard = summary.scorecard as { talkRatio: number; questionsAsked: number; averageTurnWords: number; pace: number | null } | undefined;
  const quiz = summary.quiz as { mode: string; correct: number; total: number } | undefined;
  const ladder = data.turns.filter((turn) => turn.kind === 'ladder').map((turn) => { try { return JSON.parse(turn.content) as { level: number; text: string; changes: string[] }[]; } catch { return []; } }).at(-1) ?? [];
  const answers = data.turns.filter((turn) => turn.role === 'learner' && turn.content);
  const rubric = data.rubric;
  return <>
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 font-display text-xl font-bold">{data.session.title}</h2>
        {data.session.overall_label && <Badge tone="lime">{t('coach.session.overall', { level: data.session.overall_label })}</Badge>}
      </div>
      <p className="m-0 text-sm text-gray-600">{dateText(data.session.finished_at ?? data.session.started_at, locale)} · {t('coach.dash.taskMinutes', { count: data.session.minutes })}</p>
      {typeof summary.summary === 'string' && summary.summary && <p className="m-0 text-sm leading-6 text-gray-800">{summary.summary}</p>}
      {rubric && <p className="m-0 text-xs text-gray-600">{t('coach.session.estimate')}</p>}
      {(data.facts ?? []).map((fact) => <p key={fact.id} className="m-0 text-xs leading-5 text-gray-700">
        {t(fact.stale ? 'coach.session.factsStale' : 'coach.session.facts', { title: fact.title, date: dateText(fact.checked_at, locale) })}{' '}
        <a className="font-semibold text-gray-900 underline" href={fact.source.url} target="_blank" rel="noopener noreferrer">{fact.source.name}</a>
      </p>)}
    </Card>

    {rubric && <Card className="flex flex-col gap-4">
      <h2 className="m-0 font-display text-lg font-bold">{rubric.name}</h2>
      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {rubric.criteria.map((criterion) => <li key={criterion.id} className="min-w-0">
          <div className="flex items-center justify-between gap-2"><b className="text-sm">{criterion.name}</b>
            {criterion.source === 'audio' ? <Badge>{t('coach.session.audio')}</Badge> : <Badge tone="sky">{levelLabel(rubric.scale, criteria[criterion.id] ?? null)}</Badge>}
          </div>
          {criterion.source === 'audio' ? <p className="mb-0 mt-1 text-xs text-gray-600">{t('coach.session.audioLead')}</p>
            : <ul className="mb-0 mt-1 flex list-none flex-col gap-1 p-0">{(evidence[criterion.id] ?? []).map((item, index) => <Quote key={index} evidence={item}/>)}</ul>}
        </li>)}
      </ul>
    </Card>}

    {(metrics.wpm != null || metrics.fillersPer100 != null || metrics.range != null) && <Card className="flex flex-col gap-2">
      <h2 className="m-0 font-display text-lg font-bold">{t('coach.session.fluency')}</h2>
      <dl className="m-0 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
        {[['wpm', metrics.wpm], ['fillersPerMinute', metrics.fillersPerMinute], ['longPauses', metrics.longPauses], ['range', metrics.range]].filter(([, value]) => value != null).map(([key, value]) => <div key={String(key)} className="rounded-2xl border border-navy-line/30 bg-white/70 p-3"><dt className="text-xs text-gray-600">{t(`coach.metric.${key}`)}</dt><dd className="m-0 font-display text-xl font-bold">{String(value)}</dd></div>)}
      </dl>
    </Card>}

    {goals.length > 0 && <Card className="flex flex-col gap-2">
      <h2 className="m-0 font-display text-lg font-bold">{t('coach.session.goals')}</h2>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">{goals.map((goal) => <li key={goal.id} className="text-sm">{goal.met ? '✅' : '⬜'} {t('coach.session.goal', { id: goal.id.replace(/_/g, ' ') })}{goal.quote && <> — <q>{goal.quote}</q></>}</li>)}</ul>
      {scorecard && <p className="m-0 text-sm text-gray-700">{t('coach.session.scorecard', { ratio: scorecard.talkRatio, questions: scorecard.questionsAsked, words: scorecard.averageTurnWords })}</p>}
    </Card>}

    {hidden.length > 0 && <Card className="flex flex-col gap-2">
      <h2 className="m-0 font-display text-lg font-bold">{t('coach.session.hidden')}</h2>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">{hidden.map((field) => <li key={field.id} className="text-sm"><span className="text-gray-700">{field.description}</span> <b>{String(field.start)} → {String(field.end)}</b></li>)}</ul>
    </Card>}

    {errors.length > 0 && <Card className="flex flex-col gap-2">
      <h2 className="m-0 font-display text-lg font-bold">{t('coach.session.errors')}</h2>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">{errors.map((error, index) => <li key={index} className="text-sm leading-6">
        <s className="text-gray-600">{error.quote}</s> → <b>{error.correction}</b> <Badge>{data.errors[error.tag]?.name ?? error.tag}</Badge>
        {error.explanation && <><br/><span className="text-gray-700">{error.explanation}</span></>}
      </li>)}</ul>
    </Card>}

    {upgrades.length > 0 && <Card className="flex flex-col gap-2">
      <h2 className="m-0 font-display text-lg font-bold">{t('coach.session.better')}</h2>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">{upgrades.map((upgrade, index) => <li key={index} className="rounded-2xl border border-navy-line/30 bg-white/70 p-3 text-sm leading-6">
        <span className="text-gray-600">{t('coach.session.youSaid')}</span> <q>{upgrade.said}</q><br/>
        <span className="text-gray-600">{t('coach.session.tryThis')}</span> <b>{upgrade.better}</b>
        {upgrade.why && <><br/><i className="text-gray-700">{upgrade.why}</i></>}
      </li>)}</ul>
    </Card>}

    {ladder.length > 0 && <Card className="flex flex-col gap-3">
      <h2 className="m-0 font-display text-lg font-bold">{t('coach.session.ladder')}</h2>
      <p className="m-0 text-xs text-gray-600">{t('coach.session.ladderNote')}</p>
      {ladder.map((step) => <details key={step.level} className="rounded-2xl border border-navy-line/30 bg-white/70 p-3">
        <summary className="cursor-pointer text-sm font-semibold">{rubric ? levelLabel(rubric.scale, step.level) : step.level}</summary>
        <p className="whitespace-pre-wrap text-sm leading-6 text-gray-800">{step.text}</p>
        <ul className="m-0 pl-5 text-sm text-gray-700">{step.changes.map((change, index) => <li key={index}>{change}</li>)}</ul>
      </details>)}
    </Card>}

    {quiz && <Card className="flex flex-col gap-2">
      <h2 className="m-0 font-display text-lg font-bold">{t('coach.session.set', { correct: quiz.correct, total: quiz.total })}</h2>
      <p className="m-0 text-sm text-gray-700">{t(`coach.mode.${quiz.mode}`)}</p>
    </Card>}

    {answers.length > 0 && <Card className="flex flex-col gap-3">
      <h2 className="m-0 font-display text-lg font-bold">{t('coach.session.answers')}</h2>
      <ol className="m-0 flex flex-col gap-3 pl-5">{answers.map((turn) => <li key={turn.seq} className="text-sm leading-6">
        {turn.prompt && <p className="m-0 font-semibold text-gray-900">{turn.prompt}</p>}
        <p className="m-0 whitespace-pre-wrap text-gray-800">{turn.content}</p>
        <p className="m-0 text-xs text-gray-600">{[turn.input_mode === 'voice' ? t('coach.session.voice') : turn.input_mode === 'photo' ? t('coach.session.photo') : t('coach.session.typed'),
          typeof turn.metrics.wpm === 'number' ? t('coach.session.wpm', { count: turn.metrics.wpm }) : null,
          typeof turn.metrics.longPauses === 'number' ? t('coach.session.pauses', { count: turn.metrics.longPauses }) : null,
          typeof turn.timing.prep === 'number' ? t('coach.session.prep', { count: turn.timing.prep as number }) : null,
          typeof turn.timing.talk === 'number' ? t('coach.session.talk', { count: turn.timing.talk as number }) : null].filter(Boolean).join(' · ')}</p>
      </li>)}</ol>
    </Card>}
  </>;
}
