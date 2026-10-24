import { edge } from './api';
import type { Locale } from '../../../../packages/service-i18n/src/format.ts';

// --- Role-plays (hub /roleplay/*) ---

export type RoleplayScenarioView = {
  id: string;
  levels: [string, string];
  partner: string;
  opening: string;
  title: string;
  situation: string;
  role_card: string;
  goals: Array<{ id: string; text: string }>;
  phrases: Array<{ en: string; meaning: string | null }>;
  best: { goals_met: number; goals_total: number; finished_at: string } | null;
};

export type RoleplayScenariosResponse = {
  ai_available: boolean;
  max_turns: number;
  min_turns: number;
  allowance: { basis: 'entitled' | 'free'; sessions_left: number };
  scenarios: RoleplayScenarioView[];
};

export type RoleplayTurnResponse = {
  session_id: string;
  level: string;
  reply: string;
  goals_met: string[];
  tip: { said: string; better: string; l1: string | null } | null;
  turns_left: number;
  can_finish: boolean;
  should_finish: boolean;
};

export type RoleplayResult = {
  source: 'ai' | 'basic';
  goals: Array<{ id: string; achieved: boolean; note: string | null }>;
  goals_met: number;
  goals_total: number;
  fixes: Array<{ said: string; better: string; why: string; topic: string | null; l1: string | null }>;
  phrases: Array<{ en: string; meaning: { en: string; ru: string; uz: string } | null }>;
  summary: string | null;
  score: number;
};

export const getRoleplayScenarios = (locale: Locale, signal?: AbortSignal) =>
  edge<RoleplayScenariosResponse>('hub', '/roleplay/scenarios', { query: { language_code: 'en', locale }, signal });

export const sendRoleplayTurn = (body: { scenario_id: string; session_id: string | null; text: string }) =>
  edge<RoleplayTurnResponse>('hub', '/roleplay/turn', { query: { language_code: 'en' }, body });

export const finishRoleplay = (sessionId: string) =>
  edge<{ session_id: string; result: RoleplayResult }>('hub', '/roleplay/finish', { query: { language_code: 'en' }, body: { session_id: sessionId } });

// --- Speaking mock (hub /speaking-mock/*) ---

export type MockQuestions = {
  part1: Array<{ topic: string; question: string }>;
  part2: { id: string; prompt: string; points: string[] };
  part3: string[];
};

export type MockAllowance = { allowed: boolean; basis: 'owner' | 'admin' | 'free'; left: number; per: 'day' | 'week'; limit: number };
export type MockCriterion = 'fluency' | 'lexical' | 'grammar' | 'pronunciation';
export type MockPractice = 'roleplay' | 'speaking' | 'pronunciation' | 'vocabulary' | 'grammar';

export type MockResult = {
  bands: Record<MockCriterion, number | null>;
  overall: number;
  comments: Record<MockCriterion, string | null>;
  priorities: Array<{ criterion: MockCriterion; text: string; practice: MockPractice; topic: string | null }>;
  fixes: Array<{ said: string; better: string; why: string; topic: string | null; l1: string | null }>;
  pronunciation_note: 'transcript_only' | 'not_assessed';
  words: number;
};

export type MockSession = { id: string; started_at: string; questions: MockQuestions | null };

export type MockOverview = {
  ai_available: boolean;
  allowance: MockAllowance;
  prep_seconds: number;
  talk_seconds: number;
  in_progress: MockSession | null;
  history: Array<{ id: string; finished_at: string; overall: number; cue_card: string | null; result: MockResult | null }>;
};

export type MockAnswerInput = { text: string; mode: 'speech' | 'typed'; seconds: number | null };

export const getMockOverview = (signal?: AbortSignal) =>
  edge<MockOverview>('hub', '/speaking-mock', { query: { language_code: 'en' }, signal });

export const startMock = () =>
  edge<{ resumed: boolean; allowance: MockAllowance; prep_seconds: number; talk_seconds: number; mock: MockSession }>('hub', '/speaking-mock/start', {
    query: { language_code: 'en' },
    body: {},
  });

export const finishMock = (mockId: string, answers: { part1: MockAnswerInput[]; part2: MockAnswerInput; part3: MockAnswerInput[] }) =>
  edge<{ mock_id: string; result: MockResult }>('hub', '/speaking-mock/finish', {
    query: { language_code: 'en' },
    body: { mock_id: mockId, ...answers },
  });

// --- First-language traps (hub /l1/traps) ---

export type L1Trap = { id: string; count: number; example: string | null };

export const getL1Traps = (signal?: AbortSignal) =>
  edge<{ traps: L1Trap[] }>('hub', '/l1/traps', { query: { language_code: 'en' }, signal });
