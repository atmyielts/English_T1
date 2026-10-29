// Training area: API shapes, a small data-loading hook and the pieces every
// training page shares (listen button, progress bar, level badge, local drafts).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LEVEL_LABEL, isLevel } from '../../../../../packages/company-core/src/mod.ts';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { api } from '../../api.ts';
import { useAppT, useErrorText, type AppKey } from '../../i18n/index.ts';
import { canSpeak, speak, stopSpeaking } from './speech.ts';

export interface Localized { en: string; ru: string; uz: string }
export type Locale = 'en' | 'ru' | 'uz';
export type AiStatus = 'ok' | 'ai_limit' | 'ai_unavailable' | 'no_turns';

/** The learner's language version of a content string (English when missing). */
export function useLocalized() {
  const { locale } = useI18n();
  return useCallback((value: Localized | null | undefined) => value ? value[locale as Locale] || value.en : '', [locale]);
}

/** Loads data for a page; `reload` fetches again, `set` replaces it after a change. */
export function useLoad<T>(path: string | null) {
  const problem = useErrorText();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [cause, setCause] = useState<unknown>(null);
  const reload = useCallback(async () => {
    if (!path) return;
    try {
      setData(await api<T>(path));
      setError('');
      setCause(null);
    } catch (failure) {
      setError(problem(failure));
      setCause(failure);
    }
  }, [path]);
  useEffect(() => { setData(null); void reload(); }, [reload]);
  return { data, error, cause, reload, set: setData };
}

/** Error and loading states shared by every page. */
export function Loading({ error }: { error: string }) {
  const t = useAppT();
  return error ? <p className="error" role="alert">{error}</p> : <p role="status">{t('app.loading')}</p>;
}

export function LevelBadge({ level }: { level: string | null | undefined }) {
  const t = useAppT();
  return <span className="company-badge">{level && isLevel(level) ? LEVEL_LABEL[level] : t('level.none')}</span>;
}

export function Progress({ value, total, label }: { value: number; total: number; label: string }) {
  const percent = total > 0 ? Math.round(Math.min(1, value / total) * 100) : 0;
  return <div className="training-progress">
    <div className="training-progress-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={value} aria-valuetext={`${percent}%`}>
      <span style={{ width: `${percent}%` }}/>
    </div>
  </div>;
}

/** Plays English text with the browser's voice; hidden when speech is unavailable. */
export function ListenButton({ text, voice, rate, label }: { text: string; voice?: number; rate?: number; label?: string }) {
  const t = useAppT();
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => { if (playing) stopSpeaking(); }, [playing]);
  if (!canSpeak()) return null;
  return <button type="button" className="quiet training-listen" aria-label={label ?? t('training.listen.aria', { text: text.slice(0, 60) })} aria-pressed={playing}
    onClick={() => {
      if (playing) { stopSpeaking(); setPlaying(false); return; }
      setPlaying(true);
      void speak(text, { voice, rate }).finally(() => setPlaying(false));
    }}>
    <span aria-hidden="true">{playing ? '■' : '▶'}</span> {playing ? t('training.listen.stop') : t('training.listen.play')}
  </button>;
}

/** Normal or slow speech, remembered in this browser. */
export function useRate(): [number, (rate: number) => void] {
  const [rate, setRate] = useState(() => readLocal('training.rate', 1));
  return [rate, (next: number) => { setRate(next); writeLocal('training.rate', next); }];
}
export function RateToggle({ rate, onChange }: { rate: number; onChange: (rate: number) => void }) {
  const t = useAppT();
  if (!canSpeak()) return null;
  return <label className="check training-rate">
    <input type="checkbox" checked={rate < 1} onChange={(event) => onChange(event.target.checked ? 0.75 : 1)}/>
    {t('training.listen.slow')}
  </label>;
}

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`company.${key}`);
    return raw === null ? fallback : JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
export function writeLocal(key: string, value: unknown) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(`company.${key}`);
    else localStorage.setItem(`company.${key}`, JSON.stringify(value));
  } catch { /* private mode: the draft stays only on this page */ }
}

/** Message for an AI step that did not happen; the learner's text always stays. */
export function aiMessage(status: AiStatus): AppKey | null {
  if (status === 'ai_limit') return 'training.ai.limit';
  if (status === 'ai_unavailable') return 'training.ai.unavailable';
  return null;
}

/** Counts whole minutes from when the page opened (for lesson and practice activity). */
export function useMinutes() {
  const started = useRef(Date.now());
  return {
    take: () => {
      const minutes = Math.max(1, Math.round((Date.now() - started.current) / 60_000));
      started.current = Date.now();
      return minutes;
    },
  };
}

export const DIFFICULTY_CLASS: Record<string, string> = { easy: 'good', medium: 'warn', hard: 'bad' };

/** Formats a date (YYYY-MM-DD or ISO) in the interface language. */
export function useDate() {
  const { date } = useI18n();
  return (value: string | null | undefined) => value ? date(value.length === 10 ? `${value}T12:00:00` : value, { dateStyle: 'medium' }) : '';
}
