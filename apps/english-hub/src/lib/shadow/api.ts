import { edge } from '../api';
import type { CefrLevel } from '../skills';

export type ShadowSource = 'listening' | 'reading' | 'roleplay' | 'tutor' | 'shadowing' | 'read-aloud';

export type ShadowSet = {
  id: string;
  source: 'listening' | 'reading';
  slug: string;
  title: string;
  level: CefrLevel | null;
  sentences: string[];
};

export type ShadowSetsResponse = {
  level: CefrLevel;
  learner_level: CefrLevel | null;
  levels: CefrLevel[];
  sets: ShadowSet[];
};

export const getShadowSets = (level: CefrLevel | null, signal?: AbortSignal) =>
  edge<ShadowSetsResponse>('hub', '/shadowing/sets', { query: { language_code: 'en', level }, signal });

type LogResponse = { logged: boolean; reason: 'ok' | 'daily_cap' | 'paused' | 'unavailable'; left: number };

// Once the server says today's logs are used up, stop asking until the date changes.
let cappedOn: string | null = null;
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Records one shadowing take as light speaking practice (streak and XP).
 * Only numbers are sent: never audio and never the transcript. Fire and forget:
 * a failure never interrupts practice.
 */
export const logShadowTake = async (take: { score: number | null; words: number; seconds: number; source: ShadowSource }): Promise<LogResponse | null> => {
  if (cappedOn === today() || take.words < 3 || take.seconds < 1) return null;
  try {
    const response = await edge<LogResponse>('hub', '/shadowing/log', { query: { language_code: 'en' }, body: take });
    if (!response.logged && response.reason === 'daily_cap') cappedOn = today();
    return response;
  } catch {
    return null;
  }
};
