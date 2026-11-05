import { ArrowUpRight, BookOpenCheck, Building2, GraduationCap, HeartHandshake, ShieldCheck, Sparkles, Users2 } from 'lucide-react';
import { MONTHLY_CREDITS, PLAN_CODES, type PlanCode } from '../../../../../packages/ai-core/src/mod.ts';
import { signInUrl, useSession } from '../auth.tsx';
import { useI18n, useT } from '../i18n/index.ts';
import { Answer } from '../markdown.tsx';
import { Link } from '../router.tsx';
import { Badge, ButtonLink, Card, Eyebrow, PageHeader, SparkMark } from '../ui.tsx';
import { useWorkspace } from '../workspace.tsx';

// What a person without a plan can see: the landing page, a fixed gallery of
// examples (written in advance, never live model output) and the plans. Prices are
// not shown until the owner confirms them; plans ship inactive.

const EXAMPLES = ['tutor', 'writing', 'worksheet', 'parent'] as const;

export function ExampleGallery({ limit }: { limit?: number }) {
  const t = useT();
  return <div className="grid gap-4 md:grid-cols-2">
    {EXAMPLES.slice(0, limit).map((id) => <Card key={id} as="article" className="flex flex-col gap-3">
      <h3 className="m-0 font-display text-lg font-bold">{t(`examples.${id}.title`)}</h3>
      <div className="rounded-2xl bg-navy px-4 py-3 text-sm text-white"><span className="sr-only">{t('examples.prompt')}: </span>{t(`examples.${id}.prompt`)}</div>
      <div className="flex gap-3">
        <SparkMark size={28} label={t('examples.answer')}/>
        <div className="min-w-0 flex-1 rounded-2xl border border-navy-line bg-white px-4 py-3"><Answer text={t(`examples.${id}.answer`)}/></div>
      </div>
    </Card>)}
  </div>;
}

export function ExamplesPage() {
  const t = useT();
  return <>
    <PageHeader eyebrow={<Eyebrow icon={<Sparkles size={14} aria-hidden="true"/>}>{t('app.title')}</Eyebrow>} title={t('examples.title')} lead={t('examples.lead')}/>
    <ExampleGallery/>
  </>;
}

const PLAN_ICON: Record<PlanCode, typeof GraduationCap> = { plus: GraduationCap, family: HeartHandshake, teacher: BookOpenCheck, teacher_pro: BookOpenCheck, centre: Building2, centre_pro: Building2, enterprise: Users2 };

export function PlansPage() {
  const t = useT(), { number } = useI18n(), session = useSession();
  const workspace = useWorkspace();
  const current = new Set(workspace.me?.plan.plans ?? []);
  return <>
    <PageHeader eyebrow={<Eyebrow icon={<Sparkles size={14} aria-hidden="true"/>}>{t('app.title')}</Eyebrow>} title={t('plans.title')} lead={t('plans.lead')}/>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {PLAN_CODES.map((plan) => {
        const Icon = PLAN_ICON[plan];
        return <Card key={plan} as="article" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-navy-line bg-cream-soft" aria-hidden="true"><Icon size={18}/></span>
            {current.has(plan) ? <Badge tone="lime">{t('plans.current')}</Badge> : <Badge>{t('plans.soon')}</Badge>}
          </div>
          <div>
            <p className="m-0 text-xs font-semibold uppercase tracking-wider text-gray-600">{t(`plans.${plan}.for`)}</p>
            <h2 className="m-0 mt-1 font-display text-xl font-bold">{t(`plans.${plan}.name`)}</h2>
          </div>
          <p className="m-0 flex-1 text-sm leading-6 text-gray-700">{t(`plans.${plan}.desc`)}</p>
          <p className="m-0 text-sm font-semibold text-gray-900">{plan === 'enterprise' ? t('plans.contract') : t('plans.credits', { count: number(MONTHLY_CREDITS[plan]) })}</p>
        </Card>;
      })}
    </div>
    {session.status !== 'signed_in' && <div className="mt-6"><ButtonLink href={signInUrl()}>{t('landing.cta.signIn')}<ArrowUpRight size={16} aria-hidden="true"/></ButtonLink></div>}
  </>;
}

export function LandingPage() {
  const t = useT();
  const audiences = [
    { id: 'learners', icon: GraduationCap }, { id: 'parents', icon: HeartHandshake },
    { id: 'teachers', icon: BookOpenCheck }, { id: 'centres', icon: Building2 },
  ] as const;
  return <>
    <section className="ai-hero relative overflow-hidden rounded-[2rem] border border-navy-line bg-white/70 px-5 py-10 md:px-10 md:py-14">
      <div className="relative max-w-3xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-navy-line bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gray-800"><SparkMark size={18}/>{t('landing.badge')}</span>
        <h1 className="mb-4 mt-5 font-display text-4xl font-bold leading-tight tracking-tight text-gray-900 md:text-5xl">{t('landing.title')}</h1>
        <p className="m-0 max-w-2xl text-lg leading-8 text-gray-700">{t('landing.lead')}</p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href={signInUrl()} className="px-5">{t('landing.cta.signIn')}<ArrowUpRight size={16} aria-hidden="true"/></ButtonLink>
          <Link to="/plans" className="inline-flex min-h-11 items-center justify-center rounded-full border border-navy-line bg-white/80 px-5 text-sm font-semibold text-gray-900 no-underline">{t('landing.cta.plans')}</Link>
        </div>
      </div>
    </section>
    <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label={t('app.title')}>
      {audiences.map(({ id, icon: Icon }) => <Card key={id} as="article" className="flex flex-col gap-2">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-navy-line bg-cream-soft" aria-hidden="true"><Icon size={18}/></span>
        <h2 className="m-0 font-display text-lg font-bold">{t(`landing.${id}.title`)}</h2>
        <p className="m-0 text-sm leading-6 text-gray-700">{t(`landing.${id}.desc`)}</p>
      </Card>)}
    </section>
    <section className="mt-8 overflow-hidden rounded-3xl border border-navy-line bg-navy p-6 text-white md:p-8">
      <p className="m-0 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/70"><ShieldCheck size={14} aria-hidden="true"/>{t('landing.trust.title')}</p>
      <ul className="m-0 mt-4 grid list-none gap-3 p-0 md:grid-cols-2">
        {(['approval', 'run', 'facts', 'data'] as const).map((key) => <li key={key} className="rounded-2xl border border-white/15 bg-white/10 p-4 text-sm leading-6 text-white/90">{t(`landing.trust.${key}`)}</li>)}
      </ul>
    </section>
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h2 className="m-0 font-display text-2xl font-bold">{t('examples.title')}</h2>
        <Link to="/examples" className="text-sm font-semibold text-gray-900 underline underline-offset-2">{t('landing.cta.examples')}</Link>
      </div>
      <ExampleGallery limit={2}/>
    </section>
  </>;
}
