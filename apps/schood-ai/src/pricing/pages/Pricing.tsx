import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowUpRight, BadgeCheck, Building2, Check, Coins, GraduationCap, HeartHandshake, Info, Lock, MessagesSquare, PenTool, Sparkles } from 'lucide-react';
import { COACH_FEATURES, type CoachFeature } from '../../../../../packages/ai-core/src/catalog.ts';
import { ApiErrorState, Badge, ButtonLink, Card, Eyebrow, Link, LoadingState, PageHeader, signInUrl, useI18n, useLocation, useSession, useT, useWorkspace } from '../../core/index.ts';
import { checkoutUrl, CONTACT_URL, count, getCatalog, getMine, money, type CatalogPlanView, type CatalogView, type MineView } from '../api.ts';
import { GiftCard } from './parts.tsx';

// /pricing (and /plans): every Schood AI plan with its real price, for learners, families,
// coaches and teams, teachers and centres, plus credits, gifts and certificate sittings.
// "Buy" hands off to the platform's own checkout; centres request through support. Honest
// copy only: no urgency, no invented reviews; plans are paid once and never renew by
// themselves, so there is nothing to cancel.

type Section = 'learners' | 'families' | 'coaches' | 'teams' | 'teachers' | 'centres' | 'credits' | 'gifts' | 'certificate';
const SECTIONS: { id: Section; icon: ReactNode }[] = [
  { id: 'learners', icon: <GraduationCap size={16} aria-hidden="true"/> },
  { id: 'families', icon: <HeartHandshake size={16} aria-hidden="true"/> },
  { id: 'coaches', icon: <MessagesSquare size={16} aria-hidden="true"/> },
  { id: 'teams', icon: <MessagesSquare size={16} aria-hidden="true"/> },
  { id: 'teachers', icon: <PenTool size={16} aria-hidden="true"/> },
  { id: 'centres', icon: <Building2 size={16} aria-hidden="true"/> },
  { id: 'credits', icon: <Coins size={16} aria-hidden="true"/> },
  { id: 'gifts', icon: <Sparkles size={16} aria-hidden="true"/> },
  { id: 'certificate', icon: <BadgeCheck size={16} aria-hidden="true"/> },
];
const FEATURE_LINES: Record<string, number> = { plus: 4, family: 3, teacher: 3, teacher_pro: 3, centre: 3, centre_pro: 3, enterprise: 2, team: 2 };

