import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, HeartHandshake, RefreshCw } from 'lucide-react';
import { ApiError, ApiErrorState, Button, LoadingState, PageHeader } from '../core/index.ts';
import { useT } from './i18n/lazy.ts';

// Small building blocks shared by the engage screens, in the platform look.

/** Refusals engage names itself (engage.error.<code>), then core's states for the rest. */
export function EngageError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT();
  if (error instanceof ApiError) {
    const key = `engage.error.${error.code}`, text = t(key);
    if (text !== key) {
      return <div role="alert" className="flex flex-col items-start gap-3 rounded-3xl border border-navy-line bg-amber-50 p-5">
        <p className="m-0 inline-flex items-start gap-2 text-sm leading-6 text-gray-900"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true"/>{text}</p>
        {onRetry && <Button variant="secondary" size="sm" onClick={onRetry} icon={<RefreshCw size={14} aria-hidden="true"/>}>{t('state.retry')}</Button>}
      </div>;
    }
  }
  return <ApiErrorState error={error} onRetry={onRetry}/>;
}

/** Loading, refusal, or the view. */
export function Loaded<T>({ data, error, loading, reload, children }: { data: T | null; error: unknown; loading: boolean; reload: () => void; children: (data: T) => ReactNode }) {
  if (error && !data) return <EngageError error={error} onRetry={reload}/>;
  if (!data) return loading ? <LoadingState/> : null;
  return <>{children(data)}</>;
}

export function Page({ eyebrow, title, lead, actions, children }: { eyebrow?: ReactNode; title: ReactNode; lead?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
    <PageHeader eyebrow={eyebrow} title={title} lead={lead} actions={actions}/>
    {children}
  </div>;
}

export function Meter({ value, max, label, tone = 'lime' }: { value: number; max: number; label: string; tone?: 'lime' | 'sky' | 'navy' }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const colours = { lime: 'bg-lime', sky: 'bg-sky-ai', navy: 'bg-navy' };
  return <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)} className="h-2.5 w-full overflow-hidden rounded-full border border-navy-line/30 bg-white">
    <div className={`h-full rounded-full ${colours[tone]}`} style={{ width: `${Math.round(ratio * 100)}%` }}/>
  </div>;
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-navy-line/30 bg-cream-soft p-3">
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-600">{icon}{label}</span>
    <span className="font-display text-2xl font-bold text-gray-900">{value}</span>
    {hint && <span className="text-xs text-gray-600">{hint}</span>}
  </div>;
}

export function Notice({ tone = 'calm', icon, children }: { tone?: 'calm' | 'lime' | 'warn'; icon?: ReactNode; children: ReactNode }) {
  const tones = { calm: 'bg-cream-soft', lime: 'bg-lime-soft/60', warn: 'bg-amber-50' };
  return <div role="status" className={`flex items-start gap-3 rounded-2xl border border-navy-line/40 p-4 text-sm leading-6 text-gray-900 ${tones[tone]}`}>{icon}<div className="min-w-0">{children}</div></div>;
}

const SESSION_KEY = 'schood-ai.engage.session-start';
const LONG_SESSION_MS = 45 * 60_000;
/** True after 45 minutes in this browser tab without a break of 30 minutes. Stored per tab only. */
export function useLongSession(): boolean {
  const [long, setLong] = useState(false);
  useEffect(() => {
    const read = () => {
      try {
        const now = Date.now(), raw = sessionStorage.getItem(SESSION_KEY);
        const [start, seen] = raw ? raw.split(':').map(Number) : [now, now];
        const fresh = !raw || now - seen > 30 * 60_000;
        const begun = fresh ? now : start;
        sessionStorage.setItem(SESSION_KEY, `${begun}:${now}`);
        setLong(now - begun >= LONG_SESSION_MS);
      } catch { /* private mode: no nudge, nothing breaks */ }
    };
    read();
    const timer = setInterval(read, 60_000);
    return () => clearInterval(timer);
  }, []);
  return long;
}

/** "You've done enough today": after a long session or a full day of verified learning. */
export function EnoughToday({ enough }: { enough: boolean }) {
  const t = useT(), long = useLongSession();
  if (!enough && !long) return null;
  return <Notice tone="lime" icon={<HeartHandshake size={20} className="mt-0.5 shrink-0" aria-hidden="true"/>}>
    <p className="m-0 font-semibold">{t('engage.enough.title')}</p>
    <p className="m-0">{t(long && !enough ? 'engage.enough.session' : 'engage.enough.day')}</p>
  </Notice>;
}

export const TIER_STYLE: Record<string, string> = {
  bronze: 'bg-[#e9c39b] text-gray-950', silver: 'bg-[#dfe3e8] text-gray-950', gold: 'bg-[#f5d76e] text-gray-950', sapphire: 'bg-[#9ec5ff] text-gray-950', diamond: 'bg-sky-ai text-gray-950',
};
export function TierBadge({ tier }: { tier: string }) {
  const t = useT();
  return <span className={`inline-flex items-center rounded-full border border-navy-line/40 px-2.5 py-0.5 text-xs font-bold ${TIER_STYLE[tier] ?? 'bg-white'}`}>{t(`engage.tier.${tier}`)}</span>;
}

export const chip = (active: boolean) => `inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy ${active ? 'border-navy bg-navy text-white' : 'border-navy-line/40 bg-white text-gray-900 hover:bg-cream-soft'}`;
export const selectClass = 'w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy';
