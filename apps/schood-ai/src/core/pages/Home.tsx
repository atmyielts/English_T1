import { useEffect, useState } from 'react';
import { ArrowRight, CircleCheck, MessageSquareText, Sparkles, UserRound } from 'lucide-react';
import { api } from '../api.ts';
import type { HomeCard } from '../areas.ts';
import { HomeCardView } from '../lazy.tsx';
import { useI18n, useT } from '../i18n/index.ts';
import { navigate } from '../router.tsx';
import { CreditBalance, Paywall } from '../states.tsx';
import type { ActionView, ContextBlockView, Me } from '../types.ts';
import { Badge, BrandMark, Button, Card, Eyebrow, SparkMark } from '../ui.tsx';
import { useWorkspace } from '../workspace.tsx';

// Home for each audience. Real state only: the plan, credits and renewal, actions
// waiting for approval, what the assistant knows about a learner, and the cards
// each area registers for this audience.

/** A prompt handed to the assistant page without putting the text in the URL. */
let pendingPrompt = '';
export const takePendingPrompt = () => { const value = pendingPrompt; pendingPrompt = ''; return value; };
export function askAssistant(prompt = '') { pendingPrompt = prompt; navigate('/assistant'); }

function PlanSummary({ me }: { me: Me }) {
  const t = useT(), { date } = useI18n();
  const none = !me.plan.plans.length && !me.plan.beta && !me.plan.features.length;
  if (none) return <div className="md:col-span-2"><Paywall plans={[]}/></div>;
  return <Card className="flex flex-col gap-2">
    <Eyebrow>{t('home.plan.title')}</Eyebrow>
    <div className="flex flex-wrap gap-2">
      {me.plan.beta && <Badge tone="sky">{t('home.plan.beta')}</Badge>}
      {me.plan.plans.map((plan) => <Badge key={plan} tone="lime">{t(`plans.${plan}.name`)}</Badge>)}
    </div>
    {me.credits.cycle_ends_at && <p className="m-0 text-sm text-gray-700">{t('home.credits.renews', { date: date(me.credits.cycle_ends_at, { dateStyle: 'long' }) })}</p>}
    {me.credits.budget && <p className="m-0 text-sm text-gray-700">{t('home.credits.budget', { left: me.credits.budget.left, limit: me.credits.budget.limit })}</p>}
  </Card>;
}

function AskCard({ lead, prompts = [] }: { lead: string; prompts?: string[] }) {
  const t = useT();
  return <Card className="ai-spark-card flex flex-col gap-4 md:col-span-2">
    <div className="flex items-start gap-3">
      <SparkMark size={36}/>
      <div className="min-w-0">
        <h2 className="m-0 font-display text-xl font-bold">{t('home.ask.title')}</h2>
        <p className="m-0 mt-1 text-sm leading-6 text-gray-700">{lead}</p>
      </div>
    </div>
    {prompts.length > 0 && <div className="flex flex-wrap gap-2">{prompts.map((prompt) => <button key={prompt} type="button" onClick={() => askAssistant(prompt)}
      className="rounded-full border border-navy-line bg-white px-3 py-2 text-left text-sm text-gray-900 hover:bg-cream-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy">{prompt}</button>)}</div>}
    <div><Button variant="spark" onClick={() => askAssistant()} icon={<MessageSquareText size={16} aria-hidden="true"/>}>{t('home.ask.open')}</Button></div>
  </Card>;
}

function ApprovalsSummary() {
  const t = useT(), workspace = useWorkspace();
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    api<{ actions: ActionView[] }>('core/actions', { workspaceId: workspace.workspaceId, query: { status: 'open' } })
      .then((result) => { if (live) setCount(result.actions.filter((action) => action.can_approve).length); })
      .catch(() => { if (live) setCount(null); });
    return () => { live = false; };
  }, [workspace.workspaceId]);
  return <Card className="flex flex-col gap-2">
    <Eyebrow icon={<CircleCheck size={14} aria-hidden="true"/>}>{t('home.approvals.title')}</Eyebrow>
    <p className="m-0 text-sm text-gray-700">{count ? t('home.approvals.some', { count }) : t('home.approvals.none')}</p>
    {!!count && <div><Button variant="secondary" size="sm" onClick={() => navigate('/approvals')} icon={<ArrowRight size={14} aria-hidden="true"/>}>{t('home.approvals.open')}</Button></div>}
  </Card>;
}

