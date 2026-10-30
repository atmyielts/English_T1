import { type ReactNode, useEffect, useState } from 'react';
import { BarChart3, CalendarDays, Home, Settings2 } from 'lucide-react';
import { ApiErrorState, Badge, Card, formatDate, Link, LoadingState, useI18n, useLocation, useT } from '../core/index.ts';
import type { Locale } from '../../../../packages/service-i18n/src/format.ts';
import { levelLabel, type LevelScale } from './api.ts';

// Shared pieces of the coach screens: the coach frame with its tabs, stat tiles,
// a line chart for results over time, bars for skills and before/after rows. Charts
// are plain SVG with a text summary, so they work on weak phones and with screen readers.

/**
 * Loads data for a page; `reload` refetches. It refetches when the language changes,
 * since the function writes titles and explanations in the caller's language. The
 * load starts after this render's effects, once core has set the page language that
 * requests carry.
 */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const { locale } = useI18n();
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    void Promise.resolve().then(() => (live ? load() : null)).then((data) => { if (live && data !== null) setState({ data, error: null, loading: false }); }, (error) => { if (live) setState({ data: null, error, loading: false }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, locale]);
  return { ...state, reload: () => setTick((value) => value + 1) };
}

export function Loaded<T>({ state, children }: { state: { data: T | null; error: unknown; loading: boolean; reload(): void }; children: (data: T) => ReactNode }) {
  if (state.error) return <ApiErrorState error={state.error} onRetry={state.reload}/>;
  if (state.loading || !state.data) return <LoadingState/>;
  return <>{children(state.data)}</>;
}

