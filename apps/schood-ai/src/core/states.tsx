import { type ReactNode } from 'react';
import { AlertTriangle, Clock3, Coins, Lock, Moon, PowerOff, RefreshCw, ShieldCheck } from 'lucide-react';
import { quoteCredits, type AccessDecision } from '../../../../packages/ai-core/src/mod.ts';
import { ApiError } from './api.ts';
import { useI18n, useT } from './i18n/index.ts';
import { Link, useLocation } from './router.tsx';
import { Button, Card } from './ui.tsx';
import { useWorkspace } from './workspace.tsx';

// Loading, empty, error, capped and paywall states, credit cost and balance. Every
// AI screen uses ApiErrorState so a refusal from the function is always a clear,
// translated state, never a broken screen.

function StateBox({ icon, title, lead, children, tone = 'plain' }: { icon: ReactNode; title: ReactNode; lead?: ReactNode; children?: ReactNode; tone?: 'plain' | 'calm' | 'warn' }) {
  const tones = { plain: 'bg-white/85', calm: 'bg-cream-soft', warn: 'bg-amber-50' };
  return <div className={`flex flex-col items-start gap-3 rounded-3xl border border-navy-line p-5 md:p-6 ${tones[tone]}`} role={tone === 'warn' ? 'alert' : 'status'}>
    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-navy-line bg-white" aria-hidden="true">{icon}</span>
    <h2 className="m-0 font-display text-lg font-bold text-gray-900">{title}</h2>
    {lead && <p className="m-0 max-w-xl text-sm leading-6 text-gray-700">{lead}</p>}
    {children}
  </div>;
}

export function LoadingState({ label }: { label?: string }) {
  const t = useT();
  return <div role="status" aria-live="polite" className="flex items-center gap-3 py-8 text-sm text-gray-600">
    <span className="ai-thinking" aria-hidden="true"><span/><span/><span/></span>{label ?? t('state.loading')}
  </div>;
}

