import { Check } from 'lucide-react';
import { Badge, Card, EmptyState, Link, useI18n, useSession, useT } from '../../core/index.ts';
import { coachApi, type Mistake } from '../api.ts';
import { CoachFrame, dateText, Loaded, useLoad } from '../ui.tsx';
import { OpenBot, SignedOut } from './common.tsx';

// /coach/<pack>/mistakes: the mistake notebook (B3). Every question whose latest answer
// was wrong, grouped by topic, with the right answer, why, and the hints. A question
// leaves the notebook when it is answered right in the bot. No AI.

export function CoachMistakes({ params }: { params: Record<string, string> }) {
  const session = useSession();
  if (session.status !== 'signed_in') return <SignedOut pack={params.pack}/>;
  return <MistakesBody pack={params.pack}/>;
}

function MistakesBody({ pack }: { pack: string }) {
  const coach = useLoad(() => coachApi.dashboard(pack), [pack]);
  const notebook = useLoad(() => coachApi.mistakes(pack), [pack]);
  return <Loaded state={coach}>{(data) => <CoachFrame pack={pack} name={data.coach.name} accent={data.coach.accent}>
    <Loaded state={notebook}>{(view) => <Notebook items={view.mistakes} total={view.total} bot={data.bot} pack={pack}/>}</Loaded>
  </CoachFrame>}</Loaded>;
}

function Notebook({ items, total, bot, pack }: { items: Mistake[]; total: number; bot: string | null; pack: string }) {
  const t = useT();
  const topics = new Map<string, Mistake[]>();
  for (const item of items) topics.set(item.topic, [...(topics.get(item.topic) ?? []), item]);
  return <>
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 font-display text-xl font-bold">{t('coach.mistakes.title')}</h2>
        {total > 0 && <Badge tone="warn">{t('coach.mistakes.count', { count: total })}</Badge>}
      </div>
      <p className="m-0 text-sm leading-6 text-gray-700">{t('coach.mistakes.lead')}</p>
      {total > 0 && <>
        <p className="m-0 text-sm leading-6 text-gray-700">{t('coach.mistakes.howTo')}</p>
        <div className="flex flex-wrap gap-2"><OpenBot bot={bot} label={t('coach.mistakes.practise')}/></div>
      </>}
    </Card>
    {!items.length ? <EmptyState title={t('coach.mistakes.empty')} lead={t('coach.mistakes.emptyLead')} action={<Link to={`/coach/${pack}`} className="text-sm font-semibold text-gray-900 underline underline-offset-2">{t('coach.tab.dashboard')}</Link>}/> : <>
      {[...topics].map(([topic, list]) => <Card key={topic} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="m-0 break-words font-display text-lg font-bold">{topic}</h3>
          <Badge>{t('coach.mistakes.count', { count: list.length })}</Badge>
        </div>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">{list.map((item) => <MistakeItem key={item.ref} item={item}/>)}</ul>
      </Card>)}
      {total > items.length && <p className="m-0 text-xs text-gray-600">{t('coach.mistakes.more', { shown: items.length, total })}</p>}
    </>}
  </>;
}

function MistakeItem({ item }: { item: Mistake }) {
  const t = useT(), { locale } = useI18n();
  return <li className="flex min-w-0 flex-col gap-2 rounded-2xl border border-navy-line/30 bg-white/70 p-3">
    <p className="m-0 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-gray-900">{item.prompt}</p>
    {item.options && <ol className="m-0 flex list-none flex-col gap-1 p-0" aria-label={t('coach.mistakes.options')}>
      {item.options.map((option, index) => {
        const right = option === item.answer;
        return <li key={index} className={`flex min-w-0 items-start gap-2 rounded-xl px-2 py-1 text-sm ${right ? 'bg-lime-soft font-semibold text-gray-950' : 'text-gray-800'}`}>
          <span className="shrink-0 font-semibold">{String.fromCharCode(65 + index)}.</span>
          <span className="min-w-0 break-words">{option}</span>
          {right && <Check size={16} className="ml-auto shrink-0" aria-label={t('coach.mistakes.right')}/>}
        </li>;
      })}
    </ol>}
    {!item.options && item.answer !== null && <p className="m-0 text-sm"><span className="text-gray-600">{t('coach.mistakes.right')}:</span> <b className="break-words">{item.answer}</b></p>}
    {item.explanation && <p className="m-0 break-words text-sm leading-6 text-gray-700">{item.explanation}</p>}
    {item.hints.length > 0 && <details className="rounded-xl border border-navy-line/20 bg-white px-3 py-2">
      <summary className="min-h-8 cursor-pointer text-sm font-semibold text-gray-900">{t('coach.mistakes.hints')}</summary>
      <ol className="mb-0 mt-2 flex flex-col gap-1 pl-5 text-sm leading-6 text-gray-700">{item.hints.map((hint, index) => <li key={index} className="break-words">{hint}</li>)}</ol>
    </details>}
    <p className="m-0 text-xs text-gray-600">{t('coach.mistakes.missed', { count: item.misses })} · {t('coach.mistakes.lastWrong', { date: dateText(item.at, locale) })}</p>
  </li>;
}
