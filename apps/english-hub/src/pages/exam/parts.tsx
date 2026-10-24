import { useEffect, useRef, useState } from 'react';
import { formatClock } from '../../components/SpeakOrType';
import { useT } from '../../i18n';
import type { ExamLevel } from '../../lib/exam';
import './exam.css';

type T = ReturnType<typeof useT>;

export const levelText = (level: ExamLevel | null | undefined, t: T): string =>
  level ? t(`exam.level.${level}`) : t('exam.level.unknown');

/**
 * Seconds left until `startedAt + seconds` (server time of the section start).
 * Calls `onExpire` once when it reaches zero.
 */
export const useCountdown = (startedAt: string, seconds: number, onExpire: () => void): number => {
  const deadline = Date.parse(startedAt) + seconds * 1000;
  const compute = () => Math.max(0, Math.round((deadline - Date.now()) / 1000));
  const [left, setLeft] = useState(compute);
  const fired = useRef(false);
  const expire = useRef(onExpire);
  expire.current = onExpire;

  useEffect(() => {
    const tick = () => {
      const now = compute();
      setLeft(now);
      if (now <= 0 && !fired.current) {
        fired.current = true;
        expire.current();
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
    // The deadline is fixed for the section.
  }, [deadline]);

  return left;
};

/** Sticky time-left bar with the hand-in button. */
export const TimerBar = ({ left, label, onSubmit, busy, submitLabel }: { left: number; label: string; onSubmit: () => void; busy: boolean; submitLabel: string }) => {
  const t = useT();
  return (
    <div className={`en-exam-timer ${left <= 120 ? 'is-low' : ''}`.trim()} role="timer" aria-live="off">
      <span>{label} · {t('exam.timer.left')} <strong>{formatClock(left)}</strong></span>
      <button type="button" disabled={busy} onClick={onSubmit}>{busy ? t('exam.submitting') : submitLabel}</button>
    </div>
  );
};

/** Paragraphs of a passage (blank lines separate them). */
export const Passage = ({ text }: { text: string }) => (
  <div className="en-passage" lang="en">
    {text.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
  </div>
);