/** The coach's header and tabs: Dashboard, Report, Plan, Settings. */
export function CoachFrame({ pack, name, accent, children }: { pack: string; name: string; accent?: string; children: ReactNode }) {
  const t = useT(), { path } = useLocation();
  const tabs = [
    { to: `/coach/${pack}`, label: t('coach.tab.dashboard'), icon: Home },
    { to: `/coach/${pack}/report`, label: t('coach.tab.report'), icon: BarChart3 },
    { to: `/coach/${pack}/plan`, label: t('coach.tab.plan'), icon: CalendarDays },
    { to: `/coach/${pack}/settings`, label: t('coach.tab.settings'), icon: Settings2 },
  ];
  return <div className="flex min-w-0 flex-col gap-4">
    <header className="flex min-w-0 items-center gap-3">
      <span aria-hidden="true" className="h-10 w-10 shrink-0 rounded-2xl border border-navy-line" style={{ background: accent && /^#[0-9a-f]{6}$/i.test(accent) ? accent : '#0f172a' }}/>
      <div className="min-w-0">
        <p className="m-0 text-xs font-semibold uppercase tracking-wider text-gray-600">{t('coach.eyebrow')}</p>
        <h1 className="m-0 truncate font-display text-2xl font-bold text-gray-900">{name}</h1>
      </div>
    </header>
    <nav aria-label={t('coach.tabs')} className="-mx-1 flex gap-1 overflow-x-auto px-1">
      {tabs.map((tab) => {
        const current = path === tab.to;
        return <Link key={tab.to} to={tab.to} aria-current={current ? 'page' : undefined}
          className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy ${current ? 'border-navy bg-navy text-white' : 'border-navy-line bg-white/80 text-gray-800'}`}>
          <tab.icon size={15} aria-hidden="true"/>{tab.label}
        </Link>;
      })}
    </nav>
    {children}
  </div>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return <Card as="div" className="flex min-w-0 flex-col gap-1 !p-4">
    <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">{label}</span>
    <span className="font-display text-2xl font-bold text-gray-900">{value}</span>
    {hint && <span className="text-xs text-gray-600">{hint}</span>}
  </Card>;
}

const fmtDate = (iso: string) => { const [, m, d] = iso.slice(0, 10).split('-'); return `${d}.${m}`; };

/** Results over time with the target as a dashed line. */
export function ResultChart({ points, scale, target, label }: { points: { at: string; value: number }[]; scale: LevelScale; target?: number; label: string }) {
  const t = useT();
  if (!points.length) return <p className="m-0 text-sm text-gray-600">{t('coach.chart.empty')}</p>;
  const w = 320, h = 140, pad = 26;
  const values = [...points.map((point) => point.value), ...(target !== undefined ? [target] : [])];
  const min = Math.max(scale.min, Math.floor(Math.min(...values) - scale.step)), max = Math.min(scale.max, Math.ceil(Math.max(...values) + scale.step));
  const x = (i: number) => pad + (points.length === 1 ? (w - 2 * pad) / 2 : (i * (w - 2 * pad)) / (points.length - 1));
  const y = (value: number) => h - pad - ((value - min) / Math.max(0.0001, max - min)) * (h - 2 * pad);
  const line = points.map((point, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ');
  const summary = points.length === 1
    ? t('coach.chart.single', { label, first: levelLabel(scale, points[0].value) })
    : t('coach.chart.summary', { label, first: levelLabel(scale, points[0].value), last: levelLabel(scale, points.at(-1)!.value), count: points.length });
  return <figure className="m-0">
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={summary} className="h-auto w-full">
      <line x1={pad} x2={w - pad} y1={h - pad} y2={h - pad} stroke="#cbd5e1"/>
      {[min, (min + max) / 2, max].map((value) => <text key={value} x={4} y={y(value) + 4} fontSize="10" fill="#475569">{levelLabel(scale, Math.round(value / scale.step) * scale.step)}</text>)}
      {target !== undefined && <line x1={pad} x2={w - pad} y1={y(target)} y2={y(target)} stroke="#0f172a" strokeDasharray="4 4" opacity="0.5"/>}
      <path d={line} fill="none" stroke="#0f172a" strokeWidth="2.5" strokeLinejoin="round"/>
      {points.map((point, i) => <circle key={i} cx={x(i)} cy={y(point.value)} r="3.5" fill="#b6f24a" stroke="#0f172a"/>)}
      <text x={pad} y={h - 8} fontSize="10" fill="#475569">{fmtDate(points[0].at)}</text>
      {points.length > 1 && <text x={w - pad} y={h - 8} fontSize="10" fill="#475569" textAnchor="end">{fmtDate(points.at(-1)!.at)}</text>}
    </svg>
    <figcaption className="text-xs text-gray-600">{summary}</figcaption>
  </figure>;
}

/** Horizontal bars, 0–1. */
export function Bars({ rows }: { rows: { label: string; value: number; text: string }[] }) {
  return <ul className="m-0 flex list-none flex-col gap-2 p-0">
    {rows.map((row) => <li key={row.label} className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-sm"><span className="truncate text-gray-800">{row.label}</span><span className="shrink-0 font-semibold text-gray-900">{row.text}</span></div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-cream-deep" aria-hidden="true"><div className="h-full rounded-full bg-navy" style={{ width: `${Math.max(3, Math.min(100, row.value * 100))}%` }}/></div>
    </li>)}
  </ul>;
}

/** One before → after row of a report. */
export function Change({ label, before, after, verdict }: { label: string; before: string; after: string; verdict: 'better' | 'worse' | 'same' | null }) {
  const t = useT();
  return <li className="flex min-w-0 items-center justify-between gap-3 border-b border-navy-line/15 py-2 last:border-0">
    <span className="min-w-0 text-sm text-gray-800">{label}</span>
    <span className="flex shrink-0 items-center gap-2 text-sm"><span className="text-gray-500">{before}</span><span aria-hidden="true">→</span><b className="text-gray-900">{after}</b>
      {verdict && <Badge tone={verdict === 'better' ? 'lime' : verdict === 'worse' ? 'warn' : 'neutral'}>{t(`coach.verdict.${verdict}`)}</Badge>}
    </span>
  </li>;
}

// Dates through core's formatter, which writes Uzbek out (browsers' Uzbek data is thin: "2026 M10 10").
export const dateText = (iso: string | null | undefined, locale: string) =>
  iso ? formatDate((locale === 'uz' || locale === 'ru' ? locale : 'en') as Locale, iso, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
