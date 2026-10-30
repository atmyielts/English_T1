import { useEffect, useState } from 'react';
import { ArrowRight, CalendarClock, Check, Flame, Hourglass, Settings2, Snowflake, Sparkles, Target, Trophy, Users } from 'lucide-react';
import { Badge, Button, Card, CreditCost, Eyebrow, Link, navigate, useI18n } from '../../core/index.ts';
import { useT } from '../i18n/lazy.ts';
import { engageCall, useAction, useEngage, type EngageState, type InboxMessage } from '../api.ts';
import { EngageError, EnoughToday, Loaded, Meter, Notice, Page, Stat, TierBadge } from '../ui.tsx';

// /progress: the day's first step, three quests, the weekly challenge, the streak and
// its freezes, this week's league, the current journey chapter and the next goal.
// Everything shown comes from verified learning; nothing here earns XP by opening it.

function StreakCard({ state, onBought }: { state: EngageState; onBought: () => void }) {
  const t = useT(), { date } = useI18n(), action = useAction();
  const s = state.streak;
  const buy = async () => { if (await action.run('freeze-buy')) onBought(); };
  return <Card className="flex flex-col gap-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <Eyebrow icon={<Flame size={14} aria-hidden="true"/>}>{t('engage.streak.title')}</Eyebrow>
        <p className="m-0 mt-1 font-display text-4xl font-bold">{t('engage.streak.days', { count: s.current })}</p>
        <p className="m-0 text-sm text-gray-700">{s.today_done ? t('engage.streak.done') : s.at_risk ? t('engage.streak.risk') : s.current ? t('engage.streak.keep') : t('engage.streak.start')}</p>
      </div>
      {s.today_done ? <Badge tone="lime"><Check size={12} aria-hidden="true"/>{t('engage.streak.today')}</Badge> : null}
    </div>
    <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
      <span className="inline-flex items-center gap-1" aria-label={t('engage.streak.freezes', { count: s.freezes, max: s.max_freezes })}>
        {Array.from({ length: s.max_freezes }, (_, index) => <Snowflake key={index} size={18} aria-hidden="true" className={index < s.freezes ? 'text-sky-700' : 'text-gray-300'}/>)}
      </span>
      <span>{t('engage.streak.freezes', { count: s.freezes, max: s.max_freezes })}</span>
      {s.next_freeze_in_xp !== null && <span className="text-gray-600">· {t('engage.streak.nextFreeze', { xp: s.next_freeze_in_xp })}</span>}
    </div>
    <p className="m-0 text-xs text-gray-600">{t('engage.streak.freezeRule')}</p>
    {s.comeback?.status === 'open' && <Notice tone="lime" icon={<Hourglass size={18} className="mt-0.5 shrink-0" aria-hidden="true"/>}>
      <p className="m-0 font-semibold">{t('engage.comeback.title', { old: s.comeback.old_streak })}</p>
      <p className="m-0">{t('engage.comeback.lead', { done: s.comeback.done, needed: s.comeback.needed, date: date(`${s.comeback.ends}T12:00:00Z`, { dateStyle: 'medium' }) })}</p>
      <div className="mt-2"><Meter value={s.comeback.done} max={s.comeback.needed} label={t('engage.comeback.title', { old: s.comeback.old_streak })}/></div>
    </Notice>}
    {s.comeback?.status === 'won' && <Notice tone="lime"><p className="m-0 font-semibold">{t('engage.comeback.won', { old: s.comeback.old_streak })}</p></Notice>}
    {s.can_buy_freeze && <div className="flex flex-wrap items-center gap-3 border-t border-navy-line/20 pt-3">
      <Button variant="secondary" size="sm" disabled={action.busy !== null} onClick={() => void buy()} icon={<Snowflake size={14} aria-hidden="true"/>}>{t('engage.streak.buy')}</Button>
      <CreditCost creditKey="streak.freeze"/>
      <span className="text-xs text-gray-600">{t('engage.streak.buyNote')}</span>
    </div>}
    {action.error !== null && <EngageError error={action.error}/>}
  </Card>;
}

