import { useCallback, useRef, useState } from 'react';
import { useEnglish } from '../app/EnglishContext';
import { ApiError } from '../lib/api';
import { CEFR_LEVELS, SKILLS, type CefrLevel } from '../lib/skills';
import { Segmented } from '../ui/kit';

// Shared pieces for the AI practice tools that live in the skill "AI tools"
// drawers and on the Tutor page. Learner-facing strings stay in COPY objects
// so the translation pass can lift them out in one go.

export const SHARED_COPY = {
  offline: 'You seem to be offline. Check your connection and try again.',
  limit: "You've used today's AI practice. It resets tomorrow.",
  plan: 'This tool is part of an English plan.',
  unavailable: "This tool isn't available right now. Please try again later.",
  level: 'Level',
  working: 'Working…',
};

/** Maps any failure to one short, friendly sentence. Never shows server text. */
export const friendlyError = (error: unknown): string => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return SHARED_COPY.offline;
  if (error instanceof ApiError) {
    if (error.status === 0) return SHARED_COPY.offline;
    if (error.status === 429 || error.code === 'english_ai_daily_limit_reached') return SHARED_COPY.limit;
    if (error.status === 403) return SHARED_COPY.plan;
  }
  return SHARED_COPY.unavailable;
};

/**
 * Runs one request at a time for a tool card. `run` resolves to the result,
 * or null when it failed (the friendly message is in `error`). A newer run
 * makes older answers stale so a slow reply never overwrites a newer one.
 */
export const useToolRequest = <T,>() => {
  const [data, setData] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const run = useCallback(async (request: () => Promise<T>): Promise<T | null> => {
    const id = ++seq.current;
    setBusy(true);
    setError(null);
    try {
      const result = await request();
      if (id !== seq.current) return null;
      setData(result);
      return result;
    } catch (cause) {
      if (id === seq.current) setError(friendlyError(cause));
      return null;
    } finally {
      if (id === seq.current) setBusy(false);
    }
  }, []);

  const reset = useCallback(() => {
    seq.current += 1;
    setData(null);
    setError(null);
    setBusy(false);
  }, []);

  return { data, busy, error, run, reset, setError };
};

/** The learner's placement level, or B1 until it is known. */
export const useLearnerLevel = (): CefrLevel => {
  const { onboarding } = useEnglish();
  return onboarding.value?.level ?? 'B1';
};

export const LevelPicker = ({ value, onChange, label = SHARED_COPY.level }: { value: CefrLevel; onChange: (level: CefrLevel) => void; label?: string }) => (
  <div className="en-row">
    <span className="hint" aria-hidden="true">{label}</span>
    <Segmented label={label} value={value} onChange={onChange} options={CEFR_LEVELS.map((level) => ({ value: level, label: level }))} />
  </div>
);

/** Inline error line for a tool. */
export const ToolError = ({ message }: { message: string | null }) =>
  message ? <p className="error" role="alert">{message}</p> : null;

/** In-app link target for a skill name returned by the server. */
export const skillHref = (skill: string): string | null => SKILLS.find((s) => s.key === skill)?.path ?? null;

export const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;
