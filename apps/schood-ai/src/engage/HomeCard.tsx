import { ArrowRight, Flame, Snowflake } from 'lucide-react';
import { Button, Card, Eyebrow, navigate } from '../core/index.ts';
import { usePageText, useT } from './i18n/lazy.ts';
import { useEngage, type EngageState } from './api.ts';
import { Meter, TierBadge } from './ui.tsx';

// The learner home card: today's first step and quests, the streak and the league, in
// one glance. It loads on its own so the home page never waits for it.

/** Core's home card loader renders this; it waits for the engage page text (fetched with the chunk). */
export default function EngageHomeCardWithText() {
  return usePageText() ? <EngageHomeCard/> : null;
}

function EngageHomeCard() {
  const t = useT();
  const view = useEngage<EngageState>('state');
  const state = view.data;
  if (!state) return null;
  const done = state.quests.filter((quest) => quest.done).length;
  return <Card className="flex flex-col gap-3 md:col-span-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Eyebrow icon={<Flame size={14} aria-hidden="true"/>}>{t('engage.home.title')}</Eyebrow>
      {state.league.joined && <TierBadge tier={state.league.tier}/>}
    </div>
    <div className="flex flex-wrap items-end gap-6">
      <div><p className="m-0 font-display text-3xl font-bold">{t('engage.streak.days', { count: state.streak.current })}</p>
        <p className="m-0 inline-flex items-center gap-1 text-xs text-gray-600"><Snowflake size={12} aria-hidden="true"/>{t('engage.streak.freezes', { count: state.streak.freezes, max: state.streak.max_freezes })}</p></div>
      <div className="min-w-40 flex-1"><p className="m-0 mb-1 text-sm">{state.first_step ? t('engage.firstStep.done') : t('engage.firstStep.lead')}</p><Meter value={done} max={state.quests.length} label={t('engage.quests.count', { done, total: state.quests.length })}/></div>
    </div>
    {state.wellbeing.enough_today && <p className="m-0 text-sm font-semibold">{t('engage.enough.title')}</p>}
    <div><Button size="sm" onClick={() => navigate('/progress')} icon={<ArrowRight size={14} aria-hidden="true"/>}>{t('engage.home.open')}</Button></div>
  </Card>;
}
