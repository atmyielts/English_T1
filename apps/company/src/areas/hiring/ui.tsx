// Small pieces every hiring page shares: data loading, error text, levels, skill
// bars, flags, badges, copy and download.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LEVEL_FLOORS, type Level, type Skill } from '../../../../../packages/company-core/src/mod.ts';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { en, useAppT, useErrorText, type AppKey, type AppTranslate } from '../../i18n/index.ts';
import type { AttemptStatus, Decision, Flag } from './types.ts';

/** API errors as sentences: hiring.error.<code> first, then the shared error text. */
export function useHiringError() {
  const t = useAppT(), shared = useErrorText();
  return useCallback((cause: unknown): string => {
    const code = (cause as { code?: string })?.code;
    const key = `hiring.error.${code}` as AppKey;
    return code && key in en ? t(key) : shared(cause);
  }, [t, shared]);
}

/** Loads data once per `deps` change; `reload` fetches again without clearing the page. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const problem = useHiringError();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const latest = useRef(0);
  const reload = useCallback(async () => {
    const ticket = ++latest.current;
    try {
      const value = await load();
      if (ticket === latest.current) { setData(value); setError(''); }
    } catch (cause) {
      if (ticket === latest.current) setError(problem(cause));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { setData(null); void reload(); }, [reload]);
  return { data, setData, error, reload };
}

export const levelText = (t: AppTranslate, level: Level | string | null | undefined) => level ? t(`level.${level}` as AppKey) : t('level.none');
export const shortLevel = (level: Level | string | null | undefined) => level ? level === 'pre_a1' ? 'Pre-A1' : level.toUpperCase() : '—';
export const skillText = (t: AppTranslate, skill: Skill | string) => t(`skill.${skill}` as AppKey);

export function useFormat() {
  const { date, number, locale } = useI18n();
  return {
    locale,
    date: (value: string | null | undefined) => value ? date(value, { dateStyle: 'medium' }) : '—',
    dateTime: (value: string | null | undefined) => value ? date(value, { dateStyle: 'medium', timeStyle: 'short' }) : '—',
    score: (value: number | null | undefined) => value === null || value === undefined ? '—' : number(value, { maximumFractionDigits: 0 }),
  };
}

const LEVEL_TONE: Record<string, string> = { pre_a1: 'l0', a1: 'l1', a2: 'l2', b1: 'l3', b2: 'l4', c1: 'l5', c2: 'l6' };

export function LevelBadge({ level, short = false }: { level: Level | string | null | undefined; short?: boolean }) {
  const t = useAppT();
  return <span className={`hiring-level ${level ? LEVEL_TONE[level] ?? '' : 'none'}`} title={levelText(t, level)}>{short ? shortLevel(level) : levelText(t, level)}</span>;
}

/** Horizontal bars per skill on the 0–100 scale, with ticks at the CEFR floors. */
export function SkillBars({ skills, results, compact = false }: { skills: Skill[]; results: Partial<Record<Skill, { score: number | null; level: Level | null; source?: string } | null>>; compact?: boolean }) {
  const t = useAppT(), format = useFormat();
  return <ul className={`hiring-bars${compact ? ' compact' : ''}`}>
    {skills.map((skill) => {
      const result = results[skill];
      const score = result?.score ?? null;
      return <li key={skill}>
        <span className="hiring-bars-label">{skillText(t, skill)}</span>
        <span className="hiring-bars-track" role="img" aria-label={`${skillText(t, skill)}: ${score === null ? t('hiring.report.noScore') : `${format.score(score)} / 100, ${levelText(t, result?.level)}`}`}>
          {LEVEL_FLOORS.filter(([, floor]) => floor > 0).map(([level, floor]) => <i key={level} style={{ left: `${floor}%` }}/>)}
          {score !== null && <b className={LEVEL_TONE[result?.level ?? ''] ?? ''} style={{ width: `${Math.max(2, Math.min(100, score))}%` }}/>}
        </span>
        <span className="hiring-bars-value">{score === null ? t('hiring.report.noScore') : <><strong>{shortLevel(result?.level)}</strong> {format.score(score)}</>}</span>
      </li>;
    })}
  </ul>;
}

export function StatusBadge({ status }: { status: AttemptStatus }) {
  const t = useAppT();
  const tone = status === 'graded' ? 'good' : status === 'submitted' ? 'warn' : status === 'expired' ? 'bad' : '';
  return <span className={`company-badge ${tone}`}>{t(`hiring.status.${status}` as AppKey)}</span>;
}

export function DecisionBadge({ decision }: { decision: Decision | null }) {
  const t = useAppT();
  if (!decision) return <span className="hiring-muted">{t('hiring.decision.none')}</span>;
  return <span className={`company-badge ${decision === 'shortlist' ? 'good' : decision === 'hold' ? 'warn' : 'bad'}`}>{t(`hiring.decision.${decision}` as AppKey)}</span>;
}

export function MeetsBadge({ meets }: { meets: boolean | null }) {
  const t = useAppT();
  if (meets === null) return null;
  return <span className={`company-badge ${meets ? 'good' : 'bad'}`}>{t(meets ? 'hiring.meets.yes' : 'hiring.meets.no')}</span>;
}

export function flagText(t: AppTranslate, flag: Flag): string {
  const value = flag.code === 'rushed' && typeof flag.value === 'string' ? skillText(t, flag.value) : flag.value ?? '';
  return t(`hiring.flag.${flag.code}` as AppKey, { value: value as string | number, count: typeof flag.value === 'number' ? flag.value : 0 });
}

export function FlagList({ flags, empty = true }: { flags: Flag[]; empty?: boolean }) {
  const t = useAppT();
  if (!flags.length) return empty ? <span className="hiring-muted">{t('hiring.flags.none')}</span> : null;
  return <ul className="hiring-flags">
    {flags.map((flag) => <li key={flag.code} className={flag.severity}>{flagText(t, flag)}</li>)}
  </ul>;
}

export function downloadText(filename: string, content: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A copy button that says "Copied." for a moment. */
export function CopyButton({ text, label }: { text: string; label?: string }) {
  const t = useAppT();
  const [done, setDone] = useState(false);
  return <button type="button" className="quiet" onClick={() => {
    void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 2000); }).catch(() => undefined);
  }}>{done ? t('common.copied') : label ?? t('common.copy')}</button>;
}

/** mm:ss for a number of seconds. */
export const clock = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600), minutes = Math.floor((safe % 3600) / 60), rest = safe % 60;
  return `${hours ? `${hours}:${String(minutes).padStart(2, '0')}` : minutes}:${String(rest).padStart(2, '0')}`;
};
