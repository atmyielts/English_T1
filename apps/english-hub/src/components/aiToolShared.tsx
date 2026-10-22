import { useCallback, useRef, useState } from 'react';
import { useEnglish } from '../app/EnglishContext';
import { useT } from '../i18n';
import { ApiError } from '../lib/api';
import { CEFR_LEVELS, SKILLS, type CefrLevel } from '../lib/skills';
import { Segmented } from '../ui/kit';

// Shared pieces for the AI practice tools that live in the skill "AI tools"
// drawers and on the Tutor page. Learner-facing strings live in i18n/ai.*.ts
// under `ai.<card>.<name>` keys.

/** The translator returned by `useT()`. */
export type Translate = ReturnType<typeof useT>;

/** i18n key for one short, friendly sentence about any failure. Never shows server text. */
export const friendlyErrorKey = (error: unknown): string => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'ai.shared.offline';
  if (error instanceof ApiError) {
    if (error.status === 0) return 'ai.shared.offline';
    if (error.status === 429 || error.code === 'english_ai_daily_limit_reached') return 'ai.shared.limit';
    if (error.status === 403) return 'ai.shared.plan';
  }
  return 'ai.shared.unavailable';
};

/** Maps any failure to one short, friendly sentence in the learner's language. */
export const friendlyError = (error: unknown, t: Translate): string => t(friendlyErrorKey(error));

/** Label for a value the server sends (a register, a type, a role), or '' when there is none. */
export const optionalLabel = (t: Translate, key: string): string => {
  const label = t(key);
  return label === key ? '' : label;
};

/**
 * Runs one request at a time for a tool card. `run` resolves to the result,
 * or null when it failed (the friendly message is in `error`). A newer run
 * makes older answers stale so a slow reply never overwrites a newer one.
 */
export const useToolRequest = <T,>() => {
  const t = useT();
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
      if (id === seq.current) setError(friendlyError(cause, t));
      return null;
    } finally {
      if (id === seq.current) setBusy(false);
    }
  }, [t]);

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

export const LevelPicker = ({ value, onChange, label }: { value: CefrLevel; onChange: (level: CefrLevel) => void; label?: string }) => {
  const t = useT();
  const text = label ?? t('ai.shared.level');
  return (
    <div className="en-row">
      <span className="hint" aria-hidden="true">{text}</span>
      <Segmented label={text} value={value} onChange={onChange} options={CEFR_LEVELS.map((level) => ({ value: level, label: level }))} />
    </div>
  );
};

/** Inline error line for a tool. */
export const ToolError = ({ message }: { message: string | null }) =>
  message ? <p className="error" role="alert">{message}</p> : null;

/** In-app link target for a skill name returned by the server. */
export const skillHref = (skill: string): string | null => SKILLS.find((s) => s.key === skill)?.path ?? null;

export const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;
