import { useState } from 'react';
import { BadgeCheck, CheckCircle2, Flag, Route } from 'lucide-react';
import { Badge, Button, Card, Eyebrow, Field, navigate, TextInput } from '../../core/index.ts';
import { useT } from '../i18n/lazy.ts';
import { useAction, useEngage, type Goal, type Offer } from '../api.ts';
import { EngageError, Loaded, Page } from '../ui.tsx';
import { OfferCard } from './Journeys.tsx';

// /path (E2): school to work on Schood. Each goal closes on a journey graduation or a
// verified result, and then the next goal is ready. The person can also close a goal
// in their own words, so the path never traps anyone; that is never shown as verified.

interface PathView { started: boolean; goals: Goal[]; next: string | null; done: number; offer: Offer | null }
const STAGES = ['school', 'study', 'abroad', 'work'] as const;

function GoalCard({ goal, isNext, onChange }: { goal: Goal; isNext: boolean; onChange: (view: PathView) => void }) {
  const t = useT(), action = useAction();
  const [result, setResult] = useState('');
  const [closing, setClosing] = useState(false);
  const act = async (kind: 'start' | 'skip' | 'done' | 'reopen') => {
    const view = await action.run<PathView>('path-goal', { goal: goal.key, action: kind, ...(kind === 'done' && result.trim() ? { result: result.trim() } : {}) }, `${goal.key}:${kind}`);
    if (view) { setClosing(false); onChange(view); }
  };
  const tone = goal.status === 'done' ? 'lime' : goal.status === 'ready' ? 'sky' : goal.status === 'active' ? 'navy' : 'neutral';
  return <Card as="li" className={`flex flex-col gap-3 ${isNext ? 'ring-2 ring-lime' : ''}`}>
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone={tone}>{t(`engage.path.status.${goal.status}`)}</Badge>
      {goal.status === 'done' && (goal.verified ? <Badge tone="lime"><BadgeCheck size={12} aria-hidden="true"/>{t('engage.path.verified')}</Badge> : <Badge>{t('engage.path.selfReported')}</Badge>)}
      {isNext && <Badge tone="sky">{t('engage.path.nextBadge')}</Badge>}
    </div>
    <h3 className="m-0 font-display text-lg font-bold">{goal.title}</h3>
    <p className="m-0 text-sm text-gray-700">{goal.lead}</p>
    {goal.status !== 'done' && <div className="flex flex-wrap gap-2">
      {goal.status !== 'active' && <Button size="sm" disabled={action.busy !== null} onClick={() => void act('start')}>{t('engage.path.start')}</Button>}
      {goal.status === 'active' && <Button size="sm" onClick={() => navigate(goal.start)}>{t('engage.path.continue')}</Button>}
      {goal.status !== 'skipped' ? <Button size="sm" variant="ghost" disabled={action.busy !== null} onClick={() => void act('skip')}>{t('engage.path.skip')}</Button>
        : <Button size="sm" variant="ghost" onClick={() => void act('reopen')}>{t('engage.path.reopen')}</Button>}
      <Button size="sm" variant="ghost" onClick={() => setClosing((open) => !open)}>{t('engage.path.already')}</Button>
    </div>}
    {closing && <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); void act('done'); }}>
      <div className="min-w-0 flex-1"><Field label={t('engage.path.result')} hint={t('engage.path.resultHint')}>{(id) => <TextInput id={id} value={result} maxLength={120} onChange={(event) => setResult(event.target.value)}/>}</Field></div>
      <Button type="submit" size="sm" variant="secondary" icon={<CheckCircle2 size={14} aria-hidden="true"/>}>{t('engage.path.close')}</Button>
    </form>}
    {action.error !== null && <EngageError error={action.error}/>}
  </Card>;
}

export function PathPage() {
  const t = useT();
  const view = useEngage<PathView>('path');
  return <Page eyebrow={<Eyebrow icon={<Route size={14} aria-hidden="true"/>}>{t('engage.path.eyebrow')}</Eyebrow>} title={t('engage.path.title')} lead={t('engage.path.lead')}>
    <Loaded {...view}>{(data) => <>
      {data.offer && <OfferCard offer={data.offer} onDismiss={() => void view.reload()}/>}
      {!data.started && <Card className="bg-cream-soft"><p className="m-0 inline-flex items-center gap-2 text-sm"><Flag size={16} aria-hidden="true"/>{t('engage.path.choose')}</p></Card>}
      {STAGES.map((stage) => {
        const goals = data.goals.filter((goal) => goal.stage === stage);
        if (!goals.length) return null;
        return <section key={stage} aria-labelledby={`engage-stage-${stage}`} className="flex flex-col gap-3">
          <h2 id={`engage-stage-${stage}`} className="m-0 font-display text-xl font-bold">{t(`engage.path.stage.${stage}`)}</h2>
          <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">{goals.map((goal) => <GoalCard key={goal.key} goal={goal} isNext={data.next === goal.key} onChange={(next) => view.setData(next)}/>)}</ul>
        </section>;
      })}
    </>}</Loaded>
  </Page>;
}