function QuestCard({ state }: { state: EngageState }) {
  const t = useT();
  const done = state.quests.filter((quest) => quest.done).length;
  return <Card className="flex flex-col gap-4">
    <div className="flex items-center justify-between gap-2">
      <Eyebrow icon={<Target size={14} aria-hidden="true"/>}>{t('engage.quests.title')}</Eyebrow>
      <span className="text-xs font-semibold text-gray-600">{t('engage.quests.count', { done, total: state.quests.length })}</span>
    </div>
    <div className={`flex items-center gap-3 rounded-2xl border p-3 ${state.first_step ? 'border-lime bg-lime-soft/50' : 'border-navy-line/30 bg-cream-soft'}`}>
      <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${state.first_step ? 'border-navy bg-navy text-white' : 'border-navy-line/40 bg-white'}`} aria-hidden="true">{state.first_step ? <Check size={16}/> : 1}</span>
      <div className="min-w-0">
        <p className="m-0 text-sm font-semibold">{t('engage.firstStep.title')}</p>
        <p className="m-0 text-xs text-gray-600">{state.first_step ? t('engage.firstStep.done') : t('engage.firstStep.lead')}</p>
      </div>
    </div>
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {state.quests.map((quest) => <li key={quest.key} className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className={quest.done ? 'font-semibold text-gray-900' : 'text-gray-800'}>{quest.done && <Check size={14} className="mr-1 inline" aria-hidden="true"/>}{t(`engage.quest.${quest.key}`, { target: quest.target })}</span>
          <span className="shrink-0 text-xs font-semibold text-gray-600">+{quest.xp} XP</span>
        </div>
        <Meter value={quest.progress} max={quest.target} label={t(`engage.quest.${quest.key}`, { target: quest.target })}/>
      </li>)}
    </ul>
    <p className="m-0 text-xs text-gray-600">{t('engage.quests.rule', { xp: state.all_quests_xp })}</p>
  </Card>;
}

function ChallengeCard({ state }: { state: EngageState }) {
  const t = useT(), { date } = useI18n(), c = state.challenge;
  return <Card className="flex flex-col gap-3">
    <Eyebrow icon={<Trophy size={14} aria-hidden="true"/>}>{t('engage.challenge.title')}</Eyebrow>
    <p className="m-0 font-semibold">{t(`engage.challenge.${c.key}`, { target: c.target })}</p>
    <Meter value={c.progress} max={c.target} tone="sky" label={t(`engage.challenge.${c.key}`, { target: c.target })}/>
    <p className="m-0 text-xs text-gray-600">{c.done ? t('engage.challenge.done', { xp: c.xp }) : t('engage.challenge.left', { progress: c.progress, target: c.target, xp: c.xp, date: date(c.ends_at, { weekday: 'long' }) })}</p>
  </Card>;
}

function Inbox() {
  const t = useT();
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  useEffect(() => { engageCall<{ new: InboxMessage[] }>('inbox').then((result) => setMessages(result.new)).catch(() => setMessages([])); }, []);
  if (!messages.length) return null;
  return <div className="flex flex-col gap-2" aria-live="polite">
    {messages.map((message) => <Notice key={message.id} icon={<Sparkles size={18} className="mt-0.5 shrink-0" aria-hidden="true"/>}>
      <p className="m-0">{message.text}</p>
      {message.buttons.map((button) => <Link key={button.path} to={button.path} className="mt-1 inline-block text-sm font-semibold text-gray-900 underline underline-offset-2">{button.label}</Link>)}
    </Notice>)}
    <span className="sr-only">{t('engage.inbox.label')}</span>
  </div>;
}

export function ProgressPage() {
  const t = useT(), { date } = useI18n();
  const view = useEngage<EngageState>('state');
  return <Page eyebrow={<Eyebrow icon={<Flame size={14} aria-hidden="true"/>}>{t('engage.progress.eyebrow')}</Eyebrow>} title={t('engage.progress.title')} lead={t('engage.progress.lead')}
    actions={<Button variant="ghost" size="sm" onClick={() => navigate('/progress/settings')} icon={<Settings2 size={14} aria-hidden="true"/>}>{t('engage.settings.title')}</Button>}>
    <Loaded {...view}>{(state) => <>
      <Inbox/>
      <EnoughToday enough={state.wellbeing.enough_today}/>
      {state.wellbeing.limit_reached && <Notice tone="warn"><p className="m-0 font-semibold">{t('engage.limit.reached', { minutes: state.wellbeing.daily_limit_minutes ?? 0 })}</p><p className="m-0">{t('engage.limit.lead')}</p></Notice>}
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        <Stat label={t('engage.xp.today')} value={state.xp.today} hint={t('engage.xp.cap', { cap: state.wellbeing.xp_cap })}/>
        <Stat label={t('engage.xp.week')} value={state.xp.week}/>
        <Stat label={t('engage.xp.total')} value={state.xp.total}/>
      </div>
      <p className="-mt-2 m-0 text-xs text-gray-600">{t('engage.xp.rule')}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <QuestCard state={state}/>
        <StreakCard state={state} onBought={() => void view.reload()}/>
        <ChallengeCard state={state}/>
        <Card className="flex flex-col gap-3">
          <Eyebrow icon={<Trophy size={14} aria-hidden="true"/>}>{t('engage.league.title')}</Eyebrow>
          {state.league.opted_out ? <p className="m-0 text-sm text-gray-700">{t('engage.league.optedOut')}</p>
            : state.league.joined ? <div className="flex flex-wrap items-center gap-2"><TierBadge tier={state.league.tier}/><span className="text-sm">{t('engage.league.rank', { rank: state.league.rank ?? '-', size: state.league.size })}</span><span className="text-sm text-gray-600">· {state.league.xp} XP</span></div>
            : <p className="m-0 text-sm text-gray-700">{t('engage.league.notYet')}</p>}
          <Link to="/league" className="inline-flex items-center gap-1 text-sm font-semibold text-gray-900 underline underline-offset-2">{t('engage.league.open')}<ArrowRight size={14} aria-hidden="true"/></Link>
        </Card>
      </div>
      {state.journeys.map((journey) => <Card key={journey.id} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Eyebrow>{journey.title}</Eyebrow>
          {journey.at_risk ? <Badge tone="warn">{t('engage.journey.atRisk')}</Badge> : <Badge tone="lime">{t('engage.journey.onTrack')}</Badge>}
        </div>
        <h2 className="m-0 font-display text-xl font-bold">{t('engage.journey.chapter', { chapter: journey.chapter, weeks: journey.weeks })}: {journey.chapter_title}</h2>
        <Meter value={journey.done} max={Math.max(1, journey.total)} label={journey.chapter_title}/>
        <div><Button variant="secondary" size="sm" onClick={() => navigate(`/journeys/${journey.key}`)} icon={<ArrowRight size={14} aria-hidden="true"/>}>{t('engage.journey.open')}</Button></div>
      </Card>)}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <Eyebrow icon={<Sparkles size={14} aria-hidden="true"/>}>{t('engage.path.next')}</Eyebrow>
          {state.next_goal ? <><p className="m-0 font-semibold">{state.next_goal.title}</p><p className="m-0 text-sm text-gray-700">{state.next_goal.lead}</p></>
            : <p className="m-0 text-sm text-gray-700">{state.path_started ? t('engage.path.keepGoing') : t('engage.path.choose')}</p>}
          <Link to="/path" className="text-sm font-semibold text-gray-900 underline underline-offset-2">{t('engage.path.open')}</Link>
        </Card>
        <Card className="flex flex-col gap-2">
          <Eyebrow icon={<CalendarClock size={14} aria-hidden="true"/>}>{t('engage.memory.title')}</Eyebrow>
          {state.dates.length ? <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">{state.dates.map((item) => <li key={item.id}><span className="font-semibold">{item.title}</span> · {date(`${item.on_date}T12:00:00Z`, { dateStyle: 'medium' })}</li>)}</ul>
            : <p className="m-0 text-sm text-gray-700">{t('engage.memory.empty')}</p>}
          <Link to="/progress/coach" className="text-sm font-semibold text-gray-900 underline underline-offset-2">{t('engage.memory.open')}</Link>
        </Card>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => navigate('/stories')}>{t('engage.nav.stories')}</Button>
        <Button variant="secondary" size="sm" onClick={() => navigate('/squads')} icon={<Users size={14} aria-hidden="true"/>}>{state.squad ? state.squad.name : t('engage.nav.squads')}</Button>
        <Button variant="secondary" size="sm" onClick={() => navigate('/events')}>{t('engage.season.pill', { title: state.season.title, days: state.season.days_left })}</Button>
        <Button variant="secondary" size="sm" onClick={() => navigate('/then-vs-now')}>{t('engage.nav.thenNow')}</Button>
      </div>
    </>}</Loaded>
  </Page>;
}