export function EmptyState({ title, lead, action }: { title?: ReactNode; lead?: ReactNode; action?: ReactNode }) {
  const t = useT();
  return <div className="rounded-3xl border border-dashed border-navy-line/40 bg-white/60 p-6 text-sm text-gray-700">
    <p className="m-0 font-semibold text-gray-900">{title ?? t('state.empty')}</p>
    {lead && <p className="mb-0 mt-1">{lead}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>;
}

export function ErrorState({ title, lead, onRetry }: { title?: ReactNode; lead?: ReactNode; onRetry?: () => void }) {
  const t = useT();
  return <StateBox tone="warn" icon={<AlertTriangle size={18} className="text-amber-700"/>} title={title ?? t('state.error.title')} lead={lead ?? t('state.error.lead')}>
    {onRetry && <Button variant="secondary" onClick={onRetry} icon={<RefreshCw size={16} aria-hidden="true"/>}>{t('state.retry')}</Button>}
  </StateBox>;
}

export function CappedState({ scope, retryAfter }: { scope: string; retryAfter?: string | null }) {
  const t = useT(), { date } = useI18n();
  const key = ['global', 'spend', 'user', 'workspace'].includes(scope) ? `state.capped.${scope}` : 'state.capped.global';
  return <StateBox tone="calm" icon={<Moon size={18}/>} title={t('state.capped.title')} lead={t(key)}>
    {retryAfter && <p className="m-0 inline-flex items-center gap-2 text-sm text-gray-700"><Clock3 size={16} aria-hidden="true"/>{t('state.capped.retry', { time: date(retryAfter, { dateStyle: 'medium', timeStyle: 'short' }) })}</p>}
  </StateBox>;
}

const planName = (t: (key: string) => string, plan: string) => t(`plans.${plan}.name`);

/** The paywall: what the feature needs, the plans and examples. Never a dead end. */
export function Paywall({ plans }: { plans: string[] }) {
  const t = useT(), { me } = useWorkspace();
  // Before the owner's launch switch nothing is on sale; after it, the plans can be bought.
  const open = me?.plan.launched === true;
  return <StateBox tone="calm" icon={<Lock size={18}/>} title={t('state.plan.title')} lead={plans.length ? t('state.plan.lead', { plans: plans.map((plan) => planName(t, plan)).join(', ') }) : open ? t('state.plan.buy') : t('state.plan.soon')}>
    {plans.length > 0 && <p className="m-0 text-sm text-gray-600">{open ? t('state.plan.buy') : t('state.plan.soon')}</p>}
    <div className="flex flex-wrap gap-2">
      <Link to="/pricing" className="inline-flex min-h-11 items-center rounded-full bg-navy px-4 text-sm font-semibold text-white no-underline">{t('nav.plans')}</Link>
      <Link to="/examples" className="inline-flex min-h-11 items-center rounded-full border border-navy-line bg-white px-4 text-sm font-semibold text-gray-900 no-underline">{t('nav.examples')}</Link>
    </div>
  </StateBox>;
}

/** Shows children when the feature is usable here, otherwise the paywall or role note. */
export function PlanGate({ feature, decision, children }: { feature?: string; decision?: AccessDecision; children: ReactNode }) {
  const t = useT(), workspace = useWorkspace();
  const result = decision ?? (feature ? workspace.access(feature) : { allowed: true as const });
  if (result.allowed) return <>{children}</>;
  if (result.reason === 'role_required') return <StateBox icon={<Lock size={18}/>} title={t('state.role.title')} lead={t('state.role.lead')}/>;
  return <Paywall plans={result.reason === 'plan_required' ? result.plans : []}/>;
}

/** The right state for a refusal from the function. */
export function ApiErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT();
  if (!(error instanceof ApiError)) return <ErrorState onRetry={onRetry}/>;
  const d = error.details;
  switch (error.code) {
    case 'plan_required': return <Paywall plans={Array.isArray(d.plans) ? d.plans.map(String) : []}/>;
    case 'role_required': return <StateBox icon={<Lock size={18}/>} title={t('state.role.title')} lead={t('state.role.lead')}/>;
    case 'capped': return <CappedState scope={String(d.scope ?? 'global')} retryAfter={typeof d.retry_after === 'string' ? d.retry_after : null}/>;
    case 'ai_disabled': return <StateBox tone="calm" icon={<PowerOff size={18}/>} title={t('state.disabled.title')} lead={t('state.disabled.lead')}/>;
    case 'ai_unavailable': return <StateBox tone="calm" icon={<PowerOff size={18}/>} title={t('state.unavailable.title')} lead={t('state.unavailable.lead')}/>;
    case 'insufficient_credits': return <StateBox tone="calm" icon={<Coins size={18}/>} title={t('state.credits.title')} lead={t('state.credits.lead', { cost: Number(d.cost ?? 0), available: Number(d.available ?? 0) })}>
      <Link to="/credits" className="text-sm font-semibold text-gray-900 underline underline-offset-2">{t('nav.credits')}</Link>
    </StateBox>;
    case 'budget_exhausted': return <StateBox tone="calm" icon={<Coins size={18}/>} title={t('state.budget.title')} lead={t('state.budget.lead', { budget: Number(d.budget ?? 0) })}/>;
    case 'unauthorized': return <StateBox icon={<Lock size={18}/>} title={t('state.signIn.title')} lead={t('state.signIn.lead')}/>;
    // The learner area's one-time step (age, and a guardian's agreement under 18), then back here.
    case 'consent_required': return <ConsentState/>;
    default: {
      const key = `error.${error.code}`, text = t(key);
      return <ErrorState lead={text === key ? t('state.error.lead') : text} onRetry={onRetry}/>;
    }
  }
}

function ConsentState() {
  const t = useT(), { path } = useLocation();
  return <StateBox icon={<ShieldCheck size={18}/>} title={t('state.consent.title')} lead={t('state.consent.lead')}>
    <Link to={`/consent?next=${encodeURIComponent(path)}`} className="inline-flex min-h-11 items-center rounded-full bg-navy px-4 text-sm font-semibold text-white no-underline">{t('state.consent.open')}</Link>
  </StateBox>;
}

/** "This costs N credits" from the ai-core price table, the same number the function charges. */
export function CreditCost({ creditKey, addOns = [], className = '' }: { creditKey: string; addOns?: string[]; className?: string }) {
  const t = useT();
  let credits = 0;
  try { credits = quoteCredits(creditKey, addOns).credits; } catch { return null; }
  return <span className={`inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 ${className}`}><Coins size={14} aria-hidden="true"/>{t('chat.cost', { count: credits })}</span>;
}

/** The credits you can spend here, with your centre budget when there is one. */
export function CreditBalance({ compact = false }: { compact?: boolean }) {
  const t = useT(), { me } = useWorkspace(), { number } = useI18n();
  if (!me) return null;
  const budget = me.credits.budget, available = budget ? Math.min(me.credits.total, budget.left) : me.credits.total;
  if (compact) return <Link to="/credits" className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-navy-line bg-white/80 px-3 text-xs font-semibold text-gray-900 no-underline" aria-label={t('nav.credits')}><Coins size={14} aria-hidden="true"/>{t('header.credits', { count: available })}</Link>;
  return <Card as="div" className="flex flex-col gap-1">
    <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">{t('home.credits.title')}</span>
    <span className="font-display text-3xl font-bold">{number(available)}</span>
    <span className="text-sm text-gray-600">{t('home.credits.left', { count: available })}</span>
  </Card>;
}
