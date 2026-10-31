import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Coins, RefreshCw, Sparkles } from 'lucide-react';
import { planBySlug } from '../../../../../packages/ai-core/src/catalog.ts';
import { ApiErrorState, Button, Card, Eyebrow, Link, PageHeader, Thinking, useLocation, useT, useWorkspace } from '../../core/index.ts';
import { syncMine, type MineView } from '../api.ts';
import { GiftCard, TeamReady, TeamSetup } from './parts.tsx';

// /pricing/done?plan=<slug>: where the platform's checkout returns. It asks the function to
// fulfil what was paid for (credit packs, gift codes, sittings, team orders; plans and
// passes are entitlements already) and shows the result. Payment confirmation can lag the
// return, so it checks again on its own for a while.

const EVERY_MS = 5_000, TRIES = 24;

export function DonePage() {
  const t = useT(), workspace = useWorkspace(), { query } = useLocation();
  const slug = query.get('plan') ?? '';
  const plan = planBySlug(slug);
  const [mine, setMine] = useState<MineView | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tries, setTries] = useState(0);

  const check = useCallback(async () => {
    try {
      const next = await syncMine();
      setMine(next);
      setError(null);
      if (next.arrived.length) void workspace.refresh();
    } catch (cause) { setError(cause); }
    setTries((count) => count + 1);
  }, [workspace]);
  useEffect(() => { void check(); }, []);

  const ready = mine ? isReady(mine, slug) : false;
  useEffect(() => {
    if (!mine || ready || tries >= TRIES) return;
    const timer = setTimeout(() => void check(), EVERY_MS);
    return () => clearTimeout(timer);
  }, [mine, ready, tries]);
  useEffect(() => { if (ready && plan && (plan.kind === 'plan' || plan.kind === 'coach_pass')) void workspace.refresh(); }, [ready]);

  const header = <PageHeader eyebrow={<Eyebrow icon={<Sparkles size={14} aria-hidden="true"/>}>{t('pricing.eyebrow')}</Eyebrow>} title={t('pricing.done.title')} lead={t('pricing.done.lead')}/>;
  if (error && !mine) return <>{header}<ApiErrorState error={error} onRetry={() => void check()}/></>;
  if (!mine) return <>{header}<Thinking label={t('pricing.done.checking')}/></>;

  const kind = plan?.kind ?? null;
  const gifts = mine.gifts.filter((gift) => gift.plan === slug && gift.status === 'issued');
  const teams = mine.teams_to_set_up;
  let body: React.ReactNode = null;
  if (!ready) {
    body = <Card className="flex flex-col gap-3">
      {tries < TRIES ? <Thinking label={t('pricing.done.checking')}/> : null}
      <p className="m-0 text-sm leading-6 text-gray-800">{kind === 'plan' || kind === 'coach_pass' ? t('pricing.done.planNotYet') : t('pricing.done.notYet')}</p>
      <div><Button variant="secondary" size="sm" icon={<RefreshCw size={14} aria-hidden="true"/>} onClick={() => { setTries(0); void check(); }}>{t('pricing.done.again')}</Button></div>
    </Card>;
  } else if (kind === 'gift') {
    body = <div className="flex flex-col gap-4"><Success text={t('pricing.done.gift')}/><div className="grid gap-4 sm:grid-cols-2">{gifts.map((gift) => <GiftCard key={gift.id} gift={gift}/>)}</div></div>;
  } else if (kind === 'credits') {
    body = <Success icon={<Coins size={20} aria-hidden="true"/>} text={t('pricing.done.credits', { count: (plan?.credits ?? 0).toLocaleString('en-US') })}/>;
  } else if (kind === 'certificate') {
    body = <Success text={t('pricing.done.sitting')} action={<Link to="/certificates" className="inline-flex min-h-11 items-center rounded-full bg-navy px-4 text-sm font-semibold text-white no-underline">{t('pricing.done.sitting.open')}</Link>}/>;
  } else if (kind === 'coach_team') {
    body = teams.length ? <div className="flex flex-col gap-4">{teams.map((order) => <TeamSetup key={order.payment_id} order={order} onDone={() => void check()}/>)}</div> : <TeamReady/>;
  } else {
    body = <Success text={t('pricing.done.plan')}/>;
  }
  return <>
    {header}
    {body}
    <div className="mt-6 flex flex-wrap gap-2">
      <Link to="/" className="inline-flex min-h-11 items-center rounded-full bg-navy px-4 text-sm font-semibold text-white no-underline">{t('pricing.done.open')}</Link>
      <Link to="/pricing" className="inline-flex min-h-11 items-center rounded-full border border-navy-line bg-white px-4 text-sm font-semibold text-gray-900 no-underline">{t('pricing.done.pricing')}</Link>
    </div>
  </>;
}

/** Whether what this checkout sold has arrived. */
function isReady(mine: MineView, slug: string): boolean {
  const plan = planBySlug(slug);
  if (!plan) return true;
  switch (plan.kind) {
    case 'plan': return !!plan.plan && mine.plan.plans.includes(plan.plan);
    case 'coach_pass': return !!plan.coach && (mine.plan.features.includes(plan.coach) || mine.plan.plans.includes('plus') || mine.plan.plans.includes('family'));
    case 'gift': return mine.gifts.some((gift) => gift.plan === slug && gift.status === 'issued');
    case 'credits': return mine.arrived.some((row) => row.kind === 'credits') || mine.purchases.some((row) => row.kind === 'credits' && row.plan === slug);
    case 'certificate': return mine.purchases.some((row) => row.kind === 'certificate');
    case 'coach_team': return mine.purchases.some((row) => row.kind === 'coach_team');
    default: return true;
  }
}

function Success({ text, icon, action }: { text: string; icon?: React.ReactNode; action?: React.ReactNode }) {
  return <Card className="flex flex-col gap-3">
    <p className="m-0 inline-flex items-start gap-2 text-base font-semibold leading-7 text-gray-900">{icon ?? <CheckCircle2 size={20} className="mt-1 shrink-0" aria-hidden="true"/>}{text}</p>
    {action && <div>{action}</div>}
  </Card>;
}
