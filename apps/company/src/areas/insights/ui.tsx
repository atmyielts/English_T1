// Building blocks for the insights pages: number and date formatting, level
// badges, and charts drawn with CSS or inline SVG. Every chart has a text
// alternative and a data table behind a "Show as table" switch.
import React, { useMemo, type ReactNode } from 'react';
import { INTL } from '../../../../../packages/service-i18n/src/format.ts';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { en, useAppT, type AppKey } from '../../i18n/index.ts';
import type { LevelCode, LevelCounts } from './api.ts';

export const LEVEL_CODES: LevelCode[] = ['pre_a1', 'a1', 'a2', 'b1', 'b2', 'c1', 'c2'];
export const LEVEL_SHORT: Record<LevelCode, string> = { pre_a1: 'Pre-A1', a1: 'A1', a2: 'A2', b1: 'B1', b2: 'B2', c1: 'C1', c2: 'C2' };
const TZ = 'Asia/Tashkent';
const UZ_MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const UZ_MONTHS_SHORT = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'];
const UZ_WEEKDAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];

interface DateNames { day: (date: Date) => string; dayShort: (date: Date) => string; weekday: (date: Date) => string; month: (date: Date) => string; monthLong: (date: Date) => string }
function intlNames(intl: string): DateNames {
  const day = new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
  const dayShort = new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'short', timeZone: TZ });
  const weekday = new Intl.DateTimeFormat(intl, { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ });
  const month = new Intl.DateTimeFormat(intl, { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const monthLong = new Intl.DateTimeFormat(intl, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { day: (date) => day.format(date), dayShort: (date) => dayShort.format(date), weekday: (date) => weekday.format(date), month: (date) => month.format(date), monthLong: (date) => monthLong.format(date) };
}
/** Browsers often lack Uzbek (Latin) calendar names, so Uzbek dates are spelled here ("30-oktabr, 2026"). */
function uzbekNames(): DateNames {
  const local = (date: Date) => { const at = new Date(date.getTime() + 5 * 3_600_000); return { y: at.getUTCFullYear(), m: at.getUTCMonth(), d: at.getUTCDate(), w: (at.getUTCDay() + 6) % 7 }; };
  const dayShort = (date: Date) => { const p = local(date); return `${p.d}-${UZ_MONTHS_SHORT[p.m]}`; };
  return {
    day: (date) => { const p = local(date); return `${p.d}-${UZ_MONTHS[p.m]}, ${p.y}`; },
    dayShort,
    weekday: (date) => `${UZ_WEEKDAYS[local(date).w]}, ${dayShort(date)}`,
    month: (date) => `${UZ_MONTHS_SHORT[date.getUTCMonth()]} ${date.getUTCFullYear()}`,
    monthLong: (date) => `${UZ_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`,
  };
}

/** Locale-aware formatters; dates and times are shown in Tashkent time. */
export function useFormat() {
  const { locale } = useI18n();
  const t = useAppT();
  return useMemo(() => {
    const intl = INTL[locale];
    const number = new Intl.NumberFormat(intl, { maximumFractionDigits: 1 });
    const time = new Intl.DateTimeFormat(intl, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
    const asDate = (value: string) => value.length === 10 ? new Date(`${value}T12:00:00+05:00`) : new Date(value);
    const monthDate = (value: string) => new Date(`${value.slice(0, 7)}-01T00:00:00Z`);
    const names = locale === 'uz' ? uzbekNames() : intlNames(intl);
    return {
      num: (value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value) ? '—' : number.format(value),
      pct: (part: number, whole: number) => whole > 0 ? `${Math.round(part / whole * 100)}%` : '—',
      date: (value: string | null | undefined) => value ? names.day(asDate(value)) : '—',
      dateShort: (value: string | null | undefined) => value ? names.dayShort(asDate(value)) : '—',
      weekday: (value: string) => names.weekday(asDate(value)),
      time: (value: string) => time.format(new Date(value)),
      month: (value: string) => names.month(monthDate(value)),
      monthLong: (value: string) => names.monthLong(monthDate(value)),
      minutes: (value: number) => {
        const total = Math.round(value);
        if (total < 60) return t('common.minutes', { count: total });
        const hours = Math.floor(total / 60), rest = total % 60;
        return rest ? t('insights.hoursMinutes', { hours, minutes: rest }) : t('insights.hours', { hours });
      },
      /** Short form for chart labels: "45 min", "10.5 h". */
      minutesShort: (value: number) => {
        const total = Math.round(value);
        if (total < 60) return t('common.minutes', { count: total });
        return t('insights.hours', { hours: total >= 600 ? Math.round(total / 60) : Math.round(total / 6) / 10 });
      },
    };
  }, [locale, t]);
}
export type Format = ReturnType<typeof useFormat>;

/** A translation when the key exists, else the fallback (track codes, activity kinds). */
export function useMaybeT() {
  const t = useAppT();
  return (key: string, fallback: string) => key in en ? t(key as AppKey) : fallback;
}

export function LevelBadge({ level, score, plain }: { level: LevelCode | null | undefined; score?: number | null; plain?: boolean }) {
  const t = useAppT(), f = useFormat();
  if (!level) return <span className="insights-level insights-level-none">{t('level.none')}</span>;
  return <span className={`insights-level insights-level-${level}`} title={t(`level.${level}` as AppKey)}>
    {plain ? t(`level.${level}` as AppKey) : LEVEL_SHORT[level]}{score !== undefined && score !== null ? <small> · {f.num(score)}</small> : null}
  </span>;
}

export function Kpi({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: 'good' | 'warn' }) {
  return <div className={`company-stat insights-kpi${tone ? ` insights-kpi-${tone}` : ''}`}>
    <span>{label}</span>
    <strong>{value}</strong>
    {note ? <small>{note}</small> : null}
  </div>;
}

export function Panel({ title, children, actions, className, id }: { title: ReactNode; children: ReactNode; actions?: ReactNode; className?: string; id?: string }) {
  const headingId = id ? `${id}-title` : undefined;
  return <section className={`insights-panel${className ? ` ${className}` : ''}`} aria-labelledby={headingId}>
    <div className="insights-panel-head">
      <h2 id={headingId}>{title}</h2>
      {actions ? <div className="insights-panel-actions">{actions}</div> : null}
    </div>
    {children}
  </section>;
}

/** The data behind a chart, folded away by default. */
export function DataTable({ caption, head, rows }: { caption: string; head: ReactNode[]; rows: ReactNode[][] }) {
  const t = useAppT();
  return <details className="insights-data no-print">
    <summary>{t('insights.chart.showTable')}</summary>
    <div className="company-table-wrap">
      <table className="company-table">
        <caption className="visually-hidden">{caption}</caption>
        <thead><tr>{head.map((cell, index) => <th key={index} scope="col">{cell}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, column) => column === 0 ? <th key={column} scope="row">{cell}</th> : <td key={column}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  </details>;
}

/** Horizontal bars, one per row, with the value written next to each. */
export function BarList({ rows, max, label, format, highlight }: { rows: { key: string; label: ReactNode; value: number; note?: ReactNode; className?: string }[]; max?: number; label: string; format?: (value: number) => string; highlight?: string }) {
  const top = max ?? Math.max(1, ...rows.map((row) => row.value));
  return <ul className="insights-bars" aria-label={label}>
    {rows.map((row) => <li key={row.key} className={row.key === highlight ? 'insights-bars-me' : undefined}>
      <span className="insights-bars-label">{row.label}</span>
      <span className="insights-bars-track" aria-hidden="true"><span className={`insights-bars-fill ${row.className ?? ''}`} style={{ width: `${Math.max(row.value > 0 ? 2 : 0, Math.min(100, row.value / top * 100))}%` }}/></span>
      <span className="insights-bars-value">{format ? format(row.value) : row.value}{row.note ? <small> {row.note}</small> : null}</span>
    </li>)}
  </ul>;
}

/** Level distribution as bars, highest level first. */
export function LevelDistribution({ counts, label }: { counts: LevelCounts; label: string }) {
  const t = useAppT(), f = useFormat();
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const rows: { key: LevelCode | 'none'; label: ReactNode; value: number; note: string; className: string }[] = [...LEVEL_CODES].reverse().filter((level) => counts[level] > 0 || ['a1', 'a2', 'b1', 'b2', 'c1'].includes(level))
    .map((level) => ({ key: level, label: <LevelBadge level={level}/>, value: counts[level], note: f.pct(counts[level], total), className: `insights-fill-${level}` }));
  if (counts.none) rows.push({ key: 'none', label: <LevelBadge level={null}/>, value: counts.none, note: f.pct(counts.none, total), className: 'insights-fill-none' });
  if (!total) return <p className="insights-empty">{t('insights.empty.levels')}</p>;
  return <figure className="insights-figure">
    <BarList rows={rows} max={Math.max(...rows.map((row) => row.value))} label={label}/>
    <DataTable caption={label} head={[t('insights.col.level'), t('insights.col.people'), t('insights.col.share')]} rows={rows.map((row) => [row.key === 'none' ? t('level.none') : t(`level.${row.key}` as AppKey), row.value, f.pct(row.value, total)])}/>
  </figure>;
}

/** One 100% stacked bar of level shares. */
export function LevelStrip({ counts, label }: { counts: LevelCounts; label: string }) {
  const t = useAppT(), f = useFormat();
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const parts = [...LEVEL_CODES.map((level) => ({ key: level as LevelCode | 'none', value: counts[level] })), { key: 'none' as const, value: counts.none }].filter((part) => part.value > 0);
  const text = parts.map((part) => `${part.key === 'none' ? t('level.none') : LEVEL_SHORT[part.key]}: ${part.value}`).join(', ');
  return <div className="insights-strip" role="img" aria-label={`${label}: ${text || t('insights.empty.levels')}`}>
    {parts.map((part) => <span key={part.key} className={`insights-fill-${part.key}`} style={{ flexGrow: part.value }} title={`${part.key === 'none' ? t('level.none') : LEVEL_SHORT[part.key]} · ${part.value} (${f.pct(part.value, total)})`}>
      {part.value / Math.max(1, total) >= 0.1 ? (part.key === 'none' ? '—' : LEVEL_SHORT[part.key]) : ''}
    </span>)}
  </div>;
}

export function LevelLegend() {
  const t = useAppT();
  return <ul className="insights-legend" aria-label={t('insights.chart.legend')}>
    {LEVEL_CODES.map((level) => <li key={level}><span className={`insights-swatch insights-fill-${level}`} aria-hidden="true"/>{LEVEL_SHORT[level]}</li>)}
    <li><span className="insights-swatch insights-fill-none" aria-hidden="true"/>{t('level.none')}</li>
  </ul>;
}

/** Vertical columns in inline SVG, with labels under each column. */
export function Columns({ points, label, format, short, valueLabel }: { points: { key: string; label: string; value: number; title?: string }[]; label: string; format: (value: number) => string; short?: (value: number) => string; valueLabel: string }) {
  const t = useAppT();
  const max = Math.max(1, ...points.map((point) => point.value));
  const width = 100 / Math.max(1, points.length);
  const summary = points.map((point) => `${point.title ?? point.label}: ${format(point.value)}`).join('; ');
  return <figure className="insights-figure">
    <div className={`insights-columns${points.length > 8 ? ' insights-columns-many' : ''}`} role="img" aria-label={`${label}. ${summary}`}>
      <svg viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <line x1="0" y1="59.5" x2="100" y2="59.5" className="insights-axis"/>
        <line x1="0" y1="30" x2="100" y2="30" className="insights-grid"/>
        {points.map((point, index) => {
          const height = point.value / max * 54;
          return <rect key={point.key} x={index * width + width * 0.18} width={width * 0.64} y={59.5 - height} height={height} rx="1" className={index === points.length - 1 ? 'insights-col insights-col-now' : 'insights-col'}>
            <title>{`${point.title ?? point.label}: ${format(point.value)}`}</title>
          </rect>;
        })}
      </svg>
      <div className="insights-columns-values" aria-hidden="true">{points.map((point) => <span key={point.key}>{point.value ? (short ?? format)(point.value) : ''}</span>)}</div>
      <div className="insights-columns-labels" aria-hidden="true">{points.map((point) => <span key={point.key}>{point.label}</span>)}</div>
    </div>
    <DataTable caption={label} head={[t('insights.col.period'), valueLabel]} rows={points.map((point) => [point.title ?? point.label, format(point.value)])}/>
  </figure>;
}

/** Per-skill 0–100 bars with the level each score maps to. */
export function SkillBars({ skills, label }: { skills: { skill: string; score: number | null; level: LevelCode | null }[]; label: string }) {
  const t = useAppT();
  if (!skills.length) return null;
  return <ul className="insights-skills" aria-label={label}>
    {skills.map((entry) => <li key={entry.skill}>
      <span className="insights-skills-name">{t(`skill.${entry.skill}` as AppKey)}</span>
      <span className="insights-skills-track" aria-hidden="true">
        <span className={`insights-skills-fill insights-fill-${entry.level ?? 'none'}`} style={{ width: `${entry.score ?? 0}%` }}/>
        {[16, 32, 48, 65, 80].map((floor) => <i key={floor} style={{ left: `${floor}%` }}/>)}
      </span>
      <span className="insights-skills-value">{entry.score ?? '—'}<span className="visually-hidden">/100</span> <LevelBadge level={entry.level}/></span>
    </li>)}
  </ul>;
}

/** A progress meter (seats, tests). */
export function Meter({ used, limit, label }: { used: number; limit: number | null; label: string }) {
  const t = useAppT(), f = useFormat();
  const share = limit ? Math.min(100, used / limit * 100) : 0;
  return <div className="insights-meter">
    <div className="insights-meter-head"><span>{label}</span><strong>{limit === null ? t('insights.usage.unlimited', { used }) : t('common.of', { done: f.num(used), total: f.num(limit) })}</strong></div>
    {limit !== null && <span className="insights-meter-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used}><span className={share >= 90 ? 'insights-meter-full' : ''} style={{ width: `${share}%` }}/></span>}
  </div>;
}

export function Loading() {
  const t = useAppT();
  return <p role="status" className="insights-loading">{t('app.loading')}</p>;
}
export function Problem({ message, retry }: { message: string; retry?: () => void }) {
  const t = useAppT();
  return <div className="error" role="alert"><p>{message}</p>{retry && <button className="quiet" onClick={retry}>{t('insights.retry')}</button>}</div>;
}

/** Saves text as a file (CSV, calendar). */
export function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Today in Tashkent as YYYY-MM-DD. */
export const tashkentToday = () => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
export const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
