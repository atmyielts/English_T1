import type { ReactNode } from 'react';
import type { SkillKey } from '../lib/skills';

/**
 * What a finished result can share: enough for a share button to build its
 * text or card. Every result screen passes one to <ResultSummary share={...}>.
 */
export type ResultShareInfo = {
  kind: 'activity' | 'roleplay' | 'mock' | 'check' | 'review';
  skill?: SkillKey | null;
  slug?: string | null;
  title?: string | null;
  /** 0..100 */
  score?: number | null;
  /** IELTS band (speaking mock). */
  band?: number | null;
  /** CEFR level (progress check). */
  level?: string | null;
};

/**
 * The share slot on every result screen. It renders nothing today: a share
 * feature fills it HERE, once, and the button appears on every result
 * (activities in all seven skills, role-plays, the speaking mock, the
 * progress check and review sessions). A screen can also pass its own
 * `shareSlot` to <ResultSummary> to replace it.
 */
export const DefaultResultShare = (_props: { info: ResultShareInfo }): ReactNode => null;
