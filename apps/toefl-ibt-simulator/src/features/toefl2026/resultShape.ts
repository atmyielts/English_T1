import type { ScoreSessionResponse } from '../../lib/platformClient';
import { isRecord, type Toefl2026Result } from './tasks';

type Json = Record<string, unknown>;

export const toefl2026From = (data: ScoreSessionResponse | null): Toefl2026Result | null => {
  const t = (data?.result as unknown as Json | undefined)?.toefl;
  return isRecord(t) && t.format === 'toefl-2026' ? (t as unknown as Toefl2026Result) : null;
};
