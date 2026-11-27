import { edge } from './api';
import type { CefrLevel } from './skills';

export type CheckPhase = 'diagnostic' | 'transfer' | 'retention';
export type CheckStatus = CheckPhase | 'waiting' | 'demonstrated' | 'needs_practice';
export type Competency = {
  slug: string;
  level: CefrLevel;
  title: string;
  goal: string;
  status: CheckStatus;
  due_at: string | null;
};

export type Batch = {
  phase: CheckPhase;
  round: number;
  questions: { prompt: string; options: string[] | null }[];
};

export type Evidence = {
  phase: CheckPhase;
  round: number;
  correct: number;
  total: number;
  checked_at: string;
  feedback: { prompt: string; response: string; model: string; correct: boolean; explanation: string }[];
};

type CompetencyDetail = Competency & {
  practice_path: string;
  guide: string | null;
  batch: Batch | null;
  history: Evidence[];
};

type Submission = Pick<Batch, 'phase' | 'round'> & { request_id: string; answers: (number | string)[] };
type Result = {
  competency: CompetencyDetail;
  receipt: Pick<Batch, 'phase' | 'round'> | null;
};

export const getCompetencies = (signal: AbortSignal) =>
  edge<{ competencies: Competency[] }>('english-mastery', '', { signal });

export const getCompetency = (slug: string, signal: AbortSignal) =>
  edge<Result>('english-mastery', `/${encodeURIComponent(slug)}`, { signal });

export const submitCheck = (slug: string, body: Submission) =>
  edge<Result>('english-mastery', `/${encodeURIComponent(slug)}`, { body });
