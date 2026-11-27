import { edge } from './api';
import type { CefrLevel } from './skills';

export const articleTransfer = {
  slug: 'article-reference-writing',
  href: '/mastery/transfer/article-reference-writing',
};
export const timeReferenceTransfer = {
  slug: 'time-reference-voice-updates',
  href: '/mastery/transfer/time-reference-voice-updates',
};

export const competencyActionReason = (detail: string | null) => {
  switch (detail) {
    case 'grammar_prerequisite': return 'transfer.grammarLead';
    case 'first_transfer': return 'transfer.nextReason';
    case 'writing_recheck': return 'transfer.dueReason';
    case 'spoken_transfer': return 'transfer.speech.nextReason';
    case 'spoken_recheck': return 'transfer.speech.dueReason';
    default: return 'mastery.dueReason';
  }
};

type TransferSource = {
  attempt_id: string;
  original: string;
  suggestion: string;
};

export type TransferResult = {
  family: string;
  title: string;
  stage: number;
  checked_at: string;
  opportunities: number;
  errors: number;
  input_mode: 'text' | 'confirmed_transcript';
  rubric_version: string;
  feedback: {
    prompt: string;
    response: string;
    verdict: 'correct' | 'incorrect' | 'inconclusive';
    model: string | null;
    explanation: string | null;
  }[];
};

export type TransferTask = { family: string; title: string; brief: string; prompts: string[] };

export type TransferPath = {
  slug: string;
  title: string;
  goal: string;
  level: CefrLevel;
  skill: 'writing' | 'speaking';
  competency_slug: string;
  practice_path: string;
  status: 'ready' | 'grammar' | 'waiting' | 'complete' | 'insufficient_evidence';
  stage: number;
  due_at: string | null;
  source_attempt_id: string | null;
  source: TransferSource | null;
  task: TransferTask | null;
  history: TransferResult[];
};

type TransferResponse = { pathway: TransferPath; receipt: string | null };
type TransferSubmission = { family: string; request_id: string; responses: string[]; input_mode: TransferResult['input_mode'] };

const functionPath = (slug: string) => `/transfer/${encodeURIComponent(slug)}`;

export const getTransfer = (slug: string, signal?: AbortSignal) =>
  edge<TransferResponse>('english-mastery', functionPath(slug), { signal });

export const submitTransfer = (slug: string, body: TransferSubmission) =>
  edge<TransferResponse>('english-mastery', functionPath(slug), { body });