interface ProfileSummary { has_results?: boolean; cefr_estimate?: string | null; target_cefr?: string | null; weak_spots?: { skill: string; mistake: string }[]; recent_results?: { band: string | null; score: number | null; date: string | null }[] }
function KnowsCard() {
  const t = useT(), workspace = useWorkspace();
  const [summary, setSummary] = useState<ProfileSummary | null | 'none'>(null);
  useEffect(() => {
    let live = true;
    api<{ blocks: ContextBlockView[] }>('core/context', { workspaceId: workspace.workspaceId, query: { kind: 'learner_profile' } })
      .then((result) => { if (live) setSummary((result.blocks[0]?.data as ProfileSummary) ?? 'none'); })
      .catch(() => { if (live) setSummary('none'); });
    return () => { live = false; };
  }, [workspace.workspaceId]);
  if (summary === null) return null;
  const data = summary === 'none' ? null : summary;
  return <Card className="flex flex-col gap-3 md:col-span-2">
    <Eyebrow icon={<UserRound size={14} aria-hidden="true"/>}>{t('home.knows.title')}</Eyebrow>
    <p className="m-0 text-sm text-gray-700">{t('home.knows.lead')}</p>
    {!data?.has_results ? <p className="m-0 rounded-2xl bg-cream-soft p-3 text-sm text-gray-800">{t('home.knows.none')}</p> : <dl className="m-0 grid gap-3 sm:grid-cols-2">
      {data.cefr_estimate && <div className="rounded-2xl bg-cream-soft p-3"><dt className="text-xs font-semibold uppercase tracking-wider text-gray-600">{t('home.knows.level')}</dt><dd className="m-0 mt-1 font-display text-2xl font-bold">{data.cefr_estimate}{data.target_cefr && <span className="ml-2 text-sm font-semibold text-gray-600">→ {data.target_cefr}</span>}</dd></div>}
      {!!data.weak_spots?.length && <div className="rounded-2xl bg-cream-soft p-3"><dt className="text-xs font-semibold uppercase tracking-wider text-gray-600">{t('home.knows.weak')}</dt><dd className="m-0 mt-1 text-sm text-gray-900">{data.weak_spots.map((spot) => spot.mistake || spot.skill).join(' · ')}</dd></div>}
      {!!data.recent_results?.length && <div className="rounded-2xl bg-cream-soft p-3 sm:col-span-2"><dt className="text-xs font-semibold uppercase tracking-wider text-gray-600">{t('home.knows.recent')}</dt><dd className="m-0 mt-1 text-sm text-gray-900">{data.recent_results.map((row) => [row.band ?? row.score, row.date].filter(Boolean).join(' · ')).join(', ')}</dd></div>}
    </dl>}
  </Card>;
}

function Tools({ cards, me }: { cards: HomeCard[]; me: Me }) {
  const t = useT();
  return <section className="mt-6" aria-labelledby="home-tools">
    <h2 id="home-tools" className="m-0 mb-3 font-display text-xl font-bold">{t('home.tools.title')}</h2>
    {cards.length ? <div className="grid gap-4 md:grid-cols-2">{cards.map((card) => <HomeCardView key={card.id} card={card} me={me}/>)}</div>
      : <p className="m-0 rounded-3xl border border-dashed border-navy-line/40 bg-white/60 p-5 text-sm text-gray-700">{t('home.tools.soon')}</p>}
  </section>;
}

export function HomePage({ cards }: { cards: HomeCard[] }) {
  const t = useT(), workspace = useWorkspace();
  const me = workspace.me!, audience = workspace.audience;
  // Cards show by audience; a card for a locked feature opens a page that shows the plan gate.
  const visible = cards.filter((card) => card.audiences.includes(audience));
  const name = me.user.name?.split(' ')[0] || '';
  const ws = me.workspace;
  return <>
    <header className="mb-6">
      {ws.kind === 'centre' && <div className="mb-3 flex items-center gap-3"><BrandMark name={ws.name} logo={ws.branding.logo_url} color={ws.branding.primary_color} size={40}/><span className="font-semibold text-gray-900">{ws.name}</span></div>}
      <p className="m-0 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-600"><Sparkles size={14} aria-hidden="true"/>{t(`audience.${audience}`)}</p>
      <h1 className="m-0 mt-2 font-display text-3xl font-bold leading-tight md:text-4xl">{name ? t('home.greeting', { name }) : t('home.greetingAnon')}</h1>
      <p className="m-0 mt-3 max-w-2xl text-base leading-7 text-gray-700">{t(`home.lead.${audience}`)}</p>
    </header>
    <div className="grid gap-4 md:grid-cols-2">
      {audience === 'learner' && <><AskCard lead={t('chat.empty.lead')}/><PlanSummary me={me}/><CreditBalance/><KnowsCard/></>}
      {audience === 'parent' && <><PlanSummary me={me}/><CreditBalance/><Card className="md:col-span-2"><p className="m-0 text-sm text-gray-700">{t('home.parent.lead')}</p></Card></>}
      {audience === 'teacher' && <><AskCard lead={t('home.teacher.start')} prompts={[t('home.teacher.prompt1'), t('home.teacher.prompt2'), t('home.teacher.prompt3')]}/><PlanSummary me={me}/><CreditBalance/><ApprovalsSummary/></>}
      {audience === 'centre' && <>
        <Card className="flex flex-col gap-2">
          <Eyebrow>{t('home.centre.workspace')}</Eyebrow>
          <p className="m-0 font-display text-xl font-bold">{ws.name}</p>
          <p className="m-0 text-sm text-gray-700">{t('home.centre.members')}: {t(`role.${ws.role}`)}</p>
        </Card>
        <CreditBalance/>
        <PlanSummary me={me}/>
        <ApprovalsSummary/>
        <Card className="md:col-span-2"><p className="m-0 text-sm text-gray-700">{t('home.centre.lead')}</p></Card>
      </>}
    </div>
    <Tools cards={visible} me={me}/>
  </>;
}