export function PricingPage() {
  const t = useT(), { locale } = useI18n(), session = useSession(), workspace = useWorkspace(), { query } = useLocation();
  const [catalog, setCatalog] = useState<CatalogView | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [mine, setMine] = useState<MineView | null>(null);
  const signedIn = session.status === 'signed_in';
  const coach = (COACH_FEATURES as readonly string[]).includes(query.get('coach') ?? '') ? query.get('coach') as CoachFeature : null;
  const wanted = query.get('plan');

  useEffect(() => { getCatalog().then(setCatalog, setError); }, []);
  useEffect(() => { if (signedIn) getMine().then(setMine, () => setMine(null)); }, [signedIn]);
  // Arriving from a coach bot, an offer or a #credits link: bring that part into view.
  useEffect(() => {
    if (!catalog) return;
    const target = location.hash.slice(1) || (coach ? 'coaches' : wanted ? `plan-${wanted}` : '');
    if (target) requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ block: 'start' }));
  }, [catalog]);

  const plans = catalog?.plans ?? [];
  const pick = (test: (plan: CatalogPlanView) => boolean) => plans.filter(test).sort((a, b) => a.order - b.order);
  const held = new Set(mine?.plan.plans ?? workspace.me?.plan.plans ?? []);
  const monthlyOf = useMemo(() => (code: string | null) => plans.find((plan) => plan.plan === code && plan.days === 30)?.amount ?? null, [plans]);
  if (error) return <ApiErrorState error={error} onRetry={() => { setError(null); getCatalog().then(setCatalog, setError); }}/>;
  if (!catalog) return <LoadingState/>;

  const card = (plan: CatalogPlanView, title: string, lines: string[] = [], options: { gift?: boolean } = {}) =>
    <PlanCard key={plan.slug} plan={plan} title={title} lines={lines} signedIn={signedIn} current={!!plan.plan && held.has(plan.plan)}
      highlighted={plan.slug === wanted || (!!coach && plan.coach === coach)} monthly={plan.days === 365 ? monthlyOf(plan.plan) : null} gift={options.gift}/>;
  const lines = (code: string) => Array.from({ length: FEATURE_LINES[code] ?? 0 }, (_, i) => t(`pricing.f.${code}.${i + 1}`));
  const credits = (value: number | null) => count(value ?? 0, locale);

  return <>
    <PageHeader eyebrow={<Eyebrow icon={<Sparkles size={14} aria-hidden="true"/>}>{t('pricing.eyebrow')}</Eyebrow>} title={t('pricing.title')} lead={t('pricing.lead')}/>
    {!catalog.launched && <Card className="mb-6 flex gap-3 border-amber-300 bg-amber-50">
      <Lock size={18} className="mt-0.5 shrink-0 text-amber-900" aria-hidden="true"/>
      <div><h2 className="m-0 font-display text-lg font-bold text-amber-950">{t('pricing.closed.title')}</h2><p className="m-0 mt-1 text-sm leading-6 text-amber-950">{t('pricing.closed.lead')}</p></div>
    </Card>}
    {signedIn && mine && <Mine mine={mine}/>}
    <nav aria-label={t('pricing.jump')} className="mb-6 flex gap-2 overflow-x-auto pb-1">
      {SECTIONS.map(({ id, icon }) => <a key={id} href={`#${id}`} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-navy-line bg-white/80 px-3 text-xs font-semibold text-gray-900 no-underline">{icon}{t(`pricing.section.${id}`)}</a>)}
    </nav>

    <Block id="learners" lead={t('pricing.section.learners.lead')}>
      {pick((plan) => plan.plan === 'plus').map((plan) => card(plan, t('pricing.name.plus'), [t('pricing.monthlyCredits', { count: credits(plan.monthly_credits) }), ...lines('plus')]))}
    </Block>
    <Block id="families" lead={t('pricing.section.families.lead')}>
      {pick((plan) => plan.plan === 'family').map((plan) => card(plan, t('pricing.name.family'), lines('family')))}
    </Block>
    <Block id="coaches" lead={t('pricing.section.coaches.lead')}>
      {pick((plan) => plan.kind === 'coach_pass').map((plan) => card(plan, t(`pricing.coach.${plan.coach}`), [t('pricing.coach.pass')]))}
    </Block>
    <Block id="teams" lead={t('pricing.section.teams.lead', { price: money(39000, locale) })}>
      {pick((plan) => plan.kind === 'coach_team').map((plan) => card(plan, t('pricing.seats', { count: plan.seats ?? 0 }), [t('pricing.perSeat', { price: money(plan.amount / (plan.seats || 1), locale) }), ...lines('team')]))}
    </Block>
    <Block id="teachers" lead={t('pricing.section.teachers.lead')}>
      {pick((plan) => plan.plan === 'teacher' || plan.plan === 'teacher_pro').map((plan) => card(plan, t(`pricing.name.${plan.plan}`), [t('pricing.monthlyCredits', { count: credits(plan.monthly_credits) }), ...lines(String(plan.plan))]))}
    </Block>
    <Block id="centres" lead={t('pricing.section.centres.lead')}>
      {pick((plan) => plan.plan === 'centre' || plan.plan === 'centre_pro').map((plan) => card(plan, t(`pricing.name.${plan.plan}`), lines(String(plan.plan))))}
      <EnterpriseCard lines={lines('enterprise')}/>
      {pick((plan) => plan.kind === 'centre_addon').map((plan) => card(plan, t(plan.add_on?.teacherSeats ? 'pricing.name.teacherSeat' : 'pricing.name.students')))}
    </Block>
    <Block id="credits" lead={t('pricing.section.credits.lead')}>
      {pick((plan) => plan.kind === 'credits').map((plan) => card(plan, t('pricing.credits', { count: credits(plan.credits) })))}
    </Block>
    <Block id="gifts" lead={t('pricing.section.gifts.lead', { days: catalog.gift_valid_days })}>
      {pick((plan) => plan.kind === 'gift').map((plan) => card(plan, plan.gift && 'credits' in plan.gift ? t('pricing.gift.credits', { count: credits(plan.gift.credits) }) : t('pricing.gift.plus', { count: plan.gift && 'days' in plan.gift ? plan.gift.days : 0 }), [], { gift: true }))}
    </Block>
    <Block id="certificate" lead={t('pricing.section.certificate.lead', { days: catalog.sitting_valid_days })}>
      {pick((plan) => plan.kind === 'certificate').map((plan) => card(plan, t('pricing.name.sitting')))}
    </Block>

    <Card className="mt-2 flex flex-col gap-3">
      <h2 className="m-0 inline-flex items-center gap-2 font-display text-lg font-bold"><Info size={18} aria-hidden="true"/>{t('pricing.how.title')}</h2>
      <ul className="m-0 grid list-none gap-2 p-0 text-sm leading-6 text-gray-800 md:grid-cols-2">
        {(['once', 'credits', 'expire', 'free'] as const).map((key) => <li key={key} className="flex gap-2"><Check size={16} className="mt-1 shrink-0" aria-hidden="true"/>{t(`pricing.how.${key}`)}</li>)}
      </ul>
    </Card>
  </>;
}

function Block({ id, lead, children }: { id: Section; lead: string; children: ReactNode }) {
  const t = useT();
  return <section id={id} aria-labelledby={`${id}-title`} className="mb-8 scroll-mt-24">
    <h2 id={`${id}-title`} className="m-0 font-display text-2xl font-bold">{t(`pricing.section.${id}`)}</h2>
    <p className="mb-4 mt-2 max-w-3xl text-sm leading-6 text-gray-700">{lead}</p>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
  </section>;
}

function PlanCard({ plan, title, lines, signedIn, current, highlighted, monthly, gift }: {
  plan: CatalogPlanView; title: string; lines: string[]; signedIn: boolean; current: boolean; highlighted: boolean; monthly: number | null; gift?: boolean;
}) {
  const t = useT(), { locale } = useI18n();
  const period = plan.days === 30 || plan.days === 90 || plan.days === 365 ? t(`pricing.period.${plan.days}`) : plan.days ? '' : t('pricing.period.once');
  let action: ReactNode;
  if (plan.channel === 'request') action = <ButtonLink variant="secondary" href={CONTACT_URL}>{t('pricing.cta.request')}<ArrowUpRight size={16} aria-hidden="true"/></ButtonLink>;
  else if (!plan.on_sale) action = <span className="inline-flex min-h-11 items-center justify-center rounded-full border border-dashed border-navy-line px-4 text-sm font-semibold text-gray-600" aria-disabled="true">{t('pricing.cta.soon')}</span>;
  else if (!signedIn) action = <ButtonLink href={signInUrl('login', `${location.origin}/pricing?plan=${encodeURIComponent(plan.slug)}`)}>{t('pricing.cta.signIn')}</ButtonLink>;
  else action = <div className="flex flex-col gap-1"><ButtonLink href={checkoutUrl(plan)}>{gift ? t('pricing.cta.gift') : t('pricing.cta.buy')}<ArrowUpRight size={16} aria-hidden="true"/></ButtonLink><span className="text-center text-xs text-gray-600">{t('pricing.cta.opens')}</span></div>;
  return <Card as="article" id={`plan-${plan.slug}`} className={`flex scroll-mt-24 flex-col gap-3 ${highlighted ? 'ring-2 ring-lime ring-offset-2 ring-offset-cream' : ''}`}>
    <div className="flex flex-wrap gap-2">
      {current && <Badge tone="lime">{t('pricing.yours')}</Badge>}
      {highlighted && !current && <Badge tone="sky">{t('pricing.highlight')}</Badge>}
      {plan.recommended && <Badge>{t('pricing.lowest')}</Badge>}
    </div>
    <h3 className="m-0 font-display text-xl font-bold">{title}</h3>
    <p className="m-0"><span className="font-display text-2xl font-bold text-gray-950">{money(plan.amount, locale)}</span> {period && <span className="text-sm text-gray-700">{period}</span>}</p>
    {monthly && plan.days === 365 && <p className="m-0 text-xs text-gray-600">{t('pricing.annual.compare', { price: money(monthly * 12, locale) })}</p>}
    {lines.length > 0 && <ul className="m-0 flex flex-1 list-none flex-col gap-1.5 p-0 text-sm leading-6 text-gray-800">
      {lines.map((line) => <li key={line} className="flex gap-2"><Check size={16} className="mt-1 shrink-0" aria-hidden="true"/>{line}</li>)}
    </ul>}
    <div className="mt-auto pt-1">{action}</div>
  </Card>;
}

function EnterpriseCard({ lines }: { lines: string[] }) {
  const t = useT();
  return <Card as="article" className="flex flex-col gap-3">
    <h3 className="m-0 font-display text-xl font-bold">{t('pricing.name.enterprise')}</h3>
    <p className="m-0 font-display text-2xl font-bold text-gray-950">{t('pricing.cta.contract')}</p>
    <ul className="m-0 flex flex-1 list-none flex-col gap-1.5 p-0 text-sm leading-6 text-gray-800">
      {lines.map((line) => <li key={line} className="flex gap-2"><Check size={16} className="mt-1 shrink-0" aria-hidden="true"/>{line}</li>)}
    </ul>
    <div className="mt-auto pt-1"><ButtonLink variant="secondary" href={CONTACT_URL}>{t('pricing.cta.request')}<ArrowUpRight size={16} aria-hidden="true"/></ButtonLink></div>
  </Card>;
}

/** What the signed-in person has: their plans, the gifts they bought (with codes), a team to set up. */
function Mine({ mine }: { mine: MineView }) {
  const t = useT();
  const names = mine.plan.plans.map((plan) => t(`pricing.name.${plan}`));
  const gifts = mine.gifts.filter((gift) => gift.status === 'issued');
  if (!names.length && !mine.plan.beta && !gifts.length && !mine.teams_to_set_up.length) return null;
  return <section aria-labelledby="mine-title" className="mb-8">
    <h2 id="mine-title" className="m-0 mb-3 font-display text-2xl font-bold">{t('pricing.mine.title')}</h2>
    <div className="flex flex-col gap-3">
      {names.length > 0 && <p className="m-0 text-sm text-gray-800">{t('pricing.mine.plans', { plans: names.join(', ') })}</p>}
      {mine.plan.beta && <p className="m-0 text-sm text-gray-800">{t('pricing.mine.beta')}</p>}
      {mine.teams_to_set_up.length > 0 && <Card className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-sm font-semibold text-gray-900">{t('pricing.mine.teams')}</p>
        <Link to="/pricing/done?plan=schood-coach-team" className="inline-flex min-h-11 items-center rounded-full bg-navy px-4 text-sm font-semibold text-white no-underline">{t('pricing.mine.setUp')}</Link>
      </Card>}
      {gifts.length > 0 && <>
        <h3 className="m-0 mt-2 font-display text-lg font-bold">{t('pricing.mine.gifts')}</h3>
        <div className="grid gap-4 sm:grid-cols-2">{gifts.map((gift) => <GiftCard key={gift.id} gift={gift}/>)}</div>
      </>}
    </div>
  </section>;
}
